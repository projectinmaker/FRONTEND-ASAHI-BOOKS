'use client';

import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, ChevronDown, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
import { api, ApiError, PaginatedResponse } from '@/lib/api';
import { useAuthStore } from '@/store/auth-store';
import { useAccessStore } from '@/store/access-store';
import type {
  AuditLogEntry,
  AuditLogListResponse,
  PenggunaResponse,
  RegistryActionItem,
  RegistryModuleItem,
  RegistryTreeResponse,
  RoleDetail,
  RoleListResponse,
  RoleSummary,
  UserAccessSummary,
  UserAccessUpdatePayload
} from '@/types/api';

// ── Konstanta ────────────────────────────────────────────────────────────────

/** Nilai sentinel opsi "Tanpa template" pada Select (SelectItem tidak boleh ""). */
const NO_TEMPLATE_VALUE = '__no_template__';

const AUDIT_LIMIT = 50;

/** Marker versi file — untuk verifikasi file ini benar-benar ter-apply.
 *  Cek console browser setelah membuka dialog: "[RoleAccessDialog] vR4 loaded".
 *  Jika log TIDAK muncul → file lama masih dipakai (update belum tertimpa).
 *  R4: dialog UNIVERSAL — kompatibel dengan 2 keluarga backend:
 *  (A) rekonstruksi sandbox: registry {"modules":[...]}, summary nested `user`, PUT templateCode;
 *  (B) backend asli (repo GitHub): registry array polos, summary flat userId,
 *      PUT roleIds (REPLACE-SET) — tanpa ini role user bisa terhapus saat simpan. */
const DIALOG_VERSION = 'R4';

if (typeof console !== 'undefined') {
  // sengaja pakai console.info — alat diagnostik versi file
  console.info(`[RoleAccessDialog] v${DIALOG_VERSION} loaded`);
}

// ── Helper ───────────────────────────────────────────────────────────────────

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function shortId(id: string | null): string {
  if (!id) return '—';
  return `${id.slice(0, 8)}…`;
}

function auditCountOverrides(side: Record<string, unknown> | null): number {
  if (!side) return 0;
  const list = side.overrides;
  return Array.isArray(list) ? list.length : 0;
}

function auditListOverrides(side: Record<string, unknown> | null): Array<{ permissionCode: string; effect: string }> {
  if (!side) return [];
  const list = side.overrides;
  if (!Array.isArray(list)) return [];
  return list.filter((o): o is { permissionCode: string; effect: string } => {
    return typeof o === 'object' && o !== null && 'permissionCode' in o && 'effect' in o;
  });
}

/**
 * Normalisasi respons GET /access/permissions — universal untuk 2 keluarga backend:
 *  (A) {"modules": [...]} dengan label/description + action.code lengkap;
 *  (B) backend asli: ARRAY POLOS dengan moduleName/resourceName/actionName dan
 *      action TANPA `code` (dirakit dari `module.resource.action`).
 * Bentuk tak dikenali → null (ditampilkan sebagai error terbaca, bukan crash).
 */
export function normalizeRegistry(raw: unknown): RegistryTreeResponse | null {
  let modules: unknown = null;
  if (Array.isArray(raw)) {
    modules = raw; // backend asli: array polos
  } else if (raw && typeof raw === 'object') {
    const obj = raw as { modules?: unknown; data?: unknown };
    if (Array.isArray(obj.modules)) modules = obj.modules;
    else if (Array.isArray(obj.data)) modules = obj.data; // bentuk { data: [...] }
  }
  if (!Array.isArray(modules)) return null;
  const normalizedModules = modules
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
    .map((m) => {
      const moduleCode = typeof m.module === 'string' ? m.module : '';
      return {
        module: moduleCode,
        label:
          typeof m.label === 'string' ? m.label
          : typeof m.moduleName === 'string' ? m.moduleName
          : moduleCode,
        resources: (Array.isArray(m.resources) ? m.resources : [])
          .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
          .map((r) => {
            const resourceCode = typeof r.resource === 'string' ? r.resource : '';
            return {
              resource: resourceCode,
              label:
                typeof r.label === 'string' ? r.label
                : typeof r.resourceName === 'string' ? r.resourceName
                : resourceCode,
              actions: (Array.isArray(r.actions) ? r.actions : [])
                .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
                .map((a) => {
                  // Backend asli tidak menyertakan `code` — dirakit dari path.
                  const action =
                    typeof a.action === 'string' ? a.action
                    : typeof a.code === 'string' ? (a.code.split('.').pop() ?? '')
                    : '';
                  const code =
                    typeof a.code === 'string' && a.code ? a.code
                    : `${moduleCode}.${resourceCode}.${action}`;
                  return {
                    code,
                    action,
                    description:
                      typeof a.description === 'string' ? a.description
                      : typeof a.actionName === 'string' ? a.actionName
                      : '',
                    isSensitive: a.isSensitive === true
                  };
                })
            };
          })
      };
    });
  return { modules: normalizedModules };
}

/**
 * Normalisasi respons GET/PUT /access/users/{id}/access — universal:
 *  (A) nested `user` + templateCode + effectiveCount (backend rekonstruksi);
 *  (B) FLAT: userId/username/namaLengkap/roles/legacyRole, TANPA objek user,
 *      TANPA templateCode (disintesis dari roles[0]) dan tanpa effectiveCount
 *      (fallback panjang effectivePermissions).
 */
export function normalizeSummary(raw: unknown, userId: string): UserAccessSummary | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const s = raw as Record<string, unknown>;

  // Objek user — terima nested {user:{...}} maupun flat {userId/username/...}.
  const rawUser =
    s.user && typeof s.user === 'object' && !Array.isArray(s.user)
      ? (s.user as Record<string, unknown>)
      : null;
  const user = {
    id:
      typeof rawUser?.id === 'string' ? rawUser.id
      : typeof s.userId === 'string' ? s.userId
      : typeof s.id === 'string' ? s.id
      : userId,
    nama:
      typeof rawUser?.nama === 'string' ? rawUser.nama
      : typeof rawUser?.namaLengkap === 'string' ? rawUser.namaLengkap
      : typeof s.nama === 'string' ? s.nama
      : typeof s.namaLengkap === 'string' ? s.namaLengkap
      : '',
    username:
      typeof rawUser?.username === 'string' ? rawUser.username
      : typeof s.username === 'string' ? s.username
      : '',
    roleEnum:
      typeof rawUser?.roleEnum === 'string' ? rawUser.roleEnum
      : typeof rawUser?.role === 'string' ? rawUser.role
      : typeof s.roleEnum === 'string' ? s.roleEnum
      : typeof s.legacyRole === 'string' ? s.legacyRole
      : '',
  };

  const overrides = (Array.isArray(s.overrides) ? s.overrides : [])
    .filter((o): o is Record<string, unknown> => !!o && typeof o === 'object')
    .map((o) => ({
      permissionCode: typeof o.permissionCode === 'string' ? o.permissionCode : '',
      effect: o.effect === 'DENY' ? ('DENY' as const) : ('ALLOW' as const),
      reason: typeof o.reason === 'string' ? o.reason : null,
      grantedBy: typeof o.grantedBy === 'string' ? o.grantedBy : null,
    }));

  const roles = (Array.isArray(s.roles) ? s.roles : [])
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({
      id: typeof r.id === 'string' ? r.id : '',
      code: typeof r.code === 'string' ? r.code : '',
      name: typeof r.name === 'string' ? r.name : '',
    }));

  const templatePermissions = (
    Array.isArray(s.templatePermissions) ? s.templatePermissions : []
  ).filter((c): c is string => typeof c === 'string');

  const effectivePermissions = (
    Array.isArray(s.effectivePermissions) ? s.effectivePermissions : []
  ).filter((c): c is string => typeof c === 'string');

  // Template — bentuk flat (backend asli) tidak punya templateCode/templateName:
  // sintesis dari roles[0] (role-link = template pada backend tersebut).
  const templateCode =
    typeof s.templateCode === 'string' && s.templateCode ? s.templateCode
    : roles.length > 0 && roles[0].code ? roles[0].code
    : null;
  const templateName =
    typeof s.templateName === 'string' && s.templateName ? s.templateName
    : roles.length > 0 && roles[0].name ? roles[0].name
    : null;

  return {
    user,
    isSuperAdmin: s.isSuperAdmin === true,
    roles,
    templateCode,
    templateName,
    templatePermissions,
    overrides,
    effectivePermissions,
    effectiveCount:
      typeof s.effectiveCount === 'number' ? s.effectiveCount : effectivePermissions.length,
  };
}

// ── Panel Sebelum/Sesudah untuk baris audit expandable ───────────────────────

function AuditSidePanel({ title, side }: { title: string; side: Record<string, unknown> | null }) {
  const templateCode = side ? (side.templateCode as string | null ?? null) : null;
  const roleCodes = side && Array.isArray(side.roles) ? (side.roles as string[]) : [];
  const effectiveCount = side ? (side.effectiveCount as number | null ?? null) : null;
  const overrides = auditListOverrides(side);
  return (
    <div className="rounded-md border bg-background p-2.5 text-xs">
      <p className="font-semibold text-foreground">{title}</p>
      <ul className="mt-1 space-y-0.5 text-muted-foreground">
        <li>Template: <span className="font-mono">{templateCode || '—'}</span></li>
        <li>Roles: <span className="font-mono">{roleCodes.length ? roleCodes.join(', ') : '—'}</span></li>
        <li>Jumlah override: {overrides.length}</li>
        <li>Efektif: {effectiveCount ?? '—'} izin</li>
      </ul>
      {overrides.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {overrides.map((o) => (
            <li key={o.permissionCode} className="font-mono text-[11px]">
              <span className={o.effect === 'ALLOW' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                {o.effect === 'ALLOW' ? '＋' : '－'}
              </span>{' '}
              {o.permissionCode}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

interface RoleAccessDialogProps {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── Dialog utama ─────────────────────────────────────────────────────────────

export function RoleAccessDialog({ userId, open, onOpenChange }: RoleAccessDialogProps) {
  const actor = useAuthStore((s) => s.user);

  // ── Data server ──
  const [summary, setSummary] = useState<UserAccessSummary | null>(null);
  const [registry, setRegistry] = useState<RegistryTreeResponse | null>(null);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fetchingTemplate, setFetchingTemplate] = useState(false);

  // ── State edit lokal ──
  const [localTemplateCode, setLocalTemplateCode] = useState<string | null>(null);
  const [templatePerms, setTemplatePerms] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, 'ALLOW' | 'DENY'>>({});
  const [reason, setReason] = useState('');
  const [reasonTouched, setReasonTouched] = useState(false);
  const [onlyDiff, setOnlyDiff] = useState(false);

  // ── Tab log audit ──
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);
  const [userNameMap, setUserNameMap] = useState<Record<string, string>>({});

  // Cache permission per template role (hindari fetch ulang).
  const rolePermsCache = useRef<Record<string, string[]>>({});
  // Penanda urutan request template (cegah race saat ganti template cepat).
  const templateReqSeq = useRef(0);

  // ── Muat data awal ──
  const applySummary = useCallback((s: UserAccessSummary) => {
    setSummary(s);
    setLocalTemplateCode(s.templateCode);
    setTemplatePerms(s.templateCode ? (s.templatePermissions ?? []) : []);
    if (s.templateCode) rolePermsCache.current[s.templateCode] = s.templatePermissions ?? [];
    const map: Record<string, 'ALLOW' | 'DENY'> = {};
    for (const o of Array.isArray(s.overrides) ? s.overrides : []) {
      map[o.permissionCode] = o.effect;
    }
    setOverrides(map);
    setReason('');
    setReasonTouched(false);
  }, []);

  const loadAudit = useCallback(async () => {
    if (!userId) return;
    setAuditLoading(true);
    setAuditError(null);
    try {
      // Param dikirim GANDA: backend rekonstruksi memakai target_user_id,
      // backend asli hanya mengenali alias targetUserId — masing-masing
      // mengabaikan param yang tidak dikenalnya.
      const res = await api.get<AuditLogListResponse>(
        `/access/audit-logs?skip=0&limit=${AUDIT_LIMIT}&target_user_id=${userId}&targetUserId=${userId}`
      );
      const rows = Array.isArray(res?.data) ? res.data : [];
      // Backend asli memakai `createdAt` — normalisasi ke `at` agar kolom Waktu terisi.
      setAuditLogs(
        rows.map((row) => ({
          ...row,
          at: typeof row.at === 'string' && row.at ? row.at : (row.createdAt ?? null),
        }))
      );
      setAuditTotal(typeof res?.total === 'number' ? res.total : 0);
    } catch (err) {
      setAuditError(err instanceof ApiError ? err.detail : 'Gagal memuat log perubahan');
    } finally {
      setAuditLoading(false);
    }
  }, [userId]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadError(null);
    rolePermsCache.current = {};
    try {
      const [sum, reg, roleList] = await Promise.all([
        api.get<unknown>(`/access/users/${userId}/access`),
        api.get<unknown>('/access/permissions'),
        api.get<RoleListResponse>('/access/roles')
      ]);
      // Bentuk respons registry bergantung versi backend — normalisasi agar
      // mismatch frontend/backend tidak memicu crash runtime.
      const normalizedRegistry = normalizeRegistry(reg);
      if (!normalizedRegistry) {
        throw new ApiError(
          422,
          'Format registry akses tidak dikenali. Pastikan backend berjalan dengan file access versi terbaru lalu buka ulang dialog — endpoint /access/permissions harus mengembalikan daftar modul (array atau {"modules": [...]}).'
        );
      }
      // Ringkasan akses juga dinormalisasi — backend lama bisa mengembalikan
      // bentuk tanpa objek `user` (mis. flat userId/username).
      const normalizedSummary = normalizeSummary(sum, userId);
      if (!normalizedSummary) {
        throw new ApiError(
          422,
          'Format ringkasan akses tidak dikenali. Pastikan file backend versi terbaru sudah disalin PENUH (terutama app/services/access_service.py) dan backend di-restart.'
        );
      }
      setRegistry(normalizedRegistry);
      setRoles(Array.isArray(roleList?.data) ? roleList.data : []);
      applySummary(normalizedSummary);
      void loadAudit();
      // Peta id → username untuk kolom Aktor (best-effort; fallback short id).
      api
        .get<PaginatedResponse<PenggunaResponse>>('/pengguna?limit=100')
        .then((res) => {
          const m: Record<string, string> = {};
          for (const u of Array.isArray(res?.data) ? res.data : []) m[u.id] = u.username;
          if (actor) m[actor.id] = actor.username;
          setUserNameMap(m);
        })
        .catch(() => {
          /* abaikan — kolom aktor fallback ke id pendek */
        });
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.detail : 'Gagal memuat data akses');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [userId, applySummary, loadAudit, actor]);

  useEffect(() => {
    if (open && userId) {
      void load();
    }
    if (!open) {
      // Reset saat dialog ditutup agar tidak menampilkan state basi.
      setSummary(null);
      setRegistry(null);
      setRoles([]);
      setOverrides({});
      setLocalTemplateCode(null);
      setTemplatePerms([]);
      setReason('');
      setReasonTouched(false);
      setOnlyDiff(false);
      setAuditLogs([]);
      setAuditTotal(0);
      setExpandedAuditId(null);
      setLoadError(null);
    }
  }, [open, userId, load]);

  // ── Turunan (derived) ──
  const templateSet = useMemo(() => new Set(templatePerms), [templatePerms]);

  const allActionCodes = useMemo(() => {
    if (!registry) return [] as string[];
    return (registry.modules ?? []).flatMap((m) =>
      (m.resources ?? []).flatMap((r) => (r.actions ?? []).map((a) => a.code))
    );
  }, [registry]);

  const registryModuleById = useMemo(() => {
    const m: Record<string, RegistryModuleItem> = {};
    for (const mod of registry?.modules ?? []) m[mod.module] = mod;
    return m;
  }, [registry]);

  const isTargetSuperAdmin = summary?.isSuperAdmin ?? false;
  const isSelf = !!actor && !!summary && actor.id === summary.user.id;
  const readonly = isTargetSuperAdmin || isSelf;

  const isOn = useCallback(
    (code: string) => {
      if (isTargetSuperAdmin) return true;
      const ov = overrides[code];
      if (ov === 'DENY') return false;
      if (ov === 'ALLOW') return true;
      return templateSet.has(code);
    },
    [isTargetSuperAdmin, overrides, templateSet]
  );

  const effectiveSet = useMemo(() => {
    const s = new Set<string>();
    for (const code of allActionCodes) {
      if (isOn(code)) s.add(code);
    }
    return s;
  }, [allActionCodes, isOn]);

  const effectiveCount = isTargetSuperAdmin ? allActionCodes.length : effectiveSet.size;
  const overrideCount = Object.keys(overrides).length;

  const savedOverrideMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const o of summary?.overrides ?? []) m[o.permissionCode] = o.effect;
    return m;
  }, [summary]);

  const overridesChanged = useMemo(() => {
    const localKeys = Object.keys(overrides);
    const savedKeys = Object.keys(savedOverrideMap);
    if (localKeys.length !== savedKeys.length) return true;
    return localKeys.some((k) => savedOverrideMap[k] !== overrides[k]);
  }, [overrides, savedOverrideMap]);

  const templateChanged = (localTemplateCode ?? null) !== (summary?.templateCode ?? null);
  const hasChanges = templateChanged || overridesChanged;
  const reasonValid = reason.trim().length >= 3;
  const canSave = hasChanges && reasonValid && !readonly && !saving;

  const templateLabel = useMemo(() => {
    if (!localTemplateCode) return 'Tanpa template';
    return roles.find((r) => r.code === localTemplateCode)?.name ?? summary?.templateName ?? localTemplateCode;
  }, [localTemplateCode, roles, summary]);

  // Modul/resource yang tampil (memperhitungkan filter "hanya yang berbeda").
  const visibleModules = useMemo(() => {
    if (!registry) return [] as RegistryModuleItem[];
    return (registry.modules ?? [])
      .map((mod) => {
        const resources = (mod.resources ?? [])
          .map((res) => {
            const actions = (res.actions ?? []).filter((a) => {
              if (!onlyDiff) return true;
              const hasOverride = !!overrides[a.code];
              return hasOverride || isOn(a.code) !== templateSet.has(a.code);
            });
            return { ...res, actions };
          })
          .filter((res) => res.actions.length > 0);
        return { ...mod, resources };
      })
      .filter((mod) => mod.resources.length > 0);
  }, [registry, onlyDiff, overrides, templateSet, isOn]);

  // ── Handler ──
  const handleToggle = (code: string) => {
    if (readonly) return;
    const inherited = templateSet.has(code);
    const next = !isOn(code);
    setOverrides((prev) => {
      const nextMap = { ...prev };
      if (next === inherited) {
        // Toggle balik ke posisi inherited → override dihapus.
        delete nextMap[code];
      } else {
        nextMap[code] = next ? 'ALLOW' : 'DENY';
      }
      return nextMap;
    });
  };

  const handleTemplateChange = async (value: string) => {
    if (readonly) return;
    if (value === NO_TEMPLATE_VALUE) {
      templateReqSeq.current += 1;
      setLocalTemplateCode(null);
      setTemplatePerms([]);
      return;
    }
    setLocalTemplateCode(value);
    if (rolePermsCache.current[value]) {
      setTemplatePerms(rolePermsCache.current[value]);
      return;
    }
    const role = roles.find((r) => r.code === value);
    if (!role) {
      setTemplatePerms([]);
      return;
    }
    const seq = ++templateReqSeq.current;
    setFetchingTemplate(true);
    try {
      const detail = await api.get<RoleDetail>(`/access/roles/${role.id}`);
      const perms = Array.isArray(detail?.permissions) ? detail.permissions : [];
      rolePermsCache.current[value] = perms;
      if (templateReqSeq.current === seq) {
        setTemplatePerms(perms);
      }
    } catch (err) {
      if (templateReqSeq.current === seq) {
        toast.error(err instanceof ApiError ? err.detail : 'Gagal memuat izin template role');
        setTemplatePerms([]);
      }
    } finally {
      if (templateReqSeq.current === seq) setFetchingTemplate(false);
    }
  };

  const handleSave = async () => {
    if (!userId || !summary || !canSave) return;
    setSaving(true);
    try {
      const payload: UserAccessUpdatePayload = { reason: reason.trim() };
      if (templateChanged && localTemplateCode) {
        payload.templateCode = localTemplateCode;
      }
      // ── Kontrak backend ASLI: roleIds bersifat REPLACE-SET ──
      // SELALU dikirim (bahkan saat template tidak berubah) supaya role user
      // tidak terhapus saat backend hanya mengenali roleIds dan mengabaikan
      // templateCode. Backend rekonstruksi mengabaikan field asing ini dengan aman.
      if (localTemplateCode) {
        const role = roles.find((r) => r.code === localTemplateCode);
        if (!role || !role.id) {
          throw new ApiError(422, `ID template "${localTemplateCode}" tidak ditemukan pada daftar role — tutup dan buka ulang dialog ini, lalu simpan lagi.`);
        }
        payload.roleIds = [role.id];
      } else {
        payload.roleIds = [];
      }
      if (overridesChanged) {
        payload.overrides = Object.entries(overrides).map(([permissionCode, effect]) => ({ permissionCode, effect }));
      }
      const res = await api.put<unknown>(`/access/users/${userId}/access`, payload);
      // Respons PUT dinormalisasi juga — bentuk lama tidak boleh memicu crash.
      const normalized = normalizeSummary(res, userId);
      if (!normalized) {
        throw new ApiError(422, 'Respons simpan akses tidak dikenali — kemungkinan backend masih versi lama. Periksa /access/users/{id}/access.');
      }
      applySummary(normalized);
      toast.success(`Akses @${normalized.user.username || normalized.user.id.slice(0, 8)} diperbarui — ${normalized.effectiveCount} izin efektif`);
      void loadAudit();
      // Refresh permission pelaku (aksesnya bisa ikut berubah).
      void useAccessStore.getState().fetchPermissions();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal menyimpan perubahan akses');
    } finally {
      setSaving(false);
    }
  };

  // ── Render helpers ──

  const renderActionRow = (action: RegistryActionItem) => {
    const on = isOn(action.code);
    const ov = overrides[action.code];
    const showBadge = !isTargetSuperAdmin && !!ov;
    return (
      <div key={action.code} className="flex min-h-11 items-center gap-3 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium capitalize">{action.action}</span>
            {action.isSensitive && (
              <span className="text-amber-600 dark:text-amber-400" title="Aksi sensitif" aria-label="Aksi sensitif">
                <AlertTriangle className="size-3.5" />
              </span>
            )}
            {showBadge && ov === 'ALLOW' && (
              <Badge variant="outline" className="border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                Custom Allow
              </Badge>
            )}
            {showBadge && ov === 'DENY' && (
              <Badge variant="outline" className="border-red-300 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300">
                Custom Deny
              </Badge>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground" title={action.description}>
            {action.description}
          </p>
          <p className="truncate font-mono text-[11px] text-muted-foreground/70">{action.code}</p>
        </div>
        <Switch
          checked={on}
          onCheckedChange={() => handleToggle(action.code)}
          disabled={readonly || saving || fetchingTemplate}
          aria-label={`${action.action} — ${action.code}`}
        />
      </div>
    );
  };

  const moduleStats = (mod: RegistryModuleItem) => {
    let on = 0;
    let total = 0;
    for (const res of mod.resources ?? []) {
      for (const a of res.actions ?? []) {
        total += 1;
        if (isOn(a.code)) on += 1;
      }
    }
    return { on, total };
  };

  // ── Render ──

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[95vw] max-w-[95vw] gap-4 overflow-y-auto p-4 pb-5 sm:max-w-4xl sm:p-6">
        {loading ? (
          <div className="space-y-3" aria-label="Memuat data akses">
            <DialogTitle className="sr-only">Role &amp; Akses</DialogTitle>
            <DialogDescription className="sr-only">Memuat data akses pengguna…</DialogDescription>
            <Skeleton className="h-7 w-72" />
            <Skeleton className="h-4 w-96" />
            <Skeleton className="h-10 w-full max-w-sm" />
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : loadError ? (
          <div className="py-6 text-center">
            <DialogTitle className="sr-only">Role &amp; Akses</DialogTitle>
            <DialogDescription className="sr-only">Gagal memuat data akses.</DialogDescription>
            <p className="text-sm font-medium text-destructive">{loadError}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
              Coba Lagi
            </Button>
          </div>
        ) : summary && registry ? (
          <>
            {/* ── Header ── */}
            <DialogHeader className="text-left">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
                <ShieldCheck className="size-5 text-primary" />
                <span>{summary.user.nama}</span>
                <span className="text-sm font-normal text-muted-foreground">@{summary.user.username}</span>
                <Badge variant="outline" className="font-mono text-[11px]">{summary.templateName || 'Tanpa template'}</Badge>
                {summary.isSuperAdmin && (
                  <Badge variant="outline" className="border-purple-300 bg-purple-100 text-purple-800 dark:border-purple-800 dark:bg-purple-950/50 dark:text-purple-300">
                    Super Admin
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription>Atur template role dan penyesuaian izin (override ALLOW/DENY) untuk pengguna ini.</DialogDescription>
            </DialogHeader>

            {/* ── Banner readonly ── */}
            {isTargetSuperAdmin && (
              <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300">
                <ShieldCheck className="size-4 shrink-0" />
                Super Admin memiliki semua izin — matriks bersifat hanya-lihat.
              </div>
            )}
            {!isTargetSuperAdmin && isSelf && (
              <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300">
                <AlertTriangle className="size-4 shrink-0" />
                Separation of duties — Anda tidak dapat mengubah akses akun Anda sendiri. Perubahan harus dilakukan administrator lain.
              </div>
            )}

            {/* ── Tabs ── */}
            <Tabs defaultValue="matrix">
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="matrix" className="flex-1 sm:flex-none">Matriks Akses</TabsTrigger>
                <TabsTrigger value="log" className="flex-1 gap-1.5 sm:flex-none">
                  Log Perubahan
                  {auditTotal > 0 && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">{auditTotal}</Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* ══ Tab: Matriks Akses ══ */}
              <TabsContent value="matrix" className="space-y-4">
                {/* Template role */}
                <div className="grid gap-1.5">
                  <Label htmlFor="ra-template" className="text-sm">
                    Template Role
                  </Label>
                  <div className="flex items-center gap-2">
                    <Select
                      value={localTemplateCode ?? NO_TEMPLATE_VALUE}
                      onValueChange={(v) => void handleTemplateChange(v)}
                      disabled={readonly || loading || saving}
                    >
                      <SelectTrigger id="ra-template" className="w-full sm:w-96" aria-label="Template role">
                        <SelectValue placeholder="Pilih template role" />
                      </SelectTrigger>
                      <SelectContent>
                        {summary.templateCode == null && (
                          <SelectItem value={NO_TEMPLATE_VALUE}>Tanpa template (akses kustom)</SelectItem>
                        )}
                        {roles.map((r) => (
                          <SelectItem key={r.code} value={r.code}>
                            {r.name} · {r.isSystem ? 'sistem' : 'kustom'} · {r.permissionCount} izin
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fetchingTemplate && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
                  </div>
                </div>

                {/* Kontrol: filter diff + reset override */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="ra-onlydiff"
                      checked={onlyDiff}
                      onCheckedChange={setOnlyDiff}
                      disabled={readonly || isTargetSuperAdmin}
                      aria-label="Hanya tampilkan yang berbeda dari template"
                    />
                    <Label htmlFor="ra-onlydiff" className="cursor-pointer text-sm font-normal">
                      Hanya tampilkan yang berbeda dari template
                    </Label>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setOverrides({})}
                    disabled={readonly || overrideCount === 0}
                  >
                    <RotateCcw className="size-3.5" /> Kembalikan semua ke template
                  </Button>
                </div>

                {/* Preview efektif */}
                <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  <ShieldCheck className="size-4 shrink-0 text-muted-foreground" />
                  {isTargetSuperAdmin ? (
                    <span>
                      Efektif: <strong>semua izin</strong> ({allActionCodes.length})
                    </span>
                  ) : (
                    <span>
                      Efektif: <strong>{effectiveCount} izin</strong> (template {templateLabel} · {overrideCount} penyesuaian)
                    </span>
                  )}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
                        <ChevronDown className="size-3.5" /> Lihat daftar
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-96 p-0">
                      <p className="border-b px-3 py-2 text-xs font-semibold text-muted-foreground">
                        {isTargetSuperAdmin ? `Semua izin (${allActionCodes.length})` : `${effectiveCount} izin efektif`}
                      </p>
                      <ul className="max-h-60 overflow-y-auto p-2">
                        {(isTargetSuperAdmin ? allActionCodes : [...effectiveSet].sort()).map((code) => (
                          <li key={code} className="px-1 py-0.5 font-mono text-[11px] text-muted-foreground">
                            {code}
                          </li>
                        ))}
                      </ul>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Legenda 4 state */}
                <p className="text-[11px] text-muted-foreground">
                  ON tanpa penanda = warisan template · ON + <span className="font-medium text-emerald-700 dark:text-emerald-400">Custom Allow</span> · OFF +{' '}
                  <span className="font-medium text-red-700 dark:text-red-400">Custom Deny</span> · OFF tanpa penanda = warisan template
                </p>

                {/* Matriks: accordion per modul */}
                {visibleModules.length === 0 ? (
                  <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                    {onlyDiff ? 'Tidak ada perbedaan dari template.' : 'Tidak ada modul yang tersedia.'}
                  </p>
                ) : (
                  <Accordion type="multiple" defaultValue={[visibleModules[0].module]} className="rounded-md border px-3">
                    {visibleModules.map((mod) => {
                      const stats = moduleStats(registryModuleById[mod.module] ?? mod);
                      const modOverrideCount = mod.resources.reduce(
                        (acc, res) => acc + res.actions.filter((a) => !!overrides[a.code]).length,
                        0
                      );
                      return (
                        <AccordionItem key={mod.module} value={mod.module}>
                          <AccordionTrigger className="py-3 hover:no-underline">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">{mod.label}</span>
                              <Badge variant="secondary" className="h-5 px-1.5 text-[11px] tabular-nums">
                                {stats.on}/{stats.total}
                              </Badge>
                              {modOverrideCount > 0 && (
                                <Badge variant="outline" className="h-5 px-1.5 text-[11px]">
                                  {modOverrideCount} custom
                                </Badge>
                              )}
                            </span>
                          </AccordionTrigger>
                          <AccordionContent className="pb-4">
                            <div className="space-y-4">
                              {mod.resources.map((res) => (
                                <div key={res.resource}>
                                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{res.label}</p>
                                  <div className="mt-1 divide-y overflow-hidden rounded-md border">{res.actions.map(renderActionRow)}</div>
                                </div>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                )}

                {/* Alasan perubahan */}
                <div className="grid gap-1.5">
                  <Label htmlFor="ra-reason" className="text-sm">
                    Alasan perubahan
                    {hasChanges && !readonly && <span className="ml-0.5 text-destructive">*</span>}
                  </Label>
                  <Textarea
                    id="ra-reason"
                    placeholder="Contoh: penyesuaian sementara untuk penutupan buku bulanan"
                    value={reason}
                    onChange={(e) => {
                      setReason(e.target.value);
                      setReasonTouched(true);
                    }}
                    disabled={readonly}
                    maxLength={500}
                    rows={2}
                    aria-invalid={hasChanges && reasonTouched && !reasonValid}
                    className={hasChanges && reasonTouched && !reasonValid ? 'border-destructive focus-visible:ring-destructive' : ''}
                  />
                  {hasChanges && !readonly && reasonTouched && !reasonValid && (
                    <p className="text-xs text-destructive">Alasan wajib diisi (minimal 3 karakter) saat ada perubahan.</p>
                  )}
                </div>

                {/* Footer aksi */}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    {readonly
                      ? 'Mode hanya-lihat'
                      : hasChanges
                        ? `${overrideCount} penyesuaian lokal · template ${templateChanged ? 'diganti' : 'tetap'}`
                        : 'Tidak ada perubahan'}
                    {!readonly && hasChanges && !reasonValid && ' — isi alasan (min. 3 karakter) untuk mengaktifkan Simpan'}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                      Batal
                    </Button>
                    <Button type="button" onClick={() => void handleSave()} disabled={!canSave} className="gap-2">
                      {saving && <Loader2 className="size-4 animate-spin" />} Simpan Perubahan
                    </Button>
                    <span
                      className="ml-auto font-mono text-[10px] text-muted-foreground/50"
                      title={`Versi file dialog (untuk verifikasi update) — v${DIALOG_VERSION}`}
                    >
                      v{DIALOG_VERSION}
                    </span>
                  </div>
                </div>
              </TabsContent>

              {/* ══ Tab: Log Perubahan ══ */}
              <TabsContent value="log" className="space-y-2">
                {auditLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : auditError ? (
                  <div className="py-4 text-center">
                    <p className="text-sm text-destructive">{auditError}</p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => void loadAudit()}>
                      Coba Lagi
                    </Button>
                  </div>
                ) : auditLogs.length === 0 ? (
                  <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                    Belum ada perubahan akses untuk pengguna ini.
                  </p>
                ) : (
                  <>
                    <div className="max-h-80 overflow-y-auto rounded-md border">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-background">
                          <TableRow>
                            <TableHead className="w-10" aria-label="Expand" />
                            <TableHead className="whitespace-nowrap">Waktu</TableHead>
                            <TableHead className="whitespace-nowrap">Aktor</TableHead>
                            <TableHead className="whitespace-nowrap">Aksi</TableHead>
                            <TableHead className="min-w-40">Alasan</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {auditLogs.map((log) => {
                            const expanded = expandedAuditId === log.id;
                            return (
                              <React.Fragment key={log.id}>
                                <TableRow
                                  className="cursor-pointer"
                                  onClick={() => setExpandedAuditId((prev) => (prev === log.id ? null : log.id))}
                                  aria-expanded={expanded}
                                >
                                  <TableCell>
                                    <ChevronDown className={`size-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap text-xs">{formatTime(log.at)}</TableCell>
                                  <TableCell className="whitespace-nowrap text-xs">
                                    {log.actorNama
                                      ? log.actorNama
                                      : userNameMap[log.actorId ?? '']
                                        ? `@${userNameMap[log.actorId ?? '']}`
                                        : shortId(log.actorId)}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="font-mono text-[11px]">{log.action}</Badge>
                                  </TableCell>
                                  <TableCell className="max-w-56 truncate text-xs text-muted-foreground" title={log.reason ?? ''}>
                                    {log.reason || '—'}
                                  </TableCell>
                                </TableRow>
                                {expanded && (
                                  <TableRow>
                                    <TableCell colSpan={5} className="bg-muted/30">
                                      <div className="space-y-2">
                                        <div className="grid gap-2 sm:grid-cols-2">
                                          <AuditSidePanel title="Sebelum" side={log.before ?? null} />
                                          <AuditSidePanel title="Sesudah" side={log.after ?? null} />
                                        </div>
                                        <details className="rounded-md border bg-background">
                                          <summary className="cursor-pointer px-2.5 py-1.5 text-xs text-muted-foreground">
                                            JSON details (sebelum / sesudah · {auditCountOverrides(log.before ?? null)} →{' '}
                                            {auditCountOverrides(log.after ?? null)} override)
                                          </summary>
                                          <pre className="max-h-48 overflow-auto border-t px-2.5 py-2 text-[10px] leading-relaxed">
                                            {JSON.stringify({ before: log.before, after: log.after }, null, 2)}
                                          </pre>
                                        </details>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    <p className="text-xs text-muted-foreground">Menampilkan {auditLogs.length} dari total {auditTotal} entri</p>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <>
            <DialogTitle className="sr-only">Role &amp; Akses</DialogTitle>
            <DialogDescription className="sr-only">Data akses tidak tersedia.</DialogDescription>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default RoleAccessDialog;
