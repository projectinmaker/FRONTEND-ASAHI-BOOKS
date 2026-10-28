'use client';

// === Update ASAHI #019 — Preferensi → Akun Default ===
//
// Tiga Card:
// 1. "Mata Uang" — mata uang default perusahaan (dropdown dari GET
//    /master/mata-uang; simpan PUT /master/company-profile {mataUang} —
//    payload partial, backend exclude_unset).
// 2. "Akun Default" — AkunPicker: HUTANG_USAHA, PIUTANG_USAHA,
//    DISKON_PENJUALAN, LABA_RUGI_TEREALISIR, LABA_RUGI_TAK_TEREALISIR.
// 3. "Akun Default Barang" — AkunPicker persediaan & HPP (10 key), termasuk
//    BEBAN_ADMIN (label "Biaya") dan PENERIMAAN_DALAM_PROSES (label
//    "Barang Pengiriman (GRNI)").

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useCompanyStore } from '@/store/company-store';
import AkunPicker from '@/components/erp/preferensi/akun-picker';
import type { CompanyProfileResponse, CompanyProfileUpdate, MataUangResponse } from '@/types/api';

interface AkunDefaultPageProps {
  refreshKey?: number;
}

// Daftar key SettingAkun per Card — label Indonesia sesuai KNOWN_SETTING_LABELS backend.
const AKUN_DEFAULT_ITEMS: { key: string; label: string; help?: string }[] = [
  { key: 'HUTANG_USAHA', label: 'Hutang Usaha', help: 'Akun kontrol utang supplier (AP).' },
  { key: 'PIUTANG_USAHA', label: 'Piutang Usaha', help: 'Akun kontrol piutang pelanggan (AR).' },
  { key: 'DISKON_PENJUALAN', label: 'Diskon Penjualan', help: 'Kontra-pendapatan untuk diskon pada faktur penjualan.' },
  { key: 'LABA_RUGI_TEREALISIR', label: 'Laba/(Rugi) Terealisir', help: 'Akun selisih kurs/kurs terealisir.' },
  { key: 'LABA_RUGI_TAK_TEREALISIR', label: 'Laba/(Rugi) Tak Terealisir', help: 'Akun selisih kurs tak terealisir.' }
];

const AKUN_DEFAULT_BARANG_ITEMS: { key: string; label: string; help?: string }[] = [
  { key: 'PERSEDIAAN_BAHAN_BAKU', label: 'Persediaan Bahan Baku' },
  { key: 'PERSEDIAAN_WIP', label: 'Persediaan Barang dalam Proses (WIP)' },
  { key: 'PERSEDIAAN_BARANG_JADI', label: 'Persediaan Barang Jadi' },
  { key: 'PENDAPATAN_PENJUALAN', label: 'Pendapatan Penjualan' },
  { key: 'RETUR_PENJUALAN', label: 'Retur Penjualan' },
  { key: 'DISKON_BARANG', label: 'Diskon Barang' },
  { key: 'HPP_PENJUALAN', label: 'HPP Penjualan' },
  { key: 'RETUR_PEMBELIAN', label: 'Retur Pembelian' },
  // Label khusus sesuai spec (merujuk istilah Accurate).
  { key: 'BEBAN_ADMIN', label: 'Biaya', help: 'Beban administrasi untuk transaksi barang (mis. biaya pesanan).' },
  { key: 'PENERIMAAN_DALAM_PROSES', label: 'Barang Pengiriman (GRNI)', help: 'Akun perantara penerimaan barang yang belum diinvois.' }
];

export default function AkunDefaultPage({ refreshKey }: AkunDefaultPageProps) {
  // ── Mata uang default perusahaan (company_profile.mataUang) ──
  const [mataUangList, setMataUangList] = useState<MataUangResponse[]>([]);
  const [mataUang, setMataUang] = useState('');
  const [mataUangInitial, setMataUangInitial] = useState('');
  const [muLoading, setMuLoading] = useState(true);
  const [muSaving, setMuSaving] = useState(false);
  const [muError, setMuError] = useState<string | null>(null);

  const refreshCompanyStore = useCompanyStore((s) => s.fetch);

  const loadMataUang = useCallback(async () => {
    setMuLoading(true);
    setMuError(null);
    try {
      const [list, profile] = await Promise.all([api.get<MataUangResponse[]>('/master/mata-uang'), api.get<CompanyProfileResponse>('/master/company-profile')]);
      setMataUangList(Array.isArray(list) ? list : []);
      const current = profile.mataUang || 'IDR';
      setMataUang(current);
      setMataUangInitial(current);
    } catch (err) {
      setMuError(err instanceof ApiError ? err.detail : 'Gagal memuat mata uang default');
    } finally {
      setMuLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMataUang();
  }, [loadMataUang, refreshKey]);

  const mataUangDirty = mataUang !== mataUangInitial;

  const handleSaveMataUang = async () => {
    if (!mataUang) return;
    setMuSaving(true);
    try {
      // Payload PARTIAL — hanya field halaman ini (backend exclude_unset).
      await api.put<CompanyProfileResponse>('/master/company-profile', { mataUang } satisfies Partial<CompanyProfileUpdate>);
      setMataUangInitial(mataUang);
      // Refresh store supaya modul lain yang membaca profil memakai nilai baru.
      void refreshCompanyStore(true);
      toast.success(`Mata uang default disimpan: ${mataUang}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal menyimpan mata uang default');
    } finally {
      setMuSaving(false);
    }
  };

  const mataUangAktif = mataUangList.filter((m) => m.isAktif);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Akun Default</h2>
        <p className="text-sm text-muted-foreground">Mata uang default perusahaan dan akun-akun default untuk auto-posting jurnal (piutang, hutang, persediaan, HPP, retur, diskon).</p>
      </div>

      {/* ── Mata Uang ── */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Mata Uang</CardTitle>
          <CardDescription>Mata uang default perusahaan — dipakai sebagai nilai awal transaksi baru (sebelumnya selalu IDR).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {muLoading ? (
            <Skeleton className="h-9 w-full max-w-xs" />
          ) : muError ? (
            <p className="text-sm text-destructive" role="alert">
              {muError}{' '}
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => void loadMataUang()}>
                Coba lagi
              </Button>
            </p>
          ) : (
            <>
              <div className="space-y-2 max-w-xs">
                <Label htmlFor="mata-uang-default">Mata Uang Default</Label>
                <Select value={mataUang} onValueChange={setMataUang} disabled={muSaving}>
                  <SelectTrigger id="mata-uang-default">
                    <SelectValue placeholder="Pilih mata uang" />
                  </SelectTrigger>
                  <SelectContent>
                    {mataUangAktif.length === 0 && <SelectItem value="IDR">IDR — Rupiah</SelectItem>}
                    {mataUangAktif.map((m) => (
                      <SelectItem key={m.id} value={m.kode}>
                        {m.kode} — {m.nama}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Kelola daftar mata uang di Pengaturan → Umum → Card Mata Uang.</p>
              </div>
              <div className="flex justify-end">
                {mataUangDirty && (
                  <Button onClick={handleSaveMataUang} disabled={muSaving} className="gap-2">
                    {muSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    Simpan Mata Uang
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Akun Default ── */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Akun Default</CardTitle>
          <CardDescription>Akun default piutang, hutang, diskon penjualan, dan laba/rugi selisih kurs — dipakai auto-posting jurnal transaksi.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {AKUN_DEFAULT_ITEMS.map((item) => (
            <AkunPicker key={item.key} settingKey={item.key} label={item.label} help={item.help} refreshKey={refreshKey} />
          ))}
        </CardContent>
      </Card>

      {/* ── Akun Default Barang ── */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Akun Default Barang</CardTitle>
          <CardDescription>Akun persediaan, pendapatan, HPP, retur, dan akun perantara GRNI — dipakai transaksi barang (penjualan, pembelian, produksi).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {AKUN_DEFAULT_BARANG_ITEMS.map((item) => (
            <AkunPicker key={item.key} settingKey={item.key} label={item.label} help={item.help} refreshKey={refreshKey} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
