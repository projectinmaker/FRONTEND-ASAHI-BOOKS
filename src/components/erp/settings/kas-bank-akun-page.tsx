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
import { Plus, Search, Pencil, Trash2, Loader2, ChevronLeft, ChevronRight, Wallet, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTabStore } from '@/store/tab-store';
import { FormTabShell } from '@/components/erp/form-tab-shell';

import { api, ApiError } from '@/lib/api';
import { formatRp } from '@/lib/pdf-utils';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import type { KasBankAkunResponse, KasBankAkunCreate, KasBankAkunUpdate, COADropdownResponse } from '@/types/api';

// ─── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

const statusBadge = (status: string) => {
  const cls = status === 'AKTIF' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-200';
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
};

const jenisBadge = (jenis: string) => {
  const isKas = jenis === 'KAS';
  const cls = isKas ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-sky-100 text-sky-700 border-sky-200';
  const Icon = isKas ? Wallet : Building2;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      <Icon className="h-3 w-3" />
      {jenis}
    </span>
  );
};

type FormMode = 'create' | 'edit';

interface FormState {
  kode: string;
  nama: string;
  jenis: string;
  akunPerkiraanId: string;
  currency: string;
}

const emptyForm: FormState = { kode: '', nama: '', jenis: 'KAS', akunPerkiraanId: '', currency: 'IDR' };

interface KasBankAkunPageProps {
  subPage?: string;
  refreshKey?: number;
  formMode?: string;
  formProps?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Form Component (rendered in tab)
// ═══════════════════════════════════════════════════════════════════════════

function KasBankAkunForm({ mode, editId, initialData }: { mode: FormMode; editId?: string; initialData?: FormState }) {
  const [form, setForm] = useState<FormState>(initialData || emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const [coaOptions, setCoaOptions] = useState<COADropdownResponse[]>([]);

  const title = mode === 'create' ? 'Tambah Akun Kas / Bank' : 'Edit Akun Kas / Bank';

  useEffect(() => {
    const fetchCoa = async () => {
      try {
        const res = await api.get<COADropdownResponse[]>('/master/coa-dropdown');
        setCoaOptions(res);
      } catch {
        /* silently fail */
      }
    };
    fetchCoa();
  }, []);

  // Phase 2 — fetch authoritative record in edit mode (currency etc.)
  useEffect(() => {
    if (mode !== 'edit' || !editId) return;
    let cancelled = false;
    const fetchExisting = async () => {
      try {
        const res = await api.get<KasBankAkunResponse>(`/master/kas-bank-akun/${editId}`);
        if (cancelled) return;
        setForm((prev) => ({
          ...prev,
          kode: res.kode,
          nama: res.nama,
          jenis: res.jenis,
          akunPerkiraanId: res.akunPerkiraan?.id || prev.akunPerkiraanId,
          currency: res.currency || 'IDR'
        }));
      } catch {
        /* silently fail — fall back to initialData */
      }
    };
    fetchExisting();
    return () => {
      cancelled = true;
    };
  }, [mode, editId]);

  const updateForm = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!form.kode.trim()) {
      toast.error('Kode akun wajib diisi');
      return;
    }
    if (!form.nama.trim()) {
      toast.error('Nama akun wajib diisi');
      return;
    }
    if (!form.akunPerkiraanId) {
      toast.error('Akun perkiraan wajib dipilih');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'create') {
        const payload: KasBankAkunCreate = { kode: form.kode.trim(), nama: form.nama.trim(), jenis: form.jenis, akunPerkiraanId: form.akunPerkiraanId, currency: form.currency || 'IDR' };
        await api.post<KasBankAkunResponse>('/master/kas-bank-akun', payload);
        toast.success('Akun kas / bank berhasil ditambahkan');
      } else {
        if (!editId) return;
        const payload: KasBankAkunUpdate = { nama: form.nama.trim(), jenis: form.jenis, akunPerkiraanId: form.akunPerkiraanId, currency: form.currency || 'IDR' };
        await api.put<KasBankAkunResponse>(`/master/kas-bank-akun/${editId}`, payload);
        toast.success('Akun kas / bank berhasil diperbarui');
      }
      refreshListTab('settings', 'kas-bank-akun');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : mode === 'create' ? 'Gagal menambahkan akun kas / bank' : 'Gagal memperbarui akun kas / bank';
      if (msg.includes('tidak boleh diubah') || msg.includes('sudah dipakai transaksi')) {
        toast.error(msg, { description: 'Nonaktifkan master ini (status=NONAKTIF) lalu buat master baru.', duration: 6000 });
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
          <p className="text-sm text-muted-foreground">{mode === 'create' ? 'Isi data di bawah untuk menambahkan akun kas atau bank baru.' : `Mengediting: ${form.kode} — ${form.nama}`}</p>

          <div className="space-y-2">
            <Label htmlFor="kb-kode">Kode Akun</Label>
            <Input id="kb-kode" placeholder="Contoh: KAS-001, BANK-BCA" value={form.kode} onChange={(e) => updateForm('kode', e.target.value)} disabled={mode === 'edit'} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="kb-nama">Nama Akun</Label>
            <Input id="kb-nama" placeholder="Nama akun kas / bank" value={form.nama} onChange={(e) => updateForm('nama', e.target.value)} autoFocus />
          </div>

          <div className="space-y-2">
            <Label htmlFor="kb-jenis">Jenis</Label>
            <Select value={form.jenis} onValueChange={(v) => updateForm('jenis', v)}>
              <SelectTrigger id="kb-jenis">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="KAS">Kas</SelectItem>
                <SelectItem value="BANK">Bank</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Akun Perkiraan</Label>
            <SearchableDropdown options={coaOptions.map((c) => ({ id: c.id, label: `${c.kode} — ${c.nama}` }))} value={form.akunPerkiraanId} onValueChange={(v) => updateForm('akunPerkiraanId', v)} placeholder="Pilih akun perkiraan..." />
          </div>

          <div className="space-y-2">
            <Label>Currency</Label>
            <Select value={form.currency} onValueChange={(v) => updateForm('currency', v)} disabled>
              <SelectTrigger>
                <SelectValue placeholder="IDR" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IDR">IDR — Rupiah</SelectItem>
                <SelectItem value="USD">USD — US Dollar</SelectItem>
                <SelectItem value="EUR">EUR — Euro</SelectItem>
                <SelectItem value="SGD">SGD — Singapore Dollar</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Phase-1 hanya mendukung IDR. Multi-currency akan didukung di fase berikutnya.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting}>
              Batal
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === 'create' ? 'Simpan' : 'Perbarui'}
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

export default function KasBankAkunPage({ refreshKey, formMode, formProps }: KasBankAkunPageProps) {
  if (formMode) {
    const isEdit = formProps?.id as string | undefined;
    return (
      <KasBankAkunForm
        mode={isEdit ? 'edit' : 'create'}
        editId={isEdit}
        initialData={
          isEdit
            ? {
                kode: (formProps?.kode as string) || '',
                nama: (formProps?.nama as string) || '',
                jenis: (formProps?.jenis as string) || 'KAS',
                akunPerkiraanId: (formProps?.akunPerkiraanId as string) || '',
                currency: (formProps?.currency as string) || 'IDR'
              }
            : undefined
        }
      />
    );
  }
  return <KasBankAkunListContent refreshKey={refreshKey} />;
}

function KasBankAkunListContent({ refreshKey }: { refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab);

  const [data, setData] = useState<KasBankAkunResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [skip, setSkip] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<KasBankAkunResponse | null>(null);
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
      const res = await api.get<KasBankAkunResponse[]>(`/master/kas-bank-akun`);
      const filtered = debouncedSearch ? res.filter((r) => r.kode.toLowerCase().includes(debouncedSearch.toLowerCase()) || r.nama.toLowerCase().includes(debouncedSearch.toLowerCase()) || r.jenis.toLowerCase().includes(debouncedSearch.toLowerCase())) : res;
      const t = filtered.length;
      setData(filtered.slice(skip, skip + PAGE_SIZE));
      setTotal(t);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Gagal memuat data kas / bank');
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
      await api.delete<{ message: string }>(`/master/kas-bank-akun/${deleteTarget.id}`);
      toast.success(`Akun ${deleteTarget.jenis.toLowerCase()} "${deleteTarget.nama}" berhasil dihapus`);
      setDeleteTarget(null);
      fetchData();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.detail);
      } else {
        toast.error('Gagal menghapus akun kas / bank');
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
            <Skeleton className="h-5 w-16 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-48" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24 text-right" />
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
          <h2 className="text-lg font-semibold">Akun Kas & Bank</h2>
          <p className="text-sm text-muted-foreground">{loading ? 'Memuat data...' : `${total} akun kas & bank`}</p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => openFormTab({ title: 'Tambah Akun', module: 'settings', subPage: 'kas-bank-akun', formKey: 'kas-bank-akun-create' })}>
          <Plus className="h-4 w-4" /> Tambah Akun
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="max-w-sm">
            <Label className="text-xs text-muted-foreground">Cari Kode / Nama</Label>
            <div className="relative mt-1.5">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cari akun kas / bank..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
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
                  <TableHead className="whitespace-nowrap">Jenis</TableHead>
                  <TableHead className="whitespace-nowrap">Akun Perkiraan</TableHead>
                  <TableHead className="whitespace-nowrap">Currency</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Saldo</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <SkeletonRows />
                ) : data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      {debouncedSearch ? 'Tidak ada akun yang sesuai dengan pencarian.' : 'Belum ada data akun kas & bank.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap font-mono font-medium">{row.kode}</TableCell>
                      <TableCell className="whitespace-nowrap font-medium">{row.nama}</TableCell>
                      <TableCell className="whitespace-nowrap">{jenisBadge(row.jenis)}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {row.akunPerkiraan.kode} — {row.akunPerkiraan.nama}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono">{row.currency || 'IDR'}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums font-medium">{formatRp(row.saldo)}</TableCell>
                      <TableCell className="whitespace-nowrap">{statusBadge(row.status)}</TableCell>
                      <TableCell className="whitespace-nowrap text-center">
                        <div className="inline-flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openFormTab({ title: `Edit ${row.nama}`, module: 'settings', subPage: 'kas-bank-akun', formKey: 'kas-bank-akun-edit', formProps: { id: row.id, kode: row.kode, nama: row.nama, jenis: row.jenis, akunPerkiraanId: row.akunPerkiraan.id, currency: row.currency || 'IDR' } })} aria-label={`Edit ${row.nama}`}>
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
            Menampilkan {skip + 1}–{Math.min(skip + PAGE_SIZE, total)} dari {total} (Halaman {currentPage} dari {totalPages})
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
            <AlertDialogTitle>Hapus Akun Kas / Bank</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus akun <span className="font-semibold text-foreground">&quot;{deleteTarget?.nama}&quot;</span> ({deleteTarget?.kode})? Akun yang dihapus tidak akan digunakan dalam transaksi baru.
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
