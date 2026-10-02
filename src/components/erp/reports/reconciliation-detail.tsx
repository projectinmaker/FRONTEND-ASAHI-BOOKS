'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import type { GrniReconciliationResponse, CashflowVsBsReconciliationResponse, EquityVsBsReconciliationResponse } from '@/types/api';
import { formatRp } from '@/lib/pdf-utils';

// Tanggal lokal (bukan UTC) — default "as of" harus hari ini menurut zona user (WIB)
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Default "Dari" = awal tahun berjalan (YTD) agar tombol Check langsung bisa dipakai
// tanpa memilih tanggal (m-12: sebelumnya kosong → Check selalu disabled).
const firstDayOfYear = () => `${new Date().getFullYear()}-01-01`;

// Format tanggal lokal id-ID (bukan raw ISO) — konsisten dengan halaman Laporan lain.
// Backend mengirim dateFrom/dateTo sebagai datetime berzona (mis. "2026-01-01T00:00:00+07:00"),
// sehingga tanggal di-parse per komponen agar tidak bergeser oleh timezone browser.
function formatDateID(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d).trim());
    const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(d);
    if (Number.isNaN(date.getTime())) return d;
    return date.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return d;
  }
}

function num(v: number | string): number {
  return typeof v === 'string' ? Number(v) : v;
}

function StatusBadge({ match }: { match: boolean }) {
  return match ? (
    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 gap-1">
      <CheckCircle2 className="h-3 w-3" /> MATCH
    </Badge>
  ) : (
    <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 gap-1">
      <XCircle className="h-3 w-3" /> MISMATCH
    </Badge>
  );
}

function InfoRow({ label, value, isCurrency }: { label: string; value: ReactNode; isCurrency?: boolean }) {
  return (
    <div className="flex justify-between items-start py-2 border-b last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium text-right ${isCurrency ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

// ── GRNI Reconciliation ──────────────────────────────────────────────────────
function GrniReconciliation() {
  const [asOf, setAsOf] = useState(todayIso());
  const [data, setData] = useState<GrniReconciliationResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<GrniReconciliationResponse>(`/laporan/rekonsiliasi/grni?as_of=${asOf}`);
      setData(res);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal memuat rekonsiliasi GRNI');
    } finally {
      setLoading(false);
    }
  }, [asOf]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">As of</Label>
          <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-[150px]" />
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Check
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : data ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">GRNI vs GL Reconciliation</h3>
              <StatusBadge match={data.match} />
            </div>
            <div className="rounded-lg border p-3 space-y-1">
              <InfoRow label="Akun GRNI" value={`${data.grniAccountKode} — ${data.grniAccountNama}`} />
              <InfoRow label="Open GRNI (Penerimaan belum invoiced)" value={formatRp(num(data.openGrniValue))} isCurrency />
              <InfoRow label="GRNI GL Balance" value={formatRp(num(data.grniGlBalance))} isCurrency />
              <InfoRow label="Selisih" value={<span className={data.match ? 'text-emerald-600' : 'text-destructive'}>{formatRp(num(data.selisih))}</span>} isCurrency />
              <InfoRow label="Open Receipts Count" value={data.openReceiptsCount} />
            </div>
            {data.catatan && (
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Catatan</p>
                <p className="text-sm text-muted-foreground">{data.catatan}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// ── Cash Flow vs Balance Sheet ──────────────────────────────────────────────
function CashflowVsBsReconciliation() {
  const [dari, setDari] = useState(firstDayOfYear());
  const [sampai, setSampai] = useState(todayIso());
  const [data, setData] = useState<CashflowVsBsReconciliationResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!dari || !sampai) {
      toast.error('Pilih tanggal awal dan akhir');
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<CashflowVsBsReconciliationResponse>(`/laporan/rekonsiliasi/cashflow-vs-bs?dari=${dari}&sampai=${sampai}`);
      setData(res);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal memuat rekonsiliasi Cash Flow vs BS');
    } finally {
      setLoading(false);
    }
  }, [dari, sampai]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Dari</Label>
          <Input type="date" value={dari} onChange={(e) => setDari(e.target.value)} className="w-[150px]" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Sampai</Label>
          <Input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} className="w-[150px]" />
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading || !dari || !sampai} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Check
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : data ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Cash Flow Ending vs Balance Sheet Cash</h3>
              <StatusBadge match={data.match} />
            </div>
            <div className="rounded-lg border p-3 space-y-1">
              <InfoRow label="Periode" value={`${formatDateID(data.periode.dateFrom)} — ${formatDateID(data.periode.dateTo)}`} />
              <InfoRow label="Cash Flow Ending" value={formatRp(num(data.cashFlowEnding))} isCurrency />
              <InfoRow label="Balance Sheet Cash" value={formatRp(num(data.balanceSheetCash))} isCurrency />
              <InfoRow label="Selisih" value={<span className={data.match ? 'text-emerald-600' : 'text-destructive'}>{formatRp(num(data.selisih))}</span>} isCurrency />
            </div>
            {data.catatan && (
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Catatan</p>
                <p className="text-sm text-muted-foreground">{data.catatan}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// ── Equity vs Balance Sheet ────────────────────────────────────────────────
function EquityVsBsReconciliation() {
  const [dari, setDari] = useState(firstDayOfYear());
  const [sampai, setSampai] = useState(todayIso());
  const [data, setData] = useState<EquityVsBsReconciliationResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!dari || !sampai) {
      toast.error('Pilih tanggal awal dan akhir');
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<EquityVsBsReconciliationResponse>(`/laporan/rekonsiliasi/equity-vs-bs?dari=${dari}&sampai=${sampai}`);
      setData(res);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal memuat rekonsiliasi Equity vs BS');
    } finally {
      setLoading(false);
    }
  }, [dari, sampai]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Dari</Label>
          <Input type="date" value={dari} onChange={(e) => setDari(e.target.value)} className="w-[150px]" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Sampai</Label>
          <Input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} className="w-[150px]" />
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading || !dari || !sampai} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Check
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : data ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Changes in Equity Closing vs Balance Sheet Equity</h3>
              <StatusBadge match={data.match} />
            </div>
            <div className="rounded-lg border p-3 space-y-1">
              <InfoRow label="Periode" value={`${formatDateID(data.periode.dateFrom)} — ${formatDateID(data.periode.dateTo)}`} />
              <InfoRow label="Equity Closing (dari Perubahan Modal)" value={formatRp(num(data.equityClosing))} isCurrency />
              <InfoRow label="Balance Sheet Equity" value={formatRp(num(data.balanceSheetEquity))} isCurrency />
              <InfoRow label="Selisih" value={<span className={data.match ? 'text-emerald-600' : 'text-destructive'}>{formatRp(num(data.selisih))}</span>} isCurrency />
            </div>
            {data.catatan && (
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Catatan</p>
                <p className="text-sm text-muted-foreground">{data.catatan}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// ── Main export — switch based on subPage prop ──────────────────────────────
export default function ReconciliationDetailPage({ subPage }: { subPage?: string }) {
  if (subPage === 'rekonsiliasi-grni') return <GrniReconciliation />;
  if (subPage === 'rekonsiliasi-cf-bs') return <CashflowVsBsReconciliation />;
  if (subPage === 'rekonsiliasi-eq-bs') return <EquityVsBsReconciliation />;
  // Default fallback
  return <div className="p-8 text-center text-muted-foreground">Pilih reconciliation type dari menu sebelah kiri.</div>;
}
