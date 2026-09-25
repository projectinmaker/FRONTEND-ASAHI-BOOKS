'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Loader2, Package, AlertTriangle, X, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useTabStore } from '@/store/tab-store';
import { FormTabShell } from '@/components/erp/form-tab-shell';

import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { api, PaginatedResponse, ApiError } from '@/lib/api';
import type { BarangResponse, BarangCreate, BarangUpdate, BarangSatuanResponse, BarangSatuanCreate, BarangSatuanUpdate, KategoriBarangResponse, SatuanResponse, JenisBarang, BarangAkunPersediaanItem, AkunPersediaanSimple, ItemTypeBarang } from '@/types/api';
import { JENIS_BARANG_OPTIONS, ITEM_TYPE_OPTIONS } from '@/types/api';
import { getCOAOptions, type COAOption } from '@/lib/master-data';

// ─── Helpers ───────────────────────────────────────────────────────────────

const formatRupiah = (value: number): string => `Rp ${new Intl.NumberFormat('id-ID').format(value)}`;

// ─── Form state type ───────────────────────────────────────────────────────

type FormMode = 'create' | 'edit';

interface FormState {
  kode: string;
  nama: string;
  kategoriId: string;
  satuanId: string;
  hargaPokok: string;
  stokMinimum: string;
  jenisBarang: JenisBarang | '';
  akunPersediaanId: string; // '' = tidak diubah (edit) / tidak diisi (create); null ditangani terpisah via flag
  // === Phase 2 — field baru ===
  itemType: string; // ItemTypeBarang | '' — empty means not set
  akunHppId: string; // UUID, optional
  akunPenjualanId: string; // UUID, optional
  stockItem: boolean; // default true
}

const emptyForm: FormState = {
  kode: '',
  nama: '',
  kategoriId: '',
  satuanId: '',
  hargaPokok: '',
  stokMinimum: '',
  jenisBarang: '',
  akunPersediaanId: '',
  // === Phase 2 — defaults ===
  itemType: '',
  akunHppId: '',
  akunPenjualanId: '',
  stockItem: true
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
  /** Disable picker (mis. saat jenisBarang === 'JASA') */
  disabled?: boolean;
}

function AkunPersediaanPicker({ value, onChange, currentAkun, disabled }: AkunPersediaanPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<BarangAkunPersediaanItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [skip, setSkip] = useState(0);
  const [total, setTotal] = useState(0);
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

  // Label saat ini: prioritas dari currentAkun (object), fallback ke options list
  const selectedOption = currentAkun || options.find((o) => o.id === value);
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
        <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground hover:text-destructive px-0" onClick={() => onChange('')}>
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
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  // ── Lookup data ──
  const [kategoriOptions, setKategoriOptions] = useState<KategoriBarangResponse[]>([]);
  const [satuanOptions, setSatuanOptions] = useState<SatuanResponse[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(false);

  // ── Akun persediaan ──
  // currentAkun: object akun persediaan dari response (untuk display label, terutama saat akun NONAKTIF)
  const [currentAkun, setCurrentAkun] = useState<AkunPersediaanSimple | null>(null);
  // isJasa: kalau itemType === 'JASA', field akun persediaan & stok di-hide & payload dikosongkan
  const isJasa = form.itemType === 'JASA';

  // === Phase 2 — COA options for HPP & Penjualan ===
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

  const title = mode === 'create' ? 'Tambah Barang' : 'Edit Barang';

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

  // === Phase 2 — fetch COA options for HPP & Penjualan on mount ===
  useEffect(() => {
    // HPP account = COGS class. Sales account = REVENUE class.
    getCOAOptions({ accountClass: 'COGS', tingkat: 'DETAIL', activeOnly: true })
      .then(setCoaHppOptions)
      .catch(() => setCoaHppOptions([]));
    getCOAOptions({ accountClass: 'REVENUE', tingkat: 'DETAIL', activeOnly: true })
      .then(setCoaPenjualanOptions)
      .catch(() => setCoaPenjualanOptions([]));
  }, []);

  // ── Edit mode: fetch detail barang untuk dapat akunPersediaanId + akunPersediaan ──
  useEffect(() => {
    if (mode === 'edit' && editId) {
      const fetchDetail = async () => {
        try {
          const detail = await api.get<BarangResponse>(`/master/barang/${editId}`);
          setForm((prev) => ({
            ...prev,
            kode: detail.kode,
            nama: detail.nama,
            kategoriId: detail.kategoriId,
            satuanId: detail.satuanId,
            hargaPokok: detail.hargaPokok != null ? String(detail.hargaPokok) : '',
            stokMinimum: detail.stokMinimum != null ? String(detail.stokMinimum) : '',
            jenisBarang: detail.jenisBarang || '',
            akunPersediaanId: detail.akunPersediaanId || '',
            // === Phase 2 — pre-fill new fields ===
            itemType: detail.itemType || '',
            akunHppId: detail.akunHppId || '',
            akunPenjualanId: detail.akunPenjualanId || '',
            stockItem: detail.stockItem !== false // default true if undefined
          }));
          setCurrentAkun(detail.akunPersediaan || null);

          // Fetch multi-satuan
          try {
            const res = await api.get<BarangSatuanResponse[]>(`/master/barang/${editId}/satuan`);
            setSatuanList(res);
          } catch {
            setSatuanList([]);
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

  // ── Saat jenisBarang berubah ke JASA, kosongkan akun persediaan ──
  // Catatan: jenisBarang adalah field legacy yang di-hide dari form (Phase 2 — pakai itemType).
  // Handler ini tetap dipertahankan untuk backwards-compat payload legacy.
  const handleJenisBarangChange = (v: string) => {
    const jenis = v === 'ALL' ? '' : (v as JenisBarang);
    updateForm('jenisBarang', jenis);
    if (jenis === 'JASA') {
      // otomatis kosongkan mapping — jangan pakai mapping akun persediaan pada item jasa
      updateForm('akunPersediaanId', '');
      setCurrentAkun(null);
    }
  };

  // === Phase 2 — handler perubahan itemType ===
  // JASA → auto-set stockItem=false, hide stok fields, kosongkan mapping akun persediaan.
  const handleItemTypeChange = (value: string) => {
    updateForm('itemType', value);
    if (value === 'JASA') {
      // otomatis set stockItem=false & kosongkan mapping akun persediaan
      setForm((prev) => ({ ...prev, stockItem: false }));
      updateForm('akunPersediaanId', '');
      setCurrentAkun(null);
    } else {
      // Reset to default true when switching away from JASA
      setForm((prev) => ({ ...prev, stockItem: true }));
    }
  };

  // ── Real-time field validation ──────────────────────────────────────────
  const validateField = (field: keyof FormState, value: string | boolean): string => {
    // Phase 2: stockItem (boolean) tidak divalidasi di sini — tidak ada input teks.
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
    (['kode', 'nama', 'hargaPokok', 'stokMinimum'] as const).forEach((field) => {
      const e = validateField(field, form[field]);
      if (e) errors[field] = e;
    });
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

    setSubmitting(true);
    try {
      if (mode === 'create') {
        const payload: BarangCreate = {
          kode: form.kode.trim(),
          nama: form.nama.trim(),
          kategoriId: form.kategoriId,
          satuanId: form.satuanId,
          hargaPokok: form.hargaPokok !== '' ? Number(form.hargaPokok) : undefined,
          stokMinimum: form.stokMinimum !== '' ? Number(form.stokMinimum) : undefined,
          ...(form.jenisBarang ? { jenisBarang: form.jenisBarang } : {}),
          // Tahap 1: kirim null kalau kosong; jangan kirim object akunPersediaan
          ...(form.akunPersediaanId ? { akunPersediaanId: form.akunPersediaanId } : { akunPersediaanId: null }),
          // === Phase 2 — field baru ===
          itemType: (form.itemType as ItemTypeBarang) || undefined,
          akunHppId: form.akunHppId || null,
          akunPenjualanId: form.akunPenjualanId || null,
          stockItem: form.stockItem
        };
        await api.post<BarangResponse>('/master/barang', payload);
        toast.success('Barang berhasil ditambahkan');
      } else {
        if (!editId) return;
        const payload: BarangUpdate = {
          nama: form.nama.trim(),
          kategoriId: form.kategoriId || undefined,
          satuanId: form.satuanId || undefined,
          hargaPokok: form.hargaPokok !== '' ? Number(form.hargaPokok) : undefined,
          stokMinimum: form.stokMinimum !== '' ? Number(form.stokMinimum) : undefined,
          ...(form.jenisBarang ? { jenisBarang: form.jenisBarang } : {}),
          // Tahap 1: PUT mengirim null untuk mengosongkan; ID valid untuk mengganti
          akunPersediaanId: form.akunPersediaanId || null,
          // === Phase 2 — field baru ===
          itemType: (form.itemType as ItemTypeBarang) || null,
          akunHppId: form.akunHppId || null,
          akunPenjualanId: form.akunPenjualanId || null,
          stockItem: form.stockItem
        };
        await api.put<BarangResponse>(`/master/barang/${editId}`, payload);
        toast.success('Barang berhasil diperbarui');
      }
      // Refresh list Persediaan > Barang & Jasa (lokasi baru)
      refreshListTab('inventory', 'barang-jasa');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : mode === 'create' ? 'Gagal menambahkan barang' : 'Gagal memperbarui barang';
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

  return (
    <FormTabShell title={title}>
      <Card className="max-w-4xl">
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">{mode === 'create' ? 'Isi data di bawah untuk menambahkan barang baru.' : `Mengedit barang: ${form.kode} — ${form.nama}`}</p>

          <div className="space-y-2">
            <Label htmlFor="brg-kode">Kode Barang</Label>
            <Input id="brg-kode" placeholder="Contoh: BRG-001" value={form.kode} onChange={(e) => updateForm('kode', e.target.value)} onBlur={() => handleBlur('kode')} aria-invalid={!!formErrors.kode} className={formErrors.kode ? 'border-destructive focus-visible:ring-destructive' : ''} disabled={mode === 'edit'} />
            {formErrors.kode ? <p className="text-xs text-destructive mt-1">{formErrors.kode}</p> : mode === 'edit' ? <p className="text-[11px] text-muted-foreground">Kode barang tidak dapat diubah.</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="brg-nama">Nama Barang</Label>
            <Input id="brg-nama" placeholder="Nama barang" value={form.nama} onChange={(e) => updateForm('nama', e.target.value)} onBlur={() => handleBlur('nama')} aria-invalid={!!formErrors.nama} className={formErrors.nama ? 'border-destructive focus-visible:ring-destructive' : ''} autoFocus />
            {formErrors.nama && <p className="text-xs text-destructive mt-1">{formErrors.nama}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Kategori</Label>
              <SearchableDropdown value={form.kategoriId} onValueChange={(v) => updateForm('kategoriId', v)} options={kategoriOptions.map((k) => ({ id: k.id, label: k.nama }))} placeholder="Pilih kategori" loading={loadingLookups} />
              {formErrors.kategoriId && <p className="text-xs text-destructive mt-1">{formErrors.kategoriId}</p>}
            </div>
            <div className="space-y-2">
              <Label>Satuan</Label>
              <SearchableDropdown value={form.satuanId} onValueChange={(v) => updateForm('satuanId', v)} options={satuanOptions.map((s) => ({ id: s.id, label: s.nama }))} placeholder="Pilih satuan" loading={loadingLookups} />
              {formErrors.satuanId && <p className="text-xs text-destructive mt-1">{formErrors.satuanId}</p>}
            </div>
          </div>

          {/* === Phase 2 — Tipe Barang (pengganti legacy jenisBarang) === */}
          <div className="space-y-2">
            <Label>
              Tipe Barang <span className="text-destructive">*</span>
            </Label>
            <Select value={form.itemType} onValueChange={handleItemTypeChange}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih tipe barang" />
              </SelectTrigger>
              <SelectContent>
                {ITEM_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Tipe barang menentukan klasifikasi &amp; behavior stok.</p>
            {isJasa && <p className="text-[11px] text-amber-700">Item jasa tidak menggunakan mapping akun Persediaan.</p>}
          </div>

          {/* === Phase 2 — Stock Item toggle === */}
          <div className="flex items-center gap-3">
            <Label htmlFor="barang-stock-item">Stok-tracked</Label>
            <input id="barang-stock-item" type="checkbox" checked={form.stockItem} onChange={(e) => setForm((prev) => ({ ...prev, stockItem: e.target.checked }))} disabled={form.itemType === 'JASA'} className="h-4 w-4" />
            <span className="text-[11px] text-muted-foreground">{form.itemType === 'JASA' ? 'Non-stock (JASA)' : form.stockItem ? 'Stok-tracked' : 'Non-stock'}</span>
          </div>

          {/* === Phase 2 — stok fields disembunyikan untuk JASA atau non-stock === */}
          {form.itemType !== 'JASA' && form.stockItem && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="brg-harga">Harga Beli</Label>
                  <Input id="brg-harga" type="number" placeholder="0" min="0" value={form.hargaPokok} onChange={(e) => updateForm('hargaPokok', e.target.value)} onBlur={() => handleBlur('hargaPokok')} aria-invalid={!!formErrors.hargaPokok} className={formErrors.hargaPokok ? 'border-destructive focus-visible:ring-destructive' : ''} />
                  {formErrors.hargaPokok && <p className="text-xs text-destructive mt-1">{formErrors.hargaPokok}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="brg-stok-min">Stok Minimum</Label>
                  <Input id="brg-stok-min" type="number" placeholder="0" min="0" value={form.stokMinimum} onChange={(e) => updateForm('stokMinimum', e.target.value)} onBlur={() => handleBlur('stokMinimum')} aria-invalid={!!formErrors.stokMinimum} className={formErrors.stokMinimum ? 'border-destructive focus-visible:ring-destructive' : ''} />
                  {formErrors.stokMinimum && <p className="text-xs text-destructive mt-1">{formErrors.stokMinimum}</p>}
                </div>
              </div>

              {/* Tahap 1: Akun Persediaan — disembunyikan untuk item JASA atau non-stock */}
              <div className="space-y-2">
                <Label>Akun Persediaan</Label>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Pilih akun perkiraan (COA) untuk persediaan barang ini. Boleh kosong pada tahap 1. Jika akun belum ada, buat dulu di menu <strong>Pengaturan → Akun Perkiraan</strong>, lalu refresh dropdown.
                </p>
                <AkunPersediaanPicker value={form.akunPersediaanId} onChange={(id) => updateForm('akunPersediaanId', id)} currentAkun={currentAkun} disabled={isJasa} />
              </div>

              {/* === Phase 2 — Akun HPP (COGS) === */}
              <div className="space-y-2">
                <Label>Akun HPP (COGS)</Label>
                <Select value={form.akunHppId} onValueChange={(v) => updateForm('akunHppId', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih akun HPP" />
                  </SelectTrigger>
                  <SelectContent>
                    {coaHppOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* === Phase 2 — Akun Penjualan (Revenue) — selalu tampil === */}
          <div className="space-y-2">
            <Label>Akun Penjualan (Revenue)</Label>
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
                  <strong className="text-foreground">Cara kerja multi satuan:</strong> Satuan utama adalah satuan terkecil (mis. <em>pcs</em>). Satuan tambahan memiliki faktor konversi — misal <strong>1 Lusin = 12 pcs</strong> (isi 12),
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

          <div className="flex justify-end gap-2 pt-2">
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
