'use client';

/**
 * Update #02 — Dialog Identifikasi & Alokasi dokumen kas Belum Teridentifikasi.
 *
 * Dipanggil dari daftar Penerimaan/Pembayaran (baris BELUM_TERIDENTIFIKASI)
 * dan halaman "Belum Teridentifikasi". Isi:
 * - Info dokumen + akun penampung + progres teridentifikasi/sisa.
 * - Form alokasi: tanggal, catatan, baris (akun tujuan + nilai + keterangan).
 *   Submit → POST /kas-bank/{penerimaan|pembayaran}/{id}/identifikasi —
 *   jurnal reklasifikasi Dr/Kr penampung ↔ akun tujuan TANPA jurnal bank ganda.
 * - Histori sesi identifikasi + tombol batal (jurnal pembalik) per sesi.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Plus, Trash2, Info, Ban, SearchCheck } from 'lucide-react';
import { toast } from 'sonner';
import { formatRp, formatDate, todayStr } from '@/lib/pdf-utils';
import { api, ApiError } from '@/lib/api';
import type { CoaDropdownItem, KasIdentifikasiListResponse, KasIdentifikasiResponse, KasIdentifikasiCreate } from '@/types/api';

interface AlokasiRow {
  id: number;
  akunPerkiraanId: string;
  akunLabel: string;
  nilai: string;
  keterangan: string;
}

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

export function IdentifikasiDialog({ open, onOpenChange, jenisDokumen, dokumenId, noBukti, onDone }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<KasIdentifikasiListResponse | null>(null);

  const [coaOptions, setCoaOptions] = useState<CoaDropdownItem[]>([]);
  const [coaLoading, setCoaLoading] = useState(false);

  const [tanggal, setTanggal] = useState(todayStr());
  const [catatan, setCatatan] = useState('');
  const [rows, setRows] = useState<AlokasiRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<KasIdentifikasiResponse | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  // Muat COA sekali saat dialog dibuka
  useEffect(() => {
    if (!open || coaOptions.length > 0 || coaLoading) return;
    setCoaLoading(true);
    api
      .get<CoaDropdownItem[]>('/master/coa-dropdown')
      .then((res) => setCoaOptions(Array.isArray(res) ? res : []))
      .catch(() => toast.error('Gagal memuat daftar akun (COA)'))
      .finally(() => setCoaLoading(false));
  }, [open, coaOptions.length, coaLoading]);

  // Reset form saat dialog dibuka
  useEffect(() => {
    if (open) {
      setTanggal(todayStr());
      setCatatan('');
      setRows([]);
      setErrors({});
      setCancelTarget(null);
    }
  }, [open]);

  const coaOptionsFmt = useMemo(() => coaOptions.filter((c) => c.status === 'AKTIF' && c.tingkat === 'DETAIL').map((c) => ({ id: c.id, label: `${c.kode} — ${c.nama}` })), [coaOptions]);

  const sisa = data ? Number(data.sisaBelumTeridentifikasi) || 0 : 0;
  const totalAlokasi = useMemo(() => rows.reduce((s, r) => s + (parseInt(r.nilai.replace(/\D/g, ''), 10) || 0), 0), [rows]);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, { id: Date.now(), akunPerkiraanId: '', akunLabel: '', nilai: '', keterangan: '' }]);
  }, []);

  const updateRow = useCallback((rowId: number, patch: Partial<AlokasiRow>) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
  }, []);

  const removeRow = useCallback((rowId: number) => {
    setRows((prev) => prev.filter((r) => r.id !== rowId));
  }, []);

  const validate = useCallback((): boolean => {
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
    if (!validate()) return;
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
  }, [validate, tanggal, catatan, rows, jenisDokumen, dokumenId, fetchData, onDone]);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SearchCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            Identifikasi &amp; Alokasi — {noBukti}
          </DialogTitle>
          <DialogDescription>Pindahkan nilai {labelDokumen.toLowerCase()} Belum Teridentifikasi dari akun penampung ke akun yang benar — bisa bertahap, tanpa jurnal bank ganda.</DialogDescription>
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
                Akun penampung: <strong>{data.penampungAkun ? `${data.penampungAkun.kode} — ${data.penampungAkun.nama}` : '-'}</strong>. Jurnal identifikasi hanya membalik sisi penampung (Dr Penampung / Cr akun tujuan untuk penerimaan; Dr akun tujuan / Cr Penampung untuk pembayaran) — saldo Kas/Bank tetap konsisten dengan mutasi awal.
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
                      <TableHead className="whitespace-nowrap w-[110px]">Status</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.identifikasi.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-16 text-center text-muted-foreground text-sm">
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
                          <TableCell>{idn.status === 'BATAL' ? <Badge className="border-red-200 bg-red-100 text-red-700 hover:bg-red-100">Batal</Badge> : <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Selesai</Badge>}</TableCell>
                          <TableCell className="p-1">
                            {idn.status !== 'BATAL' && (
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setCancelTarget(idn)} title="Batalkan identifikasi (jurnal pembalik)" aria-label={`Batalkan identifikasi ${idn.noBukti}`}>
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

            {/* Form alokasi baru */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Alokasi Baru</Label>
                <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={submitting} className="h-8">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Tambah Baris
                </Button>
              </div>

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
          </div>
        ) : (
          <Skeleton className="h-40 w-full" />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Tutup
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || loading || !data || sisa <= 0} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <SearchCheck className="h-4 w-4 mr-1.5" />}
            Identifikasi &amp; Alokasi
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
