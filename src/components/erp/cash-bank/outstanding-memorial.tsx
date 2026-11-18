'use client';

// ═══════════════════════════════════════════════════════════════════════════
// === Update #072 — Outstanding Memorial (uraian hutang & piutang) ===
//
// Pengganti tab "Voucher Memorial": daftar invoice PIUTANG & HUTANG yang
// masih outstanding (sisa > 0) dengan kolom (permintaan user):
//   No Dokumen | Tanggal | Nama Pelanggan/Supplier | Inv | Nominal | Status | Aksi
// (kolom "Persetujuan" dihapus dari modul ini — status dokumen tetap tampil
// di kolom Status; riwayat persetujuan tetap bisa dibuka dari daftar
// Penerimaan/Pembayaran modul Kas & Bank.)
//
// Aksi per baris (berlaku untuk PIUTANG dan HUTANG — permintaan user):
//   • Penerimaan Penuh / Pembayaran Penuh  → POST /pelunasan/{jenis}
//     (nominal terkunci = sisa; Voucher Penerimaan/Pembayaran Kas-Bank)
//   • Penerimaan Sebagian / Pembayaran Sebagian → idem, nominal diedit (≤ sisa)
//   • Gagal Tagih → POST /kas-bank/voucher-memorial (non-kas):
//     PIUTANG: Dr Beban Penghapusan Piutang, Cr Piutang Usaha;
//     HUTANG : Dr Hutang Usaha, Cr Pendapatan Penghapusan Hutang.
//
// Finalisasi mengikuti konfigurasi persetujuan (Update #071): jenis dokumen
// non-aktif (default) → langsung final + posting jurnal; aktif → menunggu
// approver di daftar Penerimaan/Pembayaran/Voucher Memorial terkait.
//
// === Update #072 — catatan pra-apply (permintaan user): filter tampilan
// Hutang/Piutang harus tersedia & menonjol. Diubah dari dropdown menjadi
// segmented control di atas daftar (Semua | Piutang | Hutang + jumlah
// baris). Filter jenis kini diaplikasikan di sisi klien sehingga:
//   (1) perpindahan tampilan instan tanpa reload;
//   (2) kartu Total Piutang/Hutang selalu benar untuk KEDUA sisi
//       (sebelumnya kartu sisi lawan ikut Rp0 saat jenis dikirim ke server);
//   (3) jumlah baris per tampilan tersedia sebagai badge pada tab.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { EmptyState } from '@/components/ui/empty-state';
import { useTabStore } from '@/store/tab-store';
import { useAccessStore } from '@/store/access-store';
import { toast } from 'sonner';
import { formatRp, formatDate, todayStr } from '@/lib/pdf-utils';
import { api, ApiError } from '@/lib/api';
import { pelunasanApi } from '@/lib/pelunasan-api';
import { voucherMemorialApi } from '@/lib/voucher-memorial-api';
import { CircleCheck, Split, BookX, HandCoins, Loader2, MoreHorizontal, RefreshCw, Search, TrendingUp, TrendingDown, AlertCircle, Info } from 'lucide-react';
import type { KasBankAkunResponse, OutstandingMemorialRowResponse, OutstandingMemorialListResponse } from '@/types/api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseNum(v: string | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

/** Format input Rupiah (digit + pemisah ribuan). */
function sanitizeRupiahInput(v: string): string {
  const digits = v.replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('id-ID');
}

function parseRupiahInput(v: string): string {
  const digits = v.replace(/\D/g, '');
  if (!digits) return '0';
  return digits + '.00';
}

const STATUS_LABEL: Record<string, string> = {
  BELUM_DIBAYAR: 'Belum Dibayar',
  PARSIAL: 'Parsial',
  LUNAS: 'Lunas',
  LEBIH_BAYAR: 'Lebih Bayar'
};

function StatusOutstandingBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    BELUM_DIBAYAR: 'border-red-200 bg-red-100 text-red-700 hover:bg-red-100',
    PARSIAL: 'border-amber-200 bg-amber-100 text-amber-700 hover:bg-amber-100',
    LUNAS: 'border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
    LEBIH_BAYAR: 'border-violet-200 bg-violet-100 text-violet-700 hover:bg-violet-100'
  };
  return <Badge className={map[status] || ''}>{STATUS_LABEL[status] || status}</Badge>;
}

// ── Tab tampilan hutang/piutang (catatan pra-apply #072) ──
const JENIS_TABS = [
  { value: 'ALL', label: 'Semua', icon: HandCoins, hint: 'Piutang + Hutang' },
  { value: 'PIUTANG', label: 'Piutang', icon: TrendingUp, hint: 'Pelanggan' },
  { value: 'HUTANG', label: 'Hutang', icon: TrendingDown, hint: 'Supplier' }
] as const;

// ─── Jenis aksi ──────────────────────────────────────────────────────────────

type AksiMode = 'penuh' | 'sebagian' | 'gagal';

interface AksiDialogState {
  row: OutstandingMemorialRowResponse;
  mode: AksiMode;
}

// ─── Komponen utama ──────────────────────────────────────────────────────────

interface OutstandingMemorialTabProps {
  refreshKey?: number;
  /** Buka tampilan daftar dokumen memorial (toggle dipegang section induk). */
  onOpenDokumen?: () => void;
}

export default function OutstandingMemorialTab({ refreshKey, onOpenDokumen }: OutstandingMemorialTabProps) {
  const refreshListTab = useTabStore((s) => s.refreshListTab);
  const approvalEnabledPenerimaan = useAccessStore((s) => s.isApprovalEnabled('penerimaan_kas'));
  const approvalEnabledPembayaran = useAccessStore((s) => s.isApprovalEnabled('pembayaran_kas'));
  const approvalEnabledVoucher = useAccessStore((s) => s.isApprovalEnabled('voucher_memorial'));

  // ── Data utama ──
  const [data, setData] = useState<OutstandingMemorialRowResponse[]>([]);
  const [totalPiutang, setTotalPiutang] = useState(0);
  const [totalHutang, setTotalHutang] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Filter ──
  const [jenisFilter, setJenisFilter] = useState<'ALL' | 'PIUTANG' | 'HUTANG'>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('OUTSTANDING');
  const [search, setSearch] = useState('');

  // ── Dropdown kas/bank (untuk form penerimaan/pembayaran) ──
  const [kasBankOptions, setKasBankOptions] = useState<KasBankAkunResponse[]>([]);

  // ── Dialog aksi ──
  const [dialog, setDialog] = useState<AksiDialogState | null>(null);
  const [form, setForm] = useState({ tanggal: '', kasBankId: '', noBukti: '', nominal: '', catatan: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // (catatan pra-apply #072) param jenis TIDAK lagi dikirim ke server —
      // tab Hutang/Piutang memfilter di sisi klien agar perpindahan instan
      // dan total kedua sisi selalu dihitung untuk kartu ringkasan.
      const params = new URLSearchParams();
      params.set('limit', '200');
      if (statusFilter === 'OUTSTANDING' || statusFilter === 'ALL_OUTSTANDING') {
        // default backend: hanya sisa > 0
      } else {
        params.set('statusPembayaran', statusFilter);
      }
      const res = await api.get<OutstandingMemorialListResponse>(`/kas-bank/outstanding-memorial?${params.toString()}`);
      setData(res.data ?? []);
      setTotalPiutang(parseNum(res.totalPiutang));
      setTotalHutang(parseNum(res.totalHutang));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Gagal memuat data Outstanding Memorial');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void fetchData();
  }, [fetchData, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<KasBankAkunResponse[]>('/master/kas-bank-dropdown')
      .then((res) => {
        if (!cancelled) setKasBankOptions(res);
      })
      .catch(() => {
        if (!cancelled) setKasBankOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Filter sisi klien: tab jenis (catatan pra-apply #072) + pencarian ──
  const filtered = useMemo(() => {
    let rows = data;
    if (jenisFilter === 'PIUTANG') rows = rows.filter((r) => r.jenis === 'PIUTANG');
    else if (jenisFilter === 'HUTANG') rows = rows.filter((r) => r.jenis === 'HUTANG');
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.noDokumen.toLowerCase().includes(q) || r.pihakNama.toLowerCase().includes(q) || (r.inv || '').toLowerCase().includes(q));
  }, [data, search, jenisFilter]);

  // ── Jumlah baris per tampilan (badge pada tab — catatan pra-apply #072) ──
  const counts = useMemo(
    () => ({
      ALL: data.length,
      PIUTANG: data.filter((r) => r.jenis === 'PIUTANG').length,
      HUTANG: data.filter((r) => r.jenis === 'HUTANG').length
    }),
    [data]
  );

  // ── Aksi ──
  const openAksi = useCallback((row: OutstandingMemorialRowResponse, mode: AksiMode) => {
    const sisa = parseNum(row.nominal);
    setForm({
      tanggal: todayStr(),
      kasBankId: '',
      noBukti: '',
      nominal: sisa > 0 ? sanitizeRupiahInput(String(sisa)) : '',
      catatan: ''
    });
    setFormErrors({});
    setDialog({ row, mode });
  }, []);

  const closeAksi = useCallback(() => {
    setDialog(null);
    setFormErrors({});
  }, []);

  const submitAksi = useCallback(async () => {
    if (!dialog) return;
    const { row, mode } = dialog;
    const isGagal = mode === 'gagal';
    const errors: Record<string, string> = {};
    if (!form.tanggal) errors.tanggal = 'Tanggal wajib diisi';
    if (!isGagal && !form.kasBankId) errors.kasBankId = 'Kas/Bank wajib dipilih';
    if (!isGagal && !form.noBukti.trim()) errors.noBukti = 'No. bukti wajib diisi';
    const nominal = parseNum(parseRupiahInput(form.nominal));
    const sisa = parseNum(row.nominal);
    if (nominal <= 0) errors.nominal = 'Nominal harus lebih dari 0';
    if (nominal > sisa + 0.005) errors.nominal = `Nominal melebihi sisa (${formatRp(sisa)})`;
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      if (isGagal) {
        // Gagal Tagih → Voucher Memorial (non-kas) — piutang & hutang.
        await voucherMemorialApi.create({
          jenis: row.jenis,
          pelangganId: row.jenis === 'PIUTANG' ? row.pihakId : null,
          supplierId: row.jenis === 'HUTANG' ? row.pihakId : null,
          tanggal: `${form.tanggal}T00:00:00Z`,
          catatan: form.catatan.trim() || null,
          alokasi: [{ invoiceId: row.invoiceId, nilai: parseRupiahInput(form.nominal) }]
        });
        toast.success('Gagal Tagih dicatat', {
          description: row.jenis === 'PIUTANG' ? (approvalEnabledVoucher ? 'Voucher Memorial menunggu persetujuan — setujui pada daftar Dokumen Memorial.' : 'Sisa piutang dihapusbukukan (Dr Beban Penghapusan Piutang, Cr Piutang Usaha).') : approvalEnabledVoucher ? 'Voucher Memorial menunggu persetujuan — setujui pada daftar Dokumen Memorial.' : 'Sisa hutang dihapusbukukan (Dr Hutang Usaha, Cr Pendapatan Penghapusan Hutang).',
          duration: 8000
        });
        refreshListTab('cash-bank', 'voucher-memorial');
      } else {
        // Penerimaan / Pembayaran (Penuh | Sebagian) → settlement kas/bank.
        const jenis = row.jenis === 'PIUTANG' ? ('piutang' as const) : ('hutang' as const);
        await pelunasanApi.create(jenis, {
          pihakId: row.pihakId,
          tanggal: `${form.tanggal}T00:00:00Z`,
          kasBankId: form.kasBankId,
          noNukti: form.noBukti.trim(),
          catatan: form.catatan.trim() || undefined,
          alokasi: [{ invoiceId: row.invoiceId, nilai: parseRupiahInput(form.nominal), diskon: '0.00', pph23: '0.00' }]
        });
        const label = row.jenis === 'PIUTANG' ? 'Penerimaan' : 'Pembayaran';
        const approvalOn = row.jenis === 'PIUTANG' ? approvalEnabledPenerimaan : approvalEnabledPembayaran;
        toast.success(`${label} ${mode === 'penuh' ? 'Penuh' : 'Sebagian'} dicatat`, {
          description: approvalOn ? `Dokumen ${label.toLowerCase()} menunggu persetujuan — setujui lewat kolom Persetujuan pada daftar ${label} modul Kas & Bank.` : `Jurnal kas/bank langsung diposting otomatis — sisa ${row.jenis === 'PIUTANG' ? 'piutang' : 'hutang'} berkurang ${formatRp(nominal)}.`,
          duration: 8000
        });
        refreshListTab('cash-bank', row.jenis === 'PIUTANG' ? 'penerimaan' : 'pembayaran');
      }
      closeAksi();
      void fetchData();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal menyimpan dokumen';
      setFormErrors((prev) => ({ ...prev, submit: msg }));
    } finally {
      setSubmitting(false);
    }
  }, [dialog, form, approvalEnabledPenerimaan, approvalEnabledPembayaran, approvalEnabledVoucher, closeAksi, fetchData, refreshListTab]);

  // ── Render ──
  const isPiutangRow = (r: OutstandingMemorialRowResponse) => r.jenis === 'PIUTANG';

  return (
    <div className="space-y-4">
      {/* Ringkasan */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100">
              <TrendingUp className="h-6 w-6 text-emerald-600" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-muted-foreground">Total Piutang Outstanding</p>
              {loading ? <Skeleton className="mt-1 h-6 w-32" /> : <p className="mt-0.5 truncate text-xl font-bold tracking-tight">{formatRp(totalPiutang)}</p>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rose-100">
              <TrendingDown className="h-6 w-6 text-rose-600" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-muted-foreground">Total Hutang Outstanding</p>
              {loading ? <Skeleton className="mt-1 h-6 w-32" /> : <p className="mt-0.5 truncate text-xl font-bold tracking-tight">{formatRp(totalHutang)}</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <HandCoins className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                Uraian Hutang &amp; Piutang
              </CardTitle>
              <CardDescription>Invoice penjualan (piutang) dan invoice pembelian (hutang) yang masih memiliki sisa — pilih aksi pada kolom Aksi: Penerimaan/Pembayaran Penuh, Sebagian, atau Gagal Tagih (berlaku untuk keduanya).</CardDescription>
            </div>
            {onOpenDokumen && (
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={onOpenDokumen}>
                <BookX className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Dokumen Memorial
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ── Filter tampilan Hutang/Piutang — segmented control (catatan
              pra-apply #072: diminta user, menggantikan dropdown jenis). ── */}
          <div role="group" aria-label="Filter tampilan hutang/piutang" className="flex w-full gap-1 rounded-lg bg-muted p-1">
            {JENIS_TABS.map((t) => {
              const active = jenisFilter === t.value;
              const count = counts[t.value];
              return (
                <button key={t.value} type="button" aria-pressed={active} onClick={() => setJenisFilter(t.value)} title={`Tampilkan ${t.label} (${t.hint})`} className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-md px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? (t.value === 'PIUTANG' ? 'bg-emerald-100 text-emerald-800 shadow-sm' : t.value === 'HUTANG' ? 'bg-rose-100 text-rose-800 shadow-sm' : 'bg-background text-foreground shadow-sm') : 'text-muted-foreground hover:bg-background/70 hover:text-foreground'}`}>
                  <span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold">
                    <t.icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {t.label}
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums ${active ? 'bg-black/10' : 'bg-black/5'}`}>{count}</span>
                  </span>
                  <span className="truncate text-[10px] font-normal leading-none opacity-70">{t.hint}</span>
                </button>
              );
            })}
          </div>

          {/* Filter bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input placeholder="Cari no dokumen / pelanggan / supplier / inv…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" aria-label="Cari outstanding" />
            </div>
            <div className="w-full sm:w-44">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger aria-label="Filter status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OUTSTANDING">Belum Lunas (Sisa &gt; 0)</SelectItem>
                  <SelectItem value="BELUM_DIBAYAR">Belum Dibayar</SelectItem>
                  <SelectItem value="PARSIAL">Parsial</SelectItem>
                  <SelectItem value="LUNAS">Lunas</SelectItem>
                  <SelectItem value="LEBIH_BAYAR">Lebih Bayar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void fetchData()} disabled={loading} className="h-9">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
              Muat Ulang
            </Button>
          </div>

          {/* Error */}
          {error && !loading && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" className="ml-auto" onClick={() => void fetchData()}>
                Coba Lagi
              </Button>
            </div>
          )}

          {/* Tabel uraian */}
          {!error && (
            <div className="max-h-[60vh] overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="sticky top-0 bg-muted/50">
                    <TableHead className="w-[150px]">No Dokumen</TableHead>
                    <TableHead className="w-[100px]">Tanggal</TableHead>
                    <TableHead>Nama {jenisFilter === 'PIUTANG' ? 'Pelanggan' : jenisFilter === 'HUTANG' ? 'Supplier' : 'Pelanggan/Supplier'}</TableHead>
                    <TableHead className="w-[130px]">Inv</TableHead>
                    <TableHead className="w-[140px] text-right">Nominal</TableHead>
                    <TableHead className="w-[110px] text-center">Status</TableHead>
                    <TableHead className="w-20 text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-5 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24">
                        <EmptyState icon={HandCoins} title="Tidak ada outstanding" description={search ? 'Tidak ada baris yang cocok dengan pencarian.' : jenisFilter === 'PIUTANG' ? 'Belum ada piutang (invoice penjualan) yang memiliki sisa tagihan.' : jenisFilter === 'HUTANG' ? 'Belum ada hutang (invoice pembelian) yang memiliki sisa.' : 'Belum ada invoice piutang/hutang yang memiliki sisa tagihan.'} />
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((row) => {
                      const piutang = isPiutangRow(row);
                      const sisa = parseNum(row.nominal);
                      const bisaAksi = sisa > 0;
                      return (
                        <TableRow key={`${row.jenis}-${row.invoiceId}`} className={piutang ? '' : 'bg-rose-50/30'}>
                          <TableCell className="font-mono text-xs font-medium">
                            <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${piutang ? 'bg-emerald-500' : 'bg-rose-500'}`} aria-hidden="true" />
                            {row.noDokumen}
                          </TableCell>
                          <TableCell className="text-xs">{formatDate(row.tanggal)}</TableCell>
                          <TableCell className="text-xs">{row.pihakNama}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{row.inv || '-'}</TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold">
                            {formatRp(sisa)}
                            {parseNum(row.totalGagalTagih) > 0 && <p className="mt-0.5 text-[10px] font-normal text-amber-700">Gagal tagih {formatRp(parseNum(row.totalGagalTagih))}</p>}
                          </TableCell>
                          <TableCell className="text-center">
                            <StatusOutstandingBadge status={row.status} />
                          </TableCell>
                          <TableCell className="p-1 text-center">
                            {bisaAksi ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Aksi ${row.noDokumen}`} title="Pilih aksi">
                                    <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-64">
                                  <DropdownMenuLabel>
                                    {piutang ? 'Piutang — ' : 'Hutang — '}
                                    {row.noDokumen}
                                  </DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => openAksi(row, 'penuh')}>
                                    <CircleCheck className="mr-2 h-4 w-4 text-emerald-600" aria-hidden="true" />
                                    {piutang ? 'Penerimaan Penuh' : 'Pembayaran Penuh'}
                                    <span className="ml-auto text-xs text-muted-foreground">{formatRp(sisa)}</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => openAksi(row, 'sebagian')}>
                                    <Split className="mr-2 h-4 w-4 text-amber-600" aria-hidden="true" />
                                    {piutang ? 'Penerimaan Sebagian' : 'Pembayaran Sebagian'}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => openAksi(row, 'gagal')}>
                                    <BookX className="mr-2 h-4 w-4 text-rose-600" aria-hidden="true" />
                                    Gagal Tagih
                                    <span className="ml-auto text-[10px] text-muted-foreground">non-kas</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Menampilkan {filtered.length} dari {data.length} baris · Tampilan: {jenisFilter === 'PIUTANG' ? 'Piutang' : jenisFilter === 'HUTANG' ? 'Hutang' : 'Semua (Piutang + Hutang)'} · Nominal = sisa tagihan/hutang (net setelah pembayaran, retur, DP, dan penghapusan gagal tagih aktif). Kolom Inv: piutang → No Sales Order asal; hutang → No Faktur supplier.
          </p>
        </CardContent>
      </Card>

      {/* ── Dialog form aksi ── */}
      <Dialog open={dialog !== null} onOpenChange={(o) => (o ? undefined : closeAksi())}>
        <DialogContent className="sm:max-w-lg">
          {dialog && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {dialog.mode === 'gagal' ? <BookX className="h-4 w-4 text-rose-600" aria-hidden="true" /> : dialog.mode === 'penuh' ? <CircleCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Split className="h-4 w-4 text-amber-600" aria-hidden="true" />}
                  {dialog.mode === 'gagal' ? 'Gagal Tagih' : isPiutangRow(dialog.row) ? `Penerimaan ${dialog.mode === 'penuh' ? 'Penuh' : 'Sebagian'}` : `Pembayaran ${dialog.mode === 'penuh' ? 'Penuh' : 'Sebagian'}`}
                </DialogTitle>
                <DialogDescription>
                  {isPiutangRow(dialog.row) ? 'Piutang' : 'Hutang'} <span className="font-medium">{dialog.row.noDokumen}</span> · {dialog.row.pihakNama} · Sisa <span className="font-medium">{formatRp(parseNum(dialog.row.nominal))}</span>
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {dialog.mode === 'gagal' && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                    <p className="text-xs text-amber-700">{isPiutangRow(dialog.row) ? 'Sisa piutang dihapusbukukan tanpa setoran kas — Voucher Memorial: Dr Beban Penghapusan Piutang, Cr Piutang Usaha.' : 'Sisa hutang dihapusbukukan tanpa pembayaran kas — Voucher Memorial: Dr Hutang Usaha, Cr Pendapatan Penghapusan Hutang.'}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">
                      Tanggal <span className="text-destructive">*</span>
                    </Label>
                    <Input type="date" value={form.tanggal} onChange={(e) => setForm((p) => ({ ...p, tanggal: e.target.value }))} aria-invalid={!!formErrors.tanggal} />
                    {formErrors.tanggal && <p className="text-xs text-destructive">{formErrors.tanggal}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Nominal {dialog.mode !== 'penuh' && <span className="text-destructive">*</span>}</Label>
                    <Input inputMode="numeric" value={form.nominal} readOnly={dialog.mode === 'penuh'} onChange={(e) => setForm((p) => ({ ...p, nominal: sanitizeRupiahInput(e.target.value) }))} className={dialog.mode === 'penuh' ? 'bg-muted/60 font-mono' : 'font-mono'} aria-invalid={!!formErrors.nominal} title={dialog.mode === 'penuh' ? 'Nominal terkunci = sisa tagihan (mode Penuh)' : undefined} />
                    {formErrors.nominal ? <p className="text-xs text-destructive">{formErrors.nominal}</p> : <p className="text-[11px] text-muted-foreground">{dialog.mode === 'penuh' ? 'Terisi otomatis sebesar sisa (mode Penuh).' : `Maksimal sisa: ${formatRp(parseNum(dialog.row.nominal))}`}</p>}
                  </div>
                </div>

                {dialog.mode !== 'gagal' && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">
                        Kas/Bank <span className="text-destructive">*</span>
                      </Label>
                      <SearchableDropdown value={form.kasBankId} onValueChange={(v) => setForm((p) => ({ ...p, kasBankId: v }))} options={kasBankOptions.map((k) => ({ id: k.id, label: `${k.kode} — ${k.nama}` }))} placeholder="Pilih kas/bank…" error={formErrors.kasBankId} />
                      {formErrors.kasBankId && <p className="text-xs text-destructive">{formErrors.kasBankId}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">
                        No. Bukti <span className="text-destructive">*</span>
                      </Label>
                      <Input value={form.noBukti} onChange={(e) => setForm((p) => ({ ...p, noBukti: e.target.value }))} placeholder="mis. BKM-001" aria-invalid={!!formErrors.noBukti} />
                      {formErrors.noBukti && <p className="text-xs text-destructive">{formErrors.noBukti}</p>}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Catatan</Label>
                  <Textarea className="min-h-[60px]" value={form.catatan} onChange={(e) => setForm((p) => ({ ...p, catatan: e.target.value }))} placeholder="Catatan dokumen (opsional)" />
                </div>

                {formErrors.submit && (
                  <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive" role="alert">
                    {formErrors.submit}
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeAksi} disabled={submitting}>
                  Batal
                </Button>
                <Button type="button" onClick={() => void submitAksi()} disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                  {dialog.mode === 'gagal' ? 'Simpan Gagal Tagih' : 'Simpan ' + (isPiutangRow(dialog.row) ? 'Penerimaan' : 'Pembayaran')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
