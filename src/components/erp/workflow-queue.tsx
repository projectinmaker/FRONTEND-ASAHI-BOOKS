'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ClipboardCheck, RefreshCw, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { formatRp, formatDate } from '@/lib/pdf-utils';
import { workflowApi } from '@/lib/workflow-api';
import type { WorkflowQueueItem, WorkflowState } from '@/types/api';
import { WorkflowStateBadge, WorkflowActionsCell } from '@/components/erp/workflow-components';

const PAGE_SIZE = 100;

const STATE_FILTERS: { value: WorkflowState | 'ALL'; label: string }[] = [
  { value: 'PENDING', label: 'Menunggu Persetujuan' },
  { value: 'APPROVED', label: 'Disetujui' },
  { value: 'REJECTED', label: 'Ditolak' },
  { value: 'ALL', label: 'Semua' }
];

// Mapping of backend document_type → user-friendly label
const DOC_TYPE_LABEL: Record<string, string> = {
  sales_order: 'Pesanan Penjualan',
  pengiriman_barang: 'Pengiriman Barang',
  sales_invoice: 'Invoice Penjualan',
  sales_retur: 'Retur Penjualan',
  purchase_order: 'Pesanan Pembelian',
  penerimaan_barang: 'Penerimaan Barang',
  purchase_invoice: 'Invoice Pembelian',
  purchase_retur: 'Retur Pembelian',
  transfer_bank: 'Transfer Bank',
  pembayaran_kas: 'Pembayaran Kas',
  penerimaan_kas: 'Penerimaan Kas',
  penyesuaian_stok: 'Penyesuaian Stok',
  pemindahan_barang: 'Pemindahan Barang',
  permintaan_barang: 'Permintaan Barang',
  jurnal_umum: 'Jurnal Umum'
};

function docTypeLabel(t: string): string {
  return DOC_TYPE_LABEL[t] || t;
}

export default function WorkflowQueuePage() {
  const [data, setData] = React.useState<WorkflowQueueItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [stateFilter, setStateFilter] = React.useState<WorkflowState | 'ALL'>('PENDING');
  const [refreshKey, setRefreshKey] = React.useState(0);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const state = stateFilter === 'ALL' ? 'PENDING' : stateFilter;
      const res = await workflowApi.getQueue(state, 0, PAGE_SIZE);
      let items = res.data || [];
      // When 'ALL' is selected we only fetched PENDING — fetch more states in parallel
      if (stateFilter === 'ALL') {
        const [appr, rej] = await Promise.all([workflowApi.getQueue('APPROVED', 0, PAGE_SIZE).catch(() => ({ data: [] as WorkflowQueueItem[], total: 0 })), workflowApi.getQueue('REJECTED', 0, PAGE_SIZE).catch(() => ({ data: [] as WorkflowQueueItem[], total: 0 }))]);
        items = [...items, ...(appr.data || []), ...(rej.data || [])];
      }
      setData(items);
      setTotal(stateFilter === 'ALL' ? items.length : res.total);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gagal memuat data antrean';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [stateFilter]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData, refreshKey]);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6" />
            Antrean Persetujuan
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Kelola dokumen yang menunggu persetujuan, ditolak, atau sudah disetujui</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={stateFilter} onValueChange={(v) => setStateFilter(v as WorkflowState | 'ALL')}>
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATE_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setRefreshKey((k) => k + 1)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="ml-1.5">Muat ulang</span>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Daftar Dokumen</CardTitle>
          <CardDescription>{loading ? 'Memuat...' : `${data.length} dokumen ditampilkan`}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && !loading && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
              <Button variant="outline" size="sm" className="ml-auto" onClick={() => setRefreshKey((k) => k + 1)}>
                Coba lagi
              </Button>
            </div>
          )}

          {!error && (
            <div className="max-h-[70vh] overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 sticky top-0">
                    <TableHead className="w-[160px]">No Dokumen</TableHead>
                    <TableHead className="w-[180px]">Tipe Dokumen</TableHead>
                    <TableHead className="w-[110px] text-center">Status</TableHead>
                    <TableHead className="text-right w-[140px]">Total</TableHead>
                    <TableHead>Dibuat Oleh</TableHead>
                    <TableHead className="w-[110px]">Tanggal</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-5 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        Tidak ada dokumen pada status ini.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((row) => (
                      <TableRow key={`${row.documentType}:${row.documentId}`}>
                        <TableCell className="font-mono text-xs font-medium">{row.documentNumber}</TableCell>
                        <TableCell className="text-xs">{docTypeLabel(row.documentType)}</TableCell>
                        <TableCell className="text-center">
                          <WorkflowStateBadge state={row.state} />
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-medium">{row.total ? formatRp(Number(row.total)) : '-'}</TableCell>
                        <TableCell className="text-xs">{row.createdBy || '-'}</TableCell>
                        <TableCell className="text-xs">{formatDate(row.tanggal)}</TableCell>
                        <TableCell className="text-right">
                          <WorkflowActionsCell documentType={row.documentType} documentId={row.documentId} version={row.version} availableActions={stateFilter === 'REJECTED' ? [] : deriveActions(row.state)} onDone={() => setRefreshKey((k) => k + 1)} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {!loading && !error && <p className="text-sm text-muted-foreground">Total: {total} dokumen</p>}
        </CardContent>
      </Card>
    </div>
  );
}

// Quick local action derivation for queue display.
// The backend's WorkflowQueueItem doesn't carry availableActions, so we infer
// the most common ones based on state — the actual allowed set is enforced by the
// backend when the action is performed.
function deriveActions(state: WorkflowState): ('submit' | 'approve' | 'reject' | 'withdraw' | 'post' | 'execute' | 'cancel')[] {
  switch (state) {
    case 'PENDING':
      return ['approve', 'reject', 'withdraw'];
    case 'APPROVED':
      return ['post', 'cancel'];
    case 'REJECTED':
      return [];
    case 'DRAFT':
      return ['submit', 'cancel'];
    case 'POSTED':
    case 'EXECUTED':
    case 'CANCELLED':
    default:
      return [];
  }
}
