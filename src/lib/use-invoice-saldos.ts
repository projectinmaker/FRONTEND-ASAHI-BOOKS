'use client';

import * as React from 'react';
import { pelunasanApi } from '@/lib/pelunasan-api';
import type { JenisPelunasan, InvoiceSaldoResponse } from '@/types/api';

/**
 * Fetch invoice saldo (sisa tagihan + statusPembayaran) for a list of invoices
 * in parallel (batched). Returns a map of invoiceId -> InvoiceSaldoResponse.
 *
 * Failures are silently skipped — the row just won't show the payment status.
 *
 * Used by Sales/Purchasing invoice tabs to render a "Status Bayar" badge.
 */
export function useInvoiceSaldos(jenis: JenisPelunasan | null, invoiceIds: string[], refreshKey?: number): { saldos: Record<string, InvoiceSaldoResponse>; loading: boolean; refresh: () => void } {
  const [saldos, setSaldos] = React.useState<Record<string, InvoiceSaldoResponse>>({});
  const [loading, setLoading] = React.useState(false);
  const [nonce, setNonce] = React.useState(0);

  // Stable joined-key to detect list changes
  const idsKey = invoiceIds.join(',');

  React.useEffect(() => {
    if (!jenis || invoiceIds.length === 0) {
      setSaldos({});
      return;
    }

    let cancelled = false;
    setLoading(true);

    async function load() {
      const results: Record<string, InvoiceSaldoResponse> = {};
      const queue = [...invoiceIds];
      const CONCURRENCY = 6;

      async function worker() {
        while (queue.length > 0) {
          const id = queue.shift();
          if (!id) break;
          try {
            const s = await pelunasanApi.getInvoiceSaldo(jenis!, id);
            if (cancelled) return;
            // The endpoint returns InvoiceSaldoDetailResponse (which extends InvoiceSaldoResponse)
            // so it has all the saldo fields we need.
            results[id] = s;
          } catch {
            // Silently skip — invoice may not have saldo info yet
          }
        }
      }

      const workers = Array.from({ length: Math.min(CONCURRENCY, invoiceIds.length) }, () => worker());
      await Promise.all(workers);
      if (!cancelled) {
        setSaldos(results);
        setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [jenis, idsKey, refreshKey, nonce]);

  const refresh = React.useCallback(() => setNonce((n) => n + 1), []);

  return { saldos, loading, refresh };
}
