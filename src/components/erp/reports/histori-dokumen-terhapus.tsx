'use client';

/**
 * Histori Dokumen Terhapus (audit trail hard delete).
 *
 * Semua pembatalan dokumen di modul apapun kini = hard delete (hapus permanen);
 * jejak lengkapnya (snapshot header, rincian, jurnal, workflow) tersimpan di
 * deleted_document_log dan ditampilkan di halaman ini.
 *
 * Endpoint: GET /api/v1/histori/dokumen-terhapus (list ringkas)
 *           GET /api/v1/histori/dokumen-terhapus/{id} (detail + snapshot)
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, RefreshCw, Search, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { formatRp } from '@/lib/pdf-utils';
import type { DeletedDocumentLogResponse, DeletedDocumentLogDetailResponse, DeletedDocumentLogListResponse } from '@/types/api';

const PAGE_SIZE = 25;

const DOC_TYPE_LABELS: Record<string, string> = {
  pembayaran_kas: 'Pembayaran Kas',
  penerimaan_kas: 'Penerimaan Kas',
  transfer_bank: 'Transfer Bank',
  sales_order: 'Pesanan Penjualan',
  sales_invoice: 'Invoice Penjualan',
  sales_retur: 'Retur Penjualan',
  pengiriman_barang: 'Pengiriman Barang',
  purchase_order: 'Pesanan Pembelian',
  purchase_invoice: 'Invoice Pembelian',
  purchase_retur: 'Retur Pembelian',
  penerimaan_barang: 'Penerimaan Barang',
  penyesuaian_stok: 'Penyesuaian Stok',
  pemindahan_barang: 'Pemindahan Barang',
  permintaan_barang: 'Permintaan Barang',
  jurnal_umum: 'Jurnal Umum',
  asset_event: 'Transaksi Aset'
};

function typeLabel(t: string): string {
  return DOC_TYPE_LABELS[t] || t;
}

function fmtDate(v: string | null): string {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return v;
  }
}

export default function HistoriDokumenTerhapusPage() {
  const [data, setData] = useState<DeletedDocumentLogResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skip, setSkip] = useState(0);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');

  // Detail dialog
  const [detail, setDetail] = useState<DeletedDocumentLogDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setSkip(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ skip: String(skip), limit: String(PAGE_SIZE) });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (typeFilter !== 'ALL') params.set('documentType', typeFilter);
      const res = await api.get<DeletedDocumentLogListResponse>(`/histori/dokumen-terhapus?${params.toString()}`);
      setData(res.data);
      setTotal(res.total);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal memuat histori dokumen terhapus';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, typeFilter, skip]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await api.get<DeletedDocumentLogDetailResponse>(`/histori/dokumen-terhapus/${id}`);
      setDetail(res);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal memuat detail');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-muted-foreground" />
            Histori Dokumen Terhapus
          </h2>
          <p className="text-sm text-muted-foreground">Audit trail pembatalan dokumen (hard delete) — snapshot lengkap tersimpan untuk setiap penghapusan.</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {/* Filter */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="flex-1 space-y-1">
            <Label className="text-xs text-muted-foreground">Cari nomor dokumen</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Mis. PAY-2025-01-004" className="pl-8" />
            </div>
          </div>
          <div className="w-full sm:w-64 space-y-1">
            <Label className="text-xs text-muted-foreground">Jenis dokumen</Label>
            <Select
              value={typeFilter}
              onValueChange={(v) => {
                setTypeFilter(v);
                setSkip(0);
              }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Jenis</SelectItem>
                {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabel */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Memuat...
            </div>
          ) : error ? (
            <div className="py-12 text-center text-destructive text-sm">{error}</div>
          ) : data.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Belum ada dokumen yang dihapus. Pembatalan dokumen di modul apapun akan tercatat di sini.</div>
          ) : (
            <div className="max-h-[520px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Waktu Hapus</TableHead>
                    <TableHead>Jenis Dokumen</TableHead>
                    <TableHead>No. Dokumen</TableHead>
                    <TableHead className="text-right">Nilai</TableHead>
                    <TableHead>Dihapus Oleh</TableHead>
                    <TableHead>Alasan</TableHead>
                    <TableHead className="text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-xs">{fmtDate(row.deletedAt)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {typeLabel(row.documentType)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-xs">{row.documentNumber || '—'}</TableCell>
                      <TableCell className="text-right text-xs">{row.totalAmount != null ? formatRp(Number(row.totalAmount)) : '—'}</TableCell>
                      <TableCell className="text-xs">{row.deletedBy?.namaLengkap || row.deletedBy?.username || '—'}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground" title={row.reason ?? undefined}>
                        {row.reason || '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openDetail(row.id)}>
                          Detail
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {!loading && !error && total > PAGE_SIZE && (
            <div className="flex items-center justify-between p-3 border-t">
              <span className="text-xs text-muted-foreground">
                {skip + 1}–{Math.min(skip + PAGE_SIZE, total)} dari {total}
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={skip === 0} onClick={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={skip + PAGE_SIZE >= total} onClick={() => setSkip((s) => s + PAGE_SIZE)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog
        open={!!detail || detailLoading}
        onOpenChange={(o) => {
          if (!o) {
            setDetail(null);
          }
        }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {/* Judul selalu dirender agar a11y terpenuhi walau loading */}
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              {detail ? (
                <>
                  {typeLabel(detail.documentType)} {detail.documentNumber ? `— ${detail.documentNumber}` : ''}
                </>
              ) : (
                'Detail Dokumen Terhapus'
              )}
            </DialogTitle>
            <DialogDescription>{detail ? `Dihapus oleh ${detail.deletedBy?.namaLengkap || detail.deletedBy?.username || '—'} pada ${fmtDate(detail.deletedAt)}${detail.reason ? ` — Alasan: "${detail.reason}"` : ''}` : 'Memuat detail...'}</DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Memuat detail...
            </div>
          ) : detail ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">Snapshot saat dihapus</h4>
                <Badge variant="outline" className="text-xs">
                  status: {detail.documentStatus || '—'}
                </Badge>
              </div>
              <pre className="text-[11px] leading-relaxed bg-muted/60 rounded-md p-3 overflow-x-auto max-h-[420px] overflow-y-auto whitespace-pre-wrap break-words">{JSON.stringify(detail.snapshot, null, 2)}</pre>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
