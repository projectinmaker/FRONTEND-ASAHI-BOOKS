'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { formatRp } from '@/lib/pdf-utils';
import type { AssetReconciliationResponse, AssetReconciliationPerAkun } from '@/types/api';

// Tanggal lokal (bukan UTC) — default "as of" harus hari ini menurut zona user (WIB)
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function num(v: number | string): number {
  return typeof v === 'string' ? Number(v) : v;
}

export default function AssetReconciliationPage() {
  const [asOf, setAsOf] = useState(todayIso());
  const [data, setData] = useState<AssetReconciliationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<AssetReconciliationResponse>(`/aset-tetap/rekonsiliasi/register-vs-gl?as_of=${asOf}`);
      setData(res);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal memuat rekonsiliasi aset';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [asOf]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const summary = data?.summary;
  const perAkun = data?.perAkun || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Rekonsiliasi Asset Register vs GL</h2>
          <p className="text-sm text-muted-foreground">{loading ? 'Memuat...' : `${perAkun.length} akun aset`}</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">As of</Label>
            <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-[150px]" />
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* M-09: penjelasan selisih wajar akibat tanggal penyusutan end-of-month */}
      <p className="text-xs text-muted-foreground">Catatan: jurnal penyusutan dicatat server pada tanggal akhir bulan (penyusutan divalidasi sekuensial per bulan), sehingga register aset vs GL dapat menunjukkan selisih yang wajar bila periode laporan belum mencakup akhir bulan berjalan.</p>

      {/* Summary cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-3 w-24 mb-2" />
                <Skeleton className="h-6 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Cost (Register)</p>
              <p className="text-lg font-bold mt-1">{formatRp(num(summary.totalNilaiPerolehanRegister))}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Accum Dep (Register)</p>
              <p className="text-lg font-bold mt-1">{formatRp(num(summary.totalAkumulasiPenyusutanRegister))}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total NBV (Register)</p>
              <p className="text-lg font-bold mt-1">{formatRp(num(summary.totalNilaiBukuRegister))}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Aset</p>
              <p className="text-lg font-bold mt-1">{summary.totalAssetCount} unit</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Catatan */}
      {data?.catatan && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Catatan</p>
            <p className="text-sm text-muted-foreground">{data.catatan}</p>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {error && !loading && (
        <Card className="border-destructive">
          <CardContent className="p-4">
            <p className="text-sm text-destructive font-medium">{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={fetchData}>
              Coba Lagi
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Table per akun */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto" style={{ maxHeight: '500px', overflowY: 'auto' }}>
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="whitespace-nowrap">Akun Aset</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Register Cost</TableHead>
                  <TableHead className="whitespace-nowrap text-right">GL Cost</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Selisih Cost</TableHead>
                  <TableHead className="whitespace-nowrap">Akun Akumulasi</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Register Accum</TableHead>
                  <TableHead className="whitespace-nowrap text-right">GL Accum</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Selisih Accum</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Aset Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : perAkun.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Tidak ada data akun aset.
                    </TableCell>
                  </TableRow>
                ) : (
                  perAkun.map((row: AssetReconciliationPerAkun) => {
                    const selisihCostNum = num(row.selisihCost);
                    const selisihAccumNum = num(row.selisihAccum);
                    return (
                      <TableRow key={row.akunAsetId}>
                        <TableCell className="whitespace-nowrap">
                          <span className="font-mono text-xs">{row.akunAsetKode}</span>
                          <span className="block text-xs text-muted-foreground">{row.akunAsetNama}</span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-mono text-sm tabular-nums">{formatRp(num(row.nilaiPerolehanRegister))}</TableCell>
                        <TableCell className="whitespace-nowrap text-right font-mono text-sm tabular-nums">{formatRp(num(row.saldoGlCost))}</TableCell>
                        <TableCell className={`whitespace-nowrap text-right font-mono text-sm tabular-nums font-medium ${selisihCostNum === 0 ? 'text-emerald-600' : 'text-destructive'}`}>{formatRp(selisihCostNum)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <span className="font-mono text-xs">{row.akunAkumulasiKode}</span>
                          <span className="block text-xs text-muted-foreground">{row.akunAkumulasiNama}</span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-mono text-sm tabular-nums">{formatRp(num(row.akumulasiPenyusutanRegister))}</TableCell>
                        <TableCell className="whitespace-nowrap text-right font-mono text-sm tabular-nums">{formatRp(num(row.saldoGlAccum))}</TableCell>
                        <TableCell className={`whitespace-nowrap text-right font-mono text-sm tabular-nums font-medium ${selisihAccumNum === 0 ? 'text-emerald-600' : 'text-destructive'}`}>{formatRp(selisihAccumNum)}</TableCell>
                        <TableCell className="whitespace-nowrap text-center">{row.assetCount}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
