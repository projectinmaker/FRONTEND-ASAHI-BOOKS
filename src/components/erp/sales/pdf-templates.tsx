'use client';

import { formatNumber, formatDate, terbilang } from '@/lib/pdf-utils';
// Update ASAHI: header cetak pakai identitas perusahaan dinamis (Pengaturan → Profil Perusahaan)
import { CompanyBrand } from '@/components/erp/company-brand';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DetailRow {
  id: string;
  barang: string;
  harga: number;
  qty: number;
  diskon: number;
  satuan?: string | null; // nama satuan per baris — kolom "Satuan" di semua cetakan (Update #5)
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
  ekspedisi: string;
  tanggalPengiriman: string;
  penjual: string;
  // === Update #4 — No PO customer dari SO (label "No PO" di print pesanan) ===
  noPo: string;
  detail: DetailRow[];
  biayaTambahan: BiayaTambahan[];
  keterangan: string;
  diskonGlobal: number;
  ppn: number;
}

export interface PengirimanData {
  nomor: string;
  tanggal: string;
  kepada: string;
  alamatPenerima: string;
  ekspedisi: string;
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
  syaratPembayaran: string;
  ekspedisi: string;
  tanggalPengiriman: string;
  // === Update #4 — ganti poNo tunggal → No SO / No PO customer / No Surat Jalan ===
  noSo: string;
  noPo: string;
  noSuratJalan: string;
  mataUang: string;
  detail: DetailRow[];
  biayaTambahan: BiayaTambahan[];
  keterangan: string;
  diskonGlobal: number;
  ppn: number;
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
  tanggal: string;
  berlakuHingga: string;
  kepada: string;
  alamatPenerima: string;
  syaratPembayaran: string;
  keterangan: string;
  detail: DetailRow[];
  biayaTambahan: BiayaTambahan[];
  diskonGlobal: number;
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

// ─── Helper: SummaryTable (private, used by Invoice / Retur) ───────────────

function SummaryTable({ detail, diskonGlobal, ppn, biayaTambahan }: { detail: DetailRow[]; diskonGlobal: number; ppn: number; biayaTambahan: BiayaTambahan[] }) {
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

// ─── Helper: Detail Table with price columns (Invoice / Retur / Penawaran) ───
// Update #5: + kolom No urut (40px), label qty → "Qty", + kolom Satuan terpisah.

function DetailTableWithPrice({ detail }: { detail: DetailRow[] }) {
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
  const totalQty = data.detail.reduce((s, r) => s + r.qty, 0);
  const jumlahBarang = data.detail.length;

  return (
    <div id="pdf-content" className="bg-white text-black p-8 min-w-[210mm]" style={rootStyle}>
      {/* ── Header ── */}
      <div className="flex justify-between items-start mb-4">
        <CompanyBrand />
        {/* Update ASAHI: judul cetak "Pesanan Penjualan" → "Sales Order" */}
        <div style={{ fontSize: '20px', fontWeight: 'bold' }}>Sales Order</div>
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
          <InfoCell label="Ekspedisi" value={data.ekspedisi} />
          <InfoCell label="Tanggal Pengiriman" value={formatDate(data.tanggalPengiriman)} />
          <InfoCell label="Penjual" value={data.penjual} />
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
      <div className="grid grid-cols-2 gap-6 mt-4">
        {/* Left */}
        <div>
          {data.keterangan && (
            <div style={{ marginBottom: '12px' }}>
              <strong>Keterangan:</strong>
              <div style={{ whiteSpace: 'pre-wrap' }}>{data.keterangan}</div>
            </div>
          )}
          <div style={{ marginTop: '24px' }}>Disetujui, Tgl. ________</div>
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

      {/* Bottom right page indicator */}
      <div style={{ textAlign: 'right', marginTop: '12px', fontSize: '10px', color: '#555' }}>Halaman 1 dari 1</div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. SURAT JALAN (PENGIRIMAN)
// ═════════════════════════════════════════════════════════════════════════════

export function PengirimanPDFTemplate({ data }: { data: PengirimanData }) {
  const totalQty = data.detail.reduce((s, r) => s + r.qty, 0);
  const jumlahBarang = data.detail.length;

  return (
    <div id="pdf-content" className="bg-white text-black p-8 min-w-[210mm]" style={rootStyle}>
      {/* ── Header ── */}
      <div className="flex justify-between items-start mb-4">
        <CompanyBrand />
        <div style={{ fontSize: '20px', fontWeight: 'bold' }}>Surat Jalan</div>
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
          <InfoCell label="Nomor" value={data.nomor} />
          <InfoCell label="Ekspedisi" value={data.ekspedisi} />
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

      {/* ── Signatures ── */}
      <div className="grid grid-cols-3 gap-4 mt-10" style={{ textAlign: 'center' }}>
        <div>
          <div>Finance</div>
          <div style={{ marginTop: '48px' }}>______</div>
          <div>Tgl.</div>
        </div>
        <div>
          <div>Gudang</div>
          <div style={{ marginTop: '48px' }}>______</div>
          <div>Tgl.</div>
        </div>
        <div>
          <div>Penerima</div>
          <div style={{ marginTop: '48px' }}>______</div>
          <div>Tgl.</div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. INVOICE PENJUALAN (Update #5 — rename judul print)
// ═════════════════════════════════════════════════════════════════════════════

export function InvoicePDFTemplate({ data }: { data: InvoiceData }) {
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
        <div style={{ fontSize: '20px', fontWeight: 'bold' }}>Invoice Penjualan</div>
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
          <InfoCell label="Nomor" value={data.nomor} />
          <InfoCell label="Syarat Pembayaran" value={data.syaratPembayaran} />
          <InfoCell label="Ekspedisi" value={data.ekspedisi} />
          <InfoCell label="Tanggal Pengiriman" value={formatDate(data.tanggalPengiriman)} />
          <InfoCell label="No SO" value={data.noSo} />
          <InfoCell label="No PO" value={data.noPo} />
          <InfoCell label="No Surat Jalan" value={data.noSuratJalan} />
          <InfoCell label="Mata Uang" value={data.mataUang} />
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

// ═════════════════════════════════════════════════════════════════════════════
// 4. RETUR PENJUALAN
// ═════════════════════════════════════════════════════════════════════════════

export function ReturPDFTemplate({ data }: { data: ReturData }) {
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
        <div style={{ fontSize: '20px', fontWeight: 'bold' }}>Retur Penjualan</div>
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
        <div style={{ fontSize: '20px', fontWeight: 'bold' }}>Penawaran</div>
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
          <InfoCell label="No. Penawaran" value={data.nomor} />
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
