'use client';

/**
 * LPPB — Laporan Pemeriksaan dan Pengujian Barang (Update ASAHI #005).
 *
 * Dokumen RECORD QC barang masuk dari supplier (modul Pembelian, antara
 * Pesanan dan Penerimaan). Non-finansial: tidak posting stok/jurnal —
 * Penerimaan Barang tetap pencatat stok gudang.
 *
 * Workflow (pola ROP #003 — tanpa upacara persetujuan):
 *   Buat form (tarik item dari No PO) → Simpan (DRAFT) → "Selesaikan"
 *   (SELESAI, final, read-only) → Cetak. Hapus utk DRAFT, Batalkan utk final.
 *
 * Tabel: NO | KODE MATERIAL | DESKRIPSI SPESIFIKASI | SATUAN | KUANTITAS PO |
 * KUANTITAS PENERIMAAN | HASIL PENGUJIAN (BAIK / TIDAK BAIK) | SUDAH DITERIMA |
 * BELUM DITERIMA. Baris jasa pengujian (mis. NDT) dibuat BERPASANGAN tepat
 * di bawah barangnya (tombol "↳ Jasa" per baris barang).
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { FormTabShell } from '@/components/erp/form-tab-shell';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ClipboardCheck, Plus, Trash2, Search, ChevronLeft, ChevronRight, Loader2, Pencil, Printer, CheckCircle2, CornerDownRight } from 'lucide-react';
import { formatDate, todayStr } from '@/lib/pdf-utils';
import { api, ApiError, PaginatedResponse } from '@/lib/api';
import { toast } from 'sonner';
import { useTabStore } from '@/store/tab-store';
import { useAuthStore } from '@/store/auth-store';
import { useFormDraft, draftKey } from '@/hooks/use-form-draft';
import { HardDeleteCancelDialog } from '@/components/erp/hard-delete-cancel-dialog';
import type {
  LppbResponse,
  LppbCreate,
  LppbUpdate,
  LppbDetailCreate,
  PurchaseOrderResponse,
  PurchaseOrderSisaResponse,
  HardDeleteResponse
} from '@/types/api';

const PAGE_SIZE = 100;

// ─── Status Badge ────────────────────────────────────────────────────────────

function LppbStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'DRAFT':
      return <Badge className="border-yellow-200 bg-yellow-100 text-yellow-700 hover:bg-yellow-100">Draft</Badge>;
    case 'SELESAI':
      return <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Selesai</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

// ─── Baris draft form ────────────────────────────────────────────────────────

interface LppbRowDraft {
  key: string;
  /** true = baris jasa pengujian manual (mis. NDT) — berpasangan di bawah barangnya */
  isJasa: boolean;
  barangId: string | null;
  purchaseOrderDetailId: string | null;
  kodeMaterial: string;
  deskripsi: string;
  satuan: string;
  qtyPo: number;
  /** akumulasi penerimaan PO SEBELUM LPPB ini (dasar hitung live Sudah/Belum) */
  qtyDiterimaSebelumnya: number;
  qtyPenerimaan: number;
  qtyBaik: number;
  qtyTidakBaik: number;
}

let rowKeySeq = 0;
function nextRowKey(): string {
  rowKeySeq += 1;
  return `lppb-row-${Date.now()}-${rowKeySeq}`;
}

function newRowFromJasa(): LppbRowDraft {
  return {
    key: nextRowKey(),
    isJasa: true,
    barangId: null,
    purchaseOrderDetailId: null,
    kodeMaterial: '',
    deskripsi: '',
    satuan: '',
    qtyPo: 0,
    qtyDiterimaSebelumnya: 0,
    qtyPenerimaan: 0,
    qtyBaik: 0,
    qtyTidakBaik: 0
  };
}

/** Sudah Diterima (live) = akumulasi sebelumnya + qty penerimaan baris ini. */
function sudahDiterima(r: LppbRowDraft): number {
  return (r.qtyDiterimaSebelumnya || 0) + (r.qtyPenerimaan || 0);
}

/** Belum Diterima (live) = sisa PO = Qty PO − Sudah Diterima (min 0). */
function belumDiterima(r: LppbRowDraft): number {
  return Math.max((r.qtyPo || 0) - sudahDiterima(r), 0);
}

// ─── LIST TAB ────────────────────────────────────────────────────────────────

export function LppbTab({ refreshKey }: { refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab);

  const [data, setData] = useState<LppbResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ skip: String(skip), limit: String(PAGE_SIZE) });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter && statusFilter !== 'ALL') params.set('status', statusFilter);
      const res = await api.get<PaginatedResponse<LppbResponse>>(`/pembelian/lppb?${params}`);
      setData(res.data);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [skip, debouncedSearch, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setSkip(0);
  }, []);

  // ── Hapus / Batalkan = Hard Delete + histori ──
  const [cancelTarget, setCancelTarget] = useState<LppbResponse | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const handleCancel = useCallback(
    async (reason?: string) => {
      if (!cancelTarget) return;
      setCancelSubmitting(true);
      try {
        const res = await api.post<HardDeleteResponse>(`/pembelian/lppb/${cancelTarget.id}/cancel`, {
          reason: reason || undefined
        });
        toast.success(res.message || 'LPPB dihapus permanen');
        setCancelTarget(null);
        fetchData();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Gagal menghapus LPPB');
      } finally {
        setCancelSubmitting(false);
      }
    },
    [cancelTarget, fetchData]
  );

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.floor(skip / PAGE_SIZE) + 1;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Daftar LPPB</CardTitle>
              <CardDescription>Laporan Pemeriksaan dan Pengujian Barang — inspeksi QC barang masuk dari supplier</CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() =>
                openFormTab({
                  title: 'Buat LPPB',
                  module: 'purchasing',
                  subPage: 'lppb',
                  formKey: 'lppb-create'
                })
              }>
              <Plus className="mr-1.5 h-4 w-4" /> Buat LPPB
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filter bar */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cari no LPPB, no PO, supplier, proyek, No DO, No RI..." className="pl-8" value={search} onChange={(e) => handleSearchChange(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <select
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setSkip(0);
                }}
                aria-label="Filter status">
                <option value="">Semua Status</option>
                <option value="DRAFT">Draft</option>
                <option value="SELESAI">Selesai</option>
              </select>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
              {error}
              <Button variant="outline" size="sm" className="ml-2" onClick={fetchData}>
                Coba Lagi
              </Button>
            </div>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
              <ClipboardCheck className="h-8 w-8" />
              <div className="text-sm">Belum ada LPPB</div>
              <div className="text-xs">Buat LPPB pertama untuk inspeksi barang masuk dari PO</div>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No LPPB</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Tgl Terima</TableHead>
                    <TableHead>No PO</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Proyek</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.noForm}</TableCell>
                      <TableCell>{formatDate(d.tanggal)}</TableCell>
                      <TableCell>{d.tanggalTerima ? formatDate(d.tanggalTerima) : '-'}</TableCell>
                      <TableCell>{d.purchaseOrder?.noPesanan || '-'}</TableCell>
                      <TableCell className="max-w-40 truncate" title={d.supplier?.nama || ''}>{d.supplier?.nama || '-'}</TableCell>
                      <TableCell className="max-w-40 truncate" title={d.proyek || ''}>{d.proyek || '-'}</TableCell>
                      <TableCell>
                        <LppbStatusBadge status={d.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {d.status === 'DRAFT' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() =>
                                openFormTab({
                                  title: d.noForm,
                                  module: 'purchasing',
                                  subPage: 'lppb',
                                  formKey: 'lppb-edit',
                                  formProps: { id: d.id }
                                })
                              }
                              title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() =>
                              openFormTab({
                                title: `Cetak ${d.noForm}`,
                                module: 'purchasing',
                                subPage: 'lppb',
                                formKey: 'lppb-cetak',
                                formProps: { id: d.id }
                              })
                            }
                            title="Cetak">
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => setCancelTarget(d)}
                            title={d.status === 'DRAFT' ? 'Hapus' : 'Batalkan Dokumen'}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Menampilkan {skip + 1}–{Math.min(skip + PAGE_SIZE, total)} dari {total} dokumen
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))} disabled={skip === 0}>
                  <ChevronLeft className="h-4 w-4" /> Sebelumnya
                </Button>
                <span className="text-sm">
                  Hal. {page}/{pageCount}
                </span>
                <Button variant="outline" size="sm" onClick={() => setSkip(skip + PAGE_SIZE)} disabled={skip + PAGE_SIZE >= total}>
                  Berikutnya <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <HardDeleteCancelDialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title={cancelTarget?.status === 'DRAFT' ? 'Hapus LPPB?' : 'Batalkan Dokumen LPPB?'}
        formLabel={`LPPB ${cancelTarget?.noForm || ''}`}
        submitting={cancelSubmitting}
        onConfirm={handleCancel}
      />
    </div>
  );
}

// ─── FORM (create + edit) ────────────────────────────────────────────────────

interface LppbFormDraftData {
  purchaseOrderId: string;
  tanggal: string;
  tanggalTerima: string;
  nomorDo: string;
  nomorRi: string;
  proyek: string;
  revisi: string;
  noFormat: string;
  keterangan: string;
  mengetahuiJabatan: string;
  mengetahuiNama: string;
  rows: LppbRowDraft[];
}

export function LppbForm({ lppbId }: { lppbId?: string }) {
  const isEdit = !!lppbId;
  const openFormTab = useTabStore((s) => s.openFormTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);
  const closeTab = useTabStore((s) => s.closeTab);
  const activeTabId = useTabStore((s) => s.activeTabId);

  // ── Dropdown PO (self-loaded) ──
  const [poOptions, setPoOptions] = useState<{ id: string; noPesanan: string }[]>([]);
  const [poOptionsLoading, setPoOptionsLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    api
      .get<PaginatedResponse<PurchaseOrderResponse>>('/pembelian/purchase-order?limit=200')
      .then((res) => {
        if (!cancelled) setPoOptions(res.data.map((p) => ({ id: p.id, noPesanan: p.noPesanan })));
      })
      .catch(() => {
        /* dropdown kosong */
      })
      .finally(() => {
        if (!cancelled) setPoOptionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Detail (edit mode) ──
  const [detail, setDetail] = useState<LppbResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(isEdit);

  // ── Header fields ──
  const [fPurchaseOrderId, setFPurchaseOrderId] = useState('');
  const [fTanggal, setFTanggal] = useState(todayStr());
  const [fTanggalTerima, setFTanggalTerima] = useState(todayStr());
  const [fNomorDo, setFNomorDo] = useState('');
  const [fNomorRi, setFNomorRi] = useState('');
  const [fProyek, setFProyek] = useState('');
  const [fRevisi, setFRevisi] = useState('');
  const [fNoFormat, setFNoFormat] = useState('');
  const [fKeterangan, setFKeterangan] = useState('');
  const [fMengetahuiJabatan, setFMengetahuiJabatan] = useState('');
  const [fMengetahuiNama, setFMengetahuiNama] = useState('');

  const [rows, setRows] = useState<LppbRowDraft[]>([]);
  const [poLoading, setPoLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selesaikanOpen, setSelesaikanOpen] = useState(false);
  const [menyelesaikan, setMenyelesaikan] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [canceling, setCanceling] = useState(false);

  const readOnly = isEdit && detail?.status === 'SELESAI';

  // ── Load detail (edit) ──
  useEffect(() => {
    if (!lppbId) return;
    let cancelled = false;
    setDetailLoading(true);
    api
      .get<LppbResponse>(`/pembelian/lppb/${lppbId}`)
      .then((res) => {
        if (cancelled) return;
        setDetail(res);
        setFPurchaseOrderId(res.purchaseOrderId);
        setFTanggal(res.tanggal ? res.tanggal.slice(0, 10) : todayStr());
        setFTanggalTerima(res.tanggalTerima ? res.tanggalTerima.slice(0, 10) : '');
        setFNomorDo(res.nomorDo || '');
        setFNomorRi(res.nomorRi || '');
        setFProyek(res.proyek || '');
        setFRevisi(res.revisi || '');
        setFNoFormat(res.noFormat || '');
        setFKeterangan(res.keterangan || '');
        setFMengetahuiJabatan(res.mengetahuiJabatan || '');
        setFMengetahuiNama(res.mengetahuiNama || '');
        setRows(
          (res.details || [])
            .slice()
            .sort((a, b) => a.urutan - b.urutan)
            .map((d) => ({
              key: nextRowKey(),
              isJasa: !d.barangId && !d.purchaseOrderDetailId,
              barangId: d.barangId || null,
              purchaseOrderDetailId: d.purchaseOrderDetailId || null,
              kodeMaterial: d.kodeMaterial || '',
              deskripsi: d.deskripsiSpesifikasi || '',
              satuan: d.satuan || '',
              qtyPo: Number(d.qtyPo) || 0,
              qtyDiterimaSebelumnya: (Number(d.qtySudahDiterima) || 0) - (Number(d.qtyPenerimaan) || 0),
              qtyPenerimaan: Number(d.qtyPenerimaan) || 0,
              qtyBaik: Number(d.qtyBaik) || 0,
              qtyTidakBaik: Number(d.qtyTidakBaik) || 0
            }))
        );
      })
      .catch((e) => {
        toast.error(e instanceof ApiError ? e.detail : 'Gagal memuat LPPB');
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lppbId]);

  // ── Draft otomatis (create) ──
  const userId = useAuthStore((s) => s.user?.id ?? 'anon');
  const draft = useFormDraft<LppbFormDraftData>(draftKey(userId, 'purchasing', 'lppb', 'create'));
  const skipNextSaveRef = useRef(false);
  const restoredRef = useRef(false);
  useEffect(() => {
    if (isEdit || restoredRef.current) return;
    restoredRef.current = true;
    const d = draft.draft;
    if (!d) return;
    setFPurchaseOrderId(d.purchaseOrderId || '');
    setFTanggal(d.tanggal || todayStr());
    setFTanggalTerima(d.tanggalTerima || '');
    setFNomorDo(d.nomorDo || '');
    setFNomorRi(d.nomorRi || '');
    setFProyek(d.proyek || '');
    setFRevisi(d.revisi || '');
    setFNoFormat(d.noFormat || '');
    setFKeterangan(d.keterangan || '');
    setFMengetahuiJabatan(d.mengetahuiJabatan || '');
    setFMengetahuiNama(d.mengetahuiNama || '');
    if (Array.isArray(d.rows) && d.rows.length) setRows(d.rows);
    toast.info('Draft isian dipulihkan', { description: 'Isian terakhir form LPPB dimuat kembali otomatis.' });
  }, []);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isEdit) return;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    draft.saveDraft({
      purchaseOrderId: fPurchaseOrderId,
      tanggal: fTanggal,
      tanggalTerima: fTanggalTerima,
      nomorDo: fNomorDo,
      nomorRi: fNomorRi,
      proyek: fProyek,
      revisi: fRevisi,
      noFormat: fNoFormat,
      keterangan: fKeterangan,
      mengetahuiJabatan: fMengetahuiJabatan,
      mengetahuiNama: fMengetahuiNama,
      rows
    });
  }, [fPurchaseOrderId, fTanggal, fTanggalTerima, fNomorDo, fNomorRi, fProyek, fRevisi, fNoFormat, fKeterangan, fMengetahuiJabatan, fMengetahuiNama, rows]);

  const handleDiscardDraft = useCallback(() => {
    skipNextSaveRef.current = true;
    draft.clearDraft();
    setFPurchaseOrderId('');
    setFTanggal(todayStr());
    setFTanggalTerima(todayStr());
    setFNomorDo('');
    setFNomorRi('');
    setFProyek('');
    setFRevisi('');
    setFNoFormat('');
    setFKeterangan('');
    setFMengetahuiJabatan('');
    setFMengetahuiNama('');
    setRows([]);
  }, []);

  // ── Tarik item PO (pola "No SO"/"No DO": pilih No PO → baris masuk tabel) ──
  const handlePurchaseOrderChange = useCallback(
    async (poId: string) => {
      setFPurchaseOrderId(poId);
      if (!poId) {
        setRows([]);
        return;
      }
      setPoLoading(true);
      try {
        const sisa = await api.get<PurchaseOrderSisaResponse>(`/pembelian/purchase-order/${poId}/sisa`);
        const poRows = (sisa.details || []).map<LppbRowDraft>((d) => {
          const qtyPenerimaan = Number(d.sisaTerima) || 0;
          return {
            key: nextRowKey(),
            isJasa: false,
            barangId: d.barangId,
            purchaseOrderDetailId: d.purchaseOrderDetailId,
            kodeMaterial: d.kodeBarang || '',
            deskripsi: d.namaBarang || '',
            satuan: d.satuanNama || '',
            qtyPo: Number(d.qtyPesanan) || 0,
            qtyDiterimaSebelumnya: Number(d.qtyDiterima) || 0,
            qtyPenerimaan,
            qtyBaik: qtyPenerimaan,
            qtyTidakBaik: 0
          };
        });
        if (poRows.length === 0) {
          toast.info('PO tidak memiliki baris item', { description: 'Semua baris PO mungkin sudah diterima sepenuhnya — tambahkan baris jasa pengujian manual bila perlu.' });
        }
        setRows(poRows);
      } catch (e) {
        toast.error(e instanceof ApiError ? e.detail : 'Gagal menarik item PO');
      } finally {
        setPoLoading(false);
      }
    },
    []
  );

  // ── Row ops ──
  const updateRow = useCallback((idx: number, patch: Partial<LppbRowDraft>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }, []);

  /** Sisipkan baris jasa pengujian (NDT) TEPAT DI BAWAH barangnya — berpasangan. */
  const insertJasaAfter = useCallback((idx: number) => {
    setRows((prev) => {
      const next = [...prev];
      next.splice(idx + 1, 0, newRowFromJasa());
      return next;
    });
  }, []);

  const removeRow = useCallback((idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  // ── Payload builder ──
  const buildDetailsPayload = useCallback((): LppbDetailCreate[] | null => {
    if (rows.length === 0) {
      toast.error('Minimal 1 baris pemeriksaan diperlukan');
      return null;
    }
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.deskripsi.trim()) {
        toast.error(`Deskripsi Spesifikasi baris ${i + 1} wajib diisi`);
        return null;
      }
      if (r.qtyPenerimaan < 0 || r.qtyBaik < 0 || r.qtyTidakBaik < 0 || r.qtyPo < 0) {
        toast.error(`Kuantitas baris ${i + 1} tidak boleh negatif`);
        return null;
      }
      if (r.qtyBaik + r.qtyTidakBaik > r.qtyPenerimaan) {
        toast.error(`Baris ${i + 1}: Baik (${r.qtyBaik}) + Tidak Baik (${r.qtyTidakBaik}) melebihi Kuantitas Penerimaan (${r.qtyPenerimaan})`);
        return null;
      }
    }
    return rows.map((r, i) => ({
      urutan: i + 1,
      barangId: r.barangId,
      purchaseOrderDetailId: r.purchaseOrderDetailId,
      kodeMaterial: r.kodeMaterial.trim() || null,
      deskripsiSpesifikasi: r.deskripsi.trim(),
      satuan: r.satuan.trim() || null,
      qtyPo: r.qtyPo,
      qtyPenerimaan: r.qtyPenerimaan,
      qtyBaik: r.qtyBaik,
      qtyTidakBaik: r.qtyTidakBaik
    }));
  }, [rows]);

  // ── Submit: Simpan (create) ──
  const handleCreate = async () => {
    if (!fTanggal) {
      toast.error('Tanggal LPPB wajib diisi');
      return;
    }
    if (!fPurchaseOrderId) {
      toast.error('Pilih Nomor PO terlebih dahulu (item ditarik otomatis dari PO)');
      return;
    }
    const details = buildDetailsPayload();
    if (!details) return;

    setSubmitting(true);
    try {
      const payload: LppbCreate = {
        tanggal: fTanggal,
        purchaseOrderId: fPurchaseOrderId,
        tanggalTerima: fTanggalTerima || null,
        nomorDo: fNomorDo.trim() || null,
        nomorRi: fNomorRi.trim() || null,
        proyek: fProyek.trim() || null,
        revisi: fRevisi.trim() || null,
        noFormat: fNoFormat.trim() || null,
        keterangan: fKeterangan.trim() || null,
        mengetahuiJabatan: fMengetahuiJabatan.trim() || null,
        mengetahuiNama: fMengetahuiNama.trim() || null,
        details
      };
      const res = await api.post<LppbResponse>('/pembelian/lppb', payload);
      draft.clearDraft();
      skipNextSaveRef.current = true;
      refreshListTab('purchasing', 'lppb');
      toast.success('Draft LPPB berhasil disimpan', { description: `Nomor dokumen: ${res.noForm}` });
      // Pindah ke mode edit pada tab yang sama (pola ROP).
      // NOTE: routing purchasing membaca formProps.id → kirim { id }.
      openFormTab({
        title: res.noForm,
        module: 'purchasing',
        subPage: 'lppb',
        formKey: 'lppb-edit',
        formProps: { id: res.id },
        replaceCurrent: true
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal menyimpan LPPB');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Submit: Simpan Perubahan (edit, PUT) ──
  const handleUpdate = async () => {
    if (!lppbId || !detail) return;
    if (!fTanggal) {
      toast.error('Tanggal LPPB wajib diisi');
      return;
    }
    if (!fPurchaseOrderId) {
      toast.error('Nomor PO wajib dipilih');
      return;
    }
    const details = buildDetailsPayload();
    if (!details) return;

    const payload: LppbUpdate = {};
    if (fTanggal !== detail.tanggal.slice(0, 10)) payload.tanggal = fTanggal;
    if ((fTanggalTerima || null) !== (detail.tanggalTerima ? detail.tanggalTerima.slice(0, 10) : null)) payload.tanggalTerima = fTanggalTerima || null;
    if (fPurchaseOrderId !== detail.purchaseOrderId) payload.purchaseOrderId = fPurchaseOrderId;
    if (fNomorDo.trim() !== (detail.nomorDo || '')) payload.nomorDo = fNomorDo.trim() || null;
    if (fNomorRi.trim() !== (detail.nomorRi || '')) payload.nomorRi = fNomorRi.trim() || null;
    if (fProyek.trim() !== (detail.proyek || '')) payload.proyek = fProyek.trim() || null;
    if (fRevisi.trim() !== (detail.revisi || '')) payload.revisi = fRevisi.trim() || null;
    if (fNoFormat.trim() !== (detail.noFormat || '')) payload.noFormat = fNoFormat.trim() || null;
    if (fKeterangan.trim() !== (detail.keterangan || '')) payload.keterangan = fKeterangan.trim() || null;
    if (fMengetahuiJabatan.trim() !== (detail.mengetahuiJabatan || '')) payload.mengetahuiJabatan = fMengetahuiJabatan.trim() || null;
    if (fMengetahuiNama.trim() !== (detail.mengetahuiNama || '')) payload.mengetahuiNama = fMengetahuiNama.trim() || null;

    // Diff baris — `details` MENGGANTI seluruh baris, kirim hanya bila berubah.
    const orig = (detail.details || []).slice().sort((a, b) => a.urutan - b.urutan);
    const rowsChanged =
      orig.length !== rows.length ||
      orig.some((o, i) => {
        const r = rows[i];
        return (
          (o.kodeMaterial || '') !== r.kodeMaterial.trim() ||
          o.deskripsiSpesifikasi !== r.deskripsi.trim() ||
          (o.satuan || '') !== r.satuan.trim() ||
          Number(o.qtyPo) !== r.qtyPo ||
          Number(o.qtyPenerimaan) !== r.qtyPenerimaan ||
          Number(o.qtyBaik) !== r.qtyBaik ||
          Number(o.qtyTidakBaik) !== r.qtyTidakBaik
        );
      });
    if (rowsChanged) payload.details = details;

    if (Object.keys(payload).length === 0) {
      toast.info('Tidak ada perubahan untuk disimpan');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.put<LppbResponse>(`/pembelian/lppb/${lppbId}`, payload);
      setDetail(res);
      refreshListTab('purchasing', 'lppb');
      toast.success('Perubahan LPPB berhasil disimpan', { description: res.noForm });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal memperbarui LPPB');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Selesaikan (finalisasi DRAFT → SELESAI) ──
  const handleSelesaikan = async () => {
    if (!lppbId) return;
    setMenyelesaikan(true);
    try {
      const res = await api.post<LppbResponse>(`/pembelian/lppb/${lppbId}/selesaikan`);
      setDetail(res);
      refreshListTab('purchasing', 'lppb');
      toast.success('LPPB berhasil diselesaikan', { description: `${res.noForm} kini dokumen final — terkunci (read-only).` });
      setSelesaikanOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal menyelesaikan LPPB');
    } finally {
      setMenyelesaikan(false);
    }
  };

  // ── Hapus / Batalkan dokumen (hard delete + histori) ──
  const handleCancelDoc = async (reason: string) => {
    if (!lppbId) return;
    setCanceling(true);
    try {
      await api.post(`/pembelian/lppb/${lppbId}/cancel`, { reason });
      toast.success('Dokumen LPPB dibatalkan', { description: 'Dokumen dihapus permanen; jejak tersimpan di modul Histori.' });
      refreshListTab('purchasing', 'lppb');
      setCancelOpen(false);
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal membatalkan dokumen');
    } finally {
      setCanceling(false);
    }
  };

  // ── Cetak ──
  const handlePrint = () => {
    if (!lppbId) return;
    openFormTab({
      title: `Cetak ${detail?.noForm || 'LPPB'}`,
      module: 'purchasing',
      subPage: 'lppb',
      formKey: 'lppb-cetak',
      formProps: { id: lppbId }
    });
  };

  const tableColCount = 10; // NO..BELUM + aksi

  const title = isEdit ? detail?.noForm || 'LPPB' : 'Buat LPPB';

  if (detailLoading) {
    return (
      <FormTabShell title="LPPB">
        <div className="space-y-4 p-6">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </FormTabShell>
    );
  }

  return (
    <FormTabShell title={title}>
      <div className="space-y-4 p-4 md:p-6">
        {readOnly && (
          <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <strong>Dokumen final (SELESAI).</strong> LPPB sudah diselesaikan dan tidak bisa diubah lagi — hanya bisa dicetak atau dibatalkan.
            </div>
          </div>
        )}

        {/* ── Blok referensi transaksi ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Referensi Transaksi</CardTitle>
            <CardDescription>Item tabel ditarik otomatis dari Purchase Order yang dipilih</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>
                Nomor PO <span className="text-destructive">*</span>
              </Label>
              <SearchableDropdown
                value={fPurchaseOrderId}
                onValueChange={(v) => {
                  if (!readOnly) void handlePurchaseOrderChange(v);
                }}
                options={[
                  ...(fPurchaseOrderId && !poOptions.some((p) => p.id === fPurchaseOrderId)
                    ? [{ id: fPurchaseOrderId, label: detail?.purchaseOrder?.noPesanan || fPurchaseOrderId }]
                    : []),
                  ...poOptions.map((p) => ({ id: p.id, label: p.noPesanan }))
                ]}
                placeholder="Pilih PO..."
                disabled={poOptionsLoading || poLoading || readOnly}
              />
              {poLoading && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Menarik item PO...
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Input value={detail?.supplier?.nama || (readOnly ? '-' : '— otomatis dari PO —')} disabled />
            </div>
            <div className="space-y-2">
              <Label>
                Tanggal LPPB <span className="text-destructive">*</span>
              </Label>
              <Input type="date" value={fTanggal} onChange={(e) => setFTanggal(e.target.value)} disabled={readOnly} />
            </div>
            <div className="space-y-2">
              <Label>Tgl Terima</Label>
              <Input type="date" value={fTanggalTerima} onChange={(e) => setFTanggalTerima(e.target.value)} disabled={readOnly} />
            </div>
            <div className="space-y-2">
              <Label>Nomor DO</Label>
              <Input placeholder="No surat jalan / DO supplier" maxLength={100} value={fNomorDo} onChange={(e) => setFNomorDo(e.target.value)} disabled={readOnly} />
            </div>
            <div className="space-y-2">
              <Label>Nomor RI</Label>
              <Input placeholder="No referensi inspeksi eksternal" maxLength={100} value={fNomorRi} onChange={(e) => setFNomorRi(e.target.value)} disabled={readOnly} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Proyek</Label>
              <Input placeholder="Nama proyek" maxLength={200} value={fProyek} onChange={(e) => setFProyek(e.target.value)} disabled={readOnly} />
            </div>
            <div className="space-y-2">
              <Label>Revisi</Label>
              <Input placeholder="Mis. 0" maxLength={20} value={fRevisi} onChange={(e) => setFRevisi(e.target.value)} disabled={readOnly} />
            </div>
            <div className="space-y-2">
              <Label>No. Format</Label>
              <Input placeholder="Mis. F-QC-LPPB-01" maxLength={50} value={fNoFormat} onChange={(e) => setFNoFormat(e.target.value)} disabled={readOnly} />
            </div>
          </CardContent>
        </Card>

        {/* ── Tabel pemeriksaan & pengujian ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pemeriksaan dan Pengujian</CardTitle>
            <CardDescription>
              Baris barang ditarik dari PO. Baris jasa pengujian (mis. NDT) dibuat <strong>berpasangan</strong> di bawah barangnya lewat tombol ↳ Jasa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead rowSpan={2} className="w-10 text-center align-middle">NO</TableHead>
                    <TableHead rowSpan={2} className="min-w-28 align-middle">KODE MATERIAL</TableHead>
                    <TableHead rowSpan={2} className="min-w-64 align-middle">DESKRIPSI SPESIFIKASI</TableHead>
                    <TableHead rowSpan={2} className="w-20 align-middle">SATUAN</TableHead>
                    <TableHead rowSpan={2} className="w-20 text-center align-middle">KUANTITAS PO</TableHead>
                    <TableHead rowSpan={2} className="w-24 text-center align-middle">KUANTITAS PENERIMAAN</TableHead>
                    <TableHead colSpan={2} className="bg-slate-100 text-center">HASIL PENGUJIAN</TableHead>
                    <TableHead rowSpan={2} className="w-20 text-center align-middle">SUDAH DITERIMA</TableHead>
                    <TableHead rowSpan={2} className="w-20 text-center align-middle">BELUM DITERIMA</TableHead>
                    {!readOnly && <TableHead rowSpan={2} className="w-16 text-center align-middle">Aksi</TableHead>}
                  </TableRow>
                  <TableRow>
                    <TableHead className="bg-slate-100 text-center">BAIK</TableHead>
                    <TableHead className="bg-slate-100 text-center">TIDAK BAIK</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={readOnly ? tableColCount - 1 : tableColCount} className="py-10 text-center text-muted-foreground">
                        Pilih Nomor PO untuk menarik item, atau baris akan muncul di sini.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r, idx) => (
                      <TableRow key={r.key} className={r.isJasa ? 'bg-amber-50/50' : undefined}>
                        <TableCell className="text-center text-xs text-muted-foreground">{r.isJasa ? <CornerDownRight className="mx-auto h-3.5 w-3.5" /> : idx + 1}</TableCell>
                        <TableCell>
                          <Input
                            className="h-8 font-mono text-xs"
                            placeholder={r.isJasa ? '—' : 'Kode'}
                            value={r.kodeMaterial}
                            onChange={(e) => updateRow(idx, { kodeMaterial: e.target.value })}
                            disabled={readOnly || !r.isJasa}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8"
                            placeholder={r.isJasa ? 'Jasa pengujian, mis. NDT (Ultrasonic Test)...' : 'Deskripsi barang & acuan spesifikasi'}
                            value={r.deskripsi}
                            onChange={(e) => updateRow(idx, { deskripsi: e.target.value })}
                            disabled={readOnly}
                          />
                        </TableCell>
                        <TableCell>
                          <Input className="h-8 text-xs" placeholder="SET" value={r.satuan} onChange={(e) => updateRow(idx, { satuan: e.target.value })} disabled={readOnly} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" min={0} className="h-8 text-center" value={r.qtyPo} onChange={(e) => updateRow(idx, { qtyPo: Number(e.target.value) || 0 })} disabled={readOnly || !r.isJasa} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" min={0} className="h-8 text-center" value={r.qtyPenerimaan} onChange={(e) => updateRow(idx, { qtyPenerimaan: Number(e.target.value) || 0 })} disabled={readOnly} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" min={0} className="h-8 text-center" value={r.qtyBaik} onChange={(e) => updateRow(idx, { qtyBaik: Number(e.target.value) || 0 })} disabled={readOnly} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" min={0} className="h-8 text-center text-red-600" value={r.qtyTidakBaik} onChange={(e) => updateRow(idx, { qtyTidakBaik: Number(e.target.value) || 0 })} disabled={readOnly} />
                        </TableCell>
                        <TableCell className="text-center font-medium">{sudahDiterima(r)}</TableCell>
                        <TableCell className="text-center font-medium">{belumDiterima(r)}</TableCell>
                        {!readOnly && (
                          <TableCell>
                            <div className="flex items-center justify-center gap-0.5">
                              {!r.isJasa && (
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700" onClick={() => insertJasaAfter(idx)} title="Sisipkan baris jasa pengujian (NDT) di bawah barang ini">
                                  <CornerDownRight className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeRow(idx)} title={`Hapus baris ${idx + 1}`} aria-label={`Hapus baris ${idx + 1}`}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {!readOnly && (
              <Button variant="outline" size="sm" onClick={() => setRows((prev) => [...prev, newRowFromJasa()])}>
                <Plus className="mr-1.5 h-4 w-4" /> Tambah Baris Jasa Pengujian
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              <strong>Sudah Diterima</strong> = akumulasi penerimaan PO sebelumnya + kuantitas penerimaan ini · <strong>Belum Diterima</strong> = sisa PO. Nilai final dihitung ulang server saat disimpan.
            </p>
          </CardContent>
        </Card>

        {/* ── Keterangan + pengesahan ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Keterangan &amp; Pengesahan</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label>Keterangan</Label>
              <Textarea rows={3} placeholder="Merujuk nomor RI dan nomor surat jalan, atau catatan lain..." maxLength={1000} value={fKeterangan} onChange={(e) => setFKeterangan(e.target.value)} disabled={readOnly} />
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Mengetahui — Jabatan</Label>
                <Input placeholder="Mis. QC Manager" maxLength={100} value={fMengetahuiJabatan} onChange={(e) => setFMengetahuiJabatan(e.target.value)} disabled={readOnly} />
              </div>
              <div className="space-y-2">
                <Label>Mengetahui — Nama Terang</Label>
                <Input placeholder="Nama lengkap penandatangan" maxLength={150} value={fMengetahuiNama} onChange={(e) => setFMengetahuiNama(e.target.value)} disabled={readOnly} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Actions ── */}
        <div className="flex flex-wrap items-center justify-end gap-2 pb-4">
          {!isEdit && (
            <>
              <Button variant="outline" onClick={handleDiscardDraft} disabled={submitting}>
                Bersihkan
              </Button>
              <Button onClick={handleCreate} disabled={submitting || poLoading}>
                {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                Simpan
              </Button>
            </>
          )}
          {isEdit && !readOnly && (
            <>
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="mr-1.5 h-4 w-4" /> Cetak
              </Button>
              <Button variant="outline" onClick={handleUpdate} disabled={submitting}>
                {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} Simpan Perubahan
              </Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setSelesaikanOpen(true)} disabled={submitting}>
                <CheckCircle2 className="mr-1.5 h-4 w-4" /> Selesaikan
              </Button>
              <Button variant="destructive" onClick={() => setCancelOpen(true)} disabled={submitting}>
                <Trash2 className="mr-1.5 h-4 w-4" /> Hapus
              </Button>
            </>
          )}
          {isEdit && readOnly && (
            <>
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="mr-1.5 h-4 w-4" /> Cetak
              </Button>
              <Button variant="destructive" onClick={() => setCancelOpen(true)}>
                <Trash2 className="mr-1.5 h-4 w-4" /> Batalkan Dokumen
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Dialog Selesaikan */}
      <AlertDialog open={selesaikanOpen} onOpenChange={setSelesaikanOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Selesaikan dokumen LPPB ini?</AlertDialogTitle>
            <AlertDialogDescription>
              LPPB {detail?.noForm} akan difinalisasi (SELESAI) dan tidak bisa diubah lagi. Pastikan hasil pemeriksaan &amp; pengujian sudah benar sebelum menyelesaikan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={menyelesaikan}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleSelesaikan} disabled={menyelesaikan} className="bg-emerald-600 hover:bg-emerald-700">
              {menyelesaikan ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} Ya, Selesaikan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <HardDeleteCancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={readOnly ? 'Batalkan Dokumen LPPB?' : 'Hapus LPPB?'}
        formLabel={`LPPB ${detail?.noForm || ''}`}
        submitting={canceling}
        onConfirm={handleCancelDoc}
      />
    </FormTabShell>
  );
}
