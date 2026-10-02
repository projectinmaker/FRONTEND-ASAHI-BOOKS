'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RefreshCw, AlertCircle, CheckCircle2, XCircle, Package, ChevronRight, ChevronDown, Link2, Unlink, Wallet, Scale } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatRp as formatRpIDR, formatNumberIDR } from '@/lib/money';
import { useTabStore } from '@/store/tab-store';
import { toast } from 'sonner';
import type { RekonsiliasiPersediaanResponse, RekonsiliasiPersediaanAkunRow } from '@/types/api';

// ─── Helpers ───────────────────────────────────────────────────────────────

function todayStr(): string {
  // Tanggal lokal (bukan UTC) — default "as of" harus hari ini menurut zona user (WIB)
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatRp(value: number | string): string {
  return formatRpIDR(value);
}

function formatNumber(value: number | string): string {
  return formatNumberIDR(value);
}

function absN(value: number | string): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return Math.abs(Number.isFinite(n) ? n : 0);
}

// ─── Component ────────────────────────────────────────────────────────────

export default function RekonsiliasiPersediaanPage({ refreshKey }: { refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab);
  const [asOf, setAsOf] = useState(todayStr());
  const [onlyMismatch, setOnlyMismatch] = useState(false);
  const [data, setData] = useState<RekonsiliasiPersediaanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Backend koreksi: as_of hanya boleh tanggal hari ini (Asia/Jakarta).
      // Jangan kirim as_of historical — backend akan return 400.
      // Backend return basis="CURRENT_ALL_POSTED" (saldo terkini, semua jurnal POSTED termasuk future-dated).
      const params = new URLSearchParams();
      params.set('as_of', asOf); // always today
      if (onlyMismatch) params.set('only_mismatch', 'true');
      const res = await api.get<RekonsiliasiPersediaanResponse>(`/laporan/rekonsiliasi-persediaan?${params.toString()}`);
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Gagal memuat rekonsiliasi persediaan');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [asOf, onlyMismatch]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const toggleRow = (akunId: string) => {
    setExpandedRows((prev) => ({ ...prev, [akunId]: !prev[akunId] }));
  };

  const handleEditBarang = (barangId: string, barangNama: string) => {
    openFormTab({
      title: `Edit ${barangNama}`,
      module: 'inventory',
      subPage: 'barang-jasa',
      formKey: 'barang-edit',
      formProps: { id: barangId }
    });
  };

  // ─── Derived stats ──
  const ringkasan = data?.ringkasan;
  const totalSelisih = ringkasan ? Number(ringkasan.totalSelisih) : 0;
  const isMismatch = absN(totalSelisih) >= 0.01;

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">As Of</Label>
              <div className="h-9 px-3 flex items-center rounded-md border bg-muted/30 text-sm text-muted-foreground">{asOf} (hari ini, Asia/Jakarta)</div>
              {/* DEV-NOTE (m-11): backend hanya mendukung as_of = hari ini (Asia/Jakarta);
                  jangan tawarkan filter tanggal historis pada UI ini. Info ini untuk
                  developer saja — tidak ditampilkan ke pengguna. */}
            </div>
            <div className="flex items-center gap-2 h-9 pb-1.5">
              <Checkbox id="only-mismatch" checked={onlyMismatch} onCheckedChange={(v) => setOnlyMismatch(v === true)} />
              <Label htmlFor="only-mismatch" className="text-xs cursor-pointer">
                Hanya tampilkan akun MISMATCH
              </Label>
            </div>
            <Button size="sm" onClick={fetchData} disabled={loading} className="gap-2 h-9">
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
          </div>
          <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-800 flex items-start gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <div>
              <strong>Saldo terkini — seluruh organisasi, termasuk seluruh jurnal POSTED bertanggal masa depan.</strong>{' '}
              {data?.basis && (
                <span>
                  Basis: <code>{data.basis}</code>.{' '}
                </span>
              )}
              {data?.includesFuturePostings && <span>Mencakup jurnal POSTED future-dated.</span>} Toleransi selisih {'<'} 0.01 dianggap MATCH. Data read-only.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && !loading && (
        <Card className="border-destructive">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-destructive font-medium">{error}</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={fetchData}>
                  Coba Lagi
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {/* Summary Cards */}
      {!loading && ringkasan && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <SummaryCard icon={Scale} label="Total Akun Diperiksa" value={String(ringkasan.totalAkunDiperiksa)} tone="neutral" />
            <SummaryCard icon={CheckCircle2} label="Match" value={String(ringkasan.totalAkunMatch)} tone="success" />
            <SummaryCard icon={XCircle} label="Mismatch" value={String(ringkasan.totalAkunMismatch)} tone={ringkasan.totalAkunMismatch > 0 ? 'danger' : 'neutral'} />
            <SummaryCard icon={Unlink} label="Belum Dipetakan" value={String(ringkasan.totalAkunUnmapped)} tone={ringkasan.totalAkunUnmapped > 0 ? 'warning' : 'neutral'} />
            <SummaryCard icon={Wallet} label="Total Selisih" value={formatRp(ringkasan.totalSelisih)} tone={isMismatch ? 'danger' : 'success'} />
          </div>

          {/* Tabel Akun */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Rekonsiliasi per Akun Persediaan</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-[40px]" />
                      <TableHead className="w-[120px]">Kode Akun</TableHead>
                      <TableHead>Nama Akun</TableHead>
                      <TableHead className="text-right">Saldo Buku Besar</TableHead>
                      <TableHead className="text-right">Total Nilai Stok</TableHead>
                      <TableHead className="text-right">Selisih</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data && data.items.length > 0 ? (
                      data.items.map((row) => <AkunRow key={row.akun.id} row={row} expanded={!!expandedRows[row.akun.id]} onToggle={() => toggleRow(row.akun.id)} />)
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          Tidak ada akun persediaan. Mapping barang di modul Inventory {'>'} Barang &amp; Jasa.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Section: Barang Belum Dipetakan */}
          {data && data.barangBelumDipetakan.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Unlink className="h-4 w-4 text-amber-600" />
                    Barang Belum Dipetakan ({data.barangBelumDipetakan.length})
                  </CardTitle>
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                    Perlu mapping
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="w-[140px]">Kode Barang</TableHead>
                        <TableHead>Nama Barang</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Nilai Stok</TableHead>
                        <TableHead>Kategori</TableHead>
                        <TableHead className="text-center">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.barangBelumDipetakan.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell className="font-mono text-xs">{b.kode}</TableCell>
                          <TableCell className="text-sm font-medium">{b.nama}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(b.qty)}</TableCell>
                          <TableCell className="text-right tabular-nums font-mono">{formatRp(b.nilaiStok)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{b.kategori || '-'}</TableCell>
                          <TableCell className="text-center">
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleEditBarang(b.id, b.nama)}>
                              <Package className="h-3 w-3" /> Lengkapi Mapping
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Empty State (no data, no error) */}
      {!loading && !error && !ringkasan && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">Klik tombol Refresh untuk memuat data rekonsiliasi.</CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Summary Card sub-component ───────────────────────────────────────────

function SummaryCard({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }) {
  const toneClass = {
    neutral: 'bg-muted/40 text-foreground',
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
    danger: 'bg-red-50 text-red-700'
  }[tone];
  const iconTone = {
    neutral: 'bg-muted text-muted-foreground',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700'
  }[tone];
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconTone}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className={`text-lg font-semibold truncate ${toneClass.split(' ')[1] || ''}`}>{value}</p>
        </div>
      </div>
    </Card>
  );
}

// ─── Expandable Akun Row ─────────────────────────────────────────────────

function AkunRow({ row, expanded, onToggle }: { row: RekonsiliasiPersediaanAkunRow; expanded: boolean; onToggle: () => void }) {
  const selisih = Number(row.selisih);
  const isMismatch = Math.abs(selisih) >= 0.01;
  const barangCount = row.barang?.length || 0;

  return (
    <>
      <TableRow className={isMismatch ? 'bg-red-50/40 hover:bg-red-50/60' : ''}>
        <TableCell className="w-[40px] p-0 text-center">
          {barangCount > 0 && (
            <button onClick={onToggle} className="p-2 hover:bg-muted rounded-md transition-colors" aria-label={expanded ? 'Collapse' : 'Expand'}>
              {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>
          )}
        </TableCell>
        <TableCell className="font-mono text-xs font-medium">{row.akun.kode}</TableCell>
        <TableCell className="text-sm">{row.akun.nama}</TableCell>
        <TableCell className="text-right tabular-nums font-mono text-sm">{formatRp(row.saldoBukuBesar)}</TableCell>
        <TableCell className="text-right tabular-nums font-mono text-sm">{formatRp(row.totalNilaiStok)}</TableCell>
        <TableCell className={`text-right tabular-nums font-mono text-sm ${isMismatch ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>{isMismatch ? formatRp(row.selisih) : formatRp(0)}</TableCell>
        <TableCell className="text-center">
          {isMismatch ? (
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 hover:bg-red-50 text-xs gap-1">
              <XCircle className="h-3 w-3" /> MISMATCH
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-50 text-xs gap-1">
              <CheckCircle2 className="h-3 w-3" /> MATCH
            </Badge>
          )}
        </TableCell>
      </TableRow>
      {expanded && barangCount > 0 && (
        <TableRow className="bg-muted/20">
          <TableCell colSpan={7} className="p-4">
            <div className="rounded-md border bg-background overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Kode Barang</TableHead>
                    <TableHead>Nama Barang</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Nilai Stok</TableHead>
                    <TableHead className="text-center">Status Mapping</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {row.barang.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-xs">{b.kode}</TableCell>
                      <TableCell className="text-sm">{b.nama}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{formatNumber(b.qty)}</TableCell>
                      <TableCell className="text-right tabular-nums font-mono text-sm">{formatRp(b.nilaiStok)}</TableCell>
                      <TableCell className="text-center">
                        {b.statusMapping === 'MAPPED' ? (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-50 text-xs gap-1">
                            <Link2 className="h-3 w-3" /> MAPPED
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-50 text-xs gap-1">
                            <Unlink className="h-3 w-3" /> FALLBACK
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              <strong>MAPPED</strong>: akun dari <code>barang.akunPersediaanId</code> (Tahap 1 mapping).
              <strong className="ml-2">FALLBACK</strong>: akun dari setting-akun default (PERSEDIAAN_BARANG_JADI, dll).
            </p>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
