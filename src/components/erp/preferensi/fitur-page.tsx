'use client';

// === Update ASAHI #019 — Preferensi → Fitur ===
//
// Grup preferensi 'fitur': FORMAT_TANGGAL (dipakai formatDate di seluruh
// aplikasi) + METODE_VALUASI (dipindahkan dari halaman Setting Akun —
// endpoint sama /master/app-setting, kini lewat kontrak preferensi).

import PreferensiGroupForm from '@/components/erp/preferensi/preferensi-group-form';

interface FiturPageProps {
  refreshKey?: number;
}

export default function FiturPage({ refreshKey }: FiturPageProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Fitur</h2>
        <p className="text-sm text-muted-foreground">
          Format tanggal tampilan dan metode biaya persediaan global. Sebelumnya metode valuasi diatur di Pengaturan → Setting Akun — kini di sini.
        </p>
      </div>

      <PreferensiGroupForm
        groupId="fitur"
        refreshKey={refreshKey}
        description="Format tanggal berlaku untuk semua tampilan tanggal di aplikasi (daftar dokumen, cetak/PDF). Metode valuasi menentukan perhitungan HPP untuk seluruh barang — histori valuasi yang sudah terposting tidak diubah."
      />
    </div>
  );
}
