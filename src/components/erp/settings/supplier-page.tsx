'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Search, Pencil, Trash2, Loader2, ChevronLeft, ChevronRight, Link2, FileText, Power, Users, SearchX } from 'lucide-react';
import { toast } from 'sonner';
import { useTabStore } from '@/store/tab-store';
import { FormTabShell } from '@/components/erp/form-tab-shell';
import { Badge } from '@/components/ui/badge';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { EmptyState } from '@/components/ui/empty-state';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { loadSupplierRows, supplierFoundationKeys, supplierFoundationPayload, saveSupplier } from '@/lib/phase-a';
import { api, ApiError } from '@/lib/api';
import { getSyaratBayarOptions, type SyaratBayarOption } from '@/lib/master-data';
import type { SupplierResponse, SupplierCreate, SupplierUpdate, SupplierCOAItem, TaxStatus } from '@/types/api';

// ─── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 100;

// ─── Badge helpers ──────────────────────────────────────────────────────────

const statusBadge = (status: string) => {
  const cls = status === 'AKTIF' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-200';
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
};

const linkBadge = (isLinked: boolean) => {
  return isLinked ? (
    <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50 text-xs gap-1">
      <Link2 className="h-3 w-3" /> Terhubung
    </Badge>
  ) : (
    <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50 text-xs gap-1">
      <FileText className="h-3 w-3" /> Belum di-link
    </Badge>
  );
};

// ─── Form state type ───────────────────────────────────────────────────────

type FormMode = 'create' | 'edit';

interface FormState {
  supplierType: string;
  city: string;
  province: string;
  country: string;
  postalCode: string;
  currency: string;
  bankName: string;
  bankAccountNo: string;
  bankAccountName: string;
  kode: string;
  nama: string;
  alamat: string;
  telepon: string;
  email: string;
  kontakPerson: string;
  npwp: string;
  // === Phase 2 — field baru ===
  nitku: string;
  syaratBayarId: string; // UUID, prefer pakai ini (canonical)
  creditLimit: string; // input as string, parse to number on submit
  taxStatus: string; // 'PKP' | 'NON_PKP' | ''
  // === Legacy (tetap dipertahankan untuk backward compat) ===
  syaratBayarDefault: string;
}

const emptyForm: FormState = {
  supplierType: '',
  city: '',
  province: '',
  country: '',
  postalCode: '',
  currency: '',
  bankName: '',
  bankAccountNo: '',
  bankAccountName: '',
  kode: '',
  nama: '',
  alamat: '',
  telepon: '',
  email: '',
  kontakPerson: '',
  npwp: '',
  // === Phase 2 ===
  nitku: '',
  syaratBayarId: '',
  creditLimit: '',
  taxStatus: '',
  // === Legacy ===
  syaratBayarDefault: ''
};

interface SupplierPageProps {
  subPage?: string;
  refreshKey?: number;
  formMode?: string;
  formProps?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Form Component (rendered in tab)
// ═══════════════════════════════════════════════════════════════════════════

function SupplierForm({ mode, editId, initialData, preselectedCoaId, preselectedCoaKode, preselectedCoaNama }: { mode: FormMode; editId?: string; initialData?: FormState; preselectedCoaId?: string; preselectedCoaKode?: string; preselectedCoaNama?: string }) {
  const [form, setForm] = useState<FormState>(() => initialData || { ...emptyForm, nama: preselectedCoaNama?.replace(/^Hutang\s*-\s*/i, '').trim() || '' });
  const [detail, setDetail] = useState<SupplierResponse | null>(null);
  const [loading, setLoading] = useState(mode === 'edit');
  const [loadError, setLoadError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [syaratBayarOptions, setSyaratBayarOptions] = useState<SyaratBayarOption[]>([]);
  const [formStatus, setFormStatus] = useState('');
  const [suggestions, setSuggestions] = useState<SupplierCOAItem[]>([]);
  const activeTabId = useTabStore(s => s.activeTabId);
  const closeTab = useTabStore(s => s.closeTab);
  const refreshListTab = useTabStore(s => s.refreshListTab);
  const updateForm = (key: keyof FormState, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  useEffect(() => {
    let active = true;
    getSyaratBayarOptions().then(value => { if (active) setSyaratBayarOptions(value); }).catch(() => { if (active) toast.error('Syarat bayar gagal dimuat'); });
    loadSupplierRows().then(value => { if (active) setSuggestions(value); }).catch(() => { /* Free text remains available when suggestions cannot load. */ });
    return () => { active = false; };
  }, []);

  const loadDetail = useCallback(() => {
    if (!editId) return;
    return api.get<SupplierResponse>('/master/supplier/' + editId).then(res => {
      setDetail(res);
      setFormStatus(res.status);
      setForm({ ...emptyForm, ...Object.fromEntries(supplierFoundationKeys.map(key => [key, res[key] ?? ''])), kode: res.kode, nama: res.nama, alamat: res.alamat || '', telepon: res.telepon || '', email: res.email || '', kontakPerson: res.kontakPerson || '', npwp: res.npwp || '', nitku: res.nitku || '', syaratBayarId: res.syaratBayarId || '', creditLimit: res.creditLimit != null ? String(res.creditLimit) : '', taxStatus: res.taxStatus || '', syaratBayarDefault: res.syaratBayarDefault || '' });
    }).catch(err => { setLoadError(err instanceof ApiError ? err.detail : 'Gagal memuat supplier'); })
      .finally(() => setLoading(false));
  }, [editId]);
  useEffect(() => { void loadDetail(); }, [loadDetail]);

  const handleSubmit = async () => {
    if (!form.kode.trim() || !form.nama.trim()) { setSubmitError('Kode dan nama supplier wajib diisi'); return; }
    setSubmitting(true);
    try {
      const payload: SupplierCreate & SupplierUpdate = {
        ...supplierFoundationPayload(form), kode: form.kode.trim(), nama: form.nama.trim(),
        alamat: form.alamat.trim() || null, telepon: form.telepon.trim() || null, email: form.email.trim() || null,
        kontakPerson: form.kontakPerson.trim() || null, npwp: form.npwp.trim() || null, nitku: form.nitku.trim() || null,
        syaratBayarId: form.syaratBayarId || null, creditLimit: form.creditLimit.trim() ? Number(form.creditLimit) : null,
        taxStatus: (form.taxStatus.trim() || null) as TaxStatus
      };
      await saveSupplier({ ...payload, ...(formStatus ? { status: formStatus } : {}) }, {
        id: editId || createdId,
        coaId: preselectedCoaId,
        onLinked: id => { setCreatedId(id); refreshListTab('settings', 'supplier'); }
      });
      toast.success('Supplier berhasil disimpan');
      refreshListTab('settings', 'supplier');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) { setSubmitError(err instanceof ApiError ? err.detail : 'Gagal menyimpan supplier'); }
    finally { setSubmitting(false); }
  };

  const field = (key: keyof FormState, label: string, placeholder?: string) => (
    <div className="space-y-2" key={key}>
      <Label htmlFor={'sup-' + key}>{label}</Label>
      <Input id={'sup-' + key} value={form[key]} placeholder={placeholder} disabled={submitting || (key === 'kode' && (!!editId || !!createdId))} onChange={e => updateForm(key, e.target.value)} />
    </div>
  );
  const suggestedField = (key: 'supplierType' | 'currency' | 'taxStatus', label: string, placeholder: string) => {
    const values = [...new Set([form[key], ...suggestions.map(row => key === 'taxStatus' ? '' : row[key] || '')].filter(Boolean))];
    return <div className="space-y-2"><Label htmlFor={'sup-' + key}>{label}</Label><Input id={'sup-' + key} list={'sup-options-' + key} value={form[key]} onChange={e => updateForm(key, e.target.value)} placeholder={placeholder} disabled={submitting} /><datalist id={'sup-options-' + key}>{values.map(value => <option key={value} value={value} />)}</datalist></div>;
  };
  return (
    <FormTabShell title={mode === 'edit' ? 'Edit Supplier' : 'Tambah Supplier'}>
      <Card className="max-w-5xl"><CardContent className="p-6 space-y-4">
        {loading ? <p role="status">Memuat supplier...</p> : loadError ? <div role="alert"><p>{loadError}</p><Button onClick={() => { setLoading(true); setLoadError(''); void loadDetail(); }}>Coba Lagi</Button></div> : <>
          {createdId && <p role="status" className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">Supplier sudah dibuat dan terhubung. Simpan kembali untuk melengkapi data lainnya.</p>}
          <Tabs defaultValue="general">
            <TabsList className="flex h-auto flex-wrap justify-start gap-1">
              {[['general', 'General'], ['address', 'Address & Contact'], ['tax', 'Tax'], ['commercial', 'Commercial'], ['bank', 'Bank'], ['accounting', 'Accounting'], ['audit', 'Audit']].map(([key, label]) => <TabsTrigger key={key} value={key}>{label}</TabsTrigger>)}
            </TabsList>
            <TabsContent value="general" className="space-y-4">
              {field('kode', 'Kode Supplier *')}{field('nama', 'Nama Supplier *')}
              {suggestedField('supplierType', 'Tipe Supplier', 'COMPANY / INDIVIDUAL (opsional)')}
              <div className="space-y-2"><Label>Status</Label>{detail ? <SearchableDropdown value={formStatus} onValueChange={setFormStatus} options={[...new Set([detail.status, ...suggestions.map(row => row.status)].filter(Boolean))].map(value => ({ id: value, label: value }))} placeholder="Status supplier" /> : <Input readOnly value="Ditentukan saat disimpan" />}</div>
            </TabsContent>
            <TabsContent value="address" className="space-y-4">
              <div className="space-y-2"><Label htmlFor="sup-alamat">Alamat</Label><Textarea id="sup-alamat" value={form.alamat} onChange={e => updateForm('alamat', e.target.value)} disabled={submitting} /></div>
              <div className="grid gap-4 sm:grid-cols-2">{field('city', 'Kota')}{field('province', 'Provinsi')}{field('country', 'Negara')}{field('postalCode', 'Kode Pos')}{field('kontakPerson', 'Kontak Person')}{field('telepon', 'Telepon')}{field('email', 'Email')}</div>
            </TabsContent>
            <TabsContent value="tax" className="space-y-4">
              {field('npwp', 'NPWP')}{field('nitku', 'NITKU')}{suggestedField('taxStatus', 'Status Pajak', 'PKP / NON_PKP (opsional)')}
            </TabsContent>
            <TabsContent value="commercial" className="space-y-4">
              <div className="space-y-2"><Label>Syarat Bayar</Label><SearchableDropdown value={form.syaratBayarId} onValueChange={v => updateForm('syaratBayarId', v)} options={syaratBayarOptions.map(o => ({ id: o.value, label: o.label }))} allOption={{ id: '', label: 'Tidak dipilih' }} placeholder="Pilih syarat bayar" /></div>
              {suggestedField('currency', 'Currency', 'Kode mata uang (opsional)')}
              <div className="space-y-2"><Label htmlFor="sup-creditLimit">Credit Limit</Label><Input id="sup-creditLimit" type="number" step="any" value={form.creditLimit} onChange={e => updateForm('creditLimit', e.target.value)} disabled={submitting} /></div>
            </TabsContent>
            <TabsContent value="bank" className="space-y-4">
              <p role="note" className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Data bank sensitif. Periksa rekening sebelum menyimpan. Persetujuan khusus perubahan rekening belum tersedia.</p>
              {field('bankName', 'Nama Bank')}{field('bankAccountNo', 'No. Rekening')}{field('bankAccountName', 'Nama Rekening')}
            </TabsContent>
            <TabsContent value="accounting" className="space-y-4">
              <Label>Akun Hutang</Label><p>{detail?.akunHutang ? detail.akunHutang.kode + ' — ' + detail.akunHutang.nama : preselectedCoaId ? preselectedCoaKode + ' — ' + preselectedCoaNama : 'Akun hutang dibuat otomatis saat supplier disimpan.'}</p>
              <p className="text-sm text-muted-foreground">Saldo hutang berasal dari transaksi dan tidak dapat diubah melalui master supplier.</p>
            </TabsContent>
            <TabsContent value="audit" className="space-y-4">
              <div><Label>Created By</Label><Input readOnly value="Tidak tersedia" /></div>
              <div><Label>Created At</Label><Input readOnly value={detail?.createdAt || '-'} /></div>
              <div><Label>Updated At</Label><Input readOnly value={detail?.updatedAt || '-'} /></div>
            </TabsContent>
          </Tabs>
          <div className="flex justify-end gap-2"><Button variant="outline" disabled={submitting} onClick={() => activeTabId && closeTab(activeTabId)}>Batal</Button><Button onClick={handleSubmit} disabled={submitting}>{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan Supplier</Button></div>
        </>}
      </CardContent></Card>
      <AlertDialog open={!!submitError} onOpenChange={open => { if (!open) setSubmitError(''); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Supplier belum tersimpan lengkap</AlertDialogTitle><AlertDialogDescription>{submitError}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogAction onClick={() => setSubmitError('')}>Kembali ke form</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </FormTabShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// List Page
// ═══════════════════════════════════════════════════════════════════════════

export default function SupplierPage({ refreshKey, formMode, formProps }: SupplierPageProps) {
  if (formMode) {
    const isEdit = formProps?.id as string | undefined;
    const preselectedCoaId = formProps?.preselectedCoaId as string | undefined;
    const preselectedCoaKode = formProps?.preselectedCoaKode as string | undefined;
    const preselectedCoaNama = formProps?.preselectedCoaNama as string | undefined;
    return (
      <SupplierForm
        mode={isEdit ? 'edit' : 'create'}
        editId={isEdit}
        initialData={
          isEdit
            ? {
                ...emptyForm,
                kode: (formProps?.kode as string) || '',
                nama: (formProps?.nama as string) || '',
                alamat: (formProps?.alamat as string) || '',
                telepon: (formProps?.telepon as string) || '',
                email: (formProps?.email as string) || '',
                kontakPerson: (formProps?.kontakPerson as string) || '',
                npwp: (formProps?.npwp as string) || '',
                syaratBayarDefault: (formProps?.syaratBayarDefault as string) || ''
                // Field baru Phase 2 (nitku, syaratBayarId, creditLimit, taxStatus) akan
                // di-fetch dari detail endpoint di useEffect SupplierForm.
              }
            : undefined
        }
        preselectedCoaId={preselectedCoaId}
        preselectedCoaKode={preselectedCoaKode}
        preselectedCoaNama={preselectedCoaNama}
      />
    );
  }
  return <SupplierListContent refreshKey={refreshKey} />;
}

const SkeletonRows = () => <>{Array.from({ length: 8 }, (_, row) => <TableRow key={row}>{Array.from({ length: 12 }, (_, col) => <TableCell key={col}><Skeleton className="h-4 w-20" /></TableCell>)}</TableRow>)}</>;

function SupplierListContent({ refreshKey }: { refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab);

  // ── Data state ──
  const [data, setData] = useState<SupplierCOAItem[]>([]);
  const [total, setTotal] = useState(0);
  const [linkedCount, setLinkedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Filter / pagination state ──
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [skip, setSkip] = useState(0);

  // ── Delete dialog state ──
  const [detailTarget, setDetailTarget] = useState<SupplierCOAItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SupplierCOAItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Reactivate state ──
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);

  // ── Debounce search ──
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
  }, [debouncedSearch, statusFilter, typeFilter, countryFilter]);

  // ── Fetch data from /master/supplier-coa ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await loadSupplierRows();
      const allData = Array.isArray(res) ? res : [];
      setData(allData);
      setTotal(allData.length);
      setLinkedCount(allData.filter((d) => d.isLinked).length);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Gagal memuat data supplier');
      }
      setData([]);
      setTotal(0);
      setLinkedCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  // ── Filtered + paginated data (client-side) ──
  const filteredData = useMemo(() => {
    let result = data;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter((d) => [d.kodeSupplier, d.namaSupplier, d.nama, d.npwp, d.telepon].some(value => value?.toLowerCase().includes(q)));
    }
    if (statusFilter) result = result.filter(d => d.status === statusFilter);
    if (typeFilter) result = result.filter(d => d.supplierType === typeFilter);
    if (countryFilter) result = result.filter(d => d.country?.toLowerCase().includes(countryFilter.toLowerCase()));
    return result;
  }, [data, debouncedSearch, statusFilter, typeFilter, countryFilter]);

  const paginatedData = useMemo(() => {
    return filteredData.slice(skip, skip + PAGE_SIZE);
  }, [filteredData, skip]);

  const currentPage = Math.floor(skip / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
  const hasNext = skip + PAGE_SIZE < filteredData.length;
  const hasPrev = skip > 0;

  const goToNext = () => {
    if (hasNext) setSkip((s) => s + PAGE_SIZE);
  };
  const goToPrev = () => {
    if (hasPrev) setSkip((s) => s - PAGE_SIZE);
  };

  // ── Delete helpers ──
  const executeDelete = async () => {
    if (!deleteTarget?.supplierId) return;
    setDeleting(true);
    try {
      await api.delete<{ message: string }>(`/master/supplier/${deleteTarget.supplierId}`);
      toast.success(`Supplier "${deleteTarget.namaSupplier}" berhasil dinonaktifkan`);
      setDeleteTarget(null);
      fetchData();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.detail);
      } else {
        toast.error('Gagal menonaktifkan supplier');
      }
    } finally {
      setDeleting(false);
    }
  };

  // ── Reactivate helper ──
  const handleReactivate = async (row: SupplierCOAItem) => {
    if (!row.supplierId) return;
    setReactivatingId(row.supplierId);
    try {
      await api.put<SupplierResponse>(`/master/supplier/${row.supplierId}`, { status: 'AKTIF' });
      toast.success(`Supplier "${row.namaSupplier || row.nama}" berhasil diaktifkan kembali`);
      fetchData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal mengaktifkan supplier');
    } finally {
      setReactivatingId(null);
    }
  };

  // ── Skeleton rows ──


  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Supplier</h2>
          <p className="text-sm text-muted-foreground">{loading ? 'Memuat data...' : `${linkedCount} supplier terhubung dari ${total} Akun Hutang`}</p>
        </div>
        <Button
          size="sm"
          className="gap-2"
          onClick={() =>
            openFormTab({
              title: 'Tambah Supplier',
              module: 'settings',
              subPage: 'supplier',
              formKey: 'supplier-create'
            })
          }>
          <Plus className="h-4 w-4" />
          Tambah Supplier
        </Button>
      </div>

      {/* ── Search bar ── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px] max-w-sm">
              <Label className="text-xs text-muted-foreground">Cari Supplier</Label>
              <div className="relative mt-1.5">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Cari kode / nama / NPWP / telepon" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
              </div>
            </div>
            <div className="min-w-[160px]"><Label>Status</Label><SearchableDropdown value={statusFilter} onValueChange={setStatusFilter} options={[...new Set(data.map(row => row.status).filter(Boolean))].map(value => ({ id: value, label: value }))} allOption={{ id: '', label: 'Semua status' }} placeholder="Semua status" /></div>
            <div className="min-w-[160px]"><Label>Tipe Supplier</Label><SearchableDropdown value={typeFilter} onValueChange={setTypeFilter} options={[...new Set(data.map(row => row.supplierType).filter((value): value is string => !!value))].map(value => ({ id: value, label: value }))} allOption={{ id: '', label: 'Semua tipe' }} placeholder="Semua tipe" /></div>
            <div><Label htmlFor="supplier-country-filter">Negara</Label><Input id="supplier-country-filter" value={countryFilter} onChange={e => setCountryFilter(e.target.value)} placeholder="Semua negara" /></div>
          </div>
        </CardContent>
      </Card>

      {/* ── Error state ── */}
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

      {/* ── Table ── */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto" style={{ maxHeight: '500px', overflowY: 'auto' }}>
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="whitespace-nowrap">Kode Akun</TableHead>
                  <TableHead className="whitespace-nowrap">Nama Akun / Supplier</TableHead>
                  <TableHead className="whitespace-nowrap">Kode Supplier</TableHead>
                  <TableHead className="whitespace-nowrap">Telepon</TableHead>
                  <TableHead className="whitespace-nowrap">Email</TableHead>
                  <TableHead className="whitespace-nowrap">NPWP</TableHead>
                  <TableHead className="whitespace-nowrap">Tipe</TableHead>
                  <TableHead className="whitespace-nowrap">Kota</TableHead>
                  <TableHead className="whitespace-nowrap">Negara</TableHead>
                  <TableHead className="whitespace-nowrap">Currency</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <SkeletonRows />
                ) : paginatedData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="p-0">
                      {debouncedSearch || statusFilter || typeFilter || countryFilter ? (
                        <EmptyState icon={SearchX} title="Tidak ada hasil pencarian" description={`Tidak ada supplier yang cocok dengan "${debouncedSearch}". Coba kata kunci lain.`} />
                      ) : (
                        <EmptyState
                          icon={Users}
                          title="Belum ada data supplier"
                          description="Klik tombol di kanan atas untuk menambahkan supplier baru."
                          action={{
                            label: 'Tambah Supplier',
                            onClick: () =>
                              openFormTab({
                                title: 'Tambah Supplier',
                                module: 'settings',
                                subPage: 'supplier',
                                formKey: 'supplier-create'
                              })
                          }}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedData.map((row) => (
                    <TableRow key={row.supplierId || row.coaId}>
                      <TableCell className="whitespace-nowrap font-mono font-medium text-xs">{row.kode}</TableCell>
                      <TableCell className="whitespace-nowrap font-medium">{row.isLinked ? row.namaSupplier || row.nama : <span className="text-muted-foreground italic">{row.nama}</span>}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">{row.kodeSupplier || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground text-xs">{row.telepon || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground text-xs">{row.email || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground text-xs">{row.npwp || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.supplierType || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.city || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.country || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.currency || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">{statusBadge(row.status)}</TableCell>
                      <TableCell className="whitespace-nowrap text-center">
                        <div className="inline-flex items-center gap-1">
                          {row.isLinked && row.supplierId ? (
                            <>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailTarget(row)} aria-label={'Detail ' + (row.namaSupplier || row.nama)} title="Detail Supplier"><FileText className="h-4 w-4" /></Button>
                              {/* Edit existing supplier */}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() =>
                                  openFormTab({
                                    title: `Edit ${row.namaSupplier || row.nama}`,
                                    module: 'settings',
                                    subPage: 'supplier',
                                    formKey: 'supplier-edit',
                                    formProps: {
                                      id: row.supplierId,
                                      kode: row.kodeSupplier || '',
                                      nama: row.namaSupplier || row.nama,
                                      alamat: row.alamat || '',
                                      telepon: row.telepon || '',
                                      email: row.email || '',
                                      kontakPerson: row.kontakPerson || '',
                                      npwp: row.npwp || '',
                                      syaratBayarDefault: row.syaratBayarDefault || ''
                                    }
                                  })
                                }
                                aria-label={`Edit ${row.namaSupplier || row.nama}`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              {/* Reactivate (untuk NONAKTIF) atau Delete (untuk AKTIF) */}
                              {row.status === 'NONAKTIF' ? (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:text-emerald-700" onClick={() => handleReactivate(row)} disabled={reactivatingId === row.supplierId} aria-label={`Aktifkan ${row.namaSupplier || row.nama}`} title="Aktifkan kembali">
                                  {reactivatingId === row.supplierId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                                </Button>
                              ) : (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(row)} aria-label={`Hapus ${row.namaSupplier || row.nama}`}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </>
                          ) : (
                            // Link COA to new supplier
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-violet-600 hover:text-violet-700"
                              onClick={() =>
                                openFormTab({
                                  title: `Link Akun: ${row.nama}`,
                                  module: 'settings',
                                  subPage: 'supplier',
                                  formKey: 'supplier-create',
                                  formProps: {
                                    preselectedCoaId: row.coaId,
                                    preselectedCoaKode: row.kode,
                                    preselectedCoaNama: row.nama
                                  }
                                })
                              }
                              aria-label={`Link Akun ${row.nama}`}
                              title="Link ke supplier baru">
                              <Link2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
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

      {/* ── Pagination ── */}
      {!loading && filteredData.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Menampilkan {skip + 1}–{Math.min(skip + PAGE_SIZE, filteredData.length)} dari {filteredData.length} data (Halaman {currentPage} dari {totalPages})
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={!hasPrev} onClick={goToPrev} className="gap-1">
              <ChevronLeft className="h-4 w-4" />
              Sebelumnya
            </Button>
            <Button variant="outline" size="sm" disabled={!hasNext} onClick={goToNext} className="gap-1">
              Selanjutnya
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!detailTarget} onOpenChange={open => { if (!open) setDetailTarget(null); }}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{detailTarget?.namaSupplier || 'Detail Supplier'}</DialogTitle><DialogDescription>{detailTarget?.kodeSupplier} — {detailTarget?.status}</DialogDescription></DialogHeader>
        <dl className="grid grid-cols-2 gap-3 text-sm">{([['Tipe', detailTarget?.supplierType], ['Kota', detailTarget?.city], ['Provinsi', detailTarget?.province], ['Negara', detailTarget?.country], ['Kode Pos', detailTarget?.postalCode], ['Currency', detailTarget?.currency], ['NPWP', detailTarget?.npwp], ['Telepon', detailTarget?.telepon], ['Nama Bank', detailTarget?.bankName], ['No. Rekening', detailTarget?.bankAccountNo], ['Nama Rekening', detailTarget?.bankAccountName]] as const).map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="break-words">{value || '-'}</dd></div>)}</dl>
        {(detailTarget?.bankName || detailTarget?.bankAccountNo || detailTarget?.bankAccountName) && <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">Data bank sensitif. Verifikasi perubahan rekening supplier; persetujuan khusus perubahan rekening belum tersedia.</p>}
      </DialogContent></Dialog>
      {/* ══════ Delete Confirmation Dialog ══════ */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nonaktifkan Supplier</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menonaktifkan supplier <span className="font-semibold text-foreground">"{deleteTarget?.namaSupplier}"</span> ({deleteTarget?.kodeSupplier})? Supplier yang dinonaktifkan tidak akan digunakan dalam transaksi baru namun data historis tetap tersimpan.
              <br />
              <br />
              <span className="text-xs">
                Catatan: Akun Hutang ({deleteTarget?.kode} — {deleteTarget?.nama}) tetap ada di Akun Perkiraan.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2">
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Nonaktifkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
