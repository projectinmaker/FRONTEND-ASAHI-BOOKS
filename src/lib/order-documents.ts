import { api } from '@/lib/api';
import { formatNumberIDR } from '@/lib/money';
import type { SalesOrderResponse, PurchaseOrderResponse, PurchaseOrderDetailResponse } from '@/types/api';

export type OrderKind = 'sales' | 'purchase';
export type OrderResponse = SalesOrderResponse | PurchaseOrderResponse;
// Fallback bila API /master/mata-uang tidak tersedia — nilai seed backend
// (update ASAHI #3: + EUR, China Yuan, SGD).
export const ORDER_CURRENCY_OPTIONS = [
  { id: 'IDR', label: 'IDR — Rupiah' },
  { id: 'USD', label: 'USD — US Dollar' },
  { id: 'EUR', label: 'EUR — Euro' },
  { id: 'CNY', label: 'CNY — China Yuan' },
  { id: 'SGD', label: 'SGD — Singapore Dollar' }
];
export const orderEndpoint = (kind: OrderKind) => (kind === 'sales' ? '/penjualan/sales-order' : '/pembelian/purchase-order');
export const canEditOrder = (status?: string | null) => status === 'DRAFT';
export function formatOrderMoney(value: number | string, currency?: string | null) {
  const amount = formatNumberIDR(value);
  // IDR adalah mata uang dasar — tanpa prefix, cukup angka terformat.
  return currency && currency !== 'IDR' ? `${currency} ${amount}` : amount;
}

export interface OrderLine {
  key: string;
  barangId: string;
  satuanId: string;
  harga: string;
  qty: string;
  diskon: string;
  // === Update #002 — tracking per baris (khusus PO): SO asal + jenis belanja ===
  salesOrderId: string;
  jenisPembelian: string;
}
export const newOrderLine = (): OrderLine => ({ key: crypto.randomUUID(), barangId: '', satuanId: '', harga: '', qty: '1', diskon: '0', salesOrderId: '', jenisPembelian: '' });
export function orderLinesFromResponse(order: OrderResponse): OrderLine[] {
  return order.details.map((line) => {
    // Update #002: salesOrderId/jenisPembelian hanya ada di detail PO —
    // cast aman; sisi sales selalu string kosong.
    const poLine = line as PurchaseOrderDetailResponse;
    return { key: line.id, barangId: line.barangId, satuanId: line.satuanId || '', harga: String(line.harga), qty: String(line.qty), diskon: String(line.diskon ?? 0), salesOrderId: poLine.salesOrderId || '', jenisPembelian: poLine.jenisPembelian || '' };
  });
}
export function serializeOrderLines(lines: OrderLine[]) {
  // Update #002: subTotal WAJIB ikut terkirim — backend PUT /purchase-order
  // membaca d["sub_total"] langsung (KeyError bila absen); salesOrderId &
  // jenisPembelian untuk tracking item ke SO + tujuan posting per baris.
  return lines
    .filter((line) => line.barangId)
    .map((line) => {
      const qty = Number(line.qty);
      const harga = Number(line.harga);
      const diskon = Number(line.diskon);
      return { barangId: line.barangId, satuanId: line.satuanId || null, harga, qty, diskon, subTotal: qty * harga * (1 - diskon / 100), salesOrderId: line.salesOrderId || null, jenisPembelian: line.jenisPembelian || null };
    });
}

const commonKeys = ['tanggal', 'syaratBayarId', 'currency', 'diskonGlobal', 'ppn', 'keterangan'] as const;
// Update ASAHI (revisi SO): ekspedisi & penjual dihapus dari dokumen SO;
// customerCode = singkatan customer (input manual) → segmen nomor "SO ASI/TBI/2026/001".
// customerCode hanya efektif saat create — backend mengabaikannya saat update
// (bagian dari nomor dokumen, immutable).
const salesKeys = ['pelangganId', 'customerCode', 'tanggalPengiriman', 'alamatPengiriman', 'customerPoNumber', 'customerPoDate'] as const;
// Update ASAHI #3: alamatPengirimanId (gudang tujuan, wajib pilih satu) + ppic.
// Update ASAHI (PPh23/PPN opsional): pilihan pajak hanya untuk PO — boleh
// keduanya, salah satu, atau tidak sama sekali.
const purchaseKeys = ['supplierId', 'tanggalKirim', 'alamat', 'alamatPengirimanId', 'ppic', 'ppnApplicable', 'pph23Applicable', 'pph23', 'picGudang', 'picGudangTelepon'] as const;

// ── Update #002 — jenis belanja per baris PO (dasar posting COA) ──
export const JENIS_PEMBELIAN_OPTIONS = [
  { id: 'CONSUMABLE', label: 'Consumable' },
  { id: 'PROJECT', label: 'Project' },
  { id: 'ASSET', label: 'Asset' },
  { id: 'ATK', label: 'ATK' }
];
export function jenisPembelianLabel(v?: string | null) {
  return JENIS_PEMBELIAN_OPTIONS.find((o) => o.id === v)?.label ?? v ?? '';
}
export type OrderHeaderKey = (typeof commonKeys)[number] | (typeof salesKeys)[number] | (typeof purchaseKeys)[number];
export type OrderHeader = Record<OrderHeaderKey, string>;
export function newOrderHeader(): OrderHeader {
  const date = new Date();
  const tanggal = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return Object.fromEntries([...commonKeys, ...salesKeys, ...purchaseKeys].map((key) => [key, key === 'tanggal' ? tanggal : key === 'currency' ? 'IDR' : key === 'ppn' ? '11' : key === 'ppic' ? 'false' : key === 'ppnApplicable' ? 'true' : key === 'pph23Applicable' ? 'false' : key === 'pph23' ? '2' : ''])) as OrderHeader;
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
  const result: Record<string, string | number | boolean | null> = {};
  for (const key of [...commonKeys, ...(kind === 'sales' ? salesKeys : purchaseKeys)]) {
    if (key === 'ppn' || key === 'diskonGlobal' || key === 'pph23') {
      if (header[key] !== '') result[key] = Number(header[key]);
    } else if (key === 'ppic' || key === 'ppnApplicable' || key === 'pph23Applicable') {
      // Update ASAHI #3 / PPh23-PPN: boolean fields (bukan string).
      result[key] = header[key] === 'true';
    } else if (key === 'picGudang' || key === 'picGudangTelepon') {
      // Update #002: kirim string kosong (BUKAN null) — null dianggap "tidak
      // dikirim" oleh backend sehingga pengosongan PIC saat update tidak
      // diproses; '' benar-benar menghapus nilai (strip → None di server).
      result[key] = header[key].trim();
    } else result[key] = header[key].trim() || null;
  }
  return result as Record<string, string | number | boolean | null>;
}

type DetailLike = { barangId: string; satuanId?: string | null; harga: number | string; qty: number | string; diskon?: number | string | null; salesOrderId?: string | null; jenisPembelian?: string | null };
function detailSignature(lines: DetailLike[]) {
  // There is no sequence field in the API; response ordering is not a detail edit.
  // Update #002: salesOrderId + jenisPembelian ikut signature — perubahan
  // relasi SO / jenis belanja dihitung sebagai detail change (payload.details dikirim).
  return JSON.stringify(lines.map((line) => JSON.stringify([line.barangId, line.satuanId || null, Number(line.harga), Number(line.qty), Number(line.diskon ?? 0), line.salesOrderId || null, line.jenisPembelian || null])).sort());
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
  const labels: Record<string, string> = { customerPoNumber: 'Customer PO Number', customerPoDate: 'Customer PO Date', customerCode: 'Singkatan Customer', currency: 'Currency', syaratBayarId: 'Syarat Bayar', alamatPengirimanId: 'Alamat Pengiriman', ppic: 'PPIC', ppnApplicable: 'PPN', pph23Applicable: 'PPh23', pph23: 'Tarif PPh23', picGudang: 'PIC Gudang', picGudangTelepon: 'No. Telp PIC Gudang' };
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
  return [...totals].map(([currency, amount]) => (currency ? formatOrderMoney(amount, currency) : `${formatOrderMoney(amount)} (mata uang tidak tersedia)`)).join(' / ') || '-';
}
