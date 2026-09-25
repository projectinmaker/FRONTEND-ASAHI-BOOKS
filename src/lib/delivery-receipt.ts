import { api, type PaginatedResponse } from '@/lib/api';
import type { PurchaseInvoiceResponse } from '@/types/api';

export interface StockFormLine { barangId: string; satuanId: string; qty: string | number }

// Only the required input constraints from the API are mirrored here.
// Availability, over-delivery, GRNI and PO/supplier compatibility stay on the server.
export function stockLineError(lines: StockFormLine[]): string | null {
  if (!lines.some(line => line.barangId)) return 'Minimal satu barang harus dipilih.';
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.barangId && !line.satuanId) continue;
    if (!line.barangId) return `Baris ${index + 1}: pilih barang.`;
    if (!line.satuanId) return `Baris ${index + 1}: satuan wajib dipilih.`;
    if (!Number.isInteger(Number(line.qty)) || Number(line.qty) < 1) return `Baris ${index + 1}: qty harus bilangan bulat minimal 1.`;
  }
  return null;
}

export interface StockOperationError {
  presentation: 'modal' | 'toast';
  title: string;
  detail: string;
  guidance?: 'grni';
  hint?: string;
}
export function describeStockOperationError(documentType: string, detail: string): StockOperationError | null {
  if (documentType === 'sales_retur' || documentType === 'purchase_retur') {
    if (/over[\s-]?return/i.test(detail)) return { presentation: 'modal', title: 'Over-Return', detail };
    if (/tidak boleh berbeda/i.test(detail)) return { presentation: 'modal', title: 'Harga Retur Tidak Sesuai', detail };
    return { presentation: 'toast', title: 'Retur Tidak Dapat Diproses', detail };
  }
  if (documentType !== 'penerimaan_barang' && documentType !== 'pengiriman_barang') return null;
  if (documentType === 'penerimaan_barang' && /GRNI|PENERIMAAN_DALAM_PROSES/i.test(detail) && /belum\s+(?:di[- ]?configure|dikonfigurasi)/i.test(detail)) {
    return { presentation: 'modal', title: 'GRNI Belum Dikonfigurasi', detail, guidance: 'grni' };
  }
  if (documentType === 'pengiriman_barang' && /over[\s-]?delivery/i.test(detail)) {
    return { presentation: 'modal', title: 'Over-Delivery', detail };
  }
  const name = documentType === 'penerimaan_barang' ? 'penerimaan' : 'pengiriman';
  if (/gudang\s+wajib/i.test(detail)) return { presentation: 'toast', title: 'Gudang Belum Diisi', detail, hint: `Edit ${name} dan pilih gudang.` };
  if (/qty.*(?:>\s*0|positif)/i.test(detail)) return { presentation: 'toast', title: 'Qty Tidak Valid', detail, hint: 'Periksa baris dengan qty nol atau negatif.' };
  return { presentation: 'toast', title: 'Transaksi Tidak Dapat Diproses', detail };
}

export async function loadReceiptInvoiceOptions(supplierId: string): Promise<PurchaseInvoiceResponse[]> {
  if (!supplierId) return [];
  const invoices: PurchaseInvoiceResponse[] = [];
  for (let skip = 0; ; ) {
    const query = new URLSearchParams({ supplier_id: supplierId, skip: String(skip), limit: '200' });
    const page = await api.get<PaginatedResponse<PurchaseInvoiceResponse>>(`/pembelian/purchase-invoice?${query}`);
    invoices.push(...page.data.filter(invoice => !invoice.jurnalUmumId && (invoice.status === 'DRAFT' || invoice.status === 'DIPROSES')));
    skip += page.data.length;
    if (skip >= page.total) return invoices;
    if (!page.data.length) throw new Error('Daftar invoice belum lengkap. Coba muat ulang.');
  }
}

/**
 * Invoice pembelian supplier yang SUDAH di-POST (status SELESAI).
 * Dipakai form retur pembelian — backend menolak posting retur tanpa link
 * purchaseInvoiceId (hutang invoice harus bisa diperbarui saat post).
 */
export async function loadPostedInvoiceOptions(supplierId: string): Promise<PurchaseInvoiceResponse[]> {
  if (!supplierId) return [];
  const query = new URLSearchParams({ supplier_id: supplierId, status: 'SELESAI', skip: '0', limit: '50' });
  const page = await api.get<PaginatedResponse<PurchaseInvoiceResponse>>(`/pembelian/purchase-invoice?${query}`);
  return page.data;
}
