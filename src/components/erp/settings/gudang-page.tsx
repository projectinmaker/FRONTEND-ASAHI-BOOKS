'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Search, Pencil, Trash2, Loader2, ChevronLeft, ChevronRight, Warehouse, SearchX } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import { useTabStore } from '@/store/tab-store';
import { FormTabShell } from '@/components/erp/form-tab-shell';
import { ExcelTools } from './excel-tools';

import { api, ApiError } from '@/lib/api';
import { getOrganizationOptions, type OrganizationOption } from '@/lib/master-data';
import type { GudangResponse, GudangCreate, GudangUpdate } from '@/types/api';

// ─── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

// ─── Helpers ───────────────────────────────────────────────────────────────

const statusBadge = (status: string) => {
  const cls = status === 'AKTIF' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-200';
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
};

// ─── Form state type ───────────────────────────────────────────────────────

type FormMode = 'create' | 'edit';

interface FormState {
  kode: string;
  nama: string;
  alamat: string;
  // === Phase 2 — field baru ===
  companyId: string;
  branchId: string;
}

const emptyForm: FormState = { kode: '', nama: '', alamat: '', companyId: '', branchId: '' };

interface GudangPageProps {
  subPage?: string;
  refreshKey?: number;
  formMode?: string;
  formProps?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Form Component (rendered in tab)
// ═══════════════════════════════════════════════════════════════════════════

function GudangForm({ mode, editId, initialData }: { mode: FormMode; editId?: string; initialData?: FormState }) {
  const [form, setForm] = useState<FormState>(initialData || emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  // === Phase 2 — organization options ===
  const [companyOptions, setCompanyOptions] = useState<OrganizationOption[]>([]);
  const [branchOptions, setBranchOptions] = useState<OrganizationOption[]>([]);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  // ── Phase 2 — fetch organization options on mount ──────────────────────
  useEffect(() => {
    getOrganizationOptions('COMPANY')
      .then(setCompanyOptions)
      .catch(() => setCompanyOptions([]));
    getOrganizationOptions('BRANCH')
      .then(setBranchOptions)
      .catch(() => setBranchOptions([]));
  }, []);

  // ── Phase 2 — fetch existing gudang for edit (pre-fill company/branch) ─
  useEffect(() => {
    if (mode !== 'edit' || !editId) return;
    api
      .get<GudangResponse>(`/master/gudang/${editId}`)
      .then((res) => {
        setForm((prev) => ({
          ...prev,
          companyId: res.companyId || '',
          branchId: res.branchId || ''
        }));
      })
      .catch(() => {
        /* Biarkan nilai dari formProps yang sudah ada */
      });
  }, [mode, editId]);

  const title = mode === 'create' ? 'Tambah Gudang' : 'Edit Gudang';

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
      case 'kode':
        if (!trimmed) return 'Kode gudang wajib diisi';
        if (trimmed.length < 2) return 'Kode gudang minimal 2 karakter';
        return '';
      case 'nama':
        if (!trimmed) return 'Nama gudang wajib diisi';
        if (trimmed.length < 3) return 'Nama gudang minimal 3 karakter';
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
    (['kode', 'nama'] as const).forEach((field) => {
      const e = validateField(field, form[field]);
      if (e) errors[field] = e;
    });
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
        const payload: GudangCreate = {
          kode: form.kode.trim(),
          nama: form.nama.trim(),
          alamat: form.alamat.trim() || null,
          // === Phase 2 — field baru ===
          companyId: form.companyId || null,
          branchId: form.branchId || null
        };
        await api.post<GudangResponse>('/master/gudang', payload);
        toast.success('Gudang berhasil ditambahkan');
      } else {
        if (!editId) return;
        const payload: GudangUpdate = {
          nama: form.nama.trim(),
          alamat: form.alamat.trim() || null,
          // === Phase 2 — field baru ===
          companyId: form.companyId || null,
          branchId: form.branchId || null
        };
        await api.put<GudangResponse>(`/master/gudang/${editId}`, payload);
        toast.success('Gudang berhasil diperbarui');
      }
      refreshListTab('settings', 'gudang');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : mode === 'create' ? 'Gagal menambahkan gudang' : 'Gagal memperbarui gudang';
      // Phase 2 — handle immutable code error (kode tidak boleh diubah karena sudah dipakai transaksi)
      if (msg.includes('tidak boleh diubah') || msg.includes('sudah dipakai transaksi')) {
        toast.error(msg, {
          description: 'Nonaktifkan master ini (status=NONAKTIF) lalu buat master baru dengan kode yang benar.',
          duration: 6000
        });
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormTabShell title={title}>
      <Card className="max-w-4xl">
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">{mode === 'create' ? 'Isi data di bawah untuk menambahkan gudang baru.' : `Mengediting gudang: ${form.kode} — ${form.nama}`}</p>
          <div className="space-y-2">
            <Label htmlFor="gdg-kode">Kode Gudang</Label>
            <Input id="gdg-kode" placeholder="Contoh: GDG-001" value={form.kode} onChange={(e) => updateForm('kode', e.target.value)} onBlur={() => handleBlur('kode')} aria-invalid={!!formErrors.kode} className={formErrors.kode ? 'border-destructive focus-visible:ring-destructive' : ''} disabled={mode === 'edit'} />
            {formErrors.kode ? <p className="text-xs text-destructive mt-1">{formErrors.kode}</p> : mode === 'edit' ? <p className="text-[11px] text-muted-foreground">Kode gudang tidak dapat diubah.</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="gdg-nama">Nama Gudang</Label>
            <Input id="gdg-nama" placeholder="Nama gudang" value={form.nama} onChange={(e) => updateForm('nama', e.target.value)} onBlur={() => handleBlur('nama')} aria-invalid={!!formErrors.nama} className={formErrors.nama ? 'border-destructive focus-visible:ring-destructive' : ''} autoFocus />
            {formErrors.nama && <p className="text-xs text-destructive mt-1">{formErrors.nama}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="gdg-alamat">Alamat</Label>
            <Input id="gdg-alamat" placeholder="Alamat gudang (opsional)" value={form.alamat} onChange={(e) => updateForm('alamat', e.target.value)} />
          </div>
          {/* === Phase 2 — Company & Branch (OrganizationUnit, opsional) === */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Company</Label>
              <Select value={form.companyId} onValueChange={(v) => updateForm('companyId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih company (opsional)" />
                </SelectTrigger>
                <SelectContent>
                  {companyOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Unit organisasi level company (opsional).</p>
            </div>
            <div className="space-y-2">
              <Label>Branch</Label>
              <Select value={form.branchId} onValueChange={(v) => updateForm('branchId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih branch (opsional)" />
                </SelectTrigger>
                <SelectContent>
                  {branchOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Unit organisasi level branch (opsional).</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting}>
              Batal
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === 'create' ? 'Simpan Gudang' : 'Perbarui Gudang'}
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

export default function GudangPage({ refreshKey, formMode, formProps }: GudangPageProps) {
  if (formMode) {
    const isEdit = formProps?.id as string | undefined;
    return (
      <GudangForm
        mode={isEdit ? 'edit' : 'create'}
        editId={isEdit}
        initialData={
          isEdit
            ? {
                kode: (formProps?.kode as string) || '',
                nama: (formProps?.nama as string) || '',
                alamat: (formProps?.alamat as string) || '',
                // === Phase 2 — field baru (di-refresh lagi via useEffect di GudangForm) ===
                companyId: (formProps?.companyId as string) || '',
                branchId: (formProps?.branchId as string) || ''
              }
            : undefined
        }
      />
    );
  }
  return <GudangListContent refreshKey={refreshKey} />;
}

function GudangListContent({ refreshKey }: { refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab);

  const [data, setData] = useState<GudangResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [skip, setSkip] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<GudangResponse | null>(null);
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
      const res = await api.get<GudangResponse[]>(`/master/gudang?${params.toString()}`);
      setData(res);
      setTotal(res.length);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Gagal memuat data gudang');
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
      await api.delete<{ message: string }>(`/master/gudang/${deleteTarget.id}`);
      toast.success(`Gudang "${deleteTarget.nama}" berhasil dihapus`);
      setDeleteTarget(null);
      fetchData();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.detail);
      } else {
        toast.error('Gagal menghapus gudang');
      }
    } finally {
      setDeleting(false);
    }
  };

  const SkeletonRows = () => (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-36" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-48" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-16 text-right" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-28" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-28" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-16 rounded-full" />
          </TableCell>
          <TableCell>
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
          <h2 className="text-lg font-semibold">Gudang</h2>
          <p className="text-sm text-muted-foreground">{loading ? 'Memuat data...' : `${total} gudang`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExcelTools entity="gudang" onImported={fetchData} />
          <Button size="sm" className="gap-2" onClick={() => openFormTab({ title: 'Tambah Gudang', module: 'settings', subPage: 'gudang', formKey: 'gudang-create' })}>
            <Plus className="h-4 w-4" /> Tambah Gudang
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="max-w-sm">
            <Label className="text-xs text-muted-foreground">Cari Kode / Nama</Label>
            <div className="relative mt-1.5">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cari gudang..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
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
                  <TableHead className="whitespace-nowrap">Kode</TableHead>
                  <TableHead className="whitespace-nowrap">Nama</TableHead>
                  <TableHead className="whitespace-nowrap">Alamat</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Total Barang</TableHead>
                  {/* === Phase 2 — Company & Branch columns === */}
                  <TableHead className="whitespace-nowrap">Company</TableHead>
                  <TableHead className="whitespace-nowrap">Branch</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <SkeletonRows />
                ) : data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-0">
                      {debouncedSearch ? (
                        <EmptyState icon={SearchX} title="Tidak ada hasil pencarian" description={`Tidak ada gudang yang cocok dengan "${debouncedSearch}". Coba kata kunci lain.`} />
                      ) : (
                        <EmptyState
                          icon={Warehouse}
                          title="Belum ada data gudang"
                          description="Klik tombol Tambah Gudang di kanan atas untuk menambahkan gudang baru."
                          action={{
                            label: 'Tambah Gudang',
                            onClick: () => openFormTab({ title: 'Tambah Gudang', module: 'settings', subPage: 'gudang', formKey: 'gudang-create' })
                          }}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap font-mono font-medium">{row.kode}</TableCell>
                      <TableCell className="whitespace-nowrap font-medium">{row.nama}</TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">{row.alamat || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums font-medium">{row.totalBarang}</TableCell>
                      {/* === Phase 2 — Company & Branch display === */}
                      <TableCell className="whitespace-nowrap text-muted-foreground">{row.company?.name || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{row.branch?.name || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">{statusBadge(row.status)}</TableCell>
                      <TableCell className="whitespace-nowrap text-center">
                        <div className="inline-flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openFormTab({ title: `Edit ${row.nama}`, module: 'settings', subPage: 'gudang', formKey: 'gudang-edit', formProps: { id: row.id, kode: row.kode, nama: row.nama, alamat: row.alamat ?? '', companyId: row.companyId ?? '', branchId: row.branchId ?? '' } })} aria-label={`Edit ${row.nama}`}>
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
            Menampilkan {skip + 1}–{Math.min(skip + PAGE_SIZE, total)} dari {total} gudang (Halaman {currentPage} dari {totalPages})
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
            <AlertDialogTitle>Hapus Gudang</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus gudang <span className="font-semibold text-foreground">&quot;{deleteTarget?.nama}&quot;</span> ({deleteTarget?.kode})? Gudang yang dihapus tidak akan digunakan dalam transaksi baru namun data historis tetap tersimpan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2">
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />} Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
