'use client';

// === Update ASAHI #019 — Preferensi → Perpajakan ===
//
// Grup preferensi 'perpajakan': LAYANAN_PAJAK, KODE_DALAM_NOMOR_FAKTUR,
// DIGIT_NOMOR_FAKTUR, RANGKAP_FAKTUR_PPN, RATE_PPN, RATE_PPH23.
// Tarif pajak default (RATE_PPN/RATE_PPH23) DIPINDAHKAN dari halaman
// Pengaturan → Setting Akun (AUD-10) ke sini — endpoint sama
// (/master/app-setting via kontrak preferensi).
//
// Setelah simpan sukses, bila updates menyentuh RATE_PPN / RATE_PPH23 →
// invalidateDefaultRates() supaya form dokumen baru memakai tarif terbaru
// (cache @/lib/use-default-rates).

import { useCallback } from 'react';
import PreferensiGroupForm from '@/components/erp/preferensi/preferensi-group-form';
import { invalidateDefaultRates } from '@/lib/use-default-rates';

interface PerpajakanPageProps {
  refreshKey?: number;
}

export default function PerpajakanPage({ refreshKey }: PerpajakanPageProps) {
  // AUD-10 — invalidasi cache tarif default bila RATE_PPN/RATE_PPH23 berubah.
  const handleSaved = useCallback((updates: Record<string, string | number | boolean>) => {
    if ('RATE_PPN' in updates || 'RATE_PPH23' in updates) {
      invalidateDefaultRates(); // form baru memakai tarif yang baru
    }
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Perpajakan</h2>
        <p className="text-sm text-muted-foreground">
          Layanan pajak (PMK 1195/1107), format nomor faktur pajak, rangkap cetak Faktur PPN, dan tarif pajak default. Sebelumnya tarif PPN/PPh 23 diatur di Pengaturan → Setting Akun — kini di sini.
        </p>
      </div>

      <PreferensiGroupForm
        groupId="perpajakan"
        refreshKey={refreshKey}
        description="Tarif default tersimpan sebagai snapshot per dokumen — mengubah setting hanya memengaruhi dokumen baru (histori tidak berubah)."
        onSaved={handleSaved}
      />
    </div>
  );
}
