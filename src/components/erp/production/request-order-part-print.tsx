'use client';

/**
 * REQUEST ORDER PART — template cetak/PDF + tab Cetak.
 *
 * Mengikuti pola modul lain (sales/cetak-tabs.tsx + pdf-templates.tsx):
 * ref DOM → html2canvas-pro → jsPDF A4 portrait. Identitas perusahaan
 * (logo + nama) dari useCompanyStore via CompanyBrand.
 *
 * Struktur dokumen (update ASAHI #003): kop perusahaan + judul
 * "REQUEST ORDER PART", info Project/Model/Customer/Tanggal + info SO
 * terpilih, tabel item dengan kolom NO s.d. SUPPLIER sejajar satu baris +
 * KETERANGAN sebagai header grup dua sub-kolom (ORDER / STOK), Note, blok
 * tanda tangan 4 kolom (DIBUAT / DIPERIKSA / DIKETAHUI / DISETUJUI), dan
 * legenda distribusi salinan warna PUTIH/KUNING/MERAH. Baris Status di kop
 * dihapus (workflow tanpa persetujuan; dokumen final dicetak setelah dibuat).
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Printer, Download, AlertCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatDate, formatNumber, generatePDF, fileSafeNo, DOC_TITLE_FONT_SIZE } from '@/lib/pdf-utils';
import { CompanyBrand } from '@/components/erp/company-brand';
import { FormTabShell } from '@/components/erp/form-tab-shell';
import type { RequestOrderPart } from '@/types/api';

// ─── Print data (nilai final siap cetak) ─────────────────────────────────────

export interface RequestOrderPartPrintItem {
  id: string;
  idPart: string;
  description: string;
  material: string;
  qty: number;
  /** Update #003: QS = kode (tipe seperti ID PART) — teks. */
  qs: string;
  supplier: string;
  /** Update #003: KETERANGAN dibagi dua sub-kolom ORDER & STOK. */
  keteranganOrder: string;
  keteranganStok: string;
}

export interface RequestOrderPartPrintData {
  nomor: string;
  tanggal: string;
  projectName: string;
  model: string;
  customer: string;
  status: string;
  noSo: string;
  customerPoNumber: string;
  tanggalSo: string;
  statusSo: string;
  catatan: string;
  dibuatOleh: string;
  diperiksaOleh: string;
  diketahuiOleh: string;
  disetujuiOleh: string;
  items: RequestOrderPartPrintItem[];
}

// ─── Shared styles (inline style — html2canvas-safe, bukan Tailwind oklch) ──

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
  padding: '4px 6px'
};

const headerCellStyle: React.CSSProperties = {
  ...cellStyle,
  backgroundColor: '#f3f4f6',
  fontWeight: 'bold',
  textAlign: 'center' as const
};

/** Header grup ORDER — sedikit berbeda dari STOK (kebutuhan user: dua grup
 *  kolom dibedakan stylenya). */
const orderGroupStyle: React.CSSProperties = {
  ...cellStyle,
  backgroundColor: '#e2e8f0',
  fontWeight: 'bold',
  textAlign: 'center' as const,
  letterSpacing: '1px'
};

/** Header grup STOK. */
const stokGroupStyle: React.CSSProperties = {
  ...cellStyle,
  backgroundColor: '#fdeec8',
  fontWeight: 'bold',
  textAlign: 'center' as const,
  letterSpacing: '1px'
};

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1" style={{ fontSize: '11px' }}>
      <span style={{ minWidth: '110px', whiteSpace: 'nowrap' }}>
        <strong>{label}</strong>
      </span>
      <span style={{ minWidth: '12px' }}>:</span>
      <span>{value || '-'}</span>
    </div>
  );
}

/** Legenda distribusi salinan warna — teks persis kebutuhan user:
 *  "PUTIH = PURCHASING   KUNING = PRODUKSI   MERAH = ENGINEERING". */
function ColorLegend({ compact = false }: { compact?: boolean }) {
  const swatch = (bg: string, border: string): React.CSSProperties => ({
    display: 'inline-block',
    width: '12px',
    height: '12px',
    borderRadius: '2px',
    backgroundColor: bg,
    border: `1.5px solid ${border}`,
    marginRight: '5px',
    verticalAlign: '-2px'
  });
  const labelStyle: React.CSSProperties = {
    fontSize: compact ? '10px' : '11px',
    fontWeight: 'bold',
    letterSpacing: '0.5px',
    whiteSpace: 'nowrap'
  };
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', flexWrap: 'wrap' }}>
      <span style={labelStyle}>PUTIH = PURCHASING</span>
      <span style={labelStyle}>KUNING = PRODUKSI</span>
      <span style={labelStyle}>MERAH = ENGINEERING</span>
    </div>
  );
}

/** Blok tanda tangan 4 kolom: label di atas, area garis ttd, nama tercetak
 *  di bawah garis (mode cetak). */
function SignatureBlock({ labels, names }: { labels: string[]; names: string[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', textAlign: 'center' }}>
      {labels.map((label, i) => (
        <div key={label}>
          <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '4px' }}>{label}</div>
          {/* Area tanda tangan — garis di bawah (border-bottom) */}
          <div style={{ height: '62px', borderBottom: '1px solid #333' }} />
          <div style={{ fontSize: '10px', marginTop: '4px', minHeight: '14px' }}>{names[i] || '\u00A0'}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Template utama ──────────────────────────────────────────────────────────

export function RequestOrderPartPDFTemplate({ data }: { data: RequestOrderPartPrintData }) {
  const colCount = 9; // NO + ID PART + DESCRIPTION + MATERIAL + QTY + QS + SUPPLIER + KETERANGAN(2)

  return (
    <div id="pdf-content" className="bg-white text-black p-8 min-w-[210mm]" style={rootStyle}>
      {/* ── Kop perusahaan + judul dokumen ── */}
      <div className="flex justify-between items-start mb-4">
        <CompanyBrand />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: DOC_TITLE_FONT_SIZE, fontWeight: 'bold', lineHeight: 1.1 }}>REQUEST ORDER PART</div>
          <div style={{ marginTop: '4px', fontSize: '11px' }}>
            <strong>No:</strong> {data.nomor || '-'}
          </div>
          {/* Update #003: baris Status dihapus — workflow tanpa persetujuan. */}
        </div>
      </div>

      {/* ── Info header: Project / Model / Customer / Tanggal (kiri) + info SO (kanan) ── */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <InfoCell label="Project Name" value={data.projectName} />
          <InfoCell label="Model" value={data.model} />
          <InfoCell label="Customer" value={data.customer} />
          <InfoCell label="Tanggal" value={formatDate(data.tanggal)} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <InfoCell label="No. SO" value={data.noSo} />
          <InfoCell label="Customer PO Number" value={data.customerPoNumber} />
          <InfoCell label="Tanggal SO" value={formatDate(data.tanggalSo)} />
          <InfoCell label="Status SO" value={data.statusSo} />
        </div>
      </div>

      {/* ── Tabel item (update #003): NO s.d. SUPPLIER sejajar satu baris;
          KETERANGAN = header grup dua sub-kolom ORDER / STOK ── */}
      <div className="mb-4">
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...headerCellStyle, width: '32px' }} rowSpan={2}>
                NO
              </th>
              <th style={headerCellStyle} rowSpan={2}>
                ID PART
              </th>
              <th style={headerCellStyle} rowSpan={2}>
                DESCRIPTION
              </th>
              <th style={headerCellStyle} rowSpan={2}>
                MATERIAL
              </th>
              <th style={{ ...headerCellStyle, width: '46px' }} rowSpan={2}>
                QTY
              </th>
              <th style={headerCellStyle} rowSpan={2}>
                QS
              </th>
              <th style={headerCellStyle} rowSpan={2}>
                SUPPLIER
              </th>
              <th style={orderGroupStyle} colSpan={2}>
                KETERANGAN
              </th>
            </tr>
            <tr>
              <th style={orderGroupStyle}>ORDER</th>
              <th style={stokGroupStyle}>STOK</th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 && (
              <tr>
                <td style={{ ...cellStyle, textAlign: 'center' }} colSpan={colCount}>
                  Tidak ada item
                </td>
              </tr>
            )}
            {data.items.map((row, i) => (
              <tr key={row.id}>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{i + 1}</td>
                <td style={cellStyle}>{row.idPart}</td>
                <td style={cellStyle}>{row.description}</td>
                <td style={cellStyle}>{row.material || '-'}</td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{formatNumber(row.qty)}</td>
                <td style={cellStyle}>{row.qs || '-'}</td>
                <td style={cellStyle}>{row.supplier || '-'}</td>
                <td style={cellStyle}>{row.keteranganOrder || '-'}</td>
                <td style={cellStyle}>{row.keteranganStok || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Note (kiri) + tanda tangan 4 kolom (kanan) ── */}
      <div className="grid grid-cols-12 gap-4 mt-4">
        <div className="col-span-5">
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Note:</div>
          <div style={{ whiteSpace: 'pre-wrap', border: '1px solid #d1d5db', borderRadius: '4px', padding: '8px', minHeight: '100px' }}>{data.catatan || '-'}</div>
        </div>
        <div className="col-span-7">
          <SignatureBlock labels={['DIBUAT', 'DIPERIKSA', 'DIKETAHUI', 'DISETUJUI']} names={[data.dibuatOleh, data.diperiksaOleh, data.diketahuiOleh, data.disetujuiOleh]} />
        </div>
      </div>

      {/* ── Legenda distribusi salinan warna ── */}
      <div style={{ marginTop: '16px', paddingTop: '8px', borderTop: '1px solid #d1d5db' }}>
        <ColorLegend />
      </div>

      {/* ── Footer ── */}
      <div style={{ marginTop: '10px', textAlign: 'center', fontSize: '9px', color: '#6b7280' }}>REQUEST ORDER PART {data.nomor ? `— ${data.nomor}` : ''} · Dokumen ini dicetak melalui ASAHI Books ERP</div>

      {/* Indikator halaman digambar otomatis oleh jsPDF di kanan bawah
          (lihat generatePDF di src/lib/pdf-utils.ts). */}
    </div>
  );
}

// ─── Mapping response → print data ───────────────────────────────────────────

export function mapRopPrintData(d: RequestOrderPart): RequestOrderPartPrintData {
  return {
    nomor: d.noRop || '',
    tanggal: d.tanggal || '',
    projectName: d.projectName || '',
    model: d.model || '',
    customer: d.pelanggan?.nama || '',
    status: d.status || 'DRAFT',
    noSo: d.salesOrder?.noPesanan || '',
    customerPoNumber: d.salesOrder?.customerPoNumber || '',
    tanggalSo: d.salesOrder?.tanggal || '',
    statusSo: d.salesOrder?.status || '',
    catatan: d.catatan || '',
    dibuatOleh: d.dibuatOleh || '',
    diperiksaOleh: d.diperiksaOleh || '',
    diketahuiOleh: d.diketahuiOleh || '',
    disetujuiOleh: d.disetujuiOleh || '',
    items: (d.items || [])
      .slice()
      .sort((a, b) => a.no - b.no)
      .map((it) => ({
        id: it.id,
        idPart: it.idPart || '',
        description: it.description || '',
        material: it.material || '',
        // qty datang sebagai string desimal ("4.00") — normalisasi ke number.
        // QS kini kode teks (update #003).
        qty: Number(it.qty) || 0,
        qs: it.qs || '',
        supplier: it.supplier?.nama || '',
        keteranganOrder: it.keteranganOrder || '',
        keteranganStok: it.keteranganStok || ''
      }))
  };
}

// ─── Tab Cetak (dibuka lewat openFormTab formKey 'rop-cetak') ────────────────

function CetakError({ message }: { message: string }) {
  return (
    <Card className="border-destructive">
      <CardContent className="flex items-start gap-3 p-4">
        <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-destructive">Gagal memuat dokumen</p>
          <p className="text-xs text-muted-foreground mt-1">{message}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function RequestOrderPartCetakTab({ id }: { id: string }) {
  const [data, setData] = useState<RequestOrderPartPrintData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const elementId = `pdf-rop-${id}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<RequestOrderPart>(`/produksi/request-order-part/${id}`);
      setData(mapRopPrintData(res));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : e instanceof Error ? e.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDownload = useCallback(async () => {
    if (!data) return;
    setDownloading(true);
    try {
      // Nomor "ROP ASI/2026/001" mengandung spasi & '/' → sanitasi nama file.
      await generatePDF(elementId, `ROP-${fileSafeNo(data.nomor || id)}.pdf`);
    } finally {
      setDownloading(false);
    }
  }, [data, elementId, id]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <FormTabShell title={`Cetak Request Order Part${data ? ` — ${data.nomor}` : ''}`}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={loading || !!error}>
            <Printer className="mr-1.5 h-4 w-4" /> Cetak
          </Button>
          <Button size="sm" onClick={handleDownload} disabled={loading || !!error || downloading}>
            <Download className="mr-1.5 h-4 w-4" /> {downloading ? 'Memproses…' : 'Download PDF'}
          </Button>
        </div>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-[600px] w-full" />
          </div>
        ) : error ? (
          <CetakError message={error} />
        ) : (
          data && (
            <div className="overflow-x-auto border rounded-md bg-white">
              <div id={elementId} className="inline-block">
                <RequestOrderPartPDFTemplate data={data} />
              </div>
            </div>
          )
        )}
      </div>
    </FormTabShell>
  );
}
