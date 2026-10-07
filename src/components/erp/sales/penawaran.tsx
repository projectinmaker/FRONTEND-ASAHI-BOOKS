'use client';

// ═════════════════════════════════════════════════════════════════════════════
// PENAWARAN (QUOTATION) — modul baru update #3.
// Komponen self-contained (list + form create/edit + cetak), mirror pola
// PesananTab/PesananCetakTab/InvoicePenjualanCreateForm di sales/index.tsx
// dan sales/cetak-tabs.tsx. Dipasang di sales/index.tsx (routing + formMode).
// ═════════════════════════════════════════════════════════════════════════════

import { useState, useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableDropdown, type SearchableDropdownOption } from '@/components/ui/searchable-dropdown';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { FileText, Plus, Trash2, Search, ChevronLeft, ChevronRight, Loader2, Pencil, Printer, Download, Info } from 'lucide-react';
import { formatRp, formatDate, todayStr, generatePDF, fileSafeNo } from '@/lib/pdf-utils';
import { api, PaginatedResponse, ApiError } from '@/lib/api';
import { toast } from 'sonner';
import { useTabStore } from '@/store/tab-store';
import { FormTabShell } from '@/components/erp/form-tab-shell';
import { HardDeleteCancelDialog } from '@/components/erp/hard-delete-cancel-dialog';
import { PenawaranPDFTemplate, type PenawaranData, type DetailRow, type BiayaTambahan } from '@/components/erp/sales/pdf-templates';
import type { PenawaranResponse, PenawaranCreate, PenawaranDetailCreate, PelangganDropdown, SyaratBayarResponse, BarangDropdown, SatuanResponse, TransaksiBiayaCreate, HardDeleteResponse } from '@/types/api';
// Update #4 — auto-fill alamat & syarat bayar dari master saat pelanggan dipilih
import { findPartyMaster, AUTOFILL_HINT } from '@/lib/party-autofill';

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 100;

// ─── Status Badge (mirror StatusBadge sales/index.tsx, status penawaran) ─────

function PenawaranStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'DRAFT':
      return <Badge className="border-yellow-200 bg-yellow-100 text-yellow-700 hover:bg-yellow-100">Draft</Badge>;
    case 'SELESAI':
      return <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Selesai</Badge>;
    case 'DIBATALKAN':
      return <Badge className="border-red-200 bg-red-100 text-red-700 hover:bg-red-100">Dibatalkan</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

// ─── Shared UI (mirror sales/index.tsx) ─────────────────────────────────────

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-destructive">
      <CardContent className="p-4">
        <p className="text-sm text-destructive font-medium">{message}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          Coba Lagi
        </Button>
      </CardContent>
    </Card>
  );
}

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-5 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function Pagination({ skip, total, onNext, onPrev }: { skip: number; total: number; onNext: () => void; onPrev: () => void }) {
  const currentPage = Math.floor(skip / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasNext = skip + PAGE_SIZE < total;
  const hasPrev = skip > 0;
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3">
      <p className="text-sm text-muted-foreground">
        Menampilkan {total === 0 ? 0 : skip + 1}–{Math.min(skip + PAGE_SIZE, total)} dari {total} (Halaman {currentPage} dari {totalPages})
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={!hasPrev} onClick={onPrev} className="gap-1">
          <ChevronLeft className="h-4 w-4" /> Sebelumnya
        </Button>
        <Button variant="outline" size="sm" disabled={!hasNext} onClick={onNext} className="gap-1">
          Selanjutnya <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Form Row Types ─────────────────────────────────────────────────────────

interface PenawaranFormRow {
  id: string;
  barangId: string;
  kodeBarang: string;
  barangNama: string;
  satuanId: string;
  satuanNama: string;
  harga: string;
  qty: string;
  diskon: string;
}

interface PenawaranBiayaRow {
  id: string;
  nama: string;
  jumlah: string;
}

function newFormRow(): PenawaranFormRow {
  return { id: crypto.randomUUID(), barangId: '', kodeBarang: '', barangNama: '', satuanId: '', satuanNama: '', harga: '', qty: '1', diskon: '0' };
}

function newBiayaRow(): PenawaranBiayaRow {
  return { id: crypto.randomUUID(), nama: '', jumlah: '' };
}

/** Pertahankan label data historis yang tidak lagi ada di dropdown aktif. */
function includeCurrent(options: SearchableDropdownOption[], id?: string | null, label?: string | null) {
  return id && !options.some((option) => option.id === id) ? [...options, { id, label: label || id }] : options;
}

// ─── Detail Table (barang + satuan + harga + diskon + subtotal) ─────────────

function PenawaranDetailTable({ rows, setRows, barangOptions, satuanOptions }: { rows: PenawaranFormRow[]; setRows: Dispatch<SetStateAction<PenawaranFormRow[]>>; barangOptions: BarangDropdown[]; satuanOptions: SatuanResponse[] }) {
  const addRow = useCallback(() => setRows((p) => [...p, newFormRow()]), [setRows]);
  const removeRow = useCallback((id: string) => setRows((p) => p.filter((r) => r.id !== id)), [setRows]);
  const updateRow = useCallback(
    (id: string, field: keyof PenawaranFormRow, value: string) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          if (field === 'barangId') {
            const found = barangOptions.find((b) => b.id === value);
            // Auto-fill harga saat barang dipilih (mirror DetailTableWithPrice
            // di sales/index.tsx): harga jual default, fallback harga pokok.
            // Normalisasi via Number() — backend mengirim Decimal sebagai string.
            const hargaJual = Number(found?.hargaJual);
            const hargaPokok = Number(found?.hargaPokok);
            const hargaDefault = found ? (hargaJual > 0 ? String(hargaJual) : hargaPokok > 0 ? String(hargaPokok) : '') : r.harga;
            return { ...r, barangId: value, kodeBarang: found?.kode || '', barangNama: found?.nama || '', ...(hargaDefault ? { harga: hargaDefault } : {}) };
          }
          if (field === 'satuanId') {
            const found = satuanOptions.find((s) => s.id === value);
            return { ...r, satuanId: value, satuanNama: found?.nama || '' };
          }
          return { ...r, [field]: value };
        })
      );
    },
    [setRows, barangOptions, satuanOptions]
  );

  return (
    <div className="space-y-3">
      <div className="max-h-64 overflow-y-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[100px]">Kode Barang</TableHead>
              <TableHead className="min-w-[200px]">Nama Barang</TableHead>
              <TableHead className="w-[120px]">Satuan</TableHead>
              <TableHead className="w-[120px] text-right">Harga Satuan</TableHead>
              <TableHead className="w-[80px] text-right">Qty</TableHead>
              <TableHead className="w-[90px] text-right">Diskon %</TableHead>
              <TableHead className="w-[140px] text-right">Subtotal</TableHead>
              <TableHead className="w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const q = parseFloat(row.qty) || 0;
              const h = parseFloat(row.harga) || 0;
              const d = parseFloat(row.diskon) || 0;
              const rowSub = q * h * (1 - d / 100);
              return (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.kodeBarang || '-'}</TableCell>
                  <TableCell>
                    <SearchableDropdown value={row.barangId} onValueChange={(v) => updateRow(row.id, 'barangId', v)} options={barangOptions.map((b) => ({ id: b.id, label: b.nama, subtitle: b.kode }))} placeholder="Pilih barang..." compact />
                  </TableCell>
                  <TableCell>
                    <SearchableDropdown value={row.satuanId} onValueChange={(v) => updateRow(row.id, 'satuanId', v)} options={satuanOptions.map((s) => ({ id: s.id, label: s.nama }))} allOption={{ id: '', label: 'Tidak dipilih' }} placeholder="Pilih..." compact />
                  </TableCell>
                  <TableCell>
                    <CurrencyInput className="h-8 text-right text-xs" value={row.harga} onValueChange={(v) => updateRow(row.id, 'harga', v)} />
                  </TableCell>
                  <TableCell>
                    <Input type="number" className="h-8 text-right text-xs" value={row.qty} min={1} onChange={(e) => updateRow(row.id, 'qty', e.target.value)} />
                  </TableCell>
                  <TableCell>
                    <Input type="number" className="h-8 text-right text-xs" value={row.diskon} min={0} max={100} onChange={(e) => updateRow(row.id, 'diskon', e.target.value)} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs font-medium">{formatRp(rowSub)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeRow(row.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-16 text-center text-muted-foreground">
                  Belum ada item. Klik &quot;+ Tambah Baris&quot; untuk menambahkan.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center">
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addRow}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Tambah Baris
        </Button>
      </div>
    </div>
  );
}

// ─── Biaya Tambahan Table ───────────────────────────────────────────────────

function PenawaranBiayaTable({ rows, setRows }: { rows: PenawaranBiayaRow[]; setRows: Dispatch<SetStateAction<PenawaranBiayaRow[]>> }) {
  const addRow = useCallback(() => setRows((p) => [...p, newBiayaRow()]), [setRows]);
  const removeRow = useCallback((id: string) => setRows((p) => p.filter((r) => r.id !== id)), [setRows]);
  const updateRow = useCallback(
    (id: string, field: 'nama' | 'jumlah', value: string) => {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    },
    [setRows]
  );
  const totalBiaya = rows.reduce((s, b) => s + (parseFloat(b.jumlah) || 0), 0);
  return (
    <div className="space-y-3">
      <div className="max-h-48 overflow-y-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="min-w-[250px]">Nama Biaya</TableHead>
              <TableHead className="w-[150px] text-right">Jumlah</TableHead>
              <TableHead className="w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Input className="h-8 text-xs" placeholder="Nama biaya..." value={row.nama} onChange={(e) => updateRow(row.id, 'nama', e.target.value)} />
                </TableCell>
                <TableCell>
                  <CurrencyInput className="h-8 text-right text-xs" value={row.jumlah} onValueChange={(v) => updateRow(row.id, 'jumlah', v)} />
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeRow(row.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="h-12 text-center text-muted-foreground text-xs">
                  Tidak ada biaya tambahan.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addRow}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Tambah Biaya
        </Button>
        <div className="text-sm font-semibold">Total Biaya: {formatRp(totalBiaya)}</div>
      </div>
    </div>
  );
}

// ─── Totals Breakdown (mirror TotalsBreakdown sales/index.tsx) ──────────────

function TotalsBreakdown({ subtotal, diskonGlobalPct, ppnPct, totalBiayaTambahan }: { subtotal: number; diskonGlobalPct: number; ppnPct: number; totalBiayaTambahan: number }) {
  const totalDiskon = subtotal * (diskonGlobalPct / 100);
  const dasarPajak = subtotal - totalDiskon;
  const ppnAmount = dasarPajak * (ppnPct / 100);
  const grandTotal = dasarPajak + ppnAmount + totalBiayaTambahan;

  return (
    <div className="rounded-md border bg-muted/20 px-4 py-3 space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="font-mono">{formatRp(subtotal)}</span>
      </div>
      {diskonGlobalPct > 0 && (
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground pl-3">- Diskon ({diskonGlobalPct}%)</span>
          <span className="font-mono text-destructive">({formatRp(totalDiskon)})</span>
        </div>
      )}
      <div className="flex justify-between text-xs border-t pt-1 mt-1">
        <span className="font-medium">Dasar Pajak</span>
        <span className="font-mono font-medium">{formatRp(dasarPajak)}</span>
      </div>
      {ppnPct > 0 && (
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground pl-3">+ PPN ({ppnPct}%)</span>
          <span className="font-mono">{formatRp(ppnAmount)}</span>
        </div>
      )}
      {totalBiayaTambahan > 0 && (
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground pl-3">+ Total Biaya</span>
          <span className="font-mono">{formatRp(totalBiayaTambahan)}</span>
        </div>
      )}
      <div className="flex justify-between text-sm font-semibold border-t pt-1 mt-1">
        <span>Grand Total</span>
        <span className="font-mono">{formatRp(grandTotal)}</span>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB LIST: PenawaranTab
// ═════════════════════════════════════════════════════════════════════════════

export function PenawaranTab({ pelangganOptions, refreshKey }: { pelangganOptions: PelangganDropdown[]; refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const [data, setData] = useState<PenawaranResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const [statusFilter, setStatusFilter] = useState('');
  const [pelangganFilter, setPelangganFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ skip: String(skip), limit: String(PAGE_SIZE) });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter && statusFilter !== 'ALL') params.set('status', statusFilter);
      if (pelangganFilter) params.set('pelanggan_id', pelangganFilter);
      if (dateFrom) params.set('tanggal_from', dateFrom);
      if (dateTo) params.set('tanggal_to', dateTo);
      const res = await api.get<PaginatedResponse<PenawaranResponse>>(`/penjualan/penawaran?${params}`);
      setData(res.data);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [skip, debouncedSearch, statusFilter, pelangganFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setSkip(0);
  }, []);

  // ── Hapus = Hard Delete (mirror PesananTab sales/index.tsx) ──
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const handleCancel = useCallback(
    async (reason?: string) => {
      if (!cancelTarget) return;
      setCancelSubmitting(true);
      try {
        const res = await api.post<HardDeleteResponse>(`/penjualan/penawaran/${cancelTarget}/cancel`, {
          reason: reason || undefined
        });
        toast.success(res.message || 'Penawaran dihapus permanen');
        setCancelTarget(null);
        fetchData();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Gagal menghapus penawaran');
      } finally {
        setCancelSubmitting(false);
      }
    },
    [cancelTarget, fetchData]
  );

  // ── Buat SO: konversi penawaran DRAFT → Pesanan Penjualan ──
  const [soTarget, setSoTarget] = useState<PenawaranResponse | null>(null);
  const [soSubmitting, setSoSubmitting] = useState(false);

  const handleToSalesOrder = useCallback(async () => {
    if (!soTarget) return;
    setSoSubmitting(true);
    try {
      const res = await api.post<{ salesOrderId: string; noPesanan: string }>(`/penjualan/penawaran/${soTarget.id}/to-sales-order`);
      toast.success(`Pesanan Penjualan ${res.noPesanan} berhasil dibuat`);
      setSoTarget(null);
      fetchData();
      // SO baru muncul di tab list Pesanan — refresh juga list tersebut.
      refreshListTab('sales', 'pesanan');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Gagal membuat pesanan penjualan');
    } finally {
      setSoSubmitting(false);
    }
  }, [soTarget, fetchData, refreshListTab]);

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card className="border-emerald-200 bg-emerald-50/50">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-emerald-600 font-medium">Total Penawaran</p>
            {loading ? <Skeleton className="mt-1 h-6 w-16" /> : <p className="text-2xl font-bold text-emerald-700">{total}</p>}
          </div>
        </CardContent>
      </Card>

      {/* List Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Daftar Penawaran</CardTitle>
              <CardDescription>Daftar seluruh penawaran (quotation) yang telah dibuat</CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() =>
                openFormTab({
                  title: 'Buat Penawaran',
                  module: 'sales',
                  subPage: 'penawaran',
                  formKey: 'penawaran-create'
                })
              }>
              <Plus className="mr-1.5 h-4 w-4" /> Buat Penawaran
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground">Cari</Label>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Cari no penawaran/pelanggan..." value={search} onChange={(e) => handleSearchChange(e.target.value)} className="pl-8 h-9 text-sm" />
              </div>
            </div>
            <div className="w-full sm:w-36">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  setSkip(0);
                }}>
                <SelectTrigger className="mt-1 h-9 text-sm">
                  <SelectValue placeholder="Semua" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="SELESAI">Selesai</SelectItem>
                  <SelectItem value="DIBATALKAN">Dibatalkan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-40">
              <Label className="text-xs text-muted-foreground">Pelanggan</Label>
              <SearchableDropdown
                value={pelangganFilter}
                onValueChange={(v) => {
                  setPelangganFilter(v);
                  setSkip(0);
                }}
                options={pelangganOptions.map((p) => ({ id: p.id, label: p.nama }))}
                allOption={{ id: '', label: 'Semua Pelanggan' }}
                className="mt-1"
              />
            </div>
            <div className="w-full sm:w-36">
              <Label className="text-xs text-muted-foreground">Dari Tanggal</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setSkip(0);
                }}
                className="mt-1 h-9 text-sm"
              />
            </div>
            <div className="w-full sm:w-36">
              <Label className="text-xs text-muted-foreground">Sampai Tanggal</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setSkip(0);
                }}
                className="mt-1 h-9 text-sm"
              />
            </div>
          </div>

          {error && !loading && <ErrorCard message={error} onRetry={fetchData} />}

          {!error && (
            <div className="max-h-96 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[150px]">No Penawaran</TableHead>
                    <TableHead className="w-[100px]">Tanggal</TableHead>
                    <TableHead className="w-[110px]">Berlaku Hingga</TableHead>
                    <TableHead>Pelanggan</TableHead>
                    <TableHead className="w-[90px] text-center">Jumlah Item</TableHead>
                    <TableHead className="w-[130px] text-right">Total</TableHead>
                    <TableHead className="w-[100px] text-center">Status</TableHead>
                    <TableHead className="w-[210px] text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <SkeletonRows cols={8} />
                  ) : data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                        Tidak ada data penawaran.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-xs font-medium">{d.noPenawaran}</TableCell>
                        <TableCell className="text-xs">{formatDate(d.tanggal)}</TableCell>
                        <TableCell className="text-xs">{d.berlakuHingga ? formatDate(d.berlakuHingga) : '-'}</TableCell>
                        <TableCell className="text-xs">{d.pelanggan?.nama || '-'}</TableCell>
                        <TableCell className="text-center text-xs">{(d.details || []).length}</TableCell>
                        <TableCell className="text-right font-mono text-xs font-medium">{formatRp(Number(d.grandTotal) || 0)}</TableCell>
                        <TableCell className="text-center">
                          <PenawaranStatusBadge status={d.status} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            {d.status === 'DRAFT' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                onClick={() =>
                                  openFormTab({
                                    title: `Edit ${d.noPenawaran}`,
                                    module: 'sales',
                                    subPage: 'penawaran',
                                    formKey: 'penawaran-edit',
                                    formProps: { id: d.id, noPenawaran: d.noPenawaran, status: d.status, grandTotal: Number(d.grandTotal) }
                                  })
                                }
                                title="Edit">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                openFormTab({
                                  title: `Cetak ${d.noPenawaran}`,
                                  module: 'sales',
                                  subPage: 'penawaran',
                                  formKey: 'penawaran-cetak',
                                  formProps: { id: d.id }
                                })
                              }
                              title="Cetak">
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                            {d.status === 'DRAFT' && (
                              <>
                                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setSoTarget(d)} title="Konversi ke Pesanan Penjualan">
                                  Buat SO
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => setCancelTarget(d.id)}>
                                  Hapus
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {!error && <Pagination skip={skip} total={total} onPrev={() => setSkip((p) => Math.max(0, p - PAGE_SIZE))} onNext={() => setSkip((p) => p + PAGE_SIZE)} />}
        </CardContent>
      </Card>

      {/* Hapus = Hard Delete */}
      <HardDeleteCancelDialog
        open={!!cancelTarget}
        onOpenChange={(o) => {
          if (!o) setCancelTarget(null);
        }}
        title="Hapus Penawaran?"
        formLabel="penawaran"
        submitting={cancelSubmitting}
        onConfirm={(r) => handleCancel(r)}
      />

      {/* Konfirmasi Buat SO */}
      <AlertDialog
        open={!!soTarget}
        onOpenChange={(o) => {
          if (!o) setSoTarget(null);
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Buat Pesanan Penjualan?</AlertDialogTitle>
            <AlertDialogDescription>
              Penawaran <span className="font-mono font-semibold text-foreground">{soTarget?.noPenawaran}</span> akan dikonversi menjadi Pesanan Penjualan baru. Setelah dikonversi, status penawaran berubah menjadi <strong>Selesai</strong> dan tidak dapat dikonversi ulang.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={soSubmitting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // jangan tutup otomatis — handler menutup setelah sukses
                void handleToSalesOrder();
              }}
              disabled={soSubmitting}>
              {soSubmitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Ya, Buat Pesanan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FORM: Penawaran Create / Edit (shared)
// ═════════════════════════════════════════════════════════════════════════════

export function PenawaranCreateForm({ editId, subPage = 'penawaran' }: { editId?: string; subPage?: string }) {
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [fPelangganId, setFPelangganId] = useState('');
  const [fTanggal, setFTanggal] = useState(todayStr());
  const [fBerlakuHingga, setFBerlakuHingga] = useState('');
  const [fSyaratBayarId, setFSyaratBayarId] = useState('');
  const [fAlamatPengiriman, setFAlamatPengiriman] = useState('');
  const [fKeterangan, setFKeterangan] = useState('');
  const [fDiskonGlobal, setFDiskonGlobal] = useState('0');
  const [fPpn, setFPpn] = useState('11');
  const [fDetail, setFDetail] = useState<PenawaranFormRow[]>([newFormRow()]);
  const [fBiayaTambahan, setFBiayaTambahan] = useState<PenawaranBiayaRow[]>([]);

  // ── Update #4: pilih pelanggan → alamat & syarat bayar ditarik otomatis
  // dari master (tidak perlu input manual lagi; tetap bisa disunting). ──
  const handlePelangganChange = (id: string) => {
    setFPelangganId(id);
    const master = findPartyMaster(pelangganOptions, id);
    setFAlamatPengiriman(master?.alamat || '');
    if (master?.syaratBayarId) setFSyaratBayarId(master.syaratBayarId);
  };

  // ── Dropdown + (edit) data penawaran ──
  const [pelangganOptions, setPelangganOptions] = useState<PelangganDropdown[]>([]);
  const [syaratBayarOptions, setSyaratBayarOptions] = useState<SyaratBayarResponse[]>([]);
  const [barangOptions, setBarangOptions] = useState<BarangDropdown[]>([]);
  const [satuanOptions, setSatuanOptions] = useState<SatuanResponse[]>([]);
  const [ddLoading, setDdLoading] = useState(true);
  const [editLoading, setEditLoading] = useState(!!editId);
  const [editNoPenawaran, setEditNoPenawaran] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editGrandTotal, setEditGrandTotal] = useState(0);
  // Nama referensi historis (pelanggan/syarat bayar) — dipertahankan sebagai label
  // bila data sudah tidak ada di dropdown aktif (mirror includeCurrent order-form).
  const [editPelangganNama, setEditPelangganNama] = useState('');
  const [editSyaratNama, setEditSyaratNama] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setDdLoading(true);
      try {
        const [pelanggan, syaratBayar, barang, satuan] = await Promise.all([api.get<PelangganDropdown[]>('/master/pelanggan-dropdown'), api.get<SyaratBayarResponse[]>('/master/syarat-bayar'), api.get<BarangDropdown[]>('/master/barang-dropdown'), api.get<SatuanResponse[]>('/master/satuan')]);
        if (cancelled) return;
        setPelangganOptions(pelanggan);
        setSyaratBayarOptions(syaratBayar);
        setBarangOptions(barang);
        setSatuanOptions(satuan);
      } catch {
        // Silently fail — dropdowns will be empty
      } finally {
        if (!cancelled) setDdLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Edit mode: muat & prefill dokumen ──
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    async function load() {
      setEditLoading(true);
      try {
        const p = await api.get<PenawaranResponse>(`/penjualan/penawaran/${editId}`);
        if (cancelled) return;
        setEditNoPenawaran(p.noPenawaran);
        setEditStatus(p.status);
        setEditGrandTotal(Number(p.grandTotal) || 0);
        setEditPelangganNama(p.pelanggan?.nama || '');
        setEditSyaratNama(p.syaratBayar?.nama || '');
        setFPelangganId(p.pelangganId || '');
        setFTanggal(p.tanggal ? p.tanggal.slice(0, 10) : '');
        setFBerlakuHingga(p.berlakuHingga ? p.berlakuHingga.slice(0, 10) : '');
        setFSyaratBayarId(p.syaratBayarId || '');
        setFAlamatPengiriman(p.alamatPengiriman || '');
        setFKeterangan(p.keterangan || '');
        setFDiskonGlobal(String(Number(p.diskonGlobal) || 0));
        setFPpn(String(Number(p.ppn) || 0));
        setFDetail(
          (p.details || []).map((r) => ({
            id: crypto.randomUUID(),
            barangId: r.barangId,
            kodeBarang: r.barang?.kode || '',
            barangNama: r.barang?.nama || '',
            satuanId: r.satuanId || '',
            satuanNama: r.satuan?.nama || '',
            harga: String(Number(r.harga) || 0),
            qty: String(Number(r.qty) || 0),
            diskon: String(Number(r.diskon) || 0)
          }))
        );
        setFBiayaTambahan(
          (p.biayaTambahan || []).map((b) => ({
            id: crypto.randomUUID(),
            nama: b.nama || '',
            jumlah: String(Number(b.jumlah) || 0)
          }))
        );
      } catch (e) {
        toast.error(e instanceof ApiError ? e.detail : 'Gagal memuat data penawaran');
      } finally {
        if (!cancelled) setEditLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [editId]);

  const formSubtotal = useMemo(
    () =>
      fDetail.reduce((s, r) => {
        const q = parseFloat(r.qty) || 0;
        const h = parseFloat(r.harga) || 0;
        const d = parseFloat(r.diskon) || 0;
        return s + q * h * (1 - d / 100);
      }, 0),
    [fDetail]
  );

  const formTotalBiaya = useMemo(() => fBiayaTambahan.reduce((s, b) => s + (parseFloat(b.jumlah) || 0), 0), [fBiayaTambahan]);

  // Pertahankan barang/satuan historis dari dokumen yang diedit agar dropdown
  // tetap menampilkan labelnya (mirror includeCurrent di order-document-form).
  const effectiveBarangOptions = useMemo(() => {
    const opts = [...barangOptions];
    for (const r of fDetail) {
      if (r.barangId && r.barangNama && !opts.some((b) => b.id === r.barangId)) {
        opts.push({ id: r.barangId, kode: r.kodeBarang, nama: r.barangNama, hargaPokok: 0, hargaJual: 0, stok: 0 });
      }
    }
    return opts;
  }, [barangOptions, fDetail]);

  const effectiveSatuanOptions = useMemo(() => {
    const opts = [...satuanOptions];
    for (const r of fDetail) {
      if (r.satuanId && r.satuanNama && !opts.some((s) => s.id === r.satuanId)) {
        opts.push({ id: r.satuanId, nama: r.satuanNama, status: 'AKTIF' });
      }
    }
    return opts;
  }, [satuanOptions, fDetail]);

  const readOnly = !!editId && editStatus !== 'DRAFT';

  const handleSubmit = useCallback(async () => {
    const errs: Record<string, string> = {};
    if (!fPelangganId) errs.pelangganId = 'Pelanggan wajib diisi';
    if (!fTanggal) errs.tanggal = 'Tanggal wajib diisi';
    if (!fDetail.some((r) => r.barangId && (parseFloat(r.qty) || 0) > 0)) errs.detail = 'Minimal 1 baris dengan barang dan qty > 0';
    if (Object.keys(errs).length) {
      setFormErrors(errs);
      return;
    }
    setSubmitting(true);
    try {
      const details: PenawaranDetailCreate[] = fDetail
        .filter((r) => r.barangId)
        .map((r) => {
          const qty = parseFloat(r.qty) || 0;
          const harga = parseFloat(r.harga) || 0;
          const diskon = parseFloat(r.diskon) || 0;
          return { barangId: r.barangId, satuanId: r.satuanId || null, qty, harga, diskon, subTotal: qty * harga * (1 - diskon / 100) };
        });
      const biaya: TransaksiBiayaCreate[] = fBiayaTambahan.filter((b) => b.nama).map((b) => ({ nama: b.nama, jumlah: parseFloat(b.jumlah) || 0 }));
      const body: PenawaranCreate = {
        pelangganId: fPelangganId,
        tanggal: fTanggal,
        berlakuHingga: fBerlakuHingga || null,
        syaratBayarId: fSyaratBayarId || null,
        alamatPengiriman: fAlamatPengiriman || null,
        keterangan: fKeterangan || null,
        mataUang: 'IDR',
        diskonGlobal: parseFloat(fDiskonGlobal) || 0,
        ppn: parseFloat(fPpn) || 0,
        details,
        biayaTambahan: biaya.length > 0 ? biaya : undefined
      };
      if (editId) {
        await api.put<PenawaranResponse>(`/penjualan/penawaran/${editId}`, body);
        toast.success('Penawaran berhasil diperbarui');
      } else {
        await api.post<PenawaranResponse>('/penjualan/penawaran', body);
        toast.success('Penawaran berhasil dibuat');
      }
      refreshListTab('sales', subPage);
      if (activeTabId) closeTab(activeTabId);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Gagal menyimpan penawaran');
    } finally {
      setSubmitting(false);
    }
  }, [editId, fPelangganId, fTanggal, fBerlakuHingga, fSyaratBayarId, fAlamatPengiriman, fKeterangan, fDiskonGlobal, fPpn, fDetail, fBiayaTambahan, subPage, activeTabId, closeTab, refreshListTab]);

  const loading = ddLoading || editLoading;

  if (loading) {
    return (
      <FormTabShell title={editId ? 'Edit Penawaran' : 'Buat Penawaran'}>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </FormTabShell>
    );
  }

  return (
    <FormTabShell title={editId ? 'Edit Penawaran' : 'Buat Penawaran'}>
      <Card className="max-w-5xl">
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">{editId ? 'Perbarui data penawaran' : 'Isi data penawaran (quotation) baru'}</p>

          {editId && (
            <div className="flex flex-wrap items-center gap-4 rounded-md border bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5" />
                <span>No Penawaran:</span>
                <span className="font-mono font-semibold text-foreground">{editNoPenawaran}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Status:</span>
                <PenawaranStatusBadge status={editStatus} />
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Grand Total:</span>
                <span className="font-mono font-semibold text-foreground">{formatRp(editGrandTotal)}</span>
              </div>
            </div>
          )}

          {readOnly && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Penawaran berstatus {editStatus || '-'}. Hanya penawaran DRAFT yang dapat diubah; form ini menjadi baca saja.</p>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Pelanggan <span className="text-destructive">*</span>
              </Label>
              <SearchableDropdown
                value={fPelangganId}
                onValueChange={handlePelangganChange}
                options={includeCurrent(
                  pelangganOptions.map((p) => ({ id: p.id, label: p.nama })),
                  fPelangganId,
                  editPelangganNama
                )}
                placeholder="Pilih pelanggan..."
                disabled={readOnly}
              />
              {formErrors.pelangganId && <p className="text-xs text-destructive mt-1">{formErrors.pelangganId}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Tanggal <span className="text-destructive">*</span>
              </Label>
              <Input type="date" className="h-9 text-xs" value={fTanggal} onChange={(e) => setFTanggal(e.target.value)} disabled={readOnly} />
              {formErrors.tanggal && <p className="text-xs text-destructive mt-1">{formErrors.tanggal}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Berlaku Hingga</Label>
              <Input type="date" className="h-9 text-xs" value={fBerlakuHingga} onChange={(e) => setFBerlakuHingga(e.target.value)} disabled={readOnly} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Syarat Bayar</Label>
              <SearchableDropdown
                value={fSyaratBayarId}
                onValueChange={setFSyaratBayarId}
                options={includeCurrent(
                  syaratBayarOptions.map((s) => ({ id: s.id, label: s.nama, subtitle: s.hari ? s.hari + ' hari' : undefined })),
                  fSyaratBayarId,
                  editSyaratNama
                )}
                allOption={{ id: '', label: 'Tidak dipilih' }}
                placeholder="Pilih..."
                disabled={readOnly}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Alamat Pengiriman</Label>
            {/* Update #4: auto-fill dari master Pelanggan saat dipilih */}
            <Textarea className="text-xs min-h-[48px]" value={fAlamatPengiriman} onChange={(e) => setFAlamatPengiriman(e.target.value)} disabled={readOnly} />
            <p className="text-[11px] text-muted-foreground">{AUTOFILL_HINT.pelanggan}</p>
          </div>

          <Separator />
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              Detail Barang <span className="text-destructive">*</span>
            </Label>
            <PenawaranDetailTable rows={fDetail} setRows={setFDetail} barangOptions={effectiveBarangOptions} satuanOptions={effectiveSatuanOptions} />
            {formErrors.detail && <p className="text-xs text-destructive mt-1">{formErrors.detail}</p>}
          </div>
          <Separator />
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Biaya Tambahan</Label>
            <PenawaranBiayaTable rows={fBiayaTambahan} setRows={setFBiayaTambahan} />
          </div>
          <Separator />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Diskon Global %</Label>
              <Input type="number" className="h-9 text-xs" value={fDiskonGlobal} min={0} max={100} onChange={(e) => setFDiskonGlobal(e.target.value)} disabled={readOnly} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">PPN (%)</Label>
              <Input type="number" className="h-9 text-xs" value={fPpn} min={0} max={100} onChange={(e) => setFPpn(e.target.value)} disabled={readOnly} />
            </div>
          </div>
          <TotalsBreakdown subtotal={formSubtotal} diskonGlobalPct={parseFloat(fDiskonGlobal) || 0} ppnPct={parseFloat(fPpn) || 0} totalBiayaTambahan={formTotalBiaya} />
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Keterangan</Label>
            <Textarea className="text-xs min-h-[60px]" value={fKeterangan} onChange={(e) => setFKeterangan(e.target.value)} placeholder="Catatan tambahan..." disabled={readOnly} />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting}>
              Batal
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting || readOnly}>
              {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileText className="mr-1.5 h-4 w-4" />}
              {submitting ? 'Menyimpan...' : editId ? 'Simpan Perubahan' : 'Simpan Penawaran'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </FormTabShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CETAK: PenawaranCetakTab (mirror PesananCetakTab)
// ═════════════════════════════════════════════════════════════════════════════

function mapPenawaranData(d: PenawaranResponse): PenawaranData {
  return {
    nomor: d.noPenawaran || '',
    tanggal: d.tanggal || '',
    berlakuHingga: d.berlakuHingga || '',
    kepada: d.pelanggan?.nama || '',
    alamatPenerima: d.alamatPengiriman || '',
    syaratPembayaran: d.syaratBayar?.nama || '',
    keterangan: d.keterangan || '',
    detail: (d.details || []).map<DetailRow>((r) => ({
      id: r.id,
      barang: r.barang?.nama || '',
      harga: Number(r.harga) || 0,
      qty: Number(r.qty) || 0,
      diskon: Number(r.diskon) || 0,
      satuan: r.satuan?.nama || ''
    })),
    biayaTambahan: (d.biayaTambahan || []).map<BiayaTambahan>((b) => ({
      id: b.id,
      nama: b.nama || '',
      jumlah: Number(b.jumlah) || 0
    })),
    diskonGlobal: Number(d.diskonGlobal) || 0,
    ppn: Number(d.ppn) || 0
  };
}

export function PenawaranCetakTab({ id }: { id: string }) {
  const [data, setData] = useState<PenawaranData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const elementId = `pdf-penawaran-${id}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<PenawaranResponse>(`/penjualan/penawaran/${id}`);
      setData(mapPenawaranData(res));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : e instanceof Error ? e.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDownload = useCallback(async () => {
    if (!data) return;
    setDownloading(true);
    try {
      // Update ASAHI: nomor pola baru "PEN ASI/2026/001" → sanitasi nama file.
      await generatePDF(elementId, `Penawaran-${fileSafeNo(data.nomor || id)}.pdf`);
    } finally {
      setDownloading(false);
    }
  }, [data, elementId, id]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <FormTabShell title={`Cetak Penawaran${data ? ` — ${data.nomor}` : ''}`}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={loading || !!error}>
            <Printer className="mr-1.5 h-4 w-4" /> Cetak
          </Button>
          <Button size="sm" onClick={handleDownload} disabled={loading || !!error || downloading}>
            <Download className="mr-1.5 h-4 w-4" /> {downloading ? 'Memproses…' : 'Download PDF'}
          </Button>
        </div>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-[600px] w-full" />
          </div>
        ) : error ? (
          <ErrorCard message={error} onRetry={fetchData} />
        ) : (
          data && (
            <div className="overflow-x-auto border rounded-md bg-white">
              <div id={elementId} className="inline-block">
                <PenawaranPDFTemplate data={data} />
              </div>
            </div>
          )
        )}
      </div>
    </FormTabShell>
  );
}
