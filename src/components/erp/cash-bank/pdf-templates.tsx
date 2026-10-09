'use client';

import { formatNumber, formatDate, terbilang, DOC_TITLE_FONT_SIZE } from '@/lib/pdf-utils';
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

// === Update cetak "Bayar Pemasok" — baris tabel faktur pelunasan ===
export interface PembayaranFakturItem {
  /** No faktur supplier (purchase_invoice.no_faktur) */
  noFaktur: string;
  /** Tanggal faktur */
  tanggal: string;
  /** Jatuh tempo faktur */
  jatuhTempo: string;
  /** Jumlah — nilai asli faktur (grand total) */
  jumlah: number;
  /** Terutang — sisa hutang SEBELUM pembayaran ini */
  terutang: number;
  /** Jumlah (dibayar) — kas keluar untuk faktur ini = nilai − diskon */
  dibayar: number;
  /** Diskon pelunasan dari supplier */
  diskon: number;
}

export interface PembayaranKasData {
  noBukti: string;
  /** Nomor bukti fisik yang diinput user (wire: noNukti) */
  noBuktiFisik: string;
  tanggal: string;
  kasBankNama: string;
  penerima: string;
  noCek: string;
  // === Update cetak "Bayar Pemasok" — info cek & mata uang ===
  tanggalCek: string;
  jumlahCek: number | null;
  mataUang: string;
  nilaiTukar: number | string;
  // === Update cetak "Bayar Pemasok" — blok Pemasok ===
  supplierNama: string;
  supplierAlamat: string;
  catatan: string;
  rincian: PembayaranRincianItem[];
  totalNilai: number;
  /** Penalti pelunasan (Update #5) — ikut ke Total Settlement */
  penalti?: number;
  /** Tabel faktur pelunasan — terisi bila dokumen adalah AP settlement */
  faktur?: PembayaranFakturItem[];
  // Phase 1.B (legacy): dipertahankan agar pemanggil lama tetap kompatibel;
  // layout baru memakai `faktur` yang sudah diperkaya detail invoice.
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

// ═══ Baris daftar untuk laporan "Rincian Pembayaran" ═══
// Update cetak "Pembayaran Lain": laporan daftar pembayaran per periode
// (konten mengacu contoh klien: no bukti, keterangan, penerima, jumlah —
// kolom mengikuti data yang tersedia di sistem, layout standar ERP).
export interface RincianPembayaranItem {
  noBukti: string;
  noBuktiFisik: string;
  tanggal: string;
  kasBankNama: string;
  /** Dibayarkan kepada (penerima) atau nama pemasok bila settlement */
  penerima: string;
  /** Keterangan — isi kolom catatan dokumen */
  keterangan: string;
  nilai: number;
  /** true bila dokumen adalah pelunasan faktur pemasok (Bayar Pemasok) */
  isSettlement: boolean;
}

export interface RincianPembayaranData {
  /** Filter periode aktif ('' = semua tanggal) */
  periodeDari: string;
  periodeSampai: string;
  /** Nama kas/bank terpilih ('' = semua) */
  filterKasBank: string;
  /** Status terpilih ('' = semua) */
  filterStatus: string;
  /** Jenis pembayaran yang ditampilkan */
  jenis: 'lain' | 'pemasok' | 'semua';
  items: RincianPembayaranItem[];
  total: number;
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
// (Update cetak "Bayar Pemasok": badge TIDAK dipakai lagi di print Pembayaran —
// hanya tetap dipakai print Penerimaan.)
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
        <div style={{ fontSize: DOC_TITLE_FONT_SIZE, fontWeight: 'bold' }}>Bukti Transfer Bank</div>
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

      {/* Indikator halaman digambar otomatis oleh jsPDF di kanan bawah
          (lihat generatePDF di src/lib/pdf-utils.ts) — berlaku semua dokumen. */}
    </div>
  );
}

// ─── Helper: Signature Row ──────────────────────────────────────────────────
// Update cetak "Bayar Pemasok": mendukung 3 ATAU 4 kolom tanda tangan.

function SignatureRow({ labels }: { labels: string[] }) {
  const cols = labels.length >= 4 ? 'grid-cols-4' : 'grid-cols-3';
  return (
    <div className={`grid ${cols} gap-6 mt-12`}>
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

// ─── Helper: format nilai tukar (mis. 1 → "1"; 15650.25 → "15.650,25") ──────

function formatKurs(v: number | string | null | undefined): string {
  if (v == null || v === '') return '-';
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  if (isNaN(n)) return String(v);
  if (Number.isInteger(n)) return n.toLocaleString('id-ID');
  return n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. BAYAR PEMASOK / PEMBAYARAN LAIN (Pembayaran) — layout cetak revisi
// ═════════════════════════════════════════════════════════════════════════════
// Update cetak "Pembayaran Lain": dokumen pembayaran TANPA alokasi faktur &
// tanpa pemasok dicetak sebagai voucher "Pembayaran Lain" (dibayarkan kepada,
// rincian akun, terbilang, catatan, 4 tanda tangan). Dokumen settlement
// (punya faktur/pemasok) tetap dicetak sebagai "Bayar Pemasok" seperti sebelumnya.

export function PembayaranKasPDFTemplate({ data, elementId = 'pdf-content' }: { data: PembayaranKasData; elementId?: string }) {
  const total = Number(data.totalNilai) || 0;
  const mataUang = (data.mataUang || 'IDR').toUpperCase();
  const isIDR = mataUang === 'IDR';
  const fmtNilai = (n: number) => (isIDR ? `Rp ${formatNumber(n)}` : formatNumber(n));
  const faktur = data.faktur || [];
  const totalHutang = faktur.reduce((s, f) => s + (Number(f.terutang) || 0), 0);
  const totalDiskon = faktur.reduce((s, f) => s + (Number(f.diskon) || 0), 0);
  const isBayarPemasok = faktur.length > 0 || !!data.supplierNama;

  return (
    <div id={elementId} className="bg-white text-black p-8 min-w-[210mm]" style={rootStyle}>
      {/* ── Header ── */}
      <div className="flex justify-between items-start mb-4">
        <CompanyBrand />
        <div style={{ fontSize: DOC_TITLE_FONT_SIZE, fontWeight: 'bold' }}>{isBayarPemasok ? 'Bayar Pemasok' : 'Pembayaran Lain'}</div>
      </div>

      {/* ── Blok kiri (Pemasok / Dibayarkan Kepada) + info dokumen (kanan) ── */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {isBayarPemasok ? (
          /* Kiri: Pemasok */
          <div>
            <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '2px' }}>Pemasok</div>
            <div style={{ fontSize: '12px', fontWeight: 'bold' }}>{data.supplierNama || data.penerima || '-'}</div>
            {data.supplierAlamat && <div style={{ fontSize: '11px', whiteSpace: 'pre-wrap', color: '#222' }}>{data.supplierAlamat}</div>}
          </div>
        ) : (
          /* Kiri: Dibayarkan Kepada + sumber dana */
          <div>
            <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '2px' }}>Dibayarkan Kepada</div>
            <div style={{ fontSize: '12px', fontWeight: 'bold' }}>{data.penerima || '-'}</div>
            <div className="mt-2" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <InfoCell label="Kas/Bank" value={data.kasBankNama} />
            </div>
          </div>
        )}
        {/* Kanan: info dokumen/pembayaran */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {isBayarPemasok ? (
            <>
              <InfoCell label="Tanggal Pembayaran" value={formatDate(data.tanggal)} />
              <InfoCell label="No Form" value={data.noBukti} />
              <InfoCell label="Tgl Cek" value={data.tanggalCek ? formatDate(data.tanggalCek) : '-'} />
              <InfoCell label="Jumlah Cek" value={data.jumlahCek != null && Number(data.jumlahCek) > 0 ? fmtNilai(Number(data.jumlahCek)) : '-'} />
              <InfoCell label="No Cek" value={data.noCek || '-'} />
            </>
          ) : (
            <>
              <InfoCell label="Tanggal" value={formatDate(data.tanggal)} />
              <InfoCell label="No. Dokumen" value={data.noBukti} />
              <InfoCell label="No. Bukti Fisik" value={data.noBuktiFisik || '-'} />
              <InfoCell label="Tgl Cek" value={data.tanggalCek ? formatDate(data.tanggalCek) : '-'} />
              <InfoCell label="Jumlah Cek" value={data.jumlahCek != null && Number(data.jumlahCek) > 0 ? fmtNilai(Number(data.jumlahCek)) : '-'} />
              <InfoCell label="No Cek" value={data.noCek || '-'} />
            </>
          )}
        </div>
      </div>

      {/* ── Tabel utama: rincian akun + bank + nilai tukar + mata uang ── */}
      <table style={tableStyle} className="mb-2">
        <thead>
          <tr style={{ background: '#f3f4f6' }}>
            <th style={{ ...cellStyle, width: '36px', textAlign: 'center' }}>No</th>
            <th style={{ ...cellStyle, width: '150px', textAlign: 'left' }}>Bank</th>
            <th style={{ ...cellStyle, width: '100px', textAlign: 'left' }}>Kode Akun</th>
            <th style={{ ...cellStyle, textAlign: 'left' }}>Nama Akun</th>
            <th style={{ ...cellStyle, width: '80px', textAlign: 'right' }}>Nilai Tukar</th>
            <th style={{ ...cellStyle, width: '80px', textAlign: 'center' }}>Mata Uang</th>
            <th style={{ ...cellStyle, width: '140px', textAlign: 'right' }}>Nilai</th>
          </tr>
        </thead>
        <tbody>
          {data.rincian.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ ...cellStyle, textAlign: 'center', fontStyle: 'italic', color: '#777' }}>
                Tidak ada rincian
              </td>
            </tr>
          ) : (
            data.rincian.map((r, i) => (
              <tr key={i}>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{i + 1}</td>
                <td style={cellStyle}>{data.kasBankNama}</td>
                <td style={cellStyle}>{r.akunKode}</td>
                <td style={cellStyle}>{r.akunNama}</td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>{formatKurs(data.nilaiTukar)}</td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{mataUang}</td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>{fmtNilai(Number(r.nilai) || 0)}</td>
              </tr>
            ))
          )}
          {/* Total row */}
          <tr style={{ background: '#fafafa' }}>
            <td colSpan={6} style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold' }}>
              Total
            </td>
            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold' }}>{fmtNilai(total)}</td>
          </tr>
        </tbody>
      </table>

      {/* ── Tabel faktur pelunasan (hanya bila AP settlement) ── */}
      {faktur.length > 0 && (
        <table style={tableStyle} className="mb-2">
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              <th style={{ ...cellStyle, width: '36px', textAlign: 'center' }}>No</th>
              <th style={{ ...cellStyle, textAlign: 'left' }}>No Faktur</th>
              <th style={{ ...cellStyle, width: '90px', textAlign: 'center' }}>Tanggal</th>
              <th style={{ ...cellStyle, width: '90px', textAlign: 'center' }}>Jatuh Tempo</th>
              <th style={{ ...cellStyle, width: '110px', textAlign: 'right' }}>Jumlah</th>
              <th style={{ ...cellStyle, width: '110px', textAlign: 'right' }}>Terutang</th>
              <th style={{ ...cellStyle, width: '110px', textAlign: 'right' }}>Jumlah</th>
              <th style={{ ...cellStyle, width: '100px', textAlign: 'right' }}>Diskon</th>
            </tr>
          </thead>
          <tbody>
            {faktur.map((f, i) => (
              <tr key={i}>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{i + 1}</td>
                <td style={cellStyle}>{f.noFaktur || '-'}</td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{f.tanggal ? formatDate(f.tanggal) : '-'}</td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{f.jatuhTempo ? formatDate(f.jatuhTempo) : '-'}</td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>{fmtNilai(Number(f.jumlah) || 0)}</td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>{fmtNilai(Number(f.terutang) || 0)}</td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>{fmtNilai(Number(f.dibayar) || 0)}</td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>{fmtNilai(Number(f.diskon) || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Terbilang + catatan (kiri) dan tabel total kecil (kanan, hanya Bayar Pemasok) ── */}
      <div className="grid grid-cols-2 gap-4 items-start">
        <div>
          <div style={{ fontStyle: 'italic' }}>
            <strong>Terbilang:</strong> {terbilang(total)}
          </div>
          <div className="mt-2" style={{ fontSize: '11px' }}>
            <strong>Catatan:</strong>
            <div style={{ whiteSpace: 'pre-wrap' }}>{data.catatan || '-'}</div>
          </div>
        </div>
        {isBayarPemasok && faktur.length > 0 && (
          <table style={{ ...tableStyle, width: '320px', marginLeft: 'auto' }}>
            <tbody>
              <tr>
                <td style={{ ...cellStyle, width: '150px' }}>Total Hutang</td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>{fmtNilai(totalHutang)}</td>
              </tr>
              <tr>
                <td style={cellStyle}>Total Diskon</td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>{fmtNilai(totalDiskon)}</td>
              </tr>
              <tr>
                <td style={cellStyle}>Total</td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>{fmtNilai(totalHutang - totalDiskon)}</td>
              </tr>
              <tr style={{ background: '#fafafa' }}>
                <td style={{ ...cellStyle, fontWeight: 'bold' }}>Total Settlement</td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold' }}>{fmtNilai(total)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* ── Signatures: 4 kolom ── */}
      <SignatureRow labels={isBayarPemasok ? ['Disiapkan', 'Dianalisa', 'Dibayar oleh', 'Diterima oleh'] : ['Disiapkan oleh', 'Disetujui oleh', 'Dibayar oleh', 'Diterima oleh']} />

      {/* Indikator halaman digambar otomatis oleh jsPDF di kanan bawah
          (lihat generatePDF di src/lib/pdf-utils.ts) — berlaku semua dokumen. */}
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
        <div style={{ fontSize: DOC_TITLE_FONT_SIZE, fontWeight: 'bold' }}>
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

      {/* Indikator halaman digambar otomatis oleh jsPDF di kanan bawah
          (lihat generatePDF di src/lib/pdf-utils.ts) — berlaku semua dokumen. */}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. RINCIAN PEMBAYARAN (laporan daftar per periode)
// ═════════════════════════════════════════════════════════════════════════════
// Update cetak "Pembayaran Lain": laporan daftar pembayaran sesuai filter aktif.
// Konten mengacu contoh klien (no bukti, keterangan, penerima, jumlah, total) —
// tata letak mengikuti standar cetak ERP (header CompanyBrand + info periode).

export function RincianPembayaranPDFTemplate({ data, elementId = 'pdf-content' }: { data: RincianPembayaranData; elementId?: string }) {
  const total = data.items.reduce((s, r) => s + (Number(r.nilai) || 0), 0);
  const judul = data.jenis === 'lain' ? 'Rincian Pembayaran Lain' : data.jenis === 'pemasok' ? 'Rincian Bayar Pemasok' : 'Rincian Pembayaran';
  const periode = data.periodeDari || data.periodeSampai ? `Dari ${data.periodeDari ? formatDate(data.periodeDari) : 'awal'} s/d ${data.periodeSampai ? formatDate(data.periodeSampai) : 'sekarang'}` : 'Semua Tanggal';

  return (
    <div id={elementId} className="bg-white text-black p-8 min-w-[210mm]" style={rootStyle}>
      {/* ── Header ── */}
      <div className="flex justify-between items-start mb-4">
        <CompanyBrand />
        <div style={{ fontSize: DOC_TITLE_FONT_SIZE, fontWeight: 'bold' }}>{judul}</div>
      </div>

      {/* ── Info periode & filter ── */}
      <div className="mb-4" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <InfoCell label="Periode" value={periode} />
        <InfoCell label="Kas/Bank" value={data.filterKasBank || 'Semua Kas/Bank'} />
        <InfoCell label="Status" value={data.filterStatus || 'Semua'} />
      </div>

      {/* ── Tabel daftar pembayaran ── */}
      <table style={tableStyle}>
        <thead>
          <tr style={{ background: '#f3f4f6' }}>
            <th style={{ ...cellStyle, width: '32px', textAlign: 'center' }}>No</th>
            <th style={{ ...cellStyle, width: '80px', textAlign: 'center' }}>Tanggal</th>
            <th style={{ ...cellStyle, width: '110px', textAlign: 'left' }}>No. Dokumen</th>
            <th style={{ ...cellStyle, width: '100px', textAlign: 'left' }}>No. Bukti Fisik</th>
            <th style={{ ...cellStyle, width: '120px', textAlign: 'left' }}>Kas/Bank</th>
            <th style={{ ...cellStyle, width: '140px', textAlign: 'left' }}>Dibayarkan Kepada</th>
            <th style={{ ...cellStyle, textAlign: 'left' }}>Keterangan</th>
            <th style={{ ...cellStyle, width: '110px', textAlign: 'right' }}>Jumlah</th>
          </tr>
        </thead>
        <tbody>
          {data.items.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ ...cellStyle, textAlign: 'center', fontStyle: 'italic', color: '#777' }}>
                Tidak ada pembayaran pada periode/filter ini
              </td>
            </tr>
          ) : (
            data.items.map((r, i) => (
              <tr key={i}>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{i + 1}</td>
                <td style={{ ...cellStyle, textAlign: 'center', whiteSpace: 'nowrap' }}>{r.tanggal ? formatDate(r.tanggal) : '-'}</td>
                <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>{r.noBukti || '-'}</td>
                <td style={cellStyle}>{r.noBuktiFisik || '-'}</td>
                <td style={cellStyle}>{r.kasBankNama || '-'}</td>
                <td style={cellStyle}>{r.penerima || '-'}</td>
                <td style={cellStyle}>{r.keterangan || '-'}</td>
                <td style={{ ...cellStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>Rp {formatNumber(Number(r.nilai) || 0)}</td>
              </tr>
            ))
          )}
          {/* Total row */}
          <tr style={{ background: '#fafafa' }}>
            <td colSpan={7} style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold' }}>
              Total
            </td>
            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Rp {formatNumber(total)}</td>
          </tr>
        </tbody>
      </table>

      {/* ── Terbilang total ── */}
      <div className="mt-2" style={{ fontStyle: 'italic' }}>
        <strong>Terbilang:</strong> {terbilang(total)}
      </div>

      {/* Indikator halaman digambar otomatis oleh jsPDF di kanan bawah
          (lihat generatePDF di src/lib/pdf-utils.ts) — berlaku semua dokumen. */}
    </div>
  );
}
