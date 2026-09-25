'use client';

import { SalesReturnSourceLines, useSalesReturnSource } from '@/components/erp/sales-return-source';
import { salesReturnDetails, createSalesReturn, type ReturnQuantities } from '@/lib/return-documents';

import { stockLineError } from '@/lib/delivery-receipt';
import { StockOperationErrorDialog, useStockOperationError } from '@/components/erp/stock-operation-error-dialog';

import OrderDocumentForm from '@/components/erp/orders/order-document-form';
import { canEditOrder, formatOrderMoney, summarizeOrderTotals } from '@/lib/order-documents';

import { useState, useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableDropdown, type SearchableDropdownOption } from '@/components/ui/searchable-dropdown';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { FileText, Truck, Receipt, RotateCcw, Plus, Trash2, ShoppingCart, TrendingUp, Search, ChevronLeft, ChevronRight, Loader2, Pencil, Info, Printer, Undo2 } from 'lucide-react';
import { formatRp, formatDate, todayStr } from '@/lib/pdf-utils';
import { api, PaginatedResponse, ApiError } from '@/lib/api';
import { toast } from 'sonner';
import { useTabStore } from '@/store/tab-store';
import { FormTabShell } from '@/components/erp/form-tab-shell';
import { useERPStore } from '@/store/erp-store';
import { PesananCetakTab, PengirimanCetakTab, InvoiceCetakTab, ReturCetakTab } from '@/components/erp/sales/cetak-tabs';
import { PelunasanPiutangView } from '@/components/erp/pelunasan';
import { WorkflowStateBadge, WorkflowActionsCell } from '@/components/erp/workflow-components';
import { useWorkflowStates } from '@/lib/use-workflow-states';
import { StatusPembayaranBadge } from '@/components/erp/pelunasan/status-badge';
import { useInvoiceSaldos } from '@/lib/use-invoice-saldos';
import type { SalesOrderResponse, SalesOrderCreate, SalesOrderUpdate, SalesOrderDetailCreate, SalesInvoiceResponse, SalesInvoiceCreate, SalesInvoiceUpdate, SalesInvoiceDetailCreate, SalesReturResponse, SalesReturCreate, SalesReturUpdate, SalesReturDetailCreate, PengirimanBarangResponse, PengirimanBarangCreate, PengirimanBarangUpdate, PengirimanBarangDetailCreate, PelangganDropdown, SyaratBayarResponse, BarangDropdown, SatuanResponse, GudangResponse, TransaksiBiayaCreate } from '@/types/api';

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
}

interface FormBiayaRow {
  id: string;
  nama: string;
  jumlah: string;
}

function newDetailRow(): FormDetailRow {
  return { id: crypto.randomUUID(), barangId: '', kodeBarang: '', barangNama: '', harga: '', qty: '1', diskon: '0', satuanId: '', satuanNama: '' };
}

function newBiayaRow(): FormBiayaRow {
  return { id: crypto.randomUUID(), nama: '', jumlah: '' };
}

// ─── Detail Table With Price (for SO / Invoice / Retur forms) ──────────────

function DetailTableWithPrice({ rows, setRows, barangOptions }: { rows: FormDetailRow[]; setRows: Dispatch<SetStateAction<FormDetailRow[]>>; barangOptions: BarangDropdown[] }) {
  const addRow = useCallback(() => setRows((p) => [...p, newDetailRow()]), [setRows]);
  const removeRow = useCallback((id: string) => setRows((p) => p.filter((r) => r.id !== id)), [setRows]);
  const updateRow = useCallback(
    (id: string, field: keyof FormDetailRow, value: string) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          if (field === 'barangId') {
            const found = barangOptions.find((b) => b.id === value);
            return { ...r, barangId: value, kodeBarang: found?.kode || '', barangNama: found?.nama || '', harga: found ? String(found.hargaPokok) : r.harga };
          }
          return { ...r, [field]: value };
        })
      );
    },
    [setRows, barangOptions]
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
                    <Input type="number" className="h-8 text-right text-xs" value={row.harga} onChange={(e) => updateRow(row.id, 'harga', e.target.value)} />
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
                <TableCell colSpan={7} className="h-16 text-center text-muted-foreground">
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

// ─── Detail Table Simple (for Pengiriman form) ──────────────────────────────

function DetailTableSimple({ rows, setRows, barangOptions, satuanOptions }: { rows: FormDetailRow[]; setRows: Dispatch<SetStateAction<FormDetailRow[]>>; barangOptions: BarangDropdown[]; satuanOptions: SatuanResponse[] }) {
  const addRow = useCallback(() => setRows((p) => [...p, newDetailRow()]), [setRows]);
  const removeRow = useCallback((id: string) => setRows((p) => p.filter((r) => r.id !== id)), [setRows]);
  const updateRow = useCallback(
    (id: string, field: keyof FormDetailRow, value: string) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          if (field === 'barangId') {
            const found = barangOptions.find((b) => b.id === value);
            return { ...r, barangId: value, kodeBarang: found?.kode || '', barangNama: found?.nama || '' };
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

  return (
    <div className="space-y-3">
      <div className="max-h-64 overflow-y-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[100px]">Kode Barang</TableHead>
              <TableHead className="min-w-[200px]">Nama Barang</TableHead>
              <TableHead className="w-[80px] text-right">Kts</TableHead>
              <TableHead className="w-[120px]">Satuan</TableHead>
              <TableHead className="w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs">
                  {row.kodeBarang || '-'}
                  {row.salesOrderDetailId && (
                    <span className="ml-1.5 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700" title="Baris ter-link ke line Sales Order">
                      SO
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
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeRow(row.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
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
                  <Input type="number" className="h-8 text-right text-xs" value={row.jumlah} onChange={(e) => updateRow(row.id, 'jumlah', e.target.value)} />
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

  return { pelangganOptions, syaratBayarOptions, barangOptions, satuanOptions, salesOrderOptions, invoiceOptions, pengirimanOptions, gudangOptions, loading };
}

// ═════════════════════════════════════════════════════════════════════════════
// FORM: Pesanan Penjualan Create
// ═════════════════════════════════════════════════════════════════════════════

function PesananPenjualanCreateForm({ subPage }: { subPage: string }) {
  return <OrderDocumentForm kind="sales" subPage={subPage} />;
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
  const { pelangganOptions, barangOptions, satuanOptions, salesOrderOptions, gudangOptions, loading: ddLoading } = useDropdowns();
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [fSalesOrderId, setFSalesOrderId] = useState('');
  const [fPelangganId, setFPelangganId] = useState('');
  const [fGudangId, setFGudangId] = useState('');
  const [fTanggal, setFTanggal] = useState(todayStr());
  const [fEkspedisi, setFEkspedisi] = useState('');
  const [fAlamatPengiriman, setFAlamatPengiriman] = useState('');
  const [fKeterangan, setFKeterangan] = useState('');
  const [fDetail, setFDetail] = useState<FormDetailRow[]>([newDetailRow()]);
  const [soLoading, setSoLoading] = useState(false);

  // === Fix persist salesOrderDetailId: saat SO dipilih, ambil detail SO dan
  // prefill baris barang (qty + satuan + link line SO) serta pelanggan.
  // Baris ter-link otomatis mengirim salesOrderDetailId sehingga validasi
  // over-delivery per line aktif di backend (create + finish).
  const handleSalesOrderChange = useCallback(async (soId: string) => {
    setFSalesOrderId(soId);
    setFormErrors((prev) => ({ ...prev, salesOrderId: '' }));
    if (!soId) return;
    setSoLoading(true);
    try {
      const so = await api.get<SalesOrderResponse>(`/penjualan/sales-order/${soId}`);
      setFPelangganId(so.pelangganId || '');
      if (Array.isArray(so.details) && so.details.length > 0) {
        setFDetail(
          so.details.map((d) => ({
            id: crypto.randomUUID(),
            barangId: d.barangId,
            kodeBarang: d.barang?.kode || '',
            barangNama: d.barang?.nama || '',
            harga: String(d.harga ?? 0),
            qty: String(d.qty ?? 1),
            diskon: '0',
            satuanId: d.satuanId || '',
            satuanNama: d.satuan?.nama || '',
            salesOrderDetailId: d.id
          }))
        );
      }
    } catch {
      // Gagal memuat detail SO — biarkan user isi baris manual (tanpa link)
    } finally {
      setSoLoading(false);
    }
  }, []);

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
      return;
    }
    setFormErrors({});
    setSubmitting(true);
    try {
      const details: PengirimanBarangDetailCreate[] = fDetail
        .filter((r) => r.barangId)
        .map((r) => ({
          barangId: r.barangId,
          qty: Number(r.qty),
          satuanId: r.satuanId,
          salesOrderDetailId: r.salesOrderDetailId || null
        }));
      const body: PengirimanBarangCreate = {
        tanggal: fTanggal,
        salesOrderId: fSalesOrderId,
        pelangganId: fPelangganId,
        gudangId: fGudangId || null,
        ekspedisi: fEkspedisi || null,
        alamatPengiriman: fAlamatPengiriman || null,
        keterangan: fKeterangan || null,
        details
      };
      await api.post('/penjualan/pengiriman', body);
      toast.success('Pengiriman barang berhasil dibuat');
      refreshListTab('sales', subPage);
      if (activeTabId) closeTab(activeTabId);
    } catch (e) {
      handleStockError(e, 'Gagal menyimpan pengiriman');
    } finally {
      setSubmitting(false);
    }
  }, [fSalesOrderId, fPelangganId, fGudangId, fTanggal, fEkspedisi, fAlamatPengiriman, fKeterangan, fDetail, subPage, activeTabId, closeTab, refreshListTab, handleStockError]);

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
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Sales Order <span className="text-destructive">*</span>
              </Label>
              <SearchableDropdown value={fSalesOrderId} onValueChange={handleSalesOrderChange} options={salesOrderOptions.map((so) => ({ id: so.id, label: so.noPesanan }))} placeholder="Pilih SO..." disabled={soLoading} />
              {soLoading && <p className="text-xs text-muted-foreground mt-1">Memuat detail SO...</p>}
              {formErrors.salesOrderId && <p className="text-xs text-destructive mt-1">{formErrors.salesOrderId}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Pelanggan <span className="text-destructive">*</span>
              </Label>
              <SearchableDropdown value={fPelangganId} onValueChange={setFPelangganId} options={pelangganOptions.map((p) => ({ id: p.id, label: p.nama }))} placeholder="Pilih pelanggan..." />
              {formErrors.pelangganId && <p className="text-xs text-destructive mt-1">{formErrors.pelangganId}</p>}
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
              <Label className="text-xs font-medium">Ekspedisi</Label>
              <Input className="h-9 text-xs" value={fEkspedisi} onChange={(e) => setFEkspedisi(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Alamat Pengiriman</Label>
              <Input className="h-9 text-xs" value={fAlamatPengiriman} onChange={(e) => setFAlamatPengiriman(e.target.value)} />
            </div>
          </div>
          <Separator />
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              Detail Barang <span className="text-destructive">*</span>
            </Label>
            <DetailTableSimple rows={fDetail} setRows={setFDetail} barangOptions={barangOptions} satuanOptions={satuanOptions} />
            <p className="text-[11px] text-muted-foreground">
              Baris bertanda <span className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 border-emerald-200">SO</span> otomatis ter-link ke line Sales Order — validasi over-delivery aktif. Pilih ulang SO untuk memuat ulang barisnya.
            </p>
            {formErrors.detail && <p className="text-xs text-destructive mt-1">{formErrors.detail}</p>}
          </div>
          <Separator />
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Keterangan</Label>
            <Textarea className="text-xs min-h-[60px]" value={fKeterangan} onChange={(e) => setFKeterangan(e.target.value)} placeholder="Catatan tambahan..." />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting}>
              Batal
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting || !fGudangId}>
              {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Truck className="mr-1.5 h-4 w-4" />}
              {submitting ? 'Menyimpan...' : 'Simpan Pengiriman'}
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
  const { pelangganOptions, salesOrderOptions, gudangOptions, loading: ddLoading } = useDropdowns();
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
  const [editPelangganId, setEditPelangganId] = useState('');
  const [editGudangId, setEditGudangId] = useState('');
  const [editTanggal, setEditTanggal] = useState('');
  const [editEkspedisi, setEditEkspedisi] = useState('');
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
        setEditPelangganId(p.pelangganId || '');
        setEditGudangId(p.gudangId || '');
        setEditTanggal(p.tanggal ? p.tanggal.slice(0, 10) : '');
        setEditEkspedisi(p.ekspedisi || '');
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
        ekspedisi: editEkspedisi || null,
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
  }, [editId, editPelangganId, editGudangId, editTanggal, editSalesOrderId, editEkspedisi, editAlamatPengiriman, editKeterangan, subPage, activeTabId, closeTab, refreshListTab, recordError, handleStockError]);

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
                  <span>No Surat Jalan:</span>
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
                  <SearchableDropdown value={editSalesOrderId} onValueChange={setEditSalesOrderId} options={salesOrderOptions.map((so) => ({ id: so.id, label: so.noPesanan }))} placeholder="Pilih SO..." />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    Pelanggan <span className="text-destructive">*</span>
                  </Label>
                  <SearchableDropdown value={editPelangganId} onValueChange={setEditPelangganId} options={pelangganOptions.map((p) => ({ id: p.id, label: p.nama }))} placeholder="Pilih pelanggan..." />
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
                  <Label className="text-xs font-medium">Ekspedisi</Label>
                  <Input className="h-9 text-xs" value={editEkspedisi} onChange={(e) => setEditEkspedisi(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Alamat Pengiriman</Label>
                  <Input className="h-9 text-xs" value={editAlamatPengiriman} onChange={(e) => setEditAlamatPengiriman(e.target.value)} />
                </div>
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
                          <TableCell>{line.barang?.nama || line.barangId}</TableCell>
                          <TableCell className={Number(line.qty) <= 0 ? 'text-destructive' : undefined}>{line.qty}</TableCell>
                          <TableCell>{line.satuan?.nama || line.satuanId}</TableCell>
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

function InvoicePenjualanCreateForm({ subPage }: { subPage: string }) {
  const { pelangganOptions, syaratBayarOptions, barangOptions, salesOrderOptions, loading: ddLoading } = useDropdowns();
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [fPelangganId, setFPelangganId] = useState('');
  const [fSalesOrderId, setFSalesOrderId] = useState('');
  const [fTanggal, setFTanggal] = useState(todayStr());
  const [fSyaratBayarId, setFSyaratBayarId] = useState('');
  const [fFob, setFFob] = useState('');
  const [fEkspedisi, setFEkspedisi] = useState('');
  const [fTanggalPengiriman, setFTanggalPengiriman] = useState('');
  const [fAlamatPengiriman, setFAlamatPengiriman] = useState('');
  const [fDiskonGlobal, setFDiskonGlobal] = useState('0');
  const [fPpn, setFPpn] = useState('11');
  const [fKeterangan, setFKeterangan] = useState('');
  const [fDetail, setFDetail] = useState<FormDetailRow[]>([newDetailRow()]);
  const [fBiayaTambahan, setFBiayaTambahan] = useState<FormBiayaRow[]>([]);

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

  const handleSubmit = useCallback(async () => {
    const errs: Record<string, string> = {};
    if (!fPelangganId) errs.pelangganId = 'Pelanggan wajib diisi';
    if (!fTanggal) errs.tanggal = 'Tanggal wajib diisi';
    if (!fDetail.some((r) => r.barangId)) errs.detail = 'Minimal 1 barang harus dipilih';
    if (Object.keys(errs).length) {
      setFormErrors(errs);
      return;
    }
    setSubmitting(true);
    try {
      const details: SalesInvoiceDetailCreate[] = fDetail
        .filter((r) => r.barangId)
        .map((r) => {
          const qty = parseFloat(r.qty) || 0;
          const harga = parseFloat(r.harga) || 0;
          const diskon = parseFloat(r.diskon) || 0;
          return { barangId: r.barangId, harga, qty, diskon: diskon || null, subTotal: qty * harga * (1 - diskon / 100) };
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
        syaratBayarId: fSyaratBayarId || null,
        salesOrderId: fSalesOrderId || null,
        fob: fFob || null,
        ekspedisi: fEkspedisi || null,
        tanggalPengiriman: fTanggalPengiriman || null,
        alamatPengiriman: fAlamatPengiriman || null,
        diskonGlobal: parseFloat(fDiskonGlobal) || null,
        ppn: parseFloat(fPpn) || 0,
        keterangan: fKeterangan || null,
        details,
        biayaTambahan: biaya.length > 0 ? biaya : undefined
      };
      await api.post('/penjualan/sales-invoice', body);
      toast.success('Invoice penjualan berhasil dibuat');
      refreshListTab('sales', subPage);
      if (activeTabId) closeTab(activeTabId);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Gagal menyimpan invoice');
    } finally {
      setSubmitting(false);
    }
  }, [fPelangganId, fSalesOrderId, fTanggal, fSyaratBayarId, fFob, fEkspedisi, fTanggalPengiriman, fAlamatPengiriman, fDiskonGlobal, fPpn, fKeterangan, fDetail, fBiayaTambahan, subPage, activeTabId, closeTab, refreshListTab]);

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
          <p className="text-sm text-muted-foreground">Isi data faktur penjualan baru</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Pelanggan <span className="text-destructive">*</span>
              </Label>
              <SearchableDropdown value={fPelangganId} onValueChange={setFPelangganId} options={pelangganOptions.map((p) => ({ id: p.id, label: p.nama }))} placeholder="Pilih pelanggan..." />
              {formErrors.pelangganId && <p className="text-xs text-destructive mt-1">{formErrors.pelangganId}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Tanggal <span className="text-destructive">*</span>
              </Label>
              <Input type="date" className="h-9 text-xs" value={fTanggal} onChange={(e) => setFTanggal(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Syarat Pembayaran</Label>
              <SearchableDropdown value={fSyaratBayarId} onValueChange={setFSyaratBayarId} options={syaratBayarOptions.map((s) => ({ id: s.id, label: s.nama, subtitle: s.hari ? s.hari + ' hari' : undefined }))} placeholder="Pilih..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Link ke Sales Order</Label>
              <SearchableDropdown value={fSalesOrderId} onValueChange={setFSalesOrderId} options={salesOrderOptions.map((so) => ({ id: so.id, label: so.noPesanan }))} allOption={{ id: '', label: 'Tidak ada' }} placeholder="Opsional..." />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">FOB</Label>
              <Input className="h-9 text-xs" value={fFob} onChange={(e) => setFFob(e.target.value)} placeholder="e.g. Jakarta" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Ekspedisi</Label>
              <Input className="h-9 text-xs" value={fEkspedisi} onChange={(e) => setFEkspedisi(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Tanggal Pengiriman</Label>
              <Input type="date" className="h-9 text-xs" value={fTanggalPengiriman} onChange={(e) => setFTanggalPengiriman(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Alamat Pengiriman</Label>
              <Input className="h-9 text-xs" value={fAlamatPengiriman} onChange={(e) => setFAlamatPengiriman(e.target.value)} />
            </div>
          </div>
          <Separator />
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              Detail Barang <span className="text-destructive">*</span>
            </Label>
            <DetailTableWithPrice rows={fDetail} setRows={setFDetail} barangOptions={barangOptions} />
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
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting}>
              Batal
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting}>
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
// FORM: Invoice Penjualan Edit
// ═════════════════════════════════════════════════════════════════════════════

function InvoicePenjualanEditForm({ editId, subPage, initialNoInvoice, initialStatus, initialGrandTotal }: { editId: string; subPage: string; initialNoInvoice?: string; initialStatus?: string; initialGrandTotal?: number }) {
  const { pelangganOptions, syaratBayarOptions, salesOrderOptions, loading: ddLoading } = useDropdowns();
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
  const [editSyaratBayarId, setEditSyaratBayarId] = useState('');
  const [editSalesOrderId, setEditSalesOrderId] = useState('');
  const [editFob, setEditFob] = useState('');
  const [editEkspedisi, setEditEkspedisi] = useState('');
  const [editTanggalPengiriman, setEditTanggalPengiriman] = useState('');
  const [editAlamatPengiriman, setEditAlamatPengiriman] = useState('');
  const [editMataUang, setEditMataUang] = useState('IDR');
  const [editDiskonGlobal, setEditDiskonGlobal] = useState('0');
  const [editPpn, setEditPpn] = useState('11');
  const [editKeterangan, setEditKeterangan] = useState('');

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
        setEditSyaratBayarId(inv.syaratBayarId || '');
        setEditSalesOrderId(inv.salesOrderId || '');
        setEditFob(inv.fob || '');
        setEditEkspedisi(inv.ekspedisi || '');
        setEditTanggalPengiriman(inv.tanggalPengiriman ? inv.tanggalPengiriman.slice(0, 10) : '');
        setEditAlamatPengiriman(inv.alamatPengiriman || '');
        setEditMataUang(inv.mataUang || 'IDR');
        setEditDiskonGlobal(String(inv.diskonGlobal ?? 0));
        setEditPpn(String(inv.ppn ?? 0));
        setEditKeterangan(inv.keterangan || '');
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
  }, [editId]);

  const handleEditSubmit = useCallback(async () => {
    if (!editPelangganId) {
      toast.error('Pelanggan wajib diisi');
      return;
    }
    if (!editTanggal) {
      toast.error('Tanggal wajib diisi');
      return;
    }
    setEditSubmitting(true);
    try {
      const body: SalesInvoiceUpdate = {
        tanggal: editTanggal,
        pelangganId: editPelangganId,
        syaratBayarId: editSyaratBayarId || null,
        salesOrderId: editSalesOrderId || null,
        fob: editFob || null,
        ekspedisi: editEkspedisi || null,
        tanggalPengiriman: editTanggalPengiriman || null,
        alamatPengiriman: editAlamatPengiriman || null,
        mataUang: editMataUang || undefined,
        diskonGlobal: parseFloat(editDiskonGlobal) || null,
        ppn: parseFloat(editPpn) || 0,
        keterangan: editKeterangan || null
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
  }, [editId, editPelangganId, editTanggal, editSyaratBayarId, editSalesOrderId, editFob, editEkspedisi, editTanggalPengiriman, editAlamatPengiriman, editMataUang, editDiskonGlobal, editPpn, editKeterangan, subPage, activeTabId, closeTab, refreshListTab]);

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
                  <SearchableDropdown value={editPelangganId} onValueChange={setEditPelangganId} options={pelangganOptions.map((p) => ({ id: p.id, label: p.nama }))} placeholder="Pilih pelanggan..." />
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
                  <Label className="text-xs font-medium">Syarat Pembayaran</Label>
                  <SearchableDropdown value={editSyaratBayarId} onValueChange={setEditSyaratBayarId} options={syaratBayarOptions.map((s) => ({ id: s.id, label: s.nama, subtitle: s.hari ? s.hari + ' hari' : undefined }))} placeholder="Pilih..." />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Link ke Sales Order</Label>
                  <SearchableDropdown value={editSalesOrderId} onValueChange={setEditSalesOrderId} options={salesOrderOptions.map((so) => ({ id: so.id, label: so.noPesanan }))} allOption={{ id: '', label: 'Tidak ada' }} placeholder="Opsional..." />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">FOB</Label>
                  <Input className="h-9 text-xs" value={editFob} onChange={(e) => setEditFob(e.target.value)} placeholder="e.g. Jakarta" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Ekspedisi</Label>
                  <Input className="h-9 text-xs" value={editEkspedisi} onChange={(e) => setEditEkspedisi(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Tanggal Pengiriman</Label>
                  <Input type="date" className="h-9 text-xs" value={editTanggalPengiriman} onChange={(e) => setEditTanggalPengiriman(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Alamat Pengiriman</Label>
                  <Input className="h-9 text-xs" value={editAlamatPengiriman} onChange={(e) => setEditAlamatPengiriman(e.target.value)} />
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Mata Uang</Label>
                  <Input className="h-9 text-xs" value={editMataUang} onChange={(e) => setEditMataUang(e.target.value)} placeholder="e.g. IDR" />
                </div>
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
  const { invoiceOptions, pengirimanOptions, gudangOptions, loading: ddLoading } = useDropdowns();
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [fInvoiceId, setFInvoiceId] = useState('');
  const source = useSalesReturnSource(fInvoiceId);
  const fPelangganId = source.invoice?.pelangganId || '';
  const [quantities, setQuantities] = useState<ReturnQuantities>({});
  const [createdReturn, setCreatedReturn] = useState<SalesReturResponse | null>(null);
  const [saveWarning, setSaveWarning] = useState('');
  const [fPengirimanId, setFPengirimanId] = useState('');
  const [fGudangId, setFGudangId] = useState('');
  const [fTanggal, setFTanggal] = useState(todayStr());
  const [fAlamatPengembalian, setFAlamatPengembalian] = useState('');
  const [fNoPengembalian, setFNoPengembalian] = useState('');
  const [fDiskonGlobal, setFDiskonGlobal] = useState('0');
  const [fPpn, setFPpn] = useState('11');
  const [fKeterangan, setFKeterangan] = useState('');

  const filteredPengirimanOptions = useMemo(() => (fPelangganId ? pengirimanOptions.filter((p) => p.pelangganId === fPelangganId) : pengirimanOptions), [pengirimanOptions, fPelangganId]);

  const handleSubmit = useCallback(async () => {
    if (createdReturn || !source.invoice) return;
    const errs: Record<string, string> = {};
    if (!fInvoiceId) errs.invoiceId = 'Invoice wajib diisi';
    if (!fPelangganId) errs.pelangganId = 'Pelanggan wajib diisi';
    let details: SalesReturDetailCreate[] = [];
    try {
      details = salesReturnDetails(source.invoice, quantities);
    } catch (error) {
      errs.detail = error instanceof Error ? error.message : 'Detail retur tidak valid';
    }
    if (Object.keys(errs).length) {
      setFormErrors(errs);
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
      if (result.mismatches.length) {
        setSaveWarning('Retur ' + result.saved.noRetur + ' sudah dibuat, tetapi respons backend belum mengonfirmasi referensi detail invoice / harga / qty. Tinjau dokumen dari daftar sebelum posting; jangan membuat ulang.');
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
            <div className="space-y-1.5">
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
                options={invoiceOptions.map((inv) => ({ id: inv.id, label: inv.noInvoice }))}
                placeholder="Pilih invoice..."
              />
              {formErrors.invoiceId && <p className="text-xs text-destructive mt-1">{formErrors.invoiceId}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Pelanggan <span className="text-destructive">*</span>
              </Label>
              <Input value={source.invoice?.pelanggan?.nama || fPelangganId} readOnly placeholder="Mengikuti invoice sumber" />
              {formErrors.pelangganId && <p className="text-xs text-destructive mt-1">{formErrors.pelangganId}</p>}
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
            <Input className="h-9 text-xs" value={fAlamatPengembalian} onChange={(e) => setFAlamatPengembalian(e.target.value)} />
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
              <Label className="text-xs font-medium">PPN (%)</Label>
              <Input type="number" className="h-9 text-xs" value={fPpn} min={0} max={100} onChange={(e) => setFPpn(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Keterangan</Label>
            <Textarea className="text-xs min-h-[60px]" value={fKeterangan} onChange={(e) => setFKeterangan(e.target.value)} placeholder="Alasan retur / catatan tambahan..." />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting}>
              Batal
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting || !source.invoice || !!createdReturn}>
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
// FORM: Retur Penjualan Edit
// ═════════════════════════════════════════════════════════════════════════════

function ReturPenjualanEditForm({ editId, subPage, initialNoRetur, initialStatus, initialGrandTotal }: { editId: string; subPage: string; initialNoRetur?: string; initialStatus?: string; initialGrandTotal?: number }) {
  const { error: returnError, clearError: clearReturnError, handleError: handleReturnError } = useStockOperationError('sales_retur');
  const { pelangganOptions, invoiceOptions, pengirimanOptions, gudangOptions, loading: ddLoading } = useDropdowns();
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
        setEditPpn(String(r.ppn ?? 0));
        setEditKeterangan(r.keterangan || '');
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
                  <span>Grand Total:</span>
                  <span className="font-mono font-semibold text-foreground">{formatRp(editGrandTotal)}</span>
                </div>
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
                  <SearchableDropdown value={editGudangId} onValueChange={setEditGudangId} options={gudangOptions.map((g) => ({ id: g.id, label: g.kode + ' - ' + g.nama }))} placeholder="Pilih gudang (opsional)..." />
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
                  <Label className="text-xs font-medium">PPN (%)</Label>
                  <Input type="number" className="h-9 text-xs" value={editPpn} min={0} max={100} onChange={(e) => setEditPpn(e.target.value)} />
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

  const handleCancel = useCallback(
    async (id: string) => {
      try {
        await api.post(`/penjualan/sales-order/${id}/cancel`);
        toast.success('Pesanan berhasil dibatalkan');
        fetchData();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Gagal membatalkan');
      }
    },
    [fetchData]
  );

  const wfStates = useWorkflowStates(
    'sales_order',
    data.map((d) => d.id),
    refreshKey
  );

  const summaryTotal = summarizeOrderTotals(data);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <ShoppingCart className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-emerald-600 font-medium">Total Pesanan</p>
              {loading ? <Skeleton className="mt-1 h-6 w-16" /> : <p className="text-2xl font-bold text-emerald-700">{total}</p>}
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-emerald-600 font-medium">Total Nilai (halaman ini)</p>
              {loading ? <Skeleton className="mt-1 h-6 w-28" /> : <p className="text-2xl font-bold text-emerald-700">{summaryTotal}</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* List Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Daftar Pesanan Penjualan</CardTitle>
              <CardDescription>Daftar seluruh pesanan penjualan yang telah dicatat</CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() =>
                openFormTab({
                  title: 'Buat Pesanan Penjualan',
                  module: 'sales',
                  subPage: 'pesanan',
                  formKey: 'pesanan-penjualan-create'
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
                    <TableHead className="w-[130px]">No Pesanan</TableHead>
                    <TableHead className="w-[100px]">Tanggal</TableHead>
                    <TableHead>Pelanggan</TableHead>
                    <TableHead>Customer PO</TableHead>
                    <TableHead>Fulfillment Status</TableHead>
                    <TableHead className="text-right w-[160px]">Total Nilai</TableHead>
                    <TableHead className="w-[110px] text-center">Status</TableHead>
                    <TableHead className="w-[140px] text-center">Workflow</TableHead>
                    <TableHead className="w-[100px] text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <SkeletonRows cols={9} />
                  ) : data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                        Tidak ada data pesanan.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-xs font-medium">{d.noPesanan}</TableCell>
                        <TableCell className="text-xs">{formatDate(d.tanggal)}</TableCell>
                        <TableCell className="text-xs">{d.pelanggan?.nama || '-'}</TableCell>
                        <TableCell className="text-xs">{d.customerPoNumber || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{d.fulfillmentStatus || '-'}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-medium">{formatOrderMoney(d.grandTotal, d.currency)}</TableCell>
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
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => handleCancel(d.id)}>
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

  const handleCancel = useCallback(
    async (id: string) => {
      try {
        await api.post(`/penjualan/pengiriman/${id}/cancel`);
        toast.success('Pengiriman berhasil dibatalkan');
        fetchData();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Gagal membatalkan');
      }
    },
    [fetchData]
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
      toast.success(`Pengiriman ${reverseTarget.noSuratJalan} berhasil di-reverse`);
      setReverseTarget(null);
      setReverseReason('');
      fetchData();
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : 'Gagal reverse pengiriman';
      // Phase 4 — handle specific error cases with longer duration for actionable errors
      if (msg.includes('sudah ada invoice') || msg.includes('Batalkan/reverse invoice terlebih dahulu')) {
        toast.error('Tidak bisa reverse — sudah ada invoice', {
          description: 'Batalkan/reverse invoice yang memakai delivery ini terlebih dahulu, lalu reverse pengiriman.',
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
    'pengiriman_barang',
    data.map((d) => d.id),
    refreshKey
  );

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
                    <TableHead className="w-[140px]">No Surat Jalan</TableHead>
                    <TableHead className="w-[100px]">Tanggal</TableHead>
                    <TableHead>Pelanggan</TableHead>
                    <TableHead>Alamat</TableHead>
                    <TableHead className="w-[110px] text-center">Status</TableHead>
                    <TableHead className="w-[140px] text-center">Workflow</TableHead>
                    <TableHead className="w-[100px] text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <SkeletonRows cols={7} />
                  ) : data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
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
                                title="Reverse pengiriman (kembalikan stok & reverse HPP journal)"
                                aria-label="Reverse pengiriman">
                                <Undo2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {(d.status === 'DRAFT' || d.status === 'DIPROSES') && (
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => handleCancel(d.id)}>
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
            <AlertDialogTitle>Reverse Pengiriman {reverseTarget?.noSuratJalan}?</AlertDialogTitle>
            <AlertDialogDescription>
              Pengiriman ini sudah finish (status: SELESAI). Reverse akan:
              <br />• Reverse HPP journal (Dr Persediaan / Cr HPP — pembalik)
              <br />• Restore layer FIFO/FEFO di gudang (stok dikembalikan)
              <br />• Mengubah status pengiriman menjadi DIBATALKAN
              <br />
              <br />
              <span className="text-amber-600">Catatan: Tidak bisa reverse kalau sudah ada invoice yang memakai delivery ini. Batalkan/reverse invoice terlebih dahulu.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 px-6">
            <Label htmlFor="reverse-reason-pengiriman">Alasan Reversal (opsional)</Label>
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
              Ya, Reverse Pengiriman
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

  const handleCancel = useCallback(
    async (id: string) => {
      try {
        await api.post(`/penjualan/sales-invoice/${id}/cancel`);
        toast.success('Invoice berhasil dibatalkan');
        fetchData();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Gagal membatalkan');
      }
    },
    [fetchData]
  );

  const wfStates = useWorkflowStates(
    'sales_invoice',
    data.map((d) => d.id),
    refreshKey
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
              <CardDescription>Daftar seluruh faktur penjualan</CardDescription>
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
                    <TableHead className="w-[140px] text-center">Workflow</TableHead>
                    <TableHead className="w-[100px] text-center">Aksi</TableHead>
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
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => handleCancel(d.id)}>
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

  const handleCancel = useCallback(
    async (id: string) => {
      try {
        await api.post(`/penjualan/sales-retur/${id}/cancel`);
        toast.success('Retur berhasil dibatalkan');
        fetchData();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Gagal membatalkan');
      }
    },
    [fetchData]
  );

  const wfStates = useWorkflowStates(
    'sales_retur',
    data.map((d) => d.id),
    refreshKey
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
                    <TableHead className="w-[140px] text-center">Workflow</TableHead>
                    <TableHead className="w-[100px] text-center">Aksi</TableHead>
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
                        <TableCell className="font-mono text-xs">{d.salesInvoice?.noPesanan || '-'}</TableCell>
                        <TableCell className="text-xs">{formatDate(d.tanggal)}</TableCell>
                        <TableCell className="text-xs">{d.pelanggan?.nama || '-'}</TableCell>
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
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => handleCancel(d.id)}>
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

  // ── Pelunasan Piutang: dipindahkan dari modul Pelunasan mandiri ──
  // Dirutekan SEBELUM SalesList agar dropdown SO/invoice/barang tidak dimuat
  // (pelunasan memuat referensinya sendiri: pelanggan + kas/bank + tagihan).
  if (!formMode && subPage === 'pelunasan-piutang') {
    return <PelunasanPiutangView refreshKey={refreshKey} />;
  }

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

    if (formMode === 'pesanan-penjualan-create') {
      return <PesananPenjualanCreateForm subPage={subPage} />;
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
          {subPage === 'pesanan' && <PesananTab pelangganOptions={pelangganOptions} syaratBayarOptions={syaratBayarOptions} barangOptions={barangOptions} refreshKey={refreshKey} />}
          {subPage === 'pengiriman' && <PengirimanTab pelangganOptions={pelangganOptions} barangOptions={barangOptions} satuanOptions={satuanOptions} salesOrderOptions={salesOrderOptions} refreshKey={refreshKey} />}
          {subPage === 'invoice' && <InvoiceTab pelangganOptions={pelangganOptions} syaratBayarOptions={syaratBayarOptions} barangOptions={barangOptions} salesOrderOptions={salesOrderOptions} refreshKey={refreshKey} />}
          {subPage === 'retur' && <ReturTab pelangganOptions={pelangganOptions} barangOptions={barangOptions} invoiceOptions={invoiceOptions} refreshKey={refreshKey} />}
        </>
      )}
    </div>
  );
}
