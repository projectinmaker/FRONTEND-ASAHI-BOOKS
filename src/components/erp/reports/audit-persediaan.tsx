'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, AlertCircle, AlertTriangle, Package, Truck, RotateCcw, Scale, ClipboardList, FileText } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useTabStore } from '@/store/tab-store';
import { toast } from 'sonner';
import type { AuditTransaksiPersediaanResponse, AuditPersediaanSummary, AuditTransaksiAnomali, TipeAuditPersediaan } from '@/types/api';

// ─── Helpers ───────────────────────────────────────────────────────────────

function todayStr(): string {
  // Tanggal lokal (bukan UTC) — default "as of" harus hari ini menurut zona user (WIB)
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function firstDayOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

const TIPE_LABELS: Record<TipeAuditPersediaan, string> = {
  PENERIMAAN: 'Penerimaan',
  PENGIRIMAN: 'Pengiriman',
  RETUR_PEMBELIAN: 'Retur Pembelian',
  RETUR_PENJUALAN: 'Retur Penjualan',
  PENYESUAIAN: 'Penyesuaian'
};

const TIPE_BADGE: Record<TipeAuditPersediaan, { bg: string; icon: React.ElementType }> = {
  PENERIMAAN: { bg: 'bg-blue-50 text-blue-700 border-blue-300', icon: Package },
  PENGIRIMAN: { bg: 'bg-purple-50 text-purple-700 border-purple-300', icon: Truck },
  RETUR_PEMBELIAN: { bg: 'bg-orange-50 text-orange-700 border-orange-300', icon: RotateCcw },
  RETUR_PENJUALAN: { bg: 'bg-pink-50 text-pink-700 border-pink-300', icon: RotateCcw },
  PENYESUAIAN: { bg: 'bg-amber-50 text-amber-700 border-amber-300', icon: Scale }
};

// ─── Component ────────────────────────────────────────────────────────────

export default function AuditPersediaanPage({ refreshKey }: { refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab);
  const [dari, setDari] = useState(firstDayOfMonth());
  const [sampai, setSampai] = useState(todayStr());
  const [tipeFilter, setTipeFilter] = useState<string>('ALL');
  const [data, setData] = useState<AuditTransaksiPersediaanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dari) params.set('dari', dari);
      if (sampai) params.set('sampai', sampai);
      const res = await api.get<AuditTransaksiPersediaanResponse>(`/laporan/audit-persediaan?${params.toString()}`);
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Gagal memuat audit persediaan');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [dari, sampai]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Filtered anomali by tipe
  const filteredAnomali = data?.anomali.filter((a) => tipeFilter === 'ALL' || a.tipe === tipeFilter) || [];

  // Handler: click no_dokumen → open detail tab
  const handleOpenDetail = (anomali: AuditTransaksiAnomali) => {
    const tipe = anomali.tipe;
    if (tipe === 'PENERIMAAN') {
      openFormTab({
        title: `Cetak ${anomali.noDokumen || 'Penerimaan'}`,
        module: 'purchasing',
        subPage: 'penerimaan',
        formKey: 'penerimaan-cetak',
        formProps: { id: anomali.id }
      });
    } else if (tipe === 'PENGIRIMAN') {
      openFormTab({
        title: `Cetak ${anomali.noDokumen || 'Pengiriman'}`,
        module: 'sales',
        subPage: 'pengiriman',
        formKey: 'pengiriman-cetak',
        formProps: { id: anomali.id }
      });
    } else if (tipe === 'RETUR_PEMBELIAN') {
      openFormTab({
        title: `Cetak ${anomali.noDokumen || 'Retur Pembelian'}`,
        module: 'purchasing',
        subPage: 'retur',
        formKey: 'retur-pembelian-cetak',
        formProps: { id: anomali.id }
      });
    } else if (tipe === 'RETUR_PENJUALAN') {
      openFormTab({
        title: `Cetak ${anomali.noDokumen || 'Retur Penjualan'}`,
        module: 'sales',
        subPage: 'retur',
        formKey: 'retur-penjualan-cetak',
        formProps: { id: anomali.id }
      });
    } else if (tipe === 'PENYESUAIAN') {
      // Penyesuaian tidak punya cetak tab; arahkan ke edit form
      openFormTab({
        title: `Edit ${anomali.noDokumen || 'Penyesuaian'}`,
        module: 'inventory',
        subPage: 'penyesuaian',
        formKey: 'penyesuaian-edit',
        formProps: { id: anomali.id }
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Dari Tanggal</Label>
              <Input type="date" value={dari} onChange={(e) => setDari(e.target.value)} className="h-9 w-full sm:w-[160px]" max={sampai} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Sampai Tanggal</Label>
              <Input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} className="h-9 w-full sm:w-[160px]" min={dari} />
            </div>
            <Button size="sm" onClick={fetchData} disabled={loading} className="gap-2 h-9">
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Audit semua transaksi persediaan (Penerimaan, Pengiriman, Retur, Penyesuaian) di rentang tanggal. Anomali = transaksi nilai &gt; 0 + auto_post_jurnal = true TAPI jurnal_umum_id = null.</p>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {/* Summary Cards */}
      {!loading && data?.summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <AuditSummaryCard icon={Package} title="Penerimaan" summary={extractAuditRow(data.summary, 'penerimaan')} tone="blue" />
          <AuditSummaryCard icon={Truck} title="Pengiriman" summary={extractAuditRow(data.summary, 'pengiriman')} tone="purple" />
          <AuditSummaryCard icon={RotateCcw} title="Retur Pembelian" summary={extractAuditRow(data.summary, 'retur_pembelian')} tone="orange" />
          <AuditSummaryCard icon={RotateCcw} title="Retur Penjualan" summary={extractAuditRow(data.summary, 'retur_penjualan')} tone="pink" />
          <AuditSummaryCard icon={Scale} title="Penyesuaian" summary={extractAuditRow(data.summary, 'penyesuaian')} tone="amber" />
        </div>
      )}

      {/* Tabel Anomali */}
      {!loading && data && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Anomali ({filteredAnomali.length})
              </CardTitle>
              <Select value={tipeFilter} onValueChange={setTipeFilter}>
                <SelectTrigger className="w-full sm:w-[200px] h-8 text-xs">
                  <SelectValue placeholder="Filter tipe transaksi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Tipe</SelectItem>
                  <SelectItem value="PENERIMAAN">Penerimaan</SelectItem>
                  <SelectItem value="PENGIRIMAN">Pengiriman</SelectItem>
                  <SelectItem value="RETUR_PEMBELIAN">Retur Pembelian</SelectItem>
                  <SelectItem value="RETUR_PENJUALAN">Retur Penjualan</SelectItem>
                  <SelectItem value="PENYESUAIAN">Penyesuaian</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-[160px]">Tipe</TableHead>
                    <TableHead className="w-[180px]">No Dokumen</TableHead>
                    <TableHead className="w-[120px]">Status</TableHead>
                    <TableHead>Jurnal ID</TableHead>
                    <TableHead>Catatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAnomali.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                        <CheckCircle2Icon /> Tidak ada anomali di periode ini. Semua transaksi sudah memiliki jurnal.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAnomali.map((a, i) => {
                      const conf = TIPE_BADGE[a.tipe];
                      const TipeIcon = conf.icon;
                      return (
                        <TableRow key={`${a.id}-${i}`} className="bg-amber-50/30 hover:bg-amber-50/50">
                          <TableCell>
                            <Badge variant="outline" className={`${conf.bg} hover:bg-opacity-80 text-xs gap-1`}>
                              <TipeIcon className="h-3 w-3" /> {TIPE_LABELS[a.tipe]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {a.noDokumen ? (
                              <button onClick={() => handleOpenDetail(a)} className="font-mono text-xs font-medium text-blue-700 hover:underline cursor-pointer" title="Buka detail transaksi">
                                {a.noDokumen}
                              </button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-50 text-xs">
                              {a.status || '-'}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {a.jurnalUmumId ? (
                              <span className="text-emerald-700">{a.jurnalUmumId.slice(0, 8)}…</span>
                            ) : (
                              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 hover:bg-red-50 text-xs gap-1">
                                <AlertTriangle className="h-3 w-3" /> Tanpa Jurnal
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{a.catatan}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!loading && !error && !data && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">Klik tombol Refresh untuk memuat data audit.</CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function extractAuditRow(summary: AuditPersediaanSummary, prefix: 'penerimaan' | 'pengiriman' | 'retur_pembelian' | 'retur_penjualan' | 'penyesuaian'): { total: number; denganJurnal: number; tanpaJurnal: number } {
  // Backend return summary sebagai plain dict dengan snake_case keys
  // (lihat rekonsiliasi_persediaan_service.py:295-297).
  // Type AuditPersediaanSummary di types/api.ts sengaja pakai snake_case.
  const total = summary[`${prefix}_total`] as number;
  const denganJurnal = summary[`${prefix}_dengan_jurnal`] as number;
  const tanpaJurnal = summary[`${prefix}_tanpa_jurnal`] as number;
  return { total, denganJurnal, tanpaJurnal };
}

function AuditSummaryCard({ icon: Icon, title, summary, tone }: { icon: React.ElementType; title: string; summary: { total: number; denganJurnal: number; tanpaJurnal: number }; tone: 'blue' | 'purple' | 'orange' | 'pink' | 'amber' }) {
  const toneClasses = {
    blue: 'bg-blue-100 text-blue-700',
    purple: 'bg-purple-100 text-purple-700',
    orange: 'bg-orange-100 text-orange-700',
    pink: 'bg-pink-100 text-pink-700',
    amber: 'bg-amber-100 text-amber-700'
  }[tone];
  const hasAnomali = summary.tanpaJurnal > 0;

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${toneClasses}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground truncate">{title}</p>
          <p className="text-lg font-semibold">
            {summary.denganJurnal}
            <span className="text-muted-foreground">/{summary.total}</span>
          </p>
          <p className="text-[11px] text-muted-foreground">transaksi dengan jurnal</p>
        </div>
      </div>
      {hasAnomali && (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-700 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>{summary.tanpaJurnal} tanpa jurnal</span>
        </div>
      )}
    </Card>
  );
}

function CheckCircle2Icon() {
  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
        <FileText className="h-6 w-6 text-emerald-700" />
      </div>
    </div>
  );
}
