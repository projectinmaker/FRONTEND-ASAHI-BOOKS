'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { formatRp, formatDate } from '@/lib/pdf-utils';
import { api, PaginatedResponse, ApiError } from '@/lib/api';
import { toast } from 'sonner';
import { useTabStore } from '@/store/tab-store';
import { FormTabShell } from '@/components/erp/form-tab-shell';
import RekonsiliasiBankForm from '@/components/erp/cash-bank/forms/rekonsiliasi-bank-form';
import type { RekonsiliasiBankResponse, RekonsiliasiDetailResponse, RekonsiliasiDetailCreate, RekonsiliasiDetailUpdate, KasBankAkunResponse, COADropdownResponse } from '@/types/api';
import { Plus, Eye, RefreshCw, Loader2, Trash2, Pencil, ChevronLeft, ChevronRight, Check, ChevronDown, Search, FileCheck, Ban, X } from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────

const PAGE_SIZE = 12;
const BASE = '/kas-bank/rekonsiliasi-bank';

// ─── Helper: formatRp nullable ──────────────────────────────────────────

function fmtRp(val: number | null | undefined): string {
  if (val == null) return '-';
  return formatRp(val);
}

// ─── Status Badge ───────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'SELESAI':
      return <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Selesai</Badge>;
    case 'DRAFT':
      return <Badge className="border-yellow-200 bg-yellow-100 text-yellow-700 hover:bg-yellow-100">Draft</Badge>;
    case 'BATAL':
      return <Badge className="border-red-200 bg-red-100 text-red-700 hover:bg-red-100">Batal</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

// ─── Skeleton rows ──────────────────────────────────────────────────────

// M-07: skeleton rows selalu dibungkus <TableBody> — tanpa ini, komponen
// yang dirender di bawah div/CardContent (bukan dalam <Table>) menghasilkan
// <tr> langsung di dalam <div> → React error "div cannot contain nested tr".
// Call-site yang memakai <Table> tinggal meletakkannya sebagai anak <Table>
// (bersama <TableHeader>), TIDAK perlu (dan tidak boleh) dibungkus TableBody lagi.
function TableSkeleton({ cols = 8, rows = 5 }: { cols?: number; rows?: number }) {
  return (
    <TableBody>
      {Array.from({ length: rows }).map((_, r) => (
        <TableRow key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <TableCell key={c}>
              <Skeleton className="h-5 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  );
}

// ─── Kas/Bank Searchable Dropdown ───────────────────────────────────────

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

// ─── COA Searchable Dropdown ────────────────────────────────────────────

function CoaSelect({ value, onValueChange, options, loading, error, placeholder }: { value: string; onValueChange: (v: string) => void; options: COADropdownResponse[]; loading?: boolean; error?: string; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);

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
              <span>
                {selected.kode} — {selected.nama}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Search className="h-4 w-4" /> {placeholder || 'Pilih akun perkiraan'}
              </span>
            )}
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Cari akun perkiraan..." />
            <CommandList>
              <CommandEmpty>Akun tidak ditemukan.</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => (
                  <CommandItem
                    key={opt.id}
                    value={`${opt.kode} ${opt.nama} ${opt.header}`}
                    onSelect={() => {
                      onValueChange(opt.id);
                      setOpen(false);
                    }}>
                    <Check className={cn('mr-2 h-4 w-4', value === opt.id ? 'opacity-100' : 'opacity-0')} />
                    <div className="flex flex-col">
                      <span className="text-sm">
                        {opt.kode} — {opt.nama}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{opt.header}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Rekonsiliasi Bank Detail View (rendered in its own tab)
// ═══════════════════════════════════════════════════════════════════════════

function RekonsiliasiBankDetailView({ rekonsiliasiId }: { rekonsiliasiId: string }) {
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);

  // ── Detail state ──
  const [detail, setDetail] = useState<RekonsiliasiBankResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);

  // ── Dropdown data ──
  const [coaOptions, setCoaOptions] = useState<COADropdownResponse[]>([]);
  const [dropdownLoading, setDropdownLoading] = useState(true);

  // ── Detail line dialog (add / edit) ──
  const [detailLineOpen, setDetailLineOpen] = useState(false);
  const [detailLineEditing, setDetailLineEditing] = useState(false);
  const [detailLineId, setDetailLineId] = useState('');
  const [dlTipe, setDlTipe] = useState('MEMO');
  const [dlKeterangan, setDlKeterangan] = useState('');
  const [dlJumlah, setDlJumlah] = useState('');
  const [dlSisi, setDlSisi] = useState('DEBIT');
  const [dlAkunId, setDlAkunId] = useState('');
  const [dlErrors, setDlErrors] = useState<Record<string, string>>({});
  const [dlSubmitting, setDlSubmitting] = useState(false);

  // ── Void (Batal) dialog ──
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidSubmitting, setVoidSubmitting] = useState(false);

  // ── Complete (Selesai) dialog ──
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeSubmitting, setCompleteSubmitting] = useState(false);

  // ── Delete detail line dialog ──
  const [deleteDetailOpen, setDeleteDetailOpen] = useState(false);
  const [deleteDetailTarget, setDeleteDetailTarget] = useState<RekonsiliasiDetailResponse | null>(null);
  const [deleteDetailSubmitting, setDeleteDetailSubmitting] = useState(false);

  // ═══════════════════════════════════════════════════════════════════════
  // Fetch dropdowns
  // ═══════════════════════════════════════════════════════════════════════

  const fetchDropdowns = useCallback(async () => {
    setDropdownLoading(true);
    try {
      const coaRes = await api.get<COADropdownResponse[]>('/master/coa-dropdown?exclude_linked=true');
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

  // ═══════════════════════════════════════════════════════════════════════
  // Fetch detail
  // ═══════════════════════════════════════════════════════════════════════

  const fetchDetail = useCallback(async () => {
    setDetailLoading(true);
    try {
      const res = await api.get<RekonsiliasiBankResponse>(`${BASE}/${rekonsiliasiId}`);
      setDetail(res);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal memuat detail rekonsiliasi');
    } finally {
      setDetailLoading(false);
    }
  }, [rekonsiliasiId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // ═══════════════════════════════════════════════════════════════════════
  // Detail line: Add / Edit
  // ═══════════════════════════════════════════════════════════════════════

  const openAddDetailLine = useCallback(() => {
    setDetailLineEditing(false);
    setDetailLineId('');
    setDlTipe('MEMO');
    setDlKeterangan('');
    setDlJumlah('');
    setDlSisi('DEBIT');
    setDlAkunId('');
    setDlErrors({});
    setDetailLineOpen(true);
  }, []);

  const openEditDetailLine = useCallback((line: RekonsiliasiDetailResponse) => {
    setDetailLineEditing(true);
    setDetailLineId(line.id);
    setDlTipe(line.tipe);
    setDlKeterangan(line.keterangan);
    setDlJumlah(String(line.jumlah));
    setDlSisi(line.sisi);
    setDlAkunId(line.akunPerkiraanId || '');
    setDlErrors({});
    setDetailLineOpen(true);
  }, []);

  const handleDetailLineSubmit = useCallback(async () => {
    const e: Record<string, string> = {};
    if (!dlKeterangan.trim()) e.keterangan = 'Keterangan wajib diisi';
    if (!dlJumlah || Number(dlJumlah) <= 0 || isNaN(Number(dlJumlah))) e.jumlah = 'Jumlah wajib diisi dengan angka positif';
    if (dlTipe === 'PENYESUAIAN' && !dlAkunId) e.akunPerkiraanId = 'Akun perkiraan wajib dipilih untuk penyesuaian';
    setDlErrors(e);
    if (Object.keys(e).length > 0) return;

    setDlSubmitting(true);
    try {
      if (detailLineEditing && detail && detailLineId) {
        const payload: RekonsiliasiDetailUpdate = {
          tipe: dlTipe,
          keterangan: dlKeterangan.trim(),
          jumlah: Number(dlJumlah),
          sisi: dlSisi,
          akunPerkiraanId: dlTipe === 'PENYESUAIAN' ? dlAkunId : null
        };
        await api.put<RekonsiliasiDetailResponse>(`${BASE}/${detail.id}/detail/${detailLineId}`, payload);
        toast.success('Detail berhasil diperbarui');
      } else if (detail) {
        const payload: RekonsiliasiDetailCreate = {
          tipe: dlTipe,
          keterangan: dlKeterangan.trim(),
          jumlah: Number(dlJumlah),
          sisi: dlSisi,
          akunPerkiraanId: dlTipe === 'PENYESUAIAN' ? dlAkunId : null
        };
        await api.post<RekonsiliasiDetailResponse>(`${BASE}/${detail.id}/detail`, payload);
        toast.success('Detail berhasil ditambahkan');
      }
      setDetailLineOpen(false);
      fetchDetail();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal menyimpan detail');
    } finally {
      setDlSubmitting(false);
    }
  }, [dlTipe, dlKeterangan, dlJumlah, dlSisi, dlAkunId, detailLineEditing, detailLineId, detail, fetchDetail]);

  // ═══════════════════════════════════════════════════════════════════════
  // Delete detail line
  // ═══════════════════════════════════════════════════════════════════════

  const confirmDeleteDetail = useCallback((line: RekonsiliasiDetailResponse) => {
    setDeleteDetailTarget(line);
    setDeleteDetailOpen(true);
  }, []);

  const handleDeleteDetail = useCallback(async () => {
    if (!detail || !deleteDetailTarget) return;
    setDeleteDetailSubmitting(true);
    try {
      await api.delete(`${BASE}/${detail.id}/detail/${deleteDetailTarget.id}`);
      toast.success('Detail berhasil dihapus');
      setDeleteDetailOpen(false);
      setDeleteDetailTarget(null);
      fetchDetail();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal menghapus detail');
    } finally {
      setDeleteDetailSubmitting(false);
    }
  }, [detail, deleteDetailTarget, fetchDetail]);

  // ═══════════════════════════════════════════════════════════════════════
  // Complete (Selesai)
  // ═══════════════════════════════════════════════════════════════════════

  const handleComplete = useCallback(async () => {
    if (!detail) return;
    setCompleteSubmitting(true);
    try {
      await api.post(`${BASE}/${detail.id}/selesai`);
      toast.success('Rekonsiliasi bank berhasil diselesaikan');
      setCompleteOpen(false);
      fetchDetail();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal menyelesaikan rekonsiliasi');
    } finally {
      setCompleteSubmitting(false);
    }
  }, [detail, fetchDetail]);

  // ═══════════════════════════════════════════════════════════════════════
  // Void (Batal)
  // ═══════════════════════════════════════════════════════════════════════

  const handleVoid = useCallback(async () => {
    if (!detail) return;
    setVoidSubmitting(true);
    try {
      await api.post(`${BASE}/${detail.id}/batal`);
      toast.success('Rekonsiliasi bank berhasil dibatalkan');
      setVoidOpen(false);
      fetchDetail();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal membatalkan rekonsiliasi');
    } finally {
      setVoidSubmitting(false);
    }
  }, [detail, fetchDetail]);

  // ── Close tab ──
  const handleClose = useCallback(() => {
    if (activeTabId) closeTab(activeTabId);
  }, [activeTabId, closeTab]);

  const title = detail ? `Rekonsiliasi #${detail.kasBank?.nama || rekonsiliasiId.slice(0, 8)}` : 'Detail Rekonsiliasi Bank';

  // m-02: sisa selisih setelah penyesuaian (untuk DRAFT) — formula balance
  // backend: saldo_buku + penyesuaian_net = saldo_bank + memo_net, dengan
  // signed = jumlah (DEBIT) / −jumlah (KREDIT) → sisa = selisih + memo_net − penyesuaian_net.
  const sisaSelisih = useMemo(() => {
    if (!detail) return null;
    const selisihAwal = Number(detail.selisih) || 0;
    let penyesuaianNet = 0;
    let memoNet = 0;
    for (const line of detail.details || []) {
      const signed = (Number(line.jumlah) || 0) * (line.sisi === 'DEBIT' ? 1 : -1);
      if (line.tipe === 'PENYESUAIAN') penyesuaianNet += signed;
      else memoNet += signed;
    }
    return selisihAwal + memoNet - penyesuaianNet;
  }, [detail]);

  return (
    <FormTabShell title={title}>
      <div className="space-y-4">
        {/* ── Close + actions ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <Button variant="outline" onClick={handleClose} className="gap-2">
            <X className="h-4 w-4" /> Tutup
          </Button>
          {detail?.status === 'DRAFT' && (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={openAddDetailLine}>
                <Plus className="mr-2 h-4 w-4" /> Tambah Detail
              </Button>
              <Button onClick={() => setCompleteOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <FileCheck className="mr-2 h-4 w-4" /> Selesaikan
              </Button>
            </div>
          )}
        </div>

        {detailLoading ? (
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-6 w-32" />
                  </div>
                ))}
              </div>
              <Separator className="my-4" />
              {/* M-07: TableSkeleton membawa <TableBody> sendiri → bungkus <Table> agar struktur tabel valid */}
              <Table>
                <TableSkeleton cols={7} rows={3} />
              </Table>
            </CardContent>
          </Card>
        ) : detail ? (
          <>
            {/* ── Header card ── */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <CardTitle className="text-lg">Detail Rekonsiliasi Bank</CardTitle>
                  <StatusBadge status={detail.status} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Kas/Bank</p>
                    <p className="text-sm font-medium mt-0.5">
                      {detail.kasBank?.nama || '-'}
                      {detail.kasBank?.jenis && <span className="text-muted-foreground ml-2 text-xs">({detail.kasBank.jenis})</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Tanggal Statement</p>
                    <p className="text-sm font-medium mt-0.5">{formatDate(detail.tanggalAkhir)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Saldo Bank</p>
                    <p className="text-sm font-mono font-semibold mt-0.5">{fmtRp(detail.saldoBank)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Saldo Buku</p>
                    <p className="text-sm font-mono font-semibold mt-0.5">{fmtRp(detail.saldoBuku)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Selisih awal (bank − buku)</p>
                    <p className={cn('text-sm font-mono font-semibold mt-0.5', detail.selisih !== 0 ? (detail.selisih > 0 ? 'text-amber-600' : 'text-red-600') : 'text-emerald-600')}>{fmtRp(detail.selisih)}</p>
                    {/* m-02: indikasi keseimbangan setelah penyesuaian (SELESAI) / sisa selisih live (DRAFT) */}
                    {detail.status === 'SELESAI' ? (
                      <p className="text-xs text-emerald-600 font-medium mt-1">Selisih tersisa setelah penyesuaian: Rp 0 (seimbang)</p>
                    ) : (detail.details || []).length > 0 && sisaSelisih !== null ? (
                      <p className={cn('text-xs mt-1', Math.abs(sisaSelisih) < 0.01 ? 'text-emerald-600 font-medium' : sisaSelisih > 0 ? 'text-amber-600' : 'text-red-600')}>
                        Selisih tersisa setelah penyesuaian: {fmtRp(sisaSelisih)}
                        {Math.abs(sisaSelisih) < 0.01 ? ' (seimbang)' : ''}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Keterangan</p>
                    <p className="text-sm mt-0.5">{detail.keterangan || '-'}</p>
                  </div>
                  {detail.status === 'SELESAI' && detail.jurnal && (
                    <div className="sm:col-span-2 lg:col-span-3">
                      <p className="text-xs font-medium text-muted-foreground">Jurnal Penyesuaian</p>
                      <p className="text-sm font-medium mt-0.5 text-emerald-700">{detail.jurnal.noJurnal}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ── Detail lines table ── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Rincian Rekonsiliasi</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12 text-center">No</TableHead>
                        <TableHead>Tipe</TableHead>
                        <TableHead>Keterangan</TableHead>
                        <TableHead className="text-right">Jumlah</TableHead>
                        <TableHead className="text-center">Sisi</TableHead>
                        <TableHead className="hidden md:table-cell">Akun Perkiraan</TableHead>
                        {detail.status === 'DRAFT' && <TableHead className="text-center">Aksi</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.details.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={detail.status === 'DRAFT' ? 7 : 6} className="text-center py-8 text-muted-foreground">
                            Belum ada detail. {detail.status === 'DRAFT' && 'Klik "Tambah Detail" untuk menambahkan baris.'}
                          </TableCell>
                        </TableRow>
                      )}
                      {detail.details.map((line, idx) => (
                        <TableRow key={line.id}>
                          <TableCell className="text-center text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell>
                            <Badge variant={line.tipe === 'PENYESUAIAN' ? 'default' : 'secondary'} className="text-xs">
                              {line.tipe === 'PENYESUAIAN' ? 'Penyesuaian' : 'Memo'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate" title={line.keterangan}>
                            {line.keterangan}
                          </TableCell>
                          <TableCell className="text-right text-sm font-mono">{formatRp(line.jumlah)}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="text-xs">
                              {line.sisi}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                            {line.akunPerkiraan ? (
                              <span>
                                {line.akunPerkiraan.kode} — {line.akunPerkiraan.nama}
                              </span>
                            ) : (
                              <span>-</span>
                            )}
                          </TableCell>
                          {detail.status === 'DRAFT' && (
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDetailLine(line)} title="Edit">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => confirmDeleteDetail(line)} title="Hapus">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}

        {/* ── Void button ── */}
        {detail && (detail.status === 'DRAFT' || detail.status === 'SELESAI') && (
          <div className="flex justify-start">
            <Button variant="outline" className="text-destructive hover:text-destructive border-destructive/30" onClick={() => setVoidOpen(true)}>
              <Ban className="mr-2 h-4 w-4" /> Batalkan Rekonsiliasi
            </Button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* COMPLETE CONFIRMATION DIALOG                                */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <AlertDialog
          open={completeOpen}
          onOpenChange={(o) => {
            if (!o) setCompleteOpen(false);
          }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Selesaikan Rekonsiliasi?</AlertDialogTitle>
              <AlertDialogDescription>Setelah diselesaikan, rekonsiliasi tidak dapat diubah lagi. Jurnal penyesuaian akan dibuat otomatis (jika ada penyesuaian).</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={completeSubmitting}>Tidak</AlertDialogCancel>
              <AlertDialogAction onClick={handleComplete} disabled={completeSubmitting} className="bg-emerald-600 text-white hover:bg-emerald-700">
                {completeSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Ya, Selesaikan
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* VOID CONFIRMATION DIALOG                                     */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <AlertDialog
          open={voidOpen}
          onOpenChange={(o) => {
            if (!o) setVoidOpen(false);
          }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Batalkan Rekonsiliasi?</AlertDialogTitle>
              <AlertDialogDescription>Apakah Anda yakin ingin membatalkan rekonsiliasi bank ini? Tindakan ini tidak dapat dibatalkan.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={voidSubmitting}>Tidak</AlertDialogCancel>
              <AlertDialogAction onClick={handleVoid} disabled={voidSubmitting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {voidSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Ya, Batalkan
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* DETAIL LINE DIALOG (Add / Edit)                              */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <Dialog
          open={detailLineOpen}
          onOpenChange={(o) => {
            if (!o) setDetailLineOpen(false);
          }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{detailLineEditing ? 'Edit Detail' : 'Tambah Detail'}</DialogTitle>
              <DialogDescription>{detailLineEditing ? 'Perbarui informasi detail rekonsiliasi.' : 'Tambahkan baris baru ke rekonsiliasi.'}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  Tipe <span className="text-destructive">*</span>
                </Label>
                <Select value={dlTipe} onValueChange={setDlTipe}>
                  <SelectTrigger className={cn(dlErrors.tipe && 'border-destructive')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MEMO">Memo</SelectItem>
                    <SelectItem value="PENYESUAIAN">Penyesuaian</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  Keterangan <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="Deskripsi detail"
                  value={dlKeterangan}
                  onChange={(e) => {
                    setDlKeterangan(e.target.value);
                    setDlErrors((prev) => ({ ...prev, keterangan: undefined }));
                  }}
                  className={cn(dlErrors.keterangan && 'border-destructive')}
                />
                {dlErrors.keterangan && <p className="text-xs text-destructive mt-1">{dlErrors.keterangan}</p>}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  Jumlah <span className="text-destructive">*</span>
                </Label>
                <CurrencyInput
                  allowDecimal
                  placeholder="0"
                  value={dlJumlah}
                  onValueChange={(v) => {
                    setDlJumlah(v);
                    setDlErrors((prev) => ({ ...prev, jumlah: undefined }));
                  }}
                  className={cn(dlErrors.jumlah && 'border-destructive')}
                />
                {dlErrors.jumlah && <p className="text-xs text-destructive mt-1">{dlErrors.jumlah}</p>}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  Sisi <span className="text-destructive">*</span>
                </Label>
                <Select value={dlSisi} onValueChange={setDlSisi}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEBIT">Debit</SelectItem>
                    <SelectItem value="KREDIT">Kredit</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {dlTipe === 'PENYESUAIAN' && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    Akun Perkiraan <span className="text-destructive">*</span>
                  </Label>
                  <CoaSelect
                    value={dlAkunId}
                    onValueChange={(v) => {
                      setDlAkunId(v);
                      setDlErrors((prev) => ({ ...prev, akunPerkiraanId: undefined }));
                    }}
                    options={coaOptions}
                    loading={dropdownLoading}
                    error={dlErrors.akunPerkiraanId}
                  />
                  {dlErrors.akunPerkiraanId && <p className="text-xs text-destructive mt-1">{dlErrors.akunPerkiraanId}</p>}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDetailLineOpen(false)} disabled={dlSubmitting}>
                Batal
              </Button>
              <Button onClick={handleDetailLineSubmit} disabled={dlSubmitting}>
                {dlSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {detailLineEditing ? 'Simpan Perubahan' : 'Tambah Detail'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* DELETE DETAIL LINE CONFIRMATION                              */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <AlertDialog
          open={deleteDetailOpen}
          onOpenChange={(o) => {
            if (!o) {
              setDeleteDetailOpen(false);
              setDeleteDetailTarget(null);
            }
          }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hapus Detail?</AlertDialogTitle>
              <AlertDialogDescription>Apakah Anda yakin ingin menghapus detail &quot;{deleteDetailTarget?.keterangan}&quot;? Tindakan ini tidak dapat dibatalkan.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteDetailSubmitting}>Tidak</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteDetail} disabled={deleteDetailSubmitting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleteDetailSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Ya, Hapus
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </FormTabShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Component (List + Form Mode Routing)
// ═══════════════════════════════════════════════════════════════════════════

interface RekonsiliasiBankTabProps {
  formMode?: string;
  formProps?: Record<string, unknown>;
  refreshKey?: number;
}

export default function RekonsiliasiBankTab({ formMode, formProps, refreshKey }: RekonsiliasiBankTabProps) {
  // ── Form mode: render form or detail in tab ──
  if (formMode) {
    if (formProps?.mode === 'detail' && formProps?.id) {
      return <RekonsiliasiBankDetailView rekonsiliasiId={formProps.id as string} />;
    }
    // Create form
    return <RekonsiliasiBankForm />;
  }
  return <RekonsiliasiBankListContent refreshKey={refreshKey} />;
}

function RekonsiliasiBankListContent({ refreshKey }: { refreshKey?: number }) {
  // ── Tab store ──
  const openFormTab = useTabStore((s) => s.openFormTab);

  // ── Dropdown data ──
  const [kasBankOptions, setKasBankOptions] = useState<KasBankAkunResponse[]>([]);
  const [dropdownLoading, setDropdownLoading] = useState(true);

  // ── List state ──
  const [data, setData] = useState<RekonsiliasiBankResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Filters ──
  const [filterKasBank, setFilterKasBank] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // ── Void dialog ──
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<RekonsiliasiBankResponse | null>(null);
  const [voidSubmitting, setVoidSubmitting] = useState(false);

  // ── Create → open form tab ──
  const openCreateTab = useCallback(() => {
    openFormTab({
      title: 'Buat Rekonsiliasi Bank',
      module: 'cash-bank',
      subPage: 'rekonsiliasi-bank',
      formKey: 'rekonsiliasi-bank-create'
    });
  }, [openFormTab]);

  // ── Detail → open form tab ──
  const openDetailTab = useCallback(
    (item: RekonsiliasiBankResponse) => {
      openFormTab({
        title: `Rekonsiliasi #${item.kasBank?.nama || item.id.slice(0, 8)}`,
        module: 'cash-bank',
        subPage: 'rekonsiliasi-bank',
        formKey: 'rekonsiliasi-bank-detail',
        formProps: { mode: 'detail', id: item.id }
      });
    },
    [openFormTab]
  );

  // ═══════════════════════════════════════════════════════════════════════
  // Fetch dropdowns
  // ═══════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════
  // Fetch list
  // ═══════════════════════════════════════════════════════════════════════

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('skip', String(skip));
      params.set('limit', String(PAGE_SIZE));
      if (filterKasBank) params.set('kas_bank_akun_id', filterKasBank);
      if (filterStatus) params.set('status', filterStatus);

      const res = await api.get<PaginatedResponse<RekonsiliasiBankResponse>>(`${BASE}?${params.toString()}`);
      setData(res.data);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Gagal memuat data rekonsiliasi');
    } finally {
      setLoading(false);
    }
  }, [skip, filterKasBank, filterStatus]);

  useEffect(() => {
    fetchList();
  }, [fetchList, refreshKey]);

  // Reset skip when filter changes
  useEffect(() => {
    setSkip(0);
  }, [filterKasBank, filterStatus]);

  // ═══════════════════════════════════════════════════════════════════════
  // Void (Batal) from list
  // ═══════════════════════════════════════════════════════════════════════

  const confirmVoid = useCallback((item: RekonsiliasiBankResponse) => {
    setVoidTarget(item);
    setVoidOpen(true);
  }, []);

  const handleVoid = useCallback(async () => {
    if (!voidTarget) return;
    setVoidSubmitting(true);
    try {
      await api.post(`${BASE}/${voidTarget.id}/batal`);
      toast.success('Rekonsiliasi bank berhasil dibatalkan');
      setVoidOpen(false);
      setVoidTarget(null);
      fetchList();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal membatalkan rekonsiliasi');
    } finally {
      setVoidSubmitting(false);
    }
  }, [voidTarget, fetchList]);

  // ═══════════════════════════════════════════════════════════════════════
  // Pagination
  // ═══════════════════════════════════════════════════════════════════════

  const currentPage = Math.floor(skip / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasNext = skip + PAGE_SIZE < total;
  const hasPrev = skip > 0;

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER: LIST VIEW
  // ═══════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-4">
      {/* ── Action bar ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <KasBankSelect value={filterKasBank} onValueChange={setFilterKasBank} options={kasBankOptions} loading={dropdownLoading} placeholder="Semua Kas/Bank" />
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v === '__all__' ? '' : v)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Semua Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Semua Status</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="SELESAI">Selesai</SelectItem>
              <SelectItem value="BATAL">Batal</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchList} disabled={loading} title="Refresh">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>
        <Button onClick={openCreateTab} disabled={dropdownLoading}>
          <Plus className="mr-2 h-4 w-4" /> Buat Rekonsiliasi
        </Button>
      </div>

      {/* ── Table ── */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">No</TableHead>
                  <TableHead>Kas/Bank</TableHead>
                  <TableHead>Tgl Statement</TableHead>
                  <TableHead className="text-right">Saldo Bank</TableHead>
                  <TableHead className="text-right">Saldo Buku</TableHead>
                  <TableHead className="text-right">Selisih</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              {/* M-07: saat loading, TableSkeleton membawa <TableBody> sendiri —
                  render sebagai pengganti TableBody (bukan di dalamnya) agar
                  tidak ada <tbody> bersarang. */}
              {!error && loading ? (
                <TableSkeleton cols={8} rows={PAGE_SIZE} />
              ) : (
                <TableBody>
                  {error && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        <div className="space-y-2">
                          <p className="text-destructive text-sm font-medium">{error}</p>
                          <Button variant="outline" size="sm" onClick={fetchList}>
                            Coba Lagi
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  {!error && !loading && data.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                        Belum ada data rekonsiliasi bank.
                      </TableCell>
                    </TableRow>
                  )}
                  {!error &&
                    !loading &&
                    data.map((item, idx) => (
                      <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetailTab(item)}>
                        <TableCell className="text-center text-muted-foreground">{skip + idx + 1}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">{item.kasBank?.nama || '-'}</span>
                            <span className="text-xs text-muted-foreground">
                              {item.kasBank?.jenis || ''} {item.kasBank?.kode ? `· ${item.kasBank.kode}` : ''}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{formatDate(item.tanggalAkhir)}</TableCell>
                        <TableCell className="text-right text-sm font-mono">{fmtRp(item.saldoBank)}</TableCell>
                        <TableCell className="text-right text-sm font-mono">{fmtRp(item.saldoBuku)}</TableCell>
                        <TableCell className={cn('text-right text-sm font-mono font-medium', item.selisih !== 0 ? (item.selisih > 0 ? 'text-amber-600' : 'text-red-600') : 'text-emerald-600')}>{fmtRp(item.selisih)}</TableCell>
                        <TableCell className="text-center">
                          <StatusBadge status={item.status} />
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDetailTab(item)} title="Lihat Detail">
                              <Eye className="h-4 w-4" />
                            </Button>
                            {(item.status === 'DRAFT' || item.status === 'SELESAI') && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => confirmVoid(item)} title="Batalkan">
                                <Ban className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              )}
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Pagination ── */}
      {!error && total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Menampilkan {skip + 1}–{Math.min(skip + PAGE_SIZE, total)} dari {total} (Halaman {currentPage} dari {totalPages})
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={!hasPrev} onClick={() => setSkip((s) => s - PAGE_SIZE)} className="gap-1">
              <ChevronLeft className="h-4 w-4" /> Sebelumnya
            </Button>
            <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => setSkip((s) => s + PAGE_SIZE)} className="gap-1">
              Selanjutnya <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* VOID CONFIRMATION DIALOG                                     */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <AlertDialog
        open={voidOpen}
        onOpenChange={(o) => {
          if (!o) {
            setVoidOpen(false);
            setVoidTarget(null);
          }
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan Rekonsiliasi?</AlertDialogTitle>
            <AlertDialogDescription>Apakah Anda yakin ingin membatalkan rekonsiliasi bank ini? Tindakan ini tidak dapat dibatalkan.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={voidSubmitting}>Tidak</AlertDialogCancel>
            <AlertDialogAction onClick={handleVoid} disabled={voidSubmitting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {voidSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ya, Batalkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
