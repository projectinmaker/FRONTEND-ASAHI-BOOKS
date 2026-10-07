'use client';

import { formatNumber, formatDate, terbilang } from '@/lib/pdf-utils';
// Update ASAHI: header cetak pakai identitas perusahaan dinamis (Pengaturan → Profil Perusahaan)
import { CompanyBrand } from '@/components/erp/company-brand';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PembelianDetailRow {
  id: string;
  barang: string;
  harga: number;
  qty: number;
  diskon: number; // percentage
  satuan?: string | null; // nama satuan per baris — kolom "Satuan" di semua cetakan (Update #5)
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
  // === Update ASAHI #3: mata uang pilihan saat input PO + alamat pengiriman + PPIC ===
  /** Kode mata uang (mis. "USD") — dipakai untuk prefix nominal. */
  mataUang: string;
  /** Label tampilan (mis. "USD — US Dollar"); fallback ke kode. */
  mataUangLabel?: string;
  alamatPengiriman: string;
  ppic: boolean;
  detail: PembelianDetailRow[];
  biayaTambahan: BiayaTambahan[];
  keterangan: string;
  diskonGlobal: number;
  ppn: number;
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

function PODetailTableWithPrice({ detail, currency }: { detail: PembelianDetailRow[]; currency?: string | null }) {
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
              <td style={{ ...cellStyle, textAlign: 'right' }}>{money(row.harga, currency)}</td>
              <td style={{ ...cellStyle, textAlign: 'center' }}>{row.diskon || 0}</td>
              <td style={{ ...cellStyle, textAlign: 'right' }}>{money(totalHarga, currency)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Helper: Summary Table PO dengan mata uang (update ASAHI #3) ────────────

function POSummaryTable({ detail, diskonGlobal, ppn, biayaTambahan, currency }: { detail: PembelianDetailRow[]; diskonGlobal: number; ppn: number; biayaTambahan: BiayaTambahan[]; currency?: string | null }) {
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
          <td style={{ ...cellStyle, textAlign: 'right', width: '140px' }}>{money(subTotal, currency)}</td>
        </tr>
        <tr>
          <td style={cellStyle}>Diskon ({diskonGlobal || 0}%)</td>
          <td style={{ ...cellStyle, textAlign: 'right' }}>- {money(diskonAmt, currency)}</td>
        </tr>
        <tr>
          <td style={cellStyle}>PPN ({ppn || 0}%)</td>
          <td style={{ ...cellStyle, textAlign: 'right' }}>{money(ppnAmt, currency)}</td>
        </tr>
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
  const subTotal = data.detail.reduce((s, r) => s + r.qty * r.harga, 0);
  const diskonAmt = data.diskonGlobal ? (subTotal * data.diskonGlobal) / 100 : 0;
  const afterDiskon = subTotal - diskonAmt;
  const ppnAmt = data.ppn ? (afterDiskon * data.ppn) / 100 : 0;
  const biayaLain = data.biayaTambahan.reduce((s, b) => s + b.jumlah, 0);
  const grandTotal = afterDiskon + ppnAmt + biayaLain;
  const isIdr = !data.mataUang || data.mataUang === 'IDR';

  return (
    <div id="pdf-content" className="bg-white text-black p-8 min-w-[210mm]" style={rootStyle}>
      {/* ── Header ── */}
      <div className="flex justify-between items-start mb-4">
        <CompanyBrand />
        {/* Update ASAHI: judul cetak "Pesanan Pembelian" → "Purchase Order" */}
        <div style={{ fontSize: '20px', fontWeight: 'bold' }}>Purchase Order</div>
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
          <InfoCell label="Tanggal" value={formatDate(data.tanggal)} />
          <InfoCell label="Tanggal Kirim" value={formatDate(data.tanggalKirim)} />
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
          {/* PPIC opsional — baris tambahan di bawah alamat pengiriman */}
          {data.ppic ? <div>PPIC</div> : null}
        </div>
      ) : null}

      {/* ── Footer ── */}
      <div className="grid grid-cols-2 gap-6 mt-4">
        {/* Left */}
        <div>
          {/* Terbilang hanya untuk IDR (mata uang dasar) — hindari salah baca
              nominal untuk mata uang asing. */}
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
          <div style={{ marginTop: '24px' }}>Disetujui, Tgl. ________</div>
        </div>

        {/* Right: Summary (mata uang mengikuti pilihan saat input PO) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <POSummaryTable detail={data.detail} diskonGlobal={data.diskonGlobal} ppn={data.ppn} biayaTambahan={data.biayaTambahan} currency={data.mataUang} />
        </div>
      </div>

      {/* ── Signatures ── */}
      <div className="grid grid-cols-2 gap-8 mt-10" style={{ textAlign: 'center' }}>
        <div>
          <div>Disetujui Oleh</div>
          <div style={{ marginTop: '48px' }}>______</div>
          <div>Tgl.</div>
        </div>
        <div>
          <div>Bagian Pembelian</div>
          <div style={{ marginTop: '48px' }}>______</div>
          <div>Tgl.</div>
        </div>
      </div>

      {/* Bottom right page indicator */}
      <div style={{ textAlign: 'right', marginTop: '12px', fontSize: '10px', color: '#555' }}>Halaman 1 dari 1</div>
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
        <div style={{ fontSize: '20px', fontWeight: 'bold' }}>Penerimaan Barang</div>
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

      {/* Bottom right page indicator */}
      <div style={{ textAlign: 'right', marginTop: '12px', fontSize: '10px', color: '#555' }}>Halaman 1 dari 1</div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. INVOICE PEMBELIAN (Update #5 — rename judul print; InfoCell
//    "No. Faktur" TETAP = nomor faktur fisik supplier)
// ═════════════════════════════════════════════════════════════════════════════

export function InvoicePembelianPDFTemplate({ data }: { data: InvoicePembelianData }) {
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
        <div style={{ fontSize: '20px', fontWeight: 'bold' }}>Invoice Pembelian</div>
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

      {/* Bottom right page indicator */}
      <div style={{ textAlign: 'right', marginTop: '12px', fontSize: '10px', color: '#555' }}>Halaman 1 dari 1</div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. RETUR PEMBELIAN
// ═════════════════════════════════════════════════════════════════════════════

export function ReturPembelianPDFTemplate({ data }: { data: ReturPembelianData }) {
  const subTotal = data.detail.reduce((s, r) => s + r.qty * r.harga, 0);
  const ppnAmt = data.ppn ? (subTotal * data.ppn) / 100 : 0;
  const grandTotal = subTotal + ppnAmt;

  return (
    <div id="pdf-content" className="bg-white text-black p-8 min-w-[210mm]" style={rootStyle}>
      {/* ── Header ── */}
      <div className="flex justify-between items-start mb-4">
        <CompanyBrand />
        <div style={{ fontSize: '20px', fontWeight: 'bold' }}>Retur Pembelian</div>
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

      {/* Bottom right page indicator */}
      <div style={{ textAlign: 'right', marginTop: '12px', fontSize: '10px', color: '#555' }}>Halaman 1 dari 1</div>
    </div>
  );
}
