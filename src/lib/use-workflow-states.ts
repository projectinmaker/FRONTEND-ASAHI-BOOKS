'use client';

import * as React from 'react';
import { workflowApi } from '@/lib/workflow-api';
import type { WorkflowResponse } from '@/types/api';

/**
 * Fetch workflow states for a list of documents.
 * Returns a map of documentId -> WorkflowResponse.
 *
 * === Update #071 — BATCH (satu request per halaman) ===
 * Dulu: satu request PER BARIS (N+1 — deretan request per halaman daftar).
 * Kini: SATU request GET /workflow/states?documentType=...&ids=a,b,c —
 * jauh lebih ringan untuk daftar besar. Riwayat lengkap TIDAK disertakan
 * (diambil on-demand oleh popover riwayat via workflowApi.getWorkflow).
 *
 * Failures are silently skipped (the row just won't show workflow info).
 */
export function useWorkflowStates(documentType: string | null, documentIds: string[], refreshKey?: number): { states: Record<string, WorkflowResponse>; loading: boolean; refresh: () => void } {
  const [states, setStates] = React.useState<Record<string, WorkflowResponse>>({});
  const [loading, setLoading] = React.useState(false);
  const [nonce, setNonce] = React.useState(0);

  // Stable reference of joined IDs to detect changes
  const idsKey = documentIds.join(',');

  React.useEffect(() => {
    if (!documentType || documentIds.length === 0) {
      setStates({});
      return;
    }

    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const res = await workflowApi.getStates(documentType!, documentIds);
        if (cancelled) return;
        const map: Record<string, WorkflowResponse> = {};
        for (const item of res?.data ?? []) map[item.documentId] = item;
        setStates(map);
      } catch {
        // Silently skip — document may not have workflow info
        if (!cancelled) setStates({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [documentType, idsKey, refreshKey, nonce]);

  const refresh = React.useCallback(() => setNonce((n) => n + 1), []);

  return { states, loading, refresh };
}
