'use client';

import { formatNumber, formatDate, terbilang } from '@/lib/pdf-utils';
// Update ASAHI: header cetak pakai identitas perusahaan dinamis (Pengaturan → Profil Perusahaan)
import { CompanyBrand } from '@/components/erp/company-brand';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TransferBankData {
  noTransfer: string;
  tanggal: string;
  dariKasBank: string;
  keKasBank: string;
  nilaiTransfer: number;
  biayaTransfer: number;
  keterangan: string;
}

export interface PembayaranRincianItem {
  akunKode: string;
  akunNama: string;
  nilai: number;
}

export interface PembayaranKasData {
  noBukti: string;
  /** Nomor bukti fisik yang diinput user (wire: noNukti) */
  noBuktiFisik: string;
  tanggal: string;
  kasBankNama: string;
  penerima: string;
  noCek: string;
  catatan: string;
  rincian: PembayaranRincianItem[];
  totalNilai: number;
  // Phase 1.B: kalau alokasi ada isi, dokumen ini adalah AP Settlement
  // (pelunasan hutang ke supplier), akan tampilkan badge khusus di PDF.
  alokasi?: { invoiceId: string; nilai: number | string }[];
}

export interface PenerimaanKasData {
  noBukti: string;
  /** Nomor bukti fisik yang diinput user (wire: noNukti) */
  noBuktiFisik: string;
  tanggal: string;
  kasBankNama: string;
  pemberi: string;
  noCek: string;
  catatan: string;
  rincian: PembayaranRincianItem[];
  totalNilai: number;
  // Phase 1.B: kalau alokasi ada isi, dokumen ini adalah AR Settlement
  // (pelunasan piutang dari pelanggan), akan tampilkan badge khusus di PDF.
  alokasi?: { invoiceId: string; nilai: number | string }[];
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

// ─── Helper: Settlement Badge (Phase 1.B) ─────────────────────────────────────
// Kalau dokumen kas/bank punya alokasi invoice (settlement), tampilkan badge
// di header PDF supaya user tahu dokumen ini adalah pelunasan AR/AP.
function SettlementBadge({ kind }: { kind: 'ar' | 'ap' }) {
  const isAR = kind === 'ar';
  const label = isAR ? 'AR Settlement' : 'AP Settlement';
  const title = isAR ? 'Pelunasan Piutang' : 'Pelunasan Hutang';
  return (
    <span
      title={title}
      style={{
        display: 'inline-block',
        padding: '3px 8px',
        fontSize: '10px',
        fontWeight: 'bold',
        color: '#fff',
        background: isAR ? '#059669' : '#d97706',
        borderRadius: '4px',
        marginLeft: '8px',
        verticalAlign: 'middle'
      }}>
      {label}
    </span>
  );
}

// ─── Helper: Info Cell (label-value pair) ────────────────────────────────────

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1" style={{ fontSize: '11px' }}>
      <span style={{ minWidth: '140px', whiteSpace: 'nowrap' }}>
        <strong>{label}</strong>
      </span>
      <span style={{ minWidth: '12px' }}>:</span>
      <span>{value || '-'}</span>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. BUKTI TRANSFER BANK
// ═════════════════════════════════════════════════════════════════════════════

export function TransferBankPDFTemplate({ data, elementId = 'pdf-content' }: { data: TransferBankData; elementId?: string }) {
  return (
    <div id={elementId} className="bg-white text-black p-8 min-w-[210mm]" style={rootStyle}>
      {/* ── Header ── */}
      <div className="flex justify-between items-start mb-4">
        <CompanyBrand />
        <div style={{ fontSize: '20px', fontWeight: 'bold' }}>Bukti Transfer Bank</div>
      </div>

      {/* ── Info Section ── */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Left: Dari & Ke */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <InfoCell label="Dari Kas/Bank" value={data.dariKasBank} />
          <InfoCell label="Ke Kas/Bank" value={data.keKasBank} />
        </div>
        {/* Right: No & Tanggal */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <InfoCell label="No. Transfer" value={data.noTransfer} />
          <InfoCell label="Tanggal" value={formatDate(data.tanggal)} />
        </div>
      </div>

      {/* ── Nilai Transfer Section ── */}
      <table style={tableStyle} className="mb-4">
        <tbody>
          <tr>
            <td style={{ ...cellStyle, width: '180px', fontWeight: 'bold' }}>Nilai Transfer</td>
            <td style={{ ...cellStyle, textAlign: 'right' }}>Rp {formatNumber(data.nilaiTransfer)}</td>
          </tr>
          <tr>
            <td style={cellStyle}>Terbilang</td>
            <td style={{ ...cellStyle, fontStyle: 'italic' }}>{terbilang(data.nilaiTransfer)}</td>
          </tr>
          <tr>
            <td style={cellStyle}>Biaya Transfer</td>
            <td style={{ ...cellStyle, textAlign: 'right' }}>Rp {formatNumber(data.biayaTransfer)}</td>
          </tr>
        </tbody>
      </table>

      {/* ── Keterangan ── */}
      {data.keterangan && (
        <div className="mb-4">
          <strong>Keterangan:</strong>
          <div style={{ whiteSpace: 'pre-wrap' }}>{data.keterangan}</div>
        </div>
      )}

      {/* Bottom right page indicator */}
      <div style={{ textAlign: 'right', marginTop: '12px', fontSize: '10px', color: '#555' }}>Halaman 1 dari 1</div>
    </div>
  );
}

// ─── Helper: Signature Row ──────────────────────────────────────────────────

function SignatureRow({ labels }: { labels: [string, string, string] }) {
  return (
    <div className="grid grid-cols-3 gap-8 mt-12">
      {labels.map((label) => (
        <div key={label} className="text-center" style={{ fontSize: '11px' }}>
          <div style={{ marginBottom: '4px' }}>{label}</div>
          <div style={{ height: '56px' }} />
          <div style={{ borderTop: '1px solid #333', paddingTop: '4px' }}>(..............................)</div>
        </div>
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. BUKTI PENGELUARAN KAS (Pembayaran)
// ═════════════════════════════════════════════════════════════════════════════

export function PembayaranKasPDFTemplate({ data, elementId = 'pdf-content' }: { data: PembayaranKasData; elementId?: string }) {
  const total = Number(data.totalNilai) || 0;
  const isAPSettlement = !!data.alokasi && data.alokasi.length > 0;
  return (
    <div id={elementId} className="bg-white text-black p-8 min-w-[210mm]" style={rootStyle}>
      {/* ── Header ── */}
      <div className="flex justify-between items-start mb-4">
        <CompanyBrand />
        <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
          Bukti Pengeluaran Kas
          {isAPSettlement && <SettlementBadge kind="ap" />}
        </div>
      </div>

      {/* ── Info Section ── */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <InfoCell label="No. Dokumen" value={data.noBukti} />
          <InfoCell label="No. Bukti" value={data.noBuktiFisik} />
          <InfoCell label="Tanggal" value={formatDate(data.tanggal)} />
          <InfoCell label="Kas/Bank" value={data.kasBankNama} />
        </div>
        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <InfoCell label="Penerima" value={data.penerima} />
          <InfoCell label="No. Cek" value={data.noCek} />
          <InfoCell label="Catatan" value={data.catatan} />
        </div>
      </div>

      {/* ── Rincian Table ── */}
      <table style={tableStyle} className="mb-2">
        <thead>
          <tr style={{ background: '#f3f4f6' }}>
            <th style={{ ...cellStyle, width: '40px', textAlign: 'center' }}>No</th>
            <th style={{ ...cellStyle, width: '120px', textAlign: 'left' }}>Kode Akun</th>
            <th style={{ ...cellStyle, textAlign: 'left' }}>Nama Akun</th>
            <th style={{ ...cellStyle, width: '160px', textAlign: 'right' }}>Nilai</th>
          </tr>
        </thead>
        <tbody>
          {data.rincian.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ ...cellStyle, textAlign: 'center', fontStyle: 'italic', color: '#777' }}>
                Tidak ada rincian
              </td>
            </tr>
          ) : (
            data.rincian.map((r, i) => (
              <tr key={i}>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{i + 1}</td>
                <td style={cellStyle}>{r.akunKode}</td>
                <td style={cellStyle}>{r.akunNama}</td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>Rp {formatNumber(Number(r.nilai) || 0)}</td>
              </tr>
            ))
          )}
          {/* Total row */}
          <tr style={{ background: '#fafafa' }}>
            <td colSpan={3} style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold' }}>
              Total
            </td>
            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold' }}>Rp {formatNumber(total)}</td>
          </tr>
        </tbody>
      </table>

      {/* ── Terbilang ── */}
      <div className="mb-2" style={{ fontStyle: 'italic' }}>
        <strong>Terbilang:</strong> {terbilang(total)}
      </div>

      {/* ── Signatures ── */}
      <SignatureRow labels={['Dibuat oleh', 'Diterima oleh', 'Disetujui']} />

      {/* Bottom right page indicator */}
      <div style={{ textAlign: 'right', marginTop: '12px', fontSize: '10px', color: '#555' }}>Halaman 1 dari 1</div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. BUKTI PENERIMAAN KAS
// ═════════════════════════════════════════════════════════════════════════════

export function PenerimaanKasPDFTemplate({ data, elementId = 'pdf-content' }: { data: PenerimaanKasData; elementId?: string }) {
  const total = Number(data.totalNilai) || 0;
  const isARSettlement = !!data.alokasi && data.alokasi.length > 0;
  return (
    <div id={elementId} className="bg-white text-black p-8 min-w-[210mm]" style={rootStyle}>
      {/* ── Header ── */}
      <div className="flex justify-between items-start mb-4">
        <CompanyBrand />
        <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
          Bukti Penerimaan Kas
          {isARSettlement && <SettlementBadge kind="ar" />}
        </div>
      </div>

      {/* ── Info Section ── */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <InfoCell label="No. Dokumen" value={data.noBukti} />
          <InfoCell label="No. Bukti" value={data.noBuktiFisik} />
          <InfoCell label="Tanggal" value={formatDate(data.tanggal)} />
          <InfoCell label="Kas/Bank" value={data.kasBankNama} />
        </div>
        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <InfoCell label="Pemberi" value={data.pemberi} />
          <InfoCell label="No. Cek" value={data.noCek} />
          <InfoCell label="Catatan" value={data.catatan} />
        </div>
      </div>

      {/* ── Rincian Table ── */}
      <table style={tableStyle} className="mb-2">
        <thead>
          <tr style={{ background: '#f3f4f6' }}>
            <th style={{ ...cellStyle, width: '40px', textAlign: 'center' }}>No</th>
            <th style={{ ...cellStyle, width: '120px', textAlign: 'left' }}>Kode Akun</th>
            <th style={{ ...cellStyle, textAlign: 'left' }}>Nama Akun</th>
            <th style={{ ...cellStyle, width: '160px', textAlign: 'right' }}>Nilai</th>
          </tr>
        </thead>
        <tbody>
          {data.rincian.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ ...cellStyle, textAlign: 'center', fontStyle: 'italic', color: '#777' }}>
                Tidak ada rincian
              </td>
            </tr>
          ) : (
            data.rincian.map((r, i) => (
              <tr key={i}>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{i + 1}</td>
                <td style={cellStyle}>{r.akunKode}</td>
                <td style={cellStyle}>{r.akunNama}</td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>Rp {formatNumber(Number(r.nilai) || 0)}</td>
              </tr>
            ))
          )}
          {/* Total row */}
          <tr style={{ background: '#fafafa' }}>
            <td colSpan={3} style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold' }}>
              Total
            </td>
            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold' }}>Rp {formatNumber(total)}</td>
          </tr>
        </tbody>
      </table>

      {/* ── Terbilang ── */}
      <div className="mb-2" style={{ fontStyle: 'italic' }}>
        <strong>Terbilang:</strong> {terbilang(total)}
      </div>

      {/* ── Signatures ── */}
      <SignatureRow labels={['Dibuat oleh', 'Diterima oleh', 'Disetujui']} />

      {/* Bottom right page indicator */}
      <div style={{ textAlign: 'right', marginTop: '12px', fontSize: '10px', color: '#555' }}>Halaman 1 dari 1</div>
    </div>
  );
}
