'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { formatRp, formatDate, todayStr } from '@/lib/pdf-utils';
import { api, ApiError } from '@/lib/api';
import { toast } from 'sonner';
import { useTabStore } from '@/store/tab-store';
import { useAuthStore } from '@/store/auth-store';
import { FormTabShell } from '@/components/erp/form-tab-shell';
import { useFormDraft, draftKey } from '@/hooks/use-form-draft';
import { DraftIndicator } from '@/components/erp/draft-indicator';
import { Loader2, Check, ChevronDown, Info } from 'lucide-react';
import type { KasBankAkunResponse, RekonsiliasiBankResponse, RekonsiliasiBankCreate, SaldoBukuPreviewResponse } from '@/types/api';

// ─── KasBank Searchable Dropdown ──────────────────────────────────────────

function KasBankSelect({ value, onValueChange, options, loading, error, placeholder }: { value: string; onValueChange: (v: string) => void; options: KasBankAkunResponse[]; loading?: boolean; error?: string; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  const nama = selected?.akunPerkiraan?.nama || selected?.nama;

  return (
    <div className="space-y-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className={cn('w-full justify-between text-sm font-normal', !selected && 'text-muted-foreground', error && 'border-destructive')} disabled={loading}>
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Memuat...
              </span>
            ) : selected ? (
              nama
            ) : (
              placeholder || 'Pilih kas/bank'
            )}
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Cari kas/bank..." />
            <CommandList>
              <CommandEmpty>Tidak ditemukan.</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => {
                  const n = opt.akunPerkiraan?.nama || opt.nama;
                  const k = opt.akunPerkiraan?.kode || opt.kode;
                  return (
                    <CommandItem
                      key={opt.id}
                      value={`${k} ${n} ${opt.jenis}`}
                      onSelect={() => {
                        onValueChange(opt.id);
                        setOpen(false);
                      }}>
                      <Check className={cn('mr-2 h-4 w-4', value === opt.id ? 'opacity-100' : 'opacity-0')} />
                      <div className="flex flex-col">
                        <span className="text-sm">{n}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {k} · {opt.jenis}
                        </span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Form Component
// ═══════════════════════════════════════════════════════════════════════════

interface Props {
  mode?: 'create' | 'edit';
  id?: string;
}

/** Bentuk data draft otomatis (localStorage) untuk mode create. */
interface RekonsiliasiDraftData {
  kasBankId: string;
  tanggal: string;
  saldoBank: string;
  keterangan: string;
}

export default function RekonsiliasiBankForm({ mode }: Props) {
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const openFormTab = useTabStore((s) => s.openFormTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const title = 'Buat Rekonsiliasi Bank';

  // ── Draft otomatis (form ini selalu mode create) ──
  const userId = useAuthStore((s) => s.user?.id ?? 'anon');
  const draft = useFormDraft<RekonsiliasiDraftData>(draftKey(userId, 'kasbank', 'rekonsiliasi-bank', 'create'));
  const skipNextSaveRef = useRef(false);

  // ── Dropdown data ──
  const [kasBankOptions, setKasBankOptions] = useState<KasBankAkunResponse[]>([]);
  const [dropdownLoading, setDropdownLoading] = useState(true);

  // ── Form state ──
  const [submitting, setSubmitting] = useState(false);
  const [kasBankId, setKasBankId] = useState('');
  const [tanggal, setTanggal] = useState(todayStr());
  const [saldoBank, setSaldoBank] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Preview saldo ──
  const [previewSaldo, setPreviewSaldo] = useState<SaldoBukuPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // ── Draft otomatis: pulihkan sekali saat mount (ada draft) ──
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const d = draft.draft;
    if (!d) return;
    setKasBankId(d.kasBankId || '');
    setTanggal(d.tanggal || todayStr());
    setSaldoBank(d.saldoBank || '');
    setKeterangan(d.keterangan || '');
    toast.info('Draft isian dipulihkan', { description: 'Isian terakhir form Rekonsiliasi Bank dimuat kembali otomatis.' });
  }, []);

  // ── Draft otomatis: simpan tiap perubahan (lewati render pertama agar form kosong tidak menimpa draft) ──
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    draft.saveDraft({ kasBankId, tanggal, saldoBank, keterangan });
  }, [kasBankId, tanggal, saldoBank, keterangan]);

  // ── Draft otomatis: buang draft → kosongkan form ──
  const handleDiscardDraft = useCallback(() => {
    skipNextSaveRef.current = true;
    draft.clearDraft();
    setKasBankId('');
    setTanggal(todayStr());
    setSaldoBank('');
    setKeterangan('');
    setPreviewSaldo(null);
    setErrors({});
  }, []);

  // ── Fetch dropdowns ──
  const fetchDropdowns = useCallback(async () => {
    setDropdownLoading(true);
    try {
      const kbRes = await api.get<KasBankAkunResponse[]>('/master/kas-bank-akun');
      setKasBankOptions(kbRes);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal memuat data referensi');
    } finally {
      setDropdownLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDropdowns();
  }, [fetchDropdowns]);

  // ── Preview saldo buku ──
  const handlePreviewSaldo = useCallback(async () => {
    if (!kasBankId || !tanggal) {
      setErrors((prev) => ({
        ...prev,
        kasBankAkunId: !kasBankId ? 'Pilih kas/bank terlebih dahulu' : undefined,
        tanggalAkhir: !tanggal ? 'Tanggal wajib diisi' : undefined
      }));
      return;
    }
    setPreviewLoading(true);
    setPreviewSaldo(null);
    try {
      const res = await api.get<SaldoBukuPreviewResponse>(`/kas-bank/rekonsiliasi-bank/preview-saldo-buku?kas_bank_akun_id=${kasBankId}&tanggal_akhir=${tanggal}`);
      setPreviewSaldo(res);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal mengambil preview saldo buku');
    } finally {
      setPreviewLoading(false);
    }
  }, [kasBankId, tanggal]);

  // ── Validation ──
  const validate = useCallback((): boolean => {
    const e: Record<string, string> = {};
    if (!kasBankId) e.kasBankAkunId = 'Kas/Bank wajib dipilih';
    if (!tanggal) e.tanggalAkhir = 'Tanggal wajib diisi';
    if (!saldoBank || Number(saldoBank) < 0 || isNaN(Number(saldoBank))) e.saldoBank = 'Saldo bank wajib diisi dengan angka valid';
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [kasBankId, tanggal, saldoBank]);

  // ── Submit ──
  const handleSubmit = useCallback(async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload: RekonsiliasiBankCreate = {
        kasBankAkunId: kasBankId,
        tanggalAkhir: tanggal,
        saldoBank: Number(saldoBank),
        keterangan: keterangan.trim() || undefined
      };
      const res = await api.post<RekonsiliasiBankResponse>('/kas-bank/rekonsiliasi-bank', payload);
      toast.success('Rekonsiliasi bank berhasil dibuat (DRAFT)');
      draft.clearDraft();
      refreshListTab('cash-bank', 'rekonsiliasi-bank');
      // Open detail in new tab, then close this tab
      openFormTab({
        title: `Rekonsiliasi #${res.id.slice(0, 8)}`,
        module: 'cash-bank',
        subPage: 'rekonsiliasi-bank',
        formKey: 'rekonsiliasi-bank-create', // reuse, detail view handled in-page
        formProps: { mode: 'detail', id: res.id },
        replaceCurrent: true
      });
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal membuat rekonsiliasi bank';
      // Phase 6 — handle cutoff lock error with actionable description
      if (msg.toLowerCase().includes('cutoff lock') || msg.includes('Void rekonsiliasi SELESAI terlebih dahulu')) {
        toast.error('Tidak bisa buat rekonsiliasi untuk periode ini', {
          description: 'Void rekonsiliasi SELESAI yang ada terlebih dahulu, atau pilih tanggal_akhir yang lebih baru (setelah rekonsiliasi SELESAI).',
          duration: 8000
        });
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }, [validate, kasBankId, tanggal, saldoBank, keterangan, refreshListTab, openFormTab]);

  // ── Close tab ──
  const handleClose = useCallback(() => {
    if (activeTabId) closeTab(activeTabId);
  }, [activeTabId, closeTab]);

  return (
    <FormTabShell title={title}>
      <Card className="max-w-lg">
        <CardContent className="p-6">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Buat rekonsiliasi baru dengan status DRAFT.</p>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Kas/Bank <span className="text-destructive">*</span>
              </Label>
              <KasBankSelect
                value={kasBankId}
                onValueChange={(v) => {
                  setKasBankId(v);
                  setErrors((prev) => ({ ...prev, kasBankAkunId: undefined }));
                  setPreviewSaldo(null);
                }}
                options={kasBankOptions}
                loading={dropdownLoading}
                error={errors.kasBankAkunId}
              />
              {errors.kasBankAkunId && <p className="text-xs text-destructive mt-1">{errors.kasBankAkunId}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Tanggal Statement <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={tanggal}
                onChange={(e) => {
                  setTanggal(e.target.value);
                  setErrors((prev) => ({ ...prev, tanggalAkhir: undefined }));
                  setPreviewSaldo(null);
                }}
                className={cn(errors.tanggalAkhir && 'border-destructive')}
              />
              {errors.tanggalAkhir && <p className="text-xs text-destructive mt-1">{errors.tanggalAkhir}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Saldo Bank (dari statement) <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                placeholder="0"
                value={saldoBank}
                onChange={(e) => {
                  setSaldoBank(e.target.value);
                  setErrors((prev) => ({ ...prev, saldoBank: undefined }));
                }}
                className={cn(errors.saldoBank && 'border-destructive')}
              />
              {errors.saldoBank && <p className="text-xs text-destructive mt-1">{errors.saldoBank}</p>}
            </div>

            {/* Preview saldo buku */}
            <div className="space-y-1.5">
              <Button type="button" variant="outline" size="sm" onClick={handlePreviewSaldo} disabled={!kasBankId || !tanggal || previewLoading}>
                {previewLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Info className="mr-2 h-4 w-4" />}
                Preview Saldo Buku
              </Button>
              {previewSaldo && (
                <div className="rounded-lg border bg-muted/50 p-3 text-sm">
                  <p className="text-muted-foreground">
                    Saldo Buku ({previewSaldo.kasBankNama} s/d {formatDate(previewSaldo.tanggalAkhir)})
                  </p>
                  <p className="text-lg font-bold mt-1">{formatRp(previewSaldo.saldoBuku)}</p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Keterangan</Label>
              <Textarea placeholder="Opsional" value={keterangan} onChange={(e) => setKeterangan(e.target.value)} rows={2} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 mt-6">
            <div className="mr-auto">
              <DraftIndicator hasDraft={draft.hasDraft} ageLabel={draft.draftAgeLabel} onDiscard={handleDiscardDraft} formLabel="Rekonsiliasi Bank" />
            </div>
            <Button variant="outline" onClick={handleClose} disabled={submitting}>
              Batal
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Buat Rekonsiliasi
            </Button>
          </div>
        </CardContent>
      </Card>
    </FormTabShell>
  );
}
