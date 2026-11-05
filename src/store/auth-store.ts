import { create } from 'zustand';
import { api, setToken, ApiError } from '@/lib/api';
import { useAccessStore } from '@/store/access-store';
import { useTabStore } from '@/store/tab-store';
// === Update ASAHI #019 — reset preferensi saat logout (font/format tanggal
// per-user; mencegah sesi berikutnya memakai preferensi user sebelumnya). ===
import { usePreferensiStore } from '@/store/preferensi-store';
import type { UserResponse, LoginResponse } from '@/types/api';

interface AuthState {
  user: UserResponse | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  // === Update #043 — sesi login 2 jam ===
  /** Batas waktu sesi (epoch ms) — persist di localStorage bersama token.
   *  null = tanpa batas (legacy token sebelum #043). */
  expiresAt: number | null;
  /** true setelah sesi berakhir (timer 2 jam ATAU 401 dari api.ts) —
   *  memunculkan AlertDialog "Sesi Berakhir"; tab TIDAK direset. */
  sessionExpired: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  /** Update #043 — tandai sesi berakhir (idempotent; tidak reset tab). */
  markSessionExpired: () => void;
  initAdmin: () => Promise<void>;
  setUser: (user: UserResponse) => void;
}

// === Update #043 — durasi sesi login: 2 jam ===
const SESSION_DURATION_MS = 2 * 60 * 60 * 1000;
const EXPIRES_AT_KEY = 'asahi_erp_expires_at';

export const useAuthStore = create<AuthState>((set) => ({
  user: getUser(),
  isAuthenticated: !!getToken(),
  isLoading: false,
  expiresAt: getExpiresAt(),
  sessionExpired: false,

  login: async (username, password) => {
    set({ isLoading: true });
    try {
      const res = await api.post<LoginResponse>('/auth/login', { username, password });
      setToken(res.accessToken);
      setUserStorage(res.user);
      // === Update #043 — mulai hitung sesi 2 jam (persist supaya tetap
      // berlaku setelah refresh halaman; mirror pola token di localStorage). ===
      const expiresAt = Date.now() + SESSION_DURATION_MS;
      setExpiresAt(expiresAt);
      set({ user: res.user, isAuthenticated: true, isLoading: false, expiresAt, sessionExpired: false });
      // Muat permission efektif (RBAC v2) — fire-and-forget, jangan di-await.
      void useAccessStore.getState().fetchPermissions();
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  logout: () => {
    setToken(null);
    setUserStorage(null);
    // === Update #043 — bersihkan state sesi (logout manual TIDAK memunculkan
    // popup "Sesi Berakhir" — sessionExpired direset). ===
    setExpiresAt(null);
    set({ user: null, isAuthenticated: false, expiresAt: null, sessionExpired: false });
    // Reset permission RBAC (event `auth:logout` untuk listener lain sudah
    // ditangani api.ts pada kasus 401; di sini cukup reset langsung agar
    // tidak memicu loop listener auth-store sendiri).
    useAccessStore.getState().reset();
    // === Update ASAHI #019 — reset preferensi (pola cleanup logout yang sama
    // dengan access-store): hapus cache font/format tanggal/dkk + inline font. ===
    usePreferensiStore.getState().reset();
    // Tutup semua tab terbuka — tab lama bisa berisi halaman yang tidak lagi
    // berhak dilihat pengguna berikutnya pada sesi browser yang sama.
    useTabStore.setState({
      tabs: [{ id: 'tab-dashboard', title: 'Dashboard', module: 'dashboard', tabType: 'list', closable: false }],
      activeTabId: 'tab-dashboard',
      refreshKeys: {}
    });
  },

  // === Update #043 — tandai sesi berakhir (idempotent; state tab dibiarkan).
  // Pemanggil (timer useSessionWatch / listener 401 api.ts) yang bertugas
  // membersihkan token/user. ===
  markSessionExpired: () => {
    set((s) => (s.sessionExpired ? s : { sessionExpired: true }));
  },

  initAdmin: async () => {
    try {
      await api.post('/auth/init-admin');
    } catch (err) {
      // 400 = admin sudah ada, itu OK
      if (err instanceof ApiError && err.status === 400) return;
      throw err;
    }
  },

  setUser: (user) => {
    setUserStorage(user);
    set({ user });
  }
}));

// Helper — baca token dari localStorage (dipakai saat init)
function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('asahi_erp_token');
}

// Helper — baca user dari localStorage (dipakai saat init, untuk restore session)
function getUser(): UserResponse | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('asahi_erp_user');
    return raw ? (JSON.parse(raw) as UserResponse) : null;
  } catch {
    return null;
  }
}

// Helper — simpan user ke localStorage
function setUserStorage(user: UserResponse | null) {
  if (typeof window === 'undefined') return;
  if (user) {
    localStorage.setItem('asahi_erp_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('asahi_erp_user');
  }
}

// ── Update #043 — persist expiresAt bersama token (localStorage manual,
// mirror pola asahi_erp_token / asahi_erp_user) supaya batas sesi 2 jam
// tetap berlaku setelah refresh halaman. ──
function getExpiresAt(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(EXPIRES_AT_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function setExpiresAt(expiresAt: number | null) {
  if (typeof window === 'undefined') return;
  if (expiresAt != null) {
    localStorage.setItem(EXPIRES_AT_KEY, String(expiresAt));
  } else {
    localStorage.removeItem(EXPIRES_AT_KEY);
  }
}

// Listener untuk event 401 dari api.ts
if (typeof window !== 'undefined') {
  window.addEventListener('auth:logout', () => {
    useAuthStore.getState().logout();
  });
  // === Update #043 — 401 api.ts → "sesi berakhir": token/user dibersihkan +
  // markSessionExpired (popup AlertDialog di page.tsx; state tab TIDAK
  // direset — logout penuh hanya saat tombol OK ditekan). ===
  window.addEventListener('auth:expired', () => {
    setToken(null);
    setUserStorage(null);
    setExpiresAt(null);
    useAuthStore.getState().markSessionExpired();
  });
}
