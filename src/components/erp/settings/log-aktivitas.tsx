'use client';

// ═══════════════════════════════════════════════════════════════════════════
// === Update #074 — Log Aktivitas (Pengaturan ▸ Sistem ▸ Log Aktivitas) ===
//
// Tambahan untuk memudahkan AUDIT log (di atas Update #073).
// CATATAN REVISI KATA: semua label tampilan memakai bahasa sederhana —
// "Ekspor CSV" → "Unduh CSV", "Kebijakan Retensi Log" → "Lama Simpan Log",
// "Arsip otomatis" → "Simpan salinan dulu (CSV)", "Bersihkan Sekarang" →
// "Hapus Log Lama", kategori "Sistem & Retensi" → "Sistem & Pembersihan",
// "entri" → "catatan". Perilaku & API tidak berubah.
//
//   • UNDUH CSV — tombol "Unduh CSV" mengunduh log SESUAI FILTER AKTIF
//     (cari, kategori, pengguna, rentang tanggal). CSV disusun di sisi
//     klien dari GET /access/audit-logs/export (JSON, maks 10.000 baris)
//     supaya memakai klien `api` yang sama — token otentikasi terikut
//     otomatis. UTF-8 BOM + pemisah ";" → langsung rapi dibuka Excel
//     Indonesia; nama file bertimestamp (log-aktivitas_20250715_1430.csv).
//   • LAMA SIMPAN LOG — kartu "Lama Simpan Log": 30/60/90/180/365
//     hari atau Selamanya (bawaan 180 hari). Catatan lebih tua dari
//     setelan dihapus otomatis tiap hari 02:00 oleh scheduler
//     backend; tombol "Hapus Log Lama" untuk menjalankannya manual.
//     Prinsip "SALINAN DULU, HAPUS KEMUDIAN": bila salinan otomatis aktif,
//     salinan CSV ditulis server lebih dulu — kegagalan salinan MEMBATALKAN
//     penghapusan (tidak ada data hilang tanpa salinan). Pemegang izin:
//     lihat = system.audit.view; ubah setelan/hapus = Super Admin /
//     system.access.edit (tampil "Hanya lihat" + terkunci bila tak berhak).
//   • JEJAK TERCATAT — setiap penghapusan (manual & terjadwal)
//     tercatat sebagai aksi LOG_PURGE dan setiap perubahan setelan
//     sebagai RETENSI_UBAH — kategori filter baru "Sistem & Pembersihan".
//     Jejak "apa yang dihapus & kapan" tidak pernah hilang.
//   • FILTER AUDIT — rentang tanggal (Dari–Sampai + preset Hari ini /
//     7 / 30 / 90 hari) dan filter Pengguna (dropdown dari GET
//     /access/audit-logs/actors). Statistik ringkas (total, login gagal,
//     aktivitas ERP, pengguna & akses) mengikuti filter — dihitung server
//     (key `stats` pada respons, opsional & backward-compatible).
//
// Seluruh perilaku Update #073 tetap: event login & keamanan, manajemen
// pengguna, perubahan akses/RBAC, aktivitas ERP otomatis via middleware,
// auto-refresh polling default 30 detik (15/60/off), badge "N aktivitas baru",
// klik baris → detail Sebelum/Sesudah + JSON, pagination 50/halaman.
//
// Sumber data: GET /access/audit-logs (tabel access_audit_logs, append-only).
// Bila backend belum punya endpoint Update-074 (retensi/ekspor/actors),
// kartu retensi, statistik & dropdown pengguna otomatis tersembunyi —
// halaman tetap berfungsi seperti Update #073 (graceful degradation).
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ChevronDown, ChevronLeft, ChevronRight, Download, FileStack, HardDrive, Loader2, RefreshCw, ScrollText, Search, SearchX, ShieldAlert, ShieldCheck, Trash2, UserCog } from 'lucide-react';
import { toast } from 'sonner';

import { api, ApiError } from '@/lib/api';
// === Uniform tanggal: formatDate sentral dari pdf-utils (sadar preferensi
// FORMAT_TANGGAL, default DD/MM/YYYY) — sebelumnya log aktivitas memakai
// id-ID "03 Okt 2026" sendiri. ===
import { formatDate as formatDateUtil } from '@/lib/pdf-utils';
import { useAccessStore } from '@/store/access-store';
import type { AuditLogEntry, AuditLogListResponse } from '@/types/api';

// ─── Konstanta ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

/** Batas ekspor per file (sama dengan EXPORT_MAX_ROWS di backend). */
const EXPORT_MAX = 10000;

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
  { value: 'AKSES', label: 'Perubahan Akses', actions: 'CREATE_ROLE,UPDATE_ROLE,UPDATE_USER_ACCESS' },
  // === Update #074 — kategori baru: jejak retensi/pembersihan log ===
  { value: 'SISTEM', label: 'Sistem & Pembersihan', actions: 'LOG_PURGE,RETENSI_UBAH' }
];

/** Opsi lama simpan log (value '0' = Selamanya) — backend: RETENTION_CHOICES. */
const RETENTION_OPTIONS = [
  { value: '0', label: 'Selamanya' },
  { value: '30', label: '30 hari' },
  { value: '60', label: '60 hari' },
  { value: '90', label: '90 hari' },
  { value: '180', label: '180 hari (bawaan)' },
  { value: '365', label: '1 tahun (365 hari)' }
];

const labelForRetention = (days: number) => (days === 0 ? 'Selamanya' : `${days} hari`);

/** Aksi yang dihitung dalam statistik "Pengguna & akses". */
const USER_ACCESS_ACTIONS = ['CREATE_USER', 'UPDATE_USER', 'DEACTIVATE_USER', 'ACTIVATE_USER', 'DELETE_USER', 'CREATE_ROLE', 'UPDATE_ROLE', 'UPDATE_USER_ACCESS'];

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
  UPDATE_USER_ACCESS: { label: 'Ubah Akses Pengguna', cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  // === Update #073 (revisi) — aktivitas ERP (middleware backend) ===
  ERP_BUAT: { label: 'Buat Data ERP', cls: 'bg-sky-100 text-sky-700 border-sky-200' },
  ERP_UBAH: { label: 'Ubah Data ERP', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  ERP_HAPUS: { label: 'Hapus Data ERP', cls: 'bg-rose-100 text-rose-700 border-rose-200' },
  ERP_PROSES: { label: 'Proses Dokumen', cls: 'bg-teal-100 text-teal-700 border-teal-200' },
  ERP_DITOLAK: { label: 'Ditolak Sistem', cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  // === Update #074 — aksi lama simpan/penghapusan (kategori Sistem & Pembersihan) ===
  LOG_PURGE: { label: 'Hapus Log Lama', cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  RETENSI_UBAH: { label: 'Ubah Lama Simpan', cls: 'bg-gray-100 text-gray-600 border-gray-200' }
};

const actionBadge = (action: string) => {
  const meta = ACTION_META[action];
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta ? meta.cls : 'bg-gray-100 text-gray-600 border-gray-200'}`}>{meta ? meta.label : action}</span>;
};

/** Format waktu lengkap (tanggal + jam + detik) untuk baris log.
 *  Bagian tanggal lewat formatter sentral (uniform DD/MM/YYYY); jam tetap
 *  id-ID — "03/01/2026, 14.30.05". */
const formatWaktu = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${formatDateUtil(iso)}, ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
};

/** Format tanggal singkat (untuk cutoff retensi) — formatter sentral. */
const formatTanggal = (iso: string | null) => (iso ? formatDateUtil(iso) : '—');

const formatJam = (d: Date | null) => {
  if (!d) return '—';
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

/** Tanggal lokal → 'YYYY-MM-DD' (untuk input type=date). */
const toISODate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Stamp nama file: 20250715_1430 */
const stamp = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
};

/** Normalisasi baris: backend asli memakai `createdAt` → kolom `at`. */
const normalizeRow = (row: AuditLogEntry): AuditLogEntry => ({
  ...row,
  at: typeof row.at === 'string' && row.at ? row.at : (row.createdAt ?? null)
});

// ─── Tipe lokal Update #074 (tidak menyentuh types/api.ts) ─────────────────

interface AuditLogStats {
  total: number;
  loginGagal: number;
  erp: number;
  penggunaAkses: number;
}

type AuditLogListResponse074 = AuditLogListResponse & { stats?: AuditLogStats };

interface AuditLogExportResponse {
  data: AuditLogEntry[];
  total: number;
  truncated: boolean;
  maxRows: number;
}

interface AuditActorOption {
  id: string;
  nama: string;
  username: string;
}

interface RetentionInfo {
  retentionDays: number;
  retentionLabel: string;
  archiveEnabled: boolean;
  cutoff: string | null;
  oldEntries: number;
  lastPurgeAt: string | null;
  lastPurgeCount: number | null;
  lastPurgeArchive: string | null;
  nextPurgeAt: string | null;
  totalEntries: number;
  canManage: boolean;
}

interface PurgeResponse {
  deleted: number;
  cutoff: string | null;
  archive: string | null;
  skipped: string | null;
}

// ─── Unduh CSV (sisi klien, dari JSON /audit-logs/export) ─────────────────

const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

const buildCsv = (rows: AuditLogEntry[]): string => {
  const head = ['Waktu', 'Pengguna', 'Aksi', 'Target', 'Keterangan', 'Detail (JSON)'];
  const body = rows.map((l) => {
    const erpAfter = l.action.startsWith('ERP_') ? (l.after as Record<string, unknown> | null) : null;
    const dokumen = l.targetNama ?? (typeof erpAfter?.dokumen === 'string' ? erpAfter.dokumen : '');
    return [formatWaktu(l.at), l.actorNama ?? 'Tidak dikenal/Sistem', ACTION_META[l.action]?.label ?? l.action, dokumen, l.reason ?? '', JSON.stringify({ before: l.before, after: l.after })];
  });
  return [head, ...body].map((r) => r.map(csvCell).join(';')).join('\r\n');
};

/** Unduh CSV dengan BOM UTF-8 (agar aman dibuka Excel). */
const downloadCsv = (filename: string, csv: string) => {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

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

function StatChip({ icon: Icon, value, label, warn }: { icon: typeof ScrollText; value: number; label: string; warn?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className={`h-4 w-4 ${warn && value > 0 ? 'text-rose-600' : 'text-muted-foreground'}`} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className={`text-lg font-semibold leading-none ${warn && value > 0 ? 'text-rose-600' : ''}`}>{value.toLocaleString('id-ID')}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
      </div>
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
  // === Update #074 — filter pengguna + rentang tanggal ===
  const [actorFilter, setActorFilter] = useState('SEMUA');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [skip, setSkip] = useState(0);

  // ── Auto-refresh (polling) ──
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [intervalSec, setIntervalSec] = useState(30);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [newCount, setNewCount] = useState(0);
  const knownIds = useRef<Set<string>>(new Set());
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Update #074 — statistik ringkas (dari server, opsional) ──
  const [stats, setStats] = useState<AuditLogStats | null>(null);

  // ── Update #074 — dropdown pengguna ──
  const [actors, setActors] = useState<AuditActorOption[]>([]);

  // ── Update #074 — ekspor CSV ──
  const [exporting, setExporting] = useState(false);

  // ── Update #074 — lama simpan log + penghapusan manual ──
  const [retention, setRetention] = useState<RetentionInfo | null>(null);
  const [retentionBusy, setRetentionBusy] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purging, setPurging] = useState(false);

  useEffect(() => {
    debounceTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [search]);

  useEffect(() => {
    setSkip(0);
  }, [debouncedSearch, category, actorFilter, dateFrom, dateTo]);

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
        // === Update #074 — filter pengguna & rentang tanggal ===
        if (actorFilter !== 'SEMUA') params.set('actorUserId', actorFilter);
        if (dateFrom) params.set('dateFrom', dateFrom);
        if (dateTo) params.set('dateTo', dateTo);
        const res = await api.get<AuditLogListResponse074>(`/access/audit-logs?${params.toString()}`);
        const rows = (Array.isArray(res?.data) ? res.data : []).map(normalizeRow);
        // Deteksi catatan baru saat polling senyap (hanya relevan di halaman 1).
        if (silent && skip === 0 && knownIds.current.size > 0) {
          const fresh = rows.filter((r) => !knownIds.current.has(r.id));
          if (fresh.length > 0) setNewCount((c) => c + fresh.length);
        }
        knownIds.current = new Set(rows.map((r) => r.id));
        setData(rows);
        setTotal(typeof res?.total === 'number' ? res.total : 0);
        // === Update #074 — statistik ringkas (backend lama: undefined → sembunyikan) ===
        setStats(res?.stats ?? null);
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
    [debouncedSearch, activeActions, skip, actorFilter, dateFrom, dateTo]
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

  // === Update #074 — dropdown pengguna (sekali, senyap — non-kritis) ===
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    api
      .get<{ data: AuditActorOption[] }>('/access/audit-logs/actors')
      .then((res) => {
        if (!cancelled && Array.isArray(res?.data)) setActors(res.data);
      })
      .catch(() => undefined); // backend belum Update-074 → dropdown disembunyikan
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  // === Update #074 — info lama simpan log (backend lama → kartu tersembunyi) ===
  const fetchRetention = useCallback(async () => {
    try {
      const res = await api.get<RetentionInfo>('/access/audit-logs/retention');
      setRetention(res ?? null);
    } catch {
      setRetention(null); // endpoint tak ada (backend lama) → kartu tidak tampil
    }
  }, []);

  useEffect(() => {
    if (allowed) fetchRetention();
  }, [allowed, fetchRetention]);

  const manualRefresh = () => {
    setNewCount(0);
    fetchData(true);
  };

  const currentPage = Math.floor(skip / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasNext = skip + PAGE_SIZE < total;
  const hasPrev = skip > 0;

  // === Update #074 — Unduh CSV: JSON dari server → CSV di klien ===
  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (activeActions) params.set('action', activeActions);
      if (actorFilter !== 'SEMUA') params.set('actorUserId', actorFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const res = await api.get<AuditLogExportResponse>(`/access/audit-logs/export?${params.toString()}`);
      const rows = (Array.isArray(res?.data) ? res.data : []).map(normalizeRow);
      if (rows.length === 0) {
        toast.error('Tidak ada log yang bisa diunduh. Coba ubah dulu filternya ya.');
        return;
      }
      const filename = `log-aktivitas_${stamp()}.csv`;
      downloadCsv(filename, buildCsv(rows));
      if (res?.truncated) {
        toast.warning(`Log-nya terlalu banyak — hanya ${res.maxRows.toLocaleString('id-ID')} catatan terbaru yang diunduh (total ${res.total.toLocaleString('id-ID')}). File: ${filename}`, { duration: 5000 });
      } else {
        toast.success(`Berhasil — ${rows.length.toLocaleString('id-ID')} catatan log diunduh → ${filename}`, { duration: 4000 });
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal mengunduh log. Coba lagi ya.');
    } finally {
      setExporting(false);
    }
  };

  // === Update #074 — ubah lama simpan (PUT) — tercatat sebagai RETENSI_UBAH ===
  const changeRetention = async (nextDays: number, nextArchive: boolean) => {
    if (!retention) return;
    if (nextDays === retention.retentionDays && nextArchive === retention.archiveEnabled) return;
    setRetentionBusy(true);
    try {
      const res = await api.put<RetentionInfo>('/access/audit-logs/retention', { retentionDays: nextDays, archiveEnabled: nextArchive });
      setRetention(res);
      toast.success(`Berhasil disimpan — log disimpan ${labelForRetention(nextDays)} · salinan otomatis ${nextArchive ? 'dinyalakan' : 'dimatikan'}.`, { duration: 3500 });
      fetchData(true); // aksi RETENSI_UBAH baru muncul di daftar
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal menyimpan setelan. Coba lagi ya.');
    } finally {
      setRetentionBusy(false);
    }
  };

  // === Update #074 — penghapusan manual (POST purge) — tercatat sebagai LOG_PURGE ===
  const doPurge = async () => {
    setPurging(true);
    try {
      const res = await api.post<PurgeResponse>('/access/audit-logs/purge');
      if (res?.skipped === 'SELAMANYA') {
        toast.info('Log disimpan selamanya — tidak ada yang perlu dihapus.');
      } else if ((res?.deleted ?? 0) === 0) {
        toast.info('Belum ada log yang melewati batas simpan — tidak ada yang perlu dihapus.');
      } else {
        toast.success(`${res.deleted.toLocaleString('id-ID')} log lama sudah dihapus${res.archive ? ` · salinannya disimpan di ${res.archive}` : ''}`, { duration: 5000 });
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal menghapus log lama. Coba lagi ya.');
    } finally {
      setPurging(false);
      setPurgeOpen(false);
      fetchRetention();
      fetchData(false);
    }
  };

  /** Preset rentang tanggal untuk audit cepat. */
  const setPreset = (days: number | null) => {
    if (days === null) {
      setDateFrom('');
      setDateTo('');
      return;
    }
    const to = new Date();
    const from = new Date(Date.now() - (days - 1) * 86_400_000);
    setDateFrom(toISODate(from));
    setDateTo(toISODate(to));
  };

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

  const hasFilter = Boolean(debouncedSearch || category !== 'SEMUA' || actorFilter !== 'SEMUA' || dateFrom || dateTo);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Log Aktivitas</h2>
          <p className="text-sm text-muted-foreground">{loading ? 'Memuat data...' : `${total.toLocaleString('id-ID')} catatan aktivitas`}</p>
        </div>
        {/* ── Kontrol auto-refresh + ekspor ── */}
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
              {newCount} aktivitas baru
            </button>
          )}
          <div className="flex items-center gap-2 rounded-md border px-3 py-1.5">
            <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} aria-label="Nyalakan pembaruan otomatis" />
            <Label htmlFor="auto-refresh" className="text-xs font-medium cursor-pointer">
              Perbarui otomatis
            </Label>
            <Select value={String(intervalSec)} onValueChange={(v) => setIntervalSec(Number(v))} disabled={!autoRefresh}>
              <SelectTrigger className="h-7 w-[104px] text-xs" aria-label="Jeda pembaruan otomatis">
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
          {/* === Update #074 — Unduh CSV (ikut filter aktif) === */}
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting || loading} className="gap-2" aria-label="Unduh log yang tampil ke file CSV" title="Unduh log yang sedang tampil (ikut filter pencarian, kategori, pengguna, dan tanggal) — maksimal 10.000 baris">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Unduh CSV
          </Button>
        </div>
      </div>

      {/* ── Penjelasan + status ── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-2xl text-sm text-muted-foreground">
              Semua aktivitas di sistem tercatat di sini: dokumen ERP, login (berhasil/gagal), pengguna, dan perubahan akses. Pilih tanggal atau pengguna lalu klik <strong>Unduh CSV</strong> untuk menyimpan bukti audit. Klik baris untuk melihat detail.
            </p>
            <p className="whitespace-nowrap text-xs text-muted-foreground">
              {autoRefresh ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  Diperbarui otomatis tiap {intervalSec} detik
                </span>
              ) : (
                'Pembaruan otomatis mati — klik Segarkan untuk memuat ulang'
              )}
              {lastUpdated && <span className="ml-2">· Terakhir: {formatJam(lastUpdated)}</span>}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Update #074 — statistik ringkas (mengikuti filter; backend lama: tersembunyi) ── */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatChip icon={ScrollText} value={stats.total} label="Total catatan (sesuai filter)" />
          <StatChip icon={ShieldAlert} value={stats.loginGagal} label="Login gagal" warn />
          <StatChip icon={FileStack} value={stats.erp} label="Aktivitas ERP" />
          <StatChip icon={UserCog} value={stats.penggunaAkses} label="Pengguna & akses" />
        </div>
      )}

      {/* ── Filter: cari · kategori · pengguna · rentang tanggal ── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
              <div className="max-w-sm flex-1">
                <Label className="text-xs text-muted-foreground">Cari</Label>
                <div className="relative mt-1.5">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Cari nama pengguna, nama dokumen, atau keterangan..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" aria-label="Cari log" />
                </div>
              </div>
              <div className="w-full sm:w-52">
                <Label className="text-xs text-muted-foreground">Kategori</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="mt-1.5" aria-label="Saring berdasarkan kategori">
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
              {/* === Update #074 — filter pengguna === */}
              {actors.length > 0 && (
                <div className="w-full sm:w-52">
                  <Label className="text-xs text-muted-foreground">Pengguna</Label>
                  <Select value={actorFilter} onValueChange={setActorFilter}>
                    <SelectTrigger className="mt-1.5" aria-label="Saring berdasarkan pengguna">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SEMUA">Semua Pengguna</SelectItem>
                      {actors.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.nama}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {/* === Update #074 — filter rentang tanggal === */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="w-full sm:w-44">
                <Label htmlFor="log-dari" className="text-xs text-muted-foreground">
                  Dari
                </Label>
                <Input id="log-dari" type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} className="mt-1.5" aria-label="Tanggal mulai" />
              </div>
              <div className="w-full sm:w-44">
                <Label htmlFor="log-sampai" className="text-xs text-muted-foreground">
                  Sampai
                </Label>
                <Input id="log-sampai" type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} className="mt-1.5" aria-label="Tanggal akhir" />
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">Cepat:</span>
            {[
              { label: 'Hari ini', days: 1 },
              { label: '7 hari', days: 7 },
              { label: '30 hari', days: 30 },
              { label: '90 hari', days: 90 }
            ].map((p) => (
              <button key={p.days} type="button" onClick={() => setPreset(p.days)} className="h-7 rounded-full border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted" aria-label={`Tampilkan ${p.label} terakhir`}>
                {p.label}
              </button>
            ))}
            <button type="button" onClick={() => setPreset(null)} className="h-7 rounded-full border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted" aria-label="Tampilkan semua tanggal">
              Semua
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ── Update #074 — kartu Lama Simpan Log (backend lama: tersembunyi) ── */}
      {retention && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-semibold">Lama Simpan Log</p>
                {!retention.canManage && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700" title="Hanya Super Admin (atau pemegang izin system.access.edit) yang boleh mengubah setelan ini">
                    Hanya lihat
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Log yang terlalu lama dihapus otomatis setiap hari jam 02:00 dini hari. Kalau salinan otomatis dinyalakan, salinan CSV dibuat lebih dulu — log tidak pernah terhapus tanpa salinan.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label className="text-xs text-muted-foreground">Simpan log selama</Label>
                <Select value={String(retention.retentionDays)} onValueChange={(v) => changeRetention(Number(v), retention.archiveEnabled)} disabled={!retention.canManage || retentionBusy}>
                  <SelectTrigger className="mt-1.5" aria-label="Lama simpan log">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RETENTION_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col justify-center gap-1.5 rounded-md border px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="arsip-otomatis" className="text-xs font-medium cursor-pointer">
                    Simpan salinan dulu (CSV)
                  </Label>
                  <Switch id="arsip-otomatis" checked={retention.archiveEnabled} onCheckedChange={(on) => changeRetention(retention.retentionDays, on)} disabled={!retention.canManage || retentionBusy} aria-label="Simpan salinan CSV otomatis sebelum hapus" />
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">Sebelum log lama dihapus, sistem membuat salinan CSV-nya lebih dulu.</p>
              </div>
              <div className="rounded-md border bg-muted/30 px-3 py-2.5">
                <p className="text-xs font-medium">Log yang akan dihapus</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {retention.cutoff ? (
                    <>
                      Log lebih lama dari <strong className="text-foreground">{formatTanggal(retention.cutoff)}</strong>: ada <strong className="text-foreground">{retention.oldEntries.toLocaleString('id-ID')} catatan</strong> siap dihapus.
                    </>
                  ) : (
                    'Semua log disimpan selamanya — tidak ada yang dihapus.'
                  )}
                </p>
              </div>
              <div className="rounded-md border bg-muted/30 px-3 py-2.5">
                <p className="text-xs font-medium">Hapus otomatis</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Terakhir: {retention.lastPurgeAt ? `${formatWaktu(retention.lastPurgeAt)} (${(retention.lastPurgeCount ?? 0).toLocaleString('id-ID')} catatan)` : 'Belum pernah'}
                  <br />
                  Berikutnya: {retention.nextPurgeAt ? `${formatWaktu(retention.nextPurgeAt)} — jalan sendiri tiap hari jam 02:00` : '—'}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                Setiap penghapusan dan perubahan setelan di atas otomatis tercatat di tabel ini (sebagai &quot;Hapus Log Lama&quot; / &quot;Ubah Lama Simpan&quot;) — jejaknya tidak pernah hilang.
              </p>
              <Button variant="outline" size="sm" onClick={() => setPurgeOpen(true)} disabled={!retention.canManage || !retention.cutoff || retention.oldEntries === 0 || retentionBusy} className="shrink-0 gap-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700" aria-label="Hapus log lama sekarang">
                <Trash2 className="h-4 w-4" /> Hapus Log Lama{retention.cutoff && retention.oldEntries > 0 ? ` (${retention.oldEntries.toLocaleString('id-ID')})` : ''}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
                      {hasFilter ? <EmptyState icon={SearchX} title="Tidak ada hasil" description="Tidak ada log yang cocok. Coba ubah kata kunci, kategori, pengguna, atau tanggalnya." /> : <EmptyState icon={ScrollText} title="Belum ada aktivitas" description="Log akan muncul otomatis begitu ada aktivitas di sistem." />}
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((log) => {
                    const expanded = expandedId === log.id;
                    const attemptedUsername = (log.after as Record<string, unknown> | null)?.username;
                    // Aktivitas ERP: kolom Target menampilkan dokumen yang
                    // disentuh (payload `after` middleware).
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
                              <span className="text-muted-foreground" title={typeof attemptedUsername === 'string' ? `Mencoba masuk dengan username: ${attemptedUsername}` : 'Pelaku tidak dikenali'}>
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
                                  <summary className="cursor-pointer px-2.5 py-1.5 text-xs text-muted-foreground">Data teknis (JSON — sebelum / sesudah)</summary>
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
            Menampilkan {skip + 1}–{Math.min(skip + PAGE_SIZE, total)} dari {total.toLocaleString('id-ID')} catatan (halaman {currentPage} dari {totalPages})
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

      {/* ── Update #074 — konfirmasi penghapusan (destruktif) ── */}
      <AlertDialog open={purgeOpen} onOpenChange={setPurgeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {retention ? retention.oldEntries.toLocaleString('id-ID') : 0} log lama sekarang?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <span className="leading-relaxed">
                Ada {retention ? retention.oldEntries.toLocaleString('id-ID') : 0} catatan yang lebih lama dari {formatTanggal(retention?.cutoff ?? null)} — sesuai setelan &quot;simpan {retention ? labelForRetention(retention.retentionDays) : ''}&quot;. Catatan itu akan dihapus permanen
                {retention?.archiveEnabled ? '. Tenang: salinan CSV-nya dibuat dulu oleh sistem, jadi datanya tidak benar-benar hilang.' : '. PERHATIAN: salinan otomatis sedang mati — log akan terhapus TANPA salinan!'} Penghapusan ini otomatis tercatat di log sebagai &quot;Hapus Log Lama&quot;.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purging}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // jangan tutup dialog otomatis — doPurge yang menutup
                doPurge();
              }}
              disabled={purging}
              className="bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-600">
              {purging && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Ya, Hapus Log Lama
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
