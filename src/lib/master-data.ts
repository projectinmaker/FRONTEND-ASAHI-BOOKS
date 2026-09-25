/**
 * Master Data service — fetch & cache master data options untuk form dropdown.
 *
 * Phase 2 — Master Data Foundation.
 * Dipakai di form Pelanggan/Supplier/Barang/Gudang/KategoriAset/KasBankAkun
 * untuk fetch options (SyaratBayar, COA, Organization).
 *
 * Cache TTL 5 menit supaya tidak fetch berkali-kali.
 */

import { api } from '@/lib/api';
import { loadCOA } from '@/lib/coa';
import type { SyaratBayarResponse, COAResponse, OrganizationSimple, AkunPerkiraanSimple } from '@/types/api';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 menit

type CacheEntry<T> = { data: T; timestamp: number };

const cache: Record<string, CacheEntry<unknown>> = {};

function isFresh<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  return !!entry && Date.now() - entry.timestamp < CACHE_TTL_MS;
}

// ── Syarat Bayar options ────────────────────────────────────────────────────

export interface SyaratBayarOption {
  value: string;
  label: string;
  hari: number | null;
}

export async function getSyaratBayarOptions(): Promise<SyaratBayarOption[]> {
  const cached = cache['syarat_bayar'] as CacheEntry<SyaratBayarOption[]> | undefined;
  if (isFresh(cached)) return cached.data;

  const data = await api.get<SyaratBayarResponse[]>('/master/syarat-bayar');
  const options = data.map((s) => ({
    value: s.id,
    label: s.hari ? `${s.nama} (${s.hari} hari)` : s.nama,
    hari: s.hari
  }));

  cache['syarat_bayar'] = { data: options, timestamp: Date.now() };
  return options;
}

// ── COA options (filtered) ──────────────────────────────────────────────────

export interface COAOption {
  value: string;
  label: string;
  kode: string;
  nama: string;
}

export interface COAFilter {
  accountClass?: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'COGS' | 'EXPENSE';
  systemAccountType?: string; // mis. 'FIXED_ASSET', 'ACCUM_DEPR', 'DEPRECIATION_EXPENSE'
  /** OR-match: tampilkan juga akun yang NAMA-nya mengandung substring ini. */
  orNamaInclude?: string;
  /** Batasi hasil orNamaInclude ke header-header ini saja (mis. BEBAN/HPP). */
  orHeaders?: string[];
  tingkat?: 'HEADER' | 'GROUP' | 'DETAIL';
  activeOnly?: boolean;
}

/**
 * Ambil daftar COA untuk dropdown form. Pakai loadCOA dari lib/coa.ts
 * yang sudah support filter Phase 1 (allowManualPosting, isControlAccount, dll).
 *
 * Untuk filter akun spesifik (mis. hanya akun FIXED_ASSET), pakai
 * systemAccountType. Catatan: backend belum support filter ini di query param,
 * jadi kita filter di frontend setelah fetch.
 */
export async function getCOAOptions(filter: COAFilter = {}): Promise<COAOption[]> {
  const cacheKey = `coa:${JSON.stringify(filter)}`;
  const cached = cache[cacheKey] as CacheEntry<COAOption[]> | undefined;
  if (isFresh(cached)) return cached.data;

  // Fetch semua COA aktif, lalu filter di frontend.
  const list = await loadCOA({
    tingkat: filter.tingkat,
    activeOnly: filter.activeOnly ?? true,
    accountClass: filter.accountClass
  });

  // Filter berdasarkan systemAccountType (kalau ada di response).
  // Catatan: field systemAccountType belum tentu ada di semua COA, jadi
  // pakai optional chaining + fallback.
  // orNamaInclude/orHeaders: OR-condition tambahan — akun yang namanya
  // mengandung substring tertentu (dibatasi ke header tertentu) tetap
  // ditawarkan meskipun systemAccountType-nya belum diset di COA
  // (mis. akun beban penyusutan lama yang belum ber-sys-type).
  const hasOrCondition = Boolean(filter.systemAccountType || filter.orNamaInclude);
  const filtered = hasOrCondition
    ? list.filter((c) => {
        const sysMatch = filter.systemAccountType
          ? c.systemAccountType === filter.systemAccountType
          : false;
        const namaMatch = filter.orNamaInclude
          ? c.nama.toLowerCase().includes(filter.orNamaInclude.toLowerCase()) &&
            (!filter.orHeaders || filter.orHeaders.includes(c.header))
          : false;
        return sysMatch || namaMatch;
      })
    : list;

  const options = filtered.map((c) => ({
    value: c.id,
    label: `${c.kode} — ${c.nama}`,
    kode: c.kode,
    nama: c.nama
  }));

  cache[cacheKey] = { data: options, timestamp: Date.now() };
  return options;
}

// ── Organization options ─────────────────────────────────────────────────────

export interface OrganizationOption {
  value: string;
  label: string;
  code: string;
  name: string;
  kind: string;
}

export type OrganizationKind = 'COMPANY' | 'BRANCH' | 'DEPARTMENT' | 'COST_CENTER' | 'PROJECT';

/**
 * Ambil daftar OrganizationUnit untuk dropdown. Pakai endpoint
 * GET /organisasi/units?kind=... yang sudah ada dari Phase 1.
 */
export async function getOrganizationOptions(kind?: OrganizationKind): Promise<OrganizationOption[]> {
  const cacheKey = `org:${kind || 'all'}`;
  const cached = cache[cacheKey] as CacheEntry<OrganizationOption[]> | undefined;
  if (isFresh(cached)) return cached.data;

  const params = new URLSearchParams();
  if (kind) params.set('kind', kind);
  params.set('skip', '0');
  params.set('limit', '500');

  const data = await api.get<OrganizationSimple[]>(`/organisasi/units?${params.toString()}`);
  const options = data.map((o) => ({
    value: o.id,
    label: `${o.code} — ${o.name}`,
    code: o.code,
    name: o.name,
    kind: o.kind
  }));

  cache[cacheKey] = { data: options, timestamp: Date.now() };
  return options;
}

// ── Helper: lookup single value ──────────────────────────────────────────────

export async function getSyaratBayarLabel(id: string): Promise<string> {
  if (!id) return '-';
  try {
    const options = await getSyaratBayarOptions();
    return options.find((o) => o.value === id)?.label || id;
  } catch {
    return id;
  }
}

// ── Helper: validate stock_item for inventory transactions (Phase 3) ──────────
// Frontend proactive check — backend belum enforce di Phase 3, tapi tersedia.
// Dipakai di form pemindahan/penyesuaian untuk filter barang non-stock.
//
// Logic: barang bisa dipakai transaksi stok kalau:
// - itemType !== 'JASA' (jasa tidak ada stok fisik), DAN
// - stockItem !== false (false = non-stock item)
//
// Kalau field itemType/stockItem belum di-expose backend (undefined/null),
// fallback: anggap stock-tracked (return true) supaya tidak block transaksi
// existing yang belum di-update master-nya.
import type { BarangDropdown, BarangResponse } from '@/types/api';

export function isStockItemBarang(barang: Pick<BarangDropdown, 'itemType' | 'stockItem'> | Pick<BarangResponse, 'itemType' | 'stockItem'> | null | undefined): boolean {
  if (!barang) return true; // fallback: jangan block kalau barang belum di-load
  if (barang.itemType === 'JASA') return false;
  if (barang.stockItem === false) return false;
  return true;
}

// ── Cache invalidation ──────────────────────────────────────────────────────

export function clearMasterDataCache(): void {
  Object.keys(cache).forEach((k) => delete cache[k]);
}
