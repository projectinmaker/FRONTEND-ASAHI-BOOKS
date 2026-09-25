'use client';

import * as React from 'react';
import { workflowApi } from '@/lib/workflow-api';
import type { WorkflowResponse } from '@/types/api';

/**
 * Fetch workflow states for a list of documents (batched in parallel).
 * Returns a map of documentId -> WorkflowResponse.
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
      // Bound concurrency — fetch 6 at a time
      const results: Record<string, WorkflowResponse> = {};
      const queue = [...documentIds];
      const CONCURRENCY = 6;

      async function worker() {
        while (queue.length > 0) {
          const id = queue.shift();
          if (!id) break;
          try {
            const w = await workflowApi.getWorkflow(documentType!, id);
            if (cancelled) return;
            results[id] = w;
          } catch {
            // Silently skip — document may not have workflow info
          }
        }
      }

      const workers = Array.from({ length: Math.min(CONCURRENCY, documentIds.length) }, () => worker());
      await Promise.all(workers);
      if (!cancelled) {
        setStates(results);
        setLoading(false);
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
