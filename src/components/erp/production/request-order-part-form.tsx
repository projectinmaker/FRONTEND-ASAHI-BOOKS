'use client';

/**
 * REQUEST ORDER PART (ROP) — Form create / edit / view.
 *
 * Form gaya kertas manufaktur yang diisi Engineering SEBELUM masuk ke PO:
 * - Header: Project Name, Model, Customer (READ-ONLY, otomatis dari SO yang
 *   dipilih), Tanggal, dan pemilihan SO via SearchableDropdown (kartu info SO
 *   tampil di kanan atas setelah dipilih).
 * - Tabel item (update ASAHI #003): kolom NO s.d. SUPPLIER SEJAJAR satu
 *   baris header; kolom terakhir KETERANGAN dibagi dua sub-kolom di bawahnya:
 *   ORDER dan STOK. QS bertipe data seperti ID PART (kode, bisa alfanumerik).
 * - Bawah tabel: Note (catatan) di kiri + blok tanda tangan 4 kolom
 *   (DIBUAT / DIPERIKSA / DIKETAHUI / DISETUJUI).
 * - Legenda distribusi salinan: PUTIH = PURCHASING, KUNING = PRODUKSI,
 *   MERAH = ENGINEERING.
 *
 * Workflow (update ASAHI #003 — tanpa persetujuan): form diisi → Simpan
 * (status DRAFT) → tombol "Buat ROP" (final, status DIBUAT). Hanya DRAFT
 * yang bisa diedit. Hapus/Batalkan = hard delete dengan alasan (jejak di
 * modul Histori). Status TIDAK ditampilkan di form.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
// Update #007 — quick add master data langsung dari form transaksi
import { QuickAddSupplierButton, toSupplierDropdown } from '@/components/erp/quick-add';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, Plus, Trash2, Printer, CheckCircle, FileText, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { formatDate, todayStr } from '@/lib/pdf-utils';
import { useTabStore } from '@/store/tab-store';
import { useAuthStore } from '@/store/auth-store';
import { useAccessStore } from '@/store/access-store';
import { useFormDraft, draftKey } from '@/hooks/use-form-draft';
import { DraftIndicator } from '@/components/erp/draft-indicator';
import { FormTabShell } from '@/components/erp/form-tab-shell';
import { HardDeleteCancelDialog } from '@/components/erp/hard-delete-cancel-dialog';
import type { RequestOrderPart, RequestOrderPartCreate, RequestOrderPartItemCreate, RequestOrderPartOptionsResponse, RequestOrderPartStatus, RequestOrderPartUpdate, RopSalesOrderOption, SupplierDropdown } from '@/types/api';

// ─── Konstanta ───────────────────────────────────────────────────────────────

/** Kode permission RBAC (registry backend — modul produksi).
 * CATATAN #003: `approve` = hak finalisasi lewat tombol "Buat ROP"
 * (endpoint POST /buat — dipetakan ke permission approve di access_registry). */
const PERM = {
  create: 'production.request_order_part.create',
  edit: 'production.request_order_part.edit',
  buat: 'production.request_order_part.approve',
  cancel: 'production.request_order_part.cancel',
  print: 'production.request_order_part.print'
} as const;

/** Kolom tanda tangan — label + field response. */
const SIGNATURES: ReadonlyArray<{ key: 'dibuatOleh' | 'diperiksaOleh' | 'diketahuiOleh' | 'disetujuiOleh'; label: string }> = [
  { key: 'dibuatOleh', label: 'DIBUAT' },
  { key: 'diperiksaOleh', label: 'DIPERIKSA' },
  { key: 'diketahuiOleh', label: 'DIKETAHUI' },
  { key: 'disetujuiOleh', label: 'DISETUJUI' }
];

type SignatureState = Record<(typeof SIGNATURES)[number]['key'], string>;

const EMPTY_SIGNATURES: SignatureState = { dibuatOleh: '', diperiksaOleh: '', diketahuiOleh: '', disetujuiOleh: '' };

// ─── Baris item (draft lokal) ────────────────────────────────────────────────

interface RopItemDraft {
  key: string;
  idPart: string;
  description: string;
  material: string;
  qty: string;
  /** Update #003: QS bertipe data seperti ID PART — kode (bisa alfanumerik). */
  qs: string;
  /** '' = tanpa supplier (null di backend). */
  supplierId: string;
  /** Update #003: KETERANGAN dibagi dua sub-kolom — ORDER & STOK. */
  keteranganOrder: string;
  keteranganStok: string;
}

let ropRowKeyCounter = 0;
function newRowKey() {
  return `rop-row-${Date.now()}-${++ropRowKeyCounter}`;
}

function emptyItem(): RopItemDraft {
  return { key: newRowKey(), idPart: '', description: '', material: '', qty: '', qs: '', supplierId: '', keteranganOrder: '', keteranganStok: '' };
}

/** Data draft localStorage (mode create). */
interface RopDraftData {
  tanggal: string;
  projectName: string;
  model: string;
  salesOrderId: string;
  catatan: string;
  signatures: SignatureState;
  items: RopItemDraft[];
}

// ─── Badge status ROP (dipakai halaman LIST; form tidak menampilkan status) ──

export function RopStatusBadge({ status }: { status: RequestOrderPartStatus }) {
  if (status === 'DIBUAT') {
    return <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Dibuat</span>;
  }
  return <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">Draft</span>;
}

/** Legenda distribusi salinan warna (form + konsisten dengan template cetak). */
function ColorLegend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 rounded-md border border-dashed bg-muted/40 px-4 py-3 text-xs font-semibold tracking-wider">
      <span className="flex items-center gap-2">PUTIH = PURCHASING</span>
      <span className="flex items-center gap-2">KUNING = PRODUKSI</span>
      <span className="flex items-center gap-2">MERAH = ENGINEERING</span>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Form utama
// ═════════════════════════════════════════════════════════════════════════════

export function RequestOrderPartForm({ mode, ropId }: { mode: 'create' | 'edit' | 'view'; ropId?: string }) {
  const openFormTab = useTabStore((s) => s.openFormTab);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const can = useAccessStore((s) => s.can);

  // ── Dropdown referensi ──
  const [salesOrderOptions, setSalesOrderOptions] = useState<RopSalesOrderOption[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<SupplierDropdown[]>([]);
  const [dropdownsLoading, setDropdownsLoading] = useState(true);

  // ── State form ──
  const [formTanggal, setFormTanggal] = useState(todayStr());
  const [formProjectName, setFormProjectName] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formSalesOrderId, setFormSalesOrderId] = useState('');
  const [formCatatan, setFormCatatan] = useState('');
  const [signatures, setSignatures] = useState<SignatureState>({ ...EMPTY_SIGNATURES });
  const [items, setItems] = useState<RopItemDraft[]>([emptyItem()]);

  // ── Detail tersimpan (mode edit/view) ──
  const [detail, setDetail] = useState<RequestOrderPart | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(mode !== 'create');
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── State aksi ──
  const [submitting, setSubmitting] = useState(false);
  const [membuat, setMembuat] = useState(false);
  const [buatOpen, setBuatOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [canceling, setCanceling] = useState(false);

  /** Mode view, ATAU dokumen sudah DIBUAT/final (terkunci, read-only). */
  const readOnly = mode === 'view' || (!!detail && detail.status !== 'DRAFT');

  const title = mode === 'create' ? 'ROP Baru' : detail?.noRop || 'Request Order Part';

  // ── Muat dropdown SO + supplier ──
  // Update #018: keduanya digabung di satu endpoint khusus produksi
  // (GET /produksi/request-order-part/opsi) yang cukup digati permission
  // production.request_order_part.view — sebelumnya form memanggil
  // /penjualan/sales-order (butuh sales.sales_order.view) dan
  // /master/supplier-dropdown (butuh master.supplier.view), yang membuat
  // role Staf Engineering (produksi saja) tidak bisa membuka form.
  useEffect(() => {
    let cancelled = false;
    const fetchDropdowns = async () => {
      setDropdownsLoading(true);
      try {
        const res = await api.get<RequestOrderPartOptionsResponse>('/produksi/request-order-part/opsi');
        if (cancelled) return;
        // Backend sudah menyeragamkan SO tanpa DIBATALKAN & supplier AKTIF.
        setSalesOrderOptions(res.salesOrders.filter((so) => so.status !== 'DIBATALKAN'));
        setSupplierOptions(res.suppliers);
      } catch {
        /* non-critical */
      } finally {
        if (!cancelled) setDropdownsLoading(false);
      }
    };
    fetchDropdowns();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Muat detail (mode edit/view) ──
  useEffect(() => {
    if (mode === 'create' || !ropId) return;
    let cancelled = false;
    const fetchItem = async () => {
      setLoadingDetail(true);
      setLoadError(null);
      try {
        const res = await api.get<RequestOrderPart>(`/produksi/request-order-part/${ropId}`);
        if (cancelled) return;
        setDetail(res);
        setFormTanggal(res.tanggal ? res.tanggal.slice(0, 10) : '');
        setFormProjectName(res.projectName || '');
        setFormModel(res.model || '');
        setFormSalesOrderId(res.salesOrderId || '');
        setFormCatatan(res.catatan || '');
        setSignatures({
          dibuatOleh: res.dibuatOleh || '',
          diperiksaOleh: res.diperiksaOleh || '',
          diketahuiOleh: res.diketahuiOleh || '',
          disetujuiOleh: res.disetujuiOleh || ''
        });
        setItems(
          (res.items || [])
            .slice()
            .sort((a, b) => a.no - b.no)
            .map((it) => ({
              key: newRowKey(),
              idPart: it.idPart || '',
              description: it.description || '',
              material: it.material || '',
              // Backend mengirim qty sebagai string desimal ("4.00") —
              // normalisasi ke number. QS kini kode teks (update #003).
              qty: it.qty != null && it.qty !== '' ? String(Number(it.qty)) : '',
              qs: it.qs || '',
              supplierId: it.supplierId || '',
              keteranganOrder: it.keteranganOrder || '',
              keteranganStok: it.keteranganStok || ''
            }))
        );
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.detail : 'Gagal memuat data ROP');
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    };
    fetchItem();
    return () => {
      cancelled = true;
    };
  }, [mode, ropId]);

  // ── Draft otomatis (mode create; localStorage, dipulihkan saat kembali) ──
  const userId = useAuthStore((s) => s.user?.id ?? 'anon');
  const draft = useFormDraft<RopDraftData>(draftKey(userId, 'production', 'request-order-part', 'create'));
  const skipNextSaveRef = useRef(false);
  const restoredRef = useRef(false);

  useEffect(() => {
    if (mode !== 'create' || restoredRef.current) return;
    restoredRef.current = true;
    const d = draft.draft;
    if (!d) return;
    setFormTanggal(d.tanggal || todayStr());
    setFormProjectName(d.projectName || '');
    setFormModel(d.model || '');
    setFormSalesOrderId(d.salesOrderId || '');
    setFormCatatan(d.catatan || '');
    setSignatures({ ...EMPTY_SIGNATURES, ...(d.signatures || {}) });
    if (Array.isArray(d.items) && d.items.length > 0) {
      setItems(d.items.map((it) => ({ ...it, key: newRowKey() })));
    }
    toast.info('Draft isian dipulihkan', { description: 'Isian terakhir form Request Order Part dimuat kembali otomatis.' });
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
    if (mode === 'create') {
      draft.saveDraft({ tanggal: formTanggal, projectName: formProjectName, model: formModel, salesOrderId: formSalesOrderId, catatan: formCatatan, signatures, items });
    }
  }, [formTanggal, formProjectName, formModel, formSalesOrderId, formCatatan, signatures, items]);

  const handleDiscardDraft = useCallback(() => {
    skipNextSaveRef.current = true;
    draft.clearDraft();
    setFormTanggal(todayStr());
    setFormProjectName('');
    setFormModel('');
    setFormSalesOrderId('');
    setFormCatatan('');
    setSignatures({ ...EMPTY_SIGNATURES });
    setItems([emptyItem()]);
  }, []);

  // ── Turunan: SO terpilih, kartu info SO, customer read-only ──
  const selectedSo = useMemo(() => salesOrderOptions.find((so) => so.id === formSalesOrderId) || null, [salesOrderOptions, formSalesOrderId]);

  /** Kartu info SO (kanan atas) — dari SO pilihan atau ringkasan SO di detail. */
  const soInfo = useMemo(() => {
    if (selectedSo) {
      return {
        noPesanan: selectedSo.noPesanan,
        customerPoNumber: selectedSo.customerPoNumber || '-',
        tanggal: selectedSo.tanggal,
        status: selectedSo.status
      };
    }
    if (detail?.salesOrder && formSalesOrderId === detail.salesOrderId) {
      return {
        noPesanan: detail.salesOrder.noPesanan,
        customerPoNumber: detail.salesOrder.customerPoNumber || '-',
        tanggal: detail.salesOrder.tanggal,
        status: detail.salesOrder.status
      };
    }
    return null;
  }, [selectedSo, detail, formSalesOrderId]);

  /** Customer — READ-ONLY, otomatis ditarik dari SO yang dipilih. */
  const customerName = useMemo(() => {
    if (selectedSo?.pelanggan?.nama) return selectedSo.pelanggan.nama;
    if (detail?.pelanggan?.nama && formSalesOrderId === detail.salesOrderId) return detail.pelanggan.nama;
    return '';
  }, [selectedSo, detail, formSalesOrderId]);

  const soDropdownOptions = useMemo(
    () =>
      salesOrderOptions.map((so) => ({
        id: so.id,
        label: so.noPesanan,
        subtitle: so.pelanggan?.nama || undefined
      })),
    [salesOrderOptions]
  );

  const supplierDropdownOptions = useMemo(() => supplierOptions.map((s) => ({ id: s.id, label: s.nama, subtitle: s.kode })), [supplierOptions]);

  // ── Manipulasi baris item ──
  const updateItem = useCallback((idx: number, patch: Partial<RopItemDraft>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }, []);

  const removeItem = useCallback((idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const addItem = useCallback(() => {
    setItems((prev) => [...prev, emptyItem()]);
  }, []);

  // ── Bangun payload items (no urut otomatis, qty number, qs teks) ──
  const buildItemsPayload = useCallback((): RequestOrderPartItemCreate[] | null => {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.idPart.trim() || !it.description.trim()) {
        toast.error(`Baris ${i + 1}: ID PART dan DESCRIPTION wajib diisi`);
        return null;
      }
    }
    return items.map((it, idx) => ({
      no: idx + 1,
      idPart: it.idPart.trim(),
      description: it.description.trim(),
      material: it.material.trim() || null,
      qty: Number(it.qty) || 0,
      // Update #003: QS = kode (tipe seperti ID PART), teks bebas.
      qs: it.qs.trim() || null,
      supplierId: it.supplierId || null,
      keteranganOrder: it.keteranganOrder.trim() || null,
      keteranganStok: it.keteranganStok.trim() || null
    }));
  }, [items]);

  // ── Submit: Simpan Draft (create) ──
  const handleSubmitCreate = async () => {
    if (!formTanggal || !formProjectName.trim()) {
      toast.error('Tanggal dan Project Name wajib diisi');
      return;
    }
    if (!formSalesOrderId) {
      toast.error('Pilih Sales Order terlebih dahulu (Customer ditarik otomatis dari SO)');
      return;
    }
    const itemsPayload = buildItemsPayload();
    if (!itemsPayload) return;
    if (itemsPayload.length === 0) {
      toast.error('Tambahkan minimal satu baris item part');
      return;
    }
    setSubmitting(true);
    try {
      const payload: RequestOrderPartCreate = {
        tanggal: formTanggal,
        projectName: formProjectName.trim(),
        model: formModel.trim() || null,
        salesOrderId: formSalesOrderId,
        catatan: formCatatan.trim() || null,
        dibuatOleh: signatures.dibuatOleh.trim() || null,
        diperiksaOleh: signatures.diperiksaOleh.trim() || null,
        diketahuiOleh: signatures.diketahuiOleh.trim() || null,
        disetujuiOleh: signatures.disetujuiOleh.trim() || null,
        items: itemsPayload
      };
      const res = await api.post<RequestOrderPart>('/produksi/request-order-part', payload);
      draft.clearDraft();
      skipNextSaveRef.current = true;
      refreshListTab('production', 'request-order-part');
      toast.success('Draft ROP berhasil disimpan', { description: `Nomor dokumen: ${res.noRop}` });
      // Pindah ke mode edit pada tab yang sama (tab create diganti).
      openFormTab({
        title: res.noRop,
        module: 'production',
        subPage: 'request-order-part',
        formKey: 'rop-edit',
        formProps: { ropId: res.id },
        replaceCurrent: true
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal menyimpan ROP');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Submit: Simpan Perubahan (edit, PUT partial — hanya field yang berubah) ──
  const handleSubmitEdit = async () => {
    if (!ropId || !detail) return;
    if (!formTanggal || !formProjectName.trim()) {
      toast.error('Tanggal dan Project Name wajib diisi');
      return;
    }
    if (!formSalesOrderId) {
      toast.error('Pilih Sales Order terlebih dahulu (Customer ditarik otomatis dari SO)');
      return;
    }

    const payload: RequestOrderPartUpdate = {};
    if (formTanggal !== detail.tanggal.slice(0, 10)) payload.tanggal = formTanggal;
    if (formProjectName.trim() !== detail.projectName) payload.projectName = formProjectName.trim();
    if (formModel.trim() !== (detail.model || '')) payload.model = formModel.trim() || null;
    if (formSalesOrderId !== (detail.salesOrderId || '')) payload.salesOrderId = formSalesOrderId;
    if (formCatatan.trim() !== (detail.catatan || '')) payload.catatan = formCatatan.trim() || null;
    if (signatures.dibuatOleh.trim() !== (detail.dibuatOleh || '')) payload.dibuatOleh = signatures.dibuatOleh.trim() || null;
    if (signatures.diperiksaOleh.trim() !== (detail.diperiksaOleh || '')) payload.diperiksaOleh = signatures.diperiksaOleh.trim() || null;
    if (signatures.diketahuiOleh.trim() !== (detail.diketahuiOleh || '')) payload.diketahuiOleh = signatures.diketahuiOleh.trim() || null;
    if (signatures.disetujuiOleh.trim() !== (detail.disetujuiOleh || '')) payload.disetujuiOleh = signatures.disetujuiOleh.trim() || null;

    // Diff items — `items` bila dikirim MENGGANTI seluruh baris, jadi hanya
    // kirim bila benar-benar berubah.
    const origItems = (detail.items || []).slice().sort((a, b) => a.no - b.no);
    const itemsChanged =
      origItems.length !== items.length ||
      origItems.some((o, i) => {
        const it = items[i];
        return o.idPart !== it.idPart.trim() || o.description !== it.description.trim() || (o.material || '') !== it.material.trim() || Number(o.qty) !== (Number(it.qty) || 0) || (o.qs || '') !== it.qs.trim() || (o.supplierId || '') !== (it.supplierId || '') || (o.keteranganOrder || '') !== it.keteranganOrder.trim() || (o.keteranganStok || '') !== it.keteranganStok.trim();
      });
    if (itemsChanged) {
      const itemsPayload = buildItemsPayload();
      if (!itemsPayload) return;
      payload.items = itemsPayload;
    }

    if (Object.keys(payload).length === 0) {
      toast.info('Tidak ada perubahan untuk disimpan');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.put<RequestOrderPart>(`/produksi/request-order-part/${ropId}`, payload);
      setDetail(res);
      setFormTanggal(res.tanggal ? res.tanggal.slice(0, 10) : formTanggal);
      refreshListTab('production', 'request-order-part');
      toast.success('Perubahan ROP berhasil disimpan', { description: res.noRop });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal memperbarui ROP');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Buat ROP (finalisasi DRAFT → DIBUAT — update #003, pengganti Setujui) ──
  const handleBuat = async () => {
    if (!ropId) return;
    setMembuat(true);
    try {
      const res = await api.post<RequestOrderPart>(`/produksi/request-order-part/${ropId}/buat`);
      setDetail(res);
      refreshListTab('production', 'request-order-part');
      toast.success('ROP berhasil dibuat', { description: `${res.noRop} kini dokumen final — terkunci (read-only).` });
      setBuatOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal membuat (finalisasi) ROP');
    } finally {
      setMembuat(false);
    }
  };

  // ── Batalkan dokumen (hard delete dengan alasan) ──
  const handleCancelDoc = async (reason: string) => {
    if (!ropId) return;
    setCanceling(true);
    try {
      await api.post(`/produksi/request-order-part/${ropId}/cancel`, { reason });
      toast.success('Dokumen ROP dibatalkan', { description: 'Dokumen dihapus permanen; jejak tersimpan di modul Histori.' });
      refreshListTab('production', 'request-order-part');
      setCancelOpen(false);
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal membatalkan dokumen');
    } finally {
      setCanceling(false);
    }
  };

  // ── Cetak (buka tab cetak) ──
  const handlePrint = () => {
    if (!ropId) return;
    openFormTab({
      title: `Cetak ${detail?.noRop || 'ROP'}`,
      module: 'production',
      subPage: 'request-order-part',
      formKey: 'rop-cetak',
      formProps: { ropId }
    });
  };

  // ── Render ──

  if (loadError) {
    return (
      <FormTabShell title={title}>
        <Card className="border-destructive">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Gagal memuat dokumen</p>
              <p className="text-xs text-muted-foreground mt-1">{loadError}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => activeTabId && closeTab(activeTabId)}>
                Tutup Tab
              </Button>
            </div>
          </CardContent>
        </Card>
      </FormTabShell>
    );
  }

  const tableColCount = readOnly ? 9 : 10; // NO + 6 kolom flat + KETERANGAN(2) [+ aksi]

  return (
    <FormTabShell title={title}>
      {mode !== 'create' && loadingDetail ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-72" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-4 sm:p-6 space-y-6">
            {/* ── Header dokumen: judul + nomor + status (kiri) & Pilih SO + kartu info SO (kanan) ── */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                {/* Update #003: status TIDAK ditampilkan di form (workflow tanpa
                    persetujuan — lihat tombol Buat ROP di bar aksi). */}
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-lg font-bold uppercase tracking-tight">Request Order Part</h3>
                </div>
                {detail?.noRop ? <p className="mt-1 font-mono text-sm font-medium text-muted-foreground">{detail.noRop}</p> : <p className="mt-1 text-xs text-muted-foreground">Nomor dokumen (mis. ROP ASI/2026/001) dibuat otomatis oleh sistem setelah disimpan.</p>}
                {detail?.creator?.namaLengkap && <p className="mt-0.5 text-xs text-muted-foreground">Dibuat oleh akun: {detail.creator.namaLengkap}</p>}
                {mode === 'edit' && readOnly && detail && (
                  <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                    Dokumen sudah <strong>DIBUAT</strong> (final) — hanya dapat dilihat dan dicetak. Perubahan hanya untuk dokumen yang belum dibuat.
                  </p>
                )}
              </div>

              <div className="w-full space-y-3 lg:w-96 lg:shrink-0">
                <div className="space-y-1.5">
                  <Label htmlFor="rop-sales-order">
                    Pilih SO <span className="text-destructive">*</span>
                  </Label>
                  <SearchableDropdown value={formSalesOrderId} onValueChange={setFormSalesOrderId} options={soDropdownOptions} placeholder="Pilih Sales Order..." searchPlaceholder="Cari nomor SO / pelanggan..." loading={dropdownsLoading} disabled={readOnly} />
                  {!readOnly && <p className="text-xs text-muted-foreground">Customer terisi otomatis dari Sales Order yang dipilih.</p>}
                </div>
                {soInfo && (
                  <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-xs" aria-label="Informasi Sales Order terpilih">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">No. SO</span>
                      <span className="font-mono font-medium">{soInfo.noPesanan}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Customer PO Number</span>
                      <span className="font-medium">{soInfo.customerPoNumber}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Tanggal SO</span>
                      <span className="font-medium">{formatDate(soInfo.tanggal)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Status SO</span>
                      <span className="font-medium">{soInfo.status}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Grid field header: Project Name / Model / Customer (read-only) / Tanggal ── */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="rop-project-name">
                  Project Name <span className="text-destructive">*</span>
                </Label>
                <Input id="rop-project-name" placeholder="Nama project" value={formProjectName} onChange={(e) => setFormProjectName(e.target.value)} readOnly={readOnly} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rop-model">Model</Label>
                <Input id="rop-model" placeholder="Model / tipe" value={formModel} onChange={(e) => setFormModel(e.target.value)} readOnly={readOnly} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rop-customer">Customer</Label>
                <Input id="rop-customer" placeholder="Otomatis dari SO terpilih" value={customerName} readOnly className="bg-muted/50" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rop-tanggal">
                  Tanggal <span className="text-destructive">*</span>
                </Label>
                <Input id="rop-tanggal" type="date" value={formTanggal} onChange={(e) => setFormTanggal(e.target.value)} readOnly={readOnly} />
              </div>
            </div>

            {/* ── Tabel item (update #003): NO s.d. SUPPLIER sejajar satu baris;
                KETERANGAN = header grup yang dibagi dua sub-kolom ORDER & STOK ── */}
            <div className="space-y-2">
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead rowSpan={2} className="w-12 text-center align-middle">
                        NO
                      </TableHead>
                      <TableHead rowSpan={2} className="min-w-[110px] whitespace-nowrap">
                        ID PART
                      </TableHead>
                      <TableHead rowSpan={2} className="min-w-[180px]">
                        DESCRIPTION
                      </TableHead>
                      <TableHead rowSpan={2} className="min-w-[100px]">
                        MATERIAL
                      </TableHead>
                      <TableHead rowSpan={2} className="min-w-[80px] text-right">
                        QTY
                      </TableHead>
                      <TableHead rowSpan={2} className="min-w-[90px]">
                        QS
                      </TableHead>
                      <TableHead rowSpan={2} className="min-w-[170px]">
                        SUPPLIER
                      </TableHead>
                      <TableHead colSpan={2} className="bg-slate-100 text-center text-[11px] font-semibold uppercase tracking-widest">
                        KETERANGAN
                      </TableHead>
                      {!readOnly && (
                        <TableHead rowSpan={2} className="w-12 text-center align-middle">
                          <span className="sr-only">Aksi</span>
                        </TableHead>
                      )}
                    </TableRow>
                    <TableRow>
                      <TableHead className="min-w-[130px] bg-slate-100 text-[11px] font-semibold uppercase tracking-widest">ORDER</TableHead>
                      <TableHead className="min-w-[130px] bg-amber-50 text-[11px] font-semibold uppercase tracking-widest">STOK</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={tableColCount} className="py-8 text-center text-muted-foreground">
                          Belum ada baris item{!readOnly ? ' — klik "Tambah Baris" untuk menambahkan part' : ''}
                        </TableCell>
                      </TableRow>
                    )}
                    {items.map((it, idx) => (
                      <TableRow key={it.key}>
                        <TableCell className="text-center align-top font-medium tabular-nums">{idx + 1}</TableCell>
                        <TableCell className="align-top">{readOnly ? <span className="font-mono text-xs">{it.idPart || '-'}</span> : <Input value={it.idPart} onChange={(e) => updateItem(idx, { idPart: e.target.value })} placeholder="ID part" className="h-9 font-mono text-xs" aria-label={`ID PART baris ${idx + 1}`} />}</TableCell>
                        <TableCell className="align-top">{readOnly ? it.description || '-' : <Input value={it.description} onChange={(e) => updateItem(idx, { description: e.target.value })} placeholder="Deskripsi part" className="h-9" aria-label={`DESCRIPTION baris ${idx + 1}`} />}</TableCell>
                        <TableCell className="align-top">{readOnly ? it.material || '-' : <Input value={it.material} onChange={(e) => updateItem(idx, { material: e.target.value })} placeholder="Material" className="h-9" aria-label={`MATERIAL baris ${idx + 1}`} />}</TableCell>
                        <TableCell className="align-top">{readOnly ? <span className="block text-right tabular-nums">{Number(it.qty) ? Number(it.qty).toLocaleString('id-ID') : '0'}</span> : <Input type="number" min={0} step="any" value={it.qty} onChange={(e) => updateItem(idx, { qty: e.target.value })} placeholder="0" className="h-9 text-right tabular-nums" aria-label={`QTY baris ${idx + 1}`} />}</TableCell>
                        <TableCell className="align-top">
                          {/* Update #003: QS bertipe data seperti ID PART — input teks. */}
                          {readOnly ? <span className="font-mono text-xs">{it.qs || '-'}</span> : <Input value={it.qs} onChange={(e) => updateItem(idx, { qs: e.target.value })} placeholder="Kode QS" maxLength={100} className="h-9 font-mono text-xs" aria-label={`QS baris ${idx + 1}`} />}
                        </TableCell>
                        <TableCell className="align-top">
                          {readOnly ? (
                            supplierOptions.find((s) => s.id === it.supplierId)?.nama || '-'
                          ) : (
                            <div className="flex items-center gap-1">
                              <SearchableDropdown className="min-w-0 flex-1 text-left" value={it.supplierId} onValueChange={(v) => updateItem(idx, { supplierId: v })} options={supplierDropdownOptions} allOption={{ id: '', label: 'Tanpa supplier' }} placeholder="Pilih supplier..." searchPlaceholder="Cari supplier..." loading={dropdownsLoading} compact />
                              {/* Update #007: quick add supplier per baris item */}
                              <QuickAddSupplierButton
                                compact
                                onCreated={(sup) => {
                                  const drop = toSupplierDropdown(sup);
                                  setSupplierOptions((prev) => (prev.some((row) => row.id === sup.id) ? prev : [...prev, drop]));
                                  updateItem(idx, { supplierId: sup.id });
                                }}
                              />
                            </div>
                          )}
                        </TableCell>
                        {/* ── KETERANGAN — dua sub-kolom: ORDER (kiri) & STOK (kanan) ── */}
                        <TableCell className="align-top">{readOnly ? it.keteranganOrder || '-' : <Input value={it.keteranganOrder} onChange={(e) => updateItem(idx, { keteranganOrder: e.target.value })} placeholder="Keterangan order" className="h-9" aria-label={`KETERANGAN ORDER baris ${idx + 1}`} />}</TableCell>
                        <TableCell className="align-top">{readOnly ? it.keteranganStok || '-' : <Input value={it.keteranganStok} onChange={(e) => updateItem(idx, { keteranganStok: e.target.value })} placeholder="Keterangan stok" className="h-9" aria-label={`KETERANGAN STOK baris ${idx + 1}`} />}</TableCell>
                        {!readOnly && (
                          <TableCell className="align-top">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeItem(idx)} title={`Hapus baris ${idx + 1}`} aria-label={`Hapus baris ${idx + 1}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {!readOnly && (
                <div>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={addItem}>
                    <Plus className="h-4 w-4" /> Tambah Baris
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">QTY = jumlah yang di-order · QS = kode stok/part (tipe seperti ID PART) · Keterangan Order/Stok opsional per baris.</p>
            </div>

            {/* ── Bawah tabel: Note (kiri) + tanda tangan 4 kolom (kanan) ── */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="space-y-1.5 lg:col-span-5">
                <Label htmlFor="rop-catatan">Note</Label>
                <Textarea id="rop-catatan" rows={6} placeholder="Catatan / note dokumen..." value={formCatatan} onChange={(e) => setFormCatatan(e.target.value)} readOnly={readOnly} />
              </div>
              <div className="lg:col-span-7">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {SIGNATURES.map(({ key, label }) => (
                    <div key={key} className="space-y-1.5">
                      <Label className="text-[11px] font-semibold tracking-wider">{label}</Label>
                      {!readOnly && <Input value={signatures[key]} onChange={(e) => setSignatures((prev) => ({ ...prev, [key]: e.target.value }))} placeholder="Nama" className="h-8 text-xs" aria-label={`Nama ${label}`} />}
                      {/* Area tanda tangan — garis di bawah (±60-70px) */}
                      <div className="h-16 border-b border-gray-400" aria-hidden="true" />
                      <p className="min-h-4 text-center text-xs font-medium">{signatures[key] || '\u00A0'}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Legenda distribusi salinan ── */}
            <ColorLegend />

            {/* ── Bar aksi (update #003 — workflow baru tanpa persetujuan):
                create → Simpan; DRAFT → Simpan Perubahan + Buat ROP + Hapus;
                final (DIBUAT) → Cetak + Batalkan Dokumen ── */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
              {mode === 'create' && (
                <div className="mr-auto">
                  <DraftIndicator hasDraft={draft.hasDraft} ageLabel={draft.draftAgeLabel} onDiscard={handleDiscardDraft} formLabel="Request Order Part" />
                </div>
              )}
              <Button variant="outline" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting || membuat || canceling}>
                Tutup
              </Button>

              {mode === 'create' && can(PERM.create) && (
                <Button onClick={handleSubmitCreate} disabled={submitting} className="gap-2">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  <FileText className="h-4 w-4" /> Simpan
                </Button>
              )}

              {mode !== 'create' && !readOnly && can(PERM.print) && (
                <Button variant="outline" onClick={handlePrint} className="gap-2">
                  <Printer className="h-4 w-4" /> Cetak
                </Button>
              )}

              {mode === 'edit' && !readOnly && can(PERM.edit) && (
                <Button onClick={handleSubmitEdit} disabled={submitting} className="gap-2">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Simpan Perubahan
                </Button>
              )}

              {/* DRAFT → aksi Buat ROP (finalisasi) berdampingan dengan Hapus */}
              {mode !== 'create' && !readOnly && detail?.status === 'DRAFT' && can(PERM.buat) && (
                <Button onClick={() => setBuatOpen(true)} disabled={membuat || submitting} className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700">
                  {membuat && <Loader2 className="h-4 w-4 animate-spin" />}
                  <CheckCircle className="h-4 w-4" /> Buat ROP
                </Button>
              )}

              {/* DRAFT → Hapus (hard delete draft). Final → Batalkan Dokumen. */}
              {mode !== 'create' && can(PERM.cancel) && (
                <Button variant="destructive" onClick={() => setCancelOpen(true)} disabled={canceling || membuat || submitting} className="gap-2">
                  <Trash2 className="h-4 w-4" /> {readOnly ? 'Batalkan Dokumen' : 'Hapus'}
                </Button>
              )}

              {mode !== 'create' && readOnly && can(PERM.print) && (
                <Button variant="outline" onClick={handlePrint} className="gap-2">
                  <Printer className="h-4 w-4" /> Cetak
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Dialog konfirmasi Buat ROP (finalisasi — update #003) ── */}
      <AlertDialog open={buatOpen} onOpenChange={setBuatOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              Buat dokumen ROP ini?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-left">
                <span className="block">
                  Dokumen <strong>{detail?.noRop}</strong> akan dibuat (final). Setelah dibuat, dokumen terkunci dan tidak dapat diedit lagi.
                </span>
                <span className="mt-1 block text-muted-foreground">Pastikan seluruh item part dan blok tanda tangan sudah benar sebelum melanjutkan.</span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={membuat}>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={membuat}
              onClick={(e) => {
                e.preventDefault(); // jangan tutup otomatis — biarkan handler yang menutup setelah sukses
                void handleBuat();
              }}>
              {membuat && <Loader2 className="h-4 w-4 animate-spin" />}
              Ya, Buat ROP
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Dialog alasan penghapusan (hard delete) — DRAFT: "Hapus", final: "Batalkan" ── */}
      <HardDeleteCancelDialog open={cancelOpen} onOpenChange={setCancelOpen} title={readOnly ? 'Batalkan Dokumen ROP?' : 'Hapus ROP?'} formLabel={`ROP ${detail?.noRop || ''}`} submitting={canceling} onConfirm={handleCancelDoc} />
    </FormTabShell>
  );
}
