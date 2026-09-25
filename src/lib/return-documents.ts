import { api } from '@/lib/api';
import type { SalesInvoiceResponse, SalesReturCreate, SalesReturDetailCreate, SalesReturResponse } from '@/types/api';

export type ReturnQuantities = Record<string, string>;
export function salesReturnDetails(invoice: SalesInvoiceResponse, quantities: ReturnQuantities): SalesReturDetailCreate[] {
  for (const [id, qty] of Object.entries(quantities)) {
    if (qty !== '' && Number(qty) !== 0 && !invoice.details.some(line => line.id === id)) throw new Error('Baris retur tidak berasal dari invoice yang dipilih.');
  }
  const details: SalesReturDetailCreate[] = [];
  for (const line of invoice.details) {
    const value = quantities[line.id] ?? '';
    if (value === '' || Number(value) === 0) continue;
    const qty = Number(value), harga = Number(line.harga);
    if (!Number.isSafeInteger(qty) || qty < 1) throw new Error('Qty retur harus bilangan bulat positif. Gunakan 0 untuk barang yang tidak diretur.');
    if (line.harga == null || String(line.harga).trim() === '' || !Number.isFinite(harga) || harga < 0) throw new Error('Harga invoice sumber tidak valid. Muat ulang invoice.');
    details.push({ barangId: line.barangId, salesInvoiceDetailId: line.id, harga, qty, subTotal: qty * harga });
  }
  if (!details.length) throw new Error('Isi qty retur pada minimal satu baris invoice.');
  return details;
}

export function salesReturnSaveMismatches(requested: SalesReturDetailCreate[], saved: SalesReturResponse): string[] {
  const signature = (lines: SalesReturDetailCreate[]) => JSON.stringify(lines.map(line => JSON.stringify([line.salesInvoiceDetailId || null, line.barangId, Number(line.harga), Number(line.qty)])).sort());
  return signature(requested) === signature(saved.details) ? [] : ['Referensi detail invoice / harga / qty'];
}

export async function createSalesReturn(payload: SalesReturCreate, onSaved: (saved: SalesReturResponse) => void) {
  const saved = await api.post<SalesReturResponse>('/penjualan/sales-retur', { ...payload, autoPostJurnal: false });
  onSaved(saved);
  return { saved, mismatches: salesReturnSaveMismatches(payload.details, saved) };
}
