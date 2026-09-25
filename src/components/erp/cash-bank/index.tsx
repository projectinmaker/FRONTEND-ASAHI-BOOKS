'use client';
import { loadSystemCOA } from '@/lib/coa';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useERPStore } from '@/store/erp-store';
import { useTabStore } from '@/store/tab-store';
// Dialog is only used for PDF preview (not create/edit)
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { formatRp, formatDate, generatePDF } from '@/lib/pdf-utils';
import { TransferBankPDFTemplate, PembayaranKasPDFTemplate, PenerimaanKasPDFTemplate, type TransferBankData, type PembayaranKasData, type PenerimaanKasData } from '@/components/erp/cash-bank/pdf-templates';
import { FormTabShell } from '@/components/erp/form-tab-shell';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { api, PaginatedResponse, ApiError } from '@/lib/api';
import type { KasBankAkunResponse, COADropdownResponse, PembayaranKasResponse, PenerimaanKasResponse, TransferBankResponse } from '@/types/api';
import { Wallet, Building2, ArrowRightLeft, Plus, Download, Printer, X, Search, ChevronLeft, ChevronRight, Loader2, Pencil, Undo2, type LucideIcon } from 'lucide-react';
import RekonsiliasiBankTab from '@/components/erp/cash-bank/rekonsiliasi-bank';
import PembayaranForm from '@/components/erp/cash-bank/forms/pembayaran-form';
import PenerimaanForm from '@/components/erp/cash-bank/forms/penerimaan-form';
import TransferBankForm from '@/components/erp/cash-bank/forms/transfer-bank-form';
import { WorkflowStateBadge, WorkflowActionsCell } from '@/components/erp/workflow-components';
import { useWorkflowStates } from '@/lib/use-workflow-states';
import type { WorkflowResponse } from '@/types/api';

// ─── Constants ───────────────────────────────────────────────────────────

const PAGE_SIZE = 100;

// ─── Shared UI ─────────────────────────────────────────────────────────────

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

interface SummaryCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  iconBgColor: string;
  iconColor: string;
  loading?: boolean;
}

function SummaryCard({ icon: Icon, label, value, iconBgColor, iconColor, loading }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-4">
        <div className={cn(`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconBgColor}`)}>
          <Icon className={cn(`h-6 w-6 ${iconColor}`)} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground truncate">{label}</p>
          {loading ? <Skeleton className="mt-1 h-6 w-28" /> : <p className="mt-0.5 text-xl font-bold tracking-tight truncate">{value}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

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

// ─── Pagination Component ────────────────────────────────────────────────

function Pagination({ skip, total, onNext, onPrev }: { skip: number; total: number; onNext: () => void; onPrev: () => void }) {
  const currentPage = Math.floor(skip / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasNext = skip + PAGE_SIZE < total;
  const hasPrev = skip > 0;
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        Menampilkan {skip + 1}–{Math.min(skip + PAGE_SIZE, total)} dari {total} (Halaman {currentPage} dari {totalPages})
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

// ─── Table Skeleton ──────────────────────────────────────────────────────

function TableSkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-24" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

// ─── History Table (Pembayaran / Penerimaan) ─────────────────────────────

function HistoryTable({
  type,
  data,
  loading,
  error,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  kasBankFilter,
  onKasBankFilterChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  skip,
  total,
  onPrev,
  onNext,
  onRetry,
  kasBankOptions,
  onCancel,
  onEdit,
  onCetak,
  workflowStates,
  onWorkflowDone
}: {
  type: 'pembayaran' | 'penerimaan';
  data: PembayaranKasResponse[] | PenerimaanKasResponse[];
  loading: boolean;
  error: string | null;
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  kasBankFilter: string;
  onKasBankFilterChange: (v: string) => void;
  dateFrom: string;
  onDateFromChange: (v: string) => void;
  dateTo: string;
  onDateToChange: (v: string) => void;
  skip: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onRetry: () => void;
  kasBankOptions: KasBankAkunResponse[];
  onCancel?: (id: string) => void;
  onEdit?: (id: string) => void;
  onCetak?: (id: string) => void;
  workflowStates?: Record<string, WorkflowResponse>;
  onWorkflowDone?: () => void;
}) {
  const label = type === 'pembayaran' ? 'Pembayaran' : 'Penerimaan';
  const hasActions = !!(onCancel || onEdit || onCetak);
  const hasWorkflow = !!workflowStates;
  const cols = (hasActions ? 1 : 0) + (hasWorkflow ? 1 : 0) + 5;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Riwayat {label}</CardTitle>
        <CardDescription>Daftar seluruh transaksi {label.toLowerCase()} yang telah dicatat</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs text-muted-foreground">Cari</Label>
            <div className="relative mt-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cari no dokumen/bukti..." value={search} onChange={(e) => onSearchChange(e.target.value)} className="pl-8 h-9 text-sm" />
            </div>
          </div>
          <div className="w-full sm:w-36">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={statusFilter} onValueChange={onStatusFilterChange}>
              <SelectTrigger className="mt-1 h-9 text-sm">
                <SelectValue placeholder="Semua" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="SELESAI">Selesai</SelectItem>
                <SelectItem value="BATAL">Batal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-40">
            <Label className="text-xs text-muted-foreground">Kas/Bank</Label>
            <SearchableDropdown value={kasBankFilter} onValueChange={onKasBankFilterChange} options={kasBankOptions.map((opt) => ({ id: opt.id, label: opt.akunPerkiraan?.nama || opt.nama }))} placeholder="Semua Kas/Bank" allOption={{ id: '', label: 'Semua Kas/Bank' }} className="h-8 text-xs w-[200px]" />
          </div>
          <div className="w-full sm:w-36">
            <Label className="text-xs text-muted-foreground">Dari Tanggal</Label>
            <Input type="date" value={dateFrom} onChange={(e) => onDateFromChange(e.target.value)} className="mt-1 h-9 text-sm" />
          </div>
          <div className="w-full sm:w-36">
            <Label className="text-xs text-muted-foreground">Sampai Tanggal</Label>
            <Input type="date" value={dateTo} onChange={(e) => onDateToChange(e.target.value)} className="mt-1 h-9 text-sm" />
          </div>
        </div>

        {/* Error */}
        {error && !loading && <ErrorCard message={error} onRetry={onRetry} />}

        {/* Table */}
        {!error && (
          <div className="max-h-96 overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="whitespace-nowrap">Tanggal</TableHead>
                  <TableHead className="whitespace-nowrap">No. Dokumen</TableHead>
                  <TableHead className="whitespace-nowrap">Kas/Bank</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Total Nilai</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  {hasWorkflow && <TableHead className="whitespace-nowrap text-center">Workflow</TableHead>}
                  {hasActions && <TableHead className="whitespace-nowrap text-center">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableSkeletonRows cols={cols} />
                ) : data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={cols} className="h-24 text-center text-muted-foreground text-sm">
                      Belum ada data
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-sm">{formatDate(row.tanggal)}</TableCell>
                      <TableCell className="whitespace-nowrap font-medium text-sm">{row.noBukti}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{row.kasBank?.akunPerkiraan?.nama || row.kasBank?.nama || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono text-sm font-medium">{formatRp(Number(row.totalNilai) || 0)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <StatusBadge status={row.status} />
                      </TableCell>
                      {hasWorkflow && (
                        <TableCell className="whitespace-nowrap text-center">
                          {(() => {
                            const w = workflowStates?.[row.id];
                            if (!w) return <span className="text-xs text-muted-foreground">—</span>;
                            return (
                              <div className="flex flex-col items-center gap-1">
                                <WorkflowStateBadge state={w.state} />
                                <WorkflowActionsCell documentType={w.documentType} documentId={w.documentId} version={w.version} availableActions={w.availableActions} onDone={onWorkflowDone} />
                              </div>
                            );
                          })()}
                        </TableCell>
                      )}
                      {(onCancel || onEdit || onCetak) && (
                        <TableCell className="whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-1">
                            {onEdit && (row.status === 'DRAFT' || row.status === 'DIPROSES') && (
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={() => onEdit(row.id)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {onCetak && (
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => onCetak(row.id)} title="Cetak">
                                <Printer className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {onCancel && row.status !== 'BATAL' && (
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => onCancel(row.id)}>
                                Batal
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {!loading && !error && total > 0 && <Pagination skip={skip} total={total} onNext={onNext} onPrev={onPrev} />}
      </CardContent>
    </Card>
  );
}

// ─── PDFPreviewDialog ──────────────────────────────────────────────────────

function PDFPreviewDialog({ open, onClose, data }: { open: boolean; onClose: () => void; data: TransferBankData | null }) {
  const handleDownload = useCallback(() => {
    generatePDF('pdf-content', 'Bukti-Transfer-Bank.pdf');
  }, []);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preview Bukti Transfer Bank</DialogTitle>
          <DialogDescription>Preview dokumen sebelum mencetak atau mengunduh.</DialogDescription>
        </DialogHeader>
        <div className="border rounded-md p-2 bg-white">{data && <TransferBankPDFTemplate data={data} />}</div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="mr-1.5 h-4 w-4" /> Download PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="mr-1.5 h-4 w-4" /> Cetak
          </Button>
          <Button variant="secondary" size="sm" onClick={onClose}>
            <X className="mr-1.5 h-4 w-4" /> Tutup
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Transfer Bank Tab ────────────────────────────────────────────────────

function TransferBankTab({ kasBankOptions, onPreview, refreshKey }: { kasBankOptions: KasBankAkunResponse[]; onPreview: (data: TransferBankData) => void; refreshKey?: number }) {
  // ── History data state ──
  const [data, setData] = useState<TransferBankResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skip, setSkip] = useState(0);

  // ── Filter state ──
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── Cancel dialog ──
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<TransferBankResponse | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  // ── Reverse dialog ──
  const [reverseTarget, setReverseTarget] = useState<TransferBankResponse | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reversing, setReversing] = useState(false);

  // ── Debounce search ──
  useEffect(() => {
    debounceTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [search]);

  // ── Reset skip when filter changes ──
  useEffect(() => {
    setSkip(0);
  }, [debouncedSearch, statusFilter, dateFrom, dateTo]);

  // ── Fetch history ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('skip', String(skip));
      params.set('limit', String(PAGE_SIZE));
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter && statusFilter !== 'ALL') params.set('status', statusFilter);
      if (dateFrom) params.set('tanggal_from', dateFrom);
      if (dateTo) params.set('tanggal_to', dateTo);

      const res = await api.get<PaginatedResponse<TransferBankResponse>>(`/kas-bank/transfer?${params.toString()}`);
      setData(res.data);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Gagal memuat data transfer');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, dateFrom, dateTo, skip]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  // ── Tab store ──
  const openFormTab = useTabStore((s) => s.openFormTab);

  // ── Cancel ──
  const confirmCancel = useCallback((row: TransferBankResponse) => {
    setCancelTarget(row);
    setCancelOpen(true);
  }, []);

  const handleCancel = useCallback(async () => {
    if (!cancelTarget) return;
    setCancelSubmitting(true);
    try {
      await api.post<TransferBankResponse>(`/kas-bank/transfer/${cancelTarget.id}/cancel`);
      toast.success('Transfer berhasil dibatalkan');
      setCancelOpen(false);
      setCancelTarget(null);
      fetchData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal membatalkan transfer');
    } finally {
      setCancelSubmitting(false);
    }
  }, [cancelTarget, fetchData]);

  // ── Reverse (Phase 6) ──
  const handleReverse = useCallback(async () => {
    if (!reverseTarget) return;
    setReversing(true);
    try {
      const reasonParam = reverseReason.trim() ? `?reason=${encodeURIComponent(reverseReason.trim())}` : '';
      await api.post<TransferBankResponse>(`/kas-bank/transfer/${reverseTarget.id}/reverse${reasonParam}`);
      toast.success(`Transfer ${reverseTarget.noTransfer} berhasil di-reverse`);
      setReverseTarget(null);
      setReverseReason('');
      fetchData();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal reverse transfer';
      toast.error(msg, { duration: 6000 });
    } finally {
      setReversing(false);
    }
  }, [reverseTarget, reverseReason, fetchData]);

  // ── Edit → open form tab ──
  const openEditTab = useCallback(
    (row: TransferBankResponse) => {
      openFormTab({
        title: `Edit Transfer #${row.noTransfer}`,
        module: 'cash-bank',
        subPage: 'transfer-bank',
        formKey: 'transfer-bank-edit',
        formProps: { id: row.id, mode: 'edit' }
      });
    },
    [openFormTab]
  );

  // ── Create → open form tab ──
  const openCreateTab = useCallback(() => {
    openFormTab({
      title: 'Transfer Bank',
      module: 'cash-bank',
      subPage: 'transfer-bank',
      formKey: 'transfer-bank-create'
    });
  }, [openFormTab]);

  // ── Cetak → open cetak tab ──
  const openCetakTab = useCallback(
    (row: TransferBankResponse) => {
      openFormTab({
        title: `Cetak Transfer #${row.noTransfer}`,
        module: 'cash-bank',
        subPage: 'transfer-bank',
        formKey: 'transfer-cetak',
        formProps: { id: row.id, type: 'transfer' }
      });
    },
    [openFormTab]
  );

  const wfStates = useWorkflowStates(
    'transfer_bank',
    data.map((d) => d.id),
    refreshKey
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowRightLeft className="h-5 w-5 text-emerald-600" />
                Formulir Transfer Bank
              </CardTitle>
              <CardDescription>Lakukan transfer dana antar kas atau rekening bank</CardDescription>
            </div>
            <Button size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={openCreateTab}>
              <Plus className="h-4 w-4" /> Buat Transfer
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* History Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Riwayat Transfer Bank</CardTitle>
          <CardDescription>Daftar seluruh transfer antar kas dan rekening bank yang telah diproses</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground">Cari</Label>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Cari no transfer..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
              </div>
            </div>
            <div className="w-full sm:w-36">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="mt-1 h-9 text-sm">
                  <SelectValue placeholder="Semua" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="SELESAI">Selesai</SelectItem>
                  <SelectItem value="BATAL">Batal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-36">
              <Label className="text-xs text-muted-foreground">Dari Tanggal</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-1 h-9 text-sm" />
            </div>
            <div className="w-full sm:w-36">
              <Label className="text-xs text-muted-foreground">Sampai Tanggal</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-1 h-9 text-sm" />
            </div>
          </div>

          {/* Error */}
          {error && !loading && <ErrorCard message={error} onRetry={fetchData} />}

          {/* Table */}
          {!error && (
            <div className="max-h-96 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="whitespace-nowrap">Tanggal</TableHead>
                    <TableHead className="whitespace-nowrap">No. Dokumen</TableHead>
                    <TableHead className="whitespace-nowrap">Dari</TableHead>
                    <TableHead className="whitespace-nowrap">Ke</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Nilai</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Biaya</TableHead>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                    <TableHead className="whitespace-nowrap text-center">Workflow</TableHead>
                    <TableHead className="whitespace-nowrap text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableSkeletonRows cols={9} />
                  ) : data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-24 text-center text-muted-foreground text-sm">
                        Belum ada data
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap text-sm">{formatDate(row.tanggal)}</TableCell>
                        <TableCell className="whitespace-nowrap font-medium text-sm">{row.noTransfer}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{row.dariKasBank?.akunPerkiraan?.nama || row.dariKasBank?.nama || '-'}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{row.keKasBank?.akunPerkiraan?.nama || row.keKasBank?.nama || '-'}</TableCell>
                        <TableCell className="whitespace-nowrap text-right font-mono text-sm font-medium">{formatRp(Number(row.nilaiTransfer) || 0)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right font-mono text-sm text-muted-foreground">{Number(row.biayaTransfer) > 0 ? formatRp(Number(row.biayaTransfer)) : '-'}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <StatusBadge status={row.status} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center">
                          {(() => {
                            const w = wfStates.states[row.id];
                            if (!w) return <span className="text-xs text-muted-foreground">—</span>;
                            return (
                              <div className="flex flex-col items-center gap-1">
                                <WorkflowStateBadge state={w.state} />
                                <WorkflowActionsCell documentType={w.documentType} documentId={w.documentId} version={w.version} availableActions={w.availableActions} onDone={wfStates.refresh} />
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-1">
                            {(row.status === 'DRAFT' || row.status === 'DIPROSES') && (
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={() => openEditTab(row)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => openCetakTab(row)} title="Cetak">
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                            {row.status === 'SELESAI' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                onClick={() => {
                                  setReverseTarget(row);
                                  setReverseReason('');
                                }}
                                title="Reverse transfer (reverse jurnal & kembalikan saldo)"
                                aria-label="Reverse transfer">
                                <Undo2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {(row.status === 'DRAFT' || row.status === 'DIPROSES') && (
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => confirmCancel(row)}>
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

          {/* Pagination */}
          {!loading && !error && total > 0 && <Pagination skip={skip} total={total} onNext={() => setSkip((s) => s + PAGE_SIZE)} onPrev={() => setSkip((s) => s - PAGE_SIZE)} />}
        </CardContent>
      </Card>

      {/* Cancel Confirmation AlertDialog */}
      <AlertDialog
        open={cancelOpen}
        onOpenChange={(o) => {
          if (!o) {
            setCancelOpen(false);
            setCancelTarget(null);
          }
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan Transfer?</AlertDialogTitle>
            <AlertDialogDescription>Apakah Anda yakin ingin membatalkan transfer ini? Tindakan ini tidak dapat dibatalkan.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelSubmitting}>Tidak</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={cancelSubmitting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {cancelSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ya, Batalkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reverse Confirmation AlertDialog — Phase 6 */}
      <AlertDialog
        open={!!reverseTarget}
        onOpenChange={(o) => {
          if (!o && !reversing) {
            setReverseTarget(null);
            setReverseReason('');
          }
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverse Transfer {reverseTarget?.noTransfer}?</AlertDialogTitle>
            <AlertDialogDescription>
              Transfer ini sudah SELESAI (jurnal posted). Reverse akan:
              <br />• Reverse jurnal transfer (Dr Bank Asal / Cr Bank Tujuan / Cr Beban Transfer — pembalik)
              <br />• Mengubah status transfer menjadi BATAL
              <br />
              <br />
              <span className="text-amber-600">Catatan: Jika transfer sudah ada di periode rekonsiliasi SELESAI, saldo buku periode tsb bisa jadi tidak balance. Void rekonsiliasi SELESAI terlebih dahulu, baru reverse transfer, lalu re-rekonsiliasi.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 px-6">
            <Label htmlFor="reverse-reason-transfer">Alasan Reversal (opsional)</Label>
            <Textarea id="reverse-reason-transfer" placeholder="Contoh: Salah input / transfer gagal di bank / double transfer / dll" rows={3} maxLength={200} value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} disabled={reversing} />
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
              Ya, Reverse Transfer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Pembayaran Tab ──────────────────────────────────────────────────────

function PembayaranTab({ kasBankOptions, coaOptions, refreshKey }: { kasBankOptions: KasBankAkunResponse[]; coaOptions: COADropdownResponse[]; refreshKey?: number }) {
  // ── History data state ──
  const [data, setData] = useState<PembayaranKasResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skip, setSkip] = useState(0);

  // ── Filter state ──
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [kasBankFilter, setKasBankFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── Cancel dialog ──
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  // ── Tab store ──
  const openFormTab = useTabStore((s) => s.openFormTab);

  // ── Debounce search ──
  useEffect(() => {
    debounceTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [search]);

  // ── Reset skip when filter changes ──
  useEffect(() => {
    setSkip(0);
  }, [debouncedSearch, statusFilter, kasBankFilter, dateFrom, dateTo]);

  // ── Fetch history ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('skip', String(skip));
      params.set('limit', String(PAGE_SIZE));
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter && statusFilter !== 'ALL') params.set('status', statusFilter);
      if (kasBankFilter) params.set('kas_bank_id', kasBankFilter);
      if (dateFrom) params.set('tanggal_from', dateFrom);
      if (dateTo) params.set('tanggal_to', dateTo);

      const res = await api.get<PaginatedResponse<PembayaranKasResponse>>(`/kas-bank/pembayaran?${params.toString()}`);
      setData(res.data);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Gagal memuat data pembayaran');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, kasBankFilter, dateFrom, dateTo, skip]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  // ── Cancel ──
  const confirmCancel = useCallback((id: string) => {
    setCancelTarget(id);
    setCancelOpen(true);
  }, []);

  const handleCancel = useCallback(async () => {
    if (!cancelTarget) return;
    setCancelSubmitting(true);
    try {
      await api.post<PembayaranKasResponse>(`/kas-bank/pembayaran/${cancelTarget}/cancel`);
      toast.success('Pembayaran berhasil dibatalkan');
      setCancelOpen(false);
      setCancelTarget(null);
      fetchData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal membatalkan pembayaran');
    } finally {
      setCancelSubmitting(false);
    }
  }, [cancelTarget, fetchData]);

  // ── Create → open form tab ──
  const openCreateTab = useCallback(() => {
    openFormTab({
      title: 'Tambah Pembayaran',
      module: 'cash-bank',
      subPage: 'pembayaran',
      formKey: 'pembayaran-create'
    });
  }, [openFormTab]);

  // ── Edit → open form tab ──
  const openEditTab = useCallback(
    (id: string) => {
      openFormTab({
        title: 'Edit Pembayaran',
        module: 'cash-bank',
        subPage: 'pembayaran',
        formKey: 'pembayaran-edit',
        formProps: { id, mode: 'edit' }
      });
    },
    [openFormTab]
  );

  // ── Cetak → open cetak tab ──
  const openCetakTab = useCallback(
    (id: string) => {
      openFormTab({
        title: 'Cetak Pembayaran',
        module: 'cash-bank',
        subPage: 'pembayaran',
        formKey: 'pembayaran-cetak',
        formProps: { id, type: 'pembayaran' }
      });
    },
    [openFormTab]
  );

  const wfStates = useWorkflowStates(
    'pembayaran_kas',
    data.map((d) => d.id),
    refreshKey
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={openCreateTab}>
          <Plus className="h-4 w-4" /> Tambah Pembayaran
        </Button>
      </div>

      <HistoryTable type="pembayaran" data={data} loading={loading} error={error} search={search} onSearchChange={setSearch} statusFilter={statusFilter} onStatusFilterChange={setStatusFilter} kasBankFilter={kasBankFilter} onKasBankFilterChange={setKasBankFilter} dateFrom={dateFrom} onDateFromChange={setDateFrom} dateTo={dateTo} onDateToChange={setDateTo} skip={skip} total={total} onPrev={() => setSkip((s) => s - PAGE_SIZE)} onNext={() => setSkip((s) => s + PAGE_SIZE)} onRetry={fetchData} kasBankOptions={kasBankOptions} onCancel={confirmCancel} onEdit={openEditTab} onCetak={openCetakTab} workflowStates={wfStates.states} onWorkflowDone={wfStates.refresh} />

      {/* Cancel Confirmation AlertDialog */}
      <AlertDialog
        open={cancelOpen}
        onOpenChange={(o) => {
          if (!o) {
            setCancelOpen(false);
            setCancelTarget(null);
          }
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan Pembayaran?</AlertDialogTitle>
            <AlertDialogDescription>Apakah Anda yakin ingin membatalkan pembayaran ini? Tindakan ini tidak dapat dibatalkan.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelSubmitting}>Tidak</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={cancelSubmitting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {cancelSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ya, Batalkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Penerimaan Tab ──────────────────────────────────────────────────────

function PenerimaanTab({ kasBankOptions, coaOptions, refreshKey }: { kasBankOptions: KasBankAkunResponse[]; coaOptions: COADropdownResponse[]; refreshKey?: number }) {
  // ── History data state ──
  const [data, setData] = useState<PenerimaanKasResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skip, setSkip] = useState(0);

  // ── Filter state ──
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [kasBankFilter, setKasBankFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── Cancel dialog ──
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  // ── Tab store ──
  const openFormTab = useTabStore((s) => s.openFormTab);

  // ── Debounce search ──
  useEffect(() => {
    debounceTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [search]);

  // ── Reset skip when filter changes ──
  useEffect(() => {
    setSkip(0);
  }, [debouncedSearch, statusFilter, kasBankFilter, dateFrom, dateTo]);

  // ── Fetch history ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('skip', String(skip));
      params.set('limit', String(PAGE_SIZE));
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter && statusFilter !== 'ALL') params.set('status', statusFilter);
      if (kasBankFilter) params.set('kas_bank_id', kasBankFilter);
      if (dateFrom) params.set('tanggal_from', dateFrom);
      if (dateTo) params.set('tanggal_to', dateTo);

      const res = await api.get<PaginatedResponse<PenerimaanKasResponse>>(`/kas-bank/penerimaan?${params.toString()}`);
      setData(res.data);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Gagal memuat data penerimaan');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, kasBankFilter, dateFrom, dateTo, skip]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  // ── Cancel ──
  const confirmCancel = useCallback((id: string) => {
    setCancelTarget(id);
    setCancelOpen(true);
  }, []);

  const handleCancel = useCallback(async () => {
    if (!cancelTarget) return;
    setCancelSubmitting(true);
    try {
      await api.post<PenerimaanKasResponse>(`/kas-bank/penerimaan/${cancelTarget}/cancel`);
      toast.success('Penerimaan berhasil dibatalkan');
      setCancelOpen(false);
      setCancelTarget(null);
      fetchData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal membatalkan penerimaan');
    } finally {
      setCancelSubmitting(false);
    }
  }, [cancelTarget, fetchData]);

  // ── Create → open form tab ──
  const openCreateTab = useCallback(() => {
    openFormTab({
      title: 'Tambah Penerimaan',
      module: 'cash-bank',
      subPage: 'penerimaan',
      formKey: 'penerimaan-create'
    });
  }, [openFormTab]);

  // ── Edit → open form tab ──
  const openEditTab = useCallback(
    (id: string) => {
      openFormTab({
        title: 'Edit Penerimaan',
        module: 'cash-bank',
        subPage: 'penerimaan',
        formKey: 'penerimaan-edit',
        formProps: { id, mode: 'edit' }
      });
    },
    [openFormTab]
  );

  // ── Cetak → open cetak tab ──
  const openCetakTab = useCallback(
    (id: string) => {
      openFormTab({
        title: 'Cetak Penerimaan',
        module: 'cash-bank',
        subPage: 'penerimaan',
        formKey: 'penerimaan-cetak',
        formProps: { id, type: 'penerimaan' }
      });
    },
    [openFormTab]
  );

  const wfStates = useWorkflowStates(
    'penerimaan_kas',
    data.map((d) => d.id),
    refreshKey
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={openCreateTab}>
          <Plus className="h-4 w-4" /> Tambah Penerimaan
        </Button>
      </div>

      <HistoryTable type="penerimaan" data={data} loading={loading} error={error} search={search} onSearchChange={setSearch} statusFilter={statusFilter} onStatusFilterChange={setStatusFilter} kasBankFilter={kasBankFilter} onKasBankFilterChange={setKasBankFilter} dateFrom={dateFrom} onDateFromChange={setDateFrom} dateTo={dateTo} onDateToChange={setDateTo} skip={skip} total={total} onPrev={() => setSkip((s) => s - PAGE_SIZE)} onNext={() => setSkip((s) => s + PAGE_SIZE)} onRetry={fetchData} kasBankOptions={kasBankOptions} onCancel={confirmCancel} onEdit={openEditTab} onCetak={openCetakTab} workflowStates={wfStates.states} onWorkflowDone={wfStates.refresh} />

      {/* Cancel Confirmation AlertDialog */}
      <AlertDialog
        open={cancelOpen}
        onOpenChange={(o) => {
          if (!o) {
            setCancelOpen(false);
            setCancelTarget(null);
          }
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan Penerimaan?</AlertDialogTitle>
            <AlertDialogDescription>Apakah Anda yakin ingin membatalkan penerimaan ini? Tindakan ini tidak dapat dibatalkan.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelSubmitting}>Tidak</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={cancelSubmitting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {cancelSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ya, Batalkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Cetak Tab (PDF preview in its own tab) ──────────────────────────────

type CetakType = 'pembayaran' | 'penerimaan' | 'transfer';

function CetakTab({ type, id }: { type: CetakType; id: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // PDF template data (only one of these will be populated depending on type)
  const [transferData, setTransferData] = useState<TransferBankData | null>(null);
  const [pembayaranData, setPembayaranData] = useState<PembayaranKasData | null>(null);
  const [penerimaanData, setPenerimaanData] = useState<PenerimaanKasData | null>(null);

  // Unique element id for the PDF template (so multiple cetak tabs don't collide)
  const pdfElementId = useMemo(() => `pdf-content-${type}-${id}`, [type, id]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (type === 'transfer') {
        const res = await api.get<TransferBankResponse>(`/kas-bank/transfer/${id}`);
        setTransferData({
          noTransfer: res.noTransfer || '-',
          tanggal: res.tanggal || '',
          dariKasBank: res.dariKasBank?.akunPerkiraan?.nama || res.dariKasBank?.nama || '-',
          keKasBank: res.keKasBank?.akunPerkiraan?.nama || res.keKasBank?.nama || '-',
          nilaiTransfer: Number(res.nilaiTransfer) || 0,
          biayaTransfer: Number(res.biayaTransfer) || 0,
          keterangan: res.informasi || ''
        });
      } else if (type === 'pembayaran') {
        const res = await api.get<PembayaranKasResponse>(`/kas-bank/pembayaran/${id}`);
        setPembayaranData({
          noBukti: res.noBukti || '-',
          noBuktiFisik: res.noNukti || '-',
          tanggal: res.tanggal || '',
          kasBankNama: res.kasBank?.akunPerkiraan?.nama || res.kasBank?.nama || '-',
          penerima: res.penerima || '-',
          noCek: res.noCek || '-',
          catatan: res.catatan || '',
          rincian: (res.rincian || []).map((r) => ({
            akunKode: r.akunPerkiraan?.kode || '-',
            akunNama: r.akunPerkiraan?.nama || '-',
            nilai: Number(r.nilai) || 0
          })),
          totalNilai: Number(res.totalNilai) || 0,
          // Phase 1.B: pass alokasi supaya PDF bisa tampilkan badge "AP Settlement"
          alokasi: (res.alokasi || []).map((a) => ({
            invoiceId: a.invoiceId,
            nilai: a.nilai
          }))
        });
      } else {
        const res = await api.get<PenerimaanKasResponse>(`/kas-bank/penerimaan/${id}`);
        setPenerimaanData({
          noBukti: res.noBukti || '-',
          noBuktiFisik: res.noNukti || '-',
          tanggal: res.tanggal || '',
          kasBankNama: res.kasBank?.akunPerkiraan?.nama || res.kasBank?.nama || '-',
          pemberi: res.pemberi || '-',
          noCek: res.noCek || '-',
          catatan: res.catatan || '',
          rincian: (res.rincian || []).map((r) => ({
            akunKode: r.akunPerkiraan?.kode || '-',
            akunNama: r.akunPerkiraan?.nama || '-',
            nilai: Number(r.nilai) || 0
          })),
          totalNilai: Number(res.totalNilai) || 0,
          // Phase 1.B: pass alokasi supaya PDF bisa tampilkan badge "AR Settlement"
          alokasi: (res.alokasi || []).map((a) => ({
            invoiceId: a.invoiceId,
            nilai: a.nilai
          }))
        });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Gagal memuat data untuk dicetak');
    } finally {
      setLoading(false);
    }
  }, [type, id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const titleMap: Record<CetakType, string> = {
    pembayaran: 'Cetak Bukti Pengeluaran Kas',
    penerimaan: 'Cetak Bukti Penerimaan Kas',
    transfer: 'Cetak Bukti Transfer Bank'
  };

  const filenameMap: Record<CetakType, string> = {
    pembayaran: 'Bukti-Pengeluaran-Kas.pdf',
    penerimaan: 'Bukti-Penerimaan-Kas.pdf',
    transfer: 'Bukti-Transfer-Bank.pdf'
  };

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      await generatePDF(pdfElementId, filenameMap[type]);
      toast.success('PDF berhasil diunduh');
    } catch {
      toast.error('Gagal mengunduh PDF');
    } finally {
      setDownloading(false);
    }
  }, [pdfElementId, type]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <FormTabShell title={titleMap[type]}>
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <ErrorCard message={error} onRetry={fetchData} />
      ) : (
        <div className="space-y-4">
          {/* Action bar */}
          <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={handleDownload} disabled={downloading}>
              {downloading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
              Download PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="mr-1.5 h-4 w-4" /> Cetak
            </Button>
          </div>

          {/* PDF preview */}
          <div className="border rounded-md p-2 bg-white overflow-x-auto">
            {type === 'transfer' && transferData && <TransferBankPDFTemplate data={transferData} elementId={pdfElementId} />}
            {type === 'pembayaran' && pembayaranData && <PembayaranKasPDFTemplate data={pembayaranData} elementId={pdfElementId} />}
            {type === 'penerimaan' && penerimaanData && <PenerimaanKasPDFTemplate data={penerimaanData} elementId={pdfElementId} />}
          </div>
        </div>
      )}
    </FormTabShell>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

interface CashBankModuleProps {
  subPage?: string;
  refreshKey?: number;
  formMode?: string;
  formProps?: Record<string, unknown>;
}

export default function CashBankModule(props: CashBankModuleProps) {
  const { formMode, formProps } = props;

  // ── Cetak mode: render CetakTab in tab ──
  if (formMode && formMode.endsWith('-cetak')) {
    const id = formProps?.id as string | undefined;
    const typeRaw = formProps?.type as CetakType | undefined;
    // Derive type from formMode if not provided
    const type: CetakType = typeRaw || (formMode.startsWith('transfer') ? 'transfer' : formMode.startsWith('pembayaran') ? 'pembayaran' : 'penerimaan');
    if (id) {
      return <CetakTab type={type} id={id} />;
    }
  }

  // ── Form mode: render form component in tab (pembayaran, penerimaan, transfer) ──
  if (formMode) {
    const isEdit = formProps?.id as string | undefined;
    const mode: 'create' | 'edit' = isEdit ? 'edit' : 'create';
    if (formMode.includes('pembayaran')) {
      return <PembayaranForm mode={mode} id={isEdit} />;
    }
    if (formMode.includes('penerimaan')) {
      return <PenerimaanForm mode={mode} id={isEdit} />;
    }
    if (formMode.includes('transfer')) {
      return <TransferBankForm mode={mode} id={isEdit} />;
    }
    // rekonsiliasi-bank is handled by RekonsiliasiBankTab inside list content
  }

  return <CashBankListContent {...props} />;
}

function CashBankListContent({ subPage: subPageProp, refreshKey, formMode, formProps }: CashBankModuleProps) {
  const { activeSubPage } = useERPStore();
  const subPage = subPageProp || activeSubPage || 'pembayaran';

  // ── Dropdown data ──
  const [kasBankOptions, setKasBankOptions] = useState<KasBankAkunResponse[]>([]);
  const [coaOptions, setCoaOptions] = useState<COADropdownResponse[]>([]);
  const [dropdownLoading, setDropdownLoading] = useState(true);
  const [dropdownError, setDropdownError] = useState<string | null>(null);

  // ── Summary derived from kas-bank-dropdown (COA-based) ──
  const saldoKas = useMemo(() => kasBankOptions.filter((o) => o.jenis === 'KAS').reduce((s, o) => s + (Number(o.saldo) || 0), 0), [kasBankOptions]);
  const saldoBank = useMemo(() => kasBankOptions.filter((o) => o.jenis === 'BANK').reduce((s, o) => s + (Number(o.saldo) || 0), 0), [kasBankOptions]);
  const totalAkun = kasBankOptions.length;

  // ── Fetch dropdown data ──
  const fetchDropdowns = useCallback(async () => {
    setDropdownLoading(true);
    setDropdownError(null);
    try {
      const [kbRes, coaRes] = await Promise.all([api.get<KasBankAkunResponse[]>('/master/kas-bank-dropdown'), loadSystemCOA()]);
      setKasBankOptions(kbRes);
      setCoaOptions(coaRes);
    } catch (err) {
      setDropdownError(err instanceof ApiError ? err.detail : 'Gagal memuat data referensi');
    } finally {
      setDropdownLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDropdowns();
  }, [fetchDropdowns, refreshKey]);

  // ── PDF preview ──
  const [previewData, setPreviewData] = useState<TransferBankData | null>(null);
  const handleClosePreview = useCallback(() => {
    setPreviewData(null);
  }, []);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Kas &amp; Bank</h1>
        <p className="text-muted-foreground mt-1 text-sm">Kelola arus kas, pembayaran, penerimaan, dan transfer antar rekening</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard icon={Wallet} label="Total Saldo Kas" value={formatRp(saldoKas)} iconBgColor="bg-emerald-100" iconColor="text-emerald-600" loading={dropdownLoading} />
        <SummaryCard icon={Building2} label="Total Saldo Bank" value={formatRp(saldoBank)} iconBgColor="bg-teal-100" iconColor="text-teal-600" loading={dropdownLoading} />
        <SummaryCard icon={ArrowRightLeft} label="Total Akun Kas/Bank" value={`${totalAkun} akun`} iconBgColor="bg-amber-100" iconColor="text-amber-600" loading={dropdownLoading} />
      </div>

      {dropdownError && !dropdownLoading && <ErrorCard message={dropdownError} onRetry={fetchDropdowns} />}

      {!dropdownError && (
        <>
          {subPage === 'pembayaran' && <PembayaranTab kasBankOptions={kasBankOptions} coaOptions={coaOptions} refreshKey={refreshKey} />}
          {subPage === 'penerimaan' && <PenerimaanTab kasBankOptions={kasBankOptions} coaOptions={coaOptions} refreshKey={refreshKey} />}
          {subPage === 'transfer-bank' && <TransferBankTab kasBankOptions={kasBankOptions} onPreview={setPreviewData} refreshKey={refreshKey} />}
          {subPage === 'rekonsiliasi-bank' && <RekonsiliasiBankTab formMode={formMode} formProps={formProps} refreshKey={refreshKey} />}
        </>
      )}

      <PDFPreviewDialog open={previewData !== null} onClose={handleClosePreview} data={previewData} />
    </div>
  );
}
