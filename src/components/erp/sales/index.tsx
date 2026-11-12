'use client';

import { SalesReturnSourceLines, useSalesReturnSource } from '@/components/erp/sales-return-source';
import { salesReturnDetails, createSalesReturn, type ReturnQuantities } from '@/lib/return-documents';

import { stockLineError } from '@/lib/delivery-receipt';
import { StockOperationErrorDialog, useStockOperationError } from '@/components/erp/stock-operation-error-dialog';

import OrderDocumentForm from '@/components/erp/orders/order-document-form';
import { canEditOrder } from '@/lib/order-documents';

import { useState, useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction, type ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableDropdown, type SearchableDropdownOption } from '@/components/ui/searchable-dropdown';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { FileText, Truck, Receipt, RotateCcw, Plus, Trash2, ShoppingCart, Search, ChevronLeft, ChevronRight, Loader2, Pencil, Info, Printer, Undo2, Package, Type } from 'lucide-react';
import { formatRp, formatDate } from '@/lib/pdf-utils';
// === Update #050 — navigasi otomatis ke field wajib yang terlewat. ===
import { focusFormError } from '@/lib/form-error-focus';
// Update #4 — auto-fill alamat & syarat bayar dari master saat pelanggan dipilih
import { findPartyMaster, AUTOFILL_HINT } from '@/lib/party-autofill';
// Update #007 — quick add master data langsung dari form transaksi
import { QuickAddPelangganButton, QuickAddGudangButton, QuickAddBarangButton, QuickAddSatuanButton, toPelangganDropdown, toBarangDropdown, satuanFromBarang } from '@/components/erp/quick-add';
import { api, PaginatedResponse, ApiError } from '@/lib/api';
import { useDefaultTaxRates } from '@/lib/use-default-rates';
import { trimDecimalString } from '@/lib/money';
import { toast } from 'sonner';
import { useTabStore } from '@/store/tab-store';
import { useAuthStore } from '@/store/auth-store';
import { useFormDraft, draftKey } from '@/hooks/use-form-draft';
import { DraftIndicator } from '@/components/erp/draft-indicator';
import { FormTabShell } from '@/components/erp/form-tab-shell';
import { useERPStore } from '@/store/erp-store';
import { PesananCetakTab, PengirimanCetakTab, InvoiceCetakTab, ReturCetakTab } from '@/components/erp/sales/cetak-tabs';
import { PenawaranTab, PenawaranCreateForm, PenawaranCetakTab } from '@/components/erp/sales/penawaran';
// === Update #043 — UI approval (workflow) DIHAPUS dari modul Penjualan &
// Pembelian: dokumen langsung final saat disimpan. Komponen workflow tetap
// dipakai modul lain (kas-bank/persediaan/produksi/aset + Antrean Persetujuan). ===
import { StatusPembayaranBadge } from '@/components/erp/pelunasan/status-badge';
import { useInvoiceSaldos } from '@/lib/use-invoice-saldos';
import type { SalesOrderResponse, SalesOrderSisaResponse, SalesOrderCreate, SalesOrderUpdate, SalesOrderDetailCreate, SalesInvoiceResponse, SalesInvoiceCreate, SalesInvoiceUpdate, SalesInvoiceDetailCreate, SalesReturResponse, SalesReturCreate, SalesReturUpdate, SalesReturDetailCreate, PengirimanBarangResponse, PengirimanBarangCreate, PengirimanBarangUpdate, PengirimanBarangDetailCreate, PengirimanSisaResponse, PelangganDropdown, SyaratBayarResponse, BarangDropdown, BarangResponse, SatuanResponse, GudangResponse, TransaksiBiayaCreate, HardDeleteResponse, PenawaranResponse } from '@/types/api';
import { HardDeleteCancelDialog } from '@/components/erp/hard-delete-cancel-dialog';

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 100;

// ─── Status Badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'DRAFT':
      return <Badge className="border-yellow-200 bg-yellow-100 text-yellow-700 hover:bg-yellow-100">Draft</Badge>;
    case 'DIPROSES':
      return <Badge className="border-blue-200 bg-blue-100 text-blue-700 hover:bg-blue-100">Diproses</Badge>;
    case 'SELESAI':
      return <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Selesai</Badge>;
    case 'DIBATALKAN':
      return <Badge className="border-red-200 bg-red-100 text-red-700 hover:bg-red-100">Dibatalkan</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

// ─── Shared UI ───────────────────────────────────────────────────────────────

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

// ─── Form Detail Types ──────────────────────────────────────────────────────

interface FormDetailRow {
  id: string;
  barangId: string;
  kodeBarang: string;
  barangNama: string;
  harga: string;
  qty: string;
  diskon: string;
  satuanId: string;
  satuanNama: string;
  // === Fix persist salesOrderDetailId: link baris DO ke line SO ===
  salesOrderDetailId?: string;
  // === Update #004: link baris invoice ke line DO (tarik No DO) ===
  deliveryDetailId?: string;
  // === Update #032 — baris ITEM BEBAS (khusus form Invoice): jasa/custom
  // tanpa barang master (ditarik dari SO / diketik manual). barangId kosong
  // + itemNama terisi saat submit (dikirim sebagai null + itemNama). ===
  bebas?: boolean;
  itemNama?: string;
  itemSatuan?: string;
  // === Update #042 — field `dp` per-baris DIHAPUS: nilai yang ditagih
  // dikendalikan header DP/Pelunasan (dpPelunasan) — didistribusikan
  // proporsional otomatis oleh backend (subTotal baris = porsi). ===
}

interface FormBiayaRow {
  id: string;
  nama: string;
  jumlah: string;
}

function newDetailRow(): FormDetailRow {
  // Update #032 — field bebas/itemNama/itemSatuan dipakai form Invoice
  // (jasa/custom tanpa barang master); form Pengiriman tidak memakainya.
  // Update #042 — dp per-baris dihapus (diganti header DP/Pelunasan invoice).
  return { id: crypto.randomUUID(), barangId: '', kodeBarang: '', barangNama: '', harga: '', qty: '1', diskon: '0', satuanId: '', satuanNama: '', bebas: false, itemNama: '', itemSatuan: '' };
}

function newBiayaRow(): FormBiayaRow {
  return { id: crypto.randomUUID(), nama: '', jumlah: '' };
}

// ─── Draft Otomatis (localStorage) — bentuk data per form create ──────────

interface PengirimanDraftData {
  salesOrderId: string;
  pelangganId: string;
  gudangId: string;
  tanggal: string;
  // Update #004: ekspedisi dihapus dari form DO
  alamatPengiriman: string;
  keterangan: string;
  detail: FormDetailRow[];
}

interface InvoicePenjualanDraftData {
  pelangganId: string;
  salesOrderId: string;
  // Update #004: No DO terpilih (tarik data DO → invoice)
  pengirimanId: string;
  tanggal: string;
  // Update #004: syaratBayarId / ekspedisi / tanggalPengiriman / diskonGlobal
  //     dihapus dari form invoice
  alamatPengiriman: string;
  ppn: string;
  // === Update ASAHI — pilihan PPh23/PPN (bisa keduanya/salah satu/tidak sama sekali) ===
  ppnApplicable: boolean;
  pph23Applicable: boolean;
  pph23: string;
  keterangan: string;
  // === Update #042 — DP/Pelunasan (field header invoice): canonical string
  // ("" = kosong). ===
  dpPelunasan?: string;
  detail: FormDetailRow[];
  biayaTambahan: FormBiayaRow[];
}

interface ReturPenjualanDraftData {
  invoiceId: string;
  pengirimanId: string;
  gudangId: string;
  tanggal: string;
  alamatPengembalian: string;
  noPengembalian: string;
  diskonGlobal: string;
  ppn: string;
  keterangan: string;
  quantities: ReturnQuantities;
}

// ─── Detail Table With Price (for SO / Invoice / Retur forms) ──────────────

function DetailTableWithPrice({ rows, setRows, barangOptions, hideDiskon = false, onBarangCreated, allowBebas = false, locked = false }: { rows: FormDetailRow[]; setRows: Dispatch<SetStateAction<FormDetailRow[]>>; barangOptions: BarangDropdown[]; hideDiskon?: boolean; onBarangCreated?: (barang: BarangResponse) => void; allowBebas?: boolean; locked?: boolean }) {
  // Update #004: hideDiskon — invoice tidak lagi menampilkan kolom Diskon %
  // (dokumen invoice tanpa diskon; payload mengirim diskon null).
  // Update #032: allowBebas — form Invoice mengizinkan baris ITEM BEBAS
  // (jasa/custom tanpa barang master; toggle ikon Type di kiri nama). Baris
  // bebas wajib itemNama; satuan teks bebas opsional.
  // Update #042: kolom DP per baris DIHAPUS — nilai yang ditagih kini satu
  // field header "DP/Pelunasan" (dpPelunasan) di panel ringkasan invoice;
  // backend mendistribusikan proporsional ke baris (subTotal = porsi).
  const addRow = useCallback(() => setRows((p) => [...p, newDetailRow()]), [setRows]);
  const removeRow = useCallback((id: string) => setRows((p) => p.filter((r) => r.id !== id)), [setRows]);
  // === Update #045 — LOCK baris hasil tarikan data: baris ter-link ke line
  // SO (salesOrderDetailId) / line DO (deliveryDetailId), ATAU seluruh tabel
  // dikunci via prop locked (dokumen sumber terpilih), tidak bisa diedit &
  // tidak bisa dihapus — data mengikuti dokumen sumber. ===
  const rowLocked = useCallback((r: FormDetailRow) => locked || !!r.salesOrderDetailId || !!r.deliveryDetailId, [locked]);
  // Update #032 — toggle mode baris: master ↔ bebas (reset field yang tidak
  // relevan agar switching bolak-balik tidak menyisakan data nyasar).
  const toggleBebas = useCallback((id: string) => setRows((p) => p.map((r) => (r.id === id ? { ...r, bebas: !r.bebas, barangId: r.bebas ? '' : r.barangId, kodeBarang: r.bebas ? '' : r.kodeBarang, itemNama: r.bebas ? '' : r.itemNama || '', itemSatuan: r.bebas ? '' : r.itemSatuan || '' } : r))), [setRows]);
  // Update #007: terapkan barang ke baris — dipakai manual pick DAN quick-add.
  const applyBarang = useCallback(
    (id: string, value: string, found: BarangDropdown | undefined) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          // Harga jual default (bila diisi di master barang); fallback harga pokok.
          // Normalisasi via Number() — backend mengirim Decimal sebagai string "20000000.00".
          const hargaDefault = found ? (Number(found.hargaJual) > 0 ? String(Number(found.hargaJual)) : String(Number(found.hargaPokok))) : r.harga;
          return { ...r, barangId: value, kodeBarang: found?.kode || '', barangNama: found?.nama || '', harga: hargaDefault };
        })
      );
    },
    [setRows]
  );
  const updateRow = useCallback(
    (id: string, field: keyof FormDetailRow, value: string) => {
      if (field === 'barangId') {
        applyBarang(
          id,
          value,
          barangOptions.find((b) => b.id === value)
        );
        return;
      }
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    },
    [setRows, barangOptions, applyBarang]
  );

  const subtotal = rows.reduce((s, r) => {
    // Update #004: invoice tanpa diskon — subtotal baris = qty × harga
    // (Update #042: DP per baris dihapus; potongan nilai via header DP/Pelunasan).
    const q = parseFloat(r.qty) || 0;
    const h = parseFloat(r.harga) || 0;
    if (hideDiskon) return s + q * h;
    const d = parseFloat(r.diskon) || 0;
    return s + q * h * (1 - d / 100);
  }, 0);

  return (
    <div className="space-y-3">
      <div className="max-h-64 overflow-y-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[100px]">Kode Barang</TableHead>
              <TableHead className="min-w-[200px]">Nama Barang</TableHead>
              <TableHead className="w-[120px] text-right">Harga Satuan</TableHead>
              <TableHead className="w-[80px] text-right">Qty</TableHead>
              {!hideDiskon && <TableHead className="w-[90px] text-right">Diskon %</TableHead>}
              {/* === Update #042 — kolom DP (Rp) per baris DIHAPUS: nilai yang
                  ditagih kini satu field header DP/Pelunasan di panel ringkasan
                  (didistribusikan proporsional oleh backend). === */}
              <TableHead className="w-[140px] text-right">Subtotal</TableHead>
              <TableHead className="w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const q = parseFloat(row.qty) || 0;
              const h = parseFloat(row.harga) || 0;
              const d = hideDiskon ? 0 : parseFloat(row.diskon) || 0;
              // Update #042 — baris selalu nilai penuh (qty × harga, diskon bila
              // tampil); potongan nilai ditangani header DP/Pelunasan.
              const rowSub = q * h * (1 - d / 100);
              return (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">
                    {/* Update #032 — baris bebas: kode tidak ada (bukan barang master). */}
                    {row.bebas ? <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">item bebas</span> : row.kodeBarang || '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {/* Update #032 — toggle master ↔ item bebas (form Invoice). */}
                      {allowBebas && (
                        <Button variant="ghost" size="icon" className={row.bebas ? 'h-7 w-7 shrink-0 text-amber-600' : 'h-7 w-7 shrink-0 text-muted-foreground'} onClick={() => toggleBebas(row.id)} disabled={rowLocked(row)} title={row.bebas ? 'Item bebas (jasa/custom — tidak di master barang). Klik untuk pilih dari master barang.' : 'Pilih dari master barang. Klik untuk ketik item bebas (jasa/custom).'} aria-label={row.bebas ? 'Ganti ke mode master barang' : 'Ganti ke mode item bebas'}>
                          {row.bebas ? <Type className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                      {allowBebas && row.bebas ? (
                        <>
                          <Input aria-label="Nama item bebas" placeholder="Nama item / jasa (bebas)" className="h-8 text-xs" value={row.itemNama || ''} onChange={(e) => updateRow(row.id, 'itemNama', e.target.value)} maxLength={200} disabled={rowLocked(row)} />
                          <Input aria-label="Satuan item bebas" placeholder="Satuan" className="h-8 w-24 text-xs" value={row.itemSatuan || ''} onChange={(e) => updateRow(row.id, 'itemSatuan', e.target.value)} maxLength={50} disabled={rowLocked(row)} />
                        </>
                      ) : (
                        <>
                          <SearchableDropdown className="min-w-0 flex-1" value={row.barangId} onValueChange={(v) => updateRow(row.id, 'barangId', v)} options={barangOptions.map((b) => ({ id: b.id, label: b.nama, subtitle: b.kode }))} placeholder="Pilih barang..." compact disabled={rowLocked(row)} />
                          {/* Update #007: quick add barang langsung di baris */}
                          {!rowLocked(row) && (
                            <QuickAddBarangButton
                              compact
                              onCreated={(b) => {
                                const drop = toBarangDropdown(b);
                                onBarangCreated?.(b);
                                applyBarang(row.id, b.id, drop);
                              }}
                            />
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <CurrencyInput className="h-8 text-right text-xs" value={row.harga} onValueChange={(v) => updateRow(row.id, 'harga', v)} disabled={rowLocked(row)} />
                  </TableCell>
                  <TableCell>
                    <Input type="number" className="h-8 text-right text-xs" value={row.qty} min={1} onChange={(e) => updateRow(row.id, 'qty', e.target.value)} disabled={rowLocked(row)} />
                  </TableCell>
                  {!hideDiskon && (
                    <TableCell>
                      <Input type="number" className="h-8 text-right text-xs" value={row.diskon} min={0} max={100} onChange={(e) => updateRow(row.id, 'diskon', e.target.value)} disabled={rowLocked(row)} />
                    </TableCell>
                  )}
                  {/* === Update #042 — input DP per baris DIHAPUS (nilai
                      ditagih diatur header DP/Pelunasan invoice). === */}
                  <TableCell className="whitespace-nowrap text-right font-mono text-xs font-medium">{formatRp(rowSub)}</TableCell>
                  <TableCell>
                    {/* Update #045 — tombol hapus disembunyikan utk baris terkunci. */}
                    {!rowLocked(row) && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeRow(row.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={hideDiskon ? 6 : 7} className="h-16 text-center text-muted-foreground">
                  Belum ada item. Klik "+ Tambah Baris" untuk menambahkan.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {/* === Update #045 — tombol "Tambah Baris" TIDAK DITAMPILKAN saat menarik
          data dari dokumen sumber (SO / No DO terpilih). === */}
      {!locked && (
        <div className="flex items-center">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addRow}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Tambah Baris
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Totals Breakdown (PPN/PPh23 baris terpisah, mengikuti pilihan pajak) ────

// === Update #042 — prop dpPelunasan (form Invoice): nilai yang ditagih
// invoice ini (field header DP/Pelunasan). > 0 → pajak dihitung atas nilai
// itu + baris potongan "DP/Pelunasan" (subtotal − dp); kosong/0 → perilaku
// lama (tagih subtotal penuh). dpInput = node input yang diletakkan tepat
// SETELAH baris Subtotal (hanya untuk form invoice). ===
function TotalsBreakdown({ subtotal, diskonGlobalPct, ppnPct, totalBiayaTambahan, ppnApplicable = true, pph23Applicable = false, pph23Pct = 0, dpPelunasan = 0, dpInput }: { subtotal: number; diskonGlobalPct: number; ppnPct: number; totalBiayaTambahan: number; ppnApplicable?: boolean; pph23Applicable?: boolean; pph23Pct?: number; dpPelunasan?: number; dpInput?: ReactNode }) {
  const dpEffective = dpPelunasan > 0 ? dpPelunasan : subtotal;
  const totalDiskon = dpEffective * (diskonGlobalPct / 100);
  const dasarPajak = dpEffective - totalDiskon;
  // Update ASAHI: PPN hanya bila dipilih; PPh23 (jika dipilih) memotong grand total.
  // Update #042: PPN/PPh23 dihitung atas nilai ditagih (dp bila terisi).
  const ppnAmount = ppnApplicable ? dasarPajak * (ppnPct / 100) : 0;
  const pph23Amount = pph23Applicable ? dasarPajak * (pph23Pct / 100) : 0;
  const grandTotal = dasarPajak + ppnAmount + totalBiayaTambahan - pph23Amount;

  return (
    <div className="rounded-md border bg-muted/20 px-4 py-3 space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="font-mono">{formatRp(subtotal)}</span>
      </div>
      {/* === Update #042 — input DP/Pelunasan (Rp) tepat setelah baris Subtotal
          (form Invoice): nilai yang ditagih invoice ini — kosong = tagih penuh. === */}
      {/* === Update #045 — baris ringkasan "DP/Pelunasan (nilai ditagih)" &
          "Dialihkan ke invoice berikutnya" DIHAPUS (permintaan user) — nilai
          DP cukup terlihat di input DP/Pelunasan di atas. === */}
      {dpInput && <div className="pt-1">{dpInput}</div>}
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
      {ppnApplicable && (
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground pl-3">+ PPN ({ppnPct}%)</span>
          <span className="font-mono">{formatRp(ppnAmount)}</span>
        </div>
      )}
      {pph23Applicable && (
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground pl-3">- PPh23 ({pph23Pct}%)</span>
          <span className="font-mono text-destructive">({formatRp(pph23Amount)})</span>
        </div>
      )}
      {totalBiayaTambahan > 0 && (
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground pl-3">+ Biaya Tambahan</span>
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

// ─── Detail Table Simple (for Pengiriman form) ──────────────────────────────

function DetailTableSimple({ rows, setRows, barangOptions, satuanOptions, onBarangCreated, onSatuanCreated, locked = false }: { rows: FormDetailRow[]; setRows: Dispatch<SetStateAction<FormDetailRow[]>>; barangOptions: BarangDropdown[]; satuanOptions: SatuanResponse[]; onBarangCreated?: (barang: BarangResponse) => void; onSatuanCreated?: (satuan: SatuanResponse) => void; locked?: boolean }) {
  const addRow = useCallback(() => setRows((p) => [...p, newDetailRow()]), [setRows]);
  const removeRow = useCallback((id: string) => setRows((p) => p.filter((r) => r.id !== id)), [setRows]);
  // === Update #045 — LOCK baris hasil tarikan data: baris ter-link ke line
  // Sales Order (salesOrderDetailId) ATAU seluruh tabel dikunci via prop
  // locked (SO terpilih) — tidak bisa diedit/dihapus; data mengikuti SO. ===
  const rowLocked = useCallback((r: FormDetailRow) => locked || !!r.salesOrderDetailId, [locked]);
  // Update #007: terapkan barang ke baris — dipakai manual pick DAN quick-add.
  // satuanNamaOverride: nama satuan dari response create barang (satuan bisa
  // baru dibuat via nested quick-add, belum ada di satuanOptions host).
  const applyBarang = useCallback(
    (id: string, value: string, found: BarangDropdown | undefined, satuanNamaOverride?: string) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          // Update ASAHI #4: satuan otomatis terpilih dari master barang (base_uom).
          const satuanDefault = found?.satuanId || '';
          const satuanNama = satuanNamaOverride ?? (satuanOptions.find((s) => s.id === satuanDefault)?.nama || '');
          return { ...r, barangId: value, kodeBarang: found?.kode || '', barangNama: found?.nama || '', satuanId: satuanDefault, satuanNama };
        })
      );
    },
    [setRows, satuanOptions]
  );
  const updateRow = useCallback(
    (id: string, field: keyof FormDetailRow, value: string) => {
      if (field === 'barangId') {
        applyBarang(
          id,
          value,
          barangOptions.find((b) => b.id === value)
        );
        return;
      }
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          if (field === 'satuanId') {
            const found = satuanOptions.find((s) => s.id === value);
            return { ...r, satuanId: value, satuanNama: found?.nama || '' };
          }
          return { ...r, [field]: value };
        })
      );
    },
    [setRows, barangOptions, satuanOptions, applyBarang]
  );

  const totalQty = rows.reduce((s, r) => s + (parseFloat(r.qty) || 0), 0);
  const jumlahBarang = rows.length;
  // Update #004: Total Kuantitas & Jumlah Barang tidak lagi ditampilkan di form DO
  // (disimpan hanya untuk kompatibilitas linter; tidak dirender).
  void totalQty;
  void jumlahBarang;

  return (
    <div className="space-y-3">
      <div className="max-h-64 overflow-y-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[100px]">Kode Barang</TableHead>
              <TableHead className="min-w-[200px]">Nama Barang</TableHead>
              <TableHead className="w-[80px] text-right">Qty</TableHead>
              <TableHead className="w-[120px]">Satuan</TableHead>
              <TableHead className="w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs">
                  {/* Update #041 — baris item bebas (SO manufaktur/jasa/custom). */}
                  {row.bebas ? <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">item bebas</span> : row.kodeBarang || '-'}
                  {row.salesOrderDetailId && (
                    <span className="ml-1.5 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700" title="Baris ter-link ke line Sales Order">
                      SO
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {/* Update #041 — baris item bebas: nama diketik manual (bukan dropdown master). */}
                  {row.bebas ? (
                    <Input aria-label="Nama item bebas" placeholder="Nama item / manufaktur (bebas)" className="h-8 text-xs" value={row.itemNama || ''} onChange={(e) => updateRow(row.id, 'itemNama', e.target.value)} maxLength={200} disabled={rowLocked(row)} />
                  ) : (
                    <div className="flex items-center gap-1">
                      <SearchableDropdown className="min-w-0 flex-1" value={row.barangId} onValueChange={(v) => updateRow(row.id, 'barangId', v)} options={barangOptions.map((b) => ({ id: b.id, label: b.nama, subtitle: b.kode }))} placeholder="Pilih barang..." compact disabled={rowLocked(row)} />
                      {/* Update #007: quick add barang langsung di baris */}
                      {!rowLocked(row) && (
                        <QuickAddBarangButton
                          compact
                          onCreated={(b) => {
                            const drop = toBarangDropdown(b);
                            onBarangCreated?.(b);
                            applyBarang(row.id, b.id, drop, b.satuan?.nama);
                          }}
                        />
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Input type="number" className="h-8 text-right text-xs" value={row.qty} min={1} step={1} aria-invalid={(row.bebas || !!row.barangId) && (!Number.isInteger(Number(row.qty)) || Number(row.qty) < 1)} onChange={(e) => updateRow(row.id, 'qty', e.target.value)} disabled={rowLocked(row)} />
                </TableCell>
                <TableCell>
                  {/* Update #041 — baris item bebas: satuan teks bebas (bukan dropdown master). */}
                  {row.bebas ? (
                    <Input aria-label="Satuan item bebas" placeholder="mis. UNIT / JOB" className="h-8 text-xs" value={row.itemSatuan || ''} onChange={(e) => updateRow(row.id, 'itemSatuan', e.target.value)} maxLength={50} disabled={rowLocked(row)} />
                  ) : (
                    <div className="flex items-center gap-1">
                      <SearchableDropdown className="min-w-0 flex-1" value={row.satuanId} onValueChange={(v) => updateRow(row.id, 'satuanId', v)} options={satuanOptions.map((s) => ({ id: s.id, label: s.nama }))} placeholder="Pilih..." compact disabled={rowLocked(row)} />
                      {/* Update #007: quick add satuan langsung di baris */}
                      {!rowLocked(row) && (
                        <QuickAddSatuanButton
                          compact
                          onCreated={(s) => {
                            onSatuanCreated?.(s);
                            updateRow(row.id, 'satuanId', s.id);
                          }}
                        />
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {/* Update #045 — tombol hapus disembunyikan utk baris terkunci. */}
                  {!rowLocked(row) && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeRow(row.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-16 text-center text-muted-foreground">
                  Belum ada item. Klik "+ Tambah Baris" untuk menambahkan.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {/* === Update #045 — tombol "Tambah Baris" TIDAK DITAMPILKAN saat menarik
          data dari Sales Order (baris mengikuti SO terpilih). === */}
      {!locked && (
        <div className="flex items-center">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addRow}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Tambah Baris
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Biaya Tambahan Table (for SO / Invoice forms) ──────────────────────────

function BiayaTambahanTable({ rows, setRows }: { rows: FormBiayaRow[]; setRows: Dispatch<SetStateAction<FormBiayaRow[]>> }) {
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

// ─── Shared Dropdown Loader ─────────────────────────────────────────────────

function useDropdowns() {
  const [pelangganOptions, setPelangganOptions] = useState<PelangganDropdown[]>([]);
  const [syaratBayarOptions, setSyaratBayarOptions] = useState<SyaratBayarResponse[]>([]);
  const [barangOptions, setBarangOptions] = useState<BarangDropdown[]>([]);
  const [satuanOptions, setSatuanOptions] = useState<SatuanResponse[]>([]);
  const [salesOrderOptions, setSalesOrderOptions] = useState<{ id: string; noPesanan: string }[]>([]);
  const [invoiceOptions, setInvoiceOptions] = useState<{ id: string; noInvoice: string }[]>([]);
  const [pengirimanOptions, setPengirimanOptions] = useState<{ id: string; noSuratJalan: string; pelangganId: string }[]>([]);
  const [gudangOptions, setGudangOptions] = useState<GudangResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [pelanggan, syaratBayar, barang, satuan, soRes, invRes, pengRes, gudang] = await Promise.all([api.get<PelangganDropdown[]>('/master/pelanggan-dropdown'), api.get<SyaratBayarResponse[]>('/master/syarat-bayar'), api.get<BarangDropdown[]>('/master/barang-dropdown'), api.get<SatuanResponse[]>('/master/satuan'), api.get<PaginatedResponse<SalesOrderResponse>>('/penjualan/sales-order?limit=200'), api.get<PaginatedResponse<SalesInvoiceResponse>>('/penjualan/sales-invoice?limit=200'), api.get<PaginatedResponse<PengirimanBarangResponse>>('/penjualan/pengiriman?limit=200'), api.get<GudangResponse[]>('/master/gudang')]);
        if (cancelled) return;
        setPelangganOptions(pelanggan);
        setSyaratBayarOptions(syaratBayar);
        setBarangOptions(barang);
        setSatuanOptions(satuan);
        setSalesOrderOptions(soRes.data.map((s) => ({ id: s.id, noPesanan: s.noPesanan })));
        setInvoiceOptions(invRes.data.map((i) => ({ id: i.id, noInvoice: i.noInvoice })));
        setPengirimanOptions(pengRes.data.map((p) => ({ id: p.id, noSuratJalan: p.noSuratJalan, pelangganId: p.pelangganId })));
        setGudangOptions(gudang || []);
      } catch {
        // Silently fail — dropdowns will be empty
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { pelangganOptions, setPelangganOptions, syaratBayarOptions, setSyaratBayarOptions, barangOptions, setBarangOptions, satuanOptions, setSatuanOptions, salesOrderOptions, invoiceOptions, pengirimanOptions, gudangOptions, setGudangOptions, loading };
}

// ═════════════════════════════════════════════════════════════════════════════
// === Update #047 — opsi dokumen sumber yang MASIH PUNYA SISA ===
// Dropdown narik data kini hanya menawarkan dokumen yang belum terpakai
// penuh ("yang sudah terpakai sebelumnya jangan ditampilkan lagi"):
//   - SO di form Pengiriman  → /penjualan/sales-order/tersedia?untuk=pengiriman
//   - SO di form Invoice      → /penjualan/sales-order/tersedia?untuk=invoice
//   - DO di form Invoice      → /penjualan/pengiriman/tersedia
// Fallback ke daftar penuh bila endpoint belum tersedia (backend lama);
// dokumen yang sedang dipilih selalu disisipkan supaya labelnya tetap
// tampil (mis. SO yang kebetulan habis terfaktur oleh invoice yg diedit).
// ═════════════════════════════════════════════════════════════════════════════
interface SoTersediaItem {
  id: string;
  noPesanan: string;
  pelangganId?: string | null;
}

interface DoTersediaItem {
  id: string;
  noSuratJalan: string;
  pelangganId?: string | null;
}

function useTersediaSoOptions(untuk: 'pengiriman' | 'invoice', fallback: { id: string; noPesanan: string }[], currentId?: string, currentLabel?: string) {
  const [rows, setRows] = useState<SoTersediaItem[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .get<SoTersediaItem[]>(`/penjualan/sales-order/tersedia?untuk=${untuk}`)
      .then((r) => {
        if (!cancelled && Array.isArray(r)) setRows(r);
      })
      .catch(() => {
        /* endpoint belum ada (backend belum di-update) → pakai daftar penuh */
      });
    return () => {
      cancelled = true;
    };
  }, [untuk]);
  return useMemo(() => {
    const base = rows ?? fallback;
    if (currentId && !base.some((o) => o.id === currentId)) {
      const label = fallback.find((o) => o.id === currentId)?.noPesanan || currentLabel || currentId;
      return [{ id: currentId, noPesanan: label }, ...base];
    }
    return base;
  }, [rows, fallback, currentId, currentLabel]);
}

function useTersediaDoOptions(fallback: { id: string; noSuratJalan: string; pelangganId: string }[], currentId?: string, currentLabel?: string) {
  const [rows, setRows] = useState<DoTersediaItem[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .get<DoTersediaItem[]>('/penjualan/pengiriman/tersedia')
      .then((r) => {
        if (!cancelled && Array.isArray(r)) setRows(r);
      })
      .catch(() => {
        /* endpoint belum ada (backend belum di-update) → pakai daftar penuh */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return useMemo(() => {
    const base = rows ?? fallback;
    if (currentId && !base.some((o) => o.id === currentId)) {
      const cur = fallback.find((o) => o.id === currentId);
      return [{ id: currentId, noSuratJalan: cur?.noSuratJalan || currentLabel || currentId, pelangganId: cur?.pelangganId || '' }, ...base];
    }
    return base;
  }, [rows, fallback, currentId, currentLabel]);
}

// ═════════════════════════════════════════════════════════════════════════════
// === Update #063 — opsi Invoice untuk form Retur Penjualan: hanya invoice
// yang masih punya sisa retur (yang barisnya sudah diretur penuh tidak
// ditawarkan lagi — kelanjutan permintaan "yang sudah terpakai sebelumnya
// jangan ditampilkan lagi" ke semua modul yang alurnya menarik data).
// Endpoint /penjualan/sales-invoice/tersedia-retur (backend #063);
// fallback ke daftar penuh bila endpoint belum tersedia. Invoice yang
// sedang dipilih (draft dipulihkan) tetap disisipkan supaya label tampil.
// ═════════════════════════════════════════════════════════════════════════════
interface InvoiceTersediaReturItem {
  id: string;
  noInvoice: string;
}

function useTersediaReturInvoiceOptions(fallback: { id: string; noInvoice: string }[], currentId?: string) {
  const [rows, setRows] = useState<InvoiceTersediaReturItem[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .get<InvoiceTersediaReturItem[]>('/penjualan/sales-invoice/tersedia-retur')
      .then((r) => {
        if (!cancelled && Array.isArray(r)) setRows(r);
      })
      .catch(() => {
        /* endpoint belum ada (backend belum di-update) → pakai daftar penuh */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return useMemo(() => {
    const base = rows ?? fallback;
    if (currentId && !base.some((o) => o.id === currentId)) {
      const label = fallback.find((o) => o.id === currentId)?.noInvoice || currentId;
      return [{ id: currentId, noInvoice: label }, ...base];
    }
    return base;
  }, [rows, fallback, currentId]);
}

// ═════════════════════════════════════════════════════════════════════════════
// FORM: Pesanan Penjualan Create
// ═════════════════════════════════════════════════════════════════════════════

function PesananPenjualanCreateForm({ subPage, initialPenawaranId }: { subPage: string; initialPenawaranId?: string }) {
  // Update #033 — initialPenawaranId: form dibuka lewat tombol "Buat SO" di
  // daftar penawaran → penawaran ditarik otomatis saat form dimuat (pelanggan
  // terkunci + seluruh item) supaya user bisa langsung mengatur Pembayaran
  // Termin sebelum menyimpan.
  return <OrderDocumentForm kind="sales" subPage={subPage} initialPenawaranId={initialPenawaranId} />;
}

// ═════════════════════════════════════════════════════════════════════════════
// FORM: Pesanan Penjualan Edit
// ═════════════════════════════════════════════════════════════════════════════

function PesananPenjualanEditForm({ editId, subPage }: { editId: string; subPage: string; initialNoPesanan?: string; initialStatus?: string; initialGrandTotal?: number }) {
  return <OrderDocumentForm kind="sales" editId={editId} subPage={subPage} />;
}

// ═════════════════════════════════════════════════════════════════════════════
// FORM: Pengiriman Barang Create
// ═════════════════════════════════════════════════════════════════════════════

function PengirimanCreateForm({ subPage }: { subPage: string }) {
  const { error: stockError, clearError: clearStockError, handleError: handleStockError } = useStockOperationError('pengiriman_barang');
  const { pelangganOptions, setPelangganOptions, barangOptions, setBarangOptions, satuanOptions, setSatuanOptions, salesOrderOptions, gudangOptions, setGudangOptions, loading: ddLoading } = useDropdowns();
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [fSalesOrderId, setFSalesOrderId] = useState('');
  const [fPelangganId, setFPelangganId] = useState('');
  const [fGudangId, setFGudangId] = useState('');
  const [fTanggal, setFTanggal] = useState('');
  // Update #004: field Ekspedisi dihapus dari form DO.
  const [fAlamatPengiriman, setFAlamatPengiriman] = useState('');
  const [fKeterangan, setFKeterangan] = useState('');
  const [fDetail, setFDetail] = useState<FormDetailRow[]>([newDetailRow()]);
  const [soLoading, setSoLoading] = useState(false);
  // === Update #047 — dropdown SO hanya menawarkan SO yang masih ada sisa
  // kirimnya; fallback ke daftar penuh bila backend belum punya endpoint. ===
  const soOptions = useTersediaSoOptions('pengiriman', salesOrderOptions, fSalesOrderId);
  const userId = useAuthStore((s) => s.user?.id ?? 'anon');
  const draft = useFormDraft<PengirimanDraftData>(draftKey(userId, 'sales', 'pengiriman', 'create'));
  const skipNextSaveRef = useRef(false);
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const d = draft.draft;
    if (!d) return;
    setFSalesOrderId(d.salesOrderId || '');
    setFPelangganId(d.pelangganId || '');
    setFGudangId(d.gudangId || '');
    setFTanggal(d.tanggal || '');
    setFAlamatPengiriman(d.alamatPengiriman || '');
    setFKeterangan(d.keterangan || '');
    setFDetail(Array.isArray(d.detail) && d.detail.length ? d.detail : [newDetailRow()]);
    toast.info('Draft isian dipulihkan', { description: 'Isian terakhir form Pengiriman Barang dimuat kembali otomatis.' });
  }, []);

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
    draft.saveDraft({
      salesOrderId: fSalesOrderId,
      pelangganId: fPelangganId,
      gudangId: fGudangId,
      tanggal: fTanggal,
      alamatPengiriman: fAlamatPengiriman,
      keterangan: fKeterangan,
      detail: fDetail
    });
  }, [fSalesOrderId, fPelangganId, fGudangId, fTanggal, fAlamatPengiriman, fKeterangan, fDetail]);

  const handleDiscardDraft = useCallback(() => {
    skipNextSaveRef.current = true;
    draft.clearDraft();
    setFSalesOrderId('');
    setFPelangganId('');
    setFGudangId('');
    setFTanggal('');
    setFAlamatPengiriman('');
    setFKeterangan('');
    setFDetail([newDetailRow()]);
    setFormErrors({});
  }, []);

  // === Tarik data otomatis SO → Pengiriman (Task 16-c2): saat SO dipilih,
  // ambil SISA qty per baris (endpoint /sisa) dan prefill hanya baris yang
  // masih ada sisaKirim (qty = sisa), plus pelanggan & alamat pengiriman SO.
  // Baris ter-link otomatis mengirim salesOrderDetailId sehingga validasi
  // over-delivery per line aktif di backend (create + finish).
  // Update #041 — baris ITEM BEBAS ikut ditarik (SO manufaktur/jasa/custom):
  // tampil sebagai baris surat jalan TANPA pergerakan stok/HPP saat finish
  // (sebelumnya baris bebas disembunyikan → SO manufaktur tidak bisa dibuat DO).
  const handleSalesOrderChange = useCallback(async (soId: string) => {
    setFSalesOrderId(soId);
    setFormErrors((prev) => ({ ...prev, salesOrderId: '' }));
    if (!soId) return;
    setSoLoading(true);
    try {
      const sisa = await api.get<SalesOrderSisaResponse>(`/penjualan/sales-order/${soId}/sisa`);
      setFPelangganId(sisa.pelangganId || '');
      // Hanya timpa alamat bila SO punya alamat (jangan kosongkan isian user).
      if (sisa.alamatPengiriman) setFAlamatPengiriman(sisa.alamatPengiriman);
      // Update #041 — semua baris dengan sisa kirim ikut (barang master &
      // item bebas — manufaktur/custom).
      const rows = (sisa.details || []).filter((d) => Number(d.sisaKirim) > 0);
      if (rows.length === 0) {
        toast.info('Semua baris SO sudah terkirim sepenuhnya', { description: 'Tidak ada sisa qty yang perlu dikirim untuk SO ini.' });
        setFDetail([]);
        return;
      }
      setFDetail(
        rows.map((d) => ({
          id: crypto.randomUUID(),
          barangId: d.barangId || '',
          kodeBarang: d.kodeBarang || '',
          barangNama: d.namaBarang || '',
          harga: String(d.harga ?? 0),
          qty: String(d.sisaKirim),
          diskon: String(d.diskon ?? 0),
          satuanId: d.satuanId || '',
          satuanNama: d.satuanNama || '',
          salesOrderDetailId: d.salesOrderDetailId,
          // Update #041 — baris item bebas (nama + satuan teks).
          bebas: !d.barangId,
          itemNama: d.itemNama || '',
          itemSatuan: d.itemSatuan || ''
        }))
      );
    } catch {
      // Gagal memuat sisa SO — biarkan user isi baris manual (tanpa link)
    } finally {
      setSoLoading(false);
    }
  }, []);

  // ── Update #4: pilih pelanggan → alamat ditarik otomatis dari master ──
  // (dipakai saat pengiriman dibuat tanpa SO, atau pelanggan diganti manual;
  // memilih SO tetap menimpa alamat dengan alamat SO-nya.)
  const handlePelangganChange = useCallback(
    (id: string, masterOverride?: PelangganDropdown | null) => {
      setFPelangganId(id);
      // Update #007: masterOverride dipakai quick-add (state belum ter-update).
      const master = masterOverride !== undefined ? masterOverride : findPartyMaster(pelangganOptions, id);
      setFAlamatPengiriman(master?.alamat || '');
    },
    [pelangganOptions]
  );

  const handleSubmit = useCallback(async () => {
    const errs: Record<string, string> = {};
    if (!fSalesOrderId) errs.salesOrderId = 'Sales Order wajib diisi';
    if (!fPelangganId) errs.pelangganId = 'Pelanggan wajib diisi';
    if (!fTanggal) errs.tanggal = 'Tanggal wajib diisi';
    if (!fGudangId) errs.gudangId = 'Gudang wajib diisi';
    const detailError = stockLineError(fDetail);
    if (detailError) errs.detail = detailError;
    if (Object.keys(errs).length) {
      setFormErrors(errs);
      // === Update #050 — navigasi otomatis ke field wajib yang terlewat
      // (paritas #049 modul Pembelian). Prefix "dof-" unik untuk form ini
      // supaya tidak salah sasaran saat beberapa tab form terbuka bersamaan. ===
      focusFormError(Object.keys(errs), { prefix: 'dof-' });
      toast.error('Ada field wajib yang belum diisi');
      return;
    }
    setFormErrors({});
    setSubmitting(true);
    try {
      const details: PengirimanBarangDetailCreate[] = fDetail
        // Update #041 — baris ITEM BEBAS ikut tersimpan (barangId null +
        // itemNama/itemSatuan; tanpa stok/HPP — murni baris surat jalan).
        .filter((r) => r.barangId || (r.bebas && (r.itemNama || '').trim()))
        .map((r) => ({
          barangId: r.bebas ? null : r.barangId,
          itemNama: r.bebas ? (r.itemNama || '').trim() : null,
          itemSatuan: r.bebas ? (r.itemSatuan || '').trim() || null : null,
          qty: Number(r.qty),
          satuanId: r.bebas ? null : r.satuanId || null,
          salesOrderDetailId: r.salesOrderDetailId || null
        }));
      const body: PengirimanBarangCreate = {
        tanggal: fTanggal,
        salesOrderId: fSalesOrderId,
        pelangganId: fPelangganId,
        gudangId: fGudangId || null,
        alamatPengiriman: fAlamatPengiriman || null,
        keterangan: fKeterangan || null,
        details
      };
      await api.post('/penjualan/pengiriman', body);
      toast.success('Pengiriman barang berhasil dibuat');
      draft.clearDraft();
      refreshListTab('sales', subPage);
      if (activeTabId) closeTab(activeTabId);
    } catch (e) {
      handleStockError(e, 'Gagal menyimpan pengiriman');
    } finally {
      setSubmitting(false);
    }
  }, [fSalesOrderId, fPelangganId, fGudangId, fTanggal, fAlamatPengiriman, fKeterangan, fDetail, subPage, activeTabId, closeTab, refreshListTab, handleStockError]);

  if (ddLoading) {
    return (
      <FormTabShell title="Buat Pengiriman Barang">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </FormTabShell>
    );
  }

  return (
    <FormTabShell title="Buat Pengiriman Barang">
      <Card className="max-w-5xl">
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">Isi data surat jalan / pengiriman barang baru</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5" id="dof-salesOrderId">
              <Label className="text-xs font-medium">
                Sales Order <span className="text-destructive">*</span>
              </Label>
              <SearchableDropdown value={fSalesOrderId} onValueChange={handleSalesOrderChange} options={soOptions.map((so) => ({ id: so.id, label: so.noPesanan }))} placeholder="Pilih SO..." disabled={soLoading} />
              {soLoading && <p className="text-xs text-muted-foreground mt-1">Memuat detail SO...</p>}
              {formErrors.salesOrderId && <p className="text-xs text-destructive mt-1">{formErrors.salesOrderId}</p>}
            </div>
            <div className="space-y-1.5" id="dof-pelangganId">
              <Label className="text-xs font-medium">
                Pelanggan <span className="text-destructive">*</span>
              </Label>
              <div className="flex items-start gap-1.5">
                {/* Update #4: pilih pelanggan → alamat ditarik otomatis dari master */}
                {/* === Update #045 — pelanggan DIKUNCI saat SO terpilih (menarik
                    data dari SO; pelanggan mengikuti dokumen sumber). === */}
                <SearchableDropdown className="min-w-0 flex-1" value={fPelangganId} onValueChange={handlePelangganChange} options={pelangganOptions.map((p) => ({ id: p.id, label: p.nama }))} placeholder={fSalesOrderId ? 'Mengikuti Sales Order terpilih' : 'Pilih pelanggan...'} disabled={!!fSalesOrderId} />
                {/* Update #007: quick add pelanggan */}
                {!fSalesOrderId && (
                  <QuickAddPelangganButton
                    onCreated={(p) => {
                      const drop = toPelangganDropdown(p);
                      setPelangganOptions((prev) => (prev.some((row) => row.id === p.id) ? prev : [...prev, drop]));
                      handlePelangganChange(p.id, drop);
                      setFormErrors((prev) => (prev.pelangganId ? { ...prev, pelangganId: '' } : prev));
                    }}
                  />
                )}
              </div>
              {formErrors.pelangganId && <p className="text-xs text-destructive mt-1">{formErrors.pelangganId}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              {/* Update #004: label "Tanggal" → "Tanggal Pengiriman". */}
              <Label className="text-xs font-medium">Tanggal Pengiriman</Label>
              <Input type="date" className="h-9 text-xs" value={fTanggal} onChange={(e) => setFTanggal(e.target.value)} />
              {formErrors.tanggal && <p className="text-xs text-destructive">{formErrors.tanggal}</p>}
            </div>
            <div className="space-y-1.5" id="dof-gudangId">
              <Label className="text-xs font-medium">
                Gudang <span className="text-destructive">*</span>
              </Label>
              <div className="flex items-start gap-1.5">
                <SearchableDropdown className="min-w-0 flex-1" value={fGudangId} onValueChange={setFGudangId} options={gudangOptions.map((g) => ({ id: g.id, label: g.kode + ' - ' + g.nama }))} placeholder="Pilih gudang (wajib)..." />
                {/* Update #007: quick add gudang */}
                <QuickAddGudangButton
                  onCreated={(g) => {
                    setGudangOptions((prev) => (prev.some((row) => row.id === g.id) ? prev : [...prev, g]));
                    setFGudangId(g.id);
                    setFormErrors((prev) => (prev.gudangId ? { ...prev, gudangId: '' } : prev));
                  }}
                />
              </div>
              {formErrors.gudangId && <p className="text-xs text-destructive">{formErrors.gudangId}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            {/* Update #004: field Ekspedisi dihapus; Alamat Pengiriman jadi baris penuh. */}
            <Label className="text-xs font-medium">Alamat Pengiriman</Label>
            {/* Update #4: auto-fill dari master Pelanggan saat dipilih */}
            <Textarea className="text-xs min-h-[48px]" value={fAlamatPengiriman} onChange={(e) => setFAlamatPengiriman(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">{AUTOFILL_HINT.pelanggan}</p>
          </div>
          <Separator />
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              Detail Barang <span className="text-destructive">*</span>
            </Label>
            <DetailTableSimple
              rows={fDetail}
              setRows={setFDetail}
              barangOptions={barangOptions}
              satuanOptions={satuanOptions}
              /* Update #045 — baris terkunci saat menarik data dari SO. */
              locked={!!fSalesOrderId}
              onBarangCreated={(b) => {
                setBarangOptions((prev) => (prev.some((row) => row.id === b.id) ? prev : [...prev, toBarangDropdown(b)]));
                // Satuan barang baru (mungkin hasil nested quick-add) didaftarkan ke daftar satuan host.
                const satuan = satuanFromBarang(b);
                if (satuan) setSatuanOptions((prev) => (prev.some((row) => row.id === satuan.id) ? prev : [...prev, satuan]));
              }}
              onSatuanCreated={(s) => setSatuanOptions((prev) => (prev.some((row) => row.id === s.id) ? prev : [...prev, s]))}
            />
            <p className="text-[11px] text-muted-foreground">
              Baris bertanda <span className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 border-emerald-200">SO</span> otomatis ter-link ke line Sales Order — validasi over-delivery aktif. Baris <span className="text-amber-600">item bebas</span> (manufaktur/jasa/custom) ikut tercetak di surat jalan tanpa menggerakkan stok. Pilih ulang SO untuk memuat ulang barisnya.
            </p>
            {formErrors.detail && <p className="text-xs text-destructive mt-1">{formErrors.detail}</p>}
          </div>
          <Separator />
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Keterangan</Label>
            <Textarea className="text-xs min-h-[60px]" value={fKeterangan} onChange={(e) => setFKeterangan(e.target.value)} placeholder="Catatan tambahan..." />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <div className="mr-auto">
              <DraftIndicator hasDraft={draft.hasDraft} ageLabel={draft.draftAgeLabel} onDiscard={handleDiscardDraft} formLabel="Pengiriman Barang" />
            </div>
            <Button variant="outline" size="sm" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting}>
              Batal
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting || !fGudangId}>
              {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Truck className="mr-1.5 h-4 w-4" />}
              {submitting ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </CardContent>
      </Card>
      <StockOperationErrorDialog error={stockError} onClose={clearStockError} />
    </FormTabShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FORM: Pengiriman Barang Edit
// ═════════════════════════════════════════════════════════════════════════════

function PengirimanEditForm({ editId, subPage, initialNoSuratJalan, initialStatus }: { editId: string; subPage: string; initialNoSuratJalan?: string; initialStatus?: string }) {
  const { error: stockError, clearError: clearStockError, handleError: handleStockError } = useStockOperationError('pengiriman_barang');
  const { pelangganOptions, setPelangganOptions, salesOrderOptions, gudangOptions, setGudangOptions, loading: ddLoading } = useDropdowns();
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const [editLoading, setEditLoading] = useState(true);
  const [recordError, setRecordError] = useState('');
  const [editDetails, setEditDetails] = useState<PengirimanBarangResponse['details']>([]);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editNoSuratJalan, setEditNoSuratJalan] = useState(initialNoSuratJalan || '');
  const [editStatus, setEditStatus] = useState(initialStatus || '');

  const [editSalesOrderId, setEditSalesOrderId] = useState('');
  // === Update #047 — nomor SO dokumen ini (label bila SO-nya tidak ada di
  // daftar "tersedia" karena sudah habis terkirim oleh DO yang sedang
  // diedit ini). ===
  const [editSoNo, setEditSoNo] = useState('');
  const [editPelangganId, setEditPelangganId] = useState('');
  const [editGudangId, setEditGudangId] = useState('');
  const [editTanggal, setEditTanggal] = useState('');
  // Update #004: field Ekspedisi dihapus dari form DO (edit).
  const [editAlamatPengiriman, setEditAlamatPengiriman] = useState('');
  const [editKeterangan, setEditKeterangan] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setEditLoading(true);
      setRecordError('');
      try {
        const p = await api.get<PengirimanBarangResponse>(`/penjualan/pengiriman/${editId}`);
        if (cancelled) return;
        setEditNoSuratJalan(p.noSuratJalan);
        setEditStatus(p.status);
        setEditDetails(p.details);
        setEditSalesOrderId(p.salesOrderId || '');
        setEditSoNo(p.salesOrder?.noPesanan || '');
        setEditPelangganId(p.pelangganId || '');
        setEditGudangId(p.gudangId || '');
        setEditTanggal(p.tanggal ? p.tanggal.slice(0, 10) : '');
        setEditAlamatPengiriman(p.alamatPengiriman || '');
        setEditKeterangan(p.keterangan || '');
      } catch (e) {
        if (!cancelled) setRecordError(e instanceof ApiError ? e.detail : 'Gagal memuat data pengiriman');
      } finally {
        if (!cancelled) setEditLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [editId]);

  // ── Update #4: pilih pelanggan → alamat ditarik otomatis dari master ──
  // === Update #047 — dropdown SO hanya menawarkan SO yang masih ada sisa
  // kirimnya; SO milik DO ini selalu disisipkan (label tetap tampil). ===
  const soOptions = useTersediaSoOptions('pengiriman', salesOrderOptions, editSalesOrderId, editSoNo);

  const handleEditPelangganChange = useCallback(
    (id: string, masterOverride?: PelangganDropdown | null) => {
      setEditPelangganId(id);
      // Update #007: masterOverride dipakai quick-add (state belum ter-update).
      const master = masterOverride !== undefined ? masterOverride : findPartyMaster(pelangganOptions, id);
      setEditAlamatPengiriman(master?.alamat || '');
    },
    [pelangganOptions]
  );

  const handleEditSubmit = useCallback(async () => {
    if (!editPelangganId) {
      toast.error('Pelanggan wajib diisi');
      return;
    }
    if (!editGudangId || !editTanggal || recordError) {
      toast.error(recordError || 'Tanggal dan gudang wajib diisi');
      return;
    }
    setEditSubmitting(true);
    try {
      const body: PengirimanBarangUpdate = {
        tanggal: editTanggal,
        salesOrderId: editSalesOrderId || undefined,
        pelangganId: editPelangganId,
        gudangId: editGudangId || null,
        alamatPengiriman: editAlamatPengiriman || null,
        keterangan: editKeterangan || null
      };
      await api.put<PengirimanBarangResponse>(`/penjualan/pengiriman/${editId}`, body);
      toast.success('Pengiriman barang berhasil diperbarui');
      refreshListTab('sales', subPage);
      if (activeTabId) closeTab(activeTabId);
    } catch (e) {
      handleStockError(e, 'Gagal memperbarui pengiriman');
    } finally {
      setEditSubmitting(false);
    }
  }, [editId, editPelangganId, editGudangId, editTanggal, editSalesOrderId, editAlamatPengiriman, editKeterangan, subPage, activeTabId, closeTab, refreshListTab, recordError, handleStockError]);

  return (
    <FormTabShell title="Edit Pengiriman Barang">
      <Card className="max-w-5xl">
        <CardContent className="p-6 space-y-4">
          {editLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {recordError && (
                <p role="alert" className="text-sm text-destructive">
                  {recordError}
                </p>
              )}
              <p className="text-sm text-muted-foreground">Perbarui data header surat jalan (detail barang tidak dapat diubah)</p>
              <div className="flex flex-wrap items-center gap-4 rounded-md border bg-muted/30 px-4 py-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5" />
                  {/* Update #004: label "No Surat Jalan" → "No Pengiriman". */}
                  <span>No Pengiriman:</span>
                  <span className="font-mono font-semibold text-foreground">{editNoSuratJalan}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>Status:</span>
                  <StatusBadge status={editStatus} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Sales Order</Label>
                  <SearchableDropdown value={editSalesOrderId} onValueChange={setEditSalesOrderId} options={soOptions.map((so) => ({ id: so.id, label: so.noPesanan }))} placeholder="Pilih SO..." />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    Pelanggan <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex items-start gap-1.5">
                    {/* === Update #046 — pelanggan DIKUNCI saat SO terpilih
                        (mengikuti dokumen sumber — paritas form create). === */}
                    <SearchableDropdown className="min-w-0 flex-1" value={editPelangganId} onValueChange={handleEditPelangganChange} options={pelangganOptions.map((p) => ({ id: p.id, label: p.nama }))} placeholder={editSalesOrderId ? 'Mengikuti Sales Order terpilih' : 'Pilih pelanggan...'} disabled={!!editSalesOrderId} />
                    {/* Update #007: quick add pelanggan.
                        === Update #046 — DISEMBUNYIKAN saat SO terpilih (narik data). === */}
                    {!editSalesOrderId && (
                      <QuickAddPelangganButton
                        onCreated={(p) => {
                          const drop = toPelangganDropdown(p);
                          setPelangganOptions((prev) => (prev.some((row) => row.id === p.id) ? prev : [...prev, drop]));
                          handleEditPelangganChange(p.id, drop);
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  {/* Update #004: label "Tanggal" → "Tanggal Pengiriman". */}
                  <Label className="text-xs font-medium">Tanggal Pengiriman</Label>
                  <Input type="date" className="h-9 text-xs" value={editTanggal} onChange={(e) => setEditTanggal(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    Gudang <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex items-start gap-1.5">
                    <SearchableDropdown className="min-w-0 flex-1" value={editGudangId} onValueChange={setEditGudangId} options={gudangOptions.map((g) => ({ id: g.id, label: g.kode + ' - ' + g.nama }))} placeholder="Pilih gudang (wajib)..." />
                    {/* Update #007: quick add gudang */}
                    <QuickAddGudangButton
                      onCreated={(g) => {
                        setGudangOptions((prev) => (prev.some((row) => row.id === g.id) ? prev : [...prev, g]));
                        setEditGudangId(g.id);
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                {/* Update #004: field Ekspedisi dihapus; Alamat Pengiriman jadi baris penuh. */}
                <Label className="text-xs font-medium">Alamat Pengiriman</Label>
                {/* Update #4: auto-fill dari master Pelanggan saat dipilih */}
                <Textarea className="text-xs min-h-[48px]" value={editAlamatPengiriman} onChange={(e) => setEditAlamatPengiriman(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">{AUTOFILL_HINT.pelanggan}</p>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Detail Barang (tersimpan)</Label>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Barang</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Satuan</TableHead>
                        <TableHead>Line SO</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {editDetails.map((line) => (
                        <TableRow key={line.id}>
                          {/* Update #041 — baris item bebas (SO manufaktur/custom). */}
                          <TableCell>{line.barang?.nama || line.itemNama || line.barangId}</TableCell>
                          <TableCell className={Number(line.qty) <= 0 ? 'text-destructive' : undefined}>{line.qty}</TableCell>
                          <TableCell>{line.satuan?.nama || line.itemSatuan || line.satuanId}</TableCell>
                          <TableCell>
                            {line.salesOrderDetailId ? (
                              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700" title={`Terkait line SO ${line.salesOrderDetailId}`}>
                                SO ✓
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground">Detail tersimpan hanya dapat dilihat pada form ini. Perubahan qty/detail belum didukung. Baris berlabel SO ✓ ter-link ke line Sales Order (validasi over-delivery aktif).</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Keterangan</Label>
                <Textarea className="text-xs min-h-[60px]" value={editKeterangan} onChange={(e) => setEditKeterangan(e.target.value)} placeholder="Catatan tambahan..." />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => activeTabId && closeTab(activeTabId)} disabled={editSubmitting}>
                  Batal
                </Button>
                <Button size="sm" onClick={handleEditSubmit} disabled={editSubmitting || !editGudangId || !!recordError}>
                  {editSubmitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Pencil className="mr-1.5 h-4 w-4" />}
                  {editSubmitting ? 'Menyimpan...' : 'Simpan Perubahan'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <StockOperationErrorDialog error={stockError} onClose={clearStockError} />
    </FormTabShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FORM: Invoice Penjualan Create
// ═════════════════════════════════════════════════════════════════════════════
// === Update #045 — kartu "Sisa Pembayaran dari Penawaran" (SoPenawaranCard +
// fetchSoPenawaranInfo) DIHAPUS dari form Invoice (permintaan user): keterangan
// sisa pembayaran tidak perlu tampil saat pembuatan invoice. ===

function InvoicePenjualanCreateForm({ subPage }: { subPage: string }) {
  // Update #004: + pengirimanOptions (tarik No DO); syaratBayarOptions tidak dipakai lagi.
  const { pelangganOptions, setPelangganOptions, barangOptions, setBarangOptions, satuanOptions, setSatuanOptions, salesOrderOptions, pengirimanOptions, loading: ddLoading } = useDropdowns();
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [fPelangganId, setFPelangganId] = useState('');
  const [fSalesOrderId, setFSalesOrderId] = useState('');
  // === Update #004: pilihan No DO — tarik data DO ke table invoice
  //     (mirror pola Link ke Sales Order; link per baris via deliveryDetailId). ===
  const [fPengirimanId, setFPengirimanId] = useState('');
  const [fTanggal, setFTanggal] = useState('');
  // Update #004: Syarat Pembayaran / Ekspedisi / Tanggal Pengiriman / Diskon
  // Global dihapus dari form invoice (sesuai catatan user).
  const [fAlamatPengiriman, setFAlamatPengiriman] = useState('');
  const [fPpn, setFPpn] = useState('11');
  // === Update ASAHI — pilihan PPh23/PPN saat input SI (bisa keduanya,
  // salah satu, atau tidak sama sekali) ===
  const [fPpnApplicable, setFPpnApplicable] = useState(true);
  const [fPph23Applicable, setFPph23Applicable] = useState(false);
  const [fPph23, setFPph23] = useState('2');
  const [fKeterangan, setFKeterangan] = useState('');
  const [fDetail, setFDetail] = useState<FormDetailRow[]>([newDetailRow()]);
  const [fBiayaTambahan, setFBiayaTambahan] = useState<FormBiayaRow[]>([]);
  const [soLoading, setSoLoading] = useState(false);
  const [doLoading, setDoLoading] = useState(false);
  // === Update #042 — DP/Pelunasan (field header invoice): nilai yang ditagih
  // invoice ini (canonical string CurrencyInput; "" = kosong). SO terpilih →
  // auto-terisi sisa tagihan SO (sisaNilai) & dibatasi ≤ sisa; standalone →
  // kosong = tagih penuh subtotal (bila diisi: 0 < x ≤ Σ gross baris). ===
  const [fDpPelunasan, setFDpPelunasan] = useState('');
  // === Update #042 — info sisa tagihan NILAI SO terpilih (endpoint
  // /sales-order/{id}/sisa → sisaNilai): dipakai hint + validasi batas atas
  // DP/Pelunasan (wajib > 0 dan ≤ sisa saat SO ter-link). ===
  const [soSisaInfo, setSoSisaInfo] = useState<{ noPesanan: string; sisaNilai: number } | null>(null);
  // AUD-10 (update #04) — tarif default dari setting global (RATE_PPN/RATE_PPH23)
  const defaultRates = useDefaultTaxRates();
  useEffect(() => {
    if (defaultRates) {
      setFPpn(defaultRates.ppn);
      setFPph23(defaultRates.pph23);
    }
  }, [defaultRates]);

  // === Update #4 (C4): info read-only No SO · No PO customer dari SO terpilih ===
  const [soRefInfo, setSoRefInfo] = useState<{ noPesanan: string; customerPoNumber: string } | null>(null);

  // === Update #4 (C4): muat info No SO + No PO customer dari SO (GET sales-order/{id}).
  // Dipakai saat SO dipilih manual maupun saat draft dipulihkan (salesOrderId tersimpan).
  // Update #045 — fetch kartu Sisa Pembayaran penawaran dihapus (kartu tidak
  // lagi ditampilkan; hanya info No SO · No PO yang dimuat).
  // Update #042 — mengembalikan objek SO (info header saja — PPN invoice tidak
  // lagi mengikuti SO karena SO tanpa PPN sejak #042). ===
  const loadSoRefInfo = useCallback(async (soId: string): Promise<SalesOrderResponse | null> => {
    try {
      const so = await api.get<SalesOrderResponse>(`/penjualan/sales-order/${soId}`);
      setSoRefInfo({ noPesanan: so.noPesanan || '', customerPoNumber: so.customerPoNumber || '' });
      return so;
    } catch {
      setSoRefInfo(null);
      return null;
    }
  }, []);

  // === Update #042 — muat SISA TAGIHAN NILAI SO (endpoint /sisa → sisaNilai)
  // untuk hint + validasi DP/Pelunasan. autoFillPenuhBaris = Σ nilai penuh
  // baris yang ditarik (bila > 0 → prefill min(sisaNilai, Σ); selain itu
  // sisaNilai) — dipakai saat SO dipilih (baris dari SO) / auto-link dari
  // No DO (baris dari DO). autoFill=false → hanya mengisi info tanpa
  // mengubah fDpPelunasan (dipakai saat draft dipulihkan). ===
  const applySoSisaInfo = useCallback(async (soId: string, penuhNilaiBaris: number, autoFill: boolean) => {
    try {
      const sisa = await api.get<SalesOrderSisaResponse>(`/penjualan/sales-order/${soId}/sisa`);
      const sisaNilai = Number(sisa.sisaNilai) || 0;
      setSoSisaInfo({ noPesanan: sisa.noPesanan || '', sisaNilai });
      if (autoFill) {
        const autoDp = penuhNilaiBaris > 0 ? Math.min(sisaNilai, penuhNilaiBaris) : sisaNilai;
        setFDpPelunasan(autoDp > 0 ? String(autoDp) : '');
      }
    } catch {
      setSoSisaInfo(null);
    }
  }, []);

  // ── Update #4: pilih pelanggan → alamat ditarik otomatis
  // dari master (memilih SO/DO setelahnya tetap menimpa dengan datanya).
  // Update #004: syarat bayar tidak lagi ditarik (field dihapus dari invoice). ──
  // === Update #047 — dropdown SO & DO hanya menawarkan dokumen yang masih
  // ada sisanya (endpoint tersedia; fallback daftar penuh bila backend lama). ===
  const soOptions = useTersediaSoOptions('invoice', salesOrderOptions, fSalesOrderId);
  const doOptionsTersedia = useTersediaDoOptions(pengirimanOptions, fPengirimanId);

  const handlePelangganChange = useCallback(
    (id: string, masterOverride?: PelangganDropdown | null) => {
      setFPelangganId(id);
      // Update #007: masterOverride dipakai quick-add (state belum ter-update).
      const master = masterOverride !== undefined ? masterOverride : findPartyMaster(pelangganOptions, id);
      setFAlamatPengiriman(master?.alamat || '');
    },
    [pelangganOptions]
  );

  // ── Draft otomatis (form create; dipulihkan saat kembali ke form ini) ──
  const userId = useAuthStore((s) => s.user?.id ?? 'anon');
  const draft = useFormDraft<InvoicePenjualanDraftData>(draftKey(userId, 'sales', 'sales-invoice', 'create'));
  const skipNextSaveRef = useRef(false);
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const d = draft.draft;
    if (!d) return;
    setFPelangganId(d.pelangganId || '');
    setFSalesOrderId(d.salesOrderId || '');
    setFPengirimanId(d.pengirimanId || '');
    setFTanggal(d.tanggal || '');
    setFAlamatPengiriman(d.alamatPengiriman || '');
    // === Update #046 — tarif PPN/PPh23 TIDAK dipulihkan dari draft lagi:
    // nilainya terkunci & selalu mengikuti Referensi → Perpajakan
    // (RATE_PPN / RATE_PPH23). Pilihan pakai/tidak tetap dipulihkan. ===
    setFPpnApplicable(d.ppnApplicable ?? true);
    setFPph23Applicable(d.pph23Applicable ?? false);
    setFKeterangan(d.keterangan || '');
    // Update #042 — pulihkan DP/Pelunasan dari draft (isian user dipertahankan).
    setFDpPelunasan(d.dpPelunasan || '');
    setFDetail(Array.isArray(d.detail) && d.detail.length ? d.detail : [newDetailRow()]);
    setFBiayaTambahan(Array.isArray(d.biayaTambahan) ? d.biayaTambahan : []);
    // Update #4: pulihkan info box No SO · No PO bila draft punya SO terpilih.
    // Update #042 — pulihkan juga info sisa tagihan SO (tanpa menimpa nilai DP
    // dari draft — autoFill=false).
    if (d.salesOrderId) {
      void loadSoRefInfo(d.salesOrderId);
      void applySoSisaInfo(d.salesOrderId, 0, false);
    }
    toast.info('Draft isian dipulihkan', { description: 'Isian terakhir form Invoice Penjualan dimuat kembali otomatis.' });
  }, []);

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
    draft.saveDraft({
      pelangganId: fPelangganId,
      salesOrderId: fSalesOrderId,
      pengirimanId: fPengirimanId,
      tanggal: fTanggal,
      alamatPengiriman: fAlamatPengiriman,
      ppn: fPpn,
      ppnApplicable: fPpnApplicable,
      pph23Applicable: fPph23Applicable,
      pph23: fPph23,
      keterangan: fKeterangan,
      // Update #042 — DP/Pelunasan ikut tersimpan di draft.
      dpPelunasan: fDpPelunasan,
      detail: fDetail,
      biayaTambahan: fBiayaTambahan
    });
  }, [fPelangganId, fSalesOrderId, fPengirimanId, fTanggal, fAlamatPengiriman, fPpn, fPpnApplicable, fPph23Applicable, fPph23, fKeterangan, fDpPelunasan, fDetail, fBiayaTambahan]);

  const handleDiscardDraft = useCallback(() => {
    skipNextSaveRef.current = true;
    draft.clearDraft();
    setFPelangganId('');
    setFSalesOrderId('');
    setFPengirimanId('');
    setSoRefInfo(null);
    // Update #042 — reset info sisa SO & DP/Pelunasan.
    setSoSisaInfo(null);
    setFDpPelunasan('');
    setFTanggal('');
    setFAlamatPengiriman('');
    // === Update #046 — reset tarif mengikuti Referensi → Perpajakan (bukan
    // hardcoded 11/2 — nilai terkunci dari settings global). ===
    setFPpn(defaultRates?.ppn ?? '11');
    setFPpnApplicable(true);
    setFPph23Applicable(false);
    setFPph23(defaultRates?.pph23 ?? '2');
    setFKeterangan('');
    setFDetail([newDetailRow()]);
    setFBiayaTambahan([]);
    setFormErrors({});
  }, [defaultRates]);

  // === Tarik data otomatis SO → Invoice Penjualan (Task 16-c2): saat SO
  // dipilih, ambil SISA qty per baris (endpoint /sisa), auto-set pelanggan,
  // dan prefill hanya baris yang masih ada sisaFaktur (harga/diskon mengikuti
  // line SO). Baris ter-link mengirim salesOrderDetailId sehingga komputasi
  // sisa faktur per SO line di backend tetap akurat.
  // Pilihan "Tidak ada" (kosong) TIDAK menghapus baris — user tetap bisa manual.
  // Update #4 (C4): selain sisa, muat info No SO · No PO customer utk info box.
  // === Update #042 — DP/Pelunasan auto-terisi sisa tagihan NILAI SO
  // (sisa.sisaNilai; bila Σ nilai penuh baris yang ditarik lebih kecil →
  // pakai Σ itu — baris parsial). Baris TANPA dp per-baris (dihapus #042). ===
  const handleSalesOrderChange = useCallback(
    async (soId: string) => {
      setFSalesOrderId(soId);
      // Update #004: ganti SO → lepas pilihan No DO (sumber baris tabel berubah).
      setFPengirimanId('');
      if (!soId) {
        setSoRefInfo(null);
        // Update #042 — SO dilepas → invoice standalone: info sisa & DP dikosongkan.
        setSoSisaInfo(null);
        setFDpPelunasan('');
        return;
      }
      setSoLoading(true);
      try {
        const sisa = await api.get<SalesOrderSisaResponse>(`/penjualan/sales-order/${soId}/sisa`);
        setFPelangganId(sisa.pelangganId || '');
        // Update #032 — baris ITEM BEBAS ikut difakturkan (jasa/custom —
        // pendapatan tanpa stok); barang master difakturkan sisa qty-nya.
        const rows = (sisa.details || []).filter((d) => Number(d.sisaFaktur) > 0);
        // === Update #042 — sisa tagihan NILAI SO + auto-isi DP/Pelunasan:
        // min(sisaNilai, Σ nilai penuh baris yang ditarik). ===
        const sisaNilai = Number(sisa.sisaNilai) || 0;
        setSoSisaInfo({ noPesanan: sisa.noPesanan || '', sisaNilai });
        const penuhBaris = rows.reduce((s, d) => s + (Number(d.sisaFaktur) || 0) * (Number(d.harga) || 0), 0);
        const autoDp = penuhBaris > 0 ? Math.min(sisaNilai, penuhBaris) : sisaNilai;
        setFDpPelunasan(autoDp > 0 ? String(autoDp) : '');
        if (rows.length === 0) {
          toast.info('Semua baris SO sudah terfaktur sepenuhnya', { description: 'Tidak ada sisa qty yang perlu difaktur untuk SO ini.' });
          setFDetail([]);
        } else {
          setFDetail(
            rows.map((d) => ({
              id: crypto.randomUUID(),
              barangId: d.barangId || '',
              kodeBarang: d.kodeBarang || '',
              barangNama: d.namaBarang || '',
              harga: String(d.harga ?? 0),
              qty: String(d.sisaFaktur),
              // Update #004: invoice tanpa diskon — kolom Diskon dihapus.
              diskon: '0',
              satuanId: d.satuanId || '',
              satuanNama: d.satuanNama || d.itemSatuan || '',
              salesOrderDetailId: d.salesOrderDetailId,
              // Update #032 — item bebas (jasa/custom) tanpa barang master.
              bebas: !d.barangId,
              itemNama: d.itemNama || '',
              itemSatuan: d.itemSatuan || ''
              // Update #042 — dp per baris DIHAPUS (nilai ditagih = header DP/Pelunasan).
            }))
          );
        }
      } catch {
        // Gagal memuat sisa SO — biarkan user isi baris manual
        // Update #042 — info sisa tidak tersedia → validasi/hint disembunyikan.
        setSoSisaInfo(null);
      }
      // Info box No SO · No PO (gagal → sembunyikan; tidak mengganggu prefill baris).
      await loadSoRefInfo(soId);
      setSoLoading(false);
    },
    [loadSoRefInfo]
  );

  // === Update #004: Tarik data otomatis No DO → Invoice Penjualan — mirror
  // pola "Link ke Sales Order": saat No DO dipilih, ambil SISA qty per baris DO
  // (endpoint /pengiriman/{id}/sisa), auto-set pelanggan + header SO (agar No SO
  // / No PO tercetak), dan prefill hanya baris dengan sisaFaktur > 0.
  // Baris ter-link mengirim deliveryDetailId (dan salesOrderDetailId bila ada)
  // sehingga No DO tercetak di dokumen + validasi over-invoice aktif. ===
  const handlePengirimanChange = useCallback(
    async (doId: string) => {
      setFPengirimanId(doId);
      if (!doId) return;
      setDoLoading(true);
      try {
        const sisa = await api.get<PengirimanSisaResponse>(`/penjualan/pengiriman/${doId}/sisa`);
        setFPelangganId(sisa.pelangganId || '');
        if (sisa.alamatPengiriman) setFAlamatPengiriman(sisa.alamatPengiriman);
        // Auto-link header SO dari DO (No SO & No PO customer ikut tercetak).
        // === Update #042 — SO auto-link juga memuat info sisa tagihan NILAI SO
        // (untuk hint + validasi DP/Pelunasan) dan meng-auto-isi nilai DP dari
        // sisa SO (min(sisaNilai, Σ nilai penuh baris DO yang ditarik)). ===
        const doRows = (sisa.details || []).filter((d) => Number(d.sisaFaktur) > 0);
        const penuhBaris = doRows.reduce((s, d) => s + (Number(d.sisaFaktur) || 0) * (Number(d.harga) || 0), 0);
        if (sisa.salesOrderId) {
          setFSalesOrderId(sisa.salesOrderId);
          await loadSoRefInfo(sisa.salesOrderId);
          await applySoSisaInfo(sisa.salesOrderId, penuhBaris, true);
        } else {
          setFSalesOrderId('');
          setSoRefInfo(null);
          // Update #042 — DO tanpa SO → invoice standalone: info sisa disembunyikan.
          setSoSisaInfo(null);
        }
        const rows = doRows;
        if (rows.length === 0) {
          toast.info('Semua baris DO sudah terfaktur sepenuhnya', { description: 'Tidak ada sisa qty yang perlu difaktur untuk DO ini.' });
          setFDetail([]);
        } else {
          setFDetail(
            rows.map((d) => ({
              id: crypto.randomUUID(),
              // Update #041 — barangId bisa null (baris DO item bebas).
              barangId: d.barangId || '',
              kodeBarang: d.kodeBarang || '',
              barangNama: d.namaBarang || '',
              harga: String(d.harga ?? 0),
              qty: String(d.sisaFaktur),
              // Update #004: invoice tanpa diskon — kolom Diskon dihapus.
              diskon: '0',
              satuanId: d.satuanId || '',
              satuanNama: d.satuanNama || d.itemSatuan || '',
              salesOrderDetailId: d.salesOrderDetailId || undefined,
              deliveryDetailId: d.deliveryDetailId,
              // Update #041 — baris DO item bebas (SO manufaktur/custom).
              // Update #042 — dp per baris DIHAPUS (nilai ditagih = header
              // DP/Pelunasan invoice).
              bebas: !d.barangId,
              itemNama: d.itemNama || '',
              itemSatuan: d.itemSatuan || ''
            }))
          );
        }
      } catch {
        // Gagal memuat sisa DO — biarkan user isi baris manual
      } finally {
        setDoLoading(false);
      }
    },
    [loadSoRefInfo, applySoSisaInfo]
  );

  // Update #004: opsi No DO difilter per pelanggan terpilih (bila ada).
  const doOptions = useMemo(() => {
    // === Update #047 — basis daftar DO: hanya yang masih punya sisa faktur
    // (endpoint /pengiriman/tersedia; fallback daftar penuh bila backend
    // lama), lalu difilter per pelanggan terpilih. DO terpilih selalu
    // disisipkan oleh hook agar labelnya tetap tampil. ===
    const base = doOptionsTersedia;
    return fPelangganId ? base.filter((p) => p.pelangganId === fPelangganId) : base;
  }, [doOptionsTersedia, fPelangganId]);

  const formSubtotal = useMemo(
    () =>
      fDetail.reduce((s, r) => {
        // Update #004: invoice tanpa diskon — subtotal baris = qty × harga
        // (Update #042: nilai penuh baris — potongan via header DP/Pelunasan).
        const q = parseFloat(r.qty) || 0;
        const h = parseFloat(r.harga) || 0;
        return s + q * h;
      }, 0),
    [fDetail]
  );

  const formTotalBiaya = useMemo(() => fBiayaTambahan.reduce((s, b) => s + (parseFloat(b.jumlah) || 0), 0), [fBiayaTambahan]);

  const handleSubmit = useCallback(async () => {
    const errs: Record<string, string> = {};
    if (!fPelangganId) errs.pelangganId = 'Pelanggan wajib diisi';
    if (!fTanggal) errs.tanggal = 'Tanggal wajib diisi';
    // Update #032 — baris boleh barang master ATAU item bebas (jasa/custom).
    if (!fDetail.some((r) => r.barangId || (r.bebas && (r.itemNama || '').trim()))) errs.detail = 'Minimal 1 baris (barang atau item bebas) harus diisi';
    if (fDetail.some((r) => r.bebas && !(r.itemNama || '').trim())) errs.detail = 'Setiap baris item bebas wajib memiliki nama item';
    // === Update #042 — validasi DP/Pelunasan (field header invoice):
    // • SO terpilih → WAJIB > 0 dan ≤ sisaNilai (melebihi = error merah).
    // • Standalone → kosong = tagih penuh subtotal; bila diisi harus
    //   0 < x ≤ Σ gross baris (qty × harga). ===
    const dpNum = Number(fDpPelunasan) || 0;
    if (fSalesOrderId) {
      if (dpNum <= 0) errs.dpPelunasan = 'DP/Pelunasan wajib diisi (nilai yang ditagih invoice ini) bila invoice ter-link Sales Order';
      else if (soSisaInfo && dpNum > soSisaInfo.sisaNilai + 0.01) errs.dpPelunasan = 'Nilai DP/Pelunasan melebihi sisa tagihan SO';
    } else if (dpNum > 0 && dpNum > formSubtotal + 0.01) {
      errs.dpPelunasan = 'Nilai DP/Pelunasan melebihi total nilai baris (subtotal)';
    }
    if (Object.keys(errs).length) {
      setFormErrors(errs);
      // === Update #050 — navigasi otomatis ke field wajib yang terlewat
      // (prefix "sif-" unik untuk form Invoice Penjualan). ===
      focusFormError(Object.keys(errs), { prefix: 'sif-' });
      toast.error('Ada field wajib yang belum diisi');
      return;
    }
    setSubmitting(true);
    try {
      const details: SalesInvoiceDetailCreate[] = fDetail
        .filter((r) => r.barangId || (r.bebas && (r.itemNama || '').trim()))
        .map((r) => {
          const qty = parseFloat(r.qty) || 0;
          const harga = parseFloat(r.harga) || 0;
          // Update #004: invoice tanpa diskon — diskon dikirim null.
          // Update #042 — dp per baris DIHAPUS: nilai yang ditagih dikendalikan
          // header dpPelunasan (backend mendistribusikan proporsional —
          // subTotal baris = porsi; subTotal di bawah tetap dikirim nilai
          // penuh baris untuk dokumentasi harga).
          // Task 16-c2 / #004: link per baris ke line SO dan/atau line DO
          // (bila baris ditarik dari SO / No DO).
          // Update #032 — baris BEBAS: barangId null + itemNama/itemSatuan
          // (jasa/custom — posting ke akun Pendapatan default).
          return {
            barangId: r.bebas ? null : r.barangId,
            itemNama: r.bebas ? (r.itemNama || '').trim() : null,
            itemSatuan: r.bebas ? (r.itemSatuan || '').trim() || null : null,
            harga,
            qty,
            diskon: null,
            subTotal: qty * harga,
            salesOrderDetailId: r.salesOrderDetailId || null,
            deliveryDetailId: r.deliveryDetailId || null
          };
        });
      const biaya: TransaksiBiayaCreate[] = fBiayaTambahan
        .filter((b) => b.nama)
        .map((b) => ({
          nama: b.nama,
          jumlah: parseFloat(b.jumlah) || 0
        }));
      const body: SalesInvoiceCreate = {
        autoPostJurnal: false,
        tanggal: fTanggal,
        pelangganId: fPelangganId,
        // Update #004: syaratBayarId / ekspedisi / tanggalPengiriman /
        // diskonGlobal tidak lagi dikirim (field dihapus dari dokumen invoice).
        salesOrderId: fSalesOrderId || null,
        alamatPengiriman: fAlamatPengiriman || null,
        ppn: parseFloat(fPpn) || 0,
        // === Update ASAHI — pilihan PPh23/PPN ===
        ppnApplicable: fPpnApplicable,
        pph23Applicable: fPph23Applicable,
        pph23: parseFloat(fPph23) || 2,
        keterangan: fKeterangan || null,
        // === Update #042 — DP/Pelunasan (field header): nilai yang ditagih
        // invoice ini. Ter-link SO: null = auto-isi sisa SO (form selalu
        // mengirim nilai eksplisit hasil auto-isi/manual); standalone: 0 =
        // tagih penuh subtotal. Backend mendistribusikan proporsional ke
        // baris & menghitung PPN/PPh23 atas nilai ini. ===
        dpPelunasan: (Number(fDpPelunasan) || 0) > 0 ? Number(fDpPelunasan) : fSalesOrderId ? null : 0,
        details,
        biayaTambahan: biaya.length > 0 ? biaya : undefined
      };
      await api.post('/penjualan/sales-invoice', body);
      toast.success('Invoice penjualan berhasil dibuat');
      draft.clearDraft();
      refreshListTab('sales', subPage);
      if (activeTabId) closeTab(activeTabId);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Gagal menyimpan invoice');
    } finally {
      setSubmitting(false);
    }
  }, [fPelangganId, fSalesOrderId, fTanggal, fAlamatPengiriman, fPpn, fPpnApplicable, fPph23Applicable, fPph23, fKeterangan, fDpPelunasan, soSisaInfo, formSubtotal, fDetail, fBiayaTambahan, subPage, activeTabId, closeTab, refreshListTab]);

  if (ddLoading) {
    return (
      <FormTabShell title="Buat Invoice Penjualan">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </FormTabShell>
    );
  }

  return (
    <FormTabShell title="Buat Invoice Penjualan">
      <Card className="max-w-5xl">
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">Isi data invoice penjualan baru</p>
          {/* === Update #046 — field pilih SO dipindah ke PALING PERTAMA (sebelum
              Pelanggan/Tanggal): pilih dokumen sumber duluan → pelanggan, baris
              item & nilai ditagih otomatis ditarik. Label "Link ke Sales Order"
              diganti "Sales Order" (permintaan user). === */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Sales Order</Label>
              <SearchableDropdown value={fSalesOrderId} onValueChange={handleSalesOrderChange} options={soOptions.map((so) => ({ id: so.id, label: so.noPesanan }))} allOption={{ id: '', label: 'Tidak ada' }} placeholder="Pilih Sales Order (opsional)..." disabled={soLoading} />
              {soLoading && <p className="text-xs text-muted-foreground mt-1">Memuat sisa SO...</p>}
              {/* Update #4 (C4): info read-only nomor SO & PO customer terpilih */}
              {soRefInfo && (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  No SO: <span className="font-mono font-medium text-foreground">{soRefInfo.noPesanan}</span>
                  <span className="mx-1.5">·</span>
                  No PO: <span className="font-mono font-medium text-foreground">{soRefInfo.customerPoNumber || '-'}</span>
                </div>
              )}
            </div>
            {/* === Update #004: No DO — tarik data DO seperti No SO; baris DO
                masuk ke table invoice (link deliveryDetailId). === */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">No DO</Label>
              <SearchableDropdown value={fPengirimanId} onValueChange={handlePengirimanChange} options={doOptions.map((p) => ({ id: p.id, label: p.noSuratJalan }))} allOption={{ id: '', label: 'Tidak ada' }} placeholder={fPelangganId ? 'Pilih No DO...' : 'Pilih pelanggan dulu (atau pilih bebas)...'} disabled={doLoading} />
              {doLoading && <p className="text-xs text-muted-foreground mt-1">Memuat sisa DO...</p>}
              {fPengirimanId && (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  No DO: <span className="font-mono font-medium text-foreground">{doOptions.find((p) => p.id === fPengirimanId)?.noSuratJalan || fPengirimanId}</span>
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5" id="sif-pelangganId">
              <Label className="text-xs font-medium">
                Pelanggan <span className="text-destructive">*</span>
              </Label>
              <div className="flex items-start gap-1.5">
                {/* === Update #045 — pelanggan DIKUNCI saat menarik data dari
                    SO / No DO (mengikuti dokumen sumber; invoice standalone
                    tetap bebas memilih pelanggan). === */}
                <SearchableDropdown className="min-w-0 flex-1" value={fPelangganId} onValueChange={handlePelangganChange} options={pelangganOptions.map((p) => ({ id: p.id, label: p.nama }))} placeholder={fSalesOrderId || fPengirimanId ? 'Mengikuti dokumen sumber' : 'Pilih pelanggan...'} disabled={!!fSalesOrderId || !!fPengirimanId} />
                {/* Update #007: quick add pelanggan */}
                {!fSalesOrderId && !fPengirimanId && (
                  <QuickAddPelangganButton
                    onCreated={(p) => {
                      const drop = toPelangganDropdown(p);
                      setPelangganOptions((prev) => (prev.some((row) => row.id === p.id) ? prev : [...prev, drop]));
                      handlePelangganChange(p.id, drop);
                      setFormErrors((prev) => (prev.pelangganId ? { ...prev, pelangganId: '' } : prev));
                    }}
                  />
                )}
              </div>
              {formErrors.pelangganId && <p className="text-xs text-destructive mt-1">{formErrors.pelangganId}</p>}
            </div>
            <div className="space-y-1.5" id="sif-tanggal">
              {/* Update #004: label "Tanggal" → "Tanggal Invoice". */}
              <Label className="text-xs font-medium">
                Tanggal Invoice <span className="text-destructive">*</span>
              </Label>
              <Input type="date" className="h-9 text-xs" value={fTanggal} onChange={(e) => setFTanggal(e.target.value)} />
              {/* === Update #050 — pesan error tanggal kini tampil inline
                  (dulu divalidasi tapi tidak pernah ditampilkan). === */}
              {formErrors.tanggal && <p className="text-xs text-destructive mt-1">{formErrors.tanggal}</p>}
            </div>
          </div>
          {/* === Update #045 — field "Alamat Pengiriman" DIHAPUS dari form
              Invoice (permintaan user). Nilai tetap ditarik otomatis dari
              master Pelanggan & ikut tersimpan (state dipertahankan). === */}
          <Separator />
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              Detail Barang <span className="text-destructive">*</span>
            </Label>
            {/* Update #004: kolom Diskon % disembunyikan di invoice. */}
            {/* Update #032: allowBebas — baris invoice boleh item bebas (jasa/custom). */}
            {/* Update #042: kolom DP per baris DIHAPUS — nilai yang ditagih kini
                diatur field DP/Pelunasan di panel ringkasan (bawah). */}
            <DetailTableWithPrice
              rows={fDetail}
              setRows={setFDetail}
              barangOptions={barangOptions}
              hideDiskon
              allowBebas
              /* Update #045 — baris terkunci saat menarik data dari SO / No DO. */
              locked={!!fSalesOrderId || !!fPengirimanId}
              onBarangCreated={(b) => {
                setBarangOptions((prev) => (prev.some((row) => row.id === b.id) ? prev : [...prev, toBarangDropdown(b)]));
                // Satuan barang baru (mungkin hasil nested quick-add) didaftarkan ke daftar satuan host.
                const satuan = satuanFromBarang(b);
                if (satuan) setSatuanOptions((prev) => (prev.some((row) => row.id === satuan.id) ? prev : [...prev, satuan]));
              }}
            />
            {formErrors.detail && <p className="text-xs text-destructive mt-1">{formErrors.detail}</p>}
          </div>
          <Separator />
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Biaya Tambahan</Label>
            <BiayaTambahanTable rows={fBiayaTambahan} setRows={setFBiayaTambahan} />
          </div>
          <Separator />
          {/* Update #004: blok Diskon Global % dihapus dari form invoice. */}
          {/* ── Update ASAHI (PPh23/PPN opsional) — pilih pajak saat input:
              boleh dua-duanya, salah satu, atau tidak sama sekali.
              PPh23 (jika dipilih) memotong grand total.
              === Update #046 — TARIF PPN & PPh23 DIKUNCI: nilainya diatur
              terpusat di Referensi → Perpajakan (RATE_PPN / RATE_PPH23) dan
              otomatis ditarik ke form; hanya pilihan pakai/tidak yang bisa
              diubah per invoice. === */}
          <div className="space-y-3 rounded-md border p-4">
            <div>
              <Label className="text-xs font-medium">Pajak (PPN / PPh23)</Label>
              <p className="text-[11px] text-muted-foreground">
                Pilih pajak yang diterapkan — boleh dua-duanya, salah satu saja, atau tidak sama sekali. PPh23 memotong grand total (potongan oleh pelanggan saat bayar). <span className="inline-flex items-center gap-1 font-medium">Tarif terkunci — diatur di Referensi → Perpajakan.</span>
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${fPpnApplicable ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                <Checkbox aria-checked={fPpnApplicable} className="mt-0.5" checked={fPpnApplicable} onCheckedChange={(checked) => setFPpnApplicable(checked === true)} />
                <span className="flex-1 space-y-2 text-sm leading-snug">
                  <span className="block font-medium">PPN</span>
                  {fPpnApplicable && (
                    <span className="flex items-center gap-2">
                      {/* === Update #046 — tarif PPN readOnly (dari Perpajakan). === */}
                      <Input type="number" step="any" min={0} max={100} aria-label="Tarif PPN (persen)" className="h-8 w-24 text-xs bg-muted/60 font-medium" value={fPpn} readOnly aria-readonly="true" title="Tarif PPN terkunci — atur di Referensi → Perpajakan" />
                      <span className="text-xs text-muted-foreground">%</span>
                    </span>
                  )}
                </span>
              </label>
              <label className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${fPph23Applicable ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                <Checkbox aria-checked={fPph23Applicable} className="mt-0.5" checked={fPph23Applicable} onCheckedChange={(checked) => setFPph23Applicable(checked === true)} />
                <span className="flex-1 space-y-2 text-sm leading-snug">
                  <span className="block font-medium">PPh23</span>
                  {fPph23Applicable && (
                    <span className="flex items-center gap-2">
                      {/* === Update #046 — tarif PPh23 readOnly (dari Perpajakan);
                          centang pakai/tidak tetap bisa diubah. === */}
                      <Input type="number" step="any" min={0} max={100} aria-label="Tarif PPh23 (persen)" className="h-8 w-24 text-xs bg-muted/60 font-medium" value={fPph23} readOnly aria-readonly="true" title="Tarif PPh23 terkunci — atur di Referensi → Perpajakan" />
                      <span className="text-xs text-muted-foreground">%</span>
                    </span>
                  )}
                </span>
              </label>
            </div>
          </div>
          {/* Update #004: tanpa diskon global (baris - Diskon tidak tampil). */}
          {/* === Update #042 — panel ringkasan: field "DP/Pelunasan (Rp)"
              tepat SETELAH baris Subtotal. SO terpilih → auto-terisi sisa
              tagihan SO (sisaNilai) & wajib 0 < x ≤ sisa; standalone → kosong
              = tagih penuh subtotal (bila diisi: 0 < x ≤ Σ gross baris).
              Pajak dihitung atas nilai ditagih; Total = dp + PPN + biaya − PPh23
              (dp kosong/0 → perilaku lama: tagih subtotal penuh). === */}
          <TotalsBreakdown
            subtotal={formSubtotal}
            diskonGlobalPct={0}
            ppnPct={parseFloat(fPpn) || 0}
            totalBiayaTambahan={formTotalBiaya}
            ppnApplicable={fPpnApplicable}
            pph23Applicable={fPph23Applicable}
            pph23Pct={parseFloat(fPph23) || 0}
            dpPelunasan={Number(fDpPelunasan) || 0}
            dpInput={
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">DP/Pelunasan (Rp)</span>
                  <CurrencyInput
                    className="h-8 w-44 text-right text-xs"
                    value={fDpPelunasan}
                    onValueChange={(v) => {
                      setFDpPelunasan(v);
                      if (formErrors.dpPelunasan) setFormErrors((prev) => ({ ...prev, dpPelunasan: '' }));
                    }}
                    aria-label="DP/Pelunasan (nilai yang ditagih invoice ini)"
                    placeholder="0"
                  />
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">{fSalesOrderId ? `Nilai yang ditagih invoice ini${soSisaInfo ? ` — sisa tagihan ${soSisaInfo.noPesanan}: ${formatRp(soSisaInfo.sisaNilai)} (nilai maksimum DP/Pelunasan)` : ' — terisi otomatis sebesar sisa tagihan SO saat SO dipilih'}.` : 'Kosong = tagih penuh subtotal; bila diisi harus 0 < nilai ≤ total baris.'}</p>
                {formErrors.dpPelunasan && <p className="text-xs text-destructive">{formErrors.dpPelunasan}</p>}
              </div>
            }
          />
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Keterangan</Label>
            <Textarea className="text-xs min-h-[60px]" value={fKeterangan} onChange={(e) => setFKeterangan(e.target.value)} placeholder="Catatan tambahan..." />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <div className="mr-auto">
              <DraftIndicator hasDraft={draft.hasDraft} ageLabel={draft.draftAgeLabel} onDiscard={handleDiscardDraft} formLabel="Invoice Penjualan" />
            </div>
            <Button variant="outline" size="sm" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting}>
              Batal
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Receipt className="mr-1.5 h-4 w-4" />}
              {submitting ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </FormTabShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FORM: Invoice Penjualan Edit
// ═════════════════════════════════════════════════════════════════════════════

function InvoicePenjualanEditForm({ editId, subPage, initialNoInvoice, initialStatus, initialGrandTotal }: { editId: string; subPage: string; initialNoInvoice?: string; initialStatus?: string; initialGrandTotal?: number }) {
  // Update #004: syaratBayarOptions tidak dipakai lagi (field dihapus dari invoice).
  const { pelangganOptions, setPelangganOptions, salesOrderOptions, loading: ddLoading } = useDropdowns();
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const [editLoading, setEditLoading] = useState(true);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editNoInvoice, setEditNoInvoice] = useState(initialNoInvoice || '');
  const [editStatus, setEditStatus] = useState(initialStatus || '');
  const [editGrandTotal, setEditGrandTotal] = useState(initialGrandTotal || 0);

  const [editPelangganId, setEditPelangganId] = useState('');
  const [editTanggal, setEditTanggal] = useState('');
  const [editSalesOrderId, setEditSalesOrderId] = useState('');
  // Update #004: Syarat Pembayaran / Ekspedisi / Tanggal Pengiriman / Diskon
  // Global dihapus dari form invoice (edit).
  const [editAlamatPengiriman, setEditAlamatPengiriman] = useState('');
  const [editMataUang, setEditMataUang] = useState('IDR');
  const [editPpn, setEditPpn] = useState('11');
  // === Update ASAHI — pilihan PPh23/PPN saat edit SI ===
  const [editPpnApplicable, setEditPpnApplicable] = useState(true);
  const [editPph23Applicable, setEditPph23Applicable] = useState(false);
  const [editPph23, setEditPph23] = useState('2');
  const [editKeterangan, setEditKeterangan] = useState('');
  const [soLoading, setSoLoading] = useState(false);
  // === Update #047 — nomor SO invoice ini (label bila SO-nya tidak ada di
  // daftar "tersedia" karena kehabisan sisa tagihan justru oleh invoice
  // yang sedang diedit ini). ===
  const [editSoNo, setEditSoNo] = useState('');
  // === Update #042 — DP/Pelunasan (field header invoice): nilai yang ditagih
  // invoice ini (canonical string; "" = kosong = tagih penuh). Prefill dari
  // response dpPelunasan (0 → kosong). ===
  const [editDpPelunasan, setEditDpPelunasan] = useState('');
  // === Update #042 — dpPelunasan tersimpan (nilai-tagih invoice ini): dipakai
  // menghitung batas atas validasi edit = sisaNilai (saat ini) + nilai-tagih
  // invoice ini — endpoint /sisa menghitung sisa SETELAH semua invoice
  // non-DIBATALKAN (termasuk invoice draft ini), jadi nilai-tagihnya harus
  // dikembalikan sebagai ruang edit. ===
  const [editDpSaved, setEditDpSaved] = useState(0);
  // === Update #042 — info sisa tagihan NILAI SO untuk validasi edit. ===
  const [soSisaInfo, setSoSisaInfo] = useState<{ noPesanan: string; sisaNilai: number } | null>(null);
  // === Update #4 (C4): info read-only No SO · No PO customer dari SO terpilih ===
  const [soRefInfo, setSoRefInfo] = useState<{ noPesanan: string; customerPoNumber: string } | null>(null);

  // === Update #4 (C4): muat info No SO + No PO customer dari SO (GET sales-order/{id}).
  // Update #045 — fetch kartu Sisa Pembayaran penawaran dihapus (kartu tidak
  // lagi ditampilkan; hanya info No SO · No PO yang dimuat). ===
  // === Update #047 — dropdown SO hanya menawarkan SO yang masih punya sisa
  // tagihan; SO milik invoice ini selalu disisipkan (label tetap tampil). ===
  const soOptions = useTersediaSoOptions('invoice', salesOrderOptions, editSalesOrderId, editSoNo);
  const loadSoRefInfo = useCallback(async (soId: string) => {
    try {
      const so = await api.get<SalesOrderResponse>(`/penjualan/sales-order/${soId}`);
      setSoRefInfo({ noPesanan: so.noPesanan || '', customerPoNumber: so.customerPoNumber || '' });
    } catch {
      setSoRefInfo(null);
    }
  }, []);

  // === Update #042 — muat sisa tagihan NILAI SO (untuk hint + batas atas
  // validasi DP/Pelunasan saat edit: sisaNilai + nilai-tagih invoice ini). ===
  const loadSoSisaInfo = useCallback(async (soId: string) => {
    try {
      const sisa = await api.get<SalesOrderSisaResponse>(`/penjualan/sales-order/${soId}/sisa`);
      setSoSisaInfo({ noPesanan: sisa.noPesanan || '', sisaNilai: Number(sisa.sisaNilai) || 0 });
    } catch {
      setSoSisaInfo(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setEditLoading(true);
      try {
        const inv = await api.get<SalesInvoiceResponse>(`/penjualan/sales-invoice/${editId}`);
        if (cancelled) return;
        setEditNoInvoice(inv.noInvoice);
        setEditStatus(inv.status);
        setEditGrandTotal(Number(inv.grandTotal));
        setEditPelangganId(inv.pelangganId || '');
        setEditTanggal(inv.tanggal ? inv.tanggal.slice(0, 10) : '');
        setEditSalesOrderId(inv.salesOrderId || '');
        setEditSoNo(inv.salesOrder?.noPesanan || '');
        setEditAlamatPengiriman(inv.alamatPengiriman || '');
        setEditMataUang(inv.mataUang || 'IDR');
        setEditPpn(trimDecimalString(inv.ppn ?? 0, '0'));
        setEditPpnApplicable(inv.ppnApplicable ?? true);
        setEditPph23Applicable(inv.pph23Applicable ?? false);
        setEditPph23(trimDecimalString(inv.pph23 ?? 2, '2'));
        setEditKeterangan(inv.keterangan || '');
        // === Update #042 — prefill DP/Pelunasan dari response (0 → kosong =
        // tagih penuh) + info sisa tagihan SO (untuk validasi batas atas). ===
        const dpSaved = Number(inv.dpPelunasan) || 0;
        setEditDpSaved(dpSaved);
        setEditDpPelunasan(dpSaved > 0 ? String(dpSaved) : '');
        // Update #4: info box No SO · No PO dari response invoice (salesOrder nested);
        // fallback fetch bila header ter-link tapi nested tidak ikut terkirim.
        // Update #040 — nested kini membawa penawaranId (backend #040): kotak
        // Sisa Pembayaran dimuat dari situ tanpa fetch SO tambahan.
        if (inv.salesOrder?.noPesanan) {
          setSoRefInfo({ noPesanan: inv.salesOrder.noPesanan, customerPoNumber: inv.salesOrder.customerPoNumber || '' });
        } else if (inv.salesOrderId) {
          await loadSoRefInfo(inv.salesOrderId);
        } else {
          setSoRefInfo(null);
        }
        // Update #042 — info sisa tagihan SO (validasi DP/Pelunasan edit).
        if (inv.salesOrderId) await loadSoSisaInfo(inv.salesOrderId);
        else setSoSisaInfo(null);
      } catch (e) {
        toast.error(e instanceof ApiError ? e.detail : 'Gagal memuat data invoice');
      } finally {
        if (!cancelled) setEditLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [editId, loadSoRefInfo, loadSoSisaInfo]);

  // === Tarik data otomatis SO → Invoice Penjualan (edit) (Task 16-c2):
  // mengganti SO pada form edit hanya menarik data header (pelanggan) dari
  // endpoint /sisa. Detail barang invoice TIDAK diubah saat edit (payload PUT
  // tanpa `details` — baris tersimpan dipertahankan backend apa adanya).
  // Update #4 (C4): perubahan SO juga memperbarui info box No SO · No PO.
  // Update #042 — perubahan SO juga memuat sisa tagihan NILAI SO & auto-isi
  // ulang DP/Pelunasan (min(sisaNilai, dp tersimpan bila ada)). ===
  const handleEditSalesOrderChange = useCallback(
    async (soId: string) => {
      setEditSalesOrderId(soId);
      if (!soId) {
        setSoRefInfo(null);
        // Update #042 — SO dilepas → standalone: info sisa disembunyikan & DP
        // dikosongkan (tagih penuh).
        setSoSisaInfo(null);
        setEditDpPelunasan('');
        return;
      }
      setSoLoading(true);
      try {
        const sisa = await api.get<SalesOrderSisaResponse>(`/penjualan/sales-order/${soId}/sisa`);
        if (sisa.pelangganId) setEditPelangganId(sisa.pelangganId);
        // Update #042 — sisa tagihan NILAI SO + auto-isi DP/Pelunasan baru.
        const sisaNilai = Number(sisa.sisaNilai) || 0;
        setSoSisaInfo({ noPesanan: sisa.noPesanan || '', sisaNilai });
        const dpLama = Number(editDpPelunasan) || 0;
        const autoDp = dpLama > 0 ? Math.min(dpLama, sisaNilai) : sisaNilai;
        setEditDpPelunasan(autoDp > 0 ? String(autoDp) : '');
      } catch {
        // Gagal memuat sisa SO — biarkan isian header saat ini
        setSoSisaInfo(null);
      }
      await loadSoRefInfo(soId);
      setSoLoading(false);
    },
    [loadSoRefInfo, editDpPelunasan]
  );

  // ── Update #4: pilih pelanggan → alamat ditarik otomatis dari master
  // Update #004: syarat bayar tidak lagi ditarik (field dihapus dari invoice). ──
  const handleEditPelangganChange = useCallback(
    (id: string, masterOverride?: PelangganDropdown | null) => {
      setEditPelangganId(id);
      // Update #007: masterOverride dipakai quick-add (state belum ter-update).
      const master = masterOverride !== undefined ? masterOverride : findPartyMaster(pelangganOptions, id);
      setEditAlamatPengiriman(master?.alamat || '');
    },
    [pelangganOptions]
  );

  const handleEditSubmit = useCallback(async () => {
    if (!editPelangganId) {
      toast.error('Pelanggan wajib diisi');
      return;
    }
    if (!editTanggal) {
      toast.error('Tanggal wajib diisi');
      return;
    }
    // === Update #042 — validasi DP/Pelunasan saat edit: SO terpilih → wajib
    // > 0 dan ≤ (sisaNilai saat ini + nilai-tagih invoice ini yang tersimpan)
    // — sederhana: endpoint /sisa sudah menghitung sisa SETELAH invoice
    // non-batal (termasuk draft ini), jadi nilai-tagihnya dikembalikan. ===
    const dpNum = Number(editDpPelunasan) || 0;
    if (editSalesOrderId && dpNum <= 0) {
      toast.error('DP/Pelunasan wajib diisi (nilai yang ditagih invoice ini) bila invoice ter-link Sales Order');
      return;
    }
    if (editSalesOrderId && soSisaInfo && dpNum > soSisaInfo.sisaNilai + editDpSaved + 0.01) {
      toast.error('Nilai DP/Pelunasan melebihi sisa tagihan SO');
      return;
    }
    setEditSubmitting(true);
    try {
      const body: SalesInvoiceUpdate = {
        tanggal: editTanggal,
        pelangganId: editPelangganId,
        // Update #004: syaratBayarId / ekspedisi / tanggalPengiriman /
        // diskonGlobal tidak lagi dikirim — nilai lama dibiarkan tersimpan
        // di backend (tidak tampil di dokumen invoice).
        salesOrderId: editSalesOrderId || null,
        alamatPengiriman: editAlamatPengiriman || null,
        mataUang: editMataUang || undefined,
        ppn: parseFloat(editPpn) || 0,
        // === Update ASAHI — pilihan PPh23/PPN ===
        ppnApplicable: editPpnApplicable,
        pph23Applicable: editPph23Applicable,
        pph23: parseFloat(editPph23) || 2,
        keterangan: editKeterangan || null,
        // === Update #042 — DP/Pelunasan: nilai yang ditagih invoice ini
        // (kosong/0 = tagih penuh — dikirim eksplisit 0; backend memvalidasi
        // ulang terhadap sisa SO dengan invoice ini dikecualikan). ===
        dpPelunasan: dpNum > 0 ? dpNum : 0
      };
      await api.put<SalesInvoiceResponse>(`/penjualan/sales-invoice/${editId}`, body);
      toast.success('Invoice penjualan berhasil diperbarui');
      refreshListTab('sales', subPage);
      if (activeTabId) closeTab(activeTabId);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Gagal memperbarui invoice');
    } finally {
      setEditSubmitting(false);
    }
  }, [editId, editPelangganId, editTanggal, editSalesOrderId, editAlamatPengiriman, editMataUang, editPpn, editPpnApplicable, editPph23Applicable, editPph23, editKeterangan, editDpPelunasan, editDpSaved, soSisaInfo, subPage, activeTabId, closeTab, refreshListTab]);

  return (
    <FormTabShell title="Edit Invoice Penjualan">
      <Card className="max-w-5xl">
        <CardContent className="p-6 space-y-4">
          {editLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Perbarui data header invoice (detail barang tidak dapat diubah)</p>
              <div className="flex flex-wrap items-center gap-4 rounded-md border bg-muted/30 px-4 py-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5" />
                  <span>No Invoice:</span>
                  <span className="font-mono font-semibold text-foreground">{editNoInvoice}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>Status:</span>
                  <StatusBadge status={editStatus} />
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>Grand Total:</span>
                  <span className="font-mono font-semibold text-foreground">{formatRp(editGrandTotal)}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    Pelanggan <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex items-start gap-1.5">
                    {/* === Update #046 — pelanggan DIKUNCI saat SO terpilih
                        (mengikuti dokumen sumber — paritas form create). === */}
                    <SearchableDropdown className="min-w-0 flex-1" value={editPelangganId} onValueChange={handleEditPelangganChange} options={pelangganOptions.map((p) => ({ id: p.id, label: p.nama }))} placeholder={editSalesOrderId ? 'Mengikuti Sales Order terpilih' : 'Pilih pelanggan...'} disabled={!!editSalesOrderId} />
                    {/* Update #007: quick add pelanggan.
                        === Update #046 — DISEMBUNYIKAN saat SO terpilih (narik data). === */}
                    {!editSalesOrderId && (
                      <QuickAddPelangganButton
                        onCreated={(p) => {
                          const drop = toPelangganDropdown(p);
                          setPelangganOptions((prev) => (prev.some((row) => row.id === p.id) ? prev : [...prev, drop]));
                          handleEditPelangganChange(p.id, drop);
                        }}
                      />
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  {/* Update #004: label "Tanggal" → "Tanggal Invoice". */}
                  <Label className="text-xs font-medium">
                    Tanggal Invoice <span className="text-destructive">*</span>
                  </Label>
                  <Input type="date" className="h-9 text-xs" value={editTanggal} onChange={(e) => setEditTanggal(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  {/* === Update #046 — label "Link ke Sales Order" → "Sales Order"
                      (paritas form create; permintaan user). === */}
                  <Label className="text-xs font-medium">Sales Order</Label>
                  <SearchableDropdown value={editSalesOrderId} onValueChange={handleEditSalesOrderChange} options={soOptions.map((so) => ({ id: so.id, label: so.noPesanan }))} allOption={{ id: '', label: 'Tidak ada' }} placeholder="Pilih Sales Order (opsional)..." disabled={soLoading} />
                  {soLoading && <p className="text-xs text-muted-foreground mt-1">Memuat sisa SO...</p>}
                  {/* Update #4 (C4): info read-only nomor SO & PO customer terpilih */}
                  {soRefInfo && (
                    <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      No SO: <span className="font-mono font-medium text-foreground">{soRefInfo.noPesanan}</span>
                      <span className="mx-1.5">·</span>
                      No PO: <span className="font-mono font-medium text-foreground">{soRefInfo.customerPoNumber || '-'}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Mata Uang</Label>
                  <Input className="h-9 text-xs" value={editMataUang} onChange={(e) => setEditMataUang(e.target.value)} placeholder="e.g. IDR" />
                </div>
              </div>
              {/* === Update #045 — field "Alamat Pengiriman" DIHAPUS dari form
                  Invoice (permintaan user); nilai tersimpan tetap dikirim apa
                  adahlanya saat update (state dipertahankan). === */}
              <Separator />
              {/* === Update #042 — field DP/Pelunasan (nilai yang ditagih
                  invoice ini): prefill dari dpPelunasan tersimpan (0 → kosong
                  = tagih penuh); batas atas = sisa tagihan SO (saat ini) +
                  nilai-tagih invoice ini (endpoint /sisa menghitung sisa
                  SETELAH invoice non-batal — termasuk draft ini — jadi
                  nilai-tagihnya dikembalikan). Pajak dihitung ulang backend
                  atas nilai baru. === */}
              <div className="space-y-1.5 rounded-md border p-4">
                <Label className="text-xs font-medium">DP/Pelunasan (Rp)</Label>
                <CurrencyInput className="h-9 text-right text-xs" value={editDpPelunasan} onValueChange={(v) => setEditDpPelunasan(v)} aria-label="DP/Pelunasan (nilai yang ditagih invoice ini)" placeholder="0" />
                <p className="text-[11px] leading-relaxed text-muted-foreground">{editSalesOrderId ? `Nilai yang ditagih invoice ini${soSisaInfo ? ` — sisa tagihan ${soSisaInfo.noPesanan}: ${formatRp(soSisaInfo.sisaNilai)} (maksimum: ${formatRp(soSisaInfo.sisaNilai + editDpSaved)})` : ' (terisi otomatis dari sisa tagihan SO saat SO dipilih)'}. Kosongkan hanya bila SO dilepas (tagih penuh).` : 'Kosong = tagih penuh subtotal (invoice tanpa SO). Bila diisi harus 0 < nilai ≤ total baris.'}</p>
              </div>
              {/* ── Update ASAHI (PPh23/PPN opsional) — pilih pajak saat edit:
                  boleh dua-duanya, salah satu, atau tidak sama sekali. ── */}
              <div className="space-y-3 rounded-md border p-4">
                <div>
                  <Label className="text-xs font-medium">Pajak (PPN / PPh23)</Label>
                  {/* === Update #048 — keterangan tarif terkunci ditambahkan
                      (paritas form create Update #046). === */}
                  <p className="text-[11px] text-muted-foreground">
                    Pilih pajak yang diterapkan — boleh dua-duanya, salah satu saja, atau tidak sama sekali. PPh23 memotong grand total (potongan oleh pelanggan saat bayar). Grand total dihitung ulang saat disimpan. <span className="inline-flex items-center gap-1 font-medium">Tarif terkunci — diatur di Referensi → Perpajakan.</span>
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${editPpnApplicable ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                    <Checkbox aria-checked={editPpnApplicable} className="mt-0.5" checked={editPpnApplicable} onCheckedChange={(checked) => setEditPpnApplicable(checked === true)} />
                    <span className="flex-1 space-y-2 text-sm leading-snug">
                      <span className="block font-medium">PPN</span>
                      {editPpnApplicable && (
                        <span className="flex items-center gap-2">
                          {/* === Update #048 — tarif PPN readOnly (nilai tersimpan;
                              terpusat di Referensi → Perpajakan). === */}
                          <Input type="number" step="any" min={0} max={100} aria-label="Tarif PPN (persen)" className="h-8 w-24 text-xs bg-muted/60 font-medium" value={editPpn} readOnly aria-readonly="true" title="Tarif PPN terkunci — atur di Referensi → Perpajakan" />
                          <span className="text-xs text-muted-foreground">%</span>
                        </span>
                      )}
                    </span>
                  </label>
                  <label className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${editPph23Applicable ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                    <Checkbox aria-checked={editPph23Applicable} className="mt-0.5" checked={editPph23Applicable} onCheckedChange={(checked) => setEditPph23Applicable(checked === true)} />
                    <span className="flex-1 space-y-2 text-sm leading-snug">
                      <span className="block font-medium">PPh23</span>
                      {editPph23Applicable && (
                        <span className="flex items-center gap-2">
                          {/* === Update #048 — tarif PPh23 readOnly (nilai
                              tersimpan; paritas form create Update #046). === */}
                          <Input type="number" step="any" min={0} max={100} aria-label="Tarif PPh23 (persen)" className="h-8 w-24 text-xs bg-muted/60 font-medium" value={editPph23} readOnly aria-readonly="true" title="Tarif PPh23 terkunci — atur di Referensi → Perpajakan" />
                          <span className="text-xs text-muted-foreground">%</span>
                        </span>
                      )}
                    </span>
                  </label>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Keterangan</Label>
                <Textarea className="text-xs min-h-[60px]" value={editKeterangan} onChange={(e) => setEditKeterangan(e.target.value)} placeholder="Catatan tambahan..." />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => activeTabId && closeTab(activeTabId)} disabled={editSubmitting}>
                  Batal
                </Button>
                <Button size="sm" onClick={handleEditSubmit} disabled={editSubmitting}>
                  {editSubmitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Pencil className="mr-1.5 h-4 w-4" />}
                  {editSubmitting ? 'Menyimpan...' : 'Simpan Perubahan'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </FormTabShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FORM: Retur Penjualan Create
// ═════════════════════════════════════════════════════════════════════════════

function ReturPenjualanCreateForm({ subPage }: { subPage: string }) {
  const { error: returnError, clearError: clearReturnError, handleError: handleReturnError } = useStockOperationError('sales_retur');
  const { invoiceOptions, pengirimanOptions, gudangOptions, setGudangOptions, loading: ddLoading } = useDropdowns();
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [fInvoiceId, setFInvoiceId] = useState('');
  const source = useSalesReturnSource(fInvoiceId);
  // === Update #063 — dropdown Invoice difilter "masih punya sisa retur";
  // invoice terpilih (draft dipulihkan) tetap disisipkan agar label tampil. ===
  const tersediaReturInvoiceOptions = useTersediaReturInvoiceOptions(invoiceOptions, fInvoiceId || undefined);
  const fPelangganId = source.invoice?.pelangganId || '';
  const [quantities, setQuantities] = useState<ReturnQuantities>({});
  const [createdReturn, setCreatedReturn] = useState<SalesReturResponse | null>(null);
  const [saveWarning, setSaveWarning] = useState('');
  const [fPengirimanId, setFPengirimanId] = useState('');
  const [fGudangId, setFGudangId] = useState('');
  const [fTanggal, setFTanggal] = useState('');
  const [fAlamatPengembalian, setFAlamatPengembalian] = useState('');
  const [fNoPengembalian, setFNoPengembalian] = useState('');
  const [fDiskonGlobal, setFDiskonGlobal] = useState('0');
  const [fPpn, setFPpn] = useState('11');
  const [fKeterangan, setFKeterangan] = useState('');
  // AUD-10 (update #04) — tarif default dari setting global (RATE_PPN)
  const defaultRatesRetur = useDefaultTaxRates();
  useEffect(() => {
    if (defaultRatesRetur) setFPpn(defaultRatesRetur.ppn);
  }, [defaultRatesRetur]);

  // ── Update #4: alamat pengembalian ditarik otomatis dari invoice sumber ──
  // (alamat mengikuti invoice; isian manual user tetap dipertahankan —
  // penimpaan hanya terjadi bila isian sebelumnya juga hasil auto-fill).
  const autoFilledAlamatRef = useRef('');
  useEffect(() => {
    const invoice = source.invoice;
    if (!invoice) return;
    const next = invoice.alamatPengiriman || '';
    if (next && (!fAlamatPengembalian || autoFilledAlamatRef.current === fAlamatPengembalian)) {
      autoFilledAlamatRef.current = next;
      setFAlamatPengembalian(next);
    }
  }, [source.invoice, fAlamatPengembalian]);

  // ── Draft otomatis (form create; dipulihkan saat kembali ke form ini) ──
  const userId = useAuthStore((s) => s.user?.id ?? 'anon');
  const draft = useFormDraft<ReturPenjualanDraftData>(draftKey(userId, 'sales', 'sales-retur', 'create'));
  const skipNextSaveRef = useRef(false);
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const d = draft.draft;
    if (!d) return;
    setFInvoiceId(d.invoiceId || '');
    setFPengirimanId(d.pengirimanId || '');
    setFGudangId(d.gudangId || '');
    setFTanggal(d.tanggal || '');
    setFAlamatPengembalian(d.alamatPengembalian || '');
    setFNoPengembalian(d.noPengembalian || '');
    setFDiskonGlobal(d.diskonGlobal ?? '0');
    // === Update #048 — tarif PPN tidak dipulihkan dari draft lagi: nilainya
    // terkunci & selalu mengikuti Referensi → Perpajakan (RATE_PPN). ===
    setFKeterangan(d.keterangan || '');
    setQuantities(d.quantities || {});
    toast.info('Draft isian dipulihkan', { description: 'Isian terakhir form Retur Penjualan dimuat kembali otomatis.' });
  }, []);

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
    if (!createdReturn) {
      draft.saveDraft({
        invoiceId: fInvoiceId,
        pengirimanId: fPengirimanId,
        gudangId: fGudangId,
        tanggal: fTanggal,
        alamatPengembalian: fAlamatPengembalian,
        noPengembalian: fNoPengembalian,
        diskonGlobal: fDiskonGlobal,
        ppn: fPpn,
        keterangan: fKeterangan,
        quantities
      });
    }
  }, [fInvoiceId, fPengirimanId, fGudangId, fTanggal, fAlamatPengembalian, fNoPengembalian, fDiskonGlobal, fPpn, fKeterangan, quantities]);

  const handleDiscardDraft = useCallback(() => {
    skipNextSaveRef.current = true;
    draft.clearDraft();
    setFInvoiceId('');
    setQuantities({});
    setFPengirimanId('');
    setFGudangId('');
    setFTanggal('');
    setFAlamatPengembalian('');
    setFNoPengembalian('');
    setFDiskonGlobal('0');
    // === Update #048 — reset tarif mengikuti Referensi → Perpajakan. ===
    setFPpn(defaultRatesRetur?.ppn ?? '11');
    setFKeterangan('');
    setFormErrors({});
  }, [defaultRatesRetur]);

  const filteredPengirimanOptions = useMemo(() => (fPelangganId ? pengirimanOptions.filter((p) => p.pelangganId === fPelangganId) : pengirimanOptions), [pengirimanOptions, fPelangganId]);

  // AUD-12 (update #05) — estimasi PPh23 retur untuk info-card (derived dari invoice
  // sumber + qty retur; nilai final dihitung backend saat create/post).
  const returDppEstimate = source.invoice ? source.invoice.details.reduce((s, line) => s + Number(quantities[line.id] ?? 0) * Number(line.harga), 0) * (1 - (parseFloat(fDiskonGlobal) || 0) / 100) : 0;
  const returPpnEstimate = returDppEstimate * ((parseFloat(fPpn) || 0) / 100);

  const handleSubmit = useCallback(async () => {
    if (createdReturn || !source.invoice) return;
    const errs: Record<string, string> = {};
    if (!fInvoiceId) errs.invoiceId = 'Invoice wajib diisi';
    if (!fPelangganId) errs.pelangganId = 'Pelanggan wajib diisi';
    // === Update #050 — tanggal retur wajib dipilih manual (default kosong,
    // tidak lagi otomatis terisi hari ini). ===
    if (!fTanggal) errs.tanggal = 'Tanggal wajib diisi';
    let details: SalesReturDetailCreate[] = [];
    try {
      details = salesReturnDetails(source.invoice, quantities);
    } catch (error) {
      errs.detail = error instanceof Error ? error.message : 'Detail retur tidak valid';
    }
    if (Object.keys(errs).length) {
      setFormErrors(errs);
      // === Update #050 — navigasi otomatis ke field wajib yang terlewat
      // (prefix "srf-" unik untuk form Retur Penjualan). ===
      focusFormError(Object.keys(errs), { prefix: 'srf-' });
      toast.error('Ada field wajib yang belum diisi');
      return;
    }
    setFormErrors({});
    setSubmitting(true);
    try {
      const body: SalesReturCreate = {
        autoPostJurnal: false,
        tanggal: fTanggal,
        salesInvoiceId: fInvoiceId,
        pelangganId: fPelangganId,
        pengirimanId: fPengirimanId || null,
        gudangId: fGudangId || null,
        alamatPengembalian: fAlamatPengembalian || null,
        noPengembalian: fNoPengembalian || null,
        diskonGlobal: parseFloat(fDiskonGlobal) || null,
        ppn: parseFloat(fPpn) || 0,
        keterangan: fKeterangan || null,
        details
      };
      const result = await createSalesReturn(body, (saved) => {
        setCreatedReturn(saved);
        refreshListTab('sales', subPage);
      });
      draft.clearDraft();
      if (result.mismatches.length) {
        setSaveWarning('Retur ' + result.saved.noRetur + ' sudah dibuat, tetapi beberapa isian (detail/harga/qty) belum terkonfirmasi tersimpan. Buka dokumen dari daftar untuk meninjau. Jangan membuat ulang.');
        return;
      }
      toast.success('Retur penjualan berhasil dibuat');
      refreshListTab('sales', subPage);
      if (activeTabId) closeTab(activeTabId);
    } catch (e) {
      handleReturnError(e, 'Gagal menyimpan retur');
    } finally {
      setSubmitting(false);
    }
  }, [fInvoiceId, fPelangganId, fPengirimanId, fGudangId, fTanggal, fAlamatPengembalian, fNoPengembalian, fDiskonGlobal, fPpn, fKeterangan, quantities, source.invoice, createdReturn, subPage, activeTabId, closeTab, refreshListTab, handleReturnError]);

  if (ddLoading) {
    return (
      <FormTabShell title="Buat Retur Penjualan">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </FormTabShell>
    );
  }

  return (
    <FormTabShell title="Buat Retur Penjualan">
      <Card className="max-w-5xl">
        <CardContent className="p-6 space-y-4">
          {saveWarning && (
            <p role="alert" className="text-sm text-destructive">
              {saveWarning}
            </p>
          )}
          <p className="text-sm text-muted-foreground">Isi data retur / pengembalian barang</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5" id="srf-invoiceId">
              <Label className="text-xs font-medium">
                Invoice <span className="text-destructive">*</span>
              </Label>
              <SearchableDropdown
                value={fInvoiceId}
                onValueChange={(value) => {
                  setFInvoiceId(value);
                  setQuantities({});
                  setFPengirimanId('');
                  setFormErrors({});
                }}
                options={tersediaReturInvoiceOptions.map((inv) => ({ id: inv.id, label: inv.noInvoice }))}
                placeholder="Pilih invoice..."
              />
              {formErrors.invoiceId && <p className="text-xs text-destructive mt-1">{formErrors.invoiceId}</p>}
            </div>
            <div className="space-y-1.5" id="srf-pelangganId">
              <Label className="text-xs font-medium">
                Pelanggan <span className="text-destructive">*</span>
              </Label>
              <Input value={source.invoice?.pelanggan?.nama || fPelangganId} readOnly placeholder="Mengikuti invoice sumber" />
              {formErrors.pelangganId && <p className="text-xs text-destructive mt-1">{formErrors.pelangganId}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5" id="srf-tanggal">
              {/* === Update #050 — tanggal wajib dipilih manual (default
                  kosong) + tanda * + pesan error + anchor navigasi. === */}
              <Label className="text-xs font-medium">
                Tanggal <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                className="h-9 text-xs"
                value={fTanggal}
                onChange={(e) => {
                  setFTanggal(e.target.value);
                  setFormErrors((p) => ({ ...p, tanggal: '' }));
                }}
              />
              {formErrors.tanggal && <p className="text-xs text-destructive mt-1">{formErrors.tanggal}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Gudang</Label>
              <div className="flex items-start gap-1.5">
                <SearchableDropdown className="min-w-0 flex-1" value={fGudangId} onValueChange={setFGudangId} options={gudangOptions.map((g) => ({ id: g.id, label: g.kode + ' - ' + g.nama }))} placeholder="Pilih gudang (opsional)..." />
                {/* Update #007: quick add gudang */}
                <QuickAddGudangButton
                  compact
                  onCreated={(g) => {
                    setGudangOptions((prev) => (prev.some((row) => row.id === g.id) ? prev : [...prev, g]));
                    setFGudangId(g.id);
                  }}
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Pengiriman (Surat Jalan)</Label>
              <SearchableDropdown value={fPengirimanId} onValueChange={setFPengirimanId} options={filteredPengirimanOptions.map((p) => ({ id: p.id, label: p.noSuratJalan }))} placeholder={fPelangganId ? 'Pilih pengiriman...' : 'Pilih pelanggan dulu...'} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">No. Pengembalian</Label>
              <Input className="h-9 text-xs" value={fNoPengembalian} onChange={(e) => setFNoPengembalian(e.target.value)} placeholder="Nomor referensi pengembalian" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Alamat Pengembalian</Label>
            <Textarea className="text-xs min-h-[48px]" value={fAlamatPengembalian} onChange={(e) => setFAlamatPengembalian(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">Otomatis ditarik dari invoice sumber — tetap bisa disunting bila perlu.</p>
          </div>
          <Separator />
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              Detail Barang <span className="text-destructive">*</span>
            </Label>
            {source.loading && <p className="text-sm text-muted-foreground">Memuat invoice sumber...</p>}
            {source.error && (
              <div role="alert" className="text-sm text-destructive">
                {source.error}{' '}
                <Button variant="outline" size="sm" onClick={source.retry}>
                  Coba Lagi
                </Button>
              </div>
            )}
            {source.invoice ? <SalesReturnSourceLines invoice={source.invoice} quantities={quantities} onChange={(id, qty) => setQuantities((previous) => ({ ...previous, [id]: qty }))} /> : !source.loading && !source.error && <p className="text-sm text-muted-foreground">Pilih invoice untuk mengisi detail retur.</p>}
            {formErrors.detail && <p className="text-xs text-destructive mt-1">{formErrors.detail}</p>}
          </div>
          <Separator />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Diskon Global %</Label>
              <Input type="number" className="h-9 text-xs" value={fDiskonGlobal} min={0} max={100} onChange={(e) => setFDiskonGlobal(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              {/* === Update #048 — tarif PPN DIKUNCI (readOnly): terpusat di
                  Referensi → Perpajakan (RATE_PPN); nilai mengikuti setting
                  global, bukan input manual. === */}
              <Label className="text-xs font-medium">PPN (%)</Label>
              <Input type="number" className="h-9 text-xs bg-muted/60 font-medium" value={fPpn} min={0} max={100} readOnly aria-readonly="true" title="Tarif PPN terkunci — atur di Referensi → Perpajakan" />
              <p className="text-[11px] text-muted-foreground">Tarif terkunci — diatur di Referensi → Perpajakan.</p>
            </div>
          </div>
          {/* AUD-12 (update #05) — info PPh23 derived dari invoice sumber (bukan input user).
              Retur atas SI ber-PPh23 membalik PPh23 Dibayar di Muka (116003);
              grand total retur menjadi NET-of-PPh23 (dihitung backend dari DPP retur × tarif). */}
          {source.invoice?.pph23Applicable && Number(source.invoice.totalPph23) > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50/60 px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5" /> Invoice sumber ber-PPh 23 (tarif {Number(source.invoice.pph23)}%)
              </p>
              <p className="text-xs text-amber-800">
                PPh23 dibatalkan retur: <strong className="font-mono">{formatRp(Math.min(Number(source.invoice.totalPph23), returDppEstimate * (Number(source.invoice.pph23) / 100)))}</strong> — dihitung otomatis dari DPP retur × tarif (maks. sisa PPh23 invoice {formatRp(Number(source.invoice.totalPph23))}), bukan input.
              </p>
              <p className="text-xs text-amber-800">
                Total Retur (net PPh23): <strong className="font-mono">{formatRp(returDppEstimate + returPpnEstimate - Math.min(Number(source.invoice.totalPph23), returDppEstimate * (Number(source.invoice.pph23) / 100)))}</strong> — grand total retur = DPP + PPN − PPh23 retur.
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Keterangan</Label>
            <Textarea className="text-xs min-h-[60px]" value={fKeterangan} onChange={(e) => setFKeterangan(e.target.value)} placeholder="Alasan retur / catatan tambahan..." />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <div className="mr-auto">
              <DraftIndicator hasDraft={draft.hasDraft} ageLabel={draft.draftAgeLabel} onDiscard={handleDiscardDraft} formLabel="Retur Penjualan" />
            </div>
            <Button variant="outline" size="sm" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting}>
              Batal
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting || !source.invoice || !!createdReturn}>
              {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1.5 h-4 w-4" />}
              {submitting ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </CardContent>
      </Card>
      <StockOperationErrorDialog error={returnError} onClose={clearReturnError} />
    </FormTabShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FORM: Retur Penjualan Edit
// ═════════════════════════════════════════════════════════════════════════════

function ReturPenjualanEditForm({ editId, subPage, initialNoRetur, initialStatus, initialGrandTotal }: { editId: string; subPage: string; initialNoRetur?: string; initialStatus?: string; initialGrandTotal?: number }) {
  const { error: returnError, clearError: clearReturnError, handleError: handleReturnError } = useStockOperationError('sales_retur');
  const { pelangganOptions, invoiceOptions, pengirimanOptions, gudangOptions, setGudangOptions, loading: ddLoading } = useDropdowns();
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const [editLoading, setEditLoading] = useState(true);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editNoRetur, setEditNoRetur] = useState(initialNoRetur || '');
  const [editStatus, setEditStatus] = useState(initialStatus || '');
  const [editGrandTotal, setEditGrandTotal] = useState(initialGrandTotal || 0);

  const [editInvoiceId, setEditInvoiceId] = useState('');
  const [editPelangganId, setEditPelangganId] = useState('');
  const [editPengirimanId, setEditPengirimanId] = useState('');
  const [editGudangId, setEditGudangId] = useState('');
  const [editTanggal, setEditTanggal] = useState('');
  const [editAlamatPengembalian, setEditAlamatPengembalian] = useState('');
  const [editNoPengembalian, setEditNoPengembalian] = useState('');
  const [editDiskonGlobal, setEditDiskonGlobal] = useState('0');
  const [editPpn, setEditPpn] = useState('11');
  const [editKeterangan, setEditKeterangan] = useState('');
  // AUD-12 (update #05) — PPh23 retur (derived dari invoice sumber saat create; read-only)
  const [editPph23, setEditPph23] = useState<number | null>(null);
  const [editTotalPph23, setEditTotalPph23] = useState<number | null>(null);

  const filteredPengirimanOptions = useMemo(() => (editPelangganId ? pengirimanOptions.filter((p) => p.pelangganId === editPelangganId) : pengirimanOptions), [pengirimanOptions, editPelangganId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setEditLoading(true);
      try {
        const r = await api.get<SalesReturResponse>(`/penjualan/sales-retur/${editId}`);
        if (cancelled) return;
        setEditNoRetur(r.noRetur);
        setEditStatus(r.status);
        setEditGrandTotal(Number(r.grandTotal));
        setEditInvoiceId(r.salesInvoiceId || '');
        setEditPelangganId(r.pelangganId || '');
        setEditPengirimanId(r.pengirimanId || '');
        setEditGudangId(r.gudangId || '');
        setEditTanggal(r.tanggal ? r.tanggal.slice(0, 10) : '');
        setEditAlamatPengembalian(r.alamatPengembalian || '');
        setEditNoPengembalian(r.noPengembalian || '');
        setEditDiskonGlobal(String(r.diskonGlobal ?? 0));
        setEditPpn(trimDecimalString(r.ppn ?? 0, '0'));
        setEditKeterangan(r.keterangan || '');
        // AUD-12 (update #05) — tampilkan PPh23 retur bila ada (grand total sudah net)
        setEditPph23(r.pph23 != null ? Number(r.pph23) : null);
        setEditTotalPph23(r.totalPph23 != null ? Number(r.totalPph23) : null);
      } catch (e) {
        toast.error(e instanceof ApiError ? e.detail : 'Gagal memuat data retur');
      } finally {
        if (!cancelled) setEditLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [editId]);

  const handleEditSubmit = useCallback(async () => {
    if (!editPelangganId) {
      toast.error('Pelanggan wajib diisi');
      return;
    }
    setEditSubmitting(true);
    try {
      const body: SalesReturUpdate = {
        tanggal: editTanggal,
        salesInvoiceId: editInvoiceId || undefined,
        pelangganId: editPelangganId,
        pengirimanId: editPengirimanId || null,
        gudangId: editGudangId || null,
        alamatPengembalian: editAlamatPengembalian || null,
        noPengembalian: editNoPengembalian || null,
        diskonGlobal: parseFloat(editDiskonGlobal) || null,
        ppn: parseFloat(editPpn) || 0,
        keterangan: editKeterangan || null
      };
      await api.put<SalesReturResponse>(`/penjualan/sales-retur/${editId}`, body);
      toast.success('Retur penjualan berhasil diperbarui');
      refreshListTab('sales', subPage);
      if (activeTabId) closeTab(activeTabId);
    } catch (e) {
      handleReturnError(e, 'Gagal memperbarui retur');
    } finally {
      setEditSubmitting(false);
    }
  }, [editId, editPelangganId, editPengirimanId, editGudangId, editTanggal, editInvoiceId, editAlamatPengembalian, editNoPengembalian, editDiskonGlobal, editPpn, editKeterangan, subPage, activeTabId, closeTab, refreshListTab, handleReturnError]);

  return (
    <FormTabShell title="Edit Retur Penjualan">
      <Card className="max-w-5xl">
        <CardContent className="p-6 space-y-4">
          {editLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Perbarui data header retur (detail barang tidak dapat diubah)</p>
              <div className="flex flex-wrap items-center gap-4 rounded-md border bg-muted/30 px-4 py-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5" />
                  <span>No Retur:</span>
                  <span className="font-mono font-semibold text-foreground">{editNoRetur}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>Status:</span>
                  <StatusBadge status={editStatus} />
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{editTotalPph23 != null && editTotalPph23 > 0 ? 'Total Retur (net PPh23):' : 'Grand Total:'}</span>
                  <span className="font-mono font-semibold text-foreground">{formatRp(editGrandTotal)}</span>
                </div>
                {editTotalPph23 != null && editTotalPph23 > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>PPh23 dibatalkan retur:</span>
                    <span className="font-mono font-semibold text-amber-700">{formatRp(editTotalPph23)}</span>
                    {editPph23 != null && <span className="text-muted-foreground">(tarif {editPph23}%)</span>}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Invoice</Label>
                  <Input value={invoiceOptions.find((invoice) => invoice.id === editInvoiceId)?.noInvoice || editInvoiceId} readOnly />
                  <p className="text-xs text-muted-foreground">Invoice sumber tetap agar harga detail retur konsisten.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    Pelanggan <span className="text-destructive">*</span>
                  </Label>
                  <Input value={pelangganOptions.find((customer) => customer.id === editPelangganId)?.nama || editPelangganId} readOnly />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Tanggal</Label>
                  <Input type="date" className="h-9 text-xs" value={editTanggal} onChange={(e) => setEditTanggal(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Gudang</Label>
                  <div className="flex items-start gap-1.5">
                    <SearchableDropdown className="min-w-0 flex-1" value={editGudangId} onValueChange={setEditGudangId} options={gudangOptions.map((g) => ({ id: g.id, label: g.kode + ' - ' + g.nama }))} placeholder="Pilih gudang (opsional)..." />
                    {/* Update #007: quick add gudang */}
                    <QuickAddGudangButton
                      compact
                      onCreated={(g) => {
                        setGudangOptions((prev) => (prev.some((row) => row.id === g.id) ? prev : [...prev, g]));
                        setEditGudangId(g.id);
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Pengiriman (Surat Jalan)</Label>
                  <SearchableDropdown value={editPengirimanId} onValueChange={setEditPengirimanId} options={filteredPengirimanOptions.map((p) => ({ id: p.id, label: p.noSuratJalan }))} placeholder={editPelangganId ? 'Pilih pengiriman...' : 'Pilih pelanggan dulu...'} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">No. Pengembalian</Label>
                  <Input className="h-9 text-xs" value={editNoPengembalian} onChange={(e) => setEditNoPengembalian(e.target.value)} placeholder="Nomor referensi" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Alamat Pengembalian</Label>
                <Input className="h-9 text-xs" value={editAlamatPengembalian} onChange={(e) => setEditAlamatPengembalian(e.target.value)} />
              </div>
              <Separator />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Diskon Global %</Label>
                  <Input type="number" className="h-9 text-xs" value={editDiskonGlobal} min={0} max={100} onChange={(e) => setEditDiskonGlobal(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  {/* === Update #048 — tarif PPN DIKUNCI (readOnly): terpusat di
                      Referensi → Perpajakan; menampilkan nilai yang tersimpan
                      pada retur. === */}
                  <Label className="text-xs font-medium">PPN (%)</Label>
                  <Input type="number" className="h-9 text-xs bg-muted/60 font-medium" value={editPpn} min={0} max={100} readOnly aria-readonly="true" title="Tarif PPN terkunci — atur di Referensi → Perpajakan" />
                  <p className="text-[11px] text-muted-foreground">Tarif terkunci — diatur di Referensi → Perpajakan.</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Keterangan</Label>
                <Textarea className="text-xs min-h-[60px]" value={editKeterangan} onChange={(e) => setEditKeterangan(e.target.value)} placeholder="Alasan retur / catatan tambahan..." />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => activeTabId && closeTab(activeTabId)} disabled={editSubmitting}>
                  Batal
                </Button>
                <Button size="sm" onClick={handleEditSubmit} disabled={editSubmitting}>
                  {editSubmitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Pencil className="mr-1.5 h-4 w-4" />}
                  {editSubmitting ? 'Menyimpan...' : 'Simpan Perubahan'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <StockOperationErrorDialog error={returnError} onClose={clearReturnError} />
    </FormTabShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 1: Pesanan Penjualan (List)
// ═════════════════════════════════════════════════════════════════════════════

function PesananTab({ pelangganOptions, syaratBayarOptions, barangOptions, refreshKey }: { pelangganOptions: PelangganDropdown[]; syaratBayarOptions: SyaratBayarResponse[]; barangOptions: BarangDropdown[]; refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab);

  const [data, setData] = useState<SalesOrderResponse[]>([]);
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
      const res = await api.get<PaginatedResponse<SalesOrderResponse>>(`/penjualan/sales-order?${params}`);
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

  // ── Cancel = Hard Delete (hapus permanen + histori) ──
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const handleCancel = useCallback(
    async (reason?: string) => {
      if (!cancelTarget) return;
      setCancelSubmitting(true);
      try {
        const res = await api.post<HardDeleteResponse>(`/penjualan/sales-order/${cancelTarget}/cancel`, {
          reason: reason || undefined
        });
        toast.success(res.message || 'Sales Order dihapus permanen');
        setCancelTarget(null);
        fetchData();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Gagal menghapus Sales Order');
      } finally {
        setCancelSubmitting(false);
      }
    },
    [cancelTarget, fetchData]
  );

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <Card className="border-emerald-200 bg-emerald-50/50">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <ShoppingCart className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-emerald-600 font-medium">Total Sales Order</p>
            {loading ? <Skeleton className="mt-1 h-6 w-16" /> : <p className="text-2xl font-bold text-emerald-700">{total}</p>}
          </div>
        </CardContent>
      </Card>

      {/* List Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Daftar Sales Order</CardTitle>
              {/* === Update #042 — SO nilai penuh tanpa PPN; DP bertahap & pelunasan
                  lewat pembuatan Invoice (bisa berkali-kali) dengan field
                  DP/Pelunasan (termin lama hanya histori Kas & Bank). === */}
              <CardDescription>Daftar seluruh Sales Order (SO) yang telah dicatat — langsung final saat disimpan (tanpa approval); DP bertahap &amp; pelunasan ditagih lewat pembuatan Invoice (bisa berkali-kali) dengan field DP/Pelunasan</CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() =>
                openFormTab({
                  title: 'Buat Sales Order',
                  module: 'sales',
                  subPage: 'pesanan',
                  formKey: 'pesanan-penjualan-create'
                })
              }>
              <Plus className="mr-1.5 h-4 w-4" /> Buat Sales Order
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
                <Input placeholder="Cari no pesanan/pelanggan..." value={search} onChange={(e) => handleSearchChange(e.target.value)} className="pl-8 h-9 text-sm" />
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
                  <SelectItem value="DIPROSES">Diproses</SelectItem>
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
                    <TableHead className="w-[130px]">No SO</TableHead>
                    <TableHead className="w-[100px]">Tanggal</TableHead>
                    <TableHead>Pelanggan</TableHead>
                    <TableHead>Customer PO</TableHead>
                    {/* Update #052 — kolom Pembayaran (histori termin SO lama,
                        fitur termin dihapus #040; SO baru selalu "—")
                        DIHAPUS biar rapi. */}
                    <TableHead>Fulfillment Status</TableHead>
                    <TableHead className="w-[110px] text-center">Status</TableHead>
                    {/* Update #043 — kolom Workflow dihapus (dokumen SO langsung final). */}
                    <TableHead className="w-[100px] text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <SkeletonRows cols={7} />
                  ) : data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        Tidak ada data Sales Order.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-xs font-medium">
                          {d.noPesanan}
                          {/* Update #032 — sumber penawaran (repeat order). */}
                          {d.penawaranNo && (
                            <p className="mt-0.5 flex items-center gap-1 text-[10px] font-normal text-amber-700">
                              <FileText className="h-3 w-3" />
                              {d.penawaranNo}
                              {d.penawaranRevisi && d.penawaranRevisi > 1 ? ` Rev. ${d.penawaranRevisi}` : ''}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{formatDate(d.tanggal)}</TableCell>
                        <TableCell className="text-xs">{d.pelanggan?.nama || '-'}</TableCell>
                        <TableCell className="text-xs">{d.customerPoNumber || '-'}</TableCell>
                        {/* Update #052 — sel kolom Pembayaran (histori termin)
                            dihapus bersama kolomnya. */}
                        <TableCell>
                          {/* M-05: fulfillment_status diisi backend (OPEN/PARTIAL/FULFILLED/CLOSED) — tampilkan label Indonesia */}
                          {(() => {
                            const fs = d.fulfillmentStatus;
                            if (!fs) return <Badge variant="outline">-</Badge>;
                            const map: Record<string, string> = { OPEN: 'Terbuka', PARTIAL: 'Sebagian', FULFILLED: 'Terpenuhi', CLOSED: 'Ditutup' };
                            return <Badge variant="outline">{map[fs] || fs}</Badge>;
                          })()}
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusBadge status={d.status} />
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                openFormTab({
                                  title: `Cetak ${d.noPesanan}`,
                                  module: 'sales',
                                  subPage: 'pesanan',
                                  formKey: 'pesanan-cetak',
                                  formProps: { id: d.id }
                                })
                              }
                              title="Cetak">
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                            {
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                onClick={() =>
                                  openFormTab({
                                    title: `${canEditOrder(d.status) ? 'Edit' : 'Detail'} ${d.noPesanan}`,
                                    module: 'sales',
                                    subPage: 'pesanan',
                                    formKey: 'pesanan-penjualan-edit',
                                    formProps: { id: d.id, noPesanan: d.noPesanan, status: d.status, grandTotal: Number(d.grandTotal) }
                                  })
                                }
                                title={canEditOrder(d.status) ? 'Edit' : 'Detail'}>
                                {canEditOrder(d.status) ? <Pencil className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                              </Button>
                            }
                            {d.status !== 'DIBATALKAN' && (
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => setCancelTarget(d.id)}>
                                Batal
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

      {/* Cancel = Hard Delete */}
      <HardDeleteCancelDialog
        open={!!cancelTarget}
        onOpenChange={(o) => {
          if (!o) setCancelTarget(null);
        }}
        title="Batalkan Sales Order?"
        formLabel="sales order"
        submitting={cancelSubmitting}
        onConfirm={(r) => handleCancel(r)}
      />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 2: Pengiriman Barang (List)
// ═════════════════════════════════════════════════════════════════════════════

function PengirimanTab({ pelangganOptions, barangOptions, satuanOptions, salesOrderOptions, refreshKey }: { pelangganOptions: PelangganDropdown[]; barangOptions: BarangDropdown[]; satuanOptions: SatuanResponse[]; salesOrderOptions: { id: string; noPesanan: string }[]; refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab);

  const [data, setData] = useState<PengirimanBarangResponse[]>([]);
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
      const res = await api.get<PaginatedResponse<PengirimanBarangResponse>>(`/penjualan/pengiriman?${params}`);
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

  // ── Cancel = Hard Delete (hapus permanen + histori) ──
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const handleCancel = useCallback(
    async (reason?: string) => {
      if (!cancelTarget) return;
      setCancelSubmitting(true);
      try {
        const res = await api.post<HardDeleteResponse>(`/penjualan/pengiriman/${cancelTarget}/cancel`, {
          reason: reason || undefined
        });
        toast.success(res.message || 'Pengiriman dihapus permanen');
        setCancelTarget(null);
        fetchData();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Gagal menghapus pengiriman');
      } finally {
        setCancelSubmitting(false);
      }
    },
    [cancelTarget, fetchData]
  );

  // Phase 4 — reverse finished (SELESAI) pengiriman: kembalikan stok + reverse HPP journal
  const [reverseTarget, setReverseTarget] = useState<PengirimanBarangResponse | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reversing, setReversing] = useState(false);

  const handleReverse = useCallback(async () => {
    if (!reverseTarget) return;
    setReversing(true);
    try {
      const reasonParam = reverseReason.trim() ? `?reason=${encodeURIComponent(reverseReason.trim())}` : '';
      await api.post(`/penjualan/pengiriman/${reverseTarget.id}/reverse${reasonParam}`);
      toast.success(`Pengiriman ${reverseTarget.noSuratJalan} berhasil dibatalkan (stok dikembalikan)`);
      setReverseTarget(null);
      setReverseReason('');
      fetchData();
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : 'Gagal membatalkan pengiriman';
      // Phase 4 — handle specific error cases with longer duration for actionable errors
      // === Update #050 — teks tanpa istilah "reverse" (pakai "batalkan"). ===
      if (msg.includes('sudah ada invoice') || msg.includes('Batalkan/reverse invoice terlebih dahulu')) {
        toast.error('Tidak bisa membatalkan — sudah ada invoice', {
          description: 'Batalkan dulu invoice yang memakai pengiriman ini, lalu batalkan pengirimannya.',
          duration: 8000
        });
      } else if (msg.includes('stok') && msg.includes('tidak mencukupi')) {
        toast.error('Stok tidak mencukupi untuk pembatalan', { description: msg, duration: 8000 });
      } else {
        toast.error(msg, { duration: 6000 });
      }
    } finally {
      setReversing(false);
    }
  }, [reverseTarget, reverseReason, fetchData]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Daftar Surat Jalan</CardTitle>
              <CardDescription>Daftar seluruh pengiriman barang</CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() =>
                openFormTab({
                  title: 'Buat Pengiriman Barang',
                  module: 'sales',
                  subPage: 'pengiriman',
                  formKey: 'pengiriman-create'
                })
              }>
              <Plus className="mr-1.5 h-4 w-4" /> Buat Pengiriman
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground">Cari</Label>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Cari no surat jalan/pelanggan..." value={search} onChange={(e) => handleSearchChange(e.target.value)} className="pl-8 h-9 text-sm" />
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
                  <SelectItem value="DIPROSES">Diproses</SelectItem>
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
                    {/* Update #004: kolom "No Surat Jalan" → "No Pengiriman". */}
                    <TableHead className="w-[140px]">No Pengiriman</TableHead>
                    <TableHead className="w-[100px]">Tanggal</TableHead>
                    <TableHead>Pelanggan</TableHead>
                    <TableHead>Alamat</TableHead>
                    <TableHead className="w-[110px] text-center">Status</TableHead>
                    {/* Update #043 — kolom Workflow dihapus (DO langsung final). */}
                    <TableHead className="w-[100px] text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <SkeletonRows cols={6} />
                  ) : data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        Tidak ada data pengiriman.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-xs font-medium">{d.noSuratJalan}</TableCell>
                        <TableCell className="text-xs">{formatDate(d.tanggal)}</TableCell>
                        <TableCell className="text-xs">{d.pelanggan?.nama || '-'}</TableCell>
                        <TableCell className="text-xs">{d.alamatPengiriman || '-'}</TableCell>
                        <TableCell className="text-center">
                          <StatusBadge status={d.status} />
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                openFormTab({
                                  title: `Cetak ${d.noSuratJalan}`,
                                  module: 'sales',
                                  subPage: 'pengiriman',
                                  formKey: 'pengiriman-cetak',
                                  formProps: { id: d.id }
                                })
                              }
                              title="Cetak">
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                            {(d.status === 'DRAFT' || d.status === 'DIPROSES') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                onClick={() =>
                                  openFormTab({
                                    title: `Edit ${d.noSuratJalan}`,
                                    module: 'sales',
                                    subPage: 'pengiriman',
                                    formKey: 'pengiriman-edit',
                                    formProps: { id: d.id, noSuratJalan: d.noSuratJalan, status: d.status }
                                  })
                                }
                                title="Edit">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {d.status === 'SELESAI' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-amber-600 hover:text-amber-700"
                                onClick={() => {
                                  setReverseTarget(d);
                                  setReverseReason('');
                                }}
                                title="Batalkan pengiriman (kembalikan stok)"
                                aria-label="Batalkan pengiriman">
                                <Undo2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {(d.status === 'DRAFT' || d.status === 'DIPROSES') && (
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => setCancelTarget(d.id)}>
                                Batal
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

      {/* Reverse confirmation dialog — Phase 4 */}
      <AlertDialog
        open={!!reverseTarget}
        onOpenChange={(open) => {
          if (!open && !reversing) {
            setReverseTarget(null);
            setReverseReason('');
          }
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan Pengiriman {reverseTarget?.noSuratJalan}?</AlertDialogTitle>
            <AlertDialogDescription>
              {/* === Update #050 — teks dialog ditulis ulang tanpa istilah
                  teknis (dulu: "Reverse HPP journal", "layer FIFO/FEFO"). === */}
              Pengiriman ini sudah selesai dan stoknya sudah keluar gudang. Pembatalan akan:
              <br />• Mengembalikan stok persis seperti sebelum pengiriman (pencatatan jurnal otomatis dibalik)
              <br />• Mengubah status pengiriman menjadi Dibatalkan
              <br />
              <br />
              <span className="text-amber-600">Catatan: pengiriman tidak bisa dibatalkan bila sudah difakturkan — batalkan invoice-nya terlebih dahulu.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 px-6">
            <Label htmlFor="reverse-reason-pengiriman">Alasan Pembatalan (opsional)</Label>
            <Textarea id="reverse-reason-pengiriman" placeholder="Contoh: Salah input qty / barang rusak / salah gudang / dll" rows={3} maxLength={200} value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} disabled={reversing} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reversing}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleReverse();
              }}
              disabled={reversing}
              className="bg-amber-600 text-white hover:bg-amber-700 gap-2">
              {reversing && <Loader2 className="h-4 w-4 animate-spin" />}
              Ya, Batalkan Pengiriman
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel = Hard Delete */}
      <HardDeleteCancelDialog
        open={!!cancelTarget}
        onOpenChange={(o) => {
          if (!o) setCancelTarget(null);
        }}
        title="Batalkan Pengiriman?"
        formLabel="pengiriman"
        submitting={cancelSubmitting}
        onConfirm={(r) => handleCancel(r)}
      />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 3: Invoice Penjualan (List)
// ═════════════════════════════════════════════════════════════════════════════

function InvoiceTab({ pelangganOptions, syaratBayarOptions, barangOptions, salesOrderOptions, refreshKey }: { pelangganOptions: PelangganDropdown[]; syaratBayarOptions: SyaratBayarResponse[]; barangOptions: BarangDropdown[]; salesOrderOptions: { id: string; noPesanan: string }[]; refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab);

  const [data, setData] = useState<SalesInvoiceResponse[]>([]);
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
      const res = await api.get<PaginatedResponse<SalesInvoiceResponse>>(`/penjualan/sales-invoice?${params}`);
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

  // ── Cancel = Hard Delete (hapus permanen + histori) ──
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const handleCancel = useCallback(
    async (reason?: string) => {
      if (!cancelTarget) return;
      setCancelSubmitting(true);
      try {
        const res = await api.post<HardDeleteResponse>(`/penjualan/sales-invoice/${cancelTarget}/cancel`, {
          reason: reason || undefined
        });
        toast.success(res.message || 'Invoice dihapus permanen');
        setCancelTarget(null);
        fetchData();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Gagal menghapus invoice');
      } finally {
        setCancelSubmitting(false);
      }
    },
    [cancelTarget, fetchData]
  );

  const saldoStates = useInvoiceSaldos(
    'piutang',
    data.map((d) => d.id),
    refreshKey
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Daftar Invoice</CardTitle>
              <CardDescription>Daftar seluruh invoice penjualan</CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() =>
                openFormTab({
                  title: 'Buat Invoice Penjualan',
                  module: 'sales',
                  subPage: 'invoice',
                  formKey: 'invoice-penjualan-create'
                })
              }>
              <Plus className="mr-1.5 h-4 w-4" /> Buat Invoice
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground">Cari</Label>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Cari no invoice/pelanggan..." value={search} onChange={(e) => handleSearchChange(e.target.value)} className="pl-8 h-9 text-sm" />
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
                  <SelectItem value="DIPROSES">Diproses</SelectItem>
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
                    <TableHead className="w-[140px]">No Invoice</TableHead>
                    <TableHead className="w-[100px]">Tanggal</TableHead>
                    <TableHead>Pelanggan</TableHead>
                    <TableHead className="text-right w-[160px]">Total</TableHead>
                    <TableHead className="w-[100px]">Syarat Bayar</TableHead>
                    <TableHead className="w-[110px] text-center">Status</TableHead>
                    <TableHead className="w-[110px] text-center">Status Bayar</TableHead>
                    {/* Update #043 — kolom Workflow dihapus (invoice langsung final). */}
                    <TableHead className="w-[100px] text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <SkeletonRows cols={8} />
                  ) : data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                        Tidak ada data invoice.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-xs font-medium">{d.noInvoice}</TableCell>
                        <TableCell className="text-xs">{formatDate(d.tanggal)}</TableCell>
                        <TableCell className="text-xs">{d.pelanggan?.nama || '-'}</TableCell>
                        <TableCell className="text-right font-mono text-xs font-medium">{formatRp(Number(d.grandTotal))}</TableCell>
                        <TableCell className="text-xs">{d.syaratBayar?.nama || '-'}</TableCell>
                        <TableCell className="text-center">
                          <StatusBadge status={d.status} />
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusPembayaranBadge status={saldoStates.saldos[d.id]?.statusPembayaran} />
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                openFormTab({
                                  title: `Cetak ${d.noInvoice}`,
                                  module: 'sales',
                                  subPage: 'invoice',
                                  formKey: 'invoice-cetak',
                                  formProps: { id: d.id }
                                })
                              }
                              title="Cetak">
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                            {(d.status === 'DRAFT' || d.status === 'DIPROSES') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                onClick={() =>
                                  openFormTab({
                                    title: `Edit ${d.noInvoice}`,
                                    module: 'sales',
                                    subPage: 'invoice',
                                    formKey: 'invoice-penjualan-edit',
                                    formProps: { id: d.id, noInvoice: d.noInvoice, status: d.status, grandTotal: Number(d.grandTotal) }
                                  })
                                }
                                title="Edit">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {d.status !== 'DIBATALKAN' && (
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => setCancelTarget(d.id)}>
                                Batal
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

      {/* Cancel = Hard Delete */}
      <HardDeleteCancelDialog
        open={!!cancelTarget}
        onOpenChange={(o) => {
          if (!o) setCancelTarget(null);
        }}
        title="Batalkan Invoice Penjualan?"
        formLabel="invoice penjualan"
        submitting={cancelSubmitting}
        onConfirm={(r) => handleCancel(r)}
      />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 4: Retur Penjualan (List)
// ═════════════════════════════════════════════════════════════════════════════

function ReturTab({ pelangganOptions, barangOptions, invoiceOptions, refreshKey }: { pelangganOptions: PelangganDropdown[]; barangOptions: BarangDropdown[]; invoiceOptions: { id: string; noInvoice: string }[]; refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab);

  const [data, setData] = useState<SalesReturResponse[]>([]);
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
      const res = await api.get<PaginatedResponse<SalesReturResponse>>(`/penjualan/sales-retur?${params}`);
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

  // ── Cancel = Hard Delete (hapus permanen + histori) ──
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const handleCancel = useCallback(
    async (reason?: string) => {
      if (!cancelTarget) return;
      setCancelSubmitting(true);
      try {
        const res = await api.post<HardDeleteResponse>(`/penjualan/sales-retur/${cancelTarget}/cancel`, {
          reason: reason || undefined
        });
        toast.success(res.message || 'Retur dihapus permanen');
        setCancelTarget(null);
        fetchData();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Gagal menghapus retur');
      } finally {
        setCancelSubmitting(false);
      }
    },
    [cancelTarget, fetchData]
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Daftar Retur Penjualan</CardTitle>
              <CardDescription>Daftar seluruh retur / pengembalian barang</CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() =>
                openFormTab({
                  title: 'Buat Retur Penjualan',
                  module: 'sales',
                  subPage: 'retur',
                  formKey: 'retur-penjualan-create'
                })
              }>
              <Plus className="mr-1.5 h-4 w-4" /> Buat Retur
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground">Cari</Label>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Cari no retur/pelanggan..." value={search} onChange={(e) => handleSearchChange(e.target.value)} className="pl-8 h-9 text-sm" />
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
                  <SelectItem value="DIPROSES">Diproses</SelectItem>
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
                    <TableHead className="w-[130px]">No Retur</TableHead>
                    <TableHead className="w-[130px]">No Invoice</TableHead>
                    <TableHead className="w-[100px]">Tanggal</TableHead>
                    <TableHead>Pelanggan</TableHead>
                    <TableHead className="text-right w-[140px]">Total</TableHead>
                    <TableHead className="w-[110px] text-center">Status</TableHead>
                    {/* Update #043 — kolom Workflow dihapus (retur langsung final). */}
                    <TableHead className="w-[100px] text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <SkeletonRows cols={7} />
                  ) : data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        Tidak ada data retur.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-xs font-medium">{d.noRetur}</TableCell>
                        {/* M-04: SalesReturResponse.salesInvoice adalah SalesInvoiceSimpleResponse
                            (backend: { id, no_invoice }) — noPesanan adalah field Sales Order, bukan invoice. */}
                        <TableCell className="font-mono text-xs">{d.salesInvoice?.noInvoice || '-'}</TableCell>
                        <TableCell className="text-xs">{formatDate(d.tanggal)}</TableCell>
                        <TableCell className="text-xs">{d.pelanggan?.nama || '-'}</TableCell>
                        <TableCell className="text-right font-mono text-xs font-medium">{formatRp(Number(d.grandTotal))}</TableCell>
                        <TableCell className="text-center">
                          <StatusBadge status={d.status} />
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                openFormTab({
                                  title: `Cetak ${d.noRetur}`,
                                  module: 'sales',
                                  subPage: 'retur',
                                  formKey: 'retur-cetak',
                                  formProps: { id: d.id }
                                })
                              }
                              title="Cetak">
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                            {(d.status === 'DRAFT' || d.status === 'DIPROSES') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                onClick={() =>
                                  openFormTab({
                                    title: `Edit ${d.noRetur}`,
                                    module: 'sales',
                                    subPage: 'retur',
                                    formKey: 'retur-penjualan-edit',
                                    formProps: { id: d.id, noRetur: d.noRetur, status: d.status, grandTotal: Number(d.grandTotal) }
                                  })
                                }
                                title="Edit">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {d.status !== 'DIBATALKAN' && (
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => setCancelTarget(d.id)}>
                                Batal
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

      {/* Cancel = Hard Delete */}
      <HardDeleteCancelDialog
        open={!!cancelTarget}
        onOpenChange={(o) => {
          if (!o) setCancelTarget(null);
        }}
        title="Batalkan Retur Penjualan?"
        formLabel="retur penjualan"
        submitting={cancelSubmitting}
        onConfirm={(r) => handleCancel(r)}
      />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT: Sales
// ═════════════════════════════════════════════════════════════════════════════

interface SalesPageProps {
  subPage?: string;
  refreshKey?: number;
  formMode?: string;
  formProps?: Record<string, unknown>;
}

export default function Sales({ subPage: subPageProp, refreshKey, formMode, formProps }: SalesPageProps) {
  // PERBAIKAN rules-of-hooks: hook store dipanggil tanpa syarat (dulu `subPageProp || useERPStore(...)`
  // menyebabkan hook kondisional), dan routing form dipindah SEBELUM hook list sehingga
  // jumlah hook `Sales` selalu konstan di setiap render.
  const activeSubPage = useERPStore((s) => s.activeSubPage);
  const subPage = subPageProp || activeSubPage || 'pesanan';

  // ── Update #01 — Pelunasan Piutang pindah ke modul Kas & Bank ──
  // Routing subPage 'pelunasan-piutang' kini di-handle page.tsx (modul
  // cash-bank); tab lama otomatis di-remap, jadi Sales tidak lagi
  // merender halaman pelunasan.

  // ── Form mode: render the appropriate form component in a tab ──
  if (formMode) {
    const editId = formProps?.id as string | undefined;

    if (formMode === 'pesanan-cetak' && editId) {
      return <PesananCetakTab id={editId} />;
    }
    if (formMode === 'pengiriman-cetak' && editId) {
      return <PengirimanCetakTab id={editId} />;
    }
    if (formMode === 'invoice-cetak' && editId) {
      return <InvoiceCetakTab id={editId} />;
    }
    if (formMode === 'retur-cetak' && editId) {
      return <ReturCetakTab id={editId} />;
    }

    // ── Penawaran (quotation) — update #3 ──
    if (formMode === 'penawaran-create') {
      return <PenawaranCreateForm subPage={subPage} />;
    }
    if (formMode === 'penawaran-edit' && editId) {
      return <PenawaranCreateForm editId={editId} subPage={subPage} />;
    }
    if (formMode === 'penawaran-cetak' && editId) {
      return <PenawaranCetakTab id={editId} />;
    }

    if (formMode === 'pesanan-penjualan-create') {
      // Update #033 — formProps.penawaranId dari tombol "Buat SO" (daftar
      // penawaran): form terisi otomatis dari penawaran tersebut.
      return <PesananPenjualanCreateForm subPage={subPage} initialPenawaranId={formProps?.penawaranId as string | undefined} />;
    }
    if (formMode === 'pesanan-penjualan-edit' && editId) {
      return <PesananPenjualanEditForm editId={editId} subPage={subPage} initialNoPesanan={formProps?.noPesanan as string | undefined} initialStatus={formProps?.status as string | undefined} initialGrandTotal={formProps?.grandTotal as number | undefined} />;
    }
    if (formMode === 'pengiriman-create') {
      return <PengirimanCreateForm subPage={subPage} />;
    }
    if (formMode === 'pengiriman-edit' && editId) {
      return <PengirimanEditForm editId={editId} subPage={subPage} initialNoSuratJalan={formProps?.noSuratJalan as string | undefined} initialStatus={formProps?.status as string | undefined} />;
    }
    if (formMode === 'invoice-penjualan-create') {
      return <InvoicePenjualanCreateForm subPage={subPage} />;
    }
    if (formMode === 'invoice-penjualan-edit' && editId) {
      return <InvoicePenjualanEditForm editId={editId} subPage={subPage} initialNoInvoice={formProps?.noInvoice as string | undefined} initialStatus={formProps?.status as string | undefined} initialGrandTotal={formProps?.grandTotal as number | undefined} />;
    }
    if (formMode === 'retur-penjualan-create') {
      return <ReturPenjualanCreateForm subPage={subPage} />;
    }
    if (formMode === 'retur-penjualan-edit' && editId) {
      return <ReturPenjualanEditForm editId={editId} subPage={subPage} initialNoRetur={formProps?.noRetur as string | undefined} initialStatus={formProps?.status as string | undefined} initialGrandTotal={formProps?.grandTotal as number | undefined} />;
    }
    return null;
  }

  return <SalesList subPage={subPage} refreshKey={refreshKey} />;
}

// ── List mode: semua hook list hidup di komponen terpisah agar urutan hook stabil ──

function SalesList({ subPage, refreshKey }: { subPage: string; refreshKey?: number }) {
  // ── Shared dropdown state ──
  const [pelangganOptions, setPelangganOptions] = useState<PelangganDropdown[]>([]);
  const [syaratBayarOptions, setSyaratBayarOptions] = useState<SyaratBayarResponse[]>([]);
  const [barangOptions, setBarangOptions] = useState<BarangDropdown[]>([]);
  const [satuanOptions, setSatuanOptions] = useState<SatuanResponse[]>([]);
  const [salesOrderOptions, setSalesOrderOptions] = useState<{ id: string; noPesanan: string }[]>([]);
  const [invoiceOptions, setInvoiceOptions] = useState<{ id: string; noInvoice: string }[]>([]);
  const [dropdownsLoading, setDropdownsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setDropdownsLoading(true);
      try {
        const [pelanggan, syaratBayar, barang, satuan, soRes, invRes] = await Promise.all([api.get<PelangganDropdown[]>('/master/pelanggan-dropdown'), api.get<SyaratBayarResponse[]>('/master/syarat-bayar'), api.get<BarangDropdown[]>('/master/barang-dropdown'), api.get<SatuanResponse[]>('/master/satuan'), api.get<PaginatedResponse<SalesOrderResponse>>('/penjualan/sales-order?limit=200'), api.get<PaginatedResponse<SalesInvoiceResponse>>('/penjualan/sales-invoice?limit=200')]);
        if (cancelled) return;
        setPelangganOptions(pelanggan);
        setSyaratBayarOptions(syaratBayar);
        setBarangOptions(barang);
        setSatuanOptions(satuan);
        setSalesOrderOptions(soRes.data.map((s) => ({ id: s.id, noPesanan: s.noPesanan })));
        setInvoiceOptions(invRes.data.map((i) => ({ id: i.id, noInvoice: i.noInvoice })));
      } catch {
        // Silently fail — dropdowns will be empty
      } finally {
        if (!cancelled) setDropdownsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      {dropdownsLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <Skeleton className="h-[500px] w-full" />
        </div>
      ) : (
        <>
          {subPage === 'penawaran' && <PenawaranTab pelangganOptions={pelangganOptions} refreshKey={refreshKey} />}
          {subPage === 'pesanan' && <PesananTab pelangganOptions={pelangganOptions} syaratBayarOptions={syaratBayarOptions} barangOptions={barangOptions} refreshKey={refreshKey} />}
          {subPage === 'pengiriman' && <PengirimanTab pelangganOptions={pelangganOptions} barangOptions={barangOptions} satuanOptions={satuanOptions} salesOrderOptions={salesOrderOptions} refreshKey={refreshKey} />}
          {subPage === 'invoice' && <InvoiceTab pelangganOptions={pelangganOptions} syaratBayarOptions={syaratBayarOptions} barangOptions={barangOptions} salesOrderOptions={salesOrderOptions} refreshKey={refreshKey} />}
          {subPage === 'retur' && <ReturTab pelangganOptions={pelangganOptions} barangOptions={barangOptions} invoiceOptions={invoiceOptions} refreshKey={refreshKey} />}
        </>
      )}
    </div>
  );
}
