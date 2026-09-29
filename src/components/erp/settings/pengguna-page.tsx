'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Search, Pencil, Trash2, Loader2, ChevronLeft, ChevronRight, UserCog, SearchX, ShieldCheck } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import { useTabStore } from '@/store/tab-store';
import { FormTabShell } from '@/components/erp/form-tab-shell';
import { RoleAccessDialog } from '@/components/erp/settings/role-access-dialog';

import { api, PaginatedResponse, ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth-store';
import { useAccessStore } from '@/store/access-store';
import type { PenggunaResponse, PenggunaCreate, PenggunaUpdate, RolePengguna } from '@/types/api';

// ─── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const ROLE_OPTIONS: { value: RolePengguna; label: string }[] = [
  { value: 'ADMINISTRATOR', label: 'Administrator' },
  { value: 'MANAJER_KEUANGAN', label: 'Manajer Keuangan' },
  { value: 'STAFF_AKUNTANSI', label: 'Staff Akuntansi' },
  { value: 'STAFF_GUDANG', label: 'Staff Gudang' },
  { value: 'STAFF_PENJUALAN', label: 'Staff Penjualan' }
];

// ─── Badge helpers ──────────────────────────────────────────────────────────

const roleBadge = (role: string) => {
  const map: Record<string, string> = {
    ADMINISTRATOR: 'bg-purple-100 text-purple-700 border-purple-200',
    MANAJER_KEUANGAN: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    STAFF_AKUNTANSI: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    STAFF_GUDANG: 'bg-amber-100 text-amber-700 border-amber-200',
    STAFF_PENJUALAN: 'bg-rose-100 text-rose-700 border-rose-200'
  };
  const cls = map[role] || 'bg-gray-100 text-gray-700 border-gray-200';
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{role}</span>;
};

const statusBadge = (status: string) => {
  const cls = status === 'AKTIF' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-200';
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
};

// ─── Form state type ───────────────────────────────────────────────────────

type FormMode = 'create' | 'edit';

interface FormState {
  username: string;
  namaLengkap: string;
  email: string;
  password: string;
  role: string;
}

const emptyForm: FormState = { username: '', namaLengkap: '', email: '', password: '', role: '' };

interface PenggunaPageProps {
  subPage?: string;
  refreshKey?: number;
  formMode?: string;
  formProps?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Form Component (rendered in tab)
// ═══════════════════════════════════════════════════════════════════════════

function PenggunaForm({ mode, editId, initialData }: { mode: FormMode; editId?: string; initialData?: FormState }) {
  const [form, setForm] = useState<FormState>(initialData || emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const title = mode === 'create' ? 'Tambah Pengguna' : 'Edit Pengguna';

  const updateForm = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFormErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // ── Real-time field validation ──────────────────────────────────────────
  const validateField = (field: keyof FormState, value: string): string => {
    const trimmed = value.trim();
    switch (field) {
      case 'username':
        if (!trimmed) return 'Username wajib diisi';
        if (trimmed.length < 3) return 'Username minimal 3 karakter';
        return '';
      case 'namaLengkap':
        if (!trimmed) return 'Nama lengkap wajib diisi';
        if (trimmed.length < 3) return 'Nama lengkap minimal 3 karakter';
        return '';
      case 'email':
        if (!trimmed) return 'Email wajib diisi';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Format email tidak valid';
        return '';
      case 'password':
        if (mode === 'create') {
          if (!trimmed) return 'Password wajib diisi';
          if (trimmed.length < 6) return 'Password minimal 6 karakter';
        } else if (trimmed && trimmed.length < 6) {
          return 'Password minimal 6 karakter';
        }
        return '';
      default:
        return '';
    }
  };

  const handleBlur = (field: keyof FormState) => {
    const error = validateField(field, form[field]);
    setFormErrors((prev) => {
      const next = { ...prev };
      if (error) {
        next[field] = error;
      } else {
        delete next[field];
      }
      return next;
    });
  };

  const validateAll = (): boolean => {
    const errors: Record<string, string> = {};
    const fields: (keyof FormState)[] = mode === 'create' ? ['username', 'namaLengkap', 'email', 'password'] : ['namaLengkap', 'email'];
    fields.forEach((field) => {
      const e = validateField(field, form[field]);
      if (e) errors[field] = e;
    });
    if (!form.role) errors.role = 'Role wajib dipilih';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateAll()) {
      toast.error('Periksa kembali isian formulir yang ditandai');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'create') {
        const payload: PenggunaCreate = { username: form.username.trim(), namaLengkap: form.namaLengkap.trim(), email: form.email.trim(), password: form.password, role: form.role ? (form.role as RolePengguna) : undefined };
        await api.post<PenggunaResponse>('/pengguna', payload);
        toast.success('Pengguna berhasil ditambahkan');
      } else {
        if (!editId) return;
        const payload: PenggunaUpdate = { namaLengkap: form.namaLengkap.trim(), email: form.email.trim(), password: form.password.trim() || undefined, role: form.role ? (form.role as RolePengguna) : undefined };
        await api.put<PenggunaResponse>(`/pengguna/${editId}`, payload);
        toast.success('Pengguna berhasil diperbarui');
      }
      refreshListTab('settings', 'pengguna');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : mode === 'create' ? 'Gagal menambahkan pengguna' : 'Gagal memperbarui pengguna');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormTabShell title={title}>
      <Card className="max-w-4xl">
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">{mode === 'create' ? 'Isi data di bawah untuk menambahkan pengguna baru.' : `Mengedit pengguna: ${form.username} — ${form.namaLengkap}`}</p>

          <div className="space-y-2">
            <Label htmlFor="pgn-username">Username</Label>
            <Input id="pgn-username" placeholder="Contoh: jsmith" value={form.username} onChange={(e) => updateForm('username', e.target.value)} onBlur={() => handleBlur('username')} aria-invalid={!!formErrors.username} className={formErrors.username ? 'border-destructive focus-visible:ring-destructive' : ''} disabled={mode === 'edit'} />
            {formErrors.username ? <p className="text-xs text-destructive mt-1">{formErrors.username}</p> : mode === 'edit' ? <p className="text-[11px] text-muted-foreground">Username tidak dapat diubah.</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pgn-nama">Nama Lengkap</Label>
            <Input id="pgn-nama" placeholder="Nama lengkap pengguna" value={form.namaLengkap} onChange={(e) => updateForm('namaLengkap', e.target.value)} onBlur={() => handleBlur('namaLengkap')} aria-invalid={!!formErrors.namaLengkap} className={formErrors.namaLengkap ? 'border-destructive focus-visible:ring-destructive' : ''} autoFocus />
            {formErrors.namaLengkap && <p className="text-xs text-destructive mt-1">{formErrors.namaLengkap}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pgn-email">Email</Label>
            <Input id="pgn-email" type="email" placeholder="email@contoh.com" value={form.email} onChange={(e) => updateForm('email', e.target.value)} onBlur={() => handleBlur('email')} aria-invalid={!!formErrors.email} className={formErrors.email ? 'border-destructive focus-visible:ring-destructive' : ''} />
            {formErrors.email && <p className="text-xs text-destructive mt-1">{formErrors.email}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pgn-password">
              Password
              {mode === 'edit' && <span className="ml-2 font-normal text-muted-foreground">— Kosongkan jika tidak ingin mengubah</span>}
            </Label>
            <Input id="pgn-password" type="password" placeholder={mode === 'create' ? 'Password minimal 6 karakter' : 'Kosongkan jika tidak ingin mengubah'} value={form.password} onChange={(e) => updateForm('password', e.target.value)} onBlur={() => handleBlur('password')} aria-invalid={!!formErrors.password} className={formErrors.password ? 'border-destructive focus-visible:ring-destructive' : ''} />
            {formErrors.password && <p className="text-xs text-destructive mt-1">{formErrors.password}</p>}
          </div>

          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(v) => updateForm('role', v)}>
              <SelectTrigger aria-invalid={!!formErrors.role} className={formErrors.role ? 'border-destructive focus-visible:ring-destructive' : ''}>
                <SelectValue placeholder="Pilih role" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {formErrors.role && <p className="text-xs text-destructive mt-1">{formErrors.role}</p>}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting}>
              Batal
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === 'create' ? 'Simpan Pengguna' : 'Perbarui Pengguna'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </FormTabShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// List Page
// ═══════════════════════════════════════════════════════════════════════════

export default function PenggunaPage({ refreshKey, formMode, formProps }: PenggunaPageProps) {
  if (formMode) {
    const isEdit = formProps?.id as string | undefined;
    return (
      <PenggunaForm
        mode={isEdit ? 'edit' : 'create'}
        editId={isEdit}
        initialData={
          isEdit
            ? {
                username: (formProps?.username as string) || '',
                namaLengkap: (formProps?.namaLengkap as string) || '',
                email: (formProps?.email as string) || '',
                password: '',
                role: (formProps?.role as string) || ''
              }
            : undefined
        }
      />
    );
  }
  return <PenggunaListContent refreshKey={refreshKey} />;
}

function PenggunaListContent({ refreshKey }: { refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab);
  const currentUser = useAuthStore((s) => s.user);

  // RBAC v2 — tombol Role & Akses hanya untuk Super Admin / pemegang system.access.view.
  const isSuperAdmin = useAccessStore((s) => s.isSuperAdmin);
  const hasAccessView = useAccessStore((s) => s.permissions.includes('system.access.view'));
  const canManageAccess = isSuperAdmin || hasAccessView;

  // Target user untuk dialog Role & Akses (null = tertutup).
  const [accessTarget, setAccessTarget] = useState<PenggunaResponse | null>(null);

  const [data, setData] = useState<PenggunaResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [skip, setSkip] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<PenggunaResponse | null>(null);
  const [deleting, setDeleting] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [search]);

  useEffect(() => {
    setSkip(0);
  }, [debouncedSearch]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('skip', String(skip));
      params.set('limit', String(PAGE_SIZE));
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await api.get<PaginatedResponse<PenggunaResponse>>(`/pengguna?${params.toString()}`);
      setData(res.data);
      setTotal(res.total);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Gagal memuat data pengguna');
      }
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, skip]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const currentPage = Math.floor(skip / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasNext = skip + PAGE_SIZE < total;
  const hasPrev = skip > 0;

  const executeDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete<{ message: string }>(`/pengguna/${deleteTarget.id}`);
      toast.success(`Pengguna "${deleteTarget.namaLengkap}" berhasil dinonaktifkan`);
      setDeleteTarget(null);
      fetchData();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.detail);
      } else {
        toast.error('Gagal menonaktifkan pengguna');
      }
    } finally {
      setDeleting(false);
    }
  };

  const SkeletonRows = () => (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-36" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-40" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-28 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-16 rounded-full" />
          </TableCell>
          <TableCell className="text-center">
            <Skeleton className="h-8 w-16 rounded ml-auto" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Pengguna</h2>
          <p className="text-sm text-muted-foreground">{loading ? 'Memuat data...' : `${total} pengguna`}</p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => openFormTab({ title: 'Tambah Pengguna', module: 'settings', subPage: 'pengguna', formKey: 'pengguna-create' })}>
          <Plus className="h-4 w-4" /> Tambah Pengguna
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="max-w-sm">
            <Label className="text-xs text-muted-foreground">Cari Nama / Username / Email</Label>
            <div className="relative mt-1.5">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cari pengguna..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
          </div>
        </CardContent>
      </Card>

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

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto" style={{ maxHeight: '500px', overflowY: 'auto' }}>
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="whitespace-nowrap">Username</TableHead>
                  <TableHead className="whitespace-nowrap">Nama Lengkap</TableHead>
                  <TableHead className="whitespace-nowrap">Email</TableHead>
                  <TableHead className="whitespace-nowrap">Role</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <SkeletonRows />
                ) : data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="p-0">
                      {debouncedSearch ? (
                        <EmptyState icon={SearchX} title="Tidak ada hasil pencarian" description={`Tidak ada pengguna yang cocok dengan "${debouncedSearch}". Coba kata kunci lain.`} />
                      ) : (
                        <EmptyState
                          icon={UserCog}
                          title="Belum ada data pengguna"
                          description="Klik tombol Tambah Pengguna di kanan atas untuk menambahkan pengguna baru."
                          action={{
                            label: 'Tambah Pengguna',
                            onClick: () => openFormTab({ title: 'Tambah Pengguna', module: 'settings', subPage: 'pengguna', formKey: 'pengguna-create' })
                          }}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((row) => {
                    const isSelf = currentUser?.id === row.id;
                    const isNonaktif = row.status === 'NONAKTIF';
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap font-medium">{row.username}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {row.namaLengkap}
                          {isSelf && <span className="ml-2 text-xs text-muted-foreground">(Anda)</span>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{row.email}</TableCell>
                        <TableCell className="whitespace-nowrap">{roleBadge(row.role)}</TableCell>
                        <TableCell className="whitespace-nowrap">{statusBadge(row.status)}</TableCell>
                        <TableCell className="whitespace-nowrap text-center">
                          <div className="inline-flex items-center gap-1">
                            {canManageAccess && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAccessTarget(row)} aria-label={`Role & Akses ${row.namaLengkap}`} title="Role & Akses">
                                <ShieldCheck className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openFormTab({ title: `Edit ${row.namaLengkap}`, module: 'settings', subPage: 'pengguna', formKey: 'pengguna-edit', formProps: { id: row.id, username: row.username, namaLengkap: row.namaLengkap, email: row.email, role: row.role } })} aria-label={`Edit ${row.namaLengkap}`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(row)} aria-label={`Hapus ${row.namaLengkap}`} disabled={isSelf || isNonaktif} title={isSelf ? 'Tidak dapat menonaktifkan akun sendiri' : isNonaktif ? 'Pengguna sudah nonaktif' : undefined}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {!loading && total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Menampilkan {skip + 1}–{Math.min(skip + PAGE_SIZE, total)} dari {total} pengguna (Halaman {currentPage} dari {totalPages})
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

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nonaktifkan Pengguna</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menonaktifkan pengguna <span className="font-semibold text-foreground">&quot;{deleteTarget?.namaLengkap}&quot;</span> ({deleteTarget?.username})? Pengguna yang dinonaktifkan tidak akan dapat login namun data historis tetap tersimpan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2">
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />} Nonaktifkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Dialog Role & Akses (RBAC v2) ── */}
      <RoleAccessDialog
        userId={accessTarget?.id ?? null}
        open={!!accessTarget}
        onOpenChange={(open) => {
          if (!open) setAccessTarget(null);
        }}
      />
    </div>
  );
}
