'use client';

/**
 * CompanyBrand — blok identitas perusahaan untuk header dokumen cetak/PDF.
 * (Update ASAHI: logo + nama perusahaan dari Pengaturan → Profil Perusahaan,
 * menggantikan LogoPlaceholder + COMPANY_INFO yang dulu hardcoded.)
 *
 * Dipakai semua template cetak: SO, PO, surat jalan, invoice, retur,
 * penawaran, tukar faktur, bukti kas masuk/keluar, transfer bank.
 *
 * Render di dalam area yang dicetak html2canvas → pakai inline style (bukan
 * utility Tailwind berbasis oklch) supaya hasil PDF konsisten.
 */

import { useCompanyInfo } from '@/store/company-store';

/** Logo perusahaan — <img> bila sudah di-set, placeholder bulat bila belum. */
export function CompanyLogo({ size = 80 }: { size?: number }) {
  const { logo } = useCompanyInfo();

  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- data URL dinamis dari backend (bukan asset Next)
      <img src={logo} alt="Logo perusahaan" style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }} />
    );
  }
  return (
    <div className="bg-gray-200 rounded-full flex items-center justify-center text-gray-500 font-bold shrink-0" style={{ width: size, height: size, fontSize: Math.round(size / 6) }}>
      LOGO
    </div>
  );
}

/** Blok kiri header dokumen: logo + nama + alamat (+ telepon/email bila ada).
 *
 * Update ASAHI #6: prop ``showSlogan`` — render slogan perusahaan (Profil
 * Perusahaan) tepat di bawah nama perusahaan. Saat ini dipakai KHUSUS
 * Invoice Penjualan; dokumen lain tidak meneruskan prop ini sehingga
 * tampilannya tidak berubah.
 */
export function CompanyBrand({ showSlogan = false }: { showSlogan?: boolean }) {
  const { name, address, telepon, email, slogan } = useCompanyInfo();

  return (
    <div className="flex items-start gap-4">
      <CompanyLogo />
      <div>
        <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{name}</div>
        {/* Update ASAHI #6: slogan/tagline di bawah nama perusahaan —
            khusus Invoice Penjualan (showSlogan). Italic + agak kecil agar
            tidak mengganggu hierarki kop. */}
        {showSlogan && slogan ? <div style={{ fontStyle: 'italic', fontSize: '10px', marginTop: '1px' }}>{slogan}</div> : null}
        {/* Update ASAHI #3: alamat mendukung multi-baris — baris baru di
            Pengaturan → Profil Perusahaan dihormati saat cetak/PDF
            (mis. enter setelah "Jatireja" agar kop tidak kepanjangan). */}
        <div style={{ whiteSpace: 'pre-line' }}>{address}</div>
        {telepon ? <div>Telp: {telepon}</div> : null}
        {email ? <div>{email}</div> : null}
      </div>
    </div>
  );
}
