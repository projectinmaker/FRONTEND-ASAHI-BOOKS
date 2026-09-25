import { api, type PaginatedResponse } from '@/lib/api';
import type { SupplierResponse, SupplierCOAItem, SupplierFoundationFields, SupplierCreate, SupplierUpdate } from '@/types/api';

export const supplierFoundationKeys = ['supplierType', 'city', 'province', 'country', 'postalCode', 'currency', 'bankName', 'bankAccountNo', 'bankAccountName'] as const;
export function supplierFoundationPayload(form: Record<typeof supplierFoundationKeys[number], string>): SupplierFoundationFields {
  return Object.fromEntries(supplierFoundationKeys.map(key => [key, form[key].trim() || null]));
}

// The supplier-coa endpoint omits Phase A fields. Load every master page before filtering.
export async function loadSupplierRows(): Promise<SupplierCOAItem[]> {
  const coa = await api.get<SupplierCOAItem[]>('/master/supplier-coa');
  const suppliers: SupplierResponse[] = [];
  for (let skip = 0; ; ) {
    const page = await api.get<PaginatedResponse<SupplierResponse>>('/master/supplier?skip=' + skip + '&limit=500');
    suppliers.push(...page.data);
    skip += page.data.length;
    if (skip >= page.total) break;
    if (!page.data.length) throw new Error('Daftar supplier belum lengkap. Muat ulang data.');
  }
  const byId = new Map(suppliers.map(s => [s.id, s]));
  const seen = new Set<string>();
  const rows = coa.map(row => {
    const supplier = row.supplierId ? byId.get(row.supplierId) : undefined;
    if (!supplier) return row;
    seen.add(supplier.id);
    return { ...row, ...supplier, kode: row.kode, nama: row.nama, kodeSupplier: supplier.kode, namaSupplier: supplier.nama };
  });
  for (const supplier of suppliers) {
    if (seen.has(supplier.id)) continue;
    rows.push({ ...supplier, coaId: supplier.akunHutang?.id || supplier.id, kode: supplier.akunHutang?.kode || '-', nama: supplier.akunHutang?.nama || supplier.nama, supplierId: supplier.id, kodeSupplier: supplier.kode, namaSupplier: supplier.nama, isLinked: true });
  }
  return rows;
}

export function needsAdjustmentExpiry(tipe: string, metodeValuasi?: string): boolean {
  return tipe === 'TAMBAH' && metodeValuasi === 'FEFO';
}

export function adjustmentExpiryPayload(required: boolean, value: string, original?: string | null) {
  // Do not introduce a nullable key on unrelated legacy adjustments.
  return required ? { tanggalKedaluwarsa: value || null } : original ? { tanggalKedaluwarsa: null } : {};
}

// Linking remains a two-step operation because supplier-from-coa ignores Phase A fields.
// Persist the new ID before updating, so callers can retry without creating a duplicate.
export async function saveSupplier(payload: SupplierCreate & SupplierUpdate, options: { id?: string | null; coaId?: string; onLinked?: (id: string) => void } = {}): Promise<SupplierResponse> {
  if (options.id) return api.put<SupplierResponse>('/master/supplier/' + options.id, payload);
  if (options.coaId) {
    const linked = await api.post<SupplierResponse>('/master/supplier-from-coa', {
      coaId: options.coaId, kode: payload.kode, nama: payload.nama,
      alamat: payload.alamat, telepon: payload.telepon, email: payload.email,
      kontakPerson: payload.kontakPerson, npwp: payload.npwp
    });
    options.onLinked?.(linked.id);
    return api.put<SupplierResponse>('/master/supplier/' + linked.id, payload);
  }
  const body = { ...payload };
  if (!body.currency) delete body.currency;
  return api.post<SupplierResponse>('/master/supplier', body);
}
