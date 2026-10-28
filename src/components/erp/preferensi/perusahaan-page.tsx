'use client';

// === Update ASAHI #019 — Preferensi → Perusahaan ===
//
// Grup preferensi 'perusahaan' (KONFIRMASI_KELUAR, TAMPILKAN_HARGA_HISTORY)
// + Card "Akun Laba Ditahan" (SettingAkun key LABA_DITAHAN — akun ekuitas
// tujuan penutupan laba/rugi tahun berjalan).

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import PreferensiGroupForm from '@/components/erp/preferensi/preferensi-group-form';
import AkunPicker from '@/components/erp/preferensi/akun-picker';

interface PerusahaanPageProps {
  refreshKey?: number;
}

export default function PerusahaanPage({ refreshKey }: PerusahaanPageProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Perusahaan</h2>
        <p className="text-sm text-muted-foreground">Perilaku umum aplikasi terkait perusahaan — konfirmasi keluar dan tampilan history barang.</p>
      </div>

      <PreferensiGroupForm groupId="perusahaan" refreshKey={refreshKey} />

      {/* ── Akun Laba Ditahan (SettingAkun) ── */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Akun Laba Ditahan</CardTitle>
          <CardDescription>Akun ekuitas tujuan penutupan tahun buku — laba/rugi tahun berjalan dipindahkan ke akun ini saat Penutupan Periode (Laporan).</CardDescription>
        </CardHeader>
        <CardContent>
          <AkunPicker
            settingKey="LABA_DITAHAN"
            label="Laba Ditahan"
            help="Pilih akun ekuitas DETAIL (disarankan tipe sistem RETAINED_EARNINGS, mis. 321000)."
            refreshKey={refreshKey}
          />
        </CardContent>
      </Card>
    </div>
  );
}
