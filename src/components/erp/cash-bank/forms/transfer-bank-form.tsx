'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { formatRp, todayStr, terbilang } from '@/lib/pdf-utils';
import { api, ApiError } from '@/lib/api';
import { toast } from 'sonner';
import { useTabStore } from '@/store/tab-store';
import { useAuthStore } from '@/store/auth-store';
import { FormTabShell } from '@/components/erp/form-tab-shell';
import { useFormDraft, draftKey } from '@/hooks/use-form-draft';
import { DraftIndicator } from '@/components/erp/draft-indicator';
import { ArrowRightLeft, Loader2, Check, ChevronDown, Info } from 'lucide-react';
import type { KasBankAkunResponse, TransferBankResponse, TransferBankCreate, TransferBankUpdate } from '@/types/api';

// ─── Status Badge ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'SELESAI':
      return <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Selesai</Badge>;
    case 'DRAFT':
      return <Badge className="border-yellow-200 bg-yellow-100 text-yellow-700 hover:bg-yellow-100">Draft</Badge>;
    case 'DIPROSES':
      return <Badge className="border-blue-200 bg-blue-100 text-blue-700 hover:bg-blue-100">Diproses</Badge>;
    case 'BATAL':
      return <Badge className="border-red-200 bg-red-100 text-red-700 hover:bg-red-100">Batal</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function Req({ label }: { label: string }) {
  return (
    <Label className="text-xs font-medium">
      {label} <span className="text-destructive">*</span>
    </Label>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-destructive mt-1">{msg}</p>;
}

// ─── KasBank Searchable Dropdown ──────────────────────────────────────────

function KasBankSearch({ value, onValueChange, error, options, loading, placeholder }: { value: string; onValueChange: (v: string) => void; error?: string; options: KasBankAkunResponse[]; loading?: boolean; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  const coaNama = selected?.akunPerkiraan?.nama || selected?.nama;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className={cn('w-full justify-between text-sm font-normal', !selected && 'text-muted-foreground', error && 'border-destructive')} disabled={loading}>
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Memuat...
            </span>
          ) : selected ? (
            coaNama
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
                const nama = opt.akunPerkiraan?.nama || opt.nama;
                const kode = opt.akunPerkiraan?.kode || opt.kode;
                return (
                  <CommandItem
                    key={opt.id}
                    value={`${kode} ${nama} ${opt.jenis}`}
                    onSelect={() => {
                      onValueChange(opt.id);
                      setOpen(false);
                    }}>
                    <Check className={cn('mr-2 h-4 w-4', value === opt.id ? 'opacity-100' : 'opacity-0')} />
                    <div className="flex flex-col">
                      <span className="text-sm">{nama}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {kode} · {opt.jenis}
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
interface TransferBankDraftData {
  tanggal: string;
  dariKasBankId: string;
  keKasBankId: string;
  nilaiTransfer: string;
  biayaTransfer: string;
  informasi: string;
}

export default function TransferBankForm({ mode, id }: Props) {
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const isEdit = !!id || mode === 'edit';
  const isCreate = !isEdit;
  const title = isEdit ? 'Edit Transfer Bank' : 'Transfer Bank';

  // ── Draft otomatis (mode create saja; form edit memuat data server) ──
  const userId = useAuthStore((s) => s.user?.id ?? 'anon');
  const draft = useFormDraft<TransferBankDraftData>(draftKey(userId, 'kasbank', 'transfer-bank', 'create'));
  const skipNextSaveRef = useRef(false);

  // ── Dropdown data ──
  const [kasBankOptions, setKasBankOptions] = useState<KasBankAkunResponse[]>([]);
  const [dropdownLoading, setDropdownLoading] = useState(true);

  // ── Form state ──
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [tanggal, setTanggal] = useState(todayStr());
  const [dariKasBankId, setDariKasBankId] = useState('');
  const [keKasBankId, setKeKasBankId] = useState('');
  const [nilaiTransfer, setNilaiTransfer] = useState('');
  const [biayaTransfer, setBiayaTransfer] = useState('');
  const [informasi, setInformasi] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Read-only display (edit mode)
  const [editNoTransfer, setEditNoTransfer] = useState('');
  const [editStatus, setEditStatus] = useState('');

  // ── Draft otomatis: pulihkan sekali saat mount (hanya create + ada draft) ──
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!isCreate || restoredRef.current) return;
    restoredRef.current = true;
    const d = draft.draft;
    if (!d) return;
    setTanggal(d.tanggal || todayStr());
    setDariKasBankId(d.dariKasBankId || '');
    setKeKasBankId(d.keKasBankId || '');
    setNilaiTransfer(d.nilaiTransfer || '');
    setBiayaTransfer(d.biayaTransfer || '');
    setInformasi(d.informasi || '');
    toast.info('Draft isian dipulihkan', { description: 'Isian terakhir form Transfer Bank dimuat kembali otomatis.' });
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
    if (isCreate) {
      draft.saveDraft({ tanggal, dariKasBankId, keKasBankId, nilaiTransfer, biayaTransfer, informasi });
    }
  }, [tanggal, dariKasBankId, keKasBankId, nilaiTransfer, biayaTransfer, informasi]);

  // ── Draft otomatis: buang draft → kosongkan form ──
  const handleDiscardDraft = useCallback(() => {
    skipNextSaveRef.current = true;
    draft.clearDraft();
    setTanggal(todayStr());
    setDariKasBankId('');
    setKeKasBankId('');
    setNilaiTransfer('');
    setBiayaTransfer('');
    setInformasi('');
    setErrors({});
  }, []);

  // ── Derived values ──
  const nilaiTransferNum = useMemo(() => (nilaiTransfer ? parseInt(nilaiTransfer.replace(/\D/g, ''), 10) || 0 : 0), [nilaiTransfer]);
  const biayaTransferNum = useMemo(() => (biayaTransfer ? parseInt(biayaTransfer.replace(/\D/g, ''), 10) || 0 : 0), [biayaTransfer]);
  const terbilangText = useMemo(() => terbilang(nilaiTransferNum), [nilaiTransferNum]);
  const keKasBankOptions = useMemo(() => kasBankOptions.filter((opt) => opt.id !== dariKasBankId), [kasBankOptions, dariKasBankId]);

  // ── Fetch dropdowns ──
  const fetchDropdowns = useCallback(async () => {
    setDropdownLoading(true);
    try {
      const kbRes = await api.get<KasBankAkunResponse[]>('/master/kas-bank-dropdown');
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

  // ── Fetch edit data ──
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get<TransferBankResponse>(`/kas-bank/transfer/${id}`);
        if (cancelled) return;
        setTanggal(res.tanggal);
        setDariKasBankId(res.dariKasBankId);
        setKeKasBankId(res.keKasBankId);
        setNilaiTransfer(String(res.nilaiTransfer));
        setBiayaTransfer(res.biayaTransfer > 0 ? String(res.biayaTransfer) : '');
        setInformasi(res.informasi || '');
        setEditNoTransfer(res.noTransfer);
        setEditStatus(res.status);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof ApiError ? err.detail : 'Gagal memuat data transfer');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // ── Validation ──
  const validate = useCallback((): boolean => {
    const e: Record<string, string> = {};
    if (!tanggal) e.tanggal = 'Tanggal wajib diisi';
    if (!dariKasBankId) e.dariKasBank = 'Dari Kas/Bank wajib dipilih';
    if (!keKasBankId) e.keKasBank = 'Ke Kas/Bank wajib dipilih';
    if (!nilaiTransferNum || nilaiTransferNum <= 0) e.nilaiTransfer = 'Nilai Transfer wajib diisi';
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [tanggal, dariKasBankId, keKasBankId, nilaiTransferNum]);

  // ── Submit ──
  const handleSubmit = useCallback(async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      if (isEdit && id) {
        const payload: TransferBankUpdate = {
          tanggal,
          dariKasBankId,
          keKasBankId,
          nilaiTransfer: nilaiTransferNum,
          biayaTransfer: biayaTransferNum || 0,
          informasi: informasi.trim() || null
        };
        await api.put<TransferBankResponse>(`/kas-bank/transfer/${id}`, payload);
        toast.success('Transfer berhasil diperbarui');
      } else {
        const payload: TransferBankCreate = {
          tanggal,
          dariKasBankId,
          keKasBankId,
          nilaiTransfer: nilaiTransferNum,
          biayaTransfer: biayaTransferNum || undefined,
          informasi: informasi.trim() || undefined
        };
        await api.post<TransferBankResponse>('/kas-bank/transfer', payload);
        toast.success('Transfer bank berhasil diproses');
      }
      if (isCreate) draft.clearDraft();
      refreshListTab('cash-bank', 'transfer-bank');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.detail);
      } else {
        toast.error(isEdit ? 'Gagal memperbarui transfer' : 'Gagal memproses transfer');
      }
    } finally {
      setSubmitting(false);
    }
  }, [validate, isEdit, id, tanggal, dariKasBankId, keKasBankId, nilaiTransferNum, biayaTransferNum, informasi, activeTabId, closeTab, refreshListTab]);

  // ── Close tab ──
  const handleClose = useCallback(() => {
    if (activeTabId) closeTab(activeTabId);
  }, [activeTabId, closeTab]);

  if (loading) {
    return (
      <FormTabShell title={title}>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </FormTabShell>
    );
  }

  return (
    <FormTabShell title={title}>
      <Card className="max-w-4xl">
        <CardContent className="p-6">
          <div className="space-y-5">
            {/* Read-only info bar (edit mode) */}
            {isEdit && (
              <div className="flex flex-wrap gap-3 rounded-md bg-muted/50 p-3">
                <div className="flex items-center gap-1.5 text-xs">
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">No Transfer:</span>
                  <span className="font-medium">{editNoTransfer}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Status:</span>
                  <StatusBadge status={editStatus} />
                </div>
              </div>
            )}

            {/* Tanggal — nomor transfer digenerate otomatis backend (TRF-YYYY-MM-NNN) */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Req label="Tanggal" />
                <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={errors.tanggal ? 'border-destructive' : ''} />
                <FieldError msg={errors.tanggal} />
              </div>
              {!isEdit && (
                <div className="flex items-end">
                  <p className="text-xs text-muted-foreground">No. Transfer dibuat otomatis oleh sistem saat dokumen diproses.</p>
                </div>
              )}
            </div>

            <Separator />

            {/* Dari → Ke Kas/Bank */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
              <div className="space-y-1.5">
                <Req label="Dari Kas/Bank" />
                <KasBankSearch
                  value={dariKasBankId}
                  onValueChange={(val) => {
                    setDariKasBankId(val);
                    if (keKasBankId === val) setKeKasBankId('');
                  }}
                  error={errors.dariKasBank}
                  options={kasBankOptions}
                  placeholder="Pilih sumber kas/bank"
                  loading={dropdownLoading}
                />
                <FieldError msg={errors.dariKasBank} />
              </div>
              <div className="hidden sm:flex items-center justify-center pb-0.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
                  <ArrowRightLeft className="h-4 w-4 text-emerald-600" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Req label="Ke Kas/Bank" />
                <KasBankSearch value={keKasBankId} onValueChange={setKeKasBankId} error={errors.keKasBank} options={keKasBankOptions} placeholder="Pilih tujuan kas/bank" loading={dropdownLoading} />
                <FieldError msg={errors.keKasBank} />
              </div>
            </div>

            <Separator />

            {/* Nilai Transfer + Biaya */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Req label="Nilai Transfer (Rp)" />
                <Input type="text" inputMode="numeric" placeholder="0" value={nilaiTransfer} onChange={(e) => setNilaiTransfer(e.target.value)} className={errors.nilaiTransfer ? 'border-destructive' : ''} />
                <FieldError msg={errors.nilaiTransfer} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Biaya Transfer (Rp)</Label>
                <Input type="text" inputMode="numeric" placeholder="0" value={biayaTransfer} onChange={(e) => setBiayaTransfer(e.target.value)} />
              </div>
            </div>

            {nilaiTransferNum > 0 && (
              <div className="rounded-md bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Terbilang</p>
                <p className="text-sm font-medium italic">{terbilangText}</p>
              </div>
            )}

            <Separator />

            {/* Informasi */}
            <div className="space-y-1.5">
              <Label htmlFor="info-transfer" className="text-xs font-medium">
                Informasi Transaksi
              </Label>
              <Textarea id="info-transfer" placeholder="Masukkan keterangan atau informasi tambahan transfer..." rows={3} value={informasi} onChange={(e) => setInformasi(e.target.value)} className="text-xs min-h-[56px]" />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 mt-6">
            {isCreate && (
              <div className="mr-auto">
                <DraftIndicator hasDraft={draft.hasDraft} ageLabel={draft.draftAgeLabel} onDiscard={handleDiscardDraft} formLabel="Transfer Bank" />
              </div>
            )}
            <Button variant="outline" onClick={handleClose} disabled={submitting}>
              Batal
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className={isEdit ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Simpan Perubahan' : 'Proses Transfer'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </FormTabShell>
  );
}
