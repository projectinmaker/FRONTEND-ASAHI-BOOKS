'use client';

// === Update ASAHI #019 — Modul Preferensi (router subPage; mirror settings.tsx) ===
//
// Modul baru "Preferensi": konfigurasi perilaku aplikasi yang selama ini
// tersebar/hardcoded (konfirmasi keluar, format tanggal, metode valuasi,
// tarif pajak default, font, prefix nomor dokumen, dsb.) — kini persisten di
// backend (GET/PUT /master/preferensi + /master/setting-akun).

import dynamic from 'next/dynamic';

const PerusahaanPage = dynamic(() => import('@/components/erp/preferensi/perusahaan-page'), { ssr: false });
const FiturPage = dynamic(() => import('@/components/erp/preferensi/fitur-page'), { ssr: false });
const AkunDefaultPage = dynamic(() => import('@/components/erp/preferensi/akun-default-page'), { ssr: false });
const PengingatPage = dynamic(() => import('@/components/erp/preferensi/pengingat-page'), { ssr: false });
const PenjualanPembelianPage = dynamic(() => import('@/components/erp/preferensi/penjualan-pembelian-page'), { ssr: false });
const PerpajakanPage = dynamic(() => import('@/components/erp/preferensi/perpajakan-page'), { ssr: false });
const FontPage = dynamic(() => import('@/components/erp/preferensi/font-page'), { ssr: false });
const PenomoranPage = dynamic(() => import('@/components/erp/preferensi/penomoran-page'), { ssr: false });

interface PreferensiModuleProps {
  subPage?: string;
  refreshKey?: number;
  formMode?: string;
  formProps?: Record<string, unknown>;
}

export default function PreferensiModule({ subPage, refreshKey }: PreferensiModuleProps) {
  const sp = subPage || 'perusahaan';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Preferensi</h1>
        <p className="text-muted-foreground">Konfigurasi perilaku aplikasi — perusahaan, fitur, akun default, pengingat, penjualan &amp; pembelian, perpajakan, font, dan penomoran dokumen.</p>
      </div>
      {sp === 'perusahaan' && <PerusahaanPage refreshKey={refreshKey} />}
      {sp === 'fitur' && <FiturPage refreshKey={refreshKey} />}
      {sp === 'akun-default' && <AkunDefaultPage refreshKey={refreshKey} />}
      {sp === 'pengingat' && <PengingatPage refreshKey={refreshKey} />}
      {sp === 'penjualan-pembelian' && <PenjualanPembelianPage refreshKey={refreshKey} />}
      {sp === 'perpajakan' && <PerpajakanPage refreshKey={refreshKey} />}
      {sp === 'font' && <FontPage refreshKey={refreshKey} />}
      {sp === 'penomoran' && <PenomoranPage refreshKey={refreshKey} />}
    </div>
  );
}
