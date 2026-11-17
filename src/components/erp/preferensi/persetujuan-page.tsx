'use client';

// ═══════════════════════════════════════════════════════════════════════════
// === Update #071 — Preferensi ▸ Persetujuan ===
//
// Konfigurasi maker-checker per JENIS dokumen (menggantikan aturan workflow
// yang sebelumnya di-hardcode di backend). Hanya Super Admin (endpoint
// GET/PUT /workflow/approval-config di-gate SUPER_ADMIN; menu sidebar juga
// hanya tampil untuk Super Admin).
//
// Aturan main (hasil diskusi Update #071):
//  • Toggle per jenis dokumen: non-aktif (default) → dokumen LANGSUNG FINAL
//    (auto-final + posting/eksekusi otomatis) untuk semua user; aktif →
//    dokumen menunggu persetujuan (1 tahap — approve = final).
//  • Approver per jenis dokumen: pilih USER dan/atau ROLE; salah satu
//    menyetujui = selesai. Mengaktifkan mensyaratkan minimal 1 approver.
//  • Super Admin selalu bisa menyetujui dokumen apa pun (fallback bila
//    approver berhalangan) — tercatat di riwayat persetujuan.
//  • Dokumen yang sedang menunggu TIDAK difinalisasi otomatis saat aturan
//    diubah — hanya dokumen BARU yang mengikuti aturan baru.
//  • Setelah simpan, payload izin (approvalEnabled) dimuat ulang supaya
//    kolom "Persetujuan" di daftar dokumen langsung menyesuaikan.
// ═══════════════════════════════════════════════════════════════════════════

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Search, ShieldCheck, UserCog, Users, Info } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, PaginatedResponse } from '@/lib/api';
import { workflowApi } from '@/lib/workflow-api';
import { useAccessStore } from '@/store/access-store';
import type { ApprovalConfigItem, PenggunaResponse, RoleListResponse } from '@/types/api';

interface PersetujuanPageProps {
  refreshKey?: number;
}

interface DialogState {
  item: ApprovalConfigItem;
  enabled: boolean;
  userIds: string[];
  roleCodes: string[];
}

export default function PersetujuanPage({ refreshKey }: PersetujuanPageProps) {
  const isSuperAdmin = useAccessStore((s) => s.isSuperAdmin);
  const fetchPermissions = useAccessStore((s) => s.fetchPermissions);

  const [config, setConfig] = React.useState<ApprovalConfigItem[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [dialog, setDialog] = React.useState<DialogState | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [userSearch, setUserSearch] = React.useState('');
  const [toggling, setToggling] = React.useState<string | null>(null);

  // ── Data pendukung: daftar pengguna + role (untuk pemilih approver) ──
  const [users, setUsers] = React.useState<PenggunaResponse[]>([]);
  const [roles, setRoles] = React.useState<RoleListResponse['data']>([]);

  const loadConfig = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await workflowApi.getApprovalConfig();
      setConfig(res.data ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Gagal memuat konfigurasi persetujuan');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadConfig();
  }, [loadConfig, refreshKey]);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [userRes, roleRes] = await Promise.all([api.get<PaginatedResponse<PenggunaResponse>>('/pengguna?skip=0&limit=200'), api.get<RoleListResponse>('/access/roles')]);
        if (cancelled) return;
        setUsers((userRes.data ?? []).filter((u) => u.status === 'AKTIF'));
        setRoles(roleRes.data ?? []);
      } catch {
        // Pemilih approver kosong bila gagal — dialog tetap bisa membuka
        // konfigurasi yang sudah ada (hanya susah menambah baru).
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = React.useCallback(
    async (documentType: string, enabled: boolean, approvers: { userId?: string; roleCode?: string }[]) => {
      setSaving(true);
      try {
        await workflowApi.updateApprovalConfig(documentType, { enabled, approvers });
        toast.success(enabled ? 'Persetujuan diaktifkan — dokumen baru jenis ini akan menunggu persetujuan.' : 'Persetujuan dinonaktifkan — dokumen baru jenis ini langsung final.');
        setDialog(null);
        await loadConfig();
        // Segarkan payload izin supaya approvalEnabled (kolom "Persetujuan"
        // di daftar dokumen) langsung menyesuaikan untuk user ini.
        await fetchPermissions();
      } catch (err) {
        toast.error(err instanceof ApiError ? err.detail : 'Gagal menyimpan konfigurasi persetujuan');
      } finally {
        setSaving(false);
      }
    },
    [loadConfig, fetchPermissions]
  );

  // Toggle cepat di baris: menyalakan tanpa approver → buka dialog dengan
  // pesan (wajib pilih minimal 1 approver); menyalakan dengan approver sudah
  // ada → simpan langsung; mematikan → simpan langsung (approver dipertahankan).
  const handleToggle = React.useCallback(
    async (item: ApprovalConfigItem, next: boolean) => {
      if (!next) {
        setToggling(item.documentType);
        await save(
          item.documentType,
          false,
          item.approvers.map((a) => (a.userId ? { userId: a.userId } : { roleCode: a.roleCode! }))
        );
        setToggling(null);
        return;
      }
      if (item.approvers.length === 0) {
        setDialog({ item, enabled: true, userIds: [], roleCodes: [] });
        setUserSearch('');
        toast.info('Pilih minimal 1 approver (user atau role) untuk mengaktifkan persetujuan.');
        return;
      }
      setToggling(item.documentType);
      await save(
        item.documentType,
        true,
        item.approvers.map((a) => (a.userId ? { userId: a.userId } : { roleCode: a.roleCode! }))
      );
      setToggling(null);
    },
    [save]
  );

  if (!isSuperAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Persetujuan</h2>
          <p className="text-sm text-muted-foreground">Konfigurasi persetujuan dokumen.</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <ShieldCheck className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Hanya Super Admin yang dapat mengatur konfigurasi persetujuan.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Kelompokkan per modul sesuai urutan backend.
  const groups: { group: string; items: ApprovalConfigItem[] }[] = [];
  for (const item of config ?? []) {
    const last = groups[groups.length - 1];
    if (last && last.group === item.moduleGroup) last.items.push(item);
    else groups.push({ group: item.moduleGroup, items: [item] });
  }

  const dialogApprovers: { userId?: string; roleCode?: string }[] = dialog ? [...dialog.userIds.map((id) => ({ userId: id })), ...dialog.roleCodes.map((code) => ({ roleCode: code }))] : [];

  const filteredUsers = dialog ? users.filter((u) => !userSearch || u.namaLengkap.toLowerCase().includes(userSearch.toLowerCase()) || u.username.toLowerCase().includes(userSearch.toLowerCase())) : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Persetujuan</h2>
        <p className="text-sm text-muted-foreground">Tentukan jenis dokumen yang memerlukan persetujuan dan siapa yang berwenang menyetujui. Persetujuan satu tahap — sekali disetujui, dokumen langsung final dan diposting/dieksekusi otomatis.</p>
      </div>

      <Card>
        <CardContent className="flex items-start gap-3 py-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>
              Jenis dokumen yang <span className="font-medium text-foreground">non-aktif</span> (default): dokumen langsung final saat dibuat oleh user mana pun — tanpa antrean persetujuan.
            </p>
            <p>Dokumen yang sudah menunggu persetujuan tidak difinalisasi otomatis saat aturan diubah — hanya dokumen baru yang mengikuti aturan baru. Super Admin selalu dapat menyetujui dokumen apa pun bila approver berhalangan.</p>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Memuat konfigurasi…
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void loadConfig()}>
              Coba Lagi
            </Button>
          </CardContent>
        </Card>
      ) : (
        groups.map((g) => (
          <Card key={g.group}>
            <CardHeader>
              <CardTitle className="text-base">{g.group}</CardTitle>
              <CardDescription>Jenis dokumen modul {g.group.toLowerCase()} yang dapat dikonfigurasi.</CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              {g.items.map((item) => (
                <div key={item.documentType} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{item.label}</p>
                      <Badge variant={item.enabled ? 'default' : 'secondary'} className={item.enabled ? 'bg-emerald-600 hover:bg-emerald-600' : ''}>
                        {item.enabled ? 'Perlu persetujuan' : 'Langsung final'}
                      </Badge>
                    </div>
                    {item.approvers.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <UserCog className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                        {item.approvers.map((a) => (
                          <Badge key={a.id} variant="outline" className="text-xs font-normal">
                            {a.userId ? (a.userName ?? a.userId) : (a.roleName ?? a.roleCode)}
                            <span className="ml-1 text-[10px] text-muted-foreground">{a.userId ? 'user' : 'role'}</span>
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Belum ada approver — persetujuan belum bisa diaktifkan.</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDialog({
                          item,
                          enabled: item.enabled,
                          userIds: item.approvers.filter((a) => a.userId).map((a) => a.userId!),
                          roleCodes: item.approvers.filter((a) => a.roleCode).map((a) => a.roleCode!)
                        });
                        setUserSearch('');
                      }}>
                      <UserCog className="mr-1.5 h-3.5 w-3.5" /> Atur Approver
                    </Button>
                    <Switch checked={item.enabled} disabled={toggling === item.documentType} onCheckedChange={(v) => void handleToggle(item, v)} aria-label={`Aktifkan persetujuan ${item.label}`} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}

      {/* ── Dialog: atur approver + aktif/non-aktif ── */}
      <Dialog open={dialog !== null} onOpenChange={(o) => !saving && setDialog(o ? dialog : null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Atur Persetujuan — {dialog?.item.label}</DialogTitle>
            <DialogDescription>Pilih user dan/atau role yang berwenang menyetujui. Salah satu saja menyetujui = dokumen final.</DialogDescription>
          </DialogHeader>

          {dialog && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">Perlu persetujuan</p>
                  <p className="text-xs text-muted-foreground">Aktif: dokumen baru menunggu approver · Non-aktif: langsung final.</p>
                </div>
                <Switch checked={dialog.enabled} onCheckedChange={(v) => setDialog({ ...dialog, enabled: v })} aria-label="Perlu persetujuan" />
              </div>

              {/* Role */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Role</Label>
                <div className="flex flex-wrap gap-1.5">
                  {roles.length === 0 && <p className="text-xs text-muted-foreground">Role tidak tersedia.</p>}
                  {roles.map((r) => {
                    const active = dialog.roleCodes.includes(r.code);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() =>
                          setDialog({
                            ...dialog,
                            roleCodes: active ? dialog.roleCodes.filter((c) => c !== r.code) : [...dialog.roleCodes, r.code]
                          })
                        }
                        className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                        aria-pressed={active}>
                        {r.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Pengguna */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Pengguna</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Cari nama / username…" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} className="h-9 pl-8 text-sm" />
                </div>
                <div className="max-h-48 overflow-y-auto rounded-md border">
                  {filteredUsers.length === 0 ? (
                    <p className="px-3 py-4 text-center text-xs text-muted-foreground">Tidak ada pengguna cocok.</p>
                  ) : (
                    filteredUsers.map((u) => {
                      const active = dialog.userIds.includes(u.id);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() =>
                            setDialog({
                              ...dialog,
                              userIds: active ? dialog.userIds.filter((id) => id !== u.id) : [...dialog.userIds, u.id]
                            })
                          }
                          className={`flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm transition-colors last:border-b-0 ${active ? 'bg-primary/10' : 'hover:bg-muted/60'}`}
                          aria-pressed={active}>
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{u.namaLengkap}</span>
                            <span className="block truncate text-xs text-muted-foreground">@{u.username}</span>
                          </span>
                          {active && <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {dialog.enabled && dialogApprovers.length === 0 && <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">Pilih minimal 1 approver (user atau role) sebelum mengaktifkan persetujuan — dokumen tidak boleh menggantung tanpa berpengawai.</p>}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" disabled={saving} onClick={() => setDialog(null)}>
              Batal
            </Button>
            <Button size="sm" disabled={saving || (dialog?.enabled && dialogApprovers.length === 0)} onClick={() => dialog && void save(dialog.item.documentType, dialog.enabled, dialogApprovers)}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
