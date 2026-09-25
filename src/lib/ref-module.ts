/**
 * RefModule service — fetch & cache daftar RefModule enum dari backend.
 *
 * Backend endpoint: GET /jurnal/ref-modules?include_legacy={true|false}
 * Response: { data: RefModuleOption[] }
 *
 * Cache TTL 5 menit supaya tidak fetch berkali-kali (halaman jurnal list,
 * detail jurnal, dashboard, dll). Cache di memori modul (per-session browser).
 *
 * Untuk form pembuatan transaksi baru, panggil `getRefModules(false)` supaya
 * enum legacy tidak muncul di pilihan user.
 */

import { api } from '@/lib/api';
import type { RefModuleOption } from '@/types/api';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 menit

type CacheEntry = { data: RefModuleOption[]; timestamp: number };

let fullCache: CacheEntry | null = null; // include_legacy=true
let canonicalCache: CacheEntry | null = null; // include_legacy=false

/** Bentuk mentah item yang dikirim backend. */
type RefModuleWireItem = {
  value: string;
  label: string;
  group: string;
  /** Endpoint ini membangun dict mentah tanpa response_model → key snake_case. */
  is_legacy?: boolean;
  /** Alias camelCase bila endpoint kelak memakai response_model (BaseSchema to_camel). */
  isLegacy?: boolean;
};

async function fetchRefModules(includeLegacy: boolean): Promise<RefModuleOption[]> {
  const res = await api.get<{ data: RefModuleWireItem[] }>(`/jurnal/ref-modules?include_legacy=${includeLegacy ? 'true' : 'false'}`);
  // Verifikasi live: keys yang dikirim = value/label/group/is_legacy (snake_case).
  // Normalisasi ke camelCase; terima juga isLegacy bila bentuk wire berubah.
  return (res.data || []).map((r) => ({
    value: r.value,
    label: r.label,
    group: r.group,
    isLegacy: r.isLegacy ?? r.is_legacy === true
  }));
}

/**
 * Ambil daftar RefModule option. Otomatis cache selama 5 menit.
 *
 * @param includeLegacy true = include enum legacy (untuk filter jurnal historis).
 *                      false = hanya enum canonical (untuk form transaksi baru).
 */
export async function getRefModules(includeLegacy = true): Promise<RefModuleOption[]> {
  const now = Date.now();
  const cache = includeLegacy ? fullCache : canonicalCache;

  if (cache && now - cache.timestamp < CACHE_TTL_MS) {
    return cache.data;
  }

  const data = await fetchRefModules(includeLegacy);

  if (includeLegacy) {
    fullCache = { data, timestamp: now };
  } else {
    canonicalCache = { data, timestamp: now };
  }

  return data;
}

/**
 * Lookup label ramah pengguna untuk sebuah RefModule value.
 * Return value mentah kalau tidak ketemu di cache.
 */
export async function getRefModuleLabel(value: string): Promise<string> {
  if (!value) return '—';
  try {
    const modules = await getRefModules(true);
    return modules.find((r) => r.value === value)?.label || value;
  } catch {
    return value;
  }
}

/**
 * Lookup info lengkap (label, group, isLegacy) untuk sebuah RefModule value.
 * Return null kalau tidak ketemu.
 */
export async function getRefModuleInfo(value: string): Promise<RefModuleOption | null> {
  if (!value) return null;
  try {
    const modules = await getRefModules(true);
    return modules.find((r) => r.value === value) || null;
  } catch {
    return null;
  }
}

/**
 * Sinkron fetch label untuk banyak value sekaligus (batch lookup).
 * Berguna untuk render tabel jurnal list — sekali fetch, lookup di-memory.
 */
export async function getRefModuleLabelMap(values: string[]): Promise<Record<string, RefModuleOption>> {
  const result: Record<string, RefModuleOption> = {};
  if (values.length === 0) return result;
  try {
    const modules = await getRefModules(true);
    const lookup = new Map(modules.map((m) => [m.value, m]));
    for (const v of values) {
      const found = lookup.get(v);
      if (found) result[v] = found;
    }
  } catch {
    // silently skip — caller fallback ke value mentah
  }
  return result;
}

/**
 * Hapus cache. Panggil saat user logout / switch company untuk invalidate.
 */
export function clearRefModuleCache(): void {
  fullCache = null;
  canonicalCache = null;
}

// ── Grouping helper untuk dropdown ──────────────────────────────────────────

export interface RefModuleGroup {
  label: string;
  options: { value: string; label: string; isLegacy: boolean }[];
}

/**
 * Group daftar RefModule option berdasarkan field `group`.
 * Urutan group dipertahankan sesuai input order (backend sudah urut kanonik).
 */
export function groupRefModules(modules: RefModuleOption[]): RefModuleGroup[] {
  const groups: RefModuleGroup[] = [];
  const seen = new Set<string>();

  for (const m of modules) {
    let g = groups.find((x) => x.label === m.group);
    if (!g) {
      g = { label: m.group, options: [] };
      groups.push(g);
      seen.add(m.group);
    }
    g.options.push({ value: m.value, label: m.label, isLegacy: m.isLegacy });
  }

  return groups;
}
