'use client';

/**
 * Update #02 — Tab "Belum Teridentifikasi" modul Kas & Bank.
 *
 * Daftar dokumen Penerimaan & Pembayaran dengan jenis transaksi
 * BELUM_TERIDENTIFIKASI beserta progres identifikasi (teridentifikasi /
 * sisa). Tombol "Identifikasi & Alokasi" membuka IdentifikasiDialog untuk
 * memindahkan nilai dari akun penampung ke akun yang benar.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Loader2, Search, SearchCheck, RefreshCw, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { formatRp, formatDate } from '@/lib/pdf-utils';
import { api, ApiError, PaginatedResponse } from '@/lib/api';
import { IdentifikasiDialog } from '@/components/erp/cash-bank/forms/identifikasi-dialog';
import type { KasBankAkunResponse, PenerimaanKasResponse, PembayaranKasResponse } from '@/types/api';

const PAGE_SIZE = 100;

function num(v: number | string | null | undefined): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

export function BelumTeridentifikasiTab({ kasBankOptions, refreshKey }: { kasBankOptions: KasBankAkunResponse[]; refreshKey?: number }) {
  const [jenis, setJenis] = useState<'penerimaan' | 'pembayaran'>('penerimaan');
  const [data, setData] = useState<(PenerimaanKasResponse | PembayaranKasResponse)[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skip, setSkip] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [kasBankFilter, setKasBankFilter] = useState('');
  const [hanyaSisa, setHanyaSisa] = useState(true);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDoc, setDialogDoc] = useState<{ id: string; noBukti: string } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('skip', String(skip));
      params.set('limit', String(PAGE_SIZE));
      params.set('jenis_transaksi', 'BELUM_TERIDENTIFIKASI');
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (kasBankFilter) params.set('kas_bank_id', kasBankFilter);
      const res = await api.get<PaginatedResponse<PenerimaanKasResponse | PembayaranKasResponse>>(`/kas-bank/${jenis}?${params.toString()}`);
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : `Gagal memuat daftar ${jenis} belum teridentifikasi`);
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [jenis, skip, debouncedSearch, kasBankFilter]);

  useEffect(() => {
    void fetchData();
  }, [fetchData, refreshKey]);

  useEffect(() => {
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setSkip(0);
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [search]);

  useEffect(() => {
    setSkip(0);
  }, [kasBankFilter, jenis]);

  const rows = useMemo(() => (hanyaSisa ? data.filter((d) => num(d.sisaBelumTeridentifikasi) > 0) : data), [data, hanyaSisa]);
  const totalSisa = useMemo(() => rows.reduce((s, d) => s + num(d.sisaBelumTeridentifikasi), 0), [rows]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(skip / PAGE_SIZE) + 1;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-amber-600" aria-hidden="true" />
                Mutasi Belum Teridentifikasi
              </CardTitle>
              <CardDescription>Penerimaan/pembayaran bank yang pelanggan/supplier atau transaksi asalnya belum diketahui — terposting di akun penampung sementara. Gunakan Identifikasi &amp; Alokasi untuk memindahkannya ke akun yang benar (tanpa jurnal bank ganda).</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => void fetchData()} disabled={loading} className="h-9">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
              Muat Ulang
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <Tabs value={jenis} onValueChange={(v) => setJenis(v as 'penerimaan' | 'pembayaran')}>
              <TabsList>
                <TabsTrigger value="penerimaan">Penerimaan</TabsTrigger>
                <TabsTrigger value="pembayaran">Pembayaran</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground">Cari</Label>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Cari no dokumen/bukti..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
              </div>
            </div>
            <div className="w-full sm:w-44">
              <Label className="text-xs text-muted-foreground">Kas/Bank</Label>
              <div className="mt-1">
                <SearchableDropdown value={kasBankFilter} onValueChange={(v) => setKasBankFilter(v || '')} options={kasBankOptions.map((opt) => ({ id: opt.id, label: opt.akunPerkiraan?.nama || opt.nama }))} placeholder="Semua Kas/Bank" allOption={{ id: '', label: 'Semua Kas/Bank' }} className="h-8 text-xs w-full" />
              </div>
            </div>
            <div className="flex items-center gap-2 pb-1">
              <input id="hanya-sisa" type="checkbox" checked={hanyaSisa} onChange={(e) => setHanyaSisa(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
              <Label htmlFor="hanya-sisa" className="text-xs text-muted-foreground cursor-pointer">
                Hanya sisa &gt; 0
              </Label>
            </div>
          </div>

          {error && !loading && <div className="rounded-md border border-destructive bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

          {!error && (
            <div className="max-h-96 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 sticky top-0">
                    <TableHead className="whitespace-nowrap">Tanggal</TableHead>
                    <TableHead className="whitespace-nowrap">No. Dokumen</TableHead>
                    <TableHead className="whitespace-nowrap">Kas/Bank</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Nilai Dokumen</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Teridentifikasi</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Sisa</TableHead>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                    <TableHead className="whitespace-nowrap text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 8 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-5 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-0 p-0">
                        <EmptyState icon={HelpCircle} title="Tidak ada mutasi belum teridentifikasi" description={data.length === 0 ? `Belum ada dokumen ${jenis} dengan jenis transaksi 'Belum Teridentifikasi'. Dokumen baru dibuat lewat form ${jenis === 'penerimaan' ? 'Penerimaan' : 'Pembayaran'} → jenis 'Belum Teridentifikasi'.` : 'Semua mutasi sudah teridentifikasi penuh. Kosongkan filter "Hanya sisa > 0" untuk melihat histori lengkap.'} />
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => {
                      const sisa = num(row.sisaBelumTeridentifikasi);
                      const bisaIdentifikasi = row.status === 'SELESAI' && sisa > 0;
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="whitespace-nowrap text-sm">{formatDate(row.tanggal)}</TableCell>
                          <TableCell className="whitespace-nowrap font-medium text-sm">{row.noBukti}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm">{row.kasBank?.akunPerkiraan?.nama || row.kasBank?.nama || '-'}</TableCell>
                          <TableCell className="whitespace-nowrap text-right font-mono text-sm">{formatRp(num(row.totalNilai))}</TableCell>
                          <TableCell className="whitespace-nowrap text-right font-mono text-sm text-emerald-700">{formatRp(num(row.teridentifikasi))}</TableCell>
                          <TableCell className={`whitespace-nowrap text-right font-mono text-sm font-semibold ${sisa > 0 ? 'text-amber-700' : 'text-muted-foreground'}`}>{formatRp(sisa)}</TableCell>
                          <TableCell className="whitespace-nowrap">{sisa <= 0 ? <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Teridentifikasi Penuh</Badge> : row.status === 'SELESAI' ? <Badge variant="secondary">Posted</Badge> : <Badge className="border-yellow-200 bg-yellow-100 text-yellow-700 hover:bg-yellow-100">{row.status === 'DRAFT' ? 'Draft' : row.status}</Badge>}</TableCell>
                          <TableCell className="whitespace-nowrap text-center">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                              disabled={!bisaIdentifikasi}
                              title={bisaIdentifikasi ? 'Identifikasi & Alokasi nilai ke akun yang benar' : 'Hanya dokumen posted dengan sisa > 0 yang bisa dialokasikan'}
                              onClick={() => {
                                setDialogDoc({ id: row.id, noBukti: row.noBukti });
                                setDialogOpen(true);
                              }}>
                              <SearchCheck className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                              Identifikasi &amp; Alokasi
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {!loading && !error && total > PAGE_SIZE && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {total} dokumen · Total sisa tampil: <strong>{formatRp(totalSisa)}</strong>
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={skip <= 0} onClick={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))} className="h-8">
                  ‹ Sebelumnya
                </Button>
                <span className="text-xs text-muted-foreground">
                  Hal. {currentPage} / {totalPages}
                </span>
                <Button variant="outline" size="sm" disabled={skip + PAGE_SIZE >= total} onClick={() => setSkip((s) => s + PAGE_SIZE)} className="h-8">
                  Berikutnya ›
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {dialogDoc && (
        <IdentifikasiDialog
          open={dialogOpen}
          onOpenChange={(o) => {
            setDialogOpen(o);
            if (!o) setDialogDoc(null);
          }}
          jenisDokumen={jenis}
          dokumenId={dialogDoc.id}
          noBukti={dialogDoc.noBukti}
          onDone={() => {
            void fetchData();
            toast.dismiss();
          }}
        />
      )}
    </div>
  );
}
