import { api, ApiError, type PaginatedResponse } from '@/lib/api';
import type { PurchaseInvoiceCreate, PurchaseInvoiceUpdate, PurchaseInvoiceResponse } from '@/types/api';

export function invoicePhaseDFields(purchaseOrderId: string, invoiceType: string, original?: PurchaseInvoiceResponse): Pick<PurchaseInvoiceUpdate, 'purchaseOrderId' | 'invoiceType'> {
  const fields = { purchaseOrderId: purchaseOrderId || null, invoiceType: invoiceType.trim() || null };
  if (!original) return fields;
  return Object.fromEntries(Object.entries(fields).filter(([key, value]) => value !== (original[key as keyof typeof fields] || null)));
}

export function invoiceSaveMismatches(requested: PurchaseInvoiceCreate | PurchaseInvoiceUpdate, saved: PurchaseInvoiceResponse): string[] {
  const issues: string[] = [];
  if ('purchaseOrderId' in requested && (requested.purchaseOrderId || null) !== (saved.purchaseOrderId || null)) issues.push('Purchase Order');
  if ('invoiceType' in requested && (requested.invoiceType || null) !== (saved.invoiceType || null)) issues.push('Tipe Invoice');
  if ('details' in requested) {
    // Match a multiset: response order is not guaranteed, and the same item may have multiple units.
    const signature = (lines: {barangId: string; satuanId?: string | null; qty: number; harga: number}[]) =>
      JSON.stringify(lines.map(line => JSON.stringify([line.barangId, line.satuanId || null, Number(line.qty), Number(line.harga)])).sort());
    if (signature(requested.details) !== signature(saved.details)) issues.push('Detail barang / satuan');
  }
  return issues;
}

export async function createPurchaseInvoice(payload: PurchaseInvoiceCreate, onSaved: (saved: PurchaseInvoiceResponse) => void) {
  const saved = await api.post<PurchaseInvoiceResponse>('/pembelian/purchase-invoice', { ...payload, autoPostJurnal: false });
  onSaved(saved); // Preserve the created document before checking ignored fields; never POST a duplicate on retry.
  return { saved, mismatches: invoiceSaveMismatches(payload, saved) };
}

export function duplicateInvoiceMessage(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.status !== 400) return null;
  return /(?:no[_. ]*faktur|nomor faktur)/i.test(error.detail) && /(?:duplicate|duplikat|sudah|already|unik|unique)/i.test(error.detail) ? error.detail : null;
}

export async function loadInvoiceTypeSuggestions(): Promise<string[]> {
  const values = new Set<string>();
  for (let skip = 0; ; ) {
    const page = await api.get<PaginatedResponse<PurchaseInvoiceResponse>>(`/pembelian/purchase-invoice?skip=${skip}&limit=200`);
    for (const invoice of page.data) if (invoice.invoiceType) values.add(invoice.invoiceType);
    skip += page.data.length;
    if (skip >= page.total) return [...values].sort();
    if (!page.data.length) throw new Error('Pilihan tipe invoice belum lengkap.');
  }
}
