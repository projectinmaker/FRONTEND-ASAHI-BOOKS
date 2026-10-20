'use client';

/**
 * Update #02 + #03 — Dialog Identifikasi & Alokasi dokumen kas Belum Teridentifikasi.
 *
 * Dipanggil dari daftar Penerimaan/Pembayaran (baris BELUM_TERIDENTIFIKASI)
 * dan halaman "Belum Teridentifikasi". Dua mode (Update #03):
 *
 * 1. MODE PIHAK (Identifikasi Piutang/Hutang — default): pilih pelanggan/
 *    supplier dulu → tabel invoice outstanding tampil → pilih invoice +
 *    nilai (+ PPh 23 / diskon) → submit. Sistem mereklasifikasi akun
 *    penampung ke akun piutang/hutang pihak DAN membuat alokasi invoice —
 *    outstanding invoice terbarui tanpa jurnal bank ganda. Bila sisa
 *    penampung dokumen habis, dokumen otomatis menjadi Pelunasan Invoice.
 *    Endpoint: POST /kas-bank/{penerimaan|pembayaran}/{id}/identifikasi-piutang
 *              POST /kas-bank/{penerimaan|pembayaran}/{id}/identifikasi-hutang
 *
 * 2. MODE COA (Transaksi Lainnya): alokasi ke akun COA bebas (pendapatan,
 *    beban, transfer, dll) — akun piutang/hutang DITOLAK backend (guard
 *    subledger vs GL). Endpoint lama:
 *    POST /kas-bank/{penerimaan|pembayaran}/{id}/identifikasi
 *
 * Histori sesi (kedua mode) + tombol batal per sesi (jurnal pembalik; sesi
 * PIUTANG/HUTANG juga memulihkan alokasi invoice & outstanding).
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Plus, Trash2, Info, Ban, SearchCheck, Users, Landmark } from 'lucide-react';
import { toast } from 'sonner';
import { formatRp, formatDate, todayStr } from '@/lib/pdf-utils';
import { api, ApiError } from '@/lib/api';
import { pelunasanApi } from '@/lib/pelunasan-api';
import type { CoaDropdownItem, KasIdentifikasiListResponse, KasIdentifikasiResponse, KasIdentifikasiCreate, IdentifikasiPiutangCreate, IdentifikasiHutangCreate, PelangganDropdown, SupplierDropdown, InvoiceSaldoResponse } from '@/types/api';

interface AlokasiRow {
  id: number;
  akunPerkiraanId: string;
  akunLabel: string;
  nilai: string;
  keterangan: string;
}

/** Baris alokasi invoice (mode piutang/hutang). */
interface InvoiceRow {
  invoice: InvoiceSaldoResponse;
  nilaiDisplay: string;
  pph23Display: string;
  diskonDisplay: string; // hutang saja
}

type Mode = 'PIHAK' | 'COA';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 'penerimaan' | 'pembayaran' */
  jenisDokumen: 'penerimaan' | 'pembayaran';
  dokumenId: string;
  noBukti: string;
  /** Dipanggil setelah identifikasi sukses/dibatalkan (refresh list). */
  onDone?: () => void;
}

/** Format tampilan rupiah utk parse dari CurrencyInput ("1.500.000" → 1500000). */
function parseIntDisplay(v: string): number {
  const digits = (v || '').replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

/** String desimal backend ("1500000.00"). */
function toDecimalStr(v: string): string {
  const n = parseInt((v || '').replace(/\D/g, '') || '0', 10) || 0;
  return `${n}.00`;
}

export function IdentifikasiDialog({ open, onOpenChange, jenisDokumen, dokumenId, noBukti, onDone }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<KasIdentifikasiListResponse | null>(null);

  // === Update #03 — mode identifikasi ===
  const [mode, setMode] = useState<Mode>('PIHAK');
  const [pihakOptions, setPihakOptions] = useState<(PelangganDropdown | SupplierDropdown)[]>([]);
  const [pihakLoading, setPihakLoading] = useState(false);
  const [pihakId, setPihakId] = useState('');
  const [tagihan, setTagihan] = useState<InvoiceSaldoResponse[]>([]);
  const [tagihanLoading, setTagihanLoading] = useState(false);
  const [selected, setSelected] = useState<Record<string, InvoiceRow>>({});

  const [coaOptions, setCoaOptions] = useState<CoaDropdownItem[]>([]);
  const [coaLoading, setCoaLoading] = useState(false);

  const [tanggal, setTanggal] = useState(todayStr());
  const [catatan, setCatatan] = useState('');
  const [rows, setRows] = useState<AlokasiRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<KasIdentifikasiResponse | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isPenerimaan = jenisDokumen === 'penerimaan';
  const pihakLabel = isPenerimaan ? 'Pelanggan' : 'Supplier';
  const modePihakLabel = isPenerimaan ? 'Piutang Pelanggan' : 'Hutang Supplier';

  const fetchData = useCallback(async () => {
    if (!open || !dokumenId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<KasIdentifikasiListResponse>(`/kas-bank/${jenisDokumen}/${dokumenId}/identifikasi`);
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Gagal memuat data identifikasi');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [open, dokumenId, jenisDokumen]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Muat COA sekali saat dialog dibuka (mode COA)
  useEffect(() => {
    if (!open || coaOptions.length > 0 || coaLoading) return;
    setCoaLoading(true);
    api
      .get<CoaDropdownItem[]>('/master/coa-dropdown')
      .then((res) => setCoaOptions(Array.isArray(res) ? res : []))
      .catch(() => toast.error('Gagal memuat daftar akun (COA)'))
      .finally(() => setCoaLoading(false));
  }, [open, coaOptions.length, coaLoading]);

  // Muat dropdown pihak sekali saat dialog dibuka (mode PIHAK)
  useEffect(() => {
    if (!open || pihakOptions.length > 0 || pihakLoading) return;
    setPihakLoading(true);
    const endpoint = isPenerimaan ? '/master/pelanggan-dropdown' : '/master/supplier-dropdown';
    api
      .get<(PelangganDropdown | SupplierDropdown)[]>(endpoint)
      .then((res) => setPihakOptions(Array.isArray(res) ? res : []))
      .catch(() => toast.error(`Gagal memuat daftar ${pihakLabel.toLowerCase()}`))
      .finally(() => setPihakLoading(false));
  }, [open, pihakOptions.length, pihakLoading, isPenerimaan, pihakLabel]);

  // Muat tagihan outstanding saat pihak dipilih (mode PIHAK)
  useEffect(() => {
    if (!open || mode !== 'PIHAK' || !pihakId) {
      setTagihan([]);
      return;
    }
    let cancelled = false;
    setTagihanLoading(true);
    setSelected({});
    pelunasanApi
      .getTagihan(isPenerimaan ? 'piutang' : 'hutang', { pihakId, limit: 100 })
      .then((res) => {
        if (cancelled) return;
        setTagihan((res.data || []).filter((t) => Number(t.sisaTagihan) > 0.005 && t.aktif));
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err instanceof ApiError ? err.detail : 'Gagal memuat daftar invoice outstanding');
        setTagihan([]);
      })
      .finally(() => {
        if (!cancelled) setTagihanLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, mode, pihakId, isPenerimaan]);

  // Reset form saat dialog dibuka
  useEffect(() => {
    if (open) {
      setTanggal(todayStr());
      setCatatan('');
      setRows([]);
      setErrors({});
      setCancelTarget(null);
      setMode('PIHAK');
      setPihakId('');
      setSelected({});
      setTagihan([]);
    }
  }, [open]);

  const coaOptionsFmt = useMemo(() => coaOptions.filter((c) => c.status === 'AKTIF' && c.tingkat === 'DETAIL').map((c) => ({ id: c.id, label: `${c.kode} — ${c.nama}` })), [coaOptions]);

  const pihakOptionsFmt = useMemo(() => pihakOptions.map((p) => ({ id: p.id, label: `${p.kode} — ${p.nama}` })), [pihakOptions]);

  const sisa = data ? Number(data.sisaBelumTeridentifikasi) || 0 : 0;
  const totalAlokasi = useMemo(() => rows.reduce((s, r) => s + (parseInt(r.nilai.replace(/\D/g, ''), 10) || 0), 0), [rows]);

  // Ringkasan mode PIHAK
  const selectedList = useMemo(() => Object.values(selected), [selected]);
  const totalNilaiInv = useMemo(() => selectedList.reduce((s, r) => s + parseIntDisplay(r.nilaiDisplay), 0), [selectedList]);
  const totalPPh23 = useMemo(() => selectedList.reduce((s, r) => s + parseIntDisplay(r.pph23Display), 0), [selectedList]);
  const totalDiskon = useMemo(() => selectedList.reduce((s, r) => s + parseIntDisplay(r.diskonDisplay), 0), [selectedList]);
  /** X = Σ(nilai − diskon − pph23) — nilai keluar dari penampung. */
  const totalPenampung = totalNilaiInv - totalDiskon - totalPPh23;

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, { id: Date.now(), akunPerkiraanId: '', akunLabel: '', nilai: '', keterangan: '' }]);
  }, []);

  const updateRow = useCallback((rowId: number, patch: Partial<AlokasiRow>) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
  }, []);

  const removeRow = useCallback((rowId: number) => {
    setRows((prev) => prev.filter((r) => r.id !== rowId));
  }, []);

  const toggleInvoice = useCallback((inv: InvoiceSaldoResponse, checked: boolean) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (checked) {
        next[inv.invoiceId] = { invoice: inv, nilaiDisplay: '', pph23Display: '', diskonDisplay: '' };
      } else {
        delete next[inv.invoiceId];
      }
      return next;
    });
  }, []);

  const updateInvoiceRow = useCallback((invoiceId: string, patch: Partial<InvoiceRow>) => {
    setSelected((prev) => (prev[invoiceId] ? { ...prev, [invoiceId]: { ...prev[invoiceId], ...patch } } : prev));
  }, []);

  const validatePihak = useCallback((): boolean => {
    const e: Record<string, string> = {};
    if (!tanggal) e.tanggal = 'Tanggal identifikasi wajib diisi';
    if (!pihakId) e.pihak = `Pilih ${pihakLabel.toLowerCase()} yang diidentifikasi`;
    if (selectedList.length === 0) e.alokasi = 'Centang minimal 1 invoice yang dilunasi';
    if (selectedList.some((r) => parseIntDisplay(r.nilaiDisplay) <= 0)) e.alokasi = 'Semua invoice terpilih harus memiliki nilai > 0';
    if (selectedList.some((r) => parseIntDisplay(r.nilaiDisplay) > Number(r.invoice.sisaTagihan) + 0.005)) {
      e.alokasi = 'Nilai alokasi melebihi sisa tagihan invoice';
    }
    if (isPenerimaan && selectedList.some((r) => parseIntDisplay(r.pph23Display) > parseIntDisplay(r.nilaiDisplay))) {
      e.alokasi = 'PPh 23 tidak boleh melebihi nilai alokasi';
    }
    if (!isPenerimaan && selectedList.some((r) => parseIntDisplay(r.diskonDisplay) + parseIntDisplay(r.pph23Display) > parseIntDisplay(r.nilaiDisplay))) {
      e.alokasi = 'Diskon + PPh 23 tidak boleh melebihi nilai alokasi';
    }
    if (totalPenampung <= 0) e.alokasi = 'Total identifikasi harus positif (nilai > diskon + PPh 23)';
    if (totalPenampung > sisa + 0.01) e.alokasi = `Total keluar penampung ${formatRp(totalPenampung)} melebihi sisa ${formatRp(sisa)}`;
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [tanggal, pihakId, selectedList, totalPenampung, sisa, isPenerimaan, pihakLabel]);

  const validateCoa = useCallback((): boolean => {
    const e: Record<string, string> = {};
    if (!tanggal) e.tanggal = 'Tanggal identifikasi wajib diisi';
    if (rows.length === 0) e.alokasi = 'Tambahkan minimal 1 baris alokasi';
    const invalid = rows.some((r) => !r.akunPerkiraanId || (parseInt(r.nilai.replace(/\D/g, ''), 10) || 0) <= 0);
    if (rows.length > 0 && invalid) e.alokasi = 'Semua baris harus memiliki akun dan nilai > 0';
    if (totalAlokasi > sisa + 0.01) e.alokasi = `Total alokasi ${formatRp(totalAlokasi)} melebihi sisa ${formatRp(sisa)}`;
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [tanggal, rows, totalAlokasi, sisa]);

  const handleSubmit = useCallback(async () => {
    if (mode === 'PIHAK') {
      if (!validatePihak()) return;
      setSubmitting(true);
      try {
        const payloadCatatan = catatan.trim() || undefined;
        if (isPenerimaan) {
          const payload: IdentifikasiPiutangCreate = {
            pelangganId: pihakId,
            tanggal,
            catatan: payloadCatatan,
            alokasi: selectedList.map((r) => ({
              salesInvoiceId: r.invoice.invoiceId,
              nilai: toDecimalStr(r.nilaiDisplay),
              pph23: toDecimalStr(r.pph23Display)
            }))
          };
          const res = await api.post<KasIdentifikasiResponse>(`/kas-bank/penerimaan/${dokumenId}/identifikasi-piutang`, payload);
          toast.success(`Identifikasi piutang ${res.noBukti} tercatat`, {
            description: 'Akun penampung direklasifikasi ke piutang pelanggan dan outstanding invoice diperbarui — sisi Kas/Bank tidak dijurnal ulang.'
          });
        } else {
          const payload: IdentifikasiHutangCreate = {
            supplierId: pihakId,
            tanggal,
            catatan: payloadCatatan,
            alokasi: selectedList.map((r) => ({
              purchaseInvoiceId: r.invoice.invoiceId,
              nilai: toDecimalStr(r.nilaiDisplay),
              diskon: toDecimalStr(r.diskonDisplay),
              pph23: toDecimalStr(r.pph23Display)
            }))
          };
          const res = await api.post<KasIdentifikasiResponse>(`/kas-bank/pembayaran/${dokumenId}/identifikasi-hutang`, payload);
          toast.success(`Identifikasi hutang ${res.noBukti} tercatat`, {
            description: 'Akun penampung direklasifikasi ke hutang supplier dan outstanding invoice diperbarui — sisi Kas/Bank tidak dijurnal ulang.'
          });
        }
        setCatatan('');
        setSelected({});
        setPihakId('');
        void fetchData();
        onDone?.();
      } catch (err) {
        toast.error(err instanceof ApiError ? err.detail : 'Gagal menyimpan identifikasi');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!validateCoa()) return;
    setSubmitting(true);
    try {
      const payload: KasIdentifikasiCreate = {
        tanggal,
        catatan: catatan.trim() || undefined,
        alokasi: rows.map((r) => ({
          akunPerkiraanId: r.akunPerkiraanId,
          nilai: parseInt(r.nilai.replace(/\D/g, ''), 10) || 0,
          keterangan: r.keterangan.trim() || undefined
        }))
      };
      const res = await api.post<KasIdentifikasiResponse>(`/kas-bank/${jenisDokumen}/${dokumenId}/identifikasi`, payload);
      toast.success(`Identifikasi ${res.noBukti} tercatat`, {
        description: 'Nilai dipindahkan dari akun penampung ke akun tujuan — sisi Kas/Bank tidak dijurnal ulang (tidak ada jurnal bank ganda).'
      });
      setCatatan('');
      setRows([]);
      void fetchData();
      onDone?.();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal menyimpan identifikasi');
    } finally {
      setSubmitting(false);
    }
  }, [mode, validatePihak, validateCoa, catatan, isPenerimaan, pihakId, selectedList, tanggal, rows, jenisDokumen, dokumenId, fetchData, onDone]);

  const handleCancelIdentifikasi = useCallback(async () => {
    if (!cancelTarget) return;
    setCancelSubmitting(true);
    try {
      await api.post(`/kas-bank/identifikasi/${jenisDokumen}/${cancelTarget.id}/cancel`, { reason: 'Pembatalan identifikasi & alokasi' });
      toast.success(`Identifikasi ${cancelTarget.noBukti} dibatalkan (jurnal pembalik dibuat)`);
      setCancelTarget(null);
      void fetchData();
      onDone?.();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal membatalkan identifikasi');
    } finally {
      setCancelSubmitting(false);
    }
  }, [cancelTarget, jenisDokumen, fetchData, onDone]);

  const labelDokumen = jenisDokumen === 'penerimaan' ? 'Penerimaan' : 'Pembayaran';
  const submitDisabled = submitting || loading || !data || sisa <= 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SearchCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            Identifikasi &amp; Alokasi — {noBukti}
          </DialogTitle>
          <DialogDescription>
            Buka transaksi {labelDokumen.toLowerCase()} Belum Teridentifikasi, pilih {pihakLabel.toLowerCase()} dan invoice (atau akun tujuan), lalu sistem mereklasifikasi akun penampung — tanpa jurnal bank ganda.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
        ) : data ? (
          <div className="space-y-5">
            {/* Info dokumen */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <InfoStat label={`${labelDokumen} (Kas/Bank)`}>{data.kasBank?.akunPerkiraan?.kode || data.kasBank?.kode || '-'}</InfoStat>
              <InfoStat label="Nilai Dokumen">{formatRp(Number(data.totalNilaiDokumen) || 0)}</InfoStat>
              <InfoStat label="Teridentifikasi">{formatRp(Number(data.teridentifikasi) || 0)}</InfoStat>
              <InfoStat label="Sisa Belum Teridentifikasi">
                <span className="font-bold text-amber-700">{formatRp(sisa)}</span>
              </InfoStat>
            </div>
            <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3">
              <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-muted-foreground">
                Akun penampung: <strong>{data.penampungAkun ? `${data.penampungAkun.kode} — ${data.penampungAkun.nama}` : '-'}</strong>. Jurnal identifikasi hanya membalik sisi penampung — saldo Kas/Bank tetap konsisten dengan mutasi awal. Identifikasi penuh otomatis mengubah dokumen menjadi Pelunasan Invoice.
              </p>
            </div>

            {/* Histori identifikasi */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Histori Identifikasi</Label>
              <div className="max-h-48 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="whitespace-nowrap">No Bukti</TableHead>
                      <TableHead className="whitespace-nowrap w-[110px]">Tanggal</TableHead>
                      <TableHead className="whitespace-nowrap text-right w-[130px]">Nilai</TableHead>
                      <TableHead className="whitespace-nowrap">Akun Tujuan</TableHead>
                      <TableHead className="whitespace-nowrap w-[90px]">Jenis</TableHead>
                      <TableHead className="whitespace-nowrap w-[110px]">Status</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.identifikasi.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-16 text-center text-muted-foreground text-sm">
                          Belum ada identifikasi — dokumen ini masih sepenuhnya di akun penampung
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.identifikasi.map((idn) => (
                        <TableRow key={idn.id}>
                          <TableCell className="font-mono text-xs font-medium">{idn.noBukti}</TableCell>
                          <TableCell className="text-xs">{formatDate(idn.tanggal)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatRp(Number(idn.totalNilai) || 0)}</TableCell>
                          <TableCell className="text-xs">{idn.rincian.length === 1 ? (idn.rincian[0].akunPerkiraan ? `${idn.rincian[0].akunPerkiraan.kode} — ${idn.rincian[0].akunPerkiraan.nama}` : '-') : `${idn.rincian.length} baris alokasi`}</TableCell>
                          <TableCell>
                            <JenisIdentifikasiBadge jenis={idn.jenis || 'LAINNYA'} />
                          </TableCell>
                          <TableCell>{idn.status === 'BATAL' ? <Badge className="border-red-200 bg-red-100 text-red-700 hover:bg-red-100">Batal</Badge> : <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Selesai</Badge>}</TableCell>
                          <TableCell className="p-1">
                            {idn.status !== 'BATAL' && (
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setCancelTarget(idn)} title="Batalkan identifikasi (jurnal pembalik + alokasi invoice dipulihkan)" aria-label={`Batalkan identifikasi ${idn.noBukti}`}>
                                <Ban className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <Separator />

            {/* === Update #03 — pemilihan mode identifikasi === */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => setMode('PIHAK')} className={`rounded-lg border p-3 text-left transition-colors ${mode === 'PIHAK' ? 'border-emerald-500 bg-emerald-50' : 'border-border hover:bg-muted/50'}`} aria-pressed={mode === 'PIHAK'}>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  <span className="text-sm font-medium">{modePihakLabel}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Pilih {pihakLabel.toLowerCase()} → invoice outstanding → alokasi. Reklasifikasi ke akun piutang/hutang + outstanding invoice terbarui.</p>
              </button>
              <button type="button" onClick={() => setMode('COA')} className={`rounded-lg border p-3 text-left transition-colors ${mode === 'COA' ? 'border-violet-500 bg-violet-50' : 'border-border hover:bg-muted/50'}`} aria-pressed={mode === 'COA'}>
                <div className="flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-violet-600" aria-hidden="true" />
                  <span className="text-sm font-medium">Akun COA (Lainnya)</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Pendapatan, beban, transfer, dsb. Akun piutang/hutang ditolak — wajib lewat mode {modePihakLabel}.</p>
              </button>
            </div>

            {/* Form alokasi baru */}
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    Tanggal <span className="text-destructive">*</span>
                  </Label>
                  <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={errors.tanggal ? 'border-destructive' : ''} />
                  {errors.tanggal && <p className="text-xs text-destructive">{errors.tanggal}</p>}
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-medium">Catatan</Label>
                  <Input value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Catatan identifikasi (opsional)" />
                </div>
              </div>

              {mode === 'PIHAK' ? (
                <div className="space-y-3">
                  {/* Pilih pihak dulu */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">
                      {pihakLabel} <span className="text-destructive">*</span>
                    </Label>
                    <SearchableDropdown value={pihakId} onValueChange={(v) => setPihakId(v || '')} options={pihakOptionsFmt} loading={pihakLoading} placeholder={`Pilih ${pihakLabel.toLowerCase()}...`} searchPlaceholder={`Cari kode / nama ${pihakLabel.toLowerCase()}...`} error={errors.pihak} />
                    {errors.pihak && <p className="text-xs text-destructive">{errors.pihak}</p>}
                  </div>

                  {/* Tabel invoice outstanding */}
                  {!pihakId ? (
                    <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">Pilih {pihakLabel.toLowerCase()} terlebih dahulu untuk melihat invoice outstanding.</div>
                  ) : tagihanLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : tagihan.length === 0 ? (
                    <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">Tidak ada invoice outstanding untuk {pihakLabel.toLowerCase()} ini — gunakan mode Akun COA bila mutasi bukan pelunasan invoice.</div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50 sticky top-0">
                            <TableHead className="w-10" />
                            <TableHead className="whitespace-nowrap">No. Invoice</TableHead>
                            <TableHead className="whitespace-nowrap w-[100px]">Tanggal</TableHead>
                            <TableHead className="whitespace-nowrap text-right w-[110px]">Sisa Tagihan</TableHead>
                            <TableHead className="whitespace-nowrap w-[130px]">Nilai Alokasi</TableHead>
                            {!isPenerimaan && <TableHead className="whitespace-nowrap w-[110px]">Diskon</TableHead>}
                            <TableHead className="whitespace-nowrap w-[110px]">PPh 23</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tagihan.map((inv) => {
                            const row = selected[inv.invoiceId];
                            const sisaInv = Number(inv.sisaTagihan) || 0;
                            return (
                              <TableRow key={inv.invoiceId} className={row ? 'bg-muted/40' : ''}>
                                <TableCell className="p-2">
                                  <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={!!row} onChange={(e) => toggleInvoice(inv, e.target.checked)} aria-label={`Pilih invoice ${inv.noDokumen}`} />
                                </TableCell>
                                <TableCell className="font-mono text-xs font-medium">{inv.noDokumen}</TableCell>
                                <TableCell className="text-xs">{formatDate(inv.tanggal)}</TableCell>
                                <TableCell className="text-right font-mono text-xs">{formatRp(sisaInv)}</TableCell>
                                <TableCell className="p-2">{row && <CurrencyInput placeholder="0" value={row.nilaiDisplay} onValueChange={(v) => updateInvoiceRow(inv.invoiceId, { nilaiDisplay: v })} className="h-8 text-right font-mono text-xs" />}</TableCell>
                                {!isPenerimaan && <TableCell className="p-2">{row && <CurrencyInput placeholder="0" value={row.diskonDisplay} onValueChange={(v) => updateInvoiceRow(inv.invoiceId, { diskonDisplay: v })} className="h-8 text-right font-mono text-xs" />}</TableCell>}
                                <TableCell className="p-2">
                                  {row && (
                                    <div className="flex items-center gap-1">
                                      <CurrencyInput placeholder="0" value={row.pph23Display} onValueChange={(v) => updateInvoiceRow(inv.invoiceId, { pph23Display: v })} className="h-8 text-right font-mono text-xs" />
                                      <button
                                        type="button"
                                        className="text-[10px] text-emerald-700 hover:underline shrink-0"
                                        title="Isi PPh 23 2% dari nilai alokasi"
                                        onClick={() => {
                                          const n = parseIntDisplay(row.nilaiDisplay);
                                          updateInvoiceRow(inv.invoiceId, { pph23Display: String(Math.floor(n * 0.02)) });
                                        }}>
                                        2%
                                      </button>
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {/* Ringkasan mode pihak */}
                  {selectedList.length > 0 && (
                    <div className="flex justify-end">
                      <div className="w-full max-w-sm space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Σ Nilai Alokasi</span>
                          <span className="font-mono">{formatRp(totalNilaiInv)}</span>
                        </div>
                        {!isPenerimaan && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Σ Diskon</span>
                            <span className="font-mono">−{formatRp(totalDiskon)}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Σ PPh 23</span>
                          <span className="font-mono">−{formatRp(totalPPh23)}</span>
                        </div>
                        <div className="flex items-center justify-between border-t pt-1">
                          <span className="font-medium">Keluar dari Penampung</span>
                          <span className={`font-mono font-semibold ${totalPenampung > sisa + 0.01 ? 'text-destructive' : 'text-emerald-700'}`}>{formatRp(totalPenampung)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Sisa Setelah Ini</span>
                          <span className="font-mono font-semibold">{formatRp(Math.max(0, sisa - totalPenampung))}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {errors.alokasi && <p className="text-xs text-destructive">{errors.alokasi}</p>}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Alokasi Baru</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={submitting} className="h-8">
                      <Plus className="h-3.5 w-3.5 mr-1" /> Tambah Baris
                    </Button>
                  </div>

                  {rows.length === 0 ? (
                    <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">Belum ada baris alokasi — klik &quot;Tambah Baris&quot; untuk memindahkan sebagian atau seluruh sisa ke akun yang benar.</div>
                  ) : (
                    <div className="space-y-3">
                      {rows.map((row, idx) => (
                        <div key={row.id} className="grid grid-cols-1 gap-3 rounded-md border p-3 sm:grid-cols-12">
                          <div className="sm:col-span-5 space-y-1.5">
                            <Label className="text-xs text-muted-foreground">
                              Akun Tujuan {idx + 1} <span className="text-destructive">*</span>
                            </Label>
                            <SearchableDropdown
                              value={row.akunPerkiraanId}
                              onValueChange={(v) => {
                                const opt = coaOptionsFmt.find((o) => o.id === v);
                                updateRow(row.id, { akunPerkiraanId: v, akunLabel: opt?.label || '' });
                              }}
                              options={coaOptionsFmt}
                              loading={coaLoading}
                              placeholder="Pilih akun tujuan"
                              searchPlaceholder="Cari kode / nama akun..."
                              error={errors.alokasi && !row.akunPerkiraanId ? errors.alokasi : undefined}
                            />
                          </div>
                          <div className="sm:col-span-3 space-y-1.5">
                            <Label className="text-xs text-muted-foreground">
                              Nilai <span className="text-destructive">*</span>
                            </Label>
                            <CurrencyInput placeholder="0" value={row.nilai} onValueChange={(v) => updateRow(row.id, { nilai: v })} className="text-right font-mono h-9 text-sm" />
                            {idx === 0 && sisa > 0 && (
                              <button type="button" className="text-[11px] text-emerald-700 hover:underline" onClick={() => updateRow(row.id, { nilai: String(sisa) })}>
                                Isi sisa ({formatRp(sisa)})
                              </button>
                            )}
                          </div>
                          <div className="sm:col-span-3 space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Keterangan</Label>
                            <Input value={row.keterangan} onChange={(e) => updateRow(row.id, { keterangan: e.target.value })} placeholder="mis. ternyata pendapatan jasa" />
                          </div>
                          <div className="sm:col-span-1 flex items-end justify-end">
                            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => removeRow(row.id)} title="Hapus baris" aria-label={`Hapus baris alokasi ${idx + 1}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-end">
                        <div className="w-full max-w-xs space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Total Alokasi</span>
                            <span className="font-mono">{formatRp(totalAlokasi)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Sisa Setelah Ini</span>
                            <span className={`font-mono font-semibold ${totalAlokasi > sisa + 0.01 ? 'text-destructive' : 'text-emerald-700'}`}>{formatRp(Math.max(0, sisa - totalAlokasi))}</span>
                          </div>
                        </div>
                      </div>
                      {errors.alokasi && <p className="text-xs text-destructive">{errors.alokasi}</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <Skeleton className="h-40 w-full" />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Tutup
          </Button>
          <Button onClick={handleSubmit} disabled={submitDisabled || (mode === 'PIHAK' && (!pihakId || selectedList.length === 0))} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <SearchCheck className="h-4 w-4 mr-1.5" />}
            {mode === 'PIHAK' ? `Identifikasi ${modePihakLabel}` : 'Identifikasi & Alokasi'}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Konfirmasi pembatalan identifikasi */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border bg-background p-5 shadow-lg">
            <h3 className="text-base font-semibold">Batalkan identifikasi {cancelTarget.noBukti}?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Jurnal pembalik akan dibuat (audit trail tetap utuh) dan sisa belum teridentifikasi dokumen akan naik kembali sebesar <strong>{formatRp(Number(cancelTarget.totalNilai) || 0)}</strong>.
              {(cancelTarget.jenis === 'PIUTANG' || cancelTarget.jenis === 'HUTANG') && (
                <>
                  {' '}
                  Alokasi invoice pada sesi ini juga dihapus sehingga <strong>outstanding invoice pulih</strong>.
                </>
              )}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={cancelSubmitting}>
                Tidak
              </Button>
              <Button onClick={handleCancelIdentifikasi} disabled={cancelSubmitting} className="bg-red-600 hover:bg-red-700 text-white">
                {cancelSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />} Ya, Batalkan
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function InfoStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-background p-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div className="mt-0.5 font-mono text-sm font-medium">{children}</div>
    </div>
  );
}

export function JenisIdentifikasiBadge({ jenis }: { jenis: string }) {
  if (jenis === 'PIUTANG') {
    return <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Piutang</Badge>;
  }
  if (jenis === 'HUTANG') {
    return <Badge className="border-rose-200 bg-rose-100 text-rose-700 hover:bg-rose-100">Hutang</Badge>;
  }
  return <Badge variant="secondary">Akun</Badge>;
}
