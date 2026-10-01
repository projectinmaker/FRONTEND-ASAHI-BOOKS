'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Printer, Download, AlertCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { generatePDF } from '@/lib/pdf-utils';
import { FormTabShell } from '@/components/erp/form-tab-shell';
import { PembelianPDFTemplate, PenerimaanPDFTemplate, InvoicePembelianPDFTemplate, ReturPembelianPDFTemplate, type PembelianData, type PenerimaanData, type InvoicePembelianData, type ReturPembelianData, type PembelianDetailRow, type PenerimaanDetailRow, type ReturDetailRow, type BiayaTambahan } from '@/components/erp/purchasing/pdf-templates';
import type { PurchaseOrderResponse, PurchaseInvoiceResponse, PurchaseReturResponse, PenerimaanBarangResponse } from '@/types/api';

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

// ─── 1. Pesanan Pembelian Cetak ─────────────────────────────────────────────

function mapPembelianData(d: PurchaseOrderResponse): PembelianData {
  return {
    nomor: d.noPesanan || '',
    tanggal: d.tanggal || '',
    tanggalKirim: d.tanggalKirim || '',
    kepada: d.supplier?.nama || '',
    alamat: d.alamat || '',
    detail: (d.details || []).map<PembelianDetailRow>((r) => ({
      id: r.id,
      barang: r.barang?.nama || '',
      harga: Number(r.harga) || 0,
      qty: Number(r.qty) || 0,
      diskon: Number(r.diskon) || 0,
      satuan: r.satuan?.nama || ''
    })),
    biayaTambahan: (d.biayaTambahan || []).map<BiayaTambahan>((b) => ({
      id: b.id,
      nama: b.nama || '',
      jumlah: Number(b.jumlah) || 0
    })),
    keterangan: d.keterangan || '',
    diskonGlobal: Number(d.diskonGlobal) || 0,
    ppn: Number(d.ppn) || 0
  };
}

export function PesananPembelianCetakTab({ id }: { id: string }) {
  const [data, setData] = useState<PembelianData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const elementId = `pdf-po-${id}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<PurchaseOrderResponse>(`/pembelian/purchase-order/${id}`);
      setData(mapPembelianData(res));
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
      await generatePDF(elementId, `Pesanan-Pembelian-${data.nomor || id}.pdf`);
    } finally {
      setDownloading(false);
    }
  }, [data, elementId, id]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <FormTabShell title={`Cetak Pesanan Pembelian${data ? ` — ${data.nomor}` : ''}`}>
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
          <CetakLoading />
        ) : error ? (
          <CetakError message={error} />
        ) : (
          data && (
            <div className="overflow-x-auto border rounded-md bg-white">
              <div id={elementId} className="inline-block">
                <PembelianPDFTemplate data={data} />
              </div>
            </div>
          )
        )}
      </div>
    </FormTabShell>
  );
}

// ─── 2. Penerimaan Barang Cetak ─────────────────────────────────────────────

function mapPenerimaanData(d: PenerimaanBarangResponse): PenerimaanData {
  return {
    nomor: d.noForm || '',
    tanggal: d.tanggal || '',
    kepada: d.supplier?.nama || '',
    alamat: d.alamat || '',
    detail: (d.details || []).map<PenerimaanDetailRow>((r) => ({
      id: r.id,
      barang: r.barang?.nama || '',
      qty: Number(r.qty) || 0,
      satuan: r.satuan?.nama || ''
    })),
    keterangan: d.keterangan || ''
  };
}

export function PenerimaanCetakTab({ id }: { id: string }) {
  const [data, setData] = useState<PenerimaanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const elementId = `pdf-penerimaan-${id}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<PenerimaanBarangResponse>(`/pembelian/penerimaan/${id}`);
      setData(mapPenerimaanData(res));
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
      await generatePDF(elementId, `Penerimaan-${data.nomor || id}.pdf`);
    } finally {
      setDownloading(false);
    }
  }, [data, elementId, id]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <FormTabShell title={`Cetak Penerimaan Barang${data ? ` — ${data.nomor}` : ''}`}>
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
          <CetakLoading />
        ) : error ? (
          <CetakError message={error} />
        ) : (
          data && (
            <div className="overflow-x-auto border rounded-md bg-white">
              <div id={elementId} className="inline-block">
                <PenerimaanPDFTemplate data={data} />
              </div>
            </div>
          )
        )}
      </div>
    </FormTabShell>
  );
}

// ─── 3. Invoice Pembelian Cetak ─────────────────────────────────────────────

function mapInvoicePembelianData(d: PurchaseInvoiceResponse): InvoicePembelianData {
  return {
    nomor: d.noForm || '',
    noFaktur: d.noFaktur || '',
    tanggal: d.tanggal || '',
    dari: d.supplier?.nama || '',
    alamat: d.alamat || '',
    detail: (d.details || []).map<PembelianDetailRow>((r) => ({
      id: r.id,
      barang: r.barang?.nama || '',
      harga: Number(r.harga) || 0,
      qty: Number(r.qty) || 0,
      diskon: Number(r.diskon) || 0
    })),
    biayaTambahan: (d.biayaTambahan || []).map<BiayaTambahan>((b) => ({
      id: b.id,
      nama: b.nama || '',
      jumlah: Number(b.jumlah) || 0
    })),
    keterangan: d.keterangan || '',
    diskonGlobal: Number(d.diskonGlobal) || 0,
    ppn: Number(d.ppn) || 0
  };
}

export function InvoicePembelianCetakTab({ id }: { id: string }) {
  const [data, setData] = useState<InvoicePembelianData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const elementId = `pdf-invoice-pembelian-${id}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<PurchaseInvoiceResponse>(`/pembelian/purchase-invoice/${id}`);
      setData(mapInvoicePembelianData(res));
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
      await generatePDF(elementId, `Faktur-Pembelian-${data.nomor || id}.pdf`);
    } finally {
      setDownloading(false);
    }
  }, [data, elementId, id]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <FormTabShell title={`Cetak Faktur Pembelian${data ? ` — ${data.nomor}` : ''}`}>
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
          <CetakLoading />
        ) : error ? (
          <CetakError message={error} />
        ) : (
          data && (
            <div className="overflow-x-auto border rounded-md bg-white">
              <div id={elementId} className="inline-block">
                <InvoicePembelianPDFTemplate data={data} />
              </div>
            </div>
          )
        )}
      </div>
    </FormTabShell>
  );
}

// ─── 4. Retur Pembelian Cetak ───────────────────────────────────────────────

function mapReturPembelianData(d: PurchaseReturResponse): ReturPembelianData {
  return {
    nomor: d.noRetur || '',
    tanggal: d.tanggal || '',
    noReferensi: d.purchaseOrder?.noPesanan || '',
    kepada: d.supplier?.nama || '',
    alamat: d.alamat || '',
    detail: (d.details || []).map<ReturDetailRow>((r) => ({
      id: r.id,
      barang: r.barang?.nama || '',
      harga: Number(r.harga) || 0,
      qty: Number(r.qty) || 0
    })),
    keterangan: d.keterangan || '',
    ppn: Number(d.ppn) || 0
  };
}

export function ReturPembelianCetakTab({ id }: { id: string }) {
  const [data, setData] = useState<ReturPembelianData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const elementId = `pdf-retur-pembelian-${id}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<PurchaseReturResponse>(`/pembelian/purchase-retur/${id}`);
      setData(mapReturPembelianData(res));
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
      await generatePDF(elementId, `Retur-Pembelian-${data.nomor || id}.pdf`);
    } finally {
      setDownloading(false);
    }
  }, [data, elementId, id]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <FormTabShell title={`Cetak Retur Pembelian${data ? ` — ${data.nomor}` : ''}`}>
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
          <CetakLoading />
        ) : error ? (
          <CetakError message={error} />
        ) : (
          data && (
            <div className="overflow-x-auto border rounded-md bg-white">
              <div id={elementId} className="inline-block">
                <ReturPembelianPDFTemplate data={data} />
              </div>
            </div>
          )
        )}
      </div>
    </FormTabShell>
  );
}
