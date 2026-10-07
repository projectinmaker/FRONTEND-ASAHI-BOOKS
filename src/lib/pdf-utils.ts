// ─── Format Helpers ────────────────────────────────────────────────────────
// Delegasi ke formatter sentral di @/lib/money (standard 20.000.000).

import { formatNumberIDR, formatRp as formatRpIDR } from '@/lib/money';

export const formatRp = (val: string | number) => formatRpIDR(val);

export const formatNumber = (val: string | number) => formatNumberIDR(val);

export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

export function todayStr(): string {
  // Tanggal LOKAL (bukan UTC): new Date().toISOString() memakai UTC sehingga
  // pada jam 00:00–06:59 WIB form akan terisi tanggal kemarin. Gunakan komponen
  // tanggal lokal browser agar default form/filter selalu hari ini bagi user.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function generateNo(prefix: string, count: number): string {
  return `${prefix}-${new Date().getFullYear()}-${String(count).padStart(4, '0')}`;
}

// ─── Terbilang (Number to Indonesian Words) ─────────────────────────────────

const SATUAN = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];

function terbilangChunk(n: number): string {
  if (n === 0) return '';
  if (n < 12) return SATUAN[n];
  if (n < 20) return SATUAN[n - 10] + ' Belas';
  if (n < 100) {
    const r = Math.floor(n / 10);
    const s = n % 10;
    return SATUAN[r] + ' Puluh' + (s ? ' ' + SATUAN[s] : '');
  }
  if (n < 200) return 'Seratus' + (n - 100 ? ' ' + terbilangChunk(n - 100) : '');
  if (n < 1000) {
    const r = Math.floor(n / 100);
    return SATUAN[r] + ' Ratus' + (n % 100 ? ' ' + terbilangChunk(n % 100) : '');
  }
  if (n < 2000) return 'Seribu' + (n - 1000 ? ' ' + terbilangChunk(n - 1000) : '');
  if (n < 1000000) {
    const r = Math.floor(n / 1000);
    return terbilangChunk(r) + ' Ribu' + (n % 1000 ? ' ' + terbilangChunk(n % 1000) : '');
  }
  if (n < 1000000000) {
    const r = Math.floor(n / 1000000);
    // Update #4: perbaikan bug — sisa harus n % 1.000.000 (dulu n % 1000,
    // sehingga 1.500.000 terbaca "Satu Juta" tanpa "Lima Ratus Ribu").
    return terbilangChunk(r) + ' Juta' + (n % 1000000 ? ' ' + terbilangChunk(n % 1000000) : '');
  }
  if (n < 1000000000000) {
    // Update #4: perbaikan bug — pembagi harus 1 miliar (dulu 1 juta,
    // sehingga 2.500.000.000 terbaca "Dua Ribu Lima Ratus Miliar").
    const r = Math.floor(n / 1000000000);
    return terbilangChunk(r) + ' Miliar' + (n % 1000000000 ? ' ' + terbilangChunk(n % 1000000000) : '');
  }
  return String(n);
}

export function terbilang(n: number): string {
  if (n === 0) return 'Nol Rupiah';
  const abs = Math.abs(n);
  const words = terbilangChunk(abs).trim();
  return words.charAt(0).toUpperCase() + words.slice(1) + ' Rupiah';
}

// ─── Company Info ───────────────────────────────────────────────────────────
// DEPRECATED (update ASAHI): identitas perusahaan untuk cetak/PDF sekarang
// dinamis dari Pengaturan → Profil Perusahaan (backend) — lihat
// store/company-store.ts (useCompanyInfo) dan components/erp/company-brand.tsx.
// Konstanta ini hanya fallback dan tidak lagi dipakai template cetak.

export const COMPANY_INFO = {
  name: 'ASAHI Books',
  address: 'Jalan Simpangan No.18, RT.03/RW.06, Jatireja,\nKec. Cikarang Tim., Kabupaten Bekasi, Jawa Barat 17530'
};

// ─── Filename Helper ─────────────────────────────────────────────────────────

/**
 * Sanitasi nomor dokumen untuk nama file PDF. Nomor pola baru mengandung
 * spasi dan '/' (contoh: "INV ASI/2026/001") — '/' tidak valid di nama file.
 * Hasil: "INV-ASI-2026-001".
 */
export function fileSafeNo(no: string): string {
  return no.replace(/\s+/g, '-').replace(/\//g, '-');
}

// ─── Ukuran judul dokumen cetak (Update #4) ─────────────────────────────────
// SATU TEMPAT untuk mengatur besar/kecil judul SEMUA dokumen cetak/PDF
// ("Purchase Order", "Sales Order", "Invoice Penjualan", dst.).
// Ingin memperbesar? Naikkan angkanya (mis. 24). Memperkecil? Turunkan (mis. 16).
// Satuan: pixel (px). Semua template cetak memakai konstanta ini.
export const DOC_TITLE_FONT_SIZE = 20;

// ─── PDF Generation Utility ────────────────────────────────────────────────

export async function generatePDF(elementId: string, filename: string) {
  const element = document.getElementById(elementId);
  if (!element) return;

  // html2canvas-pro: fork html2canvas dengan dukungan color function modern
  // (oklch/lab/color-mix) — wajib untuk Tailwind CSS v4 yang memakai warna
  // oklch; html2canvas 1.4.1 throw "unsupported color function lab" di Chrome baru.
  const html2canvas = (await import('html2canvas-pro')).default;
  const { jsPDF } = await import('jspdf');

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff'
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = canvas.width;
  const imgHeight = canvas.height;
  const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
  const imgX = (pdfWidth - imgWidth * ratio) / 2;
  const imgY = 0;

  pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio);
  pdf.save(filename);
}

export function printElement(elementId: string) {
  const element = document.getElementById(elementId);
  if (!element) return;
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(`
    <html>
    <head><title>Print</title>
    <style>
      body { margin: 0; padding: 20px; font-family: 'Segoe UI', sans-serif; }
      @page { size: A4; margin: 10mm; }
      img { max-width: 100%; height: auto; }
    </style>
    </head>
    <body><img src="${element.querySelector('canvas')?.toDataURL() || ''}" /></body>
    </html>
  `);
  printWindow.document.close();
}
