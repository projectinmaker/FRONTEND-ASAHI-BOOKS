'use client';

/**
 * UPDATE #04 — AUD-07/AUD-08/AUD-11: Rekap Pajak (PPN & PPh 23) + Hutang Pajak.
 *
 * Tiga tab:
 * 1. PPN     — keluaran vs masukan per dokumen + ringkasan per masa pajak + export.
 * 2. PPh 23  — dipotong pihak lain / dipotong dari supplier (dengan bukti potong
 *              & masa pajak AUD-08) + accrual per invoice (AUD-09) + export.
 * 3. Hutang  — monitoring saldo akun pajak (TAX_PAYABLE) + tombol "Bayar Pajak"
 *              (jenis transaksi PELUNASAN_PAJAK — AUD-11) + riwayat pelunasan.
 */
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, ApiError, downloadFile } from '@/lib/api';
import { formatRp } from '@/lib/money';
// AUD-17 (update #05) — filter perusahaan (PPN & monitoring scoped; PPh23 global)
import { PerusahaanFilter, companyScopeQuery, type PerusahaanFilterValue } from '@/components/erp/perusahaan-filter';
import type { PajakPpnResponse, PajakPph23Response, PajakPph23Baris, PajakMonitoringResponse, PajakAkunMonitoring } from '@/types/api';
import { Receipt, RefreshCw, FileSpreadsheet, Wallet, Landmark, ArrowDownToLine, ArrowUpFromLine, Scale, AlertCircle, CalendarDays, BadgeCheck } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';

const formatDate = (d: string | null | undefined) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return d;
  }
};

function getToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function firstDayOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
  return isNaN(n) ? 0 : n;
};

type TabKey = 'ppn' | 'pph23' | 'hutang';

const TABS: { key: TabKey; label: string; icon: React.ElementType; desc: string }[] = [
  { key: 'ppn', label: 'Rekap PPN', icon: Receipt, desc: 'PPN keluaran vs masukan dari jurnal POSTED, per masa pajak' },
  { key: 'pph23', label: 'Rekap PPh 23', icon: FileSpreadsheet, desc: 'Potongan PPh 23 dengan bukti potong & masa pajak' },
  { key: 'hutang', label: 'Hutang Pajak', icon: Landmark, desc: 'Saldo akun hutang pajak + pelunasan (jenis Pelunasan Pajak)' }
];

// ═══════════════════════════════════════════════════════════════════════════
export default function RekapPajakPage({ refreshKey, companyFilter, onCompanyChange }: { refreshKey?: number; companyFilter?: PerusahaanFilterValue; onCompanyChange: (v: PerusahaanFilterValue) => void }) {
  const [tab, setTab] = useState<TabKey>('ppn');
  const [dari, setDari] = useState(firstDayOfYear());
  const [sampai, setSampai] = useState(getToday());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ppn, setPpn] = useState<PajakPpnResponse | null>(null);
  const [pph23, setPph23] = useState<PajakPph23Response | null>(null);
  const [monitoring, setMonitoring] = useState<PajakMonitoringResponse | null>(null);
  const [bayarOpen, setBayarOpen] = useState(false);

  // AUD-17: scope hanya PPN + monitoring — PPh23 rekap masih GLOBAL (documented limitation)
  const scoped = !!companyFilter && companyFilter !== 'ALL';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'ppn') {
        const cs = companyScopeQuery(companyFilter);
        setPpn(await api.get<PajakPpnResponse>(`/laporan/pajak/ppn?dari=${dari}&sampai=${sampai}${cs}`));
      } else if (tab === 'pph23') {
        // PPh23 rekap belum terfilter perusahaan — jangan kirim param scope.
        setPph23(await api.get<PajakPph23Response>(`/laporan/pajak/pph23?dari=${dari}&sampai=${sampai}`));
      } else {
        const cs = companyScopeQuery(companyFilter);
        setMonitoring(await api.get<PajakMonitoringResponse>(`/kas-bank/pajak/monitoring${cs ? `?${cs.slice(1)}` : ''}`));
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Gagal memuat rekap pajak';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [tab, dari, sampai, companyFilter]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const exportPajak = async (jenis: 'ppn' | 'pph23') => {
    try {
      // AUD-17: export PPN mengikuti scope; export PPh23 masih global.
      const cs = jenis === 'ppn' ? companyScopeQuery(companyFilter) : '';
      const name = await downloadFile(`/laporan/pajak/${jenis}/export?dari=${dari}&sampai=${sampai}${cs}`, `rekap-${jenis}-${dari}-${sampai}.xlsx`);
      toast.success(`Rekap ${jenis.toUpperCase()} diunduh: ${name}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Gagal mengunduh export');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-5 w-5 text-emerald-600" /> Rekap Pajak
          </h2>
          <p className="text-sm text-muted-foreground">PPN &amp; PPh 23 per periode — satu sumber dengan buku besar (jurnal POSTED)</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">Dari</Label>
            <Input type="date" value={dari} onChange={(e) => setDari(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label className="text-xs">Sampai</Label>
            <Input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} className="w-40" />
          </div>
          {/* AUD-17 — scope perusahaan (PPN & hutang pajak; PPh23 masih global) */}
          <PerusahaanFilter value={companyFilter ?? 'ALL'} onChange={onCompanyChange} />
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Muat
          </Button>
          {tab !== 'hutang' && (
            <Button variant="outline" onClick={() => void exportPajak(tab)}>
              <FileSpreadsheet className="h-4 w-4 mr-1" /> Export
            </Button>
          )}
        </div>
      </div>

      <div className="grid w-full grid-cols-3 gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`rounded-lg border p-3 text-left transition-colors ${tab === t.key ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}>
            <div className="flex items-center gap-2 font-medium">
              <t.icon className="h-4 w-4" /> {t.label}
            </div>
            <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{t.desc}</div>
          </button>
        ))}
      </div>

      {/* AUD-17 — PPh23 rekap belum terfilter perusahaan (documented limitation) */}
      {tab === 'pph23' && scoped && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Rekap PPh 23 belum terfilter perusahaan — angka di tab ini masih mencakup semua perusahaan.</span>
        </div>
      )}

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-2 pt-4 text-destructive">
            <AlertCircle className="h-4 w-4" /> {error}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          {tab === 'ppn' && ppn && <PpnTab data={ppn} />}
          {tab === 'pph23' && pph23 && <Pph23Tab data={pph23} />}
          {tab === 'hutang' && monitoring && <HutangTab data={monitoring} onChanged={load} onBayar={() => setBayarOpen(true)} />}
        </>
      )}

      <BayarPajakDialog open={bayarOpen} onClose={() => setBayarOpen(false)} akunPajak={monitoring?.akunPajak ?? []} onCreated={load} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
function StatCard({ title, value, icon: Icon, tone, hint }: { title: string; value: string; icon: React.ElementType; tone: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${tone}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-xl font-bold ${tone}`}>{value}</div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

// ── Tab PPN ────────────────────────────────────────────────────────────────
const JENIS_PPN_LABEL: Record<string, string> = {
  FAKTUR_KELUARAN: 'Faktur Keluaran',
  RETUR_PENJUALAN: 'Retur Penjualan',
  FAKTUR_MASUKAN: 'Faktur Masukan',
  RETUR_PEMBELIAN: 'Retur Pembelian',
  LAINNYA: 'Lainnya'
};

function PpnBarisTable({ title, rows }: { title: string; rows: PajakPpnResponse['keluaran'] }) {
  if (!rows.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {title} ({rows.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0 pb-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Tanggal</TableHead>
              <TableHead>No Dokumen</TableHead>
              <TableHead>Jenis</TableHead>
              <TableHead>Pihak</TableHead>
              <TableHead className="text-right">DPP</TableHead>
              <TableHead className="text-right pr-4">PPN</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => {
              const negatif = num(r.ppn) < 0;
              return (
                <TableRow key={i}>
                  <TableCell className="pl-4 whitespace-nowrap">{formatDate(r.tanggal)}</TableCell>
                  <TableCell className="font-medium">{r.noDokumen ?? r.noJurnal}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{JENIS_PPN_LABEL[r.jenis] ?? r.jenis}</Badge>
                  </TableCell>
                  <TableCell>{r.pihak ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.dpp != null ? formatRp(r.dpp) : '—'}</TableCell>
                  <TableCell className={`text-right tabular-nums pr-4 font-medium ${negatif ? 'text-red-600' : ''}`}>{formatRp(r.ppn)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function PpnTab({ data }: { data: PajakPpnResponse }) {
  const netto = num(data.ppnNetto);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard title="PPN Keluaran" value={formatRp(data.totalKeluaran)} icon={ArrowUpFromLine} tone="text-orange-600" hint="PPN dibebankan ke pelanggan (SI & retur)" />
        <StatCard title="PPN Masukan" value={formatRp(data.totalMasukan)} icon={ArrowDownToLine} tone="text-emerald-600" hint="PPN atas pembelian (PI & retur)" />
        <StatCard title={netto >= 0 ? 'PPN Netto (Lebih Bayar)' : 'PPN Netto (Kurang Bayar)'} value={formatRp(Math.abs(netto))} icon={Scale} tone={netto >= 0 ? 'text-emerald-600' : 'text-orange-600'} hint="Masukan − Keluaran" />
      </div>
      {data.perMasa.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4" /> Ringkasan per Masa Pajak
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0 pb-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Masa Pajak</TableHead>
                  <TableHead className="text-right">Keluaran</TableHead>
                  <TableHead className="text-right">Masukan</TableHead>
                  <TableHead className="text-right pr-4">Netto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.perMasa.map((m) => (
                  <TableRow key={m.masaPajak}>
                    <TableCell className="pl-4 font-medium">{m.masaPajak}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRp(m.keluaran)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRp(m.masukan)}</TableCell>
                    <TableCell className={`text-right tabular-nums pr-4 font-medium ${num(m.netto) >= 0 ? 'text-emerald-600' : 'text-orange-600'}`}>{formatRp(m.netto)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <PpnBarisTable title="PPN Keluaran" rows={data.keluaran} />
      <PpnBarisTable title="PPN Masukan" rows={data.masukan} />
      {!data.keluaran.length && !data.masukan.length && <EmptyState icon={Receipt} title="Belum ada data PPN" description="Belum ada jurnal PPN pada periode ini." />}
    </div>
  );
}

// ── Tab PPh 23 ─────────────────────────────────────────────────────────────
function Pph23Table({ title, hint, rows }: { title: string; hint?: string; rows: PajakPph23Response['dipotongPihakLain'] }) {
  if (!rows.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {title} ({rows.length})
        </CardTitle>
        {hint && <CardDescription className="text-xs">{hint}</CardDescription>}
      </CardHeader>
      <CardContent className="overflow-x-auto px-0 pb-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Tanggal</TableHead>
              <TableHead>No Dokumen</TableHead>
              <TableHead>No Invoice</TableHead>
              <TableHead>Pihak</TableHead>
              <TableHead className="text-right">Nilai</TableHead>
              <TableHead className="text-right">PPh 23</TableHead>
              <TableHead>No Bukti Potong</TableHead>
              <TableHead className="pr-4">Masa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="pl-4 whitespace-nowrap">{formatDate(r.tanggal)}</TableCell>
                <TableCell className="font-medium">{r.noDokumen ?? '—'}</TableCell>
                <TableCell>{r.noInvoice ?? '—'}</TableCell>
                <TableCell>{r.pihak ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{r.nilai != null ? formatRp(r.nilai) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{formatRp(r.pph23)}</TableCell>
                <TableCell>
                  {r.noBuktiPotong ? (
                    <Badge variant="secondary" className="gap-1">
                      <BadgeCheck className="h-3 w-3" />
                      {r.noBuktiPotong}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">belum ada</span>
                  )}
                </TableCell>
                <TableCell className="pr-4 tabular-nums">{r.masaPajak ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── AUD-12 (update #05): tabel kecil retur → pembalikan PPh23 (nilai NEGATIF) ──
function Pph23ReturTable({ title, rows, total, hint }: { title: string; rows: PajakPph23Baris[]; total?: number | string; hint?: string }) {
  if (!rows.length) return null;
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-sm">
          {title} ({rows.length})
        </CardTitle>
        {hint && <CardDescription className="text-xs">{hint}</CardDescription>}
      </CardHeader>
      <CardContent className="overflow-x-auto px-0 pb-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Tanggal</TableHead>
              <TableHead>No Retur</TableHead>
              <TableHead>No Invoice</TableHead>
              <TableHead>Pihak</TableHead>
              <TableHead className="text-right pr-4">Pembalikan PPh 23</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="pl-4 whitespace-nowrap">{formatDate(r.tanggal)}</TableCell>
                <TableCell className="font-medium">{r.noDokumen ?? '—'}</TableCell>
                <TableCell>{r.noInvoice ?? '—'}</TableCell>
                <TableCell>{r.pihak ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums pr-4 font-medium text-red-600">−{formatRp(Math.abs(num(r.pph23)))}</TableCell>
              </TableRow>
            ))}
            {total != null && (
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell colSpan={4} className="pl-4 text-right">
                  Total pembalikan
                </TableCell>
                <TableCell className="text-right tabular-nums pr-4 text-red-600">−{formatRp(Math.abs(num(total)))}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Pph23Tab({ data }: { data: PajakPph23Response }) {
  const returPenjualan = data.pph23ReturPenjualan ?? [];
  const returPembelian = data.pph23ReturPembelian ?? [];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard title="Kita Dipotong Pihak Lain" value={formatRp(data.totalDipotongPihakLain)} icon={ArrowUpFromLine} tone="text-orange-600" hint="Pelanggan memotong PPh 23 dari penjualan kita" />
        <StatCard title="Kita Memotong Supplier" value={formatRp(data.totalDipotongDariSupplier)} icon={ArrowDownToLine} tone="text-emerald-600" hint="PPh 23 ditahan dari pembayaran supplier" />
        <StatCard title="Accrual Invoice Penjualan" value={formatRp(data.totalPph23InvoicePenjualan)} icon={Receipt} tone="text-muted-foreground" hint="SI ber-PPh 23 (Dr 116003) — SUDAH net retur penjualan" />
        <StatCard title="Accrual Invoice Pembelian" value={formatRp(data.totalPph23InvoicePembelian)} icon={Receipt} tone="text-muted-foreground" hint="PI ber-PPh 23 (Cr 213002) — SUDAH net retur pembelian" />
      </div>
      {data.perMasa.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4" /> Ringkasan per Masa Pajak (bukti potong)
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0 pb-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Masa Pajak</TableHead>
                  <TableHead className="text-right pr-4">Dipotong Pihak Lain</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.perMasa.map((m) => (
                  <TableRow key={m.masaPajak}>
                    <TableCell className="pl-4 font-medium">{m.masaPajak}</TableCell>
                    <TableCell className="text-right tabular-nums pr-4">{formatRp(m.dipotongPihakLain)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <Pph23Table title="Dipotong Pihak Lain (kita dipotong pelanggan)" rows={data.dipotongPihakLain} hint="Dari penerimaan pelunasan piutang / identifikasi — kas masuk = nilai − pph23" />
      <Pph23Table title="Dipotong dari Supplier (kita memotong)" rows={data.dipotongDariSupplier} hint="Dari pembayaran pelunasan hutang / identifikasi — kas keluar = nilai − diskon − pph23" />
      <Pph23Table title="Accrual Invoice Penjualan (PPh 23 Dibayar di Muka)" rows={data.pph23InvoicePenjualan} hint="SI ber-PPh 23 — terbentuk sejak invoice (Dr PPh 23 Dibayar di Muka); total sudah termasuk netting retur di bawah" />
      {/* AUD-12 (update #05) — netting retur penjualan (pembalikan Dr 116003) */}
      <Pph23ReturTable title="Retur Penjualan (pembalikan PPh 23)" rows={returPenjualan} total={data.totalPph23ReturPenjualan} hint="Retur atas SI ber-PPh 23 — membalik PPh 23 Dibayar di Muka (nilai negatif, sudah mengurangi accrual penjualan)" />
      <Pph23Table title="Accrual Invoice Pembelian (Hutang PPh 23)" rows={data.pph23InvoicePembelian} hint="PI ber-PPh 23 — hutang pajak terbentuk sejak invoice, bukti potong dari alokasi pelunasan; total sudah termasuk netting retur di bawah" />
      {/* AUD-12 (update #05) — netting retur pembelian (pembalikan Cr 213002) */}
      <Pph23ReturTable title="Retur Pembelian (pembalikan PPh 23)" rows={returPembelian} total={data.totalPph23ReturPembelian} hint="Retur atas PI ber-PPh 23 — membalik Hutang PPh 23 (nilai negatif, sudah mengurangi accrual pembelian)" />
      {!data.dipotongPihakLain.length && !data.dipotongDariSupplier.length && !data.pph23InvoicePembelian.length && <EmptyState icon={FileSpreadsheet} title="Belum ada data PPh 23" description="Belum ada potongan PPh 23 pada periode ini." />}
    </div>
  );
}

// ── Tab Hutang Pajak ───────────────────────────────────────────────────────
function HutangTab({ data, onChanged, onBayar }: { data: PajakMonitoringResponse; onChanged: () => void; onBayar: () => void }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard title="Total Hutang Pajak" value={formatRp(data.totalHutang)} icon={Landmark} tone="text-orange-600" hint="PPh 21/23/29/Final yang masih harus disetor" />
        <StatCard title="Dibayar Lebih" value={formatRp(data.totalDibayarLebih)} icon={Wallet} tone="text-emerald-600" hint="Saldo debit akun pajak" />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Aksi</CardTitle>
          </CardHeader>
          <CardContent>
            <Button onClick={onBayar} className="w-full">
              <Wallet className="h-4 w-4 mr-2" /> Bayar Pajak
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Membuat pembayaran jenis <b>Pelunasan Pajak</b> (Dr akun hutang pajak / Cr kas-bank).
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Akun Hutang Pajak</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Kode</TableHead>
                <TableHead>Nama Akun</TableHead>
                <TableHead className="text-right pr-4">Hutang (harus dibayar)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.akunPajak.map((a: PajakAkunMonitoring) => (
                <TableRow key={a.id}>
                  <TableCell className="pl-4 font-mono text-xs">{a.kode}</TableCell>
                  <TableCell className="font-medium">{a.nama}</TableCell>
                  <TableCell className={`text-right tabular-nums pr-4 font-medium ${num(a.hutang) > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>{formatRp(a.hutang)}</TableCell>
                </TableRow>
              ))}
              {!data.akunPajak.length && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    Tidak ada akun hutang pajak (TAX_PAYABLE) aktif
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Riwayat Pelunasan Pajak</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0 pb-0 max-h-96 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Tanggal</TableHead>
                <TableHead>No Bukti</TableHead>
                <TableHead>Kas / Bank</TableHead>
                <TableHead>Catatan</TableHead>
                <TableHead className="text-right pr-4">Nilai</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.riwayatPelunasan.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-4 whitespace-nowrap">{formatDate(r.tanggal)}</TableCell>
                  <TableCell className="font-medium">{r.noBukti}</TableCell>
                  <TableCell>{r.kasBank?.nama ?? '—'}</TableCell>
                  <TableCell className="max-w-64 truncate">{r.catatan ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums pr-4">{formatRp(r.totalNilai)}</TableCell>
                </TableRow>
              ))}
              {!data.riwayatPelunasan.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Belum ada pelunasan pajak
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Dialog Bayar Pajak (AUD-11) ────────────────────────────────────────────
function BayarPajakDialog({ open, onClose, akunPajak, onCreated }: { open: boolean; onClose: () => void; akunPajak: PajakAkunMonitoring[]; onCreated: () => void }) {
  const [tanggal, setTanggal] = useState(getToday());
  const [kasBankId, setKasBankId] = useState<string>('');
  const [akunPajakId, setAkunPajakId] = useState<string>('');
  const [nilai, setNilai] = useState('');
  const [noNukti, setNoNukti] = useState('');
  const [catatan, setCatatan] = useState('');
  const [kasList, setKasList] = useState<{ id: string; kode: string; nama: string; status: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    api
      .get<{ id: string; kode: string; nama: string; status: string }[]>('/master/kas-bank-akun')
      .then((rows) => setKasList(rows.filter((k) => k.status === 'AKTIF')))
      .catch(() => toast.error('Gagal memuat daftar kas/bank'));
  }, [open]);

  useEffect(() => {
    if (open && akunPajak.length === 1) {
      setAkunPajakId(akunPajak[0].id);
      if (num(akunPajak[0].hutang) > 0) setNilai(String(num(akunPajak[0].hutang)));
    }
  }, [open, akunPajak]);

  const akunTerpilih = akunPajak.find((a) => a.id === akunPajakId);

  const submit = async () => {
    if (!kasBankId || !akunPajakId || !nilai) {
      toast.error('Lengkapi kas/bank, akun pajak, dan nilai');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<{ noBukti?: string }>('/kas-bank/pembayaran', {
        tanggal: `${tanggal}T12:00:00`,
        kasBankId,
        noNukti: noNukti || `PAJAK-${Date.now().toString().slice(-8)}`,
        penerima: 'Kantor Pelayanan Pajak / DJP',
        catatan: catatan || 'Pelunasan hutang pajak',
        autoPostJurnal: true,
        jenisTransaksi: 'PELUNASAN_PAJAK',
        rincian: [{ akunPerkiraanId: akunPajakId, nilai: Number(nilai) }]
      });
      toast.success(`Pembayaran pajak ${res.noBukti ?? ''} berhasil diposting`);
      onCreated();
      onClose();
      setNilai('');
      setCatatan('');
      setNoNukti('');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Gagal membuat pembayaran pajak');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bayar Pajak (Pelunasan Pajak)</DialogTitle>
          <DialogDescription>Membayar hutang pajak (PPh 21/23/29/Final). Jurnal: Dr akun hutang pajak / Cr kas-bank.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tanggal</Label>
              <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
            </div>
            <div>
              <Label>No Bukti (Nukti)</Label>
              <Input value={noNukti} onChange={(e) => setNoNukti(e.target.value)} placeholder="otomatis bila kosong" />
            </div>
          </div>
          <div>
            <Label>Kas / Bank sumber</Label>
            <SearchableDropdown options={kasList.map((k) => ({ id: k.id, label: `${k.kode} — ${k.nama}` }))} value={kasBankId} onValueChange={(v: string) => setKasBankId(v)} placeholder="Pilih kas/bank…" />
          </div>
          <div>
            <Label>Akun Hutang Pajak</Label>
            <SearchableDropdown options={akunPajak.map((a) => ({ id: a.id, label: `${a.kode} — ${a.nama}` }))} value={akunPajakId} onValueChange={(v: string) => setAkunPajakId(v)} placeholder="Pilih akun pajak…" />
            {akunTerpilih && num(akunTerpilih.hutang) > 0 && <p className="mt-1 text-xs text-muted-foreground">Hutang saat ini: {formatRp(akunTerpilih.hutang)}</p>}
          </div>
          <div>
            <Label>Nilai Pembayaran</Label>
            <Input type="number" value={nilai} onChange={(e) => setNilai(e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label>Catatan</Label>
            <Input value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="mis. Setor SPT Masa PPh 23 Oktober" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? 'Memproses…' : 'Bayar & Posting'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
