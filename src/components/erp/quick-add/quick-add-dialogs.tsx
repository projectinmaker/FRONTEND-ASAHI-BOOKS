'use client';

// ═════════════════════════════════════════════════════════════════════════════
// QUICK ADD MASTER DATA — Update #007.
// Popup tambah master data (Pelanggan / Supplier / Barang / Gudang / Kategori /
// Satuan / Syarat Bayar) langsung dari dalam form transaksi. Field, validasi,
// dan payload PERSIS sama dengan form tambah di halaman master data — simpan
// lewat endpoint yang sama (POST /api/v1/master/...), response 201 berisi
// entity lengkap (dengan id) sehingga form transaksi bisa langsung
// auto-select data yang baru dibuat.
//
// Struktur file:
// - QuickAddShell          → kerangka dialog (header, error, footer, scroll)
// - QuickAddPelangganDialog / QuickAddSupplierDialog / QuickAddBarangDialog
//   QuickAddGudangDialog / QuickAddKategoriDialog / QuickAddSatuanDialog
//   QuickAddSyaratBayarDialog
// Tombol pemicu (dengan gate izin RBAC) ada di quick-add-buttons.tsx.
// ═════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Package, PackageOpen, Wrench, Layers, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api, ApiError, PaginatedResponse } from '@/lib/api';
import { useTabStore } from '@/store/tab-store';
import { getSyaratBayarOptions, clearMasterDataCache, getOrganizationOptions, type SyaratBayarOption, type OrganizationOption } from '@/lib/master-data';
import { supplierFoundationKeys, supplierFoundationPayload } from '@/lib/phase-a';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import type { PelangganResponse, PelangganCreate, SupplierResponse, SupplierCreate, BarangResponse, BarangCreate, GudangResponse, GudangCreate, KategoriBarangResponse, KategoriBarangCreate, SatuanResponse, SatuanCreate, SyaratBayarResponse, SyaratBayarCreate, TaxStatus, COADropdownResponse, SettingAkunResponse, BarangAkunPilihanResponse, BarangAkunPersediaanItem, ItemTypeBarang } from '@/types/api';
import { TAX_STATUS_OPTIONS, ITEM_TYPE_OPTIONS } from '@/types/api';

// ─── Kerangka dialog bersama ─────────────────────────────────────────────────

interface QuickAddShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  submitting: boolean;
  error: string;
  onSave: () => void;
  saveLabel?: string;
  wide?: boolean;
  children: React.ReactNode;
}

function QuickAddShell({ open, onOpenChange, title, description, submitting, error, onSave, saveLabel = 'Simpan', wide = false, children }: QuickAddShellProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Cegah tutup dialog saat submit berjalan (klik overlay/Escape).
        if (submitting) return;
        onOpenChange(next);
      }}>
      <DialogContent className={cn('flex max-h-[85vh] flex-col overflow-y-auto p-0', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}>
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-4 px-6 py-4">
          {error && (
            <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {children}
        </div>
        <DialogFooter className="border-t px-6 py-4">
          <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button type="button" onClick={onSave} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitting ? 'Menyimpan...' : saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Kotak error kecil di bawah field (mirror pola form master). */
function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive mt-1">{message}</p>;
}

// ═════════════════════════════════════════════════════════════════════════════
// PELANGGAN — mirror PelangganForm (settings/pelanggan-page.tsx)
// ═════════════════════════════════════════════════════════════════════════════

interface PelangganQuickForm {
  kode: string;
  nama: string;
  singkatan: string;
  alamat: string;
  telepon: string;
  email: string;
  kontakPerson: string;
  npwp: string;
  nitku: string;
  syaratBayarId: string;
  creditLimit: string;
  taxStatus: string;
}

const emptyPelangganForm: PelangganQuickForm = { kode: '', nama: '', singkatan: '', alamat: '', telepon: '', email: '', kontakPerson: '', npwp: '', nitku: '', syaratBayarId: '', creditLimit: '', taxStatus: '' };

export function QuickAddPelangganDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (pelanggan: PelangganResponse) => void }) {
  const refreshListTab = useTabStore((s) => s.refreshListTab);
  const [form, setForm] = useState<PelangganQuickForm>(emptyPelangganForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [syaratBayarOptions, setSyaratBayarOptions] = useState<SyaratBayarOption[]>([]);
  const [coaOptions, setCoaOptions] = useState<COADropdownResponse[]>([]);
  const [selectedCoaId, setSelectedCoaId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const updateForm = (key: keyof PelangganQuickForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFormErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // Reset isian + muat opsi setiap kali dialog dibuka (pola "form tambah baru").
  useEffect(() => {
    if (!open) return;
    setForm(emptyPelangganForm);
    setFormErrors({});
    setError('');
    setSelectedCoaId('');
    getSyaratBayarOptions()
      .then(setSyaratBayarOptions)
      .catch(() => setSyaratBayarOptions([]));
    // Mirror PelangganForm: akun induk piutang dari coa-dropdown + rekomendasi
    // Setting Akun PIUTANG_USAHA (pre-selected). Kosong = otomatis dari induk
    // Piutang Usaha di server (auto-create sub-akun pelanggan).
    const coaReq = api.get<COADropdownResponse[]>('/master/coa-dropdown?include_header_group=true');
    const rootReq = api.get<SettingAkunResponse>('/master/setting-akun/PIUTANG_USAHA').catch(() => null);
    Promise.all([coaReq, rootReq])
      .then(([res, setting]) => {
        const all = Array.isArray(res) ? res : [];
        const structural = all.filter((c) => (c.tingkat === 'HEADER' || c.tingkat === 'GROUP') && c.header === 'AKTIVA' && c.status === 'AKTIF');
        const root = setting?.akunPerkiraan ?? null;
        if (root && root.id) {
          const rootOpt: COADropdownResponse = { id: root.id, kode: root.kode, nama: root.nama, header: root.header || 'AKTIVA', tingkat: root.tingkat || 'DETAIL', status: root.status || 'AKTIF' };
          setCoaOptions([rootOpt, ...structural.filter((c) => c.id !== root.id)]);
          setSelectedCoaId(root.id);
        } else {
          setCoaOptions(structural);
          const piutangUsaha = structural.find((c) => c.nama.toLowerCase().includes('piutang') && c.nama.toLowerCase().includes('usaha'));
          if (piutangUsaha) setSelectedCoaId(piutangUsaha.id);
        }
      })
      .catch(() => setCoaOptions([]));
  }, [open]);

  const validateField = (field: keyof PelangganQuickForm, value: string): string => {
    const trimmed = value.trim();
    switch (field) {
      case 'kode':
        if (!trimmed) return 'Kode pelanggan wajib diisi';
        if (trimmed.length < 3) return 'Kode pelanggan minimal 3 karakter';
        return '';
      case 'nama':
        if (!trimmed) return 'Nama pelanggan wajib diisi';
        if (trimmed.length < 3) return 'Nama pelanggan minimal 3 karakter';
        return '';
      case 'telepon':
        if (trimmed && !/^[+\-\s\d]+$/.test(trimmed)) return 'Telepon hanya boleh berisi angka, spasi, +, dan -';
        return '';
      case 'email':
        if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Format email tidak valid';
        return '';
      default:
        return '';
    }
  };

  const handleSave = async () => {
    const errors: Record<string, string> = {};
    (['kode', 'nama', 'telepon', 'email'] as const).forEach((field) => {
      const e = validateField(field, form[field]);
      if (e) errors[field] = e;
    });
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const payload: PelangganCreate = {
        kode: form.kode.trim(),
        nama: form.nama.trim(),
        alamat: form.alamat.trim() || undefined,
        telepon: form.telepon.trim() || undefined,
        email: form.email.trim() || undefined,
        kontakPerson: form.kontakPerson.trim() || undefined,
        npwp: form.npwp.trim() || undefined,
        nitku: form.nitku.trim() || undefined,
        singkatan: form.singkatan.trim() || undefined,
        syaratBayarId: form.syaratBayarId || undefined,
        creditLimit: form.creditLimit.trim() ? Number(form.creditLimit) || null : null,
        taxStatus: (form.taxStatus || null) as TaxStatus,
        akunPiutangParentId: selectedCoaId || undefined
      };
      const created = await api.post<PelangganResponse>('/master/pelanggan', payload);
      toast.success('Pelanggan berhasil ditambahkan', { description: `${created.kode} — ${created.nama}` });
      refreshListTab('settings', 'pelanggan');
      onOpenChange(false);
      onCreated(created);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Gagal menambah pelanggan');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <QuickAddShell open={open} onOpenChange={onOpenChange} title="Tambah Pelanggan" description="Field sama dengan form master Pelanggan — data langsung tersimpan ke master dan terpilih di form ini." submitting={submitting} error={error} onSave={handleSave} saveLabel="Simpan Pelanggan" wide>
      <div className="space-y-2">
        <Label>Akun Induk Piutang (opsional)</Label>
        <SearchableDropdown value={selectedCoaId} onValueChange={setSelectedCoaId} options={coaOptions.map((c) => ({ id: c.id, label: `${c.kode} — ${c.nama}` }))} allOption={{ id: '', label: 'Otomatis dari server' }} placeholder="Pilih akun induk..." />
        <p className="text-[11px] text-muted-foreground">Sub-akun piutang pelanggan dibuat otomatis di bawah induk terpilih (default: Piutang Usaha).</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="qa-pel-kode">
            Kode Pelanggan <span className="text-destructive">*</span>
          </Label>
          <Input id="qa-pel-kode" value={form.kode} onChange={(e) => updateForm('kode', e.target.value)} placeholder="mis. CUST-001" />
          <FieldError message={formErrors.kode} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="qa-pel-nama">
            Nama Pelanggan <span className="text-destructive">*</span>
          </Label>
          <Input id="qa-pel-nama" value={form.nama} onChange={(e) => updateForm('nama', e.target.value)} placeholder="Nama perusahaan / orang" />
          <FieldError message={formErrors.nama} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="qa-pel-singkatan">Singkatan</Label>
          <Input id="qa-pel-singkatan" value={form.singkatan} onChange={(e) => updateForm('singkatan', e.target.value)} maxLength={20} placeholder="mis. TBI" />
          <p className="text-[11px] text-muted-foreground">Segmen nomor SO (SO ASI/TBI/2026/001).</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="qa-pel-kontak">Kontak Person</Label>
          <Input id="qa-pel-kontak" value={form.kontakPerson} onChange={(e) => updateForm('kontakPerson', e.target.value)} placeholder="Nama PIC" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="qa-pel-alamat">Alamat</Label>
        <Textarea id="qa-pel-alamat" rows={2} value={form.alamat} onChange={(e) => updateForm('alamat', e.target.value)} placeholder="Alamat lengkap" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="qa-pel-telepon">Telepon</Label>
          <Input id="qa-pel-telepon" value={form.telepon} onChange={(e) => updateForm('telepon', e.target.value)} placeholder="mis. +62 21 555 0123" />
          <FieldError message={formErrors.telepon} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="qa-pel-email">Email</Label>
          <Input id="qa-pel-email" type="email" value={form.email} onChange={(e) => updateForm('email', e.target.value)} placeholder="email@perusahaan.com" />
          <FieldError message={formErrors.email} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="qa-pel-npwp">NPWP</Label>
          <Input id="qa-pel-npwp" value={form.npwp} onChange={(e) => updateForm('npwp', e.target.value)} placeholder="NPWP (opsional)" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="qa-pel-nitku">NITKU</Label>
          <Input id="qa-pel-nitku" value={form.nitku} onChange={(e) => updateForm('nitku', e.target.value)} maxLength={50} placeholder="NITKU 15 digit untuk e-Faktur" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Syarat Bayar</Label>
          <Select value={form.syaratBayarId} onValueChange={(v) => updateForm('syaratBayarId', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Pilih syarat bayar" />
            </SelectTrigger>
            <SelectContent>
              {syaratBayarOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="qa-pel-credit">Credit Limit</Label>
          <CurrencyInput id="qa-pel-credit" allowDecimal placeholder="0 (tanpa limit)" value={form.creditLimit} onValueChange={(v) => updateForm('creditLimit', v)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Status Pajak</Label>
        <Select value={form.taxStatus} onValueChange={(v) => updateForm('taxStatus', v)}>
          <SelectTrigger>
            <SelectValue placeholder="Pilih status pajak" />
          </SelectTrigger>
          <SelectContent>
            {TAX_STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value || 'none'} value={opt.value || ''}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">PKP = Pengusaha Kena Pajak.</p>
      </div>
    </QuickAddShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SUPPLIER — mirror SupplierForm (settings/supplier-page.tsx), tab disederhanakan
// ═════════════════════════════════════════════════════════════════════════════

type SupplierQuickForm = {
  kode: string;
  nama: string;
  alamat: string;
  telepon: string;
  email: string;
  kontakPerson: string;
  npwp: string;
  nitku: string;
  taxStatus: string;
  syaratBayarId: string;
  currency: string;
  creditLimit: string;
} & Record<(typeof supplierFoundationKeys)[number], string>;

const emptySupplierForm: SupplierQuickForm = {
  kode: '',
  nama: '',
  alamat: '',
  telepon: '',
  email: '',
  kontakPerson: '',
  npwp: '',
  nitku: '',
  taxStatus: '',
  syaratBayarId: '',
  currency: '',
  creditLimit: '',
  supplierType: '',
  city: '',
  province: '',
  country: '',
  postalCode: '',
  bankName: '',
  bankAccountNo: '',
  bankAccountName: ''
};

export function QuickAddSupplierDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (supplier: SupplierResponse) => void }) {
  const refreshListTab = useTabStore((s) => s.refreshListTab);
  const [form, setForm] = useState<SupplierQuickForm>(emptySupplierForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [syaratBayarOptions, setSyaratBayarOptions] = useState<SyaratBayarOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const updateForm = (key: keyof SupplierQuickForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFormErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  useEffect(() => {
    if (!open) return;
    setForm(emptySupplierForm);
    setFormErrors({});
    setError('');
    getSyaratBayarOptions()
      .then(setSyaratBayarOptions)
      .catch(() => setSyaratBayarOptions([]));
  }, [open]);

  const handleSave = async () => {
    const errors: Record<string, string> = {};
    if (!form.kode.trim()) errors.kode = 'Kode supplier wajib diisi';
    if (!form.nama.trim()) errors.nama = 'Nama supplier wajib diisi';
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const payload: SupplierCreate = {
        ...supplierFoundationPayload(form),
        kode: form.kode.trim(),
        nama: form.nama.trim(),
        alamat: form.alamat.trim() || null,
        telepon: form.telepon.trim() || null,
        email: form.email.trim() || null,
        kontakPerson: form.kontakPerson.trim() || null,
        npwp: form.npwp.trim() || null,
        nitku: form.nitku.trim() || null,
        syaratBayarId: form.syaratBayarId || null,
        creditLimit: form.creditLimit.trim() ? Number(form.creditLimit) || null : null,
        taxStatus: (form.taxStatus.trim() || null) as TaxStatus
      };
      // Mirror saveSupplier: currency kosong tidak dikirim (default server IDR).
      if (!payload.currency) delete payload.currency;
      const created = await api.post<SupplierResponse>('/master/supplier', payload);
      toast.success('Supplier berhasil ditambahkan', { description: `${created.kode} — ${created.nama}` });
      refreshListTab('settings', 'supplier');
      onOpenChange(false);
      onCreated(created);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Gagal menambah supplier');
    } finally {
      setSubmitting(false);
    }
  };

  const field = (key: keyof SupplierQuickForm, label: string, placeholder?: string, type = 'text') => (
    <div className="space-y-2">
      <Label htmlFor={`qa-sup-${key}`}>{label}</Label>
      <Input id={`qa-sup-${key}`} type={type} value={form[key]} onChange={(e) => updateForm(key, e.target.value)} placeholder={placeholder} disabled={submitting} />
      <FieldError message={formErrors[key]} />
    </div>
  );

  return (
    <QuickAddShell open={open} onOpenChange={onOpenChange} title="Tambah Supplier" description="Field sama dengan form master Supplier — akun hutang dibuat otomatis oleh server." submitting={submitting} error={error} onSave={handleSave} saveLabel="Simpan Supplier" wide>
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="general" className="text-xs">
            Umum
          </TabsTrigger>
          <TabsTrigger value="address" className="text-xs">
            Alamat
          </TabsTrigger>
          <TabsTrigger value="tax" className="text-xs">
            Pajak
          </TabsTrigger>
          <TabsTrigger value="commercial" className="text-xs">
            Komersial
          </TabsTrigger>
          <TabsTrigger value="bank" className="text-xs">
            Bank
          </TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {field('kode', 'Kode Supplier *', 'mis. SUP-001')}
            {field('nama', 'Nama Supplier *', 'Nama perusahaan')}
          </div>
          {field('supplierType', 'Tipe Supplier', 'mis. Vendor / Agen / Distributor (opsional)')}
        </TabsContent>
        <TabsContent value="address" className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="qa-sup-alamat">Alamat</Label>
            <Textarea id="qa-sup-alamat" rows={2} value={form.alamat} onChange={(e) => updateForm('alamat', e.target.value)} placeholder="Alamat lengkap" disabled={submitting} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {field('city', 'Kota')}
            {field('province', 'Provinsi')}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {field('country', 'Negara', 'Indonesia')}
            {field('postalCode', 'Kode Pos')}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {field('telepon', 'Telepon')}
            {field('email', 'Email', 'email@perusahaan.com', 'email')}
          </div>
          {field('kontakPerson', 'Kontak Person')}
        </TabsContent>
        <TabsContent value="tax" className="space-y-4 pt-2">
          {field('npwp', 'NPWP')}
          {field('nitku', 'NITKU')}
          <div className="space-y-2">
            <Label>Status Pajak</Label>
            <Select value={form.taxStatus} onValueChange={(v) => updateForm('taxStatus', v)} disabled={submitting}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih status pajak" />
              </SelectTrigger>
              <SelectContent>
                {TAX_STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value || 'none'} value={opt.value || ''}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">PKP / NON_PKP (opsional).</p>
          </div>
        </TabsContent>
        <TabsContent value="commercial" className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Syarat Bayar</Label>
            <SearchableDropdown value={form.syaratBayarId} onValueChange={(v) => updateForm('syaratBayarId', v)} options={syaratBayarOptions.map((o) => ({ id: o.value, label: o.label }))} allOption={{ id: '', label: 'Tidak dipilih' }} placeholder="Pilih syarat bayar" disabled={submitting} />
          </div>
          {field('currency', 'Currency', 'Kode mata uang, mis. USD (kosong = IDR)')}
          <div className="space-y-2">
            <Label htmlFor="qa-sup-creditLimit">Credit Limit</Label>
            <CurrencyInput id="qa-sup-creditLimit" allowDecimal value={form.creditLimit} onValueChange={(v) => updateForm('creditLimit', v)} disabled={submitting} />
          </div>
        </TabsContent>
        <TabsContent value="bank" className="space-y-4 pt-2">
          <p role="note" className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Data bank sensitif. Periksa rekening sebelum menyimpan.
          </p>
          {field('bankName', 'Nama Bank')}
          {field('bankAccountNo', 'No. Rekening')}
          {field('bankAccountName', 'Nama Rekening')}
        </TabsContent>
      </Tabs>
    </QuickAddShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// BARANG — mirror BarangForm (inventory/barang-form.tsx), termasuk quick-add
// kategori & satuan bersarang di dalam dialog ini.
// ═════════════════════════════════════════════════════════════════════════════

type UiBarangType = 'PERSEDIAAN' | 'NONPERSEDIAAN' | 'JASA' | 'GRUP';

interface BarangTypePolicy {
  uiType: UiBarangType;
  label: string;
  available: boolean;
  description?: string | null;
  comingSoon?: boolean;
}

// Mirror FALLBACK_TYPE_POLICIES di barang-form.tsx.
const FALLBACK_TYPE_POLICIES: BarangTypePolicy[] = [
  { uiType: 'PERSEDIAAN', label: 'Persediaan', available: true, description: 'Barang fisik yang stok-nya dilacak (kartu stok, valuasi, gudang).' },
  { uiType: 'NONPERSEDIAAN', label: 'Nonpersediaan', available: true, description: 'Barang/jasa terjual-terbeli tanpa pelacakan stok.' },
  { uiType: 'JASA', label: 'Jasa', available: true, description: 'Item jasa — pendapatan/beban tanpa gerakan stok.' },
  { uiType: 'GRUP', label: 'Grup', available: false, description: 'Non-stock sales bundle — engine bundle belum tersedia.', comingSoon: true }
];

const TYPE_ICONS: Record<UiBarangType, typeof Package> = {
  PERSEDIAAN: Package,
  NONPERSEDIAAN: PackageOpen,
  JASA: Wrench,
  GRUP: Layers
};

const RINCIAN_PERSEDIAAN_OPTIONS = ITEM_TYPE_OPTIONS.filter((o) => o.value !== 'JASA');

/** Mirror uiTypeToModel di barang-form.tsx. */
function uiTypeToModel(uiType: UiBarangType, rincian: string): { itemType: ItemTypeBarang; stockItem: boolean } {
  if (uiType === 'PERSEDIAAN') {
    const rincianValid = RINCIAN_PERSEDIAAN_OPTIONS.some((o) => o.value === rincian);
    return { itemType: (rincianValid ? rincian : 'BARANG_DAGANG') as ItemTypeBarang, stockItem: true };
  }
  if (uiType === 'NONPERSEDIAAN') return { itemType: 'BARANG_DAGANG', stockItem: false };
  if (uiType === 'JASA') return { itemType: 'JASA', stockItem: false };
  throw new Error('Jenis item Grup belum tersedia (coming soon)');
}

interface BarangQuickForm {
  uiType: UiBarangType;
  kode: string;
  nama: string;
  kategoriId: string;
  satuanId: string;
  rincianJenis: string;
  statusAktif: boolean;
  hargaPokok: string;
  hargaJual: string;
  stokMinimum: string;
  akunPersediaanId: string;
  akunHppId: string;
  akunPenjualanId: string;
  akunReturPenjualanId: string;
  akunDiskonPenjualanId: string;
}

const emptyBarangForm: BarangQuickForm = {
  uiType: 'PERSEDIAAN',
  kode: '',
  nama: '',
  kategoriId: '',
  satuanId: '',
  rincianJenis: 'BARANG_DAGANG',
  statusAktif: true,
  hargaPokok: '',
  hargaJual: '',
  stokMinimum: '',
  akunPersediaanId: '',
  akunHppId: '',
  akunPenjualanId: '',
  akunReturPenjualanId: '',
  akunDiskonPenjualanId: ''
};

export function QuickAddBarangDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (barang: BarangResponse) => void }) {
  const refreshListTab = useTabStore((s) => s.refreshListTab);
  const [form, setForm] = useState<BarangQuickForm>(emptyBarangForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [kategoriOptions, setKategoriOptions] = useState<KategoriBarangResponse[]>([]);
  const [satuanOptions, setSatuanOptions] = useState<SatuanResponse[]>([]);
  const [typePolicies, setTypePolicies] = useState<BarangTypePolicy[]>(FALLBACK_TYPE_POLICIES);
  const [akunPilihan, setAkunPilihan] = useState<BarangAkunPilihanResponse>({ hpp: [], penjualan: [], retur: [], diskon: [] });
  const [persediaanOptions, setPersediaanOptions] = useState<BarangAkunPersediaanItem[]>([]);
  // Quick-add bersarang (kategori / satuan) — dialog terpisah di dalam dialog barang.
  const [kategoriDialogOpen, setKategoriDialogOpen] = useState(false);
  const [satuanDialogOpen, setSatuanDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isPersediaan = form.uiType === 'PERSEDIAAN';
  const isJasa = form.uiType === 'JASA';

  const updateForm = (key: keyof BarangQuickForm, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFormErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // Reset + muat lookup setiap kali dialog dibuka.
  useEffect(() => {
    if (!open) return;
    setForm(emptyBarangForm);
    setFormErrors({});
    setError('');
    try {
      Promise.all([api.get<KategoriBarangResponse[]>('/master/kategori-barang'), api.get<SatuanResponse[]>('/master/satuan')]).then(([k, s]) => {
        setKategoriOptions(k);
        setSatuanOptions(s);
      });
    } catch {
      /* biarkan kosong */
    }
    api
      .get<BarangTypePolicy[]>('/master/barang/types')
      .then((policies) => {
        if (Array.isArray(policies) && policies.length) setTypePolicies(policies);
      })
      .catch(() => {
        /* fallback lokal tetap dipakai */
      });
    api
      .get<BarangAkunPilihanResponse>('/master/barang-akun-pilihan')
      .then(setAkunPilihan)
      .catch(() => setAkunPilihan({ hpp: [], penjualan: [], retur: [], diskon: [] }));
  }, [open]);

  // Kandidat akun persediaan mengikuti rincian jenis (mirror barang-form).
  useEffect(() => {
    if (!open || form.uiType !== 'PERSEDIAAN') {
      setPersediaanOptions([]);
      return;
    }
    let cancelled = false;
    api
      .get<PaginatedResponse<BarangAkunPersediaanItem>>(`/master/barang-akun-persediaan?limit=50&item_type=${encodeURIComponent(form.rincianJenis)}`)
      .then((res) => {
        if (!cancelled) setPersediaanOptions(res.data);
      })
      .catch(() => {
        /* opsi kosong */
      });
    return () => {
      cancelled = true;
    };
  }, [open, form.uiType, form.rincianJenis]);

  // Auto-default akun HPP / retur / diskon (mirror barang-form — hanya isi yang kosong).
  useEffect(() => {
    setForm((prev) => {
      const next: Partial<BarangQuickForm> = {};
      if (prev.uiType !== 'JASA' && !prev.akunHppId && akunPilihan.hpp.length > 0) next.akunHppId = akunPilihan.hpp[0].id;
      if (!prev.akunReturPenjualanId && akunPilihan.retur.length > 0) next.akunReturPenjualanId = akunPilihan.retur[0].id;
      if (!prev.akunDiskonPenjualanId && akunPilihan.diskon.length > 0) next.akunDiskonPenjualanId = akunPilihan.diskon[0].id;
      return Object.keys(next).length > 0 ? { ...prev, ...next } : prev;
    });
  }, [form.uiType, akunPilihan]);

  const handleSave = async () => {
    const errors: Record<string, string> = {};
    const kode = form.kode.trim();
    const nama = form.nama.trim();
    if (!kode) errors.kode = 'Kode barang wajib diisi';
    else if (kode.length < 3) errors.kode = 'Kode barang minimal 3 karakter';
    if (!nama) errors.nama = 'Nama barang wajib diisi';
    else if (nama.length < 3) errors.nama = 'Nama barang minimal 3 karakter';
    if (!form.kategoriId) errors.kategoriId = 'Kategori wajib dipilih';
    if (!form.satuanId) errors.satuanId = 'Satuan dasar wajib dipilih';
    if (form.hargaPokok !== '' && (isNaN(Number(form.hargaPokok)) || Number(form.hargaPokok) < 0)) errors.hargaPokok = 'Harga beli referensi tidak valid';
    if (form.hargaJual !== '' && (isNaN(Number(form.hargaJual)) || Number(form.hargaJual) < 0)) errors.hargaJual = 'Harga jual tidak valid';
    if (isPersediaan && form.stokMinimum !== '' && (isNaN(Number(form.stokMinimum)) || Number(form.stokMinimum) < 0)) errors.stokMinimum = 'Stok minimum tidak valid';
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const model = uiTypeToModel(form.uiType, form.rincianJenis);
      const payload: BarangCreate = {
        kode,
        nama,
        kategoriId: form.kategoriId,
        satuanId: form.satuanId,
        hargaPokok: form.hargaPokok !== '' ? Number(form.hargaPokok) : undefined,
        hargaJual: form.hargaJual !== '' ? Number(form.hargaJual) : 0,
        stokMinimum: isPersediaan && form.stokMinimum !== '' ? Number(form.stokMinimum) : 0,
        itemType: model.itemType,
        stockItem: model.stockItem,
        akunPersediaanId: isPersediaan ? form.akunPersediaanId || null : null,
        akunHppId: isJasa ? null : form.akunHppId || null,
        akunPenjualanId: form.akunPenjualanId || null,
        akunReturPenjualanId: form.akunReturPenjualanId || null,
        akunDiskonPenjualanId: form.akunDiskonPenjualanId || null,
        ...(!form.statusAktif ? { status: 'NONAKTIF' } : {})
      };
      const created = await api.post<BarangResponse>('/master/barang', payload);
      toast.success('Barang berhasil ditambahkan', { description: `${created.kode} — ${created.nama}` });
      refreshListTab('inventory', 'barang-jasa');
      onOpenChange(false);
      onCreated(created);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Gagal menambah barang');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <QuickAddShell open={open} onOpenChange={onOpenChange} title="Tambah Barang" description="Field sama dengan form master Barang & Jasa — stok awal diatur lewat Penyesuaian Stok." submitting={submitting} error={error} onSave={handleSave} saveLabel="Simpan Barang" wide>
      <Tabs defaultValue="umum" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="umum" className="text-xs">
            Umum
          </TabsTrigger>
          <TabsTrigger value="harga" className="text-xs">
            Harga &amp; Stok
          </TabsTrigger>
          <TabsTrigger value="akun" className="text-xs">
            Akun
          </TabsTrigger>
        </TabsList>
        <TabsContent value="umum" className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Jenis Item</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {typePolicies.map((policy) => {
                const Icon = TYPE_ICONS[policy.uiType];
                const selected = form.uiType === policy.uiType;
                return (
                  <button key={policy.uiType} type="button" disabled={!policy.available || submitting} onClick={() => updateForm('uiType', policy.uiType)} className={cn('flex items-start gap-2 rounded-md border p-3 text-left transition-colors', selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50', (!policy.available || submitting) && 'cursor-not-allowed opacity-50')} title={policy.description || policy.label}>
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="space-y-0.5">
                      <span className="block text-sm font-medium leading-none">
                        {policy.label}
                        {policy.comingSoon ? ' (segera)' : ''}
                      </span>
                      {policy.description && <span className="block text-[11px] leading-snug text-muted-foreground">{policy.description}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="qa-brg-kode">
                Kode Barang <span className="text-destructive">*</span>
              </Label>
              <Input id="qa-brg-kode" value={form.kode} onChange={(e) => updateForm('kode', e.target.value)} placeholder="mis. BRG-001" />
              <FieldError message={formErrors.kode} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qa-brg-nama">
                Nama Barang <span className="text-destructive">*</span>
              </Label>
              <Input id="qa-brg-nama" value={form.nama} onChange={(e) => updateForm('nama', e.target.value)} placeholder="Nama barang / jasa" />
              <FieldError message={formErrors.nama} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>
                Kategori <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-1.5">
                <SearchableDropdown className="min-w-0 flex-1" value={form.kategoriId} onValueChange={(v) => updateForm('kategoriId', v)} options={kategoriOptions.map((k) => ({ id: k.id, label: k.nama, subtitle: k.kode }))} placeholder="Pilih kategori" />
                <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setKategoriDialogOpen(true)} title="Tambah kategori baru" aria-label="Tambah kategori baru" disabled={submitting}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <FieldError message={formErrors.kategoriId} />
            </div>
            <div className="space-y-2">
              <Label>
                Satuan Dasar <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-1.5">
                <SearchableDropdown className="min-w-0 flex-1" value={form.satuanId} onValueChange={(v) => updateForm('satuanId', v)} options={satuanOptions.map((s) => ({ id: s.id, label: s.nama }))} placeholder="Pilih satuan" />
                <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setSatuanDialogOpen(true)} title="Tambah satuan baru" aria-label="Tambah satuan baru" disabled={submitting}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <FieldError message={formErrors.satuanId} />
            </div>
          </div>
          {isPersediaan && (
            <div className="space-y-2">
              <Label>Rincian Jenis Persediaan</Label>
              <Select value={form.rincianJenis} onValueChange={(v) => updateForm('rincianJenis', v)} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih rincian jenis" />
                </SelectTrigger>
                <SelectContent>
                  {RINCIAN_PERSEDIAAN_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="qa-brg-status">Status Aktif</Label>
              <p className="text-[11px] text-muted-foreground">Barang langsung bisa dipakai transaksi.</p>
            </div>
            <Switch id="qa-brg-status" checked={form.statusAktif} onCheckedChange={(v) => updateForm('statusAktif', v)} disabled={submitting} />
          </div>
        </TabsContent>
        <TabsContent value="harga" className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="qa-brg-hargaPokok">Harga Beli Referensi</Label>
              <CurrencyInput id="qa-brg-hargaPokok" allowDecimal value={form.hargaPokok} onValueChange={(v) => updateForm('hargaPokok', v)} placeholder="0" disabled={submitting} />
              <FieldError message={formErrors.hargaPokok} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qa-brg-hargaJual">Harga Jual</Label>
              <CurrencyInput id="qa-brg-hargaJual" allowDecimal value={form.hargaJual} onValueChange={(v) => updateForm('hargaJual', v)} placeholder="0" disabled={submitting} />
              <FieldError message={formErrors.hargaJual} />
            </div>
          </div>
          {isPersediaan && (
            <div className="space-y-2">
              <Label htmlFor="qa-brg-stokMinimum">Stok Minimum</Label>
              <Input id="qa-brg-stokMinimum" type="number" min={0} value={form.stokMinimum} onChange={(e) => updateForm('stokMinimum', e.target.value)} placeholder="0" disabled={submitting} />
              <FieldError message={formErrors.stokMinimum} />
              <p className="text-[11px] text-muted-foreground">Batas minimum sebelum muncul peringatan stok. Stok awal diatur lewat modul Persediaan → Penyesuaian.</p>
            </div>
          )}
        </TabsContent>
        <TabsContent value="akun" className="space-y-4 pt-2">
          <p className="text-[11px] text-muted-foreground">Akun mengikuti rekomendasi sistem (sumber: daftar pilihan akun barang) — bisa diganti bila diperlukan.</p>
          {isPersediaan && (
            <div className="space-y-2">
              <Label>Akun Persediaan</Label>
              <Select value={form.akunPersediaanId} onValueChange={(v) => updateForm('akunPersediaanId', v)} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih akun persediaan" />
                </SelectTrigger>
                <SelectContent>
                  {persediaanOptions.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.kode} — {a.nama}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {!isJasa && (
              <div className="space-y-2">
                <Label>Akun HPP</Label>
                <Select value={form.akunHppId} onValueChange={(v) => updateForm('akunHppId', v)} disabled={submitting}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih akun HPP" />
                  </SelectTrigger>
                  <SelectContent>
                    {akunPilihan.hpp.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.kode} — {a.nama}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Akun Penjualan</Label>
              <Select value={form.akunPenjualanId} onValueChange={(v) => updateForm('akunPenjualanId', v)} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih akun penjualan" />
                </SelectTrigger>
                <SelectContent>
                  {akunPilihan.penjualan.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.kode} — {a.nama}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Akun Retur Penjualan</Label>
              <Select value={form.akunReturPenjualanId} onValueChange={(v) => updateForm('akunReturPenjualanId', v)} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih akun retur" />
                </SelectTrigger>
                <SelectContent>
                  {akunPilihan.retur.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.kode} — {a.nama}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Akun Diskon Penjualan</Label>
              <Select value={form.akunDiskonPenjualanId} onValueChange={(v) => updateForm('akunDiskonPenjualanId', v)} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih akun diskon" />
                </SelectTrigger>
                <SelectContent>
                  {akunPilihan.diskon.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.kode} — {a.nama}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Quick-add bersarang: kategori & satuan dibuat tanpa meninggalkan dialog barang */}
      <QuickAddKategoriDialog
        open={kategoriDialogOpen}
        onOpenChange={setKategoriDialogOpen}
        onCreated={(k) => {
          setKategoriOptions((prev) => (prev.some((row) => row.id === k.id) ? prev : [...prev, k]));
          updateForm('kategoriId', k.id);
        }}
      />
      <QuickAddSatuanDialog
        open={satuanDialogOpen}
        onOpenChange={setSatuanDialogOpen}
        onCreated={(s) => {
          setSatuanOptions((prev) => (prev.some((row) => row.id === s.id) ? prev : [...prev, s]));
          updateForm('satuanId', s.id);
        }}
      />
    </QuickAddShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// GUDANG — mirror GudangForm (settings/gudang-page.tsx)
// ═════════════════════════════════════════════════════════════════════════════

interface GudangQuickForm {
  kode: string;
  nama: string;
  alamat: string;
  companyId: string;
  branchId: string;
}

const emptyGudangForm: GudangQuickForm = { kode: '', nama: '', alamat: '', companyId: '', branchId: '' };

export function QuickAddGudangDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (gudang: GudangResponse) => void }) {
  const refreshListTab = useTabStore((s) => s.refreshListTab);
  const [form, setForm] = useState<GudangQuickForm>(emptyGudangForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [companyOptions, setCompanyOptions] = useState<OrganizationOption[]>([]);
  const [branchOptions, setBranchOptions] = useState<OrganizationOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const updateForm = (key: keyof GudangQuickForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFormErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  useEffect(() => {
    if (!open) return;
    setForm(emptyGudangForm);
    setFormErrors({});
    setError('');
    getOrganizationOptions('COMPANY')
      .then(setCompanyOptions)
      .catch(() => setCompanyOptions([]));
    getOrganizationOptions('BRANCH')
      .then(setBranchOptions)
      .catch(() => setBranchOptions([]));
  }, [open]);

  const handleSave = async () => {
    const errors: Record<string, string> = {};
    if (!form.kode.trim()) errors.kode = 'Kode gudang wajib diisi';
    else if (form.kode.trim().length < 2) errors.kode = 'Kode gudang minimal 2 karakter';
    if (!form.nama.trim()) errors.nama = 'Nama gudang wajib diisi';
    else if (form.nama.trim().length < 3) errors.nama = 'Nama gudang minimal 3 karakter';
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const payload: GudangCreate = {
        kode: form.kode.trim(),
        nama: form.nama.trim(),
        alamat: form.alamat.trim() || null,
        companyId: form.companyId || null,
        branchId: form.branchId || null
      };
      const created = await api.post<GudangResponse>('/master/gudang', payload);
      toast.success('Gudang berhasil ditambahkan', { description: `${created.kode} — ${created.nama}` });
      refreshListTab('settings', 'gudang');
      onOpenChange(false);
      onCreated(created);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Gagal menambah gudang');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <QuickAddShell open={open} onOpenChange={onOpenChange} title="Tambah Gudang" description="Field sama dengan form master Gudang." submitting={submitting} error={error} onSave={handleSave} saveLabel="Simpan Gudang">
      <div className="space-y-2">
        <Label htmlFor="qa-gdg-kode">
          Kode Gudang <span className="text-destructive">*</span>
        </Label>
        <Input id="qa-gdg-kode" value={form.kode} onChange={(e) => updateForm('kode', e.target.value)} placeholder="mis. GDG-01" />
        <FieldError message={formErrors.kode} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="qa-gdg-nama">
          Nama Gudang <span className="text-destructive">*</span>
        </Label>
        <Input id="qa-gdg-nama" value={form.nama} onChange={(e) => updateForm('nama', e.target.value)} placeholder="mis. Gudang Utama" />
        <FieldError message={formErrors.nama} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="qa-gdg-alamat">Alamat</Label>
        <Textarea id="qa-gdg-alamat" rows={2} value={form.alamat} onChange={(e) => updateForm('alamat', e.target.value)} placeholder="Alamat gudang (opsional)" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Company</Label>
          <Select value={form.companyId} onValueChange={(v) => updateForm('companyId', v)} disabled={submitting}>
            <SelectTrigger>
              <SelectValue placeholder="Pilih company" />
            </SelectTrigger>
            <SelectContent>
              {companyOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Branch</Label>
          <Select value={form.branchId} onValueChange={(v) => updateForm('branchId', v)} disabled={submitting}>
            <SelectTrigger>
              <SelectValue placeholder="Pilih branch" />
            </SelectTrigger>
            <SelectContent>
              {branchOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </QuickAddShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// KATEGORI BARANG — mirror KategoriBarangForm (settings/kategori-barang-page.tsx)
// ═════════════════════════════════════════════════════════════════════════════

export function QuickAddKategoriDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (kategori: KategoriBarangResponse) => void }) {
  const refreshListTab = useTabStore((s) => s.refreshListTab);
  const [form, setForm] = useState({ kode: '', nama: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm({ kode: '', nama: '' });
    setFormErrors({});
    setError('');
  }, [open]);

  const handleSave = async () => {
    const errors: Record<string, string> = {};
    if (!form.kode.trim()) errors.kode = 'Kode kategori wajib diisi';
    if (!form.nama.trim()) errors.nama = 'Nama kategori wajib diisi';
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const payload: KategoriBarangCreate = { kode: form.kode.trim(), nama: form.nama.trim() };
      const created = await api.post<KategoriBarangResponse>('/master/kategori-barang', payload);
      toast.success('Kategori berhasil ditambahkan', { description: `${created.kode} — ${created.nama}` });
      refreshListTab('settings', 'kategori-barang');
      onOpenChange(false);
      onCreated(created);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Gagal menambah kategori');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <QuickAddShell open={open} onOpenChange={onOpenChange} title="Tambah Kategori Barang" description="Field sama dengan form master Kategori." submitting={submitting} error={error} onSave={handleSave} saveLabel="Simpan Kategori">
      <div className="space-y-2">
        <Label htmlFor="qa-kat-kode">
          Kode <span className="text-destructive">*</span>
        </Label>
        <Input id="qa-kat-kode" value={form.kode} onChange={(e) => setForm((prev) => ({ ...prev, kode: e.target.value }))} placeholder="mis. KT-01" autoFocus />
        <FieldError message={formErrors.kode} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="qa-kat-nama">
          Nama <span className="text-destructive">*</span>
        </Label>
        <Input id="qa-kat-nama" value={form.nama} onChange={(e) => setForm((prev) => ({ ...prev, nama: e.target.value }))} placeholder="mis. Spare Part" />
        <FieldError message={formErrors.nama} />
      </div>
    </QuickAddShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SATUAN — mirror SatuanForm (settings/satuan-page.tsx)
// ═════════════════════════════════════════════════════════════════════════════

export function QuickAddSatuanDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (satuan: SatuanResponse) => void }) {
  const refreshListTab = useTabStore((s) => s.refreshListTab);
  const [nama, setNama] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setNama('');
    setFormError('');
    setError('');
  }, [open]);

  const handleSave = async () => {
    if (!nama.trim()) {
      setFormError('Nama satuan wajib diisi');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const payload: SatuanCreate = { nama: nama.trim() };
      const created = await api.post<SatuanResponse>('/master/satuan', payload);
      toast.success('Satuan berhasil ditambahkan', { description: created.nama });
      refreshListTab('settings', 'satuan');
      onOpenChange(false);
      onCreated(created);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Gagal menambah satuan');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <QuickAddShell open={open} onOpenChange={onOpenChange} title="Tambah Satuan" description="Field sama dengan form master Satuan." submitting={submitting} error={error} onSave={handleSave} saveLabel="Simpan Satuan">
      <div className="space-y-2">
        <Label htmlFor="qa-stn-nama">
          Nama Satuan <span className="text-destructive">*</span>
        </Label>
        <Input id="qa-stn-nama" value={nama} onChange={(e) => setNama(e.target.value)} placeholder="mis. PCS / KG / BOX" maxLength={20} autoFocus />
        <FieldError message={formError} />
        <p className="text-[11px] text-muted-foreground">Maksimal 20 karakter.</p>
      </div>
    </QuickAddShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SYARAT BAYAR — mirror SyaratBayarForm (settings/syarat-bayar-page.tsx)
// ═════════════════════════════════════════════════════════════════════════════

export function QuickAddSyaratBayarDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (syarat: SyaratBayarResponse) => void }) {
  const refreshListTab = useTabStore((s) => s.refreshListTab);
  const [form, setForm] = useState({ nama: '', hari: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm({ nama: '', hari: '' });
    setFormErrors({});
    setError('');
  }, [open]);

  const handleSave = async () => {
    const errors: Record<string, string> = {};
    if (!form.nama.trim()) errors.nama = 'Nama syarat bayar wajib diisi';
    if (form.hari && (isNaN(Number(form.hari)) || Number(form.hari) < 0)) errors.hari = 'Jangka waktu tidak valid';
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const payload: SyaratBayarCreate = { nama: form.nama.trim(), hari: form.hari ? parseInt(form.hari, 10) : null };
      const created = await api.post<SyaratBayarResponse>('/master/syarat-bayar', payload);
      toast.success('Syarat bayar berhasil ditambahkan', { description: created.nama });
      // Opsi syarat bayar di berbagai form memakai cache 5 menit — pastikan
      // data baru langsung terlihat di form lain.
      clearMasterDataCache();
      refreshListTab('settings', 'syarat-bayar');
      onOpenChange(false);
      onCreated(created);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Gagal menambah syarat bayar');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <QuickAddShell open={open} onOpenChange={onOpenChange} title="Tambah Syarat Bayar" description="Field sama dengan form master Syarat Bayar." submitting={submitting} error={error} onSave={handleSave} saveLabel="Simpan Syarat Bayar">
      <div className="space-y-2">
        <Label htmlFor="qa-sb-nama">
          Nama Syarat Bayar <span className="text-destructive">*</span>
        </Label>
        <Input id="qa-sb-nama" value={form.nama} onChange={(e) => setForm((prev) => ({ ...prev, nama: e.target.value }))} placeholder="Contoh: Net 30, Tunai, COD" autoFocus />
        <FieldError message={formErrors.nama} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="qa-sb-hari">Jangka Waktu (Hari)</Label>
        <Input id="qa-sb-hari" type="number" min={0} placeholder="0 = Tunai / COD" value={form.hari} onChange={(e) => setForm((prev) => ({ ...prev, hari: e.target.value }))} />
        <FieldError message={formErrors.hari} />
        <p className="text-[11px] text-muted-foreground">Kosongkan atau isi 0 untuk pembayaran tunai (COD).</p>
      </div>
    </QuickAddShell>
  );
}
