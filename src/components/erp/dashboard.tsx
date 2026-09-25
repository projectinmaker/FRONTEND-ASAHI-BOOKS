'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { CalendarDays, RefreshCw, TrendingUp, TrendingDown, DollarSign, ArrowUpRight, ArrowDownRight, Package, Clock, Scale, AlertTriangle, CheckCircle2, ChevronRight, Activity, Loader2, Info } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { api, ApiError } from '@/lib/api';
import type { DashboardSummaryResponse, FakturJatuhTempoItem, AktivitasItem, RekonsiliasiPersediaanRingkasanResponse, AccountingHealthResponse } from '@/types/api';
import { useTabStore } from '@/store/tab-store';
import { toast } from 'sonner';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatRp(value: number): string {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

function formatShort(value: number): string {
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}Jt`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}Rb`;
  return String(value);
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

// ─── Skeletons ─────────────────────────────────────────────────────────────

function WidgetSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-28" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ChartSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-3 w-48" />
      </CardHeader>
      <CardContent>
        <div className="flex h-[200px] items-center justify-center">
          <Skeleton className="h-full w-full rounded" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Activity icon by tipe ─────────────────────────────────────────────────

function activityIcon(tipe: string) {
  const t = tipe.toUpperCase();
  // Penjualan / Pelunasan Piutang
  if (t.includes('PENJUALAN') || t.includes('PELUNASAN PIUTANG') || t.includes('PENGIRIMAN BARANG')) return <ArrowUpRight className="h-4 w-4 text-emerald-600" />;
  // Pembelian / Pelunasan Hutang / Penerimaan Barang
  if (t.includes('PEMBELIAN') || t.includes('PELUNASAN HUTANG') || t.includes('PENERIMAAN BARANG')) return <ArrowDownRight className="h-4 w-4 text-red-500" />;
  // Pembayaran (legacy) / Pelunasan Hutang
  if (t.includes('PEMBAYARAN') || t.includes('PELUNASAN')) return <DollarSign className="h-4 w-4 text-orange-500" />;
  // Penerimaan (legacy) / Pelunasan Piutang
  if (t.includes('PENERIMAAN')) return <DollarSign className="h-4 w-4 text-emerald-600" />;
  // Transfer Bank (canonical + legacy)
  if (t.includes('TRANSFER')) return <DollarSign className="h-4 w-4 text-cyan-600" />;
  // Persediaan
  if (t.includes('PENYESUAIAN') || t.includes('PEMINDAHAN') || t.includes('PERSEDIAAN')) return <ArrowDownRight className="h-4 w-4 text-teal-500" />;
  // Aset Tetap
  if (t.includes('KAPITALISASI') || t.includes('PENYUSUTAN ASET') || t.includes('PENGHENTIAN') || t.includes('ASET')) return <ArrowDownRight className="h-4 w-4 text-violet-500" />;
  // Rekonsiliasi Bank
  if (t.includes('REKONSILIASI')) return <DollarSign className="h-4 w-4 text-blue-500" />;
  return <Clock className="h-4 w-4 text-muted-foreground" />;
}

function activityBadgeColor(tipe: string) {
  const t = tipe.toUpperCase();
  if (t.includes('PENJUALAN') || t.includes('PELUNASAN PIUTANG') || t.includes('PENGIRIMAN BARANG')) return 'bg-emerald-100 text-emerald-700';
  if (t.includes('PEMBELIAN') || t.includes('PELUNASAN HUTANG') || t.includes('PENERIMAAN BARANG')) return 'bg-red-100 text-red-700';
  if (t.includes('PEMBAYARAN') || t.includes('PELUNASAN')) return 'bg-orange-100 text-orange-700';
  if (t.includes('PENERIMAAN')) return 'bg-emerald-100 text-emerald-700';
  if (t.includes('TRANSFER')) return 'bg-cyan-100 text-cyan-700';
  if (t.includes('PENYESUAIAN') || t.includes('PEMINDAHAN') || t.includes('PERSEDIAAN')) return 'bg-teal-100 text-teal-700';
  if (t.includes('KAPITALISASI') || t.includes('PENYUSUTAN ASET') || t.includes('PENGHENTIAN') || t.includes('ASET')) return 'bg-violet-100 text-violet-700';
  if (t.includes('REKONSILIASI')) return 'bg-blue-100 text-blue-700';
  return 'bg-gray-100 text-gray-600';
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

// ─── Tahap 3: Widget Rekonsiliasi Persediaan (pakai endpoint ringkasan) ───

function RekonsiliasiPersediaanWidget() {
  const openNavTab = useTabStore((s) => s.openNavTab);
  const [data, setData] = useState<RekonsiliasiPersediaanRingkasanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const asOf = new Date().toISOString().slice(0, 10);
      const res = await api.get<RekonsiliasiPersediaanRingkasanResponse>(`/laporan/rekonsiliasi-persediaan/ringkasan?as_of=${asOf}`);
      setData(res);
    } catch (err) {
      // Silent fail — widget dashboard tidak boleh block UI kalau error
      if (err instanceof ApiError) setError(err.detail);
      else setError('Gagal memuat rekonsiliasi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const ringkasan = data?.ringkasan;
  const matchPct = ringkasan && ringkasan.totalAkunDiperiksa > 0 ? Math.round((ringkasan.totalAkunMatch / ringkasan.totalAkunDiperiksa) * 100) : 0;
  const totalSelisih = ringkasan ? Number(ringkasan.totalSelisih) : 0;
  const hasMismatch = Math.abs(totalSelisih) >= 0.01 || (ringkasan?.totalAkunMismatch ?? 0) > 0;
  const hasUnmapped = (ringkasan?.totalAkunUnmapped ?? 0) > 0;
  const thresholdAlert = Math.abs(totalSelisih) > 1_000_000; // > 1 juta

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Scale className="h-4 w-4" />
            Rekonsiliasi Persediaan
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => openNavTab('reports', 'rekonsiliasi-persediaan', 'Rekonsiliasi Persediaan')}>
            Detail <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
        <CardDescription className="text-xs">Konsistensi saldo akun Persediaan vs nilai stok (as of {data?.asOf || '—'})</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : error ? (
          <div className="text-xs text-muted-foreground">{error}</div>
        ) : ringkasan ? (
          <>
            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Akun Match</span>
                <span className="font-medium">
                  {ringkasan.totalAkunMatch} / {ringkasan.totalAkunDiperiksa} ({matchPct}%)
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className={`h-full transition-all ${hasMismatch ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${matchPct}%` }} />
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border bg-emerald-50/50 p-2">
                <p className="text-[10px] text-muted-foreground">Match</p>
                <p className="text-sm font-semibold text-emerald-700">{ringkasan.totalAkunMatch}</p>
              </div>
              <div className={`rounded-md border p-2 ${ringkasan.totalAkunMismatch > 0 ? 'bg-red-50/50' : 'bg-muted/30'}`}>
                <p className="text-[10px] text-muted-foreground">Mismatch</p>
                <p className={`text-sm font-semibold ${ringkasan.totalAkunMismatch > 0 ? 'text-red-700' : 'text-muted-foreground'}`}>{ringkasan.totalAkunMismatch}</p>
              </div>
              <div className={`rounded-md border p-2 ${hasUnmapped ? 'bg-amber-50/50' : 'bg-muted/30'}`}>
                <p className="text-[10px] text-muted-foreground">Unmapped</p>
                <p className={`text-sm font-semibold ${hasUnmapped ? 'text-amber-700' : 'text-muted-foreground'}`}>{ringkasan.totalAkunUnmapped}</p>
              </div>
            </div>

            {/* Total Selisih */}
            <div className={`rounded-md border px-3 py-2 ${thresholdAlert ? 'border-red-300 bg-red-50' : hasMismatch ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50'}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Total Selisih</span>
                <span className={`text-sm font-semibold ${thresholdAlert ? 'text-red-700' : hasMismatch ? 'text-amber-700' : 'text-emerald-700'}`}>{formatRp(totalSelisih)}</span>
              </div>
              {thresholdAlert && (
                <p className="text-[10px] text-red-700 mt-0.5 flex items-center gap-1">
                  <AlertTriangle className="h-2.5 w-2.5" /> Selisih besar — perlu investigasi
                </p>
              )}
              {!hasMismatch && (
                <p className="text-[10px] text-emerald-700 mt-0.5 flex items-center gap-1">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Saldo akun sesuai nilai stok
                </p>
              )}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ─── Phase 9: Widget Accounting Health (cached 5 menit di localStorage) ──

function AccountingHealthWidget() {
  const CACHE_KEY = 'accounting_health_cache';
  const CACHE_TIME_KEY = 'accounting_health_cache_time';
  const TTL = 5 * 60 * 1000; // 5 minutes

  // Read cache synchronously during initial render (avoid setState-in-effect lint).
  const [health, setHealth] = useState<AccountingHealthResponse | null>(() => {
    if (typeof window === 'undefined') return null;
    const cached = localStorage.getItem(CACHE_KEY);
    const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
    if (cached && cachedTime && Date.now() - parseInt(cachedTime) < TTL) {
      try {
        return JSON.parse(cached);
      } catch {
        /* ignore parse error */
      }
    }
    return null;
  });
  const [loading, setLoading] = useState(() => health === null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const asOf = new Date().toISOString().slice(0, 10);
      const res = await api.get<AccountingHealthResponse>(`/laporan/accounting-health?as_of=${asOf}`);
      setHealth(res);
      if (typeof window !== 'undefined') {
        localStorage.setItem(CACHE_KEY, JSON.stringify(res));
        localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
      }
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Skip fetch if cache is valid (initial state already populated from localStorage).
    if (health) return;
    fetchData();
  }, [health, fetchData]);

  const isHealthy = health?.overallStatus === 'HEALTHY';

  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${isHealthy ? 'bg-emerald-50' : 'bg-red-50'}`}>{loading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : isHealthy ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : <AlertTriangle className="h-6 w-6 text-red-600" />}</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-muted-foreground truncate">Accounting Health</p>
          {loading ? (
            <Skeleton className="mt-1.5 h-6 w-24" />
          ) : health ? (
            <>
              <p className={`mt-0.5 text-lg font-bold tracking-tight ${isHealthy ? 'text-emerald-600' : 'text-red-600'}`}>{health.overallStatus}</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 text-[10px]">{health.summary.matchCount} Match</Badge>
                {health.summary.mismatchCount > 0 && <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 text-[10px]">{health.summary.mismatchCount} Mismatch</Badge>}
                {health.summary.notConfiguredCount > 0 && <Badge className="bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-100 text-[10px]">{health.summary.notConfiguredCount} N/A</Badge>}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Gagal memuat</p>
          )}
        </div>
        <Activity className="h-5 w-5 text-muted-foreground/40 shrink-0" />
      </CardContent>
    </Card>
  );
}

// === Phase 10 — 3 widget baru dari /dashboard/summary ============================
// Backend menyatukan inventory_value + low_stock + accounting_health (ringkasan)
// ke dalam response GET /dashboard/summary, jadi widget di bawah cukup menerima prop
// `data` dari parent tanpa fetch terpisah (lebih hemat round-trip).

function InventoryValueWidget({ data }: { data: DashboardSummaryResponse | null }) {
  const inv = data?.inventoryValue;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="h-4 w-4" />
          Nilai Persediaan
        </CardTitle>
        <CardDescription className="text-xs">Total nilai stok dari StockBalance{inv?.asOf ? ` (as of ${inv.asOf})` : ''}</CardDescription>
      </CardHeader>
      <CardContent>
        {!inv ? (
          <div className="flex h-[100px] items-center justify-center">
            <p className="text-xs text-muted-foreground">Tidak ada data</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-muted-foreground">Total Nilai</span>
              <span className="text-lg font-bold font-mono">{formatRp(Number(inv.totalNilai) || 0)}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-muted-foreground">Total Qty</span>
              <span className="text-sm font-medium">{inv.totalQty.toLocaleString('id-ID')} unit</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-muted-foreground">Jumlah Barang</span>
              <span className="text-sm font-medium">{inv.barangCount} item</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LowStockWidget({ data }: { data: DashboardSummaryResponse | null }) {
  const lowStock = data?.lowStock;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Stok Menipis
          {lowStock && lowStock.count > 0 && <Badge className="bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100 text-xs">{lowStock.count}</Badge>}
        </CardTitle>
        <CardDescription className="text-xs">Barang dengan stok di bawah minimum</CardDescription>
      </CardHeader>
      <CardContent>
        {!lowStock || lowStock.items.length === 0 ? (
          <div className="flex h-[100px] items-center justify-center">
            <p className="text-xs text-muted-foreground">Semua stok aman</p>
          </div>
        ) : (
          <div className="max-h-[200px] overflow-y-auto space-y-2">
            {lowStock.items.slice(0, 5).map((item) => (
              <div key={item.barangId} className="flex items-start gap-2 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    <span className="font-mono text-xs text-muted-foreground mr-1.5">{item.kode}</span>
                    {item.nama}
                  </p>
                  <div className="flex gap-2 mt-0.5 text-xs">
                    <span className="text-red-600">Stok: {item.stok}</span>
                    <span className="text-muted-foreground">Min: {item.stokMinimum}</span>
                    <span className="text-destructive font-medium">Selisih: {item.selisih}</span>
                  </div>
                </div>
              </div>
            ))}
            {lowStock.items.length > 5 && <p className="text-xs text-muted-foreground text-center pt-1">+{lowStock.items.length - 5} lainnya</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DashboardAccountingHealthWidget({ data }: { data: DashboardSummaryResponse | null }) {
  const health = data?.accountingHealth;
  const isHealthy = health?.overallStatus === 'HEALTHY';
  const isError = !!health?.error;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Accounting Health (Ringkasan)
        </CardTitle>
        <CardDescription className="text-xs">Status {health?.totalChecks ?? 11} reconciliation checks (dari dashboard summary)</CardDescription>
      </CardHeader>
      <CardContent>
        {!health ? (
          <div className="flex h-[100px] items-center justify-center">
            <p className="text-xs text-muted-foreground">Tidak ada data</p>
          </div>
        ) : isError ? (
          <div className="flex h-[100px] items-center justify-center text-center">
            <p className="text-xs text-red-600">{health.error}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className={`text-lg font-bold ${isHealthy ? 'text-emerald-600' : 'text-red-600'}`}>{health.overallStatus}</div>
            <div className="flex flex-wrap gap-1.5">
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 text-[10px]">{health.matchCount} Match</Badge>
              {health.mismatchCount > 0 && <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 text-[10px]">{health.mismatchCount} Mismatch</Badge>}
              {health.notConfiguredCount > 0 && <Badge className="bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-100 text-[10px]">{health.notConfiguredCount} N/A</Badge>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<DashboardSummaryResponse>(`/dashboard/summary?tanggal=${todayStr()}`);
      setData(res);
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail);
      else setError('Gagal memuat data dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  // Chart colors
  const chartColors = useMemo(() => {
    const palette = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
    return palette;
  }, []);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">Ringkasan bisnis perusahaan</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={fetchDashboard} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Error state */}
      {error && !loading && (
        <Card className="border-destructive">
          <CardContent className="p-4">
            <p className="text-sm text-destructive font-medium">{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={fetchDashboard}>
              Coba Lagi
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 2x2 Grid - 4 Main Widgets */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Widget 1: Laba / Rugi */}
        {loading ? (
          <WidgetSkeleton />
        ) : data ? (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Laba / Rugi
                </CardTitle>
                {data.labaRugi.labaBersih >= 0 ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Laba</Badge> : <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Rugi</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Pendapatan</span>
                  <span className="font-mono">{formatRp(data.labaRugi.pendapatan)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">HPP</span>
                  <span className="font-mono">{formatRp(data.labaRugi.hpp)}</span>
                </div>
                <div className="flex justify-between text-sm font-medium border-t pt-1">
                  <span>Laba Kotor</span>
                  <span className="font-mono">{formatRp(data.labaRugi.labaKotor)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Beban</span>
                  <span className="font-mono">{formatRp(data.labaRugi.beban)}</span>
                </div>
                <div className="flex justify-between text-base font-bold border-t pt-2">
                  <span>Laba Bersih</span>
                  <span className={`font-mono ${data.labaRugi.labaBersih >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatRp(data.labaRugi.labaBersih)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Widget 2: Cashflow */}
        {loading ? (
          <WidgetSkeleton />
        ) : data ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Cashflow
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Saldo Awal</span>
                  <span className="font-mono">{formatRp(data.cashflow.saldoAwal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-emerald-600">Penerimaan</span>
                  <span className="font-mono text-emerald-600">+{formatRp(data.cashflow.penerimaan)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-red-600">Pengeluaran</span>
                  <span className="font-mono text-red-600">-{formatRp(data.cashflow.pengeluaran)}</span>
                </div>
                <div className="flex justify-between text-base font-bold border-t pt-2">
                  <span>Saldo Akhir</span>
                  <span className="font-mono">{formatRp(data.cashflow.saldoAkhir)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Widget 3: Beban Biaya (Bar Chart) */}
        {loading ? (
          <ChartSkeleton />
        ) : data && data.bebanBiaya.items.length > 0 ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Beban Biaya</CardTitle>
              <CardDescription className="text-xs">Rincian beban operasional bulan ini</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.bebanBiaya.items} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="namaBeban" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={formatShort} />
                    <Tooltip formatter={(val: number) => [formatRp(val), 'Jumlah']} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="jumlah" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        ) : !loading ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Beban Biaya</CardTitle>
              <CardDescription className="text-xs">Rincian beban operasional bulan ini</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-[160px] items-center justify-center">
                <p className="text-muted-foreground">Belum ada data beban</p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Widget 4: Tren Penjualan (Line Chart) */}
        {loading ? (
          <ChartSkeleton />
        ) : data && data.trenPenjualan.items.length > 0 ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-1.5">
                Penjualan (Faktur)
                {data.trenPenjualan.labelNote && (
                  <span title={data.trenPenjualan.labelNote} className="text-muted-foreground cursor-help">
                    <Info className="h-3.5 w-3.5" />
                  </span>
                )}
              </CardTitle>
              <CardDescription className="text-xs">{data.trenPenjualan.labelNote ? 'Invoice Turnover — bukan GL Revenue' : 'Penjualan 6 bulan terakhir'}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.trenPenjualan.items} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="bulan" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={formatShort} />
                    <Tooltip formatter={(val: number) => [formatRp(val), 'Penjualan']} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        ) : !loading ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-1.5">
                Penjualan (Faktur)
                {data?.trenPenjualan.labelNote && (
                  <span title={data.trenPenjualan.labelNote} className="text-muted-foreground cursor-help">
                    <Info className="h-3.5 w-3.5" />
                  </span>
                )}
              </CardTitle>
              <CardDescription className="text-xs">{data?.trenPenjualan.labelNote ? 'Invoice Turnover — bukan GL Revenue' : 'Penjualan 6 bulan terakhir'}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-[200px] items-center justify-center">
                <p className="text-muted-foreground">Belum ada data penjualan</p>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Tahap 3 + Phase 10: 3 widget — Rekonsiliasi Persediaan + Nilai Persediaan + Stok Menipis */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <RekonsiliasiPersediaanWidget />
        <InventoryValueWidget data={data} />
        <LowStockWidget data={data} />
      </div>
      {/* Phase 9 — Accounting Health detail widget (cached, fetches /laporan/accounting-health) + Phase 10 — Accounting Health ringkasan dari dashboard summary */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AccountingHealthWidget />
        <DashboardAccountingHealthWidget data={data} />
      </div>

      {/* Bottom Section - Full Width */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Overdue Invoices Table */}
        {loading ? (
          <WidgetSkeleton />
        ) : data ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" />
                Faktur Jatuh Tempo
              </CardTitle>
              <CardDescription>Daftar faktur yang perlu segera ditindaklanjuti</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Faktur</TableHead>
                    <TableHead>Pelanggan</TableHead>
                    <TableHead className="text-right">Sisa</TableHead>
                    <TableHead>Jatuh Tempo</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.fakturJatuhTempo.items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        Tidak ada faktur jatuh tempo
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.fakturJatuhTempo.items.map((f: FakturJatuhTempoItem) => (
                      <TableRow key={f.noFaktur}>
                        <TableCell className="font-mono text-xs">{f.noFaktur}</TableCell>
                        <TableCell className="text-sm">{f.pelanggan}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          <div>{formatRp(f.jumlah)}</div>
                          {f.originalNilai != null && f.originalNilai !== f.jumlah && <div className="text-[10px] text-muted-foreground font-normal">Original: {formatRp(f.originalNilai)}</div>}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{formatDate(f.jatuhTempo)}</TableCell>
                        <TableCell>
                          {f.isOverdue ? (
                            <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 text-xs gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              OVERDUE
                            </Badge>
                          ) : (
                            <Badge variant={f.status === 'SELESAI' ? 'default' : 'secondary'} className="text-xs">
                              {f.status}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}

        {/* Recent Activity */}
        {loading ? (
          <WidgetSkeleton />
        ) : data ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Aktivitas Terbaru
              </CardTitle>
              <CardDescription>Transaksi dan aktivitas terkini</CardDescription>
            </CardHeader>
            <CardContent>
              {data.aktivitasTerbaru.items.length === 0 ? (
                <div className="flex h-[200px] items-center justify-center">
                  <p className="text-muted-foreground">Belum ada aktivitas</p>
                </div>
              ) : (
                <div className="max-h-[400px] overflow-y-auto space-y-3">
                  {data.aktivitasTerbaru.items.map((a: AktivitasItem, i: number) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-full p-1.5 bg-muted">{activityIcon(a.tipe)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{a.deskripsi}</span>
                          <Badge variant="outline" className={`text-[10px] shrink-0 ${activityBadgeColor(a.tipe)}`}>
                            {a.tipe}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                          <span>{a.nomor}</span>
                          <span>{formatDate(a.tanggal)}</span>
                          {a.jumlah != null && (
                            <span className={`font-mono ${a.jumlah >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {a.jumlah >= 0 ? '+' : ''}
                              {formatRp(a.jumlah)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
