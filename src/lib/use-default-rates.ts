'use client';

/**
 * UPDATE #04 — AUD-10: tarif pajak default global (app_setting RATE_PPN /
 * RATE_PPH23). Form dokumen baru memakai ini sebagai nilai awal kolom tarif
 * (sebelumnya hardcoded '11' / '2'). User tetap bisa mengoreksi per dokumen.
 */
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export interface DefaultTaxRates {
  ppn: string;
  pph23: string;
}

let cache: DefaultTaxRates | null = null;
let inflight: Promise<DefaultTaxRates> | null = null;

async function fetchRates(): Promise<DefaultTaxRates> {
  if (cache) return cache;
  if (!inflight) {
    inflight = Promise.all([api.get<{ key: string; value: string }>('/master/app-setting/RATE_PPN').catch(() => null), api.get<{ key: string; value: string }>('/master/app-setting/RATE_PPH23').catch(() => null)])
      .then(([ppn, pph23]) => {
        cache = { ppn: ppn?.value ?? '11', pph23: pph23?.value ?? '2' };
        return cache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Hook: tarif default global (fallback 11 / 2). null saat masih memuat. */
export function useDefaultTaxRates(): DefaultTaxRates | null {
  // useState initializer membaca cache (sync-safe); effect hanya fetch bila
  // cache belum ada — setState async lewat .then, tanpa cascading render.
  const [rates, setRates] = useState<DefaultTaxRates | null>(() => cache);
  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    fetchRates()
      .then((r) => {
        if (!cancelled) setRates(r);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return rates;
}

/** Invalidasi cache (dipakai setelah setting berubah). */
export function invalidateDefaultRates(): void {
  cache = null;
}
