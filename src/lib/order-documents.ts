import { api } from '@/lib/api';
import type { SalesOrderResponse, PurchaseOrderResponse } from '@/types/api';

export type OrderKind = 'sales' | 'purchase';
export type OrderResponse = SalesOrderResponse | PurchaseOrderResponse;
export const ORDER_CURRENCY_OPTIONS = [{ id: 'IDR', label: 'IDR' }, { id: 'USD', label: 'USD' }];
export const orderEndpoint = (kind: OrderKind) => kind === 'sales' ? '/penjualan/sales-order' : '/pembelian/purchase-order';
export const canEditOrder = (status?: string | null) => status === 'DRAFT';
export function formatOrderMoney(value: number | string, currency?: string | null) {
  const amount = Number(value).toLocaleString('id-ID', { maximumFractionDigits: 2 });
  return currency ? `${currency} ${amount}` : amount;
}

export interface OrderLine {
  key: string;
  barangId: string;
  satuanId: string;
  harga: string;
  qty: string;
  diskon: string;
}
export const newOrderLine = (): OrderLine => ({ key: crypto.randomUUID(), barangId: '', satuanId: '', harga: '', qty: '1', diskon: '0' });
export function orderLinesFromResponse(order: OrderResponse): OrderLine[] {
  return order.details.map(line => ({ key: line.id, barangId: line.barangId, satuanId: line.satuanId || '', harga: String(line.harga), qty: String(line.qty), diskon: String(line.diskon ?? 0) }));
}
export function serializeOrderLines(lines: OrderLine[]) {
  return lines.filter(line => line.barangId).map(line => ({ barangId: line.barangId, satuanId: line.satuanId || null, harga: Number(line.harga), qty: Number(line.qty), diskon: Number(line.diskon) }));
}

const commonKeys = ['tanggal', 'syaratBayarId', 'currency', 'diskonGlobal', 'ppn', 'keterangan'] as const;
const salesKeys = ['pelangganId', 'fob', 'ekspedisi', 'tanggalPengiriman', 'penjual', 'alamatPengiriman', 'customerPoNumber', 'customerPoDate'] as const;
const purchaseKeys = ['supplierId', 'tanggalKirim', 'alamat'] as const;
export type OrderHeaderKey = typeof commonKeys[number] | typeof salesKeys[number] | typeof purchaseKeys[number];
export type OrderHeader = Record<OrderHeaderKey, string>;
export function newOrderHeader(): OrderHeader {
  const date = new Date();
  const tanggal = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return Object.fromEntries([...commonKeys, ...salesKeys, ...purchaseKeys].map(key => [key, key === 'tanggal' ? tanggal : key === 'currency' ? 'IDR' : ''])) as OrderHeader;
}
export function orderHeaderFromResponse(order: OrderResponse): OrderHeader {
  const header = newOrderHeader();
  const record = order as unknown as Record<string, unknown>;
  for (const key of Object.keys(header) as OrderHeaderKey[]) {
    const value = record[key];
    header[key] = value == null ? '' : String(value);
    if (key === 'tanggal' || key === 'tanggalPengiriman' || key === 'tanggalKirim' || key === 'customerPoDate') header[key] = header[key].slice(0, 10);
  }
  return header;
}
export function serializeOrderHeader(kind: OrderKind, header: OrderHeader) {
  const result: Record<string, string | number | null> = {};
  for (const key of [...commonKeys, ...(kind === 'sales' ? salesKeys : purchaseKeys)]) {
    if (key === 'ppn' || key === 'diskonGlobal') {
      if (header[key] !== '') result[key] = Number(header[key]);
    } else result[key] = header[key].trim() || null;
  }
  return result;
}

type DetailLike = { barangId: string; satuanId?: string | null; harga: number | string; qty: number | string; diskon?: number | string | null };
function detailSignature(lines: DetailLike[]) {
  // There is no sequence field in the API; response ordering is not a detail edit.
  return JSON.stringify(lines.map(line => JSON.stringify([line.barangId, line.satuanId || null, Number(line.harga), Number(line.qty), Number(line.diskon ?? 0)])).sort());
}
export function buildOrderUpdate(kind: OrderKind, header: OrderHeader, lines: OrderLine[], original: OrderResponse) {
  const previous = serializeOrderHeader(kind, orderHeaderFromResponse(original));
  const current = serializeOrderHeader(kind, header);
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(current)) if (value !== previous[key]) payload[key] = value;
  const details = serializeOrderLines(lines);
  if (detailSignature(details) !== detailSignature(original.details)) payload.details = details;
  return payload;
}
export function orderSaveMismatches(kind: OrderKind, requested: Record<string, unknown>, saved: OrderResponse): string[] {
  const labels: Record<string, string> = { customerPoNumber: 'Customer PO Number', customerPoDate: 'Customer PO Date', currency: 'Currency', syaratBayarId: 'Syarat Bayar' };
  const actual = serializeOrderHeader(kind, orderHeaderFromResponse(saved));
  const issues: string[] = [];
  for (const [key, value] of Object.entries(requested)) {
    if (key in actual && value !== actual[key]) issues.push(labels[key] || key);
  }
  if (Array.isArray(requested.details) && detailSignature(requested.details as DetailLike[]) !== detailSignature(saved.details)) issues.push('Detail barang / satuan');
  return issues;
}

export async function persistOrder(kind: OrderKind, payload: Record<string, unknown>, id?: string, onSaved?: (order: OrderResponse) => void) {
  const endpoint = orderEndpoint(kind);
  if (id) {
    const latest = await api.get<OrderResponse>(`${endpoint}/${id}`);
    if (!canEditOrder(latest.status)) throw new Error(`Dokumen berstatus ${latest.status}. Hanya dokumen DRAFT yang dapat diedit. Muat ulang dokumen.`);
  }
  const saved = id ? await api.put<OrderResponse>(`${endpoint}/${id}`, payload) : await api.post<OrderResponse>(endpoint, { ...payload, autoPostJurnal: false });
  // Keep the ID even if the server ignored fields, so retry cannot create a duplicate.
  onSaved?.(saved);
  return { saved, mismatches: orderSaveMismatches(kind, payload, saved) };
}

export function summarizeOrderTotals(orders: { grandTotal: number | string; currency?: string | null }[]) {
  const totals = new Map<string, number>();
  for (const order of orders) {
    const currency = order.currency || '';
    totals.set(currency, (totals.get(currency) || 0) + Number(order.grandTotal));
  }
  return [...totals].map(([currency, amount]) => currency ? formatOrderMoney(amount, currency) : `${formatOrderMoney(amount)} (mata uang tidak tersedia)`).join(' / ') || '-';
}
