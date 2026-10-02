'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useERPStore } from '@/store/erp-store';
import { useTabStore } from '@/store/tab-store';
import { useAuthStore } from '@/store/auth-store';
import { useFormDraft, draftKey } from '@/hooks/use-form-draft';
import { DraftIndicator } from '@/components/erp/draft-indicator';
import { FormTabShell } from '@/components/erp/form-tab-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Package, AlertTriangle, DollarSign, Plus, Search, ArrowRightLeft, Warehouse, Tags, ClipboardList, CheckCircle, Loader2, Undo2, ChevronLeft, ChevronRight, FolderTree, FileSpreadsheet, Pencil, PackageX, SearchX, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api, PaginatedResponse, ApiError } from '@/lib/api';
import { formatRp, todayStr } from '@/lib/pdf-utils';
import type { PenyesuaianStokResponse, PenyesuaianStokCreate, PenyesuaianStokUpdate, PemindahanBarangResponse, PemindahanBarangCreate, PemindahanBarangUpdate, PermintaanBarangResponse, PermintaanBarangCreate, PermintaanBarangUpdate, BarangDropdown, GudangResponse, BarangResponse, KategoriBarangResponse, TipePenyesuaian, ProsesPemindahan, SalesOrderResponse, SalesOrderSisaResponse } from '@/types/api';
import StokKartuTab from '@/components/erp/inventory/stok-kartu';
import BarangForm from '@/components/erp/inventory/barang-form';
import { ExcelImportDialog, exportDateStamp } from '@/components/erp/excel-import-dialog';
import { downloadExcelFile } from '@/lib/excel';
import { WorkflowStateBadge, WorkflowActionsCell } from '@/components/erp/workflow-components';
import { useWorkflowStates } from '@/lib/use-workflow-states';
import { needsAdjustmentExpiry, adjustmentExpiryPayload } from '@/lib/phase-a';
import { isStockItemBarang } from '@/lib/master-data';

// ─── Constants ───────────────────────────────────────────────────────────

const PAGE_SIZE = 100;

// ─── Draft Otomatis (localStorage) — bentuk data per form create ──────────

interface PermintaanBarangDraftData {
  tanggal: string;
  // === Update #4 (Q1): link opsional ke Sales Order ===
  salesOrderId: string;
  barangId: string;
  qty: string;
  diajukanOleh: string;
  keterangan: string;
}

interface PemindahanBarangDraftData {
  tanggal: string;
  proses: string;
  dariGudangId: string;
  keGudangId: string;
  barangId: string;
  qty: string;
  keterangan: string;
}

interface PenyesuaianDraftData {
  tanggal: string;
  barangId: string;
  gudangId: string;
  tipe: string;
  qty: string;
  biayaSatuan: string;
  alasan: string;
  expiry: string;
}

// ─── Status Badge ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; label: string }> = {
    DIAJUKAN: { bg: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'Diajukan' },
    DISETUJUI: { bg: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Disetujui' },
    DITOLAK: { bg: 'bg-orange-100 text-orange-700 border-orange-200', label: 'Ditolak' },
    SELESAI: { bg: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Selesai' },
    BATAL: { bg: 'bg-red-100 text-red-700 border-red-200', label: 'Batal' },
    AKTIF: { bg: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Aktif' },
    NONAKTIF: { bg: 'bg-gray-100 text-gray-500 border-gray-200', label: 'Nonaktif' },
    Nonaktif: { bg: 'bg-gray-100 text-gray-500 border-gray-200', label: 'Nonaktif' },
    Tersedia: { bg: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Tersedia' },
    Menipis: { bg: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Menipis' },
    Habis: { bg: 'bg-red-100 text-red-700 border-red-200', label: 'Habis' }
  };
  const entry = map[status];
  if (entry) {
    return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${entry.bg}`}>{entry.label}</span>;
  }
  return <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 border-gray-200">{status}</span>;
}

function TipeBadge({ tipe }: { tipe: string }) {
  if (tipe === 'TAMBAH') {
    return <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 border-emerald-200">Tambah</span>;
  }
  return <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-red-100 text-red-700 border-red-200">Kurang</span>;
}

// ─── Summary Card ───────────────────────────────────────────────────────────

function SummaryCard({ icon: Icon, label, value, iconBg, iconColor, loading }: { icon: React.ElementType; label: string; value: string; iconBg: string; iconColor: string; loading?: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBg} ${iconColor}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground truncate">{label}</p>
          {loading ? <Skeleton className="mt-1 h-5 w-24" /> : <p className="text-lg font-semibold truncate">{value}</p>}
        </div>
      </div>
    </Card>
  );
}

// ─── Error Card ────────────────────────────────────────────────────────────

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

// ─── Table Skeleton ──────────────────────────────────────────────────────

function TableSkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
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

// ─── Pagination ──────────────────────────────────────────────────────────

function Pagination({ skip, total, onNext, onPrev }: { skip: number; total: number; onNext: () => void; onPrev: () => void }) {
  const currentPage = Math.floor(skip / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasNext = skip + PAGE_SIZE < total;
  const hasPrev = skip > 0;
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        Menampilkan {skip + 1}–{Math.min(skip + PAGE_SIZE, total)} dari {total} (Halaman {currentPage} dari {totalPages})
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={!hasPrev} onClick={onPrev} className="gap-1">
          <ChevronLeft className="h-4 w-4" /> Sebelumnya
        </Button>
        <Button variant="outline" size="sm" disabled={!hasNext} onClick={onNext} className="gap-1">
          Selanjutnya <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Custom hook: debounced search + pagination ─────────────────────────

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    timer.current = setTimeout(() => setDebounced(value), delay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, delay]);
  return debounced;
}

// ═══════════════════════════════════════════════════════════════════════════
// Form Components (rendered in tabs)
// ═══════════════════════════════════════════════════════════════════════════

// ─── Permintaan Barang Form ──────────────────────────────────────────────

function PermintaanBarangForm({ formProps }: { formProps?: Record<string, unknown> }) {
  const isEdit = !!formProps?.id;
  const editId = formProps?.id as string | undefined;

  const [barangOptions, setBarangOptions] = useState<BarangDropdown[]>([]);
  const [dropdownsLoading, setDropdownsLoading] = useState(true);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);

  // m-06: default tanggal = hari ini (lokal browser) — konsisten dengan form lain di app
  const [formTanggal, setFormTanggal] = useState(todayStr());
  // === Update #4 (Q1): link opsional ke Sales Order + filter barang SO ===
  const [salesOrderOptions, setSalesOrderOptions] = useState<{ id: string; noPesanan: string }[]>([]);
  const [formSalesOrderId, setFormSalesOrderId] = useState('');
  const [soSisaMap, setSoSisaMap] = useState<Record<string, number>>({});
  const [soBarangIds, setSoBarangIds] = useState<Set<string>>(new Set());
  const [soLoading, setSoLoading] = useState(false);
  const autoQtyRef = useRef(false);
  const [formBarangId, setFormBarangId] = useState('');
  const [formQty, setFormQty] = useState('');
  const [formDiajukanOleh, setFormDiajukanOleh] = useState('');
  const [formKeterangan, setFormKeterangan] = useState('');

  // === Update #4 (Q1): ambil sisa kirim per barang SO terpilih (untuk filter
  // dropdown barang + auto-isi qty = sisa kirim). Gagal fetch → filter reset. ===
  const applySoSisa = useCallback(async (soId: string) => {
    try {
      const sisa = await api.get<SalesOrderSisaResponse>(`/penjualan/sales-order/${soId}/sisa`);
      const map: Record<string, number> = {};
      const ids = new Set<string>();
      (sisa.details || []).forEach((d) => {
        map[d.barangId] = Number(d.sisaKirim) || 0;
        ids.add(d.barangId);
      });
      setSoSisaMap(map);
      setSoBarangIds(ids);
    } catch {
      setSoSisaMap({});
      setSoBarangIds(new Set());
    }
  }, []);

  // Update #4 (Q1): ganti/kosongkan SO — reset qty yang di-auto-isi dari SO
  // sebelumnya (qty yang diisi manual user tidak disentuh), lalu muat filter baru.
  const handleSalesOrderChange = useCallback(
    async (soId: string) => {
      setFormSalesOrderId(soId);
      if (autoQtyRef.current) {
        setFormQty('');
        autoQtyRef.current = false;
      }
      if (!soId) {
        setSoSisaMap({});
        setSoBarangIds(new Set());
        return;
      }
      setSoLoading(true);
      try {
        await applySoSisa(soId);
      } finally {
        setSoLoading(false);
      }
    },
    [applySoSisa]
  );

  // Update #4 (Q1): pilih barang — auto-isi qty = sisa kirim pada SO terpilih
  // (selalu timpa saat ganti barang; user bisa edit setelahnya).
  const handleBarangChange = useCallback(
    (barangId: string) => {
      setFormBarangId(barangId);
      const sisaKirim = soSisaMap[barangId];
      if (sisaKirim != null) {
        setFormQty(String(sisaKirim));
        autoQtyRef.current = true;
      } else {
        autoQtyRef.current = false;
      }
    },
    [soSisaMap]
  );

  // Update #4 (Q1): bila SO dipilih, dropdown barang terfilter ke barang SO itu
  // (subtitle menampilkan sisa kirim per barang).
  const barangDropdownOptions = useMemo(() => {
    const filtered = soBarangIds.size > 0 ? barangOptions.filter((b) => soBarangIds.has(b.id)) : barangOptions;
    return filtered.map((b) => ({
      id: b.id,
      label: b.kode + ' - ' + b.nama,
      subtitle: soSisaMap[b.id] != null ? `Sisa kirim: ${(Number(soSisaMap[b.id]) || 0).toLocaleString('id-ID')}` : undefined
    }));
  }, [barangOptions, soBarangIds, soSisaMap]);

  // ── Draft otomatis (mode create; dipulihkan saat kembali ke form ini) ──
  const userId = useAuthStore((s) => s.user?.id ?? 'anon');
  const draft = useFormDraft<PermintaanBarangDraftData>(draftKey(userId, 'inventory', 'permintaan-barang', 'create'));
  const skipNextSaveRef = useRef(false);
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!isEdit || restoredRef.current) return;
    restoredRef.current = true;
    const d = draft.draft;
    if (!d) return;
    setFormTanggal(d.tanggal || '');
    setFormSalesOrderId(d.salesOrderId || '');
    setFormBarangId(d.barangId || '');
    setFormQty(d.qty || '');
    setFormDiajukanOleh(d.diajukanOleh || '');
    setFormKeterangan(d.keterangan || '');
    // Update #4: pulihkan filter barang sesuai SO tersimpan (qty tidak disentuh).
    if (d.salesOrderId) void applySoSisa(d.salesOrderId);
    toast.info('Draft isian dipulihkan', { description: 'Isian terakhir form Permintaan Barang dimuat kembali otomatis.' });
  }, []);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    if (!isEdit) draft.saveDraft({ tanggal: formTanggal, salesOrderId: formSalesOrderId, barangId: formBarangId, qty: formQty, diajukanOleh: formDiajukanOleh, keterangan: formKeterangan });
  }, [formTanggal, formSalesOrderId, formBarangId, formQty, formDiajukanOleh, formKeterangan]);

  const handleDiscardDraft = useCallback(() => {
    skipNextSaveRef.current = true;
    draft.clearDraft();
    setFormTanggal(todayStr());
    setFormSalesOrderId('');
    setSoSisaMap({});
    setSoBarangIds(new Set());
    autoQtyRef.current = false;
    setFormBarangId('');
    setFormQty('');
    setFormDiajukanOleh('');
    setFormKeterangan('');
  }, []);

  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const title = isEdit ? 'Edit Permintaan Barang' : 'Tambah Permintaan Barang';

  useEffect(() => {
    const fetchDropdowns = async () => {
      setDropdownsLoading(true);
      try {
        // Update #4 (Q1): opsi SO utk dropdown "Link ke Sales Order" (tanpa DIBATALKAN).
        const [barangRes, soRes] = await Promise.all([api.get<BarangDropdown[]>('/master/barang-dropdown'), api.get<PaginatedResponse<SalesOrderResponse>>('/penjualan/sales-order?limit=200')]);
        setBarangOptions(barangRes);
        setSalesOrderOptions(soRes.data.filter((so) => so.status !== 'DIBATALKAN').map((so) => ({ id: so.id, noPesanan: so.noPesanan })));
      } catch {
        /* non-critical */
      } finally {
        setDropdownsLoading(false);
      }
    };
    fetchDropdowns();
  }, []);

  useEffect(() => {
    if (!isEdit || !editId) return;
    const fetchItem = async () => {
      setLoading(true);
      try {
        const item = await api.get<PermintaanBarangResponse>(`/persediaan/permintaan/${editId}`);
        setFormTanggal(item.tanggal ? item.tanggal.slice(0, 10) : '');
        setFormBarangId(item.barangId);
        setFormQty(String(item.qty));
        setFormDiajukanOleh(item.diajukanOleh);
        setFormKeterangan(item.keterangan || '');
        // Update #4 (Q1): SO ter-link → set dropdown + filter barang SO itu
        // (qty tersimpan TIDAK ditimpa auto-isi).
        setFormSalesOrderId(item.salesOrderId || '');
        if (item.salesOrderId) void applySoSisa(item.salesOrderId);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.detail : 'Gagal memuat data permintaan');
      } finally {
        setLoading(false);
      }
    };
    fetchItem();
  }, [isEdit, editId, applySoSisa]);

  const handleSubmit = async () => {
    if (!formTanggal || !formBarangId || !formQty || !formDiajukanOleh) {
      toast.error('Tanggal, barang, qty, dan diajukan oleh wajib diisi');
      return;
    }
    // Audit manufaktur (2026-10-01): qty wajib bilangan bulat >= 1.
    // Dulu "0"/"-5" lolos cek falsy (!formQty) → backend menerima → dokumen
    // sampah DIAJUKAN tertinggal (admin: direct_complete gagal senyap).
    const qtyNum = Number(formQty);
    if (!Number.isInteger(qtyNum) || qtyNum < 1) {
      toast.error('Qty harus berupa bilangan bulat minimal 1');
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit && editId) {
        const payload: PermintaanBarangUpdate = {
          tanggal: formTanggal,
          barangId: formBarangId,
          qty: Number(formQty),
          diajukanOleh: formDiajukanOleh,
          keterangan: formKeterangan || null,
          // Audit manufaktur (2026-10-01): null kini benar-benar MELEPAS link SO
          // (backend memakai sentinel _UNSET); id baru = ganti SO.
          salesOrderId: formSalesOrderId || null
        };
        await api.put<PermintaanBarangResponse>(`/persediaan/permintaan/${editId}`, payload);
        toast.success('Permintaan barang berhasil diperbarui');
      } else {
        const payload: PermintaanBarangCreate = {
          tanggal: formTanggal,
          barangId: formBarangId,
          qty: Number(formQty),
          diajukanOleh: formDiajukanOleh,
          keterangan: formKeterangan || null,
          // Link opsional ke Sales Order (null = tanpa link).
          salesOrderId: formSalesOrderId || null
        };
        await api.post<PermintaanBarangResponse>('/persediaan/permintaan', payload);
        toast.success('Permintaan barang berhasil diajukan');
        draft.clearDraft();
      }
      refreshListTab('inventory', 'permintaan-barang');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : isEdit ? 'Gagal memperbarui permintaan' : 'Gagal mengajukan permintaan');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormTabShell title={title}>
      <Card className="max-w-5xl">
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">{isEdit ? 'Ubah data permintaan barang.' : 'Isi data permintaan barang yang akan diajukan.'}</p>
          {loading ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>
                    Tanggal <span className="text-destructive">*</span>
                  </Label>
                  <Input type="date" value={formTanggal} onChange={(e) => setFormTanggal(e.target.value)} autoFocus />
                </div>
                <div className="space-y-2">
                  <Label>Link ke Sales Order</Label>
                  <SearchableDropdown value={formSalesOrderId} onValueChange={handleSalesOrderChange} options={salesOrderOptions.map((so) => ({ id: so.id, label: so.noPesanan }))} allOption={{ id: '', label: 'Tidak ada' }} placeholder="Pilih SO (opsional)..." disabled={soLoading} />
                  {soLoading && <p className="text-xs text-muted-foreground">Memuat sisa SO...</p>}
                  {!soLoading && formSalesOrderId && <p className="text-xs text-muted-foreground">Barang difilter ke barang pada SO terpilih; qty otomatis diisi sisa kirim.</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>
                    Barang <span className="text-destructive">*</span>
                  </Label>
                  <SearchableDropdown value={formBarangId} onValueChange={handleBarangChange} options={barangDropdownOptions} placeholder="Pilih barang" loading={dropdownsLoading} emptyText={formSalesOrderId ? 'Tidak ada barang pada SO ini.' : 'Tidak ditemukan.'} compact />
                </div>
                <div className="space-y-2">
                  <Label>
                    Qty <span className="text-destructive">*</span>
                  </Label>
                  <Input type="number" placeholder="0" min={1} step={1} value={formQty} onChange={(e) => setFormQty(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>
                    Diajukan Oleh <span className="text-destructive">*</span>
                  </Label>
                  <Input placeholder="Nama pengaju" value={formDiajukanOleh} onChange={(e) => setFormDiajukanOleh(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Keterangan</Label>
                <Textarea placeholder="Keterangan permintaan..." rows={3} value={formKeterangan} onChange={(e) => setFormKeterangan(e.target.value)} />
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                {!isEdit && (
                  <div className="mr-auto">
                    <DraftIndicator hasDraft={draft.hasDraft} ageLabel={draft.draftAgeLabel} onDiscard={handleDiscardDraft} formLabel="Permintaan Barang" />
                  </div>
                )}
                <Button variant="outline" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting}>
                  Batal
                </Button>
                <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isEdit ? 'Simpan Perubahan' : 'Ajukan Permintaan'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </FormTabShell>
  );
}

// ─── Pemindahan Barang Form ──────────────────────────────────────────────

function PemindahanBarangForm({ formProps }: { formProps?: Record<string, unknown> }) {
  const isEdit = !!formProps?.id;
  const editId = formProps?.id as string | undefined;

  const [barangOptions, setBarangOptions] = useState<BarangDropdown[]>([]);
  const [gudangOptions, setGudangOptions] = useState<GudangResponse[]>([]);
  const [dropdownsLoading, setDropdownsLoading] = useState(true);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);

  // m-06: default tanggal = hari ini (lokal browser) — konsisten dengan form lain di app
  const [formTanggal, setFormTanggal] = useState(todayStr());
  const [formProses, setFormProses] = useState('');
  const [formDariGudangId, setFormDariGudangId] = useState('');
  const [formKeGudangId, setFormKeGudangId] = useState('');
  const [formBarangId, setFormBarangId] = useState('');
  const [formQty, setFormQty] = useState('');
  const [formKeterangan, setFormKeterangan] = useState('');

  // ── Draft otomatis (mode create; dipulihkan saat kembali ke form ini) ──
  const userId = useAuthStore((s) => s.user?.id ?? 'anon');
  const draft = useFormDraft<PemindahanBarangDraftData>(draftKey(userId, 'inventory', 'pemindahan-barang', 'create'));
  const skipNextSaveRef = useRef(false);
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!isEdit || restoredRef.current) return;
    restoredRef.current = true;
    const d = draft.draft;
    if (!d) return;
    setFormTanggal(d.tanggal || '');
    setFormProses(d.proses || '');
    setFormDariGudangId(d.dariGudangId || '');
    setFormKeGudangId(d.keGudangId || '');
    setFormBarangId(d.barangId || '');
    setFormQty(d.qty || '');
    setFormKeterangan(d.keterangan || '');
    toast.info('Draft isian dipulihkan', { description: 'Isian terakhir form Pemindahan Barang dimuat kembali otomatis.' });
  }, []);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    if (!isEdit) draft.saveDraft({ tanggal: formTanggal, proses: formProses, dariGudangId: formDariGudangId, keGudangId: formKeGudangId, barangId: formBarangId, qty: formQty, keterangan: formKeterangan });
  }, [formTanggal, formProses, formDariGudangId, formKeGudangId, formBarangId, formQty, formKeterangan]);

  const handleDiscardDraft = useCallback(() => {
    skipNextSaveRef.current = true;
    draft.clearDraft();
    setFormTanggal(todayStr());
    setFormProses('');
    setFormDariGudangId('');
    setFormKeGudangId('');
    setFormBarangId('');
    setFormQty('');
    setFormKeterangan('');
  }, []);

  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const title = isEdit ? 'Edit Pemindahan Barang' : 'Tambah Pemindahan Barang';

  const keGudangOptions = gudangOptions.filter((g) => g.id !== formDariGudangId);

  useEffect(() => {
    const fetchDropdowns = async () => {
      setDropdownsLoading(true);
      try {
        const [barangRes, gudangRes] = await Promise.all([api.get<BarangDropdown[]>('/master/barang-dropdown'), api.get<GudangResponse[]>('/master/gudang')]);
        setBarangOptions(barangRes);
        setGudangOptions(gudangRes);
      } catch {
        /* non-critical */
      } finally {
        setDropdownsLoading(false);
      }
    };
    fetchDropdowns();
  }, []);

  useEffect(() => {
    if (!isEdit || !editId) return;
    const fetchItem = async () => {
      setLoading(true);
      try {
        const item = await api.get<PemindahanBarangResponse>(`/persediaan/pemindahan/${editId}`);
        setFormTanggal(item.tanggal ? item.tanggal.slice(0, 10) : '');
        setFormProses(item.proses);
        setFormDariGudangId(item.dariGudangId);
        setFormKeGudangId(item.keGudangId);
        setFormBarangId(item.barangId);
        setFormQty(String(item.qty));
        setFormKeterangan(item.keterangan || '');
      } catch (err) {
        toast.error(err instanceof ApiError ? err.detail : 'Gagal memuat data pemindahan');
      } finally {
        setLoading(false);
      }
    };
    fetchItem();
  }, [isEdit, editId]);

  const handleSubmit = async () => {
    if (!formTanggal || !formProses || !formDariGudangId || !formKeGudangId || !formBarangId || !formQty) {
      toast.error('Semua field wajib diisi');
      return;
    }
    // Audit manufaktur (2026-10-01): qty wajib bilangan bulat >= 1 (dulu
    // "0"/negatif lolos cek falsy dan tertinggal sebagai dokumen sampah).
    const qtyNum = Number(formQty);
    if (!Number.isInteger(qtyNum) || qtyNum < 1) {
      toast.error('Qty harus berupa bilangan bulat minimal 1');
      return;
    }
    // Phase 3: proactive check — barang non-stock tidak boleh dipakai pemindahan stok
    const selectedBarang = barangOptions.find((b) => b.id === formBarangId);
    if (selectedBarang && !isStockItemBarang(selectedBarang)) {
      toast.error('Barang ini non-stock (JASA atau stock_item=false), tidak bisa dipakai transaksi pemindahan stok.');
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit && editId) {
        const payload: PemindahanBarangUpdate = {
          tanggal: formTanggal,
          proses: formProses as ProsesPemindahan,
          dariGudangId: formDariGudangId,
          keGudangId: formKeGudangId,
          barangId: formBarangId,
          qty: Number(formQty),
          keterangan: formKeterangan || null
        };
        await api.put<PemindahanBarangResponse>(`/persediaan/pemindahan/${editId}`, payload);
        toast.success('Pemindahan barang berhasil diperbarui');
      } else {
        const payload: PemindahanBarangCreate = {
          tanggal: formTanggal,
          proses: formProses as ProsesPemindahan,
          dariGudangId: formDariGudangId,
          keGudangId: formKeGudangId,
          barangId: formBarangId,
          qty: Number(formQty)
        };
        await api.post<PemindahanBarangResponse>('/persediaan/pemindahan', payload);
        toast.success('Pemindahan barang berhasil diproses');
        draft.clearDraft();
      }
      refreshListTab('inventory', 'pemindahan-barang');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : isEdit ? 'Gagal memperbarui pemindahan' : 'Gagal memproses pemindahan');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormTabShell title={title}>
      <Card className="max-w-5xl">
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">{isEdit ? 'Ubah data pemindahan barang antar gudang.' : 'Isi data pemindahan barang antar gudang.'}</p>
          {loading ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>
                    Tanggal <span className="text-destructive">*</span>
                  </Label>
                  <Input type="date" value={formTanggal} onChange={(e) => setFormTanggal(e.target.value)} autoFocus />
                </div>
                <div className="space-y-2">
                  <Label>
                    Proses <span className="text-destructive">*</span>
                  </Label>
                  <Select value={formProses} onValueChange={setFormProses}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih proses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="KIRIM">Kirim</SelectItem>
                      <SelectItem value="TERIMA">Terima</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>
                    Dari Gudang <span className="text-destructive">*</span>
                  </Label>
                  <SearchableDropdown
                    value={formDariGudangId}
                    onValueChange={(v) => {
                      setFormDariGudangId(v);
                      if (v === formKeGudangId) setFormKeGudangId('');
                    }}
                    options={gudangOptions.map((g) => ({ id: g.id, label: g.nama, subtitle: g.kode }))}
                    placeholder="Pilih gudang"
                    loading={dropdownsLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    Ke Gudang <span className="text-destructive">*</span>
                  </Label>
                  <SearchableDropdown value={formKeGudangId} onValueChange={setFormKeGudangId} options={keGudangOptions.map((g) => ({ id: g.id, label: g.nama, subtitle: g.kode }))} placeholder="Pilih gudang" loading={dropdownsLoading} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>
                    Barang <span className="text-destructive">*</span>
                  </Label>
                  <SearchableDropdown value={formBarangId} onValueChange={setFormBarangId} options={barangOptions.filter((b) => isStockItemBarang(b)).map((b) => ({ id: b.id, label: b.kode + ' - ' + b.nama }))} placeholder="Pilih barang" loading={dropdownsLoading} compact />
                </div>
                <div className="space-y-2">
                  <Label>
                    Qty <span className="text-destructive">*</span>
                  </Label>
                  <Input type="number" placeholder="0" min={1} step={1} value={formQty} onChange={(e) => setFormQty(e.target.value)} />
                </div>
              </div>
              {isEdit && (
                <div className="space-y-2">
                  <Label>Keterangan</Label>
                  <Textarea placeholder="Keterangan pemindahan..." rows={3} value={formKeterangan} onChange={(e) => setFormKeterangan(e.target.value)} />
                </div>
              )}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                {!isEdit && (
                  <div className="mr-auto">
                    <DraftIndicator hasDraft={draft.hasDraft} ageLabel={draft.draftAgeLabel} onDiscard={handleDiscardDraft} formLabel="Pemindahan Barang" />
                  </div>
                )}
                <Button variant="outline" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting}>
                  Batal
                </Button>
                <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isEdit ? 'Simpan Perubahan' : 'Proses Pemindahan'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </FormTabShell>
  );
}

// ─── Penyesuaian Stok Form ───────────────────────────────────────────────

function PenyesuaianForm({ formProps }: { formProps?: Record<string, unknown> }) {
  const [createdId, setCreatedId] = useState<string | null>(null);
  const isEdit = !!formProps?.id || !!createdId;
  const editId = (formProps?.id as string | undefined) || createdId;

  const [barangOptions, setBarangOptions] = useState<BarangDropdown[]>([]);
  const [gudangOptions, setGudangOptions] = useState<GudangResponse[]>([]);
  const [dropdownsLoading, setDropdownsLoading] = useState(true);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);

  // m-06: default tanggal = hari ini (lokal browser) — konsisten dengan form lain di app
  const [formTanggal, setFormTanggal] = useState(todayStr());
  const [formBarangId, setFormBarangId] = useState('');
  const [formGudangId, setFormGudangId] = useState('');
  const [formTipe, setFormTipe] = useState('');
  const [formQty, setFormQty] = useState('');
  const [formBiayaSatuan, setFormBiayaSatuan] = useState('');
  const [formAlasan, setFormAlasan] = useState('');
  const [formExpiry, setFormExpiry] = useState('');
  // Audit manufaktur (2026-10-01): penyesuaian adalah satu-satunya dokumen
  // persediaan yang mengubah NILAI persediaan — tanpa jurnal, buku besar GL
  // (114001/114002/114004) akan drift dari subledger kartu stok. Default ON
  // mengikuti intent asli model DB (penyesuaian_stok.auto_post_jurnal
  // default True); akuntan bisa mematikan bila ingin kontrol jurnal manual.
  const [formAutoJurnal, setFormAutoJurnal] = useState(true);

  // ── Draft otomatis (mode create; dipulihkan saat kembali ke form ini) ──
  const userId = useAuthStore((s) => s.user?.id ?? 'anon');
  const draft = useFormDraft<PenyesuaianDraftData>(draftKey(userId, 'inventory', 'penyesuaian', 'create'));
  const skipNextSaveRef = useRef(false);
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!!formProps?.id || restoredRef.current) return;
    restoredRef.current = true;
    const d = draft.draft;
    if (!d) return;
    setFormTanggal(d.tanggal || '');
    setFormBarangId(d.barangId || '');
    setFormGudangId(d.gudangId || '');
    setFormTipe(d.tipe || '');
    setFormQty(d.qty || '');
    setFormBiayaSatuan(d.biayaSatuan || '');
    setFormAlasan(d.alasan || '');
    setFormExpiry(d.expiry || '');
    toast.info('Draft isian dipulihkan', { description: 'Isian terakhir form Penyesuaian Stok dimuat kembali otomatis.' });
  }, []);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    if (!formProps?.id && !createdId) draft.saveDraft({ tanggal: formTanggal, barangId: formBarangId, gudangId: formGudangId, tipe: formTipe, qty: formQty, biayaSatuan: formBiayaSatuan, alasan: formAlasan, expiry: formExpiry });
  }, [formTanggal, formBarangId, formGudangId, formTipe, formQty, formBiayaSatuan, formAlasan, formExpiry]);

  const handleDiscardDraft = useCallback(() => {
    skipNextSaveRef.current = true;
    draft.clearDraft();
    setFormTanggal(todayStr());
    setFormBarangId('');
    setFormGudangId('');
    setFormTipe('');
    setFormQty('');
    setFormBiayaSatuan('');
    setFormAlasan('');
    setFormExpiry('');
    setBarangDetail(null);
    setSubmitError('');
  }, []);
  const [originalExpiry, setOriginalExpiry] = useState<string | null>(null);
  const [barangDetail, setBarangDetail] = useState<BarangResponse | null>(null);
  const [barangError, setBarangError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [barangRetry, setBarangRetry] = useState(0);
  const selectedBarang = barangDetail?.id === formBarangId ? barangDetail : null;

  // ── Metode valuasi GLOBAL (audit manufaktur 2026-10-01) ──
  // Engine stok backend memakai SATU metode global (Setting Akun →
  // METODE_VALUASI); kolom legacy per-barang (barang.metode_valuasi, yang
  // seluruhnya masih "AVERAGE") tidak lagi dipakai. Keputusan tampilnya
  // field kedaluwarsa & banner FEFO kini mengikuti metode global agar
  // konsisten dengan validasi approve di backend (dulu: jika global
  // FEFO tapi barang legacy AVERAGE, field tersembunyi → approve pasti
  // gagal "wajib mengisi tanggal_kedaluwarsa" dan user tidak bisa mengisi).
  const [metodeValuasiGlobal, setMetodeValuasiGlobal] = useState<string | undefined>(undefined);
  useEffect(() => {
    let active = true;
    api
      .get<{ key: string; value: string }>('/master/app-setting/METODE_VALUASI')
      .then((r) => {
        if (active) setMetodeValuasiGlobal(r.value);
      })
      .catch(() => {
        /* gagal muat → biarkan undefined: field expiry tersembunyi (perilaku lama);
           validasi backend tetap sebagai garis pertahanan terakhir */
      });
    return () => {
      active = false;
    };
  }, []);
  const showExpiry = needsAdjustmentExpiry(formTipe, metodeValuasiGlobal);

  useEffect(() => {
    let active = true;
    if (formBarangId) {
      api
        .get<BarangResponse>('/master/barang/' + formBarangId)
        .then((value) => {
          if (active) {
            setBarangDetail(value);
            setBarangError('');
          }
        })
        .catch((err) => {
          if (active) setBarangError(err instanceof ApiError ? err.detail : 'Gagal memuat metode valuasi barang');
        });
    }
    return () => {
      active = false;
    };
  }, [formBarangId, barangRetry]);

  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const title = isEdit ? 'Edit Penyesuaian Persediaan' : 'Tambah Penyesuaian Persediaan';

  const formTotal = useMemo(() => {
    const q = Number(formQty) || 0;
    const b = Number(formBiayaSatuan) || 0;
    return q * b;
  }, [formQty, formBiayaSatuan]);

  useEffect(() => {
    const fetchDropdowns = async () => {
      setDropdownsLoading(true);
      try {
        const [barangRes, gudangRes] = await Promise.all([api.get<BarangDropdown[]>('/master/barang-dropdown'), api.get<GudangResponse[]>('/master/gudang')]);
        setBarangOptions(barangRes);
        setGudangOptions(gudangRes || []);
      } catch {
        /* non-critical */
      } finally {
        setDropdownsLoading(false);
      }
    };
    fetchDropdowns();
  }, []);

  useEffect(() => {
    if (!isEdit || !editId) return;
    const fetchItem = async () => {
      setLoading(true);
      try {
        const item = await api.get<PenyesuaianStokResponse>(`/persediaan/penyesuaian-stok/${editId}`);
        setFormTanggal(item.tanggal ? item.tanggal.slice(0, 10) : '');
        setFormBarangId(item.barangId);
        setFormGudangId(item.gudangId || '');
        setFormTipe(item.tipe);
        setFormQty(String(item.qty));
        setFormBiayaSatuan(String(item.biayaSatuan));
        setFormAlasan(item.alasan || '');
        setFormExpiry(item.tanggalKedaluwarsa || '');
        setOriginalExpiry(item.tanggalKedaluwarsa || null);
        setFormAutoJurnal(item.autoPostJurnal !== false);
      } catch (err) {
        setLoadError(err instanceof ApiError ? err.detail : 'Gagal memuat data penyesuaian');
      } finally {
        setLoading(false);
      }
    };
    fetchItem();
  }, [isEdit, editId]);

  const handleSubmit = async () => {
    if (!formTanggal || !formBarangId || !formGudangId || !formTipe || !formQty) {
      toast.error('Tanggal, barang, gudang, tipe, dan qty wajib diisi');
      return;
    }
    // Audit manufaktur (2026-10-01): qty wajib bilangan bulat >= 1 (dulu
    // "0"/negatif lolos cek falsy dan tertinggal sebagai dokumen sampah).
    const qtyNum = Number(formQty);
    if (!Number.isInteger(qtyNum) || qtyNum < 1) {
      toast.error('Qty harus berupa bilangan bulat minimal 1');
      return;
    }
    // Phase 3: proactive check — barang non-stock tidak boleh dipakai penyesuaian stok
    if (!selectedBarang) {
      setSubmitError('Tunggu data barang selesai dimuat.');
      return;
    }
    if (showExpiry && !formExpiry) {
      setSubmitError('Isi tanggal kedaluwarsa untuk penambahan stok barang FEFO.');
      return;
    }
    if (selectedBarang && !isStockItemBarang(selectedBarang)) {
      toast.error('Barang ini non-stock (JASA atau stock_item=false), tidak bisa dipakai transaksi penyesuaian stok.');
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit && editId) {
        const payload: PenyesuaianStokUpdate = {
          tanggal: formTanggal,
          ...adjustmentExpiryPayload(showExpiry, formExpiry, originalExpiry),
          barangId: formBarangId,
          gudangId: formGudangId || null,
          tipe: formTipe as TipePenyesuaian,
          qty: Number(formQty),
          biayaSatuan: formTipe === 'KURANG' ? undefined : formBiayaSatuan ? Number(formBiayaSatuan) : undefined,
          alasan: formAlasan || null,
          autoPostJurnal: formAutoJurnal
        };
        const saved = await api.put<PenyesuaianStokResponse>(`/persediaan/penyesuaian-stok/${editId}`, payload);
        if (showExpiry && saved.tanggalKedaluwarsa !== formExpiry) throw new Error('Tanggal kedaluwarsa belum tersimpan oleh server. Hubungi administrator sebelum menyetujui penyesuaian.');
        toast.success('Penyesuaian stok berhasil diperbarui');
      } else {
        const payload: PenyesuaianStokCreate = {
          tanggal: formTanggal,
          ...adjustmentExpiryPayload(showExpiry, formExpiry, originalExpiry),
          barangId: formBarangId,
          gudangId: formGudangId || null,
          tipe: formTipe as TipePenyesuaian,
          qty: Number(formQty),
          biayaSatuan: formTipe === 'KURANG' ? undefined : formBiayaSatuan ? Number(formBiayaSatuan) : undefined,
          alasan: formAlasan || null,
          autoPostJurnal: formAutoJurnal
        };
        const saved = await api.post<PenyesuaianStokResponse>('/persediaan/penyesuaian-stok', payload);
        draft.clearDraft();
        if (showExpiry && saved.tanggalKedaluwarsa !== formExpiry) {
          setCreatedId(saved.id);
          refreshListTab('inventory', 'penyesuaian');
          throw new Error('Penyesuaian sudah dibuat, tetapi tanggal kedaluwarsa belum tersimpan oleh server. Hubungi administrator sebelum menyetujui penyesuaian.');
        }
        toast.success('Penyesuaian stok berhasil disimpan');
      }
      refreshListTab('inventory', 'penyesuaian');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : isEdit ? 'Gagal memperbarui penyesuaian' : 'Gagal menyimpan penyesuaian');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormTabShell title={title}>
      <Card className="max-w-5xl">
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">{isEdit ? 'Ubah data penyesuaian stok barang.' : 'Isi data penyesuaian stok barang.'}</p>
          {loading ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>
                    Tanggal <span className="text-destructive">*</span>
                  </Label>
                  <Input type="date" value={formTanggal} onChange={(e) => setFormTanggal(e.target.value)} autoFocus />
                </div>
                <div className="space-y-2">
                  <Label>
                    Barang <span className="text-destructive">*</span>
                  </Label>
                  <SearchableDropdown
                    value={formBarangId}
                    onValueChange={(id) => {
                      setFormBarangId(id);
                      setFormExpiry('');
                      setBarangError('');
                      setBarangDetail(null);
                    }}
                    options={barangOptions.filter((b) => isStockItemBarang(b)).map((b) => ({ id: b.id, label: b.kode + ' - ' + b.nama }))}
                    placeholder="Pilih barang"
                    loading={dropdownsLoading}
                    compact
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>
                    Gudang <span className="text-destructive">*</span>
                  </Label>
                  <SearchableDropdown value={formGudangId} onValueChange={setFormGudangId} options={gudangOptions.map((g) => ({ id: g.id, label: g.kode + ' - ' + g.nama }))} placeholder="Pilih gudang (wajib)" loading={dropdownsLoading} compact />
                </div>
                <div className="space-y-2">
                  <Label>
                    Tipe <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={formTipe}
                    onValueChange={(value) => {
                      setFormTipe(value);
                      if (value !== 'TAMBAH') setFormExpiry('');
                    }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih tipe" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TAMBAH">Tambah</SelectItem>
                      <SelectItem value="KURANG">Kurang</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>
                    Qty <span className="text-destructive">*</span>
                  </Label>
                  <Input type="number" placeholder="0" min={1} step={1} value={formQty} onChange={(e) => setFormQty(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Biaya Satuan</Label>
                  <CurrencyInput allowDecimal disabled={formTipe === 'KURANG'} placeholder="0" value={formBiayaSatuan} onValueChange={(v) => setFormBiayaSatuan(v)} />
                </div>
                <div className="space-y-2">
                  <Label>Total</Label>
                  <Input type="text" value={formTipe === 'KURANG' ? 'Dihitung saat diposting' : formatRp(formTotal)} readOnly className="bg-muted" />
                </div>
              </div>
              {formBarangId && !selectedBarang && !barangError && <p role="status">Memuat data barang...</p>}
              {barangError && (
                <div role="alert" className="text-sm text-destructive">
                  {barangError}{' '}
                  <Button variant="outline" onClick={() => setBarangRetry((v) => v + 1)}>
                    Coba Lagi
                  </Button>
                </div>
              )}
              {metodeValuasiGlobal === 'FEFO' && <p className="rounded border border-blue-200 bg-blue-50 p-3 text-sm">Metode valuasi global FEFO aktif. {formTipe === 'TAMBAH' ? 'Isi tanggal kedaluwarsa untuk stok yang ditambahkan.' : 'Pengeluaran mengikuti layer persediaan dari backend.'}</p>}
              {showExpiry && (
                <div className="space-y-2">
                  <Label htmlFor="adj-expiry">
                    Tanggal Kedaluwarsa <span className="text-destructive">*</span>
                  </Label>
                  <Input id="adj-expiry" type="date" value={formExpiry} onChange={(e) => setFormExpiry(e.target.value)} required />
                </div>
              )}
              {formTipe === 'KURANG' && <p className="text-sm text-muted-foreground">Biaya satuan ditentukan dari layer atau rata-rata persediaan saat diposting.</p>}
              {loadError && (
                <p role="alert" className="text-destructive">
                  {loadError}
                </p>
              )}
              <div className="space-y-2">
                <Label>Alasan</Label>
                <Textarea placeholder="Alasan penyesuaian..." rows={3} value={formAlasan} onChange={(e) => setFormAlasan(e.target.value)} />
              </div>
              <div className="flex items-start space-x-3 rounded-md border p-3">
                <Switch id="adj-auto-jurnal" checked={formAutoJurnal} onCheckedChange={setFormAutoJurnal} className="mt-0.5" />
                <div className="space-y-0.5">
                  <Label htmlFor="adj-auto-jurnal" className="cursor-pointer">
                    Otomatis post jurnal
                  </Label>
                  <p className="text-xs text-muted-foreground">Saat disetujui, jurnal otomatis dibuat: TAMBAH = D Persediaan / K Selisih Persediaan; KURANG = D Selisih Persediaan / K Persediaan (akun persediaan mengikuti jenis barang). Matikan bila tim akuntansi ingin mencatat jurnal manual.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                {!isEdit && (
                  <div className="mr-auto">
                    <DraftIndicator hasDraft={draft.hasDraft} ageLabel={draft.draftAgeLabel} onDiscard={handleDiscardDraft} formLabel="Penyesuaian Stok" />
                  </div>
                )}
                <Button variant="outline" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting}>
                  Batal
                </Button>
                <Button onClick={handleSubmit} disabled={submitting || !!loadError || !formGudangId || !selectedBarang || (showExpiry && !formExpiry)} className="gap-2">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isEdit ? 'Simpan Perubahan' : 'Simpan Penyesuaian'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <AlertDialog
        open={!!submitError}
        onOpenChange={(open) => {
          if (!open) setSubmitError('');
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Penyesuaian belum tersimpan</AlertDialogTitle>
            <AlertDialogDescription>{submitError}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setSubmitError('')}>Kembali ke form</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FormTabShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab Components (list views)
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// Tab 1: Permintaan Barang
// ═══════════════════════════════════════════════════════════════════════════

function PermintaanBarangTab({ refreshKey }: { refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab);

  // dropdown options
  const [barangOptions, setBarangOptions] = useState<BarangDropdown[]>([]);
  const [dropdownsLoading, setDropdownsLoading] = useState(true);

  // table data
  const [data, setData] = useState<PermintaanBarangResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [barangFilter, setBarangFilter] = useState('');
  const [skip, setSkip] = useState(0);

  const debouncedSearch = useDebounce(search, 300);

  // actions
  // (workflow actions are handled by WorkflowActionsCell — no local loading state needed)

  // reset skip when filters change
  useEffect(() => {
    setSkip(0);
  }, [debouncedSearch, statusFilter, barangFilter, dateFrom, dateTo]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('skip', String(skip));
      params.set('limit', String(PAGE_SIZE));
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter) params.set('status', statusFilter);
      if (barangFilter) params.set('barang_id', barangFilter);
      if (dateFrom) params.set('tanggal_from', dateFrom);
      if (dateTo) params.set('tanggal_to', dateTo);
      const res = await api.get<PaginatedResponse<PermintaanBarangResponse>>(`/persediaan/permintaan?${params.toString()}`);
      setData(res.data);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Gagal memuat data permintaan barang');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, barangFilter, dateFrom, dateTo, skip]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const fetchDropdowns = useCallback(async () => {
    setDropdownsLoading(true);
    try {
      const [barangRes] = await Promise.all([api.get<BarangDropdown[]>('/master/barang-dropdown')]);
      setBarangOptions(barangRes);
    } catch {
      /* dropdown error non-critical */
    } finally {
      setDropdownsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDropdowns();
  }, [fetchDropdowns]);

  const wfStates = useWorkflowStates(
    'permintaan_barang',
    data.map((d) => d.id),
    refreshKey
  );

  return (
    <>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard icon={ClipboardList} label="Total Permintaan" value={String(total)} iconBg="bg-emerald-50" iconColor="text-emerald-600" loading={loading} />
        <SummaryCard icon={CheckCircle} label="Disetujui" value={String(data.filter((d) => d.status === 'DISETUJUI').length)} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
        <SummaryCard icon={AlertTriangle} label="Menunggu" value={String(data.filter((d) => d.status === 'DIAJUKAN').length)} iconBg="bg-amber-50" iconColor="text-amber-600" />
      </div>

      {/* Table Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Daftar Permintaan Barang</CardTitle>
            <Button
              size="sm"
              className="gap-2"
              onClick={() =>
                openFormTab({
                  title: 'Tambah Permintaan Barang',
                  module: 'inventory',
                  subPage: 'permintaan-barang',
                  formKey: 'permintaan-barang-create'
                })
              }>
              <Plus className="h-4 w-4" /> Tambah Permintaan
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">No Permintaan</TableHead>
                  <TableHead className="whitespace-nowrap">Tanggal</TableHead>
                  <TableHead className="whitespace-nowrap">Nama Barang</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Qty</TableHead>
                  <TableHead className="whitespace-nowrap">Diajukan Oleh</TableHead>
                  {/* Update #4 (Q1): kolom SO ter-link (nomor pesanan) */}
                  <TableHead className="whitespace-nowrap">SO</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Workflow</TableHead>
                  <TableHead className="whitespace-nowrap">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableSkeletonRows cols={9} />}
                {error && (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <ErrorCard message={error} onRetry={fetchData} />
                    </TableCell>
                  </TableRow>
                )}
                {!loading && !error && data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Tidak ada data permintaan barang
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  !error &&
                  data.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap font-medium">{row.noPermintaan}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.tanggal}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.barang?.nama || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{Number(row.qty).toLocaleString('id-ID')}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.diajukanOleh}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">{row.salesOrder?.noPesanan || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-center">
                        {(() => {
                          const w = wfStates.states[row.id];
                          if (!w) return <span className="text-xs text-muted-foreground">—</span>;
                          return (
                            <div className="flex flex-col items-center gap-1">
                              <WorkflowStateBadge state={w.state} />
                              <WorkflowActionsCell
                                documentType={w.documentType}
                                documentId={w.documentId}
                                version={w.version}
                                availableActions={w.availableActions}
                                onDone={() => {
                                  fetchData();
                                  wfStates.refresh();
                                }}
                              />
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {row.status === 'DIAJUKAN' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                openFormTab({
                                  title: `Edit ${row.noPermintaan}`,
                                  module: 'inventory',
                                  subPage: 'permintaan-barang',
                                  formKey: 'permintaan-barang-edit',
                                  formProps: { id: row.id }
                                })
                              }
                              title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Cari permintaan..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === 'semua' ? '' : v)}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="semua">Semua Status</SelectItem>
            <SelectItem value="DIAJUKAN">Diajukan</SelectItem>
            <SelectItem value="DISETUJUI">Disetujui</SelectItem>
            <SelectItem value="DITOLAK">Ditolak</SelectItem>
            <SelectItem value="BATAL">Batal</SelectItem>
          </SelectContent>
        </Select>
        <SearchableDropdown placeholder="Filter Barang" options={barangOptions.map((b) => ({ id: b.id, label: b.nama, subtitle: b.kode }))} value={barangFilter} onValueChange={setBarangFilter} className="w-full sm:w-[200px]" />
        <Input type="date" className="w-full sm:w-[160px]" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="Dari tanggal" />
        <Input type="date" className="w-full sm:w-[160px]" value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="Sampai tanggal" />
      </div>

      {/* Pagination */}
      {!loading && !error && total > 0 && <Pagination skip={skip} total={total} onNext={() => setSkip((s) => s + PAGE_SIZE)} onPrev={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))} />}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab 2: Pemindahan Barang
// ═══════════════════════════════════════════════════════════════════════════

function PemindahanBarangTab({ refreshKey }: { refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab);

  const [barangOptions, setBarangOptions] = useState<BarangDropdown[]>([]);
  const [gudangOptions, setGudangOptions] = useState<GudangResponse[]>([]);
  const [dropdownsLoading, setDropdownsLoading] = useState(true);

  const [data, setData] = useState<PemindahanBarangResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [prosesFilter, setProsesFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dariGudangFilter, setDariGudangFilter] = useState('');
  const [keGudangFilter, setKeGudangFilter] = useState('');
  const [skip, setSkip] = useState(0);

  // Phase 3: reverse pemindahan (untuk status DISETUJUI)
  const [reverseTarget, setReverseTarget] = useState<PemindahanBarangResponse | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reversing, setReversing] = useState(false);

  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    setSkip(0);
  }, [debouncedSearch, statusFilter, prosesFilter, dariGudangFilter, keGudangFilter, dateFrom, dateTo]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('skip', String(skip));
      params.set('limit', String(PAGE_SIZE));
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter) params.set('status', statusFilter);
      if (prosesFilter) params.set('proses', prosesFilter);
      if (dariGudangFilter) params.set('dari_gudang_id', dariGudangFilter);
      if (keGudangFilter) params.set('ke_gudang_id', keGudangFilter);
      if (dateFrom) params.set('tanggal_from', dateFrom);
      if (dateTo) params.set('tanggal_to', dateTo);
      const res = await api.get<PaginatedResponse<PemindahanBarangResponse>>(`/persediaan/pemindahan?${params.toString()}`);
      setData(res.data);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Gagal memuat data pemindahan barang');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, prosesFilter, dariGudangFilter, keGudangFilter, dateFrom, dateTo, skip]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const handleReverse = async () => {
    if (!reverseTarget) return;
    setReversing(true);
    try {
      const reasonParam = reverseReason.trim() ? `?reason=${encodeURIComponent(reverseReason.trim())}` : '';
      await api.post<PemindahanBarangResponse>(`/persediaan/pemindahan/${reverseTarget.id}/reverse${reasonParam}`);
      toast.success(`Pemindahan ${reverseTarget.noPemindahan} berhasil di-reverse`);
      setReverseTarget(null);
      setReverseReason('');
      fetchData();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal reverse pemindahan';
      toast.error(msg, { duration: 6000 });
    } finally {
      setReversing(false);
    }
  };

  const fetchDropdowns = useCallback(async () => {
    setDropdownsLoading(true);
    try {
      const [barangRes, gudangRes] = await Promise.all([api.get<BarangDropdown[]>('/master/barang-dropdown'), api.get<GudangResponse[]>('/master/gudang')]);
      setBarangOptions(barangRes);
      setGudangOptions(gudangRes);
    } catch {
      /* non-critical */
    } finally {
      setDropdownsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDropdowns();
  }, [fetchDropdowns]);

  const wfStates = useWorkflowStates(
    'pemindahan_barang',
    data.map((d) => d.id),
    refreshKey
  );

  return (
    <>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard icon={ArrowRightLeft} label="Total Pemindahan" value={String(total)} iconBg="bg-emerald-50" iconColor="text-emerald-600" loading={loading} />
        <SummaryCard icon={CheckCircle} label="Selesai" value={String(data.filter((d) => d.status === 'SELESAI').length)} iconBg="bg-blue-50" iconColor="text-blue-600" />
        <SummaryCard icon={AlertTriangle} label="Dalam Proses" value={String(data.filter((d) => d.status === 'DIAJUKAN').length)} iconBg="bg-amber-50" iconColor="text-amber-600" />
      </div>

      {/* Table Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Daftar Pemindahan Barang</CardTitle>
            <Button
              size="sm"
              className="gap-2"
              onClick={() =>
                openFormTab({
                  title: 'Tambah Pemindahan Barang',
                  module: 'inventory',
                  subPage: 'pemindahan-barang',
                  formKey: 'pemindahan-barang-create'
                })
              }>
              <Plus className="h-4 w-4" /> Tambah Pemindahan
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">No Pemindahan</TableHead>
                  <TableHead className="whitespace-nowrap">Tanggal</TableHead>
                  <TableHead className="whitespace-nowrap">Proses</TableHead>
                  <TableHead className="whitespace-nowrap">Dari Gudang</TableHead>
                  <TableHead className="whitespace-nowrap">Ke Gudang</TableHead>
                  <TableHead className="whitespace-nowrap">Barang</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Qty</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Workflow</TableHead>
                  <TableHead className="whitespace-nowrap">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableSkeletonRows cols={10} />}
                {error && (
                  <TableRow>
                    <TableCell colSpan={10}>
                      <ErrorCard message={error} onRetry={fetchData} />
                    </TableCell>
                  </TableRow>
                )}
                {!loading && !error && data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      Tidak ada data pemindahan barang
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  !error &&
                  data.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap font-medium">{row.noPemindahan}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.tanggal}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.proses === 'KIRIM' ? 'Kirim' : 'Terima'}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.dariGudang?.nama || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.keGudang?.nama || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.barang?.nama || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{Number(row.qty).toLocaleString('id-ID')}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-center">
                        {(() => {
                          const w = wfStates.states[row.id];
                          if (!w) return <span className="text-xs text-muted-foreground">—</span>;
                          return (
                            <div className="flex flex-col items-center gap-1">
                              <WorkflowStateBadge state={w.state} />
                              <WorkflowActionsCell
                                documentType={w.documentType}
                                documentId={w.documentId}
                                version={w.version}
                                availableActions={w.availableActions}
                                onDone={() => {
                                  fetchData();
                                  wfStates.refresh();
                                }}
                              />
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {row.status === 'DIAJUKAN' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                openFormTab({
                                  title: `Edit ${row.noPemindahan}`,
                                  module: 'inventory',
                                  subPage: 'pemindahan-barang',
                                  formKey: 'pemindahan-barang-edit',
                                  formProps: { id: row.id }
                                })
                              }
                              title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {row.status === 'DISETUJUI' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-amber-600 hover:text-amber-700"
                              onClick={() => {
                                setReverseTarget(row);
                                setReverseReason('');
                              }}
                              title="Reverse pemindahan (kembalikan stok ke gudang asal)"
                              aria-label="Reverse pemindahan">
                              <Undo2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Cari pemindahan..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === 'semua' ? '' : v)}>
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="semua">Semua Status</SelectItem>
            <SelectItem value="DIAJUKAN">Diajukan</SelectItem>
            <SelectItem value="DISETUJUI">Disetujui</SelectItem>
            <SelectItem value="SELESAI">Selesai</SelectItem>
            <SelectItem value="BATAL">Batal</SelectItem>
          </SelectContent>
        </Select>
        <Select value={prosesFilter} onValueChange={(v) => setProsesFilter(v === 'semua' ? '' : v)}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="Proses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="semua">Semua Proses</SelectItem>
            <SelectItem value="KIRIM">Kirim</SelectItem>
            <SelectItem value="TERIMA">Terima</SelectItem>
          </SelectContent>
        </Select>
        <SearchableDropdown placeholder="Gudang Asal" options={gudangOptions.map((g) => ({ id: g.id, label: g.nama, subtitle: g.kode }))} value={dariGudangFilter} onValueChange={setDariGudangFilter} className="w-full sm:w-[180px]" />
        <SearchableDropdown placeholder="Gudang Tujuan" options={gudangOptions.map((g) => ({ id: g.id, label: g.nama, subtitle: g.kode }))} value={keGudangFilter} onValueChange={setKeGudangFilter} className="w-full sm:w-[180px]" />
        <Input type="date" className="w-full sm:w-[150px]" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <Input type="date" className="w-full sm:w-[150px]" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
      </div>

      {/* Pagination */}
      {!loading && !error && total > 0 && <Pagination skip={skip} total={total} onNext={() => setSkip((s) => s + PAGE_SIZE)} onPrev={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))} />}

      {/* Reverse confirmation dialog */}
      <AlertDialog
        open={!!reverseTarget}
        onOpenChange={(open) => {
          if (!open && !reversing) {
            setReverseTarget(null);
            setReverseReason('');
          }
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverse Pemindahan {reverseTarget?.noPemindahan}?</AlertDialogTitle>
            <AlertDialogDescription>
              Pemindahan ini sudah di-approve (status: DISETUJUI). Reverse akan:
              <br />• Mengembalikan stok ke gudang asal
              <br />• Menghapus layer FIFO/FEFO di gudang tujuan
              <br />• Mengubah status pemindahan menjadi BATAL
              <br />
              <br />
              <span className="text-amber-600">Catatan: Reverse hanya bisa kalau stok gudang tujuan masih cukup. Kalau stok sudah terpakai transaksi lain, reverse akan gagal.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 px-6">
            <Label htmlFor="reverse-reason">Alasan Reversal (opsional)</Label>
            <Textarea id="reverse-reason" placeholder="Contoh: Salah input qty / salah gudang tujuan / dll" rows={3} maxLength={200} value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} disabled={reversing} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reversing}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleReverse();
              }}
              disabled={reversing}
              className="bg-amber-600 text-white hover:bg-amber-700 gap-2">
              {reversing && <Loader2 className="h-4 w-4 animate-spin" />}
              Ya, Reverse Pemindahan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab 3: Penyesuaian Stok
// ═══════════════════════════════════════════════════════════════════════════

function PenyesuaianTab({ refreshKey }: { refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab);

  const [barangOptions, setBarangOptions] = useState<BarangDropdown[]>([]);
  const [dropdownsLoading, setDropdownsLoading] = useState(true);

  const [data, setData] = useState<PenyesuaianStokResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [tipeFilter, setTipeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [barangFilter, setBarangFilter] = useState('');
  const [skip, setSkip] = useState(0);

  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    setSkip(0);
  }, [debouncedSearch, statusFilter, tipeFilter, barangFilter, dateFrom, dateTo]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('skip', String(skip));
      params.set('limit', String(PAGE_SIZE));
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter) params.set('status', statusFilter);
      if (tipeFilter) params.set('tipe', tipeFilter);
      if (barangFilter) params.set('barang_id', barangFilter);
      if (dateFrom) params.set('tanggal_from', dateFrom);
      if (dateTo) params.set('tanggal_to', dateTo);
      const res = await api.get<PaginatedResponse<PenyesuaianStokResponse>>(`/persediaan/penyesuaian-stok?${params.toString()}`);
      setData(res.data);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Gagal memuat data penyesuaian stok');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, tipeFilter, barangFilter, dateFrom, dateTo, skip]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const fetchDropdowns = useCallback(async () => {
    setDropdownsLoading(true);
    try {
      const barangRes = await api.get<BarangDropdown[]>('/master/barang-dropdown');
      setBarangOptions(barangRes);
    } catch {
      /* non-critical */
    } finally {
      setDropdownsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDropdowns();
  }, [fetchDropdowns]);

  const wfStates = useWorkflowStates(
    'penyesuaian_stok',
    data.map((d) => d.id),
    refreshKey
  );

  return (
    <>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard icon={FileSpreadsheet} label="Total Penyesuaian" value={String(total)} iconBg="bg-emerald-50" iconColor="text-emerald-600" loading={loading} />
        <SummaryCard icon={Package} label="Stok Ditambah" value={String(data.filter((d) => d.tipe === 'TAMBAH').length)} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
        <SummaryCard icon={AlertTriangle} label="Stok Dikurangi" value={String(data.filter((d) => d.tipe === 'KURANG').length)} iconBg="bg-red-50" iconColor="text-red-600" />
      </div>

      {/* Table Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Daftar Penyesuaian Persediaan</CardTitle>
            <Button
              size="sm"
              className="gap-2"
              onClick={() =>
                openFormTab({
                  title: 'Tambah Penyesuaian Persediaan',
                  module: 'inventory',
                  subPage: 'penyesuaian',
                  formKey: 'penyesuaian-create'
                })
              }>
              <Plus className="h-4 w-4" /> Tambah Penyesuaian
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">No Adj</TableHead>
                  <TableHead className="whitespace-nowrap">Tanggal</TableHead>
                  <TableHead className="whitespace-nowrap">Barang</TableHead>
                  <TableHead className="whitespace-nowrap">Tipe</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Qty</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Biaya Satuan</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Total</TableHead>
                  <TableHead className="whitespace-nowrap">Kedaluwarsa</TableHead>
                  <TableHead className="whitespace-nowrap">Alasan</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Workflow</TableHead>
                  <TableHead className="whitespace-nowrap">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableSkeletonRows cols={12} />}
                {error && (
                  <TableRow>
                    <TableCell colSpan={12}>
                      <ErrorCard message={error} onRetry={fetchData} />
                    </TableCell>
                  </TableRow>
                )}
                {!loading && !error && data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                      Tidak ada data penyesuaian stok
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  !error &&
                  data.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap font-medium">{row.noAdj}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.tanggal}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.barang?.nama || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <TipeBadge tipe={row.tipe} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">{Number(row.qty).toLocaleString('id-ID')}</TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono">{formatRp(Number(row.biayaSatuan))}</TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono">{formatRp(Number(row.total))}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.tanggalKedaluwarsa || '-'}</TableCell>
                      <TableCell className="max-w-[180px] truncate">{row.alasan || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-center">
                        {(() => {
                          const w = wfStates.states[row.id];
                          if (!w) return <span className="text-xs text-muted-foreground">—</span>;
                          return (
                            <div className="flex flex-col items-center gap-1">
                              <WorkflowStateBadge state={w.state} />
                              <WorkflowActionsCell
                                documentType={w.documentType}
                                documentId={w.documentId}
                                version={w.version}
                                availableActions={w.availableActions}
                                onEdit={() => openFormTab({ title: 'Edit ' + row.noAdj, module: 'inventory', subPage: 'penyesuaian', formKey: 'penyesuaian-edit', formProps: { id: row.id } })}
                                onDone={() => {
                                  fetchData();
                                  wfStates.refresh();
                                }}
                              />
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {row.status === 'DIAJUKAN' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                openFormTab({
                                  title: `Edit ${row.noAdj}`,
                                  module: 'inventory',
                                  subPage: 'penyesuaian',
                                  formKey: 'penyesuaian-edit',
                                  formProps: { id: row.id }
                                })
                              }
                              title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Cari penyesuaian..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === 'semua' ? '' : v)}>
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="semua">Semua Status</SelectItem>
            <SelectItem value="DIAJUKAN">Diajukan</SelectItem>
            <SelectItem value="DISETUJUI">Disetujui</SelectItem>
            <SelectItem value="DITOLAK">Ditolak</SelectItem>
            <SelectItem value="BATAL">Batal</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tipeFilter} onValueChange={(v) => setTipeFilter(v === 'semua' ? '' : v)}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="Tipe" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="semua">Semua Tipe</SelectItem>
            <SelectItem value="TAMBAH">Tambah</SelectItem>
            <SelectItem value="KURANG">Kurang</SelectItem>
          </SelectContent>
        </Select>
        <SearchableDropdown placeholder="Filter Barang" options={barangOptions.map((b) => ({ id: b.id, label: b.nama, subtitle: b.kode }))} value={barangFilter} onValueChange={setBarangFilter} className="w-full sm:w-[200px]" />
        <Input type="date" className="w-full sm:w-[150px]" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <Input type="date" className="w-full sm:w-[150px]" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
      </div>

      {/* Pagination */}
      {!loading && !error && total > 0 && <Pagination skip={skip} total={total} onNext={() => setSkip((s) => s + PAGE_SIZE)} onPrev={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))} />}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab 4: Barang & Jasa (read-only from master)
// ═══════════════════════════════════════════════════════════════════════════

function BarangJasaTab({ refreshKey }: { refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab);
  const [data, setData] = useState<BarangResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // P0-02 (Re-Audit §6): KPI cards harus pakai backend aggregate,
  // BUKAN data.reduce/filter dari paginated rows.
  const [valuationSummary, setValuationSummary] = useState<{
    inventory_value: { total_nilai: string; total_qty: number; barang_count: number; as_of: string | null };
    low_stock: { count: number; items: Array<{ barang_id: string; kode: string; nama: string; stok: number; stok_minimum: number; selisih: number }> };
  } | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [skip, setSkip] = useState(0);

  // Update #5: Export & Import Excel
  const [exporting, setExporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    setSkip(0);
  }, [debouncedSearch]);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await api.get<{
        inventory_value: { total_nilai: string; total_qty: number; barang_count: number; as_of: string | null };
        low_stock: { count: number; items: Array<{ barang_id: string; kode: string; nama: string; stok: number; stok_minimum: number; selisih: number }> };
      }>('/persediaan/valuation-summary');
      setValuationSummary(res);
    } catch {
      // Non-blocking: KPI cards akan menampilkan fallback '-'
      setValuationSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('skip', String(skip));
      params.set('limit', String(PAGE_SIZE));
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await api.get<PaginatedResponse<BarangResponse>>(`/master/barang?${params.toString()}`);
      setData(res.data);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Gagal memuat data barang');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, skip]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  // Fetch aggregate summary (independent dari pagination state)
  useEffect(() => {
    fetchSummary();
  }, [fetchSummary, refreshKey]);

  const getStockStatus = (stok: number, stokMin: number): string => {
    if (stok === 0) return 'Habis';
    if (stok <= stokMin) return 'Menipis';
    return 'Tersedia';
  };

  // ── Update #5: Export & Import Excel ──
  const handleExport = async () => {
    setExporting(true);
    try {
      const endpoint = `/master/barang/export${debouncedSearch ? `?search=${encodeURIComponent(debouncedSearch)}` : ''}`;
      await downloadExcelFile(endpoint, `barang-${exportDateStamp()}.xlsx`);
      toast.success('Data barang berhasil diunduh');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengekspor data barang');
    } finally {
      setExporting(false);
    }
  };

  // ── Tahap 1: badge akun persediaan untuk list barang ──
  const renderAkunPersediaan = (item: BarangResponse) => {
    if (item.jenisBarang === 'JASA') {
      return <span className="text-xs text-muted-foreground">—</span>;
    }
    if (!item.akunPersediaanId || !item.akunPersediaan) {
      return <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-500 border-gray-200">Belum dipetakan</span>;
    }
    const isNonaktif = item.akunPersediaan.status === 'NONAKTIF';
    return (
      <span className="flex items-center gap-1.5">
        <span className={`text-xs font-mono ${isNonaktif ? 'text-amber-700' : 'text-emerald-700'}`}>
          {item.akunPersediaan.kode} — {item.akunPersediaan.nama}
        </span>
        {isNonaktif && (
          <span className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0 text-[10px] font-medium bg-amber-100 text-amber-700 border-amber-300">
            <AlertTriangle className="h-2.5 w-2.5" /> nonaktif
          </span>
        )}
      </span>
    );
  };

  return (
    <>
      {/* Summary Cards — P0-02 (Re-Audit §6): pakai backend aggregate, bukan data.reduce/filter */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard icon={Package} label="Total SKU" value={`${total} SKU`} iconBg="bg-emerald-50" iconColor="text-emerald-600" loading={loading} />
        <SummaryCard icon={DollarSign} label="Total Nilai Persediaan" value={summaryLoading ? '—' : valuationSummary ? formatRp(Number(valuationSummary.inventory_value.total_nilai)) : '—'} iconBg="bg-emerald-50" iconColor="text-emerald-600" loading={summaryLoading} />
        <SummaryCard icon={AlertTriangle} label="Stok Menipis" value={summaryLoading ? '—' : valuationSummary ? `${valuationSummary.low_stock.count} item` : '—'} iconBg="bg-amber-50" iconColor="text-amber-600" loading={summaryLoading} />
      </div>

      {/* Search + toolbar (lokasi baru) */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Cari kode atau nama barang..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="gap-2" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Export Excel
          </Button>
          <Button size="sm" variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" /> Import Excel
          </Button>
          <Button size="sm" className="gap-2" onClick={() => openFormTab({ title: 'Tambah Barang', module: 'inventory', subPage: 'barang-jasa', formKey: 'barang-create' })}>
            <Plus className="h-4 w-4" /> Tambah Barang
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Kode Barang</TableHead>
                  <TableHead className="whitespace-nowrap">Nama Barang</TableHead>
                  <TableHead className="whitespace-nowrap">Kategori</TableHead>
                  <TableHead className="whitespace-nowrap">Satuan</TableHead>
                  <TableHead className="whitespace-nowrap">Akun Persediaan</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Stok</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Harga Beli</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Harga Jual</TableHead>
                  <TableHead className="whitespace-nowrap">Status Stok</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableSkeletonRows cols={10} />}
                {error && (
                  <TableRow>
                    <TableCell colSpan={10}>
                      <ErrorCard message={error} onRetry={fetchData} />
                    </TableCell>
                  </TableRow>
                )}
                {!loading && !error && data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="p-0">
                      {search ? (
                        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                          <SearchX className="h-8 w-8" />
                          <p className="text-sm">Tidak ada hasil pencarian untuk "{search}"</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                          <PackageX className="h-8 w-8" />
                          <p className="text-sm">Belum ada data barang</p>
                          <Button size="sm" className="gap-2 mt-2" onClick={() => openFormTab({ title: 'Tambah Barang', module: 'inventory', subPage: 'barang-jasa', formKey: 'barang-create' })}>
                            <Plus className="h-4 w-4" /> Tambah Barang
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  !error &&
                  data.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-nowrap font-medium">{item.kode}</TableCell>
                      <TableCell className="whitespace-nowrap">{item.nama}</TableCell>
                      <TableCell className="whitespace-nowrap">{item.kategori?.nama || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">{item.satuan?.nama || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">{renderAkunPersediaan(item)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{Number(item.stok).toLocaleString('id-ID')}</TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono">{formatRp(Number(item.hargaPokok))}</TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono">{formatRp(Number(item.hargaJual ?? 0))}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <StatusBadge status={getStockStatus(Number(item.stok), Number(item.stokMinimum))} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-center">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openFormTab({ title: `Edit ${item.nama}`, module: 'inventory', subPage: 'barang-jasa', formKey: 'barang-edit', formProps: { id: item.id } })} aria-label={`Edit ${item.nama}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {!loading && !error && total > 0 && <Pagination skip={skip} total={total} onNext={() => setSkip((s) => s + PAGE_SIZE)} onPrev={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))} />}

      {/* Update #5: dialog Import Excel — Update #12: nama file template
          template-import-barang.xlsx + dukungan kolom Stok (stok awal)
          & Gudang (opsional, wajib bila Stok > 0 dan ada > 1 gudang aktif) */}
      <ExcelImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Barang"
        description="Unduh template, isi data barang (kategori, satuan & gudang diisi dengan nama), opsional stok awal, lalu unggah file Excel (.xlsx). Stok awal dicatat sebagai Penyesuaian Stok otomatis."
        templateEndpoint="/master/barang/import-template"
        importEndpoint="/master/barang/import"
        templateFilename="template-import-barang.xlsx"
        onImported={() => {
          // Refresh in-place: dialog hidup di dalam tab list, jadi panggil fetch
          // langsung (refreshListTab hanya efektif bila disertai pergantian tab).
          fetchData();
          fetchSummary();
        }}
      />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab 5: Gudang (read-only from master)
// ═══════════════════════════════════════════════════════════════════════════

function GudangTab({ refreshKey }: { refreshKey?: number }) {
  const [data, setData] = useState<GudangResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<GudangResponse[]>('/master/gudang');
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Gagal memuat data gudang');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  return (
    <>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard icon={Warehouse} label="Total Gudang" value={String(data.length)} iconBg="bg-emerald-50" iconColor="text-emerald-600" loading={loading} />
        <SummaryCard icon={Package} label="Total Barang" value={data.reduce((sum, g) => sum + Number(g.totalBarang), 0).toLocaleString('id-ID')} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
        <SummaryCard icon={CheckCircle} label="Gudang Aktif" value={String(data.filter((g) => g.status === 'AKTIF').length)} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daftar Gudang</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Kode Gudang</TableHead>
                  <TableHead className="whitespace-nowrap">Nama Gudang</TableHead>
                  <TableHead className="whitespace-nowrap">Alamat</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Total Barang</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableSkeletonRows cols={5} />}
                {error && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <ErrorCard message={error} onRetry={fetchData} />
                    </TableCell>
                  </TableRow>
                )}
                {!loading && !error && data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Tidak ada data gudang
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  !error &&
                  data.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap font-medium">{row.kode}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.nama}</TableCell>
                      <TableCell className="whitespace-nowrap max-w-[280px] truncate">{row.alamat || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{Number(row.totalBarang).toLocaleString('id-ID')}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <StatusBadge status={row.status} />
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab 6: Kategori Barang (read-only from master)
// ═══════════════════════════════════════════════════════════════════════════

function KategoriBarangTab({ refreshKey }: { refreshKey?: number }) {
  const [data, setData] = useState<KategoriBarangResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<KategoriBarangResponse[]>('/master/kategori-barang');
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Gagal memuat data kategori barang');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  return (
    <>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard icon={FolderTree} label="Total Kategori" value={String(data.length)} iconBg="bg-emerald-50" iconColor="text-emerald-600" loading={loading} />
        <SummaryCard icon={Tags} label="Kategori Aktif" value={String(data.filter((k) => k.status === 'AKTIF').length)} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daftar Kategori Barang</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Kode Kategori</TableHead>
                  <TableHead className="whitespace-nowrap">Nama</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableSkeletonRows cols={3} />}
                {error && (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <ErrorCard message={error} onRetry={fetchData} />
                    </TableCell>
                  </TableRow>
                )}
                {!loading && !error && data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                      Tidak ada data kategori barang
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  !error &&
                  data.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap font-medium">{row.kode}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.nama}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <StatusBadge status={row.status} />
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════

interface InventoryModuleProps {
  subPage?: string;
  refreshKey?: number;
  formMode?: string;
  formProps?: Record<string, unknown>;
}

export default function InventoryModule({ subPage: propsSubPage, refreshKey, formMode, formProps }: InventoryModuleProps) {
  const activeSubPage = useERPStore((s) => s.activeSubPage);
  const subPage = propsSubPage || activeSubPage || 'permintaan-barang';

  // ── Form mode: render form in tab ──
  if (formMode) {
    if (formMode === 'permintaan-barang-create' || formMode === 'permintaan-barang-edit') {
      return <PermintaanBarangForm formProps={formProps} />;
    }
    if (formMode === 'pemindahan-barang-create' || formMode === 'pemindahan-barang-edit') {
      return <PemindahanBarangForm formProps={formProps} />;
    }
    if (formMode === 'penyesuaian-create' || formMode === 'penyesuaian-edit') {
      return <PenyesuaianForm formProps={formProps} />;
    }
    // Tahap 1: form Tambah/Edit Barang dipindah ke modul Persediaan
    if (formMode === 'barang-create') {
      return <BarangForm mode="create" />;
    }
    if (formMode === 'barang-edit') {
      const editId = formProps?.id as string | undefined;
      if (!editId) {
        return <div className="p-6 text-sm text-muted-foreground">ID barang tidak ditemukan. Tutup tab ini dan coba lagi.</div>;
      }
      return <BarangForm mode="edit" editId={editId} />;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Persediaan</h1>
        <p className="text-muted-foreground">Kelola stok barang, permintaan, pemindahan, penyesuaian, gudang, dan kategori barang</p>
      </div>

      {subPage === 'permintaan-barang' && <PermintaanBarangTab refreshKey={refreshKey} />}
      {subPage === 'pemindahan-barang' && <PemindahanBarangTab refreshKey={refreshKey} />}
      {subPage === 'penyesuaian' && <PenyesuaianTab refreshKey={refreshKey} />}
      {subPage === 'barang-jasa' && <BarangJasaTab refreshKey={refreshKey} />}
      {subPage === 'gudang' && <GudangTab refreshKey={refreshKey} />}
      {subPage === 'kategori-barang' && <KategoriBarangTab refreshKey={refreshKey} />}
      {subPage === 'stok-kartu' && <StokKartuTab />}
    </div>
  );
}
