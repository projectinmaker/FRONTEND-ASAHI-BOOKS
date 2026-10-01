'use client';

import { InvoiceTypeField } from '@/components/erp/invoice-type-field';
import { invoicePhaseDFields, invoiceSaveMismatches, createPurchaseInvoice, duplicateInvoiceMessage } from '@/lib/invoice-documents';

import { stockLineError, loadReceiptInvoiceOptions, loadPostedInvoiceOptions } from '@/lib/delivery-receipt';
import { StockOperationErrorDialog, useStockOperationError } from '@/components/erp/stock-operation-error-dialog';
import { PurchaseReturnSourceLines, usePurchaseReturnSource, type PurchaseReturnQuantities } from '@/components/erp/purchase-return-source';

import OrderDocumentForm from '@/components/erp/orders/order-document-form';
import { canEditOrder } from '@/lib/order-documents';

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
import { FileText, Package, Receipt, RotateCcw, Plus, Trash2, ShoppingCart, TrendingDown, Search, ChevronLeft, ChevronRight, Loader2, Pencil, Info, Printer, CheckCircle2, Link2, Unlink, Undo2 } from 'lucide-react';
import { formatRp, formatDate, todayStr } from '@/lib/pdf-utils';
import { api, ApiError, PaginatedResponse } from '@/lib/api';
import { toast } from 'sonner';
import { PesananPembelianCetakTab, PenerimaanCetakTab, InvoicePembelianCetakTab, ReturPembelianCetakTab } from '@/components/erp/purchasing/cetak-tabs';
import { PelunasanHutangView } from '@/components/erp/pelunasan';
import { WorkflowStateBadge, WorkflowActionsCell } from '@/components/erp/workflow-components';
import { useWorkflowStates } from '@/lib/use-workflow-states';
import { StatusPembayaranBadge } from '@/components/erp/pelunasan/status-badge';
import { useInvoiceSaldos } from '@/lib/use-invoice-saldos';
import type { PurchaseOrderResponse, PurchaseOrderSisaResponse, PurchaseOrderCreate, PurchaseOrderUpdate, PurchaseOrderDetailCreate, PenerimaanBarangResponse, PenerimaanBarangCreate, PenerimaanBarangUpdate, PenerimaanBarangDetailCreate, PurchaseInvoiceResponse, PurchaseInvoiceCreate, PurchaseInvoiceUpdate, PurchaseInvoiceDetailCreate, PurchaseReturResponse, PurchaseReturCreate, PurchaseReturUpdate, PurchaseReturDetailCreate, SupplierDropdown, BarangDropdown, SatuanResponse, GudangResponse, TransaksiBiayaCreate, HardDeleteResponse } from '@/types/api';
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

interface InvoicePembelianDraftData {
  purchaseOrderId: string;
  invoiceType: string;
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

function DetailTableWithPrice({ rows, setRows, barangOptions, satuanOptions }: { rows: FormDetailRow[]; setRows: Dispatch<SetStateAction<FormDetailRow[]>>; barangOptions: BarangDropdown[]; satuanOptions?: SatuanResponse[] }) {
  const addRow = useCallback(() => setRows((p) => [...p, newDetailRow()]), [setRows]);
  const removeRow = useCallback((id: string) => setRows((p) => p.filter((r) => r.id !== id)), [setRows]);
  const updateRow = useCallback(
    (id: string, field: keyof FormDetailRow, value: string) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          if (field === 'barangId') {
            const found = barangOptions.find((b) => b.id === value);
            return { ...r, barangId: value, ...(satuanOptions ? { satuanId: '' } : {}), kodeBarang: found?.kode || '', barangNama: found?.nama || '', harga: found ? String(found.hargaPokok) : r.harga };
          }
          return { ...r, [field]: value };
        })
      );
    },
    [setRows, barangOptions, satuanOptions]
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
                    <SearchableDropdown value={row.barangId} onValueChange={(v) => updateRow(row.id, 'barangId', v)} options={barangOptions.map((b) => ({ id: b.id, label: b.nama, subtitle: b.kode }))} placeholder="Pilih barang..." compact />
                  </TableCell>
                  {satuanOptions && (
                    <TableCell>
                      <SearchableDropdown value={row.satuanId} onValueChange={(value) => updateRow(row.id, 'satuanId', value)} options={satuanOptions.map((unit) => ({ id: unit.id, label: unit.nama }))} placeholder="Satuan (opsional)" allOption={{ id: '', label: 'Belum ditentukan' }} compact />
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

function DetailTableSimple({ rows, setRows, barangOptions, satuanOptions, metodeValuasiGlobal }: { rows: FormDetailRow[]; setRows: Dispatch<SetStateAction<FormDetailRow[]>>; barangOptions: BarangDropdown[]; satuanOptions: SatuanResponse[]; metodeValuasiGlobal?: string }) {
  const addRow = useCallback(() => setRows((p) => [...p, newDetailRow()]), [setRows]);
  const removeRow = useCallback((id: string) => setRows((p) => p.filter((r) => r.id !== id)), [setRows]);
  const updateRow = useCallback(
    (id: string, field: keyof FormDetailRow, value: string) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          if (field === 'barangId') {
            const found = barangOptions.find((b) => b.id === value);
            // Auto-fill harga perolehan dari harga pokok barang (bila belum terisi).
            // Field tetap dikirim di payload walau input disembunyikan; nanti ditimpa harga PO saat tarik data.
            return { ...r, barangId: value, kodeBarang: found?.kode || '', barangNama: found?.nama || '', hargaPerolehan: !r.hargaPerolehan && found ? String(found.hargaPokok) : r.hargaPerolehan };
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
                  <SearchableDropdown value={row.barangId} onValueChange={(v) => updateRow(row.id, 'barangId', v)} options={barangOptions.map((b) => ({ id: b.id, label: b.nama, subtitle: b.kode }))} placeholder="Pilih barang..." compact />
                </TableCell>
                <TableCell>
                  <Input type="number" className="h-8 text-right text-xs" value={row.qty} min={1} step={1} aria-invalid={!!row.barangId && (!Number.isInteger(Number(row.qty)) || Number(row.qty) < 1)} onChange={(e) => updateRow(row.id, 'qty', e.target.value)} />
                </TableCell>
                <TableCell>
                  <SearchableDropdown value={row.satuanId} onValueChange={(v) => updateRow(row.id, 'satuanId', v)} options={satuanOptions.map((s) => ({ id: s.id, label: s.nama }))} placeholder="Pilih..." compact />
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

  return { supplierOptions, barangOptions, satuanOptions, purchaseOrderOptions, gudangOptions, loading };
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
// ── Tahap 2: hook untuk fetch invoice yang belum di-POST (DRAFT/DIPROSES) dari supplier tertentu ──
function useUnpostedInvoiceOptions(supplierId: string | null, refreshKey?: number) {
  const [state, setState] = useState<{ supplierId: string; attempt: number; options: PurchaseInvoiceResponse[]; error: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!supplierId) return;
    let active = true;
    loadReceiptInvoiceOptions(supplierId)
      .then((options) => {
        if (active) setState({ supplierId, attempt, options, error: '' });
      })
      .catch((error) => {
        if (active) setState({ supplierId, attempt, options: [], error: error instanceof Error ? error.message : 'Gagal memuat invoice' });
      });
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

// FORM: Penerimaan Barang — Create
// ═════════════════════════════════════════════════════════════════════════════

function PenerimaanCreateForm() {
  const { error: stockError, clearError: clearStockError, handleError: handleStockError } = useStockOperationError('penerimaan_barang');
  const { supplierOptions, barangOptions, satuanOptions, purchaseOrderOptions, gudangOptions, loading: dropdownsLoading } = usePurchasingDropdowns();
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [fPurchaseOrderId, setFPurchaseOrderId] = useState('');
  const [fSupplierId, setFSupplierId] = useState('');
  const [fGudangId, setFGudangId] = useState('');
  const [fTanggal, setFTanggal] = useState(todayStr());
  const [fAlamat, setFAlamat] = useState('');
  const [fKeterangan, setFKeterangan] = useState('');
  const [fDetail, setFDetail] = useState<FormDetailRow[]>([newDetailRow()]);
  // Tahap 2: link ke invoice pembelian (opsional)
  const [fPurchaseInvoiceId, setFPurchaseInvoiceId] = useState('');
  const { options: unpostedInvoiceOptions, loading: invoiceOptionsLoading, error: invoiceOptionsError, retry: retryInvoiceOptions } = useUnpostedInvoiceOptions(fSupplierId || null);
  const [poLoading, setPoLoading] = useState(false);

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
    const d = draft.draft;
    if (!d) return;
    setFPurchaseOrderId(d.purchaseOrderId || '');
    setFSupplierId(d.supplierId || '');
    setFGudangId(d.gudangId || '');
    setFTanggal(d.tanggal || todayStr());
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
    setFTanggal(todayStr());
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
        if (sisa.alamat) setFAlamat(sisa.alamat);
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
    [fSupplierId]
  );

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
      <Card className="max-w-5xl">
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">Isi data penerimaan barang baru</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Purchase Order <span className="text-destructive">*</span>
              </Label>
              <SearchableDropdown value={fPurchaseOrderId} onValueChange={handlePurchaseOrderChange} options={purchaseOrderOptions.map((po) => ({ id: po.id, label: po.noPesanan }))} placeholder="Pilih PO..." disabled={poLoading} />
              {poLoading && <p className="text-xs text-muted-foreground mt-1">Memuat sisa PO...</p>}
              {formErrors.purchaseOrderId && <p className="text-xs text-destructive mt-1">{formErrors.purchaseOrderId}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Supplier <span className="text-destructive">*</span>
              </Label>
              <SearchableDropdown
                value={fSupplierId}
                onValueChange={(value) => {
                  setFSupplierId(value);
                  setFPurchaseInvoiceId('');
                }}
                options={supplierOptions.map((s) => ({ id: s.id, label: s.nama }))}
                placeholder="Pilih supplier..."
              />
              {formErrors.supplierId && <p className="text-xs text-destructive mt-1">{formErrors.supplierId}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Tanggal</Label>
              <Input type="date" className="h-9 text-xs" value={fTanggal} onChange={(e) => setFTanggal(e.target.value)} />
              {formErrors.tanggal && <p className="text-xs text-destructive">{formErrors.tanggal}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Gudang <span className="text-destructive">*</span>
              </Label>
              <SearchableDropdown value={fGudangId} onValueChange={setFGudangId} options={gudangOptions.map((g) => ({ id: g.id, label: g.kode + ' - ' + g.nama }))} placeholder="Pilih gudang (wajib)..." />
              {formErrors.gudangId && <p className="text-xs text-destructive">{formErrors.gudangId}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Alamat</Label>
              <Input className="h-9 text-xs" value={fAlamat} onChange={(e) => setFAlamat(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Link ke Invoice Pembelian (opsional)</Label>
              <SearchableDropdown value={fPurchaseInvoiceId} onValueChange={setFPurchaseInvoiceId} options={unpostedInvoiceOptions.map((inv) => ({ id: inv.id, label: inv.noForm, subtitle: inv.noFaktur || inv.tanggal ? `${inv.noFaktur || '-'} \u00b7 ${inv.tanggal ? inv.tanggal.slice(0, 10) : '-'}` : undefined }))} placeholder={fSupplierId ? 'Pilih invoice (opsional — boleh kosong)' : 'Pilih supplier dulu...'} loading={invoiceOptionsLoading} emptyText={fSupplierId ? 'Tidak ada invoice yang belum di-POST untuk supplier ini.' : 'Pilih supplier untuk melihat opsi invoice.'} allOption={{ id: '', label: 'Tanpa invoice — invoice menyusul' }} />
              {invoiceOptionsError && (
                <div role="alert" className="text-xs text-destructive">
                  {invoiceOptionsError}{' '}
                  <Button type="button" variant="outline" size="sm" onClick={retryInvoiceOptions}>
                    Coba Lagi
                  </Button>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground leading-relaxed" title="Invoice boleh kosong, datang kemudian">
                Invoice boleh kosong, datang kemudian. Jika sudah tersedia, pilih invoice supplier yang belum diposting.
              </p>
            </div>
          </div>
          <Separator />
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              Detail Barang <span className="text-destructive">*</span>
            </Label>
            <DetailTableSimple rows={fDetail} setRows={setFDetail} barangOptions={barangOptions} satuanOptions={satuanOptions} metodeValuasiGlobal={metodeValuasiGlobal} />
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
              {submitting ? 'Menyimpan...' : 'Simpan Penerimaan'}
            </Button>
          </div>
        </CardContent>
      </Card>
      <StockOperationErrorDialog error={stockError} onClose={clearStockError} />
    </FormTabShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FORM: Penerimaan Barang — Edit
// ═════════════════════════════════════════════════════════════════════════════

function PenerimaanEditForm({ editId }: { editId: string }) {
  const { error: stockError, clearError: clearStockError, handleError: handleStockError } = useStockOperationError('penerimaan_barang');
  const { supplierOptions, purchaseOrderOptions, gudangOptions, loading: dropdownsLoading } = usePurchasingDropdowns();
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
  // Tahap 2: link invoice + status jurnal
  const [editPurchaseInvoiceId, setEditPurchaseInvoiceId] = useState('');
  const [editJurnalUmumId, setEditJurnalUmumId] = useState<string | null>(null);
  const { options: unpostedInvoiceOptions, loading: invoiceOptionsLoading, error: invoiceOptionsError, retry: retryInvoiceOptions } = useUnpostedInvoiceOptions(editSupplierId || null);

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
        setEditJurnalUmumId(pb.jurnalUmumId || null);
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
    if (!editSupplierId) {
      toast.error('Supplier wajib diisi');
      return;
    }
    if (!editGudangId || !editTanggal || !editPurchaseOrderId || recordError) {
      toast.error(recordError || 'Tanggal, Purchase Order, dan gudang wajib diisi');
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
      await api.put<PenerimaanBarangResponse>(`/pembelian/penerimaan/${editId}`, body);
      toast.success('Penerimaan barang berhasil diperbarui');
      refreshListTab('purchasing', 'penerimaan');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      handleStockError(err, 'Gagal memperbarui penerimaan');
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
      <Card className="max-w-5xl">
        <CardContent className="p-6 space-y-4">
          {recordError && (
            <p role="alert" className="text-sm text-destructive">
              {recordError}
            </p>
          )}
          <p className="text-sm text-muted-foreground">Perbarui data header penerimaan (detail barang tidak dapat diubah)</p>
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
            {/* Tahap 2: badge status jurnal penerimaan */}
            {editJurnalUmumId ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Jurnal:</span>
                <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50 text-xs gap-1">
                  <CheckCircle2 className="h-3 w-3" /> {editJurnalUmumId.slice(0, 8)}…
                </Badge>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Jurnal:</span>
                <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-50 text-xs">
                  Belum dipost
                </Badge>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Purchase Order <span className="text-destructive">*</span>
              </Label>
              <SearchableDropdown value={editPurchaseOrderId} onValueChange={setEditPurchaseOrderId} options={purchaseOrderOptions.map((po) => ({ id: po.id, label: po.noPesanan }))} placeholder="Pilih PO (wajib)..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Supplier <span className="text-destructive">*</span>
              </Label>
              <SearchableDropdown
                value={editSupplierId}
                onValueChange={(value) => {
                  setEditSupplierId(value);
                  setEditPurchaseInvoiceId('');
                }}
                options={supplierOptions.map((s) => ({ id: s.id, label: s.nama }))}
                placeholder="Pilih supplier..."
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Tanggal</Label>
              <Input type="date" className="h-9 text-xs" value={editTanggal} onChange={(e) => setEditTanggal(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Gudang <span className="text-destructive">*</span>
              </Label>
              <SearchableDropdown value={editGudangId} onValueChange={setEditGudangId} options={gudangOptions.map((g) => ({ id: g.id, label: g.kode + ' - ' + g.nama }))} placeholder="Pilih gudang (wajib)..." />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Alamat</Label>
              <Input className="h-9 text-xs" value={editAlamat} onChange={(e) => setEditAlamat(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Link ke Invoice Pembelian (opsional)</Label>
              <SearchableDropdown value={editPurchaseInvoiceId} onValueChange={setEditPurchaseInvoiceId} options={[...(editPurchaseInvoiceId && !unpostedInvoiceOptions.some((inv) => inv.id === editPurchaseInvoiceId) ? [{ id: editPurchaseInvoiceId, label: `Invoice tertaut: ${editPurchaseInvoiceId}`, subtitle: 'Tidak ada dalam pilihan invoice saat ini; boleh dikosongkan.' }] : []), ...unpostedInvoiceOptions.map((inv) => ({ id: inv.id, label: inv.noForm, subtitle: inv.noFaktur || inv.tanggal ? `${inv.noFaktur || '-'} \u00b7 ${inv.tanggal ? inv.tanggal.slice(0, 10) : '-'}` : undefined }))]} placeholder={editSupplierId ? 'Pilih invoice (opsional — boleh kosong)' : 'Pilih supplier dulu...'} loading={invoiceOptionsLoading} emptyText={editSupplierId ? 'Tidak ada invoice yang belum di-POST untuk supplier ini.' : 'Pilih supplier untuk melihat opsi invoice.'} allOption={{ id: '', label: 'Tanpa invoice — invoice menyusul' }} />
              {invoiceOptionsError && (
                <div role="alert" className="text-xs text-destructive">
                  {invoiceOptionsError}{' '}
                  <Button type="button" variant="outline" size="sm" onClick={retryInvoiceOptions}>
                    Coba Lagi
                  </Button>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground leading-relaxed" title="Invoice boleh kosong, datang kemudian">
                Invoice boleh kosong, datang kemudian. Jika sudah tersedia, pilih invoice supplier yang belum diposting.
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
    </FormTabShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FORM: Invoice Pembelian — Create
// ═════════════════════════════════════════════════════════════════════════════

function InvoiceCreateForm() {
  const [fPurchaseOrderId, setFPurchaseOrderId] = useState('');
  const [fInvoiceType, setFInvoiceType] = useState('');
  const [saveWarning, setSaveWarning] = useState('');
  const [savedInvoice, setSavedInvoice] = useState<PurchaseInvoiceResponse | null>(null);
  const { supplierOptions, barangOptions, satuanOptions, purchaseOrderOptions, loading: dropdownsLoading } = usePurchasingDropdowns();
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [fSupplierId, setFSupplierId] = useState('');
  const [fTanggal, setFTanggal] = useState(todayStr());
  const [fNoFaktur, setFNoFaktur] = useState('');
  const [fAlamat, setFAlamat] = useState('');
  const [fDiskonGlobal, setFDiskonGlobal] = useState('0');
  const [fPpn, setFPpn] = useState('11');
  const [fKeterangan, setFKeterangan] = useState('');
  const [fDetail, setFDetail] = useState<FormDetailRow[]>([newDetailRow()]);
  const [fBiayaTambahan, setFBiayaTambahan] = useState<FormBiayaRow[]>([]);
  const [poLoading, setPoLoading] = useState(false);
  // === Update #4 (Q2): snapshot sisa PO terpilih — info barang belum diterima ===
  const [poSisaInfo, setPoSisaInfo] = useState<PurchaseOrderSisaResponse | null>(null);

  // ── Draft otomatis (form create; dipulihkan saat kembali ke form ini) ──
  const userId = useAuthStore((s) => s.user?.id ?? 'anon');
  const draft = useFormDraft<InvoicePembelianDraftData>(draftKey(userId, 'purchasing', 'purchase-invoice', 'create'));
  const skipNextSaveRef = useRef(false);
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const d = draft.draft;
    if (!d) return;
    setFPurchaseOrderId(d.purchaseOrderId || '');
    setFInvoiceType(d.invoiceType || '');
    setFSupplierId(d.supplierId || '');
    setFTanggal(d.tanggal || todayStr());
    setFNoFaktur(d.noFaktur || '');
    setFAlamat(d.alamat || '');
    setFDiskonGlobal(d.diskonGlobal ?? '0');
    setFPpn(d.ppn ?? '11');
    setFKeterangan(d.keterangan || '');
    setFDetail(Array.isArray(d.detail) && d.detail.length ? d.detail : [newDetailRow()]);
    setFBiayaTambahan(Array.isArray(d.biayaTambahan) ? d.biayaTambahan : []);
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
        invoiceType: fInvoiceType,
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
  }, [fPurchaseOrderId, fInvoiceType, fSupplierId, fTanggal, fNoFaktur, fAlamat, fDiskonGlobal, fPpn, fKeterangan, fDetail, fBiayaTambahan]);

  const handleDiscardDraft = useCallback(() => {
    skipNextSaveRef.current = true;
    draft.clearDraft();
    setFPurchaseOrderId('');
    setFInvoiceType('');
    setFSupplierId('');
    setFTanggal(todayStr());
    setFNoFaktur('');
    setFAlamat('');
    setFDiskonGlobal('0');
    setFPpn('11');
    setFKeterangan('');
    setFDetail([newDetailRow()]);
    setFBiayaTambahan([]);
    setPoSisaInfo(null);
    setFormErrors({});
  }, []);

  // === Tarik data otomatis PO → Invoice Pembelian (Task 16-c2): saat PO
  // dipilih, ambil SISA qty per baris (endpoint /sisa), auto-set supplier,
  // dan prefill hanya baris yang masih ada sisaFaktur (harga/diskon/satuan
  // mengikuti line PO). Baris ter-link mengirim purchaseOrderDetailId sehingga
  // komputasi sisa faktur per PO line di backend tetap akurat.
  // Pilihan "Tanpa PO" (kosong) TIDAK menghapus baris — user tetap bisa manual.
  // Update #4 (Q2): response /sisa juga disimpan ke poSisaInfo untuk panel info
  // status penerimaan (read-only, tidak mengubah prefill baris sama sekali).
  const handlePurchaseOrderChange = useCallback(async (poId: string) => {
    setFPurchaseOrderId(poId);
    if (!poId) {
      setPoSisaInfo(null);
      return;
    }
    setPoLoading(true);
    try {
      const sisa = await api.get<PurchaseOrderSisaResponse>(`/pembelian/purchase-order/${poId}/sisa`);
      setPoSisaInfo(sisa);
      if (sisa.supplierId) setFSupplierId(sisa.supplierId);
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
    } finally {
      setPoLoading(false);
    }
  }, []);

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
        ...invoicePhaseDFields(fPurchaseOrderId, fInvoiceType),
        autoPostJurnal: false,
        tanggal: fTanggal,
        supplierId: fSupplierId,
        noFaktur: fNoFaktur,
        alamat: fAlamat || null,
        diskonGlobal: parseFloat(fDiskonGlobal) || null,
        ppn: parseFloat(fPpn) || 0,
        keterangan: fKeterangan || null,
        details,
        biayaTambahan: biaya.length > 0 ? biaya : undefined
      };
      const result = await createPurchaseInvoice(body, (saved) => {
        setSavedInvoice(saved);
        refreshListTab('purchasing', 'invoice');
      });
      draft.clearDraft();
      if (result.mismatches.length) {
        setSaveWarning('Invoice ' + result.saved.noForm + ' sudah dibuat, tetapi backend belum menyimpan: ' + result.mismatches.join(', ') + '. Buka invoice tersebut dari daftar untuk meninjau. Jangan membuat ulang.');
        return;
      }
      toast.success('Invoice pembelian berhasil dibuat');
      refreshListTab('purchasing', 'invoice');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      const duplicate = duplicateInvoiceMessage(err);
      if (duplicate) setFormErrors((prev) => ({ ...prev, noFaktur: duplicate }));
      toast.error(err instanceof ApiError ? err.detail : 'Gagal menyimpan invoice');
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
      <Card className="max-w-5xl">
        <CardContent className="p-6 space-y-4">
          {saveWarning && (
            <p role="alert" className="text-sm text-destructive">
              {saveWarning}
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Purchase Order (opsional)</Label>
              <SearchableDropdown value={fPurchaseOrderId} onValueChange={handlePurchaseOrderChange} options={[...(fPurchaseOrderId && !purchaseOrderOptions.some((po) => po.id === fPurchaseOrderId) ? [{ id: fPurchaseOrderId, label: savedInvoice?.purchaseOrder?.noPesanan || fPurchaseOrderId }] : []), ...purchaseOrderOptions.map((po) => ({ id: po.id, label: po.noPesanan }))]} placeholder="Pilih PO (opsional)" allOption={{ id: '', label: 'Tanpa PO' }} disabled={poLoading} />
              {poLoading && <p className="text-xs text-muted-foreground mt-1">Memuat sisa PO...</p>}
            </div>
            <InvoiceTypeField value={fInvoiceType} onChange={setFInvoiceType} />
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
          <p className="text-sm text-muted-foreground">Isi data invoice pembelian baru</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Supplier <span className="text-destructive">*</span>
              </Label>
              <SearchableDropdown value={fSupplierId} onValueChange={setFSupplierId} options={supplierOptions.map((s) => ({ id: s.id, label: s.nama }))} placeholder="Pilih supplier..." />
              {formErrors.supplierId && <p className="text-xs text-destructive mt-1">{formErrors.supplierId}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Tanggal <span className="text-destructive">*</span>
              </Label>
              <Input type="date" className="h-9 text-xs" value={fTanggal} onChange={(e) => setFTanggal(e.target.value)} />
              {formErrors.tanggal && <p className="text-xs text-destructive mt-1">{formErrors.tanggal}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                No Faktur <span className="text-destructive">*</span>
              </Label>
              <Input className="h-9 text-xs" value={fNoFaktur} onChange={(e) => setFNoFaktur(e.target.value)} placeholder="Nomor faktur dari supplier..." />
              {formErrors.noFaktur && <p className="text-xs text-destructive mt-1">{formErrors.noFaktur}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Alamat</Label>
              <Input className="h-9 text-xs" value={fAlamat} onChange={(e) => setFAlamat(e.target.value)} />
            </div>
          </div>
          <Separator />
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              Detail Barang <span className="text-destructive">*</span>
            </Label>
            <DetailTableWithPrice rows={fDetail} setRows={setFDetail} barangOptions={barangOptions} satuanOptions={satuanOptions} />
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
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">PPN (%)</Label>
              <Input type="number" className="h-9 text-xs" value={fPpn} min={0} max={100} onChange={(e) => setFPpn(e.target.value)} />
            </div>
          </div>
          <TotalsBreakdown subtotal={formSubtotal} diskonGlobalPct={parseFloat(fDiskonGlobal) || 0} ppnPct={parseFloat(fPpn) || 0} totalBiayaTambahan={formTotalBiaya} />
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
              {submitting ? 'Menyimpan...' : 'Simpan Invoice'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </FormTabShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FORM: Invoice Pembelian — Edit
// ═════════════════════════════════════════════════════════════════════════════

function InvoiceEditForm({ editId }: { editId: string }) {
  const [editPurchaseOrderId, setEditPurchaseOrderId] = useState('');
  const [editInvoiceType, setEditInvoiceType] = useState('');
  const [saveWarning, setSaveWarning] = useState('');
  const [savedInvoice, setSavedInvoice] = useState<PurchaseInvoiceResponse | null>(null);
  const { supplierOptions, purchaseOrderOptions, loading: dropdownsLoading } = usePurchasingDropdowns();
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

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
        setEditPpn(String(inv.ppn ?? 0));
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

  const handleEditSubmit = async () => {
    if (!savedInvoice) return;
    if (!editNoFaktur.trim()) {
      setSaveWarning('No Faktur wajib diisi');
      return;
    }
    if (!editSupplierId) {
      toast.error('Supplier wajib diisi');
      return;
    }
    if (!editTanggal) {
      toast.error('Tanggal wajib diisi');
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
        keterangan: editKeterangan || null
      };
      const saved = await api.put<PurchaseInvoiceResponse>(`/pembelian/purchase-invoice/${editId}`, body);
      setSavedInvoice(saved);
      refreshListTab('purchasing', 'invoice');
      const mismatches = invoiceSaveMismatches(body, saved);
      if (mismatches.length) {
        setSaveWarning('Backend belum menyimpan: ' + mismatches.join(', ') + '. Data form dipertahankan.');
        return;
      }
      toast.success('Invoice pembelian berhasil diperbarui');
      refreshListTab('purchasing', 'invoice');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      setSaveWarning(err instanceof Error ? err.message : 'Gagal memperbarui invoice');
      toast.error(err instanceof ApiError ? err.detail : 'Gagal memperbarui invoice');
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
      <Card className="max-w-5xl">
        <CardContent className="p-6 space-y-4">
          {saveWarning && (
            <p role="alert" className="text-sm text-destructive">
              {saveWarning}
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Purchase Order (opsional)</Label>
              <SearchableDropdown value={editPurchaseOrderId} onValueChange={setEditPurchaseOrderId} options={[...(editPurchaseOrderId && !purchaseOrderOptions.some((po) => po.id === editPurchaseOrderId) ? [{ id: editPurchaseOrderId, label: savedInvoice?.purchaseOrder?.noPesanan || editPurchaseOrderId }] : []), ...purchaseOrderOptions.map((po) => ({ id: po.id, label: po.noPesanan }))]} placeholder="Pilih PO (opsional)" allOption={{ id: '', label: 'Tanpa PO' }} />
            </div>
            <InvoiceTypeField value={editInvoiceType} onChange={setEditInvoiceType} />
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Supplier <span className="text-destructive">*</span>
              </Label>
              <SearchableDropdown value={editSupplierId} onValueChange={setEditSupplierId} options={supplierOptions.map((s) => ({ id: s.id, label: s.nama }))} placeholder="Pilih supplier..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Tanggal <span className="text-destructive">*</span>
              </Label>
              <Input type="date" className="h-9 text-xs" value={editTanggal} onChange={(e) => setEditTanggal(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">No Faktur</Label>
              <Input className="h-9 text-xs" value={editNoFaktur} onChange={(e) => setEditNoFaktur(e.target.value)} placeholder="Nomor faktur dari supplier..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Alamat</Label>
              <Input className="h-9 text-xs" value={editAlamat} onChange={(e) => setEditAlamat(e.target.value)} />
            </div>
          </div>
          <Separator />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Diskon Global %</Label>
              <Input type="number" className="h-9 text-xs" value={editDiskonGlobal} min={0} max={100} onChange={(e) => setEditDiskonGlobal(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">PPN (%)</Label>
              <Input type="number" className="h-9 text-xs" value={editPpn} min={0} max={100} onChange={(e) => setEditPpn(e.target.value)} />
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
    </FormTabShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FORM: Retur Pembelian — Create
// ═════════════════════════════════════════════════════════════════════════════

function ReturCreateForm() {
  const { error: returnError, clearError: clearReturnError, handleError: handleReturnError } = useStockOperationError('purchase_retur');
  const { supplierOptions, purchaseOrderOptions, gudangOptions, loading: dropdownsLoading } = usePurchasingDropdowns();
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [fPurchaseOrderId, setFPurchaseOrderId] = useState('');
  const [fSupplierId, setFSupplierId] = useState('');
  const [fGudangId, setFGudangId] = useState('');
  const [fTanggal, setFTanggal] = useState(todayStr());
  const [fAlamat, setFAlamat] = useState('');
  const [fPpn, setFPpn] = useState('11');
  const [fKeterangan, setFKeterangan] = useState('');
  // Link ke invoice pembelian — backend menolak POSTING retur tanpa purchaseInvoiceId
  // ("Pilih purchaseInvoiceId sebelum posting retur pembelian..."). Boleh kosong saat draft.
  const [fPurchaseInvoiceId, setFPurchaseInvoiceId] = useState('');
  // === Tarik data otomatis Invoice → Retur (Task 16-c2): detail retur ditarik
  // dari baris invoice sumber (pola source-table, mirror retur penjualan).
  const [quantities, setQuantities] = useState<PurchaseReturnQuantities>({});
  const source = usePurchaseReturnSource(fPurchaseInvoiceId);
  const { options: postedInvoiceOptions, loading: postedInvoiceLoading, error: postedInvoiceError, retry: retryPostedInvoices } = usePostedInvoiceOptions(fSupplierId || null);

  // Saat invoice sumber termuat: auto-set PO (bila invoice ter-link PO) dan
  // supplier dari invoice. PO tetap bisa diganti manual setelahnya (tidak dipaksa).
  const appliedSourceRef = useRef('');
  useEffect(() => {
    const invoice = source.invoice;
    if (!invoice || appliedSourceRef.current === invoice.id) return;
    appliedSourceRef.current = invoice.id;
    if (invoice.purchaseOrderId) setFPurchaseOrderId(invoice.purchaseOrderId);
    if (invoice.supplierId) setFSupplierId(invoice.supplierId);
  }, [source.invoice]);

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
    setFTanggal(d.tanggal || todayStr());
    setFAlamat(d.alamat || '');
    setFPpn(d.ppn ?? '11');
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
    setFTanggal(todayStr());
    setFAlamat('');
    setFPpn('11');
    setFKeterangan('');
    setFPurchaseInvoiceId('');
    setQuantities({});
    appliedSourceRef.current = '';
    setFormErrors({});
  }, []);

  const handleSubmit = async () => {
    const errs: Record<string, string> = {};
    if (!fPurchaseOrderId) errs.purchaseOrderId = 'Purchase Order wajib diisi';
    if (!fSupplierId) errs.supplierId = 'Supplier wajib diisi';
    if (!fPurchaseInvoiceId) errs.purchaseInvoiceId = 'Pilih invoice sumber agar baris retur bisa ditarik otomatis';
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
      <Card className="max-w-5xl">
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">Isi data retur / pengembalian barang ke supplier</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Purchase Order <span className="text-destructive">*</span>
              </Label>
              <SearchableDropdown value={fPurchaseOrderId} onValueChange={setFPurchaseOrderId} options={purchaseOrderOptions.map((po) => ({ id: po.id, label: po.noPesanan }))} placeholder="Pilih PO..." />
              <p className="text-[11px] text-muted-foreground leading-relaxed">Otomatis terisi dari invoice sumber; boleh diganti manual bila perlu.</p>
              {formErrors.purchaseOrderId && <p className="text-xs text-destructive mt-1">{formErrors.purchaseOrderId}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Supplier <span className="text-destructive">*</span>
              </Label>
              <SearchableDropdown
                value={fSupplierId}
                onValueChange={(value) => {
                  setFSupplierId(value);
                  setFPurchaseInvoiceId('');
                  setQuantities({});
                }}
                options={supplierOptions.map((s) => ({ id: s.id, label: s.nama }))}
                placeholder="Pilih supplier..."
              />
              {formErrors.supplierId && <p className="text-xs text-destructive mt-1">{formErrors.supplierId}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Tanggal</Label>
              <Input type="date" className="h-9 text-xs" value={fTanggal} onChange={(e) => setFTanggal(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Gudang</Label>
              <SearchableDropdown value={fGudangId} onValueChange={setFGudangId} options={gudangOptions.map((g) => ({ id: g.id, label: g.kode + ' - ' + g.nama }))} placeholder="Pilih gudang (opsional)..." />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Alamat</Label>
              <Input className="h-9 text-xs" value={fAlamat} onChange={(e) => setFAlamat(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">PPN (%)</Label>
              <Input type="number" className="h-9 text-xs" value={fPpn} min={0} max={100} onChange={(e) => setFPpn(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
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
              {submitting ? 'Menyimpan...' : 'Simpan Retur'}
            </Button>
          </div>
        </CardContent>
      </Card>
      <StockOperationErrorDialog error={returnError} onClose={clearReturnError} />
    </FormTabShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FORM: Retur Pembelian — Edit
// ═════════════════════════════════════════════════════════════════════════════

function ReturEditForm({ editId }: { editId: string }) {
  const { error: returnError, clearError: clearReturnError, handleError: handleReturnError } = useStockOperationError('purchase_retur');
  const { supplierOptions, purchaseOrderOptions, gudangOptions, loading: dropdownsLoading } = usePurchasingDropdowns();
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
        setEditPpn(String(ret.ppn ?? 0));
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
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Supplier <span className="text-destructive">*</span>
              </Label>
              <SearchableDropdown
                value={editSupplierId}
                onValueChange={(value) => {
                  setEditSupplierId(value);
                  setEditPurchaseInvoiceId('');
                }}
                options={supplierOptions.map((s) => ({ id: s.id, label: s.nama }))}
                placeholder="Pilih supplier..."
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Tanggal</Label>
              <Input type="date" className="h-9 text-xs" value={editTanggal} onChange={(e) => setEditTanggal(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Gudang</Label>
              <SearchableDropdown value={editGudangId} onValueChange={setEditGudangId} options={gudangOptions.map((g) => ({ id: g.id, label: g.kode + ' - ' + g.nama }))} placeholder="Pilih gudang (opsional)..." />
            </div>
          </div>
          <Separator />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Alamat</Label>
              <Input className="h-9 text-xs" value={editAlamat} onChange={(e) => setEditAlamat(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">PPN (%)</Label>
              <Input type="number" className="h-9 text-xs" value={editPpn} min={0} max={100} onChange={(e) => setEditPpn(e.target.value)} />
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

  const wfStates = useWorkflowStates(
    'purchase_order',
    data.map((d) => d.id),
    refreshKey
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
                    <TableHead className="w-[140px] text-center">Workflow</TableHead>
                    <TableHead className="w-[80px] text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <SkeletonRows cols={8} />
                  ) : data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                        Tidak ada data pesanan.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-xs font-medium">{d.noPesanan}</TableCell>
                        <TableCell className="text-xs">{formatDate(d.tanggal)}</TableCell>
                        <TableCell className="text-xs">{d.supplierNameSnapshot || d.supplier?.nama || '-'}</TableCell>
                        <TableCell className="text-xs">{d.syaratBayar?.nama || d.syaratBayarId || '-'}</TableCell>
                        <TableCell className="text-xs">{d.currency || '-'}</TableCell>
                        <TableCell className="text-center">
                          <StatusBadge status={d.status} />
                        </TableCell>
                        <TableCell className="text-center">
                          {(() => {
                            const w = wfStates.states[d.id];
                            if (!w) return <span className="text-xs text-muted-foreground">—</span>;
                            return (
                              <div className="flex flex-col items-center gap-1">
                                <WorkflowStateBadge state={w.state} />
                                <WorkflowActionsCell
                                  documentType={w.documentType}
                                  documentId={w.documentId}
                                  version={w.version}
                                  availableActions={w.availableActions}
                                  onDone={() => {
                                    fetchData();
                                    wfStates.refresh();
                                  }}
                                />
                              </div>
                            );
                          })()}
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

function PenerimaanTab({ supplierOptions, barangOptions, satuanOptions, purchaseOrderOptions, refreshKey }: { supplierOptions: SupplierDropdown[]; barangOptions: BarangDropdown[]; satuanOptions: SatuanResponse[]; purchaseOrderOptions: { id: string; noPesanan: string }[]; refreshKey?: number }) {
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

  const wfStates = useWorkflowStates(
    'penerimaan_barang',
    data.map((d) => d.id),
    refreshKey
  );

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
                    <TableHead className="w-[120px] text-center">Jurnal</TableHead>
                    <TableHead className="w-[110px] text-center">Status</TableHead>
                    <TableHead className="w-[140px] text-center">Workflow</TableHead>
                    <TableHead className="w-[80px] text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <SkeletonRows cols={10} />
                  ) : data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
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
                        {/* Tahap 2: kolom Jurnal status */}
                        <TableCell className="text-center">
                          {d.jurnalUmumId ? (
                            <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50 text-xs gap-1" title={d.jurnalUmumId}>
                              <CheckCircle2 className="h-3 w-3" /> Posted
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-50 text-xs">
                              —
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusBadge status={d.status} />
                        </TableCell>
                        <TableCell className="text-center">
                          {(() => {
                            const w = wfStates.states[d.id];
                            if (!w) return <span className="text-xs text-muted-foreground">—</span>;
                            return (
                              <div className="flex flex-col items-center gap-1">
                                <WorkflowStateBadge state={w.state} />
                                <WorkflowActionsCell
                                  documentType={w.documentType}
                                  documentId={w.documentId}
                                  version={w.version}
                                  availableActions={w.availableActions}
                                  onDone={() => {
                                    fetchData();
                                    wfStates.refresh();
                                  }}
                                />
                              </div>
                            );
                          })()}
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
                            {(d.status === 'DRAFT' || d.status === 'DIPROSES') && (
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
                                title="Reverse penerimaan (kurangi stok & reverse GRNI journal)"
                                aria-label="Reverse penerimaan">
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
            <AlertDialogTitle>Reverse Penerimaan {reverseTarget?.noForm}?</AlertDialogTitle>
            <AlertDialogDescription>
              Penerimaan ini sudah finish (status: SELESAI). Reverse akan:
              <br />• Reverse GRNI journal (pembalik dari saat finish)
              <br />• Hapus layer FIFO/FEFO di gudang (stok dikurangi)
              <br />• Mengubah status penerimaan menjadi DIBATALKAN
              <br />
              <br />
              <span className="text-amber-600">Catatan: Tidak bisa reverse kalau sudah ada invoice/retur yang memakai receipt ini. Batalkan/reverse invoice/retur terlebih dahulu.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 px-6">
            <Label htmlFor="reverse-reason-penerimaan">Alasan Reversal (opsional)</Label>
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
              Ya, Reverse Penerimaan
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

  const wfStates = useWorkflowStates(
    'purchase_invoice',
    data.map((d) => d.id),
    refreshKey
  );
  const saldoStates = useInvoiceSaldos(
    'hutang',
    data.map((d) => d.id),
    refreshKey
  );

  const summaryTotal = data.reduce((s, d) => s + Number(d.grandTotal), 0);

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
                    <TableHead>Tipe Invoice</TableHead>
                    <TableHead className="text-right w-[160px]">Total</TableHead>
                    <TableHead className="w-[110px] text-center">Status</TableHead>
                    <TableHead className="w-[110px] text-center">Status Bayar</TableHead>
                    <TableHead className="w-[140px] text-center">Workflow</TableHead>
                    <TableHead className="w-[80px] text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <SkeletonRows cols={11} />
                  ) : data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="h-24 text-center text-muted-foreground">
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
                        <TableCell className="text-xs">{d.invoiceType || '-'}</TableCell>
                        <TableCell className="text-right font-mono text-xs font-medium">{formatRp(Number(d.grandTotal))}</TableCell>
                        <TableCell className="text-center">
                          <StatusBadge status={d.status} />
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusPembayaranBadge status={saldoStates.saldos[d.id]?.statusPembayaran} />
                        </TableCell>
                        <TableCell className="text-center">
                          {(() => {
                            const w = wfStates.states[d.id];
                            if (!w) return <span className="text-xs text-muted-foreground">—</span>;
                            return (
                              <div className="flex flex-col items-center gap-1">
                                <WorkflowStateBadge state={w.state} />
                                <WorkflowActionsCell documentType={w.documentType} documentId={w.documentId} version={w.version} availableActions={w.availableActions} onDone={wfStates.refresh} />
                              </div>
                            );
                          })()}
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

  const wfStates = useWorkflowStates(
    'purchase_retur',
    data.map((d) => d.id),
    refreshKey
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
                    <TableHead className="w-[140px] text-center">Workflow</TableHead>
                    <TableHead className="w-[80px] text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <SkeletonRows cols={8} />
                  ) : data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
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
                          {(() => {
                            const w = wfStates.states[d.id];
                            if (!w) return <span className="text-xs text-muted-foreground">—</span>;
                            return (
                              <div className="flex flex-col items-center gap-1">
                                <WorkflowStateBadge state={w.state} />
                                <WorkflowActionsCell documentType={w.documentType} documentId={w.documentId} version={w.version} availableActions={w.availableActions} onDone={wfStates.refresh} />
                              </div>
                            );
                          })()}
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

  // ── Pelunasan Hutang: dipindahkan dari modul Pelunasan mandiri ──
  // Dirutekan SEBELUM PurchasingListContent agar dropdown PO/barang tidak dimuat
  // (pelunasan memuat referensinya sendiri: supplier + kas/bank + tagihan).
  if (!props.formMode && subPage === 'pelunasan-hutang') {
    return <PelunasanHutangView refreshKey={props.refreshKey} />;
  }

  // ── Form mode: render form in tab ──
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

    switch (subPage) {
      case 'pesanan':
        return editId ? <PesananEditForm editId={editId} /> : <PesananCreateForm />;
      case 'penerimaan':
        return editId ? <PenerimaanEditForm editId={editId} /> : <PenerimaanCreateForm />;
      case 'invoice':
        return editId ? <InvoiceEditForm editId={editId} /> : <InvoiceCreateForm />;
      case 'retur':
        return editId ? <ReturEditForm editId={editId} /> : <ReturCreateForm />;
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
          {subPage === 'penerimaan' && <PenerimaanTab supplierOptions={supplierOptions} barangOptions={barangOptions} satuanOptions={satuanOptions} purchaseOrderOptions={purchaseOrderOptions} refreshKey={refreshKey} />}
          {subPage === 'invoice' && <InvoiceTab supplierOptions={supplierOptions} barangOptions={barangOptions} purchaseOrderOptions={purchaseOrderOptions} refreshKey={refreshKey} />}
          {subPage === 'retur' && <ReturTab supplierOptions={supplierOptions} barangOptions={barangOptions} purchaseOrderOptions={purchaseOrderOptions} refreshKey={refreshKey} />}
        </>
      )}
    </div>
  );
}
