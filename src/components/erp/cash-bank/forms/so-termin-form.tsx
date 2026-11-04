'use client';

// ═════════════════════════════════════════════════════════════════════════════
// PEMBAYARAN TERMIN SALES ORDER — Update #031.
// Form embedded di Penerimaan (Kas & Bank) untuk jenis transaksi TERMIN_SO:
// pilih Sales Order → termin yang BELUM dibayar → kas/bank + tanggal → akun
// lawan (default Uang Muka Penjualan, bisa diganti) → simpan → PenerimaanKas
// dibuat + jurnal D Kas/Bank, K akun lawan. Satu SO bisa dipanggil BERKALI-
// KALI (tiap penerimaan membayar SATU termin).
// Self-contained (punya field & submit sendiri — pola EmbeddedSettlementForm).
// ═════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SearchableDropdown, type SearchableDropdownOption } from '@/components/ui/searchable-dropdown';
import { Loader2, Info, HandCoins, FileText } from 'lucide-react';
import { formatRp, todayStr } from '@/lib/pdf-utils';
import { api, ApiError } from '@/lib/api';
import { loadSystemCOA } from '@/lib/coa';
import { toast } from 'sonner';
import { useTabStore } from '@/store/tab-store';
import type { SoTerminOpenItem, SoTerminResponse, PenerimaanKasResponse, KasBankAkunResponse, NomorPreviewResponse } from '@/types/api';

interface Props {
  onFinished?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function SoTerminForm({ onFinished, onDirtyChange }: Props) {
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  const [kasBankOptions, setKasBankOptions] = useState<KasBankAkunResponse[]>([]);
  const [kasBankId, setKasBankId] = useState('');
  const [tanggal, setTanggal] = useState(todayStr());
  const [noNukti, setNoNukti] = useState('');
  const [nomorPreview, setNomorPreview] = useState('');
  const [nomorPreviewLoading, setNomorPreviewLoading] = useState(false);

  const [soOptions, setSoOptions] = useState<SoTerminOpenItem[]>([]);
  const [soLoading, setSoLoading] = useState(true);
  const [selectedSoId, setSelectedSoId] = useState('');
  const [termins, setTermins] = useState<SoTerminResponse[]>([]);
  const [terminLoading, setTerminLoading] = useState(false);
  const [selectedTerminId, setSelectedTerminId] = useState('');

  // Akun lawan jurnal (K) — kosong = default Setting Akun (Uang Muka Penjualan).
  const [akunLawanId, setAkunLawanId] = useState('');
  const [coaOptions, setCoaOptions] = useState<SearchableDropdownOption[]>([]);
  const [coaLoading, setCoaLoading] = useState(false);

  const [catatan, setCatatan] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedSo = useMemo(() => soOptions.find((s) => s.salesOrderId === selectedSoId) || null, [soOptions, selectedSoId]);
  const selectedTermin = useMemo(() => termins.find((t) => t.id === selectedTerminId) || null, [termins, selectedTerminId]);
  const selectedKasBank = useMemo(() => kasBankOptions.find((k) => k.id === kasBankId) || null, [kasBankOptions, kasBankId]);

  // ── Muat dropdown: kas/bank + COA + daftar SO dengan termin belum dibayar ──
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setSoLoading(true);
      setCoaLoading(true);
      try {
        const [kb, coa, sos] = await Promise.all([api.get<KasBankAkunResponse[]>('/master/kas-bank-dropdown'), loadSystemCOA(), api.get<SoTerminOpenItem[]>('/penjualan/sales-order/termin-open?limit=200')]);
        if (cancelled) return;
        setKasBankOptions(kb || []);
        setCoaOptions((Array.isArray(coa) ? coa : []).map((a) => ({ id: a.id, label: a.nama, subtitle: a.kode })));
        setSoOptions(Array.isArray(sos) ? sos : []);
      } catch {
        if (!cancelled) {
          setKasBankOptions([]);
          setCoaOptions([]);
          setSoOptions([]);
        }
      } finally {
        if (!cancelled) {
          setSoLoading(false);
          setCoaLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Preview nomor penerimaan (REC ASI/YYYY/NNN — jenis TERMIN_SO) ──
  useEffect(() => {
    let cancelled = false;
    setNomorPreviewLoading(true);
    api
      .get<NomorPreviewResponse>(`/kas-bank/penerimaan/next-nomor?jenis=TERMIN_SO&tanggal=${tanggal}`)
      .then((res) => {
        if (!cancelled) setNomorPreview(res.nomor);
      })
      .catch(() => {
        if (!cancelled) setNomorPreview('');
      })
      .finally(() => {
        if (!cancelled) setNomorPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tanggal]);

  // ── Muat termin SO yang dipilih (status bayar per baris) ──
  useEffect(() => {
    if (!selectedSoId) {
      setTermins([]);
      setSelectedTerminId('');
      return;
    }
    let cancelled = false;
    setTerminLoading(true);
    api
      .get<SoTerminResponse[]>(`/penjualan/sales-order/${selectedSoId}/termin`)
      .then((rows) => {
        if (cancelled) return;
        setTermins(Array.isArray(rows) ? rows : []);
        const firstOpen = (Array.isArray(rows) ? rows : []).find((t) => !t.penerimaanKasId);
        setSelectedTerminId(firstOpen?.id || '');
      })
      .catch(() => {
        if (!cancelled) setTermins([]);
      })
      .finally(() => {
        if (!cancelled) setTerminLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSoId]);

  useEffect(() => {
    onDirtyChange?.(!!selectedSoId || !!catatan || !!kasBankId);
  }, [selectedSoId, catatan, kasBankId, onDirtyChange]);

  const handleSubmit = useCallback(async () => {
    if (!selectedSoId || !selectedTerminId) {
      toast.error('Pilih Sales Order dan termin yang akan dibayar');
      return;
    }
    if (!kasBankId) {
      toast.error('Pilih kas/bank tujuan penerimaan');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<PenerimaanKasResponse>(`/penjualan/sales-order/${selectedSoId}/terima-pembayaran`, {
        terminId: selectedTerminId,
        kasBankId,
        tanggal: `${tanggal || todayStr()}T00:00:00`,
        akunPerkiraanId: akunLawanId || null,
        noNukti: noNukti.trim() || null,
        catatan: catatan.trim() || null
      });
      toast.success(`Penerimaan ${res.noBukti} tersimpan`, {
        description: `Termin SO ${selectedSo?.noPesanan || ''} — ${formatRp(Number(res.totalNilai) || 0)}`
      });
      refreshListTab('cash-bank', 'penerimaan');
      onFinished?.();
      if (activeTabId) closeTab(activeTabId);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Gagal menyimpan penerimaan termin SO');
    } finally {
      setSubmitting(false);
    }
  }, [selectedSoId, selectedTerminId, kasBankId, tanggal, akunLawanId, noNukti, catatan, selectedSo, refreshListTab, onFinished, activeTabId, closeTab]);

  return (
    <div className="space-y-4">
      <Card className="border-amber-200 bg-amber-50/40">
        <CardContent className="flex items-start gap-3 p-4">
          <HandCoins className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-amber-900">Pembayaran Termin Sales Order</p>
            <p className="text-xs leading-relaxed text-amber-800">
              Pilih Sales Order lalu termin yang belum dibayar (DP / cicilan). Jurnal: <span className="font-medium">D Kas/Bank · K {akunLawanId ? 'akun terpilih' : 'Uang Muka Penjualan (default)'}</span> — akun lawan bisa diganti di bawah. Satu SO bisa dibayar berkali-kali (tiap penerimaan = satu termin).
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">
            Disimpan ke <span className="text-destructive">*</span>
          </Label>
          <SearchableDropdown value={kasBankId} onValueChange={setKasBankId} options={kasBankOptions.map((k) => ({ id: k.id, label: k.nama, subtitle: k.kode }))} placeholder="Pilih kas/bank…" disabled={soLoading || submitting} />
          {selectedKasBank && (
            <p className="text-xs text-muted-foreground">
              Saldo: <span className={`font-mono font-semibold ${Number(selectedKasBank.saldo) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatRp(Number(selectedKasBank.saldo) || 0)}</span>
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">
            Tanggal <span className="text-destructive">*</span>
          </Label>
          <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} disabled={submitting} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">No. Dokumen</Label>
        <div className="relative">
          <Input readOnly value={nomorPreviewLoading ? 'Memuat nomor…' : nomorPreview || 'Otomatis saat disimpan'} className="font-mono bg-muted/50 pr-9" />
          <FileText className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        <p className="text-[11px] text-muted-foreground">Nomor voucher penerimaan otomatis (REC ASI/YYYY/NNN) — terbit saat transaksi disimpan.</p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">
          Sales Order (dengan termin belum dibayar) <span className="text-destructive">*</span>
        </Label>
        <SearchableDropdown
          value={selectedSoId}
          onValueChange={setSelectedSoId}
          options={soOptions.map((s) => ({
            id: s.salesOrderId,
            label: `${s.noPesanan} — ${s.pelangganNama || '-'}`,
            subtitle: `Sisa termin: ${formatRp(Number(s.sisaTermin) || 0)}`
          }))}
          placeholder={soLoading ? 'Memuat…' : 'Pilih Sales Order…'}
          disabled={soLoading || submitting}
        />
        {soOptions.length === 0 && !soLoading && <p className="text-[11px] text-muted-foreground">Tidak ada SO dengan termin belum dibayar — SO harus dibuat dengan field &quot;Pembayaran Termin&quot; terlebih dahulu.</p>}
      </div>

      {selectedSo && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3 text-xs">
            <div>
              <p className="text-muted-foreground">Pelanggan</p>
              <p className="font-medium">{selectedSo.pelangganNama || '-'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Grand Total SO</p>
              <p className="font-mono font-medium">{formatRp(Number(selectedSo.grandTotal) || 0)}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              Termin Pembayaran <span className="text-destructive">*</span>
            </Label>
            {terminLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : termins.length === 0 ? (
              <p className="text-xs text-muted-foreground">SO ini tidak memiliki termin.</p>
            ) : (
              <div className="max-h-56 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[80px]">Termin</TableHead>
                      <TableHead className="text-right">Nominal</TableHead>
                      <TableHead className="w-[180px]">Status</TableHead>
                      <TableHead className="w-[70px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {termins.map((t) => {
                      const dibayar = !!t.penerimaanKasId;
                      const dipilih = t.id === selectedTerminId;
                      return (
                        <TableRow key={t.id} className={dipilih ? 'bg-amber-50' : undefined}>
                          <TableCell className="text-xs font-medium">{t.urutan}</TableCell>
                          <TableCell className="text-right font-mono text-xs font-medium">{formatRp(Number(t.nominal) || 0)}</TableCell>
                          <TableCell>
                            {dibayar ? (
                              <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100" title={t.noBuktiPenerimaan || undefined}>
                                Dibayar{t.noBuktiPenerimaan ? ` · ${t.noBuktiPenerimaan}` : ''}
                              </Badge>
                            ) : (
                              <Badge variant="outline">Belum dibayar</Badge>
                            )}
                          </TableCell>
                          <TableCell>{!dibayar && <input type="radio" aria-label={`Pilih termin ${t.urutan}`} name="termin-so-pick" checked={dipilih} onChange={() => setSelectedTerminId(t.id)} disabled={submitting} className="h-4 w-4 accent-amber-600" />}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Akun Lawan (Kredit)</Label>
            <SearchableDropdown value={akunLawanId} onValueChange={setAkunLawanId} options={coaOptions} allOption={{ id: '', label: 'Default — Uang Muka Penjualan' }} placeholder={coaLoading ? 'Memuat…' : 'Default — Uang Muka Penjualan'} disabled={coaLoading || submitting} />
            <p className="text-[11px] text-muted-foreground">
              <Info className="mr-1 inline h-3 w-3" />
              Default: akun Uang Muka Penjualan (bisa diatur di Pengaturan → Setting Akun). Ganti di sini bila pembayaran ini perlu dicatat ke akun lain.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Catatan</Label>
            <Input className="h-9 text-xs" value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="opsional — mis. DP 40% proyek A" disabled={submitting} />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <p className="text-xs text-muted-foreground">
          Akan diterima: <span className="font-mono font-semibold text-foreground">{selectedTermin ? formatRp(Number(selectedTermin.nominal) || 0) : '-'}</span>
        </p>
        <Button size="sm" onClick={handleSubmit} disabled={submitting || !selectedTerminId || !kasBankId}>
          {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <HandCoins className="mr-1.5 h-4 w-4" />}
          {submitting ? 'Menyimpan…' : 'Terima Pembayaran'}
        </Button>
      </div>
    </div>
  );
}
