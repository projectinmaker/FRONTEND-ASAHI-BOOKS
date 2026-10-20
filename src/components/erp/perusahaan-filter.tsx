'use client';

/**
 * AUD-17 (update #05) — Filter Perusahaan bersama untuk laporan/dashboard/jurnal.
 *
 * Pola EXACT mengikuti TahunBukuFilter (reports.tsx): Select w-44 + hint kecil
 * di bawahnya; mobile w-full. Daftar perusahaan ditarik SEKALI dari
 * GET /laporan/companies lalu di-cache module-level (pola use-default-rates.ts).
 *
 * Domain nilai filter (string):
 *  - 'ALL'        → Semua Perusahaan (tanpa param scope)
 *  - 'UNASSIGNED' → Tanpa Perusahaan (kirim unassigned=true)
 *  - '<uuid>'     → satu perusahaan (kirim companyId=<uuid>)
 *
 * Gunakan helper companyQueryParams()/companyScopeQuery() untuk menyisipkan
 * param ke URL fetch (selalu lewat src/lib/api.ts — jangan fetch langsung).
 */
import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { LaporanCompanyOption } from '@/types/api';

export type PerusahaanFilterValue = 'ALL' | 'UNASSIGNED' | string; // string = companyId

// ── Cache module-level (pola use-default-rates.ts) ─────────────────────────
let companiesCache: LaporanCompanyOption[] | null = null;
let inflight: Promise<LaporanCompanyOption[]> | null = null;

async function fetchCompanies(): Promise<LaporanCompanyOption[]> {
  if (companiesCache) return companiesCache;
  if (!inflight) {
    inflight = api
      .get<LaporanCompanyOption[]>('/laporan/companies')
      .then((rows) => {
        companiesCache = Array.isArray(rows) ? rows : [];
        return companiesCache;
      })
      .catch(() => {
        // gagal muat (mis. token belum ada) → daftar kosong, opsi ALL tetap tersedia
        return [] as LaporanCompanyOption[];
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Hook daftar perusahaan aktif (cache module-level, fetch sekali per session). */
export function useCompanyOptions(): { companies: LaporanCompanyOption[]; loading: boolean } {
  const [companies, setCompanies] = useState<LaporanCompanyOption[]>(() => companiesCache ?? []);
  const [loading, setLoading] = useState<boolean>(() => !companiesCache);

  useEffect(() => {
    let cancelled = false;
    if (companiesCache) return;
    fetchCompanies().then((rows) => {
      if (!cancelled) {
        setCompanies(rows);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { companies, loading };
}

/** Invalidasi cache (mis. setelah master organisasi berubah). */
export function invalidateCompanyOptions(): void {
  companiesCache = null;
}

// ── Helpers untuk URL fetch ────────────────────────────────────────────────

/** Mapping nilai filter → param scope backend (companyId / unassigned). */
export function companyQueryParams(value: PerusahaanFilterValue | null | undefined): { companyId?: string } | { unassigned?: boolean } | Record<string, never> {
  if (!value || value === 'ALL') return {};
  if (value === 'UNASSIGNED') return { unassigned: true };
  return { companyId: value };
}

/** Bentuk string siap tempel ke URL fetch, mis. `&companyId=...` / `&unassigned=true` / ''. */
export function companyScopeQuery(value: PerusahaanFilterValue | null | undefined): string {
  if (!value || value === 'ALL') return '';
  if (value === 'UNASSIGNED') return '&unassigned=true';
  return `&companyId=${encodeURIComponent(value)}`;
}

/** Label singkat nilai filter (untuk badge "Perusahaan: {nama}"). */
export function companyLabel(value: PerusahaanFilterValue | null | undefined, companies: LaporanCompanyOption[] = []): string | null {
  if (!value || value === 'ALL' || value === 'UNASSIGNED') return null;
  return companies.find((c) => c.id === value)?.name ?? null;
}

// ── Komponen filter ────────────────────────────────────────────────────────

interface PerusahaanFilterProps {
  /** Nilai filter saat ini: 'ALL' | 'UNASSIGNED' | companyId. */
  value: PerusahaanFilterValue;
  onChange: (v: PerusahaanFilterValue) => void;
  /** Label di atas Select (default "Perusahaan"). */
  label?: string;
  /** Teks opsi pertama (default "Semua Perusahaan"). */
  allLabel?: string;
  /** Sertakan opsi "Tanpa Perusahaan" (default true; false untuk scope yang hanya menerima companyId/global). */
  includeUnassigned?: boolean;
  /** Hint kecil di bawah Select — default kosong (pakai hint bila ada). */
  hint?: string;
  disabled?: boolean;
  /** Lebar Select (default w-44 / mobile w-full). */
  widthClass?: string;
}

export function PerusahaanFilter({ value, onChange, label = 'Perusahaan', allLabel = 'Semua Perusahaan', includeUnassigned = true, hint, disabled, widthClass }: PerusahaanFilterProps) {
  const { companies, loading } = useCompanyOptions();

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Select value={value || 'ALL'} onValueChange={(v) => onChange(v || 'ALL')} disabled={disabled}>
        <SelectTrigger className={widthClass ?? 'w-full sm:w-44'}>
          <SelectValue placeholder={allLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">{allLabel}</SelectItem>
          {includeUnassigned && <SelectItem value="UNASSIGNED">Tanpa Perusahaan</SelectItem>}
          {companies.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              <span className="flex items-center gap-1.5">
                <Building2 className="h-3 w-3 text-muted-foreground" />
                <span className="truncate">{c.code ? `${c.code} — ${c.name}` : c.name}</span>
              </span>
            </SelectItem>
          ))}
          {loading && companies.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Memuat daftar...</div>}
          {!loading && companies.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Belum ada perusahaan (organisasi COMPANY)</div>}
        </SelectContent>
      </Select>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
