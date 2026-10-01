'use client';

// ═════════════════════════════════════════════════════════════════════════════
// TUKAR FAKTUR / TANDA TERIMA (proof of receipt) — modul baru update #4.
// Komponen self-contained (list + form create/edit + cetak + PDF template),
// mirror pola Penawaran (penawaran.tsx, update #3) + helper PDF
// sales/pdf-templates.tsx (helper privat disalin — file itu milik agent lain).
// Dipasang di app/page.tsx (routing subPage 'tukar-faktur');
// sales/index.tsx TIDAK disentuh.
// ═════════════════════════════════════════════════════════════════════════════

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { FileCheck, Plus, Search, ChevronLeft, ChevronRight, Loader2, Pencil, Printer, Download, Info } from 'lucide-react';
import { formatRp, formatNumber, formatDate, todayStr, generatePDF, terbilang, COMPANY_INFO } from '@/lib/pdf-utils';
import { api, PaginatedResponse, ApiError } from '@/lib/api';
import { toast } from 'sonner';
import { useTabStore } from '@/store/tab-store';
import { FormTabShell } from '@/components/erp/form-tab-shell';
import { HardDeleteCancelDialog } from '@/components/erp/hard-delete-cancel-dialog';
import type { TukarFakturResponse, TukarFakturCreate, TukarFakturUpdate, SalesInvoiceResponse, HardDeleteResponse } from '@/types/api';

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 100;

// ─── Status Badge (mirror PenawaranStatusBadge penawaran.tsx) ───────────────

function TukarFakturStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'DRAFT':
      return <Badge className="border-yellow-200 bg-yellow-100 text-yellow-700 hover:bg-yellow-100">Draft</Badge>;
    case 'SELESAI':
      return <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Selesai</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

// ─── Shared UI (mirror penawaran.tsx) ───────────────────────────────────────

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

// ─── Panel info read-only (dipakai form create/edit) ────────────────────────

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="min-w-[120px] text-muted-foreground">{label}</span>
      <span className="font-medium">{value || '-'}</span>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PDF TEMPLATE: TukarFakturPDFTemplate (helper privat mirror pdf-templates.tsx)
// ═════════════════════════════════════════════════════════════════════════════

interface TukarFakturDetailRow {
  id: string;
  nama: string;
  qty: number;
  satuan: string;
}

interface TukarFakturPDFData {
  noTukarFaktur: string;
  tanggal: string;
  noInvoice: string;
  noSo: string;
  noPoCustomer: string;
  noSuratJalan: string;
  pelangganNama: string;
  total: number;
  keterangan: string;
  details: TukarFakturDetailRow[];
}

const rootStyle: React.CSSProperties = {
  fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
  fontSize: '11px',
  lineHeight: '1.4'
};

const tableStyle: React.CSSProperties = {
  borderCollapse: 'collapse',
  width: '100%'
};

const cellStyle: React.CSSProperties = {
  border: '1px solid #333',
  padding: '4px 8px'
};

const headerCellStyle: React.CSSProperties = {
  ...cellStyle,
  backgroundColor: '#f3f4f6',
  fontWeight: 'bold',
  textAlign: 'center' as const
};

function LogoPlaceholder() {
  return <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center text-gray-500 text-xs font-bold shrink-0">LOGO</div>;
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1" style={{ fontSize: '11px' }}>
      <span style={{ minWidth: '130px', whiteSpace: 'nowrap' }}>
        <strong>{label}</strong>
      </span>
      <span style={{ minWidth: '12px' }}>:</span>
      <span>{value || '-'}</span>
    </div>
  );
}

export function TukarFakturPDFTemplate({ data }: { data: TukarFakturPDFData }) {
  return (
    <div id="pdf-content" className="bg-white text-black p-8 min-w-[210mm]" style={rootStyle}>
      {/* ── Header ── */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-start gap-4">
          <LogoPlaceholder />
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{COMPANY_INFO.name}</div>
            <div>{COMPANY_INFO.address}</div>
          </div>
        </div>
        <div style={{ fontSize: '20px', fontWeight: 'bold' }}>Tukar Faktur / Tanda Terima</div>
      </div>

      {/* ── Info Section ── */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div style={{ marginBottom: '2px' }}>
            <strong>Kepada</strong>
          </div>
          <div style={{ marginBottom: '2px' }}>{data.pelangganNama}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <InfoCell label="No. Tukar Faktur" value={data.noTukarFaktur} />
          <InfoCell label="Tanggal" value={formatDate(data.tanggal)} />
          <InfoCell label="No. Invoice" value={data.noInvoice} />
          <InfoCell label="No. SO" value={data.noSo} />
          <InfoCell label="No. PO" value={data.noPoCustomer} />
          <InfoCell label="No. Surat Jalan" value={data.noSuratJalan} />
        </div>
      </div>

      {/* ── Detail Table (TANPA harga) ── */}
      <div className="mb-4">
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...headerCellStyle, width: '40px' }}>No</th>
              <th style={headerCellStyle}>Nama Barang</th>
              <th style={{ ...headerCellStyle, width: '80px' }}>Qty</th>
              <th style={{ ...headerCellStyle, width: '100px' }}>Satuan</th>
            </tr>
          </thead>
          <tbody>
            {data.details.map((row, i) => (
              <tr key={row.id}>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{i + 1}</td>
                <td style={cellStyle}>{row.nama}</td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{formatNumber(row.qty)}</td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{row.satuan || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Total Faktur + Terbilang ── */}
      <div className="mb-4">
        <div style={{ fontWeight: 'bold' }}>Total Faktur: {formatRp(data.total)}</div>
        <div style={{ fontStyle: 'italic', marginTop: '2px' }}>Terbilang: {terbilang(data.total)}</div>
        {data.keterangan && (
          <div style={{ marginTop: '8px' }}>
            <strong>Keterangan:</strong>
            <div style={{ whiteSpace: 'pre-wrap' }}>{data.keterangan}</div>
          </div>
        )}
      </div>

      {/* ── Kalimat pernyataan ── */}
      <div style={{ fontStyle: 'italic', marginTop: '12px' }}>Saya telah menerima barang &amp; faktur tersebut dalam keadaan baik dan lengkap.</div>

      {/* ── Signatures ── */}
      <div className="grid grid-cols-2 gap-8 mt-10" style={{ textAlign: 'center' }}>
        <div>
          <div>Yang Menyerahkan</div>
          <div style={{ marginTop: '48px' }}>______</div>
          <div>Tgl.</div>
        </div>
        <div>
          <div>Yang Menerima</div>
          <div style={{ marginTop: '48px' }}>______</div>
          <div>Tgl.</div>
        </div>
      </div>
    </div>
  );
}

function mapTukarFakturPDFData(d: TukarFakturResponse): TukarFakturPDFData {
  return {
    noTukarFaktur: d.noTukarFaktur || '',
    tanggal: d.tanggal || '',
    noInvoice: d.salesInvoice?.noInvoice || '',
    noSo: d.noSo || '',
    noPoCustomer: d.noPoCustomer || '',
    noSuratJalan: d.noSuratJalan || '',
    pelangganNama: d.pelanggan?.nama || '',
    total: Number(d.total) || 0,
    keterangan: d.keterangan || '',
    details: (d.details || []).map<TukarFakturDetailRow>((r) => ({
      id: r.id,
      nama: r.barang?.nama || '',
      qty: Number(r.qty) || 0,
      satuan: r.satuan?.nama || ''
    }))
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB LIST: TukarFakturTab
// ═════════════════════════════════════════════════════════════════════════════

export function TukarFakturTab({ refreshKey }: { refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab);

  const [data, setData] = useState<TukarFakturResponse[]>([]);
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
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ skip: String(skip), limit: String(PAGE_SIZE) });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter && statusFilter !== 'ALL') params.set('status', statusFilter);
      if (dateFrom) params.set('tanggal_from', dateFrom);
      if (dateTo) params.set('tanggal_to', dateTo);
      const res = await api.get<PaginatedResponse<TukarFakturResponse>>(`/penjualan/tukar-faktur?${params}`);
      setData(res.data);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [skip, debouncedSearch, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setSkip(0);
  }, []);

  // ── Hapus = Hard Delete (mirror PenawaranTab) ──
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const handleCancel = useCallback(
    async (reason?: string) => {
      if (!cancelTarget) return;
      setCancelSubmitting(true);
      try {
        const res = await api.post<HardDeleteResponse>(`/penjualan/tukar-faktur/${cancelTarget}/cancel`, {
          reason: reason || undefined
        });
        toast.success(res.message || 'Tukar Faktur dihapus permanen');
        setCancelTarget(null);
        fetchData();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.detail : 'Gagal menghapus tukar faktur');
      } finally {
        setCancelSubmitting(false);
      }
    },
    [cancelTarget, fetchData]
  );

  // ── Selesaikan: DRAFT → SELESAI ──
  const [selesaikanTarget, setSelesaikanTarget] = useState<TukarFakturResponse | null>(null);
  const [selesaikanSubmitting, setSelesaikanSubmitting] = useState(false);

  const handleSelesaikan = useCallback(async () => {
    if (!selesaikanTarget) return;
    setSelesaikanSubmitting(true);
    try {
      const res = await api.post<{ id: string; noTukarFaktur: string }>(`/penjualan/tukar-faktur/${selesaikanTarget.id}/selesaikan`);
      toast.success(`Tukar Faktur ${res.noTukarFaktur} ditandai selesai`);
      setSelesaikanTarget(null);
      fetchData();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Gagal menyelesaikan tukar faktur');
    } finally {
      setSelesaikanSubmitting(false);
    }
  }, [selesaikanTarget, fetchData]);

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card className="border-emerald-200 bg-emerald-50/50">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <FileCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-emerald-600 font-medium">Total Tukar Faktur</p>
            {loading ? <Skeleton className="mt-1 h-6 w-16" /> : <p className="text-2xl font-bold text-emerald-700">{total}</p>}
          </div>
        </CardContent>
      </Card>

      {/* List Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Daftar Tukar Faktur</CardTitle>
              <CardDescription>Daftar tanda terima tukar faktur (proof of receipt) yang telah dibuat</CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() =>
                openFormTab({
                  title: 'Buat Tukar Faktur',
                  module: 'sales',
                  subPage: 'tukar-faktur',
                  formKey: 'tukar-faktur-create'
                })
              }>
              <Plus className="mr-1.5 h-4 w-4" /> Buat Tukar Faktur
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
                <Input placeholder="Cari no tukar faktur/pelanggan..." value={search} onChange={(e) => handleSearchChange(e.target.value)} className="pl-8 h-9 text-sm" />
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
                </SelectContent>
              </Select>
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
                    <TableHead className="w-[140px]">No TF</TableHead>
                    <TableHead className="w-[100px]">Tanggal</TableHead>
                    <TableHead>Pelanggan</TableHead>
                    <TableHead className="w-[130px]">No Invoice</TableHead>
                    <TableHead className="w-[120px]">No SO</TableHead>
                    <TableHead className="w-[130px]">No PO</TableHead>
                    <TableHead className="w-[120px]">No Surat Jalan</TableHead>
                    <TableHead className="w-[120px] text-right">Total</TableHead>
                    <TableHead className="w-[90px] text-center">Status</TableHead>
                    <TableHead className="w-[210px] text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <SkeletonRows cols={10} />
                  ) : data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                        Tidak ada data tukar faktur.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-xs font-medium">{d.noTukarFaktur}</TableCell>
                        <TableCell className="text-xs">{formatDate(d.tanggal)}</TableCell>
                        <TableCell className="text-xs">{d.pelanggan?.nama || '-'}</TableCell>
                        <TableCell className="font-mono text-xs">{d.salesInvoice?.noInvoice || '-'}</TableCell>
                        <TableCell className="font-mono text-xs">{d.noSo || '-'}</TableCell>
                        <TableCell className="font-mono text-xs">{d.noPoCustomer || '-'}</TableCell>
                        <TableCell className="font-mono text-xs">{d.noSuratJalan || '-'}</TableCell>
                        <TableCell className="text-right font-mono text-xs font-medium">{formatRp(Number(d.total) || 0)}</TableCell>
                        <TableCell className="text-center">
                          <TukarFakturStatusBadge status={d.status} />
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
                                    title: `Edit ${d.noTukarFaktur}`,
                                    module: 'sales',
                                    subPage: 'tukar-faktur',
                                    formKey: 'tukar-faktur-edit',
                                    formProps: { id: d.id }
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
                                  title: `Cetak ${d.noTukarFaktur}`,
                                  module: 'sales',
                                  subPage: 'tukar-faktur',
                                  formKey: 'tukar-faktur-cetak',
                                  formProps: { id: d.id }
                                })
                              }
                              title="Cetak">
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                            {d.status === 'DRAFT' && (
                              <>
                                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setSelesaikanTarget(d)} title="Tandai sebagai selesai">
                                  Selesaikan
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => setCancelTarget(d.id)}>
                                  Hapus
                                </Button>
                              </>
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
        title="Hapus Tukar Faktur?"
        formLabel="tukar faktur"
        submitting={cancelSubmitting}
        onConfirm={(r) => handleCancel(r)}
      />

      {/* Konfirmasi Selesaikan */}
      <AlertDialog
        open={!!selesaikanTarget}
        onOpenChange={(o) => {
          if (!o) setSelesaikanTarget(null);
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Selesaikan Tukar Faktur?</AlertDialogTitle>
            <AlertDialogDescription>
              Tandai Tukar Faktur <span className="font-mono font-semibold text-foreground">{selesaikanTarget?.noTukarFaktur}</span> sebagai selesai? Setelah selesai, dokumen menjadi baca saja dan hanya bisa dicetak.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={selesaikanSubmitting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // jangan tutup otomatis — handler menutup setelah sukses
                void handleSelesaikan();
              }}
              disabled={selesaikanSubmitting}>
              {selesaikanSubmitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Ya, Tandai Selesai
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FORM CREATE: TukarFakturCreateForm
// ═════════════════════════════════════════════════════════════════════════════

export function TukarFakturCreateForm() {
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [fSalesInvoiceId, setFSalesInvoiceId] = useState('');
  const [fTanggal, setFTanggal] = useState(todayStr());
  const [fKeterangan, setFKeterangan] = useState('');

  // ── Dropdown invoice + preview invoice terpilih ──
  const [invoiceOptions, setInvoiceOptions] = useState<SalesInvoiceResponse[]>([]);
  const [ddLoading, setDdLoading] = useState(true);
  const [preview, setPreview] = useState<SalesInvoiceResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setDdLoading(true);
      try {
        const res = await api.get<PaginatedResponse<SalesInvoiceResponse>>('/penjualan/sales-invoice?limit=200');
        if (cancelled) return;
        // Exclude invoice DIBATALKAN — tidak bisa jadi sumber tukar faktur.
        setInvoiceOptions((res.data || []).filter((inv) => inv.status !== 'DIBATALKAN'));
      } catch {
        // Silently fail — dropdown akan kosong
      } finally {
        if (!cancelled) setDdLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Ganti invoice → muat ulang panel preview.
  useEffect(() => {
    if (!fSalesInvoiceId) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    async function load() {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const res = await api.get<SalesInvoiceResponse>(`/penjualan/sales-invoice/${fSalesInvoiceId}`);
        if (cancelled) return;
        setPreview(res);
      } catch (e) {
        if (cancelled) return;
        setPreview(null);
        setPreviewError(e instanceof Error ? e.message : 'Gagal memuat invoice');
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [fSalesInvoiceId]);

  const handleSubmit = useCallback(async () => {
    const errs: Record<string, string> = {};
    if (!fSalesInvoiceId) errs.salesInvoiceId = 'Invoice penjualan wajib dipilih';
    if (!fTanggal) errs.tanggal = 'Tanggal wajib diisi';
    if (Object.keys(errs).length) {
      setFormErrors(errs);
      return;
    }
    setSubmitting(true);
    try {
      const body: TukarFakturCreate = {
        tanggal: fTanggal,
        salesInvoiceId: fSalesInvoiceId,
        keterangan: fKeterangan || null
      };
      const res = await api.post<TukarFakturResponse>('/penjualan/tukar-faktur', body);
      toast.success(`Tukar Faktur ${res.noTukarFaktur} berhasil dibuat`);
      refreshListTab('sales', 'tukar-faktur');
      if (activeTabId) closeTab(activeTabId);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Gagal menyimpan tukar faktur');
    } finally {
      setSubmitting(false);
    }
  }, [fSalesInvoiceId, fTanggal, fKeterangan, activeTabId, closeTab, refreshListTab]);

  const loading = ddLoading;

  if (loading) {
    return (
      <FormTabShell title="Buat Tukar Faktur">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </FormTabShell>
    );
  }

  return (
    <FormTabShell title="Buat Tukar Faktur">
      <Card className="max-w-5xl">
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">Pilih invoice penjualan yang ditukar — snapshot (pelanggan, referensi SO/PO/SJ, total, barang) diambil otomatis dari invoice.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Invoice Penjualan <span className="text-destructive">*</span>
              </Label>
              <SearchableDropdown
                value={fSalesInvoiceId}
                onValueChange={(v) => {
                  setFSalesInvoiceId(v);
                  setFormErrors((p) => ({ ...p, salesInvoiceId: '' }));
                }}
                options={invoiceOptions.map((inv) => ({ id: inv.id, label: inv.noInvoice, subtitle: inv.pelanggan?.nama || undefined }))}
                placeholder="Pilih invoice..."
              />
              {formErrors.salesInvoiceId && <p className="text-xs text-destructive mt-1">{formErrors.salesInvoiceId}</p>}
            </div>
            <div className="space-y-1.5">
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
          </div>

          {/* Panel read-only preview invoice terpilih */}
          {previewLoading && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Memuat detail invoice...
            </div>
          )}
          {previewError && !previewLoading && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{previewError}</p>}
          {preview && !previewLoading && (
            <div className="space-y-3 rounded-md border bg-muted/20 p-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Info className="h-3.5 w-3.5" /> Ringkasan Invoice {preview.noInvoice}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <InfoLine label="Pelanggan" value={preview.pelanggan?.nama || '-'} />
                <InfoLine label="No SO" value={preview.salesOrder?.noPesanan || '-'} />
                <InfoLine label="No PO Customer" value={preview.salesOrder?.customerPoNumber || '-'} />
                <InfoLine label="No Surat Jalan" value={preview.noSuratJalan || '-'} />
                <InfoLine label="Total Invoice" value={formatRp(Number(preview.grandTotal) || 0)} />
              </div>
              <div className="max-h-48 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Nama Barang</TableHead>
                      <TableHead className="w-[100px] text-right">Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(preview.details || []).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs">{r.barang?.nama || '-'}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatNumber(Number(r.qty) || 0)}</TableCell>
                      </TableRow>
                    ))}
                    {(preview.details || []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="h-10 text-center text-muted-foreground text-xs">
                          Tidak ada detail barang.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Keterangan</Label>
            <Textarea className="text-xs min-h-[60px]" value={fKeterangan} onChange={(e) => setFKeterangan(e.target.value)} placeholder="Catatan tambahan..." />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting}>
              Batal
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileCheck className="mr-1.5 h-4 w-4" />}
              {submitting ? 'Menyimpan...' : 'Simpan Tukar Faktur'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </FormTabShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FORM EDIT: TukarFakturEditForm (hanya Tanggal + Keterangan; sisanya snapshot)
// ═════════════════════════════════════════════════════════════════════════════

export function TukarFakturEditForm({ id }: { id: string }) {
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const [doc, setDoc] = useState<TukarFakturResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [fTanggal, setFTanggal] = useState('');
  const [fKeterangan, setFKeterangan] = useState('');

  const fetchDoc = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get<TukarFakturResponse>(`/penjualan/tukar-faktur/${id}`);
      setDoc(res);
      setFTanggal(res.tanggal ? res.tanggal.slice(0, 10) : '');
      setFKeterangan(res.keterangan || '');
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.detail : e instanceof Error ? e.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDoc();
  }, [fetchDoc]);

  const readOnly = !!doc && doc.status !== 'DRAFT';

  const handleSubmit = useCallback(async () => {
    if (!doc) return;
    if (readOnly) return;
    const errs: Record<string, string> = {};
    if (!fTanggal) errs.tanggal = 'Tanggal wajib diisi';
    if (Object.keys(errs).length) {
      setFormErrors(errs);
      return;
    }
    setSubmitting(true);
    try {
      const body: TukarFakturUpdate = {
        tanggal: fTanggal,
        keterangan: fKeterangan || null
      };
      await api.put<TukarFakturResponse>(`/penjualan/tukar-faktur/${doc.id}`, body);
      toast.success('Tukar Faktur berhasil diperbarui');
      refreshListTab('sales', 'tukar-faktur');
      if (activeTabId) closeTab(activeTabId);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Gagal memperbarui tukar faktur');
    } finally {
      setSubmitting(false);
    }
  }, [doc, readOnly, fTanggal, fKeterangan, activeTabId, closeTab, refreshListTab]);

  if (loading) {
    return (
      <FormTabShell title="Edit Tukar Faktur">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </FormTabShell>
    );
  }

  if (loadError || !doc) {
    return (
      <FormTabShell title="Edit Tukar Faktur">
        <ErrorCard message={loadError || 'Dokumen tidak ditemukan'} onRetry={fetchDoc} />
      </FormTabShell>
    );
  }

  return (
    <FormTabShell title={`Edit ${doc.noTukarFaktur}`}>
      <Card className="max-w-5xl">
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">Hanya tanggal dan keterangan yang dapat diubah — snapshot invoice (pelanggan, referensi, total, barang) bersifat tetap.</p>

          {/* Info bar dokumen */}
          <div className="flex flex-wrap items-center gap-4 rounded-md border bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              <span>No TF:</span>
              <span className="font-mono font-semibold text-foreground">{doc.noTukarFaktur}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Status:</span>
              <TukarFakturStatusBadge status={doc.status} />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Total:</span>
              <span className="font-mono font-semibold text-foreground">{formatRp(Number(doc.total) || 0)}</span>
            </div>
          </div>

          {readOnly && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Tukar Faktur berstatus {doc.status}. Hanya dokumen DRAFT yang dapat diubah; form ini menjadi baca saja.</p>}

          {/* Panel read-only snapshot */}
          <div className="space-y-3 rounded-md border bg-muted/20 p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Info className="h-3.5 w-3.5" /> Snapshot Invoice
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <InfoLine label="No Invoice" value={doc.salesInvoice?.noInvoice || '-'} />
              <InfoLine label="Pelanggan" value={doc.pelanggan?.nama || '-'} />
              <InfoLine label="No SO" value={doc.noSo || '-'} />
              <InfoLine label="No PO Customer" value={doc.noPoCustomer || '-'} />
              <InfoLine label="No Surat Jalan" value={doc.noSuratJalan || '-'} />
              <InfoLine label="Total Faktur" value={formatRp(Number(doc.total) || 0)} />
            </div>
            <div className="max-h-48 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Nama Barang</TableHead>
                    <TableHead className="w-[100px] text-right">Qty</TableHead>
                    <TableHead className="w-[100px]">Satuan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(doc.details || []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{r.barang?.nama || '-'}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatNumber(Number(r.qty) || 0)}</TableCell>
                      <TableCell className="text-xs">{r.satuan?.nama || '-'}</TableCell>
                    </TableRow>
                  ))}
                  {(doc.details || []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="h-10 text-center text-muted-foreground text-xs">
                        Tidak ada detail barang.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
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
                disabled={readOnly}
              />
              {formErrors.tanggal && <p className="text-xs text-destructive mt-1">{formErrors.tanggal}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Keterangan</Label>
            <Textarea className="text-xs min-h-[60px]" value={fKeterangan} onChange={(e) => setFKeterangan(e.target.value)} placeholder="Catatan tambahan..." disabled={readOnly} />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting}>
              Batal
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting || readOnly}>
              {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileCheck className="mr-1.5 h-4 w-4" />}
              {submitting ? 'Menyimpan...' : 'Simpan Perubahan'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </FormTabShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CETAK: TukarFakturCetakTab (mirror PenawaranCetakTab)
// ═════════════════════════════════════════════════════════════════════════════

export function TukarFakturCetakTab({ id }: { id: string }) {
  const [data, setData] = useState<TukarFakturPDFData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const elementId = `pdf-tukar-faktur-${id}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<TukarFakturResponse>(`/penjualan/tukar-faktur/${id}`);
      setData(mapTukarFakturPDFData(res));
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
      await generatePDF(elementId, `TukarFaktur-${data.noTukarFaktur || id}.pdf`);
    } finally {
      setDownloading(false);
    }
  }, [data, elementId, id]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <FormTabShell title={`Cetak Tukar Faktur${data ? ` — ${data.noTukarFaktur}` : ''}`}>
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
                <TukarFakturPDFTemplate data={data} />
              </div>
            </div>
          )
        )}
      </div>
    </FormTabShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DISPATCHER: TukarFakturModule — routing subPage 'tukar-faktur' di app/page.tsx
// (mirror pola formMode switch di sales/index.tsx; list + form + cetak).
// ═════════════════════════════════════════════════════════════════════════════

export function TukarFakturModule({ subPage = 'tukar-faktur', refreshKey, formMode, formProps }: { subPage?: string; refreshKey?: number; formMode?: string; formProps?: Record<string, unknown> }) {
  if (formMode) {
    const editId = formProps?.id as string | undefined;
    if (formMode === 'tukar-faktur-create') {
      return <TukarFakturCreateForm />;
    }
    if (formMode === 'tukar-faktur-edit' && editId) {
      return <TukarFakturEditForm id={editId} />;
    }
    if (formMode === 'tukar-faktur-cetak' && editId) {
      return <TukarFakturCetakTab id={editId} />;
    }
  }
  return <TukarFakturTab refreshKey={refreshKey} />;
}
