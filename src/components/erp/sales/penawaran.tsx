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
import { FileText, Plus, Trash2, Search, ChevronLeft, ChevronRight, Loader2, Pencil, Printer, Download, Info, Package, Type, History } from 'lucide-react';
import { formatRp, formatDate, todayStr, generatePDF, fileSafeNo } from '@/lib/pdf-utils';
import { api, PaginatedResponse, ApiError } from '@/lib/api';
import { useDefaultTaxRates } from '@/lib/use-default-rates';
import { toast } from 'sonner';
import { useTabStore } from '@/store/tab-store';
import { FormTabShell } from '@/components/erp/form-tab-shell';
import { HardDeleteCancelDialog } from '@/components/erp/hard-delete-cancel-dialog';
import { PenawaranPDFTemplate, type PenawaranData, type DetailRow, type BiayaTambahan } from '@/components/erp/sales/pdf-templates';
import type { PenawaranResponse, PenawaranCreate, PenawaranDetailCreate, PelangganDropdown, SyaratBayarResponse, BarangDropdown, BarangResponse, SatuanResponse, TransaksiBiayaCreate, HardDeleteResponse, PenawaranKatalogItemResponse, NomorQuotationPreviewResponse, PenawaranSoRingkas } from '@/types/api';
// Update #4 — auto-fill alamat & syarat bayar dari master saat pelanggan dipilih
import { findPartyMaster, AUTOFILL_HINT } from '@/lib/party-autofill';
// Update #007 — quick add master data langsung dari form transaksi
import { QuickAddPelangganButton, QuickAddSyaratBayarButton, QuickAddBarangButton, QuickAddSatuanButton, toPelangganDropdown, toBarangDropdown, satuanFromBarang } from '@/components/erp/quick-add';

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 100;

// === Update #031 — pilihan bulan & angka romawi utk No Quotation ===
const ROMAN_BULAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const BULAN_OPTIONS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'].map((label, i) => ({ value: String(i + 1), label: `${label} (${ROMAN_BULAN[i]})` }));

// ─── Update #039 — badge status SO turunan (kartu pemakaian penawaran) ──────

function SoStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'DRAFT':
      return <Badge className="border-yellow-200 bg-yellow-100 text-yellow-700 hover:bg-yellow-100">Draft</Badge>;
    case 'DIPROSES':
      return <Badge className="border-sky-200 bg-sky-100 text-sky-700 hover:bg-sky-100">Diproses</Badge>;
    case 'SELESAI':
      return <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Selesai</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// ─── Status Badge (mirror StatusBadge sales/index.tsx, status penawaran) ─────

function PenawaranStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'DRAFT':
      return <Badge className="border-yellow-200 bg-yellow-100 text-yellow-700 hover:bg-yellow-100">Draft</Badge>;
    case 'SELESAI':
      return <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Selesai</Badge>;
    // === Update #032 — status DIREVISI: dokumen sudah digantikan revisi
    // lebih baru (nomor sama, Rev. lebih tinggi); terkunci untuk audit. ===
    case 'DIREVISI':
      return <Badge className="border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-100">Direvisi</Badge>;
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
  // === Update #031 — mode baris: MASTER (pilih dari master barang) atau
  // BEBAS (ketik manual — item penawaran yang belum ada di master/gudang;
  // tersimpan di katalog penawaran, tidak masuk master data). ===
  bebas: boolean;
  barangId: string;
  kodeBarang: string;
  barangNama: string;
  itemNama: string;
  itemSatuan: string;
  katalogId: string;
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
  return { id: crypto.randomUUID(), bebas: false, barangId: '', kodeBarang: '', barangNama: '', itemNama: '', itemSatuan: '', katalogId: '', satuanId: '', satuanNama: '', harga: '', qty: '1', diskon: '0' };
}

function newBiayaRow(): PenawaranBiayaRow {
  return { id: crypto.randomUUID(), nama: '', jumlah: '' };
}

/** Pertahankan label data historis yang tidak lagi ada di dropdown aktif. */
function includeCurrent(options: SearchableDropdownOption[], id?: string | null, label?: string | null) {
  return id && !options.some((option) => option.id === id) ? [...options, { id, label: label || id }] : options;
}

// ─── Detail Table (barang + satuan + harga + diskon + subtotal) ─────────────

function PenawaranDetailTable({ rows, setRows, barangOptions, satuanOptions, katalogItems, onBarangCreated, onSatuanCreated }: { rows: PenawaranFormRow[]; setRows: Dispatch<SetStateAction<PenawaranFormRow[]>>; barangOptions: BarangDropdown[]; satuanOptions: SatuanResponse[]; katalogItems: PenawaranKatalogItemResponse[]; onBarangCreated?: (barang: BarangResponse) => void; onSatuanCreated?: (satuan: SatuanResponse) => void }) {
  const addRow = useCallback(() => setRows((p) => [...p, newFormRow()]), [setRows]);
  const removeRow = useCallback((id: string) => setRows((p) => p.filter((r) => r.id !== id)), [setRows]);
  // Update #007: terapkan barang ke baris — dipakai manual pick DAN quick-add.
  // satuanNamaOverride: nama satuan dari response create barang (satuan bisa
  // baru dibuat via nested quick-add, belum ada di satuanOptions host).
  const applyBarang = useCallback(
    (id: string, value: string, found: BarangDropdown | undefined, satuanNamaOverride?: string) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          // Auto-fill harga saat barang dipilih (mirror DetailTableWithPrice
          // di sales/index.tsx): harga jual default, fallback harga pokok.
          // Normalisasi via Number() — backend mengirim Decimal sebagai string.
          const hargaJual = Number(found?.hargaJual);
          const hargaPokok = Number(found?.hargaPokok);
          const hargaDefault = found ? (hargaJual > 0 ? String(hargaJual) : hargaPokok > 0 ? String(hargaPokok) : '') : r.harga;
          // Update ASAHI #4: satuan otomatis terpilih dari master barang (base_uom).
          const satuanDefault = found?.satuanId || '';
          const satuanNama = satuanNamaOverride ?? (satuanOptions.find((s) => s.id === satuanDefault)?.nama || '');
          return { ...r, barangId: value, kodeBarang: found?.kode || '', barangNama: found?.nama || '', satuanId: satuanDefault, satuanNama, ...(hargaDefault ? { harga: hargaDefault } : {}) };
        })
      );
    },
    [setRows, satuanOptions]
  );
  // === Update #031 — terapkan item KATALOG ke baris bebas (klik saran): isi
  // nama + satuan + harga terakhir (item berulang → buat penawaran lebih cepat).
  const applyKatalog = useCallback(
    (id: string, item: PenawaranKatalogItemResponse) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          const harga = Number(item.harga);
          return {
            ...r,
            bebas: true,
            itemNama: item.nama,
            itemSatuan: item.satuanNama || r.itemSatuan,
            katalogId: item.id,
            ...(harga > 0 ? { harga: String(harga) } : {})
          };
        })
      );
    },
    [setRows]
  );
  const updateRow = useCallback(
    (id: string, field: keyof PenawaranFormRow, value: string | boolean) => {
      if (field === 'barangId') {
        applyBarang(
          id,
          String(value),
          barangOptions.find((b) => b.id === value)
        );
        return;
      }
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          if (field === 'satuanId') {
            const found = satuanOptions.find((s) => s.id === value);
            return { ...r, satuanId: String(value), satuanNama: found?.nama || '' };
          }
          // Update #031 — nama item bebas diketik manual → lepas link katalog.
          if (field === 'itemNama') {
            return { ...r, itemNama: String(value), katalogId: r.itemNama === String(value) ? r.katalogId : '' };
          }
          return { ...r, [field]: value } as PenawaranFormRow;
        })
      );
    },
    [setRows, barangOptions, satuanOptions, applyBarang]
  );
  // === Update #031 — toggle mode baris: MASTER ↔ BEBAS (nilai kolom lain
  // dipertahankan supaya bisa bolak-balik tanpa kehilangan isian). ===
  const toggleMode = useCallback(
    (id: string) => {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, bebas: !r.bebas } : r)));
    },
    [setRows]
  );

  return (
    <div className="space-y-3">
      <div className="max-h-72 overflow-y-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[54px]" title="Mode baris: master barang / item bebas">
                Mode
              </TableHead>
              <TableHead className="w-[90px]">Kode Barang</TableHead>
              <TableHead className="min-w-[220px]">Nama Barang / Item</TableHead>
              <TableHead className="w-[110px]">Satuan</TableHead>
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
              // Update #031 — saran katalog utk baris bebas (maks 5, filter nama).
              const saran = row.bebas && row.itemNama.trim() ? katalogItems.filter((k) => k.nama.toLowerCase().includes(row.itemNama.trim().toLowerCase()) && k.nama !== row.itemNama).slice(0, 5) : [];
              return (
                <TableRow key={row.id}>
                  <TableCell>
                    <Button variant="ghost" size="icon" className={row.bebas ? 'h-7 w-7 text-amber-600' : 'h-7 w-7 text-muted-foreground'} onClick={() => toggleMode(row.id)} title={row.bebas ? 'Item bebas (ketik manual — tidak di master). Klik untuk pilih dari master barang.' : 'Pilih dari master barang. Klik untuk ketik item bebas.'} aria-label={row.bebas ? 'Ganti ke mode master barang' : 'Ganti ke mode item bebas'}>
                      {row.bebas ? <Type className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />}
                    </Button>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.bebas ? (
                      <span className="text-muted-foreground" title="Item bebas — tanpa kode master">
                        bebas
                      </span>
                    ) : (
                      row.kodeBarang || '-'
                    )}
                  </TableCell>
                  <TableCell>
                    {row.bebas ? (
                      <div className="space-y-1">
                        <Input className="h-8 text-xs" value={row.itemNama} onChange={(e) => updateRow(row.id, 'itemNama', e.target.value)} placeholder="Nama item (bebas — mis. Fabrication Work)" aria-label="Nama item bebas" />
                        {saran.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {saran.map((k) => (
                              <button key={k.id} type="button" onClick={() => applyKatalog(row.id, k)} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 hover:bg-amber-100" title={`Pakai item katalog: ${k.nama}${k.satuanNama ? ` · ${k.satuanNama}` : ''} · ${formatRp(Number(k.harga) || 0)}`}>
                                {k.nama}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <SearchableDropdown className="min-w-0 flex-1" value={row.barangId} onValueChange={(v) => updateRow(row.id, 'barangId', v)} options={barangOptions.map((b) => ({ id: b.id, label: b.nama, subtitle: b.kode }))} placeholder="Pilih barang..." compact />
                        {/* Update #007: quick add barang langsung di baris */}
                        <QuickAddBarangButton
                          compact
                          onCreated={(b) => {
                            const drop = toBarangDropdown(b);
                            onBarangCreated?.(b);
                            applyBarang(row.id, b.id, drop, b.satuan?.nama);
                          }}
                        />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.bebas ? (
                      <Input className="h-8 text-xs" value={row.itemSatuan} onChange={(e) => updateRow(row.id, 'itemSatuan', e.target.value)} placeholder="mis. lot" aria-label="Satuan item bebas" />
                    ) : (
                      <div className="flex items-center gap-1">
                        <SearchableDropdown className="min-w-0 flex-1" value={row.satuanId} onValueChange={(v) => updateRow(row.id, 'satuanId', v)} options={satuanOptions.map((s) => ({ id: s.id, label: s.nama }))} allOption={{ id: '', label: 'Tidak dipilih' }} placeholder="Pilih..." compact />
                        {/* Update #007: quick add satuan langsung di baris */}
                        <QuickAddSatuanButton
                          compact
                          onCreated={(s) => {
                            onSatuanCreated?.(s);
                            updateRow(row.id, 'satuanId', s.id);
                          }}
                        />
                      </div>
                    )}
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
                <TableCell colSpan={9} className="h-16 text-center text-muted-foreground">
                  Belum ada item. Klik &quot;+ Tambah Baris&quot; untuk menambahkan.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addRow}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Tambah Baris
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Klik ikon <Package className="inline h-3 w-3" /> untuk berganti mode: <span className="font-medium">master barang</span> ↔ <span className="font-medium">item bebas</span> (diketik manual — belum ada di gudang; tersimpan otomatis di katalog penawaran supaya item berulang tinggal dipilih lagi).
        </p>
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
  // Update #033 — refreshListTab tidak lagi dipakai di tab list ini (tombol
  // "Buat SO" kini membuka form; refresh list SO dilakukan form saat simpan).

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

  // ── Buat SO dari penawaran ──
  // === Update #033 — tombol "Buat SO" kini MEMBUKA FORM SO yang sudah
  // terisi penuh dari penawaran (pelanggan terkunci + seluruh item & biaya),
  // BUKAN lagi membuat SO langsung lewat API. Repeat order tetap jalan:
  // penawaran DRAFT/SELESAI boleh dipakai lagi.
  // === Update #040 — panduan termin dihapus (fitur Pembayaran Termin SO
  // dihapus): nilai SO disesuaikan sesuai tahap pembayaran (mis. sebesar DP),
  // pembayaran murni lewat Invoice; sisa pembayaran → SO BARU lagi dari
  // penawaran yang sama (lihat kartu Sisa Penawaran / #039). ===
  const handleBuatSo = useCallback(
    (d: PenawaranResponse) => {
      const rev = d.revisiKe && d.revisiKe > 1 ? ` Rev. ${d.revisiKe}` : '';
      openFormTab({
        title: `Buat SO — ${d.noPenawaran}${rev}`,
        module: 'sales',
        subPage: 'pesanan',
        formKey: 'pesanan-penjualan-create',
        formProps: { penawaranId: d.id }
      });
      toast.info(`Form Sales Order terbuka dengan isian ${d.noPenawaran}${rev}`, {
        description: 'Sesuaikan nilai SO sesuai tahap pembayaran (mis. sebesar DP) lalu Simpan — terbitkan Invoice dari SO ini dan lunasi lewat Pelunasan Invoice. Sisa pembayaran: buat SO baru lagi dari penawaran yang sama.'
      });
    },
    [openFormTab]
  );

  // ══════════════════════════════════════════════════════════════════
  // === Update #032 — REVISI PENAWARAN: dokumen baru nomor sama (Rev. N) ===
  // Hanya untuk status SELESAI (DRAFT cukup diedit; DIREVISI terkunci).
  // Setelah dibuat: dokumen baru DRAFT dibuka di form edit + list direfresh
  // (dokumen asal berubah jadi DIREVISI).
  // ══════════════════════════════════════════════════════════════════
  const [revisiTarget, setRevisiTarget] = useState<PenawaranResponse | null>(null);
  const [revisiSubmitting, setRevisiSubmitting] = useState(false);

  const handleRevisi = useCallback(async () => {
    if (!revisiTarget) return;
    setRevisiSubmitting(true);
    try {
      const baru = await api.post<PenawaranResponse>(`/penjualan/penawaran/${revisiTarget.id}/revisi`);
      toast.success(`Revisi penawaran dibuat: ${baru.noPenawaran} Rev. ${baru.revisiKe}`, {
        description: 'Dokumen baru berstatus DRAFT (bisa diedit). Dokumen lama menjadi DIREVISI — terkunci, jejak harga lama tetap utuh.'
      });
      setRevisiTarget(null);
      fetchData();
      // Buka form edit dokumen revisi baru (langsung bisa disunting).
      openFormTab({
        title: `Edit ${baru.noPenawaran} Rev. ${baru.revisiKe}`,
        module: 'sales',
        subPage: 'penawaran',
        formKey: 'penawaran-edit',
        formProps: { id: baru.id, noPenawaran: baru.noPenawaran, status: baru.status, grandTotal: Number(baru.grandTotal) }
      });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Gagal membuat revisi penawaran');
    } finally {
      setRevisiSubmitting(false);
    }
  }, [revisiTarget, fetchData, openFormTab]);

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
                  {/* Update #032 — status baru: dokumen tergantikan revisi. */}
                  <SelectItem value="DIREVISI">Direvisi</SelectItem>
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
                    <TableHead className="w-[150px]">No Quotation</TableHead>
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
                        <TableCell className="font-mono text-xs font-medium">
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            {d.noPenawaran}
                            {/* Update #032 — badge revisi + pemakaian SO (repeat order) */}
                            {d.revisiKe > 1 && (
                              <Badge variant="outline" className="border-sky-300 bg-sky-50 px-1.5 py-0 text-[10px] font-semibold text-sky-700">
                                Rev. {d.revisiKe}
                              </Badge>
                            )}
                            {d.digunakanCount > 0 && (
                              <Badge variant="outline" className="border-amber-300 bg-amber-50 px-1.5 py-0 text-[10px] font-semibold text-amber-700" title="Jumlah Sales Order yang dibuat dari penawaran ini (repeat order)">
                                {d.digunakanCount}× SO
                              </Badge>
                            )}
                          </span>
                        </TableCell>
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
                            {/* === Update #032 — Buat SO: DRAFT & SELESAI (repeat
                                order — SELESAI tetap bisa dipakai lagi). ===
                                === Update #033 — kini MEMBUKA FORM SO terisi
                                (termin diatur di form sebelum simpan). === */}
                            {(d.status === 'DRAFT' || d.status === 'SELESAI') && (
                              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => handleBuatSo(d)} title={d.digunakanCount > 0 ? `Repeat order — penawaran ini sudah dipakai ${d.digunakanCount}× SO` : 'Buka form Sales Order terisi dari penawaran ini'}>
                                Buat SO
                              </Button>
                            )}
                            {/* === Update #032 — REVISI: penawaran SELESAI digantikan
                                dokumen baru (nomor sama + Rev. N, status DRAFT). */}
                            {d.status === 'SELESAI' && (
                              <Button variant="outline" size="sm" className="h-7 px-2 text-xs text-sky-700 hover:text-sky-800" onClick={() => setRevisiTarget(d)} title="Buat dokumen revisi (nomor sama + Rev. berikutnya)">
                                <History className="mr-1 h-3.5 w-3.5" /> Revisi
                              </Button>
                            )}
                            {d.status === 'DRAFT' && (
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => setCancelTarget(d.id)}>
                                Hapus
                              </Button>
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

      {/* Konfirmasi Buat SO dihapus pada Update #033 — tombol "Buat SO" kini
          membuka form SO terisi (termin diatur di form sebelum simpan),
          bukan lagi membuat SO langsung lewat API. */}

      {/* ══════════════════════════════════════════════════════════════════
          === Update #032 — Konfirmasi REVISI PENAWARAN ===
          Dokumen baru: nomor SAMA + Rev. berikutnya, status DRAFT (editable);
          dokumen asal → DIREVISI (terkunci — jejak harga lama utuh untuk
          audit). SO-SO lama yang dibuat dari asal TIDAK berubah.
          ══════════════════════════════════════════════════════════════════ */}
      <AlertDialog
        open={!!revisiTarget}
        onOpenChange={(o) => {
          if (!o) setRevisiTarget(null);
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Buat Revisi Penawaran?</AlertDialogTitle>
            <AlertDialogDescription>
              Penawaran{' '}
              <span className="font-mono font-semibold text-foreground">
                {revisiTarget?.noPenawaran}
                {revisiTarget && revisiTarget.revisiKe > 1 ? ` (Rev. ${revisiTarget.revisiKe})` : ''}
              </span>{' '}
              akan dibuatkan dokumen revisi: nomor quotation <strong>TETAP SAMA</strong> dengan penanda <strong>Rev. {(revisiTarget?.revisiKe || 1) + 1}</strong>, seluruh item & harga disalin utuh, status <strong>Draft</strong> (langsung bisa diedit). Dokumen asal berubah menjadi <strong>Direvisi</strong> — terkunci dan tidak bisa dipakai membuat SO; jejak harga lama tetap utuh untuk audit. SO-SO yang sudah dibuat dari dokumen asal TIDAK ikut berubah.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revisiSubmitting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // jangan tutup otomatis — handler menutup setelah sukses
                void handleRevisi();
              }}
              disabled={revisiSubmitting}>
              {revisiSubmitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Ya, Buat Revisi
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
  // AUD-10 (update #04) — tarif default dari setting global (RATE_PPN)
  const defaultRates = useDefaultTaxRates();
  useEffect(() => {
    if (defaultRates) setFPpn(defaultRates.ppn);
  }, [defaultRates]);
  // ── Update #003: singkatan customer — ditarik dari master pelanggan. ──
  // (Update #031: field LOCKED read-only — ambil data dari master data.)
  const [fCustomerCode, setFCustomerCode] = useState('');
  // ── Update #031 — No Quotation: user hanya input BULAN & TAHUN; nomor urut
  // otomatis per pelanggan (reset tahunan), bulan romawi, singkatan master. ──
  const now = new Date();
  const [fBulan, setFBulan] = useState(String(now.getMonth() + 1));
  const [fTahun, setFTahun] = useState(String(now.getFullYear()));
  const [nomorPreview, setNomorPreview] = useState('');
  const [nomorPreviewLoading, setNomorPreviewLoading] = useState(false);
  const [fDetail, setFDetail] = useState<PenawaranFormRow[]>([newFormRow()]);
  const [fBiayaTambahan, setFBiayaTambahan] = useState<PenawaranBiayaRow[]>([]);
  // ── Update #031 — katalog item bebas (saran item berulang) ──
  const [katalogItems, setKatalogItems] = useState<PenawaranKatalogItemResponse[]>([]);

  // ── Update #4: pilih pelanggan → alamat & syarat bayar ditarik otomatis
  // dari master (tidak perlu input manual lagi; tetap bisa disunting).
  // Update #003: singkatan customer ikut ditarik dari master pelanggan. ──
  const handlePelangganChange = (id: string) => {
    setFPelangganId(id);
    const master = findPartyMaster(pelangganOptions, id);
    setFAlamatPengiriman(master?.alamat || '');
    setFCustomerCode(master?.singkatan || '');
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
  // Update #032 — revisi dokumen (badge "Rev. N" di header form edit).
  const [editRevisiKe, setEditRevisiKe] = useState(1);
  const [editStatus, setEditStatus] = useState('');
  const [editGrandTotal, setEditGrandTotal] = useState(0);
  // === Update #039 — kartu pemakaian/sisa penawaran di form edit/detail:
  // Σ SO aktif turunan + sisa + daftar SO-SOnya (alur DP bertahap). ===
  const [editDipakaiSoTotal, setEditDipakaiSoTotal] = useState(0);
  const [editSisaPenawaran, setEditSisaPenawaran] = useState(0);
  const [editSoList, setEditSoList] = useState<PenawaranSoRingkas[]>([]);
  // Nama referensi historis (pelanggan/syarat bayar) — dipertahankan sebagai label
  // bila data sudah tidak ada di dropdown aktif (mirror includeCurrent order-form).
  const [editPelangganNama, setEditPelangganNama] = useState('');
  const [editSyaratNama, setEditSyaratNama] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setDdLoading(true);
      try {
        const [pelanggan, syaratBayar, barang, satuan, katalog] = await Promise.all([api.get<PelangganDropdown[]>('/master/pelanggan-dropdown'), api.get<SyaratBayarResponse[]>('/master/syarat-bayar'), api.get<BarangDropdown[]>('/master/barang-dropdown'), api.get<SatuanResponse[]>('/master/satuan'), api.get<PenawaranKatalogItemResponse[]>('/penjualan/penawaran/katalog?limit=100')]);
        if (cancelled) return;
        setPelangganOptions(pelanggan);
        setSyaratBayarOptions(syaratBayar);
        setBarangOptions(barang);
        setSatuanOptions(satuan);
        // Update #031 — katalog item bebas (saran item berulang)
        setKatalogItems(Array.isArray(katalog) ? katalog : []);
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

  // === Update #031 — preview No Quotation (pola "No. Dokumen" form
  // Penerimaan #16): refetch saat pelanggan / bulan / tahun berubah. Hanya
  // mode create — nomor final ditetapkan backend saat simpan. ===
  useEffect(() => {
    if (editId) return;
    if (!fPelangganId || !fBulan || !fTahun) {
      setNomorPreview('');
      return;
    }
    let cancelled = false;
    setNomorPreviewLoading(true);
    api
      .get<NomorQuotationPreviewResponse>(`/penjualan/penawaran/next-nomor?pelanggan_id=${fPelangganId}&bulan=${fBulan}&tahun=${fTahun}`)
      .then((res) => {
        if (!cancelled) setNomorPreview(res.nomor);
      })
      .catch(() => {
        if (!cancelled) setNomorPreview('');
      })
      .finally(() => {
        if (!cancelled) setNomorPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editId, fPelangganId, fBulan, fTahun]);

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
        setEditRevisiKe(p.revisiKe || 1);
        setEditGrandTotal(Number(p.grandTotal) || 0);
        // Update #039 — sisa penawaran (Σ SO aktif; negatif = melebihi).
        setEditDipakaiSoTotal(Number(p.dipakaiSoTotal) || 0);
        setEditSisaPenawaran(Number(p.sisaPenawaran) || 0);
        setEditSoList(p.soList || []);
        setEditPelangganNama(p.pelanggan?.nama || '');
        setEditSyaratNama(p.syaratBayar?.nama || '');
        setFPelangganId(p.pelangganId || '');
        setFTanggal(p.tanggal ? p.tanggal.slice(0, 10) : '');
        setFBerlakuHingga(p.berlakuHingga ? p.berlakuHingga.slice(0, 10) : '');
        setFSyaratBayarId(p.syaratBayarId || '');
        setFAlamatPengiriman(p.alamatPengiriman || '');
        setFKeterangan(p.keterangan || '');
        // Update #031 — singkatan snapshot dokumen (field locked; No. PO
        // customer dihapus dari form — nomor PO diisi di SO bila perlu).
        setFCustomerCode(p.customerCode || '');
        setFDiskonGlobal(String(Number(p.diskonGlobal) || 0));
        setFPpn(String(Number(p.ppn) || 0));
        setFDetail(
          (p.details || []).map((r) => ({
            id: crypto.randomUUID(),
            // Update #031 — baris item bebas (barangId null + itemNama)
            bebas: !r.barangId && !!r.itemNama,
            barangId: r.barangId || '',
            kodeBarang: r.barang?.kode || '',
            barangNama: r.barang?.nama || '',
            itemNama: r.itemNama || '',
            itemSatuan: r.itemSatuan || '',
            katalogId: r.katalogId || '',
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
    // Update #031 — baris valid: master (barangId) ATAU bebas (itemNama), qty > 0.
    if (!fDetail.some((r) => (r.bebas ? r.itemNama.trim() : r.barangId) && (parseFloat(r.qty) || 0) > 0)) {
      errs.detail = 'Minimal 1 baris dengan item (master atau bebas) dan qty > 0';
    }
    if (fDetail.some((r) => r.bebas && !r.itemNama.trim() && (parseFloat(r.qty) || 0) > 0)) {
      errs.detail = 'Baris item bebas wajib memiliki nama item';
    }
    if (!editId && (!fBulan || !fTahun)) errs.bulan = 'Bulan & tahun nomor Quotation wajib diisi';
    if (Object.keys(errs).length) {
      setFormErrors(errs);
      return;
    }
    setSubmitting(true);
    try {
      // Update #031 — baris master ATAU bebas (item bebas → katalog penawaran,
      // tidak masuk master data).
      const details: PenawaranDetailCreate[] = fDetail
        .filter((r) => (r.bebas ? r.itemNama.trim() : r.barangId) && (parseFloat(r.qty) || 0) > 0)
        .map((r) => {
          const qty = parseFloat(r.qty) || 0;
          const harga = parseFloat(r.harga) || 0;
          const diskon = parseFloat(r.diskon) || 0;
          if (r.bebas) {
            return {
              barangId: null,
              katalogId: r.katalogId || null,
              itemNama: r.itemNama.trim(),
              itemSatuan: r.itemSatuan.trim() || null,
              satuanId: null,
              qty,
              harga,
              diskon,
              subTotal: qty * harga * (1 - diskon / 100)
            };
          }
          return { barangId: r.barangId, katalogId: null, itemNama: null, itemSatuan: null, satuanId: r.satuanId || null, qty, harga, diskon, subTotal: qty * harga * (1 - diskon / 100) };
        });
      const biaya: TransaksiBiayaCreate[] = fBiayaTambahan.filter((b) => b.nama).map((b) => ({ nama: b.nama, jumlah: parseFloat(b.jumlah) || 0 }));
      const body: PenawaranCreate = {
        pelangganId: fPelangganId,
        tanggal: fTanggal,
        berlakuHingga: fBerlakuHingga || null,
        syaratBayarId: fSyaratBayarId || null,
        alamatPengiriman: fAlamatPengiriman || null,
        keterangan: fKeterangan || null,
        // Update #031 — singkatan & nomor urut OTOMATIS dari backend (master
        // pelanggan); No. PO customer field dihapus dari form penawaran.
        mataUang: 'IDR',
        diskonGlobal: parseFloat(fDiskonGlobal) || 0,
        ppn: parseFloat(fPpn) || 0,
        details,
        biayaTambahan: biaya.length > 0 ? biaya : undefined
      };
      if (!editId) {
        // Update #031 — No Quotation: user hanya input bulan & tahun.
        body.bulan = parseInt(fBulan, 10);
        body.tahun = parseInt(fTahun, 10);
      }
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
  }, [editId, fPelangganId, fTanggal, fBerlakuHingga, fSyaratBayarId, fAlamatPengiriman, fKeterangan, fBulan, fTahun, fDiskonGlobal, fPpn, fDetail, fBiayaTambahan, subPage, activeTabId, closeTab, refreshListTab]);

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
                <span>No Quotation:</span>
                <span className="font-mono font-semibold text-foreground">{editNoPenawaran}</span>
                {/* Update #032 — badge revisi dokumen */}
                {editRevisiKe > 1 && (
                  <Badge variant="outline" className="border-sky-300 bg-sky-50 px-1.5 py-0 text-[10px] font-semibold text-sky-700">
                    Rev. {editRevisiKe}
                  </Badge>
                )}
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

          {/* === Update #039 — PEMAKAIAN PENAWARAN (alur DP bertahap: satu
              penawaran → SO DP → SO sisa; sisa = nilai penawaran − Σ SO aktif,
              dihitung backend on-the-fly — SO dibatalkan otomatis mengembalikan
              sisanya). Kartu tampil di semua status; baris SO = SO aktif saja. === */}
          {editId && (
            <div className="space-y-3 rounded-md border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  Pemakaian Penawaran
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Nilai: <span className="font-mono font-semibold text-foreground">{formatRp(editGrandTotal)}</span>
                  </span>
                  <span>
                    Sudah jadi SO {editSoList.length}×: <span className="font-mono font-semibold text-foreground">{formatRp(editDipakaiSoTotal)}</span>
                  </span>
                  <span>
                    Sisa:{' '}
                    {editSisaPenawaran < 0 ? (
                      <span className="font-mono font-semibold text-amber-700" title="SO-SO turunan melebihi nilai penawaran">
                        {formatRp(editSisaPenawaran)}
                      </span>
                    ) : (
                      <span className="font-mono font-semibold text-emerald-700">{formatRp(editSisaPenawaran)}</span>
                    )}
                  </span>
                </div>
              </div>
              {editSisaPenawaran < 0 && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="alert">
                  SO-SO turunan melebihi nilai penawaran sebesar {formatRp(Math.abs(editSisaPenawaran))} — tetap diperbolehkan (repeat order / penambahan scope), sekadar pengingat.
                </p>
              )}
              {editSoList.length > 0 ? (
                <div className="max-h-44 overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>No. Pesanan</TableHead>
                        <TableHead className="w-[120px]">Tanggal</TableHead>
                        <TableHead className="w-[110px]">Status</TableHead>
                        <TableHead className="text-right">Nilai SO</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {editSoList.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono text-xs font-medium">{s.noPesanan}</TableCell>
                          <TableCell className="text-xs">{formatDate(s.tanggal)}</TableCell>
                          <TableCell>
                            <SoStatusBadge status={s.status} />
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-medium">{formatRp(Number(s.grandTotal) || 0)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Belum ada Sales Order aktif dari penawaran ini — nilai penuh {formatRp(editGrandTotal)} masih tersedia sebagai sisa.</p>
              )}
              <p className="text-[11px] text-muted-foreground">Alur DP bertahap: buat SO sebesar DP dari penawaran ini → turunkan invoice-nya; sisa pembayaran dibuat SO baru lagi dari penawaran yang sama → invoice baru (pembayaran tetap mengacu invoice). Sisa dihitung otomatis dan berubah mengikuti status SO.</p>
            </div>
          )}

          {readOnly && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Penawaran berstatus {editStatus || '-'}. Hanya penawaran DRAFT yang dapat diubah; form ini menjadi baca saja.{editStatus === 'DIREVISI' ? ' Dokumen ini sudah digantikan revisi lebih baru — tersimpan untuk jejak audit.' : ''}
            </p>
          )}
          {/* Update #031 — revisi penawaran = edit DRAFT (opsi user); pelanggan &
              No Quotation terkunci setelah dibuat. */}
          {editId && !readOnly && <p className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">Mode revisi: pelanggan & No Quotation tidak bisa diganti (bagian dari nomor dokumen). Perubahan item/harga/diskon/biaya tetap tersimpan.</p>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Pelanggan <span className="text-destructive">*</span>
              </Label>
              <div className="flex items-start gap-1.5">
                <SearchableDropdown
                  className="min-w-0 flex-1"
                  value={fPelangganId}
                  onValueChange={handlePelangganChange}
                  options={includeCurrent(
                    pelangganOptions.map((p) => ({ id: p.id, label: p.nama })),
                    fPelangganId,
                    editPelangganNama
                  )}
                  placeholder="Pilih pelanggan..."
                  disabled={readOnly || !!editId}
                />
                {/* Update #007: quick add pelanggan — field & simpan sama seperti master data */}
                <QuickAddPelangganButton
                  disabled={readOnly || !!editId}
                  onCreated={(p) => {
                    const drop = toPelangganDropdown(p);
                    setPelangganOptions((prev) => (prev.some((row) => row.id === p.id) ? prev : [...prev, drop]));
                    // Mirror handlePelangganChange — dari response segar (state belum ter-update).
                    setFPelangganId(p.id);
                    setFAlamatPengiriman(p.alamat || '');
                    setFCustomerCode(p.singkatan || '');
                    const syaratId = p.syaratBayarId || p.syaratBayar?.id;
                    if (syaratId) setFSyaratBayarId(syaratId);
                    setFormErrors((prev) => (prev.pelangganId ? { ...prev, pelangganId: '' } : prev));
                  }}
                />
              </div>
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
              <div className="flex items-start gap-1.5">
                <SearchableDropdown
                  className="min-w-0 flex-1"
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
                {/* Update #007: quick add syarat bayar */}
                <QuickAddSyaratBayarButton
                  disabled={readOnly}
                  onCreated={(s) => {
                    setSyaratBayarOptions((prev) => (prev.some((row) => row.id === s.id) ? prev : [...prev, s]));
                    setFSyaratBayarId(s.id);
                  }}
                />
              </div>
            </div>
          </div>
          {/* ── Update #031: No Quotation (preview otomatis ala form Penerimaan)
              + Bulan & Tahun (satu-satunya input nomor) + Singkatan Customer
              TERKUNCI dari master pelanggan. Field Nomor PO dihapus. ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Bulan (No Quotation)</Label>
              <Select value={fBulan} onValueChange={(v) => setFBulan(v)} disabled={!!editId || readOnly}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Pilih bulan…" />
                </SelectTrigger>
                <SelectContent>
                  {BULAN_OPTIONS.map((b) => (
                    <SelectItem key={b.value} value={b.value}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Segmen bulan nomor Quotation (angka romawi, mis. Oktober → X).</p>
              {formErrors.bulan && <p className="text-xs text-destructive mt-1">{formErrors.bulan}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Tahun (No Quotation)</Label>
              <Input type="number" className="h-9 text-xs" value={fTahun} min={2000} max={2100} onChange={(e) => setFTahun(e.target.value)} disabled={!!editId || readOnly} />
              <p className="text-[11px] text-muted-foreground">Nomor urut reset per tahun, per pelanggan.</p>
            </div>
          </div>
          {!editId && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">No Quotation</Label>
              <div className="relative">
                <Input readOnly value={nomorPreviewLoading ? 'Memuat nomor…' : nomorPreview || (fPelangganId ? 'Otomatis saat disimpan' : 'Pilih pelanggan dulu…')} className="font-mono bg-muted/50 pr-9 text-xs" />
                <FileText className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Format QUOT ASI/003/{fCustomerCode || 'singkatan'}/{ROMAN_BULAN[parseInt(fBulan, 10) - 1] || 'I'}/{fTahun} — nomor urut otomatis per pelanggan (reset tahunan); nomor final terbit saat disimpan.
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Singkatan Customer</Label>
              <Input className="h-9 text-xs uppercase bg-muted/50" value={fCustomerCode} readOnly placeholder="otomatis dari master pelanggan" aria-readonly />
              <p className="text-[11px] text-muted-foreground">TERKUNCI — otomatis dari master data pelanggan (segmen nomor Quotation & SO hasil konversi). Ubah lewat master Pelanggan bila perlu.</p>
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
            <PenawaranDetailTable
              rows={fDetail}
              setRows={setFDetail}
              barangOptions={effectiveBarangOptions}
              satuanOptions={effectiveSatuanOptions}
              katalogItems={katalogItems}
              onBarangCreated={(b) => {
                setBarangOptions((prev) => (prev.some((row) => row.id === b.id) ? prev : [...prev, toBarangDropdown(b)]));
                // Satuan barang baru (mungkin hasil nested quick-add) didaftarkan ke daftar satuan host.
                const satuan = satuanFromBarang(b);
                if (satuan) setSatuanOptions((prev) => (prev.some((row) => row.id === satuan.id) ? prev : [...prev, satuan]));
              }}
              onSatuanCreated={(s) => setSatuanOptions((prev) => (prev.some((row) => row.id === s.id) ? prev : [...prev, s]))}
            />
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
    // === Update #032 — revisi dokumen (tampil "Rev. N" di cetakan) ===
    revisiKe: d.revisiKe || 1,
    tanggal: d.tanggal || '',
    berlakuHingga: d.berlakuHingga || '',
    kepada: d.pelanggan?.nama || '',
    alamatPenerima: d.alamatPengiriman || '',
    syaratPembayaran: d.syaratBayar?.nama || '',
    keterangan: d.keterangan || '',
    // Update #031: No. PO customer field dihapus dari penawaran; item bebas
    // tampil namanya (fallback saat barang null).
    noPo: d.customerPoNumber || '',
    detail: (d.details || []).map<DetailRow>((r) => ({
      id: r.id,
      barang: r.barang?.nama || r.itemNama || '',
      harga: Number(r.harga) || 0,
      qty: Number(r.qty) || 0,
      diskon: Number(r.diskon) || 0,
      satuan: r.satuan?.nama || r.itemSatuan || ''
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
