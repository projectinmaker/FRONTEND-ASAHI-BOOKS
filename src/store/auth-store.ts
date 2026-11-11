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
   *  null = tanpa batas (legacy token sebelum #043).
   *  === Update #051 — batas ini kini DIGESER mengikuti aktivitas user
   *  (idle-timeout): hook useSessionWatch memperpanjangnya setiap kali user
   *  aktif, jadi sesi hanya berakhir bila TIDAK ada aktivitas 2 jam penuh. === */
  expiresAt: number | null;
  /** true setelah sesi berakhir (idle 2 jam ATAU 401 dari api.ts) —
   *  memunculkan AlertDialog "Sesi Berakhir"; tab TIDAK direset. */
  sessionExpired: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  /** Update #043 — tandai sesi berakhir (idempotent; tidak reset tab). */
  markSessionExpired: () => void;
  /** Update #051 — sesi geser: tukar token masih-sah dengan token baru
   *  berumur penuh + perpanjang expiresAt. Dipanggil useSessionWatch saat
   *  user aktif & token sudah berumur > 30 menit. */
  refreshSession: () => Promise<void>;
  initAdmin: () => Promise<void>;
  setUser: (user: UserResponse) => void;
}

// === Update #043/#051/#055 — WINDOW IDLE sesi: 2 jam tanpa aktivitas. ===
// Update #055: nilai ini adalah BATAS TANPA AKTIVITAS, BUKAN umur token.
// Umur token JWT backend (ACCESS_TOKEN_EXPIRE_MINUTES, kini 5 jam) sengaja
// LEBIH PANJANG dari window ini — sebelum #055 token berumur sama (2 jam)
// sehingga token "tua" bisa mati lebih cepat dari idle window → 401 → sesi
// berakhir lebih awal. Sekarang satu-satunya penyebab sesi berakhir adalah
// TIDAK ADA AKTIVITAS 2 jam. JANGAN menyamakan dua nilai ini saat mengubah
// durasi idle (ubah yang di sini + use-session-watch, bukan backend).
const SESSION_DURATION_MS = 2 * 60 * 60 * 1000;
const EXPIRES_AT_KEY = 'asahi_erp_expires_at';
// === Update #051 — waktu terakhir token digeser (POST /auth/refresh).
// Dipakai useSessionWatch untuk throttle: token hanya ditukar bila sudah
// berumur > 30 menit, bukan di setiap aktivitas. ===
const LAST_REFRESH_KEY = 'asahi_erp_last_refresh';
const LAST_ACTIVITY_KEY = 'asahi_erp_last_activity';

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
      setLastRefresh(Date.now());
      setLastActivity(Date.now());
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
    // === Update #051 — bersihkan jejak idle-timeout juga. ===
    setLastRefresh(null);
    setLastActivity(null);
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

  // === Update #051 — sesi geser (idle-timeout). Tukar token lama yang masih
  // sah dengan token baru berumur penuh lewat POST /auth/refresh, lalu
  // perpanjang expiresAt. Dipanggil useSessionWatch saat user AKTIF — jadi
  // selama user bekerja, token selalu segar dan sesi tidak pernah berakhir;
  // sesi hanya berakhir bila user tidak ada aktivitas 2 jam penuh. ===
  refreshSession: async () => {
    const s = useAuthStore.getState();
    if (!s.isAuthenticated || s.sessionExpired) return;
    try {
      const res = await api.post<LoginResponse>('/auth/refresh');
      setToken(res.accessToken);
      setUserStorage(res.user);
      const expiresAt = Date.now() + SESSION_DURATION_MS;
      setExpiresAt(expiresAt);
      setLastRefresh(Date.now());
      // Data user ikut disinkronkan (role/nama bisa diubah admin sejak login).
      set({ user: res.user, expiresAt, sessionExpired: false });
    } catch {
      // 401 → token sudah kadaluarsa (user idle terlalu lama): api.ts sudah
      // membersihkan token + memicu 'auth:expired' (popup Sesi Berakhir).
      // Error lain (server sebentar tidak terjangkau): dicoba lagi pada tick
      // berikutnya — selama token lama masih sah, tidak ada gangguan.
    }
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

// === Update #051 — waktu terakhir token digeser / aktivitas terakhir user
// (persist di localStorage; dibaca lintas tab oleh useSessionWatch). ===
export function readLastRefresh(): number {
  if (typeof window === 'undefined') return 0;
  const raw = localStorage.getItem(LAST_REFRESH_KEY);
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function setLastRefresh(ts: number | null) {
  if (typeof window === 'undefined') return;
  if (ts != null) {
    localStorage.setItem(LAST_REFRESH_KEY, String(ts));
  } else {
    localStorage.removeItem(LAST_REFRESH_KEY);
  }
}

export function readExpiresAt(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(EXPIRES_AT_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function setLastActivity(ts: number | null) {
  if (typeof window === 'undefined') return;
  if (ts != null) {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(ts));
  } else {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
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
    // === Update #051 — bersihkan jejak idle-timeout juga. ===
    setLastRefresh(null);
    setLastActivity(null);
    useAuthStore.getState().markSessionExpired();
  });
}
