'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { useERPStore } from '@/store/erp-store';
import { useTabStore } from '@/store/tab-store';
import { api, ApiError } from '@/lib/api';
import type { LabaRugiLaporanResponse, NeracaLaporanResponse, ArusKasLaporanResponse, ArusKasItem, BukuBesarLaporanResponse, RekapKasBankLaporanResponse, COADropdownResponse, NeracaSaldoResponse, PerubahanModalResponse, UmurPiutangResponse, UmurHutangResponse } from '@/types/api';
import { Printer, FileSpreadsheet, AlertCircle, RefreshCw, FileText, CheckCircle2, XCircle, Clock, TrendingUp, Scale, Wallet, BookOpen, PieChart, ArrowLeftRight, Calendar, FileBarChart, Activity, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';

const PenutupanPeriodePage = dynamic(() => import('@/components/erp/reports/penutupan-periode'), { ssr: false });
// Tahap 3: Rekonsiliasi & Audit Persediaan
const RekonsiliasiPersediaanPage = dynamic(() => import('@/components/erp/reports/rekonsiliasi-persediaan'), { ssr: false });
const AuditPersediaanPage = dynamic(() => import('@/components/erp/reports/audit-persediaan'), { ssr: false });
// Tahap 7: Rekonsiliasi Asset Register vs GL
const AssetReconciliationPage = dynamic(() => import('@/components/erp/reports/asset-reconciliation'), { ssr: false });
// Phase 9: Accounting Health + Reconciliation Detail (GRNI / Cash Flow vs BS / Equity vs BS)
const AccountingHealthPage = dynamic(() => import('@/components/erp/reports/accounting-health'), { ssr: false });
const HistoriDokumenTerhapusPage = dynamic(() => import('@/components/erp/reports/histori-dokumen-terhapus'), { ssr: false });
const ReconciliationDetailPage = dynamic(() => import('@/components/erp/reports/reconciliation-detail'), { ssr: false });

// ─── Helpers ────────────────────────────────────────────────────────────────

const formatRp = (val: number | string) => {
  // Backend (Pydantic) menserialisasi Decimal sebagai string (mis. "-1500000.00").
  // Koersi ke number supaya toLocaleString memformat dengan benar.
  const n = typeof val === 'number' ? val : Number(val);
  return 'Rp ' + (Number.isFinite(n) ? n : 0).toLocaleString('id-ID');
};
const formatDate = (d: string | null | undefined) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return d;
  }
};

function getFirstDayOfMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function getToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// ─── Local types for raw snake_case responses ─────────────────────────────

interface MutasiRawTransaksi {
  tanggal: string;
  noJurnal: string;
  deskripsi: string;
  debit: number;
  kredit: number;
  saldo: number;
  akun: string;
}

interface MutasiRawResponse {
  periode: { dari: string; sampai: string };
  transaksi: MutasiRawTransaksi[];
}

// ─── Sub-page titles ────────────────────────────────────────────────────────

const subPageTitles: Record<string, string> = {
  'laba-rugi': 'Laporan Laba / Rugi',
  neraca: 'Neraca',
  'arus-kas': 'Laporan Arus Kas',
  'neraca-saldo': 'Neraca Saldo',
  'perubahan-modal': 'Perubahan Modal',
  'rincian-buku-besar': 'Rincian Buku Besar',
  'umur-piutang': 'Umur Piutang',
  'umur-hutang': 'Umur Hutang',
  'mutasi-kas': 'Mutasi Kas',
  'mutasi-bank': 'Mutasi Bank',
  'rekap-kas-bank': 'Rekap Kas & Bank',
  'penutupan-periode': 'Penutupan Periode',
  'rekonsiliasi-persediaan': 'Rekonsiliasi Persediaan',
  'audit-persediaan': 'Audit Persediaan',
  'rekonsiliasi-aset': 'Rekonsiliasi Aset',
  'accounting-health': 'Accounting Health',
  'histori-dokumen-terhapus': 'Histori Dokumen Terhapus',
  'rekonsiliasi-grni': 'GRNI vs GL',
  'rekonsiliasi-cf-bs': 'Cash Flow vs Neraca',
  'rekonsiliasi-eq-bs': 'Ekuitas vs Neraca',
  'laporan-lainnya': 'Laporan Lainnya'
};

// ─── Shared: Report Actions (Print / Export) ────────────────────────────────

function exportTableToCSV(filename: string) {
  // Find the first table in the report content area
  const table = document.querySelector('table');
  if (!table) {
    toast.error('Tidak ada tabel untuk diekspor');
    return;
  }
  const rows = table.querySelectorAll('tr');
  const csv: string[] = [];
  rows.forEach((row) => {
    const cells = row.querySelectorAll('th, td');
    const rowData = Array.from(cells).map((cell) => {
      const text = cell.textContent?.trim().replace(/\s+/g, ' ') || '';
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    });
    csv.push(rowData.join(','));
  });
  const csvContent = csv.join('\n');
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  toast.success('Data berhasil diekspor ke CSV');
}

function ReportActions({ reportName = 'laporan' }: { reportName?: string }) {
  const handlePrint = () => {
    toast.info('Membuka dialog cetak...');
    window.print();
  };
  const handleExport = () => {
    // Tanggal lokal (bukan UTC) untuk nama file ekspor
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    exportTableToCSV(`${reportName}-${today}.csv`);
  };
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" className="gap-2" onClick={handlePrint}>
        <Printer className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Cetak</span>
      </Button>
      <Button size="sm" variant="outline" className="gap-2" onClick={handleExport}>
        <FileSpreadsheet className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Export</span>
      </Button>
    </div>
  );
}

// ─── Shared: Date Range Filter ─────────────────────────────────────────────

function DateRangeFilter({ dari, sampai, onDariChange, onSampaiChange, onSubmit, loading }: { dari: string; sampai: string; onDariChange: (v: string) => void; onSampaiChange: (v: string) => void; onSubmit: () => void; loading: boolean }) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Dari Tanggal</Label>
        <Input type="date" value={dari} onChange={(e) => onDariChange(e.target.value)} className="w-44" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Sampai Tanggal</Label>
        <Input type="date" value={sampai} onChange={(e) => onSampaiChange(e.target.value)} className="w-44" />
      </div>
      <Button onClick={onSubmit} disabled={loading} size="sm">
        {loading ? 'Memuat...' : 'Tampilkan'}
      </Button>
    </div>
  );
}

// ─── Shared: Single Date Filter ─────────────────────────────────────────────

function SingleDateFilter({ tanggal, onTanggalChange, onSubmit, loading }: { tanggal: string; onTanggalChange: (v: string) => void; onSubmit: () => void; loading: boolean }) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Tanggal</Label>
        <Input type="date" value={tanggal} onChange={(e) => onTanggalChange(e.target.value)} className="w-44" />
      </div>
      <Button onClick={onSubmit} disabled={loading} size="sm">
        {loading ? 'Memuat...' : 'Tampilkan'}
      </Button>
    </div>
  );
}

// ─── Shared: Loading Skeleton ───────────────────────────────────────────────

function ReportSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-36" />
        <div className="space-y-2 pt-2">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
        <Skeleton className="h-4 w-60" />
      </CardContent>
    </Card>
  );
}

// ─── Shared: Error State ────────────────────────────────────────────────────

function ReportError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-sm text-muted-foreground text-center max-w-md">{message}</p>
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Coba Lagi
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Shared: Empty Table ───────────────────────────────────────────────────

function EmptyTable({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <FileText className="h-10 w-10 mb-2 opacity-40" />
        <p className="text-sm">{message}</p>
      </CardContent>
    </Card>
  );
}

// ─── Total Row Helper ──────────────────────────────────────────────────────

function TotalRow({ label, value, colSpan = 2 }: { label: string; value: number; colSpan?: number }) {
  return (
    <TableRow className="bg-muted/50 font-semibold">
      <TableCell colSpan={colSpan} className="text-right">
        {label}
      </TableCell>
      <TableCell className="text-right font-semibold">{formatRp(value)}</TableCell>
    </TableRow>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Sub-page: Laba / Rugi
// ═════════════════════════════════════════════════════════════════════════════

function LabaRugiReport() {
  const [dari, setDari] = useState(getFirstDayOfMonth());
  const [sampai, setSampai] = useState(getToday());
  const [data, setData] = useState<LabaRugiLaporanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<LabaRugiLaporanResponse>(`/laporan/laba-rugi?dari=${dari}&sampai=${sampai}`);
      setData(res);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal memuat data laporan.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [dari, sampai]);

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="space-y-4">
      <DateRangeFilter dari={dari} sampai={sampai} onDariChange={setDari} onSampaiChange={setSampai} onSubmit={fetchData} loading={loading} />

      {loading && <ReportSkeleton rows={8} />}
      {error && <ReportError message={error} onRetry={fetchData} />}
      {!loading && !error && data && (
        <>
          {data.periode.dari && data.periode.sampai && (
            <p className="text-xs text-muted-foreground">
              Periode: {formatDate(data.periode.dari)} — {formatDate(data.periode.sampai)}
            </p>
          )}

          <Card>
            <CardContent className="p-0">
              <div className="max-h-[70vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">No</TableHead>
                      <TableHead>Kode Akun</TableHead>
                      <TableHead>Nama Akun</TableHead>
                      <TableHead className="text-right">Jumlah</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* PENDAPATAN */}
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={4} className="font-semibold text-xs uppercase tracking-wide">
                        Pendapatan
                      </TableCell>
                    </TableRow>
                    {data.pendapatan.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-4">
                          Tidak ada pendapatan
                        </TableCell>
                      </TableRow>
                    )}
                    {data.pendapatan.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                        <TableCell className="font-mono text-xs">{item.kodeAkun}</TableCell>
                        <TableCell className="pl-6">{item.namaAkun}</TableCell>
                        <TableCell className="text-right">{formatRp(item.total)}</TableCell>
                      </TableRow>
                    ))}
                    <TotalRow label="Total Pendapatan" value={data.totalPendapatan} colSpan={3} />

                    {/* HPP */}
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={4} className="font-semibold text-xs uppercase tracking-wide">
                        Harga Pokok Penjualan
                      </TableCell>
                    </TableRow>
                    {data.hpp.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-4">
                          Tidak ada HPP
                        </TableCell>
                      </TableRow>
                    )}
                    {data.hpp.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                        <TableCell className="font-mono text-xs">{item.kodeAkun}</TableCell>
                        <TableCell className="pl-6">{item.namaAkun}</TableCell>
                        <TableCell className="text-right">{formatRp(item.total)}</TableCell>
                      </TableRow>
                    ))}
                    <TotalRow label="Total HPP" value={data.totalHpp} colSpan={3} />

                    {/* LABA KOTOR */}
                    <TableRow className="bg-primary/5">
                      <TableCell colSpan={3} className="text-right font-bold">
                        Laba Kotor
                      </TableCell>
                      <TableCell className="text-right font-bold">{formatRp(data.labaKotor)}</TableCell>
                    </TableRow>

                    {/* BEBAN */}
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={4} className="font-semibold text-xs uppercase tracking-wide">
                        Beban Operasional
                      </TableCell>
                    </TableRow>
                    {data.beban.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-4">
                          Tidak ada beban
                        </TableCell>
                      </TableRow>
                    )}
                    {data.beban.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                        <TableCell className="font-mono text-xs">{item.kodeAkun}</TableCell>
                        <TableCell className="pl-6">{item.namaAkun}</TableCell>
                        <TableCell className="text-right">{formatRp(item.total)}</TableCell>
                      </TableRow>
                    ))}
                    <TotalRow label="Total Beban" value={data.totalBeban} colSpan={3} />

                    {/* LABA BERSIH */}
                    <TableRow className="bg-primary/10">
                      <TableCell colSpan={3} className="text-right font-bold text-base">
                        Laba (Rugi) Bersih
                      </TableCell>
                      <TableCell className="text-right font-bold text-base">{formatRp(data.labaBersih)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Sub-page: Neraca
// ═════════════════════════════════════════════════════════════════════════════

function NeracaReport() {
  const [tanggal, setTanggal] = useState(getToday());
  const [data, setData] = useState<NeracaLaporanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<NeracaLaporanResponse>(`/laporan/neraca?tanggal=${tanggal}`);
      setData(res);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal memuat data neraca.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [tanggal]);

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="space-y-4">
      <SingleDateFilter tanggal={tanggal} onTanggalChange={setTanggal} onSubmit={fetchData} loading={loading} />

      {loading && <ReportSkeleton rows={8} />}
      {error && <ReportError message={error} onRetry={fetchData} />}
      {!loading && !error && data && (
        <>
          <p className="text-xs text-muted-foreground">Tanggal: {formatDate(data.tanggal)}</p>

          <Card>
            <CardContent className="p-0">
              <div className="max-h-[70vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">No</TableHead>
                      <TableHead>Kode Akun</TableHead>
                      <TableHead>Nama Akun</TableHead>
                      <TableHead className="text-right">Jumlah</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* ASET */}
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={4} className="font-semibold text-xs uppercase tracking-wide">
                        Aset
                      </TableCell>
                    </TableRow>
                    {data.aset.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                        <TableCell className="font-mono text-xs">{item.kodeAkun}</TableCell>
                        <TableCell className="pl-6">{item.namaAkun}</TableCell>
                        <TableCell className="text-right">{formatRp(item.total)}</TableCell>
                      </TableRow>
                    ))}
                    <TotalRow label="Total Aset" value={data.totalAset} colSpan={3} />

                    {/* KEWAJIBAN */}
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={4} className="font-semibold text-xs uppercase tracking-wide">
                        Kewajiban
                      </TableCell>
                    </TableRow>
                    {data.kewajiban.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                        <TableCell className="font-mono text-xs">{item.kodeAkun}</TableCell>
                        <TableCell className="pl-6">{item.namaAkun}</TableCell>
                        <TableCell className="text-right">{formatRp(item.total)}</TableCell>
                      </TableRow>
                    ))}
                    <TotalRow label="Total Kewajiban" value={data.totalKewajiban} colSpan={3} />

                    {/* EKUITAS */}
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={4} className="font-semibold text-xs uppercase tracking-wide">
                        Ekuitas
                      </TableCell>
                    </TableRow>
                    {data.ekuitas.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                        <TableCell className="font-mono text-xs">{item.kodeAkun}</TableCell>
                        <TableCell className="pl-6">{item.namaAkun}</TableCell>
                        <TableCell className="text-right">{formatRp(item.total)}</TableCell>
                      </TableRow>
                    ))}
                    <TotalRow label="Total Ekuitas" value={data.totalEkuitas} colSpan={3} />

                    {/* BALANCE CHECK */}
                    <TableRow className="bg-primary/10">
                      <TableCell colSpan={3} className="text-right font-bold text-base">
                        Total Kewajiban + Ekuitas
                      </TableCell>
                      <TableCell className="text-right font-bold text-base">{formatRp(data.totalKewajiban + data.totalEkuitas)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Sub-page: Arus Kas
// ═════════════════════════════════════════════════════════════════════════════

// ─── Arus Kas: grouping per akun lawan ─────────────────────────────────────

interface ArusKasItemGroup {
  key: string;
  code: string | null;
  name: string;
  isMultiAccount: boolean;
  items: ArusKasItem[];
  net: number;
}

function arusKasItemLabel(item: ArusKasItem): string {
  if (item.accountCode) return `${item.accountCode} — ${item.accountName ?? item.nama}`;
  return item.accountName ?? item.nama;
}

function buildArusKasItemGroups(items: ArusKasItem[]): ArusKasItemGroup[] {
  const groups: ArusKasItemGroup[] = [];
  const byKey = new Map<string, ArusKasItemGroup>();
  for (const item of items) {
    const isMultiAccount = item.allocationStatus === 'MIXED_UNALLOCATED' || (!item.accountCode && !item.accountId);
    const key = isMultiAccount ? '__multi_akun__' : (item.accountCode ?? item.accountId ?? item.accountName ?? item.nama);
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        code: isMultiAccount ? null : (item.accountCode ?? null),
        name: isMultiAccount ? 'Multi-akun' : (item.accountName ?? item.nama),
        isMultiAccount,
        items: [],
        net: 0
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
    // jumlah bisa string Decimal dari backend — koersi sebelum menjumlah.
    group.net += typeof item.jumlah === 'number' ? item.jumlah : Number(item.jumlah) || 0;
  }
  return groups;
}

function ArusKasAmount({ value, bold = false }: { value: number | string; bold?: boolean }) {
  // Nilai bisa string Decimal dari backend — koersi sekali di sini.
  const n = typeof value === 'number' ? value : Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  return (
    <span className={`shrink-0 tabular-nums ${bold ? 'font-semibold' : 'font-medium'} ${safe >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
      {safe >= 0 ? '+' : ''}
      {formatRp(safe)}
    </span>
  );
}

function ArusKasItemRow({ item }: { item: ArusKasItem }) {
  const isMultiAccount = item.allocationStatus === 'MIXED_UNALLOCATED';
  const isUnclassified = item.category === 'BELUM_DIKLASIFIKASIKAN';
  const counterAccounts = item.counterAccounts ?? [];

  const metaParts: string[] = [];
  if (item.tanggal) metaParts.push(formatDate(item.tanggal));
  if (item.sourceNo) metaParts.push(item.sourceNo);
  if (item.transactionDescription) metaParts.push(item.transactionDescription);
  const kasBankParts = [item.cashAccountCode, item.cashAccountName].filter((v): v is string => Boolean(v));
  const hasMeta = metaParts.length > 0 || kasBankParts.length > 0 || Boolean(item.noJurnal) || Boolean(item.reversalOfNoJurnal);

  return (
    <div className="py-1">
      {/* Baris utama: akun lawan + nilai (negatif = arus kas keluar) */}
      <div className="flex items-start justify-between gap-3 pl-9 pr-2 text-sm">
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="min-w-0 break-words text-muted-foreground">{arusKasItemLabel(item)}</span>
          {isMultiAccount && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Transaksi multi-akun" />}
          {isUnclassified && (
            <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-[10px] text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              Belum diklasifikasi
            </Badge>
          )}
        </span>
        <ArusKasAmount value={item.jumlah} />
      </div>

      {/* Subbaris: tanggal · no sumber · deskripsi · kas/bank · jurnal · pembalik */}
      {hasMeta && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-9 pr-2 pb-0.5 text-[11px] text-muted-foreground">
          {metaParts.length > 0 && <span>{metaParts.join(' · ')}</span>}
          {kasBankParts.length > 0 && <span>Kas/Bank: {kasBankParts.join(' ')}</span>}
          {item.noJurnal && (
            <span>
              Jurnal: <span className="font-mono">{item.noJurnal}</span>
            </span>
          )}
          {item.reversalOfNoJurnal && (
            <Badge variant="secondary" className="py-0 text-[10px] font-normal">
              Pembalik dari <span className="font-mono">{item.reversalOfNoJurnal}</span>
            </Badge>
          )}
        </div>
      )}

      {/* Rincian akun lawan untuk jurnal multi-akun yang belum teralokasi */}
      {isMultiAccount && counterAccounts.length > 0 && (
        <div className="space-y-0.5 py-1 pl-12 pr-2">
          {counterAccounts.map((ca, idx) => (
            <div key={`${ca.accountId ?? ca.accountCode ?? 'counter'}-${idx}`} className="flex flex-wrap items-baseline justify-between gap-x-3 text-[11px] text-muted-foreground">
              <span className="min-w-0">
                <span className="font-mono">{ca.accountCode ?? '—'}</span>
                <span> — {ca.accountName ?? 'Tanpa nama'}</span>
              </span>
              <span className={`shrink-0 tabular-nums ${ca.jumlah >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {ca.jumlah >= 0 ? '+' : ''}
                {formatRp(ca.jumlah)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ArusKasSection({ title, items, total, warning = false, note }: { title: string; items: ArusKasItem[]; total: number; warning?: boolean; note?: string }) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => buildArusKasItemGroups(items), [items]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 mb-2">
        <h3 className={`flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide ${warning ? 'text-amber-600' : 'text-muted-foreground'}`}>
          {warning && <AlertTriangle className="h-4 w-4" />}
          {title}
        </h3>
        {note && <span className={`text-xs ${warning ? 'text-amber-600' : 'text-muted-foreground'}`}>{note}</span>}
      </div>

      {items.length === 0 && <p className="py-1 pl-4 text-xs text-muted-foreground">{note ?? 'Tidak ada data'}</p>}

      {groups.map((group) => {
        const isExpanded = Boolean(expandedGroups[group.key]);
        return (
          <div key={group.key} className="rounded-md bg-muted/30">
            <button type="button" onClick={() => toggleGroup(group.key)} aria-expanded={isExpanded} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/60">
              {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <span className="flex min-w-0 flex-1 items-baseline gap-2">
                {group.code && <span className="shrink-0 font-mono text-xs">{group.code}</span>}
                <span className="min-w-0 truncate text-sm">{group.name}</span>
              </span>
              <Badge variant="outline" className="shrink-0 text-[10px] tabular-nums">
                {group.items.length} transaksi
              </Badge>
              <ArusKasAmount value={group.net} bold />
            </button>
            {isExpanded && (
              <div className="border-t pb-1 pt-0.5">
                {group.items.map((item, idx) => (
                  <ArusKasItemRow key={`${item.journalId ?? 'jurnal'}-${item.accountId ?? item.accountCode ?? 'akun'}-${idx}`} item={item} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div className="flex items-center justify-between px-4 py-1.5 text-sm font-semibold border-t">
        <span>Total {title}</span>
        <ArusKasAmount value={total} bold />
      </div>
    </div>
  );
}

function ArusKasReport() {
  const [dari, setDari] = useState(getFirstDayOfMonth());
  const [sampai, setSampai] = useState(getToday());
  const [data, setData] = useState<ArusKasLaporanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ArusKasLaporanResponse>(`/laporan/arus-kas?dari=${dari}&sampai=${sampai}`);
      setData(res);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal memuat data arus kas.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [dari, sampai]);

  useEffect(() => {
    fetchData();
  }, []);

  const belumDiklasifikasi = data?.belumDiklasifikasikan;
  const jumlahJurnalBelumDiklasifikasi = data?.jumlahJurnalBelumDiklasifikasi ?? 0;
  const tampilkanBelumDiklasifikasi = (belumDiklasifikasi?.items.length ?? 0) > 0 || jumlahJurnalBelumDiklasifikasi > 0;
  // Backend mengirim selisihRekonsiliasi sebagai string Decimal — koersi.
  const selisihRaw = data?.selisihRekonsiliasi;
  const selisihParsed = selisihRaw === undefined || selisihRaw === null ? null : Number(selisihRaw);
  const selisihRekonsiliasi = selisihParsed !== null && Number.isFinite(selisihParsed) ? selisihParsed : null;
  const rekonsiliasiSeimbang = selisihRekonsiliasi === 0;

  return (
    <div className="space-y-4">
      <DateRangeFilter dari={dari} sampai={sampai} onDariChange={setDari} onSampaiChange={setSampai} onSubmit={fetchData} loading={loading} />

      {loading && <ReportSkeleton rows={6} />}
      {error && <ReportError message={error} onRetry={fetchData} />}
      {!loading && !error && data && (
        <>
          {data.periode.dari && data.periode.sampai && (
            <p className="text-xs text-muted-foreground">
              Periode: {formatDate(data.periode.dari)} — {formatDate(data.periode.sampai)}
            </p>
          )}

          <Card>
            <CardContent className="space-y-6 p-6">
              <ArusKasSection title="Arus Kas dari Aktivitas Operasional" items={data.operasional.items} total={data.operasional.total} />
              <ArusKasSection title="Arus Kas dari Aktivitas Investasi" items={data.investasi.items} total={data.investasi.total} />
              <ArusKasSection title="Arus Kas dari Aktivitas Pembiayaan" items={data.pembiayaan.items} total={data.pembiayaan.total} />

              {tampilkanBelumDiklasifikasi && <ArusKasSection title="Belum Diklasifikasi" warning note={jumlahJurnalBelumDiklasifikasi > 0 ? `${jumlahJurnalBelumDiklasifikasi} jurnal belum memiliki klasifikasi arus kas` : undefined} items={belumDiklasifikasi?.items ?? []} total={belumDiklasifikasi?.total ?? 0} />}

              <div className="border-t pt-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Saldo Awal</span>
                  <span>{formatRp(data.saldoAwal)}</span>
                </div>
                <div className="flex items-center justify-between text-sm font-medium">
                  <span>Perubahan Bersih</span>
                  <span className={data.netChange >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                    {data.netChange >= 0 ? '+' : ''}
                    {formatRp(data.netChange)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-base font-bold border-t pt-2">
                  <span>Saldo Akhir</span>
                  <span>{formatRp(data.saldoAkhir)}</span>
                </div>
                {selisihRekonsiliasi !== null && (
                  <div className="flex items-center justify-between gap-2 text-sm border-t pt-2">
                    <span className="text-muted-foreground">Selisih Rekonsiliasi</span>
                    {rekonsiliasiSeimbang ? (
                      <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
                        <CheckCircle2 className="h-3 w-3" />0 · Seimbang
                      </Badge>
                    ) : (
                      <Badge className="gap-1 bg-amber-500 text-white hover:bg-amber-500">
                        <AlertTriangle className="h-3 w-3" />
                        {formatRp(selisihRekonsiliasi)} · Perlu diperiksa
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Sub-page: Rincian Buku Besar
// ═════════════════════════════════════════════════════════════════════════════

function BukuBesarReport() {
  const [akunId, setAkunId] = useState('');
  const [dari, setDari] = useState(getFirstDayOfMonth());
  const [sampai, setSampai] = useState(getToday());
  const [coaOptions, setCoaOptions] = useState<COADropdownResponse[]>([]);
  const [coaLoading, setCoaLoading] = useState(false);
  const [data, setData] = useState<BukuBesarLaporanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  const fetchCOA = useCallback(async () => {
    setCoaLoading(true);
    try {
      const res = await api.get<COADropdownResponse[]>('/master/coa-dropdown');
      setCoaOptions(res);
    } catch {
      toast.error('Gagal memuat daftar akun.');
    } finally {
      setCoaLoading(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!akunId) {
      toast.error('Pilih akun terlebih dahulu.');
      return;
    }
    setLoading(true);
    setError(null);
    setFetched(true);
    try {
      const res = await api.get<BukuBesarLaporanResponse>(`/laporan/buku-besar?akun_id=${akunId}&dari=${dari}&sampai=${sampai}`);
      setData(res);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal memuat data buku besar.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [akunId, dari, sampai]);

  useEffect(() => {
    fetchCOA();
  }, [fetchCOA]);

  const dropdownOptions = coaOptions.map((c) => ({
    id: c.id,
    label: `${c.kode} — ${c.nama}`,
    subtitle: `${c.header} · ${c.tingkat}`
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-4">
        <div className="flex flex-col gap-1.5 flex-1 min-w-[240px]">
          <Label className="text-xs font-medium text-muted-foreground">Akun Perkiraan</Label>
          <SearchableDropdown value={akunId} onValueChange={setAkunId} options={dropdownOptions} placeholder="Pilih akun..." loading={coaLoading} disabled={coaLoading} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Dari Tanggal</Label>
          <Input type="date" value={dari} onChange={(e) => setDari(e.target.value)} className="w-44" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Sampai Tanggal</Label>
          <Input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} className="w-44" />
        </div>
        <Button onClick={fetchData} disabled={loading || !akunId} size="sm">
          {loading ? 'Memuat...' : 'Tampilkan'}
        </Button>
      </div>

      {loading && <ReportSkeleton rows={6} />}
      {error && <ReportError message={error} onRetry={fetchData} />}
      {!loading && !error && !fetched && <EmptyTable message="Pilih akun dan klik Tampilkan untuk melihat rincian buku besar." />}
      {!loading && !error && fetched && data && (
        <>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              Akun: <strong>{data.akun.kode}</strong> — {data.akun.nama}
            </span>
            {data.periode.dari && data.periode.sampai && (
              <span>
                Periode: {formatDate(data.periode.dari)} — {formatDate(data.periode.sampai)}
              </span>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="max-h-[70vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Tanggal</TableHead>
                      <TableHead className="w-32">No. Jurnal</TableHead>
                      <TableHead>Deskripsi</TableHead>
                      <TableHead className="text-right w-32">Debit</TableHead>
                      <TableHead className="text-right w-32">Kredit</TableHead>
                      <TableHead className="text-right w-32">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="bg-muted/50">
                      <TableCell colSpan={3} className="font-medium text-sm">
                        Saldo Awal
                      </TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell className="text-right font-medium">{formatRp(data.saldoAwal)}</TableCell>
                    </TableRow>

                    {data.transaksi.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="p-0">
                          <EmptyState icon={FileBarChart} title="Tidak ada transaksi pada periode ini" description="Coba ubah periode atau pilih akun lain." />
                        </TableCell>
                      </TableRow>
                    )}

                    {data.transaksi.map((t, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs">{formatDate(t.tanggal)}</TableCell>
                        <TableCell className="font-mono text-xs">{t.noJurnal}</TableCell>
                        <TableCell className="text-sm">{t.deskripsi}</TableCell>
                        <TableCell className="text-right">{t.debit > 0 ? formatRp(t.debit) : '-'}</TableCell>
                        <TableCell className="text-right">{t.kredit > 0 ? formatRp(t.kredit) : '-'}</TableCell>
                        <TableCell className="text-right font-medium">{formatRp(t.saldo)}</TableCell>
                      </TableRow>
                    ))}

                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell colSpan={3} className="text-right">
                        Total Debit
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatRp(data.totalDebit)}</TableCell>
                      <TableCell />
                      <TableCell />
                    </TableRow>
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell colSpan={3} className="text-right">
                        Total Kredit
                      </TableCell>
                      <TableCell />
                      <TableCell className="text-right font-semibold">{formatRp(data.totalKredit)}</TableCell>
                      <TableCell />
                    </TableRow>
                    <TableRow className="bg-primary/10">
                      <TableCell colSpan={3} className="text-right font-bold">
                        Saldo Akhir
                      </TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell className="text-right font-bold">{formatRp(data.saldoAkhir)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Sub-page: Mutasi Kas (raw snake_case response)
// ═════════════════════════════════════════════════════════════════════════════

function MutasiKasReport() {
  const [dari, setDari] = useState(getFirstDayOfMonth());
  const [sampai, setSampai] = useState(getToday());
  const [data, setData] = useState<MutasiRawResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<MutasiRawResponse>(`/laporan/mutasi-kas?dari=${dari}&sampai=${sampai}`);
      setData(res);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal memuat data mutasi kas.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [dari, sampai]);

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="space-y-4">
      <DateRangeFilter dari={dari} sampai={sampai} onDariChange={setDari} onSampaiChange={setSampai} onSubmit={fetchData} loading={loading} />

      {loading && <ReportSkeleton rows={6} />}
      {error && <ReportError message={error} onRetry={fetchData} />}
      {!loading && !error && data && (
        <>
          {data.periode.dari && data.periode.sampai && (
            <p className="text-xs text-muted-foreground">
              Periode: {formatDate(data.periode.dari)} — {formatDate(data.periode.sampai)}
            </p>
          )}

          <Card>
            <CardContent className="p-0">
              <div className="max-h-[70vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Tanggal</TableHead>
                      <TableHead className="w-32">No. Jurnal</TableHead>
                      <TableHead>Akun</TableHead>
                      <TableHead>Deskripsi</TableHead>
                      <TableHead className="text-right w-32">Debit</TableHead>
                      <TableHead className="text-right w-32">Kredit</TableHead>
                      <TableHead className="text-right w-32">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.transaksi.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="p-0">
                          <EmptyState icon={FileBarChart} title="Tidak ada transaksi mutasi kas" description="Tidak ada transaksi mutasi kas pada periode ini. Coba ubah periode laporan." />
                        </TableCell>
                      </TableRow>
                    )}

                    {data.transaksi.map((t, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs">{formatDate(t.tanggal)}</TableCell>
                        <TableCell className="font-mono text-xs">{t.noJurnal}</TableCell>
                        <TableCell className="text-sm">
                          <Badge variant="outline" className="font-mono text-xs">
                            {t.akun}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{t.deskripsi}</TableCell>
                        <TableCell className="text-right">{t.debit > 0 ? formatRp(t.debit) : '-'}</TableCell>
                        <TableCell className="text-right">{t.kredit > 0 ? formatRp(t.kredit) : '-'}</TableCell>
                        <TableCell className="text-right font-medium">{formatRp(t.saldo)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Sub-page: Mutasi Bank (raw snake_case response)
// ═════════════════════════════════════════════════════════════════════════════

function MutasiBankReport() {
  const [dari, setDari] = useState(getFirstDayOfMonth());
  const [sampai, setSampai] = useState(getToday());
  const [data, setData] = useState<MutasiRawResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<MutasiRawResponse>(`/laporan/mutasi-bank?dari=${dari}&sampai=${sampai}`);
      setData(res);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal memuat data mutasi bank.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [dari, sampai]);

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="space-y-4">
      <DateRangeFilter dari={dari} sampai={sampai} onDariChange={setDari} onSampaiChange={setSampai} onSubmit={fetchData} loading={loading} />

      {loading && <ReportSkeleton rows={6} />}
      {error && <ReportError message={error} onRetry={fetchData} />}
      {!loading && !error && data && (
        <>
          {data.periode.dari && data.periode.sampai && (
            <p className="text-xs text-muted-foreground">
              Periode: {formatDate(data.periode.dari)} — {formatDate(data.periode.sampai)}
            </p>
          )}

          <Card>
            <CardContent className="p-0">
              <div className="max-h-[70vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Tanggal</TableHead>
                      <TableHead className="w-32">No. Jurnal</TableHead>
                      <TableHead>Akun</TableHead>
                      <TableHead>Deskripsi</TableHead>
                      <TableHead className="text-right w-32">Debit</TableHead>
                      <TableHead className="text-right w-32">Kredit</TableHead>
                      <TableHead className="text-right w-32">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.transaksi.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="p-0">
                          <EmptyState icon={FileBarChart} title="Tidak ada transaksi mutasi bank" description="Tidak ada transaksi mutasi bank pada periode ini. Coba ubah periode laporan." />
                        </TableCell>
                      </TableRow>
                    )}

                    {data.transaksi.map((t, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs">{formatDate(t.tanggal)}</TableCell>
                        <TableCell className="font-mono text-xs">{t.noJurnal}</TableCell>
                        <TableCell className="text-sm">
                          <Badge variant="outline" className="font-mono text-xs">
                            {t.akun}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{t.deskripsi}</TableCell>
                        <TableCell className="text-right">{t.debit > 0 ? formatRp(t.debit) : '-'}</TableCell>
                        <TableCell className="text-right">{t.kredit > 0 ? formatRp(t.kredit) : '-'}</TableCell>
                        <TableCell className="text-right font-medium">{formatRp(t.saldo)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Sub-page: Rekap Kas & Bank
// ═════════════════════════════════════════════════════════════════════════════

function RekapKasBankReport() {
  const [dari, setDari] = useState(getFirstDayOfMonth());
  const [sampai, setSampai] = useState(getToday());
  const [data, setData] = useState<RekapKasBankLaporanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<RekapKasBankLaporanResponse>(`/laporan/rekap-kas-bank?dari=${dari}&sampai=${sampai}`);
      setData(res);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal memuat rekap kas & bank.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [dari, sampai]);

  useEffect(() => {
    fetchData();
  }, []);

  const totalSaldoAwal = data ? data.akun.reduce((s, a) => s + a.saldoAwal, 0) : 0;
  const totalMasuk = data ? data.akun.reduce((s, a) => s + a.totalMasuk, 0) : 0;
  const totalKeluar = data ? data.akun.reduce((s, a) => s + a.totalKeluar, 0) : 0;
  const totalSaldoAkhir = data ? data.akun.reduce((s, a) => s + a.saldoAkhir, 0) : 0;

  return (
    <div className="space-y-4">
      <DateRangeFilter dari={dari} sampai={sampai} onDariChange={setDari} onSampaiChange={setSampai} onSubmit={fetchData} loading={loading} />

      {loading && <ReportSkeleton rows={4} />}
      {error && <ReportError message={error} onRetry={fetchData} />}
      {!loading && !error && data && (
        <>
          {data.periode.dari && data.periode.sampai && (
            <p className="text-xs text-muted-foreground">
              Periode: {formatDate(data.periode.dari)} — {formatDate(data.periode.sampai)}
            </p>
          )}

          <Card>
            <CardContent className="p-0">
              <div className="max-h-[70vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">No</TableHead>
                      <TableHead>Kode</TableHead>
                      <TableHead>Nama Akun</TableHead>
                      <TableHead className="w-20 text-center">Jenis</TableHead>
                      <TableHead className="text-right">Saldo Awal</TableHead>
                      <TableHead className="text-right">Total Masuk</TableHead>
                      <TableHead className="text-right">Total Keluar</TableHead>
                      <TableHead className="text-right">Saldo Akhir</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.akun.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="p-0">
                          <EmptyState icon={FileBarChart} title="Tidak ada data pada periode ini" description="Coba ubah periode laporan atau pilih kas/bank lain." />
                        </TableCell>
                      </TableRow>
                    )}

                    {data.akun.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                        <TableCell className="font-mono text-xs">{item.kode}</TableCell>
                        <TableCell className="text-sm">{item.nama}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={item.jenis.toUpperCase() === 'KAS' ? 'default' : 'secondary'} className="text-xs">
                            {item.jenis}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatRp(item.saldoAwal)}</TableCell>
                        <TableCell className="text-right text-emerald-600">{formatRp(item.totalMasuk)}</TableCell>
                        <TableCell className="text-right text-red-500">{formatRp(item.totalKeluar)}</TableCell>
                        <TableCell className="text-right font-medium">{formatRp(item.saldoAkhir)}</TableCell>
                      </TableRow>
                    ))}

                    {/* Grand totals */}
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell colSpan={4} className="text-right">
                        Total
                      </TableCell>
                      <TableCell className="text-right">{formatRp(totalSaldoAwal)}</TableCell>
                      <TableCell className="text-right text-emerald-600">{formatRp(totalMasuk)}</TableCell>
                      <TableCell className="text-right text-red-500">{formatRp(totalKeluar)}</TableCell>
                      <TableCell className="text-right font-bold">{formatRp(totalSaldoAkhir)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Sub-page: Neraca Saldo (Trial Balance)
// ═════════════════════════════════════════════════════════════════════════════

function NeracaSaldoReport() {
  const [dari, setDari] = useState(getFirstDayOfMonth());
  const [sampai, setSampai] = useState(getToday());
  const [data, setData] = useState<NeracaSaldoResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<NeracaSaldoResponse>(`/laporan/neraca-saldo?dari=${dari}&sampai=${sampai}`);
      setData(res);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal memuat neraca saldo.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [dari, sampai]);

  useEffect(() => {
    fetchData();
  }, []);

  const isBalanced = data ? data.selisih === 0 : true;

  return (
    <div className="space-y-4">
      <DateRangeFilter dari={dari} sampai={sampai} onDariChange={setDari} onSampaiChange={setSampai} onSubmit={fetchData} loading={loading} />
      {loading && <ReportSkeleton rows={6} />}
      {error && <ReportError message={error} onRetry={fetchData} />}
      {!loading && !error && data && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Periode: {formatDate(data.periode.dari)} — {formatDate(data.periode.sampai)}
            </p>
            <Badge variant={isBalanced ? 'default' : 'destructive'} className="gap-1">
              {isBalanced ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
              {isBalanced ? 'Balance' : `Selisih: ${formatRp(data.selisih)}`}
            </Badge>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="max-h-[70vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">No</TableHead>
                      <TableHead>Kode Akun</TableHead>
                      <TableHead>Nama Akun</TableHead>
                      <TableHead className="w-20 text-center">Normal</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Kredit</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.akun.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="p-0">
                          <EmptyState icon={FileBarChart} title="Tidak ada transaksi pada periode ini" description="Belum ada transaksi yang tercatat untuk periode ini. Coba ubah periode laporan." />
                        </TableCell>
                      </TableRow>
                    )}
                    {data.akun.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                        <TableCell className="font-mono text-xs">{item.kodeAkun}</TableCell>
                        <TableCell>{item.namaAkun}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {item.saldoNormal}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{item.totalDebit > 0 ? formatRp(item.totalDebit) : '-'}</TableCell>
                        <TableCell className="text-right">{item.totalKredit > 0 ? formatRp(item.totalKredit) : '-'}</TableCell>
                        <TableCell className="text-right font-medium">{formatRp(item.saldo)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-primary/10 font-bold">
                      <TableCell colSpan={4} className="text-right">
                        Grand Total
                      </TableCell>
                      <TableCell className="text-right">{formatRp(data.totalDebit)}</TableCell>
                      <TableCell className="text-right">{formatRp(data.totalKredit)}</TableCell>
                      <TableCell className="text-right">{formatRp(data.totalDebit - data.totalKredit)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Sub-page: Perubahan Modal (Statement of Changes in Equity)
// ═════════════════════════════════════════════════════════════════════════════

function PerubahanModalReport() {
  const [dari, setDari] = useState(getFirstDayOfMonth());
  const [sampai, setSampai] = useState(getToday());
  const [data, setData] = useState<PerubahanModalResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<PerubahanModalResponse>(`/laporan/perubahan-modal?dari=${dari}&sampai=${sampai}`);
      setData(res);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal memuat perubahan modal.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [dari, sampai]);

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="space-y-4">
      <DateRangeFilter dari={dari} sampai={sampai} onDariChange={setDari} onSampaiChange={setSampai} onSubmit={fetchData} loading={loading} />
      {loading && <ReportSkeleton rows={6} />}
      {error && <ReportError message={error} onRetry={fetchData} />}
      {!loading && !error && data && (
        <>
          <p className="text-xs text-muted-foreground">
            Periode: {formatDate(data.periode.dari)} — {formatDate(data.periode.sampai)}
          </p>
          <Card>
            <CardContent className="p-0">
              <div className="max-h-[70vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">No</TableHead>
                      <TableHead>Kode Akun</TableHead>
                      <TableHead>Nama Akun</TableHead>
                      <TableHead className="text-right">Saldo Awal</TableHead>
                      <TableHead className="text-right">Mutasi D</TableHead>
                      <TableHead className="text-right">Mutasi K</TableHead>
                      <TableHead className="text-right">Perubahan</TableHead>
                      <TableHead className="text-right">Saldo Akhir</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.akunModal.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="p-0">
                          <EmptyState icon={FileBarChart} title="Tidak ada akun modal" description="Tidak ada akun modal pada periode ini. Coba ubah periode laporan." />
                        </TableCell>
                      </TableRow>
                    )}
                    {data.akunModal.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                        <TableCell className="font-mono text-xs">{item.kodeAkun}</TableCell>
                        <TableCell className="pl-6">{item.namaAkun}</TableCell>
                        <TableCell className="text-right">{formatRp(item.saldoAwal)}</TableCell>
                        <TableCell className="text-right">{item.mutasiDebit > 0 ? formatRp(item.mutasiDebit) : '-'}</TableCell>
                        <TableCell className="text-right">{item.mutasiKredit > 0 ? formatRp(item.mutasiKredit) : '-'}</TableCell>
                        <TableCell className={`text-right font-medium ${item.perubahan >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatRp(item.perubahan)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatRp(item.saldoAkhir)}</TableCell>
                      </TableRow>
                    ))}
                    {/* Laba/Rugi Berjalan */}
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={2}></TableCell>
                      <TableCell className="pl-6 font-medium">Laba/(Rugi) Berjalan</TableCell>
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                      <TableCell className={`text-right font-medium ${data.labaRugiBerjalan >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatRp(data.labaRugiBerjalan)}</TableCell>
                      <TableCell />
                    </TableRow>
                    <TableRow className="bg-primary/10">
                      <TableCell colSpan={7} className="text-right font-bold">
                        Total Modal Akhir
                      </TableCell>
                      <TableCell className="text-right font-bold">{formatRp(data.totalModalAkhir)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Sub-page: Umur Piutang (Aging Receivables)
// ═════════════════════════════════════════════════════════════════════════════

function UmurPiutangReport() {
  const [tanggal, setTanggal] = useState(getToday());
  const [data, setData] = useState<UmurPiutangResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<UmurPiutangResponse>(`/laporan/umur-piutang?as_of=${tanggal}`);
      setData(res);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal memuat umur piutang.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [tanggal]);

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="space-y-4">
      <SingleDateFilter tanggal={tanggal} onTanggalChange={setTanggal} onSubmit={fetchData} loading={loading} />
      {loading && <ReportSkeleton rows={6} />}
      {error && <ReportError message={error} onRetry={fetchData} />}
      {!loading && !error && data && (
        <>
          <p className="text-xs text-muted-foreground">Posisi: {formatDate(data.asOfDate)}</p>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: 'Belum JT', value: data.totalBelumJatuhTempo, color: 'text-emerald-600' },
              { label: '1–30 Hari', value: data.totalUmur130, color: 'text-yellow-600' },
              { label: '31–60 Hari', value: data.totalUmur3160, color: 'text-orange-500' },
              { label: '61–90 Hari', value: data.totalUmur6190, color: 'text-red-500' },
              { label: '> 90 Hari', value: data.totalUmur91Plus, color: 'text-red-700' }
            ].map((b) => (
              <Card key={b.label}>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">{b.label}</p>
                  <p className={`text-lg font-bold ${b.color}`}>{formatRp(b.value)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="max-h-[70vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pelanggan</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Belum JT</TableHead>
                      <TableHead className="text-right">1–30</TableHead>
                      <TableHead className="text-right">31–60</TableHead>
                      <TableHead className="text-right">61–90</TableHead>
                      <TableHead className="text-right">{'>'}90</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="p-0">
                          <EmptyState icon={FileBarChart} title="Tidak ada piutang" description="Belum ada data piutang untuk periode ini. Coba ubah periode laporan." />
                        </TableCell>
                      </TableRow>
                    )}
                    {data.items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{item.nama}</TableCell>
                        <TableCell className="text-right font-semibold">{formatRp(item.total)}</TableCell>
                        <TableCell className="text-right text-emerald-600">{formatRp(item.belumJatuhTempo)}</TableCell>
                        <TableCell className="text-right text-yellow-600">{formatRp(item.umur130)}</TableCell>
                        <TableCell className="text-right text-orange-500">{formatRp(item.umur3160)}</TableCell>
                        <TableCell className="text-right text-red-500">{formatRp(item.umur6190)}</TableCell>
                        <TableCell className="text-right text-red-700">{formatRp(item.umur91Plus)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-primary/10 font-bold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{formatRp(data.total)}</TableCell>
                      <TableCell className="text-right">{formatRp(data.totalBelumJatuhTempo)}</TableCell>
                      <TableCell className="text-right">{formatRp(data.totalUmur130)}</TableCell>
                      <TableCell className="text-right">{formatRp(data.totalUmur3160)}</TableCell>
                      <TableCell className="text-right">{formatRp(data.totalUmur6190)}</TableCell>
                      <TableCell className="text-right">{formatRp(data.totalUmur91Plus)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Sub-page: Umur Hutang (Aging Payables)
// ═════════════════════════════════════════════════════════════════════════════

function UmurHutangReport() {
  const [tanggal, setTanggal] = useState(getToday());
  const [data, setData] = useState<UmurHutangResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<UmurHutangResponse>(`/laporan/umur-hutang?as_of=${tanggal}`);
      setData(res);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal memuat umur hutang.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [tanggal]);

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="space-y-4">
      <SingleDateFilter tanggal={tanggal} onTanggalChange={setTanggal} onSubmit={fetchData} loading={loading} />
      {loading && <ReportSkeleton rows={6} />}
      {error && <ReportError message={error} onRetry={fetchData} />}
      {!loading && !error && data && (
        <>
          <p className="text-xs text-muted-foreground">Posisi: {formatDate(data.asOfDate)}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: 'Belum JT', value: data.totalBelumJatuhTempo, color: 'text-emerald-600' },
              { label: '1–30 Hari', value: data.totalUmur130, color: 'text-yellow-600' },
              { label: '31–60 Hari', value: data.totalUmur3160, color: 'text-orange-500' },
              { label: '61–90 Hari', value: data.totalUmur6190, color: 'text-red-500' },
              { label: '> 90 Hari', value: data.totalUmur91Plus, color: 'text-red-700' }
            ].map((b) => (
              <Card key={b.label}>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">{b.label}</p>
                  <p className={`text-lg font-bold ${b.color}`}>{formatRp(b.value)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="max-h-[70vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Belum JT</TableHead>
                      <TableHead className="text-right">1–30</TableHead>
                      <TableHead className="text-right">31–60</TableHead>
                      <TableHead className="text-right">61–90</TableHead>
                      <TableHead className="text-right">{'>'}90</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="p-0">
                          <EmptyState icon={FileBarChart} title="Tidak ada hutang" description="Belum ada data hutang untuk periode ini. Coba ubah periode laporan." />
                        </TableCell>
                      </TableRow>
                    )}
                    {data.items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{item.nama}</TableCell>
                        <TableCell className="text-right font-semibold">{formatRp(item.total)}</TableCell>
                        <TableCell className="text-right text-emerald-600">{formatRp(item.belumJatuhTempo)}</TableCell>
                        <TableCell className="text-right text-yellow-600">{formatRp(item.umur130)}</TableCell>
                        <TableCell className="text-right text-orange-500">{formatRp(item.umur3160)}</TableCell>
                        <TableCell className="text-right text-red-500">{formatRp(item.umur6190)}</TableCell>
                        <TableCell className="text-right text-red-700">{formatRp(item.umur91Plus)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-primary/10 font-bold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{formatRp(data.total)}</TableCell>
                      <TableCell className="text-right">{formatRp(data.totalBelumJatuhTempo)}</TableCell>
                      <TableCell className="text-right">{formatRp(data.totalUmur130)}</TableCell>
                      <TableCell className="text-right">{formatRp(data.totalUmur3160)}</TableCell>
                      <TableCell className="text-right">{formatRp(data.totalUmur6190)}</TableCell>
                      <TableCell className="text-right">{formatRp(data.totalUmur91Plus)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Sub-page: Laporan Lainnya (quick links to all reports)
// ═════════════════════════════════════════════════════════════════════════════

function LaporanLainnya() {
  const openNavTab = useTabStore((s) => s.openNavTab);
  const reports = [
    { id: 'laba-rugi', title: 'Laporan Laba / Rugi', desc: 'Laporan pendapatan dan beban periode tertentu', icon: TrendingUp },
    { id: 'neraca', title: 'Neraca', desc: 'Posisi keuangan (aktiva, kewajiban, modal) per tanggal', icon: Scale },
    { id: 'arus-kas', title: 'Laporan Arus Kas', desc: 'Arus kas masuk dan keluar per periode', icon: Wallet },
    { id: 'neraca-saldo', title: 'Neraca Saldo', desc: 'Daftar saldo semua akun perkiraan', icon: BookOpen },
    { id: 'perubahan-modal', title: 'Perubahan Modal', desc: 'Perubahan ekuitas pemilik per periode', icon: PieChart },
    { id: 'rincian-buku-besar', title: 'Rincian Buku Besar', desc: 'Transaksi detail per akun perkiraan', icon: FileText },
    { id: 'umur-piutang', title: 'Umur Piutang', desc: 'Analisa usia piutang pelanggan', icon: Clock },
    { id: 'umur-hutang', title: 'Umur Hutang', desc: 'Analisa usia hutang supplier', icon: Clock },
    { id: 'mutasi-kas', title: 'Mutasi Kas', desc: 'Mutasi transaksi kas per periode', icon: ArrowLeftRight },
    { id: 'mutasi-bank', title: 'Mutasi Bank', desc: 'Mutasi transaksi bank per periode', icon: ArrowLeftRight },
    { id: 'rekap-kas-bank', title: 'Rekap Kas & Bank', desc: 'Rekapitulasi saldo dan mutasi kas/bank', icon: FileSpreadsheet },
    { id: 'penutupan-periode', title: 'Penutupan Periode', desc: 'Tutup/buka periode akuntansi bulanan', icon: Calendar },
    { id: 'rekonsiliasi-aset', title: 'Rekonsiliasi Aset', desc: 'Rekonsiliasi Asset Register vs GL', icon: Scale },
    { id: 'rekonsiliasi-grni', title: 'GRNI vs GL', desc: 'Rekonsiliasi Open GRNI vs GRNI GL', icon: Scale },
    { id: 'rekonsiliasi-cf-bs', title: 'Cash Flow vs Neraca', desc: 'Cash Flow Ending vs Balance Sheet Cash', icon: Scale },
    { id: 'rekonsiliasi-eq-bs', title: 'Ekuitas vs Neraca', desc: 'Equity Closing vs Balance Sheet Equity', icon: Scale },
    { id: 'accounting-health', title: 'Accounting Health', desc: 'Dashboard 11 reconciliation checks', icon: Activity }
  ];
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Pilih laporan dari daftar di bawah untuk melihat detail. Semua laporan mendukung pencetakan (Cetak) dan ekspor data (Export CSV).</p>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map((r) => {
          const Icon = r.icon;
          return (
            <Card key={r.id} className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all" onClick={() => openNavTab('reports', r.id, r.title)}>
              <CardContent className="p-4 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{r.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{r.desc}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Main Component
// ═════════════════════════════════════════════════════════════════════════════

export default function ReportsModule({ subPage: propsSubPage, refreshKey, formMode, formProps }: { subPage?: string; refreshKey?: number; formMode?: string; formProps?: Record<string, unknown> }) {
  const { activeSubPage } = useERPStore();
  const subPage = propsSubPage || activeSubPage || 'laba-rugi';

  const renderSubPage = () => {
    switch (subPage) {
      case 'laba-rugi':
        return <LabaRugiReport />;
      case 'neraca':
        return <NeracaReport />;
      case 'arus-kas':
        return <ArusKasReport />;
      case 'neraca-saldo':
        return <NeracaSaldoReport />;
      case 'perubahan-modal':
        return <PerubahanModalReport />;
      case 'rincian-buku-besar':
        return <BukuBesarReport />;
      case 'umur-piutang':
        return <UmurPiutangReport />;
      case 'umur-hutang':
        return <UmurHutangReport />;
      case 'mutasi-kas':
        return <MutasiKasReport />;
      case 'mutasi-bank':
        return <MutasiBankReport />;
      case 'rekap-kas-bank':
        return <RekapKasBankReport />;
      case 'penutupan-periode':
        return <PenutupanPeriodePage refreshKey={refreshKey} formMode={formMode} formProps={formProps} />;
      case 'rekonsiliasi-persediaan':
        return <RekonsiliasiPersediaanPage />;
      case 'audit-persediaan':
        return <AuditPersediaanPage />;
      case 'rekonsiliasi-aset':
        return <AssetReconciliationPage />;
      case 'accounting-health':
        return <AccountingHealthPage />;
      case 'histori-dokumen-terhapus':
        return <HistoriDokumenTerhapusPage />;
      case 'rekonsiliasi-grni':
        return <ReconciliationDetailPage subPage="rekonsiliasi-grni" />;
      case 'rekonsiliasi-cf-bs':
        return <ReconciliationDetailPage subPage="rekonsiliasi-cf-bs" />;
      case 'rekonsiliasi-eq-bs':
        return <ReconciliationDetailPage subPage="rekonsiliasi-eq-bs" />;
      case 'laporan-lainnya':
        return <LaporanLainnya />;
      default:
        return <LabaRugiReport />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Laporan</h1>
        <p className="text-muted-foreground">Laporan keuangan dan operasional perusahaan</p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{subPageTitles[subPage] || 'Laporan'}</h2>
          <ReportActions reportName={subPage} />
        </div>
        {renderSubPage()}
      </div>
    </div>
  );
}
