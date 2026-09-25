'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Settings2, Save, Loader2, AlertCircle, CheckCircle2, RefreshCw, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { loadCOA, EXPECTED_SYSTEM_TYPES } from '@/lib/coa';
import type { COAResponse } from '@/types/api';
import type { SettingAkunResponse, SettingAkunUpdate, COADropdownResponse } from '@/types/api';

// ─── Group settings by category for better UX ──────────────────────────────

const NEW_SETTINGS: Record<string, { label: string; code: string }> = {
 BANK_CLEARING: { label: 'Clearing / Ayat Silang', code: '111200' }, HPP_PRODUK_JADI: { label: 'HPP Produk Jadi', code: '531001' }, LABA_RUGI_TAHUN_BERJALAN: { label: 'Laba/Rugi Tahun Berjalan', code: '322000' }, LABA_DITAHAN: { label: 'Laba Ditahan', code: '321000' }
};
const SETTING_GROUPS: { title: string; description: string; keys: string[]; helper?: { key: string; text: string; warningIfEmpty?: boolean }; allowEmpty?: boolean }[] = [
  {
    title: 'Penjualan',
    description: 'Akun default untuk transaksi penjualan (Sales Order, Invoice, Retur)',
    keys: ['PENDAPATAN_PENJUALAN', 'PENDAPATAN_ANGKUT', 'PPN_KELUARAN', 'RETUR_PENJUALAN', 'HPP_PENJUALAN', 'HPP_PRODUK_JADI', 'PIUTANG_USAHA']
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
  // Tahap 2/3 koreksi: GRNI bisa di-configure walau key belum ada di GET (backend auto-create via PUT)
  const [grniAkunId, setGrniAkunId] = useState('');
  const [grniSaving, setGrniSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, coaRes] = await Promise.all([api.get<SettingAkunResponse[]>('/master/setting-akun'), loadCOA({ activeOnly: true })]);
      const rows = Array.isArray(settingsRes) ? settingsRes : [];
      setSettings([...rows, ...Object.entries(NEW_SETTINGS).filter(([key])=>!rows.some(s=>s.key===key)).map(([key,v])=>({ id: '', key, label:v.label, akunPerkiraanId:'', akunPerkiraan:null, createdAt:'', updatedAt:'' }))]);
      setCoaOptions(Array.isArray(coaRes) ? coaRes : []);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Gagal memuat data setting akun');
      setSettings([]);
      setCoaOptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const handleChange = (key: string, newAkunId: string) => {
    setPendingChanges((prev) => ({ ...prev, [key]: newAkunId }));
  };

  const handleSave = async (key: string) => {
    const newAkunId = pendingChanges[key];
    if (!newAkunId) return;
    if (!settings.find(s=>s.key === key)?.id) { toast.error('Key setting belum tersedia. Administrator perlu menjalankan seed setting akun di backend.'); return; }
    setSavingKey(key);
    try {
      const payload: SettingAkunUpdate = { akunPerkiraanId: newAkunId };
      const updated = await api.put<SettingAkunResponse>(`/master/setting-akun/${key}`, payload);
      setSettings((prev) => prev.map((s) => (s.key === key ? updated : s)));
      setPendingChanges((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      toast.success(`Setting "${updated.label}" berhasil diperbarui`);
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
          <Card key={group.title}>
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
                    const currentValue = pendingChanges[s.key] || s.akunPerkiraanId;
                    const expected = EXPECTED_SYSTEM_TYPES[s.key];
                    const selected = coaOptions.find(a=>a.id === currentValue);
                    const mismatch = selected && expected && selected.systemAccountType !== expected;
                    const hasChange = !!pendingChanges[s.key];
                    const isSaving = savingKey === s.key;
                    return (
                      <TableRow key={s.key}>
                        <TableCell className="text-sm font-medium whitespace-nowrap">{s.label}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">{s.key}</TableCell>
                        <TableCell>
                          <SearchableDropdown
                            value={currentValue}
                            onValueChange={(v) => handleChange(s.key, v)}
                            disabled={!s.id || isSaving}
                            options={coaOptions.map((c) => ({
                              id: c.id,
                              label: `${c.kode} — ${c.nama}`,
                              subtitle: c.header
                            }))}
                            placeholder="Pilih akun perkiraan..."
                            emptyText="Tidak ada akun ditemukan"
                          />
                          {NEW_SETTINGS[s.key] && <p className="mt-1 text-xs text-muted-foreground">Rekomendasi: {NEW_SETTINGS[s.key].code} — {NEW_SETTINGS[s.key].label}</p>}
                          {mismatch && <p role="alert" className="mt-1 text-xs text-amber-700">Tipe akun tidak sesuai: disarankan {expected}, akun ini {selected.systemAccountType || 'belum memiliki tipe sistem'}.</p>}
                          {!s.id && <p role="alert" className="mt-1 text-xs text-amber-700">Setting belum tersedia di server. Hubungi administrator untuk inisialisasi setting akun.</p>}
                          {currentValue && !selected && <p role="alert" className="mt-1 text-xs text-amber-700">Akun tersimpan {s.akunPerkiraan?.kode} — {s.akunPerkiraan?.nama} tidak tersedia dalam pilihan akun aktif. Pilih akun pengganti.</p>}
                          {!currentValue && <p className="mt-1 text-xs text-amber-700">Belum dikonfigurasi.</p>}
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap">
                          {!s.id ? <Badge variant="outline">Belum tersedia</Badge> : !currentValue ? <Badge variant="outline">Belum dikonfigurasi</Badge> : hasChange ? (
                            <div className="inline-flex items-center gap-1">
                              <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => handleSave(s.key)} disabled={isSaving}>
                                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                Simpan
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleReset(s.key)} disabled={isSaving}>
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
        );
      })}

      {/* Summary */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Total: {settings.length} setting akun</p>
              <p className="text-xs text-muted-foreground mt-0.5">{Object.keys(pendingChanges).length > 0 ? `${Object.keys(pendingChanges).length} perubahan belum disimpan` : settings.some(s=>!s.id || !s.akunPerkiraanId) ? 'Masih ada setting yang belum dikonfigurasi' : 'Semua setting sudah tersimpan'}</p>
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
