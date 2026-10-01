'use client';

import { isActive, loadAccountTypes, loadParents, previewCOA, matchAccountTypeTemplate, accountClassLabel, financialStatementLabel, tingkatLabel, yaTidak } from '@/lib/coa';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Search, Pencil, Trash2, Loader2, ChevronLeft, ChevronRight, FolderTree, SearchX, RefreshCw, Check, ChevronsUpDown, AlertTriangle, Info, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { classifyCoaCategory, getCoaCategoryInfo, isSaldoAwalEligible } from '@/lib/coa-category';
import { useTabStore } from '@/store/tab-store';
import { FormTabShell } from '@/components/erp/form-tab-shell';

import { api, ApiError } from '@/lib/api';
import { formatNumberIDR } from '@/lib/money';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { COAResponse, COACreate, COAUpdate, AccountTypeTemplate, COAParentOption, COAPreviewRequest, COAPreviewResponse, HeaderCOA, SaldoAwalItemInput, SaldoAwalResponse, TingkatAkun } from '@/types/api';

// ─── Constants ──────────────────────────────────────────────────────────────

const HEADER_OPTIONS: HeaderCOA[] = ['AKTIVA', 'KEWAJIBAN', 'MODAL', 'PENDAPATAN', 'HPP', 'BEBAN'];

const TINGKAT_OPTIONS: TingkatAkun[] = ['HEADER', 'GROUP', 'DETAIL'];

const TINGKAT_LABEL: Record<TingkatAkun, string> = {
  HEADER: 'Akun Induk',
  GROUP: 'Sub Akun',
  DETAIL: 'DETAIL'
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

const formatSaldo = (value: number) => formatNumberIDR(value);

// Tanggal lokal (bukan UTC) — default "as of" harus hari ini menurut zona user (WIB)
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ─── Form state type ───────────────────────────────────────────────────────

type FormMode = 'create' | 'edit';

type StructuralType = 'GROUP' | 'DETAIL';

interface COAFormState {
  typeCode: string;
  isSub: boolean;
  structuralType: StructuralType;
  indukId: string;
  nama: string;
  kode: string;
  /** true bila user mengetik kode manual (bukan usulan otomatis). */
  kodeManual: boolean;
  status: 'AKTIF' | 'NONAKTIF';
  jenisKasBank: string;
  // ── Saldo awal (satu nilai; sisi debit/kredit otomatis dari saldo normal akun) ──
  saldoAwalNilai: string;
  tanggalSaldoAwal: string;
}

const emptyCreateForm: COAFormState = {
  typeCode: '',
  isSub: true,
  structuralType: 'DETAIL',
  indukId: '',
  nama: '',
  kode: '',
  kodeManual: false,
  status: 'AKTIF',
  jenisKasBank: '',
  saldoAwalNilai: '',
  tanggalSaldoAwal: todayIso()
};

interface COAPageProps {
  subPage?: string;
  refreshKey?: number;
  formMode?: string;
  formProps?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// ParentPicker — searchable dropdown akun induk (GET /coa/parents).
// Search di sisi server (query param `search`); parent recommended=true
// ditampilkan paling atas dengan badge "Direkomendasikan".
// ═══════════════════════════════════════════════════════════════════════════

interface ParentPickerProps {
  typeCode: string;
  value: string;
  selected: COAParentOption | null;
  onChange: (opt: COAParentOption) => void;
  excludeId?: string;
  disabled?: boolean;
  invalid?: boolean;
}

function ParentPicker({ typeCode, value, selected, onChange, excludeId, disabled, invalid }: ParentPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [options, setOptions] = useState<COAParentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const reqSeq = useRef(0);

  // Debounce ketikan → refetch dengan query param search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // CATATAN: reset internal saat tipe berganti ditangani lewat key={typeCode}
  // di usage site (remount) — jadi tidak perlu effect reset di sini.

  // Fetch parents saat popover terbuka / tipe / search berubah.
  // setState dibungkus queueMicrotask supaya tidak synchronous di body effect
  // (hindari cascading render).
  useEffect(() => {
    if (!open || !typeCode) return;
    const seq = ++reqSeq.current;
    queueMicrotask(() => {
      if (seq !== reqSeq.current) return;
      setLoading(true);
      setFetchError(null);
      loadParents(typeCode, { excludeId, search: debouncedSearch || undefined })
        .then((res) => {
          if (seq === reqSeq.current) setOptions(res);
        })
        .catch((e) => {
          if (seq === reqSeq.current) setFetchError(e instanceof ApiError ? e.detail : 'Gagal memuat daftar akun induk');
        })
        .finally(() => {
          if (seq === reqSeq.current) setLoading(false);
        });
    });
  }, [open, typeCode, excludeId, debouncedSearch]);

  const renderOption = (opt: COAParentOption) => (
    <CommandItem
      key={opt.id}
      value={`${opt.kode} ${opt.nama}`}
      onSelect={() => {
        onChange(opt);
        setOpen(false);
      }}>
      <Check className={cn('mr-2 h-4 w-4 shrink-0', value === opt.id ? 'opacity-100' : 'opacity-0')} />
      <div className="flex flex-1 flex-col">
        <span className="text-sm font-mono">
          {opt.kode} <span className="font-sans">— {opt.nama}</span>
        </span>
        <span className="text-[11px] text-muted-foreground">
          {tingkatLabel(opt.tingkat)}
          {opt.accountSubclass ? ` · ${opt.accountSubclass}` : ''}
        </span>
      </div>
      {opt.recommended && (
        <Badge variant="outline" className="ml-2 shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700">
          Direkomendasikan
        </Badge>
      )}
    </CommandItem>
  );

  const recommended = options.filter((o) => o.recommended);
  const others = options.filter((o) => !o.recommended);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (!o) setSearch('');
        setOpen(o);
      }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled || loading} className={cn('w-full justify-between font-normal', !selected && 'text-muted-foreground', invalid && 'border-destructive focus-visible:ring-destructive')}>
          <span className="truncate">{selected ? `${selected.kode} — ${selected.nama}` : 'Pilih akun induk…'}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={search} onValueChange={setSearch} placeholder="Cari kode / nama akun induk…" />
          <CommandList>
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Memuat akun induk…
              </div>
            ) : fetchError ? (
              <div className="px-3 py-6 text-center text-sm text-destructive">{fetchError}</div>
            ) : options.length === 0 ? (
              <CommandEmpty>Tidak ada akun induk yang cocok untuk tipe akun ini.</CommandEmpty>
            ) : (
              <>
                {recommended.length > 0 && <CommandGroup heading="Direkomendasikan">{recommended.map(renderOption)}</CommandGroup>}
                {others.length > 0 && <CommandGroup heading={recommended.length > 0 ? 'Lainnya' : 'Akun Induk'}>{others.map(renderOption)}</CommandGroup>}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DerivationRow — baris read-only di tab "Pengaturan Lanjutan".
// Nilai diturunkan server (preview / nilai aktual akun) — bukan input bebas.
// ═══════════════════════════════════════════════════════════════════════════

function DerivationRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-background p-3 space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm font-medium break-words">{children}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Form Component (rendered in tab) — pola Accurate 2 tab:
// 1. Informasi Umum      → input bisnis (tipe, induk, kode, nama, dsb.)
// 2. Pengaturan Lanjutan → derivasi read-only dari registry server.
// ═══════════════════════════════════════════════════════════════════════════

function COAForm({ mode, editId }: { mode: FormMode; editId?: string }) {
  const [form, setForm] = useState<COAFormState>(emptyCreateForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  // ── Registry tipe akun (GET /coa/account-types) ──
  const [accountTypes, setAccountTypes] = useState<AccountTypeTemplate[]>([]);
  const [typesLoading, setTypesLoading] = useState(true);
  const [typesError, setTypesError] = useState<string | null>(null);
  const [typesRetry, setTypesRetry] = useState(0);

  // ── Akun induk terpilih (untuk display di picker) ──
  const [indukSelected, setIndukSelected] = useState<COAParentOption | null>(null);

  // ── Preview derivasi (POST /coa/preview) ──
  const [preview, setPreview] = useState<COAPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [regenKey, setRegenKey] = useState(0);

  // ── Edit mode ──
  const [editAccount, setEditAccount] = useState<COAResponse | null>(null);
  const [editLoading, setEditLoading] = useState(mode === 'edit');
  const [serverLockError, setServerLockError] = useState<string | null>(null);

  // ── Saldo awal (jurnal berpasangan) ──
  const [allCoa, setAllCoa] = useState<COAResponse[]>([]);
  const [saldoAwal, setSaldoAwal] = useState<SaldoAwalResponse | null>(null);
  const [loadingSaldoAwal, setLoadingSaldoAwal] = useState(true);

  const title = mode === 'create' ? 'Tambah Akun Perkiraan' : 'Edit Akun Perkiraan';
  const selectedTemplate = accountTypes.find((t) => t.typeCode === form.typeCode) || null;

  // ── Fetch daftar tipe akun (dipakai create & edit — label tipe) ──
  useEffect(() => {
    let cancelled = false;
    setTypesLoading(true);
    loadAccountTypes()
      .then((res) => {
        if (cancelled) return;
        setAccountTypes(res);
        setTypesError(null);
      })
      .catch((e) => {
        if (!cancelled) setTypesError(e instanceof ApiError ? e.detail : 'Gagal memuat daftar tipe akun');
      })
      .finally(() => {
        if (!cancelled) setTypesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [typesRetry]);

  // ── Edit: muat akun existing (GET /coa/{id}) ──
  useEffect(() => {
    if (mode !== 'edit' || !editId) return;
    let cancelled = false;
    setEditLoading(true);
    api
      .get<COAResponse>('/coa/' + editId)
      .then((a) => {
        if (cancelled) return;
        setEditAccount(a);
        setForm((prev) => ({
          ...prev,
          nama: a.nama,
          kode: a.kode,
          typeCode: '',
          isSub: !!a.indukId || a.tingkat === 'DETAIL',
          structuralType: a.tingkat === 'DETAIL' ? 'DETAIL' : 'GROUP',
          status: isActive(a) ? 'AKTIF' : 'NONAKTIF',
          jenisKasBank: a.jenisKasBank || ''
        }));
      })
      .catch((e) => {
        if (!cancelled) toast.error(e instanceof ApiError ? e.detail : 'Gagal memuat data akun. Buka ulang form.');
      })
      .finally(() => {
        if (!cancelled) setEditLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, editId]);

  // ── Saldo awal + daftar COA (validasi kelayakan item lain saat simpan) ──
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
          const nilai = (item?.nilai ?? (item?.debit || item?.kredit)) || 0;
          setForm((prev) => ({
            ...prev,
            saldoAwalNilai: nilai > 0 ? String(nilai) : '',
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

  // ── Preview derivasi (POST /coa/preview) — auto, debounce ringan ──
  // Trigger: ganti tipe akun / akun induk / toggle sub akun / struktur /
  // edit kode manual / jenis kas-bank / tombol Regenerate.
  const previewKode = form.kodeManual ? form.kode.trim() : '';
  const previewSeq = useRef(0);
  useEffect(() => {
    if (mode !== 'create') return;
    if (!form.typeCode || (form.isSub && !form.indukId)) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    const seq = ++previewSeq.current;
    const timer = setTimeout(() => {
      const request: COAPreviewRequest = {
        typeCode: form.typeCode,
        isSub: form.isSub,
        indukId: form.isSub && form.indukId ? form.indukId : null,
        structuralType: form.isSub ? null : form.structuralType,
        kode: previewKode || null,
        jenisKasBank: form.jenisKasBank || null
      };
      setPreviewLoading(true);
      previewCOA(request)
        .then((res) => {
          if (seq !== previewSeq.current) return; // abaikan respons basi
          setPreview(res);
          setPreviewError(null);
          // Auto-terisi kode usulan (selama user tidak sedang edit manual)
          if (res.kodeGenerated && res.kode) {
            const autoKode = res.kode;
            setForm((prev) => (prev.kodeManual || prev.kode === autoKode ? prev : { ...prev, kode: autoKode }));
          }
        })
        .catch((e) => {
          if (seq !== previewSeq.current) return;
          setPreview(null);
          setPreviewError(e instanceof ApiError ? e.detail : 'Gagal memuat preview akun');
        })
        .finally(() => {
          if (seq === previewSeq.current) setPreviewLoading(false);
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [mode, form.typeCode, form.isSub, form.indukId, form.structuralType, previewKode, form.jenisKasBank, regenKey]);

  // ── Handlers ──
  const handleTypeChange = (v: string) => {
    setForm((prev) => ({ ...prev, typeCode: v, indukId: '', kode: '', kodeManual: false, jenisKasBank: '' }));
    setIndukSelected(null);
    setPreview(null);
    setPreviewError(null);
    setFormErrors((prev) => {
      const next = { ...prev };
      delete next.typeCode;
      delete next.indukId;
      delete next.kode;
      return next;
    });
  };

  const handleSubToggle = (checked: boolean) => {
    setForm((prev) => ({ ...prev, isSub: checked, ...(checked ? {} : { indukId: '' }) }));
    if (!checked) setIndukSelected(null);
  };

  const handleIndukChange = (opt: COAParentOption) => {
    setForm((prev) => ({ ...prev, indukId: opt.id }));
    setIndukSelected(opt);
    setFormErrors((prev) => {
      const next = { ...prev };
      delete next.indukId;
      return next;
    });
  };

  const handleKodeChange = (v: string) => {
    // Kosong = kembali ke mode otomatis (kode usulan dari server)
    setForm((prev) => ({ ...prev, kode: v, kodeManual: v.trim() !== '' }));
    setFormErrors((prev) => {
      const next = { ...prev };
      delete next.kode;
      return next;
    });
  };

  const handleRegenerate = () => {
    // Buang override manual → kode usulan otomatis diambil ulang dari server
    setForm((prev) => (prev.kodeManual ? { ...prev, kode: '', kodeManual: false } : prev));
    setRegenKey((k) => k + 1);
  };

  const validateAll = (): boolean => {
    const errors: Record<string, string> = {};
    const nama = form.nama.trim();
    if (!nama) errors.nama = 'Nama akun wajib diisi';
    else if (nama.length < 3) errors.nama = 'Nama akun minimal 3 karakter';
    if (mode === 'create') {
      if (!form.typeCode) errors.typeCode = 'Tipe akun wajib dipilih';
      if (form.isSub && !form.indukId) errors.indukId = 'Akun induk wajib dipilih untuk sub akun';
      if (!form.isSub && !form.kode.trim()) errors.kode = 'Kode akun wajib diisi manual untuk akun level root';
      if (form.kode.trim() && form.kode.trim().length < 3) errors.kode = 'Kode akun minimal 3 karakter';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── Preview warnings/errors ──
  const blockingErrors = [...(preview?.errors ?? []), ...(previewError ? [previewError] : [])];
  const previewWarnings = preview?.warnings ?? [];
  const kodeOtomatis = !!preview?.kodeGenerated && !form.kodeManual;
  const formIncomplete = mode === 'create' && (!form.typeCode || (form.isSub && !form.indukId) || !form.nama.trim() || (!form.isSub && !form.kode.trim()));
  const saveDisabled = submitting || editLoading || formIncomplete || (mode === 'create' && blockingErrors.length > 0);

  // ── Edit helpers (tipe & induk read-only) ──
  const editTypeLabel = editAccount ? (matchAccountTypeTemplate(editAccount, accountTypes)?.displayName ?? (editAccount.accountSubclass ? `Subkelas: ${editAccount.accountSubclass}` : 'Klasifikasi manual/legacy')) : 'Memuat…';
  const editParentLabel = editAccount ? (editAccount.indukKode ? `${editAccount.indukKode} — induk saat ini` : 'Akun level root (tanpa induk)') : '—';
  const showJenisKasBank = mode === 'create' ? !!selectedTemplate?.requiresJenisKasBank : !!editAccount && (editAccount.accountSubclass === 'CASH_BANK' || !!editAccount.jenisKasBank);

  // ── Kategori akun & kelayakan saldo awal (hanya 9 kategori didukung) ──
  // Kategori: Kas dan Bank, Aset Lancar Lainnya, Kewajiban Lainnya, Modal,
  // Pendapatan, HPP, Beban, Pendapatan Lainnya, Beban Lainnya. Kategori lain
  // (Piutang Usaha, Persediaan, Aset Tetap, Hutang Usaha, saldo laba, dll.)
  // dinonaktifkan + dialihkan ke modul terkait.
  const saldoAwalCategory =
    mode === 'edit'
      ? editAccount
        ? classifyCoaCategory({ kode: editAccount.kode, indukKode: editAccount.indukKode, accountSubclass: editAccount.accountSubclass, systemAccountType: editAccount.systemAccountType })
        : null
      : classifyCoaCategory({
          typeCode: form.typeCode || null,
          kode: form.kodeManual ? form.kode.trim() : null,
          indukKode: indukSelected?.kode ?? preview?.indukKode ?? null,
          accountSubclass: preview?.accountSubclass ?? selectedTemplate?.accountSubclass ?? null,
          systemAccountType: preview?.systemAccountType ?? null
        });
  const saldoAwalInfo = getCoaCategoryInfo(saldoAwalCategory);
  const createTingkat: TingkatAkun | undefined = preview?.tingkat ?? (form.isSub ? 'DETAIL' : form.structuralType);
  const tingkatIsDetail = mode === 'edit' ? editAccount?.tingkat === 'DETAIL' : createTingkat === 'DETAIL';
  const saldoAwalEligible = !!saldoAwalInfo?.saldoAwalEligible && tingkatIsDetail && form.status === 'AKTIF';
  const saldoNormalDisplay = (mode === 'edit' ? editAccount?.saldoNormal : (preview?.saldoNormal ?? selectedTemplate?.saldoNormal ?? saldoAwalInfo?.saldoNormal ?? null)) || null;
  const saldoSekarang = mode === 'edit' ? (editAccount?.saldo ?? 0) : 0;

  // Kelayakan berubah (ganti tipe akun / induk / status) → kosongkan nilai yang belum tersimpan
  useEffect(() => {
    if (!saldoAwalEligible) setForm((prev) => (prev.saldoAwalNilai ? { ...prev, saldoAwalNilai: '' } : prev));
  }, [saldoAwalEligible]);

  // ── Simpan saldo awal (satu nilai; jurnal auto-balance oleh sistem) ──
  const saveSaldoAwal = async (coa: COAResponse) => {
    const nilai = Number(form.saldoAwalNilai || 0);
    const existingItem = saldoAwal?.items.find((item) => item.akunPerkiraanId === coa.id);
    const oldNilai = existingItem?.nilai ?? 0;

    if (nilai === oldNilai) return;
    if (!Number.isFinite(nilai) || nilai < 0) {
      throw new Error('Saldo awal harus berupa angka nol atau lebih');
    }

    // Saldo awal akun lain dipertahankan; hanya item yang kategorinya masih
    // didukung yang ikut dikirim (sisi & balancing ditangani server).
    const items: SaldoAwalItemInput[] = [];
    for (const item of saldoAwal?.items ?? []) {
      if (item.akunPerkiraanId === coa.id) continue;
      const itemNilai = item.nilai ?? (item.debit || item.kredit);
      if (!itemNilai || itemNilai <= 0) continue;
      const akun = allCoa.find((entry) => entry.id === item.akunPerkiraanId);
      if (!akun || akun.tingkat !== 'DETAIL') continue;
      const key = classifyCoaCategory({ kode: akun.kode, indukKode: akun.indukKode, accountSubclass: akun.accountSubclass, systemAccountType: akun.systemAccountType });
      if (!isSaldoAwalEligible(key)) continue;
      items.push({ akunPerkiraanId: item.akunPerkiraanId, nilai: itemNilai });
    }
    if (nilai > 0) items.push({ akunPerkiraanId: coa.id, nilai });

    await api.post<SaldoAwalResponse>('/coa/saldo-awal', {
      tanggal: form.tanggalSaldoAwal,
      items
    });
  };

  // ── Submit ──
  const handleSubmit = async () => {
    if (mode === 'create' && blockingErrors.length > 0) {
      toast.error('Masih ada masalah yang harus diperbaiki sebelum menyimpan');
      return;
    }
    if (!validateAll()) {
      toast.error('Periksa kembali isian formulir yang ditandai');
      return;
    }

    setSubmitting(true);
    setServerLockError(null);
    try {
      if (mode === 'create') {
        // Mode baru (typeCode): klasifikasi header/tingkat/saldoNormal diderivasi
        // server dari template registry — JANGAN kirim manual.
        const payload: COACreate = {
          typeCode: form.typeCode,
          isSub: form.isSub,
          nama: form.nama.trim(),
          status: form.status
        };
        if (form.isSub) payload.indukId = form.indukId;
        else payload.structuralType = form.structuralType;
        if (form.kode.trim()) payload.kode = form.kode.trim();
        if (form.jenisKasBank) payload.jenisKasBank = form.jenisKasBank;

        const created = await api.post<COAResponse>('/coa/', payload);
        if (saldoAwalEligible && Number(form.saldoAwalNilai || 0) > 0) {
          await saveSaldoAwal(created);
        }
        toast.success('Akun perkiraan berhasil ditambahkan');
      } else {
        if (!editId) return;
        // Update hanya field non-structural: nama + status/active.
        // (jenisKasBank tidak dapat diubah setelah create — schema COAUpdate.)
        // Server menolak perubahan structural untuk akun yang sudah punya
        // jurnal — pesan errornya ditampilkan sebagai lock reason di form.
        const payload: COAUpdate = {
          nama: form.nama.trim(),
          status: form.status,
          active: form.status === 'AKTIF'
        };
        const updated = await api.put<COAResponse>(`/coa/${editId}`, payload);
        if (saldoAwalEligible) await saveSaldoAwal(updated);
        toast.success('Akun perkiraan berhasil diperbarui');
      }
      refreshListTab('settings', 'coa');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      const message = err instanceof ApiError ? err.detail : mode === 'create' ? 'Gagal menambahkan akun' : 'Gagal memperbarui akun';
      if (mode === 'edit') setServerLockError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Skeleton saat memuat akun untuk edit ──
  if (mode === 'edit' && editLoading && !editAccount) {
    return (
      <FormTabShell title={title}>
        <Card className="max-w-4xl">
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      </FormTabShell>
    );
  }

  return (
    <FormTabShell title={title}>
      <Card className="max-w-4xl">
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">{mode === 'create' ? 'Pilih tipe akun (istilah bisnis) — klasifikasi laporan, saldo normal, dan aturan posting diturunkan otomatis oleh sistem.' : `Mengedit akun: ${form.kode} — ${editAccount?.nama ?? form.nama}`}</p>

          {/* ── Lock reason dari server (edit: perubahan structural ditolak) ── */}
          {mode === 'edit' && serverLockError && (
            <Alert variant="destructive">
              <Lock className="h-4 w-4" />
              <AlertTitle>Perubahan ditolak server</AlertTitle>
              <AlertDescription>{serverLockError}</AlertDescription>
            </Alert>
          )}

          {/* ── Preview errors (create, blocking) ── */}
          {mode === 'create' && blockingErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Akun belum dapat disimpan</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {blockingErrors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* ── Preview warnings (create, informatif) ── */}
          {mode === 'create' && previewWarnings.length > 0 && (
            <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Perhatian</AlertTitle>
              <AlertDescription className="text-amber-900/90 dark:text-amber-200/90">
                <ul className="list-disc pl-4">
                  {previewWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="umum">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="umum">Informasi Umum</TabsTrigger>
              <TabsTrigger value="lanjutan">Pengaturan Lanjutan</TabsTrigger>
            </TabsList>

            {/* ══════════════ TAB 1: INFORMASI UMUM ══════════════ */}
            <TabsContent value="umum" className="space-y-4 pt-4">
              {/* 1. Tipe Akun */}
              <div className="space-y-2">
                <Label>
                  Tipe Akun <span className="text-destructive">*</span>
                </Label>
                {mode === 'create' ? (
                  typesLoading ? (
                    <Skeleton className="h-9 w-full" />
                  ) : typesError ? (
                    <div className="flex items-center gap-2">
                      <p className="flex-1 text-xs text-destructive">{typesError}</p>
                      <Button variant="outline" size="sm" onClick={() => setTypesRetry((k) => k + 1)}>
                        Coba Lagi
                      </Button>
                    </div>
                  ) : (
                    <Select value={form.typeCode} onValueChange={handleTypeChange} disabled={submitting}>
                      <SelectTrigger aria-invalid={!!formErrors.typeCode} className={formErrors.typeCode ? 'border-destructive focus-visible:ring-destructive' : ''}>
                        <SelectValue placeholder="Pilih tipe akun (mis. Kas & Bank)" />
                      </SelectTrigger>
                      <SelectContent>
                        {accountTypes.map((t) => (
                          <SelectItem key={t.typeCode} value={t.typeCode}>
                            <span className="font-medium">{t.displayName}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {accountClassLabel(t.accountClass)} · {financialStatementLabel(t.financialStatement)}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )
                ) : (
                  <Select value="__existing__" disabled>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__existing__">{editTypeLabel}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {formErrors.typeCode && <p className="text-xs text-destructive mt-1">{formErrors.typeCode}</p>}
                {mode === 'edit' && <p className="text-[11px] text-muted-foreground">Tipe akun tidak dapat diubah setelah akun dibuat.</p>}
                {mode === 'create' && selectedTemplate && (
                  <p className="text-[11px] text-muted-foreground">
                    Klasifikasi <span className="font-medium">{accountClassLabel(selectedTemplate.accountClass)}</span> · {financialStatementLabel(selectedTemplate.financialStatement)} · saldo normal {selectedTemplate.saldoNormal} — diturunkan otomatis.
                  </p>
                )}
              </div>

              {/* 2. Sub Akun (toggle) + Akun Induk / Tipe Struktur */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                  <div>
                    <Label htmlFor="coa-is-sub" className="text-sm">
                      Sub Akun
                    </Label>
                    <p className="mt-0.5 text-xs text-muted-foreground">{form.isSub ? 'Akun dibuat di bawah akun induk tertentu.' : 'Akun dibuat sebagai level teratas (root).'}</p>
                  </div>
                  <Switch id="coa-is-sub" checked={form.isSub} onCheckedChange={handleSubToggle} disabled={submitting || mode === 'edit'} />
                </div>

                {form.isSub ? (
                  <div className="space-y-2">
                    <Label>
                      Akun Induk <span className="text-destructive">*</span>
                    </Label>
                    {mode === 'create' ? (
                      <>
                        <ParentPicker key={form.typeCode} typeCode={form.typeCode} value={form.indukId} selected={indukSelected} onChange={handleIndukChange} disabled={submitting || !form.typeCode} invalid={!!formErrors.indukId} />
                        {!form.typeCode && <p className="text-[11px] text-muted-foreground">Pilih tipe akun dahulu untuk memuat daftar induk yang cocok.</p>}
                        {formErrors.indukId && <p className="text-xs text-destructive mt-1">{formErrors.indukId}</p>}
                      </>
                    ) : (
                      <>
                        <Input value={editParentLabel} disabled readOnly />
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Lock className="h-3 w-3" /> Induk tidak dapat diubah dari form ini — akun yang sudah memiliki jurnal terposting dikunci server.
                        </p>
                      </>
                    )}
                  </div>
                ) : mode === 'create' ? (
                  <div className="space-y-2">
                    <Label>Tipe Struktur</Label>
                    <RadioGroup value={form.structuralType} onValueChange={(v) => setForm((prev) => ({ ...prev, structuralType: v as StructuralType }))} disabled={submitting} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="flex items-start gap-3 rounded-lg border p-3">
                        <RadioGroupItem value="GROUP" id="struct-group" className="mt-0.5" />
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium">Grup Akun</span>
                          <p className="text-xs text-muted-foreground">Wadah sub-akun (agregasi laporan), tidak untuk posting jurnal langsung.</p>
                        </div>
                      </label>
                      <label className="flex items-start gap-3 rounded-lg border p-3">
                        <RadioGroupItem value="DETAIL" id="struct-detail" className="mt-0.5" />
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium">Akun Transaksi</span>
                          <p className="text-xs text-muted-foreground">Akun detail yang dapat dipakai dalam jurnal.</p>
                        </div>
                      </label>
                    </RadioGroup>
                    {selectedTemplate && !selectedTemplate.supportsRoot && <p className="text-xs text-amber-700 dark:text-amber-400">Tipe {selectedTemplate.displayName} umumnya dibuat sebagai sub akun di bawah induk yang sesuai.</p>}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Tipe Struktur</Label>
                    <Input value={tingkatLabel(editAccount?.tingkat)} disabled readOnly />
                    <p className="text-[11px] text-muted-foreground">Struktur akun tidak dapat diubah setelah akun dibuat.</p>
                  </div>
                )}
              </div>

              {/* 3. Kode Akun + 4. Nama Akun */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="coa-kode">Kode Akun</Label>
                    {mode === 'create' && kodeOtomatis && (
                      <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                        Otomatis
                      </Badge>
                    )}
                    {mode === 'create' && form.kodeManual && <Badge variant="outline">Manual</Badge>}
                  </div>
                  <div className="flex gap-2">
                    <Input id="coa-kode" placeholder={form.isSub ? 'Otomatis dari sistem' : 'Isi manual (root)'} value={form.kode} onChange={(e) => handleKodeChange(e.target.value)} disabled={mode === 'edit'} className="font-mono" aria-invalid={!!formErrors.kode} aria-describedby={formErrors.kode ? 'coa-kode-error' : undefined} />
                    {mode === 'create' && (
                      <Button type="button" variant="outline" size="icon" onClick={handleRegenerate} disabled={submitting || !form.typeCode || (form.isSub && !form.indukId)} title="Ambil ulang usulan kode dari sistem" aria-label="Regenerate kode akun">
                        <RefreshCw className={cn('h-4 w-4', previewLoading && 'animate-spin')} />
                      </Button>
                    )}
                  </div>
                  {formErrors.kode && (
                    <p id="coa-kode-error" className="text-xs text-destructive mt-1">
                      {formErrors.kode}
                    </p>
                  )}
                  {mode === 'edit' && <p className="text-[11px] text-muted-foreground">Kode akun tidak dapat diubah.</p>}
                  {mode === 'create' && !form.isSub && <p className="text-[11px] text-muted-foreground">Akun level root tidak punya kode otomatis — wajib diisi manual.</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="coa-nama">
                    Nama Akun <span className="text-destructive">*</span>
                  </Label>
                  <Input id="coa-nama" placeholder="Nama akun" value={form.nama} onChange={(e) => setForm((prev) => ({ ...prev, nama: e.target.value }))} aria-invalid={!!formErrors.nama} className={formErrors.nama ? 'border-destructive focus-visible:ring-destructive' : ''} />
                  {formErrors.nama && <p className="text-xs text-destructive mt-1">{formErrors.nama}</p>}
                </div>
              </div>

              {/* 5. Mata Uang + 6. Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Mata Uang</Label>
                  <Select value="IDR" disabled>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IDR" disabled>
                        IDR — Rupiah
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">Mata uang lain tersedia setelah ledger FX aktif.</p>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm((prev) => ({ ...prev, status: v as COAFormState['status'] }))} disabled={submitting}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AKTIF">Aktif</SelectItem>
                      <SelectItem value="NONAKTIF">Nonaktif</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">Akun nonaktif disembunyikan dari transaksi baru.</p>
                </div>
              </div>

              {/* 7. Jenis Kas/Bank — hanya untuk template KAS_BANK */}
              {showJenisKasBank && (
                <div className="space-y-2">
                  <Label>Jenis Kas/Bank</Label>
                  <Select value={form.jenisKasBank} onValueChange={(v) => setForm((prev) => ({ ...prev, jenisKasBank: v }))} disabled={submitting || mode === 'edit'}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih jenis kas/bank" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="KAS">KAS</SelectItem>
                      <SelectItem value="BANK">BANK</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">{mode === 'create' ? 'Menghubungkan akun ini ke modul Kas & Bank (membuat KasBankAkun otomatis).' : 'Jenis kas/bank hanya dapat diatur saat pembuatan akun.'}</p>
                </div>
              )}

              {/* Saldo awal (satu nilai; sisi otomatis dari saldo normal akun) */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Label className="text-sm font-medium">Saldo Awal</Label>
                    <p className="mt-1 text-xs text-muted-foreground">Sisi debit/kredit mengikuti saldo normal akun. Selisih total otomatis dipampangkan ke akun “Selisih Saldo Awal” (Modal).</p>
                  </div>
                  {saldoNormalDisplay && (
                    <Badge variant="outline" className={saldoNormalDisplay === 'DEBIT' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}>
                      Saldo Normal: {saldoNormalDisplay === 'DEBIT' ? 'Debit (D)' : 'Kredit (K)'}
                    </Badge>
                  )}
                </div>
                {!saldoAwalEligible && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      {!tingkatIsDetail ? 'Hanya akun level DETAIL yang dapat diberi saldo awal.' : saldoAwalInfo?.hint ? saldoAwalInfo.hint : mode === 'create' && !form.typeCode ? 'Pilih Tipe Akun terlebih dahulu untuk menentukan kelayakan saldo awal.' : 'Kategori akun ini tidak didukung saldo awal langsung.'}
                      {tingkatIsDetail && saldoAwalInfo && <span className="text-muted-foreground"> (Kategori: {saldoAwalInfo.label})</span>}
                    </AlertDescription>
                  </Alert>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="coa-saldo-awal">Saldo Awal</Label>
                    <CurrencyInput id="coa-saldo-awal" allowDecimal placeholder="0" value={form.saldoAwalNilai} onValueChange={(v) => setForm((prev) => ({ ...prev, saldoAwalNilai: v }))} disabled={loadingSaldoAwal || !saldoAwalEligible} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="coa-tanggal-saldo-awal">Tanggal Saldo Awal</Label>
                    <Input id="coa-tanggal-saldo-awal" type="date" value={form.tanggalSaldoAwal} onChange={(e) => setForm((prev) => ({ ...prev, tanggalSaldoAwal: e.target.value }))} disabled={loadingSaldoAwal || !saldoAwalEligible} />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      Saldo <span className="text-[10px] font-normal text-muted-foreground">(otomatis)</span>
                    </Label>
                    <div className="flex h-9 items-center justify-end rounded-md border bg-background px-3 font-mono text-sm tabular-nums" aria-label="Saldo akun saat ini">
                      {loadingSaldoAwal ? '—' : formatSaldo(saldoSekarang)}
                    </div>
                    <p className="text-[11px] text-muted-foreground">Saldo akun saat ini, terisi otomatis.</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ══════════════ TAB 2: PENGATURAN LANJUTAN (read-only) ══════════════ */}
            <TabsContent value="lanjutan" className="space-y-4 pt-4">
              <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-4">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">{mode === 'create' ? 'Nilai diturunkan otomatis dari template tipe akun + akun induk. Perubahan mapping hanya melalui Admin Finance.' : 'Menampilkan nilai aktual akun saat ini. Perubahan mapping hanya melalui Admin Finance — akun yang sudah memiliki jurnal terposting dikunci server.'}</p>
              </div>

              {mode === 'create' ? (
                previewLoading && !preview ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full rounded-lg" />
                    ))}
                  </div>
                ) : !preview ? (
                  <p className="text-sm text-muted-foreground">Lengkapi Tipe Akun{form.isSub ? ' dan Akun Induk' : ''} di tab Informasi Umum untuk melihat derivasi otomatis di sini.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <DerivationRow label="Tingkat Akun">
                      <Badge variant="secondary">{tingkatLabel(preview.tingkat)}</Badge>
                    </DerivationRow>
                    <DerivationRow label="Saldo Normal">
                      <Badge variant="secondary">{preview.saldoNormal || '—'}</Badge>
                    </DerivationRow>
                    <DerivationRow label="Kelas Akun">{accountClassLabel(preview.accountClass)}</DerivationRow>
                    <DerivationRow label="Laporan Keuangan">{financialStatementLabel(preview.financialStatement)}</DerivationRow>
                    <DerivationRow label="Subkelas">{preview.accountSubclass || '—'}</DerivationRow>
                    <DerivationRow label="Grup Laporan">{preview.reportGroup || '—'}</DerivationRow>
                    <DerivationRow label="Jenis Subledger">{preview.subledgerType || '—'}</DerivationRow>
                    <DerivationRow label="Tipe Akun Sistem">{preview.systemAccountType || '—'}</DerivationRow>
                    <DerivationRow label="Posting Sistem">{yaTidak(preview.allowSystemPosting)}</DerivationRow>
                    <DerivationRow label="Jurnal Manual">{yaTidak(preview.allowManualPosting)}</DerivationRow>
                    <DerivationRow label="Control Account">
                      {preview.isControlAccount === true ? (
                        <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">
                          Control Account
                        </Badge>
                      ) : (
                        'Tidak'
                      )}
                    </DerivationRow>
                    <DerivationRow label="Wajib Rekonsiliasi">{yaTidak(preview.reconciliationRequired)}</DerivationRow>
                  </div>
                )
              ) : !editAccount ? (
                <p className="text-sm text-muted-foreground">Data akun belum termuat.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DerivationRow label="Tingkat Akun">
                    <Badge variant="secondary">{tingkatLabel(editAccount.tingkat)}</Badge>
                  </DerivationRow>
                  <DerivationRow label="Saldo Normal">
                    <Badge variant="secondary">{editAccount.saldoNormal}</Badge>
                  </DerivationRow>
                  <DerivationRow label="Kelas Akun">{accountClassLabel(editAccount.accountClass)}</DerivationRow>
                  <DerivationRow label="Laporan Keuangan">{financialStatementLabel(editAccount.financialStatement)}</DerivationRow>
                  <DerivationRow label="Subkelas">{editAccount.accountSubclass || '—'}</DerivationRow>
                  <DerivationRow label="Grup Laporan">{editAccount.reportGroup || '—'}</DerivationRow>
                  <DerivationRow label="Jenis Subledger">{editAccount.subledgerType || '—'}</DerivationRow>
                  <DerivationRow label="Tipe Akun Sistem">{editAccount.systemAccountType || '—'}</DerivationRow>
                  <DerivationRow label="Posting Sistem">{yaTidak(editAccount.allowSystemPosting)}</DerivationRow>
                  <DerivationRow label="Jurnal Manual">{yaTidak(editAccount.allowManualPosting)}</DerivationRow>
                  <DerivationRow label="Control Account">
                    {editAccount.isControlAccount === true ? (
                      <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">
                        Control Account
                      </Badge>
                    ) : (
                      'Tidak'
                    )}
                  </DerivationRow>
                  <DerivationRow label="Wajib Rekonsiliasi">{yaTidak(editAccount.reconciliationRequired)}</DerivationRow>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting}>
              Batal
            </Button>
            <Button onClick={handleSubmit} disabled={saveDisabled} className="gap-2">
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
    return <COAForm mode={isEdit ? 'edit' : 'create'} editId={isEdit} />;
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

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
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
