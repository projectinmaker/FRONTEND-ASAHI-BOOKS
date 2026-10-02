'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useERPStore } from '@/store/erp-store';
import { useTabStore } from '@/store/tab-store';
import { FormTabShell } from '@/components/erp/form-tab-shell';
import { api, PaginatedResponse, ApiError } from '@/lib/api';
import { formatRp, formatDate } from '@/lib/pdf-utils';
import { toast } from 'sonner';
import type { AsetTetapResponse, AsetTetapCreate, AsetTetapUpdate, KategoriAsetResponse, KategoriAsetCreate, KategoriAsetUpdate, COADropdownResponse, MetodePenyusutan, AsetTransaksiCreate, AsetTransaksiResponse, JenisAsetTransaksi, JurnalUmumListResponse, AcquisitionSourceType } from '@/types/api';
import { ACQUISITION_SOURCE_TYPE_OPTIONS } from '@/types/api';
import { Building2, TrendingDown, Plus, Package, Search, Pencil, Info, Loader2, ChevronLeft, ChevronRight, Wrench, Trash2, RotateCcw, Scale, ArrowLeftRight } from 'lucide-react';
import { WorkflowStateBadge, WorkflowActionsCell } from '@/components/erp/workflow-components';
import { useWorkflowStates } from '@/lib/use-workflow-states';
import { getCOAOptions, type COAOption } from '@/lib/master-data';

// ─── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'Semua Status' },
  { value: 'AKTIF', label: 'AKTIF' },
  { value: 'DALAM_PERBAIKAN', label: 'DALAM_PERBAIKAN' },
  { value: 'DIHAPUSKAN', label: 'DIHAPUSKAN' }
];

// ─── Badge helper ───────────────────────────────────────────────────────────

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    AKTIF: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    DIHAPUSKAN: 'bg-red-100 text-red-700 border-red-200',
    DALAM_PERBAIKAN: 'bg-yellow-100 text-yellow-700 border-yellow-200'
  };
  const cls = map[status] || 'bg-gray-100 text-gray-700 border-gray-200';
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
};

// ─── Summary Card ──────────────────────────────────────────────────────────

function SummaryCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground truncate">{label}</p>
          <p className="text-lg font-semibold truncate">{value}</p>
        </div>
      </div>
    </Card>
  );
}

// ─── Skeleton helpers ───────────────────────────────────────────────────────

function SkeletonRows({ cols = 7 }: { cols?: number }) {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-24" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function SummarySkeletons() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-16" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
// ─── Error Card ─────────────────────────────────────────────────────────────

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-destructive">
      <CardContent className="p-4">
        <p className="text-sm text-destructive font-medium">{message}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          Coba Lagi
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Form state ─────────────────────────────────────────────────────────────

interface FormState {
  kode: string;
  nama: string;
  kategoriAsetId: string;
  akunAsetId: string;
  akunAkumulasiId: string;
  akunBebanId: string;
  kuantitas: string;
  nilaiPerolehan: string;
  tanggalMulai: string;
  catatan: string;
  autoPostJurnal: boolean;
  // === Phase 7 — acquisition source (opsional) ===
  acquisitionSourceType: string; // AcquisitionSourceType | '' — '' means not set
  acquisitionSourceId: string; // UUID, optional
  acquisitionDate: string; // ISO date YYYY-MM-DD, optional
}

const emptyForm: FormState = {
  kode: '',
  nama: '',
  kategoriAsetId: '',
  akunAsetId: '',
  akunAkumulasiId: '',
  akunBebanId: '',
  kuantitas: '1',
  nilaiPerolehan: '',
  tanggalMulai: (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })(),
  catatan: '',
  autoPostJurnal: false,
  // === Phase 7 — acquisition source defaults ===
  acquisitionSourceType: '',
  acquisitionSourceId: '',
  acquisitionDate: ''
};

// ─── Kategori Aset Form state (Phase 2 — tambah 5 field baru) ───────────────

interface KategoriAsetFormState {
  kode: string;
  nama: string;
  // === Phase 2 — field baru ===
  akunAsetId: string;
  akunAkumulasiId: string;
  akunBebanId: string;
  defaultUsefulLife: string; // input as string, parse to number on submit
  defaultMethod: string; // MetodePenyusutan | ''
}

const emptyKategoriAsetForm: KategoriAsetFormState = {
  kode: '',
  nama: '',
  akunAsetId: '',
  akunAkumulasiId: '',
  akunBebanId: '',
  defaultUsefulLife: '',
  defaultMethod: ''
};

// ─── Props interface ─────────────────────────────────────────────────────────

interface FixedAssetsProps {
  subPage?: string;
  refreshKey?: number;
  formMode?: string;
  formProps?: Record<string, unknown>;
}

// ════════════════════════════════════════════════════════════════════════════
// Kategori Aset Form (rendered in tab)
// ════════════════════════════════════════════════════════════════════════════

function KategoriAsetForm({ mode, editId, initialKode, initialNama }: { mode: 'create' | 'edit'; editId?: string; initialKode?: string; initialNama?: string }) {
  const [form, setForm] = useState<KategoriAsetFormState>({
    ...emptyKategoriAsetForm,
    kode: initialKode || '',
    nama: initialNama || ''
  });
  const [submitting, setSubmitting] = useState(false);

  // === Phase 2 — COA options (3 system account types) ===
  const [coaAsetOptions, setCoaAsetOptions] = useState<COAOption[]>([]);
  const [coaAkumulasiOptions, setCoaAkumulasiOptions] = useState<COAOption[]>([]);
  const [coaBebanOptions, setCoaBebanOptions] = useState<COAOption[]>([]);

  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const title = mode === 'create' ? 'Tambah Kategori Aset' : 'Edit Kategori Aset';

  const updateForm = (key: keyof KategoriAsetFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // Fetch COA options on mount:
  // - Akun Aset (FIXED_ASSET system type)
  // - Akun Akumulasi Penyusutan (ACCUM_DEPR)
  // - Akun Beban Penyusutan (DEPRECIATION_EXPENSE)
  useEffect(() => {
    getCOAOptions({ systemAccountType: 'FIXED_ASSET', tingkat: 'DETAIL', activeOnly: true })
      .then(setCoaAsetOptions)
      .catch(() => setCoaAsetOptions([]));
    getCOAOptions({ systemAccountType: 'ACCUM_DEPR', tingkat: 'DETAIL', activeOnly: true })
      .then(setCoaAkumulasiOptions)
      .catch(() => setCoaAkumulasiOptions([]));
    // Filter diperluas (fix relasi COA): DEPRECIATION_EXPENSE *atau* akun
    // BEBAN/HPP yang namanya mengandung "penyusutan" — di COA lama sys-type
    // DEPRECIATION_EXPENSE belum di-assign ke akun mana pun sehingga dropdown
    // kosong dan form kategori aset tidak bisa disimpan (akunBebanId wajib).
    getCOAOptions({ systemAccountType: 'DEPRECIATION_EXPENSE', orNamaInclude: 'penyusutan', orHeaders: ['BEBAN', 'HPP'], tingkat: 'DETAIL', activeOnly: true })
      .then(setCoaBebanOptions)
      .catch(() => setCoaBebanOptions([]));
  }, []);

  // Edit mode: fetch existing KategoriAset & pre-fill (authoritative source)
  useEffect(() => {
    if (mode !== 'edit' || !editId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<KategoriAsetResponse>(`/master/kategori-aset/${editId}`);
        if (cancelled) return;
        setForm((prev) => ({
          ...prev,
          kode: res.kode,
          nama: res.nama,
          akunAsetId: res.akunAsetId || '',
          akunAkumulasiId: res.akunAkumulasiId || '',
          akunBebanId: res.akunBebanId || '',
          defaultUsefulLife: res.defaultUsefulLife != null ? String(res.defaultUsefulLife) : '',
          defaultMethod: res.defaultMethod || ''
        }));
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) toast.error(err.detail);
        else toast.error('Gagal memuat data kategori aset');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, editId]);

  const handleSubmit = async () => {
    if (!form.kode.trim()) {
      toast.error('Kode kategori wajib diisi');
      return;
    }
    if (!form.nama.trim()) {
      toast.error('Nama kategori wajib diisi');
      return;
    }
    setSubmitting(true);
    try {
      const usefulLifeNum = form.defaultUsefulLife.trim() ? Number(form.defaultUsefulLife) : null;
      if (mode === 'create') {
        const payload: KategoriAsetCreate = {
          kode: form.kode.trim(),
          nama: form.nama.trim(),
          akunAsetId: form.akunAsetId || null,
          akunAkumulasiId: form.akunAkumulasiId || null,
          akunBebanId: form.akunBebanId || null,
          defaultUsefulLife: usefulLifeNum,
          ...(form.defaultMethod ? { defaultMethod: form.defaultMethod as MetodePenyusutan } : {})
        };
        await api.post<KategoriAsetResponse>('/master/kategori-aset', payload);
        toast.success('Kategori aset berhasil ditambahkan');
      } else {
        if (!editId) return;
        const payload: KategoriAsetUpdate = {
          nama: form.nama.trim(),
          akunAsetId: form.akunAsetId || null,
          akunAkumulasiId: form.akunAkumulasiId || null,
          akunBebanId: form.akunBebanId || null,
          defaultUsefulLife: usefulLifeNum,
          defaultMethod: (form.defaultMethod || undefined) as KategoriAsetUpdate['defaultMethod']
        };
        await api.put<KategoriAsetResponse>(`/master/kategori-aset/${editId}`, payload);
        toast.success('Kategori aset berhasil diperbarui');
      }
      refreshListTab('fixed-assets', 'kategori-aset');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : mode === 'create' ? 'Gagal menambahkan kategori' : 'Gagal memperbarui kategori';
      if (msg.includes('tidak boleh diubah') || msg.includes('sudah dipakai transaksi')) {
        toast.error(msg, {
          description: 'Nonaktifkan master ini (status=NONAKTIF) lalu buat master baru.',
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
      <Card className="max-w-3xl">
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">{mode === 'create' ? 'Isi kode dan nama kategori aset baru.' : `Mengedit: ${form.kode}`}</p>
          <div className="space-y-2">
            <Label htmlFor="kat-kode">Kode Kategori</Label>
            <Input id="kat-kode" placeholder="Contoh: TANAH, KENDARAAN" value={form.kode} onChange={(e) => updateForm('kode', e.target.value)} disabled={mode === 'edit'} autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kat-nama">Nama Kategori</Label>
            <Input id="kat-nama" placeholder="Nama kategori" value={form.nama} onChange={(e) => updateForm('nama', e.target.value)} />
          </div>

          {/* === Phase 2 — Akun COA mapping (3 columns) === */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Akun Aset (Cost)</Label>
              <Select value={form.akunAsetId} onValueChange={(v) => updateForm('akunAsetId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih akun aset" />
                </SelectTrigger>
                <SelectContent>
                  {coaAsetOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Akun Akumulasi Penyusutan</Label>
              <Select value={form.akunAkumulasiId} onValueChange={(v) => updateForm('akunAkumulasiId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih akun akumulasi" />
                </SelectTrigger>
                <SelectContent>
                  {coaAkumulasiOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Akun Beban Penyusutan</Label>
              <Select value={form.akunBebanId} onValueChange={(v) => updateForm('akunBebanId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih akun beban" />
                </SelectTrigger>
                <SelectContent>
                  {coaBebanOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* === Phase 2 — Default umur ekonomi & metode (2 columns) === */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="ka-useful-life">Default Umur Ekonomi (bulan)</Label>
              <Input id="ka-useful-life" type="number" min="1" placeholder="60 (5 tahun)" value={form.defaultUsefulLife} onChange={(e) => updateForm('defaultUsefulLife', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Default Metode Penyusutan</Label>
              <Select value={form.defaultMethod} onValueChange={(v) => updateForm('defaultMethod', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih metode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GARIS_LURUS">Garis Lurus</SelectItem>
                  <SelectItem value="SALDO_MENURUN">Saldo Menurun</SelectItem>
                </SelectContent>
              </Select>
            </div>
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

// ════════════════════════════════════════════════════════════════════════════
// Daftar Aset Create Form (rendered in tab)
// ════════════════════════════════════════════════════════════════════════════

function DaftarAsetCreateForm() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [kategoriOptions, setKategoriOptions] = useState<KategoriAsetResponse[]>([]);
  const [coaOptions, setCoaOptions] = useState<COADropdownResponse[]>([]);
  const [loadingDropdowns, setLoadingDropdowns] = useState(true);

  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const updateForm = (key: keyof FormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    (async () => {
      setLoadingDropdowns(true);
      try {
        const [kategoriRes, coaRes] = await Promise.all([api.get<KategoriAsetResponse[]>('/master/kategori-aset'), api.get<COADropdownResponse[]>('/master/coa-dropdown')]);
        setKategoriOptions(kategoriRes);
        setCoaOptions(coaRes);
      } catch {
        toast.error('Gagal memuat data referensi');
      } finally {
        setLoadingDropdowns(false);
      }
    })();
  }, []);

  const handleSubmit = async () => {
    if (!form.kode.trim()) {
      toast.error('Kode aset wajib diisi');
      return;
    }
    if (!form.nama.trim()) {
      toast.error('Nama aset wajib diisi');
      return;
    }
    if (!form.kategoriAsetId) {
      toast.error('Kategori aset wajib dipilih');
      return;
    }
    if (!form.akunAsetId) {
      toast.error('Akun aset wajib dipilih');
      return;
    }
    if (!form.akunAkumulasiId) {
      toast.error('Akun akumulasi penyusutan wajib dipilih');
      return;
    }
    if (!form.akunBebanId) {
      toast.error('Akun beban penyusutan wajib dipilih');
      return;
    }
    if (!form.tanggalMulai) {
      toast.error('Tanggal mulai wajib diisi');
      return;
    }

    setSubmitting(true);
    try {
      const payload: AsetTetapCreate = {
        kode: form.kode.trim(),
        nama: form.nama.trim(),
        kategoriAsetId: form.kategoriAsetId,
        akunAsetId: form.akunAsetId,
        akunAkumulasiId: form.akunAkumulasiId,
        akunBebanId: form.akunBebanId,
        kuantitas: parseFloat(form.kuantitas) || 1,
        nilaiPerolehan: parseFloat(form.nilaiPerolehan) || undefined,
        tanggalMulai: form.tanggalMulai,
        catatan: form.catatan.trim() || undefined,
        autoPostJurnal: form.autoPostJurnal,
        // === Phase 7 — acquisition source (opsional) ===
        acquisitionSourceType: (form.acquisitionSourceType || undefined) as AcquisitionSourceType | undefined,
        acquisitionSourceId: form.acquisitionSourceId || undefined,
        acquisitionDate: form.acquisitionDate || undefined
      };
      await api.post<AsetTetapResponse>('/aset-tetap', payload);
      toast.success('Aset tetap berhasil ditambahkan');
      refreshListTab('fixed-assets', 'daftar-aset');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal membuat aset tetap';
      // Phase 7 — handle "kategori belum mapping akun" error with actionable description
      if (msg.includes('belum punya mapping akun lengkap')) {
        toast.error('Kategori Aset belum lengkap', {
          description: 'Lengkapi mapping akun (akun_aset, akun_akumulasi, akun_beban) di Kategori Aset terlebih dahulu, lalu buat aset tetap lagi.',
          duration: 8000
        });
      } else if (msg.includes('acquisition_source_id') || msg.includes('memerlukan acquisition_source_id')) {
        toast.error('Sumber akuisisi tidak lengkap', {
          description: 'Kalau pilih MANUAL_JOURNAL atau PURCHASE_INVOICE, acquisition_source_id wajib diisi.',
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
    <FormTabShell title="Tambah Aset Baru">
      <Card className="max-w-2xl">
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">Isi data di bawah untuk menambahkan aset tetap baru.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Kode */}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="aset-kode">Kode Aset</Label>
              <Input id="aset-kode" placeholder="Contoh: AST-001" value={form.kode} onChange={(e) => updateForm('kode', e.target.value)} autoFocus />
            </div>

            {/* Nama */}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="aset-nama">Nama Aset</Label>
              <Input id="aset-nama" placeholder="Nama asset" value={form.nama} onChange={(e) => updateForm('nama', e.target.value)} />
            </div>

            {/* Kategori Aset */}
            <div className="space-y-2">
              <Label>Kategori Aset</Label>
              <SearchableDropdown
                value={form.kategoriAsetId}
                onValueChange={(v) => updateForm('kategoriAsetId', v)}
                options={kategoriOptions.map((k) => ({
                  id: k.id,
                  label: k.kode + ' — ' + k.nama
                }))}
                placeholder="Pilih kategori"
                loading={loadingDropdowns}
              />
            </div>

            {/* Akun Aset */}
            <div className="space-y-2">
              <Label>Akun Aset</Label>
              <SearchableDropdown
                value={form.akunAsetId}
                onValueChange={(v) => updateForm('akunAsetId', v)}
                options={coaOptions.map((c) => ({
                  id: c.id,
                  label: c.kode + ' — ' + c.nama
                }))}
                placeholder="Pilih akun aset"
                loading={loadingDropdowns}
              />
            </div>

            {/* Akun Akumulasi Penyusutan */}
            <div className="space-y-2">
              <Label>Akun Akumulasi Penyusutan</Label>
              <SearchableDropdown
                value={form.akunAkumulasiId}
                onValueChange={(v) => updateForm('akunAkumulasiId', v)}
                options={coaOptions.map((c) => ({
                  id: c.id,
                  label: c.kode + ' — ' + c.nama
                }))}
                placeholder="Pilih akun akumulasi"
                loading={loadingDropdowns}
              />
            </div>

            {/* Akun Beban Penyusutan */}
            <div className="space-y-2">
              <Label>Akun Biaya Penyusutan</Label>
              <SearchableDropdown
                value={form.akunBebanId}
                onValueChange={(v) => updateForm('akunBebanId', v)}
                options={coaOptions.map((c) => ({
                  id: c.id,
                  label: c.kode + ' — ' + c.nama
                }))}
                placeholder="Pilih akun beban"
                loading={loadingDropdowns}
              />
            </div>

            {/* Kuantitas */}
            <div className="space-y-2">
              <Label htmlFor="aset-qty">Kuantitas</Label>
              <Input id="aset-qty" type="number" placeholder="1" value={form.kuantitas} onChange={(e) => updateForm('kuantitas', e.target.value)} />
            </div>

            {/* Nilai Perolehan */}
            <div className="space-y-2">
              <Label htmlFor="aset-perolehan">Nilai Perolehan</Label>
              <CurrencyInput id="aset-perolehan" allowDecimal placeholder="0" value={form.nilaiPerolehan} onValueChange={(v) => updateForm('nilaiPerolehan', v)} />
            </div>

            {/* Tanggal Mulai */}
            <div className="space-y-2">
              <Label htmlFor="aset-tanggal">Tanggal Mulai</Label>
              <Input id="aset-tanggal" type="date" value={form.tanggalMulai} onChange={(e) => updateForm('tanggalMulai', e.target.value)} />
            </div>

            {/* Catatan */}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="aset-catatan">Catatan</Label>
              <Textarea id="aset-catatan" placeholder="Catatan tambahan (opsional)" rows={3} value={form.catatan} onChange={(e) => updateForm('catatan', e.target.value)} />
            </div>

            {/* === Phase 7 — Acquisition Source (opsional) === */}
            <div className="space-y-2 sm:col-span-2 border-t pt-4 mt-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Audit Trail — Sumber Akuisisi (opsional)</p>
            </div>

            {/* Acquisition Source Type */}
            <div className="space-y-2">
              <Label>Sumber Akuisisi (opsional)</Label>
              <Select value={form.acquisitionSourceType} onValueChange={(v) => updateForm('acquisitionSourceType', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih sumber akuisisi" />
                </SelectTrigger>
                <SelectContent>
                  {ACQUISITION_SOURCE_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Untuk audit trail. Kosongkan kalau tidak yakin (default: DIRECT).</p>
            </div>

            {/* Acquisition Date */}
            <div className="space-y-2">
              <Label>Tanggal Akuisisi (opsional)</Label>
              <Input type="date" value={form.acquisitionDate} onChange={(e) => updateForm('acquisitionDate', e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Tanggal asli aset diakuisisi (untuk audit trail).</p>
            </div>

            {/* Acquisition Source ID — only show if source_type is MANUAL_JOURNAL or PURCHASE_INVOICE */}
            {(form.acquisitionSourceType === 'MANUAL_JOURNAL' || form.acquisitionSourceType === 'PURCHASE_INVOICE') && (
              <div className="space-y-2 sm:col-span-2">
                <Label>
                  {form.acquisitionSourceType === 'MANUAL_JOURNAL' ? 'ID Jurnal Manual' : 'ID Purchase Invoice'} <span className="text-destructive">*</span>
                </Label>
                <Input placeholder={form.acquisitionSourceType === 'MANUAL_JOURNAL' ? 'UUID jurnal manual POSTED' : 'UUID purchase invoice'} value={form.acquisitionSourceId} onChange={(e) => updateForm('acquisitionSourceId', e.target.value)} />
                <p className="text-[11px] text-muted-foreground">Masukkan UUID dokumen sumber. Backend akan auto-fill acquisition_source_no saat create.</p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting}>
              Batal
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan Aset
            </Button>
          </div>
        </CardContent>
      </Card>
    </FormTabShell>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Daftar Aset Edit Form (rendered in tab)
// ════════════════════════════════════════════════════════════════════════════

function DaftarAsetEditForm({ editId }: { editId: string }) {
  // Form fields
  const [editKode, setEditKode] = useState('');
  const [editNama, setEditNama] = useState('');
  const [editKategoriAsetId, setEditKategoriAsetId] = useState('');
  const [editAkunAsetId, setEditAkunAsetId] = useState('');
  const [editAkunAkumulasiId, setEditAkunAkumulasiId] = useState('');
  const [editAkunBebanId, setEditAkunBebanId] = useState('');
  const [editKuantitas, setEditKuantitas] = useState('');
  const [editNilaiPerolehan, setEditNilaiPerolehan] = useState('');
  const [editTanggalMulai, setEditTanggalMulai] = useState('');
  const [editCatatan, setEditCatatan] = useState('');
  const [editAutoPostJurnal, setEditAutoPostJurnal] = useState(false);
  // === Phase 7 — acquisition source (opsional) ===
  const [editAcquisitionSourceType, setEditAcquisitionSourceType] = useState('');
  const [editAcquisitionSourceId, setEditAcquisitionSourceId] = useState('');
  const [editAcquisitionDate, setEditAcquisitionDate] = useState('');
  // Read-only — auto-set by backend
  const [editAcquisitionSourceNo, setEditAcquisitionSourceNo] = useState('');

  // Read-only info from server
  const [editStatus, setEditStatus] = useState('');

  const [editLoading, setEditLoading] = useState(true);
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Dropdowns
  const [kategoriOptions, setKategoriOptions] = useState<KategoriAsetResponse[]>([]);
  const [coaOptions, setCoaOptions] = useState<COADropdownResponse[]>([]);
  const [loadingDropdowns, setLoadingDropdowns] = useState(true);

  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  // Fetch asset data and dropdowns
  useEffect(() => {
    (async () => {
      setEditLoading(true);
      setLoadingDropdowns(true);
      try {
        const [res, kategoriRes, coaRes] = await Promise.all([api.get<AsetTetapResponse>(`/aset-tetap/${editId}`), api.get<KategoriAsetResponse[]>('/master/kategori-aset'), api.get<COADropdownResponse[]>('/master/coa-dropdown')]);
        setEditKode(res.kode);
        setEditNama(res.nama);
        setEditKategoriAsetId(res.kategoriAsetId || '');
        setEditAkunAsetId(res.akunAsetId || '');
        setEditAkunAkumulasiId(res.akunAkumulasiId || '');
        setEditAkunBebanId(res.akunBebanId || '');
        setEditKuantitas(String(res.kuantitas ?? ''));
        setEditNilaiPerolehan(String(res.nilaiPerolehan ?? ''));
        setEditTanggalMulai(res.tanggalMulai ? res.tanggalMulai.split('T')[0] : '');
        setEditCatatan(res.catatan || '');
        setEditAutoPostJurnal(res.autoPostJurnal);
        // === Phase 7 — acquisition source pre-fill ===
        setEditAcquisitionSourceType(res.acquisitionSourceType || '');
        setEditAcquisitionSourceId(res.acquisitionSourceId || '');
        setEditAcquisitionDate(res.acquisitionDate ? String(res.acquisitionDate).split('T')[0] : '');
        setEditAcquisitionSourceNo(res.acquisitionSourceNo || '');
        setEditStatus(res.status);
        setKategoriOptions(kategoriRes);
        setCoaOptions(coaRes);
      } catch (err) {
        if (err instanceof ApiError) toast.error(err.detail);
        else toast.error('Gagal memuat data aset');
      } finally {
        setEditLoading(false);
        setLoadingDropdowns(false);
      }
    })();
  }, [editId]);

  const handleSubmit = async () => {
    if (!editKode.trim()) {
      toast.error('Kode aset wajib diisi');
      return;
    }
    if (!editNama.trim()) {
      toast.error('Nama aset wajib diisi');
      return;
    }
    if (!editKategoriAsetId) {
      toast.error('Kategori aset wajib dipilih');
      return;
    }
    if (!editAkunAsetId) {
      toast.error('Akun aset wajib dipilih');
      return;
    }
    if (!editTanggalMulai) {
      toast.error('Tanggal mulai wajib diisi');
      return;
    }

    setEditSubmitting(true);
    try {
      const payload: AsetTetapUpdate = {
        kode: editKode.trim(),
        nama: editNama.trim(),
        kategoriAsetId: editKategoriAsetId,
        akunAsetId: editAkunAsetId,
        akunAkumulasiId: editAkunAkumulasiId || undefined,
        akunBebanId: editAkunBebanId || undefined,
        kuantitas: parseFloat(editKuantitas) || undefined,
        nilaiPerolehan: parseFloat(editNilaiPerolehan) || undefined,
        tanggalMulai: editTanggalMulai,
        catatan: editCatatan.trim() || null,
        autoPostJurnal: editAutoPostJurnal,
        // === Phase 7 — acquisition source (opsional) ===
        acquisitionSourceType: (editAcquisitionSourceType || undefined) as AcquisitionSourceType | undefined,
        acquisitionSourceId: editAcquisitionSourceId || undefined,
        acquisitionDate: editAcquisitionDate || undefined
      };
      await api.put<AsetTetapResponse>(`/aset-tetap/${editId}`, payload);
      toast.success('Aset tetap berhasil diperbarui');
      refreshListTab('fixed-assets', 'daftar-aset');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal memperbarui aset tetap';
      // Phase 7 — handle "kategori belum mapping akun" error with actionable description
      if (msg.includes('belum punya mapping akun lengkap')) {
        toast.error('Kategori Aset belum lengkap', {
          description: 'Lengkapi mapping akun (akun_aset, akun_akumulasi, akun_beban) di Kategori Aset terlebih dahulu, lalu edit aset tetap lagi.',
          duration: 8000
        });
      } else if (msg.includes('acquisition_source_id') || msg.includes('memerlukan acquisition_source_id')) {
        toast.error('Sumber akuisisi tidak lengkap', {
          description: 'Kalau pilih MANUAL_JOURNAL atau PURCHASE_INVOICE, acquisition_source_id wajib diisi.',
          duration: 6000
        });
      } else {
        toast.error(msg);
      }
    } finally {
      setEditSubmitting(false);
    }
  };

  return (
    <FormTabShell title="Edit Aset Tetap">
      {editLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card className="max-w-2xl">
          <CardContent className="p-6 space-y-4">
            {/* Read-only info bar */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-muted/50 px-4 py-2.5 text-sm">
              <div className="flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">{editKode}</span>
              </div>
              <span className="text-muted-foreground">Status:</span>
              <span className="font-medium">{editStatus}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Kode */}
              <div className="space-y-2">
                <Label htmlFor="edit-kode">Kode Aset</Label>
                <Input id="edit-kode" placeholder="Contoh: AST-001" value={editKode} onChange={(e) => setEditKode(e.target.value)} />
              </div>

              {/* Nama */}
              <div className="space-y-2">
                <Label htmlFor="edit-nama">Nama Aset</Label>
                <Input id="edit-nama" placeholder="Nama asset" value={editNama} onChange={(e) => setEditNama(e.target.value)} />
              </div>

              {/* Kategori Aset */}
              <div className="space-y-2">
                <Label>Kategori Aset</Label>
                <SearchableDropdown
                  value={editKategoriAsetId}
                  onValueChange={setEditKategoriAsetId}
                  options={kategoriOptions.map((k) => ({
                    id: k.id,
                    label: k.kode + ' — ' + k.nama
                  }))}
                  placeholder="Pilih kategori"
                  loading={loadingDropdowns}
                />
              </div>

              {/* Akun Aset */}
              <div className="space-y-2">
                <Label>Akun Aset</Label>
                <SearchableDropdown
                  value={editAkunAsetId}
                  onValueChange={setEditAkunAsetId}
                  options={coaOptions.map((c) => ({
                    id: c.id,
                    label: c.kode + ' — ' + c.nama
                  }))}
                  placeholder="Pilih akun aset"
                  loading={loadingDropdowns}
                />
              </div>

              <div className="space-y-2">
                <Label>Akun Akumulasi Penyusutan</Label>
                <SearchableDropdown
                  value={editAkunAkumulasiId}
                  onValueChange={setEditAkunAkumulasiId}
                  options={coaOptions.map((c) => ({
                    id: c.id,
                    label: c.kode + ' — ' + c.nama
                  }))}
                  placeholder="Pilih akun akumulasi"
                  loading={loadingDropdowns}
                />
              </div>

              <div className="space-y-2">
                <Label>Akun Biaya Penyusutan</Label>
                <SearchableDropdown
                  value={editAkunBebanId}
                  onValueChange={setEditAkunBebanId}
                  options={coaOptions.map((c) => ({
                    id: c.id,
                    label: c.kode + ' — ' + c.nama
                  }))}
                  placeholder="Pilih akun beban"
                  loading={loadingDropdowns}
                />
              </div>

              {/* Kuantitas */}
              <div className="space-y-2">
                <Label htmlFor="edit-qty">Kuantitas</Label>
                <Input id="edit-qty" type="number" placeholder="1" value={editKuantitas} onChange={(e) => setEditKuantitas(e.target.value)} />
              </div>

              {/* Nilai Perolehan */}
              <div className="space-y-2">
                <Label htmlFor="edit-perolehan">Nilai Perolehan</Label>
                <CurrencyInput id="edit-perolehan" allowDecimal placeholder="0" value={editNilaiPerolehan} onValueChange={(v) => setEditNilaiPerolehan(v)} />
              </div>

              {/* Tanggal Mulai */}
              <div className="space-y-2">
                <Label htmlFor="edit-tanggal">Tanggal Mulai</Label>
                <Input id="edit-tanggal" type="date" value={editTanggalMulai} onChange={(e) => setEditTanggalMulai(e.target.value)} />
              </div>

              {/* Catatan */}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-catatan">Catatan</Label>
                <Textarea id="edit-catatan" placeholder="Catatan tambahan (opsional)" rows={3} value={editCatatan} onChange={(e) => setEditCatatan(e.target.value)} />
              </div>

              {/* === Phase 7 — Acquisition Source (opsional) === */}
              <div className="space-y-2 sm:col-span-2 border-t pt-4 mt-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Audit Trail — Sumber Akuisisi (opsional)</p>
              </div>

              {/* Acquisition Source Type */}
              <div className="space-y-2">
                <Label>Sumber Akuisisi (opsional)</Label>
                <Select value={editAcquisitionSourceType} onValueChange={setEditAcquisitionSourceType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih sumber akuisisi" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACQUISITION_SOURCE_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Untuk audit trail. Kosongkan kalau tidak yakin (default: DIRECT).</p>
              </div>

              {/* Acquisition Date */}
              <div className="space-y-2">
                <Label>Tanggal Akuisisi (opsional)</Label>
                <Input type="date" value={editAcquisitionDate} onChange={(e) => setEditAcquisitionDate(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">Tanggal asli aset diakuisisi (untuk audit trail).</p>
              </div>

              {/* Acquisition Source ID — only show if source_type is MANUAL_JOURNAL or PURCHASE_INVOICE */}
              {(editAcquisitionSourceType === 'MANUAL_JOURNAL' || editAcquisitionSourceType === 'PURCHASE_INVOICE') && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>
                    {editAcquisitionSourceType === 'MANUAL_JOURNAL' ? 'ID Jurnal Manual' : 'ID Purchase Invoice'} <span className="text-destructive">*</span>
                  </Label>
                  <Input placeholder={editAcquisitionSourceType === 'MANUAL_JOURNAL' ? 'UUID jurnal manual POSTED' : 'UUID purchase invoice'} value={editAcquisitionSourceId} onChange={(e) => setEditAcquisitionSourceId(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground">Masukkan UUID dokumen sumber. Backend akan auto-update acquisition_source_no.</p>
                </div>
              )}

              {/* Nomor Dokumen Sumber — read-only display (auto-set by backend) */}
              {editAcquisitionSourceType && editAcquisitionSourceNo && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Nomor Dokumen Sumber (auto)</Label>
                  <Input value={editAcquisitionSourceNo} readOnly disabled />
                  <p className="text-[11px] text-muted-foreground">Auto-set oleh backend. Read-only.</p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => activeTabId && closeTab(activeTabId)} disabled={editSubmitting}>
                Batal
              </Button>
              <Button onClick={handleSubmit} disabled={editSubmitting} className="gap-2">
                {editSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Perbarui Aset
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </FormTabShell>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Penyusutan Aset List (Depreciation Schedule, read-only)
// ════════════════════════════════════════════════════════════════════════════

const METODE_PENYUSUTAN_LABEL: Record<MetodePenyusutan, string> = {
  GARIS_LURUS: 'Garis Lurus',
  SALDO_MENURUN: 'Saldo Menurun',
  JUMLAH_ANGKA: 'Jumlah Angka'
};

const METODE_PENYUSUTAN_BADGE: Record<MetodePenyusutan, string> = {
  GARIS_LURUS: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  SALDO_MENURUN: 'bg-amber-100 text-amber-700 border-amber-200',
  JUMLAH_ANGKA: 'bg-violet-100 text-violet-700 border-violet-200'
};

function metodePenyusutanBadge(metode?: MetodePenyusutan) {
  if (!metode) return <span className="text-muted-foreground">—</span>;
  const cls = METODE_PENYUSUTAN_BADGE[metode] || 'bg-gray-100 text-gray-700 border-gray-200';
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{METODE_PENYUSUTAN_LABEL[metode] || metode}</span>;
}

function PenyusutanAsetList({ kategoriOptions, loadingDropdowns, refreshKey }: { kategoriOptions: KategoriAsetResponse[]; loadingDropdowns: boolean; refreshKey?: number }) {
  const [data, setData] = useState<AsetTetapResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [kategoriFilter, setKategoriFilter] = useState<string>('');
  const [skip, setSkip] = useState(0);

  const PAGE_LIMIT = 100;

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
  }, [debouncedSearch, statusFilter, kategoriFilter]);

  const fetchPenyusutan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('skip', String(skip));
      params.set('limit', String(PAGE_LIMIT));
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter && statusFilter !== 'ALL') params.set('status', statusFilter);
      if (kategoriFilter) params.set('kategori_aset_id', kategoriFilter);

      const res = await api.get<PaginatedResponse<AsetTetapResponse>>(`/aset-tetap?${params.toString()}`);
      setData(res.data);
      setTotal(res.total);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Gagal memuat data penyusutan aset tetap');
      }
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, kategoriFilter, skip]);

  useEffect(() => {
    fetchPenyusutan();
  }, [fetchPenyusutan, refreshKey]);

  // Summary cards
  const totalNilaiPerolehan = data.reduce((s, a) => s + Number(a.nilaiPerolehan || 0), 0);
  const totalAkumulasiPenyusutan = data.reduce((s, a) => s + Number(a.akumulasiPenyusutan || 0), 0);
  const totalNilaiBuku = data.reduce((s, a) => s + Number(a.nilaiBuku || 0), 0);

  // Pagination helpers
  const currentPage = Math.floor(skip / PAGE_LIMIT) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));
  const hasNext = skip + PAGE_LIMIT < total;
  const hasPrev = skip > 0;

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Jadwal Penyusutan Aset Tetap</h2>
      </div>

      {/* Search & Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 max-w-sm">
              <Label className="text-xs text-muted-foreground">Cari Kode / Nama</Label>
              <div className="relative mt-1.5">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Cari aset..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
              </div>
            </div>
            <div className="w-full sm:w-48">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Semua Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value || 'all'} value={opt.value || 'all'}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-48">
              <Label className="text-xs text-muted-foreground">Kategori</Label>
              <SearchableDropdown
                value={kategoriFilter || ''}
                onValueChange={setKategoriFilter}
                options={kategoriOptions.map((k) => ({
                  id: k.id,
                  label: k.kode + ' — ' + k.nama
                }))}
                placeholder="Semua Kategori"
                allOption={{ id: '', label: 'Semua Kategori' }}
                className="mt-1.5"
                loading={loadingDropdowns}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && !loading && <ErrorCard message={error} onRetry={fetchPenyusutan} />}

      {/* Summary Cards */}
      {loading ? (
        <SummarySkeletons />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SummaryCard icon={Package} label="Total Nilai Perolehan" value={formatRp(totalNilaiPerolehan)} />
          <SummaryCard icon={TrendingDown} label="Total Akumulasi Penyusutan" value={formatRp(totalAkumulasiPenyusutan)} />
          <SummaryCard icon={Scale} label="Total Nilai Buku" value={formatRp(totalNilaiBuku)} />
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto" style={{ maxHeight: '500px', overflowY: 'auto' }}>
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="whitespace-nowrap">Kode</TableHead>
                  <TableHead className="whitespace-nowrap">Nama</TableHead>
                  <TableHead className="whitespace-nowrap">Kategori</TableHead>
                  <TableHead className="whitespace-nowrap">Tgl Mulai</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Nilai Perolehan</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Umur (thn)</TableHead>
                  <TableHead className="whitespace-nowrap">Metode</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Penyusutan/Bulan</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Akumulasi</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Nilai Buku</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Nilai Sisa</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <SkeletonRows cols={12} />
                ) : data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-12 text-muted-foreground">
                      {debouncedSearch ? 'Tidak ada aset yang sesuai dengan pencarian.' : 'Belum ada data aset tetap.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap font-mono font-medium">{r.kode}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.nama}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.kategoriAset?.nama || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.tanggalMulai ? formatDate(r.tanggalMulai) : '-'}</TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono">{formatRp(Number(r.nilaiPerolehan || 0))}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{r.umurAset != null ? r.umurAset : '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">{metodePenyusutanBadge(r.metodePenyusutan)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono">{r.penyusutanPerBulan != null ? formatRp(Number(r.penyusutanPerBulan)) : '-'}</TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono">{r.akumulasiPenyusutan != null ? formatRp(Number(r.akumulasiPenyusutan)) : '-'}</TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono">{r.nilaiBuku != null ? formatRp(Number(r.nilaiBuku)) : '-'}</TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono">{r.nilaiSisa != null ? formatRp(Number(r.nilaiSisa)) : '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">{statusBadge(r.status)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {!loading && total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Menampilkan {skip + 1}–{Math.min(skip + PAGE_LIMIT, total)} dari {total} aset (Halaman {currentPage} dari {totalPages})
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={!hasPrev} onClick={() => setSkip((s) => s - PAGE_LIMIT)} className="gap-1">
              <ChevronLeft className="h-4 w-4" />
              Sebelumnya
            </Button>
            <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => setSkip((s) => s + PAGE_LIMIT)} className="gap-1">
              Selanjutnya
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Main Component
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// Wrapper: routes formMode to form components, delegates list to inner
// ════════════════════════════════════════════════════════════════════════════

export default function FixedAssetsModule({ subPage: propsSubPage, refreshKey, formMode, formProps }: FixedAssetsProps) {
  // ── Form mode routing (before any hooks) ──
  if (formMode === 'kategori-aset-create' || formMode === 'kategori-aset-edit') {
    const isEdit = formProps?.id as string | undefined;
    return <KategoriAsetForm mode={isEdit ? 'edit' : 'create'} editId={isEdit} initialKode={formProps?.kode as string | undefined} initialNama={formProps?.nama as string | undefined} />;
  }
  if (formMode === 'daftar-aset-create') {
    return <DaftarAsetCreateForm />;
  }
  if (formMode === 'daftar-aset-edit') {
    const editId = formProps?.id as string;
    if (!editId) return null;
    return <DaftarAsetEditForm editId={editId} />;
  }
  if (formMode === 'transaksi-aset-create') {
    return <TransaksiAsetCreateForm />;
  }

  return <FixedAssetsList subPage={propsSubPage} refreshKey={refreshKey} />;
}

// ════════════════════════════════════════════════════════════════════════════
// List Component (all hooks live here)
// ════════════════════════════════════════════════════════════════════════════

function FixedAssetsList({ subPage: propsSubPage, refreshKey }: { subPage?: string; refreshKey?: number }) {
  const { activeSubPage } = useERPStore();
  const subPage = propsSubPage || activeSubPage || 'daftar-aset';
  const openFormTab = useTabStore((s) => s.openFormTab);

  // ══════ Shared state: dropdowns (for list filter) ══════
  const [kategoriOptions, setKategoriOptions] = useState<KategoriAsetResponse[]>([]);
  const [loadingDropdowns, setLoadingDropdowns] = useState(true);
  const [dropdownError, setDropdownError] = useState<string | null>(null);

  const fetchDropdowns = useCallback(async () => {
    setLoadingDropdowns(true);
    setDropdownError(null);
    try {
      const kategoriRes = await api.get<KategoriAsetResponse[]>('/master/kategori-aset');
      setKategoriOptions(kategoriRes);
    } catch (err) {
      if (err instanceof ApiError) {
        setDropdownError(err.detail);
      } else {
        setDropdownError('Gagal memuat data referensi');
      }
    } finally {
      setLoadingDropdowns(false);
    }
  }, []);

  useEffect(() => {
    fetchDropdowns();
  }, [fetchDropdowns]);

  // ══════ Kategori Aset Tab ══════
  const [kategoriData, setKategoriData] = useState<KategoriAsetResponse[]>([]);
  const [kategoriLoading, setKategoriLoading] = useState(true);
  const [kategoriError, setKategoriError] = useState<string | null>(null);

  const fetchKategori = useCallback(async () => {
    setKategoriLoading(true);
    setKategoriError(null);
    try {
      const res = await api.get<KategoriAsetResponse[]>('/master/kategori-aset');
      setKategoriData(res);
    } catch (err) {
      if (err instanceof ApiError) {
        setKategoriError(err.detail);
      } else {
        setKategoriError('Gagal memuat data kategori aset');
      }
    } finally {
      setKategoriLoading(false);
    }
  }, []);

  useEffect(() => {
    if (subPage === 'kategori-aset') fetchKategori();
  }, [subPage, fetchKategori, refreshKey]);

  // ══════ Kategori Aset Delete (AlertDialog only) ══════
  const [katDeleteTarget, setKatDeleteTarget] = useState<KategoriAsetResponse | null>(null);
  const [katDeleting, setKatDeleting] = useState(false);

  const executeKatDelete = async () => {
    if (!katDeleteTarget) return;
    setKatDeleting(true);
    try {
      await api.delete(`/master/kategori-aset/${katDeleteTarget.id}`);
      toast.success(`Kategori "${katDeleteTarget.nama}" berhasil dihapus`);
      setKatDeleteTarget(null);
      fetchKategori();
      fetchDropdowns();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.detail);
      else toast.error('Gagal menghapus kategori aset');
    } finally {
      setKatDeleting(false);
    }
  };

  // ══════ Daftar Aset Tab ══════
  const [assetData, setAssetData] = useState<AsetTetapResponse[]>([]);
  const [assetTotal, setAssetTotal] = useState(0);
  const [assetLoading, setAssetLoading] = useState(true);
  const [assetError, setAssetError] = useState<string | null>(null);

  // Filter / pagination
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [kategoriFilter, setKategoriFilter] = useState<string>('');
  const [skip, setSkip] = useState(0);

  // Debounce search
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [search]);

  // Reset page on filter change
  useEffect(() => {
    setSkip(0);
  }, [debouncedSearch, statusFilter, kategoriFilter]);

  const fetchAssets = useCallback(async () => {
    setAssetLoading(true);
    setAssetError(null);
    try {
      const params = new URLSearchParams();
      params.set('skip', String(skip));
      params.set('limit', String(PAGE_SIZE));
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter && statusFilter !== 'ALL') params.set('status', statusFilter);
      if (kategoriFilter) params.set('kategori_aset_id', kategoriFilter);

      const res = await api.get<PaginatedResponse<AsetTetapResponse>>(`/aset-tetap?${params.toString()}`);
      setAssetData(res.data);
      setAssetTotal(res.total);
    } catch (err) {
      if (err instanceof ApiError) {
        setAssetError(err.detail);
      } else {
        setAssetError('Gagal memuat data aset tetap');
      }
    } finally {
      setAssetLoading(false);
    }
  }, [debouncedSearch, statusFilter, kategoriFilter, skip]);

  useEffect(() => {
    if (subPage === 'daftar-aset') fetchAssets();
  }, [subPage, fetchAssets, refreshKey]);

  // Summary cards from current data
  const totalNilaiPerolehan = assetData.reduce((sum, a) => sum + Number(a.nilaiPerolehan || 0), 0);
  const assetAktif = assetData.filter((a) => a.status === 'AKTIF').length;

  // Pagination helpers
  const currentPage = Math.floor(skip / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(assetTotal / PAGE_SIZE));
  const hasNext = skip + PAGE_SIZE < assetTotal;
  const hasPrev = skip > 0;

  // ══════ Action Handlers (AlertDialog) ══════
  const [actionTarget, setActionTarget] = useState<{
    type: 'hapus' | 'perbaikan' | 'aktifkan';
    item: AsetTetapResponse;
  } | null>(null);
  const [actioning, setActioning] = useState(false);

  const handleAction = async () => {
    if (!actionTarget) return;
    const { type, item } = actionTarget;
    setActioning(true);
    try {
      let endpoint = '';
      let successMsg = '';
      if (type === 'hapus') {
        endpoint = `/aset-tetap/${item.id}/hapus`;
        successMsg = `Aset "${item.nama}" berhasil dihapuskan`;
      } else if (type === 'perbaikan') {
        endpoint = `/aset-tetap/${item.id}/perbaikan`;
        successMsg = `Aset "${item.nama}" status diubah ke DALAM_PERBAIKAN`;
      } else {
        endpoint = `/aset-tetap/${item.id}/aktifkan`;
        successMsg = `Aset "${item.nama}" berhasil diaktifkan kembali`;
      }
      await api.post<AsetTetapResponse>(endpoint);
      toast.success(successMsg);
      setActionTarget(null);
      fetchAssets();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.detail);
      } else {
        toast.error('Gagal mengubah status aset');
      }
    } finally {
      setActioning(false);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Aset Tetap</h1>
        <p className="text-muted-foreground">Kelola daftar asset perusahaan</p>
      </div>

      {/* ══════ Penyusutan Aset ══════ */}
      {subPage === 'penyusutan' && <PenyusutanAsetList kategoriOptions={kategoriOptions} loadingDropdowns={loadingDropdowns} refreshKey={refreshKey} />}

      {/* ══════ Transaksi Aset (Tahap 4) ══════ */}
      {subPage === 'transaksi-aset' && <TransaksiAsetList refreshKey={refreshKey} />}

      {/* ══════ Kategori Aset ══════ */}
      {subPage === 'kategori-aset' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Kategori Aset</h2>
            <Button
              size="sm"
              className="gap-2"
              onClick={() =>
                openFormTab({
                  title: 'Tambah Kategori Aset',
                  module: 'fixed-assets',
                  subPage: 'kategori-aset',
                  formKey: 'kategori-aset-create'
                })
              }>
              <Plus className="h-4 w-4" />
              Tambah Kategori
            </Button>
          </div>

          {kategoriError && !kategoriLoading && <ErrorCard message={kategoriError} onRetry={fetchKategori} />}

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Kode</TableHead>
                      <TableHead className="whitespace-nowrap">Nama Kategori</TableHead>
                      <TableHead className="whitespace-nowrap">Default Umur</TableHead>
                      <TableHead className="whitespace-nowrap">Default Metode</TableHead>
                      <TableHead className="whitespace-nowrap">Status</TableHead>
                      <TableHead className="whitespace-nowrap text-center">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {kategoriLoading ? (
                      <SkeletonRows cols={6} />
                    ) : kategoriData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                          Belum ada data kategori aset.
                        </TableCell>
                      </TableRow>
                    ) : (
                      kategoriData.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="whitespace-nowrap font-mono font-medium">{r.kode}</TableCell>
                          <TableCell className="whitespace-nowrap">{r.nama}</TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">{r.defaultUsefulLife ? r.defaultUsefulLife + ' bln' : '-'}</TableCell>
                          <TableCell className="whitespace-nowrap">{r.defaultMethod ? METODE_PENYUSUTAN_LABEL[r.defaultMethod] || r.defaultMethod : '-'}</TableCell>
                          <TableCell className="whitespace-nowrap">{statusBadge(r.status)}</TableCell>
                          <TableCell className="whitespace-nowrap text-center">
                            <div className="inline-flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() =>
                                  openFormTab({
                                    title: `Edit ${r.nama}`,
                                    module: 'fixed-assets',
                                    subPage: 'kategori-aset',
                                    formKey: 'kategori-aset-edit',
                                    formProps: { id: r.id, kode: r.kode, nama: r.nama }
                                  })
                                }
                                aria-label={`Edit ${r.nama}`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setKatDeleteTarget(r)} aria-label={`Hapus ${r.nama}`} disabled={r.status === 'NONAKTIF'}>
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

          {/* Kategori Delete AlertDialog */}
          <AlertDialog
            open={!!katDeleteTarget}
            onOpenChange={(open) => {
              if (!open) setKatDeleteTarget(null);
            }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Hapus Kategori Aset</AlertDialogTitle>
                <AlertDialogDescription>
                  Apakah Anda yakin ingin menghapus kategori <span className="font-semibold text-foreground">&quot;{katDeleteTarget?.nama}&quot;</span> ({katDeleteTarget?.kode})?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={katDeleting}>Batal</AlertDialogCancel>
                <AlertDialogAction onClick={executeKatDelete} disabled={katDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2">
                  {katDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Hapus
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}

      {/* ══════ Daftar Aset ══════ */}
      {subPage === 'daftar-aset' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Daftar Aset Tetap</h2>
            <Button
              size="sm"
              className="gap-2"
              onClick={() =>
                openFormTab({
                  title: 'Tambah Aset Baru',
                  module: 'fixed-assets',
                  subPage: 'daftar-aset',
                  formKey: 'daftar-aset-create'
                })
              }>
              <Plus className="h-4 w-4" />
              Tambah Aset Baru
            </Button>
          </div>

          {/* Search & Filter Bar */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 max-w-sm">
                  <Label className="text-xs text-muted-foreground">Cari Kode / Nama</Label>
                  <div className="relative mt-1.5">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Cari aset..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
                  </div>
                </div>
                <div className="w-full sm:w-48">
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Semua Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value || 'all'} value={opt.value || 'all'}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-full sm:w-48">
                  <Label className="text-xs text-muted-foreground">Kategori</Label>
                  <SearchableDropdown
                    value={kategoriFilter || ''}
                    onValueChange={setKategoriFilter}
                    options={kategoriOptions.map((k) => ({
                      id: k.id,
                      label: k.kode + ' — ' + k.nama
                    }))}
                    placeholder="Semua Kategori"
                    allOption={{ id: '', label: 'Semua Kategori' }}
                    className="mt-1.5"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Error */}
          {assetError && !assetLoading && <ErrorCard message={assetError} onRetry={fetchAssets} />}

          {/* Summary Cards */}
          {assetLoading ? (
            <SummarySkeletons />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <SummaryCard icon={Package} label="Total Asset" value={`${assetTotal} unit`} />
              <SummaryCard icon={Building2} label="Total Nilai Perolehan" value={formatRp(totalNilaiPerolehan)} />
              <SummaryCard icon={TrendingDown} label="Asset Aktif" value={`${assetAktif} unit`} />
            </div>
          )}

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Kode Asset</TableHead>
                      <TableHead className="whitespace-nowrap">Nama Asset</TableHead>
                      <TableHead className="whitespace-nowrap">Kategori</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Nilai Perolehan</TableHead>
                      <TableHead className="whitespace-nowrap">Status</TableHead>
                      <TableHead className="whitespace-nowrap text-center">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assetLoading ? (
                      <SkeletonRows cols={6} />
                    ) : assetData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                          {debouncedSearch ? 'Tidak ada aset yang sesuai dengan pencarian.' : 'Belum ada data aset tetap.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      assetData.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="whitespace-nowrap font-medium">{r.kode}</TableCell>
                          <TableCell className="whitespace-nowrap">{r.nama}</TableCell>
                          <TableCell className="whitespace-nowrap">{r.kategoriAset?.nama || '-'}</TableCell>
                          <TableCell className="whitespace-nowrap text-right font-mono">{formatRp(Number(r.nilaiPerolehan || 0))}</TableCell>
                          <TableCell className="whitespace-nowrap">{statusBadge(r.status)}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              {(r.status === 'AKTIF' || r.status === 'DALAM_PERBAIKAN') && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() =>
                                    openFormTab({
                                      title: `Edit ${r.nama}`,
                                      module: 'fixed-assets',
                                      subPage: 'daftar-aset',
                                      formKey: 'daftar-aset-edit',
                                      formProps: { id: r.id }
                                    })
                                  }
                                  aria-label={`Edit ${r.nama}`}
                                  title="Edit">
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {r.status === 'AKTIF' && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-yellow-600 hover:text-yellow-700"
                                    onClick={() =>
                                      setActionTarget({
                                        type: 'perbaikan',
                                        item: r
                                      })
                                    }
                                    aria-label={`Perbaikan ${r.nama}`}
                                    title="Perbaikan">
                                    <Wrench className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    onClick={() =>
                                      setActionTarget({
                                        type: 'hapus',
                                        item: r
                                      })
                                    }
                                    aria-label={`Hapus ${r.nama}`}
                                    title="Hapus">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                              {r.status === 'DALAM_PERBAIKAN' && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
                                    onClick={() =>
                                      setActionTarget({
                                        type: 'aktifkan',
                                        item: r
                                      })
                                    }
                                    aria-label={`Aktifkan ${r.nama}`}
                                    title="Aktifkan">
                                    <RotateCcw className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    onClick={() =>
                                      setActionTarget({
                                        type: 'hapus',
                                        item: r
                                      })
                                    }
                                    aria-label={`Hapus ${r.nama}`}
                                    title="Hapus">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                              {r.status === 'DIHAPUSKAN' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
                                  onClick={() =>
                                    setActionTarget({
                                      type: 'aktifkan',
                                      item: r
                                    })
                                  }
                                  aria-label={`Aktifkan ${r.nama}`}
                                  title="Aktifkan">
                                  <RotateCcw className="h-3.5 w-3.5" />
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

          {/* Pagination */}
          {!assetLoading && assetTotal > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Menampilkan {skip + 1}–{Math.min(skip + PAGE_SIZE, assetTotal)} dari {assetTotal} aset (Halaman {currentPage} dari {totalPages})
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={!hasPrev} onClick={() => setSkip((s) => s - PAGE_SIZE)} className="gap-1">
                  <ChevronLeft className="h-4 w-4" />
                  Sebelumnya
                </Button>
                <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => setSkip((s) => s + PAGE_SIZE)} className="gap-1">
                  Selanjutnya
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════ Action Confirmation AlertDialog ══════ */}
      <AlertDialog
        open={!!actionTarget}
        onOpenChange={(open) => {
          if (!open) setActionTarget(null);
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionTarget?.type === 'hapus' && 'Hapuskan Aset'}
              {actionTarget?.type === 'perbaikan' && 'Ubah Status Perbaikan'}
              {actionTarget?.type === 'aktifkan' && 'Aktifkan Kembali'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionTarget?.type === 'hapus' && (
                <>
                  Apakah Anda yakin ingin menghapuskan aset <span className="font-semibold text-foreground">"{actionTarget?.item.nama}"</span> ({actionTarget?.item.kode})? Status aset akan berubah menjadi DIHAPUSKAN.
                </>
              )}
              {actionTarget?.type === 'perbaikan' && (
                <>
                  Apakah Anda yakin ingin mengubah status aset <span className="font-semibold text-foreground">"{actionTarget?.item.nama}"</span> ({actionTarget?.item.kode}) menjadi DALAM_PERBAIKAN?
                </>
              )}
              {actionTarget?.type === 'aktifkan' && (
                <>
                  Apakah Anda yakin ingin mengaktifkan kembali aset <span className="font-semibold text-foreground">"{actionTarget?.item.nama}"</span> ({actionTarget?.item.kode})? Status akan berubah menjadi AKTIF.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actioning}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleAction} disabled={actioning} className={actionTarget?.type === 'hapus' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2' : 'gap-2'}>
              {actioning && <Loader2 className="h-4 w-4 animate-spin" />}
              {actionTarget?.type === 'hapus' && 'Hapuskan'}
              {actionTarget?.type === 'perbaikan' && 'Ubah ke Perbaikan'}
              {actionTarget?.type === 'aktifkan' && 'Aktifkan'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Tahap 4: Transaksi Aset — List + Create Form
// ════════════════════════════════════════════════════════════════════════════

const JENIS_ASET_TRANSAKSI_OPTIONS: { value: JenisAsetTransaksi; label: string; desc: string }[] = [
  { value: 'KAPITALISASI', label: 'Kapitalisasi', desc: 'Tambah nilai perolehan aset' },
  { value: 'REGISTRASI', label: 'Registrasi', desc: 'Registrasi aset dari jurnal yang sudah ada' },
  { value: 'PENYUSUTAN', label: 'Penyusutan', desc: 'Jalan penyusutan periode berjalan' },
  { value: 'MUTASI', label: 'Mutasi', desc: 'Pemindahan lokasi aset' },
  { value: 'PELEPASAN', label: 'Pelepasan', desc: 'Penghentian / penjualan aset' }
];

function jenisBadge(jenis: string) {
  const map: Record<string, string> = {
    KAPITALISASI: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    REGISTRASI: 'bg-blue-100 text-blue-700 border-blue-200',
    PENYUSUTAN: 'bg-amber-100 text-amber-700 border-amber-200',
    MUTASI: 'bg-purple-100 text-purple-700 border-purple-200',
    PELEPASAN: 'bg-rose-100 text-rose-700 border-rose-200'
  };
  const cls = map[jenis] || 'bg-gray-100 text-gray-700 border-gray-200';
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{jenis}</span>;
}

function TransaksiAsetList({ refreshKey }: { refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab);
  const [asetOptions, setAsetOptions] = useState<AsetTetapResponse[]>([]);
  const [asetDropdownLoading, setAsetDropdownLoading] = useState(true);

  const [asetFilter, setAsetFilter] = useState<string>('');

  const [data, setData] = useState<AsetTransaksiResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadAset() {
      setAsetDropdownLoading(true);
      try {
        const res = await api.get<PaginatedResponse<AsetTetapResponse>>('/aset-tetap?limit=200');
        if (cancelled) return;
        setAsetOptions(res.data);
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setAsetDropdownLoading(false);
      }
    }
    loadAset();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('skip', '0');
      params.set('limit', '100');
      if (asetFilter) params.set('asetId', asetFilter);
      const res = await api.get<AsetTransaksiResponse[] | PaginatedResponse<AsetTransaksiResponse>>(`/aset-transaksi?${params.toString()}`);
      // Backend bisa return array langsung atau {data, total} paginated
      const items = Array.isArray(res) ? res : res?.data || [];
      setData(items);
      setTotal(Array.isArray(res) ? items.length : res?.total || 0);
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail);
      else setError('Gagal memuat data transaksi aset');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [asetFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const transaksiIds = (data || []).map((d) => d.id);
  const wfTransaksiStates = useWorkflowStates('asset_event', transaksiIds, refreshKey);

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Transaksi Aset</h2>
        <Button
          size="sm"
          className="gap-2"
          onClick={() =>
            openFormTab({
              title: 'Tambah Transaksi Aset',
              module: 'fixed-assets',
              subPage: 'transaksi-aset',
              formKey: 'transaksi-aset-create'
            })
          }>
          <Plus className="h-4 w-4" />
          Tambah Transaksi
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-72 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Filter Aset</Label>
              {asetDropdownLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <SearchableDropdown
                  value={asetFilter}
                  onValueChange={(v) => {
                    setAsetFilter(v === '__all__' ? '' : v);
                  }}
                  options={asetOptions.map((a) => ({ id: a.id, label: `${a.kode} — ${a.nama}` }))}
                  allOption={{ id: '__all__', label: 'Semua Aset' }}
                  placeholder="Pilih aset..."
                />
              )}
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={fetchData} disabled={loading}>
              <Search className="h-4 w-4" />
              Muat Ulang
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto" style={{ maxHeight: '560px', overflowY: 'auto' }}>
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="whitespace-nowrap">Tanggal</TableHead>
                  <TableHead className="whitespace-nowrap">Jenis</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Total</TableHead>
                  <TableHead className="whitespace-nowrap">Aset</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Workflow</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <SkeletonRows cols={6} />
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <ErrorCard message={error} onRetry={fetchData} />
                    </TableCell>
                  </TableRow>
                ) : data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      Belum ada data transaksi aset. Klik &quot;Tambah Transaksi&quot; untuk membuat baru.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((row) => {
                    const aset = asetOptions.find((a) => a.id === row.asetId);
                    const w = wfTransaksiStates.states[row.id];
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap text-xs">{formatDate(row.tanggal)}</TableCell>
                        <TableCell className="whitespace-nowrap">{jenisBadge(row.jenis)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 border-gray-200">{row.status}</span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-mono text-xs">{formatRp(Number(row.total))}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{aset ? `${aset.kode} — ${aset.nama}` : row.asetId}</TableCell>
                        <TableCell className="whitespace-nowrap text-center">
                          {w ? (
                            <div className="flex flex-col items-center gap-1">
                              <WorkflowStateBadge state={w.state} />
                              <WorkflowActionsCell
                                documentType={w.documentType}
                                documentId={w.documentId}
                                version={w.version}
                                availableActions={w.availableActions}
                                onDone={() => {
                                  fetchData();
                                  wfTransaksiStates.refresh();
                                }}
                              />
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
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

      {total > 0 && <p className="text-sm text-muted-foreground">Total {total} transaksi aset.</p>}
    </>
  );
}

// ─── Form: Transaksi Aset Create ─────────────────────────────────────────────

function TransaksiAsetCreateForm() {
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const [asetOptions, setAsetOptions] = useState<AsetTetapResponse[]>([]);
  const [coaOptions, setCoaOptions] = useState<COADropdownResponse[]>([]);
  const [jurnalOptions, setJurnalOptions] = useState<JurnalUmumListResponse[]>([]);
  const [dropdownsLoading, setDropdownsLoading] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [fAsetId, setFAsetId] = useState('');
  const [fJenis, setFJenis] = useState<JenisAsetTransaksi | ''>('');
  const [fTanggal, setFTanggal] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  const [fUmurBulan, setFUmurBulan] = useState('');
  const [fNilaiSisa, setFNilaiSisa] = useState('');
  const [fAkunLawanId, setFAkunLawanId] = useState('');
  const [fSourceJournalId, setFSourceJournalId] = useState('');
  const [fAkumulasiAwal, setFAkumulasiAwal] = useState('');
  const [fLokasi, setFLokasi] = useState('');
  const [fNilaiPelepasan, setFNilaiPelepasan] = useState('');
  const [fAkunLabaRugiId, setFAkunLabaRugiId] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setDropdownsLoading(true);
      try {
        const [asetRes, coaRes, jurnalRes] = await Promise.all([api.get<PaginatedResponse<AsetTetapResponse>>('/aset-tetap?limit=200'), api.get<COADropdownResponse[]>('/master/coa-dropdown'), api.get<PaginatedResponse<JurnalUmumListResponse>>('/jurnal?limit=200')]);
        if (cancelled) return;
        setAsetOptions(asetRes.data);
        setCoaOptions(coaRes || []);
        setJurnalOptions(jurnalRes.data);
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setDropdownsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async () => {
    const errs: Record<string, string> = {};
    if (!fAsetId) errs.asetId = 'Aset wajib dipilih';
    if (!fJenis) errs.jenis = 'Jenis transaksi wajib dipilih';
    if (!fTanggal) errs.tanggal = 'Tanggal wajib diisi';
    if (Object.keys(errs).length) {
      setFormErrors(errs);
      return;
    }
    setSubmitting(true);
    try {
      const payload: AsetTransaksiCreate = {
        asetId: fAsetId,
        jenis: fJenis as JenisAsetTransaksi,
        tanggal: fTanggal
      };
      if (fJenis === 'KAPITALISASI') {
        payload.umurBulan = fUmurBulan ? Number(fUmurBulan) : undefined;
        payload.nilaiSisa = fNilaiSisa || undefined;
        payload.akunLawanId = fAkunLawanId || undefined;
      } else if (fJenis === 'REGISTRASI') {
        payload.sourceJournalId = fSourceJournalId || undefined;
        payload.akumulasiAwal = fAkumulasiAwal || undefined;
        payload.umurBulan = fUmurBulan ? Number(fUmurBulan) : undefined;
        payload.nilaiSisa = fNilaiSisa || undefined;
      } else if (fJenis === 'MUTASI') {
        payload.lokasi = fLokasi || undefined;
      } else if (fJenis === 'PELEPASAN') {
        payload.nilaiPelepasan = fNilaiPelepasan || undefined;
        payload.akunLabaRugiId = fAkunLabaRugiId || undefined;
        payload.akunLawanId = fAkunLawanId || undefined;
      }
      await api.post('/aset-transaksi', payload);
      toast.success('Transaksi aset berhasil dibuat');
      refreshListTab('fixed-assets', 'transaksi-aset');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal menyimpan transaksi aset');
    } finally {
      setSubmitting(false);
    }
  };

  if (dropdownsLoading) {
    return (
      <FormTabShell title="Buat Transaksi Aset">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </FormTabShell>
    );
  }

  return (
    <FormTabShell title="Buat Transaksi Aset">
      <Card className="max-w-3xl">
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">Isi data transaksi aset (kapitalisasi, registrasi, penyusutan, mutasi, atau pelepasan). Transaksi akan melalui alur persetujuan sebelum di-posting.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Aset <span className="text-destructive">*</span>
              </Label>
              <SearchableDropdown value={fAsetId} onValueChange={setFAsetId} options={asetOptions.map((a) => ({ id: a.id, label: `${a.kode} — ${a.nama}`, subtitle: a.kode }))} placeholder="Pilih aset..." />
              {formErrors.asetId && <p className="text-xs text-destructive mt-1">{formErrors.asetId}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Jenis <span className="text-destructive">*</span>
              </Label>
              <Select value={fJenis} onValueChange={(v) => setFJenis(v as JenisAsetTransaksi)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih jenis transaksi..." />
                </SelectTrigger>
                <SelectContent>
                  {JENIS_ASET_TRANSAKSI_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex flex-col">
                        <span>{opt.label}</span>
                        <span className="text-xs text-muted-foreground">{opt.desc}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.jenis && <p className="text-xs text-destructive mt-1">{formErrors.jenis}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Tanggal <span className="text-destructive">*</span>
              </Label>
              <Input type="date" className="h-9 text-xs" value={fTanggal} onChange={(e) => setFTanggal(e.target.value)} />
              {formErrors.tanggal && <p className="text-xs text-destructive mt-1">{formErrors.tanggal}</p>}
            </div>
          </div>

          {fJenis === 'KAPITALISASI' && (
            <div className="rounded-md border bg-muted/30 p-4 space-y-3">
              <p className="text-xs font-medium flex items-center gap-2">
                <ArrowLeftRight className="h-3.5 w-3.5" /> Parameter Kapitalisasi
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Umur Bulan</Label>
                  <Input type="number" className="h-9 text-xs" value={fUmurBulan} onChange={(e) => setFUmurBulan(e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Nilai Sisa</Label>
                  <CurrencyInput allowDecimal className="h-9 text-xs" value={fNilaiSisa} onValueChange={(v) => setFNilaiSisa(v)} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Akun Lawan (COA)</Label>
                  <SearchableDropdown value={fAkunLawanId} onValueChange={setFAkunLawanId} options={coaOptions.map((c) => ({ id: c.id, label: `${c.kode} — ${c.nama}` }))} placeholder="Pilih akun..." compact />
                </div>
              </div>
            </div>
          )}

          {fJenis === 'REGISTRASI' && (
            <div className="rounded-md border bg-muted/30 p-4 space-y-3">
              <p className="text-xs font-medium flex items-center gap-2">
                <ArrowLeftRight className="h-3.5 w-3.5" /> Parameter Registrasi
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Jurnal Sumber (Source Journal)</Label>
                <SearchableDropdown value={fSourceJournalId} onValueChange={setFSourceJournalId} options={jurnalOptions.map((j) => ({ id: j.id, label: `${j.noJurnal} — ${j.tanggal}`, subtitle: j.keterangan || '' }))} placeholder="Pilih jurnal..." compact />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Akumulasi Awal</Label>
                  <CurrencyInput allowDecimal className="h-9 text-xs" value={fAkumulasiAwal} onValueChange={(v) => setFAkumulasiAwal(v)} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Umur Bulan</Label>
                  <Input type="number" className="h-9 text-xs" value={fUmurBulan} onChange={(e) => setFUmurBulan(e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Nilai Sisa</Label>
                  <CurrencyInput allowDecimal className="h-9 text-xs" value={fNilaiSisa} onValueChange={(v) => setFNilaiSisa(v)} placeholder="0" />
                </div>
              </div>
            </div>
          )}

          {fJenis === 'PENYUSUTAN' && (
            <div className="rounded-md border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Info className="h-3.5 w-3.5" />
                Untuk jenis Penyusutan, parameter dihitung otomatis oleh backend berdasarkan data aset.
              </p>
            </div>
          )}

          {fJenis === 'MUTASI' && (
            <div className="rounded-md border bg-muted/30 p-4 space-y-3">
              <p className="text-xs font-medium flex items-center gap-2">
                <ArrowLeftRight className="h-3.5 w-3.5" /> Parameter Mutasi
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Lokasi Baru</Label>
                <Input className="h-9 text-xs" value={fLokasi} onChange={(e) => setFLokasi(e.target.value)} placeholder="Lokasi / ruangan baru" />
              </div>
            </div>
          )}

          {fJenis === 'PELEPASAN' && (
            <div className="rounded-md border bg-muted/30 p-4 space-y-3">
              <p className="text-xs font-medium flex items-center gap-2">
                <ArrowLeftRight className="h-3.5 w-3.5" /> Parameter Pelepasan
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Nilai Pelepasan</Label>
                  <CurrencyInput allowDecimal className="h-9 text-xs" value={fNilaiPelepasan} onValueChange={(v) => setFNilaiPelepasan(v)} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Akun Laba/Rugi</Label>
                  <SearchableDropdown value={fAkunLabaRugiId} onValueChange={setFAkunLabaRugiId} options={coaOptions.map((c) => ({ id: c.id, label: `${c.kode} — ${c.nama}` }))} placeholder="Pilih akun..." compact />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Akun Lawan (Kas/Bank — opsional)</Label>
                <SearchableDropdown value={fAkunLawanId} onValueChange={setFAkunLawanId} options={coaOptions.map((c) => ({ id: c.id, label: `${c.kode} — ${c.nama}` }))} placeholder="Pilih akun (opsional)..." compact />
                <p className="text-xs text-muted-foreground">Diisi jika pelepasan melibatkan penerimaan kas/bank (mis. penjualan aset).</p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting}>
              Batal
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting || !fAsetId || !fJenis}>
              {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
              {submitting ? 'Menyimpan...' : 'Simpan Transaksi'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </FormTabShell>
  );
}
