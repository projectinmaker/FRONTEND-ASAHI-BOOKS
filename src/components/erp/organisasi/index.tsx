'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Search, Pencil, Loader2, ChevronLeft, ChevronRight, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { organisasiApi } from '@/lib/organisasi-api';
import { ApiError } from '@/lib/api';
import { EmptyState } from '@/components/ui/empty-state';
import type { OrgUnit, OrgUnitKind, OrgUnitCreate, OrgUnitUpdate } from '@/types/api';

const KIND_OPTIONS: { value: OrgUnitKind; label: string; badge: string }[] = [
  { value: 'COMPANY', label: 'Perusahaan', badge: 'bg-violet-100 text-violet-700 border-violet-200' },
  { value: 'BRANCH', label: 'Cabang', badge: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  { value: 'DEPARTMENT', label: 'Departemen', badge: 'bg-teal-100 text-teal-700 border-teal-200' },
  { value: 'COST_CENTER', label: 'Cost Center', badge: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'PROJECT', label: 'Proyek', badge: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200' }
];

const KIND_LABEL: Record<string, string> = Object.fromEntries(KIND_OPTIONS.map((k) => [k.value, k.label]));
const KIND_BADGE: Record<string, string> = Object.fromEntries(KIND_OPTIONS.map((k) => [k.value, k.badge]));

function statusBadge(status: string) {
  const cls = status === 'AKTIF' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-200';
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
}

function kindBadge(kind: string) {
  const cls = KIND_BADGE[kind] || 'bg-gray-100 text-gray-700 border-gray-200';
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{KIND_LABEL[kind] || kind}</span>;
}

export default function OrganisasiPage({ subPage }: { subPage?: string }) {
  const [data, setData] = useState<OrgUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<string>('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<OrgUnit | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<OrgUnit | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    debounceTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await organisasiApi.getUnits({ limit: 500 });
      setData(Array.isArray(res) ? res : []);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Gagal memuat data organisasi');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredData = data.filter((d) => {
    if (kindFilter !== 'ALL' && d.kind !== kindFilter) return false;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      return d.code.toLowerCase().includes(q) || d.name.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Organisasi
          </h2>
          <p className="text-sm text-muted-foreground">{loading ? 'Memuat data...' : `${filteredData.length} unit organisasi`}</p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Tambah Unit
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px] max-w-sm">
              <Label className="text-xs text-muted-foreground">Cari Kode / Nama</Label>
              <div className="relative mt-1.5">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Cari unit..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
              </div>
            </div>
            <div className="w-full sm:w-48">
              <Label className="text-xs text-muted-foreground">Jenis</Label>
              <Select value={kindFilter} onValueChange={setKindFilter}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua</SelectItem>
                  {KIND_OPTIONS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  <TableHead className="whitespace-nowrap">Induk</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8">
                      <EmptyState icon={Building2} title="Belum ada unit organisasi" description="Klik tombol Tambah Unit untuk membuat perusahaan, cabang, departemen, cost center, atau proyek." />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((row) => {
                    const parent = data.find((d) => d.id === row.parentId);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap font-mono font-medium text-xs">{row.code}</TableCell>
                        <TableCell className="whitespace-nowrap font-medium">{row.name}</TableCell>
                        <TableCell className="whitespace-nowrap">{kindBadge(row.kind)}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground text-xs">{parent ? `${parent.code} — ${parent.name}` : '-'}</TableCell>
                        <TableCell className="whitespace-nowrap">{statusBadge(row.status)}</TableCell>
                        <TableCell className="whitespace-nowrap text-center">
                          <div className="inline-flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditTarget(row)} aria-label={`Edit ${row.name}`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {row.status === 'AKTIF' && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeactivateTarget(row)} aria-label={`Nonaktifkan ${row.name}`}>
                                <Loader2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
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

      <CreateUnitDialog open={createOpen} onOpenChange={setCreateOpen} allUnits={data} onCreated={fetchData} />
      <EditUnitDialog target={editTarget} onClose={() => setEditTarget(null)} onUpdated={fetchData} />

      <AlertDialog
        open={!!deactivateTarget}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null);
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nonaktifkan Unit</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menonaktifkan <span className="font-semibold text-foreground">{deactivateTarget?.name}</span> ({deactivateTarget?.code})? Unit yang dinonaktifkan tetap dapat dibaca untuk riwayat, namun tidak dapat dipilih untuk transaksi baru.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2"
              onClick={async () => {
                if (!deactivateTarget) return;
                setSubmitting(true);
                try {
                  await organisasiApi.updateUnit(deactivateTarget.id, { name: deactivateTarget.name, status: 'NONAKTIF' });
                  toast.success(`Unit "${deactivateTarget.name}" dinonaktifkan`);
                  setDeactivateTarget(null);
                  fetchData();
                } catch (err) {
                  toast.error(err instanceof ApiError ? err.detail : 'Gagal menonaktifkan unit');
                } finally {
                  setSubmitting(false);
                }
              }}
              disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Nonaktifkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Create Dialog ───────────────────────────────────────────────────────

function CreateUnitDialog({ open, onOpenChange, allUnits, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; allUnits: OrgUnit[]; onCreated: () => void }) {
  const [form, setForm] = useState<OrgUnitCreate>({ kind: 'COMPANY', code: '', name: '', parentId: null });
  const [submitting, setSubmitting] = useState(false);

  const parentOptions = allUnits.filter((u) => {
    if (u.status !== 'AKTIF') return false;
    if (form.kind === 'COMPANY') return false;
    if (form.kind === 'BRANCH') return u.kind === 'COMPANY';
    if (form.kind === 'DEPARTMENT') return u.kind === 'COMPANY' || u.kind === 'BRANCH';
    return u.kind === 'COMPANY' || u.kind === 'BRANCH' || u.kind === 'DEPARTMENT';
  });

  const handleSubmit = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error('Kode dan nama wajib diisi');
      return;
    }
    setSubmitting(true);
    try {
      await organisasiApi.createUnit({
        ...form,
        code: form.code.trim(),
        name: form.name.trim(),
        parentId: form.kind === 'COMPANY' ? null : form.parentId || null
      });
      toast.success('Unit organisasi berhasil dibuat');
      setForm({ kind: 'COMPANY', code: '', name: '', parentId: null });
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal membuat unit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tambah Unit Organisasi</DialogTitle>
          <DialogDescription className="text-xs">Buat perusahaan, cabang, departemen, cost center, atau proyek.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label className="text-xs">Jenis</Label>
            <Select value={form.kind} onValueChange={(v) => setForm((prev) => ({ ...prev, kind: v as OrgUnitKind, parentId: null }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KIND_OPTIONS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Kode</Label>
            <Input placeholder="Contoh: JKT" value={form.code} onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Nama</Label>
            <Input placeholder="Contoh: Cabang Jakarta" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
          </div>
          {form.kind !== 'COMPANY' && (
            <div className="space-y-2">
              <Label className="text-xs">Induk</Label>
              <SearchableDropdown value={form.parentId || ''} onValueChange={(v) => setForm((prev) => ({ ...prev, parentId: v }))} options={parentOptions.map((u) => ({ id: u.id, label: `${u.code} — ${u.name}`, subtitle: KIND_LABEL[u.kind] }))} placeholder="Pilih induk" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Dialog ────────────────────────────────────────────────────────

function EditUnitDialog({ target, onClose, onUpdated }: { target: OrgUnit | null; onClose: () => void; onUpdated: () => void }) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState('AKTIF');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (target) {
      setName(target.name);
      setStatus(target.status);
    }
  }, [target]);

  if (!target) return null;

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Nama wajib diisi');
      return;
    }
    setSubmitting(true);
    try {
      await organisasiApi.updateUnit(target.id, { name: name.trim(), status });
      toast.success('Unit berhasil diperbarui');
      onClose();
      onUpdated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal memperbarui unit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Unit: {target.code}</DialogTitle>
          <DialogDescription className="text-xs">Jenis: {KIND_LABEL[target.kind]}. Kode, jenis, dan induk tidak dapat diubah.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label className="text-xs">Nama</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AKTIF">AKTIF</SelectItem>
                <SelectItem value="NONAKTIF">NONAKTIF</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
