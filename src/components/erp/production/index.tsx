'use client';

/**
 * PRODUKSI — Modul ERP Asahi Books.
 *
 * Sub-page:
 * - 'request-order-part' (ROP): form pre-PO yang diajukan Engineering
 *   sebelum masuk ke Purchasing.
 *
 * Arsitektur MDI tabbed SPA: komponen ini menerima { subPage, refreshKey,
 * formMode, formProps } dari shell (src/app/page.tsx). formMode = formKey
 * tab form ('rop-create' | 'rop-edit' | 'rop-view' | 'rop-cetak').
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Plus, ChevronLeft, ChevronRight, Pencil, Printer, Trash2, Eye, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { api, PaginatedResponse, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/pdf-utils';
import { useERPStore } from '@/store/erp-store';
import { useTabStore } from '@/store/tab-store';
import { useAccessStore } from '@/store/access-store';
import { HardDeleteCancelDialog } from '@/components/erp/hard-delete-cancel-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { RequestOrderPartForm } from '@/components/erp/production/request-order-part-form';
import { RequestOrderPartCetakTab } from '@/components/erp/production/request-order-part-print';
import type { RequestOrderPartListRow, RequestOrderPartStatus } from '@/types/api';

// ─── Konstanta ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 100;

const PERM = {
  create: 'production.request_order_part.create',
  edit: 'production.request_order_part.edit',
  cancel: 'production.request_order_part.cancel',
  print: 'production.request_order_part.print'
} as const;

// ─── Helpers bersama ─────────────────────────────────────────────────────────

function RopStatusBadge({ status }: { status: RequestOrderPartStatus }) {
  if (status === 'DISETUJUI') {
    return <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Disetujui</span>;
  }
  return <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">Draft</span>;
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-destructive">
      <CardContent className="p-4">
        <p className="text-sm font-medium text-destructive">{message}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          Coba Lagi
        </Button>
      </CardContent>
    </Card>
  );
}

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

function Pagination({ skip, total, onNext, onPrev }: { skip: number; total: number; onNext: () => void; onPrev: () => void }) {
  const currentPage = Math.floor(skip / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasNext = skip + PAGE_SIZE < total;
  const hasPrev = skip > 0;
  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
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

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    timer.current = setTimeout(() => setDebounced(value), delay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, delay]);
  return debounced;
}

// ═════════════════════════════════════════════════════════════════════════════
// List: Request Order Part
// ═════════════════════════════════════════════════════════════════════════════

function RequestOrderPartTab({ refreshKey }: { refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);
  const can = useAccessStore((s) => s.can);

  const [data, setData] = useState<RequestOrderPartListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [skip, setSkip] = useState(0);

  const [cancelTarget, setCancelTarget] = useState<RequestOrderPartListRow | null>(null);
  const [canceling, setCanceling] = useState(false);

  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    setSkip(0);
  }, [debouncedSearch, statusFilter]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('skip', String(skip));
      params.set('limit', String(PAGE_SIZE));
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter) params.set('status', statusFilter);
      const res = await api.get<PaginatedResponse<RequestOrderPartListRow>>(`/produksi/request-order-part?${params.toString()}`);
      setData(res.data);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Gagal memuat data Request Order Part');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, skip]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const openView = useCallback(
    (row: RequestOrderPartListRow) => {
      openFormTab({
        title: row.noRop,
        module: 'production',
        subPage: 'request-order-part',
        formKey: 'rop-view',
        formProps: { ropId: row.id }
      });
    },
    [openFormTab]
  );

  const openEdit = useCallback(
    (row: RequestOrderPartListRow) => {
      openFormTab({
        title: `Edit ${row.noRop}`,
        module: 'production',
        subPage: 'request-order-part',
        formKey: 'rop-edit',
        formProps: { ropId: row.id }
      });
    },
    [openFormTab]
  );

  const openCetak = useCallback(
    (row: RequestOrderPartListRow) => {
      openFormTab({
        title: `Cetak ${row.noRop}`,
        module: 'production',
        subPage: 'request-order-part',
        formKey: 'rop-cetak',
        formProps: { ropId: row.id }
      });
    },
    [openFormTab]
  );

  // Hapus / batalkan dokumen dari list (hard delete + alasan).
  const handleCancelDoc = async (reason: string) => {
    if (!cancelTarget) return;
    setCanceling(true);
    try {
      await api.post(`/produksi/request-order-part/${cancelTarget.id}/cancel`, { reason });
      toast.success('Dokumen ROP dibatalkan', { description: `${cancelTarget.noRop} dihapus permanen; jejak tersimpan di modul Histori.` });
      setCancelTarget(null);
      refreshListTab('production', 'request-order-part');
      fetchData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal membatalkan dokumen');
    } finally {
      setCanceling(false);
    }
  };

  const LIST_COLS = 9;

  return (
    <>
      {/* Toolbar: search + filter status + buat ROP */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">Daftar Request Order Part</CardTitle>
            {can(PERM.create) && (
              <Button
                size="sm"
                className="gap-2"
                onClick={() =>
                  openFormTab({
                    title: 'ROP Baru',
                    module: 'production',
                    subPage: 'request-order-part',
                    formKey: 'rop-create'
                  })
                }>
                <Plus className="h-4 w-4" /> Buat ROP
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-0">
          <div className="flex flex-col gap-3 px-6 pb-2 pt-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Cari no ROP / project / model / no SO / customer..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Cari Request Order Part" />
            </div>
            <Select value={statusFilter || 'semua'} onValueChange={(v) => setStatusFilter(v === 'semua' ? '' : v)}>
              <SelectTrigger className="w-full sm:w-[160px]" aria-label="Filter status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="semua">Semua Status</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="DISETUJUI">Disetujui</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">No ROP</TableHead>
                  <TableHead className="whitespace-nowrap">Tanggal</TableHead>
                  <TableHead className="whitespace-nowrap">Project Name</TableHead>
                  <TableHead className="whitespace-nowrap">Model</TableHead>
                  <TableHead className="whitespace-nowrap">Customer</TableHead>
                  <TableHead className="whitespace-nowrap">No SO</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Total Item</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableSkeletonRows cols={LIST_COLS} />}
                {error && (
                  <TableRow>
                    <TableCell colSpan={LIST_COLS}>
                      <ErrorCard message={error} onRetry={fetchData} />
                    </TableCell>
                  </TableRow>
                )}
                {!loading && !error && data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={LIST_COLS}>
                      <EmptyState icon={ClipboardList} title="Belum ada Request Order Part" description={search || statusFilter ? 'Tidak ada dokumen yang cocok dengan filter.' : 'Dokumen pre-PO dari Engineering akan tampil di sini.'} action={can(PERM.create) ? { label: 'Buat ROP', onClick: () => openFormTab({ title: 'ROP Baru', module: 'production', subPage: 'request-order-part', formKey: 'rop-create' }) } : undefined} />
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  !error &&
                  data.map((row) => (
                    <TableRow key={row.id} className="cursor-pointer" onClick={() => openView(row)}>
                      <TableCell className="whitespace-nowrap font-mono text-xs font-medium">{row.noRop}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(row.tanggal)}</TableCell>
                      <TableCell className="max-w-[220px] truncate font-medium" title={row.projectName}>
                        {row.projectName || '-'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{row.model || '-'}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={row.pelanggan?.nama || ''}>
                        {row.pelanggan?.nama || '-'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">{row.salesOrder?.noPesanan || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">{row.totalItem}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <RopStatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => openView(row)} title="Lihat" aria-label={`Lihat ${row.noRop}`}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {row.status === 'DRAFT' && can(PERM.edit) && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => openEdit(row)} title="Edit" aria-label={`Edit ${row.noRop}`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {can(PERM.print) && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => openCetak(row)} title="Cetak" aria-label={`Cetak ${row.noRop}`}>
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {can(PERM.cancel) && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => setCancelTarget(row)} title="Hapus / Batalkan Dokumen" aria-label={`Hapus ${row.noRop}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="border-t px-6 py-4">
            <Pagination skip={skip} total={total} onPrev={() => setSkip(Math.max(0, skip - PAGE_SIZE))} onNext={() => setSkip(skip + PAGE_SIZE)} />
          </div>
        </CardContent>
      </Card>

      {/* Dialog alasan pembatalan dari list */}
      <HardDeleteCancelDialog
        open={!!cancelTarget}
        onOpenChange={(o) => {
          if (!o) setCancelTarget(null);
        }}
        title="Batalkan Dokumen ROP?"
        formLabel={`ROP ${cancelTarget?.noRop || ''}`}
        submitting={canceling}
        onConfirm={handleCancelDoc}
      />
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Main Component
// ═════════════════════════════════════════════════════════════════════════════

interface ProductionModuleProps {
  subPage?: string;
  refreshKey?: number;
  formMode?: string;
  formProps?: Record<string, unknown>;
}

export default function ProductionModule({ subPage: propsSubPage, refreshKey, formMode, formProps }: ProductionModuleProps) {
  const activeSubPage = useERPStore((s) => s.activeSubPage);
  const subPage = propsSubPage || activeSubPage || 'request-order-part';

  // ── Form mode: render form di dalam tab ──
  if (formMode) {
    const ropId = formProps?.ropId as string | undefined;

    if (formMode === 'rop-create') {
      return <RequestOrderPartForm mode="create" />;
    }
    if (formMode === 'rop-edit') {
      if (!ropId) {
        return <div className="p-6 text-sm text-muted-foreground">ID ROP tidak ditemukan. Tutup tab ini dan coba lagi.</div>;
      }
      return <RequestOrderPartForm mode="edit" ropId={ropId} />;
    }
    if (formMode === 'rop-view') {
      if (!ropId) {
        return <div className="p-6 text-sm text-muted-foreground">ID ROP tidak ditemukan. Tutup tab ini dan coba lagi.</div>;
      }
      return <RequestOrderPartForm mode="view" ropId={ropId} />;
    }
    if (formMode === 'rop-cetak') {
      if (!ropId) {
        return <div className="p-6 text-sm text-muted-foreground">ID ROP tidak ditemukan. Tutup tab ini dan coba lagi.</div>;
      }
      return <RequestOrderPartCetakTab id={ropId} />;
    }
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Request Order Part</h1>
        <p className="text-muted-foreground">Form pre-PO yang diajukan Engineering sebelum masuk ke Purchasing</p>
      </div>

      {subPage === 'request-order-part' && <RequestOrderPartTab refreshKey={refreshKey} />}
    </div>
  );
}
