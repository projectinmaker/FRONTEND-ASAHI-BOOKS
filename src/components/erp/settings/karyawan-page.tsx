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
import { Plus, Search, Pencil, Trash2, Loader2, ChevronLeft, ChevronRight, Users, SearchX } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import { useTabStore } from '@/store/tab-store';
import { FormTabShell } from '@/components/erp/form-tab-shell';

import { api, PaginatedResponse, ApiError } from '@/lib/api';
import type { KaryawanResponse, KaryawanCreate, KaryawanUpdate, COAResponse, Departemen } from '@/types/api';

// ─── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 100;

const DEPARTEMEN_OPTIONS: { value: Departemen; label: string }[] = [
  { value: 'DIREKSI', label: 'Direksi' },
  { value: 'KEUANGAN', label: 'Keuangan' },
  { value: 'AKUNTANSI', label: 'Akuntansi' },
  { value: 'GUDANG', label: 'Gudang' },
  { value: 'PENJUALAN', label: 'Penjualan' },
  { value: 'ADMINISTRASI', label: 'Administrasi' },
  { value: 'PRODUKSI', label: 'Produksi' }
];

// ─── Badge helpers ──────────────────────────────────────────────────────────

const statusBadge = (status: string) => {
  const cls = status === 'AKTIF' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-200';
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
};

const departemenBadge = (dept: string | null) => {
  if (!dept) return <span className="text-muted-foreground">-</span>;
  const colorMap: Record<string, string> = {
    DIREKSI: 'bg-purple-100 text-purple-700 border-purple-200',
    KEUANGAN: 'bg-amber-100 text-amber-700 border-amber-200',
    AKUNTANSI: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    GUDANG: 'bg-orange-100 text-orange-700 border-orange-200',
    PENJUALAN: 'bg-rose-100 text-rose-700 border-rose-200',
    ADMINISTRASI: 'bg-teal-100 text-teal-700 border-teal-200',
    PRODUKSI: 'bg-lime-100 text-lime-700 border-lime-200'
  };
  const cls = colorMap[dept] || 'bg-gray-100 text-gray-600 border-gray-200';
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{dept}</span>;
};

// ─── Form state type ───────────────────────────────────────────────────────

type FormMode = 'create' | 'edit';

interface FormState {
  nik: string;
  nama: string;
  jabatan: string;
  departemen: string;
  email: string;
  noHp: string;
  akunPiutangId: string;
}

const emptyForm: FormState = { nik: '', nama: '', jabatan: '', departemen: '', email: '', noHp: '', akunPiutangId: '' };

interface KaryawanPageProps {
  subPage?: string;
  refreshKey?: number;
  formMode?: string;
  formProps?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Form Component (rendered in tab)
// ═══════════════════════════════════════════════════════════════════════════

function KaryawanForm({ mode, editId, initialData }: { mode: FormMode; editId?: string; initialData?: FormState }) {
  const [form, setForm] = useState<FormState>(initialData || emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const [coaOptions, setCoaOptions] = useState<COAResponse[]>([]);
  const [loadingCoa, setLoadingCoa] = useState(false);

  const title = mode === 'create' ? 'Tambah Karyawan' : 'Edit Karyawan';

  useEffect(() => {
    const fetchCoa = async () => {
      setLoadingCoa(true);
      try {
        const res = await api.get<PaginatedResponse<COAResponse>>('/coa/?header=AKTIVA&limit=500');
        setCoaOptions(res.data);
      } catch {
        setCoaOptions([]);
      } finally {
        setLoadingCoa(false);
      }
    };
    fetchCoa();
  }, []);

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
      case 'nik':
        if (!trimmed) return 'NIK wajib diisi';
        if (trimmed.length < 5) return 'NIK minimal 5 karakter';
        return '';
      case 'nama':
        if (!trimmed) return 'Nama karyawan wajib diisi';
        if (trimmed.length < 3) return 'Nama karyawan minimal 3 karakter';
        return '';
      case 'email':
        if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
          return 'Format email tidak valid';
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
    (['nik', 'nama', 'email'] as const).forEach((field) => {
      const e = validateField(field, form[field]);
      if (e) errors[field] = e;
    });
    if (!form.akunPiutangId) errors.akunPiutangId = 'Akun piutang wajib dipilih';
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
        const payload: KaryawanCreate = { nik: form.nik.trim(), nama: form.nama.trim(), jabatan: form.jabatan.trim() || undefined, departemen: (form.departemen as Departemen) || undefined, email: form.email.trim() || undefined, noHp: form.noHp.trim() || undefined, akunPiutangId: form.akunPiutangId };
        await api.post<KaryawanResponse>('/karyawan', payload);
        toast.success('Karyawan berhasil ditambahkan');
      } else {
        if (!editId) return;
        const payload: KaryawanUpdate = { nama: form.nama.trim(), jabatan: form.jabatan.trim() || undefined, departemen: (form.departemen as Departemen) || undefined, email: form.email.trim() || undefined, noHp: form.noHp.trim() || undefined, akunPiutangId: form.akunPiutangId || undefined };
        await api.put<KaryawanResponse>(`/karyawan/${editId}`, payload);
        toast.success('Karyawan berhasil diperbarui');
      }
      refreshListTab('settings', 'karyawan');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : mode === 'create' ? 'Gagal menambahkan karyawan' : 'Gagal memperbarui karyawan');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormTabShell title={title}>
      <Card className="max-w-4xl">
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">{mode === 'create' ? 'Isi data di bawah untuk menambahkan karyawan baru.' : `Mengedit karyawan: ${form.nik} — ${form.nama}`}</p>

          <div className="space-y-2">
            <Label htmlFor="kar-nik">NIK</Label>
            <Input id="kar-nik" placeholder="Nomor Induk Karyawan" value={form.nik} onChange={(e) => updateForm('nik', e.target.value)} onBlur={() => handleBlur('nik')} aria-invalid={!!formErrors.nik} className={formErrors.nik ? 'border-destructive focus-visible:ring-destructive' : ''} disabled={mode === 'edit'} />
            {formErrors.nik ? <p className="text-xs text-destructive mt-1">{formErrors.nik}</p> : mode === 'edit' ? <p className="text-[11px] text-muted-foreground">NIK tidak dapat diubah.</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="kar-nama">Nama Karyawan</Label>
            <Input id="kar-nama" placeholder="Nama lengkap karyawan" value={form.nama} onChange={(e) => updateForm('nama', e.target.value)} onBlur={() => handleBlur('nama')} aria-invalid={!!formErrors.nama} className={formErrors.nama ? 'border-destructive focus-visible:ring-destructive' : ''} autoFocus />
            {formErrors.nama && <p className="text-xs text-destructive mt-1">{formErrors.nama}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="kar-jabatan">Jabatan</Label>
              <Input id="kar-jabatan" placeholder="Jabatan" value={form.jabatan} onChange={(e) => updateForm('jabatan', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Departemen</Label>
              <Select value={form.departemen} onValueChange={(v) => updateForm('departemen', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih departemen" />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTEMEN_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="kar-email">Email</Label>
              <Input id="kar-email" type="email" placeholder="email@contoh.com" value={form.email} onChange={(e) => updateForm('email', e.target.value)} onBlur={() => handleBlur('email')} aria-invalid={!!formErrors.email} className={formErrors.email ? 'border-destructive focus-visible:ring-destructive' : ''} />
              {formErrors.email && <p className="text-xs text-destructive mt-1">{formErrors.email}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="kar-nohp">No. HP</Label>
              <Input id="kar-nohp" placeholder="08xxxxxxxxxx" value={form.noHp} onChange={(e) => updateForm('noHp', e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Akun Piutang</Label>
            <Select value={form.akunPiutangId} onValueChange={(v) => updateForm('akunPiutangId', v)}>
              <SelectTrigger aria-invalid={!!formErrors.akunPiutangId} className={formErrors.akunPiutangId ? 'border-destructive focus-visible:ring-destructive' : ''}>
                {loadingCoa ? (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Memuat...
                  </span>
                ) : (
                  <SelectValue placeholder="Pilih akun piutang" />
                )}
              </SelectTrigger>
              <SelectContent>
                {coaOptions.map((coa) => (
                  <SelectItem key={coa.id} value={coa.id}>
                    {coa.kode} — {coa.nama}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {formErrors.akunPiutangId && <p className="text-xs text-destructive mt-1">{formErrors.akunPiutangId}</p>}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting}>
              Batal
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === 'create' ? 'Simpan Karyawan' : 'Perbarui Karyawan'}
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

export default function KaryawanPage({ refreshKey, formMode, formProps }: KaryawanPageProps) {
  if (formMode) {
    const isEdit = formProps?.id as string | undefined;
    return (
      <KaryawanForm
        mode={isEdit ? 'edit' : 'create'}
        editId={isEdit}
        initialData={
          isEdit
            ? {
                nik: (formProps?.nik as string) || '',
                nama: (formProps?.nama as string) || '',
                jabatan: (formProps?.jabatan as string) || '',
                departemen: (formProps?.departemen as string) || '',
                email: (formProps?.email as string) || '',
                noHp: (formProps?.noHp as string) || '',
                akunPiutangId: (formProps?.akunPiutangId as string) || ''
              }
            : undefined
        }
      />
    );
  }
  return <KaryawanListContent refreshKey={refreshKey} />;
}

function KaryawanListContent({ refreshKey }: { refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab);

  const [data, setData] = useState<KaryawanResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [skip, setSkip] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<KaryawanResponse | null>(null);
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
      const res = await api.get<PaginatedResponse<KaryawanResponse>>(`/karyawan?${params.toString()}`);
      setData(res.data);
      setTotal(res.total);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Gagal memuat data karyawan');
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
      await api.delete<{ message: string }>(`/karyawan/${deleteTarget.id}`);
      toast.success(`Karyawan "${deleteTarget.nama}" berhasil dinonaktifkan`);
      setDeleteTarget(null);
      fetchData();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.detail);
      } else {
        toast.error('Gagal menonaktifkan karyawan');
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
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-40" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-28" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-24 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-32" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-28" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-36" />
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
          <h2 className="text-lg font-semibold">Karyawan</h2>
          <p className="text-sm text-muted-foreground">{loading ? 'Memuat data...' : `${total} karyawan`}</p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => openFormTab({ title: 'Tambah Karyawan', module: 'settings', subPage: 'karyawan', formKey: 'karyawan-create' })}>
          <Plus className="h-4 w-4" /> Tambah Karyawan
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="max-w-sm">
            <Label className="text-xs text-muted-foreground">Cari NIK / Nama</Label>
            <div className="relative mt-1.5">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cari karyawan..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
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
                  <TableHead className="whitespace-nowrap">NIK</TableHead>
                  <TableHead className="whitespace-nowrap">Nama</TableHead>
                  <TableHead className="whitespace-nowrap">Jabatan</TableHead>
                  <TableHead className="whitespace-nowrap">Departemen</TableHead>
                  <TableHead className="whitespace-nowrap">Email</TableHead>
                  <TableHead className="whitespace-nowrap">No. HP</TableHead>
                  <TableHead className="whitespace-nowrap">Akun Piutang</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <SkeletonRows />
                ) : data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="p-0">
                      {debouncedSearch ? (
                        <EmptyState icon={SearchX} title="Tidak ada hasil pencarian" description={`Tidak ada karyawan yang cocok dengan "${debouncedSearch}". Coba kata kunci lain.`} />
                      ) : (
                        <EmptyState
                          icon={Users}
                          title="Belum ada data karyawan"
                          description="Klik tombol Tambah Karyawan di kanan atas untuk menambahkan karyawan baru."
                          action={{
                            label: 'Tambah Karyawan',
                            onClick: () => openFormTab({ title: 'Tambah Karyawan', module: 'settings', subPage: 'karyawan', formKey: 'karyawan-create' })
                          }}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap font-mono font-medium">{row.nik}</TableCell>
                      <TableCell className="whitespace-nowrap font-medium">{row.nama}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{row.jabatan || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">{departemenBadge(row.departemen)}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{row.email || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{row.noHp || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.akunPiutang ? `${row.akunPiutang.kode} - ${row.akunPiutang.nama}` : '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">{statusBadge(row.status)}</TableCell>
                      <TableCell className="whitespace-nowrap text-center">
                        <div className="inline-flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openFormTab({ title: `Edit ${row.nama}`, module: 'settings', subPage: 'karyawan', formKey: 'karyawan-edit', formProps: { id: row.id, nik: row.nik, nama: row.nama, jabatan: row.jabatan || '', departemen: row.departemen || '', email: row.email || '', noHp: row.noHp || '', akunPiutangId: row.akunPiutangId || '' } })} aria-label={`Edit ${row.nama}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(row)} aria-label={`Hapus ${row.nama}`} disabled={row.status === 'NONAKTIF'}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {!loading && total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Menampilkan {skip + 1}–{Math.min(skip + PAGE_SIZE, total)} dari {total} karyawan (Halaman {currentPage} dari {totalPages})
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
            <AlertDialogTitle>Nonaktifkan Karyawan</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menonaktifkan karyawan <span className="font-semibold text-foreground">&quot;{deleteTarget?.nama}&quot;</span> ({deleteTarget?.nik})? Karyawan yang dinonaktifkan tidak akan digunakan dalam transaksi baru namun data historis tetap tersimpan.
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
    </div>
  );
}
