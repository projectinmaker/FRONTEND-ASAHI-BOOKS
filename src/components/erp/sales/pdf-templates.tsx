'use client';

import { formatNumber, formatDate, terbilang, DOC_TITLE_FONT_SIZE } from '@/lib/pdf-utils';
// Update ASAHI: header cetak pakai identitas perusahaan dinamis (Pengaturan → Profil Perusahaan)
import { CompanyBrand } from '@/components/erp/company-brand';
// Update ASAHI #6: rekening bank perusahaan untuk footer Invoice Penjualan
import { useCompanyInfo } from '@/store/company-store';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DetailRow {
  id: string;
  barang: string;
  harga: number;
  qty: number;
  diskon: number;
  satuan?: string | null; // nama satuan per baris — kolom "Satuan" di semua cetakan (Update #5)
  // === Update #042 — DP per baris DIHAPUS: nilai yang ditagih baris kini
  // porsi header dpPelunasan (distribusi proporsional backend) — dipetakan
  // dari SalesInvoiceDetailResponse.subTotal (nilai ditagih baris). ===
  subTotal?: number;
}

export interface BiayaTambahan {
  id: string;
  nama: string;
  jumlah: number;
}

export interface PesananData {
  nomor: string;
  tanggal: string;
  kepada: string;
  alamatPenerima: string;
  syaratPembayaran: string;
  // Update ASAHI (revisi SO): ekspedisi & penjual dihapus dari dokumen;
  // tanggalPengiriman tetap tapi label cetak menjadi "Target Pengiriman".
  tanggalPengiriman: string;
  // === Update #4 — No PO customer dari SO (label "No PO" di print pesanan) ===
  noPo: string;
  detail: DetailRow[];
  biayaTambahan: BiayaTambahan[];
  keterangan: string;
  diskonGlobal: number;
  // === Update #042 — PPN dihapus dari SO (order doc nilai penuh tanpa
  // pajak; PPN hanya di INVOICE). ===
}

export interface PengirimanData {
  nomor: string;
  tanggal: string;
  kepada: string;
  alamatPenerima: string;
  // === Update #4 — ganti poNo tunggal → No SO + No PO customer ===
  noSo: string;
  noPo: string;
  detail: DetailRow[];
  keterangan: string;
}

export interface InvoiceData {
  nomor: string;
  tanggal: string;
  kepada: string;
  alamatPenerima: string;
  // === Update #004: Syarat Pembayaran / Ekspedisi / Tanggal Pengiriman dihapus
  //     dari dokumen invoice (label Tanggal → Tanggal Invoice). ===
  // === Update #4 — ganti poNo tunggal → No SO / No PO customer / No DO ===
  noSo: string;
  noPo: string;
  /** Update #004: dulu "No Surat Jalan" — nomor DO ter-link via delivery detail. */
  noDo: string;
  mataUang: string;
  detail: DetailRow[];
  biayaTambahan: BiayaTambahan[];
  keterangan: string;
  diskonGlobal: number;
  ppn: number;
  // === Update ASAHI — pilihan PPh23/PPN saat input SI (opsional) ===
  ppnApplicable?: boolean;
  pph23Applicable?: boolean;
  pph23?: number;
  // === Update #042 — DP/Pelunasan (field header invoice): nilai yang
  // ditagih invoice ini (0 = tagih penuh; subTotal baris = porsi) +
  // soSisaNilai = sisa tagihan NILAI SO SETELAH invoice ini (null bila
  // standalone tanpa SO) — dicetak sebagai baris footer "Sisa pembayaran
  // dari SO {noSo}". ===
  dpPelunasan?: number;
  soSisaNilai?: number | null;
}

export interface ReturData {
  nomor: string;
  tanggal: string;
  dari: string;
  alamatPengembalian: string;
  noPengembalian: string;
  detail: DetailRow[];
  keterangan: string;
  diskonGlobal: number;
  ppn: number;
}

export interface PenawaranData {
  nomor: string;
  /** Update #032 — revisi dokumen: 1 = asal; 2+ tampil "Rev. N" di cetakan. */
  revisiKe?: number;
  tanggal: string;
  berlakuHingga: string;
  kepada: string;
  alamatPenerima: string;
  syaratPembayaran: string;
  keterangan: string;
  /** Update #003: No. PO customer — terisi saat penawaran dibuat (dibawa ke SO). */
  noPo?: string;
  detail: DetailRow[];
  biayaTambahan: BiayaTambahan[];
  diskonGlobal: number;
  // === Update #042 — PPN dihapus dari penawaran (dokumen nilai penuh;
  // grand total = subtotal − diskon + biaya; PPN hanya di INVOICE). ===
}

// ─── Shared Styles ───────────────────────────────────────────────────────────

const rootStyle: React.CSSProperties = {
  fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
  fontSize: '11px',
  lineHeight: '1.4'
};

const tableStyle: React.CSSProperties = {
  borderCollapse: 'collapse',
  width: '100%'
};

const cellStyle: React.CSSProperties = {
  border: '1px solid #333',
  padding: '4px 8px'
};

const headerCellStyle: React.CSSProperties = {
  ...cellStyle,
  backgroundColor: '#f3f4f6',
  fontWeight: 'bold',
  textAlign: 'center' as const
};

// ─── Helper: Info Cell (label-value pair for right column grids) ─────────────

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1" style={{ fontSize: '11px' }}>
      <span style={{ minWidth: '130px', whiteSpace: 'nowrap' }}>
        <strong>{label}</strong>
      </span>
      <span style={{ minWidth: '12px' }}>:</span>
      <span>{value || '-'}</span>
    </div>
  );
}

// ─── Helper: SummaryTable (private, used by Invoice / Retur / Penawaran) ───
// Update ASAHI #5: terbilang TIDAK lagi menjadi baris di dalam tabel ringkasan —
// posisinya dikembalikan ke blok footer kiri template (seperti sebelumnya),
// tetap menyebut TOTAL.

// === Update #043 — sanitasi tampilan KETERANGAN invoice lama: sebelum #043
// backend menyimpan nomor dengan dobel "SO SO ..." (mis. "DP atas SO SO
// ASI/2026/001"). Cukup diganti pada CETAKAN (data tidak diubah) — hanya
// kembar "SO SO" SETELAH kata "atas " yang dirapatkan jadi satu "SO". ===
function sanitizeKeterangan(keterangan: string): string {
  return keterangan.replace(/(atas\s+)(?:SO\s+){2,}/gi, '$1SO ');
}

function SummaryTable({ detail, diskonGlobal, ppn, biayaTambahan, ppnApplicable = true, pph23Applicable = false, pph23 = 0, hideDiskon = false, dpPelunasan }: { detail: DetailRow[]; diskonGlobal: number; ppn: number; biayaTambahan: BiayaTambahan[]; ppnApplicable?: boolean; pph23Applicable?: boolean; pph23?: number; hideDiskon?: boolean; dpPelunasan?: number }) {
  // === Update #042 — DP/Pelunasan (header invoice) menggantikan perhitungan
  // dari dp per baris: gross = Σ qty × harga (nilai penuh); effective =
  // dpPelunasan bila > 0 (nilai ditagih), selain itu gross (perilaku lama).
  // === Update #043 — susunan baris TANPA angka minus: "DP/Pelunasan (nilai
  // ditagih invoice ini)" = effective (POSITIF) dan "Dialihkan ke invoice
  // berikutnya" = gross − effective (POSITIF); pajak & Total tetap atas
  // nilai efektif (rumus tidak berubah). ===
  const gross = detail.reduce((s, r) => s + r.qty * r.harga, 0);
  const effective = dpPelunasan != null && dpPelunasan > 0 ? dpPelunasan : gross;
  const dialihkan = Math.max(gross - effective, 0);
  const subTotal = gross;
  const diskonAmt = diskonGlobal ? (effective * diskonGlobal) / 100 : 0;
  const afterDiskon = effective - diskonAmt;
  // Update ASAHI: PPN hanya bila dipilih; PPh23 (jika dipilih) memotong total.
  const ppnAmt = ppnApplicable && ppn ? (afterDiskon * ppn) / 100 : 0;
  const pph23Amt = pph23Applicable && pph23 ? (afterDiskon * pph23) / 100 : 0;
  const biayaLain = biayaTambahan.reduce((s, b) => s + b.jumlah, 0);
  const grandTotal = afterDiskon + ppnAmt + biayaLain - pph23Amt;

  return (
    <table style={tableStyle}>
      <tbody>
        <tr>
          <td style={{ ...cellStyle, width: '160px' }}>Sub Total</td>
          <td style={{ ...cellStyle, textAlign: 'right', width: '140px' }}>{formatNumber(subTotal)}</td>
        </tr>
        {/* === Update #043 — DP/Pelunasan (nilai yang ditagih invoice ini)
            tampil POSITIF; selisih nilai baris penuh yang tidak ditagih di
            sini dicetak sebagai "Dialihkan ke invoice berikutnya" (POSITIF,
            tanpa tanda minus). === */}
        {dpPelunasan != null && dpPelunasan > 0 && (
          <tr>
            <td style={cellStyle}>DP/Pelunasan (nilai ditagih invoice ini)</td>
            <td style={{ ...cellStyle, textAlign: 'right' }}>{formatNumber(effective)}</td>
          </tr>
        )}
        {dialihkan > 0 && (
          <tr>
            <td style={cellStyle}>Dialihkan ke invoice berikutnya</td>
            <td style={{ ...cellStyle, textAlign: 'right' }}>{formatNumber(dialihkan)}</td>
          </tr>
        )}
        {/* Update #004: baris Diskon setelah Sub Total dihapus dari invoice (hideDiskon). */}
        {!hideDiskon && (
          <tr>
            <td style={cellStyle}>Diskon ({diskonGlobal || 0}%)</td>
            <td style={{ ...cellStyle, textAlign: 'right' }}>- {formatNumber(diskonAmt)}</td>
          </tr>
        )}
        {ppnApplicable && (
          <tr>
            <td style={cellStyle}>PPN ({ppn || 0}%)</td>
            <td style={{ ...cellStyle, textAlign: 'right' }}>{formatNumber(ppnAmt)}</td>
          </tr>
        )}
        {pph23Applicable && (
          <tr>
            <td style={cellStyle}>PPh23 ({pph23 || 0}%)</td>
            <td style={{ ...cellStyle, textAlign: 'right' }}>- {formatNumber(pph23Amt)}</td>
          </tr>
        )}
        {biayaTambahan.length > 0 && (
          <tr>
            <td style={cellStyle}>Biaya Lain-lain</td>
            <td style={{ ...cellStyle, textAlign: 'right' }}>{formatNumber(biayaLain)}</td>
          </tr>
        )}
        <tr>
          <td style={{ ...cellStyle, fontWeight: 'bold' }}>Total</td>
          <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold' }}>{formatNumber(grandTotal)}</td>
        </tr>
      </tbody>
    </table>
  );
}

// ─── Helper: Detail Table with price columns (Invoice / Retur / Penawaran) ───
// Update #5: + kolom No urut (40px), label qty → "Qty", + kolom Satuan terpisah.

function DetailTableWithPrice({ detail, hideDiskon = false, hideAt = false }: { detail: DetailRow[]; hideDiskon?: boolean; hideAt?: boolean }) {
  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={{ ...headerCellStyle, width: '40px' }}>No</th>
          <th style={headerCellStyle}>Nama Barang</th>
          <th style={{ ...headerCellStyle, width: '50px' }}>Qty</th>
          <th style={{ ...headerCellStyle, width: '90px' }}>Satuan</th>
          {/* Update #004: invoice tanpa prefix "@" pada kolom Harga (hideAt). */}
          <th style={{ ...headerCellStyle, width: '100px' }}>{hideAt ? 'Harga' : '@Harga'}</th>
          {/* Update #004: kolom Diskon dihapus dari invoice (hideDiskon). */}
          {!hideDiskon && <th style={{ ...headerCellStyle, width: '70px' }}>Diskon (%)</th>}
          <th style={{ ...headerCellStyle, width: '110px' }}>Total Harga</th>
        </tr>
      </thead>
      <tbody>
        {detail.map((row, i) => {
          // === Update #042 — Total Harga = subTotal baris (nilai ditagih —
          // untuk invoice: porsi dpPelunasan; suffix " (DP)" & row.dp DIHAPUS).
          // Fallback qty × harga × (1 − diskon%) bila subTotal tak tersedia
          // (SO/penawaran/retur lama tanpa nilai baris). ===
          const totalHarga = row.subTotal != null ? row.subTotal : row.qty * row.harga * (1 - (row.diskon || 0) / 100);
          return (
            <tr key={row.id}>
              <td style={{ ...cellStyle, textAlign: 'center' }}>{i + 1}</td>
              <td style={cellStyle}>{row.barang}</td>
              <td style={{ ...cellStyle, textAlign: 'center' }}>{formatNumber(row.qty)}</td>
              <td style={{ ...cellStyle, textAlign: 'center' }}>{row.satuan || '-'}</td>
              <td style={{ ...cellStyle, textAlign: 'right' }}>{formatNumber(row.harga)}</td>
              {!hideDiskon && <td style={{ ...cellStyle, textAlign: 'center' }}>{row.diskon || 0}</td>}
              <td style={{ ...cellStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNumber(totalHarga)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Helper: Biaya Tambahan Table ───────────────────────────────────────────

function BiayaTambahanTable({ items }: { items: BiayaTambahan[] }) {
  if (!items || items.length === 0) return null;
  return (
    <table style={{ ...tableStyle, marginTop: '6px' }}>
      <thead>
        <tr>
          <th style={{ ...headerCellStyle, width: '250px' }}>Nama Biaya</th>
          <th style={headerCellStyle}>Jumlah</th>
        </tr>
      </thead>
      <tbody>
        {items.map((b) => (
          <tr key={b.id}>
            <td style={cellStyle}>{b.nama}</td>
            <td style={{ ...cellStyle, textAlign: 'right' }}>{formatNumber(b.jumlah)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. PESANAN PENJUALAN
// ═════════════════════════════════════════════════════════════════════════════

export function PesananPDFTemplate({ data }: { data: PesananData }) {
  // Update ASAHI (revisi SO): Total Kuantitas & Jumlah Barang dihapus dari
  // dokumen — tidak ada lagi perhitungan ringkasan qty/jumlah item.
  return (
    <div id="pdf-content" className="bg-white text-black p-8 min-w-[210mm]" style={rootStyle}>
      {/* ── Header ── */}
      <div className="flex justify-between items-start mb-4">
        <CompanyBrand />
        {/* Update ASAHI: judul cetak "Pesanan Penjualan" → "Sales Order".
            Ukuran font judul diatur di SATU tempat: DOC_TITLE_FONT_SIZE
            (src/lib/pdf-utils.ts). */}
        <div style={{ fontSize: DOC_TITLE_FONT_SIZE, fontWeight: 'bold' }}>Sales Order</div>
      </div>

      {/* ── Info Section ── */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          {/* Update ASAHI: label "Kepada" → "Nama Customer:" */}
          <div style={{ marginBottom: '2px' }}>
            <strong>Nama Customer:</strong>
          </div>
          <div style={{ marginBottom: '2px' }}>{data.kepada}</div>
          <div>{data.alamatPenerima}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <InfoCell label="Tanggal" value={formatDate(data.tanggal)} />
          <InfoCell label="Nomor" value={data.nomor} />
          <InfoCell label="No PO" value={data.noPo} />
          <InfoCell label="Syarat Pembayaran" value={data.syaratPembayaran} />
          {/* Update ASAHI (revisi SO): label "Tanggal Pengiriman" → "Target Pengiriman";
              field Ekspedisi & Penjual dihapus dari dokumen. */}
          <InfoCell label="Target Pengiriman" value={formatDate(data.tanggalPengiriman)} />
        </div>
      </div>

      {/* ── Detail Table (tanpa harga) ── */}
      <div className="mb-4">
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...headerCellStyle, width: '40px' }}>No</th>
              <th style={headerCellStyle}>Nama Barang</th>
              <th style={{ ...headerCellStyle, width: '80px' }}>Qty</th>
              <th style={{ ...headerCellStyle, width: '100px' }}>Satuan</th>
            </tr>
          </thead>
          <tbody>
            {data.detail.map((row, i) => (
              <tr key={row.id}>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{i + 1}</td>
                <td style={cellStyle}>{row.barang}</td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{formatNumber(row.qty)}</td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{row.satuan || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Footer ── */}
      <div className="grid grid-cols-1 gap-6 mt-4">
        {/* Keterangan (opsional) */}
        {data.keterangan && (
          <div>
            <strong>Keterangan:</strong>
            <div style={{ whiteSpace: 'pre-wrap' }}>{data.keterangan}</div>
          </div>
        )}
      </div>

      {/* ── Signatures — Update ASAHI (revisi SO): dua tanda tangan
          "Disiapkan oleh" & "Disetujui oleh", masing-masing dengan kolom
          tanda tangan dan tanggal di bawahnya (menggantikan blok lama
          "Disetujui, Tgl. ________" dan ringkasan Total Kuantitas /
          Jumlah Barang yang dihapus). ── */}
      <div className="grid grid-cols-2 gap-8 mt-10" style={{ textAlign: 'center' }}>
        <div>
          <div>Disiapkan oleh,</div>
          {/* Kolom tanda tangan */}
          <div style={{ marginTop: '56px' }}>_____________________</div>
          <div>Tgl. ______________</div>
        </div>
        <div>
          <div>Disetujui oleh,</div>
          {/* Kolom tanda tangan */}
          <div style={{ marginTop: '56px' }}>_____________________</div>
          <div>Tgl. ______________</div>
        </div>
      </div>

      {/* Indikator halaman digambar otomatis oleh jsPDF di kanan bawah
          (lihat generatePDF di src/lib/pdf-utils.ts) — berlaku semua dokumen. */}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. DELIVERY ORDER (PENGIRIMAN — dulu "Surat Jalan")
// ═════════════════════════════════════════════════════════════════════════════

export function PengirimanPDFTemplate({ data }: { data: PengirimanData }) {
  // Update #004: Total Kuantitas & Jumlah Barang dihapus dari dokumen DO.
  return (
    <div id="pdf-content" className="bg-white text-black p-8 min-w-[210mm]" style={rootStyle}>
      {/* ── Header ── */}
      <div className="flex justify-between items-start mb-4">
        <CompanyBrand />
        <div style={{ fontSize: DOC_TITLE_FONT_SIZE, fontWeight: 'bold' }}>Delivery Order</div>
      </div>

      {/* ── Info Section ── */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          {/* Update ASAHI — label "Kepada" → "Kirim ke"; alamat perusahaan
              (dari master data pelanggan) tampil di bawah nama. */}
          <div style={{ marginBottom: '2px' }}>
            <strong>Kirim ke</strong>
          </div>
          <div style={{ marginBottom: '2px' }}>{data.kepada}</div>
          <div style={{ whiteSpace: 'pre-line' }}>{data.alamatPenerima}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          {/* Update #004: label Tanggal → Tanggal Pengiriman, Nomor → Nomor
              Pengiriman; baris Ekspedisi dihapus dari dokumen DO. */}
          <InfoCell label="Tanggal Pengiriman" value={formatDate(data.tanggal)} />
          <InfoCell label="Nomor Pengiriman" value={data.nomor} />
          <InfoCell label="No SO" value={data.noSo} />
          <InfoCell label="No PO" value={data.noPo} />
        </div>
      </div>

      {/* ── Detail Table ── */}
      <div className="mb-4">
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...headerCellStyle, width: '40px' }}>No</th>
              <th style={headerCellStyle}>Nama Barang</th>
              <th style={{ ...headerCellStyle, width: '80px' }}>Qty</th>
              <th style={{ ...headerCellStyle, width: '100px' }}>Satuan</th>
            </tr>
          </thead>
          <tbody>
            {data.detail.map((row, i) => (
              <tr key={row.id}>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{i + 1}</td>
                <td style={cellStyle}>{row.barang}</td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{formatNumber(row.qty)}</td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{row.satuan || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Footer ── */}
      {/* Update #004: ringkasan Total Kuantitas / Jumlah Barang dihapus —
          hanya Keterangan (opsional) yang tampil. */}
      <div className="mt-4">
        {data.keterangan && (
          <div>
            <strong>Keterangan:</strong>
            <div style={{ whiteSpace: 'pre-wrap' }}>{data.keterangan}</div>
          </div>
        )}
      </div>

      {/* ── Signatures ── */}
      {/* Update #004: tiga pihak — Disiapkan Oleh, Dikirim Oleh, Diterima Oleh.
          Tiap blok: judul, space tanda tangan (tanpa garis kotak), lalu Tgl,
          lalu Nama Lengkap di bawahnya (sesuai catatan user). */}
      <div className="grid grid-cols-3 gap-6 mt-10" style={{ textAlign: 'center' }}>
        <div>
          <div style={{ fontWeight: 'bold' }}>Disiapkan Oleh</div>
          {/* space tanda tangan */}
          <div style={{ marginTop: '8px', height: '70px' }} />
          {/* tanggal di bawah space */}
          <div>Tgl. ____________</div>
          {/* nama lengkap di bawah tanggal */}
          <div style={{ marginTop: '2px' }}>Nama Lengkap</div>
        </div>
        <div>
          <div style={{ fontWeight: 'bold' }}>Dikirim Oleh</div>
          <div style={{ marginTop: '8px', height: '70px' }} />
          <div>Tgl. ____________</div>
          <div style={{ marginTop: '2px' }}>Nama Lengkap</div>
        </div>
        <div>
          <div style={{ fontWeight: 'bold' }}>Diterima Oleh</div>
          <div style={{ marginTop: '8px', height: '70px' }} />
          <div>Tgl. ____________</div>
          <div style={{ marginTop: '2px' }}>Nama Lengkap</div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. INVOICE PENJUALAN (Update #5 — rename judul print)
// ═════════════════════════════════════════════════════════════════════════════

export function InvoicePDFTemplate({ data }: { data: InvoiceData }) {
  // Update ASAHI #5: posisi terbilang dikembalikan ke blok footer kiri
  // (seperti sebelum update #4) — tetap menyebut TOTAL.
  // Update ASAHI #6: rekening bank aktif dari Profil Perusahaan — tampil di
  // bawah Keterangan (nama bank + "Acc Nbr <nomor> (<mata uang>)").
  // Update ASAHI #7: nama perusahaan penerima ditampilkan sebagai baris
  // pertama blok rekening bank (di atas nama bank).
  const { name: companyName, rekeningBank } = useCompanyInfo();
  // Update ASAHI (PPh23/PPN opsional): PPN hanya bila dipilih; PPh23
  // memotong grand total — konsisten dengan perhitungan backend.
  const ppnOn = data.ppnApplicable ?? true;
  const pph23On = data.pph23Applicable ?? false;
  // === Update #042 — DP/Pelunasan (header invoice) menggantikan dp per
  // baris: nilai yang ditagih invoice ini (0/kosong = tagih penuh
  // Σ qty × harga). Terbilang & total mengikuti nilai efektif. ===
  const gross = data.detail.reduce((s, r) => s + r.qty * r.harga, 0);
  const dpEff = data.dpPelunasan != null && data.dpPelunasan > 0 ? data.dpPelunasan : gross;
  const diskonAmt = data.diskonGlobal ? (dpEff * data.diskonGlobal) / 100 : 0;
  const afterDiskon = dpEff - diskonAmt;
  const ppnAmt = ppnOn && data.ppn ? (afterDiskon * data.ppn) / 100 : 0;
  const pph23Amt = pph23On && data.pph23 ? (afterDiskon * data.pph23) / 100 : 0;
  const biayaLain = data.biayaTambahan.reduce((s, b) => s + b.jumlah, 0);
  const grandTotal = afterDiskon + ppnAmt + biayaLain - pph23Amt;

  return (
    <div id="pdf-content" className="bg-white text-black p-8 min-w-[210mm]" style={rootStyle}>
      {/* ── Header ── */}
      <div className="flex justify-between items-start mb-4">
        {/* Update ASAHI #6: slogan perusahaan tampil KHUSUS di Invoice
            Penjualan — di bawah nama perusahaan, di samping logo. */}
        <CompanyBrand showSlogan />
        <div style={{ fontSize: DOC_TITLE_FONT_SIZE, fontWeight: 'bold' }}>Invoice Penjualan</div>
      </div>

      {/* ── Info Section ── */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          {/* Update ASAHI #6: label "Kepada" → "Tagihan ke" (khusus Invoice
              Penjualan — dokumen lain tetap). */}
          <div style={{ marginBottom: '2px' }}>
            <strong>Tagihan ke</strong>
          </div>
          <div style={{ marginBottom: '2px' }}>{data.kepada}</div>
          <div>{data.alamatPenerima}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          {/* Update #004: label Tanggal → Tanggal Invoice; baris Syarat
              Pembayaran / Ekspedisi / Tanggal Pengiriman dihapus; label
              "No Surat Jalan" → "No DO". */}
          <InfoCell label="Tanggal Invoice" value={formatDate(data.tanggal)} />
          <InfoCell label="Nomor" value={data.nomor} />
          <InfoCell label="No SO" value={data.noSo} />
          <InfoCell label="No PO" value={data.noPo} />
          <InfoCell label="No DO" value={data.noDo} />
          <InfoCell label="Mata Uang" value={data.mataUang} />
        </div>
      </div>

      {/* ── Detail Table ── */}
      <div className="mb-4">
        {/* Update #004: kolom Harga tanpa "@"; kolom Diskon dihapus. */}
        <DetailTableWithPrice detail={data.detail} hideDiskon hideAt />
      </div>

      {/* ── Biaya Tambahan ── */}
      {data.biayaTambahan.length > 0 && (
        <div className="mb-4">
          <BiayaTambahanTable items={data.biayaTambahan} />
        </div>
      )}

      {/* ── Footer ── */}
      <div className="grid grid-cols-2 gap-6 mt-4">
        {/* Left */}
        <div>
          {/* Update ASAHI #5: posisi terbilang seperti semula — blok italic di
              footer kiri (di atas Keterangan), tetap menyebut TOTAL. */}
          <div style={{ marginBottom: '6px' }}>
            <span style={{ fontStyle: 'italic' }}>Terbilang: {terbilang(grandTotal)}</span>
          </div>
          {/* === Update #042 — baris footer SISA PEMBAYARAN dari SO ter-link:
              tampil bila invoice punya SO (noSo tersedia) & soSisaNilai tidak
              null. Update #043 — label TANPA prefix "SO " ganda (noSo sudah
              mengandung "SO"); nilai: sisa > 0 → Rp; ≤ 0 → "lunas" (baris
              tetap tercetak saat sisa 0). === */}
          {data.noSo && data.soSisaNilai != null && (
            <div style={{ marginBottom: '6px' }}>
              <strong>
                Sisa pembayaran dari {data.noSo}: {data.soSisaNilai > 0 ? `Rp ${formatNumber(data.soSisaNilai)}` : 'lunas'}
              </strong>
            </div>
          )}
          {/* Update ASAHI #6: Keterangan SELALU tampil di bawah terbilang
              (dulu hanya saat diisi) — sesuai susunan invoice yang diminta.
              Update #043: display melewati sanitizeKeterangan — keterangan
              invoice LAMA tersimpan dengan dobel "SO SO ..." dirapatkan
              (hanya cetakan; data tidak diubah). */}
          <div style={{ marginBottom: '12px' }}>
            <strong>Keterangan:</strong>
            <div style={{ whiteSpace: 'pre-wrap' }}>{sanitizeKeterangan(data.keterangan)}</div>
          </div>
          {/* Update ASAHI #6: rekening bank perusahaan (Pengaturan → Profil
              Perusahaan) — di bawah Keterangan; tiap rekening dua baris:
              nama bank lalu "Acc Nbr <nomor> (<mata uang>)".
              Update ASAHI #7: baris pertama blok = nama perusahaan penerima
              (dari Profil Perusahaan), di atas nama bank. */}
          {rekeningBank.length > 0 && (
            <div>
              <div>{companyName}</div>
              {rekeningBank.map((rek) => (
                <div key={rek.id} style={{ marginBottom: '4px' }}>
                  <div>{rek.namaBank}</div>
                  <div>
                    Acc Nbr {rek.noRekening} ({rek.mataUang})
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          {/* Update ASAHI: pilihan PPh23/PPN dari data invoice
              Update #004: baris Diskon setelah Sub Total disembunyikan (hideDiskon).
              Update #042: dpPelunasan (header) menggantikan perhitungan dp per
              baris — baris potongan "DP/Pelunasan" + pajak atas nilai ditagih. */}
          <SummaryTable detail={data.detail} diskonGlobal={data.diskonGlobal} ppn={data.ppn} biayaTambahan={data.biayaTambahan} ppnApplicable={data.ppnApplicable ?? true} pph23Applicable={data.pph23Applicable ?? false} pph23={data.pph23 ?? 0} hideDiskon dpPelunasan={data.dpPelunasan} />
        </div>
      </div>

      {/* ── Signatures ── */}
      {/* Update #004: "Disetujui Oleh" → "Diterima Oleh". */}
      <div className="grid grid-cols-2 gap-8 mt-10" style={{ textAlign: 'center' }}>
        <div>
          <div>Disiapkan Oleh</div>
          <div style={{ marginTop: '48px' }}>______</div>
          <div>Tgl.</div>
        </div>
        <div>
          <div>Diterima Oleh</div>
          <div style={{ marginTop: '48px' }}>______</div>
          <div>Tgl.</div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. RETUR PENJUALAN
// ═════════════════════════════════════════════════════════════════════════════

export function ReturPDFTemplate({ data }: { data: ReturData }) {
  // Update ASAHI #5: posisi terbilang dikembalikan ke blok footer kiri
  // (seperti sebelum update #4) — tetap menyebut TOTAL.
  const subTotal = data.detail.reduce((s, r) => s + r.qty * r.harga, 0);
  const diskonAmt = data.diskonGlobal ? (subTotal * data.diskonGlobal) / 100 : 0;
  const afterDiskon = subTotal - diskonAmt;
  const ppnAmt = data.ppn ? (afterDiskon * data.ppn) / 100 : 0;
  const grandTotal = afterDiskon + ppnAmt;

  return (
    <div id="pdf-content" className="bg-white text-black p-8 min-w-[210mm]" style={rootStyle}>
      {/* ── Header ── */}
      <div className="flex justify-between items-start mb-4">
        <CompanyBrand />
        <div style={{ fontSize: DOC_TITLE_FONT_SIZE, fontWeight: 'bold' }}>Retur Penjualan</div>
      </div>

      {/* ── Info Section ── */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div style={{ marginBottom: '2px' }}>
            <strong>Dari</strong>
          </div>
          <div style={{ marginBottom: '2px' }}>{data.dari}</div>
          <div>{data.alamatPengembalian}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <InfoCell label="No. Retur" value={data.nomor} />
          <InfoCell label="Tanggal" value={formatDate(data.tanggal)} />
          <InfoCell label="Pengembalian" value={data.noPengembalian} />
        </div>
      </div>

      {/* ── Detail Table ── */}
      <div className="mb-4">
        <DetailTableWithPrice detail={data.detail} />
      </div>

      {/* ── Footer ── */}
      <div className="grid grid-cols-2 gap-6 mt-4">
        {/* Left */}
        <div>
          {/* Update ASAHI #5: posisi terbilang seperti semula — blok italic di
              footer kiri (di atas Keterangan), tetap menyebut TOTAL. */}
          <div style={{ marginBottom: '6px' }}>
            <span style={{ fontStyle: 'italic' }}>Terbilang: {terbilang(grandTotal)}</span>
          </div>
          {data.keterangan && (
            <div>
              <strong>Keterangan:</strong>
              <div style={{ whiteSpace: 'pre-wrap' }}>{data.keterangan}</div>
            </div>
          )}
        </div>

        {/* Right */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <SummaryTable detail={data.detail} diskonGlobal={data.diskonGlobal} ppn={data.ppn} biayaTambahan={[]} />
        </div>
      </div>
    </div>
  );
}
// ═════════════════════════════════════════════════════════════════════════════
// 5. PENAWARAN (QUOTATION)
// ═════════════════════════════════════════════════════════════════════════════

export function PenawaranPDFTemplate({ data }: { data: PenawaranData }) {
  // Update ASAHI #5: posisi terbilang dikembalikan ke blok footer kiri
  // (seperti sebelum update #4) — tetap menyebut TOTAL.
  // === Update #042 — PPN DIHAPUS dari penawaran (order doc nilai penuh
  // tanpa pajak; PPN hanya di INVOICE): grand total = subtotal − diskon
  // + biaya; ringkasan tanpa baris "DP Diterapkan"/PPN. ===
  const subTotal = data.detail.reduce((s, r) => s + r.qty * r.harga, 0);
  const diskonAmt = data.diskonGlobal ? (subTotal * data.diskonGlobal) / 100 : 0;
  const afterDiskon = subTotal - diskonAmt;
  const biayaLain = data.biayaTambahan.reduce((s, b) => s + b.jumlah, 0);
  const grandTotal = afterDiskon + biayaLain;

  return (
    <div id="pdf-content" className="bg-white text-black p-8 min-w-[210mm]" style={rootStyle}>
      {/* ── Header ── */}
      <div className="flex justify-between items-start mb-4">
        <CompanyBrand />
        <div style={{ fontSize: DOC_TITLE_FONT_SIZE, fontWeight: 'bold' }}>Penawaran</div>
      </div>

      {/* ── Info Section ── */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div style={{ marginBottom: '2px' }}>
            <strong>Kepada</strong>
          </div>
          <div style={{ marginBottom: '2px' }}>{data.kepada}</div>
          <div>{data.alamatPenerima}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <InfoCell label="Tanggal" value={formatDate(data.tanggal)} />
          {/* Update #031: label nomor = "No. Quotation" (field Nomor PO dihapus
              dari form penawaran; baris No PO hanya tampil bila ada nilainya).
              Update #032: revisi tampil "— Rev. N" di sebelah nomor (nomor
              quotation TIDAK berubah antar revisi). */}
          <InfoCell label="No. Quotation" value={`${data.nomor}${data.revisiKe && data.revisiKe > 1 ? ` — Rev. ${data.revisiKe}` : ''}`} />
          {data.noPo ? <InfoCell label="No PO" value={data.noPo} /> : null}
          <InfoCell label="Berlaku Hingga" value={formatDate(data.berlakuHingga)} />
          <InfoCell label="Syarat Pembayaran" value={data.syaratPembayaran} />
        </div>
      </div>

      {/* ── Detail Table (dengan harga; kolom Satuan terpisah — Update #5) ── */}
      <div className="mb-4">
        <DetailTableWithPrice detail={data.detail} />
      </div>

      {/* ── Biaya Tambahan ── */}
      {data.biayaTambahan.length > 0 && (
        <div className="mb-4">
          <BiayaTambahanTable items={data.biayaTambahan} />
        </div>
      )}

      {/* ── Footer ── */}
      <div className="grid grid-cols-2 gap-6 mt-4">
        {/* Left */}
        <div>
          {/* Update ASAHI #5: posisi terbilang seperti semula — blok italic di
              footer kiri (di atas Keterangan), tetap menyebut TOTAL. */}
          <div style={{ marginBottom: '6px' }}>
            <span style={{ fontStyle: 'italic' }}>Terbilang: {terbilang(grandTotal)}</span>
          </div>
          {data.keterangan && (
            <div style={{ marginBottom: '12px' }}>
              <strong>Keterangan:</strong>
              <div style={{ whiteSpace: 'pre-wrap' }}>{data.keterangan}</div>
            </div>
          )}
        </div>

        {/* Right */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          {/* === Update #042 — ringkasan penawaran TANPA PPN (dokumen nilai
              penuh; pajak hanya di INVOICE) — ppnApplicable=false meniadikan
              baris PPN di SummaryTable. === */}
          <SummaryTable detail={data.detail} diskonGlobal={data.diskonGlobal} ppn={0} biayaTambahan={data.biayaTambahan} ppnApplicable={false} />
        </div>
      </div>

      {/* ── Signatures ── */}
      <div className="grid grid-cols-2 gap-8 mt-10" style={{ textAlign: 'center' }}>
        <div>
          <div>Disiapkan Oleh</div>
          <div style={{ marginTop: '48px' }}>______</div>
          <div>Tgl.</div>
        </div>
        <div>
          <div>Disetujui Oleh</div>
          <div style={{ marginTop: '48px' }}>______</div>
          <div>Tgl.</div>
        </div>
      </div>
    </div>
  );
}
