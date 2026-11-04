'use client';

/**
 * === Update #037 — DETAIL ROP (kolam belanja PIC Pembelian) ===
 * Menu baru di modul Pembelian, DI ATAS Pesanan.
 *
 * Alur (permintaan user):
 * 1. Engineering membuat ROP → status DIBUAT → seluruh item dari kumpulan
 *    ROP masuk ke daftar ini (mis. 4 ROP × 10 item = 40 baris).
 * 2. PIC Pembelian MENCENTANG item yang mau dibelanjakan — kolom supplier
 *    per item terlihat supaya tahu item mana yang bisa digelondongkan ke
 *    satu supplier.
 * 3. Setelah memilih item → pilih supplier + gudang tujuan → "Buat PO Draft".
 * 4. Sistem membuat PO berstatus DRAFT (belum final — bisa dikoreksi lagi
 *    di menu Pesanan; tidak auto-final meski dibuat Administrator).
 *
 * Qty per baris PO otomatis = KURANGKANGAN (qty diminta − stok gudang −
 * yang sudah masuk PO aktif lain) — "beli selisihnya saja". Part yang
 * belum ada di master barang dibuatkan barang otomatis saat PO disimpan.
 * Status "sudah dibelanjakan" derived dari PO aktif: PO dibatalkan/dihapus
 * → item otomatis balik "belum dibelanjakan" (bisa dibuatkan PO lagi).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { EmptyState } from '@/components/ui/empty-state';
import { ClipboardList, ShoppingCart, PackageCheck, Loader2, RefreshCw, Warehouse } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { todayStr } from '@/lib/pdf-utils';
import { useTabStore } from '@/store/tab-store';
import type { AlamatPengirimanResponse, RopItemBelanjaRow, RopItemPoDraftCreate, RopPoDraftResponse, SupplierDropdown } from '@/types/api';

// ── Normalisasi angka (backend mengirim Decimal sebagai string) ──────────────
const num = (v: string | number | null | undefined) => Number(v) || 0;
const fmtQty = (v: string | number | null | undefined) => num(v).toLocaleString('id-ID');

/** Label + warna status belanja per item. */
const STATUS_META: Record<RopItemBelanjaRow['status'], { label: string; className: string }> = {
  BELUM: { label: 'Belum dibelanjakan', className: 'border-gray-200 bg-gray-100 text-gray-700' },
  SEBAGIAN: { label: 'Sebagian', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  LENGKAP: { label: 'Sudah dibelanjakan', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  STOK_CUKUP: { label: 'Stok cukup', className: 'border-teal-200 bg-teal-50 text-teal-700' }
};

function StatusBelanjaBadge({ row }: { row: RopItemBelanjaRow }) {
  const meta = STATUS_META[row.status] ?? STATUS_META.BELUM;
  return (
    <div className="flex flex-col items-start gap-1">
      <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.className}`}>{meta.label}</span>
      {row.inDraftPo && row.draftPoNos.length > 0 && (
        <span className="inline-flex items-center whitespace-nowrap rounded-full border border-dashed px-2 py-0.5 text-[10px] font-medium text-muted-foreground" title={`Item ini sudah masuk PO draft: ${row.draftPoNos.join(', ')} (masih bisa dikoreksi/dibatalkan)`}>
          di PO draft: {row.draftPoNos.join(', ')}
        </span>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Tab utama
// ═════════════════════════════════════════════════════════════════════════════

export function DetailRopTab({ supplierOptions, refreshKey }: { supplierOptions: SupplierDropdown[]; refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  // ── List state ──
  const [rows, setRows] = useState<RopItemBelanjaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [needPurchaseOnly, setNeedPurchaseOnly] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // ── Seleksi item (hanya baris dengan sisa > 0 yang bisa dicentang) ──
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (supplierFilter) params.set('supplier_id', supplierFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (needPurchaseOnly) params.set('need_purchase', 'true');
      const res = await api.get<RopItemBelanjaRow[]>(`/pembelian/rop-item?${params}`);
      setRows(res);
      // Seleksi dibersihkan dari baris yang sudah tidak tampil / tidak layak.
      setSelected((prev) => {
        if (prev.size === 0) return prev;
        const visible = new Set(res.filter((r) => num(r.sisa) > 0).map((r) => r.id));
        const next = new Set([...prev].filter((id) => visible.has(id)));
        return next.size === prev.size ? prev : next;
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Gagal memuat data Detail ROP');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, supplierFilter, statusFilter, needPurchaseOnly]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const toggleSelect = (row: RopItemBelanjaRow) => {
    if (num(row.sisa) <= 0) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  };

  const selectableRows = useMemo(() => rows.filter((r) => num(r.sisa) > 0), [rows]);
  const allVisibleSelected = selectableRows.length > 0 && selectableRows.every((r) => selected.has(r.id));
  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        selectableRows.forEach((r) => next.delete(r.id));
        return next;
      }
      return new Set([...prev, ...selectableRows.map((r) => r.id)]);
    });
  };

  const selectedRows = useMemo(() => selectableRows.filter((r) => selected.has(r.id)), [selectableRows, selected]);

  // ── Ringkasan ──
  const summary = useMemo(() => {
    const perluBeli = rows.filter((r) => num(r.sisa) > 0);
    const totalSisa = rows.reduce((acc, r) => acc + num(r.sisa), 0);
    const stokCukup = rows.filter((r) => r.status === 'STOK_CUKUP').length;
    return { perluBeli: perluBeli.length, totalSisa, stokCukup };
  }, [rows]);

  // ═════════════════════════════════════════════════════════════════════════
  // Dialog "Buat PO Draft"
  // ═════════════════════════════════════════════════════════════════════════
  const [dialogOpen, setDialogOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [alamatPengirimanId, setAlamatPengirimanId] = useState('');
  const [tanggal, setTanggal] = useState(todayStr());
  const [keterangan, setKeterangan] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [alamatOptions, setAlamatOptions] = useState<AlamatPengirimanResponse[]>([]);
  useEffect(() => {
    let cancelled = false;
    api
      .get<AlamatPengirimanResponse[]>('/master/alamat-pengiriman?aktif_only=true')
      .then((res) => {
        if (!cancelled) setAlamatOptions(res);
      })
      .catch(() => {
        /* non-critical */
      });
    return () => {
      cancelled = true;
    };
  }, [dialogOpen]);

  // Supplier default = yang paling banyak dipakai item terpilih (gelondongan).
  const defaultSupplier = useMemo(() => {
    const counts = new Map<string, number>();
    selectedRows.forEach((r) => {
      if (r.supplierId) counts.set(r.supplierId, (counts.get(r.supplierId) || 0) + 1);
    });
    let best = '';
    let bestCount = 0;
    counts.forEach((c, id) => {
      if (c > bestCount) {
        best = id;
        bestCount = c;
      }
    });
    return best;
  }, [selectedRows]);

  const openDialog = () => {
    if (selectedRows.length === 0) return;
    setSupplierId(defaultSupplier);
    setAlamatPengirimanId(alamatOptions.length === 1 ? alamatOptions[0].id : '');
    setTanggal(todayStr());
    setKeterangan('');
    setDialogOpen(true);
  };

  const submitPoDraft = async () => {
    if (selectedRows.length === 0) return;
    if (!supplierId) {
      toast.error('Pilih supplier terlebih dahulu');
      return;
    }
    if (!alamatPengirimanId) {
      toast.error('Pilih gudang tujuan (alamat pengiriman) terlebih dahulu');
      return;
    }
    if (!tanggal) {
      toast.error('Tanggal wajib diisi');
      return;
    }
    setSubmitting(true);
    try {
      const payload: RopItemPoDraftCreate = {
        itemIds: selectedRows.map((r) => r.id),
        supplierId,
        alamatPengirimanId,
        tanggal,
        keterangan: keterangan.trim() || null
      };
      const res = await api.post<RopPoDraftResponse>('/pembelian/rop-item/po-draft', payload);
      const po = res.purchaseOrder;
      const rops = [...new Set(selectedRows.map((r) => r.noRop))];
      const autoDesc = res.autoCreatedBarang.length ? ` · ${res.autoCreatedBarang.length} barang master dibuat otomatis (${res.autoCreatedBarang.map((b) => b.kode).join(', ')})` : '';
      toast.success(`PO Draft ${po.noPesanan} berhasil dibuat`, {
        description: `${selectedRows.length} baris dari ${rops.length} ROP (${rops.join(', ')})${autoDesc}. Status DRAFT — koreksi harga/detail di menu Pesanan sebelum difinalisasi.`
      });
      setDialogOpen(false);
      setSelected(new Set());
      fetchData();
      refreshListTab('purchasing', 'pesanan');
      // Langsung buka form PO draft untuk koreksi (harga dsb.).
      openFormTab({
        title: `Edit ${po.noPesanan}`,
        module: 'purchasing',
        subPage: 'pesanan',
        formKey: 'pesanan-pembelian-edit',
        formProps: { id: po.id }
      });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Gagal membuat PO draft dari ROP');
    } finally {
      setSubmitting(false);
    }
  };

  // ═════════════════════════════════════════════════════════════════════════
  // Render
  // ═════════════════════════════════════════════════════════════════════════
  const supplierDropdownOptions = useMemo(() => supplierOptions.map((s) => ({ id: s.id, label: s.nama, subtitle: s.kode })), [supplierOptions]);
  const alamatDropdownOptions = useMemo(() => alamatOptions.map((a) => ({ id: a.id, label: a.nama, subtitle: a.prefix })), [alamatOptions]);

  return (
    <div className="space-y-6">
      {/* Ringkasan */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-orange-200 bg-orange-50/50">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-orange-600">
              <ClipboardList className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-orange-600">Item Perlu Dibeli</p>
              {loading ? <Skeleton className="mt-1 h-6 w-16" /> : <p className="text-2xl font-bold text-orange-700">{summary.perluBeli}</p>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-100 text-teal-600">
              <PackageCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-teal-600">Total Kekurangan (qty)</p>
              {loading ? <Skeleton className="mt-1 h-6 w-20" /> : <p className="text-2xl font-bold text-teal-700">{fmtQty(summary.totalSisa)}</p>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-600">
              <Warehouse className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600">Stok Gudang Cukup</p>
              {loading ? <Skeleton className="mt-1 h-6 w-16" /> : <p className="text-2xl font-bold text-gray-700">{summary.stokCukup}</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daftar item ROP */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Detail ROP — Item yang Dibutuhkan</CardTitle>
              <CardDescription>Seluruh item dari ROP berstatus DIBUAT. Centang item yang mau dibelanjakan (boleh lintas ROP) → pilih supplier → buat PO DRAFT. Qty belanja otomatis = kekurangan (qty diminta − stok gudang).</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} title="Muat ulang daftar">
                <RefreshCw className="mr-1.5 h-4 w-4" /> Muat Ulang
              </Button>
              <Button size="sm" onClick={openDialog} disabled={selectedRows.length === 0}>
                <ShoppingCart className="mr-1.5 h-4 w-4" />
                Buat PO Draft{selectedRows.length > 0 ? ` (${selectedRows.length} item)` : ''}
              </Button>
            </div>
          </div>

          {/* Filter bar */}
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Input placeholder="Cari ID PART / description / no ROP / project..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Cari item ROP" />
            <SearchableDropdown value={supplierFilter} onValueChange={setSupplierFilter} options={supplierDropdownOptions} allOption={{ id: '', label: 'Semua supplier' }} placeholder="Semua supplier" searchPlaceholder="Cari supplier..." compact />
            <SearchableDropdown
              value={statusFilter}
              onValueChange={setStatusFilter}
              options={[
                { id: 'BELUM', label: 'Belum dibelanjakan' },
                { id: 'SEBAGIAN', label: 'Sebagian' },
                { id: 'LENGKAP', label: 'Sudah dibelanjakan' },
                { id: 'STOK_CUKUP', label: 'Stok cukup' }
              ]}
              allOption={{ id: '', label: 'Semua status' }}
              placeholder="Semua status"
              compact
            />
            <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <Checkbox checked={needPurchaseOnly} onCheckedChange={(v) => setNeedPurchaseOnly(v === true)} aria-label="Hanya tampilkan item yang perlu dibeli" />
              <span className="text-muted-foreground">Hanya yang perlu dibeli</span>
            </label>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="py-8 text-center text-sm text-destructive">{error}</p>
          ) : loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState icon={ClipboardList} title="Belum ada item ROP untuk dibelanjakan" description={search || supplierFilter || statusFilter || needPurchaseOnly ? 'Tidak ada item yang cocok dengan filter.' : 'Item dari ROP berstatus DIBUAT (modul Produksi → Request Order Part) akan tampil di sini.'} />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-center">
                      <Checkbox checked={allVisibleSelected} onCheckedChange={toggleSelectAll} disabled={selectableRows.length === 0} aria-label="Pilih semua item yang perlu dibeli" title={allVisibleSelected ? 'Lepas pilihan (baris yang tampang)' : 'Pilih semua item yang perlu dibeli (baris yang tampang)'} />
                    </TableHead>
                    <TableHead className="min-w-[150px] whitespace-nowrap">ROP / Project</TableHead>
                    <TableHead className="min-w-[120px] whitespace-nowrap">ID PART</TableHead>
                    <TableHead className="min-w-[160px]">Description</TableHead>
                    <TableHead className="min-w-[90px]">Material</TableHead>
                    <TableHead className="text-right">Qty Diminta</TableHead>
                    <TableHead className="text-right">Stok Gudang</TableHead>
                    <TableHead className="text-right">Kekurangan</TableHead>
                    <TableHead className="text-right">Sudah Dibeli</TableHead>
                    <TableHead className="text-right">Sisa</TableHead>
                    <TableHead className="min-w-[130px]">Supplier</TableHead>
                    <TableHead className="min-w-[140px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const selectable = num(row.sisa) > 0;
                    const isSelected = selected.has(row.id);
                    return (
                      <TableRow key={row.id} className={isSelected ? 'bg-orange-50/60' : selectable ? 'cursor-pointer' : 'opacity-75'} onClick={() => selectable && toggleSelect(row)}>
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(row)} disabled={!selectable} aria-label={`Pilih item ${row.idPart || row.description || row.noRop}`} title={selectable ? `Beli ${fmtQty(row.sisa)} (kekurangan)` : 'Tidak perlu dibeli (stok cukup / sudah masuk PO)'} />
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="space-y-0.5">
                            <p className="font-mono text-xs font-semibold">{row.noRop}</p>
                            <p className="max-w-[220px] truncate text-xs text-muted-foreground" title={row.projectName}>
                              {row.projectName}
                              {row.salesOrderNo ? ` · ${row.salesOrderNo}` : ''}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="align-top font-mono text-xs">{row.barangKode || row.idPart || '-'}</TableCell>
                        <TableCell className="align-top">
                          <div className="space-y-0.5">
                            <p className="max-w-[200px] truncate text-sm" title={row.description || '-'}>
                              {row.description || '-'}
                            </p>
                            {!row.barangId && (
                              <Badge variant="outline" className="text-[10px] text-amber-700" title="Part belum ada di master barang — barang akan dibuat otomatis saat PO disimpan">
                                belum di master
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="align-top text-xs">{row.material || '-'}</TableCell>
                        <TableCell className="text-right align-top tabular-nums">{fmtQty(row.qty)}</TableCell>
                        <TableCell className="text-right align-top tabular-nums">
                          <span className={row.barangStok > 0 ? 'text-teal-700' : 'text-muted-foreground'}>{row.barangStok}</span>
                          {row.satuanNama ? <span className="ml-1 text-[10px] text-muted-foreground">{row.satuanNama}</span> : null}
                        </TableCell>
                        <TableCell className="text-right align-top font-medium tabular-nums">{fmtQty(row.kekurangan)}</TableCell>
                        <TableCell className="text-right align-top tabular-nums text-muted-foreground">{fmtQty(row.sudahDibelanja)}</TableCell>
                        <TableCell className="text-right align-top font-semibold tabular-nums text-orange-700">{fmtQty(row.sisa)}</TableCell>
                        <TableCell className="align-top text-xs">{row.supplierNama || <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="align-top">
                          <StatusBelanjaBadge row={row} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {rows.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Item terpilih digelondongkan ke SATU supplier dalam satu PO. Qty per baris PO otomatis = sisa kekurangan saat PO dibuat. PO berstatus DRAFT — koreksi dulu di menu Pesanan (harga, jenis belanja per baris, dll.) sebelum difinalisasi. PO dibatalkan → item otomatis balik ke daftar ini.</p>}
        </CardContent>
      </Card>

      {/* ── Dialog: Buat PO Draft dari seleksi ── */}
      <Dialog open={dialogOpen} onOpenChange={(v) => !submitting && setDialogOpen(v)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Buat PO Draft dari {selectedRows.length} item ROP</DialogTitle>
            <DialogDescription>Item terpilih (bisa dari beberapa ROP) akan dimasukkan ke SATU Purchase Order berstatus DRAFT untuk supplier yang dipilih. Qty tiap baris otomatis = sisa kekurangan.</DialogDescription>
          </DialogHeader>

          {/* Ringkasan pilihan */}
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border bg-muted/40 p-3 text-xs">
            {selectedRows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-mono">{r.barangKode || r.idPart || '-'}</span>
                  <span className="text-muted-foreground"> · {r.noRop}</span>
                </span>
                <span className="shrink-0 font-medium tabular-nums text-orange-700">× {fmtQty(r.sisa)}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>
                Supplier <span className="text-destructive">*</span>
              </Label>
              <SearchableDropdown value={supplierId} onValueChange={setSupplierId} options={supplierDropdownOptions} placeholder="Pilih supplier..." searchPlaceholder="Cari supplier..." />
              {defaultSupplier && supplierId === defaultSupplier && <p className="text-xs text-muted-foreground">Supplier terbanyak di item terpilih sudah terpilih otomatis.</p>}
            </div>
            <div className="space-y-1.5">
              <Label>
                Gudang Tujuan <span className="text-destructive">*</span>
              </Label>
              <SearchableDropdown value={alamatPengirimanId} onValueChange={setAlamatPengirimanId} options={alamatDropdownOptions} placeholder="Pilih gudang tujuan..." searchPlaceholder="Cari gudang..." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rop-po-tanggal">
                Tanggal PO <span className="text-destructive">*</span>
              </Label>
              <Input id="rop-po-tanggal" type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rop-po-keterangan">Keterangan (opsional)</Label>
              <Input id="rop-po-keterangan" placeholder="mis. urgent / part machine A" value={keterangan} onChange={(e) => setKeterangan(e.target.value)} maxLength={200} />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Harga per baris diisi dari harga pokok master (bisa 0) — lengkapi di form PO draft. Part yang belum ada di master barang akan dibuatkan barang otomatis. Jenis belanja default <span className="font-medium">Project</span> (bisa diganti per baris di PO draft).
          </p>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Batal
            </Button>
            <Button onClick={submitPoDraft} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <ShoppingCart className="mr-2 h-4 w-4" /> Buat PO Draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
