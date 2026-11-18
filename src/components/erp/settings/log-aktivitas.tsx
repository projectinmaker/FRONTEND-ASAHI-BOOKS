'use client';

// ═══════════════════════════════════════════════════════════════════════════
// === Update #073 — Log Aktivitas (Pengaturan ▸ Sistem ▸ Log Aktivitas) ===
//
// Pusat pantauan log untuk Admin IT (dan pemegang izin system.audit.view):
//   • Event login: LOGIN (sukses) & LOGIN_GAGAL (password salah / akun
//     nonaktif — username yang dicoba tercatat, password TIDAK PERNAH).
//   • Manajemen pengguna: CREATE_USER, UPDATE_USER, DEACTIVATE_USER,
//     ACTIVATE_USER, DELETE_USER (payload identitas pengguna yang dihapus
//     tetap tersimpan di `before`).
//   • Perubahan akses/RBAC: CREATE_ROLE, UPDATE_ROLE, UPDATE_USER_ACCESS.
//   • === Update #073 (revisi) === Aktivitas ERP: ERP_BUAT, ERP_UBAH,
//     ERP_HAPUS, ERP_PROSES (setujui/batalkan/selesaikan/posting/dll.),
//     dan ERP_DITOLAK (percobaan yang ditolak sistem — HTTP 401/403/5xx).
//     Dicatat otomatis oleh middleware backend untuk SEMUA permintaan
//     yang mengubah data di modul ERP (Kas & Bank, Penjualan, Pembelian,
//     Persediaan, Aset, Jurnal, Master Data, Workflow, Pelunasan, Periode,
//     Produksi, Karyawan, COA) — body request tidak pernah disimpan.
//
// Pembacaan log: SEMI-REALTIME via polling — auto-refresh default 30 detik
// (bisa diubah 15/60 detik atau dimatikan sepenuhnya; tombol muat ulang
// selalu tersedia). Bukan websocket: backend FastAPI terpisah, polling
// ringan dipilih supaya tidak menambah beban koneksi.
//
// Sumber data: GET /access/audit-logs (tabel access_audit_logs, append-only).
// Dialog Role & Akses (tab "Log Perubahan" per user) tetap memakai endpoint
// yang sama — filter param baru (action/actorUserId/search) sepenuhnya
// opsional & backward-compatible.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { ChevronDown, ChevronLeft, ChevronRight, RefreshCw, ScrollText, Search, SearchX, ShieldAlert } from 'lucide-react';

import { api, ApiError } from '@/lib/api';
import { useAccessStore } from '@/store/access-store';
import type { AuditLogEntry, AuditLogListResponse } from '@/types/api';

// ─── Konstanta ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

/** Interval auto-refresh yang ditawarkan (detik). */
const INTERVAL_OPTIONS = [
  { value: '15', label: '15 detik' },
  { value: '30', label: '30 detik' },
  { value: '60', label: '60 detik' }
];

/** Kategori filter → daftar kode aksi (dikirim ke param `action`, koma = OR). */
const CATEGORIES: { value: string; label: string; actions: string | null }[] = [
  { value: 'SEMUA', label: 'Semua Aktivitas', actions: null },
  { value: 'ERP', label: 'Aktivitas ERP', actions: 'ERP_BUAT,ERP_UBAH,ERP_HAPUS,ERP_PROSES,ERP_DITOLAK' },
  { value: 'LOGIN', label: 'Login & Keamanan', actions: 'LOGIN,LOGIN_GAGAL' },
  { value: 'PENGGUNA', label: 'Manajemen Pengguna', actions: 'CREATE_USER,UPDATE_USER,DEACTIVATE_USER,ACTIVATE_USER,DELETE_USER' },
  { value: 'AKSES', label: 'Perubahan Akses', actions: 'CREATE_ROLE,UPDATE_ROLE,UPDATE_USER_ACCESS' }
];

/** Label ramah + warna badge per kode aksi. */
const ACTION_META: Record<string, { label: string; cls: string }> = {
  LOGIN: { label: 'Login', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  LOGIN_GAGAL: { label: 'Login Gagal', cls: 'bg-rose-100 text-rose-700 border-rose-200' },
  CREATE_USER: { label: 'Buat Pengguna', cls: 'bg-sky-100 text-sky-700 border-sky-200' },
  UPDATE_USER: { label: 'Ubah Pengguna', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  DEACTIVATE_USER: { label: 'Nonaktifkan Pengguna', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  ACTIVATE_USER: { label: 'Aktifkan Pengguna', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  DELETE_USER: { label: 'Hapus Pengguna', cls: 'bg-rose-100 text-rose-700 border-rose-200' },
  CREATE_ROLE: { label: 'Buat Role', cls: 'bg-sky-100 text-sky-700 border-sky-200' },
  UPDATE_ROLE: { label: 'Ubah Role', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  UPDATE_USER_ACCESS: { label: 'Ubah Akses User', cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  // === Update #073 (revisi) — aktivitas ERP (middleware backend) ===
  ERP_BUAT: { label: 'Buat Data ERP', cls: 'bg-sky-100 text-sky-700 border-sky-200' },
  ERP_UBAH: { label: 'Ubah Data ERP', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  ERP_HAPUS: { label: 'Hapus Data ERP', cls: 'bg-rose-100 text-rose-700 border-rose-200' },
  ERP_PROSES: { label: 'Proses Dokumen', cls: 'bg-teal-100 text-teal-700 border-teal-200' },
  ERP_DITOLAK: { label: 'Ditolak Sistem', cls: 'bg-orange-100 text-orange-700 border-orange-200' }
};

const actionBadge = (action: string) => {
  const meta = ACTION_META[action];
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta ? meta.cls : 'bg-gray-100 text-gray-600 border-gray-200'}`}>{meta ? meta.label : action}</span>;
};

/** Format waktu lengkap (tanggal + jam + detik) untuk baris log. */
const formatWaktu = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const formatJam = (d: Date | null) => {
  if (!d) return '—';
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

/** Normalisasi baris: backend asli memakai `createdAt` → kolom `at`. */
const normalizeRow = (row: AuditLogEntry): AuditLogEntry => ({
  ...row,
  at: typeof row.at === 'string' && row.at ? row.at : (row.createdAt ?? null)
});

// ─── Panel kecil sebelum/sesudah (payload audit) ────────────────────────────

function SidePanel({ title, side }: { title: string; side: Record<string, unknown> | null }) {
  return (
    <div className="rounded-md border bg-background p-2.5">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {side && Object.keys(side).length > 0 ? (
        <dl className="mt-1.5 space-y-1">
          {Object.entries(side).map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 text-xs">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="break-all text-right font-mono">{typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '—')}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-1.5 text-xs text-muted-foreground/70">—</p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Halaman utama
// ═══════════════════════════════════════════════════════════════════════════

export default function LogAktivitasPage() {
  // Guard izin (menu sudah digating, ini pengaman untuk tab tersimpan/URL).
  const isSuperAdmin = useAccessStore((s) => s.isSuperAdmin);
  const canViewAudit = useAccessStore((s) => s.permissions.includes('system.audit.view'));
  const allowed = isSuperAdmin || canViewAudit;

  const [data, setData] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState('SEMUA');
  const [skip, setSkip] = useState(0);

  // ── Auto-refresh (polling) ──
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [intervalSec, setIntervalSec] = useState(30);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [newCount, setNewCount] = useState(0);
  const knownIds = useRef<Set<string>>(new Set());
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    debounceTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [search]);

  useEffect(() => {
    setSkip(0);
  }, [debouncedSearch, category]);

  const activeActions = useMemo(() => CATEGORIES.find((c) => c.value === category)?.actions ?? null, [category]);

  const fetchData = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('skip', String(skip));
        params.set('limit', String(PAGE_SIZE));
        if (debouncedSearch) params.set('search', debouncedSearch);
        if (activeActions) params.set('action', activeActions);
        const res = await api.get<AuditLogListResponse>(`/access/audit-logs?${params.toString()}`);
        const rows = (Array.isArray(res?.data) ? res.data : []).map(normalizeRow);
        // Deteksi entri baru saat polling senyap (hanya relevan di halaman 1).
        if (silent && skip === 0 && knownIds.current.size > 0) {
          const fresh = rows.filter((r) => !knownIds.current.has(r.id));
          if (fresh.length > 0) setNewCount((c) => c + fresh.length);
        }
        knownIds.current = new Set(rows.map((r) => r.id));
        setData(rows);
        setTotal(typeof res?.total === 'number' ? res.total : 0);
        setLastUpdated(new Date());
        if (!silent) setError(null);
      } catch (err) {
        if (!silent) {
          setError(err instanceof ApiError ? err.detail : 'Gagal memuat log aktivitas');
        }
        // Polling senyap gagal (mis. koneksi drop) → biarkan data lama tampil;
        // banner koneksi global (connection-banner) sudah memberi tahu user.
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [debouncedSearch, activeActions, skip]
  );

  // Muat ulang penuh saat filter/halaman berubah.
  useEffect(() => {
    knownIds.current = new Set();
    setNewCount(0);
    fetchData(false);
  }, [fetchData]);

  // ── Polling auto-refresh ──
  useEffect(() => {
    if (!autoRefresh || !allowed) return;
    const id = setInterval(() => fetchData(true), intervalSec * 1000);
    return () => clearInterval(id);
  }, [autoRefresh, intervalSec, fetchData, allowed]);

  const manualRefresh = () => {
    setNewCount(0);
    fetchData(true);
  };

  const currentPage = Math.floor(skip / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasNext = skip + PAGE_SIZE < total;
  const hasPrev = skip > 0;

  // ── Guard izin ──
  if (!allowed) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Log Aktivitas</h2>
          <p className="text-sm text-muted-foreground">Pusat pantauan log sistem</p>
        </div>
        <Card>
          <CardContent className="p-0">
            <EmptyState icon={ShieldAlert} title="Tidak memiliki izin" description="Halaman ini memerlukan izin system.audit.view (default: Super Admin & Admin IT). Hubungi administrator bila Anda merasa seharusnya memiliki akses." />
          </CardContent>
        </Card>
      </div>
    );
  }

  const SkeletonRows = () => (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell>
            <Skeleton className="h-4 w-40" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-28" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-28 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-28" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-36" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Log Aktivitas</h2>
          <p className="text-sm text-muted-foreground">{loading ? 'Memuat data...' : `${total} entri log`}</p>
        </div>
        {/* ── Kontrol auto-refresh ── */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {newCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setNewCount(0);
                setExpandedId(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
              title="Klik untuk mengosongkan penanda">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              {newCount} entri baru
            </button>
          )}
          <div className="flex items-center gap-2 rounded-md border px-3 py-1.5">
            <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} aria-label="Aktifkan auto-refresh" />
            <Label htmlFor="auto-refresh" className="text-xs font-medium cursor-pointer">
              Auto-refresh
            </Label>
            <Select value={String(intervalSec)} onValueChange={(v) => setIntervalSec(Number(v))} disabled={!autoRefresh}>
              <SelectTrigger className="h-7 w-[104px] text-xs" aria-label="Interval auto-refresh">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTERVAL_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={manualRefresh} className="gap-2" aria-label="Muat ulang log sekarang">
            <RefreshCw className="h-4 w-4" /> Segarkan
          </Button>
        </div>
      </div>

      {/* ── Penjelasan + status ── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-2xl text-sm text-muted-foreground">Log aktivitas sistem: aktivitas ERP (membuat/mengubah/menghapus/memproses dokumen di semua modul), login (sukses/gagal), manajemen pengguna, dan perubahan akses/role. Klik baris untuk melihat detail.</p>
            <p className="whitespace-nowrap text-xs text-muted-foreground">
              {autoRefresh ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  Langsung diperbarui tiap {intervalSec} detik
                </span>
              ) : (
                'Auto-refresh mati — klik Segarkan untuk memuat ulang'
              )}
              {lastUpdated && <span className="ml-2">· Terakhir: {formatJam(lastUpdated)}</span>}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Filter ── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="max-w-sm flex-1">
              <Label className="text-xs text-muted-foreground">Cari</Label>
              <div className="relative mt-1.5">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Nama/username pengguna atau target, kode aksi, keterangan..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" aria-label="Cari log" />
              </div>
            </div>
            <div className="w-full sm:w-52">
              <Label className="text-xs text-muted-foreground">Kategori</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="mt-1.5" aria-label="Filter kategori log">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Error ── */}
      {error && !loading && (
        <Card className="border-destructive">
          <CardContent className="p-4">
            <p className="text-sm text-destructive font-medium">{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => fetchData(false)}>
              Coba Lagi
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Tabel log ── */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto" style={{ maxHeight: '560px', overflowY: 'auto' }}>
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-10" aria-label="Detail" />
                  <TableHead className="whitespace-nowrap">Waktu</TableHead>
                  <TableHead className="whitespace-nowrap">Pengguna</TableHead>
                  <TableHead className="whitespace-nowrap">Aksi</TableHead>
                  <TableHead className="whitespace-nowrap">Target</TableHead>
                  <TableHead className="min-w-48">Keterangan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <SkeletonRows />
                ) : data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="p-0">
                      {debouncedSearch || category !== 'SEMUA' ? <EmptyState icon={SearchX} title="Tidak ada hasil" description="Tidak ada log yang cocok dengan filter. Coba ubah kata kunci atau kategori." /> : <EmptyState icon={ScrollText} title="Belum ada aktivitas" description="Log akan muncul di sini segera setelah ada aktivitas ERP, login, perubahan pengguna, atau perubahan akses." />}
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((log) => {
                    const expanded = expandedId === log.id;
                    const attemptedUsername = (log.after as Record<string, unknown> | null)?.username;
                    // === Update #073 (revisi) — aktivitas ERP: kolom Target
                    // menampilkan dokumen yang disentuh (payload `after`
                    // middleware) karena tidak ada pengguna target. ===
                    const erpAfter = log.action.startsWith('ERP_') ? (log.after as Record<string, unknown> | null) : null;
                    const erpDokumen = typeof erpAfter?.dokumen === 'string' ? erpAfter.dokumen : null;
                    const erpModul = typeof erpAfter?.modul === 'string' ? erpAfter.modul : null;
                    return (
                      <Fragment key={log.id}>
                        <TableRow className="cursor-pointer" onClick={() => setExpandedId((prev) => (prev === log.id ? null : log.id))} aria-expanded={expanded}>
                          <TableCell>
                            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{formatWaktu(log.at)}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {log.actorNama ? (
                              log.actorNama
                            ) : (log.action === 'LOGIN_GAGAL' || log.action === 'ERP_DITOLAK') && !log.actorId ? (
                              <span className="text-muted-foreground" title={typeof attemptedUsername === 'string' ? `Percobaan atas username: ${attemptedUsername}` : 'Pengguna tidak teridentifikasi (tanpa token valid)'}>
                                Tidak dikenal{typeof attemptedUsername === 'string' ? ` (@${attemptedUsername})` : ''}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Sistem</span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{actionBadge(log.action)}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{log.targetNama ? log.targetNama : erpDokumen ? <span title={erpModul ? `Modul: ${erpModul}` : undefined}>{erpDokumen}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="max-w-64 truncate text-xs text-muted-foreground" title={log.reason ?? ''}>
                            {log.reason || '—'}
                          </TableCell>
                        </TableRow>
                        {expanded && (
                          <TableRow>
                            <TableCell colSpan={6} className="bg-muted/30">
                              <div className="space-y-2">
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <SidePanel title="Sebelum" side={log.before ?? null} />
                                  <SidePanel title="Sesudah" side={log.after ?? null} />
                                </div>
                                <details className="rounded-md border bg-background">
                                  <summary className="cursor-pointer px-2.5 py-1.5 text-xs text-muted-foreground">JSON details (sebelum / sesudah)</summary>
                                  <pre className="max-h-48 overflow-auto border-t px-2.5 py-2 text-[10px] leading-relaxed">{JSON.stringify({ before: log.before, after: log.after }, null, 2)}</pre>
                                </details>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Pagination ── */}
      {!loading && total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Menampilkan {skip + 1}–{Math.min(skip + PAGE_SIZE, total)} dari {total} entri (Halaman {currentPage} dari {totalPages})
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={!hasPrev} onClick={() => setSkip((s) => s - PAGE_SIZE)} className="gap-1">
              <ChevronLeft className="h-4 w-4" /> Sebelumnya
            </Button>
            <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => setSkip((s) => s + PAGE_SIZE)} className="gap-1">
              Selanjutnya <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
