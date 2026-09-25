'use client';

import dynamic from 'next/dynamic';

const COAPage = dynamic(() => import('@/components/erp/settings/coa-page'), { ssr: false });
const SettingAkunPage = dynamic(() => import('@/components/erp/settings/setting-akun-page'), { ssr: false });
const PelangganPage = dynamic(() => import('@/components/erp/settings/pelanggan-page'), { ssr: false });
const SupplierPage = dynamic(() => import('@/components/erp/settings/supplier-page'), { ssr: false });
// Tahap 1: BarangPage dipindah ke modul Persediaan → inventory/barang-form.tsx
const GudangPage = dynamic(() => import('@/components/erp/settings/gudang-page'), { ssr: false });
const PenggunaPage = dynamic(() => import('@/components/erp/settings/pengguna-page'), { ssr: false });
const KaryawanPage = dynamic(() => import('@/components/erp/settings/karyawan-page'), { ssr: false });
const SyaratBayarPage = dynamic(() => import('@/components/erp/settings/syarat-bayar-page'), { ssr: false });
const KategoriBarangPage = dynamic(() => import('@/components/erp/settings/kategori-barang-page'), { ssr: false });
const SatuanPage = dynamic(() => import('@/components/erp/settings/satuan-page'), { ssr: false });

interface SettingsProps {
  subPage?: string;
  refreshKey?: number;
  formMode?: string;
  formProps?: Record<string, unknown>;
}

export default function SettingsModule({ subPage, refreshKey, formMode, formProps }: SettingsProps) {
  const sp = subPage || 'coa';

  const pageProps = { refreshKey, formMode, formProps };

  // Form mode — render the specific page in form mode
  if (formMode) {
    switch (sp) {
      case 'coa':
        return <COAPage {...pageProps} subPage={sp} />;
      case 'setting-akun':
        return <SettingAkunPage refreshKey={refreshKey} />;
      case 'pelanggan':
        return <PelangganPage {...pageProps} subPage={sp} />;
      case 'supplier':
        return <SupplierPage {...pageProps} subPage={sp} />;
      case 'gudang':
        return <GudangPage {...pageProps} subPage={sp} />;
      case 'pengguna':
        return <PenggunaPage {...pageProps} subPage={sp} />;
      case 'karyawan':
        return <KaryawanPage {...pageProps} subPage={sp} />;
      case 'syarat-bayar':
        return <SyaratBayarPage {...pageProps} subPage={sp} />;
      case 'kategori-barang':
        return <KategoriBarangPage {...pageProps} subPage={sp} />;
      case 'satuan':
        return <SatuanPage {...pageProps} subPage={sp} />;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pengaturan</h1>
        <p className="text-muted-foreground">Konfigurasi akun, pelanggan, supplier, barang, satuan, gudang, dan data master lainnya</p>
      </div>
      {sp === 'coa' && <COAPage {...pageProps} subPage={sp} />}
      {sp === 'setting-akun' && <SettingAkunPage refreshKey={refreshKey} />}
      {sp === 'pelanggan' && <PelangganPage {...pageProps} subPage={sp} />}
      {sp === 'supplier' && <SupplierPage {...pageProps} subPage={sp} />}
      {sp === 'gudang' && <GudangPage {...pageProps} subPage={sp} />}
      {sp === 'pengguna' && <PenggunaPage {...pageProps} subPage={sp} />}
      {sp === 'karyawan' && <KaryawanPage {...pageProps} subPage={sp} />}
      {sp === 'syarat-bayar' && <SyaratBayarPage {...pageProps} subPage={sp} />}
      {sp === 'kategori-barang' && <KategoriBarangPage {...pageProps} subPage={sp} />}
      {sp === 'satuan' && <SatuanPage {...pageProps} subPage={sp} />}
    </div>
  );
}
