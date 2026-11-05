'use client';

import { useEffect } from 'react';
import { setToken } from '@/lib/api';
import { useAuthStore } from '@/store/auth-store';

/**
 * === Update #043 — pengawas sesi login 2 jam ===
 * Interval 30 detik: begitu expiresAt tercapai (dan sesi belum ditandai
 * berakhir), bersihkan token + markSessionExpired() → AlertDialog
 * "Sesi Berakhir" di app/page.tsx. Idempotent — sumber pertama yang memicu
 * (timer ini ATAU event 401 'auth:expired' dari api.ts) yang menang;
 * markSessionExpired tidak meng-set ulang bila sudah true.
 *
 * expiresAt null (token legacy sebelum #043) → tanpa pengawasan proaktif;
 * pengecekan tetap dilakukan backend lewat 401.
 */
export function useSessionWatch() {
  useEffect(() => {
    const check = () => {
      const s = useAuthStore.getState();
      if (!s.isAuthenticated || s.sessionExpired) return;
      const { expiresAt } = s;
      if (!expiresAt) return;
      if (Date.now() >= expiresAt) {
        setToken(null);
        s.markSessionExpired();
      }
    };
    check();
    const timer = window.setInterval(check, 30_000);
    return () => window.clearInterval(timer);
  }, []);
}
