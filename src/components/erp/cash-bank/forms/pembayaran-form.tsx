'use client';

import { loadSystemCOA } from '@/lib/coa';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { formatRp, todayStr } from '@/lib/pdf-utils';
import { api, ApiError } from '@/lib/api';
import { toast } from 'sonner';
import { useTabStore } from '@/store/tab-store';
import { useAuthStore } from '@/store/auth-store';
import { FormTabShell } from '@/components/erp/form-tab-shell';
import { useFormDraft, draftKey } from '@/hooks/use-form-draft';
import { DraftIndicator } from '@/components/erp/draft-indicator';
import { TrendingUp, Loader2, Trash2, Check, ChevronDown, Search, Info } from 'lucide-react';
import type { KasBankAkunResponse, COADropdownResponse, PembayaranKasResponse, PembayaranKasCreate, PembayaranKasUpdate } from '@/types/api';

// ─── Types ────────────────────────────────────────────────────────────────

interface RincianRow {
  id: number;
  akunPerkiraanId: string;
  akunKode: string;
  akunNama: string;
  nilai: string;
}

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

// ─── COA Searchable Dropdown ──────────────────────────────────────────────

function CoaSearch({ onSelect, disabledIds = [], options, loading }: { onSelect: (id: string, kode: string, nama: string) => void; disabledIds?: string[]; options: COADropdownResponse[]; loading?: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const handleSelect = useCallback(
    (id: string, kode: string, nama: string) => {
      if (disabledIds.includes(id)) return;
      onSelect(id, kode, nama);
      setOpen(false);
      setSearch('');
    },
    [onSelect, disabledIds]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start gap-2 text-sm font-normal text-muted-foreground" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Cari/Pilih Akun Perkiraan
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={true}>
          <CommandInput placeholder="Cari akun perkiraan..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>Akun tidak ditemukan.</CommandEmpty>
            <CommandGroup heading="Daftar Akun Perkiraan">
              {options.map((opt) => {
                const disabled = disabledIds.includes(opt.id);
                return (
                  <CommandItem key={opt.id} value={`${opt.kode} ${opt.nama} ${opt.header}`} disabled={disabled} onSelect={() => handleSelect(opt.id, opt.kode, opt.nama)}>
                    <Check className={cn('mr-2 h-4 w-4', disabled ? 'opacity-100 text-emerald-600' : 'opacity-0')} />
                    <div className="flex flex-col">
                      <span className={cn('text-sm', disabled && 'text-muted-foreground line-through')}>
                        {opt.kode} — {opt.nama}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{opt.header}</span>
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

// ─── Rincian Section ──────────────────────────────────────────────────────

function RincianSection({ label, rows, onAddRow, onRemoveRow, onUpdateNilai, error, coaOptions, coaLoading }: { label: string; rows: RincianRow[]; onAddRow: (id: string, kode: string, nama: string) => void; onRemoveRow: (id: number) => void; onUpdateNilai: (id: number, val: string) => void; error?: string; coaOptions: COADropdownResponse[]; coaLoading?: boolean }) {
  const totalNilai = useMemo(() => rows.reduce((sum, r) => sum + (parseInt(r.nilai.replace(/\D/g, ''), 10) || 0), 0), [rows]);
  const disabledIds = useMemo(() => rows.map((r) => r.akunPerkiraanId), [rows]);

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">{label}</Label>

      <CoaSearch onSelect={onAddRow} disabledIds={disabledIds} options={coaOptions} loading={coaLoading} />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="whitespace-nowrap w-12 text-center">No</TableHead>
              <TableHead className="whitespace-nowrap">Akun</TableHead>
              <TableHead className="whitespace-nowrap">Nama Akun</TableHead>
              <TableHead className="whitespace-nowrap text-right w-48">Nilai</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground text-sm">
                  Belum ada data
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, idx) => (
                <TableRow key={row.id}>
                  <TableCell className="text-center text-sm text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="font-mono text-sm whitespace-nowrap">{row.akunKode}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{row.akunNama}</TableCell>
                  <TableCell className="text-right">
                    <CurrencyInput placeholder="0" value={row.nilai} onValueChange={(v) => onUpdateNilai(row.id, v)} className="text-right font-mono h-8 text-sm" />
                  </TableCell>
                  <TableCell className="p-1">
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => onRemoveRow(row.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-end">
        <div className="text-sm">
          <span className="text-muted-foreground">Nilai (total): </span>
          <span className="font-mono font-semibold">{formatRp(totalNilai)}</span>
        </div>
      </div>

      <FieldError msg={error} />
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
interface PembayaranDraftData {
  kasBankId: string;
  tanggal: string;
  noNukti: string;
  noCek: string;
  penerima: string;
  catatan: string;
  rincianRows: RincianRow[];
}

export default function PembayaranForm({ mode, id }: Props) {
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const isEdit = !!id || mode === 'edit';
  const isCreate = !isEdit;
  const title = isEdit ? `Edit Pembayaran` : 'Tambah Pembayaran';

  // ── Draft otomatis (mode create saja; form edit memuat data server) ──
  const userId = useAuthStore((s) => s.user?.id ?? 'anon');
  const draft = useFormDraft<PembayaranDraftData>(draftKey(userId, 'kasbank', 'pembayaran', 'create'));
  const skipNextSaveRef = useRef(false);

  // ── Dropdown data ──
  const [kasBankOptions, setKasBankOptions] = useState<KasBankAkunResponse[]>([]);
  const [coaOptions, setCoaOptions] = useState<COADropdownResponse[]>([]);
  const [dropdownLoading, setDropdownLoading] = useState(true);

  // ── Form state ──
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [kasBankId, setKasBankId] = useState('');
  const [tanggal, setTanggal] = useState(todayStr());
  const [noNukti, setNoNukti] = useState('');
  const [rincianRows, setRincianRows] = useState<RincianRow[]>([]);
  const [noCek, setNoCek] = useState('');
  const [penerima, setPenerima] = useState('');
  const [catatan, setCatatan] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Read-only display (edit mode)
  const [editNoBukti, setEditNoBukti] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editTotalNilai, setEditTotalNilai] = useState(0);

  // ── Draft otomatis: pulihkan sekali saat mount (hanya create + ada draft) ──
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!isCreate || restoredRef.current) return;
    restoredRef.current = true;
    const d = draft.draft;
    if (!d) return;
    setKasBankId(d.kasBankId || '');
    setTanggal(d.tanggal || todayStr());
    setNoNukti(d.noNukti || '');
    setNoCek(d.noCek || '');
    setPenerima(d.penerima || '');
    setCatatan(d.catatan || '');
    setRincianRows(Array.isArray(d.rincianRows) ? d.rincianRows : []);
    toast.info('Draft isian dipulihkan', { description: 'Isian terakhir form Pembayaran dimuat kembali otomatis.' });
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
      draft.saveDraft({ kasBankId, tanggal, noNukti, noCek, penerima, catatan, rincianRows });
    }
  }, [kasBankId, tanggal, noNukti, noCek, penerima, catatan, rincianRows]);

  // ── Draft otomatis: buang draft → kosongkan form ──
  const handleDiscardDraft = useCallback(() => {
    skipNextSaveRef.current = true;
    draft.clearDraft();
    setKasBankId('');
    setTanggal(todayStr());
    setNoNukti('');
    setNoCek('');
    setPenerima('');
    setCatatan('');
    setRincianRows([]);
    setErrors({});
  }, []);

  // ── Fetch dropdowns ──
  const fetchDropdowns = useCallback(async () => {
    setDropdownLoading(true);
    try {
      const [kbRes, coaRes] = await Promise.all([api.get<KasBankAkunResponse[]>('/master/kas-bank-dropdown'), loadSystemCOA()]);
      setKasBankOptions(kbRes);
      setCoaOptions(coaRes);
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
        const res = await api.get<PembayaranKasResponse>(`/kas-bank/pembayaran/${id}`);
        if (cancelled) return;
        setTanggal(res.tanggal);
        setKasBankId(res.kasBankId);
        setNoNukti(res.noNukti);
        setNoCek(res.noCek || '');
        setPenerima(res.penerima || '');
        setCatatan(res.catatan || '');
        setEditNoBukti(res.noBukti);
        setEditStatus(res.status);
        setEditTotalNilai(res.totalNilai);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof ApiError ? err.detail : 'Gagal memuat data pembayaran');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // ── Rincian handlers ──
  const addRincianRow = useCallback((akunId: string, kode: string, nama: string) => {
    setRincianRows((prev) => {
      if (prev.some((r) => r.akunPerkiraanId === akunId)) return prev;
      return [...prev, { id: Date.now(), akunPerkiraanId: akunId, akunKode: kode, akunNama: nama, nilai: '' }];
    });
  }, []);

  const removeRincianRow = useCallback((rowId: number) => {
    setRincianRows((prev) => prev.filter((r) => r.id !== rowId));
  }, []);

  const updateNilai = useCallback((rowId: number, val: string) => {
    setRincianRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, nilai: val } : r)));
  }, []);

  // ── Validation ──
  const validate = useCallback((): boolean => {
    const e: Record<string, string> = {};
    if (!isEdit && !kasBankId) e.kasBank = 'Kas/Bank wajib dipilih';
    if (!tanggal) e.tanggal = 'Tanggal wajib diisi';
    if (!noNukti.trim()) e.noNukti = 'No Bukti wajib diisi';
    if (!isEdit) {
      if (rincianRows.length === 0) e.rincian = 'Rincian pembayaran wajib diisi';
      const hasEmptyNilai = rincianRows.some((r) => !r.nilai || parseInt(r.nilai.replace(/\D/g, ''), 10) <= 0);
      if (hasEmptyNilai) e.rincian = 'Semua rincian harus memiliki nilai lebih dari 0';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [isEdit, kasBankId, tanggal, noNukti, rincianRows]);

  // ── Submit ──
  const handleSubmit = useCallback(async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      if (isEdit && id) {
        const payload: PembayaranKasUpdate = {
          tanggal,
          kasBankId: kasBankId || undefined,
          noNukti: noNukti.trim(),
          noCek: noCek.trim() || null,
          penerima: penerima.trim() || null,
          catatan: catatan.trim() || null
        };
        await api.put<PembayaranKasResponse>(`/kas-bank/pembayaran/${id}`, payload);
        toast.success('Pembayaran berhasil diperbarui');
      } else {
        const payload: PembayaranKasCreate = {
          tanggal,
          kasBankId,
          noNukti: noNukti.trim(),
          noCek: noCek.trim() || undefined,
          penerima: penerima.trim() || undefined,
          catatan: catatan.trim() || undefined,
          rincian: rincianRows.map((r) => ({
            akunPerkiraanId: r.akunPerkiraanId,
            nilai: parseInt(r.nilai.replace(/\D/g, ''), 10) || 0
          }))
        };
        await api.post<PembayaranKasResponse>('/kas-bank/pembayaran', payload);
        toast.success('Pembayaran berhasil dicatat');
      }
      if (isCreate) draft.clearDraft();
      refreshListTab('cash-bank', 'pembayaran');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.detail);
      } else {
        toast.error(isEdit ? 'Gagal memperbarui pembayaran' : 'Gagal mencatat pembayaran');
      }
    } finally {
      setSubmitting(false);
    }
  }, [validate, isEdit, id, tanggal, kasBankId, noNukti, noCek, penerima, catatan, rincianRows, activeTabId, closeTab, refreshListTab]);

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
                  <span className="text-muted-foreground">No. Dokumen:</span>
                  <span className="font-medium">{editNoBukti}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Status:</span>
                  <StatusBadge status={editStatus} />
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Total Nilai:</span>
                  <span className="font-medium">{formatRp(editTotalNilai)}</span>
                </div>
              </div>
            )}

            {/* Row 1: Kas/Bank + Tanggal */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Req label="Kas/Bank" />
                <KasBankSearch value={kasBankId} onValueChange={setKasBankId} error={errors.kasBank} options={kasBankOptions} loading={dropdownLoading} />
                <FieldError msg={errors.kasBank} />
              </div>
              <div className="space-y-1.5">
                <Req label="Tanggal" />
                <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={errors.tanggal ? 'border-destructive' : ''} />
                <FieldError msg={errors.tanggal} />
              </div>
            </div>

            {/* Row 2: No Bukti (nomor bukti fisik, bukan nomor dokumen sistem) */}
            <div className="space-y-1.5">
              <Req label="No Bukti" />
              <Input value={noNukti} onChange={(e) => setNoNukti(e.target.value)} placeholder="Masukkan no bukti" className={errors.noNukti ? 'border-destructive' : ''} />
              <FieldError msg={errors.noNukti} />
            </div>

            <Separator />

            {/* Rincian Pembayaran (create mode only) */}
            {!isEdit && (
              <>
                <RincianSection label="Rincian Pembayaran" rows={rincianRows} onAddRow={addRincianRow} onRemoveRow={removeRincianRow} onUpdateNilai={updateNilai} error={errors.rincian} coaOptions={coaOptions} coaLoading={dropdownLoading} />
                <Separator />
              </>
            )}

            {/* Info Lainnya */}
            <div className="space-y-4">
              <Label className="text-sm font-medium">Info Lainnya</Label>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">No Cek</Label>
                <Input value={noCek} onChange={(e) => setNoCek(e.target.value)} placeholder="Nomor cek (opsional)" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Penerima</Label>
                <Textarea value={penerima} onChange={(e) => setPenerima(e.target.value)} placeholder="Nama penerima pembayaran" rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Catatan</Label>
                <Textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Catatan tambahan terkait transaksi" rows={2} />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 mt-6">
            {isCreate && (
              <div className="mr-auto">
                <DraftIndicator hasDraft={draft.hasDraft} ageLabel={draft.draftAgeLabel} onDiscard={handleDiscardDraft} formLabel="Pembayaran" />
              </div>
            )}
            <Button variant="outline" onClick={handleClose} disabled={submitting}>
              Batal
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className={isEdit ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Simpan Perubahan' : 'Catat Pembayaran'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </FormTabShell>
  );
}
