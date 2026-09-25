'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Printer, Download, AlertCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { generatePDF } from '@/lib/pdf-utils';
import { FormTabShell } from '@/components/erp/form-tab-shell';
import {
  PesananPDFTemplate, PengirimanPDFTemplate, InvoicePDFTemplate, ReturPDFTemplate,
  type PesananData, type PengirimanData, type InvoiceData, type ReturData, type DetailRow, type BiayaTambahan,
} from '@/components/erp/sales/pdf-templates';
import type {
  SalesOrderResponse, SalesInvoiceResponse, SalesReturResponse, PengirimanBarangResponse,
} from '@/types/api';

// ─── Shared error card ──────────────────────────────────────────────────────

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

function CetakLoading() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-[600px] w-full" />
    </div>
  );
}

// ─── 1. Pesanan Penjualan Cetak ─────────────────────────────────────────────

function mapPesananData(d: SalesOrderResponse): PesananData {
  return {
    nomor: d.noPesanan || '',
    tanggal: d.tanggal || '',
    kepada: d.pelanggan?.nama || '',
    alamatPenerima: d.alamatPengiriman || '',
    syaratPembayaran: d.syaratBayar?.nama || '',
    fob: d.fob || '',
    ekspedisi: d.ekspedisi || '',
    tanggalPengiriman: d.tanggalPengiriman || '',
    penjual: d.penjual || '',
    detail: (d.details || []).map<DetailRow>((r) => ({
      id: r.id,
      kodeBarang: r.barang?.kode || '',
      barang: r.barang?.nama || '',
      harga: Number(r.harga) || 0,
      qty: Number(r.qty) || 0,
      diskon: Number(r.diskon) || 0,
    })),
    biayaTambahan: (d.biayaTambahan || []).map<BiayaTambahan>((b) => ({
      id: b.id,
      nama: b.nama || '',
      jumlah: Number(b.jumlah) || 0,
    })),
    keterangan: d.keterangan || '',
    diskonGlobal: Number(d.diskonGlobal) || 0,
    ppn: Number(d.ppn) || 0,
  };
}

export function PesananCetakTab({ id }: { id: string }) {
  const [data, setData] = useState<PesananData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const elementId = `pdf-pesanan-${id}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<SalesOrderResponse>(`/penjualan/sales-order/${id}`);
      setData(mapPesananData(res));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : e instanceof Error ? e.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDownload = useCallback(async () => {
    if (!data) return;
    setDownloading(true);
    try {
      await generatePDF(elementId, `Pesanan-${data.nomor || id}.pdf`);
    } finally {
      setDownloading(false);
    }
  }, [data, elementId, id]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <FormTabShell title={`Cetak Pesanan Penjualan${data ? ` — ${data.nomor}` : ''}`}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={loading || !!error}>
            <Printer className="mr-1.5 h-4 w-4" /> Cetak
          </Button>
          <Button size="sm" onClick={handleDownload} disabled={loading || !!error || downloading}>
            <Download className="mr-1.5 h-4 w-4" /> {downloading ? 'Memproses…' : 'Download PDF'}
          </Button>
        </div>
        {loading ? <CetakLoading /> : error ? <CetakError message={error} /> : data && (
          <div className="overflow-x-auto border rounded-md bg-white">
            <div id={elementId} className="inline-block">
              <PesananPDFTemplate data={data} />
            </div>
          </div>
        )}
      </div>
    </FormTabShell>
  );
}

// ─── 2. Pengiriman (Surat Jalan) Cetak ──────────────────────────────────────

function mapPengirimanData(d: PengirimanBarangResponse): PengirimanData {
  return {
    nomor: d.noSuratJalan || '',
    tanggal: d.tanggal || '',
    kepada: d.pelanggan?.nama || '',
    alamatPenerima: d.alamatPengiriman || '',
    ekspedisi: d.ekspedisi || '',
    poNo: d.salesOrder?.noPesanan || '',
    detail: (d.details || []).map<DetailRow>((r) => ({
      id: r.id,
      kodeBarang: r.barang?.kode || '',
      barang: r.barang?.nama || '',
      harga: 0,
      qty: Number(r.qty) || 0,
      diskon: 0,
      satuan: r.satuan?.nama || '',
    })),
    keterangan: d.keterangan || '',
  };
}

export function PengirimanCetakTab({ id }: { id: string }) {
  const [data, setData] = useState<PengirimanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const elementId = `pdf-pengiriman-${id}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<PengirimanBarangResponse>(`/penjualan/pengiriman/${id}`);
      setData(mapPengirimanData(res));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : e instanceof Error ? e.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDownload = useCallback(async () => {
    if (!data) return;
    setDownloading(true);
    try {
      await generatePDF(elementId, `Surat-Jalan-${data.nomor || id}.pdf`);
    } finally {
      setDownloading(false);
    }
  }, [data, elementId, id]);

  const handlePrint = useCallback(() => { window.print(); }, []);

  return (
    <FormTabShell title={`Cetak Surat Jalan${data ? ` — ${data.nomor}` : ''}`}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={loading || !!error}>
            <Printer className="mr-1.5 h-4 w-4" /> Cetak
          </Button>
          <Button size="sm" onClick={handleDownload} disabled={loading || !!error || downloading}>
            <Download className="mr-1.5 h-4 w-4" /> {downloading ? 'Memproses…' : 'Download PDF'}
          </Button>
        </div>
        {loading ? <CetakLoading /> : error ? <CetakError message={error} /> : data && (
          <div className="overflow-x-auto border rounded-md bg-white">
            <div id={elementId} className="inline-block">
              <PengirimanPDFTemplate data={data} />
            </div>
          </div>
        )}
      </div>
    </FormTabShell>
  );
}

// ─── 3. Invoice Penjualan Cetak ─────────────────────────────────────────────

function mapInvoiceData(d: SalesInvoiceResponse): InvoiceData {
  return {
    nomor: d.noInvoice || '',
    tanggal: d.tanggal || '',
    kepada: d.pelanggan?.nama || '',
    alamatPenerima: d.alamatPengiriman || '',
    syaratPembayaran: d.syaratBayar?.nama || '',
    fob: d.fob || '',
    ekspedisi: d.ekspedisi || '',
    tanggalPengiriman: d.tanggalPengiriman || '',
    poNo: d.salesOrder?.noPesanan || '',
    mataUang: d.mataUang || 'IDR',
    detail: (d.details || []).map<DetailRow>((r) => ({
      id: r.id,
      kodeBarang: r.barang?.kode || '',
      barang: r.barang?.nama || '',
      harga: Number(r.harga) || 0,
      qty: Number(r.qty) || 0,
      diskon: Number(r.diskon) || 0,
    })),
    biayaTambahan: (d.biayaTambahan || []).map<BiayaTambahan>((b) => ({
      id: b.id,
      nama: b.nama || '',
      jumlah: Number(b.jumlah) || 0,
    })),
    keterangan: d.keterangan || '',
    diskonGlobal: Number(d.diskonGlobal) || 0,
    ppn: Number(d.ppn) || 0,
  };
}

export function InvoiceCetakTab({ id }: { id: string }) {
  const [data, setData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const elementId = `pdf-invoice-${id}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<SalesInvoiceResponse>(`/penjualan/sales-invoice/${id}`);
      setData(mapInvoiceData(res));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : e instanceof Error ? e.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDownload = useCallback(async () => {
    if (!data) return;
    setDownloading(true);
    try {
      await generatePDF(elementId, `Invoice-${data.nomor || id}.pdf`);
    } finally {
      setDownloading(false);
    }
  }, [data, elementId, id]);

  const handlePrint = useCallback(() => { window.print(); }, []);

  return (
    <FormTabShell title={`Cetak Faktur Penjualan${data ? ` — ${data.nomor}` : ''}`}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={loading || !!error}>
            <Printer className="mr-1.5 h-4 w-4" /> Cetak
          </Button>
          <Button size="sm" onClick={handleDownload} disabled={loading || !!error || downloading}>
            <Download className="mr-1.5 h-4 w-4" /> {downloading ? 'Memproses…' : 'Download PDF'}
          </Button>
        </div>
        {loading ? <CetakLoading /> : error ? <CetakError message={error} /> : data && (
          <div className="overflow-x-auto border rounded-md bg-white">
            <div id={elementId} className="inline-block">
              <InvoicePDFTemplate data={data} />
            </div>
          </div>
        )}
      </div>
    </FormTabShell>
  );
}

// ─── 4. Retur Penjualan Cetak ───────────────────────────────────────────────

function mapReturData(d: SalesReturResponse): ReturData {
  return {
    nomor: d.noRetur || '',
    tanggal: d.tanggal || '',
    dari: d.pelanggan?.nama || '',
    alamatPengembalian: d.alamatPengembalian || '',
    noPengembalian: d.noPengembalian || '',
    detail: (d.details || []).map<DetailRow>((r) => ({
      id: r.id,
      kodeBarang: r.barang?.kode || '',
      barang: r.barang?.nama || '',
      harga: Number(r.harga) || 0,
      qty: Number(r.qty) || 0,
      diskon: 0,
    })),
    keterangan: d.keterangan || '',
    diskonGlobal: Number(d.diskonGlobal) || 0,
    ppn: Number(d.ppn) || 0,
  };
}

export function ReturCetakTab({ id }: { id: string }) {
  const [data, setData] = useState<ReturData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const elementId = `pdf-retur-${id}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<SalesReturResponse>(`/penjualan/sales-retur/${id}`);
      setData(mapReturData(res));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : e instanceof Error ? e.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDownload = useCallback(async () => {
    if (!data) return;
    setDownloading(true);
    try {
      await generatePDF(elementId, `Retur-${data.nomor || id}.pdf`);
    } finally {
      setDownloading(false);
    }
  }, [data, elementId, id]);

  const handlePrint = useCallback(() => { window.print(); }, []);

  return (
    <FormTabShell title={`Cetak Retur Penjualan${data ? ` — ${data.nomor}` : ''}`}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={loading || !!error}>
            <Printer className="mr-1.5 h-4 w-4" /> Cetak
          </Button>
          <Button size="sm" onClick={handleDownload} disabled={loading || !!error || downloading}>
            <Download className="mr-1.5 h-4 w-4" /> {downloading ? 'Memproses…' : 'Download PDF'}
          </Button>
        </div>
        {loading ? <CetakLoading /> : error ? <CetakError message={error} /> : data && (
          <div className="overflow-x-auto border rounded-md bg-white">
            <div id={elementId} className="inline-block">
              <ReturPDFTemplate data={data} />
            </div>
          </div>
        )}
      </div>
    </FormTabShell>
  );
}
