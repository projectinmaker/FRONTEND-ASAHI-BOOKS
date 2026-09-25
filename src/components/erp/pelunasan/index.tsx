'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { StatusPembayaranBadge } from '@/components/erp/pelunasan/status-badge';
import { HandCoins, Loader2, Search, AlertCircle, CheckCircle2, Info, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatRp, formatDate, todayStr } from '@/lib/pdf-utils';
import { api, ApiError } from '@/lib/api';
import { pelunasanApi } from '@/lib/pelunasan-api';
import type { JenisPelunasan, StatusPembayaran, InvoiceSaldoResponse, PelunasanCreate, KasBankAkunResponse, PelangganDropdown, SupplierDropdown } from '@/types/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 100;

// ─── Shared UI ────────────────────────────────────────────────────────────────

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-destructive">
      <CardContent className="p-4">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-destructive font-medium">{message}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
              Coba Lagi
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-5 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function Pagination({ skip, total, onNext, onPrev }: { skip: number; total: number; onNext: () => void; onPrev: () => void }) {
  const currentPage = Math.floor(skip / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasNext = skip + PAGE_SIZE < total;
  const hasPrev = skip > 0;
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3">
      <p className="text-xs text-muted-foreground">
        Menampilkan {total === 0 ? 0 : skip + 1}–{Math.min(skip + PAGE_SIZE, total)} dari {total} invoice
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={!hasPrev} onClick={onPrev} className="h-8">
          <span className="mr-1">‹</span> Sebelumnya
        </Button>
        <span className="text-xs text-muted-foreground">
          Hal. {currentPage} / {totalPages}
        </span>
        <Button variant="outline" size="sm" disabled={!hasNext} onClick={onNext} className="h-8">
          Berikutnya <span className="ml-1">›</span>
        </Button>
      </div>
    </div>
  );
}

// ─── Helper: parse decimal string from backend ────────────────────────────────

function parseNum(v: string | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

// Format integer-only input (strip non-digits), like Rupiah entry in other forms.
function sanitizeRupiahInput(v: string): string {
  const digits = v.replace(/\D/g, '');
  if (!digits) return '';
  // Format with thousand separators (id-ID uses '.')
  return Number(digits).toLocaleString('id-ID');
}

function parseRupiahInput(v: string): string {
  // Returns the raw decimal string ("100000.00") for backend
  const digits = v.replace(/\D/g, '');
  if (!digits) return '0';
  return digits + '.00';
}

// ─── Pelunasan Tab ────────────────────────────────────────────────────────────

function PelunasanTab({ jenis, refreshKey }: { jenis: JenisPelunasan; refreshKey?: number }) {
  const isPiutang = jenis === 'piutang';
  const pihakLabel = isPiutang ? 'Pelanggan' : 'Supplier';
  const docLabel = isPiutang ? 'Invoice Penjualan' : 'Invoice Pembelian';
  const flowLabel = isPiutang ? 'Penerimaan Pelunasan' : 'Pembayaran Pelunasan';

  // ── Pihak dropdown options (pelanggan / supplier) ──
  const [pihakOptions, setPihakOptions] = useState<(PelangganDropdown | SupplierDropdown)[]>([]);
  const [pihakLoading, setPihakLoading] = useState(true);

  // ── Kas/Bank dropdown options ──
  const [kasBankOptions, setKasBankOptions] = useState<KasBankAkunResponse[]>([]);
  const [kasBankLoading, setKasBankLoading] = useState(true);

  // ── Filter state ──
  const [pihakFilter, setPihakFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusPembayaran | ''>('');
  const [asOf, setAsOf] = useState('');

  // ── Tagihan data ──
  const [data, setData] = useState<InvoiceSaldoResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Selected invoices + allocation values ──
  interface AllocationRow {
    invoice: InvoiceSaldoResponse;
    nilaiDisplay: string; // formatted display
  }
  const [selected, setSelected] = useState<Record<string, AllocationRow>>({});

  // ── Payment form state ──
  const [tanggal, setTanggal] = useState(todayStr());
  const [kasBankId, setKasBankId] = useState('');
  const [noNukti, setNoNukti] = useState('');
  const [catatan, setCatatan] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Fetch pihak + kas-bank dropdowns ──
  const fetchDropdowns = useCallback(async () => {
    setPihakLoading(true);
    setKasBankLoading(true);
    try {
      const endpoint = isPiutang ? '/master/pelanggan-dropdown' : '/master/supplier-dropdown';
      const [pihakRes, kbRes] = await Promise.all([api.get<(PelangganDropdown | SupplierDropdown)[]>(endpoint), api.get<KasBankAkunResponse[]>('/master/kas-bank-dropdown')]);
      setPihakOptions(Array.isArray(pihakRes) ? pihakRes : []);
      setKasBankOptions(Array.isArray(kbRes) ? kbRes : []);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : `Gagal memuat data referensi (${pihakLabel} / kas-bank)`);
    } finally {
      setPihakLoading(false);
      setKasBankLoading(false);
    }
  }, [isPiutang, pihakLabel]);

  useEffect(() => {
    fetchDropdowns();
  }, [fetchDropdowns]);

  // ── Fetch tagihan list ──
  const fetchTagihan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await pelunasanApi.getTagihan(jenis, {
        pihakId: pihakFilter || undefined,
        statusPembayaran: statusFilter || undefined,
        asOf: asOf || undefined,
        skip,
        limit: PAGE_SIZE
      });
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Gagal memuat daftar tagihan');
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [jenis, pihakFilter, statusFilter, asOf, skip]);

  useEffect(() => {
    void fetchTagihan();
  }, [fetchTagihan, refreshKey]);

  // ── Selection handlers ──
  const toggleSelect = useCallback((inv: InvoiceSaldoResponse) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[inv.invoiceId]) {
        delete next[inv.invoiceId];
      } else {
        const sisa = parseNum(inv.sisaTagihan);
        const initial = sisa > 0 ? sisa : 0;
        next[inv.invoiceId] = {
          invoice: inv,
          nilaiDisplay: initial > 0 ? sanitizeRupiahInput(String(initial)) : ''
        };
      }
      return next;
    });
  }, []);

  const updateAllocation = useCallback((invoiceId: string, val: string) => {
    setSelected((prev) => {
      const row = prev[invoiceId];
      if (!row) return prev;
      return { ...prev, [invoiceId]: { ...row, nilaiDisplay: sanitizeRupiahInput(val) } };
    });
  }, []);

  const removeAllocation = useCallback((invoiceId: string) => {
    setSelected((prev) => {
      const next = { ...prev };
      delete next[invoiceId];
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelected({});
    setErrors({});
  }, []);

  // ── Total allocation ──
  const selectedList = useMemo(() => Object.values(selected), [selected]);
  const totalAllocation = useMemo(() => selectedList.reduce((s, r) => s + parseNum(parseRupiahInput(r.nilaiDisplay)), 0), [selectedList]);

  // ── Pihak pelunasan diturunkan dari invoice terpilih ──
  // Backend mensyaratkan satu pihak_id per draft. Saat browsing "Semua {pihak}",
  // pihakId diambil dari invoice yang dicentang (semua harus satu pihak) —
  // sehingga pengguna tidak perlu memilih filter (yang justru mengosongkan pilihan).
  const selectedPihakId = useMemo(() => {
    if (selectedList.length === 0) return '';
    const first = selectedList[0].invoice.pihakId;
    return selectedList.every((r) => r.invoice.pihakId === first) ? first : '';
  }, [selectedList]);

  // ── Validation ──
  const validate = useCallback((): boolean => {
    const e: Record<string, string> = {};
    if (selectedList.length > 0 && !selectedPihakId) e.pihak = `Semua invoice yang dipilih harus dari satu ${pihakLabel.toLowerCase()} yang sama`;
    if (!tanggal) e.tanggal = 'Tanggal wajib diisi';
    if (!kasBankId) e.kasBank = 'Kas/Bank wajib dipilih';
    if (!noNukti.trim()) e.noNukti = 'No. referensi wajib diisi';
    if (selectedList.length === 0) e.alokasi = 'Pilih minimal 1 invoice untuk dialokasikan';
    let hasInvalid = false;
    let hasOver = false;
    for (const row of selectedList) {
      const n = parseNum(parseRupiahInput(row.nilaiDisplay));
      if (n <= 0) {
        hasInvalid = true;
        break;
      }
      const sisa = parseNum(row.invoice.sisaTagihan);
      if (n > sisa + 0.01) {
        hasOver = true;
        break;
      }
    }
    if (hasInvalid) e.alokasi = 'Semua nilai pembayaran harus lebih dari 0';
    if (!e.alokasi && hasOver) e.alokasi = 'Nilai pembayaran tidak boleh melebihi sisa tagihan';
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [tanggal, kasBankId, noNukti, selectedList, selectedPihakId, pihakLabel]);

  // ── Submit draft ──
  const handleSubmit = useCallback(async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload: PelunasanCreate = {
        pihakId: selectedPihakId,
        tanggal,
        kasBankId,
        noNukti: noNukti.trim(),
        catatan: catatan.trim() || undefined,
        alokasi: selectedList.map((r) => ({
          invoiceId: r.invoice.invoiceId,
          nilai: parseRupiahInput(r.nilaiDisplay)
        }))
      };
      const res = await pelunasanApi.create(jenis, payload);
      toast.success(`Draft pembayaran ${res.noBukti} dibuat`, {
        description: 'Lakukan workflow submit → approve → post untuk menyelesaikan.',
        duration: 8000
      });
      // Clear form + selection + refresh tagihan
      clearSelection();
      setNoNukti('');
      setCatatan('');
      setTanggal(todayStr());
      setKasBankId('');
      void fetchTagihan();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal membuat draft pembayaran');
    } finally {
      setSubmitting(false);
    }
  }, [validate, selectedPihakId, tanggal, kasBankId, noNukti, catatan, selectedList, jenis, clearSelection, fetchTagihan]);

  // ── Selection summary ──
  const totalSisaSelected = useMemo(() => selectedList.reduce((s, r) => s + parseNum(r.invoice.sisaTagihan), 0), [selectedList]);

  const selectedPihakNama = useMemo(() => {
    if (!selectedPihakId) return null;
    const opt = pihakOptions.find((p) => p.id === selectedPihakId);
    return opt?.nama || null;
  }, [selectedPihakId, pihakOptions]);

  const kasBankOptionsFmt = useMemo(
    () =>
      kasBankOptions.map((k) => ({
        id: k.id,
        label: k.akunPerkiraan?.nama || k.nama,
        subtitle: `${k.akunPerkiraan?.kode || k.kode} · ${k.jenis}`
      })),
    [kasBankOptions]
  );

  const pihakOptionsFmt = useMemo(
    () =>
      pihakOptions.map((p) => ({
        id: p.id,
        label: p.nama,
        subtitle: p.kode
      })),
    [pihakOptions]
  );

  return (
    <div className="space-y-6">
      {/* Filter card */}
      <Card>
        <CardHeader className="pb-3">
          <div>
            <CardTitle className="text-base">Daftar Tagihan {isPiutang ? 'Piutang' : 'Hutang'}</CardTitle>
            <CardDescription>Pilih {pihakLabel.toLowerCase()} dan filter tagihan untuk dilunasi</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="w-full sm:w-64">
              <Label className="text-xs text-muted-foreground">{pihakLabel}</Label>
              <div className="mt-1">
                <SearchableDropdown
                  value={pihakFilter}
                  onValueChange={(v) => {
                    setPihakFilter(v);
                    setSkip(0);
                    setSelected({});
                  }}
                  options={pihakOptionsFmt}
                  loading={pihakLoading}
                  placeholder={`Pilih ${pihakLabel.toLowerCase()}`}
                  searchPlaceholder={`Cari ${pihakLabel.toLowerCase()}...`}
                  allOption={{ id: '', label: `Semua ${pihakLabel}` }}
                />
              </div>
            </div>
            <div className="w-full sm:w-48">
              <Label className="text-xs text-muted-foreground">Status Pembayaran</Label>
              <Select
                value={statusFilter || 'ALL'}
                onValueChange={(v) => {
                  setStatusFilter(v === 'ALL' ? '' : (v as StatusPembayaran));
                  setSkip(0);
                }}>
                <SelectTrigger className="mt-1 h-9 text-sm">
                  <SelectValue placeholder="Semua" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua</SelectItem>
                  <SelectItem value="BELUM_DIBAYAR">Belum Dibayar</SelectItem>
                  <SelectItem value="PARSIAL">Parsial</SelectItem>
                  <SelectItem value="LUNAS">Lunas</SelectItem>
                  <SelectItem value="LEBIH_BAYAR">Lebih Bayar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-44">
              <Label className="text-xs text-muted-foreground">Per Tanggal (asOf)</Label>
              <Input
                type="date"
                value={asOf}
                onChange={(e) => {
                  setAsOf(e.target.value);
                  setSkip(0);
                }}
                className="mt-1 h-9 text-sm"
              />
            </div>
            <div className="sm:ml-auto">
              <Button variant="outline" size="sm" onClick={() => void fetchTagihan()} disabled={loading} className="h-9">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Search className="h-4 w-4 mr-1.5" />}
                Muat Ulang
              </Button>
            </div>
          </div>

          {error && !loading && <ErrorCard message={error} onRetry={fetchTagihan} />}

          {!error && (
            <div className="max-h-96 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 sticky top-0">
                    <TableHead className="w-12 text-center">Pilih</TableHead>
                    <TableHead className="w-[140px]">No Invoice</TableHead>
                    <TableHead className="w-[100px]">Tanggal</TableHead>
                    <TableHead className="w-[110px]">Jatuh Tempo</TableHead>
                    <TableHead className="text-right w-[140px]">Nilai Tagihan</TableHead>
                    <TableHead className="text-right w-[130px]">Total Bayar</TableHead>
                    <TableHead className="text-right w-[130px]">Sisa Tagihan</TableHead>
                    <TableHead className="w-[120px] text-center">Status Bayar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <SkeletonRows cols={8} />
                  ) : data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-0 p-0">
                        <EmptyState icon={HandCoins} title={`Tidak ada tagihan ${isPiutang ? 'piutang' : 'hutang'}`} description={pihakFilter ? `${pihakLabel} ini tidak memiliki tagihan dengan filter saat ini.` : `Pilih ${pihakLabel.toLowerCase()} untuk menampilkan tagihan, atau klik "Semua ${pihakLabel}".`} />
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((inv) => {
                      const isSel = !!selected[inv.invoiceId];
                      const sisa = parseNum(inv.sisaTagihan);
                      const canPay = sisa > 0;
                      return (
                        <TableRow key={inv.invoiceId} className={isSel ? 'bg-muted/40' : ''}>
                          <TableCell className="text-center">
                            <Checkbox checked={isSel} disabled={!canPay} onCheckedChange={() => toggleSelect(inv)} aria-label={`Pilih invoice ${inv.noDokumen}`} />
                          </TableCell>
                          <TableCell className="font-mono text-xs font-medium">{inv.noDokumen}</TableCell>
                          <TableCell className="text-xs">{formatDate(inv.tanggal)}</TableCell>
                          <TableCell className="text-xs">{inv.jatuhTempo ? formatDate(inv.jatuhTempo) : '-'}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatRp(parseNum(inv.nilaiTagihan))}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatRp(parseNum(inv.totalBayar))}</TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold">{formatRp(sisa)}</TableCell>
                          <TableCell className="text-center">
                            <StatusPembayaranBadge status={inv.statusPembayaran} />
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {!error && !loading && data.length > 0 && <Pagination skip={skip} total={total} onPrev={() => setSkip((p) => Math.max(0, p - PAGE_SIZE))} onNext={() => setSkip((p) => p + PAGE_SIZE)} />}
        </CardContent>
      </Card>

      {/* Payment allocation form — visible only when invoices selected */}
      {selectedList.length > 0 && (
        <Card className="border-emerald-200">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <HandCoins className="h-4 w-4 text-emerald-600" />
                  {flowLabel}
                </CardTitle>
                <CardDescription>
                  {selectedPihakNama ? (
                    <>
                      {pihakLabel}: <span className="font-medium">{selectedPihakNama}</span> ·{' '}
                    </>
                  ) : null}
                  {selectedList.length} invoice dipilih · Total sisa: {formatRp(totalSisaSelected)}
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={clearSelection} className="h-8 text-xs">
                <X className="h-3.5 w-3.5 mr-1" /> Bersihkan Pilihan
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Info banner */}
            <div className="flex items-start gap-2 rounded-md bg-emerald-50 border border-emerald-200 p-3">
              <Info className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-700">
                Draft pembayaran akan dibuat dengan status <strong>DRAFT</strong>. Untuk menyelesaikan pelunasan, lakukan workflow: <strong>Submit → Approve → Post</strong> melalui kolom Workflow pada daftar dokumen atau modul <strong>Antrean Persetujuan</strong>.
              </p>
            </div>

            {/* Form fields */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  Tanggal <span className="text-destructive">*</span>
                </Label>
                <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={errors.tanggal ? 'border-destructive' : ''} />
                {errors.tanggal && <p className="text-xs text-destructive">{errors.tanggal}</p>}
              </div>
              <div className="space-y-1.5 sm:col-span-1">
                <Label className="text-xs font-medium">
                  Kas/Bank <span className="text-destructive">*</span>
                </Label>
                <SearchableDropdown value={kasBankId} onValueChange={setKasBankId} options={kasBankOptionsFmt} loading={kasBankLoading} placeholder="Pilih kas/bank" searchPlaceholder="Cari kas/bank..." error={errors.kasBank} />
                {errors.kasBank && <p className="text-xs text-destructive">{errors.kasBank}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  No. Referensi <span className="text-destructive">*</span>
                </Label>
                <Input value={noNukti} onChange={(e) => setNoNukti(e.target.value)} placeholder="No. referensi bank" className={errors.noNukti ? 'border-destructive' : ''} />
                {errors.noNukti && <p className="text-xs text-destructive">{errors.noNukti}</p>}
              </div>
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                <Label className="text-xs font-medium">Catatan</Label>
                <Textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Catatan tambahan (opsional)" rows={1} />
              </div>
            </div>

            {errors.pihak && (
              <div className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" /> {errors.pihak}
              </div>
            )}

            <Separator />

            {/* Allocation table */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Rincian Alokasi Pembayaran</Label>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-12 text-center">No</TableHead>
                      <TableHead>No Invoice</TableHead>
                      <TableHead className="text-right w-[140px]">Sisa Tagihan</TableHead>
                      <TableHead className="text-right w-[180px]">Nilai Pembayaran</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedList.map((row, idx) => {
                      const sisa = parseNum(row.invoice.sisaTagihan);
                      const n = parseNum(parseRupiahInput(row.nilaiDisplay));
                      const over = n > sisa + 0.01;
                      return (
                        <TableRow key={row.invoice.invoiceId}>
                          <TableCell className="text-center text-xs text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="font-mono text-xs font-medium">{row.invoice.noDokumen}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatRp(sisa)}</TableCell>
                          <TableCell className="text-right">
                            <Input type="text" inputMode="numeric" placeholder="0" value={row.nilaiDisplay} onChange={(e) => updateAllocation(row.invoice.invoiceId, e.target.value)} className={`text-right font-mono h-8 text-sm ${over ? 'border-destructive' : ''}`} />
                          </TableCell>
                          <TableCell className="p-1">
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => removeAllocation(row.invoice.invoiceId)} title="Hapus dari alokasi">
                              <X className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {errors.alokasi && <p className="text-xs text-destructive">{errors.alokasi}</p>}
            </div>

            {/* Total */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 pt-1">
              <div className="text-sm">
                <span className="text-muted-foreground">Total Pembayaran: </span>
                <span className="font-mono font-bold text-base">{formatRp(totalAllocation)}</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={clearSelection} disabled={submitting}>
                Batal
              </Button>
              <Button onClick={handleSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
                Simpan Draft
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success helper card — only shown when no invoices selected and no draft in progress */}
      {selectedList.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shrink-0">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium">Belum ada invoice dipilih</p>
                <p className="text-xs text-muted-foreground mt-1">Centang invoice pada tabel di atas untuk mulai membuat alokasi pembayaran. Setelah draft dibuat, lakukan workflow submit → approve → post untuk menyelesaikan pelunasan.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Standalone Views (embed di modul Penjualan / Pembelian) ─────────────────
// Pelunasan Piutang & Hutang dipindahkan dari modul Pelunasan mandiri:
//   - Pelunasan Piutang → modul Penjualan (subPage "pelunasan-piutang")
//   - Pelunasan Hutang  → modul Pembelian  (subPage "pelunasan-hutang")

export function PelunasanPiutangView({ refreshKey }: { refreshKey?: number }) {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Pelunasan Piutang</h1>
        <p className="text-muted-foreground mt-1 text-sm">Alokasikan penerimaan pembayaran pelanggan ke invoice penjualan yang belum lunas</p>
      </div>
      <PelunasanTab jenis="piutang" refreshKey={refreshKey} />
    </div>
  );
}

export function PelunasanHutangView({ refreshKey }: { refreshKey?: number }) {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Pelunasan Hutang</h1>
        <p className="text-muted-foreground mt-1 text-sm">Alokasikan pembayaran ke supplier untuk invoice pembelian yang belum lunas</p>
      </div>
      <PelunasanTab jenis="hutang" refreshKey={refreshKey} />
    </div>
  );
}
