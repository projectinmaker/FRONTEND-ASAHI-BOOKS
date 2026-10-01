'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, Search, RefreshCw, Scale, Layers, ChevronDown, ChevronLeft, ChevronRight, AlertCircle, Loader2, Info, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { formatRp as formatRpIDR } from '@/lib/money';
import type { StokKartuEntryResponse, StokKartuSummaryResponse, MetodeValuasiOption, BarangDropdown, GudangResponse, StokRekonsiliasiResponse } from '@/types/api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { downloadExcelFile } from '@/lib/excel';
import { exportDateStamp } from '@/components/erp/excel-import-dialog';

// ─── Helpers ──────────────────────────────────────────────────────────────

const formatRp = (val: number | null | undefined) => (val == null ? '-' : formatRpIDR(val));

const formatDate = (d: string | null) => {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return d;
  }
};

const formatDateTime = (d: string | null) => {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return d;
  }
};

const PAGE_SIZE = 25;

const TIPE_COLORS: Record<string, string> = {
  PEMBELIAN: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  PENJUALAN: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
  PENYESUAIAN_MASUK: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  PENYESUAIAN_KELUAR: 'bg-orange-100 text-orange-800 hover:bg-orange-100',
  PEMINDAHAN_MASUK: 'bg-purple-100 text-purple-800 hover:bg-purple-100',
  PEMINDAHAN_KELUAR: 'bg-pink-100 text-pink-800 hover:bg-pink-100',
  RETUR_PEMBELIAN: 'bg-cyan-100 text-cyan-800 hover:bg-cyan-100',
  RETUR_PENJUALAN: 'bg-rose-100 text-rose-800 hover:bg-rose-100',
  SALDO_AWAL: 'bg-gray-100 text-gray-700 hover:bg-gray-100'
};

const getTipeBadgeClass = (tipe: string) => TIPE_COLORS[tipe] || 'bg-secondary text-secondary-foreground hover:bg-secondary';

const VALUASI_LABELS: Record<string, string> = {
  AVERAGE: 'Rata-rata Bergerak',
  FIFO: 'First In First Out',
  FEFO: 'First Expired First Out'
};

// ═════════════════════════════════════════════════════════════════════════════
// Component
// ═════════════════════════════════════════════════════════════════════════════

export default function StokKartuTab() {
  // ── Dropdown data ──
  const [barangOptions, setBarangOptions] = useState<BarangDropdown[]>([]);
  const [gudangOptions, setGudangOptions] = useState<GudangResponse[]>([]);
  const [valuasiOptions, setValuasiOptions] = useState<MetodeValuasiOption[]>([]);
  const [dropdownsLoading, setDropdownsLoading] = useState(true);

  // ── Filters ──
  const [selectedBarang, setSelectedBarang] = useState<BarangDropdown | null>(null);
  const [selectedGudang, setSelectedGudang] = useState<string>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ── Data ──
  const [entries, setEntries] = useState<StokKartuEntryResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [summary, setSummary] = useState<StokKartuSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Layers ──
  const [layersOpen, setLayersOpen] = useState(false);

  // ── Rekonsiliasi ──
  const [rekonDialogOpen, setRekonDialogOpen] = useState(false);
  const [rekonLoading, setRekonLoading] = useState(false);
  const [rekonData, setRekonData] = useState<StokRekonsiliasiResponse | null>(null);

  // ── Update #5: Export stok per gudang ──
  const [exportingStok, setExportingStok] = useState(false);

  // ── Fetch dropdowns ──
  useEffect(() => {
    const fetchDropdowns = async () => {
      try {
        const [barangRes, gudangRes, valuasiRes] = await Promise.all([api.get<BarangDropdown[]>('/master/barang-dropdown'), api.get<GudangResponse[]>('/master/gudang'), api.get<MetodeValuasiOption[]>('/stok-kartu/valuasi-options')]);
        setBarangOptions(barangRes || []);
        setGudangOptions(gudangRes || []);
        setValuasiOptions(valuasiRes || []);
      } catch {
        // Non-critical — user can still use the page
      } finally {
        setDropdownsLoading(false);
      }
    };
    fetchDropdowns();
  }, []);

  // ── Fetch stok kartu entries ──
  const fetchEntries = useCallback(async () => {
    if (!selectedBarang) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('barang_id', selectedBarang.id);
      if (selectedGudang) params.set('gudang_id', selectedGudang);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      params.set('skip', String(skip));
      params.set('limit', String(PAGE_SIZE));

      const res = await api.get<{ data: StokKartuEntryResponse[]; total: number }>(`/stok-kartu/?${params.toString()}`);
      setEntries(res.data);
      setTotal(res.total);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal memuat kartu stok.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [selectedBarang, selectedGudang, dateFrom, dateTo, skip]);

  // ── Fetch summary ──
  const fetchSummary = useCallback(async () => {
    if (!selectedBarang) return;
    setSummaryLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('barang_id', selectedBarang.id);
      if (selectedGudang) params.set('gudang_id', selectedGudang);

      const res = await api.get<StokKartuSummaryResponse>(`/stok-kartu/summary?${params.toString()}`);
      setSummary(res);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [selectedBarang, selectedGudang]);

  // ── Handle search ──
  const handleSearch = () => {
    if (!selectedBarang) {
      toast.error('Pilih barang terlebih dahulu.');
      return;
    }
    setSkip(0);
    fetchEntries();
    fetchSummary();
  };

  // ── Update #5: Export stok per barang+gudang ──
  const handleExportStok = async () => {
    setExportingStok(true);
    try {
      const endpoint = `/persediaan/stok/export${selectedGudang ? `?gudang_id=${encodeURIComponent(selectedGudang)}` : ''}`;
      await downloadExcelFile(endpoint, `stok-${exportDateStamp()}.xlsx`);
      toast.success('Data stok berhasil diunduh');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengekspor data stok');
    } finally {
      setExportingStok(false);
    }
  };

  // ── Handle rekonsiliasi ──
  const handleRekonsiliasi = async () => {
    if (!selectedBarang) return;
    setRekonLoading(true);
    setRekonDialogOpen(true);
    setRekonData(null);
    try {
      const res = await api.get<StokRekonsiliasiResponse>(`/stok-kartu/rekonsiliasi?barang_id=${encodeURIComponent(selectedBarang.id)}`);
      setRekonData(res);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal memuat rekonsiliasi stok.';
      toast.error(msg);
      setRekonDialogOpen(false);
    } finally {
      setRekonLoading(false);
    }
  };

  // Auto-fetch when skip changes
  useEffect(() => {
    if (selectedBarang) fetchEntries();
  }, [fetchEntries]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Filter Bar ── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-64 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Barang</Label>
              {dropdownsLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <SearchableDropdown
                  options={barangOptions.map((b) => ({
                    id: b.id,
                    label: `${b.kode} — ${b.nama}`
                  }))}
                  value={selectedBarang?.id || ''}
                  onValueChange={(val) => {
                    const found = barangOptions.find((b) => b.id === val);
                    setSelectedBarang(found || null);
                    setSummary(null);
                    setEntries([]);
                    setTotal(0);
                  }}
                  placeholder="Cari barang..."
                />
              )}
            </div>

            <div className="w-full sm:w-48 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Gudang (opsional)</Label>
              {dropdownsLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select value={selectedGudang} onValueChange={(v) => setSelectedGudang(v === '__all__' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Semua Gudang" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Semua Gudang</SelectItem>
                    {gudangOptions.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.kode} — {g.nama}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="w-full sm:w-40 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Dari Tanggal</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>

            <div className="w-full sm:w-40 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Sampai Tanggal</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>

            <Button onClick={handleSearch} disabled={!selectedBarang} className="gap-2">
              <Search className="h-4 w-4" />
              Lihat Kartu Stok
            </Button>

            {/* Update #5: Export stok per barang + gudang */}
            <Button variant="outline" onClick={handleExportStok} disabled={exportingStok} className="gap-2">
              {exportingStok ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              Export Stok
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── No barang selected ── */}
      {!selectedBarang && !loading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Package className="h-16 w-16 text-muted-foreground/20 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground">Pilih Barang</h3>
          <p className="text-sm text-muted-foreground/70 mt-1">Pilih barang di atas untuk melihat kartu stok dan metode valuasi</p>
        </div>
      )}

      {/* ── Summary Card ── */}
      {selectedBarang && (summaryLoading || summary) && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">
                  {summary?.barangKode || ''} — {summary?.barangNama || selectedBarang.nama}
                </CardTitle>
              </div>
              {summary && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="gap-1">
                    <Info className="h-3 w-3" />
                    {VALUASI_LABELS[summary.metodeValuasi] || summary.metodeValuasi}
                  </Badge>
                  <Button variant="outline" size="sm" className="gap-1" onClick={handleRekonsiliasi}>
                    <Scale className="h-3.5 w-3.5" />
                    Rekonsiliasi
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          {summaryLoading ? (
            <CardContent className="p-4">
              <div className="grid grid-cols-3 gap-4">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            </CardContent>
          ) : summary ? (
            <CardContent className="p-4 pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Stok Saat Ini</p>
                  <p className="text-2xl font-bold mt-1">{summary.stokQty.toLocaleString('id-ID')}</p>
                  <p className="text-xs text-muted-foreground">unit</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Harga Beli</p>
                  <p className="text-2xl font-bold mt-1">{formatRp(summary.hargaPokok)}</p>
                  <p className="text-xs text-muted-foreground">per unit</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Total Nilai Stok</p>
                  <p className="text-2xl font-bold mt-1">{formatRp(summary.totalNilai)}</p>
                </div>
              </div>

              {/* ── Layers (FIFO/FEFO only) ── */}
              {(summary.metodeValuasi === 'FIFO' || summary.metodeValuasi === 'FEFO') && summary.layers.length > 0 && (
                <Collapsible open={layersOpen} onOpenChange={setLayersOpen} className="mt-4">
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2 w-full justify-start">
                      <Layers className="h-4 w-4" />
                      Detail Layer ({summary.metodeValuasi})
                      <Badge variant="secondary" className="ml-1">
                        {summary.layers.length} layer
                      </Badge>
                      <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${layersOpen ? 'rotate-180' : ''}`} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tgl Masuk</TableHead>
                            <TableHead>Ref</TableHead>
                            <TableHead className="text-right">Harga Satuan</TableHead>
                            <TableHead className="text-right">Qty Sisa</TableHead>
                            <TableHead className="text-right">Total Nilai</TableHead>
                            <TableHead className="hidden md:table-cell">Kedaluwarsa</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {summary.layers.map((layer) => (
                            <TableRow key={layer.id}>
                              <TableCell className="text-xs">{formatDateTime(layer.tanggalMasuk)}</TableCell>
                              <TableCell className="text-xs font-mono">{layer.refNo || '-'}</TableCell>
                              <TableCell className="text-right text-xs">{formatRp(layer.hargaSatuan)}</TableCell>
                              <TableCell className="text-right text-xs">{layer.qtySisa.toLocaleString('id-ID')}</TableCell>
                              <TableCell className="text-right text-xs font-medium">{formatRp(layer.totalNilai)}</TableCell>
                              <TableCell className="hidden md:table-cell text-xs">{layer.tanggalKedaluwarsa ? formatDate(layer.tanggalKedaluwarsa) : <span className="text-muted-foreground">-</span>}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </CardContent>
          ) : null}
        </Card>
      )}

      {/* ── Valuasi Options Reference ── */}
      {valuasiOptions.length > 0 && !selectedBarang && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Info className="h-4 w-4" />
              Metode Valuasi Stok
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="flex flex-wrap gap-2">
              {valuasiOptions.map((opt) => (
                <Badge key={opt.value} variant="outline" className="text-xs">
                  {opt.value}: {opt.label}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Error ── */}
      {error && !loading && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <p className="text-sm text-destructive flex-1">{error}</p>
            <Button variant="outline" size="sm" onClick={handleSearch}>
              Coba Lagi
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {/* ── Stok Kartu Table ── */}
      {!loading && !error && entries.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="max-h-[65vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="w-10">No</TableHead>
                    <TableHead className="w-28">Tanggal</TableHead>
                    <TableHead className="w-28">Tipe</TableHead>
                    <TableHead className="hidden md:table-cell">Ref</TableHead>
                    <TableHead>Keterangan</TableHead>
                    <TableHead className="text-right">Masuk Qty</TableHead>
                    <TableHead className="text-right hidden lg:table-cell">Masuk Harga</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Masuk Total</TableHead>
                    <TableHead className="text-right">Keluar Qty</TableHead>
                    <TableHead className="text-right hidden lg:table-cell">Keluar Harga</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Keluar Total</TableHead>
                    <TableHead className="text-right">Saldo Qty</TableHead>
                    <TableHead className="text-right hidden lg:table-cell">Saldo Harga</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Saldo Total</TableHead>
                    <TableHead className="hidden xl:table-cell">Gudang</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry, idx) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-xs text-muted-foreground">{skip + idx + 1}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{formatDate(entry.tanggal)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${getTipeBadgeClass(entry.tipe)}`}>
                          {entry.tipe.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell font-mono text-xs">{entry.refNo || '-'}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{entry.keterangan || '-'}</TableCell>
                      {/* MASUK */}
                      <TableCell className={`text-right text-xs ${entry.masukQty > 0 ? 'font-medium text-emerald-600' : 'text-muted-foreground'}`}>{entry.masukQty > 0 ? entry.masukQty.toLocaleString('id-ID') : '-'}</TableCell>
                      <TableCell className={`text-right text-xs hidden lg:table-cell ${entry.masukQty > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>{entry.masukQty > 0 ? formatRp(entry.masukHarga) : '-'}</TableCell>
                      <TableCell className={`text-right text-xs hidden md:table-cell ${entry.masukQty > 0 ? 'font-medium text-emerald-600' : 'text-muted-foreground'}`}>{entry.masukQty > 0 ? formatRp(entry.masukTotal) : '-'}</TableCell>
                      {/* KELUAR */}
                      <TableCell className={`text-right text-xs ${entry.keluarQty > 0 ? 'font-medium text-red-500' : 'text-muted-foreground'}`}>{entry.keluarQty > 0 ? entry.keluarQty.toLocaleString('id-ID') : '-'}</TableCell>
                      <TableCell className={`text-right text-xs hidden lg:table-cell ${entry.keluarQty > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>{entry.keluarQty > 0 ? formatRp(entry.keluarHarga) : '-'}</TableCell>
                      <TableCell className={`text-right text-xs hidden md:table-cell ${entry.keluarQty > 0 ? 'font-medium text-red-500' : 'text-muted-foreground'}`}>{entry.keluarQty > 0 ? formatRp(entry.keluarTotal) : '-'}</TableCell>
                      {/* SALDO */}
                      <TableCell className="text-right text-xs font-medium">{entry.saldoQty.toLocaleString('id-ID')}</TableCell>
                      <TableCell className="text-right text-xs hidden lg:table-cell">{formatRp(entry.saldoHarga)}</TableCell>
                      <TableCell className="text-right text-xs font-medium hidden md:table-cell">{formatRp(entry.saldoTotal)}</TableCell>
                      <TableCell className="hidden xl:table-cell text-xs">{entry.gudang ? `${entry.gudang.kode}` : '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {(skip + 1).toLocaleString()}–{Math.min(skip + PAGE_SIZE, total).toLocaleString()} dari {total.toLocaleString()}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" disabled={skip === 0} onClick={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs px-2">
                  {Math.floor(skip / PAGE_SIZE) + 1} / {totalPages}
                </span>
                <Button variant="outline" size="sm" disabled={skip + PAGE_SIZE >= total} onClick={() => setSkip((s) => s + PAGE_SIZE)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── Empty entries after search ── */}
      {!loading && !error && selectedBarang && entries.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="h-12 w-12 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">Tidak ada riwayat mutasi stok untuk barang ini.</p>
          </CardContent>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Dialog: Rekonsiliasi Stok
         ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={rekonDialogOpen} onOpenChange={setRekonDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5" />
              Rekonsiliasi Stok
            </DialogTitle>
            <DialogDescription>
              Perbandingan stok master, stok per gudang, dan layer valuasi untuk:{' '}
              <strong>
                {selectedBarang?.kode} — {selectedBarang?.nama}
              </strong>
            </DialogDescription>
          </DialogHeader>

          {rekonLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rekonData ? (
            <div className="space-y-4">
              {rekonData.perluInisialisasi && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <p className="text-xs">Saldo historis gudang belum diinisialisasi untuk barang ini. Disarankan menjalankan proses inisialisasi saldo awal gudang.</p>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Stok Master</p>
                  <p className="text-lg font-bold mt-1">{rekonData.stokMaster.toLocaleString('id-ID')}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Stok Gudang</p>
                  <p className="text-lg font-bold mt-1">{rekonData.stokGudang.toLocaleString('id-ID')}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Selisih Qty</p>
                  <p className={`text-lg font-bold mt-1 ${rekonData.selisihQty === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {rekonData.selisihQty > 0 ? '+' : ''}
                    {rekonData.selisihQty.toLocaleString('id-ID')}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Nilai Gudang</p>
                  <p className="text-lg font-bold mt-1">{formatRp(rekonData.nilaiGudang)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Layer Qty</p>
                  <p className="text-lg font-bold mt-1">{rekonData.layerQty.toLocaleString('id-ID')}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Layer Nilai</p>
                  <p className="text-lg font-bold mt-1">{formatRp(rekonData.layerNilai)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Layer Tanpa Expiry</p>
                  <p className={`text-lg font-bold mt-1 ${rekonData.layerTanpaExpiry > 0 ? 'text-amber-600' : ''}`}>{rekonData.layerTanpaExpiry.toLocaleString('id-ID')}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Rincian per Lokasi/Gudang</p>
                <div className="max-h-64 overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs">Location Key</TableHead>
                        <TableHead className="text-xs">Gudang</TableHead>
                        <TableHead className="text-xs text-right">Qty</TableHead>
                        <TableHead className="text-xs text-right">Nilai</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rekonData.locations.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="h-12 text-center text-muted-foreground text-xs">
                            Belum ada data lokasi.
                          </TableCell>
                        </TableRow>
                      ) : (
                        rekonData.locations.map((loc) => (
                          <TableRow key={loc.locationKey}>
                            <TableCell className="text-xs font-mono">{loc.locationKey}</TableCell>
                            <TableCell className="text-xs">{loc.gudangId || '-'}</TableCell>
                            <TableCell className="text-xs text-right">{loc.qty.toLocaleString('id-ID')}</TableCell>
                            <TableCell className="text-xs text-right">{formatRp(loc.nilai)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">Tidak ada data rekonsiliasi tersedia.</div>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="outline" size="sm" onClick={() => setRekonDialogOpen(false)}>
              Tutup
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
