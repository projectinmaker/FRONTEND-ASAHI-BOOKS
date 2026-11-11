'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore, readExpiresAt, readLastRefresh, setLastActivity } from '@/store/auth-store';

/**
 * === Update #051 — pengawas sesi IDLE (memperbaiki #043) ===
 * MASALAH #043: timer 2 jam berjalan MATI sejak login — user yang sedang
 * aktif pun dipaksa logout tepat 2 jam kemudian.
 *
 * SEKARANG: sesi berakhir HANYA bila user TIDAK ada aktivitas selama
 * 2 jam penuh. Cara kerjanya:
 *
 * 1. Setiap aktivitas user (klik / ketik / scroll / layar disentuh / tab
 *    kembali terlihat) memperpanjang batas sesi: expiresAt = sekarang + 2 jam
 *    (disimpan di localStorage → dibaca segar lintas tab).
 * 2. Token JWT ikut "digeser": bila user aktif dan token sudah berumur
 *    > 30 menit, token ditukar dengan yang baru lewat POST /auth/refresh
 *    (token lama masih sah → mulus, tanpa login ulang).
 * 3. Interval 30 detik memeriksa: bila sekarang ≥ expiresAt — artinya TIDAK
 *    ada aktivitas 2 jam terakhir — sesi berakhir → popup "Sesi Berakhir"
 *    (pembersihan token/user sama seperti alur 401 di api.ts).
 * 4. 401 dari server tetap memicu sesi berakhir (api.ts) — jaring pengaman
 *    bila token tidak sempat digeser.
 *
 * === Update #055 — umur token JWT backend kini 5 jam (app/config.py),
 * SENGAJA lebih panjang dari window idle 2 jam. Sebelumnya umur token = 2
 * jam sama dengan idle window, sehingga token yang "tua" (terakhir digeser
 * >30 menit sebelum user diam) bisa mati lebih cepat dari batas idle →
 * request pertama setelah kembali 401 → sesi berakhir lebih awal padahal
 * belum idle 2 jam penuh. Sekarang token selalu hidup melampaui window
 * idle → sesi benar-benar berakhir HANYA karena tidak ada aktivitas. ===
 */
// 2 jam — window IDLE (mirror SESSION_DURATION_MS di auth-store).
// Update #055: TIDAK lagi mirror umur token backend (yang kini 5 jam dan
// sengaja lebih panjang) — nilai ini murni batas tanpa aktivitas.
const SESSION_DURATION_MS = 2 * 60 * 60 * 1000;
const ACTIVITY_THROTTLE_MS = 20_000; // tulis aktivitas maks. 1× per 20 detik
const REFRESH_AFTER_MS = 30 * 60 * 1000; // geser token bila sudah berumur 30 menit
const EXPIRES_AT_KEY = 'asahi_erp_expires_at';

export function useSessionWatch() {
  // Ada aktivitas sejak tick terakhir? (dipakai memutuskan perlu geser token)
  const activeSinceTick = useRef(false);
  const lastWrite = useRef(0);

  useEffect(() => {
    const markActivity = () => {
      const now = Date.now();
      activeSinceTick.current = true;
      if (now - lastWrite.current < ACTIVITY_THROTTLE_MS) return; // throttle penulisan
      lastWrite.current = now;
      setLastActivity(now);
      // Perpanjang batas sesi — localStorage = sumber kebenaran lintas tab,
      // jadi aktivitas di tab A juga menjaga sesi tab B tetap hidup.
      localStorage.setItem(EXPIRES_AT_KEY, String(now + SESSION_DURATION_MS));
    };

    const onVisible = () => {
      // Kembali ke tab = aktivitas (user memandang/melanjutkan pekerjaan).
      if (document.visibilityState === 'visible') markActivity();
    };

    const events: (keyof DocumentEventMap)[] = ['click', 'keydown', 'wheel', 'pointerdown', 'touchstart'];
    events.forEach((evt) => document.addEventListener(evt, markActivity, { passive: true }));
    document.addEventListener('visibilitychange', onVisible);
    // Membuka/memuat ulang halaman adalah aktivitas user.
    markActivity();

    const check = () => {
      const s = useAuthStore.getState();
      if (!s.isAuthenticated || s.sessionExpired) return;
      // Batas sesi dibaca SEGAR dari localStorage (tab lain bisa saja
      // memperpanjangnya setelah state store tab ini dibuat).
      const expiresAt = readExpiresAt() ?? s.expiresAt;
      if (!expiresAt) return;
      if (Date.now() >= expiresAt) {
        // Tidak ada aktivitas 2 jam terakhir → sesi berakhir.
        // Idempotent; pembersihan sama seperti alur 401 'auth:expired' di
        // api.ts/auth-store (token, user, dan jejak sesi dihapus; popup
        // "Sesi Berakhir" ditampilkan page.tsx).
        localStorage.removeItem('asahi_erp_token');
        localStorage.removeItem('asahi_erp_user');
        localStorage.removeItem(EXPIRES_AT_KEY);
        setLastActivity(null);
        s.markSessionExpired();
        return;
      }
      // Geser token bila user AKTIF dan token sudah berumur — supaya JWT
      // tidak pernah kadaluarsa di tengah sesi yang sedang aktif.
      if (activeSinceTick.current) {
        activeSinceTick.current = false;
        const lastRefresh = readLastRefresh();
        if (Date.now() - lastRefresh >= REFRESH_AFTER_MS) {
          void useAuthStore.getState().refreshSession();
        }
      }
    };
    check();
    const timer = window.setInterval(check, 30_000);
    return () => {
      window.clearInterval(timer);
      events.forEach((evt) => document.removeEventListener(evt, markActivity));
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
