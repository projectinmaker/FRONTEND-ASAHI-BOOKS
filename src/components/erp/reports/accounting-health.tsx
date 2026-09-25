'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import type { AccountingHealthResponse, AccountingHealthItem } from '@/types/api';
import { formatRp } from '@/lib/pdf-utils';

const todayIso = () => new Date().toISOString().slice(0, 10);

function num(v: number | string): number {
  return typeof v === 'string' ? Number(v) : v;
}

export default function AccountingHealthPage() {
  const [asOf, setAsOf] = useState(todayIso());
  const [data, setData] = useState<AccountingHealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<AccountingHealthResponse>(`/laporan/accounting-health?as_of=${asOf}`);
      setData(res);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal memuat accounting health';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [asOf]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const isHealthy = data?.overallStatus === 'HEALTHY';
  const summary = data?.summary;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Accounting Health Dashboard</h2>
          <p className="text-sm text-muted-foreground">{loading ? 'Memuat...' : `${summary?.totalChecks || 0} reconciliation checks`}</p>
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

      {/* Loading state — prominent because response can be slow */}
      {loading && (
        <Card>
          <CardContent className="p-8 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Checking 11 reconciliations... mungkin butuh 5-10 detik.</p>
          </CardContent>
        </Card>
      )}

      {/* Overall status banner */}
      {!loading && data && (
        <div className={`rounded-lg border p-4 ${isHealthy ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
          <div className="flex items-center gap-2 font-medium">
            {isHealthy ? (
              <>
                <CheckCircle2 className="h-5 w-5" /> HEALTHY — Semua reconciliation match
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5" /> ISSUES FOUND — Beberapa reconciliation mismatch
              </>
            )}
          </div>
          {summary && (
            <p className="text-xs mt-1">
              {summary.matchCount} match, {summary.mismatchCount} mismatch, {summary.notConfiguredCount} not configured
            </p>
          )}
        </div>
      )}

      {/* Summary tags */}
      {!loading && summary && (
        <div className="flex flex-wrap gap-2">
          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">{summary.matchCount} Match</Badge>
          {summary.mismatchCount > 0 && <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">{summary.mismatchCount} Mismatch</Badge>}
          {summary.notConfiguredCount > 0 && <Badge className="bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-100">{summary.notConfiguredCount} Not Configured</Badge>}
        </div>
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

      {/* Reconciliation list */}
      {!loading && data && (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {data.reconciliations.map((item: AccountingHealthItem, i: number) => (
                <div key={i} className="p-4 flex items-start gap-3">
                  {/* Status icon */}
                  <div className="mt-0.5">{item.status === 'MATCH' ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : item.status === 'MISMATCH' ? <XCircle className="h-5 w-5 text-red-600" /> : <AlertTriangle className="h-5 w-5 text-gray-400" />}</div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{item.name}</p>
                      <Badge className={item.status === 'MATCH' ? 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : item.status === 'MISMATCH' ? 'bg-red-100 text-red-700 border-red-200 hover:bg-red-100' : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-100'}>{item.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{item.detail}</p>
                    {item.status !== 'NOT_CONFIGURED' && Number.isFinite(Number(item.selisih)) && Number(item.selisih) !== 0 && <p className="text-xs font-mono mt-1 text-destructive">Selisih: {formatRp(num(item.selisih))}</p>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
