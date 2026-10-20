'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings2, Save, Loader2, AlertCircle, CheckCircle2, RefreshCw, AlertTriangle, Boxes, Percent, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { invalidateDefaultRates } from '@/lib/use-default-rates';
import { loadCOA, EXPECTED_SYSTEM_TYPES } from '@/lib/coa';
// AUD-17 (update #05) — scope perusahaan untuk setting akun (global + override)
import { PerusahaanFilter, useCompanyOptions, type PerusahaanFilterValue } from '@/components/erp/perusahaan-filter';
import type { COAResponse } from '@/types/api';
import type { SettingAkunResponse, SettingAkunUpdate, COADropdownResponse, AppSettingResponse } from '@/types/api';

// ─── Group settings by category for better UX ──────────────────────────────

const NEW_SETTINGS: Record<string, { label: string; code: string }> = {
  BANK_CLEARING: { label: 'Clearing / Ayat Silang', code: '111200' },
  HPP_PRODUK_JADI: { label: 'HPP Produk Jadi', code: '531001' },
  LABA_RUGI_TAHUN_BERJALAN: { label: 'Laba/Rugi Tahun Berjalan', code: '322000' },
  LABA_DITAHAN: { label: 'Laba Ditahan', code: '321000' },
  // ASAHI #006 — PPh 23 untuk invoice penjualan dengan potongan pajak;
  // placeholder bila belum ada di DB (PUT auto-create), rekomendasi kode 116003.
  PPH23_DIBAYAR_DIMUKA: { label: 'PPh 23 Dibayar di Muka', code: '116003' }
};
const SETTING_GROUPS: { title: string; description: string; keys: string[]; helper?: { key: string; text: string; warningIfEmpty?: boolean }; allowEmpty?: boolean }[] = [
  {
    title: 'Penjualan',
    description: 'Akun default untuk transaksi penjualan (Sales Order, Invoice, Retur)',
    keys: ['PENDAPATAN_PENJUALAN', 'PENDAPATAN_ANGKUT', 'PPN_KELUARAN', 'PPH23_DIBAYAR_DIMUKA', 'RETUR_PENJUALAN', 'HPP_PENJUALAN', 'HPP_PRODUK_JADI', 'PIUTANG_USAHA']
  },
  {
    title: 'Pembelian',
    description: 'Akun default untuk transaksi pembelian (Purchase Order, Invoice, Retur)',
    keys: ['PEMBELIAN', 'PPN_MASUKAN', 'RETUR_PEMBELIAN', 'HUTANG_USAHA', 'BEBAN_ANGKUT_PEMBELIAN']
  },
  {
    title: 'Akun Perantara Persediaan',
    description: 'Akun perantara GRNI wajib dikonfigurasi sebelum penerimaan barang dieksekusi.',
    keys: ['PENERIMAAN_DALAM_PROSES'],
    allowEmpty: true,
    helper: {
      key: 'PENERIMAAN_DALAM_PROSES',
      text: 'Akun perantara untuk penerimaan barang yang belum diinvois (GRNI). Gunakan akun khusus "Penerimaan Dalam Proses" di KEWAJIBAN (DETAIL, saldo normal KREDIT, AKTIF), terpisah dari Hutang Usaha dan akun utang supplier.',
      warningIfEmpty: true
    }
  },
  {
    title: 'Persediaan',
    description: 'Akun untuk kartu stok dan valuasi persediaan',
    keys: ['PERSEDIAAN_BAHAN_BAKU', 'PERSEDIAAN_WIP', 'PERSEDIAAN_BARANG_JADI', 'PERSEDIAAN_BAHAN_PEMBANTU', 'SELISIH_PERSEDIAAN']
  },
  {
    title: 'Kas & Bank',
    description: 'Akun untuk transaksi kas dan bank',
    keys: ['KAS_DAN_SETARA_KAS', 'BEBAN_TRANSFER_BANK', 'BEBAN_ADMIN', 'BANK_CLEARING']
  },
  {
    title: 'Lainnya',
    description: 'Akun penyeimbang dan laba rugi',
    keys: ['LABA_RUGI_BERJALAN', 'LABA_RUGI_TAHUN_BERJALAN', 'LABA_DITAHAN']
  }
];

interface SettingAkunPageProps {
  refreshKey?: number;
}

export default function SettingAkunPage({ refreshKey }: SettingAkunPageProps) {
  const [settings, setSettings] = useState<SettingAkunResponse[]>([]);
  const [coaOptions, setCoaOptions] = useState<COAResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({});
  const [syncingKasBank, setSyncingKasBank] = useState(false);
  // ── AUD-17 (update #05) — scope perusahaan: 'ALL' (global) atau satu companyId.
  // Scoped → list menampilkan baris GLOBAL + override perusahaan; mengubah nilai
  // saat scoped = membuat/mengubah override perusahaan tsb (bukan global).
  const [companyScope, setCompanyScope] = useState<PerusahaanFilterValue>('ALL');
  const { companies } = useCompanyOptions();
  const scopeCompanyId = companyScope !== 'ALL' && companyScope !== 'UNASSIGNED' ? companyScope : undefined;
  // Tahap 2/3 koreksi: GRNI bisa di-configure walau key belum ada di GET (backend auto-create via PUT)
  const [grniAkunId, setGrniAkunId] = useState('');
  const [grniSaving, setGrniSaving] = useState(false);
  // ── Metode Valuasi global (dipindahkan dari form per-barang ke sini) ──
  const [metodeValuasi, setMetodeValuasi] = useState('AVERAGE');
  const [metodeValuasiTersimpan, setMetodeValuasiTersimpan] = useState('AVERAGE');
  const [valuasiOptions, setValuasiOptions] = useState<{ value: string; label: string }[]>([]);
  const [valuasiSaving, setValuasiSaving] = useState(false);
  const [valuasiError, setValuasiError] = useState<string | null>(null);
  // ── AUD-10 (update #04) — tarif pajak default global (RATE_PPN / RATE_PPH23) ──
  const [ratePpn, setRatePpn] = useState('11');
  const [ratePpnTersimpan, setRatePpnTersimpan] = useState('11');
  const [ratePph23, setRatePph23] = useState('2');
  const [ratePph23Tersimpan, setRatePph23Tersimpan] = useState('2');
  const [rateSaving, setRateSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // AUD-17 — scoped: GET ?companyId=C (server mengembalikan GLOBAL + override C);
      // global: tanpa param lalu sembunyikan baris override perusahaan di klien.
      const cs = scopeCompanyId ? `?companyId=${encodeURIComponent(scopeCompanyId)}` : '';
      const [settingsRes, coaRes] = await Promise.all([api.get<SettingAkunResponse[]>(`/master/setting-akun${cs}`), loadCOA({ activeOnly: true })]);
      let rows = Array.isArray(settingsRes) ? settingsRes : [];
      if (!scopeCompanyId) rows = rows.filter((r) => !r.companyId);
      setSettings([
        ...rows,
        ...Object.entries(NEW_SETTINGS)
          .filter(([key]) => !rows.some((s) => s.key === key))
          .map(([key, v]) => ({ id: '', key, label: v.label, akunPerkiraanId: '', akunPerkiraan: null, companyId: null, createdAt: '', updatedAt: '' }))
      ]);
      setCoaOptions(Array.isArray(coaRes) ? coaRes : []);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Gagal memuat data setting akun');
      setSettings([]);
      setCoaOptions([]);
    } finally {
      setLoading(false);
    }
  }, [scopeCompanyId]);

  // ── Fetch metode valuasi global + opsi-nya ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setValuasiError(null);
      try {
        const [settingRes, optionsRes, ratePpnRes, ratePph23Res] = await Promise.all([
          api.get<AppSettingResponse>('/master/app-setting/METODE_VALUASI'),
          api.get<{ value: string; label: string }[]>('/stok-kartu/valuasi-options').catch(() => [
            { value: 'AVERAGE', label: 'Rata-rata Bergerak (Moving Average)' },
            { value: 'FIFO', label: 'FIFO (First In First Out)' },
            { value: 'FEFO', label: 'FEFO (First Expired First Out)' }
          ]),
          // AUD-10 — tarif pajak default global
          api.get<AppSettingResponse>('/master/app-setting/RATE_PPN').catch(() => null),
          api.get<AppSettingResponse>('/master/app-setting/RATE_PPH23').catch(() => null)
        ]);
        if (cancelled) return;
        setMetodeValuasi(settingRes.value || 'AVERAGE');
        setMetodeValuasiTersimpan(settingRes.value || 'AVERAGE');
        setValuasiOptions(Array.isArray(optionsRes) ? optionsRes : []);
        // AUD-10 — isi state tarif pajak (default 11/2 bila setting kosong)
        const ppnRate = ratePpnRes?.value ?? '11';
        const pph23Rate = ratePph23Res?.value ?? '2';
        setRatePpn(ppnRate);
        setRatePpnTersimpan(ppnRate);
        setRatePph23(pph23Rate);
        setRatePph23Tersimpan(pph23Rate);
      } catch (err) {
        if (!cancelled) setValuasiError(err instanceof ApiError ? err.detail : 'Gagal memuat metode valuasi');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // AUD-10 (update #04) — simpan tarif pajak default global
  const handleSaveTarifPajak = async () => {
    const ppn = parseFloat(ratePpn);
    const pph = parseFloat(ratePph23);
    if (isNaN(ppn) || ppn < 0 || ppn > 100) {
      toast.error('Tarif PPN harus angka 0–100');
      return;
    }
    if (isNaN(pph) || pph < 0 || pph > 100) {
      toast.error('Tarif PPh 23 harus angka 0–100');
      return;
    }
    setRateSaving(true);
    try {
      const [r1, r2] = await Promise.all([api.put<AppSettingResponse>('/master/app-setting/RATE_PPN', { value: ratePpn }), api.put<AppSettingResponse>('/master/app-setting/RATE_PPH23', { value: ratePph23 })]);
      setRatePpnTersimpan(r1.value);
      setRatePph23Tersimpan(r2.value);
      invalidateDefaultRates(); // AUD-10 — form baru memakai tarif yang baru
      toast.success('Tarif pajak default disimpan — berlaku untuk dokumen baru yang tidak mengirim tarif');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal menyimpan tarif pajak');
    } finally {
      setRateSaving(false);
    }
  };

  const handleSaveMetodeValuasi = async () => {
    setValuasiSaving(true);
    try {
      const res = await api.put<AppSettingResponse>('/master/app-setting/METODE_VALUASI', { value: metodeValuasi });
      setMetodeValuasiTersimpan(res.value);
      setMetodeValuasi(res.value);
      toast.success(`Metode valuasi global disimpan: ${res.value}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal menyimpan metode valuasi');
    } finally {
      setValuasiSaving(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const handleChange = (key: string, newAkunId: string) => {
    setPendingChanges((prev) => ({ ...prev, [key]: newAkunId }));
  };

  // AUD-17 — kunci baris pending change unik per scope (global vs override perusahaan).
  const rowKey = (s: SettingAkunResponse) => `${s.companyId ?? 'GLOBAL'}::${s.key}`;

  const handleSave = async (s: SettingAkunResponse) => {
    const key = rowKey(s);
    const newAkunId = pendingChanges[key];
    if (!newAkunId) return;
    if (!s.id) {
      toast.error('Key setting belum tersedia. Administrator perlu menjalankan seed setting akun di backend.');
      return;
    }
    setSavingKey(key);
    try {
      const payload: SettingAkunUpdate = { akunPerkiraanId: newAkunId };
      // AUD-17 — companyId di body → override perusahaan:
      //  - baris override (row.companyId) → perbarui override tsb;
      //  - baris GLOBAL saat scope aktif → buat/ubah override perusahaan (bukan global);
      //  - tanpa scope → perubahan baris GLOBAL (global).
      const targetCompanyId = s.companyId || scopeCompanyId;
      if (targetCompanyId) payload.companyId = targetCompanyId;
      const updated = await api.put<SettingAkunResponse>(`/master/setting-akun/${s.key}`, payload);
      setSettings((prev) => prev.map((row) => (rowKey(row) === key ? updated : row)));
      setPendingChanges((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      const scopeLabel = updated.companyId ? ` (override ${companies.find((c) => c.id === updated.companyId)?.name ?? updated.companyId})` : ' (global)';
      toast.success(`Setting "${updated.label}" berhasil diperbarui${scopeLabel}`);
      // Muat ulang agar baris GLOBAL + override tersusun rapi pasca-override baru.
      fetchData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal memperbarui setting akun');
    } finally {
      setSavingKey(null);
    }
  };

  const handleReset = (key: string) => {
    setPendingChanges((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // ── Sync KasBankAkun dari COA ──
  const handleSyncKasBank = async () => {
    setSyncingKasBank(true);
    try {
      const res = await api.post<{ created: number; skipped: number; detail: string[] }>('/master/kas-bank-akun/sync');
      if (res.created > 0) {
        toast.success(`Sync berhasil: ${res.created} akun Kas/Bank baru dibuat, ${res.skipped} sudah ada`);
      } else {
        toast.info(`Semua akun Kas/Bank sudah sync (${res.skipped} akun)`);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal sync akun Kas/Bank');
    } finally {
      setSyncingKasBank(false);
    }
  };

  // ── Tahap 2/3 koreksi: Konfigurasi GRNI via PUT auto-create ──
  // Backend `PUT /master/setting-akun/PENERIMAAN_DALAM_PROSES` akan auto-create key jika belum ada.
  // Backend validate: akun harus KEWAJIBAN, DETAIL, AKTIF, saldo normal KREDIT, bukan subledger,
  // bukan akun utang supplier, bukan akun kontrol HUTANG_USAHA. Return 400 dengan detail jika invalid.
  const handleSaveGrni = async () => {
    if (!grniAkunId) {
      toast.error('Pilih akun GRNI terlebih dahulu');
      return;
    }
    setGrniSaving(true);
    try {
      const payload: SettingAkunUpdate = { akunPerkiraanId: grniAkunId };
      const updated = await api.put<SettingAkunResponse>('/master/setting-akun/PENERIMAAN_DALAM_PROSES', payload);
      // Tambahkan ke settings list kalau belum ada (supaya tampil di table reguler)
      setSettings((prev) => {
        const exists = prev.find((s) => s.key === 'PENERIMAAN_DALAM_PROSES');
        if (exists) {
          return prev.map((s) => (s.key === 'PENERIMAAN_DALAM_PROSES' ? updated : s));
        }
        return [...prev, updated];
      });
      setGrniAkunId('');
      toast.success(`GRNI berhasil di-configure: ${updated.akunPerkiraan?.kode} — ${updated.akunPerkiraan?.nama}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal mengonfigurasi GRNI');
    } finally {
      setGrniSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Setting Akun</h2>
          <p className="text-sm text-muted-foreground">Memuat data...</p>
        </div>
        <Card>
          <CardContent className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Setting Akun</h2>
        </div>
        <Card className="border-destructive">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-destructive font-medium">{error}</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={fetchData}>
                  Coba Lagi
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Settings2 className="h-5 w-5" />
          Setting Akun
        </h2>
        <p className="text-sm text-muted-foreground">Mapping akun default untuk auto-posting jurnal. Setiap transaksi akan otomatis menggunakan akun-akun di bawah ini.</p>
      </div>

      {/* AUD-17 (update #05) — selector scope perusahaan (global + override) */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-end gap-4">
          <PerusahaanFilter
            value={companyScope}
            onChange={(v) => {
              setCompanyScope(v);
              setPendingChanges({});
            }}
            label="Perusahaan"
            allLabel="Global (semua perusahaan)"
            includeUnassigned={false}
            widthClass="w-full sm:w-64"
          />
          <p className="text-xs text-muted-foreground flex-1">
            {scopeCompanyId ? (
              <>
                <strong className="text-foreground">{companies.find((c) => c.id === scopeCompanyId)?.name ?? 'Perusahaan'}</strong> — daftar menampilkan baris GLOBAL + override perusahaan ini. <strong>Saat scope perusahaan aktif, mengubah nilai = membuat/mengubah override perusahaan tsb (bukan global).</strong>
              </>
            ) : (
              'Global — nilai berlaku untuk semua perusahaan tanpa override. Pilih perusahaan untuk membuat override.'
            )}
          </p>
        </CardContent>
      </Card>

      {/* Info banner */}
      <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-700">
        <strong>Informasi:</strong> Pastikan semua akun di bawah sudah dipilih dengan benar. Jika ada akun yang belum di-set, transaksi yang membutuhkan akun tersebut akan <strong>gagal auto-posting jurnal</strong>
        (eksekusi transaksi dapat ditolak jika akun wajib belum dikonfigurasi). Akun yang dipilih harus berupa akun <strong>DETAIL</strong> (bukan HEADER/GROUP), pilih control account yang sesuai untuk piutang dan utang. Akun laba/rugi sistem tetap tersedia untuk konfigurasi closing.
      </div>

      {/* Settings grouped by category */}
      {SETTING_GROUPS.map((group) => {
        const groupSettings = settings.filter((s) => group.keys.includes(s.key));
        // Section dengan allowEmpty=true (mis. GRNI) tetap dirender walau key belum ada di GET
        // — user bisa konfigurasi via PUT auto-create backend.
        if (groupSettings.length === 0 && !group.allowEmpty) return null;
        return (
          <Fragment key={group.title}>
            <Card>
              <CardContent className="p-0">
                {/* Group header */}
                <div className="border-b bg-muted/30 px-4 py-3 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">{group.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{group.description}</p>
                    {group.helper && (
                      <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 flex items-start gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>{group.helper.text}</span>
                      </div>
                    )}
                    {group.helper?.warningIfEmpty && groupSettings.find((s) => s.key === group.helper!.key && !s.akunPerkiraanId) && (
                      <div className="mt-1.5 rounded-md border border-destructive bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          <strong>{group.helper.key}</strong> belum dikonfigurasi. Eksekusi penerimaan barang memerlukan akun GRNI; invoice tetap boleh kosong.
                        </span>
                      </div>
                    )}
                  </div>
                  {/* Tombol Sync khusus grup Kas & Bank */}
                  {group.title === 'Kas & Bank' && (
                    <Button variant="outline" size="sm" className="gap-1.5 shrink-0 text-xs h-7" onClick={handleSyncKasBank} disabled={syncingKasBank} title="Auto-create KasBankAkun untuk COA yang belum terdaftar">
                      {syncingKasBank ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Sync Kas/Bank
                    </Button>
                  )}
                </div>
                {/* Settings table */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs whitespace-nowrap">Label</TableHead>
                      <TableHead className="text-xs whitespace-nowrap">Key</TableHead>
                      <TableHead className="text-xs whitespace-nowrap text-center">Scope</TableHead>
                      <TableHead className="text-xs">Akun Perkiraan</TableHead>
                      <TableHead className="text-xs whitespace-nowrap text-center">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Tahap 2/3 koreksi: GRNI config UI walau key belum ada di GET */}
                    {group.allowEmpty && groupSettings.length === 0 && (
                      <TableRow className="bg-amber-50/40">
                        <TableCell className="text-sm font-medium whitespace-nowrap">Penerimaan Dalam Proses (GRNI)</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">PENERIMAAN_DALAM_PROSES</TableCell>
                        <TableCell className="text-center whitespace-nowrap">
                          <Badge variant="secondary" className="text-[10px]">
                            Global
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <SearchableDropdown
                            value={grniAkunId}
                            onValueChange={setGrniAkunId}
                            options={coaOptions
                              .filter((c) => c.header === 'KEWAJIBAN')
                              .map((c) => ({
                                id: c.id,
                                label: `${c.kode} — ${c.nama}`,
                                subtitle: c.header
                              }))}
                            placeholder="Pilih akun GRNI (KEWAJIBAN DETAIL KREDIT)..."
                            emptyText="Tidak ada akun KEWAJIBAN ditemukan"
                          />
                          <p className="text-[11px] text-muted-foreground mt-1">Backend validate: KEWAJIBAN + DETAIL + AKTIF + saldo normal KREDIT + bukan subledger/utang supplier/kontrol HUTANG_USAHA. Akan auto-create key via PUT.</p>
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap">
                          <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={handleSaveGrni} disabled={grniSaving || !grniAkunId}>
                            {grniSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            Konfigurasi GRNI
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                    {groupSettings.map((s) => {
                      const key = rowKey(s);
                      const currentValue = pendingChanges[key] || s.akunPerkiraanId;
                      const expected = EXPECTED_SYSTEM_TYPES[s.key];
                      const selected = coaOptions.find((a) => a.id === currentValue);
                      const mismatch = selected && expected && selected.systemAccountType !== expected;
                      const hasChange = !!pendingChanges[key];
                      const isSaving = savingKey === key;
                      return (
                        <TableRow key={key}>
                          <TableCell className="text-sm font-medium whitespace-nowrap">{s.label}</TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">{s.key}</TableCell>
                          <TableCell className="text-center whitespace-nowrap">
                            {s.companyId ? (
                              <Badge variant="outline" className="gap-1 border-sky-200 bg-sky-50 text-sky-700 text-[10px]">
                                <Building2 className="h-3 w-3" />
                                Perusahaan
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">
                                Global
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <SearchableDropdown
                              value={currentValue}
                              onValueChange={(v) => handleChange(key, v)}
                              disabled={!s.id || isSaving}
                              options={coaOptions.map((c) => ({
                                id: c.id,
                                label: `${c.kode} — ${c.nama}`,
                                subtitle: c.header
                              }))}
                              placeholder="Pilih akun perkiraan..."
                              emptyText="Tidak ada akun ditemukan"
                            />
                            {NEW_SETTINGS[s.key] && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Rekomendasi: {NEW_SETTINGS[s.key].code} — {NEW_SETTINGS[s.key].label}
                              </p>
                            )}
                            {mismatch && (
                              <p role="alert" className="mt-1 text-xs text-amber-700">
                                Tipe akun tidak sesuai: disarankan {expected}, akun ini {selected.systemAccountType || 'belum memiliki tipe sistem'}.
                              </p>
                            )}
                            {!s.id && (
                              <p role="alert" className="mt-1 text-xs text-amber-700">
                                Setting belum tersedia di server. Hubungi administrator untuk inisialisasi setting akun.
                              </p>
                            )}
                            {currentValue && !selected && (
                              <p role="alert" className="mt-1 text-xs text-amber-700">
                                Akun tersimpan {s.akunPerkiraan?.kode} — {s.akunPerkiraan?.nama} tidak tersedia dalam pilihan akun aktif. Pilih akun pengganti.
                              </p>
                            )}
                            {!currentValue && <p className="mt-1 text-xs text-amber-700">Belum dikonfigurasi.</p>}
                          </TableCell>
                          <TableCell className="text-center whitespace-nowrap">
                            {!s.id ? (
                              <Badge variant="outline">Belum tersedia</Badge>
                            ) : !currentValue ? (
                              <Badge variant="outline">Belum dikonfigurasi</Badge>
                            ) : hasChange ? (
                              <div className="inline-flex items-center gap-1">
                                <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => handleSave(s)} disabled={isSaving}>
                                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                  Simpan
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleReset(key)} disabled={isSaving}>
                                  Batal
                                </Button>
                              </div>
                            ) : (
                              <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50 text-xs gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Tersimpan
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            {/* ── Kartu Metode Valuasi global — tepat setelah grup Persediaan ── */}
            {group.title === 'Persediaan' && (
              <Card data-testid="card-metode-valuasi">
                <CardContent className="p-0">
                  <div className="border-b bg-muted/30 px-4 py-3">
                    <h3 className="text-sm font-semibold flex items-center gap-1.5">
                      <Boxes className="h-4 w-4" />
                      Metode Valuasi Persediaan
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Metode valuasi stok global untuk seluruh barang — menentukan perhitungan HPP (biaya persediaan keluar). Sebelumnya diatur per barang di form Barang &amp; Jasa.</p>
                  </div>
                  <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-end gap-3">
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-xs">Metode Valuasi</Label>
                      {valuasiError ? (
                        <p className="text-xs text-destructive">{valuasiError}</p>
                      ) : (
                        <Select value={metodeValuasi} onValueChange={setMetodeValuasi} disabled={valuasiSaving}>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih metode valuasi" />
                          </SelectTrigger>
                          <SelectContent>
                            {valuasiOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Berlaku untuk <strong>seluruh barang</strong> (kartu stok, penyesuaian, pemindahan, retur). Perubahan berlaku untuk transaksi berikutnya — histori valuasi yang sudah terposting tidak diubah.
                      </p>
                    </div>
                    <div className="shrink-0">
                      {metodeValuasi !== metodeValuasiTersimpan ? (
                        <div className="inline-flex items-center gap-1">
                          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleSaveMetodeValuasi} disabled={valuasiSaving} data-testid="simpan-metode-valuasi">
                            {valuasiSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            Simpan
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setMetodeValuasi(metodeValuasiTersimpan)} disabled={valuasiSaving}>
                            Batal
                          </Button>
                        </div>
                      ) : (
                        <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50 text-xs gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Tersimpan
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── AUD-10 (update #04): kartu Tarif Pajak default global ── */}
            {group.title === 'Persediaan' && (
              <Card data-testid="card-tarif-pajak">
                <CardContent className="p-0">
                  <div className="border-b bg-muted/30 px-4 py-3">
                    <h3 className="text-sm font-semibold flex items-center gap-1.5">
                      <Percent className="h-4 w-4" />
                      Tarif Pajak Default
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Tarif PPN &amp; PPh 23 untuk dokumen baru (SI/PI/PO/SO/retur/penawaran) yang tidak mengirim tarif eksplisit — sebelumnya hardcoded 11% / 2%.</p>
                  </div>
                  <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-end gap-3">
                    <div className="flex-1 grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">PPN (%)</Label>
                        <Input type="number" min={0} max={100} step="0.01" value={ratePpn} onChange={(e) => setRatePpn(e.target.value)} disabled={rateSaving} data-testid="input-rate-ppn" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">PPh 23 (%)</Label>
                        <Input type="number" min={0} max={100} step="0.01" value={ratePph23} onChange={(e) => setRatePph23(e.target.value)} disabled={rateSaving} data-testid="input-rate-pph23" />
                      </div>
                    </div>
                    <div className="shrink-0">
                      {ratePpn !== ratePpnTersimpan || ratePph23 !== ratePph23Tersimpan ? (
                        <div className="inline-flex items-center gap-1">
                          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleSaveTarifPajak} disabled={rateSaving} data-testid="simpan-tarif-pajak">
                            {rateSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            Simpan
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => {
                              setRatePpn(ratePpnTersimpan);
                              setRatePph23(ratePph23Tersimpan);
                            }}
                            disabled={rateSaving}>
                            Batal
                          </Button>
                        </div>
                      ) : (
                        <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50 text-xs gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Tersimpan
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="px-4 pb-3 text-[11px] text-muted-foreground leading-relaxed">Tarif tersimpan sebagai snapshot per dokumen — mengubah setting hanya memengaruhi dokumen baru (histori tidak berubah).</p>
                </CardContent>
              </Card>
            )}
          </Fragment>
        );
      })}

      {/* Summary */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Total: {settings.length} setting akun</p>
              <p className="text-xs text-muted-foreground mt-0.5">{Object.keys(pendingChanges).length > 0 ? `${Object.keys(pendingChanges).length} perubahan belum disimpan` : settings.some((s) => !s.id || !s.akunPerkiraanId) ? 'Masih ada setting yang belum dikonfigurasi' : 'Semua setting sudah tersimpan'}</p>
            </div>
            {Object.keys(pendingChanges).length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setPendingChanges({})}>
                Reset Semua
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
