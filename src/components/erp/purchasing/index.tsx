'use client';

import { invoicePhaseDFields, invoiceSaveMismatches, createPurchaseInvoice, duplicateInvoiceMessage } from '@/lib/invoice-documents';

// === Update #049 — navigasi otomatis ke field wajib yang terlewat saat
// simpan (scroll + fokus ke field pertama yang belum diisi). ===
import { focusFormError } from '@/lib/form-error-focus';

import { stockLineError, loadPostedInvoiceOptions } from '@/lib/delivery-receipt';
import { StockOperationErrorDialog, useStockOperationError } from '@/components/erp/stock-operation-error-dialog';
import { PurchaseReturnSourceLines, usePurchaseReturnSource, type PurchaseReturnQuantities } from '@/components/erp/purchase-return-source';

import OrderDocumentForm from '@/components/erp/orders/order-document-form';
import { canEditOrder } from '@/lib/order-documents';
// Update #037 — Detail ROP: kolam belanja PIC Pembelian (ROP → PO draft)
import { DetailRopTab } from '@/components/erp/purchasing/detail-rop';

import { useState, useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

import { useERPStore } from '@/store/erp-store';
import { useTabStore } from '@/store/tab-store';
import { useAuthStore } from '@/store/auth-store';
import { useFormDraft, draftKey } from '@/hooks/use-form-draft';
import { DraftIndicator } from '@/components/erp/draft-indicator';
import { FormTabShell } from '@/components/erp/form-tab-shell';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { FileText, Package, Receipt, RotateCcw, Plus, Trash2, ShoppingCart, TrendingDown, Search, ChevronLeft, ChevronRight, Loader2, Pencil, Info, Printer, CheckCircle2, Link2, Unlink, Undo2, Lock } from 'lucide-react';
import { formatRp, formatDate } from '@/lib/pdf-utils';
// Update #4 — auto-fill alamat & field terkait dari master saat supplier dipilih
import { findPartyMaster, AUTOFILL_HINT } from '@/lib/party-autofill';
// Update #007 — quick add master data langsung dari form transaksi
import { QuickAddSupplierButton, QuickAddGudangButton, QuickAddBarangButton, QuickAddSatuanButton, toSupplierDropdown, toBarangDropdown, satuanFromBarang } from '@/components/erp/quick-add';
import { api, ApiError, PaginatedResponse } from '@/lib/api';
import { useDefaultTaxRates } from '@/lib/use-default-rates';
import { trimDecimalString } from '@/lib/money';
import { toast } from 'sonner';
import { PesananPembelianCetakTab, PenerimaanCetakTab, InvoicePembelianCetakTab, ReturPembelianCetakTab, LppbCetakTab } from '@/components/erp/purchasing/cetak-tabs';
// Update ASAHI #005 — modul LPPB (list + form) sebagai file mandiri
import { LppbTab, LppbForm } from '@/components/erp/purchasing/lppb';
// === Update #043 — UI approval (workflow) DIHAPUS dari modul Penjualan &
// Pembelian: dokumen langsung final saat disimpan. Komponen workflow tetap
// dipakai modul lain (kas-bank/persediaan/produksi/aset + Antrean Persetujuan). ===
import { StatusPembayaranBadge } from '@/components/erp/pelunasan/status-badge';
import { useInvoiceSaldos } from '@/lib/use-invoice-saldos';
import type { PurchaseOrderResponse, PurchaseOrderSisaResponse, PurchaseOrderCreate, PurchaseOrderUpdate, PurchaseOrderDetailCreate, PenerimaanBarangResponse, PenerimaanBarangCreate, PenerimaanBarangUpdate, PenerimaanBarangDetailCreate, PurchaseInvoiceResponse, PurchaseInvoiceCreate, PurchaseInvoiceUpdate, PurchaseInvoiceDetailCreate, PurchaseReturResponse, PurchaseReturCreate, PurchaseReturUpdate, PurchaseReturDetailCreate, SupplierDropdown, BarangDropdown, BarangResponse, SatuanResponse, GudangResponse, TransaksiBiayaCreate, HardDeleteResponse } from '@/types/api';
import { HardDeleteCancelDialog } from '@/components/erp/hard-delete-cancel-dialog';

// === Update #066 — menu LPPB & Penerimaan pindah ke modul Persediaan (setelah
// Penyesuaian). Komponen halaman/form/cetak Penerimaan & LPPB diekspor agar
// modul Persediaan bisa me-render-nya; routing modul Pembelian dipertahankan
// untuk tab lama yang masih terbuka (lihat Purchasing di bawah). ===
export { LppbTab, LppbForm };
export { PenerimaanCetakTab, LppbCetakTab };

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
  hargaPerolehan: string;
  tanggalKedaluwarsa: string;
  // === Tarik data PO (Task 16-c2): link baris ke line PO sumber ===
  purchaseOrderDetailId?: string;
}

interface FormBiayaRow {
  id: string;
  nama: string;
  jumlah: string;
}

function newDetailRow(): FormDetailRow {
  return { id: crypto.randomUUID(), barangId: '', kodeBarang: '', barangNama: '', harga: '', qty: '1', diskon: '0', satuanId: '', satuanNama: '', hargaPerolehan: '', tanggalKedaluwarsa: '' };
}

function newBiayaRow(): FormBiayaRow {
  return { id: crypto.randomUUID(), nama: '', jumlah: '' };
}

// ─── Draft Otomatis (localStorage) — bentuk data per form create ──────────

interface PenerimaanBarangDraftData {
  purchaseOrderId: string;
  supplierId: string;
  gudangId: string;
  tanggal: string;
  alamat: string;
  keterangan: string;
  purchaseInvoiceId: string;
  detail: FormDetailRow[];
}

// === Update #049 — field invoiceType DIHAPUS dari draft (field "Tipe Invoice"
// dihapus dari form: label bebas opsional yang tidak memengaruhi jurnal/stok
// dan hanya membingungkan). ===
interface InvoicePembelianDraftData {
  purchaseOrderId: string;
  supplierId: string;
  tanggal: string;
  noFaktur: string;
  alamat: string;
  diskonGlobal: string;
  ppn: string;
  keterangan: string;
  detail: FormDetailRow[];
  biayaTambahan: FormBiayaRow[];
}

interface ReturPembelianDraftData {
  purchaseOrderId: string;
  supplierId: string;
  gudangId: string;
  tanggal: string;
  alamat: string;
  ppn: string;
  keterangan: string;
  purchaseInvoiceId: string;
  /** Task 16-c2: qty retur per baris invoice sumber (key = invoice detail id). */
  quantities: PurchaseReturnQuantities;
}

// ─── Detail Table With Price (for PO / Invoice / Retur forms) ──────────────

function DetailTableWithPrice({ rows, setRows, barangOptions, satuanOptions, onBarangCreated, onSatuanCreated }: { rows: FormDetailRow[]; setRows: Dispatch<SetStateAction<FormDetailRow[]>>; barangOptions: BarangDropdown[]; satuanOptions?: SatuanResponse[]; onBarangCreated?: (barang: BarangResponse) => void; onSatuanCreated?: (satuan: SatuanResponse) => void }) {
  const addRow = useCallback(() => setRows((p) => [...p, newDetailRow()]), [setRows]);
  const removeRow = useCallback((id: string) => setRows((p) => p.filter((r) => r.id !== id)), [setRows]);
  // Update #007: terapkan barang ke baris — dipakai manual pick DAN quick-add.
  const applyBarang = useCallback(
    (id: string, value: string, found: BarangDropdown | undefined) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          // Update ASAHI #4: satuan otomatis terpilih dari master barang (base_uom,
          // dulu di-reset kosong) — sejalan dengan auto-fill harga.
          return { ...r, barangId: value, ...(satuanOptions ? { satuanId: found?.satuanId || '' } : {}), kodeBarang: found?.kode || '', barangNama: found?.nama || '', harga: found ? String(found.hargaPokok) : r.harga };
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
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    },
    [setRows, barangOptions, applyBarang]
  );

  const subtotal = rows.reduce((s, r) => {
    const q = parseFloat(r.qty) || 0;
    const h = parseFloat(r.harga) || 0;
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
              {satuanOptions && <TableHead className="min-w-[140px]">Satuan</TableHead>}
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
                    <div className="flex items-center gap-1">
                      <SearchableDropdown className="min-w-0 flex-1" value={row.barangId} onValueChange={(v) => updateRow(row.id, 'barangId', v)} options={barangOptions.map((b) => ({ id: b.id, label: b.nama, subtitle: b.kode }))} placeholder="Pilih barang..." compact />
                      {/* Update #007: quick add barang langsung di baris */}
                      <QuickAddBarangButton
                        compact
                        onCreated={(b) => {
                          const drop = toBarangDropdown(b);
                          onBarangCreated?.(b);
                          applyBarang(row.id, b.id, drop);
                        }}
                      />
                    </div>
                  </TableCell>
                  {satuanOptions && (
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <SearchableDropdown className="min-w-0 flex-1" value={row.satuanId} onValueChange={(value) => updateRow(row.id, 'satuanId', value)} options={satuanOptions.map((unit) => ({ id: unit.id, label: unit.nama }))} placeholder="Satuan (opsional)" allOption={{ id: '', label: 'Belum ditentukan' }} compact />
                        {/* Update #007: quick add satuan langsung di baris */}
                        <QuickAddSatuanButton
                          compact
                          onCreated={(s) => {
                            onSatuanCreated?.(s);
                            updateRow(row.id, 'satuanId', s.id);
                          }}
                        />
                      </div>
                    </TableCell>
                  )}
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
                <TableCell colSpan={satuanOptions ? 8 : 7} className="h-16 text-center text-muted-foreground">
                  Belum ada item. Klik "+ Tambah Baris" untuk menambahkan.
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

// ─── Totals Breakdown (PPN baris terpisah) ──────────────────────────────────

function TotalsBreakdown({ subtotal, diskonGlobalPct, ppnPct, totalBiayaTambahan, pph23Pct = 0 }: { subtotal: number; diskonGlobalPct: number; ppnPct: number; totalBiayaTambahan: number; pph23Pct?: number }) {
  const totalDiskon = subtotal * (diskonGlobalPct / 100);
  const dasarPajak = subtotal - totalDiskon;
  const ppnAmount = dasarPajak * (ppnPct / 100);
  // AUD-09 (update #04): PPh 23 atas dasar pajak (potongan supplier sejak invoice)
  const pph23Amount = dasarPajak * (pph23Pct / 100);
  const grandTotal = dasarPajak + ppnAmount + totalBiayaTambahan - pph23Amount;

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
      {/* === Update #052 — baris PPh23 akhirnya TAMPIL (sebelumnya hanya
          dihitung tanpa dirender; mirror Invoice Penjualan). === */}
      {pph23Pct > 0 && (
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

// ─── Detail Table Simple (for Penerimaan form) ──────────────────────────────

// === Audit manufaktur (2026-10-01): FEFO kini mengikuti metode valuasi GLOBAL
// (Setting Akun → METODE_VALUASI). Kolom legacy per-barang (metodeValuasi di
// barang-dropdown, seluruhnya masih "AVERAGE") tidak lagi dipakai engine
// stok backend — keputusan input kedaluwarsa harus memakai metode global
// agar konsisten dengan validasi eksekusi FEFO di backend.
function isFefoRow(row: FormDetailRow, metodeValuasiGlobal?: string): boolean {
  if (!row.barangId) return false;
  return metodeValuasiGlobal === 'FEFO';
}

function DetailTableSimple({ rows, setRows, barangOptions, satuanOptions, metodeValuasiGlobal, onBarangCreated, onSatuanCreated }: { rows: FormDetailRow[]; setRows: Dispatch<SetStateAction<FormDetailRow[]>>; barangOptions: BarangDropdown[]; satuanOptions: SatuanResponse[]; metodeValuasiGlobal?: string; onBarangCreated?: (barang: BarangResponse) => void; onSatuanCreated?: (satuan: SatuanResponse) => void }) {
  const addRow = useCallback(() => setRows((p) => [...p, newDetailRow()]), [setRows]);
  const removeRow = useCallback((id: string) => setRows((p) => p.filter((r) => r.id !== id)), [setRows]);
  // Update #007: terapkan barang ke baris — dipakai manual pick DAN quick-add.
  // satuanNamaOverride: nama satuan dari response create barang (satuan bisa
  // baru dibuat via nested quick-add, belum ada di satuanOptions host).
  const applyBarang = useCallback(
    (id: string, value: string, found: BarangDropdown | undefined, satuanNamaOverride?: string) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          // Auto-fill harga perolehan dari harga pokok barang (bila belum terisi).
          // Field tetap dikirim di payload walau input disembunyikan; nanti ditimpa harga PO saat tarik data.
          // Update ASAHI #4: satuan otomatis terpilih dari master barang (base_uom).
          const satuanDefault = found?.satuanId || '';
          const satuanNama = satuanNamaOverride ?? (satuanOptions.find((s) => s.id === satuanDefault)?.nama || '');
          return { ...r, barangId: value, kodeBarang: found?.kode || '', barangNama: found?.nama || '', satuanId: satuanDefault, satuanNama, hargaPerolehan: !r.hargaPerolehan && found ? String(found.hargaPokok) : r.hargaPerolehan };
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
  // Kolom Kedaluwarsa hanya tampil bila metode valuasi global FEFO dan
  // ada minimal satu baris berisi barang (audit manufaktur 2026-10-01).
  const hasFefoRow = rows.some((r) => isFefoRow(r, metodeValuasiGlobal));

  return (
    <div className="space-y-3">
      <div className="max-h-72 overflow-y-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[100px]">Kode Barang</TableHead>
              <TableHead className="min-w-[200px]">Nama Barang</TableHead>
              <TableHead className="w-[80px] text-right">Qty</TableHead>
              <TableHead className="w-[120px]">Satuan</TableHead>
              {hasFefoRow && <TableHead className="w-[140px]">Kedaluwarsa</TableHead>}
              <TableHead className="w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs">
                  {row.kodeBarang || '-'}
                  {row.purchaseOrderDetailId && (
                    <span className="ml-1.5 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700" title="Baris ter-link ke line Purchase Order">
                      PO
                    </span>
                  )}
                </TableCell>
                <TableCell>
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
                </TableCell>
                <TableCell>
                  <Input type="number" className="h-8 text-right text-xs" value={row.qty} min={1} step={1} aria-invalid={!!row.barangId && (!Number.isInteger(Number(row.qty)) || Number(row.qty) < 1)} onChange={(e) => updateRow(row.id, 'qty', e.target.value)} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <SearchableDropdown className="min-w-0 flex-1" value={row.satuanId} onValueChange={(v) => updateRow(row.id, 'satuanId', v)} options={satuanOptions.map((s) => ({ id: s.id, label: s.nama }))} placeholder="Pilih..." compact />
                    {/* Update #007: quick add satuan langsung di baris */}
                    <QuickAddSatuanButton
                      compact
                      onCreated={(s) => {
                        onSatuanCreated?.(s);
                        updateRow(row.id, 'satuanId', s.id);
                      }}
                    />
                  </div>
                </TableCell>
                {hasFefoRow && (
                  <TableCell>
                    {isFefoRow(row, metodeValuasiGlobal) ? (
                      <Input type="date" className="h-8 text-xs" value={row.tanggalKedaluwarsa} onChange={(e) => updateRow(row.id, 'tanggalKedaluwarsa', e.target.value)} />
                    ) : (
                      <span className="text-xs text-muted-foreground" title="Baris tanpa barang tidak memerlukan kedaluwarsa">
                        —
                      </span>
                    )}
                  </TableCell>
                )}
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeRow(row.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={hasFefoRow ? 6 : 5} className="h-16 text-center text-muted-foreground">
                  Belum ada item. Klik "+ Tambah Baris" untuk menambahkan.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addRow}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Tambah Baris
        </Button>
        <div className="flex gap-6 text-sm">
          <span>
            Total Kuantitas: <strong>{totalQty}</strong>
          </span>
          <span>
            Jumlah Barang: <strong>{jumlahBarang}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Biaya Tambahan Table (for PO / Invoice forms) ──────────────────────────

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

// ─── Shared Dropdown Hook ───────────────────────────────────────────────────

function usePurchasingDropdowns() {
  const [supplierOptions, setSupplierOptions] = useState<SupplierDropdown[]>([]);
  const [barangOptions, setBarangOptions] = useState<BarangDropdown[]>([]);
  const [satuanOptions, setSatuanOptions] = useState<SatuanResponse[]>([]);
  const [purchaseOrderOptions, setPurchaseOrderOptions] = useState<{ id: string; noPesanan: string }[]>([]);
  const [gudangOptions, setGudangOptions] = useState<GudangResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [supplier, barang, satuan, poRes, gudang] = await Promise.all([api.get<SupplierDropdown[]>('/master/supplier-dropdown'), api.get<BarangDropdown[]>('/master/barang-dropdown'), api.get<SatuanResponse[]>('/master/satuan'), api.get<PaginatedResponse<PurchaseOrderResponse>>('/pembelian/purchase-order?limit=200'), api.get<GudangResponse[]>('/master/gudang')]);
        if (cancelled) return;
        setSupplierOptions(supplier);
        setBarangOptions(barang);
        setSatuanOptions(satuan);
        setPurchaseOrderOptions(poRes.data.map((p) => ({ id: p.id, noPesanan: p.noPesanan })));
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

  return { supplierOptions, setSupplierOptions, barangOptions, setBarangOptions, satuanOptions, setSatuanOptions, purchaseOrderOptions, gudangOptions, setGudangOptions, loading };
}

// ═════════════════════════════════════════════════════════════════════════════
// === Update #063 — opsi PO yang MASIH PUNYA SISA (mirror pola "tersedia"
// modul Penjualan #047). Permintaan user: "alur yang menarik data — yang
// sudah terpakai sebelumnya jangan ditampilkan lagi", diterapkan ke semua
// modul dengan alur tarik data:
//   - PO di form Penerimaan → /pembelian/purchase-order/tersedia?untuk=penerimaan
//   - PO di form Invoice    → /pembelian/purchase-order/tersedia?untuk=invoice
// Fallback ke daftar penuh bila endpoint belum tersedia (backend lama);
// PO yang sedang dipilih selalu disisipkan supaya labelnya tetap tampil
// (mis. PO yang kebetulan sudah diterima penuh oleh penerimaan yg diedit).
// ═════════════════════════════════════════════════════════════════════════════
interface PoTersediaItem {
  id: string;
  noPesanan: string;
  supplierId?: string | null;
  // === Update #065 — estimasi sisa NILAI yang belum difakturkan (hanya
  // mode invoice; null di mode penerimaan/lppb & fallback daftar penuh).
  // Update #066: label dropdown PO kini HANYA nomor dokumen (tanpa suffix
  // sisa) — estimasi sisa tetap terlihat lewat panel "Status Penerimaan
  // PO" setelah PO dipilih. PO boleh difakturkan BERKALI-KALI (potong qty
  // per faktur); PO tetap tampil selama masih ada qty belum terfaktur
  // (#063) dan hilang setelah seluruh qty terfaktur (lunas). ===
  sisaNilai?: number | null;
}

// === Update #065 — label opsi PO form Invoice: tampilkan sisa nilai. ===
// === Update #066 — label cukup nomor dokumen saja (mis. "PO ASI/2026/001",
// tanpa suffix sisa nilai); hint sisa tampil terpisah di panel info
// "Status Penerimaan PO" (poSisaInfo) setelah PO dipilih. ===
function poTersediaLabel(po: PoTersediaItem): string {
  return po.noPesanan;
}

function useTersediaPoOptions(untuk: 'penerimaan' | 'invoice', fallback: { id: string; noPesanan: string }[], currentId?: string, currentLabel?: string) {
  // === Update #068 — hardening "flash daftar penuh": sebelumnya, selama
  // request tersedia masih berjalan (rows === null), dropdown memakai
  // DAFTAR PENUH (fallback) — PO yang sudah dipakai sempat tampil sesaat
  // (atau selamanya bila request lambat/gagal senyap), sehingga terkesan
  // filter "yang sudah dipakai jangan tampil" tidak berlaku. Kini:
  // - PENDING → tampilkan hanya PO yang sedang dipilih (bukan daftar penuh);
  // - GAGAL (endpoint belum ada di backend lama) → fallback daftar penuh. ===
  const [state, setState] = useState<{ rows: PoTersediaItem[] | null; failed: boolean }>({ rows: null, failed: false });
  useEffect(() => {
    let cancelled = false;
    setState({ rows: null, failed: false });
    api
      .get<PoTersediaItem[]>(`/pembelian/purchase-order/tersedia?untuk=${untuk}`)
      .then((r) => {
        if (!cancelled && Array.isArray(r)) setState({ rows: r, failed: false });
        else if (!cancelled) setState({ rows: null, failed: true });
      })
      .catch(() => {
        /* endpoint belum ada (backend belum di-update) → pakai daftar penuh */
        if (!cancelled) setState({ rows: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [untuk]);
  return useMemo(() => {
    const base = state.failed ? fallback : (state.rows ?? []);
    if (currentId && !base.some((o) => o.id === currentId)) {
      const label = fallback.find((o) => o.id === currentId)?.noPesanan || currentLabel || currentId;
      return [{ id: currentId, noPesanan: label }, ...base];
    }
    return base;
  }, [state, fallback, currentId, currentLabel]);
}

// ─── Props Interface ────────────────────────────────────────────────────────

interface PurchasingPageProps {
  subPage?: string;
  refreshKey?: number;
  formMode?: string;
  formProps?: Record<string, unknown>;
}

// ═════════════════════════════════════════════════════════════════════════════
// FORM: Pesanan Pembelian — Create
// ═════════════════════════════════════════════════════════════════════════════

function PesananCreateForm() {
  return <OrderDocumentForm kind="purchase" />;
}

// ═════════════════════════════════════════════════════════════════════════════
// FORM: Pesanan Pembelian — Edit
// ═════════════════════════════════════════════════════════════════════════════

function PesananEditForm({ editId }: { editId: string }) {
  return <OrderDocumentForm kind="purchase" editId={editId} />;
}

// ═════════════════════════════════════════════════════════════════════════════
// ── === Update #049 — opsi invoice supplier: SEMUA invoice aktif (Draft,
// Diproses, maupun Selesai), bukan hanya yang "belum di-POST". Sejak dokumen
// langsung final saat disimpan (#043), invoice baru berstatus Selesai sehingga
// TIDAK PERNAH muncul di daftar lama — user jadi tidak bisa memilih invoice
// yang baru dibuat untuk dihubungkan ke penerimaan (penyebab pesan
// "hubungkan manual lewat Edit Penerimaan" tidak bisa dijalankan). ===
// ── === Update #064 — daftar kini dari endpoint "tersedia-link": hanya
// invoice yang BELUM dipakai penerimaan lain (kelanjutan permintaan user:
// "alur yang menarik data — yang sudah terpakai sebelumnya jangan
// ditampilkan lagi", diterapkan ke dokumen Penerimaan & Invoice). Invoice
// yang baru dibuat tetap tampil (tujuan #049 preserved); invoice yang
// sedang tertaut di form edit tetap tampil lewat pola re-insert existing.
// Fallback ke daftar penuh lama bila endpoint belum ada (backend lama).
// Catatan: satu invoice boleh terhubung ke beberapa penerimaan (alur GRNI
// #048) — penghubungan multi tetap tersedia lewat panel "Penerimaan
// Barang" di form Invoice; filter ini hanya menyaring PENAWARAN di sisi
// form Penerimaan. ===
function useSupplierInvoiceOptions(supplierId: string | null, refreshKey?: number) {
  const [state, setState] = useState<{ supplierId: string; attempt: number; options: PurchaseInvoiceResponse[]; error: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!supplierId) return;
    let active = true;
    const loadFullList = () => {
      const params = new URLSearchParams({ supplier_id: supplierId, limit: '200' });
      return api
        .get<PaginatedResponse<PurchaseInvoiceResponse>>(`/pembelian/purchase-invoice?${params}`)
        .then((res) => {
          if (active) setState({ supplierId, attempt, options: (res.data || []).filter((inv) => inv.status !== 'DIBATALKAN'), error: '' });
        })
        .catch((error) => {
          if (active) setState({ supplierId, attempt, options: [], error: error instanceof Error ? error.message : 'Gagal memuat invoice' });
        });
    };
    api
      .get<PurchaseInvoiceResponse[]>(`/pembelian/purchase-invoice/tersedia-link?supplier_id=${supplierId}`)
      .then((res) => {
        if (active) {
          if (Array.isArray(res)) {
            setState({ supplierId, attempt, options: res.filter((inv) => inv.status !== 'DIBATALKAN'), error: '' });
          } else {
            return loadFullList();
          }
        }
      })
      .catch(() => loadFullList());
    return () => {
      active = false;
    };
  }, [supplierId, attempt, refreshKey]);
  const current = state?.supplierId === supplierId && state.attempt === attempt ? state : null;
  return { options: current?.options || [], loading: !!supplierId && !current, error: current?.error || '', retry: () => setAttempt((value) => value + 1) };
}

// ── Retur pembelian: hook untuk fetch invoice supplier yang SUDAH di-POST (SELESAI) ──
// Backend menolak posting retur tanpa purchaseInvoiceId → pilihan invoice harus posted.
function usePostedInvoiceOptions(supplierId: string | null) {
  const [state, setState] = useState<{ supplierId: string; attempt: number; options: PurchaseInvoiceResponse[]; error: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!supplierId) return;
    let active = true;
    loadPostedInvoiceOptions(supplierId)
      .then((options) => {
        if (active) setState({ supplierId, attempt, options, error: '' });
      })
      .catch((error) => {
        if (active) setState({ supplierId, attempt, options: [], error: error instanceof Error ? error.message : 'Gagal memuat invoice' });
      });
    return () => {
      active = false;
    };
  }, [supplierId, attempt]);
  const current = state?.supplierId === supplierId && state.attempt === attempt ? state : null;
  return { options: current?.options || [], loading: !!supplierId && !current, error: current?.error || '', retry: () => setAttempt((value) => value + 1) };
}

// ═════════════════════════════════════════════════════════════════════════════
// === Update #048 — GRNI: daftar Penerimaan Barang per PO + link otomatis ke
// Invoice Pembelian. Dengan GRNI aktif, invoice pembelian harus terhubung ke
// penerimaan yang sudah selesai (link disimpan di penerimaan.purchaseInvoiceId).
// Alur lama memaksa user memahami istilah teknis ("hubungkan via
// purchase_invoice_id"); alur baru: penerimaan tampil di form Invoice, yang
// dicentang otomatis di-link saat invoice disimpan (bila backend sudah
// auto-link, dideteksi & dilaporkan saja).
// === Update #064 — penerimaan yang sudah terhubung ke invoice LAIN tidak
// ditampilkan lagi di panel ("yang sudah terpakai sebelumnya jangan
// ditampilkan lagi", kelanjutan permintaan user untuk dokumen Penerimaan &
// Invoice). Penerimaan milik invoice yang sedang dibuka/diedit tetap tampil
// (badge "Invoice ini") lewat opts.currentInvoiceId. ===
// ═════════════════════════════════════════════════════════════════════════════
function usePoPenerimaanLink() {
  const [list, setList] = useState<PenerimaanBarangResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);

  const fetchForPo = useCallback(async (poId: string, supplierId?: string, opts?: { preserveChecks?: boolean; currentInvoiceId?: string }) => {
    if (!poId) {
      setList([]);
      setCheckedIds([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (supplierId) params.set('supplier_id', supplierId);
      // Best-effort: sebagian versi backend mendukung filter langsung
      // purchase_order_id; selalu difilter ulang sisi klien via field
      // purchaseOrderId supaya hasilnya benar di semua versi.
      params.set('purchase_order_id', poId);
      const res = await api.get<PaginatedResponse<PenerimaanBarangResponse>>(`/pembelian/penerimaan?${params}`);
      const rows = (res.data || []).filter(
        (pb) =>
          pb.purchaseOrderId === poId &&
          pb.status !== 'DIBATALKAN' &&
          // === Update #064 — sembunyikan penerimaan yang sudah dipakai invoice
          // lain; milik invoice ini (mode edit) tetap tampil. ===
          (!pb.purchaseInvoiceId || pb.purchaseInvoiceId === opts?.currentInvoiceId)
      );
      setList(rows);
      const linkable = rows.filter((pb) => !pb.purchaseInvoiceId).map((pb) => pb.id);
      setCheckedIds((prev) => (opts?.preserveChecks ? Array.from(new Set([...prev.filter((id) => linkable.includes(id)), ...linkable])) : linkable));
    } catch {
      setList([]);
      setCheckedIds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleChecked = useCallback((id: string) => {
    setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  // Setelah invoice tersimpan: pastikan penerimaan terpilih ter-link ke
  // invoice tsb. Daftar diambil FRESH (bukan dari state panel) — penerimaan
  // yang sudah di-link backend tidak di-PUT lagi; yang masih kosong &
  // tercentang di-link via PUT purchaseInvoiceId.
  // === Update #049 — PUT kini mengirim header LENGKAP (nilai tersimpan,
  // tidak diubah) + purchaseInvoiceId: sebagian versi backend menolak body
  // parsial. Bila tetap gagal, dicoba sekali lagi dengan body minimal, dan
  // PESAN ERROR backend ikut dilaporkan supaya penyebabnya jelas (dulu gagal
  // tanpa penjelasan). ===
  const linkToInvoice = useCallback(
    async (invoiceId: string, poId: string, supplierId?: string): Promise<{ linked: string[]; failed: string[] }> => {
      if (!poId) return { linked: [], failed: [] };
      try {
        const params = new URLSearchParams({ limit: '200' });
        if (supplierId) params.set('supplier_id', supplierId);
        params.set('purchase_order_id', poId);
        const res = await api.get<PaginatedResponse<PenerimaanBarangResponse>>(`/pembelian/penerimaan?${params}`);
        const rows = (res.data || []).filter((pb) => pb.purchaseOrderId === poId && pb.status !== 'DIBATALKAN');
        const linked: string[] = [];
        const failed: string[] = [];
        const describe = (err: unknown) => {
          const msg = err instanceof ApiError ? err.detail : err instanceof Error ? err.message : 'gagal';
          return msg.length > 160 ? msg.slice(0, 157) + '…' : msg;
        };
        for (const pb of rows) {
          if (pb.purchaseInvoiceId === invoiceId) {
            linked.push(pb.noForm); // sudah ter-link (auto oleh backend)
            continue;
          }
          if (!pb.purchaseInvoiceId && checkedIds.includes(pb.id)) {
            // PUT #1: header lengkap (nilai tersimpan) + link — kompatibel dengan
            // backend yang mensyaratkan body utuh.
            const fullBody: PenerimaanBarangUpdate = {
              ...(pb.tanggal ? { tanggal: pb.tanggal.slice(0, 10) } : {}),
              purchaseOrderId: pb.purchaseOrderId || null,
              supplierId: pb.supplierId,
              gudangId: pb.gudangId || null,
              alamat: pb.alamat || null,
              keterangan: pb.keterangan || null,
              purchaseInvoiceId: invoiceId
            };
            try {
              await api.put<PenerimaanBarangResponse>(`/pembelian/penerimaan/${pb.id}`, fullBody);
              linked.push(pb.noForm);
            } catch (errFull) {
              // PUT #2: body minimal (link saja) — untuk backend yang justru
              // menolak perubahan field lain pada penerimaan final.
              try {
                await api.put<PenerimaanBarangResponse>(`/pembelian/penerimaan/${pb.id}`, { purchaseInvoiceId: invoiceId } as PenerimaanBarangUpdate);
                linked.push(pb.noForm);
              } catch (errMin) {
                failed.push(`${pb.noForm} — ${describe(errMin instanceof ApiError && errMin.detail ? errMin : errFull)}`);
              }
            }
          }
        }
        return { linked, failed };
      } catch {
        return { linked: [], failed: [] };
      }
    },
    [checkedIds]
  );

  return { list, loading, checkedIds, toggleChecked, fetchForPo, linkToInvoice };
}

// Panel UI bersama (dipakai form Invoice create & edit): daftar penerimaan PO,
// status link, centang "hubungkan ke invoice ini", tombol buat penerimaan.
function PoPenerimaanPanel({ list, loading, checkedIds, onToggle, onRefresh, onBuatPenerimaan, currentInvoiceId }: { list: PenerimaanBarangResponse[]; loading: boolean; checkedIds: string[]; onToggle: (id: string) => void; onRefresh: () => void; onBuatPenerimaan: () => void; currentInvoiceId?: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Package className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-medium">Penerimaan Barang untuk PO ini</p>
        <span className="text-[11px] text-muted-foreground">(yang dicentang otomatis dihubungkan ke invoice ini saat disimpan)</span>
        <Button type="button" variant="ghost" size="sm" className="ml-auto h-6 w-6 p-0 text-muted-foreground" onClick={onRefresh} title="Muat ulang daftar penerimaan" aria-label="Muat ulang daftar penerimaan">
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>
      {loading ? (
        <div className="space-y-1.5">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="text-xs font-medium text-amber-800">PO ini belum ada Penerimaan Barang.</p>
          <p className="text-[11px] leading-relaxed text-amber-700">Bila barang sudah/sedang diterima, buat Penerimaan dulu — invoice akan otomatis terhubung ke penerimaannya (wajib saat mode GRNI aktif: invoice bisa diposting setelah penerimaan selesai &amp; terhubung).</p>
          <Button type="button" size="sm" variant="outline" className="h-7 border-amber-300 text-amber-800 hover:bg-amber-100" onClick={onBuatPenerimaan}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Buat Penerimaan dari PO Ini
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs whitespace-nowrap">No Penerimaan</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Tanggal</TableHead>
                  <TableHead className="text-xs whitespace-nowrap text-center">Jml Item</TableHead>
                  <TableHead className="text-xs whitespace-nowrap text-center">Status</TableHead>
                  <TableHead className="text-xs whitespace-nowrap text-center">Invoice</TableHead>
                  <TableHead className="text-xs whitespace-nowrap text-center">Hubungkan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((pb) => (
                  <TableRow key={pb.id}>
                    <TableCell className="font-mono text-xs font-medium">{pb.noForm}</TableCell>
                    <TableCell className="text-xs">{formatDate(pb.tanggal)}</TableCell>
                    <TableCell className="text-center text-xs">{pb.details?.length || 0}</TableCell>
                    <TableCell className="text-center">
                      <StatusBadge status={pb.status} />
                    </TableCell>
                    <TableCell className="text-center">
                      {pb.purchaseInvoiceId ? (
                        pb.purchaseInvoiceId === currentInvoiceId ? (
                          <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50 text-xs gap-1">
                            <Link2 className="h-3 w-3" /> Invoice ini
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50 text-xs gap-1">
                            <Link2 className="h-3 w-3" /> Linked
                          </Badge>
                        )
                      ) : (
                        <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-50 text-xs gap-1">
                          <Unlink className="h-3 w-3" /> Belum
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">{pb.purchaseInvoiceId ? <span className="text-[11px] text-muted-foreground">—</span> : <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={checkedIds.includes(pb.id)} onChange={() => onToggle(pb.id)} aria-label={`Hubungkan penerimaan ${pb.noForm} ke invoice ini`} />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-[11px] text-muted-foreground">Mode GRNI: invoice bisa diposting setelah ada penerimaan yang selesai &amp; terhubung ke invoice ini.</p>
        </div>
      )}
    </div>
  );
}

// FORM: Penerimaan Barang — Create
// ═════════════════════════════════════════════════════════════════════════════
// === Update #066 — diekspor untuk modul Persediaan (menu Penerimaan pindah
// ke sana); tetap dipakai routing lama modul Pembelian. ===
export function PenerimaanCreateForm({ initialPurchaseOrderId }: { initialPurchaseOrderId?: string }) {
  const { error: stockError, clearError: clearStockError, handleError: handleStockError } = useStockOperationError('penerimaan_barang');
  const { supplierOptions, setSupplierOptions, barangOptions, setBarangOptions, satuanOptions, setSatuanOptions, purchaseOrderOptions, gudangOptions, setGudangOptions, loading: dropdownsLoading } = usePurchasingDropdowns();
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [fPurchaseOrderId, setFPurchaseOrderId] = useState('');
  const [fSupplierId, setFSupplierId] = useState('');
  const [fGudangId, setFGudangId] = useState('');
  const [fTanggal, setFTanggal] = useState('');
  const [fAlamat, setFAlamat] = useState('');
  const [fKeterangan, setFKeterangan] = useState('');
  const [fDetail, setFDetail] = useState<FormDetailRow[]>([newDetailRow()]);
  // Tahap 2: link ke invoice pembelian (opsional)
  const [fPurchaseInvoiceId, setFPurchaseInvoiceId] = useState('');
  // === Update #049 — semua invoice aktif supplier (bukan hanya "belum
  // di-POST"), paritas form edit — invoice baru (langsung final) kini bisa
  // dipilih sejak penerimaan dibuat. ===
  const { options: supplierInvoiceOptions, loading: invoiceOptionsLoading, error: invoiceOptionsError, retry: retryInvoiceOptions } = useSupplierInvoiceOptions(fSupplierId || null);
  const [poLoading, setPoLoading] = useState(false);
  // === Update #063 — dropdown PO hanya menawarkan PO yang masih punya sisa
  // terima (yang sudah diterima penuh disembunyikan); PO terpilih (mis. dari
  // alur GRNI / draft) tetap disisipkan agar labelnya tampil. ===
  const tersediaPoOptions = useTersediaPoOptions('penerimaan', purchaseOrderOptions, fPurchaseOrderId || undefined);
  // === Update #049 — scope pencarian anchor field wajib (navigasi otomatis). ===
  const formRef = useRef<HTMLDivElement>(null);

  // ── Metode valuasi GLOBAL (audit manufaktur 2026-10-01): dasar keputusan
  // input kedaluwarsa FEFO per baris penerimaan — konsisten dengan engine
  // stok backend yang memakai satu metode global (dulu: cek legacy
  // per-barang di barang-dropdown yang tidak pernah dipakai backend). ──
  const [metodeValuasiGlobal, setMetodeValuasiGlobal] = useState<string | undefined>(undefined);
  useEffect(() => {
    let active = true;
    api
      .get<{ key: string; value: string }>('/master/app-setting/METODE_VALUASI')
      .then((r) => {
        if (active) setMetodeValuasiGlobal(r.value);
      })
      .catch(() => {
        /* gagal muat → undefined: kolom kedaluwarsa tersembunyi (perilaku lama);
           validasi eksekusi backend tetap sebagai garis pertahanan terakhir */
      });
    return () => {
      active = false;
    };
  }, []);

  // ── Draft otomatis (form create; dipulihkan saat kembali ke form ini) ──
  const userId = useAuthStore((s) => s.user?.id ?? 'anon');
  const draft = useFormDraft<PenerimaanBarangDraftData>(draftKey(userId, 'purchasing', 'penerimaan-barang', 'create'));
  const skipNextSaveRef = useRef(false);
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    // === Update #048 — dibuka dari form Invoice (tombol "Buat Penerimaan
    // dari PO Ini"): PO ditarik otomatis di bawah; draft lama diabaikan
    // (pola sama dengan "Buat SO" dari daftar penawaran). ===
    if (initialPurchaseOrderId) return;
    const d = draft.draft;
    if (!d) return;
    setFPurchaseOrderId(d.purchaseOrderId || '');
    setFSupplierId(d.supplierId || '');
    setFGudangId(d.gudangId || '');
    setFTanggal(d.tanggal || '');
    setFAlamat(d.alamat || '');
    setFKeterangan(d.keterangan || '');
    setFPurchaseInvoiceId(d.purchaseInvoiceId || '');
    setFDetail(Array.isArray(d.detail) && d.detail.length ? d.detail : [newDetailRow()]);
    toast.info('Draft isian dipulihkan', { description: 'Isian terakhir form Penerimaan Barang dimuat kembali otomatis.' });
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
      purchaseOrderId: fPurchaseOrderId,
      supplierId: fSupplierId,
      gudangId: fGudangId,
      tanggal: fTanggal,
      alamat: fAlamat,
      keterangan: fKeterangan,
      purchaseInvoiceId: fPurchaseInvoiceId,
      detail: fDetail
    });
  }, [fPurchaseOrderId, fSupplierId, fGudangId, fTanggal, fAlamat, fKeterangan, fPurchaseInvoiceId, fDetail]);

  const handleDiscardDraft = useCallback(() => {
    skipNextSaveRef.current = true;
    draft.clearDraft();
    setFPurchaseOrderId('');
    setFSupplierId('');
    setFGudangId('');
    setFTanggal('');
    setFAlamat('');
    setFKeterangan('');
    setFPurchaseInvoiceId('');
    setFDetail([newDetailRow()]);
    setFormErrors({});
  }, []);

  // === Tarik data otomatis PO → Penerimaan (Task 16-c2): saat PO dipilih,
  // ambil SISA qty per baris (endpoint /sisa), auto-set supplier & alamat PO,
  // dan prefill hanya baris yang masih ada sisaTerima. hargaPerolehan dihitung
  // dari harga PO dikurangi diskon (net of discount) — walau input harga
  // disembunyikan, nilainya tetap dikirim di payload.
  // Baris ter-link mengirim purchaseOrderDetailId (validasi over-receipt aktif).
  const handlePurchaseOrderChange = useCallback(
    async (poId: string) => {
      setFPurchaseOrderId(poId);
      setFormErrors((prev) => ({ ...prev, purchaseOrderId: '' }));
      if (!poId) return;
      setPoLoading(true);
      try {
        const sisa = await api.get<PurchaseOrderSisaResponse>(`/pembelian/purchase-order/${poId}/sisa`);
        if (sisa.supplierId && sisa.supplierId !== fSupplierId) {
          setFSupplierId(sisa.supplierId);
          setFPurchaseInvoiceId('');
        }
        // Hanya timpa alamat bila PO punya alamat (jangan kosongkan isian user).
        // Update #4: bila PO tidak punya alamat, tarik dari master supplier.
        if (sisa.alamat) {
          setFAlamat(sisa.alamat);
        } else if (sisa.supplierId) {
          const master = findPartyMaster(supplierOptions, sisa.supplierId);
          if (master?.alamat) setFAlamat(master.alamat);
        }
        const rows = (sisa.details || []).filter((d) => Number(d.sisaTerima) > 0);
        if (rows.length === 0) {
          toast.info('Semua baris PO sudah diterima sepenuhnya', { description: 'Tidak ada sisa qty yang perlu diterima untuk PO ini.' });
          setFDetail([]);
          return;
        }
        setFDetail(
          rows.map((d) => ({
            id: crypto.randomUUID(),
            barangId: d.barangId,
            kodeBarang: d.kodeBarang || '',
            barangNama: d.namaBarang || '',
            harga: String(d.harga ?? 0),
            qty: String(d.sisaTerima),
            diskon: String(d.diskon ?? 0),
            satuanId: d.satuanId || '',
            satuanNama: d.satuanNama || '',
            hargaPerolehan: String(Math.round(((Number(d.harga) || 0) * (100 - (Number(d.diskon) || 0))) / 100)),
            tanggalKedaluwarsa: '',
            purchaseOrderDetailId: d.purchaseOrderDetailId
          }))
        );
      } catch {
        // Gagal memuat sisa PO — biarkan user isi baris manual (tanpa link)
      } finally {
        setPoLoading(false);
      }
    },
    [fSupplierId, supplierOptions]
  );

  // === Update #048 — prefill PO (form dibuka lewat tombol "Buat Penerimaan
  // dari PO Ini" di form Invoice Pembelian): tarik sisa PO setelah master
  // termuat; barang & qty + supplier + alamat terisi otomatis. ===
  const prefillPoRef = useRef(false);
  useEffect(() => {
    if (prefillPoRef.current || dropdownsLoading || !initialPurchaseOrderId) return;
    prefillPoRef.current = true;
    handlePurchaseOrderChange(initialPurchaseOrderId);
    toast.info('PO ditarik otomatis ke form ini', { description: 'Barang & qty mengikuti sisa PO — pilih gudang tujuan sebelum menyimpan.' });
  }, [dropdownsLoading, initialPurchaseOrderId, handlePurchaseOrderChange]);

  const handleSubmit = async () => {
    const errs: Record<string, string> = {};
    if (!fPurchaseOrderId) errs.purchaseOrderId = 'Purchase Order wajib diisi';
    if (!fSupplierId) errs.supplierId = 'Supplier wajib diisi';
    if (!fTanggal) errs.tanggal = 'Tanggal wajib diisi';
    if (!fGudangId) errs.gudangId = 'Gudang wajib diisi';
    const detailError = stockLineError(fDetail);
    if (detailError) errs.detail = detailError;
    else {
      // Audit manufaktur (2026-10-01): tanggal kedaluwarsa WAJIB untuk semua
      // baris bila metode valuasi global FEFO (backend menolak eksekusi FEFO
      // tanpa expiry — cegah sebelum kirim).
      const fefoMissing = fDetail.filter((r) => r.barangId).find((r) => isFefoRow(r, metodeValuasiGlobal) && !r.tanggalKedaluwarsa);
      if (fefoMissing) errs.detail = 'Isi tanggal kedaluwarsa untuk barang FEFO';
    }
    if (Object.keys(errs).length) {
      setFormErrors(errs);
      // === Update #049 — navigasi otomatis: scroll + fokus ke field wajib
      // pertama yang terlewat (bukan hanya teks merah yang kadang di luar layar). ===
      focusFormError(Object.keys(errs), { root: formRef.current });
      toast.error('Ada field wajib yang belum diisi');
      return;
    }
    setFormErrors({});
    setSubmitting(true);
    try {
      const details: PenerimaanBarangDetailCreate[] = fDetail
        .filter((r) => r.barangId)
        .map((r) => ({
          barangId: r.barangId,
          qty: Number(r.qty),
          satuanId: r.satuanId,
          hargaPerolehan: r.hargaPerolehan ? Number(r.hargaPerolehan) : null,
          tanggalKedaluwarsa: r.tanggalKedaluwarsa || null,
          // Task 16-c2: link per baris ke line PO (bila baris ditarik dari PO).
          purchaseOrderDetailId: r.purchaseOrderDetailId || null
        }));
      const body: PenerimaanBarangCreate = {
        tanggal: fTanggal,
        purchaseOrderId: fPurchaseOrderId,
        supplierId: fSupplierId,
        gudangId: fGudangId || null,
        alamat: fAlamat || null,
        keterangan: fKeterangan || null,
        details,
        // Tahap 2: kirim null eksplisit kalau kosong (bukan hilangkan field)
        purchaseInvoiceId: fPurchaseInvoiceId || null
      };
      await api.post('/pembelian/penerimaan', body);
      toast.success('Penerimaan barang berhasil dibuat');
      draft.clearDraft();
      refreshListTab('purchasing', 'penerimaan');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      handleStockError(err, 'Gagal menyimpan penerimaan');
    } finally {
      setSubmitting(false);
    }
  };

  if (dropdownsLoading) {
    return (
      <FormTabShell title="Buat Penerimaan Barang">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </FormTabShell>
    );
  }

  return (
    <FormTabShell title="Buat Penerimaan Barang">
      {/* === Update #049 — wrapper ref: scope anchor navigasi field wajib. === */}
      <div ref={formRef}>
        <Card className="max-w-5xl">
          <CardContent className="p-6 space-y-4">
            <p className="text-sm text-muted-foreground">Isi data penerimaan barang baru</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5" id="field-purchaseOrderId">
                <Label className="text-xs font-medium">
                  Purchase Order <span className="text-destructive">*</span>
                </Label>
                <SearchableDropdown value={fPurchaseOrderId} onValueChange={handlePurchaseOrderChange} options={tersediaPoOptions.map((po) => ({ id: po.id, label: po.noPesanan }))} placeholder="Pilih PO..." disabled={poLoading} />
                {poLoading && <p className="text-xs text-muted-foreground mt-1">Memuat sisa PO...</p>}
                {formErrors.purchaseOrderId && <p className="text-xs text-destructive mt-1">{formErrors.purchaseOrderId}</p>}
              </div>
              <div className="space-y-1.5" id="field-supplierId">
                <Label className="text-xs font-medium">
                  Supplier <span className="text-destructive">*</span>
                </Label>
                <div className="flex items-start gap-1.5">
                  {/* === Update #046 — supplier DIKUNCI saat PO terpilih (menarik
                    data dari PO; supplier mengikuti dokumen sumber). === */}
                  <SearchableDropdown
                    className="min-w-0 flex-1"
                    value={fSupplierId}
                    onValueChange={(value) => {
                      setFSupplierId(value);
                      setFPurchaseInvoiceId('');
                      // Update #4: alamat supplier ditarik otomatis dari master
                      const master = findPartyMaster(supplierOptions, value);
                      setFAlamat(master?.alamat || '');
                    }}
                    options={supplierOptions.map((s) => ({ id: s.id, label: s.nama }))}
                    placeholder={fPurchaseOrderId ? 'Mengikuti PO terpilih' : 'Pilih supplier...'}
                    disabled={!!fPurchaseOrderId}
                  />
                  {/* Update #007: quick add supplier.
                    === Update #046 — tombol DISEMBUNYIKAN saat mode narik data
                    (PO terpilih — supplier terkunci); muncul saat manual. === */}
                  {!fPurchaseOrderId && (
                    <QuickAddSupplierButton
                      onCreated={(sup) => {
                        const drop = toSupplierDropdown(sup);
                        setSupplierOptions((prev) => (prev.some((row) => row.id === sup.id) ? prev : [...prev, drop]));
                        setFSupplierId(sup.id);
                        setFPurchaseInvoiceId('');
                        setFAlamat(sup.alamat || '');
                        setFormErrors((prev) => (prev.supplierId ? { ...prev, supplierId: '' } : prev));
                      }}
                    />
                  )}
                </div>
                {formErrors.supplierId && <p className="text-xs text-destructive mt-1">{formErrors.supplierId}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5" id="field-tanggal">
                {/* === Update #050 — tanda * ditambahkan (field wajib, kini
                  default kosong — user harus memilih tanggal). === */}
                <Label className="text-xs font-medium">
                  Tanggal <span className="text-destructive">*</span>
                </Label>
                <Input type="date" className="h-9 text-xs" value={fTanggal} onChange={(e) => setFTanggal(e.target.value)} />
                {formErrors.tanggal && <p className="text-xs text-destructive">{formErrors.tanggal}</p>}
              </div>
              <div className="space-y-1.5" id="field-gudangId">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Alamat</Label>
                <Textarea className="text-xs min-h-[48px]" value={fAlamat} onChange={(e) => setFAlamat(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">{AUTOFILL_HINT.supplier}</p>
              </div>
              <div className="space-y-1.5" id="field-purchaseInvoiceId">
                <Label className="text-xs font-medium">Link ke Invoice Pembelian (opsional)</Label>
                <SearchableDropdown value={fPurchaseInvoiceId} onValueChange={setFPurchaseInvoiceId} options={supplierInvoiceOptions.map((inv) => ({ id: inv.id, label: inv.noForm, subtitle: inv.noFaktur || inv.tanggal ? `${inv.noFaktur || '-'} \u00b7 ${inv.tanggal ? inv.tanggal.slice(0, 10) : '-'}` : undefined }))} placeholder={fSupplierId ? 'Pilih invoice (opsional — boleh kosong)' : 'Pilih supplier dulu...'} loading={invoiceOptionsLoading} emptyText={fSupplierId ? 'Belum ada invoice untuk supplier ini.' : 'Pilih supplier untuk melihat opsi invoice.'} allOption={{ id: '', label: 'Tanpa invoice — invoice menyusul' }} />
                {invoiceOptionsError && (
                  <div role="alert" className="text-xs text-destructive">
                    {invoiceOptionsError}{' '}
                    <Button type="button" variant="outline" size="sm" onClick={retryInvoiceOptions}>
                      Coba Lagi
                    </Button>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground leading-relaxed" title="Invoice boleh kosong, datang kemudian">
                  Invoice boleh kosong, datang kemudian. Bila invoice sudah dibuat, pilih invoice supplier untuk menghubungkan penerimaan ini ke invoice tersebut.
                </p>
              </div>
            </div>
            <Separator />
            <div className="space-y-1.5" id="field-detail">
              <Label className="text-xs font-medium">
                Detail Barang <span className="text-destructive">*</span>
              </Label>
              <DetailTableSimple
                rows={fDetail}
                setRows={setFDetail}
                barangOptions={barangOptions}
                satuanOptions={satuanOptions}
                metodeValuasiGlobal={metodeValuasiGlobal}
                onBarangCreated={(b) => {
                  setBarangOptions((prev) => (prev.some((row) => row.id === b.id) ? prev : [...prev, toBarangDropdown(b)]));
                  // Update #007: satuan barang baru (mungkin hasil nested quick-add) didaftarkan ke daftar satuan host.
                  const satuan = satuanFromBarang(b);
                  if (satuan) setSatuanOptions((prev) => (prev.some((row) => row.id === satuan.id) ? prev : [...prev, satuan]));
                }}
                onSatuanCreated={(s) => setSatuanOptions((prev) => (prev.some((row) => row.id === s.id) ? prev : [...prev, s]))}
              />
              {formErrors.detail && <p className="text-xs text-destructive mt-1">{formErrors.detail}</p>}
            </div>
            <Separator />
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Keterangan</Label>
              <Textarea className="text-xs min-h-[60px]" value={fKeterangan} onChange={(e) => setFKeterangan(e.target.value)} placeholder="Catatan tambahan..." />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <div className="mr-auto">
                <DraftIndicator hasDraft={draft.hasDraft} ageLabel={draft.draftAgeLabel} onDiscard={handleDiscardDraft} formLabel="Penerimaan Barang" />
              </div>
              <Button variant="outline" size="sm" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting}>
                Batal
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={submitting || !fGudangId}>
                {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Package className="mr-1.5 h-4 w-4" />}
                {submitting ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </div>
          </CardContent>
        </Card>
        <StockOperationErrorDialog error={stockError} onClose={clearStockError} />
      </div>
    </FormTabShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FORM: Penerimaan Barang — Edit
// ═════════════════════════════════════════════════════════════════════════════
// === Update #066 — diekspor untuk modul Persediaan (menu Penerimaan pindah
// ke sana); tetap dipakai routing lama modul Pembelian. ===
export function PenerimaanEditForm({ editId }: { editId: string }) {
  const { error: stockError, clearError: clearStockError, handleError: handleStockError } = useStockOperationError('penerimaan_barang');
  const { supplierOptions, setSupplierOptions, purchaseOrderOptions, gudangOptions, setGudangOptions, loading: dropdownsLoading } = usePurchasingDropdowns();
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const [recordLoading, setRecordLoading] = useState(true);
  const [recordError, setRecordError] = useState('');
  const [editDetails, setEditDetails] = useState<PenerimaanBarangResponse['details']>([]);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editNoForm, setEditNoForm] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editPurchaseOrderId, setEditPurchaseOrderId] = useState('');
  const [editSupplierId, setEditSupplierId] = useState('');
  const [editGudangId, setEditGudangId] = useState('');
  const [editTanggal, setEditTanggal] = useState('');
  const [editAlamat, setEditAlamat] = useState('');
  const [editKeterangan, setEditKeterangan] = useState('');
  // Tahap 2: link invoice (badge status jurnal DIHAPUS — Update #049: tidak
  // perlu dilihat user di form/daftar penerimaan).
  const [editPurchaseInvoiceId, setEditPurchaseInvoiceId] = useState('');
  // === Update #049 — opsi invoice: SEMUA invoice aktif supplier (paritas form
  // create). Sebelumnya hanya "belum di-POST" — invoice baru (langsung final
  // sejak #043) tidak pernah muncul, sehingga pesan "hubungkan manual lewat
  // Edit Penerimaan" tidak bisa dijalankan. ===
  const { options: supplierInvoiceOptions, loading: invoiceOptionsLoading, error: invoiceOptionsError, retry: retryInvoiceOptions } = useSupplierInvoiceOptions(editSupplierId || null);
  // === Update #049 — penerimaan SELESAI kini BISA dibuka untuk diedit
  // (terbatas): PO/supplier/gudang/tanggal TERKUNCI (sudah berdampak stok &
  // jurnal GRNI), sedangkan link ke Invoice Pembelian + alamat + keterangan
  // tetap bisa diubah — memungkinkan menghubungkan penerimaan final ke invoice
  // sesuai pesan error alur GRNI. ===
  const selesaiLocked = editStatus === 'SELESAI';
  // === Update #063 — dropdown PO difilter "masih punya sisa terima"
  // (paritas form create); PO penerimaan yang sedang diedit disisipkan
  // otomatis lewat currentId supaya label tetap tampil. ===
  const tersediaPoOptions = useTersediaPoOptions('penerimaan', purchaseOrderOptions, editPurchaseOrderId || undefined);
  // === Update #049 — scope pencarian anchor field wajib (navigasi otomatis). ===
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setRecordLoading(true);
      setRecordError('');
      try {
        const pb = await api.get<PenerimaanBarangResponse>(`/pembelian/penerimaan/${editId}`);
        if (cancelled) return;
        setEditNoForm(pb.noForm);
        setEditStatus(pb.status);
        setEditDetails(pb.details);
        setEditPurchaseOrderId(pb.purchaseOrderId || '');
        setEditSupplierId(pb.supplierId || '');
        setEditGudangId(pb.gudangId || '');
        setEditTanggal(pb.tanggal ? pb.tanggal.slice(0, 10) : '');
        setEditAlamat(pb.alamat || '');
        setEditKeterangan(pb.keterangan || '');
        // Tahap 2: load fields baru
        setEditPurchaseInvoiceId(pb.purchaseInvoiceId || '');
      } catch (err) {
        if (!cancelled) setRecordError(err instanceof ApiError ? err.detail : 'Gagal memuat data penerimaan');
      } finally {
        if (!cancelled) setRecordLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [editId]);

  const handleEditSubmit = async () => {
    if (recordError) {
      toast.error(recordError);
      return;
    }
    // === Update #049 — field wajib dicek SATU PER SATU supaya navigasi
    // otomatis mengarah ke field pertama yang terlewat (sebelumnya digabung
    // dalam satu toast). ===
    const missing: string[] = [];
    if (!editSupplierId) missing.push('supplierId');
    if (!editTanggal) missing.push('tanggal');
    if (!editPurchaseOrderId) missing.push('purchaseOrderId');
    if (!editGudangId) missing.push('gudangId');
    if (missing.length) {
      toast.error('Ada field wajib yang belum diisi');
      focusFormError(missing, { root: formRef.current });
      return;
    }
    setEditSubmitting(true);
    try {
      const body: PenerimaanBarangUpdate = {
        tanggal: editTanggal,
        purchaseOrderId: editPurchaseOrderId || null,
        supplierId: editSupplierId,
        gudangId: editGudangId || null,
        alamat: editAlamat || null,
        keterangan: editKeterangan || null,
        // Tahap 2: kirim null eksplisit untuk mengosongkan link (preserve = hilangkan field)
        purchaseInvoiceId: editPurchaseInvoiceId || null
      };
      // === Update #049 — fallback dua langkah: sebagian versi backend menolak
      // body utuh untuk penerimaan final (SELESAI). Bila itu terjadi, coba
      // ulang dengan body minimal (link invoice saja) supaya penghubungan
      // penerimaan → invoice tetap berhasil. ===
      let savedOk = false;
      let firstError: unknown = null;
      try {
        await api.put<PenerimaanBarangResponse>(`/pembelian/penerimaan/${editId}`, body);
        savedOk = true;
      } catch (errFull) {
        firstError = errFull;
        if (selesaiLocked && editPurchaseInvoiceId) {
          try {
            await api.put<PenerimaanBarangResponse>(`/pembelian/penerimaan/${editId}`, { purchaseInvoiceId: editPurchaseInvoiceId } as PenerimaanBarangUpdate);
            savedOk = true;
            toast.info('Link invoice tersimpan', { description: 'Server hanya menerima perubahan link invoice pada penerimaan yang sudah final — perubahan lain diabaikan.' });
          } catch {
            /* jatuh ke error handling di bawah */
          }
        }
      }
      if (!savedOk) throw firstError;
      toast.success('Penerimaan barang berhasil diperbarui');
      refreshListTab('purchasing', 'penerimaan');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      // === Update #050 — pesan "Dokumen sudah diposting…" dari server
      // diterjemahkan jadi penjelasan yang tidak membingungkan. Mengubah link
      // invoice BUKAN koreksi jurnal — saran "batalkan dengan jurnal pembalik"
      // pada pesan asli menyesatkan dan sudah dihapus dari tampilan. ===
      const postedMsg = err instanceof ApiError ? err.detail : err instanceof Error ? err.message : '';
      if (postedMsg.toLowerCase().includes('diposting')) {
        toast.error('Link tidak tersimpan — penerimaan sudah final', {
          description: 'Server masih menolak perubahan pada penerimaan final, termasuk link invoice (pembatasan backend — sedang ditangani, lihat catatan Update #050). Data kamu tidak rusak: penerimaan & invoice tetap tersimpan, hanya hubungannya yang belum tercatat.',
          duration: 12000
        });
      } else {
        handleStockError(err, 'Gagal memperbarui penerimaan');
      }
    } finally {
      setEditSubmitting(false);
    }
  };

  if (dropdownsLoading || recordLoading) {
    return (
      <FormTabShell title="Edit Penerimaan Barang">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </FormTabShell>
    );
  }

  return (
    <FormTabShell title="Edit Penerimaan Barang">
      {/* === Update #049 — wrapper ref: scope anchor navigasi field wajib. === */}
      <div ref={formRef}>
        <Card className="max-w-5xl">
          <CardContent className="p-6 space-y-4">
            {recordError && (
              <p role="alert" className="text-sm text-destructive">
                {recordError}
              </p>
            )}
            <p className="text-sm text-muted-foreground">{selesaiLocked ? 'Penerimaan sudah selesai (final). Yang dapat diubah: Link ke Invoice Pembelian, alamat, dan keterangan.' : 'Perbarui data header penerimaan (detail barang tidak dapat diubah)'}</p>
            <div className="flex flex-wrap items-center gap-4 rounded-md border bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5" />
                <span>No Penerimaan:</span>
                <span className="font-mono font-semibold text-foreground">{editNoForm}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Status:</span>
                <StatusBadge status={editStatus} />
              </div>
              {/* === Update #049 — badge "Jurnal: Posted/Belum dipost" DIHAPUS
                (permintaan user: biar rapi; status jurnal tetap tersimpan di
                database & tetap bisa dilihat dari modul Jurnal Umum). === */}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5" id="field-purchaseOrderId">
                <Label className="text-xs font-medium">
                  Purchase Order <span className="text-destructive">*</span> {selesaiLocked && <Lock className="inline h-3 w-3 text-muted-foreground" aria-hidden />}
                </Label>
                <SearchableDropdown value={editPurchaseOrderId} onValueChange={setEditPurchaseOrderId} options={tersediaPoOptions.map((po) => ({ id: po.id, label: po.noPesanan }))} placeholder="Pilih PO (wajib)..." disabled={selesaiLocked} />
              </div>
              <div className="space-y-1.5" id="field-supplierId">
                <Label className="text-xs font-medium">
                  Supplier <span className="text-destructive">*</span> {selesaiLocked && <Lock className="inline h-3 w-3 text-muted-foreground" aria-hidden />}
                </Label>
                <div className="flex items-start gap-1.5">
                  <SearchableDropdown
                    className="min-w-0 flex-1"
                    value={editSupplierId}
                    onValueChange={(value) => {
                      setEditSupplierId(value);
                      setEditPurchaseInvoiceId('');
                      // Update #4: alamat supplier ditarik otomatis dari master
                      const master = findPartyMaster(supplierOptions, value);
                      setEditAlamat(master?.alamat || '');
                    }}
                    options={supplierOptions.map((s) => ({ id: s.id, label: s.nama }))}
                    placeholder="Pilih supplier..."
                    disabled={selesaiLocked}
                  />
                  {/* Update #007: quick add supplier
                    === Update #049 — disembunyikan saat penerimaan final
                    (supplier terkunci). === */}
                  {!selesaiLocked && (
                    <QuickAddSupplierButton
                      onCreated={(sup) => {
                        const drop = toSupplierDropdown(sup);
                        setSupplierOptions((prev) => (prev.some((row) => row.id === sup.id) ? prev : [...prev, drop]));
                        setEditSupplierId(sup.id);
                        setEditPurchaseInvoiceId('');
                        setEditAlamat(sup.alamat || '');
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5" id="field-tanggal">
                <Label className="text-xs font-medium">
                  Tanggal <span className="text-destructive">*</span> {selesaiLocked && <Lock className="inline h-3 w-3 text-muted-foreground" aria-hidden />}
                </Label>
                <Input type="date" className={`h-9 text-xs ${selesaiLocked ? 'bg-muted/60' : ''}`} value={editTanggal} onChange={(e) => setEditTanggal(e.target.value)} readOnly={selesaiLocked} aria-readonly={selesaiLocked} />
              </div>
              <div className="space-y-1.5" id="field-gudangId">
                <Label className="text-xs font-medium">
                  Gudang <span className="text-destructive">*</span> {selesaiLocked && <Lock className="inline h-3 w-3 text-muted-foreground" aria-hidden />}
                </Label>
                <div className="flex items-start gap-1.5">
                  <SearchableDropdown className="min-w-0 flex-1" value={editGudangId} onValueChange={setEditGudangId} options={gudangOptions.map((g) => ({ id: g.id, label: g.kode + ' - ' + g.nama }))} placeholder="Pilih gudang (wajib)..." disabled={selesaiLocked} />
                  {/* Update #007: quick add gudang
                    === Update #049 — disembunyikan saat penerimaan final. === */}
                  {!selesaiLocked && (
                    <QuickAddGudangButton
                      onCreated={(g) => {
                        setGudangOptions((prev) => (prev.some((row) => row.id === g.id) ? prev : [...prev, g]));
                        setEditGudangId(g.id);
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Alamat</Label>
                <Textarea className="text-xs min-h-[48px]" value={editAlamat} onChange={(e) => setEditAlamat(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">{AUTOFILL_HINT.supplier}</p>
              </div>
              <div className="space-y-1.5" id="field-purchaseInvoiceId">
                <Label className="text-xs font-medium">Link ke Invoice Pembelian (opsional)</Label>
                <SearchableDropdown value={editPurchaseInvoiceId} onValueChange={setEditPurchaseInvoiceId} options={[...(editPurchaseInvoiceId && !supplierInvoiceOptions.some((inv) => inv.id === editPurchaseInvoiceId) ? [{ id: editPurchaseInvoiceId, label: `Invoice tertaut: ${editPurchaseInvoiceId}`, subtitle: 'Tidak ada dalam pilihan invoice saat ini; boleh diganti.' }] : []), ...supplierInvoiceOptions.map((inv) => ({ id: inv.id, label: inv.noForm, subtitle: inv.noFaktur || inv.tanggal ? `${inv.noFaktur || '-'} \u00b7 ${inv.tanggal ? inv.tanggal.slice(0, 10) : '-'}` : undefined }))]} placeholder={editSupplierId ? 'Pilih invoice (opsional — boleh kosong)' : 'Pilih supplier dulu...'} loading={invoiceOptionsLoading} emptyText={editSupplierId ? 'Belum ada invoice untuk supplier ini.' : 'Pilih supplier untuk melihat opsi invoice.'} allOption={{ id: '', label: 'Tanpa invoice — invoice menyusul' }} />
                {invoiceOptionsError && (
                  <div role="alert" className="text-xs text-destructive">
                    {invoiceOptionsError}{' '}
                    <Button type="button" variant="outline" size="sm" onClick={retryInvoiceOptions}>
                      Coba Lagi
                    </Button>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground leading-relaxed" title="Invoice boleh kosong, datang kemudian">
                  Hubungkan bila invoice untuk penerimaan ini sudah dibuat — pilih invoice supplier (termasuk yang baru dibuat), lalu Simpan. Boleh kosong bila invoice belum ada.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Detail Barang (tersimpan)</Label>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Barang</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Satuan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {editDetails.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{line.barang?.nama || line.barangId}</TableCell>
                        <TableCell className={Number(line.qty) <= 0 ? 'text-destructive' : undefined}>{line.qty}</TableCell>
                        <TableCell>{line.satuan?.nama || line.satuanId}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">Detail tersimpan hanya dapat dilihat pada form ini. Perubahan qty/detail belum didukung.</p>
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
          </CardContent>
        </Card>
        <StockOperationErrorDialog error={stockError} onClose={clearStockError} />
      </div>
    </FormTabShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FORM: Invoice Pembelian — Create
// ═════════════════════════════════════════════════════════════════════════════

function InvoiceCreateForm() {
  const [fPurchaseOrderId, setFPurchaseOrderId] = useState('');
  // === Update #049 — state fInvoiceType DIHAPUS: field "Tipe Invoice"
  // dihilangkan dari form (label kategori bebas opsional yang tidak
  // memengaruhi jurnal/stok/GRNI; hint-nya membingungkan user). ===
  const [saveWarning, setSaveWarning] = useState('');
  const [savedInvoice, setSavedInvoice] = useState<PurchaseInvoiceResponse | null>(null);
  const { supplierOptions, setSupplierOptions, barangOptions, setBarangOptions, satuanOptions, setSatuanOptions, purchaseOrderOptions, loading: dropdownsLoading } = usePurchasingDropdowns();
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);
  // === Update #048 — buka tab form lain dari sini (tombol "Buat Penerimaan
  // dari PO Ini" di panel Penerimaan). ===
  const openFormTab = useTabStore((s) => s.openFormTab);

  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [fSupplierId, setFSupplierId] = useState('');
  const [fTanggal, setFTanggal] = useState('');
  const [fNoFaktur, setFNoFaktur] = useState('');
  const [fAlamat, setFAlamat] = useState('');
  const [fDiskonGlobal, setFDiskonGlobal] = useState('0');
  const [fPpn, setFPpn] = useState('11');
  // === Update #052 — PPN bisa dimatikan per invoice (mirror PO/SI). ===
  const [fPpnApplicable, setFPpnApplicable] = useState(true);
  // AUD-09 (update #04) — PPh 23 pada PI: hutang supplier dicatat NET sejak
  // invoice (grand total − PPh 23) + Cr Hutang PPh 23 saat posting.
  const [fPph23Applicable, setFPph23Applicable] = useState(false);
  const [fPph23, setFPph23] = useState('2');
  const [fKeterangan, setFKeterangan] = useState('');
  const [fDetail, setFDetail] = useState<FormDetailRow[]>([newDetailRow()]);
  const [fBiayaTambahan, setFBiayaTambahan] = useState<FormBiayaRow[]>([]);
  const [poLoading, setPoLoading] = useState(false);
  // AUD-10 (update #04) — tarif default dari setting global (RATE_PPN/RATE_PPH23)
  const defaultRates = useDefaultTaxRates();
  useEffect(() => {
    if (defaultRates) {
      setFPpn(defaultRates.ppn);
      setFPph23(defaultRates.pph23);
    }
  }, [defaultRates]);
  // === Update #4 (Q2): snapshot sisa PO terpilih — info barang belum diterima ===
  const [poSisaInfo, setPoSisaInfo] = useState<PurchaseOrderSisaResponse | null>(null);
  // === Update #048 — daftar Penerimaan Barang untuk PO terpilih (alur GRNI):
  // penerimaan yang dicentang otomatis di-link ke invoice ini saat disimpan. ===
  const penerimaanLink = usePoPenerimaanLink();
  // === Update #063 — dropdown PO difilter "masih punya sisa faktur"
  // (yang sudah terfaktur penuh disembunyikan); PO terpilih (mis. dari
  // draft) tetap disisipkan agar labelnya tampil. ===
  const tersediaPoOptions = useTersediaPoOptions('invoice', purchaseOrderOptions, fPurchaseOrderId || undefined, savedInvoice?.purchaseOrder?.noPesanan);

  // ── Draft otomatis (form create; dipulihkan saat kembali ke form ini) ──
  const userId = useAuthStore((s) => s.user?.id ?? 'anon');
  const draft = useFormDraft<InvoicePembelianDraftData>(draftKey(userId, 'purchasing', 'purchase-invoice', 'create'));
  const skipNextSaveRef = useRef(false);
  const restoredRef = useRef(false);
  // === Update #049 — scope pencarian anchor field wajib (navigasi otomatis). ===
  const formRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const d = draft.draft;
    if (!d) return;
    setFPurchaseOrderId(d.purchaseOrderId || '');
    setFSupplierId(d.supplierId || '');
    setFTanggal(d.tanggal || '');
    setFNoFaktur(d.noFaktur || '');
    setFAlamat(d.alamat || '');
    setFDiskonGlobal(d.diskonGlobal ?? '0');
    // === Update #046 — tarif PPN TIDAK dipulihkan dari draft lagi: nilainya
    // terkunci & selalu mengikuti Referensi → Perpajakan (RATE_PPN). ===
    setFKeterangan(d.keterangan || '');
    setFDetail(Array.isArray(d.detail) && d.detail.length ? d.detail : [newDetailRow()]);
    setFBiayaTambahan(Array.isArray(d.biayaTambahan) ? d.biayaTambahan : []);
    // === Update #048 — konteks PO dipulihkan juga (panel sisa & penerimaan)
    // TANPA mengubah baris/supplier/alamat hasil restore. ===
    if (d.purchaseOrderId) {
      api
        .get<PurchaseOrderSisaResponse>(`/pembelian/purchase-order/${d.purchaseOrderId}/sisa`)
        .then((s) => setPoSisaInfo(s))
        .catch(() => setPoSisaInfo(null));
      penerimaanLink.fetchForPo(d.purchaseOrderId, d.supplierId || undefined);
    }
    toast.info('Draft isian dipulihkan', { description: 'Isian terakhir form Invoice Pembelian dimuat kembali otomatis.' });
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
    if (!savedInvoice) {
      draft.saveDraft({
        purchaseOrderId: fPurchaseOrderId,
        supplierId: fSupplierId,
        tanggal: fTanggal,
        noFaktur: fNoFaktur,
        alamat: fAlamat,
        diskonGlobal: fDiskonGlobal,
        ppn: fPpn,
        keterangan: fKeterangan,
        detail: fDetail,
        biayaTambahan: fBiayaTambahan
      });
    }
  }, [fPurchaseOrderId, fSupplierId, fTanggal, fNoFaktur, fAlamat, fDiskonGlobal, fPpn, fKeterangan, fDetail, fBiayaTambahan]);

  const handleDiscardDraft = useCallback(() => {
    skipNextSaveRef.current = true;
    draft.clearDraft();
    setFPurchaseOrderId('');
    setFSupplierId('');
    setFTanggal('');
    setFNoFaktur('');
    setFAlamat('');
    setFDiskonGlobal('0');
    // === Update #046 — reset tarif mengikuti Referensi → Perpajakan (bukan
    // hardcoded 11 — nilai terkunci dari settings global). ===
    setFPpn(defaultRates?.ppn ?? '11');
    setFKeterangan('');
    setFDetail([newDetailRow()]);
    setFBiayaTambahan([]);
    setPoSisaInfo(null);
    setFormErrors({});
  }, [defaultRates]);

  // === Tarik data otomatis PO → Invoice Pembelian (Task 16-c2): saat PO
  // dipilih, ambil SISA qty per baris (endpoint /sisa), auto-set supplier,
  // dan prefill hanya baris yang masih ada sisaFaktur (harga/diskon/satuan
  // mengikuti line PO). Baris ter-link mengirim purchaseOrderDetailId sehingga
  // komputasi sisa faktur per PO line di backend tetap akurat.
  // Pilihan "Tanpa PO" (kosong) TIDAK menghapus baris — user tetap bisa manual.
  // Update #4 (Q2): response /sisa juga disimpan ke poSisaInfo untuk panel info
  // status penerimaan (read-only, tidak mengubah prefill baris sama sekali).
  const handlePurchaseOrderChange = useCallback(
    async (poId: string) => {
      setFPurchaseOrderId(poId);
      if (!poId) {
        setPoSisaInfo(null);
        penerimaanLink.fetchForPo('');
        return;
      }
      setPoLoading(true);
      try {
        const sisa = await api.get<PurchaseOrderSisaResponse>(`/pembelian/purchase-order/${poId}/sisa`);
        setPoSisaInfo(sisa);
        // === Update #048 — muat daftar penerimaan PO ini (panel link GRNI). ===
        penerimaanLink.fetchForPo(poId, sisa.supplierId || undefined);
        if (sisa.supplierId) setFSupplierId(sisa.supplierId);
        // Update #4: alamat ditarik otomatis — dari PO, atau master supplier
        // bila PO tidak menyimpan alamat.
        if (sisa.alamat) {
          setFAlamat(sisa.alamat);
        } else if (sisa.supplierId) {
          const master = findPartyMaster(supplierOptions, sisa.supplierId);
          setFAlamat(master?.alamat || '');
        }
        // === Update #053 — kartu Pajak invoice MENGIKUTI PO terpilih:
        // PPN aktif/nonaktif + PPh23 aktif/nonaktif & tarifnya diwarisi dari
        // PO (pajak cukup diset SATU kali di PO; invoice tinggal mengikuti —
        // tetap bisa disesuaikan bila faktur aktual berbeda). Tarif PPN
        // tetap terkunci dari Referensi → Perpajakan. Diletakkan SEBELUM
        // early-return "semua baris sudah terfaktur" agar tetap berlaku. ===
        if (typeof sisa.ppnApplicable === 'boolean') setFPpnApplicable(sisa.ppnApplicable);
        if (typeof sisa.pph23Applicable === 'boolean') {
          setFPph23Applicable(sisa.pph23Applicable);
          if (sisa.pph23Applicable && sisa.pph23 != null) setFPph23(trimDecimalString(sisa.pph23, '2'));
        }
        const rows = (sisa.details || []).filter((d) => Number(d.sisaFaktur) > 0);
        if (rows.length === 0) {
          toast.info('Semua baris PO sudah dibuatkan invoice sepenuhnya', { description: 'Tidak ada sisa qty yang perlu dibuatkan invoice untuk PO ini.' });
          setFDetail([]);
          return;
        }
        setFDetail(
          rows.map((d) => ({
            id: crypto.randomUUID(),
            barangId: d.barangId,
            kodeBarang: d.kodeBarang || '',
            barangNama: d.namaBarang || '',
            harga: String(d.harga ?? 0),
            qty: String(d.sisaFaktur),
            diskon: String(d.diskon ?? 0),
            satuanId: d.satuanId || '',
            satuanNama: d.satuanNama || '',
            hargaPerolehan: '',
            tanggalKedaluwarsa: '',
            purchaseOrderDetailId: d.purchaseOrderDetailId
          }))
        );
      } catch {
        // Gagal memuat sisa PO — biarkan user isi baris manual
        setPoSisaInfo(null);
        penerimaanLink.fetchForPo('');
      } finally {
        setPoLoading(false);
      }
    },
    [supplierOptions, penerimaanLink.fetchForPo]
  );

  // === Update #048 — kembali ke tab form ini (mis. setelah membuat Penerimaan
  // di tab lain lewat tombol "Buat Penerimaan dari PO Ini"): muat ulang daftar
  // penerimaan PO secara diam-diam (centangan user dipertahankan;
  // penerimaan baru otomatis tercentang). ===
  const lastTabIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = lastTabIdRef.current;
    lastTabIdRef.current = activeTabId;
    if (prev === null || prev === activeTabId) return;
    if (fPurchaseOrderId && fSupplierId) penerimaanLink.fetchForPo(fPurchaseOrderId, fSupplierId, { preserveChecks: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId]);

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

  const handleSubmit = async () => {
    if (savedInvoice) return;
    const errs: Record<string, string> = {};
    if (!fSupplierId) errs.supplierId = 'Supplier wajib diisi';
    if (!fTanggal) errs.tanggal = 'Tanggal wajib diisi';
    if (!fNoFaktur.trim()) errs.noFaktur = 'No Faktur wajib diisi';
    if (!fDetail.some((r) => r.barangId)) errs.detail = 'Minimal 1 barang harus dipilih';
    if (Object.keys(errs).length) {
      setFormErrors(errs);
      // === Update #049 — navigasi otomatis: scroll + fokus ke field wajib
      // pertama yang terlewat. ===
      focusFormError(Object.keys(errs), { root: formRef.current });
      toast.error('Ada field wajib yang belum diisi');
      return;
    }
    setFormErrors({});
    setSaveWarning('');
    setSubmitting(true);
    try {
      const details: PurchaseInvoiceDetailCreate[] = fDetail
        .filter((r) => r.barangId)
        .map((r) => {
          const qty = parseFloat(r.qty) || 0;
          const harga = parseFloat(r.harga) || 0;
          const diskon = parseFloat(r.diskon) || 0;
          // Task 16-c2: link per baris ke line PO (bila baris ditarik dari PO).
          return { barangId: r.barangId, satuanId: r.satuanId || null, harga, qty, diskon: diskon || null, subTotal: qty * harga * (1 - diskon / 100), purchaseOrderDetailId: r.purchaseOrderDetailId || null };
        });
      const biaya: TransaksiBiayaCreate[] = fBiayaTambahan
        .filter((b) => b.nama)
        .map((b) => ({
          nama: b.nama,
          jumlah: parseFloat(b.jumlah) || 0
        }));
      const body: PurchaseInvoiceCreate = {
        ...invoicePhaseDFields(fPurchaseOrderId, ''),
        autoPostJurnal: false,
        tanggal: fTanggal,
        supplierId: fSupplierId,
        noFaktur: fNoFaktur,
        alamat: fAlamat || null,
        diskonGlobal: parseFloat(fDiskonGlobal) || null,
        ppn: parseFloat(fPpn) || 0,
        // === Update #052 — pilihan PPN/PPh23 kini benar-benar tersimpan di
        // backend (sebelumnya diabaikan → total tersimpan ≠ tampilan form). ===
        ppnApplicable: fPpnApplicable,
        // AUD-09 (update #04) — PPh 23 opsional di PI
        pph23: fPph23Applicable ? parseFloat(fPph23) || 0 : 0,
        pph23Applicable: fPph23Applicable,
        keterangan: fKeterangan || null,
        details,
        biayaTambahan: biaya.length > 0 ? biaya : undefined
      };
      const result = await createPurchaseInvoice(body, (saved) => {
        setSavedInvoice(saved);
        refreshListTab('purchasing', 'invoice');
      });
      draft.clearDraft();
      // === Update #048 — link penerimaan terpilih ke invoice baru (alur GRNI):
      // backend mungkin sudah auto-link — dideteksi & dilaporkan; sisanya
      // di-link lewat PUT penerimaan (purchaseInvoiceId). ===
      let linkedPenerimaan: string[] = [];
      let failedPenerimaan: string[] = [];
      if (fPurchaseOrderId) {
        const linkResult = await penerimaanLink.linkToInvoice(result.saved.id, fPurchaseOrderId, fSupplierId || undefined);
        linkedPenerimaan = linkResult.linked;
        failedPenerimaan = linkResult.failed;
      }
      if (result.mismatches.length) {
        setSaveWarning('Invoice ' + result.saved.noForm + ' sudah dibuat, tetapi beberapa isian belum terkonfirmasi tersimpan: ' + result.mismatches.join(', ') + (linkedPenerimaan.length ? '. Terhubung ke penerimaan: ' + linkedPenerimaan.join(', ') : '') + '. Buka invoice tersebut dari daftar untuk meninjau. Jangan membuat ulang.');
        return;
      }
      toast.success('Invoice pembelian berhasil dibuat', linkedPenerimaan.length ? { description: 'Terhubung otomatis ke penerimaan: ' + linkedPenerimaan.join(', ') + '.' } : undefined);
      if (failedPenerimaan.length) {
        // === Update #051 — backend kini MENERIMA perubahan link invoice pada
        // penerimaan final (fix permanen), jadi kegagalan "diposting" seharusnya
        // tidak muncul lagi. Bila tetap muncul (mis. backend belum diupdate),
        // panduan manual di bawah kini BENAR-BENAR bisa dijalankan — jadi
        // semua jalur kegagalan memberi panduan manual yang sama. ===
        toast.warning('Invoice tersimpan, tetapi beberapa penerimaan gagal dihubungkan', {
          description: 'Gagal: ' + failedPenerimaan.join(' ; ') + '. Buka Daftar Penerimaan Barang → tombol pensil pada penerimaan tersebut → pilih invoice ini di "Link ke Invoice Pembelian" → Simpan.',
          duration: 12000
        });
      }
      refreshListTab('purchasing', 'invoice');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      const duplicate = duplicateInvoiceMessage(err);
      if (duplicate) setFormErrors((prev) => ({ ...prev, noFaktur: duplicate }));
      // === Update #048 — pesan GRNI diterjemahkan ke petunjuk yang jelas
      // (sebelumnya: kalimat teknis "hubungkan ... via purchase_invoice_id"
      // yang membingungkan). ===
      const grniDetail = err instanceof ApiError ? err.detail : '';
      if (grniDetail.includes('GRNI')) {
        toast.error('Belum bisa simpan — barang PO ini belum diterima', {
          description: 'Mode GRNI aktif: buat & selesaikan Penerimaan Barang dari PO ini terlebih dahulu (tombol "Buat Penerimaan dari PO Ini" di panel Penerimaan di atas), lalu simpan invoice lagi — penerimaan otomatis terhubung ke invoice ini.',
          duration: 10000
        });
      } else {
        toast.error(err instanceof ApiError ? err.detail : 'Gagal menyimpan invoice');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (dropdownsLoading) {
    return (
      <FormTabShell title="Buat Invoice Pembelian">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </FormTabShell>
    );
  }

  return (
    <FormTabShell title="Buat Invoice Pembelian">
      {/* === Update #049 — wrapper ref: scope anchor navigasi field wajib. === */}
      <div ref={formRef}>
        <Card className="max-w-5xl">
          <CardContent className="p-6 space-y-4">
            {saveWarning && (
              <p role="alert" className="text-sm text-destructive">
                {saveWarning}
              </p>
            )}
            {/* === Update #049 — field "Tipe Invoice" DIHAPUS (label kategori
              bebas opsional; tidak berpengaruh ke jurnal/stok/GRNI — hanya
              membingungkan). Form kini langsung dimulai dari pilihan PO. === */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Purchase Order (opsional)</Label>
              <SearchableDropdown value={fPurchaseOrderId} onValueChange={handlePurchaseOrderChange} options={tersediaPoOptions.map((po) => ({ id: po.id, label: poTersediaLabel(po) }))} placeholder="Pilih PO (opsional)" allOption={{ id: '', label: 'Tanpa PO' }} disabled={poLoading} />
              {poLoading && <p className="text-xs text-muted-foreground mt-1">Memuat sisa PO...</p>}
            </div>
            {/* === Update #4 (Q2): panel info status penerimaan PO (read-only) === */}
            {poSisaInfo && (
              <div className="rounded-md border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs font-medium">Status Penerimaan PO {poSisaInfo.noPesanan}</p>
                  <span className="text-[11px] text-muted-foreground">(informasi — tidak mengubah isian baris)</span>
                </div>
                <div className="overflow-x-auto rounded-md border bg-background">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs whitespace-nowrap">Nama Barang</TableHead>
                        <TableHead className="text-xs whitespace-nowrap text-right">Qty PO</TableHead>
                        <TableHead className="text-xs whitespace-nowrap text-right">Sudah Diterima</TableHead>
                        <TableHead className="text-xs whitespace-nowrap text-right">Sisa Belum Diterima</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(poSisaInfo.details || []).map((d) => {
                        const sisaTerima = Number(d.sisaTerima) || 0;
                        return (
                          <TableRow key={d.purchaseOrderDetailId}>
                            <TableCell className="text-xs">
                              {d.namaBarang || '-'}
                              {d.kodeBarang ? <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{d.kodeBarang}</span> : null}
                            </TableCell>
                            <TableCell className="text-xs text-right font-mono">{(Number(d.qtyPesanan) || 0).toLocaleString('id-ID')}</TableCell>
                            <TableCell className="text-xs text-right font-mono">{(Number(d.qtyDiterima) || 0).toLocaleString('id-ID')}</TableCell>
                            <TableCell className="text-right">
                              {sisaTerima > 0 ? (
                                <span className="inline-flex flex-col items-end gap-1">
                                  <span className="font-mono text-xs font-medium text-amber-700">{sisaTerima.toLocaleString('id-ID')}</span>
                                  <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Belum diterima: {sisaTerima.toLocaleString('id-ID')}</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Lengkap
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {(poSisaInfo.details || []).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="h-10 text-center text-xs text-muted-foreground">
                            PO tidak memiliki baris barang.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
            {/* === Update #048 — panel Penerimaan Barang PO ini (alur GRNI):
              daftar penerimaan + pilih mana yang di-link otomatis ke invoice
              ini saat disimpan; bila belum ada, tombol buat penerimaan. === */}
            {fPurchaseOrderId && (
              <PoPenerimaanPanel
                list={penerimaanLink.list}
                loading={penerimaanLink.loading}
                checkedIds={penerimaanLink.checkedIds}
                onToggle={penerimaanLink.toggleChecked}
                onRefresh={() => penerimaanLink.fetchForPo(fPurchaseOrderId, fSupplierId || undefined, { preserveChecks: true })}
                onBuatPenerimaan={() =>
                  openFormTab({
                    title: 'Buat Penerimaan Barang',
                    module: 'purchasing',
                    subPage: 'penerimaan',
                    formKey: 'penerimaan-pembelian-create',
                    formProps: { purchaseOrderId: fPurchaseOrderId }
                  })
                }
              />
            )}
            <p className="text-sm text-muted-foreground">Isi data invoice pembelian baru</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5" id="field-supplierId">
                <Label className="text-xs font-medium">
                  Supplier <span className="text-destructive">*</span>
                </Label>
                <div className="flex items-start gap-1.5">
                  {/* === Update #046 — supplier DIKUNCI saat PO terpilih (menarik
                    data dari PO; supplier mengikuti dokumen sumber). === */}
                  <SearchableDropdown
                    className="min-w-0 flex-1"
                    value={fSupplierId}
                    onValueChange={(value) => {
                      setFSupplierId(value);
                      // Update #4: alamat supplier ditarik otomatis dari master
                      const master = findPartyMaster(supplierOptions, value);
                      setFAlamat(master?.alamat || '');
                    }}
                    options={supplierOptions.map((s) => ({ id: s.id, label: s.nama }))}
                    placeholder={fPurchaseOrderId ? 'Mengikuti PO terpilih' : 'Pilih supplier...'}
                    disabled={!!fPurchaseOrderId}
                  />
                  {/* Update #007: quick add supplier.
                    === Update #046 — tombol DISEMBUNYIKAN saat mode narik data
                    (PO terpilih — supplier terkunci); muncul saat manual. === */}
                  {!fPurchaseOrderId && (
                    <QuickAddSupplierButton
                      onCreated={(sup) => {
                        const drop = toSupplierDropdown(sup);
                        setSupplierOptions((prev) => (prev.some((row) => row.id === sup.id) ? prev : [...prev, drop]));
                        setFSupplierId(sup.id);
                        setFAlamat(sup.alamat || '');
                        setFormErrors((prev) => (prev.supplierId ? { ...prev, supplierId: '' } : prev));
                      }}
                    />
                  )}
                </div>
                {formErrors.supplierId && <p className="text-xs text-destructive mt-1">{formErrors.supplierId}</p>}
              </div>
              <div className="space-y-1.5" id="field-tanggal">
                <Label className="text-xs font-medium">
                  Tanggal <span className="text-destructive">*</span>
                </Label>
                <Input type="date" className="h-9 text-xs" value={fTanggal} onChange={(e) => setFTanggal(e.target.value)} />
                {formErrors.tanggal && <p className="text-xs text-destructive mt-1">{formErrors.tanggal}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5" id="field-noFaktur">
                <Label className="text-xs font-medium">
                  No Faktur <span className="text-destructive">*</span>
                </Label>
                <Input className="h-9 text-xs" value={fNoFaktur} onChange={(e) => setFNoFaktur(e.target.value)} placeholder="Nomor faktur dari supplier..." />
                {formErrors.noFaktur && <p className="text-xs text-destructive mt-1">{formErrors.noFaktur}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Alamat</Label>
                <Textarea className="text-xs min-h-[48px]" value={fAlamat} onChange={(e) => setFAlamat(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">{AUTOFILL_HINT.supplier}</p>
              </div>
            </div>
            <Separator />
            <div className="space-y-1.5" id="field-detail">
              <Label className="text-xs font-medium">
                Detail Barang <span className="text-destructive">*</span>
              </Label>
              <DetailTableWithPrice
                rows={fDetail}
                setRows={setFDetail}
                barangOptions={barangOptions}
                satuanOptions={satuanOptions}
                onBarangCreated={(b) => {
                  setBarangOptions((prev) => (prev.some((row) => row.id === b.id) ? prev : [...prev, toBarangDropdown(b)]));
                  // Update #007: satuan barang baru (mungkin hasil nested quick-add) didaftarkan ke daftar satuan host.
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
              <BiayaTambahanTable rows={fBiayaTambahan} setRows={setFBiayaTambahan} />
            </div>
            <Separator />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Diskon Global %</Label>
                <Input type="number" className="h-9 text-xs" value={fDiskonGlobal} min={0} max={100} onChange={(e) => setFDiskonGlobal(e.target.value)} />
              </div>
            </div>
            {/* === Update #052 — kartu Pajak terpadu (mirror form PO & Invoice
                Penjualan): PPN dan PPh23 masing-masing BISA DIKLIK aktif/
                nonaktif. Tarif PPN terkunci (Referensi → Perpajakan); tarif
                PPh23 ber-default dari Perpajakan dan bisa disesuaikan per
                jenis jasa supplier (2%/4%/6%). === */}
            <div className="space-y-3 rounded-md border p-4">
              <div>
                <Label className="text-xs font-medium">Pajak (PPN / PPh23)</Label>
                <p className="text-[11px] text-muted-foreground">Pilih pajak yang diterapkan — boleh dua-duanya, salah satu saja, atau tidak sama sekali. PPh23 memotong grand total (ditahan dari pembayaran ke supplier sejak invoice). Tarif PPN terkunci (Referensi → Perpajakan); tarif PPh23 ber-default dari Perpajakan — dapat disesuaikan per jenis jasa (mis. 2%, 4%, 6%).</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${fPpnApplicable ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                  <Checkbox aria-checked={fPpnApplicable} className="mt-0.5" checked={fPpnApplicable} onCheckedChange={(checked) => setFPpnApplicable(checked === true)} />
                  <span className="min-w-0 flex-1 space-y-2 text-sm leading-snug">
                    <span className="block font-medium">PPN</span>
                    {fPpnApplicable && (
                      <span className="flex items-center gap-2">
                        {/* Tarif PPN readOnly: terpusat di Referensi → Perpajakan
                            (RATE_PPN). Update #052: icon gembok dihapus. */}
                        <Input type="number" step="any" min={0} max={100} aria-label="Tarif PPN (persen)" className="h-8 w-24 text-xs bg-muted/60 font-medium" value={fPpn} readOnly aria-readonly="true" title="Tarif PPN terkunci — atur di Referensi → Perpajakan" />
                        <span className="text-xs text-muted-foreground">%</span>
                      </span>
                    )}
                  </span>
                </label>
                <label className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${fPph23Applicable ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                  <Checkbox aria-checked={fPph23Applicable} className="mt-0.5" checked={fPph23Applicable} onCheckedChange={(checked) => setFPph23Applicable(checked === true)} />
                  <span className="min-w-0 flex-1 space-y-2 text-sm leading-snug">
                    <span className="block font-medium">PPh23</span>
                    {fPph23Applicable && (
                      <span className="flex items-center gap-2">
                        {/* Update #048 — tarif PPh23 bisa disesuaikan per jenis
                            jasa supplier (default RATE_PPH23). */}
                        <Input type="number" step="any" min={0} max={100} aria-label="Tarif PPh23 (persen)" className="h-8 w-24 text-xs" value={fPph23} onChange={(e) => setFPph23(e.target.value)} title="Default dari Referensi → Perpajakan — sesuaikan bila jenis jasa supplier berbeda" />
                        <span className="text-xs text-muted-foreground">%</span>
                      </span>
                    )}
                  </span>
                </label>
              </div>
            </div>
            <TotalsBreakdown subtotal={formSubtotal} diskonGlobalPct={parseFloat(fDiskonGlobal) || 0} ppnPct={fPpnApplicable ? parseFloat(fPpn) || 0 : 0} totalBiayaTambahan={formTotalBiaya} pph23Pct={fPph23Applicable ? parseFloat(fPph23) || 0 : 0} />
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Keterangan</Label>
              <Textarea className="text-xs min-h-[60px]" value={fKeterangan} onChange={(e) => setFKeterangan(e.target.value)} placeholder="Catatan tambahan..." />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <div className="mr-auto">
                <DraftIndicator hasDraft={draft.hasDraft} ageLabel={draft.draftAgeLabel} onDiscard={handleDiscardDraft} formLabel="Invoice Pembelian" />
              </div>
              <Button variant="outline" size="sm" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting}>
                Batal
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={submitting || !!savedInvoice}>
                {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Receipt className="mr-1.5 h-4 w-4" />}
                {submitting ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </FormTabShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FORM: Invoice Pembelian — Edit
// ═════════════════════════════════════════════════════════════════════════════

function InvoiceEditForm({ editId }: { editId: string }) {
  const [editPurchaseOrderId, setEditPurchaseOrderId] = useState('');
  // === Update #049 — field "Tipe Invoice" DIHAPUS dari form edit; nilai yang
  // tersimpan tetap dipertahankan (dibaca & dikirim balik tanpa perubahan). ===
  const [editInvoiceType, setEditInvoiceType] = useState('');
  const [saveWarning, setSaveWarning] = useState('');
  const [savedInvoice, setSavedInvoice] = useState<PurchaseInvoiceResponse | null>(null);
  const { supplierOptions, setSupplierOptions, purchaseOrderOptions, loading: dropdownsLoading } = usePurchasingDropdowns();
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);
  // === Update #048 — panel Penerimaan (link GRNI) + tombol buat penerimaan. ===
  const openFormTab = useTabStore((s) => s.openFormTab);
  const penerimaanLink = usePoPenerimaanLink();
  // === Update #063 — dropdown PO difilter "masih punya sisa faktur"
  // (paritas form create); PO invoice yang sedang diedit disisipkan
  // otomatis lewat currentId supaya label tetap tampil. ===
  const tersediaPoOptions = useTersediaPoOptions('invoice', purchaseOrderOptions, editPurchaseOrderId || undefined, savedInvoice?.purchaseOrder?.noPesanan);
  // === Update #049 — scope pencarian anchor field wajib (navigasi otomatis). ===
  const formRef = useRef<HTMLDivElement>(null);

  const [recordLoading, setRecordLoading] = useState(true);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editNoForm, setEditNoForm] = useState('');
  const [editNoFaktur, setEditNoFaktur] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editGrandTotal, setEditGrandTotal] = useState(0);
  const [editSupplierId, setEditSupplierId] = useState('');
  const [editTanggal, setEditTanggal] = useState('');
  const [editAlamat, setEditAlamat] = useState('');
  const [editDiskonGlobal, setEditDiskonGlobal] = useState('0');
  const [editPpn, setEditPpn] = useState('11');
  // === Update #052 — pilihan PPN/PPh23 pada form edit invoice (draft saja). ===
  const [editPpnApplicable, setEditPpnApplicable] = useState(true);
  const [editPph23Applicable, setEditPph23Applicable] = useState(false);
  const [editPph23, setEditPph23] = useState('2');
  const [editKeterangan, setEditKeterangan] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setRecordLoading(true);
      try {
        const inv = await api.get<PurchaseInvoiceResponse>(`/pembelian/purchase-invoice/${editId}`);
        if (cancelled) return;
        setSavedInvoice(inv);
        setEditPurchaseOrderId(inv.purchaseOrderId || '');
        setEditInvoiceType(inv.invoiceType || '');
        setEditNoForm(inv.noForm);
        setEditNoFaktur(inv.noFaktur);
        setEditStatus(inv.status);
        setEditGrandTotal(Number(inv.grandTotal));
        setEditSupplierId(inv.supplierId || '');
        setEditTanggal(inv.tanggal ? inv.tanggal.slice(0, 10) : '');
        setEditAlamat(inv.alamat || '');
        setEditDiskonGlobal(String(inv.diskonGlobal ?? 0));
        // === Update #053 — tarif dipangkas nol desimalnya ("11.00" → "11")
        // supaya kolom tarif tampil 11 / 2, bukan 11,00 / 2,00. ===
        setEditPpn(trimDecimalString(inv.ppn ?? 0, '0'));
        setEditPpnApplicable(inv.ppnApplicable ?? true);
        setEditPph23Applicable(inv.pph23Applicable ?? false);
        setEditPph23(trimDecimalString(inv.pph23 ?? 2, '2'));
        setEditKeterangan(inv.keterangan || '');
      } catch (err) {
        toast.error(err instanceof ApiError ? err.detail : 'Gagal memuat data invoice');
      } finally {
        if (!cancelled) setRecordLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [editId]);

  // === Update #048 — daftar penerimaan PO invoice ini (panel link GRNI):
  // dimuat ulang saat PO / supplier berubah (termasuk saat record termuat).
  // === Update #064 — currentInvoiceId: penerimaan yang terhubung ke invoice
  // LAIN disembunyikan; milik invoice ini tetap tampil (badge "Invoice ini"). ===
  useEffect(() => {
    if (recordLoading) return;
    if (editPurchaseOrderId) penerimaanLink.fetchForPo(editPurchaseOrderId, editSupplierId || undefined, { currentInvoiceId: editId });
    else penerimaanLink.fetchForPo('');
  }, [recordLoading, editPurchaseOrderId, editSupplierId, editId, penerimaanLink.fetchForPo]);

  const handleEditSubmit = async () => {
    if (!savedInvoice) return;
    // === Update #049 — field wajib dicek SATU PER SATU + navigasi otomatis ke
    // field pertama yang terlewat. ===
    const missingInv: string[] = [];
    if (!editNoFaktur.trim()) missingInv.push('noFaktur');
    if (!editSupplierId) missingInv.push('supplierId');
    if (!editTanggal) missingInv.push('tanggal');
    if (missingInv.length) {
      setSaveWarning(!editNoFaktur.trim() ? 'No Faktur wajib diisi' : '');
      toast.error('Ada field wajib yang belum diisi');
      focusFormError(missingInv, { root: formRef.current });
      return;
    }
    setSaveWarning('');
    setEditSubmitting(true);
    try {
      const body: PurchaseInvoiceUpdate = {
        ...invoicePhaseDFields(editPurchaseOrderId, editInvoiceType, savedInvoice),
        tanggal: editTanggal,
        supplierId: editSupplierId,
        noFaktur: editNoFaktur || null,
        alamat: editAlamat || null,
        diskonGlobal: parseFloat(editDiskonGlobal) || null,
        ppn: parseFloat(editPpn) || 0,
        // === Update #052 — pilihan pajak ikut terkirim saat edit invoice
        // (draft); total dihitung ulang server. ===
        ppnApplicable: editPpnApplicable,
        pph23: editPph23Applicable ? parseFloat(editPph23) || 0 : 0,
        pph23Applicable: editPph23Applicable,
        keterangan: editKeterangan || null
      };
      const saved = await api.put<PurchaseInvoiceResponse>(`/pembelian/purchase-invoice/${editId}`, body);
      setSavedInvoice(saved);
      refreshListTab('purchasing', 'invoice');
      // === Update #048 — link penerimaan terpilih (panel Penerimaan) ke
      // invoice ini setelah header tersimpan (alur GRNI). ===
      if (editPurchaseOrderId) {
        const linkResult = await penerimaanLink.linkToInvoice(editId, editPurchaseOrderId, editSupplierId || undefined);
        if (linkResult.linked.length) toast.success('Penerimaan terhubung ke invoice', { description: linkResult.linked.join(', ') });
        // === Update #049 — panduan diperbarui + alasan error backend ditampilkan. ===
        if (linkResult.failed.length) {
          // === Update #051 — paritas form buat: fix backend #051 membuat
          // kegagalan "diposting" tidak muncul lagi; panduan manual kini valid
          // untuk semua jalur kegagalan. ===
          toast.warning('Beberapa penerimaan gagal dihubungkan', {
            description: 'Gagal: ' + linkResult.failed.join(' ; ') + '. Buka Daftar Penerimaan Barang → tombol pensil pada penerimaan tersebut → pilih invoice ini di "Link ke Invoice Pembelian" → Simpan.',
            duration: 12000
          });
        }
      }
      const mismatches = invoiceSaveMismatches(body, saved);
      if (mismatches.length) {
        setSaveWarning('Beberapa isian belum terkonfirmasi tersimpan: ' + mismatches.join(', ') + '. Data form dipertahankan.');
        return;
      }
      toast.success('Invoice pembelian berhasil diperbarui');
      refreshListTab('purchasing', 'invoice');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      setSaveWarning(err instanceof Error ? err.message : 'Gagal memperbarui invoice');
      // === Update #048 — pesan GRNI diterjemahkan ke petunjuk yang jelas. ===
      const grniDetail = err instanceof ApiError ? err.detail : '';
      if (grniDetail.includes('GRNI')) {
        toast.error('Belum bisa simpan — barang PO ini belum diterima', {
          description: 'Mode GRNI aktif: buat & selesaikan Penerimaan Barang dari PO ini terlebih dahulu (panel Penerimaan di atas), lalu simpan lagi — penerimaan otomatis terhubung ke invoice ini.',
          duration: 10000
        });
      } else {
        toast.error(err instanceof ApiError ? err.detail : 'Gagal memperbarui invoice');
      }
    } finally {
      setEditSubmitting(false);
    }
  };

  if (dropdownsLoading || recordLoading) {
    return (
      <FormTabShell title="Edit Invoice Pembelian">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </FormTabShell>
    );
  }

  return (
    <FormTabShell title="Edit Invoice Pembelian">
      {/* === Update #049 — wrapper ref: scope anchor navigasi field wajib. === */}
      <div ref={formRef}>
        <Card className="max-w-5xl">
          <CardContent className="p-6 space-y-4">
            {saveWarning && (
              <p role="alert" className="text-sm text-destructive">
                {saveWarning}
              </p>
            )}
            {/* === Update #049 — field "Tipe Invoice" DIHAPUS (paritas form
              create); nilai tersimpan tetap dipertahankan saat disimpan. === */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Purchase Order (opsional)</Label>
              <SearchableDropdown value={editPurchaseOrderId} onValueChange={setEditPurchaseOrderId} options={tersediaPoOptions.map((po) => ({ id: po.id, label: poTersediaLabel(po) }))} placeholder="Pilih PO (opsional)" allOption={{ id: '', label: 'Tanpa PO' }} />
            </div>
            <p className="text-sm text-muted-foreground">Perbarui data header invoice (detail barang tidak dapat diubah)</p>
            <div className="flex flex-wrap items-center gap-4 rounded-md border bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5" />
                <span>No Invoice:</span>
                <span className="font-mono font-semibold text-foreground">{editNoForm}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>No Faktur:</span>
                <span className="font-mono font-semibold text-foreground">{editNoFaktur}</span>
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
            {/* === Update #048 — panel Penerimaan Barang PO ini (alur GRNI):
              penerimaan yang dicentang di-link otomatis ke invoice ini saat
              disimpan; bila belum ada, tombol buat penerimaan dari PO. === */}
            {editPurchaseOrderId && (
              <PoPenerimaanPanel
                list={penerimaanLink.list}
                loading={penerimaanLink.loading}
                checkedIds={penerimaanLink.checkedIds}
                onToggle={penerimaanLink.toggleChecked}
                onRefresh={() => penerimaanLink.fetchForPo(editPurchaseOrderId, editSupplierId || undefined, { preserveChecks: true, currentInvoiceId: editId })}
                onBuatPenerimaan={() =>
                  openFormTab({
                    title: 'Buat Penerimaan Barang',
                    module: 'purchasing',
                    subPage: 'penerimaan',
                    formKey: 'penerimaan-pembelian-create',
                    formProps: { purchaseOrderId: editPurchaseOrderId }
                  })
                }
                currentInvoiceId={editId}
              />
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5" id="field-supplierId">
                <Label className="text-xs font-medium">
                  Supplier <span className="text-destructive">*</span>
                </Label>
                <div className="flex items-start gap-1.5">
                  <SearchableDropdown
                    className="min-w-0 flex-1"
                    value={editSupplierId}
                    onValueChange={(value) => {
                      setEditSupplierId(value);
                      // Update #4: alamat supplier ditarik otomatis dari master
                      const master = findPartyMaster(supplierOptions, value);
                      setEditAlamat(master?.alamat || '');
                    }}
                    options={supplierOptions.map((s) => ({ id: s.id, label: s.nama }))}
                    placeholder="Pilih supplier..."
                  />
                  {/* Update #007: quick add supplier */}
                  <QuickAddSupplierButton
                    onCreated={(sup) => {
                      const drop = toSupplierDropdown(sup);
                      setSupplierOptions((prev) => (prev.some((row) => row.id === sup.id) ? prev : [...prev, drop]));
                      setEditSupplierId(sup.id);
                      setEditAlamat(sup.alamat || '');
                    }}
                  />
                </div>
              </div>
              <div className="space-y-1.5" id="field-tanggal">
                <Label className="text-xs font-medium">
                  Tanggal <span className="text-destructive">*</span>
                </Label>
                <Input type="date" className="h-9 text-xs" value={editTanggal} onChange={(e) => setEditTanggal(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5" id="field-noFaktur">
                <Label className="text-xs font-medium">No Faktur</Label>
                <Input className="h-9 text-xs" value={editNoFaktur} onChange={(e) => setEditNoFaktur(e.target.value)} placeholder="Nomor faktur dari supplier..." />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Alamat</Label>
                <Textarea className="text-xs min-h-[48px]" value={editAlamat} onChange={(e) => setEditAlamat(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">{AUTOFILL_HINT.supplier}</p>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Diskon Global %</Label>
                <Input type="number" className="h-9 text-xs" value={editDiskonGlobal} min={0} max={100} onChange={(e) => setEditDiskonGlobal(e.target.value)} />
              </div>
            </div>
            {/* === Update #052 — kartu Pajak terpadu pada form edit (paritas
                form buat; hanya berlaku saat invoice masih draft). === */}
            <div className="space-y-3 rounded-md border p-4">
              <div>
                <Label className="text-xs font-medium">Pajak (PPN / PPh23)</Label>
                <p className="text-[11px] text-muted-foreground">Pilih pajak yang diterapkan — boleh dua-duanya, salah satu saja, atau tidak sama sekali. PPh23 memotong grand total (ditahan dari pembayaran ke supplier sejak invoice). Tarif PPN terkunci (Referensi → Perpajakan); tarif PPh23 ber-default dari Perpajakan — dapat disesuaikan per jenis jasa (mis. 2%, 4%, 6%).</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${editPpnApplicable ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                  <Checkbox aria-checked={editPpnApplicable} className="mt-0.5" checked={editPpnApplicable} onCheckedChange={(checked) => setEditPpnApplicable(checked === true)} />
                  <span className="min-w-0 flex-1 space-y-2 text-sm leading-snug">
                    <span className="block font-medium">PPN</span>
                    {editPpnApplicable && (
                      <span className="flex items-center gap-2">
                        <Input type="number" step="any" min={0} max={100} aria-label="Tarif PPN (persen)" className="h-8 w-24 text-xs bg-muted/60 font-medium" value={editPpn} readOnly aria-readonly="true" title="Tarif PPN terkunci — atur di Referensi → Perpajakan" />
                        <span className="text-xs text-muted-foreground">%</span>
                      </span>
                    )}
                  </span>
                </label>
                <label className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${editPph23Applicable ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                  <Checkbox aria-checked={editPph23Applicable} className="mt-0.5" checked={editPph23Applicable} onCheckedChange={(checked) => setEditPph23Applicable(checked === true)} />
                  <span className="min-w-0 flex-1 space-y-2 text-sm leading-snug">
                    <span className="block font-medium">PPh23</span>
                    {editPph23Applicable && (
                      <span className="flex items-center gap-2">
                        <Input type="number" step="any" min={0} max={100} aria-label="Tarif PPh23 (persen)" className="h-8 w-24 text-xs" value={editPph23} onChange={(e) => setEditPph23(e.target.value)} title="Default dari Referensi → Perpajakan — sesuaikan bila jenis jasa supplier berbeda" />
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
              <Button size="sm" onClick={handleEditSubmit} disabled={editSubmitting || !savedInvoice}>
                {editSubmitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Pencil className="mr-1.5 h-4 w-4" />}
                {editSubmitting ? 'Menyimpan...' : 'Simpan Perubahan'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </FormTabShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FORM: Retur Pembelian — Create
// ═════════════════════════════════════════════════════════════════════════════

function ReturCreateForm() {
  const { error: returnError, clearError: clearReturnError, handleError: handleReturnError } = useStockOperationError('purchase_retur');
  const { supplierOptions, setSupplierOptions, purchaseOrderOptions, gudangOptions, setGudangOptions, loading: dropdownsLoading } = usePurchasingDropdowns();
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [fPurchaseOrderId, setFPurchaseOrderId] = useState('');
  const [fSupplierId, setFSupplierId] = useState('');
  const [fGudangId, setFGudangId] = useState('');
  const [fTanggal, setFTanggal] = useState('');
  const [fAlamat, setFAlamat] = useState('');
  const [fPpn, setFPpn] = useState('11');
  const [fKeterangan, setFKeterangan] = useState('');
  // AUD-10 (update #04) — tarif default dari setting global (RATE_PPN)
  const defaultRatesRetur = useDefaultTaxRates();
  useEffect(() => {
    if (defaultRatesRetur) setFPpn(defaultRatesRetur.ppn);
  }, [defaultRatesRetur]);
  // Link ke invoice pembelian — backend menolak POSTING retur tanpa purchaseInvoiceId
  // ("Pilih purchaseInvoiceId sebelum posting retur pembelian..."). Boleh kosong saat draft.
  const [fPurchaseInvoiceId, setFPurchaseInvoiceId] = useState('');
  // === Tarik data otomatis Invoice → Retur (Task 16-c2): detail retur ditarik
  // dari baris invoice sumber (pola source-table, mirror retur penjualan).
  const [quantities, setQuantities] = useState<PurchaseReturnQuantities>({});
  const source = usePurchaseReturnSource(fPurchaseInvoiceId);
  const { options: postedInvoiceOptions, loading: postedInvoiceLoading, error: postedInvoiceError, retry: retryPostedInvoices } = usePostedInvoiceOptions(fSupplierId || null);
  // === Update #049 — scope pencarian anchor field wajib (navigasi otomatis). ===
  const formRef = useRef<HTMLDivElement>(null);

  // AUD-12 (update #05) — estimasi PPh23 retur untuk info-card (derived dari invoice
  // sumber + qty retur; nilai final dihitung backend saat create/post).
  const returDppEstimate = source.invoice ? source.invoice.details.reduce((s, line) => s + Number(quantities[line.id] ?? 0) * Number(line.harga), 0) : 0;
  const returPpnEstimate = returDppEstimate * ((parseFloat(fPpn) || 0) / 100);

  // Saat invoice sumber termuat: auto-set PO (bila invoice ter-link PO) dan
  // supplier dari invoice. PO tetap bisa diganti manual setelahnya (tidak dipaksa).
  // Update #4: alamat juga ditarik otomatis (dari invoice sumber / master supplier).
  const appliedSourceRef = useRef('');
  useEffect(() => {
    const invoice = source.invoice;
    if (!invoice || appliedSourceRef.current === invoice.id) return;
    appliedSourceRef.current = invoice.id;
    if (invoice.purchaseOrderId) setFPurchaseOrderId(invoice.purchaseOrderId);
    if (invoice.supplierId) {
      setFSupplierId(invoice.supplierId);
      const master = findPartyMaster(supplierOptions, invoice.supplierId);
      setFAlamat(invoice.alamat || master?.alamat || '');
    }
  }, [source.invoice, supplierOptions]);

  // ── Draft otomatis (form create; dipulihkan saat kembali ke form ini) ──
  const userId = useAuthStore((s) => s.user?.id ?? 'anon');
  const draft = useFormDraft<ReturPembelianDraftData>(draftKey(userId, 'purchasing', 'purchase-retur', 'create'));
  const skipNextSaveRef = useRef(false);
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const d = draft.draft;
    if (!d) return;
    setFPurchaseOrderId(d.purchaseOrderId || '');
    setFSupplierId(d.supplierId || '');
    setFGudangId(d.gudangId || '');
    setFTanggal(d.tanggal || '');
    setFAlamat(d.alamat || '');
    // === Update #048 — tarif PPN tidak dipulihkan dari draft lagi: nilainya
    // terkunci & selalu mengikuti Referensi → Perpajakan (RATE_PPN). ===
    setFKeterangan(d.keterangan || '');
    setFPurchaseInvoiceId(d.purchaseInvoiceId || '');
    setQuantities(d.quantities || {});
    toast.info('Draft isian dipulihkan', { description: 'Isian terakhir form Retur Pembelian dimuat kembali otomatis.' });
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
      purchaseOrderId: fPurchaseOrderId,
      supplierId: fSupplierId,
      gudangId: fGudangId,
      tanggal: fTanggal,
      alamat: fAlamat,
      ppn: fPpn,
      keterangan: fKeterangan,
      purchaseInvoiceId: fPurchaseInvoiceId,
      quantities
    });
  }, [fPurchaseOrderId, fSupplierId, fGudangId, fTanggal, fAlamat, fPpn, fKeterangan, fPurchaseInvoiceId, quantities]);

  const handleDiscardDraft = useCallback(() => {
    skipNextSaveRef.current = true;
    draft.clearDraft();
    setFPurchaseOrderId('');
    setFSupplierId('');
    setFGudangId('');
    setFTanggal('');
    setFAlamat('');
    // === Update #048 — reset tarif mengikuti Referensi → Perpajakan. ===
    setFPpn(defaultRatesRetur?.ppn ?? '11');
    setFKeterangan('');
    setFPurchaseInvoiceId('');
    setQuantities({});
    appliedSourceRef.current = '';
    setFormErrors({});
  }, [defaultRatesRetur]);

  const handleSubmit = async () => {
    const errs: Record<string, string> = {};
    if (!fPurchaseOrderId) errs.purchaseOrderId = 'Purchase Order wajib diisi';
    if (!fSupplierId) errs.supplierId = 'Supplier wajib diisi';
    if (!fPurchaseInvoiceId) errs.purchaseInvoiceId = 'Pilih invoice sumber agar baris retur bisa ditarik otomatis';
    // === Update #050 — tanggal retur kini wajib dipilih manual (default
    // kosong, tidak lagi otomatis terisi hari ini). ===
    if (!fTanggal) errs.tanggal = 'Tanggal wajib diisi';
    // === Task 16-c2: baris retur dibangun dari baris invoice sumber —
    // hanya baris dengan qty retur > 0 yang dikirim; harga mengikuti invoice;
    // tiap baris ter-link purchaseInvoiceDetailId (+purchaseOrderDetailId bila ada).
    let details: PurchaseReturDetailCreate[] = [];
    if (source.invoice) {
      for (let index = 0; index < source.invoice.details.length; index++) {
        const line = source.invoice.details[index];
        const value = quantities[line.id] ?? '';
        if (value === '' || Number(value) === 0) continue;
        const qty = Number(value);
        const harga = Number(line.harga);
        if (!Number.isSafeInteger(qty) || qty < 1) {
          errs.detail = `Baris ${index + 1}: qty retur harus bilangan bulat minimal 1. Gunakan 0 untuk barang yang tidak diretur.`;
          break;
        }
        if (qty > Number(line.qty)) {
          errs.detail = `Baris ${index + 1}: qty retur (${qty}) melebihi qty invoice (${line.qty}).`;
          break;
        }
        if (!Number.isFinite(harga) || harga < 0) {
          errs.detail = 'Harga invoice sumber tidak valid. Muat ulang invoice.';
          break;
        }
        details.push({ barangId: line.barangId, purchaseInvoiceDetailId: line.id, purchaseOrderDetailId: line.purchaseOrderDetailId || null, harga, qty, subTotal: qty * harga });
      }
      if (!errs.detail && details.length === 0) errs.detail = 'Isi qty retur pada minimal satu baris invoice.';
    }
    if (Object.keys(errs).length) {
      setFormErrors(errs);
      // === Update #049 — navigasi otomatis: scroll + fokus ke field wajib
      // pertama yang terlewat. ===
      focusFormError(Object.keys(errs), { root: formRef.current });
      toast.error('Ada field wajib yang belum diisi');
      return;
    }
    setSubmitting(true);
    try {
      const body: PurchaseReturCreate = {
        autoPostJurnal: false,
        tanggal: fTanggal,
        purchaseOrderId: fPurchaseOrderId,
        supplierId: fSupplierId,
        // Kirim null eksplisit kalau kosong — wajib diisi sebelum posting (workflow post).
        purchaseInvoiceId: fPurchaseInvoiceId || null,
        gudangId: fGudangId || null,
        alamat: fAlamat || null,
        ppn: parseFloat(fPpn) || 0,
        keterangan: fKeterangan || null,
        details
      };
      await api.post('/pembelian/purchase-retur', body);
      toast.success('Retur pembelian berhasil dibuat');
      draft.clearDraft();
      refreshListTab('purchasing', 'retur');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      handleReturnError(err, 'Gagal menyimpan retur');
    } finally {
      setSubmitting(false);
    }
  };

  if (dropdownsLoading) {
    return (
      <FormTabShell title="Buat Retur Pembelian">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </FormTabShell>
    );
  }

  return (
    <FormTabShell title="Buat Retur Pembelian">
      {/* === Update #049 — wrapper ref: scope anchor navigasi field wajib. === */}
      <div ref={formRef}>
        <Card className="max-w-5xl">
          <CardContent className="p-6 space-y-4">
            <p className="text-sm text-muted-foreground">Isi data retur / pengembalian barang ke supplier</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5" id="field-purchaseOrderId">
                <Label className="text-xs font-medium">
                  Purchase Order <span className="text-destructive">*</span>
                </Label>
                <SearchableDropdown value={fPurchaseOrderId} onValueChange={setFPurchaseOrderId} options={purchaseOrderOptions.map((po) => ({ id: po.id, label: po.noPesanan }))} placeholder="Pilih PO..." />
                <p className="text-[11px] text-muted-foreground leading-relaxed">Otomatis terisi dari invoice sumber; boleh diganti manual bila perlu.</p>
                {formErrors.purchaseOrderId && <p className="text-xs text-destructive mt-1">{formErrors.purchaseOrderId}</p>}
              </div>
              <div className="space-y-1.5" id="field-supplierId">
                <Label className="text-xs font-medium">
                  Supplier <span className="text-destructive">*</span>
                </Label>
                <div className="flex items-start gap-1.5">
                  <SearchableDropdown
                    className="min-w-0 flex-1"
                    value={fSupplierId}
                    onValueChange={(value) => {
                      setFSupplierId(value);
                      setFPurchaseInvoiceId('');
                      setQuantities({});
                      // Update #4: alamat supplier ditarik otomatis dari master
                      const master = findPartyMaster(supplierOptions, value);
                      setFAlamat(master?.alamat || '');
                    }}
                    options={supplierOptions.map((s) => ({ id: s.id, label: s.nama }))}
                    placeholder="Pilih supplier..."
                  />
                  {/* Update #007: quick add supplier */}
                  <QuickAddSupplierButton
                    onCreated={(sup) => {
                      const drop = toSupplierDropdown(sup);
                      setSupplierOptions((prev) => (prev.some((row) => row.id === sup.id) ? prev : [...prev, drop]));
                      setFSupplierId(sup.id);
                      setFPurchaseInvoiceId('');
                      setQuantities({});
                      setFAlamat(sup.alamat || '');
                      setFormErrors((prev) => (prev.supplierId ? { ...prev, supplierId: '' } : prev));
                    }}
                  />
                </div>
                {formErrors.supplierId && <p className="text-xs text-destructive mt-1">{formErrors.supplierId}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5" id="field-tanggal">
                {/* === Update #050 — tanggal wajib dipilih manual (default
                  kosong) + anchor navigasi otomatis ke field terlewat. === */}
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
                <Label className="text-xs font-medium">Alamat</Label>
                <Textarea className="text-xs min-h-[48px]" value={fAlamat} onChange={(e) => setFAlamat(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">{AUTOFILL_HINT.supplier}</p>
              </div>
              <div className="space-y-1.5">
                {/* === Update #048 — tarif PPN DIKUNCI (readOnly): terpusat di
                  Referensi → Perpajakan (RATE_PPN); nilai mengikuti setting
                  global (form create), bukan input manual. === */}
                <Label className="text-xs font-medium">PPN (%)</Label>
                <Input type="number" className="h-9 text-xs bg-muted/60 font-medium" value={fPpn} min={0} max={100} readOnly aria-readonly="true" title="Tarif PPN terkunci — atur di Referensi → Perpajakan" />
                <p className="text-[11px] text-muted-foreground">Tarif terkunci — diatur di Referensi → Perpajakan.</p>
              </div>
            </div>
            <div className="space-y-1.5" id="field-purchaseInvoiceId">
              <Label className="text-xs font-medium">Invoice Pembelian (wajib sebelum posting)</Label>
              <SearchableDropdown
                value={fPurchaseInvoiceId}
                onValueChange={(value) => {
                  setFPurchaseInvoiceId(value);
                  setQuantities({});
                  appliedSourceRef.current = '';
                  setFormErrors({});
                }}
                options={postedInvoiceOptions.map((inv) => ({ id: inv.id, label: `${inv.noForm} — ${inv.noFaktur || '-'} (${formatRp(Number(inv.grandTotal))})` }))}
                placeholder={fSupplierId ? 'Pilih invoice pembelian supplier (posted)...' : 'Pilih supplier dulu...'}
                loading={postedInvoiceLoading}
                emptyText={fSupplierId ? 'Tidak ada invoice yang sudah di-POST untuk supplier ini.' : 'Pilih supplier untuk melihat opsi invoice.'}
                allOption={{ id: '', label: 'Tanpa invoice — wajib dipilih sebelum posting' }}
              />
              {postedInvoiceError && (
                <div role="alert" className="text-xs text-destructive">
                  {postedInvoiceError}{' '}
                  <Button type="button" variant="outline" size="sm" onClick={retryPostedInvoices}>
                    Coba Lagi
                  </Button>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground leading-relaxed">Retur tidak bisa diposting tanpa invoice. Pilih invoice supplier yang sudah selesai (posted) agar hutang invoice dapat diperbarui saat posting.</p>
              {formErrors.purchaseInvoiceId && <p className="text-xs text-destructive mt-1">{formErrors.purchaseInvoiceId}</p>}
            </div>
            {/* AUD-12 (update #05) — info PPh23 derived dari invoice sumber (bukan input user).
              Retur atas PI ber-PPh23 membalik Hutang PPh 23 (213002);
              grand total retur menjadi NET-of-PPh23 (dihitung backend dari DPP retur × tarif). */}
            {source.invoice?.pph23Applicable && Number(source.invoice.totalPph23) > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50/60 px-4 py-3 space-y-1">
                <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5" /> Invoice sumber ber-PPh 23 (tarif {Number(source.invoice.pph23)}%)
                </p>
                <p className="text-xs text-amber-800">
                  PPh23 dibatalkan retur: <strong className="font-mono">{formatRp(Math.min(Number(source.invoice.totalPph23), returDppEstimate * (Number(source.invoice.pph23) / 100)))}</strong> — dihitung otomatis dari DPP retur × tarif (maks. PPh23 invoice {formatRp(Number(source.invoice.totalPph23))}), bukan input.
                </p>
                <p className="text-xs text-amber-800">
                  Total Retur (net PPh23): <strong className="font-mono">{formatRp(returDppEstimate + returPpnEstimate - Math.min(Number(source.invoice.totalPph23), returDppEstimate * (Number(source.invoice.pph23) / 100)))}</strong> — grand total retur = DPP + PPN − PPh23 retur.
                </p>
              </div>
            )}
            <Separator />
            <div className="space-y-1.5" id="field-detail">
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
              {source.invoice ? <PurchaseReturnSourceLines invoice={source.invoice} quantities={quantities} onChange={(id, qty) => setQuantities((previous) => ({ ...previous, [id]: qty }))} /> : !source.loading && !source.error && <p className="text-sm text-muted-foreground">Pilih invoice untuk menarik baris retur secara otomatis.</p>}
              {formErrors.detail && <p className="text-xs text-destructive mt-1">{formErrors.detail}</p>}
            </div>
            <Separator />
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Keterangan</Label>
              <Textarea className="text-xs min-h-[60px]" value={fKeterangan} onChange={(e) => setFKeterangan(e.target.value)} placeholder="Alasan retur / catatan tambahan..." />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <div className="mr-auto">
                <DraftIndicator hasDraft={draft.hasDraft} ageLabel={draft.draftAgeLabel} onDiscard={handleDiscardDraft} formLabel="Retur Pembelian" />
              </div>
              <Button variant="outline" size="sm" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting}>
                Batal
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={submitting}>
                {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1.5 h-4 w-4" />}
                {submitting ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </div>
          </CardContent>
        </Card>
        <StockOperationErrorDialog error={returnError} onClose={clearReturnError} />
      </div>
    </FormTabShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FORM: Retur Pembelian — Edit
// ═════════════════════════════════════════════════════════════════════════════

function ReturEditForm({ editId }: { editId: string }) {
  const { error: returnError, clearError: clearReturnError, handleError: handleReturnError } = useStockOperationError('purchase_retur');
  const { supplierOptions, setSupplierOptions, purchaseOrderOptions, gudangOptions, setGudangOptions, loading: dropdownsLoading } = usePurchasingDropdowns();
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const [recordLoading, setRecordLoading] = useState(true);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editNoRetur, setEditNoRetur] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editGrandTotal, setEditGrandTotal] = useState(0);
  const [editPurchaseOrderId, setEditPurchaseOrderId] = useState('');
  const [editSupplierId, setEditSupplierId] = useState('');
  const [editGudangId, setEditGudangId] = useState('');
  const [editTanggal, setEditTanggal] = useState('');
  const [editAlamat, setEditAlamat] = useState('');
  const [editPpn, setEditPpn] = useState('11');
  const [editKeterangan, setEditKeterangan] = useState('');
  // Link ke invoice pembelian — wajib sebelum posting (backend menolak post tanpa ini).
  const [editPurchaseInvoiceId, setEditPurchaseInvoiceId] = useState('');
  const { options: postedInvoiceOptions, loading: postedInvoiceLoading, error: postedInvoiceError, retry: retryPostedInvoices } = usePostedInvoiceOptions(editSupplierId || null);
  // === Update #049 — scope pencarian anchor field wajib (navigasi otomatis). ===
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setRecordLoading(true);
      try {
        const ret = await api.get<PurchaseReturResponse>(`/pembelian/purchase-retur/${editId}`);
        if (cancelled) return;
        setEditNoRetur(ret.noRetur);
        setEditStatus(ret.status);
        setEditGrandTotal(Number(ret.grandTotal));
        setEditPurchaseOrderId(ret.purchaseOrderId || '');
        setEditSupplierId(ret.supplierId || '');
        setEditGudangId(ret.gudangId || '');
        setEditTanggal(ret.tanggal ? ret.tanggal.slice(0, 10) : '');
        setEditAlamat(ret.alamat || '');
        setEditPpn(trimDecimalString(ret.ppn ?? 0, '0'));
        setEditKeterangan(ret.keterangan || '');
        setEditPurchaseInvoiceId(ret.purchaseInvoiceId || '');
      } catch (err) {
        toast.error(err instanceof ApiError ? err.detail : 'Gagal memuat data retur');
      } finally {
        if (!cancelled) setRecordLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [editId]);

  const handleEditSubmit = async () => {
    if (!editSupplierId) {
      toast.error('Supplier wajib diisi');
      // === Update #049 — navigasi otomatis ke field yang terlewat. ===
      focusFormError(['supplierId'], { root: formRef.current });
      return;
    }
    setEditSubmitting(true);
    try {
      const body: PurchaseReturUpdate = {
        tanggal: editTanggal,
        purchaseOrderId: editPurchaseOrderId || null,
        supplierId: editSupplierId,
        // Null = preserve link yang tersimpan (backend hanya menimpa bila diisi).
        purchaseInvoiceId: editPurchaseInvoiceId || null,
        gudangId: editGudangId || null,
        alamat: editAlamat || null,
        ppn: parseFloat(editPpn) || 0,
        keterangan: editKeterangan || null
      };
      await api.put<PurchaseReturResponse>(`/pembelian/purchase-retur/${editId}`, body);
      toast.success('Retur pembelian berhasil diperbarui');
      refreshListTab('purchasing', 'retur');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      handleReturnError(err, 'Gagal memperbarui retur');
    } finally {
      setEditSubmitting(false);
    }
  };

  if (dropdownsLoading || recordLoading) {
    return (
      <FormTabShell title="Edit Retur Pembelian">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </FormTabShell>
    );
  }

  return (
    <FormTabShell title="Edit Retur Pembelian">
      {/* === Update #049 — wrapper ref: scope anchor navigasi field wajib. === */}
      <div ref={formRef}>
        <Card className="max-w-5xl">
          <CardContent className="p-6 space-y-4">
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
                <span>Grand Total:</span>
                <span className="font-mono font-semibold text-foreground">{formatRp(editGrandTotal)}</span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Purchase Order</Label>
                <SearchableDropdown value={editPurchaseOrderId} onValueChange={setEditPurchaseOrderId} options={purchaseOrderOptions.map((p) => ({ id: p.id, label: p.noPesanan }))} placeholder="Pilih purchase order..." />
              </div>
              <div className="space-y-1.5" id="field-supplierId">
                <Label className="text-xs font-medium">
                  Supplier <span className="text-destructive">*</span>
                </Label>
                <div className="flex items-start gap-1.5">
                  <SearchableDropdown
                    className="min-w-0 flex-1"
                    value={editSupplierId}
                    onValueChange={(value) => {
                      setEditSupplierId(value);
                      setEditPurchaseInvoiceId('');
                      // Update #4: alamat supplier ditarik otomatis dari master
                      const master = findPartyMaster(supplierOptions, value);
                      setEditAlamat(master?.alamat || '');
                    }}
                    options={supplierOptions.map((s) => ({ id: s.id, label: s.nama }))}
                    placeholder="Pilih supplier..."
                  />
                  {/* Update #007: quick add supplier */}
                  <QuickAddSupplierButton
                    onCreated={(sup) => {
                      const drop = toSupplierDropdown(sup);
                      setSupplierOptions((prev) => (prev.some((row) => row.id === sup.id) ? prev : [...prev, drop]));
                      setEditSupplierId(sup.id);
                      setEditPurchaseInvoiceId('');
                      setEditAlamat(sup.alamat || '');
                    }}
                  />
                </div>
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
            <Separator />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Alamat</Label>
                <Textarea className="text-xs min-h-[48px]" value={editAlamat} onChange={(e) => setEditAlamat(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">{AUTOFILL_HINT.supplier}</p>
              </div>
              <div className="space-y-1.5">
                {/* === Update #048 — tarif PPN DIKUNCI (readOnly): terpusat di
                  Referensi → Perpajakan; menampilkan nilai yang tersimpan
                  pada retur. Update #052: icon gembok dihapus. === */}
                <Label className="text-xs font-medium">PPN (%)</Label>
                <Input type="number" className="h-9 text-xs bg-muted/60 font-medium" value={editPpn} min={0} max={100} readOnly aria-readonly="true" title="Tarif PPN terkunci — atur di Referensi → Perpajakan" />
                <p className="text-[11px] text-muted-foreground">Tarif terkunci — diatur di Referensi → Perpajakan.</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Invoice Pembelian (wajib sebelum posting)</Label>
              <SearchableDropdown value={editPurchaseInvoiceId} onValueChange={setEditPurchaseInvoiceId} options={[...(editPurchaseInvoiceId && !postedInvoiceOptions.some((inv) => inv.id === editPurchaseInvoiceId) ? [{ id: editPurchaseInvoiceId, label: `Invoice tertaut: ${editPurchaseInvoiceId}`, subtitle: 'Tidak ada dalam pilihan invoice saat ini; boleh diganti.' }] : []), ...postedInvoiceOptions.map((inv) => ({ id: inv.id, label: `${inv.noForm} — ${inv.noFaktur || '-'} (${formatRp(Number(inv.grandTotal))})` }))]} placeholder={editSupplierId ? 'Pilih invoice pembelian supplier (posted)...' : 'Pilih supplier dulu...'} loading={postedInvoiceLoading} emptyText={editSupplierId ? 'Tidak ada invoice yang sudah di-POST untuk supplier ini.' : 'Pilih supplier untuk melihat opsi invoice.'} />
              {postedInvoiceError && (
                <div role="alert" className="text-xs text-destructive">
                  {postedInvoiceError}{' '}
                  <Button type="button" variant="outline" size="sm" onClick={retryPostedInvoices}>
                    Coba Lagi
                  </Button>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground leading-relaxed">Retur tidak bisa diposting tanpa invoice. Pilih invoice supplier yang sudah selesai (posted) agar hutang invoice dapat diperbarui saat posting.</p>
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
          </CardContent>
        </Card>
        <StockOperationErrorDialog error={returnError} onClose={clearReturnError} />
      </div>
    </FormTabShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 1: Pesanan Pembelian (List Only)
// ═════════════════════════════════════════════════════════════════════════════

function PesananTab({ supplierOptions, barangOptions, refreshKey }: { supplierOptions: SupplierDropdown[]; barangOptions: BarangDropdown[]; refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab);

  // ── List state ──
  const [data, setData] = useState<PurchaseOrderResponse[]>([]);
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
  const [supplierFilter, setSupplierFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ skip: String(skip), limit: String(PAGE_SIZE) });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter && statusFilter !== 'ALL') params.set('status', statusFilter);
      if (supplierFilter) params.set('supplier_id', supplierFilter);
      if (dateFrom) params.set('tanggal_from', dateFrom);
      if (dateTo) params.set('tanggal_to', dateTo);
      const res = await api.get<PaginatedResponse<PurchaseOrderResponse>>(`/pembelian/purchase-order?${params}`);
      setData(res.data);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [skip, debouncedSearch, statusFilter, supplierFilter, dateFrom, dateTo]);

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
        const res = await api.post<HardDeleteResponse>(`/pembelian/purchase-order/${cancelTarget}/cancel`, {
          reason: reason || undefined
        });
        toast.success(res.message || 'Pesanan dihapus permanen');
        setCancelTarget(null);
        fetchData();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Gagal menghapus pesanan');
      } finally {
        setCancelSubmitting(false);
      }
    },
    [cancelTarget, fetchData]
  );

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <Card className="border-orange-200 bg-orange-50/50">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-orange-600">
            <ShoppingCart className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-orange-600 font-medium">Total Pesanan</p>
            {loading ? <Skeleton className="mt-1 h-6 w-16" /> : <p className="text-2xl font-bold text-orange-700">{total}</p>}
          </div>
        </CardContent>
      </Card>

      {/* List Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Daftar Pesanan Pembelian</CardTitle>
              <CardDescription>Daftar seluruh pesanan pembelian yang telah dicatat</CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() =>
                openFormTab({
                  title: 'Buat Pesanan Pembelian',
                  module: 'purchasing',
                  subPage: 'pesanan',
                  formKey: 'pesanan-pembelian-create'
                })
              }>
              <Plus className="mr-1.5 h-4 w-4" /> Buat Pesanan
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
                <Input placeholder="Cari no pesanan/supplier..." value={search} onChange={(e) => handleSearchChange(e.target.value)} className="pl-8 h-9 text-sm" />
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
              <Label className="text-xs text-muted-foreground">Supplier</Label>
              <div className="mt-1">
                <SearchableDropdown
                  value={supplierFilter}
                  onValueChange={(v) => {
                    setSupplierFilter(v);
                    setSkip(0);
                  }}
                  options={supplierOptions.map((s) => ({ id: s.id, label: s.nama }))}
                  allOption={{ id: '', label: 'Semua Supplier' }}
                />
              </div>
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
                    <TableHead className="w-[130px]">No Pesanan</TableHead>
                    <TableHead className="w-[100px]">Tanggal</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Payment Term</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead className="w-[110px] text-center">Status</TableHead>
                    {/* Update #043 — kolom Workflow dihapus (PO langsung final). */}
                    <TableHead className="w-[80px] text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <SkeletonRows cols={7} />
                  ) : data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        Tidak ada data pesanan.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-xs font-medium">{d.noPesanan}</TableCell>
                        <TableCell className="text-xs">{formatDate(d.tanggal)}</TableCell>
                        <TableCell className="text-xs">{d.supplierNameSnapshot || d.supplier?.nama || '-'}</TableCell>
                        {/* === Update #061 — kolom Payment Term: tampil dari
                            relasi syaratBayar (nama istilah). Fallback UUID
                            dihapus — nama kini DIJAMIN ikut response karena
                            backend meng-eager-load relasi syarat_bayar; PO
                            tanpa syarat bayar tampil "-". === */}
                        <TableCell className="text-xs">{d.syaratBayar?.nama || '-'}</TableCell>
                        <TableCell className="text-xs">{d.currency || '-'}</TableCell>
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
                                  module: 'purchasing',
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
                                    module: 'purchasing',
                                    subPage: 'pesanan',
                                    formKey: 'pesanan-pembelian-edit',
                                    formProps: { id: d.id }
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
        title="Batalkan Pesanan Pembelian?"
        formLabel="pesanan pembelian"
        submitting={cancelSubmitting}
        onConfirm={(r) => handleCancel(r)}
      />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 2: Penerimaan Barang (List Only)
// ═════════════════════════════════════════════════════════════════════════════

// === Update #066 — diekspor untuk modul Persediaan (menu Penerimaan pindah ke
// sana); daftar di modul Persediaan memuat dropdown-nya sendiri, sementara
// routing lama modul Pembelian (PurchasingListContent) tetap memakai komponen
// ini dengan dropdown bersama modul Pembelian. ===
export function PenerimaanTab({ supplierOptions, barangOptions, satuanOptions, purchaseOrderOptions, refreshKey }: { supplierOptions: SupplierDropdown[]; barangOptions: BarangDropdown[]; satuanOptions: SatuanResponse[]; purchaseOrderOptions: { id: string; noPesanan: string }[]; refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab);

  const [data, setData] = useState<PenerimaanBarangResponse[]>([]);
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
  const [supplierFilter, setSupplierFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ skip: String(skip), limit: String(PAGE_SIZE) });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter && statusFilter !== 'ALL') params.set('status', statusFilter);
      if (supplierFilter) params.set('supplier_id', supplierFilter);
      if (dateFrom) params.set('tanggal_from', dateFrom);
      if (dateTo) params.set('tanggal_to', dateTo);
      const res = await api.get<PaginatedResponse<PenerimaanBarangResponse>>(`/pembelian/penerimaan?${params}`);
      setData(res.data);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [skip, debouncedSearch, statusFilter, supplierFilter, dateFrom, dateTo]);

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
        const res = await api.post<HardDeleteResponse>(`/pembelian/penerimaan/${cancelTarget}/cancel`, {
          reason: reason || undefined
        });
        toast.success(res.message || 'Penerimaan dihapus permanen');
        setCancelTarget(null);
        fetchData();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Gagal menghapus penerimaan');
      } finally {
        setCancelSubmitting(false);
      }
    },
    [cancelTarget, fetchData]
  );

  const [reverseTarget, setReverseTarget] = useState<PenerimaanBarangResponse | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reversing, setReversing] = useState(false);

  const handleReverse = useCallback(async () => {
    if (!reverseTarget) return;
    setReversing(true);
    try {
      const reasonParam = reverseReason.trim() ? `?reason=${encodeURIComponent(reverseReason.trim())}` : '';
      await api.post(`/pembelian/penerimaan/${reverseTarget.id}/reverse${reasonParam}`);
      toast.success(`Penerimaan ${reverseTarget.noForm} berhasil di-reverse`);
      setReverseTarget(null);
      setReverseReason('');
      fetchData();
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : 'Gagal reverse penerimaan';
      // Phase 5 — handle specific error cases with longer duration for actionable errors
      if (msg.includes('sudah ada invoice') || msg.includes('Batalkan/reverse invoice terlebih dahulu')) {
        toast.error('Tidak bisa reverse — sudah ada invoice', {
          description: 'Batalkan/reverse invoice yang memakai receipt ini terlebih dahulu, lalu reverse penerimaan.',
          duration: 8000
        });
      } else if (msg.includes('sudah ada purchase retur') || msg.includes('Batalkan/reverse retur terlebih dahulu')) {
        toast.error('Tidak bisa reverse — sudah ada retur', {
          description: 'Batalkan/reverse purchase retur yang memakai receipt detail ini terlebih dahulu, lalu reverse penerimaan.',
          duration: 8000
        });
      } else if (msg.includes('stok') && msg.includes('tidak mencukupi')) {
        toast.error('Stok tidak mencukupi untuk reverse', { description: msg, duration: 8000 });
      } else {
        toast.error(msg, { duration: 6000 });
      }
    } finally {
      setReversing(false);
    }
  }, [reverseTarget, reverseReason, fetchData]);

  // ── === Update #068 — "Selesaikan" penerimaan DIPROSES (pemulihan). ===
  // Penerimaan tertinggal di Diproses bila finalisasi otomatis saat pembuatan
  // gagal (mis. setting GRNI belum ada, harga perolehan tak unik, periode
  // ditutup). Qty-nya sudah "diterima" (PO-nya disembunyikan dari dropdown)
  // tetapi penerimaan tidak pernah Selesai → PO tidak akan pernah naik
  // status. Tombol ini memfinalisasi ulang lewat endpoint baru
  // POST /penerimaan/{id}/selesaikan (mirror pola LPPB).
  const [finishTarget, setFinishTarget] = useState<PenerimaanBarangResponse | null>(null);
  const [finishing, setFinishing] = useState(false);

  const handleFinish = useCallback(async () => {
    if (!finishTarget) return;
    setFinishing(true);
    try {
      await api.post<PenerimaanBarangResponse>(`/pembelian/penerimaan/${finishTarget.id}/selesaikan`);
      toast.success(`Penerimaan ${finishTarget.noForm} selesai — stok & jurnal diproses`);
      setFinishTarget(null);
      fetchData();
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : e instanceof Error ? e.message : 'Gagal menyelesaikan penerimaan';
      toast.error('Penerimaan belum bisa diselesaikan', { description: msg, duration: 8000 });
    } finally {
      setFinishing(false);
    }
  }, [finishTarget, fetchData]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Daftar Penerimaan Barang</CardTitle>
              <CardDescription>Daftar seluruh penerimaan barang dari supplier</CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() =>
                openFormTab({
                  title: 'Buat Penerimaan Barang',
                  module: 'purchasing',
                  subPage: 'penerimaan',
                  formKey: 'penerimaan-pembelian-create'
                })
              }>
              <Plus className="mr-1.5 h-4 w-4" /> Buat Penerimaan
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground">Cari</Label>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Cari no penerimaan/supplier..." value={search} onChange={(e) => handleSearchChange(e.target.value)} className="pl-8 h-9 text-sm" />
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
              <Label className="text-xs text-muted-foreground">Supplier</Label>
              <div className="mt-1">
                <SearchableDropdown
                  value={supplierFilter}
                  onValueChange={(v) => {
                    setSupplierFilter(v);
                    setSkip(0);
                  }}
                  options={supplierOptions.map((s) => ({ id: s.id, label: s.nama }))}
                  allOption={{ id: '', label: 'Semua Supplier' }}
                />
              </div>
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
                    <TableHead className="w-[140px]">No Penerimaan</TableHead>
                    <TableHead className="w-[100px]">Tanggal</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Alamat</TableHead>
                    <TableHead className="w-[100px] text-center">Jml Item</TableHead>
                    <TableHead className="w-[120px] text-center">Invoice</TableHead>
                    {/* === Update #049 — kolom "Jurnal" DIHAPUS (biar rapi). === */}
                    <TableHead className="w-[110px] text-center">Status</TableHead>
                    {/* Update #043 — kolom Workflow dihapus (penerimaan langsung final). */}
                    <TableHead className="w-[80px] text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <SkeletonRows cols={8} />
                  ) : data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                        Tidak ada data penerimaan.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-xs font-medium">{d.noForm}</TableCell>
                        <TableCell className="text-xs">{formatDate(d.tanggal)}</TableCell>
                        <TableCell className="text-xs">{d.supplier?.nama || '-'}</TableCell>
                        <TableCell className="text-xs">{d.alamat || '-'}</TableCell>
                        <TableCell className="text-center text-xs">{d.details?.length || 0}</TableCell>
                        {/* Tahap 2: kolom Invoice link */}
                        <TableCell className="text-center">
                          {d.purchaseInvoiceId ? (
                            <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50 text-xs gap-1">
                              <Link2 className="h-3 w-3" /> Linked
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-50 text-xs gap-1">
                              <Unlink className="h-3 w-3" /> Belum di-link
                            </Badge>
                          )}
                        </TableCell>
                        {/* === Update #049 — sel kolom "Jurnal" DIHAPUS bersama
                            kolomnya (biar rapi). === */}
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
                                  title: `Cetak ${d.noForm}`,
                                  module: 'purchasing',
                                  subPage: 'penerimaan',
                                  formKey: 'penerimaan-cetak',
                                  formProps: { id: d.id }
                                })
                              }
                              title="Cetak">
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                            {/* === Update #049 — tombol Edit kini tampil juga
                                untuk penerimaan SELESAI: form edit mengunci
                                field berdampak stok/jurnal (PO, supplier,
                                gudang, tanggal) dan hanya membuka link
                                invoice + alamat + keterangan — sehingga pesan
                                "hubungkan manual lewat Edit Penerimaan"
                                benar-benar bisa dijalankan. === */}
                            {d.status !== 'DIBATALKAN' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                onClick={() =>
                                  openFormTab({
                                    title: `Edit ${d.noForm}`,
                                    module: 'purchasing',
                                    subPage: 'penerimaan',
                                    formKey: 'penerimaan-pembelian-edit',
                                    formProps: { id: d.id }
                                  })
                                }
                                title={d.status === 'SELESAI' ? 'Edit — hubungkan invoice / ubah keterangan' : 'Edit'}>
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
                                title="Batalkan penerimaan (kembalikan stok)"
                                aria-label="Batalkan penerimaan">
                                <Undo2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {/* === Update #068 — tombol "Selesaikan" untuk
                                penerimaan yang tertinggal di DIPROSES
                                (finalisasi saat pembuatan gagal): tambah
                                stok + jurnal GRNI + sinkronisasi status PO. === */}
                            {d.status === 'DIPROSES' && (
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-600 hover:text-emerald-700" onClick={() => setFinishTarget(d)} title="Selesaikan penerimaan (tambah stok + jurnal)" disabled={finishing}>
                                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Selesaikan
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

      {/* Reverse confirmation dialog — Phase 5 */}
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
            <AlertDialogTitle>Batalkan Penerimaan {reverseTarget?.noForm}?</AlertDialogTitle>
            <AlertDialogDescription>
              {/* === Update #050 — teks dialog ditulis ulang tanpa istilah
                  teknis (dulu: "Reverse GRNI journal", "layer FIFO/FEFO"). === */}
              Penerimaan ini sudah selesai dan stoknya sudah masuk gudang. Pembatalan akan:
              <br />• Mengembalikan stok persis seperti sebelum penerimaan (pencatatan jurnal otomatis dibalik)
              <br />• Mengubah status penerimaan menjadi Dibatalkan
              <br />
              <br />
              <span className="text-amber-600">Catatan: penerimaan tidak bisa dibatalkan bila sudah dipakai invoice atau retur — batalkan dokumen itu terlebih dahulu.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 px-6">
            <Label htmlFor="reverse-reason-penerimaan">Alasan Pembatalan (opsional)</Label>
            <Textarea id="reverse-reason-penerimaan" placeholder="Contoh: Salah input qty / barang rusak / supplier salah kirim / dll" rows={3} maxLength={200} value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} disabled={reversing} />
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
              Ya, Batalkan Penerimaan
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
        title="Batalkan Penerimaan Barang?"
        formLabel="penerimaan barang"
        submitting={cancelSubmitting}
        onConfirm={(r) => handleCancel(r)}
      />

      {/* === Update #068 — dialog "Selesaikan" penerimaan DIPROSES. === */}
      <AlertDialog
        open={!!finishTarget}
        onOpenChange={(open) => {
          if (!open && !finishing) setFinishTarget(null);
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Selesaikan Penerimaan {finishTarget?.noForm}?</AlertDialogTitle>
            <AlertDialogDescription>
              Penerimaan ini masih berstatus <span className="font-medium">Diproses</span> — finalisasi otomatis saat pembuatannya gagal, sehingga stok belum ditambah dan PO sumbernya tidak bisa naik status. Menyelesaikan sekarang akan:
              <br />• Menambah stok barang ke gudang + mencatat jurnalnya
              <br />• Mengubah status penerimaan menjadi Selesai
              <br />• Menyinkronkan status PO sumber (bila rantainya sudah lengkap)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={finishing}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleFinish();
              }}
              disabled={finishing}
              className="bg-emerald-600 text-white hover:bg-emerald-700 gap-2">
              {finishing && <Loader2 className="h-4 w-4 animate-spin" />}
              Ya, Selesaikan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 3: Invoice Pembelian (List Only)
// ═════════════════════════════════════════════════════════════════════════════

function InvoiceTab({ supplierOptions, barangOptions, purchaseOrderOptions, refreshKey }: { supplierOptions: SupplierDropdown[]; barangOptions: BarangDropdown[]; purchaseOrderOptions: { id: string; noPesanan: string }[]; refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab);

  const [data, setData] = useState<PurchaseInvoiceResponse[]>([]);
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
  const [supplierFilter, setSupplierFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ skip: String(skip), limit: String(PAGE_SIZE) });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter && statusFilter !== 'ALL') params.set('status', statusFilter);
      if (supplierFilter) params.set('supplier_id', supplierFilter);
      if (dateFrom) params.set('tanggal_from', dateFrom);
      if (dateTo) params.set('tanggal_to', dateTo);
      const res = await api.get<PaginatedResponse<PurchaseInvoiceResponse>>(`/pembelian/purchase-invoice?${params}`);
      setData(res.data);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [skip, debouncedSearch, statusFilter, supplierFilter, dateFrom, dateTo]);

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
        const res = await api.post<HardDeleteResponse>(`/pembelian/purchase-invoice/${cancelTarget}/cancel`, {
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
    'hutang',
    data.map((d) => d.id),
    refreshKey
  );

  // === Update #050 — invoice DIBATALKAN tidak dihitung dalam Total Nilai
  // (dulu tetap terjumlah meski sudah dibatalkan — membingungkan). ===
  const summaryTotal = data.filter((d) => d.status !== 'DIBATALKAN').reduce((s, d) => s + Number(d.grandTotal), 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border-orange-200 bg-orange-50/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-orange-600">
              <Receipt className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-orange-600 font-medium">Total Invoice</p>
              {loading ? <Skeleton className="mt-1 h-6 w-16" /> : <p className="text-2xl font-bold text-orange-700">{total}</p>}
            </div>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-orange-600">
              <TrendingDown className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-orange-600 font-medium">Total Nilai (halaman ini)</p>
              {loading ? <Skeleton className="mt-1 h-6 w-28" /> : <p className="text-2xl font-bold text-orange-700">{formatRp(summaryTotal)}</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Daftar Invoice Pembelian</CardTitle>
              <CardDescription>Daftar seluruh invoice pembelian</CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() =>
                openFormTab({
                  title: 'Buat Invoice Pembelian',
                  module: 'purchasing',
                  subPage: 'invoice',
                  formKey: 'invoice-pembelian-create'
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
                <Input placeholder="Cari no invoice/supplier..." value={search} onChange={(e) => handleSearchChange(e.target.value)} className="pl-8 h-9 text-sm" />
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
              <Label className="text-xs text-muted-foreground">Supplier</Label>
              <div className="mt-1">
                <SearchableDropdown
                  value={supplierFilter}
                  onValueChange={(v) => {
                    setSupplierFilter(v);
                    setSkip(0);
                  }}
                  options={supplierOptions.map((s) => ({ id: s.id, label: s.nama }))}
                  allOption={{ id: '', label: 'Semua Supplier' }}
                />
              </div>
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
                    <TableHead className="w-[130px]">No Invoice</TableHead>
                    <TableHead className="w-[130px]">No Faktur</TableHead>
                    <TableHead className="w-[100px]">Tanggal</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>PO Number</TableHead>
                    {/* === Update #049 — kolom "Tipe Invoice" DIHAPUS bersama
                        field-nya di form (label kategori bebas opsional yang
                        tidak memengaruhi apa pun — membingungkan user). === */}
                    <TableHead className="text-right w-[160px]">Total</TableHead>
                    <TableHead className="w-[110px] text-center">Status</TableHead>
                    <TableHead className="w-[110px] text-center">Status Bayar</TableHead>
                    {/* Update #043 — kolom Workflow dihapus (invoice langsung final). */}
                    <TableHead className="w-[80px] text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <SkeletonRows cols={9} />
                  ) : data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                        Tidak ada data invoice.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-xs font-medium">{d.noForm}</TableCell>
                        <TableCell className="font-mono text-xs">{d.noFaktur}</TableCell>
                        <TableCell className="text-xs">{formatDate(d.tanggal)}</TableCell>
                        <TableCell className="text-xs">{d.supplier?.nama || '-'}</TableCell>
                        <TableCell className="text-xs">{d.purchaseOrder?.noPesanan || purchaseOrderOptions.find((po) => po.id === d.purchaseOrderId)?.noPesanan || d.purchaseOrderId || '-'}</TableCell>
                        {/* === Update #049 — sel "Tipe Invoice" DIHAPUS bersama
                            kolomnya (field di form juga dihapus). === */}
                        <TableCell className="text-right font-mono text-xs font-medium">{formatRp(Number(d.grandTotal))}</TableCell>
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
                                  title: `Cetak ${d.noForm}`,
                                  module: 'purchasing',
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
                                    title: `Edit ${d.noForm}`,
                                    module: 'purchasing',
                                    subPage: 'invoice',
                                    formKey: 'invoice-pembelian-edit',
                                    formProps: { id: d.id }
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
        title="Batalkan Invoice Pembelian?"
        formLabel="invoice pembelian"
        submitting={cancelSubmitting}
        onConfirm={(r) => handleCancel(r)}
      />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 4: Retur Pembelian (List Only)
// ═════════════════════════════════════════════════════════════════════════════

function ReturTab({ supplierOptions, barangOptions, purchaseOrderOptions, refreshKey }: { supplierOptions: SupplierDropdown[]; barangOptions: BarangDropdown[]; purchaseOrderOptions: { id: string; noPesanan: string }[]; refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab);

  const [data, setData] = useState<PurchaseReturResponse[]>([]);
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
  const [supplierFilter, setSupplierFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ skip: String(skip), limit: String(PAGE_SIZE) });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter && statusFilter !== 'ALL') params.set('status', statusFilter);
      if (supplierFilter) params.set('supplier_id', supplierFilter);
      if (dateFrom) params.set('tanggal_from', dateFrom);
      if (dateTo) params.set('tanggal_to', dateTo);
      const res = await api.get<PaginatedResponse<PurchaseReturResponse>>(`/pembelian/purchase-retur?${params}`);
      setData(res.data);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [skip, debouncedSearch, statusFilter, supplierFilter, dateFrom, dateTo]);

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
        const res = await api.post<HardDeleteResponse>(`/pembelian/purchase-retur/${cancelTarget}/cancel`, {
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
              <CardTitle className="text-base">Daftar Retur Pembelian</CardTitle>
              <CardDescription>Daftar seluruh retur / pengembalian barang ke supplier</CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() =>
                openFormTab({
                  title: 'Buat Retur Pembelian',
                  module: 'purchasing',
                  subPage: 'retur',
                  formKey: 'retur-pembelian-create'
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
                <Input placeholder="Cari no retur/supplier..." value={search} onChange={(e) => handleSearchChange(e.target.value)} className="pl-8 h-9 text-sm" />
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
              <Label className="text-xs text-muted-foreground">Supplier</Label>
              <div className="mt-1">
                <SearchableDropdown
                  value={supplierFilter}
                  onValueChange={(v) => {
                    setSupplierFilter(v);
                    setSkip(0);
                  }}
                  options={supplierOptions.map((s) => ({ id: s.id, label: s.nama }))}
                  allOption={{ id: '', label: 'Semua Supplier' }}
                />
              </div>
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
                    <TableHead className="w-[130px]">No PO</TableHead>
                    <TableHead className="w-[100px]">Tanggal</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right w-[140px]">Total</TableHead>
                    <TableHead className="w-[110px] text-center">Status</TableHead>
                    {/* Update #043 — kolom Workflow dihapus (retur langsung final). */}
                    <TableHead className="w-[80px] text-center">Aksi</TableHead>
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
                        <TableCell className="font-mono text-xs">{d.purchaseOrder?.noPesanan || '-'}</TableCell>
                        <TableCell className="text-xs">{formatDate(d.tanggal)}</TableCell>
                        <TableCell className="text-xs">{d.supplier?.nama || '-'}</TableCell>
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
                                  module: 'purchasing',
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
                                    module: 'purchasing',
                                    subPage: 'retur',
                                    formKey: 'retur-pembelian-edit',
                                    formProps: { id: d.id }
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
        title="Batalkan Retur Pembelian?"
        formLabel="retur pembelian"
        submitting={cancelSubmitting}
        onConfirm={(r) => handleCancel(r)}
      />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT: Purchasing
// ═════════════════════════════════════════════════════════════════════════════

export default function Purchasing(props: PurchasingPageProps) {
  // PERBAIKAN rules-of-hooks: panggil hook store tanpa syarat (dulu
  // `props.subPage || useERPStore(...)` menyebabkan hook kondisional).
  const activeSubPage = useERPStore((s) => s.activeSubPage);
  const subPage = props.subPage || activeSubPage || 'pesanan';

  // ── Update #01 — Pelunasan Hutang pindah ke modul Kas & Bank ──
  // Routing subPage 'pelunasan-hutang' kini di-handle page.tsx (modul
  // cash-bank); tab lama otomatis di-remap, jadi Purchasing tidak lagi
  // merender halaman pelunasan.

  // ── Form mode: render form in tab ──
  // (Detail ROP tidak punya form mode khusus — hanya daftar + dialog inline.)
  if (props.formMode) {
    const editId = props.formProps?.id as string | undefined;

    // Cetak (PDF preview) routes — work regardless of subPage
    if (props.formMode === 'pesanan-cetak' && editId) {
      return <PesananPembelianCetakTab id={editId} />;
    }
    if (props.formMode === 'penerimaan-cetak' && editId) {
      return <PenerimaanCetakTab id={editId} />;
    }
    if (props.formMode === 'invoice-cetak' && editId) {
      return <InvoicePembelianCetakTab id={editId} />;
    }
    if (props.formMode === 'retur-cetak' && editId) {
      return <ReturPembelianCetakTab id={editId} />;
    }
    // Update ASAHI #005 — cetak LPPB
    if (props.formMode === 'lppb-cetak' && editId) {
      return <LppbCetakTab id={editId} />;
    }

    switch (subPage) {
      case 'pesanan':
        return editId ? <PesananEditForm editId={editId} /> : <PesananCreateForm />;
      case 'penerimaan':
        return editId ? <PenerimaanEditForm editId={editId} /> : <PenerimaanCreateForm initialPurchaseOrderId={props.formProps?.purchaseOrderId as string | undefined} />;
      case 'invoice':
        return editId ? <InvoiceEditForm editId={editId} /> : <InvoiceCreateForm />;
      case 'retur':
        return editId ? <ReturEditForm editId={editId} /> : <ReturCreateForm />;
      // Update ASAHI #005 — form LPPB (create + edit)
      case 'lppb':
        return <LppbForm lppbId={editId} />;
      default:
        return null;
    }
  }

  return <PurchasingListContent subPage={subPage} refreshKey={props.refreshKey} />;
}

function PurchasingListContent({ subPage, refreshKey }: { subPage: string; refreshKey?: number }) {
  // ── Shared dropdown state ──
  const [supplierOptions, setSupplierOptions] = useState<SupplierDropdown[]>([]);
  const [barangOptions, setBarangOptions] = useState<BarangDropdown[]>([]);
  const [satuanOptions, setSatuanOptions] = useState<SatuanResponse[]>([]);
  const [purchaseOrderOptions, setPurchaseOrderOptions] = useState<{ id: string; noPesanan: string }[]>([]);
  const [dropdownsLoading, setDropdownsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setDropdownsLoading(true);
      try {
        const [supplier, barang, satuan, poRes] = await Promise.all([api.get<SupplierDropdown[]>('/master/supplier-dropdown'), api.get<BarangDropdown[]>('/master/barang-dropdown'), api.get<SatuanResponse[]>('/master/satuan'), api.get<PaginatedResponse<PurchaseOrderResponse>>('/pembelian/purchase-order?limit=200')]);
        if (cancelled) return;
        setSupplierOptions(supplier);
        setBarangOptions(barang);
        setSatuanOptions(satuan);
        setPurchaseOrderOptions(poRes.data.map((p) => ({ id: p.id, noPesanan: p.noPesanan })));
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
          {subPage === 'pesanan' && <PesananTab supplierOptions={supplierOptions} barangOptions={barangOptions} refreshKey={refreshKey} />}
          {/* Update #037 — Detail ROP (di atas Pesanan di sidebar): seluruh item
              ROP DIBUAT → centang → pilih supplier → PO DRAFT otomatis. */}
          {subPage === 'detail-rop' && <DetailRopTab supplierOptions={supplierOptions} refreshKey={refreshKey} />}
          {subPage === 'penerimaan' && <PenerimaanTab supplierOptions={supplierOptions} barangOptions={barangOptions} satuanOptions={satuanOptions} purchaseOrderOptions={purchaseOrderOptions} refreshKey={refreshKey} />}
          {subPage === 'invoice' && <InvoiceTab supplierOptions={supplierOptions} barangOptions={barangOptions} purchaseOrderOptions={purchaseOrderOptions} refreshKey={refreshKey} />}
          {subPage === 'retur' && <ReturTab supplierOptions={supplierOptions} barangOptions={barangOptions} purchaseOrderOptions={purchaseOrderOptions} refreshKey={refreshKey} />}
          {/* Update ASAHI #005 — LPPB (self-contained: opsi PO dimuat sendiri) */}
          {subPage === 'lppb' && <LppbTab refreshKey={refreshKey} />}
        </>
      )}
    </div>
  );
}
