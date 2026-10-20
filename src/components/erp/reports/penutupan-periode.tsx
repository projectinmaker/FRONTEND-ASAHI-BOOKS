'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Lock, Unlock, Loader2, RefreshCw, AlertCircle, ChevronLeft, ChevronRight, CalendarClock, LockOpen, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { formatRp as formatRpIDR } from '@/lib/money';
import { useTabStore } from '@/store/tab-store';
import { useAuthStore } from '@/store/auth-store';
import { FormTabShell } from '@/components/erp/form-tab-shell';
import type { PenutupanPeriodeResponse, PeriodeStatusResponse, PreCloseReadinessResponse, GlReconciliationResponse, PenutupanTahunItem } from '@/types/api';
// AUD-17 (update #05) — scope perusahaan untuk penutupan periode/tahun
import { PerusahaanFilter, useCompanyOptions, type PerusahaanFilterValue } from '@/components/erp/perusahaan-filter';

// ─── Helpers ──────────────────────────────────────────────────────────────

const formatRp = (val: number | null) => (val == null ? '-' : formatRpIDR(val));

const formatDateTime = (d: string | null) => {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return d;
  }
};

const BULAN_LABELS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const PAGE_SIZE = 12;

// ─── Props interface ──────────────────────────────────────────────────────

interface PenutupanPeriodeProps {
  subPage?: string;
  refreshKey?: number;
  formMode?: string;
  formProps?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Tutup Periode Form (rendered in tab)
// ═══════════════════════════════════════════════════════════════════════════

function TutupPeriodeForm({ companyId, companyNama }: { companyId?: string; companyNama?: string | null }) {
  const [tutupTahun, setTutupTahun] = useState(new Date().getFullYear());
  const [tutupBulan, setTutupBulan] = useState(new Date().getMonth() + 1);
  const [tutupKeterangan, setTutupKeterangan] = useState('');
  const [tutupWithEntry, setTutupWithEntry] = useState(true);
  const [tutupLoading, setTutupLoading] = useState(false);

  // Current period status
  const [currentStatus, setCurrentStatus] = useState<PeriodeStatusResponse | null>(null);

  // Pre-close readiness — Phase 8
  const [readiness, setReadiness] = useState<PreCloseReadinessResponse | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);

  // GL reconciliation — Phase 8 (optional widget)
  const [glRecon, setGlRecon] = useState<GlReconciliationResponse | null>(null);
  const [glReconLoading, setGlReconLoading] = useState(false);

  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  // Check selected period status
  const fetchCurrentStatus = useCallback(async (tahun: number, bulan: number) => {
    try {
      const res = await api.get<PeriodeStatusResponse>(`/periode/penutupan-periode/status?tahun=${tahun}&bulan=${bulan}`);
      setCurrentStatus(res);
    } catch {
      setCurrentStatus(null);
    }
  }, []);

  // Phase 8 — pre-close readiness check (informative; tidak block Tutup)
  const fetchReadiness = useCallback(async (tahun: number, bulan: number) => {
    setReadinessLoading(true);
    try {
      const res = await api.get<PreCloseReadinessResponse>(`/periode/penutupan-periode/pre-close-readiness?tahun=${tahun}&bulan=${bulan}`);
      setReadiness(res);
    } catch {
      setReadiness(null);
    } finally {
      setReadinessLoading(false);
    }
  }, []);

  // Phase 8 — GL reconciliation widget (optional, informative)
  const fetchGlRecon = useCallback(async (tahun: number, bulan: number) => {
    setGlReconLoading(true);
    try {
      const res = await api.get<GlReconciliationResponse>(`/periode/penutupan-periode/gl-reconciliation?tahun=${tahun}&bulan=${bulan}`);
      setGlRecon(res);
    } catch {
      setGlRecon(null);
    } finally {
      setGlReconLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentStatus(tutupTahun, tutupBulan);
  }, [tutupTahun, tutupBulan, fetchCurrentStatus]);
  useEffect(() => {
    fetchReadiness(tutupTahun, tutupBulan);
  }, [tutupTahun, tutupBulan, fetchReadiness]);
  useEffect(() => {
    fetchGlRecon(tutupTahun, tutupBulan);
  }, [tutupTahun, tutupBulan, fetchGlRecon]);

  const handleTutup = async () => {
    setTutupLoading(true);
    try {
      await api.post<PenutupanPeriodeResponse>('/periode/penutupan-periode/tutup', {
        tahun: tutupTahun,
        bulan: tutupBulan,
        keterangan: tutupKeterangan || undefined,
        withClosingEntry: tutupWithEntry,
        // AUD-17 — scope perusahaan (tanpa ini = global, mengunci semua perusahaan)
        companyId: companyId || undefined
      });
      toast.success(`Periode ${BULAN_LABELS[tutupBulan - 1]} ${tutupTahun} berhasil ditutup${companyNama ? ` (${companyNama})` : ''}.`);
      refreshListTab('reports', 'penutupan-periode');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal menutup periode.';
      toast.error(msg);
    } finally {
      setTutupLoading(false);
    }
  };

  return (
    <FormTabShell title="Tutup Periode">
      <Card className="max-w-lg">
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Menutup periode akan mengunci semua transaksi pada bulan tersebut.
            {tutupWithEntry && ' Jurnal penutupan akan otomatis dibuat.'}
          </p>

          {/* AUD-17 — indikator scope perusahaan */}
          <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${companyId ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-muted bg-muted/40 text-muted-foreground'}`}>
            <CalendarClock className="h-4 w-4" />
            {companyId ? (
              <span>
                Scope: <strong>{companyNama || companyId}</strong> — hanya periode perusahaan ini yang dikunci.
              </span>
            ) : (
              <span>
                Scope: <strong>Global</strong> — tanpa perusahaan, mengunci semua perusahaan.
              </span>
            )}
          </div>

          {/* Status indicator */}
          {currentStatus && (
            <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${currentStatus.status === 'DITUTUP' ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
              {currentStatus.status === 'DITUTUP' ? (
                <>
                  <Lock className="h-4 w-4" /> Periode ini sudah ditutup.
                </>
              ) : (
                <>
                  <Unlock className="h-4 w-4" /> Periode ini masih terbuka.
                </>
              )}
            </div>
          )}

          {/* Pre-close readiness — Phase 8 */}
          {readinessLoading ? (
            <div className="rounded-lg border p-3 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Memuat readiness check...
            </div>
          ) : readiness ? (
            <div className={`rounded-lg border p-4 space-y-3 ${readiness.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
              <div className="flex items-center gap-2 font-medium">
                {readiness.ready ? (
                  <>
                    <Unlock className="h-4 w-4" /> Periode siap ditutup
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4" /> Periode belum siap ditutup
                  </>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {Object.entries(readiness.checks).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <span className={value ? 'text-emerald-600' : 'text-red-600'}>{value ? '✓' : '✗'}</span>
                    <span className="text-muted-foreground">
                      {key
                        .replace(/([A-Z])/g, ' $1')
                        .replace(/^./, (s) => s.toUpperCase())
                        .toLowerCase()}
                    </span>
                  </div>
                ))}
              </div>
              {!readiness.ready && readiness.blockingIssues.length > 0 && (
                <div className="border-t border-amber-200 pt-2">
                  <p className="text-xs font-semibold mb-1">Blocking issues:</p>
                  <ul className="text-xs space-y-0.5 list-disc list-inside">
                    {readiness.blockingIssues.map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}

          {/* GL Reconciliation widget — Phase 8 (informative) */}
          {glReconLoading ? (
            <div className="rounded-lg border p-3 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Memuat GL reconciliation...
            </div>
          ) : glRecon ? (
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">GL Reconciliation</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className={`flex items-center gap-1.5 rounded px-2 py-1.5 ${glRecon.trialBalance.mutasiMatch ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  <span>{glRecon.trialBalance.mutasiMatch ? '✓' : '✗'}</span>
                  TB Mutasi
                </div>
                <div className={`flex items-center gap-1.5 rounded px-2 py-1.5 ${glRecon.trialBalance.saldoMatch ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  <span>{glRecon.trialBalance.saldoMatch ? '✓' : '✗'}</span>
                  TB Saldo
                </div>
                <div className={`flex items-center gap-1.5 rounded px-2 py-1.5 ${glRecon.balanceSheet.match ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  <span>{glRecon.balanceSheet.match ? '✓' : '✗'}</span>
                  Balance Sheet
                </div>
                <div className={`flex items-center gap-1.5 rounded px-2 py-1.5 font-medium ${glRecon.reconciliationStatus === 'MATCH' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                  <span>{glRecon.reconciliationStatus === 'MATCH' ? '✓' : '✗'}</span>
                  Overall: {glRecon.reconciliationStatus}
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tahun</Label>
              <Select value={String(tutupTahun)} onValueChange={(v) => setTutupTahun(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 5 + i).map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Bulan</Label>
              <Select value={String(tutupBulan)} onValueChange={(v) => setTutupBulan(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BULAN_LABELS.map((b, i) => (
                    <SelectItem key={i} value={String(i + 1)}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Keterangan (opsional)</Label>
            <Textarea value={tutupKeterangan} onChange={(e) => setTutupKeterangan(e.target.value)} placeholder="Catatan penutupan periode..." rows={2} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Buat Jurnal Penutupan</Label>
              <p className="text-xs text-muted-foreground">Zero-out akun P&L, net ke Laba/Rugi Berjalan</p>
            </div>
            <Switch checked={tutupWithEntry} onCheckedChange={setTutupWithEntry} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => activeTabId && closeTab(activeTabId)} disabled={tutupLoading}>
              Batal
            </Button>
            <Button onClick={handleTutup} disabled={tutupLoading || currentStatus?.status === 'DITUTUP'} title={readiness && !readiness.ready ? 'Periode belum siap — lihat blocking issues' : undefined} className="gap-2">
              {tutupLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              <Lock className="h-4 w-4" />
              Tutup Periode
            </Button>
          </div>
        </CardContent>
      </Card>
    </FormTabShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// Wrapper: routes formMode to tutup form, delegates list to inner
// ═══════════════════════════════════════════════════════════════════════════

export default function PenutupanPeriodePage({ refreshKey, formMode, formProps }: PenutupanPeriodeProps) {
  // ── Form mode routing (before any hooks) ──
  if (formMode === 'tutup-periode') {
    const companyId = formProps?.companyId as string | undefined;
    return <TutupPeriodeForm companyId={companyId} companyNama={formProps?.companyNama as string | undefined} />;
  }

  return <PenutupanPeriodeList refreshKey={refreshKey} />;
}

// ═══════════════════════════════════════════════════════════════════════════
// List Component (all hooks live here)
// ═══════════════════════════════════════════════════════════════════════════

function PenutupanPeriodeList({ refreshKey }: { refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab);

  // Phase 8 — hanya manajer/admin yang boleh buka kembali periode
  const user = useAuthStore((s) => s.user);
  const canReopen = user?.role === 'ADMINISTRATOR' || user?.role === 'MANAJER_KEUANGAN';

  // AUD-17 (update #05) — scope perusahaan: tutup/buka/tahun khusus satu perusahaan,
  // atau global (tanpa perusahaan = mengunci semua).
  const [companyFilter, setCompanyFilter] = useState<PerusahaanFilterValue>('ALL');
  const { companies } = useCompanyOptions();
  const scopeCompanyId = companyFilter !== 'ALL' && companyFilter !== 'UNASSIGNED' ? companyFilter : undefined;
  const scopeCompanyNama = scopeCompanyId ? (companies.find((c) => c.id === scopeCompanyId)?.name ?? null) : null;

  // ── State ──
  const [data, setData] = useState<PenutupanPeriodeResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterTahun, setFilterTahun] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  // Buka periode dialog (AlertDialog)
  const [bukaOpen, setBukaOpen] = useState(false);
  const [bukaItem, setBukaItem] = useState<PenutupanPeriodeResponse | null>(null);
  const [bukaAlasan, setBukaAlasan] = useState('');
  const [bukaLoading, setBukaLoading] = useState(false);

  // ── AUD-14 (update #04) — closing tahunan ──
  const [tahunList, setTahunList] = useState<PenutupanTahunItem[]>([]);
  const [tahunBusy, setTahunBusy] = useState(false);
  const [bukaTahunItem, setBukaTahunItem] = useState<PenutupanTahunItem | null>(null);
  const [bukaTahunOpen, setBukaTahunOpen] = useState(false);
  const [bukaTahunAlasan, setBukaTahunAlasan] = useState('');
  const [tutupTahunItem, setTutupTahunItem] = useState<PenutupanTahunItem | null>(null);

  // ── Fetch data ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('skip', String(skip));
      params.set('limit', String(PAGE_SIZE));
      if (filterTahun) params.set('tahun', filterTahun);
      if (filterStatus) params.set('status', filterStatus);
      // AUD-17 — scope perusahaan list periode
      if (scopeCompanyId) params.set('companyId', scopeCompanyId);

      const res = await api.get<{ data: PenutupanPeriodeResponse[]; total: number }>(`/periode/penutupan-periode?${params.toString()}`);
      setData(res.data);
      setTotal(res.total);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal memuat data penutupan periode.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [skip, filterTahun, filterStatus, scopeCompanyId]);

  const fetchTahunList = useCallback(async () => {
    try {
      const cs = scopeCompanyId ? `?companyId=${encodeURIComponent(scopeCompanyId)}` : '';
      const res = await api.get<PenutupanTahunItem[]>(`/periode/penutupan-periode/tahun${cs}`);
      setTahunList(Array.isArray(res) ? res : []);
    } catch {
      // non-fatal — section tetap tampil kosong
      setTahunList([]);
    }
  }, [scopeCompanyId]);

  useEffect(() => {
    fetchData();
    fetchTahunList();
  }, [fetchData, fetchTahunList, refreshKey]);

  // AUD-14 — tutup tahun: transfer laba berjalan → laba ditahan
  const handleTutupTahun = async () => {
    if (!tutupTahunItem) return;
    setTahunBusy(true);
    try {
      await api.post(`/periode/penutupan-periode/tutup-tahun/${tutupTahunItem.tahun}`, {
        keterangan: `Tutup tahun buku ${tutupTahunItem.tahun}`,
        withClosingEntry: true,
        // AUD-17 — scope perusahaan (tanpa companyId = global)
        companyId: scopeCompanyId || undefined
      });
      toast.success(`Tahun buku ${tutupTahunItem.tahun} ditutup${scopeCompanyNama ? ` (${scopeCompanyNama})` : ''} — saldo Laba (Rugi) Tahun Berjalan ditransfer ke Laba (Rugi) Ditahan.`);
      setTutupTahunItem(null);
      fetchTahunList();
      fetchData();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal menutup tahun buku';
      toast.error('Tidak bisa menutup tahun', { description: msg, duration: 8000 });
    } finally {
      setTahunBusy(false);
    }
  };

  // AUD-14 — buka tahun: reversal jurnal transfer + alasan wajib
  const handleBukaTahun = async () => {
    if (!bukaTahunItem) return;
    if (!bukaTahunAlasan.trim()) {
      toast.error('Alasan pembukaan kembali tahun buku wajib diisi.');
      return;
    }
    setTahunBusy(true);
    try {
      await api.post(`/periode/penutupan-periode/buka-tahun/${bukaTahunItem.tahun}`, {
        alasan: bukaTahunAlasan.trim(),
        // AUD-17 — scope perusahaan (tanpa companyId = global)
        companyId: scopeCompanyId || undefined
      });
      toast.success(`Tahun buku ${bukaTahunItem.tahun} dibuka kembali${scopeCompanyNama ? ` (${scopeCompanyNama})` : ''} — jurnal transfer dibalik.`);
      setBukaTahunOpen(false);
      setBukaTahunItem(null);
      setBukaTahunAlasan('');
      fetchTahunList();
      fetchData();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal membuka tahun buku';
      toast.error('Tidak bisa membuka tahun', { description: msg, duration: 8000 });
    } finally {
      setTahunBusy(false);
    }
  };

  // ── Actions ──
  const handleBuka = async () => {
    if (!bukaItem) return;
    // Phase 8 — alasan wajib (client-side validation)
    if (!bukaAlasan.trim()) {
      toast.error('Alasan pembukaan kembali periode wajib diisi.', {
        description: 'Contoh: "Koreksi jurnal periode sebelumnya", "Adjustment audit", dll.',
        duration: 6000
      });
      return;
    }
    setBukaLoading(true);
    try {
      await api.post<PenutupanPeriodeResponse>('/periode/penutupan-periode/buka', {
        tahun: bukaItem.tahun,
        bulan: bukaItem.bulan,
        alasan: bukaAlasan.trim(),
        // AUD-17 — buka mengikuti scope baris: khusus perusahaan bila baris ber-companyId,
        // jika tidak mengikuti scope filter (global bila tanpa perusahaan).
        companyId: bukaItem.companyId || scopeCompanyId || undefined
      });
      toast.success(`Periode ${BULAN_LABELS[bukaItem.bulan - 1]} ${bukaItem.tahun} berhasil dibuka kembali${bukaItem.companyId ? ` (${companies.find((c) => c.id === bukaItem.companyId)?.name ?? ''})` : ''}.`);
      setBukaOpen(false);
      setBukaItem(null);
      setBukaAlasan('');
      fetchData();
    } catch (err) {
      if (err instanceof ApiError) {
        const msg = err.detail;
        // Phase 8 — handle 403 (non-manager)
        if (err.status === 403 || msg.includes('Hanya manajer/admin')) {
          toast.error('Akses ditolak', {
            description: msg,
            duration: 8000
          });
        }
        // Phase 8 — handle sequential reopen violation
        else if (msg.includes('Tidak bisa membuka periode') || msg.includes('Buka kembali periode terbaru')) {
          toast.error('Tidak bisa buka periode ini', {
            description: 'Buka kembali periode terbaru yang masih DITUTUP terlebih dahulu, lalu buka periode ini secara berurutan.',
            duration: 8000
          });
        }
        // Phase 8 — handle empty alasan (kalau somehow bypass client validation)
        else if (msg.includes('Alasan pembukaan kembali periode wajib diisi')) {
          toast.error('Alasan wajib diisi', { description: msg, duration: 6000 });
        } else {
          toast.error(msg);
        }
      } else {
        toast.error('Gagal membuka periode.');
      }
    } finally {
      setBukaLoading(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* ── Header bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{loading ? 'Memuat...' : `${total} periode`}</p>
        <Button
          size="sm"
          className="gap-2"
          onClick={() =>
            openFormTab({
              title: 'Tutup Periode',
              module: 'reports',
              subPage: 'penutupan-periode',
              formKey: 'tutup-periode',
              // AUD-17 — bawa scope perusahaan ke form tutup periode
              formProps: { companyId: scopeCompanyId, companyNama: scopeCompanyNama }
            })
          }>
          <Lock className="h-4 w-4" />
          Tutup Periode
        </Button>
      </div>

      {/* ── Filter bar ── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tahun</Label>
              <Input
                type="number"
                min={2020}
                max={2100}
                placeholder="Tahun"
                value={filterTahun}
                onChange={(e) => {
                  setFilterTahun(e.target.value);
                  setSkip(0);
                }}
                className="w-28"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select
                value={filterStatus}
                onValueChange={(v) => {
                  setFilterStatus(v === '__all__' ? '' : v);
                  setSkip(0);
                }}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Semua Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua Status</SelectItem>
                  <SelectItem value="DITUTUP">Ditutup</SelectItem>
                  <SelectItem value="DIBUKA">Dibuka</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* AUD-17 — scope perusahaan (tutup/buka/tahun per perusahaan atau global) */}
            <PerusahaanFilter value={companyFilter} onChange={setCompanyFilter} label="Scope Perusahaan" allLabel="Semua / Global" includeUnassigned={false} hint="Tutup tanpa perusahaan = global (mengunci semua)" />
            <Button variant="outline" size="sm" onClick={fetchData} className="gap-1">
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── AUD-14 (update #04): Closing Tahunan — transfer laba berjalan → laba ditahan ── */}
      <Card>
        <CardContent className="p-0">
          <div className="border-b bg-muted/30 px-4 py-3">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4" />
              Tutup Tahun Buku (AUD-14)
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Transfer saldo <strong>Laba (Rugi) Tahun Berjalan (322000)</strong> ke <strong>Laba (Rugi) Ditahan (321000)</strong> di akhir tahun. Syarat: tahun sudah berlalu dan seluruh 12 bulan DITUTUP. Jurnal transfer <span className="font-mono">CL-YEAR-{'{tahun}'}</span> dikecualikan dari laporan laba rugi.
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tahun</TableHead>
                  <TableHead className="w-28 text-center">Status</TableHead>
                  <TableHead className="text-right">Laba/(Rugi)</TableHead>
                  <TableHead className="text-center w-32">Bulan Ditutup</TableHead>
                  <TableHead className="w-40 text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tahunList.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-8">
                      Belum ada tahun buku yang bisa ditutup (tutup 12 bulan periode terlebih dahulu).
                    </TableCell>
                  </TableRow>
                )}
                {tahunList.map((th) => (
                  <TableRow key={th.tahun}>
                    <TableCell className="font-medium">{th.tahun}</TableCell>
                    <TableCell className="text-center">
                      {th.status === 'DITUTUP' ? (
                        <Badge variant="default" className="gap-1 bg-emerald-600 hover:bg-emerald-700">
                          <Lock className="h-3 w-3" />
                          Ditutup
                        </Badge>
                      ) : th.status === 'DIBUKA' ? (
                        <Badge variant="secondary" className="gap-1">
                          <LockOpen className="h-3 w-3" />
                          Dibuka
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1">
                          <LockOpen className="h-3 w-3" />
                          Terbuka
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{th.labaRugi != null ? formatRp(parseFloat(th.labaRugi)) : '—'}</TableCell>
                    <TableCell className="text-center">
                      <span className={th.semuaBulanDitutup ? 'text-emerald-700 font-medium' : 'text-muted-foreground'}>{th.bulanDitutup}/12</span>
                    </TableCell>
                    <TableCell className="text-center">
                      {th.status !== 'DITUTUP' && th.semuaBulanDitutup && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="default" className="h-7 gap-1 text-xs" disabled={tahunBusy} onClick={() => setTutupTahunItem(th)}>
                              <Lock className="h-3 w-3" /> Tutup Tahun
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Tutup tahun buku {th.tahun}?</AlertDialogTitle>
                              <AlertDialogDescription>Saldo Laba (Rugi) Tahun Berjalan akan ditransfer ke Laba (Rugi) Ditahan (jurnal CL-YEAR-{th.tahun}). Tindakan ini mengunci tahun; buka kembali memerlukan alasan + manajer/admin.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel onClick={() => setTutupTahunItem(null)}>Batal</AlertDialogCancel>
                              <AlertDialogAction onClick={() => void handleTutupTahun()}>Ya, Tutup Tahun</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                      {th.status === 'DITUTUP' && (
                        <AlertDialog
                          open={bukaTahunOpen && bukaTahunItem?.tahun === th.tahun}
                          onOpenChange={(v) => {
                            if (!v) {
                              setBukaTahunOpen(false);
                              setBukaTahunItem(null);
                            }
                          }}>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 text-xs"
                              disabled={tahunBusy || !canReopen}
                              onClick={() => {
                                setBukaTahunItem(th);
                                setBukaTahunOpen(true);
                              }}>
                              <LockOpen className="h-3 w-3" /> Buka
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Buka kembali tahun buku {th.tahun}?</AlertDialogTitle>
                              <AlertDialogDescription>Jurnal transfer tahun akan dibalik. Bulan-bulan tetap terkunci — buka bulan tertentu lewat aksi baris periode setelah tahun dibuka.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <div className="space-y-1.5 py-2">
                              <Label htmlFor="buka-tahun-alasan" className="text-xs">
                                Alasan (wajib)
                              </Label>
                              <Textarea id="buka-tahun-alasan" value={bukaTahunAlasan} onChange={(e) => setBukaTahunAlasan(e.target.value)} placeholder="mis. Koreksi jurnal tahun berjalan" className="min-h-[70px] text-xs" />
                            </div>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Batal</AlertDialogCancel>
                              <AlertDialogAction onClick={() => void handleBukaTahun()}>Ya, Buka Tahun</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Error ── */}
      {error && !loading && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <p className="text-sm text-destructive flex-1">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchData}>
              Coba Lagi
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {/* ── Table ── */}
      {!loading && !error && (
        <Card>
          <CardContent className="p-0">
            <div className="max-h-[70vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Periode</TableHead>
                    <TableHead className="w-28 text-center">Status</TableHead>
                    <TableHead className="text-right">Laba/(Rugi)</TableHead>
                    <TableHead className="hidden md:table-cell">Jurnal Penutup</TableHead>
                    <TableHead className="hidden lg:table-cell">Ditutup Oleh</TableHead>
                    <TableHead className="hidden lg:table-cell">Tanggal Tutup</TableHead>
                    <TableHead className="w-24 text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-10">
                        <Lock className="h-10 w-10 mx-auto mb-2 opacity-20" />
                        Belum ada periode yang ditutup.
                      </TableCell>
                    </TableRow>
                  )}
                  {data.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {BULAN_LABELS[item.bulan - 1]} {item.tahun}
                        {item.companyId && (
                          <Badge variant="outline" className="ml-2 gap-1 border-sky-200 bg-sky-50 text-sky-700 text-[10px]">
                            <Building2 className="h-3 w-3" />
                            Perusahaan: {companies.find((c) => c.id === item.companyId)?.name ?? '—'}
                          </Badge>
                        )}
                        {item.keterangan && <p className="text-xs text-muted-foreground mt-0.5 max-w-[200px] truncate">{item.keterangan}</p>}
                      </TableCell>
                      <TableCell className="text-center">
                        {item.status === 'DITUTUP' ? (
                          <Badge variant="default" className="gap-1 bg-emerald-600 hover:bg-emerald-700">
                            <Lock className="h-3 w-3" />
                            Ditutup
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <Unlock className="h-3 w-3" />
                            Dibuka
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${item.labaRugi != null && item.labaRugi >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatRp(item.labaRugi)}</TableCell>
                      <TableCell className="hidden md:table-cell">{item.jurnal ? <span className="font-mono text-xs">{item.jurnal.noJurnal}</span> : <span className="text-xs text-muted-foreground">-</span>}</TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">{item.closer?.nama || '-'}</TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{formatDateTime(item.closedAt)}</TableCell>
                      <TableCell className="text-center">
                        {item.status === 'DITUTUP' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                            onClick={() => {
                              if (canReopen) {
                                setBukaItem(item);
                                setBukaOpen(true);
                              }
                            }}
                            disabled={!canReopen}
                            title={canReopen ? undefined : 'Hanya manajer/admin (MANAJER_KEUANGAN/ADMINISTRATOR) yang bisa buka kembali periode'}>
                            <Unlock className="h-3.5 w-3.5" />
                            <span className="hidden xl:inline">Buka</span>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {(skip + 1).toLocaleString()}–{Math.min(skip + PAGE_SIZE, total).toLocaleString()} dari {total.toLocaleString()}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" disabled={skip === 0} onClick={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs px-2">
                  {Math.floor(skip / PAGE_SIZE) + 1} / {totalPages}
                </span>
                <Button variant="outline" size="sm" disabled={skip + PAGE_SIZE >= total} onClick={() => setSkip((s) => s + PAGE_SIZE)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          AlertDialog: Buka Periode (Confirm)
         ══════════════════════════════════════════════════════════════════════ */}
      <AlertDialog open={bukaOpen} onOpenChange={setBukaOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Unlock className="h-5 w-5" />
              Buka Kembali Periode?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Anda akan membuka kembali periode <strong>{bukaItem ? `${BULAN_LABELS[bukaItem.bulan - 1]} ${bukaItem.tahun}` : ''}</strong>. Transaksi baru akan bisa dilakukan pada periode tersebut.
                </p>
                <p className="text-xs text-muted-foreground">
                  <strong>Catatan:</strong> Jurnal penutupan yang sudah dibuat tidak akan dihapus (untuk audit trail). Buat jurnal balik manual jika diperlukan.
                </p>
                <div className="space-y-1.5">
                  <Label>
                    Alasan membuka kembali <span className="text-destructive">*</span> (wajib)
                  </Label>
                  <Textarea value={bukaAlasan} onChange={(e) => setBukaAlasan(e.target.value)} placeholder="Alasan pembukaan kembali..." rows={2} />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bukaLoading}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleBuka();
              }}
              disabled={bukaLoading}
              className="bg-orange-600 hover:bg-orange-700 gap-2">
              {bukaLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              <Unlock className="h-4 w-4" />
              Ya, Buka Kembali
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
