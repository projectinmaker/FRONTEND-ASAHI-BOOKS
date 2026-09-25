'use client';

import { useAuthStore } from '@/store/auth-store';
import { COARulesForm, defaultRules } from './coa-rules';
import { isActive } from '@/lib/coa';
import type { COARules } from '@/types/api';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, Pencil, Trash2, Loader2, ChevronLeft, ChevronRight, Sparkles, FolderTree, SearchX } from 'lucide-react';
import { toast } from 'sonner';
import { useTabStore } from '@/store/tab-store';
import { FormTabShell } from '@/components/erp/form-tab-shell';

import { api, ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { COAResponse, COACreate, COAUpdate, HeaderCOA, SaldoAwalItem, SaldoAwalResponse, TingkatAkun } from '@/types/api';

// ─── Constants ──────────────────────────────────────────────────────────────

const HEADER_OPTIONS: HeaderCOA[] = ['AKTIVA', 'KEWAJIBAN', 'MODAL', 'PENDAPATAN', 'HPP', 'BEBAN'];

const TINGKAT_OPTIONS: TingkatAkun[] = ['HEADER', 'GROUP', 'DETAIL'];

const TINGKAT_LABEL: Record<TingkatAkun, string> = {
  HEADER: 'Akun Induk',
  GROUP: 'Sub Akun',
  DETAIL: 'DETAIL'
};

const TINGKAT_ORDER: Record<TingkatAkun, number> = {
  HEADER: 0,
  GROUP: 1,
  DETAIL: 2
};

const PAGE_SIZE = 100;

// ─── Badge helpers ──────────────────────────────────────────────────────────

const headerBadge = (header: HeaderCOA) => {
  const colorMap: Record<HeaderCOA, string> = {
    AKTIVA: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    KEWAJIBAN: 'bg-rose-100 text-rose-700 border-rose-200',
    MODAL: 'bg-purple-100 text-purple-700 border-purple-200',
    PENDAPATAN: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    HPP: 'bg-amber-100 text-amber-700 border-amber-200',
    BEBAN: 'bg-orange-100 text-orange-700 border-orange-200'
  };
  const cls = colorMap[header] || 'bg-gray-100 text-gray-700 border-gray-200';
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{header}</span>;
};

const tingkatBadge = (tingkat: TingkatAkun) => {
  const colorMap: Record<TingkatAkun, string> = {
    HEADER: 'bg-slate-100 text-slate-700 border-slate-300',
    GROUP: 'bg-sky-50 text-sky-700 border-sky-200',
    DETAIL: 'bg-gray-50 text-gray-600 border-gray-200'
  };
  const cls = colorMap[tingkat] || 'bg-gray-100 text-gray-700 border-gray-200';
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{TINGKAT_LABEL[tingkat]}</span>;
};

const statusBadge = (status: string) => {
  const cls = status === 'AKTIF' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-200';
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
};

const formatSaldo = (value: number) => new Intl.NumberFormat('id-ID').format(value);

// Tanggal lokal (bukan UTC) — default "as of" harus hari ini menurut zona user (WIB)
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ─── Form state type ───────────────────────────────────────────────────────

type FormMode = 'create' | 'edit';

interface FormState {
  kode: string;
  nama: string;
  header: HeaderCOA | '';
  tingkat: TingkatAkun | '';
  indukId: string;
  indukKode: string;
  jenisKasBank: string;
  saldoAwalDebit: string;
  saldoAwalKredit: string;
  tanggalSaldoAwal: string;
  akunLawanId: string;
}

const emptyForm: FormState = {
  kode: '',
  nama: '',
  header: '',
  tingkat: '',
  indukId: '',
  indukKode: '',
  jenisKasBank: '',
  saldoAwalDebit: '',
  saldoAwalKredit: '',
  tanggalSaldoAwal: todayIso(),
  akunLawanId: ''
};

interface COAPageProps {
  subPage?: string;
  refreshKey?: number;
  formMode?: string;
  formProps?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Form Component (rendered in tab)
// ═══════════════════════════════════════════════════════════════════════════

function COAForm({ mode, editId, initialData }: { mode: FormMode; editId?: string; initialData?: FormState }) {
  const admin = useAuthStore((s) => s.user?.role === 'ADMINISTRATOR');
  const [rules, setRules] = useState<COARules>({ ...defaultRules });
  const [rulesLoaded, setRulesLoaded] = useState(mode === 'create');
  useEffect(() => {
    if (mode !== 'edit' || !editId) return;
    let cancelled = false;
    api
      .get<COAResponse>('/coa/' + editId)
      .then((a) => {
        if (cancelled) return;
        const next: COARules = {};
        for (const key of Object.keys(defaultRules) as (keyof COARules)[]) Object.assign(next, { [key]: a[key] ?? defaultRules[key] });
        next.active = isActive(a);
        setRules(next);
        setRulesLoaded(true);
      })
      .catch((e) => {
        if (!cancelled) toast.error(e instanceof ApiError ? e.detail : 'Gagal memuat aturan akun. Buka ulang form.');
      });
    return () => {
      cancelled = true;
    };
  }, [mode, editId]);
  const [form, setForm] = useState<FormState>(initialData || emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  // ── Induk (parent) options ──
  const [indukOptions, setIndukOptions] = useState<COAResponse[]>([]);
  const [loadingInduk, setLoadingInduk] = useState(false);
  const [allCoa, setAllCoa] = useState<COAResponse[]>([]);
  const [saldoAwal, setSaldoAwal] = useState<SaldoAwalResponse | null>(null);
  const [loadingSaldoAwal, setLoadingSaldoAwal] = useState(true);

  useEffect(() => {
    let mounted = true;
    const loadSaldoAwal = async () => {
      try {
        const [coaRes, saldoRes] = await Promise.all([api.get<{ data: COAResponse[] }>('/coa/?limit=500'), api.get<SaldoAwalResponse>('/coa/saldo-awal')]);
        if (!mounted) return;
        setAllCoa(coaRes.data);
        setSaldoAwal(saldoRes);
        if (mode === 'edit' && editId) {
          const item = saldoRes.items.find((entry) => entry.akunPerkiraanId === editId);
          setForm((prev) => ({
            ...prev,
            saldoAwalDebit: item?.debit ? String(item.debit) : '',
            saldoAwalKredit: item?.kredit ? String(item.kredit) : '',
            tanggalSaldoAwal: saldoRes.tanggal || prev.tanggalSaldoAwal
          }));
        }
      } catch {
        if (mounted) toast.error('Gagal memuat data saldo awal');
      } finally {
        if (mounted) setLoadingSaldoAwal(false);
      }
    };
    loadSaldoAwal();
    return () => {
      mounted = false;
    };
  }, [editId, mode]);

  // ── Fetch induk options (filtered by header and tingkat < current) ──
  const fetchIndukOptions = useCallback(async (header: HeaderCOA, tingkat: TingkatAkun) => {
    if (tingkat === 'HEADER') {
      setIndukOptions([]);
      return;
    }
    setLoadingInduk(true);
    try {
      const validTingkat: TingkatAkun[] = tingkat === 'DETAIL' ? ['HEADER', 'GROUP'] : ['HEADER'];
      const params = new URLSearchParams();
      params.set('header', header);
      params.set('limit', '500');
      const res = await api.get<{ data: COAResponse[]; total: number; skip: number; limit: number }>(`/coa/?${params.toString()}`);
      const filtered = res.data.filter((coa) => validTingkat.includes(coa.tingkat));
      setIndukOptions(filtered);
    } catch {
      setIndukOptions([]);
    } finally {
      setLoadingInduk(false);
    }
  }, []);

  useEffect(() => {
    if (form.header && form.tingkat) {
      fetchIndukOptions(form.header as HeaderCOA, form.tingkat as TingkatAkun);
    } else {
      setIndukOptions([]);
    }
  }, [form.header, form.tingkat, fetchIndukOptions]);

  const title = mode === 'create' ? 'Tambah Akun Perkiraan' : 'Edit Akun Perkiraan';

  // ── Form change handlers ──
  const updateForm = (key: keyof FormState, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'tingkat' && value === 'HEADER') {
        next.indukId = '';
        next.indukKode = '';
      }
      if (key === 'header') {
        next.indukId = '';
        next.indukKode = '';
      }
      return next;
    });
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
        if (!trimmed) return 'Kode akun wajib diisi';
        if (trimmed.length < 3) return 'Kode akun minimal 3 karakter';
        return '';
      case 'nama':
        if (!trimmed) return 'Nama akun wajib diisi';
        if (trimmed.length < 3) return 'Nama akun minimal 3 karakter';
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
    if (!form.header) errors.header = 'Header wajib dipilih';
    if (!form.tingkat) errors.tingkat = 'Tingkat wajib dipilih';
    if (form.tingkat && form.tingkat !== 'HEADER' && !form.indukId) {
      errors.indukId = 'Sub akun wajib dipilih untuk tingkat Sub Akun / DETAIL';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleIndukChange = (value: string) => {
    const selected = indukOptions.find((opt) => opt.id === value);
    // Cek apakah parent yang dipilih adalah "Kas dan Setara Kas"
    const parentName = selected?.nama?.toLowerCase() || '';
    const isKasDanSetaraKas = parentName.includes('kas') && parentName.includes('setara');
    setForm((prev) => ({
      ...prev,
      indukId: selected?.id || '',
      indukKode: selected?.kode || '',
      // Reset jenisKasBank jika parent bukan "Kas dan Setara Kas"
      jenisKasBank: isKasDanSetaraKas ? prev.jenisKasBank : ''
    }));
  };

  const saveSaldoAwal = async (coa: COAResponse) => {
    const debit = Number(form.saldoAwalDebit || 0);
    const kredit = Number(form.saldoAwalKredit || 0);
    const existingItem = saldoAwal?.items.find((item) => item.akunPerkiraanId === coa.id);
    const oldDebit = existingItem?.debit || 0;
    const oldKredit = existingItem?.kredit || 0;

    if (debit === oldDebit && kredit === oldKredit) return;
    if (!Number.isFinite(debit) || !Number.isFinite(kredit) || debit < 0 || kredit < 0) {
      throw new Error('Saldo awal harus berupa angka nol atau lebih');
    }
    if (debit > 0 && kredit > 0) {
      throw new Error('Isi saldo awal pada sisi debit atau kredit saja');
    }
    if (!form.akunLawanId) {
      throw new Error('Pilih akun lawan agar jurnal saldo awal tetap balance');
    }
    if (form.akunLawanId === coa.id) {
      throw new Error('Akun lawan harus berbeda dari akun yang sedang diedit');
    }

    const akunLawan = allCoa.find((item) => item.id === form.akunLawanId);
    if (!akunLawan) throw new Error('Akun lawan tidak ditemukan');

    const items = [...(saldoAwal?.items || [])].map((item) => ({ ...item }));
    const upsert = (item: SaldoAwalItem) => {
      const index = items.findIndex((entry) => entry.akunPerkiraanId === item.akunPerkiraanId);
      if (index >= 0) items[index] = item;
      else items.push(item);
    };
    upsert({
      akunPerkiraanId: coa.id,
      kodeAkun: coa.kode,
      namaAkun: coa.nama,
      saldoNormal: coa.saldoNormal,
      debit,
      kredit
    });

    const existingLawan = items.find((item) => item.akunPerkiraanId === akunLawan.id);
    const lawanDebit = (existingLawan?.debit || 0) + (kredit - oldKredit);
    const lawanKredit = (existingLawan?.kredit || 0) + (debit - oldDebit);
    if (lawanDebit < 0 || lawanKredit < 0) {
      throw new Error('Perubahan ini mengurangi saldo akun lawan di bawah nol. Pilih akun lawan yang dipakai sebelumnya.');
    }
    upsert({
      akunPerkiraanId: akunLawan.id,
      kodeAkun: akunLawan.kode,
      namaAkun: akunLawan.nama,
      saldoNormal: akunLawan.saldoNormal,
      debit: lawanDebit,
      kredit: lawanKredit
    });

    await api.post<SaldoAwalResponse>('/coa/saldo-awal', {
      tanggal: form.tanggalSaldoAwal,
      items
    });
  };

  const handleSubmit = async () => {
    if (!rulesLoaded || (rules.isControlAccount && !rules.subledgerType)) {
      toast.error('Lengkapi aturan akun dan jenis subledger.');
      return;
    }
    if (!validateAll()) {
      toast.error('Periksa kembali isian formulir yang ditandai');
      return;
    }

    setSubmitting(true);
    try {
      const rulePayload = { ...rules, status: rules.active ? 'AKTIF' : 'NONAKTIF' };
      if (!admin) delete rulePayload.systemAccountType;
      if (mode === 'create') {
        const payload: COACreate = {
          kode: form.kode.trim(),
          nama: form.nama.trim(),
          header: form.header as HeaderCOA,
          tingkat: form.tingkat as TingkatAkun,
          saldoNormal: 'DEBIT',
          indukId: form.indukId || null,
          indukKode: form.indukKode || null,
          ...rulePayload,
          ...(form.jenisKasBank ? { jenisKasBank: form.jenisKasBank } : {})
        };
        const created = await api.post<COAResponse>('/coa/', payload);
        if (Number(form.saldoAwalDebit || 0) > 0 || Number(form.saldoAwalKredit || 0) > 0) {
          await saveSaldoAwal(created);
        }
        toast.success('Akun perkiraan berhasil ditambahkan');
      } else {
        if (!editId) return;
        const payload: COAUpdate = {
          ...rulePayload,
          nama: form.nama.trim(),
          indukId: form.indukId || null,
          indukKode: form.indukKode || null
        };
        const updated = await api.put<COAResponse>(`/coa/${editId}`, payload);
        await saveSaldoAwal(updated);
        toast.success('Akun perkiraan berhasil diperbarui');
      }
      refreshListTab('settings', 'coa');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : mode === 'create' ? 'Gagal menambahkan akun' : 'Gagal memperbarui akun');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormTabShell title={title}>
      <Card className="max-w-4xl">
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">{mode === 'create' ? 'Isi data di bawah untuk menambahkan akun baru ke chart of accounts.' : `Mengedit akun: ${form.kode} — ${form.nama}`}</p>

          <COARulesForm value={rules} onChange={setRules} admin={admin} disabled={submitting || !rulesLoaded} />
          {/* Kode */}
          <div className="space-y-2">
            <Label htmlFor="coa-kode">Kode Akun</Label>
            <Input id="coa-kode" placeholder="Contoh: 1-1100" value={form.kode} onChange={(e) => updateForm('kode', e.target.value)} onBlur={() => handleBlur('kode')} aria-invalid={!!formErrors.kode} className={formErrors.kode ? 'border-destructive focus-visible:ring-destructive' : ''} disabled={mode === 'edit'} />
            {formErrors.kode ? <p className="text-xs text-destructive mt-1">{formErrors.kode}</p> : mode === 'edit' ? <p className="text-[11px] text-muted-foreground">Kode akun tidak dapat diubah.</p> : null}
          </div>

          {/* Nama */}
          <div className="space-y-2">
            <Label htmlFor="coa-nama">Nama Akun</Label>
            <Input id="coa-nama" placeholder="Nama akun" value={form.nama} onChange={(e) => updateForm('nama', e.target.value)} onBlur={() => handleBlur('nama')} aria-invalid={!!formErrors.nama} className={formErrors.nama ? 'border-destructive focus-visible:ring-destructive' : ''} />
            {formErrors.nama && <p className="text-xs text-destructive mt-1">{formErrors.nama}</p>}
          </div>

          {/* Header & Tingkat */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Akun Induk</Label>
              <Select value={form.header} onValueChange={(v) => updateForm('header', v)} disabled={mode === 'edit'}>
                <SelectTrigger aria-invalid={!!formErrors.header} className={formErrors.header ? 'border-destructive focus-visible:ring-destructive' : ''}>
                  <SelectValue placeholder="Pilih akun induk" />
                </SelectTrigger>
                <SelectContent>
                  {HEADER_OPTIONS.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.header && <p className="text-xs text-destructive mt-1">{formErrors.header}</p>}
            </div>

            <div className="space-y-2">
              <Label>Tingkat</Label>
              <Select value={form.tingkat} onValueChange={(v) => updateForm('tingkat', v)} disabled={mode === 'edit'}>
                <SelectTrigger aria-invalid={!!formErrors.tingkat} className={formErrors.tingkat ? 'border-destructive focus-visible:ring-destructive' : ''}>
                  <SelectValue placeholder="Pilih tingkat" />
                </SelectTrigger>
                <SelectContent>
                  {TINGKAT_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TINGKAT_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.tingkat && <p className="text-xs text-destructive mt-1">{formErrors.tingkat}</p>}
            </div>
          </div>

          {/* Induk (parent) — only for Sub Akun / DETAIL */}
          {form.tingkat && form.tingkat !== 'HEADER' && (
            <div className="space-y-2">
              <Label>Sub Akun</Label>
              <SearchableDropdown
                value={form.indukId}
                onValueChange={handleIndukChange}
                options={indukOptions.map((opt) => ({
                  id: opt.id,
                  label: opt.kode + ' — ' + opt.nama,
                  subtitle: opt.header
                }))}
                placeholder="Pilih sub akun"
                loading={loadingInduk}
              />
              {formErrors.indukId && <p className="text-xs text-destructive mt-1">{formErrors.indukId}</p>}
            </div>
          )}

          {/* Jenis Kas/Bank — muncul ketika parent (sub akun) yang dipilih adalah "Kas dan Setara Kas" */}
          {mode === 'create' &&
            (() => {
              const selectedInduk = indukOptions.find((opt) => opt.id === form.indukId);
              const parentName = selectedInduk?.nama?.toLowerCase() || '';
              const isKasDanSetaraKas = parentName.includes('kas') && parentName.includes('setara');
              return isKasDanSetaraKas;
            })() && (
              <div className="space-y-2">
                <Label>Jenis Kas/Bank</Label>
                <Select value={form.jenisKasBank} onValueChange={(v) => updateForm('jenisKasBank', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih jenis kas/bank" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="KAS">KAS</SelectItem>
                    <SelectItem value="BANK">BANK</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Pilih jenis kas atau bank untuk akun di bawah "Kas dan Setara Kas".</p>
              </div>
            )}

          <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
            <div>
              <Label className="text-sm font-medium">Saldo Awal</Label>
              <p className="mt-1 text-xs text-muted-foreground">Saldo awal dicatat sebagai jurnal berpasangan. Isi salah satu sisi dan pilih akun lawannya agar tetap balance.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="coa-saldo-debit">Debit</Label>
                <Input id="coa-saldo-debit" type="number" min="0" step="0.01" placeholder="0" value={form.saldoAwalDebit} onChange={(e) => updateForm('saldoAwalDebit', e.target.value)} disabled={loadingSaldoAwal} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coa-saldo-kredit">Kredit</Label>
                <Input id="coa-saldo-kredit" type="number" min="0" step="0.01" placeholder="0" value={form.saldoAwalKredit} onChange={(e) => updateForm('saldoAwalKredit', e.target.value)} disabled={loadingSaldoAwal} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coa-tanggal-saldo-awal">Tanggal Saldo Awal</Label>
                <Input id="coa-tanggal-saldo-awal" type="date" value={form.tanggalSaldoAwal} onChange={(e) => updateForm('tanggalSaldoAwal', e.target.value)} disabled={loadingSaldoAwal} />
              </div>
            </div>
            {(Number(form.saldoAwalDebit || 0) > 0 || Number(form.saldoAwalKredit || 0) > 0 || saldoAwal?.items.some((item) => item.akunPerkiraanId === editId && (item.debit > 0 || item.kredit > 0))) && (
              <div className="space-y-2">
                <Label>Akun Lawan Saldo Awal</Label>
                <SearchableDropdown value={form.akunLawanId} onValueChange={(value) => updateForm('akunLawanId', value)} options={allCoa.filter((item) => item.id !== editId && item.tingkat === 'DETAIL').map((item) => ({ id: item.id, label: `${item.kode} — ${item.nama}`, subtitle: item.header }))} placeholder="Pilih akun lawan" loading={loadingSaldoAwal} />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting}>
              Batal
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === 'create' ? 'Simpan Akun' : 'Perbarui Akun'}
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

export default function COAPage({ refreshKey, formMode, formProps }: COAPageProps) {
  if (formMode) {
    const isEdit = formProps?.id as string | undefined;
    return (
      <COAForm
        mode={isEdit ? 'edit' : 'create'}
        editId={isEdit}
        initialData={
          isEdit
            ? {
                kode: (formProps?.kode as string) || '',
                nama: (formProps?.nama as string) || '',
                header: (formProps?.header as HeaderCOA) || '',
                tingkat: (formProps?.tingkat as TingkatAkun) || '',
                indukId: (formProps?.indukId as string) || '',
                indukKode: (formProps?.indukKode as string) || '',
                jenisKasBank: (formProps?.jenisKasBank as string) || '',
                saldoAwalDebit: '',
                saldoAwalKredit: '',
                tanggalSaldoAwal: todayIso(),
                akunLawanId: ''
              }
            : undefined
        }
      />
    );
  }
  return <COAListContent refreshKey={refreshKey} />;
}

function COAListContent({ refreshKey }: { refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab);

  // ── Data state ──
  const [data, setData] = useState<COAResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Delete dialog state ──
  const [deleteTarget, setDeleteTarget] = useState<COAResponse | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Filter / pagination state ──
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterHeader, setFilterHeader] = useState<string>('');
  const [filterTingkat, setFilterTingkat] = useState<string>('');
  const [skip, setSkip] = useState(0);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [search]);

  // ── Fetch COA data ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('skip', String(skip));
      params.set('limit', String(PAGE_SIZE));
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (filterHeader) params.set('header', filterHeader);
      if (filterTingkat) params.set('tingkat', filterTingkat);

      const res = await api.get<{ data: COAResponse[]; total: number; skip: number; limit: number }>(`/coa/?${params.toString()}`);
      setData(res.data);
      setTotal(res.total);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Gagal memuat data akun perkiraan');
      }
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filterHeader, filterTingkat, skip]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  // ── Reset page when filters change ──
  useEffect(() => {
    setSkip(0);
  }, [debouncedSearch, filterHeader, filterTingkat]);

  // ── Delete handler ──
  const executeDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete<{ message: string }>(`/coa/${deleteTarget.id}`);
      toast.success(`Akun "${deleteTarget.nama}" (${deleteTarget.kode}) berhasil dihapus`);
      setDeleteTarget(null);
      fetchData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal menghapus akun');
    } finally {
      setDeleting(false);
    }
  };

  // ── Pagination helpers ──
  const currentPage = Math.floor(skip / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasNext = skip + PAGE_SIZE < total;
  const hasPrev = skip > 0;

  const goToNext = () => {
    if (hasNext) setSkip((s) => s + PAGE_SIZE);
  };
  const goToPrev = () => {
    if (hasPrev) setSkip((s) => s - PAGE_SIZE);
  };

  // ── Clear filters ──
  const clearFilters = () => {
    setSearch('');
    setFilterHeader('');
    setFilterTingkat('');
    setSkip(0);
  };

  const hasActiveFilters = !!debouncedSearch || !!filterHeader || !!filterTingkat;

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
            <Skeleton className="h-5 w-16 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-16 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-16" />
          </TableCell>
          <TableCell className="text-right">
            <Skeleton className="h-4 w-24 ml-auto" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-16 rounded-full" />
          </TableCell>
          <TableCell className="text-center">
            <Skeleton className="h-8 w-8 rounded" />
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
          <h2 className="text-lg font-semibold">Akun Perkiraan</h2>
          <p className="text-sm text-muted-foreground">{loading ? 'Memuat data...' : `${total} akun perkiraan`}</p>
        </div>
        <Button
          size="sm"
          className="gap-2"
          onClick={() =>
            openFormTab({
              title: 'Tambah Akun',
              module: 'settings',
              subPage: 'coa',
              formKey: 'coa-create'
            })
          }>
          <Plus className="h-4 w-4" />
          Tambah Akun
        </Button>
      </div>

      {/* ── Filter bar ── */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
              <Label className="text-xs text-muted-foreground">Cari Kode / Nama</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Cari akun..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Akun Induk</Label>
              <Select value={filterHeader} onValueChange={(v) => setFilterHeader(v === '__all__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Semua Akun Induk" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua Akun Induk</SelectItem>
                  {HEADER_OPTIONS.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tingkat</Label>
              <Select value={filterTingkat} onValueChange={(v) => setFilterTingkat(v === '__all__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Semua Tingkat" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua Tingkat</SelectItem>
                  {TINGKAT_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TINGKAT_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              {hasActiveFilters && (
                <Button variant="outline" size="sm" className="w-full" onClick={clearFilters}>
                  Reset Filter
                </Button>
              )}
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
                  <TableHead className="whitespace-nowrap">Nama Akun</TableHead>
                  <TableHead className="whitespace-nowrap">Akun Induk</TableHead>
                  <TableHead className="whitespace-nowrap">Tingkat</TableHead>
                  <TableHead className="whitespace-nowrap">Induk Kode</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Saldo</TableHead>
                  <TableHead className="whitespace-nowrap">Aktif</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <SkeletonRows />
                ) : data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-0">
                      {hasActiveFilters ? (
                        <EmptyState icon={SearchX} title="Tidak ada hasil filter" description="Tidak ada akun yang sesuai dengan filter yang dipilih. Coba ubah filter pencarian." />
                      ) : (
                        <EmptyState
                          icon={FolderTree}
                          title="Belum ada data akun perkiraan"
                          description="Klik tombol di kanan atas untuk menambahkan akun perkiraan baru."
                          action={{
                            label: 'Tambah Akun',
                            onClick: () =>
                              openFormTab({
                                title: 'Tambah Akun Perkiraan',
                                module: 'settings',
                                subPage: 'coa',
                                formKey: 'coa-create'
                              })
                          }}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((row) => {
                    const isHeader = row.tingkat === 'HEADER';
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap font-mono font-medium">{row.kode}</TableCell>
                        <TableCell className={`whitespace-nowrap ${isHeader ? 'font-bold text-xs uppercase tracking-wider' : ''}`}>{row.nama}</TableCell>
                        <TableCell className="whitespace-nowrap">{headerBadge(row.header)}</TableCell>
                        <TableCell className="whitespace-nowrap">{tingkatBadge(row.tingkat)}</TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-muted-foreground">{row.indukKode || '-'}</TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">Rp {formatSaldo(row.saldo)}</TableCell>
                        <TableCell className="whitespace-nowrap">{statusBadge(isActive(row) ? 'AKTIF' : 'NONAKTIF')}</TableCell>
                        <TableCell className="whitespace-nowrap text-center">
                          {(() => {
                            const locked = row.isSystemAccount || row.isLegacyLocked;
                            const lockHint = locked ? 'Akun sistem/legacy tidak bisa diedit atau dihapus. Gunakan tombol nonaktifkan (toggle Aktif) untuk menyembunyikan dari transaksi baru.' : `Edit ${row.nama}`;
                            return (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() =>
                                    openFormTab({
                                      title: `Edit ${row.nama}`,
                                      module: 'settings',
                                      subPage: 'coa',
                                      formKey: 'coa-edit',
                                      formProps: { id: row.id, kode: row.kode, nama: row.nama, header: row.header, tingkat: row.tingkat, indukId: row.indukId || '', indukKode: row.indukKode || '', jenisKasBank: row.jenisKasBank || '' }
                                    })
                                  }
                                  aria-label={`Edit ${row.nama}`}
                                  disabled={locked}
                                  title={lockHint}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(row)} aria-label={`Hapus ${row.nama}`} disabled={!isActive(row) || locked} title={locked ? lockHint : `Hapus ${row.nama}`}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            );
                          })()}
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

      {/* ── Pagination ── */}
      {!loading && total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Menampilkan {skip + 1}–{Math.min(skip + PAGE_SIZE, total)} dari {total} akun (Halaman {currentPage} dari {totalPages})
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
            <AlertDialogTitle>Hapus Akun Perkiraan</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus akun <span className="font-semibold text-foreground">"{deleteTarget?.nama}"</span> ({deleteTarget?.kode})? Akun yang sudah memiliki transaksi/jurnal tidak bisa dihapus.
              <br />
              <br />
              <span className="text-xs">Catatan: Akun induk (HEADER/GROUP) tidak bisa dihapus jika masih memiliki sub-akun. Nonaktifkan akun jika hanya ingin menyembunyikannya dari transaksi baru.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2">
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
