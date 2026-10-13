'use client';

import { formatNumber, formatDate, terbilang, DOC_TITLE_FONT_SIZE } from '@/lib/pdf-utils';
// Update ASAHI: header cetak pakai identitas perusahaan dinamis (Pengaturan → Profil Perusahaan)
import { CompanyBrand } from '@/components/erp/company-brand';
// Update ASAHI #005 — info perusahaan di footer LPPB (dari store profil)
import { useCompanyInfo } from '@/store/company-store';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PembelianDetailRow {
  id: string;
  barang: string;
  harga: number;
  qty: number;
  diskon: number; // percentage
  satuan?: string | null; // nama satuan per baris — kolom "Satuan" di semua cetakan (Update #5)
  // === Update #002 — tracking per baris (cetak PO): Ket. SO + Jenis Belanja ===
  so?: string | null; // no. pesanan SO ter-link (null → "-")
  jenis?: string | null; // label jenis belanja (Consumable/Project/Asset/ATK)
}

export interface PenerimaanDetailRow {
  id: string;
  barang: string;
  qty: number;
  satuan: string;
}

export interface ReturDetailRow {
  id: string;
  barang: string;
  harga: number;
  qty: number;
  satuan?: string | null; // Update #5: nama satuan per baris — kolom "Satuan" di print retur
}

export interface BiayaTambahan {
  id: string;
  nama: string;
  jumlah: number;
}

export interface PembelianData {
  nomor: string;
  tanggal: string;
  tanggalKirim: string;
  kepada: string;
  alamat: string;
  // === Update ASAHI (cetak PO): Kontak Person & No. Contact supplier ===
  kontakPerson: string;
  noContact: string;
  // === Update ASAHI #3: mata uang pilihan saat input PO + alamat pengiriman ===
  /** Kode mata uang (mis. "USD") — dipakai untuk prefix nominal. */
  mataUang: string;
  /** Label tampilan (mis. "USD — US Dollar"); fallback ke kode. */
  mataUangLabel?: string;
  alamatPengiriman: string;
  // === Update #003: ppic dihapus dari form/cetak PO ===
  // === Update #002 — snapshot PIC Gudang (cetak PO, di bawah alamat pengiriman) ===
  picGudang?: string | null;
  picGudangTelepon?: string | null;
  detail: PembelianDetailRow[];
  biayaTambahan: BiayaTambahan[];
  keterangan: string;
  diskonGlobal: number;
  ppn: number;
  // === Update ASAHI — pilihan PPh23/PPN saat input PO (opsional) ===
  ppnApplicable?: boolean;
  pph23Applicable?: boolean;
  pph23?: number;
}

export interface PenerimaanData {
  nomor: string;
  tanggal: string;
  kepada: string;
  alamat: string;
  detail: PenerimaanDetailRow[];
  keterangan: string;
}

export interface InvoicePembelianData {
  nomor: string;
  noFaktur: string;
  tanggal: string;
  dari: string;
  alamat: string;
  detail: PembelianDetailRow[];
  biayaTambahan: BiayaTambahan[];
  keterangan: string;
  diskonGlobal: number;
  ppn: number;
}

export interface ReturPembelianData {
  nomor: string;
  tanggal: string;
  noReferensi: string;
  kepada: string;
  alamat: string;
  detail: ReturDetailRow[];
  keterangan: string;
  ppn: number;
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

// ─── Helper: Info Cell (label-value pair) ────────────────────────────────────

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

// ─── Helper: uang dengan kode mata uang (update ASAHI #3) ───────────────────
// IDR (mata uang dasar) → angka saja; selain itu → "USD 1.234" dst.,
// konsisten dengan format daftar pesanan di aplikasi.

function money(value: number, currency?: string | null) {
  const amount = formatNumber(value);
  return currency && currency !== 'IDR' ? `${currency} ${amount}` : amount;
}

// ─── Helper: Detail Table PO dengan kolom harga (update ASAHI #3) ────────────
// Susunan kolom sama dengan Invoice Penjualan: No | Nama Barang | Qty |
// Satuan | @Harga | Diskon (%) | Total Harga.
// Update #002: + kolom "Ket. SO" (setelah Total Harga, sesuai catatan user)
// dan "Jenis" (jenis belanja) — tracking item PO ke SO per baris.
// Total Harga kini memperhitungkan diskon per baris (qty × harga × (1 − diskon%))
// agar konsisten dengan form PO dan perhitungan server.

function PODetailTableWithPrice({ detail, currency }: { detail: PembelianDetailRow[]; currency?: string | null }) {
  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={{ ...headerCellStyle, width: '30px' }}>No</th>
          <th style={headerCellStyle}>Nama Barang</th>
          <th style={{ ...headerCellStyle, width: '40px' }}>Qty</th>
          <th style={{ ...headerCellStyle, width: '70px' }}>Satuan</th>
          <th style={{ ...headerCellStyle, width: '85px' }}>@Harga</th>
          <th style={{ ...headerCellStyle, width: '55px' }}>Diskon (%)</th>
          <th style={{ ...headerCellStyle, width: '95px' }}>Total Harga</th>
          <th style={{ ...headerCellStyle, width: '130px' }}>Ket. SO</th>
          <th style={{ ...headerCellStyle, width: '80px' }}>Jenis</th>
        </tr>
      </thead>
      <tbody>
        {detail.map((row, i) => {
          const totalHarga = row.qty * row.harga * (1 - (row.diskon || 0) / 100);
          return (
            <tr key={row.id}>
              <td style={{ ...cellStyle, textAlign: 'center' }}>{i + 1}</td>
              <td style={cellStyle}>{row.barang}</td>
              <td style={{ ...cellStyle, textAlign: 'center' }}>{formatNumber(row.qty)}</td>
              <td style={{ ...cellStyle, textAlign: 'center' }}>{row.satuan || '-'}</td>
              <td style={{ ...cellStyle, textAlign: 'right' }}>{money(row.harga, currency)}</td>
              <td style={{ ...cellStyle, textAlign: 'center' }}>{row.diskon || 0}</td>
              <td style={{ ...cellStyle, textAlign: 'right' }}>{money(totalHarga, currency)}</td>
              <td style={{ ...cellStyle, textAlign: 'center' }}>{row.so || '-'}</td>
              <td style={{ ...cellStyle, textAlign: 'center' }}>{row.jenis || '-'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Helper: Summary Table PO dengan mata uang (update ASAHI #3) ────────────
// Update ASAHI #5: terbilang TIDAK lagi menjadi baris di dalam tabel ringkasan —
// posisinya dikembalikan ke blok footer kiri template (seperti sebelumnya),
// tetap menyebut TOTAL (hanya IDR).

function POSummaryTable({ detail, diskonGlobal, ppn, biayaTambahan, currency, ppnApplicable = true, pph23Applicable = false, pph23 = 0 }: { detail: PembelianDetailRow[]; diskonGlobal: number; ppn: number; biayaTambahan: BiayaTambahan[]; currency?: string | null; ppnApplicable?: boolean; pph23Applicable?: boolean; pph23?: number }) {
  // Update #002: subTotal memperhitungkan diskon per baris — konsisten dengan
  // kolom "Total Harga" di tabel detail dan perhitungan server.
  const subTotal = detail.reduce((s, r) => s + r.qty * r.harga * (1 - (r.diskon || 0) / 100), 0);
  const diskonAmt = diskonGlobal ? (subTotal * diskonGlobal) / 100 : 0;
  const afterDiskon = subTotal - diskonAmt;
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
          <td style={{ ...cellStyle, textAlign: 'right', width: '140px' }}>{money(subTotal, currency)}</td>
        </tr>
        <tr>
          <td style={cellStyle}>Diskon ({diskonGlobal || 0}%)</td>
          <td style={{ ...cellStyle, textAlign: 'right' }}>- {money(diskonAmt, currency)}</td>
        </tr>
        {ppnApplicable && (
          <tr>
            <td style={cellStyle}>PPN ({ppn || 0}%)</td>
            <td style={{ ...cellStyle, textAlign: 'right' }}>{money(ppnAmt, currency)}</td>
          </tr>
        )}
        {pph23Applicable && (
          <tr>
            <td style={cellStyle}>PPh23 ({pph23 || 0}%)</td>
            <td style={{ ...cellStyle, textAlign: 'right' }}>- {money(pph23Amt, currency)}</td>
          </tr>
        )}
        {biayaTambahan.length > 0 && (
          <tr>
            <td style={cellStyle}>Biaya Lain-lain</td>
            <td style={{ ...cellStyle, textAlign: 'right' }}>{money(biayaLain, currency)}</td>
          </tr>
        )}
        <tr>
          <td style={{ ...cellStyle, fontWeight: 'bold' }}>Total</td>
          <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold' }}>{money(grandTotal, currency)}</td>
        </tr>
      </tbody>
    </table>
  );
}

// ─── Helper: SummaryTable (used by Invoice) ─────────────────────────────

function SummaryTable({ detail, diskonGlobal, ppn, biayaTambahan }: { detail: PembelianDetailRow[]; diskonGlobal: number; ppn: number; biayaTambahan: BiayaTambahan[] }) {
  const subTotal = detail.reduce((s, r) => s + r.qty * r.harga, 0);
  const diskonAmt = diskonGlobal ? (subTotal * diskonGlobal) / 100 : 0;
  const afterDiskon = subTotal - diskonAmt;
  const ppnAmt = ppn ? (afterDiskon * ppn) / 100 : 0;
  const biayaLain = biayaTambahan.reduce((s, b) => s + b.jumlah, 0);
  const grandTotal = afterDiskon + ppnAmt + biayaLain;

  return (
    <table style={tableStyle}>
      <tbody>
        <tr>
          <td style={{ ...cellStyle, width: '160px' }}>Sub Total</td>
          <td style={{ ...cellStyle, textAlign: 'right', width: '140px' }}>{formatNumber(subTotal)}</td>
        </tr>
        <tr>
          <td style={cellStyle}>Diskon ({diskonGlobal || 0}%)</td>
          <td style={{ ...cellStyle, textAlign: 'right' }}>- {formatNumber(diskonAmt)}</td>
        </tr>
        <tr>
          <td style={cellStyle}>PPN ({ppn || 0}%)</td>
          <td style={{ ...cellStyle, textAlign: 'right' }}>{formatNumber(ppnAmt)}</td>
        </tr>
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

// ─── Helper: Retur SummaryTable (no diskon, no biaya tambahan) ───────────────

function ReturSummaryTable({ detail, ppn }: { detail: ReturDetailRow[]; ppn: number }) {
  const subTotal = detail.reduce((s, r) => s + r.qty * r.harga, 0);
  const ppnAmt = ppn ? (subTotal * ppn) / 100 : 0;
  const grandTotal = subTotal + ppnAmt;

  return (
    <table style={tableStyle}>
      <tbody>
        <tr>
          <td style={{ ...cellStyle, width: '160px' }}>Sub Total</td>
          <td style={{ ...cellStyle, textAlign: 'right', width: '140px' }}>{formatNumber(subTotal)}</td>
        </tr>
        <tr>
          <td style={cellStyle}>PPN ({ppn || 0}%)</td>
          <td style={{ ...cellStyle, textAlign: 'right' }}>{formatNumber(ppnAmt)}</td>
        </tr>
        <tr>
          <td style={{ ...cellStyle, fontWeight: 'bold' }}>Total</td>
          <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold' }}>{formatNumber(grandTotal)}</td>
        </tr>
      </tbody>
    </table>
  );
}

// ─── Helper: Detail Table with price columns (Invoice) ──────────────
// Update #5: + kolom No urut (40px), label qty → "Qty", + kolom Satuan terpisah.

function DetailTableWithPrice({ detail }: { detail: PembelianDetailRow[] }) {
  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={{ ...headerCellStyle, width: '40px' }}>No</th>
          <th style={headerCellStyle}>Nama Barang</th>
          <th style={{ ...headerCellStyle, width: '50px' }}>Qty</th>
          <th style={{ ...headerCellStyle, width: '90px' }}>Satuan</th>
          <th style={{ ...headerCellStyle, width: '100px' }}>@Harga</th>
          <th style={{ ...headerCellStyle, width: '70px' }}>Diskon (%)</th>
          <th style={{ ...headerCellStyle, width: '110px' }}>Total Harga</th>
        </tr>
      </thead>
      <tbody>
        {detail.map((row, i) => {
          const totalHarga = row.qty * row.harga;
          return (
            <tr key={row.id}>
              <td style={{ ...cellStyle, textAlign: 'center' }}>{i + 1}</td>
              <td style={cellStyle}>{row.barang}</td>
              <td style={{ ...cellStyle, textAlign: 'center' }}>{formatNumber(row.qty)}</td>
              <td style={{ ...cellStyle, textAlign: 'center' }}>{row.satuan || '-'}</td>
              <td style={{ ...cellStyle, textAlign: 'right' }}>{formatNumber(row.harga)}</td>
              <td style={{ ...cellStyle, textAlign: 'center' }}>{row.diskon || 0}</td>
              <td style={{ ...cellStyle, textAlign: 'right' }}>{formatNumber(totalHarga)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Helper: Retur Detail Table (no diskon column) ──────────────────────────
// Update #5: + kolom No urut, label qty → "Qty", + kolom Satuan terpisah.

function ReturDetailTable({ detail }: { detail: ReturDetailRow[] }) {
  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={{ ...headerCellStyle, width: '40px' }}>No</th>
          <th style={headerCellStyle}>Nama Barang</th>
          <th style={{ ...headerCellStyle, width: '50px' }}>Qty</th>
          <th style={{ ...headerCellStyle, width: '90px' }}>Satuan</th>
          <th style={{ ...headerCellStyle, width: '100px' }}>@Harga</th>
          <th style={{ ...headerCellStyle, width: '110px' }}>Total Harga</th>
        </tr>
      </thead>
      <tbody>
        {detail.map((row, i) => {
          const totalHarga = row.qty * row.harga;
          return (
            <tr key={row.id}>
              <td style={{ ...cellStyle, textAlign: 'center' }}>{i + 1}</td>
              <td style={cellStyle}>{row.barang}</td>
              <td style={{ ...cellStyle, textAlign: 'center' }}>{formatNumber(row.qty)}</td>
              <td style={{ ...cellStyle, textAlign: 'center' }}>{row.satuan || '-'}</td>
              <td style={{ ...cellStyle, textAlign: 'right' }}>{formatNumber(row.harga)}</td>
              <td style={{ ...cellStyle, textAlign: 'right' }}>{formatNumber(totalHarga)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Helper: Penerimaan Detail Table (no price columns) ─────────────────────
// Update #5: kolom gabungan qty+satuan dipisah → "Qty" + "Satuan" + kolom No urut.

function PenerimaanDetailTable({ detail }: { detail: PenerimaanDetailRow[] }) {
  return (
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
        {detail.map((row, i) => (
          <tr key={row.id}>
            <td style={{ ...cellStyle, textAlign: 'center' }}>{i + 1}</td>
            <td style={cellStyle}>{row.barang}</td>
            <td style={{ ...cellStyle, textAlign: 'center' }}>{formatNumber(row.qty)}</td>
            <td style={{ ...cellStyle, textAlign: 'center' }}>{row.satuan || '-'}</td>
          </tr>
        ))}
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
// 1. PESANAN PEMBELIAN
// ═════════════════════════════════════════════════════════════════════════════

export function PembelianPDFTemplate({ data }: { data: PembelianData }) {
  // Update ASAHI #5: posisi terbilang dikembalikan ke blok footer kiri
  // (seperti sebelum update #4) — tetap menyebut TOTAL, hanya untuk IDR.
  // Update ASAHI (PPh23/PPN opsional): PPN hanya bila dipilih; PPh23
  // memotong grand total — konsisten dengan perhitungan backend.
  const ppnOn = data.ppnApplicable ?? true;
  const pph23On = data.pph23Applicable ?? false;
  // Update #002: subTotal memperhitungkan diskon per baris — konsisten dengan
  // tabel detail & POSummaryTable (dipakai untuk terbilang).
  const subTotal = data.detail.reduce((s, r) => s + r.qty * r.harga * (1 - (r.diskon || 0) / 100), 0);
  const diskonAmt = data.diskonGlobal ? (subTotal * data.diskonGlobal) / 100 : 0;
  const afterDiskon = subTotal - diskonAmt;
  const ppnAmt = ppnOn && data.ppn ? (afterDiskon * data.ppn) / 100 : 0;
  const pph23Amt = pph23On && data.pph23 ? (afterDiskon * data.pph23) / 100 : 0;
  const biayaLain = data.biayaTambahan.reduce((s, b) => s + b.jumlah, 0);
  const grandTotal = afterDiskon + ppnAmt + biayaLain - pph23Amt;
  const isIdr = !data.mataUang || data.mataUang === 'IDR';

  return (
    <div id="pdf-content" className="bg-white text-black p-8 min-w-[210mm]" style={rootStyle}>
      {/* ── Header ── */}
      <div className="flex justify-between items-start mb-4">
        <CompanyBrand />
        {/* Update ASAHI: judul cetak "Pesanan Pembelian" → "Purchase Order".
            Ukuran font judul diatur di SATU tempat: DOC_TITLE_FONT_SIZE
            (src/lib/pdf-utils.ts). */}
        <div style={{ fontSize: DOC_TITLE_FONT_SIZE, fontWeight: 'bold' }}>Purchase Order</div>
      </div>

      {/* ── Info Section ── */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          {/* Update ASAHI: "Kepada" → "Nama Pemasok:" + Kontak Person & No. Contact */}
          <div style={{ marginBottom: '2px' }}>
            <strong>Nama Pemasok:</strong>
          </div>
          <div style={{ marginBottom: '2px' }}>{data.kepada}</div>
          {data.kontakPerson ? <div style={{ marginBottom: '2px' }}>Kontak Person: {data.kontakPerson}</div> : null}
          {data.noContact ? <div style={{ marginBottom: '2px' }}>No. Contact: {data.noContact}</div> : null}
          <div>{data.alamat}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <InfoCell label="Nomor" value={data.nomor} />
          {/* Update #002: "Tanggal" → "Tanggal PO", "Tanggal Kirim" → "Target Kirim". */}
          <InfoCell label="Tanggal PO" value={formatDate(data.tanggal)} />
          <InfoCell label="Target Kirim" value={formatDate(data.tanggalKirim)} />
          {/* Update ASAHI #3: tampilkan mata uang yang dipilih saat input PO */}
          <InfoCell label="Mata Uang" value={data.mataUangLabel || data.mataUang} />
        </div>
      </div>

      {/* ── Detail Table (dengan kolom harga — susunan seperti Invoice Penjualan;
           update ASAHI #3) ── */}
      <div className="mb-4">
        <PODetailTableWithPrice detail={data.detail} currency={data.mataUang} />
      </div>

      {/* ── Biaya Tambahan ── */}
      {data.biayaTambahan.length > 0 && (
        <div className="mb-4">
          <BiayaTambahanTable items={data.biayaTambahan} />
        </div>
      )}

      {/* ── Alamat Pengiriman (di bawah tabel utama — update ASAHI #3) ── */}
      {data.alamatPengiriman ? (
        <div className="mb-4">
          <strong>Alamat Pengiriman:</strong>
          <div style={{ whiteSpace: 'pre-line' }}>{data.alamatPengiriman}</div>
          {/* Update #003: baris PPIC dihapus — digantikan PIC Gudang di bawah. */}
          {/* Update #002: PIC Gudang + no. telepon (snapshot saat input PO) */}
          {data.picGudang ? (
            <div>
              PIC Gudang: {data.picGudang}
              {data.picGudangTelepon ? ` (${data.picGudangTelepon})` : ''}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Footer ── */}
      <div className="grid grid-cols-2 gap-6 mt-4">
        {/* Left */}
        <div>
          {/* Update ASAHI #5: posisi terbilang seperti semula — blok italic di
              footer kiri (di atas Keterangan). Hanya untuk IDR (mata uang dasar)
              agar tidak salah baca nominal asing. Tetap menyebut TOTAL. */}
          {isIdr && (
            <div style={{ marginBottom: '6px' }}>
              <span style={{ fontStyle: 'italic' }}>Terbilang: {terbilang(grandTotal)}</span>
            </div>
          )}
          {data.keterangan && (
            <div style={{ marginBottom: '12px' }}>
              <strong>Keterangan:</strong>
              <div style={{ whiteSpace: 'pre-wrap' }}>{data.keterangan}</div>
            </div>
          )}
          {/* Update #002: teks "Disetujui, Tgl. ________" dihapus — tanggal
              kini bagian dari blok tanda tangan tiga pihak di bawah. */}
        </div>

        {/* Right: Summary (mata uang mengikuti pilihan saat input PO) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <POSummaryTable detail={data.detail} diskonGlobal={data.diskonGlobal} ppn={data.ppn} biayaTambahan={data.biayaTambahan} currency={data.mataUang} ppnApplicable={data.ppnApplicable ?? true} pph23Applicable={data.pph23Applicable ?? false} pph23={data.pph23 ?? 0} />
        </div>
      </div>

      {/* ── Signatures ── */}
      {/* Update #002: redesign tanda tangan — tiga pihak: Dibuat Oleh,
          Disetujui Oleh, Diterima oleh (Vendor). Tiap blok: judul, kolom tanda
          tangan, lalu tanggal di bawah kolom.
          Update #004: garis kotak pada space tanda tangan dihapus — cukup
          ruang kosong (sesuai catatan user). */}
      <div className="grid grid-cols-3 gap-6 mt-10" style={{ textAlign: 'center' }}>
        <div>
          <div style={{ fontWeight: 'bold' }}>Dibuat Oleh</div>
          {/* space tanda tangan — tanpa garis kotak */}
          <div style={{ marginTop: '8px', height: '70px' }} />
          {/* tanggal di bawah space */}
          <div style={{ marginTop: '6px' }}>Tgl. ____________</div>
        </div>
        <div>
          <div style={{ fontWeight: 'bold' }}>Disetujui Oleh</div>
          <div style={{ marginTop: '8px', height: '70px' }} />
          <div style={{ marginTop: '6px' }}>Tgl. ____________</div>
        </div>
        <div>
          <div style={{ fontWeight: 'bold' }}>Diterima oleh (Vendor)</div>
          <div style={{ marginTop: '8px', height: '70px' }} />
          <div style={{ marginTop: '6px' }}>Tgl. ____________</div>
        </div>
      </div>

      {/* Indikator halaman digambar otomatis oleh jsPDF di kanan bawah
          (lihat generatePDF di src/lib/pdf-utils.ts) — berlaku semua dokumen. */}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. PENERIMAAN BARANG
// ═════════════════════════════════════════════════════════════════════════════

export function PenerimaanPDFTemplate({ data }: { data: PenerimaanData }) {
  const totalQty = data.detail.reduce((s, r) => s + r.qty, 0);
  const jumlahBarang = data.detail.length;

  return (
    <div id="pdf-content" className="bg-white text-black p-8 min-w-[210mm]" style={rootStyle}>
      {/* ── Header ── */}
      <div className="flex justify-between items-start mb-4">
        <CompanyBrand />
        <div style={{ fontSize: DOC_TITLE_FONT_SIZE, fontWeight: 'bold' }}>Penerimaan Barang</div>
      </div>

      {/* ── Info Section ── */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div style={{ marginBottom: '2px' }}>
            <strong>Kepada</strong>
          </div>
          <div style={{ marginBottom: '2px' }}>{data.kepada}</div>
          <div>{data.alamat}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <InfoCell label="No. Form" value={data.nomor} />
          <InfoCell label="Tanggal" value={formatDate(data.tanggal)} />
        </div>
      </div>

      {/* ── Detail Table ── */}
      <div className="mb-4">
        <PenerimaanDetailTable detail={data.detail} />
      </div>

      {/* ── Footer ── */}
      <div className="grid grid-cols-2 gap-6 mt-4">
        {/* Left: Keterangan */}
        <div>
          {data.keterangan && (
            <div>
              <strong>Keterangan:</strong>
              <div style={{ whiteSpace: 'pre-wrap' }}>{data.keterangan}</div>
            </div>
          )}
        </div>

        {/* Right: Summary stats */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            <span>
              <strong>Total Kuantitas:</strong>
            </span>
            <span>{formatNumber(totalQty)}</span>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <span>
              <strong>Jumlah Barang:</strong>
            </span>
            <span>{jumlahBarang}</span>
          </div>
        </div>
      </div>

      {/* ── Signatures (3 columns) ── */}
      <div className="grid grid-cols-3 gap-4 mt-10" style={{ textAlign: 'center' }}>
        <div>
          <div>Pengirim</div>
          <div style={{ marginTop: '48px' }}>______</div>
          <div>Tgl.</div>
        </div>
        <div>
          <div>Diterima Oleh</div>
          <div style={{ marginTop: '48px' }}>______</div>
          <div>Tgl.</div>
        </div>
        <div>
          <div>Disetujui Oleh</div>
          <div style={{ marginTop: '48px' }}>______</div>
          <div>Tgl.</div>
        </div>
      </div>

      {/* Indikator halaman digambar otomatis oleh jsPDF di kanan bawah
          (lihat generatePDF di src/lib/pdf-utils.ts) — berlaku semua dokumen. */}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. INVOICE PEMBELIAN (Update #5 — rename judul print; InfoCell
//    "No. Faktur" TETAP = nomor faktur fisik supplier)
// ═════════════════════════════════════════════════════════════════════════════

export function InvoicePembelianPDFTemplate({ data }: { data: InvoicePembelianData }) {
  // Update ASAHI #5: posisi terbilang dikembalikan ke blok footer kiri
  // (seperti sebelum update #4) — tetap menyebut TOTAL.
  const subTotal = data.detail.reduce((s, r) => s + r.qty * r.harga, 0);
  const diskonAmt = data.diskonGlobal ? (subTotal * data.diskonGlobal) / 100 : 0;
  const afterDiskon = subTotal - diskonAmt;
  const ppnAmt = data.ppn ? (afterDiskon * data.ppn) / 100 : 0;
  const biayaLain = data.biayaTambahan.reduce((s, b) => s + b.jumlah, 0);
  const grandTotal = afterDiskon + ppnAmt + biayaLain;

  return (
    <div id="pdf-content" className="bg-white text-black p-8 min-w-[210mm]" style={rootStyle}>
      {/* ── Header ── */}
      <div className="flex justify-between items-start mb-4">
        <CompanyBrand />
        <div style={{ fontSize: DOC_TITLE_FONT_SIZE, fontWeight: 'bold' }}>Invoice Pembelian</div>
      </div>

      {/* ── Info Section ── */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div style={{ marginBottom: '2px' }}>
            <strong>Dari</strong>
          </div>
          <div style={{ marginBottom: '2px' }}>{data.dari}</div>
          <div>{data.alamat}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <InfoCell label="No. Form" value={data.nomor} />
          <InfoCell label="No. Faktur" value={data.noFaktur} />
          <InfoCell label="Tanggal" value={formatDate(data.tanggal)} />
        </div>
      </div>

      {/* ── Detail Table ── */}
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
          <SummaryTable detail={data.detail} diskonGlobal={data.diskonGlobal} ppn={data.ppn} biayaTambahan={data.biayaTambahan} />
        </div>
      </div>

      {/* ── Signatures ── */}
      <div className="grid grid-cols-2 gap-8 mt-10" style={{ textAlign: 'center' }}>
        <div>
          <div>Bagian Pembelian</div>
          <div style={{ marginTop: '48px' }}>______</div>
          <div>Tgl.</div>
        </div>
        <div>
          <div>Disetujui Oleh</div>
          <div style={{ marginTop: '48px' }}>______</div>
          <div>Tgl.</div>
        </div>
      </div>

      {/* Indikator halaman digambar otomatis oleh jsPDF di kanan bawah
          (lihat generatePDF di src/lib/pdf-utils.ts) — berlaku semua dokumen. */}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. RETUR PEMBELIAN
// ═════════════════════════════════════════════════════════════════════════════

export function ReturPembelianPDFTemplate({ data }: { data: ReturPembelianData }) {
  // Update ASAHI #5: posisi terbilang dikembalikan ke blok footer kiri
  // (seperti sebelum update #4) — tetap menyebut TOTAL.
  const subTotal = data.detail.reduce((s, r) => s + r.qty * r.harga, 0);
  const ppnAmt = data.ppn ? (subTotal * data.ppn) / 100 : 0;
  const grandTotal = subTotal + ppnAmt;

  return (
    <div id="pdf-content" className="bg-white text-black p-8 min-w-[210mm]" style={rootStyle}>
      {/* ── Header ── */}
      <div className="flex justify-between items-start mb-4">
        <CompanyBrand />
        <div style={{ fontSize: DOC_TITLE_FONT_SIZE, fontWeight: 'bold' }}>Retur Pembelian</div>
      </div>

      {/* ── Info Section ── */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div style={{ marginBottom: '2px' }}>
            <strong>Kepada</strong>
          </div>
          <div style={{ marginBottom: '2px' }}>{data.kepada}</div>
          <div>{data.alamat}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <InfoCell label="No. Retur" value={data.nomor} />
          <InfoCell label="Tanggal" value={formatDate(data.tanggal)} />
          <InfoCell label="No Referensi" value={data.noReferensi} />
        </div>
      </div>

      {/* ── Detail Table ── */}
      <div className="mb-4">
        <ReturDetailTable detail={data.detail} />
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
          <ReturSummaryTable detail={data.detail} ppn={data.ppn} />
        </div>
      </div>

      {/* Indikator halaman digambar otomatis oleh jsPDF di kanan bawah
          (lihat generatePDF di src/lib/pdf-utils.ts) — berlaku semua dokumen. */}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. LPPB — LAPORAN PEMERIKSAAN DAN PENGUJIAN BARANG (Update ASAHI #005)
// Dokumen RECORD QMS (kop menyusuri format cetak yang sudah ada).
// ═════════════════════════════════════════════════════════════════════════════

export interface LppbDetailRow {
  id: string;
  urutan: number;
  /** true = baris jasa pengujian (mis. NDT) — berpasangan di bawah barangnya */
  isJasa: boolean;
  kodeMaterial: string;
  deskripsiSpesifikasi: string;
  satuan: string;
  qtyPo: number;
  qtyPenerimaan: number;
  qtyBaik: number;
  qtyTidakBaik: number;
  qtySudahDiterima: number;
  qtyBelumDiterima: number;
}

export interface LppbData {
  nomor: string;
  tanggal: string;
  revisi: string;
  noFormat: string;
  tanggalTerima: string;
  noPo: string;
  noDo: string;
  noRi: string;
  proyek: string;
  supplier: string;
  keterangan: string;
  mengetahuiJabatan: string;
  mengetahuiNama: string;
  detail: LppbDetailRow[];
}

const lppbThStyle: React.CSSProperties = {
  border: '1px solid #333',
  padding: '4px 6px',
  backgroundColor: '#f1f5f9',
  fontWeight: 'bold',
  fontSize: '9px',
  textAlign: 'center',
  verticalAlign: 'middle'
};

const lppbTdStyle: React.CSSProperties = {
  border: '1px solid #333',
  padding: '4px 6px',
  fontSize: '10px',
  verticalAlign: 'top'
};

export function LppbPDFTemplate({ data }: { data: LppbData }) {
  return (
    <div id="pdf-content" className="bg-white text-black p-8 min-w-[210mm]" style={rootStyle}>
      {/* ── KOP (menyusuri format cetak yang sudah ada: Profil Perusahaan) ── */}
      <div className="flex justify-between items-start mb-2">
        <CompanyBrand />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '10px', fontStyle: 'italic' }}>ASI Quality Management System — RECORD</div>
        </div>
      </div>

      {/* ── Judul dokumen ── */}
      <div style={{ textAlign: 'center', margin: '10px 0 4px' }}>
        <div style={{ fontSize: DOC_TITLE_FONT_SIZE, fontWeight: 'bold', textDecoration: 'underline' }}>LAPORAN PEMERIKSAAN DAN PENGUJIAN BARANG</div>
        <div style={{ fontSize: '12px', fontWeight: 'bold', letterSpacing: '2px' }}>(LPPB)</div>
      </div>

      {/* ── Blok identitas dokumen (kanan) ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '6px' }}>
        <div style={{ minWidth: '300px' }}>
          <InfoCell label="Nomor LPPB" value={data.nomor} />
          <InfoCell label="Tanggal LPPB" value={data.tanggal ? formatDate(data.tanggal) : '-'} />
          <InfoCell label="Revisi" value={data.revisi || '-'} />
        </div>
      </div>

      {/* ── Blok referensi transaksi ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '24px', rowGap: '1px', marginBottom: '10px' }}>
        <InfoCell label="Tgl Terima" value={data.tanggalTerima ? formatDate(data.tanggalTerima) : '-'} />
        <InfoCell label="Nomor PO" value={data.noPo || '-'} />
        <InfoCell label="Nomor DO" value={data.noDo || '-'} />
        <InfoCell label="Nomor RI" value={data.noRi || '-'} />
        <InfoCell label="Proyek" value={data.proyek || '-'} />
        <InfoCell label="Supplier" value={data.supplier || '-'} />
      </div>

      {/* ── Tabel pemeriksaan & pengujian (header 2 baris, HASIL PENGUJIAN 2 sub-kolom) ── */}
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={{ ...lppbThStyle, width: '24px' }} rowSpan={2}>
              NO
            </th>
            <th style={lppbThStyle} rowSpan={2}>
              KODE MATERIAL
            </th>
            <th style={lppbThStyle} rowSpan={2}>
              DESKRIPSI SPESIFIKASI
            </th>
            <th style={lppbThStyle} rowSpan={2}>
              SATUAN
            </th>
            <th style={lppbThStyle} rowSpan={2}>
              KUANTITAS PO
            </th>
            <th style={lppbThStyle} rowSpan={2}>
              KUANTITAS PENERIMAAN
            </th>
            <th style={{ ...lppbThStyle, backgroundColor: '#e2e8f0' }} colSpan={2}>
              HASIL PENGUJIAN
            </th>
            <th style={lppbThStyle} rowSpan={2}>
              SUDAH DITERIMA
            </th>
            <th style={lppbThStyle} rowSpan={2}>
              BELUM DITERIMA
            </th>
          </tr>
          <tr>
            <th style={{ ...lppbThStyle, backgroundColor: '#e2e8f0' }}>BAIK</th>
            <th style={{ ...lppbThStyle, backgroundColor: '#e2e8f0' }}>TIDAK BAIK</th>
          </tr>
        </thead>
        <tbody>
          {data.detail.map((r) => (
            <tr key={r.id} style={r.isJasa ? { backgroundColor: '#fefce8' } : undefined}>
              <td style={{ ...lppbTdStyle, textAlign: 'center', color: '#666' }}>{r.isJasa ? '↳' : r.urutan}</td>
              <td style={{ ...lppbTdStyle, fontFamily: 'monospace' }}>{r.kodeMaterial || '—'}</td>
              <td style={lppbTdStyle}>{r.deskripsiSpesifikasi}</td>
              <td style={{ ...lppbTdStyle, textAlign: 'center' }}>{r.satuan || '—'}</td>
              <td style={{ ...lppbTdStyle, textAlign: 'right' }}>{formatNumber(r.qtyPo)}</td>
              <td style={{ ...lppbTdStyle, textAlign: 'right' }}>{formatNumber(r.qtyPenerimaan)}</td>
              <td style={{ ...lppbTdStyle, textAlign: 'right' }}>{formatNumber(r.qtyBaik)}</td>
              <td style={{ ...lppbTdStyle, textAlign: 'right' }}>{r.qtyTidakBaik > 0 ? formatNumber(r.qtyTidakBaik) : '0'}</td>
              <td style={{ ...lppbTdStyle, textAlign: 'right' }}>{formatNumber(r.qtySudahDiterima)}</td>
              <td style={{ ...lppbTdStyle, textAlign: 'right' }}>{formatNumber(r.qtyBelumDiterima)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Keterangan (satu baris di bawah tabel) ── */}
      {data.keterangan && (
        <div style={{ marginTop: '8px', fontSize: '10px' }}>
          <strong>Keterangan:</strong> {data.keterangan}
        </div>
      )}

      {/* ── Pengesahan: Mengetahui ── */}
      <div style={{ marginTop: '36px', textAlign: 'center' }}>
        <div>Mengetahui,</div>
        {data.mengetahuiJabatan ? <div style={{ fontWeight: 'bold' }}>{data.mengetahuiJabatan}</div> : <div style={{ height: '14px' }} />}
        {/* ruang tanda tangan — tanpa garis kotak (konsisten #004) */}
        <div style={{ height: '70px' }} />
        <div style={{ fontWeight: 'bold', textDecoration: 'underline' }}>{data.mengetahuiNama || '____________________'}</div>
        <div style={{ fontSize: '9px', color: '#555' }}>Nama Terang</div>
      </div>

      {/* ── Footer: kontrol dokumen QMS + identitas perusahaan ── */}
      <div style={{ marginTop: '28px', borderTop: '1px solid #333', paddingTop: '4px', fontSize: '9px', textAlign: 'center', color: '#333' }}>
        <div>
          No. Format: {data.noFormat || '—'}, Rev. {data.revisi || '—'}, halaman 1
        </div>
        <LppbFooterCompany />
      </div>

      {/* Indikator halaman digambar otomatis oleh jsPDF di kanan bawah
          (lihat generatePDF di src/lib/pdf-utils.ts) — berlaku semua dokumen. */}
    </div>
  );
}

/** Footer perusahaan LPPB — nama + alamat + telepon/email dari Profil Perusahaan. */
function LppbFooterCompany() {
  const { name, address, telepon, email } = useCompanyInfo();
  return (
    <div>
      <div style={{ fontWeight: 'bold' }}>{name}</div>
      {address ? <div style={{ whiteSpace: 'pre-line' }}>Kantor: {address}</div> : null}
      {telepon || email ? (
        <div>
          {telepon ? `Telepon: ${telepon}` : ''}
          {telepon && email ? ' · ' : ''}
          {email ? `Email: ${email}` : ''}
        </div>
      ) : null}
    </div>
  );
}
