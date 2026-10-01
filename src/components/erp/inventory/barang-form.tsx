'use client';

/**
 * Form Tambah/Edit Barang & Jasa — Task 27-c (Dynamic Form Barang).
 *
 * Desain mengikuti REVISI_DYNAMIC_FORM_BARANG_JASA_ASAHI.md:
 * - 4 pilihan jenis item: Persediaan / Nonpersediaan / Jasa / Grup (disabled —
 *   "Coming soon", engine bundle belum tersedia).
 * - Mapping UI type ↔ model (kolom yang ADA, tanpa perubahan schema):
 *     PERSEDIAAN    → itemType BARANG_DAGANG/JADI/BAKU/BANTU + stockItem true
 *     NONPERSEDIAAN → itemType BARANG_DAGANG + stockItem false
 *     JASA          → itemType JASA + stockItem false
 * - Tab: Umum | Penjualan/Pembelian | Stok (hanya Persediaan) | Akun | Gambar | Lain-lain.
 * - Draft otomatis (mode create): restore saat mount, simpan tiap perubahan,
 *   buang setelah submit sukses — pakai useFormDraft + DraftIndicator.
 * - Backend memvalidasi ulang (item_type_policy + master_service): UI hide ≠ validasi.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';

import { Plus, Pencil, Trash2, Loader2, Package, PackageOpen, Wrench, Layers, AlertTriangle, X, ChevronDown, ImageOff, Info, Warehouse } from 'lucide-react';
import { toast } from 'sonner';
import { useTabStore } from '@/store/tab-store';
import { useAuthStore } from '@/store/auth-store';
import { FormTabShell } from '@/components/erp/form-tab-shell';
import { DraftIndicator } from '@/components/erp/draft-indicator';
import { draftKey, useFormDraft } from '@/hooks/use-form-draft';

import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { api, PaginatedResponse, ApiError } from '@/lib/api';
import type { BarangResponse, BarangCreate, BarangUpdate, BarangSatuanResponse, BarangSatuanCreate, BarangSatuanUpdate, KategoriBarangResponse, SatuanResponse, BarangAkunPersediaanItem, AkunPersediaanSimple, ItemTypeBarang } from '@/types/api';
import { ITEM_TYPE_OPTIONS } from '@/types/api';
import { getCOAOptions, type COAOption } from '@/lib/master-data';

// ─── Jenis item (UI type) — konstanta & mapping ────────────────────────────

type UiBarangType = 'PERSEDIAAN' | 'NONPERSEDIAAN' | 'JASA' | 'GRUP';

/** Policy jenis item dari GET /master/barang/types (fallback lokal bila endpoint gagal). */
interface BarangTypePolicy {
  uiType: UiBarangType;
  label: string;
  available: boolean;
  stockTracked: boolean;
  valuationEnabled: boolean;
  supportsWarehouse: boolean;
  canPurchase: boolean;
  canSell: boolean;
  visibleTabs: string[];
  accountFields: string[];
  stockFields: string[];
  description?: string | null;
  comingSoon?: boolean;
}

const FALLBACK_TYPE_POLICIES: BarangTypePolicy[] = [
  { uiType: 'PERSEDIAAN', label: 'Persediaan', available: true, stockTracked: true, valuationEnabled: true, supportsWarehouse: true, canPurchase: true, canSell: true, visibleTabs: ['umum', 'jual_beli', 'stok', 'akun', 'gambar', 'lainnya'], accountFields: ['akun_persediaan_id', 'akun_hpp_id', 'akun_penjualan_id', 'akun_retur_penjualan_id', 'akun_diskon_penjualan_id'], stockFields: ['stok_minimum'], description: 'Barang fisik yang stok-nya dilacak (kartu stok, valuasi, gudang).' },
  { uiType: 'NONPERSEDIAAN', label: 'Nonpersediaan', available: true, stockTracked: false, valuationEnabled: false, supportsWarehouse: false, canPurchase: true, canSell: true, visibleTabs: ['umum', 'jual_beli', 'akun', 'gambar', 'lainnya'], accountFields: ['akun_hpp_id', 'akun_penjualan_id', 'akun_retur_penjualan_id', 'akun_diskon_penjualan_id'], stockFields: [], description: 'Barang/jasa terjual-terbeli tanpa pelacakan stok (tanpa kartu stok/valuasi).' },
  { uiType: 'JASA', label: 'Jasa', available: true, stockTracked: false, valuationEnabled: false, supportsWarehouse: false, canPurchase: true, canSell: true, visibleTabs: ['umum', 'jual_beli', 'akun', 'gambar', 'lainnya'], accountFields: ['akun_penjualan_id', 'akun_retur_penjualan_id', 'akun_diskon_penjualan_id'], stockFields: [], description: 'Item jasa — pendapatan/beban tanpa gerakan stok, gudang, atau valuasi.' },
  { uiType: 'GRUP', label: 'Grup', available: false, stockTracked: false, valuationEnabled: false, supportsWarehouse: false, canPurchase: false, canSell: false, visibleTabs: ['umum'], accountFields: [], stockFields: [], description: 'Non-stock sales bundle — engine bundle belum tersedia.', comingSoon: true }
];

const TYPE_ICONS: Record<UiBarangType, typeof Package> = {
  PERSEDIAAN: Package,
  NONPERSEDIAAN: PackageOpen,
  JASA: Wrench,
  GRUP: Layers
};

/** Rincian jenis hanya berlaku untuk item Persediaan (stock-tracked). */
const RINCIAN_PERSEDIAAN_OPTIONS = ITEM_TYPE_OPTIONS.filter((o) => o.value !== 'JASA');

// NOTE: Metode valuasi bukan lagi field per-barang — sekarang setting global
// di halaman Pengaturan → Setting Akun (lihat setting-akun-page.tsx).

/** Derivasi UI type saat EDIT (load data) — sesuai aturan Task 27-c. */
function deriveUiType(itemType?: ItemTypeBarang | null, stockItem?: boolean | null): UiBarangType {
  if (itemType === 'JASA') return 'JASA';
  if (stockItem !== false) return 'PERSEDIAAN'; // undefined/null → default stock-tracked
  return 'NONPERSEDIAAN';
}

/** Konversi UI type → (itemType, stockItem) untuk payload model Barang. */
function uiTypeToModel(uiType: UiBarangType, rincian: string): { itemType: ItemTypeBarang; stockItem: boolean } {
  if (uiType === 'PERSEDIAAN') {
    const rincianValid = RINCIAN_PERSEDIAAN_OPTIONS.some((o) => o.value === rincian);
    return { itemType: (rincianValid ? rincian : 'BARANG_DAGANG') as ItemTypeBarang, stockItem: true };
  }
  if (uiType === 'NONPERSEDIAAN') return { itemType: 'BARANG_DAGANG', stockItem: false };
  if (uiType === 'JASA') return { itemType: 'JASA', stockItem: false };
  throw new Error('Jenis item Grup belum tersedia (coming soon)');
}

// ─── Form state type ───────────────────────────────────────────────────────

type FormMode = 'create' | 'edit';

interface FormState {
  uiType: UiBarangType;
  kode: string;
  nama: string;
  kategoriId: string;
  satuanId: string;
  /** Rincian jenis persediaan (BARANG_DAGANG/JADI/BAKU/BANTU) — hanya utk PERSEDIAAN. */
  rincianJenis: string;
  statusAktif: boolean;
  // Penjualan/Pembelian
  hargaPokok: string; // harga beli referensi (canonical, format input 20.000.000)
  hargaJual: string; // harga jual default (canonical, format input 20.000.000)
  // Stok (hanya Persediaan)
  stokMinimum: string;
  // Akun
  akunPersediaanId: string;
  akunHppId: string;
  akunPenjualanId: string;
  akunReturPenjualanId: string;
  akunDiskonPenjualanId: string;
}

const emptyForm: FormState = {
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

interface BarangFormProps {
  mode: FormMode;
  editId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Akun Persediaan Picker — server-side searchable dropdown
// GET /master/barang-akun-persediaan?search=..&skip=..&limit=..
// ═══════════════════════════════════════════════════════════════════════════

interface AkunPersediaanPickerProps {
  value: string; // ID akun yang dipilih, atau '' jika kosong
  onChange: (id: string) => void;
  /** Object akun saat ini (untuk edit). Boleh null. Dipakai untuk menampilkan label walau akun NONAKTIF (tidak ada di dropdown). */
  currentAkun?: AkunPersediaanSimple | null;
  /** Disable picker (mis. jenis item non-persediaan) */
  disabled?: boolean;
}

function AkunPersediaanPicker({ value, onChange, currentAkun, disabled }: AkunPersediaanPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<BarangAkunPersediaanItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [skip, setSkip] = useState(0);
  const [total, setTotal] = useState(0);
  // Snapshot pilihan terakhir — supaya label trigger tetap tampil setelah popover
  // ditutup (options di-reset saat close, nilai form tetap tersimpan).
  const [selectedFromList, setSelectedFromList] = useState<BarangAkunPersediaanItem | null>(null);
  const PAGE_SIZE = 50;

  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const searchRef = useRef(search);
  searchRef.current = search;

  // Fetch options (dipanggil saat open + saat search berubah)
  const fetchOptions = useCallback(
    async (resetSkip = false) => {
      const newSkip = resetSkip ? 0 : skip;
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('skip', String(newSkip));
        params.set('limit', String(PAGE_SIZE));
        if (search) params.set('search', search);
        const res = await api.get<PaginatedResponse<BarangAkunPersediaanItem>>(`/master/barang-akun-persediaan?${params.toString()}`);
        if (resetSkip || newSkip === 0) {
          setOptions(res.data);
        } else {
          // append untuk load more
          setOptions((prev) => {
            const seen = new Set(prev.map((o) => o.id));
            const merged = [...prev, ...res.data.filter((d) => !seen.has(d.id))];
            return merged;
          });
        }
        setTotal(res.total);
        setSkip(newSkip);
      } catch (err) {
        // Silent — dropdown tetap bisa menampilkan currentAkun
        console.warn('Gagal memuat daftar akun persediaan', err);
      } finally {
        setLoading(false);
      }
    },
    [search, skip]
  );

  // Debounce search
  useEffect(() => {
    if (!open) return;
    debounceTimer.current = setTimeout(() => {
      fetchOptions(true);
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [search, open]);

  // Initial fetch saat popover pertama kali dibuka
  useEffect(() => {
    if (open && options.length === 0 && !loading) {
      fetchOptions(true);
    }
  }, [open]);

  // Reset search saat tutup
  useEffect(() => {
    if (!open) {
      setSearch('');
      setSkip(0);
      setOptions([]);
    }
  }, [open]);

  // Label saat ini: prioritas dari currentAkun (object), fallback ke options list,
  // lalu fallback ke snapshot pilihan terakhir (supaya label tidak hilang saat
  // popover ditutup karena options di-reset).
  const selectedOption = currentAkun || (value ? options.find((o) => o.id === value) || selectedFromList : null);
  const isNonaktif = selectedOption?.status === 'NONAKTIF';
  const hasMore = options.length < total;

  const label = selectedOption ? `${selectedOption.kode} — ${selectedOption.nama}` : '';

  return (
    <div className="space-y-1.5">
      <Popover open={open && !disabled} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className={cn('w-full justify-between font-normal h-9 text-sm', !selectedOption && 'text-muted-foreground', isNonaktif && 'border-amber-400 bg-amber-50/50')}>
            <span className="truncate flex items-center gap-2">
              {selectedOption ? (
                <>
                  <span className="truncate">{label}</span>
                  {isNonaktif && (
                    <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 text-[10px] px-1.5 py-0">
                      nonaktif
                    </Badge>
                  )}
                </>
              ) : (
                'Pilih akun persediaan…'
              )}
            </span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Cari kode / nama akun…" value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>{loading ? 'Memuat…' : 'Tidak ditemukan.'}</CommandEmpty>
              <CommandGroup>
                {/* Selected akun nonaktif (yang tidak akan muncul di hasil dropdown) tetap ditampilkan di paling atas */}
                {currentAkun && currentAkun.status === 'NONAKTIF' && (
                  <CommandItem
                    key={currentAkun.id}
                    value={`${currentAkun.kode} — ${currentAkun.nama}`}
                    onSelect={() => {
                      onChange(currentAkun.id);
                      setOpen(false);
                    }}
                    className="text-sm">
                    <span className="flex flex-col">
                      <span className="flex items-center gap-2">
                        {currentAkun.kode} — {currentAkun.nama}
                        <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 text-[10px] px-1.5 py-0">
                          nonaktif
                        </Badge>
                      </span>
                      <span className="text-[11px] text-amber-700">Akun nonaktif — perlu ditinjau</span>
                    </span>
                  </CommandItem>
                )}
                {options.map((opt) => (
                  <CommandItem
                    key={opt.id}
                    value={`${opt.kode} — ${opt.nama}`}
                    onSelect={() => {
                      setSelectedFromList(opt);
                      onChange(opt.id);
                      setOpen(false);
                    }}
                    className="text-sm">
                    <span className="flex flex-col">
                      <span>
                        {opt.kode} — {opt.nama}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {opt.header} · {opt.tingkat}
                      </span>
                    </span>
                  </CommandItem>
                ))}
                {hasMore && (
                  <CommandItem onSelect={() => fetchOptions(false)} className="text-center justify-center text-xs text-muted-foreground" disabled={loading}>
                    {loading ? 'Memuat…' : 'Muat lebih banyak…'}
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Clear button — eksplisit mengirim null untuk mengosongkan mapping */}
      {value && !disabled && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 text-xs text-muted-foreground hover:text-destructive px-0"
          onClick={() => {
            setSelectedFromList(null);
            onChange('');
          }}>
          <X className="h-3 w-3 mr-1" /> Kosongkan mapping
        </Button>
      )}

      {isNonaktif && (
        <p className="text-[11px] text-amber-700 flex items-start gap-1">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          <span>Akun nonaktif — perlu ditinjau. Akun ini tidak bisa dipakai untuk mapping baru; pilih akun aktif yang valid untuk mengganti.</span>
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Form Component (rendered in tab)
// ═══════════════════════════════════════════════════════════════════════════

export default function BarangForm({ mode, editId }: BarangFormProps) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [activeFormTab, setActiveFormTab] = useState('umum');
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  // ── Lookup data ──
  const [kategoriOptions, setKategoriOptions] = useState<KategoriBarangResponse[]>([]);
  const [satuanOptions, setSatuanOptions] = useState<SatuanResponse[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(false);

  // ── Policy jenis item (GET /master/barang/types; fallback lokal bila gagal) ──
  const [typePolicies, setTypePolicies] = useState<BarangTypePolicy[]>(FALLBACK_TYPE_POLICIES);

  // ── Akun persediaan ──
  const [currentAkun, setCurrentAkun] = useState<AkunPersediaanSimple | null>(null);
  // Saldo stok read-only (edit mode)
  const [stokSaatIni, setStokSaatIni] = useState<number | null>(null);

  // ── Derived jenis item ──
  const isPersediaan = form.uiType === 'PERSEDIAAN';
  const isJasa = form.uiType === 'JASA';

  // ── COA options for HPP & Penjualan ──
  const [coaHppOptions, setCoaHppOptions] = useState<COAOption[]>([]);
  const [coaPenjualanOptions, setCoaPenjualanOptions] = useState<COAOption[]>([]);

  // ── Multi-satuan state ──
  const [satuanList, setSatuanList] = useState<BarangSatuanResponse[]>([]);
  const [satuanLoading, setSatuanLoading] = useState(false);
  const [addSatuanOpen, setAddSatuanOpen] = useState(false);
  const [addSatuanId, setAddSatuanId] = useState('');
  const [addSatuanIsi, setAddSatuanIsi] = useState('');
  const [addSatuanSubmitting, setAddSatuanSubmitting] = useState(false);
  const [deletingSatuanId, setDeletingSatuanId] = useState<string | null>(null);

  // ── Edit satuan state ──
  const [editSatuanOpen, setEditSatuanOpen] = useState(false);
  const [editSatuanTarget, setEditSatuanTarget] = useState<BarangSatuanResponse | null>(null);
  const [editSatuanId, setEditSatuanId] = useState('');
  const [editSatuanIsi, setEditSatuanIsi] = useState('');
  const [editSatuanSubmitting, setEditSatuanSubmitting] = useState(false);

  // ── Dialog konfirmasi ganti jenis item (spec §6: reset field dgn konfirmasi) ──
  const [typeConfirmOpen, setTypeConfirmOpen] = useState(false);
  const pendingTypeRef = useRef<UiBarangType | null>(null);
  const [pendingTypeFields, setPendingTypeFields] = useState<string[]>([]);

  // ── Draft otomatis (WAJIB — mode create saja) ──
  const userId = useAuthStore((s) => s.user?.id ?? 'anon');
  const draft = useFormDraft<FormState>(draftKey(userId, 'inventory', 'barang', 'create'));
  const draftDataRef = useRef<FormState | null>(draft.draft);
  const draftSavedOnceRef = useRef(false);

  const title = mode === 'create' ? 'Tambah Barang' : 'Edit Barang';

  // ── Fetch policy jenis item dari server (gabungkan dengan fallback) ──
  useEffect(() => {
    let cancelled = false;
    api
      .get<BarangTypePolicy[]>('/master/barang/types')
      .then((res) => {
        if (cancelled || !Array.isArray(res) || res.length === 0) return;
        setTypePolicies((prev) =>
          prev.map((p) => {
            const server = res.find((r) => r.uiType === p.uiType);
            return server ? { ...p, ...server } : p;
          })
        );
      })
      .catch(() => {
        /* fallback lokal tetap dipakai */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Fetch lookup data ──
  useEffect(() => {
    const fetchLookups = async () => {
      setLoadingLookups(true);
      try {
        const [kategoriRes, satuanRes] = await Promise.all([api.get<KategoriBarangResponse[]>('/master/kategori-barang'), api.get<SatuanResponse[]>('/master/satuan')]);
        setKategoriOptions(kategoriRes);
        setSatuanOptions(satuanRes);
      } catch {
        setKategoriOptions([]);
        setSatuanOptions([]);
      } finally {
        setLoadingLookups(false);
      }
    };
    fetchLookups();
  }, []);

  // ── Fetch COA options for HPP & Penjualan on mount ──
  useEffect(() => {
    // HPP account = COGS class. Sales account = REVENUE class.
    getCOAOptions({ accountClass: 'COGS', tingkat: 'DETAIL', activeOnly: true })
      .then(setCoaHppOptions)
      .catch(() => setCoaHppOptions([]));
    getCOAOptions({ accountClass: 'REVENUE', tingkat: 'DETAIL', activeOnly: true })
      .then(setCoaPenjualanOptions)
      .catch(() => setCoaPenjualanOptions([]));
  }, []);

  // ── Draft: restore saat mount (create only) ──
  useEffect(() => {
    if (mode === 'create' && draftDataRef.current) {
      const d = draftDataRef.current;
      const uiType: UiBarangType = d.uiType === 'JASA' || d.uiType === 'NONPERSEDIAAN' ? d.uiType : 'PERSEDIAAN';
      setForm((prev) => ({ ...prev, ...d, uiType }));
      toast.info('Draft form barang dipulihkan', { description: `Isian tersimpan otomatis ${draft.draftAgeLabel ?? 'baru saja'}.` });
    }
  }, []);

  // ── Draft: simpan tiap perubahan (skip render pertama) ──
  useEffect(() => {
    if (mode !== 'create') return;
    if (!draftSavedOnceRef.current) {
      draftSavedOnceRef.current = true;
      return;
    }
    draft.saveDraft(form);
  }, [form]);

  // ── Edit mode: fetch detail barang ──
  useEffect(() => {
    if (mode === 'edit' && editId) {
      const fetchDetail = async () => {
        try {
          const detail = await api.get<BarangResponse>(`/master/barang/${editId}`);
          const uiType = deriveUiType(detail.itemType, detail.stockItem);
          setForm((prev) => ({
            ...prev,
            uiType,
            kode: detail.kode,
            nama: detail.nama,
            kategoriId: detail.kategoriId,
            satuanId: detail.satuanId,
            rincianJenis: uiType === 'PERSEDIAAN' && detail.itemType && detail.itemType !== 'JASA' ? detail.itemType : 'BARANG_DAGANG',
            statusAktif: detail.status === 'AKTIF',
            hargaPokok: detail.hargaPokok != null ? String(detail.hargaPokok) : '',
            hargaJual: detail.hargaJual != null ? String(detail.hargaJual) : '',
            stokMinimum: detail.stokMinimum != null ? String(detail.stokMinimum) : '',
            akunPersediaanId: uiType === 'PERSEDIAAN' ? detail.akunPersediaanId || '' : '',
            akunHppId: uiType === 'JASA' ? '' : detail.akunHppId || '',
            akunPenjualanId: detail.akunPenjualanId || '',
            akunReturPenjualanId: detail.akunReturPenjualanId || '',
            akunDiskonPenjualanId: detail.akunDiskonPenjualanId || ''
          }));
          setStokSaatIni(detail.stok ?? 0);
          setCurrentAkun(uiType === 'PERSEDIAAN' ? detail.akunPersediaan || null : null);

          // Fetch multi-satuan
          setSatuanLoading(true);
          try {
            const res = await api.get<BarangSatuanResponse[]>(`/master/barang/${editId}/satuan`);
            setSatuanList(res);
          } catch {
            setSatuanList([]);
          } finally {
            setSatuanLoading(false);
          }
        } catch (err) {
          toast.error(err instanceof ApiError ? err.detail : 'Gagal memuat data barang');
          if (activeTabId) closeTab(activeTabId);
        }
      };
      fetchDetail();
    }
  }, [mode, editId]);

  const updateForm = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFormErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // ── Ganti jenis item: reset field tak relevan DENGAN KONFIRMASI (spec §6) ──
  const fieldsToClearOnTypeChange = (target: UiBarangType): string[] => {
    const fields: string[] = [];
    if (target !== 'PERSEDIAAN') {
      if (form.stokMinimum !== '' && Number(form.stokMinimum) !== 0) fields.push('Stok minimum');
      if (form.akunPersediaanId) fields.push('Akun persediaan');
    }
    if (target === 'JASA' && form.akunHppId) fields.push('Akun HPP');
    return fields;
  };

  const applyUiType = (target: UiBarangType) => {
    setForm((prev) => ({
      ...prev,
      uiType: target,
      ...(target !== 'PERSEDIAAN' ? { stokMinimum: '', akunPersediaanId: '' } : {}),
      ...(target === 'JASA' ? { akunHppId: '' } : {})
    }));
    if (target !== 'PERSEDIAAN') setCurrentAkun(null);
    // Tab Stok hanya untuk Persediaan — pindah ke Umum bila tab aktif hilang.
    if (activeFormTab === 'stok' && target !== 'PERSEDIAAN') setActiveFormTab('umum');
  };

  const handleSelectUiType = (target: UiBarangType) => {
    if (target === 'GRUP' || target === form.uiType || submitting) return;
    const fields = fieldsToClearOnTypeChange(target);
    if (fields.length > 0) {
      pendingTypeRef.current = target;
      setPendingTypeFields(fields);
      setTypeConfirmOpen(true);
    } else {
      applyUiType(target);
    }
  };

  // ── Real-time field validation ──────────────────────────────────────────
  const validateField = (field: keyof FormState, value: string | boolean): string => {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    switch (field) {
      case 'kode':
        if (!trimmed) return 'Kode barang wajib diisi';
        if (trimmed.length < 3) return 'Kode barang minimal 3 karakter';
        return '';
      case 'nama':
        if (!trimmed) return 'Nama barang wajib diisi';
        if (trimmed.length < 3) return 'Nama barang minimal 3 karakter';
        return '';
      case 'hargaPokok':
        if (trimmed) {
          const n = Number(trimmed);
          if (!Number.isFinite(n)) return 'Harga beli harus berupa angka';
          if (n < 0) return 'Harga beli tidak boleh negatif';
        }
        return '';
      case 'hargaJual':
        if (trimmed) {
          const n = Number(trimmed);
          if (!Number.isFinite(n)) return 'Harga jual harus berupa angka';
          if (n < 0) return 'Harga jual tidak boleh negatif';
        }
        return '';
      case 'stokMinimum':
        if (trimmed) {
          const n = Number(trimmed);
          if (!Number.isFinite(n)) return 'Stok minimum harus berupa angka';
          if (n < 0) return 'Stok minimum tidak boleh negatif';
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
    (['kode', 'nama', 'hargaPokok', 'hargaJual'] as const).forEach((field) => {
      const e = validateField(field, form[field]);
      if (e) errors[field] = e;
    });
    if (isPersediaan) {
      const e = validateField('stokMinimum', form.stokMinimum);
      if (e) errors.stokMinimum = e;
    }
    if (!form.kategoriId) errors.kategoriId = 'Kategori wajib dipilih';
    if (!form.satuanId) errors.satuanId = 'Satuan wajib dipilih';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateAll()) {
      toast.error('Periksa kembali isian formulir yang ditandai');
      return;
    }
    let model: { itemType: ItemTypeBarang; stockItem: boolean };
    try {
      model = uiTypeToModel(form.uiType, form.rincianJenis);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Jenis item tidak valid');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'create') {
        const payload: BarangCreate = {
          kode: form.kode.trim(),
          nama: form.nama.trim(),
          kategoriId: form.kategoriId,
          satuanId: form.satuanId,
          hargaPokok: form.hargaPokok !== '' ? Number(form.hargaPokok) : undefined,
          hargaJual: form.hargaJual !== '' ? Number(form.hargaJual) : 0,
          // Nonpersediaan/Jasa: stok minimum dipaksa 0 di payload (backend juga memaksa).
          stokMinimum: isPersediaan && form.stokMinimum !== '' ? Number(form.stokMinimum) : 0,
          itemType: model.itemType,
          stockItem: model.stockItem,
          // Field akun tersembunyi → di-null di payload.
          akunPersediaanId: isPersediaan ? form.akunPersediaanId || null : null,
          akunHppId: isJasa ? null : form.akunHppId || null,
          akunPenjualanId: form.akunPenjualanId || null,
          akunReturPenjualanId: form.akunReturPenjualanId || null,
          akunDiskonPenjualanId: form.akunDiskonPenjualanId || null,
          ...(!form.statusAktif ? { status: 'NONAKTIF' } : {})
        };
        await api.post<BarangResponse>('/master/barang', payload);
        toast.success('Barang berhasil ditambahkan');
        // Draft dibuang setelah submit sukses.
        draft.clearDraft();
      } else {
        if (!editId) return;
        const payload: BarangUpdate = {
          nama: form.nama.trim(),
          kategoriId: form.kategoriId || undefined,
          satuanId: form.satuanId || undefined,
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
          status: form.statusAktif ? 'AKTIF' : 'NONAKTIF'
        };
        await api.put<BarangResponse>(`/master/barang/${editId}`, payload);
        toast.success('Barang berhasil diperbarui');
      }
      // Refresh list Persediaan > Barang & Jasa (lokasi baru)
      refreshListTab('inventory', 'barang-jasa');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : mode === 'create' ? 'Gagal menambahkan barang' : 'Gagal memperbarui barang';
      // Immutable code/type error — kode atau jenis item tidak boleh diubah karena sudah dipakai transaksi
      if (msg.includes('tidak boleh diubah') || msg.includes('sudah dipakai') || msg.includes('tidak dapat diubah')) {
        toast.error(msg, {
          description: 'Nonaktifkan master ini (status=NONAKTIF) lalu buat master baru dengan konfigurasi yang benar.',
          duration: 6000
        });
      } else if (msg.includes('Akun persediaan tidak berlaku')) {
        toast.error(msg, { description: 'Item Jasa hanya boleh memetakan akun penjualan.', duration: 6000 });
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddSatuan = async () => {
    if (!editId || !addSatuanId) return;
    const isi = Number(addSatuanIsi);
    if (addSatuanIsi !== '' && (!Number.isFinite(isi) || isi <= 0)) {
      toast.error('Isi satuan harus berupa angka positif lebih dari 0 (mis. 12 untuk 1 lusin = 12 pcs)');
      return;
    }
    setAddSatuanSubmitting(true);
    try {
      const payload: BarangSatuanCreate = {
        barangId: editId,
        satuanId: addSatuanId,
        ...(addSatuanIsi !== '' ? { isiSatuan: isi } : {})
      };
      await api.post<BarangSatuanResponse>(`/master/barang/${editId}/satuan`, payload);
      toast.success('Satuan berhasil ditambahkan');
      setAddSatuanId('');
      setAddSatuanIsi('');
      setAddSatuanOpen(false);
      const res = await api.get<BarangSatuanResponse[]>(`/master/barang/${editId}/satuan`);
      setSatuanList(res);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal menambahkan satuan');
    } finally {
      setAddSatuanSubmitting(false);
    }
  };

  const openEditSatuan = (s: BarangSatuanResponse) => {
    setEditSatuanTarget(s);
    setEditSatuanId(s.satuanId);
    setEditSatuanIsi(s.isiSatuan != null ? String(s.isiSatuan) : '');
    setEditSatuanOpen(true);
  };

  const handleEditSatuan = async () => {
    if (!editSatuanTarget || !editId) return;
    const isi = Number(editSatuanIsi);
    if (editSatuanIsi !== '' && (!Number.isFinite(isi) || isi <= 0)) {
      toast.error('Isi satuan harus berupa angka positif lebih dari 0');
      return;
    }
    setEditSatuanSubmitting(true);
    try {
      const payload: BarangSatuanUpdate = {};
      if (editSatuanId !== editSatuanTarget.satuanId) {
        payload.satuanId = editSatuanId;
      }
      const newIsi = editSatuanIsi === '' ? undefined : isi;
      const oldIsi = editSatuanTarget.isiSatuan ?? 1;
      if (newIsi !== undefined && newIsi !== oldIsi) {
        payload.isiSatuan = newIsi;
      }
      if (Object.keys(payload).length === 0) {
        toast.info('Tidak ada perubahan');
        setEditSatuanOpen(false);
        return;
      }
      await api.put<BarangSatuanResponse>(`/master/barang-satuan/${editSatuanTarget.id}`, payload);
      toast.success('Satuan berhasil diperbarui');
      setEditSatuanOpen(false);
      setEditSatuanTarget(null);
      const res = await api.get<BarangSatuanResponse[]>(`/master/barang/${editId}/satuan`);
      setSatuanList(res);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal memperbarui satuan');
    } finally {
      setEditSatuanSubmitting(false);
    }
  };

  const handleDeleteSatuan = async (id: string) => {
    if (!editId) return;
    setDeletingSatuanId(id);
    try {
      await api.delete(`/master/barang-satuan/${id}`);
      toast.success('Satuan tambahan berhasil dihapus');
      const res = await api.get<BarangSatuanResponse[]>(`/master/barang/${editId}/satuan`);
      setSatuanList(res);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal menghapus satuan');
    } finally {
      setDeletingSatuanId(null);
    }
  };

  const handleDiscardDraft = () => {
    draft.clearDraft();
    setForm(emptyForm);
    setCurrentAkun(null);
    setFormErrors({});
    setActiveFormTab('umum');
  };

  // ─── Render helpers ───────────────────────────────────────────────────────

  const renderTypeCards = () => (
    <div role="radiogroup" aria-label="Jenis item" data-testid="barang-jenis-item" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {typePolicies.map((p) => {
        const selected = form.uiType === p.uiType;
        const available = p.available !== false;
        const comingSoon = p.comingSoon === true;
        const Icon = TYPE_ICONS[p.uiType] ?? Package;
        return (
          <button key={p.uiType} type="button" role="radio" aria-checked={selected} aria-disabled={!available} disabled={!available} data-testid={`barang-jenis-${p.uiType.toLowerCase()}`} onClick={() => handleSelectUiType(p.uiType)} className={cn('group relative flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors', selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/40 hover:bg-muted/40', !available && 'cursor-not-allowed opacity-60 hover:border-border hover:bg-transparent')}>
            <span className="flex w-full items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-medium">{p.label}</span>
              </span>
              {comingSoon && (
                <Badge variant="secondary" className="bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100 text-[10px] px-1.5 py-0 shrink-0">
                  Coming soon
                </Badge>
              )}
            </span>
            <span className="text-[11px] leading-snug text-muted-foreground line-clamp-2">{p.description ?? ''}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <FormTabShell title={title}>
      <Card className="max-w-4xl">
        <CardContent className="p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{mode === 'create' ? 'Isi data di bawah untuk menambahkan barang/jasa baru.' : `Mengedit barang: ${form.kode} — ${form.nama}`}</p>
            {mode === 'create' && <DraftIndicator hasDraft={draft.hasDraft} ageLabel={draft.draftAgeLabel} onDiscard={handleDiscardDraft} formLabel="barang" />}
          </div>

          {/* ═══════════ TABS FORM DINAMIS ═══════════ */}
          <Tabs value={activeFormTab} onValueChange={setActiveFormTab} className="w-full">
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
              <TabsTrigger value="umum">Umum</TabsTrigger>
              <TabsTrigger value="jualbeli">Penjualan / Pembelian</TabsTrigger>
              {/* Tab Stok hanya untuk jenis Persediaan (spec §2) */}
              {isPersediaan && <TabsTrigger value="stok">Stok</TabsTrigger>}
              <TabsTrigger value="akun">Akun</TabsTrigger>
              <TabsTrigger value="gambar">Gambar</TabsTrigger>
              <TabsTrigger value="lainnya">Lain-lain</TabsTrigger>
            </TabsList>

            {/* ─────────── TAB UMUM ─────────── */}
            <TabsContent value="umum" className="space-y-4 pt-3">
              <div className="space-y-2">
                <Label>
                  Jenis Item <span className="text-destructive">*</span>
                </Label>
                {renderTypeCards()}
                <p className="text-[11px] text-muted-foreground">Jenis item menentukan field, tab, akun, dan perilaku stok yang relevan (spec §1).</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="brg-kode">Kode Barang</Label>
                  <Input id="brg-kode" placeholder="Contoh: BRG-001" value={form.kode} onChange={(e) => updateForm('kode', e.target.value)} onBlur={() => handleBlur('kode')} aria-invalid={!!formErrors.kode} className={formErrors.kode ? 'border-destructive focus-visible:ring-destructive' : ''} disabled={mode === 'edit'} />
                  {formErrors.kode ? <p className="text-xs text-destructive mt-1">{formErrors.kode}</p> : mode === 'edit' ? <p className="text-[11px] text-muted-foreground">Kode barang tidak dapat diubah.</p> : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="brg-nama">
                    Nama <span className="text-destructive">*</span>
                  </Label>
                  <Input id="brg-nama" placeholder={isJasa ? 'Nama jasa (mis. Jasa Desain Cover)' : 'Nama barang'} value={form.nama} onChange={(e) => updateForm('nama', e.target.value)} onBlur={() => handleBlur('nama')} aria-invalid={!!formErrors.nama} className={formErrors.nama ? 'border-destructive focus-visible:ring-destructive' : ''} autoFocus />
                  {formErrors.nama && <p className="text-xs text-destructive mt-1">{formErrors.nama}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>
                    Kategori <span className="text-destructive">*</span>
                  </Label>
                  <SearchableDropdown value={form.kategoriId} onValueChange={(v) => updateForm('kategoriId', v)} options={kategoriOptions.map((k) => ({ id: k.id, label: k.nama }))} placeholder="Pilih kategori" loading={loadingLookups} />
                  {formErrors.kategoriId && <p className="text-xs text-destructive mt-1">{formErrors.kategoriId}</p>}
                </div>
                <div className="space-y-2">
                  <Label>
                    Satuan Dasar <span className="text-destructive">*</span>
                  </Label>
                  <SearchableDropdown value={form.satuanId} onValueChange={(v) => updateForm('satuanId', v)} options={satuanOptions.map((s) => ({ id: s.id, label: s.nama }))} placeholder="Pilih satuan" loading={loadingLookups} />
                  {formErrors.satuanId && <p className="text-xs text-destructive mt-1">{formErrors.satuanId}</p>}
                </div>
              </div>

              {/* Rincian jenis persediaan — hanya untuk jenis Persediaan */}
              {isPersediaan && (
                <div className="space-y-2">
                  <Label>Rincian Jenis Persediaan</Label>
                  <Select value={form.rincianJenis} onValueChange={(v) => updateForm('rincianJenis', v)}>
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
                  <p className="text-[11px] text-muted-foreground">Barang dagang / produk jadi / bahan baku / bahan pembantu — hanya berlaku untuk item persediaan.</p>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Switch id="brg-status-aktif" checked={form.statusAktif} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, statusAktif: checked }))} />
                <Label htmlFor="brg-status-aktif" className="cursor-pointer">
                  Status aktif
                </Label>
                <span className="text-[11px] text-muted-foreground">{form.statusAktif ? 'Item aktif dan dapat dipakai transaksi.' : 'Item nonaktif — tidak bisa dipakai transaksi baru.'}</span>
              </div>

              {/* Daftar Satuan (edit mode only) */}
              {mode === 'edit' && editId && (
                <div className="space-y-3 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold">Multi Satuan</h3>
                    </div>
                    <Button type="button" variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => setAddSatuanOpen(true)}>
                      <Plus className="h-3.5 w-3.5" /> Tambah Satuan
                    </Button>
                  </div>

                  <div className="rounded-md bg-muted/30 border p-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      <strong className="text-foreground">Cara kerja multi satuan:</strong> Satuan utama adalah satuan terkecil (mis. <em>pcs</em>). Satuan tambahan memiliki faktor konversi — misalnya <strong>1 Lusin = 12 pcs</strong> (isi 12),
                      <strong>1 Box = 24 pcs</strong> (isi 24). Saat transaksi memakai satuan tambahan, sistem akan mengalikan qty dengan isi satuan untuk menghitung stok sebenarnya.
                    </p>
                  </div>

                  {satuanLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  ) : satuanList.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">Belum ada satuan terdaftar.</p>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Nama Satuan</TableHead>
                            <TableHead className="text-xs text-right">Isi (Konversi)</TableHead>
                            <TableHead className="text-xs">Info Konversi</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                            <TableHead className="text-xs text-center">Aksi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {satuanList.map((s) => {
                            const satuanUtama = satuanList.find((x) => x.isUtama) || satuanList[0];
                            const isi = s.isiSatuan ?? 1;
                            const infoKonversi = s.isUtama ? 'Satuan terkecil' : `1 ${s.satuan.nama} = ${isi} ${satuanUtama?.satuan.nama || 'pcs'}`;
                            return (
                              <TableRow key={s.id}>
                                <TableCell className="text-sm font-medium">{s.satuan.nama}</TableCell>
                                <TableCell className="text-sm text-right tabular-nums">{s.isUtama ? '1' : isi}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{infoKonversi}</TableCell>
                                <TableCell>
                                  {s.isUtama ? (
                                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 text-xs">
                                      Utama
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100 text-xs">
                                      Tambahan
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  <div className="inline-flex items-center gap-1">
                                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditSatuan(s)} aria-label={`Edit satuan ${s.satuan.nama}`}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    {!s.isUtama && (
                                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteSatuan(s.id)} disabled={deletingSatuanId === s.id} aria-label={`Hapus satuan ${s.satuan.nama}`}>
                                        {deletingSatuanId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* ─────────── TAB PENJUALAN/PEMBELIAN ─────────── */}
            <TabsContent value="jualbeli" className="space-y-4 pt-3">
              <div className="space-y-2">
                <Label htmlFor="brg-harga">Harga Beli Referensi</Label>
                <CurrencyInput id="brg-harga" placeholder="0" value={form.hargaPokok} onValueChange={(v) => updateForm('hargaPokok', v)} onBlur={() => handleBlur('hargaPokok')} aria-invalid={!!formErrors.hargaPokok} className={formErrors.hargaPokok ? 'border-destructive focus-visible:ring-destructive' : ''} />
                {formErrors.hargaPokok && <p className="text-xs text-destructive mt-1">{formErrors.hargaPokok}</p>}
                <p className="text-[11px] text-muted-foreground leading-relaxed">Harga beli referensi hanya untuk acuan input dokumen pembelian{isPersediaan ? ' — bukan HPP aktual (HPP mengikuti valuasi stok).' : '.'}</p>
              </div>

              {/* Harga Jual — default harga satuan saat input dokumen penjualan */}
              <div className="space-y-2">
                <Label htmlFor="brg-harga-jual">Harga Jual</Label>
                <CurrencyInput id="brg-harga-jual" placeholder="0" value={form.hargaJual} onValueChange={(v) => updateForm('hargaJual', v)} onBlur={() => handleBlur('hargaJual')} aria-invalid={!!formErrors.hargaJual} className={formErrors.hargaJual ? 'border-destructive focus-visible:ring-destructive' : ''} data-testid="input-harga-jual" />
                {formErrors.hargaJual && <p className="text-xs text-destructive mt-1">{formErrors.hargaJual}</p>}
                <p className="text-[11px] text-muted-foreground leading-relaxed">Harga jual default — otomatis terisi sebagai harga satuan saat barang dipilih di dokumen penjualan (SO). Harga per pelanggan / daftar harga khusus menyusul.</p>
              </div>
            </TabsContent>

            {/* ─────────── TAB STOK (hanya Persediaan) ─────────── */}
            {isPersediaan && (
              <TabsContent value="stok" className="space-y-4 pt-3" data-testid="tab-stok">
                <div className="rounded-md bg-muted/40 border p-3 text-[11px] text-muted-foreground leading-relaxed">
                  <strong>Metode valuasi kini global.</strong> Metode valuasi (AVERAGE/FIFO/FEFO) tidak lagi diatur per barang — konfigurasinya ada di <strong>Pengaturan → Setting Akun → Valuasi Persediaan</strong>.
                </div>

                <div className="space-y-2">
                  <Label htmlFor="brg-stok-min">Stok Minimum</Label>
                  <Input id="brg-stok-min" type="number" placeholder="0" min="0" value={form.stokMinimum} onChange={(e) => updateForm('stokMinimum', e.target.value)} onBlur={() => handleBlur('stokMinimum')} aria-invalid={!!formErrors.stokMinimum} className={formErrors.stokMinimum ? 'border-destructive focus-visible:ring-destructive' : ''} />
                  {formErrors.stokMinimum && <p className="text-xs text-destructive mt-1">{formErrors.stokMinimum}</p>}
                  <p className="text-[11px] text-muted-foreground">Peringatan stok menipis bila saldo di bawah nilai ini.</p>
                </div>

                {/* Saldo stok read-only (edit mode) */}
                {mode === 'edit' && (
                  <div className="space-y-2">
                    <Label>Saldo Stok Saat Ini</Label>
                    <div className="flex h-9 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm tabular-nums">
                      <Warehouse className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{stokSaatIni ?? 0}</span>
                      <span className="text-muted-foreground">— hanya-baca (dari saldo transaksi stok)</span>
                    </div>
                  </div>
                )}

                <div className="rounded-md bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
                  <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    <strong>Stok awal tidak diinput di form ini.</strong> Gunakan transaksi saldo awal persediaan per item+gudang (qty+nilai) agar jurnal opening dan rekonsiliasi tetap benar (spec §2). Field <em>stok</em> dan <em>harga pokok historis</em> tidak diubah langsung.
                  </p>
                </div>
              </TabsContent>
            )}

            {/* ─────────── TAB AKUN (conditional per jenis) ─────────── */}
            <TabsContent value="akun" className="space-y-4 pt-3" data-testid="tab-akun">
              {/* Akun Persediaan — hanya Persediaan */}
              {isPersediaan && (
                <div className="space-y-2">
                  <Label>Akun Persediaan</Label>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Pilih akun perkiraan (COA) untuk persediaan barang ini. Boleh kosong pada tahap ini. Jika akun belum ada, buat dulu di menu <strong>Pengaturan → Akun Perkiraan</strong>, lalu refresh dropdown.
                  </p>
                  <AkunPersediaanPicker value={form.akunPersediaanId} onChange={(id) => updateForm('akunPersediaanId', id)} currentAkun={currentAkun} />
                </div>
              )}

              {/* Akun HPP — Persediaan & Nonpersediaan (Jasa tidak) */}
              {!isJasa && (
                <div className="space-y-2">
                  <Label>{isPersediaan ? 'Akun HPP (COGS)' : 'Akun HPP / Beban'}</Label>
                  <Select value={form.akunHppId} onValueChange={(v) => updateForm('akunHppId', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder={isPersediaan ? 'Pilih akun HPP' : 'Pilih akun beban/HPP'} />
                    </SelectTrigger>
                    <SelectContent>
                      {coaHppOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">{isPersediaan ? 'Dipakai saat posting HPP dari gerakan stok.' : 'Nonpersediaan: beban/aset sesuai sifat pembelian — bukan akun stok.'}</p>
                </div>
              )}

              {/* Akun Penjualan — semua jenis yang tersedia */}
              <div className="space-y-2">
                <Label>{isJasa ? 'Akun Pendapatan Jasa' : 'Akun Penjualan (Revenue)'}</Label>
                <Select value={form.akunPenjualanId} onValueChange={(v) => updateForm('akunPenjualanId', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih akun penjualan" />
                  </SelectTrigger>
                  <SelectContent>
                    {coaPenjualanOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isJasa && <p className="text-[11px] text-muted-foreground">Item Jasa hanya memetakan akun pendapatan — tanpa akun persediaan/HPP stok.</p>}
              </div>

              {/* Akun Retur Penjualan — COA contra-revenue untuk retur barang ini */}
              <div className="space-y-2">
                <Label>Akun Retur Penjualan</Label>
                <Select value={form.akunReturPenjualanId} onValueChange={(v) => updateForm('akunReturPenjualanId', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih akun retur penjualan" />
                  </SelectTrigger>
                  <SelectContent>
                    {coaPenjualanOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Mapping COA retur penjualan (contra-revenue) untuk barang ini. Boleh kosong — retur tetap memakai setting global RETUR_PENJUALAN.</p>
              </div>

              {/* Akun Diskon Penjualan — COA contra-revenue untuk diskon barang ini */}
              <div className="space-y-2">
                <Label>Akun Diskon Penjualan</Label>
                <Select value={form.akunDiskonPenjualanId} onValueChange={(v) => updateForm('akunDiskonPenjualanId', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih akun diskon penjualan" />
                  </SelectTrigger>
                  <SelectContent>
                    {coaPenjualanOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Mapping COA diskon/potongan penjualan (contra-revenue) untuk barang ini. Boleh kosong.</p>
              </div>

              {!isPersediaan && <div className="rounded-md bg-muted/40 border p-3 text-[11px] text-muted-foreground leading-relaxed">{isJasa ? 'Jasa: pendapatan jasa tanpa gerakan stok, gudang, GRNI, atau HPP stok (spec §4).' : 'Nonpersediaan: pembelian masuk ke beban/aset (bukan akun stok); penjualan tetap ke akun pendapatan (spec §4).'}</div>}
            </TabsContent>

            {/* ─────────── TAB GAMBAR (placeholder P1) ─────────── */}
            <TabsContent value="gambar" className="pt-3">
              <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed py-12 text-center" data-testid="tab-gambar-placeholder">
                <ImageOff className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Fitur foto barang — coming soon (P1)</p>
                <p className="text-[11px] text-muted-foreground">Foto opsional dengan validasi ukuran/format akan tersedia pada fase P1 (spec §2).</p>
              </div>
            </TabsContent>

            {/* ─────────── TAB LAIN-LAIN (placeholder P1) ─────────── */}
            <TabsContent value="lainnya" className="pt-3">
              <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed py-12 text-center" data-testid="tab-lainnya-placeholder">
                <Info className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Catatan, dimensi &amp; berat — coming soon (P1)</p>
                <p className="text-[11px] text-muted-foreground">Tidak mengubah accounting valuation otomatis (spec §2).</p>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting}>
              Batal
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === 'create' ? 'Simpan Barang' : 'Perbarui Barang'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Konfirmasi ganti jenis item — field tak relevan akan dikosongkan (spec §6) */}
      <AlertDialog open={typeConfirmOpen} onOpenChange={setTypeConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ganti jenis item?</AlertDialogTitle>
            <AlertDialogDescription>Field yang tidak relevan dengan jenis baru akan dikosongkan. Lanjutkan?</AlertDialogDescription>
          </AlertDialogHeader>
          {pendingTypeFields.length > 0 && (
            <p className="text-xs text-muted-foreground -mt-1">
              Field terisi yang akan dikosongkan: <strong>{pendingTypeFields.join(', ')}</strong>
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                pendingTypeRef.current = null;
                setTypeConfirmOpen(false);
              }}>
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingTypeRef.current) applyUiType(pendingTypeRef.current);
                pendingTypeRef.current = null;
                setTypeConfirmOpen(false);
              }}>
              Lanjutkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Satuan mini-dialog */}
      <Dialog
        open={addSatuanOpen}
        onOpenChange={(open) => {
          if (!open) {
            setAddSatuanOpen(false);
            setAddSatuanId('');
            setAddSatuanIsi('');
          }
        }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Tambah Satuan Konversi</DialogTitle>
            <DialogDescription className="text-xs">Pilih satuan tambahan dan isi faktor konversi terhadap satuan utama.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label className="text-xs">Satuan Tambahan</Label>
              <Select
                value={addSatuanId}
                onValueChange={(v) => {
                  setAddSatuanId(v);
                  if (!addSatuanIsi) setAddSatuanIsi('');
                }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih satuan" />
                </SelectTrigger>
                <SelectContent>
                  {satuanOptions
                    .filter((s) => !satuanList.some((sl) => sl.satuanId === s.id))
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nama}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {satuanList.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Satuan utama: <strong>{satuanList.find((x) => x.isUtama)?.satuan.nama || satuanList[0]?.satuan.nama || '-'}</strong>
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Isi Satuan (Faktor Konversi)</Label>
              <Input type="number" min="1" step="1" placeholder="mis. 12" value={addSatuanIsi} onChange={(e) => setAddSatuanIsi(e.target.value)} />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Berapa banyak satuan utama dalam 1 satuan tambahan ini. Contoh: <strong>1 Lusin = 12 pcs</strong> → isi 12. <strong>1 Box = 24 pcs</strong> → isi 24.
              </p>
              {addSatuanId &&
                addSatuanIsi &&
                Number(addSatuanIsi) > 0 &&
                (() => {
                  const selectedSatuan = satuanOptions.find((s) => s.id === addSatuanId);
                  const satuanUtama = satuanList.find((x) => x.isUtama)?.satuan.nama || satuanList[0]?.satuan.nama || 'satuan utama';
                  return (
                    <div className="rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 text-[11px] text-emerald-700">
                      Preview:{' '}
                      <strong>
                        1 {selectedSatuan?.nama || '?'} = {Number(addSatuanIsi)} {satuanUtama}
                      </strong>
                    </div>
                  );
                })()}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAddSatuanOpen(false);
                setAddSatuanId('');
                setAddSatuanIsi('');
              }}
              disabled={addSatuanSubmitting}>
              Batal
            </Button>
            <Button size="sm" onClick={handleAddSatuan} disabled={addSatuanSubmitting || !addSatuanId} className="gap-2">
              {addSatuanSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Tambah
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Satuan dialog */}
      <Dialog
        open={editSatuanOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditSatuanOpen(false);
            setEditSatuanTarget(null);
          }
        }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Edit Satuan Konversi</DialogTitle>
            <DialogDescription className="text-xs">Ubah satuan atau faktor konversi.{editSatuanTarget?.isUtama && ' Satuan utama tidak bisa diganti satuan-nya.'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label className="text-xs">Satuan</Label>
              <Select value={editSatuanId} onValueChange={setEditSatuanId} disabled={editSatuanTarget?.isUtama}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih satuan" />
                </SelectTrigger>
                <SelectContent>
                  {editSatuanTarget?.isUtama
                    ? editSatuanTarget && <SelectItem value={editSatuanTarget.satuanId}>{editSatuanTarget.satuan.nama}</SelectItem>
                    : satuanOptions
                        .filter((s) => !satuanList.some((sl) => sl.satuanId === s.id && sl.id !== editSatuanTarget?.id))
                        .map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.nama}
                          </SelectItem>
                        ))}
                </SelectContent>
              </Select>
              {satuanList.length > 0 && !editSatuanTarget?.isUtama && (
                <p className="text-[11px] text-muted-foreground">
                  Satuan utama: <strong>{satuanList.find((x) => x.isUtama)?.satuan.nama || satuanList[0]?.satuan.nama || '-'}</strong>
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Isi Satuan (Faktor Konversi)</Label>
              <Input type="number" min="1" step="1" placeholder={editSatuanTarget?.isUtama ? '1' : 'mis. 12'} value={editSatuanIsi} onChange={(e) => setEditSatuanIsi(e.target.value)} disabled={editSatuanTarget?.isUtama} />
              <p className="text-[11px] text-muted-foreground leading-relaxed">{editSatuanTarget?.isUtama ? 'Satuan utama selalu bernilai 1 (satuan terkecil).' : 'Berapa banyak satuan utama dalam 1 satuan tambahan ini. Contoh: 1 Lusin = 12 pcs → isi 12.'}</p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditSatuanOpen(false);
                setEditSatuanTarget(null);
              }}
              disabled={editSatuanSubmitting}>
              Batal
            </Button>
            <Button size="sm" onClick={handleEditSatuan} disabled={editSatuanSubmitting} className="gap-2">
              {editSatuanSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FormTabShell>
  );
}
