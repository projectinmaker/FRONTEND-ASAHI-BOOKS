'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Search, Pencil, Trash2, Loader2, ChevronLeft, ChevronRight, Link2, FileText, Power, Users, SearchX } from 'lucide-react';
import { toast } from 'sonner';
import { useTabStore } from '@/store/tab-store';
import { FormTabShell } from '@/components/erp/form-tab-shell';
import { Badge } from '@/components/ui/badge';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { EmptyState } from '@/components/ui/empty-state';

import { api, ApiError } from '@/lib/api';
import { getSyaratBayarOptions, type SyaratBayarOption } from '@/lib/master-data';
import type { PelangganResponse, PelangganCreate, PelangganUpdate, AkunPerkiraanSimple, PelangganCOAItem, PelangganFromCOACreate, COADropdownResponse, SettingAkunResponse, TaxStatus } from '@/types/api';
import { TAX_STATUS_OPTIONS } from '@/types/api';

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

interface PelangganPageProps {
  subPage?: string;
  refreshKey?: number;
  formMode?: string;
  formProps?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Form Component (rendered in tab)
// ═══════════════════════════════════════════════════════════════════════════

function PelangganForm({ mode, editId, initialData, preselectedCoaId, preselectedCoaKode, preselectedCoaNama }: { mode: FormMode; editId?: string; initialData?: FormState; preselectedCoaId?: string; preselectedCoaKode?: string; preselectedCoaNama?: string }) {
  const [form, setForm] = useState<FormState>(initialData || emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [syaratBayarOptions, setSyaratBayarOptions] = useState<SyaratBayarOption[]>([]);
  const [akunPiutangInfo, setAkunPiutangInfo] = useState<AkunPerkiraanSimple | null>(null);
  const [loadingAkunPiutang, setLoadingAkunPiutang] = useState(false);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  // Untuk mode "pilih akun induk" (create only)
  const [coaOptions, setCoaOptions] = useState<COADropdownResponse[]>([]);
  const [recommendedCoaId, setRecommendedCoaId] = useState<string | null>(null);
  const [selectedCoaId, setSelectedCoaId] = useState(preselectedCoaId || '');
  const [loadingCoa, setLoadingCoa] = useState(false);

  // Fetch syarat bayar options via cache service (Phase 2)
  useEffect(() => {
    getSyaratBayarOptions()
      .then(setSyaratBayarOptions)
      .catch(() => setSyaratBayarOptions([]));
  }, []);

  // Fetch data lengkap pelanggan saat edit (untuk dapat akunPiutang + field baru Phase 2)
  useEffect(() => {
    if (mode === 'edit' && editId) {
      setLoadingAkunPiutang(true);
      api
        .get<PelangganResponse>(`/master/pelanggan/${editId}`)
        .then((res) => {
          setAkunPiutangInfo(res.akunPiutang || null);
          // Pre-fill field baru Phase 2 dari response
          setForm((prev) => ({
            ...prev,
            nitku: res.nitku || '',
            syaratBayarId: res.syaratBayarId || '',
            creditLimit: res.creditLimit != null ? String(res.creditLimit) : '',
            taxStatus: res.taxStatus || '',
            // Fallback: kalau syaratBayarId belum di-set, coba match berdasarkan nama legacy
            syaratBayarDefault: res.syaratBayarDefault || ''
          }));
        })
        .catch(() => setAkunPiutangInfo(null))
        .finally(() => setLoadingAkunPiutang(false));
    }
  }, [mode, editId]);

  // Fetch akun induk untuk dropdown — akun root dari Setting Akun (PIUTANG_USAHA,
  // mis. 112000 "Piutang Usaha") + akun struktural HEADER/GROUP AKTIVA.
  // COA v2: root "Piutang Usaha" ber-level DETAIL — tetap boleh jadi induk
  // (auto-create membuat sub-akun di bawahnya), jadi JANGAN difilter tingkat.
  useEffect(() => {
    if (mode === 'create' && !preselectedCoaId) {
      setLoadingCoa(true);
      const coaReq = api.get<COADropdownResponse[]>('/master/coa-dropdown?include_header_group=true');
      const rootReq = api.get<SettingAkunResponse>('/master/setting-akun/PIUTANG_USAHA').catch(() => null);
      Promise.all([coaReq, rootReq])
        .then(([res, setting]) => {
          const all = Array.isArray(res) ? res : [];
          // Akun struktural (HEADER/GROUP) under AKTIVA — relevan untuk COA lama
          const structural = all.filter((c) => (c.tingkat === 'HEADER' || c.tingkat === 'GROUP') && c.header === 'AKTIVA' && c.status === 'AKTIF');
          // Root dari Setting Akun — diprioritaskan paling atas + pre-selected
          const root = setting?.akunPerkiraan ?? null;
          if (root && root.id) {
            const rootOpt: COADropdownResponse = {
              id: root.id,
              kode: root.kode,
              nama: root.nama,
              header: root.header || 'AKTIVA',
              tingkat: root.tingkat || 'DETAIL',
              status: root.status || 'AKTIF'
            };
            setCoaOptions([rootOpt, ...structural.filter((c) => c.id !== root.id)]);
            setRecommendedCoaId(root.id);
            setSelectedCoaId(root.id);
          } else {
            // Fallback: pre-select akun bernama Piutang Usaha dari daftar struktural (COA lama)
            setCoaOptions(structural);
            const piutangUsaha = structural.find((c) => c.nama.toLowerCase().includes('piutang') && c.nama.toLowerCase().includes('usaha'));
            if (piutangUsaha) {
              setRecommendedCoaId(piutangUsaha.id);
              setSelectedCoaId(piutangUsaha.id);
            }
          }
        })
        .catch(() => setCoaOptions([]))
        .finally(() => setLoadingCoa(false));
    }
  }, [mode, preselectedCoaId]);

  // Pre-fill nama dari COA yang pre-selected
  useEffect(() => {
    if (mode === 'create' && preselectedCoaNama) {
      const cleanNama = preselectedCoaNama.replace(/^Piutang\s*-\s*/i, '').trim();
      setForm((prev) => ({ ...prev, nama: cleanNama }));
    }
  }, [mode, preselectedCoaNama]);

  const title = mode === 'create' ? (preselectedCoaId ? `Link COA: ${preselectedCoaNama || ''}` : 'Tambah Pelanggan') : 'Edit Pelanggan';

  const updateForm = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Clear error for this field when user starts typing again
    setFormErrors((prev) => {
      if (!prev[key]) return prev;
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
        if (!trimmed) return 'Kode pelanggan wajib diisi';
        if (trimmed.length < 3) return 'Kode pelanggan minimal 3 karakter';
        return '';
      case 'nama':
        if (!trimmed) return 'Nama pelanggan wajib diisi';
        if (trimmed.length < 3) return 'Nama pelanggan minimal 3 karakter';
        return '';
      case 'telepon':
        if (trimmed && !/^[+\-\s\d]+$/.test(trimmed)) {
          return 'Telepon hanya boleh berisi angka, spasi, +, dan -';
        }
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
    (['kode', 'nama', 'telepon', 'email'] as const).forEach((field) => {
      const e = validateField(field, form[field]);
      if (e) errors[field] = e;
    });
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Saat user pilih akun induk dari dropdown
  const handleCoaSelect = (coaId: string) => {
    setSelectedCoaId(coaId);
    // Tidak auto-fill nama pelanggan dari nama induk (mis. "Piutang Usaha")
    // User input nama pelanggan manually
  };

  const handleSubmit = async () => {
    if (!validateAll()) {
      toast.error('Periksa kembali isian formulir yang ditandai');
      return;
    }
    setSubmitting(true);
    try {
      // Parse creditLimit ke number (atau null kalau kosong)
      const creditLimitNum = form.creditLimit.trim() ? Number(form.creditLimit) : null;
      const taxStatusVal: TaxStatus = form.taxStatus === 'PKP' || form.taxStatus === 'NON_PKP' ? form.taxStatus : null;

      if (mode === 'create') {
        // Jika preselectedCoaId ada (dari tombol Link di list = DETAIL COA) → POST /pelanggan-from-coa
        // Jika tidak (normal create) → POST /pelanggan (auto-create detail under "Piutang Usaha")
        if (preselectedCoaId) {
          const payload: PelangganFromCOACreate = {
            coaId: preselectedCoaId,
            kode: form.kode.trim(),
            nama: form.nama.trim(),
            alamat: form.alamat.trim() || undefined,
            telepon: form.telepon.trim() || undefined,
            email: form.email.trim() || undefined,
            kontakPerson: form.kontakPerson.trim() || undefined,
            npwp: form.npwp.trim() || undefined,
            syaratBayarDefault: form.syaratBayarDefault || undefined
          };
          await api.post<PelangganResponse>('/master/pelanggan-from-coa', payload);
          toast.success('Pelanggan berhasil di-link ke Akun Perkiraan');
        } else {
          const payload: PelangganCreate = {
            kode: form.kode.trim(),
            nama: form.nama.trim(),
            alamat: form.alamat.trim() || undefined,
            telepon: form.telepon.trim() || undefined,
            email: form.email.trim() || undefined,
            kontakPerson: form.kontakPerson.trim() || undefined,
            npwp: form.npwp.trim() || undefined,
            // Akun induk untuk auto-create COA subledger (dari dropdown "Pilih
            // Akun Perkiraan"; default = root Setting Akun PIUTANG_USAHA)
            akunPiutangParentId: selectedCoaId || undefined,
            // === Phase 2 — field baru ===
            nitku: form.nitku.trim() || undefined,
            syaratBayarId: form.syaratBayarId || undefined,
            creditLimit: creditLimitNum,
            taxStatus: taxStatusVal,
            // === Legacy (fallback kalau syaratBayarId belum di-set) ===
            syaratBayarDefault: form.syaratBayarDefault || undefined
          };
          await api.post<PelangganResponse>('/master/pelanggan', payload);
          toast.success('Pelanggan berhasil ditambahkan (Akun Perkiraan auto-generated)');
        }
      } else {
        if (!editId) return;
        const payload: PelangganUpdate = {
          kode: form.kode.trim(),
          nama: form.nama.trim(),
          alamat: form.alamat.trim() || undefined,
          telepon: form.telepon.trim() || undefined,
          email: form.email.trim() || undefined,
          kontakPerson: form.kontakPerson.trim() || undefined,
          npwp: form.npwp.trim() || undefined,
          // === Phase 2 — field baru ===
          nitku: form.nitku.trim() || undefined,
          syaratBayarId: form.syaratBayarId || undefined,
          creditLimit: creditLimitNum,
          taxStatus: taxStatusVal,
          // === Legacy ===
          syaratBayarDefault: form.syaratBayarDefault || undefined
        };
        await api.put<PelangganResponse>(`/master/pelanggan/${editId}`, payload);
        toast.success('Pelanggan berhasil diperbarui');
      }
      refreshListTab('settings', 'pelanggan');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : mode === 'create' ? 'Gagal menambahkan pelanggan' : 'Gagal memperbarui pelanggan';
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
      <p className="mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">Piutang Usaha (112000) adalah control account. Jika akun belum dipilih, sistem membuat akun subledger untuk pelanggan ini secara otomatis.</p>
      <Card className="max-w-4xl">
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">{mode === 'create' ? 'Isi data di bawah untuk menambahkan pelanggan baru. Anda bisa memilih akun perkiraan yang sudah ada, atau biarkan kosong untuk auto-generate COA baru.' : `Mengedit pelanggan: ${form.kode} — ${form.nama}`}</p>

          {/* Pilih Akun Perkiraan (create mode only, kecuali preselectedCoaId dari list Link) */}
          {mode === 'create' && !preselectedCoaId && (
            <div className="space-y-2">
              <Label>Pilih Akun Perkiraan</Label>
              <SearchableDropdown
                value={selectedCoaId}
                onValueChange={handleCoaSelect}
                options={coaOptions.map((c) => ({
                  id: c.id,
                  label: `${c.kode} — ${c.nama}`,
                  subtitle: c.id === recommendedCoaId ? `${c.header} · Disarankan (Setting Akun)` : c.header
                }))}
                placeholder={loadingCoa ? 'Memuat...' : 'Pilih akun induk'}
                loading={loadingCoa}
                emptyText="Tidak ada akun induk ditemukan"
              />
              <p className="text-[11px] text-muted-foreground leading-relaxed">Akun induk default diambil dari Setting Akun (PIUTANG_USAHA). Saat simpan, sistem otomatis membuat sub-akun "Piutang - [nama pelanggan]" di bawah akun induk yang dipilih.</p>
            </div>
          )}

          {/* Info: pre-selected COA dari tombol Link di list */}
          {mode === 'create' && preselectedCoaId && (
            <div className="space-y-2">
              <Label>Akun Perkiraan (akan di-link)</Label>
              <div className="rounded-md bg-violet-50 border border-violet-200 px-3 py-2.5 text-xs text-violet-700">
                <strong>
                  {preselectedCoaKode} — {preselectedCoaNama}
                </strong>
                <br />
                Akun detail ini akan di-link ke pelanggan baru.
              </div>
            </div>
          )}

          {/* Kode */}
          <div className="space-y-2">
            <Label htmlFor="pel-kode">Kode Pelanggan</Label>
            <Input id="pel-kode" placeholder="Contoh: PEL-001" value={form.kode} onChange={(e) => updateForm('kode', e.target.value)} onBlur={() => handleBlur('kode')} aria-invalid={!!formErrors.kode} className={formErrors.kode ? 'border-destructive focus-visible:ring-destructive' : ''} />
            {formErrors.kode ? <p className="text-xs text-destructive mt-1">{formErrors.kode}</p> : mode === 'edit' ? <p className="text-[11px] text-muted-foreground">Ubah kode pelanggan jika diperlukan.</p> : null}
          </div>

          {/* Nama */}
          <div className="space-y-2">
            <Label htmlFor="pel-nama">Nama Pelanggan</Label>
            <Input id="pel-nama" placeholder="Nama pelanggan" value={form.nama} onChange={(e) => updateForm('nama', e.target.value)} onBlur={() => handleBlur('nama')} aria-invalid={!!formErrors.nama} className={formErrors.nama ? 'border-destructive focus-visible:ring-destructive' : ''} autoFocus />
            {formErrors.nama && <p className="text-xs text-destructive mt-1">{formErrors.nama}</p>}
          </div>

          {/* Alamat */}
          <div className="space-y-2">
            <Label htmlFor="pel-alamat">Alamat</Label>
            <Textarea id="pel-alamat" placeholder="Alamat lengkap pelanggan" value={form.alamat} onChange={(e) => updateForm('alamat', e.target.value)} rows={3} />
          </div>

          {/* Telepon & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="pel-telepon">Telepon</Label>
              <Input id="pel-telepon" placeholder="08xxxxxxxxxx" value={form.telepon} onChange={(e) => updateForm('telepon', e.target.value)} onBlur={() => handleBlur('telepon')} aria-invalid={!!formErrors.telepon} className={formErrors.telepon ? 'border-destructive focus-visible:ring-destructive' : ''} />
              {formErrors.telepon && <p className="text-xs text-destructive mt-1">{formErrors.telepon}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="pel-email">Email</Label>
              <Input id="pel-email" type="email" placeholder="email@contoh.com" value={form.email} onChange={(e) => updateForm('email', e.target.value)} onBlur={() => handleBlur('email')} aria-invalid={!!formErrors.email} className={formErrors.email ? 'border-destructive focus-visible:ring-destructive' : ''} />
              {formErrors.email && <p className="text-xs text-destructive mt-1">{formErrors.email}</p>}
            </div>
          </div>

          {/* Kontak Person */}
          <div className="space-y-2">
            <Label htmlFor="pel-kontak">Kontak Person</Label>
            <Input id="pel-kontak" placeholder="Nama kontak person" value={form.kontakPerson} onChange={(e) => updateForm('kontakPerson', e.target.value)} />
          </div>

          {/* NPWP */}
          <div className="space-y-2">
            <Label htmlFor="pel-npwp">NPWP</Label>
            <Input id="pel-npwp" placeholder="Contoh: 01.234.567.8-012.345.678" value={form.npwp} onChange={(e) => updateForm('npwp', e.target.value)} />
          </div>

          {/* === Phase 2 — field baru === */}

          {/* NITKU (15 digit untuk e-Faktur) */}
          <div className="space-y-2">
            <Label htmlFor="pel-nitku">NITKU</Label>
            <Input id="pel-nitku" placeholder="NITKU 15 digit untuk e-Faktur" maxLength={50} value={form.nitku} onChange={(e) => updateForm('nitku', e.target.value)} />
            <p className="text-[11px] text-muted-foreground">NITKU dipakai untuk pelaporan e-Faktur (optional).</p>
          </div>

          {/* Syarat Bayar (UUID, prefer pakai ini — canonical Phase 2) */}
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
            <p className="text-[11px] text-muted-foreground">Pilih syarat pembayaran default untuk pelanggan ini.</p>
          </div>

          {/* Credit Limit & Tax Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="pel-credit-limit">Credit Limit</Label>
              <Input id="pel-credit-limit" type="number" min="0" step="0.01" placeholder="0 (tanpa limit)" value={form.creditLimit} onChange={(e) => updateForm('creditLimit', e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Batas kredit pelanggan (kosongkan untuk tanpa limit).</p>
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
          </div>

          {/* Syarat Bayar Default (Legacy — hidden dari form, dipertahankan untuk backward compat) */}
          {/* Catatan Phase 2: field ini tidak ditampilkan di form, prefer pakai syaratBayarId di atas */}

          {/* Akun Piutang (read-only, edit mode only) */}
          {mode === 'edit' && (
            <div className="space-y-2">
              <Label>Akun Piutang</Label>
              <div className="rounded-md border bg-muted/30 px-3 py-2.5">
                {loadingAkunPiutang ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Memuat akun piutang...
                  </div>
                ) : akunPiutangInfo ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        <span className="font-mono text-xs text-muted-foreground mr-1.5">{akunPiutangInfo.kode}</span>
                        {akunPiutangInfo.nama}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Akun Piutang terhubung ke pelanggan ini</p>
                    </div>
                    <Badge variant="secondary" className="bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-50 text-xs shrink-0">
                      <Link2 className="h-3 w-3 mr-1" /> Linked
                    </Badge>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Belum ada akun piutang terhubung.</p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting}>
              Batal
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === 'create' ? 'Simpan Pelanggan' : 'Perbarui Pelanggan'}
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

export default function PelangganPage({ refreshKey, formMode, formProps }: PelangganPageProps) {
  if (formMode) {
    const isEdit = formProps?.id as string | undefined;
    // Untuk mode "link existing COA" — preselectedCoaId dikirim dari tombol Link di list
    const preselectedCoaId = formProps?.preselectedCoaId as string | undefined;
    const preselectedCoaKode = formProps?.preselectedCoaKode as string | undefined;
    const preselectedCoaNama = formProps?.preselectedCoaNama as string | undefined;
    return (
      <PelangganForm
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
                // di-fetch dari detail endpoint di useEffect PelangganForm.
              }
            : undefined
        }
        preselectedCoaId={preselectedCoaId}
        preselectedCoaKode={preselectedCoaKode}
        preselectedCoaNama={preselectedCoaNama}
      />
    );
  }
  return <PelangganListContent refreshKey={refreshKey} />;
}

function PelangganListContent({ refreshKey }: { refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab);

  // ── Data state ──
  const [data, setData] = useState<PelangganCOAItem[]>([]);
  const [total, setTotal] = useState(0);
  const [linkedCount, setLinkedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Filter / pagination state ──
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [skip, setSkip] = useState(0);

  // ── Delete dialog state ──
  const [deleteTarget, setDeleteTarget] = useState<PelangganCOAItem | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  // ── Reset page when search changes ──
  useEffect(() => {
    setSkip(0);
  }, [debouncedSearch]);

  // ── Fetch data from /master/pelanggan-coa ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<PelangganCOAItem[]>('/master/pelanggan-coa');
      const allData = Array.isArray(res) ? res : [];
      setData(allData);
      setTotal(allData.length);
      setLinkedCount(allData.filter((d) => d.isLinked).length);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Gagal memuat data pelanggan');
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
      result = result.filter((d) => (d.namaPelanggan || d.nama || '').toLowerCase().includes(q));
    }
    return result;
  }, [data, debouncedSearch]);

  const paginatedData = useMemo(() => {
    return filteredData.slice(skip, skip + PAGE_SIZE);
  }, [filteredData, skip]);

  // ── Pagination helpers ──
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
    if (!deleteTarget?.pelangganId) return;
    setDeleting(true);
    try {
      await api.delete<{ message: string }>(`/master/pelanggan/${deleteTarget.pelangganId}`);
      toast.success(`Pelanggan "${deleteTarget.namaPelanggan}" berhasil dinonaktifkan`);
      setDeleteTarget(null);
      fetchData();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.detail);
      } else {
        toast.error('Gagal menonaktifkan pelanggan');
      }
    } finally {
      setDeleting(false);
    }
  };

  // ── Reactivate helper ──
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  const handleReactivate = async (row: PelangganCOAItem) => {
    if (!row.pelangganId) return;
    setReactivatingId(row.pelangganId);
    try {
      await api.put<PelangganResponse>(`/master/pelanggan/${row.pelangganId}`, { status: 'AKTIF' });
      toast.success(`Pelanggan "${row.namaPelanggan || row.nama}" berhasil diaktifkan kembali`);
      fetchData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal mengaktifkan pelanggan');
    } finally {
      setReactivatingId(null);
    }
  };

  // ── Skeleton rows ──
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
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-28" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-32" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-20 rounded-full" />
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

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Pelanggan</h2>
          <p className="text-sm text-muted-foreground">{loading ? 'Memuat data...' : `${linkedCount} pelanggan terhubung akun piutang${data.some((d) => d.isLinked && !d.coaId) ? ` · ${data.filter((d) => d.isLinked && !d.coaId).length} belum punya akun piutang` : ''}`}</p>
        </div>
        <Button
          size="sm"
          className="gap-2"
          onClick={() =>
            openFormTab({
              title: 'Tambah Pelanggan',
              module: 'settings',
              subPage: 'pelanggan',
              formKey: 'pelanggan-create'
            })
          }>
          <Plus className="h-4 w-4" />
          Tambah Pelanggan
        </Button>
      </div>

      {/* ── Search bar ── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px] max-w-sm">
              <Label className="text-xs text-muted-foreground">Cari Nama Pelanggan</Label>
              <div className="relative mt-1.5">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Cari nama pelanggan..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
              </div>
            </div>
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
                  <TableHead className="whitespace-nowrap">Nama Akun / Pelanggan</TableHead>
                  <TableHead className="whitespace-nowrap">Kode Pelanggan</TableHead>
                  <TableHead className="whitespace-nowrap">Telepon</TableHead>
                  <TableHead className="whitespace-nowrap">Email</TableHead>
                  <TableHead className="whitespace-nowrap">NPWP</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <SkeletonRows />
                ) : paginatedData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-0">
                      {debouncedSearch ? (
                        <EmptyState icon={SearchX} title="Tidak ada hasil pencarian" description={`Tidak ada pelanggan yang cocok dengan "${debouncedSearch}". Coba kata kunci lain.`} />
                      ) : (
                        <EmptyState
                          icon={Users}
                          title="Belum ada data pelanggan"
                          description="Klik tombol di kanan atas untuk menambahkan pelanggan baru."
                          action={{
                            label: 'Tambah Pelanggan',
                            onClick: () =>
                              openFormTab({
                                title: 'Tambah Pelanggan',
                                module: 'settings',
                                subPage: 'pelanggan',
                                formKey: 'pelanggan-create'
                              })
                          }}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedData.map((row) => (
                    <TableRow key={row.pelangganId || row.coaId}>
                      <TableCell className="whitespace-nowrap font-mono font-medium text-xs">{row.kode || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap font-medium">{row.isLinked ? row.namaPelanggan || row.nama : <span className="text-muted-foreground italic">{row.nama}</span>}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">{row.kodePelanggan || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground text-xs">{row.telepon || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground text-xs">{row.email || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground text-xs">{row.npwp || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">{statusBadge(row.status)}</TableCell>
                      <TableCell className="whitespace-nowrap text-center">
                        <div className="inline-flex items-center gap-1">
                          {row.isLinked && row.pelangganId ? (
                            <>
                              {/* Edit existing pelanggan */}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() =>
                                  openFormTab({
                                    title: `Edit ${row.namaPelanggan || row.nama}`,
                                    module: 'settings',
                                    subPage: 'pelanggan',
                                    formKey: 'pelanggan-edit',
                                    formProps: {
                                      id: row.pelangganId,
                                      kode: row.kodePelanggan || '',
                                      nama: row.namaPelanggan || row.nama,
                                      alamat: row.alamat || '',
                                      telepon: row.telepon || '',
                                      email: row.email || '',
                                      kontakPerson: row.kontakPerson || '',
                                      npwp: row.npwp || '',
                                      syaratBayarDefault: row.syaratBayarDefault || ''
                                    }
                                  })
                                }
                                aria-label={`Edit ${row.namaPelanggan || row.nama}`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              {/* Reactivate (untuk NONAKTIF) atau Delete (untuk AKTIF) */}
                              {row.status === 'NONAKTIF' ? (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:text-emerald-700" onClick={() => handleReactivate(row)} disabled={reactivatingId === row.pelangganId} aria-label={`Aktifkan ${row.namaPelanggan || row.nama}`} title="Aktifkan kembali">
                                  {reactivatingId === row.pelangganId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                                </Button>
                              ) : (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(row)} aria-label={`Hapus ${row.namaPelanggan || row.nama}`}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </>
                          ) : (
                            // Link COA to new pelanggan
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-violet-600 hover:text-violet-700"
                              onClick={() =>
                                openFormTab({
                                  title: `Link Akun: ${row.nama}`,
                                  module: 'settings',
                                  subPage: 'pelanggan',
                                  formKey: 'pelanggan-create',
                                  formProps: {
                                    preselectedCoaId: row.coaId,
                                    preselectedCoaKode: row.kode,
                                    preselectedCoaNama: row.nama
                                  }
                                })
                              }
                              aria-label={`Link Akun ${row.nama}`}
                              title="Link ke pelanggan baru">
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

      {/* ══════ Delete Confirmation Dialog ══════ */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nonaktifkan Pelanggan</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menonaktifkan pelanggan <span className="font-semibold text-foreground">"{deleteTarget?.namaPelanggan}"</span> ({deleteTarget?.kodePelanggan})? Pelanggan yang dinonaktifkan tidak akan digunakan dalam transaksi baru namun data historis tetap tersimpan.
              <br />
              <br />
              <span className="text-xs">
                Catatan: Akun Piutang ({deleteTarget?.kode} — {deleteTarget?.nama}) tetap ada di Akun Perkiraan.
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
