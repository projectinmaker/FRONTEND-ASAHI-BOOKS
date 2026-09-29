import { create } from 'zustand';
import { api } from '@/lib/api';
import type { MePermissionsResponse, RoleBrief } from '@/types/api';

/**
 * Access Store — permission efektif pengguna aktif (RBAC v2).
 *
 * Sumber: GET /auth/me/permissions.
 * Prinsip FAIL-CLOSED: bila gagal memuat → loaded=true + permissions kosong,
 * sehingga semua menu tergating tersembunyi sampai "Coba Lagi" berhasil.
 */

const TOKEN_KEY = 'asahi_erp_token';
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 menit

function hasAuthToken(): boolean {
  if (typeof window === 'undefined') return false;
  return !!window.localStorage.getItem(TOKEN_KEY);
}

interface AccessState {
  /** Kode permission efektif pengguna aktif (kosong saat belum termuat / error). */
  permissions: string[];
  isSuperAdmin: boolean;
  roles: RoleBrief[];
  /** true setelah fetch pertama selesai (sukses maupun gagal — fail-closed). */
  loaded: boolean;
  loading: boolean;
  error: string | null;
  fetchPermissions: () => Promise<void>;
  can: (code: string) => boolean;
  canAny: (codes: string[]) => boolean;
  reset: () => void;
}

export const useAccessStore = create<AccessState>((set, get) => ({
  permissions: [],
  isSuperAdmin: false,
  roles: [],
  loaded: false,
  loading: false,
  error: null,

  fetchPermissions: async () => {
    // Jangan fetch bila belum login (tidak ada token).
    if (!hasAuthToken()) {
      set({ permissions: [], isSuperAdmin: false, roles: [], loaded: false, loading: false, error: null });
      return;
    }
    if (get().loading) return; // cegah fetch paralel
    set({ loading: true, error: null });
    try {
      const res = await api.get<MePermissionsResponse>('/auth/me/permissions');
      set({
        permissions: res.permissions ?? [],
        isSuperAdmin: !!res.isSuperAdmin,
        roles: res.roles ?? [],
        loaded: true,
        loading: false,
        error: null
      });
    } catch {
      // FAIL-CLOSED: izin kosong + error terisi → UI menampilkan banner + tombol Coba Lagi.
      set({
        permissions: [],
        isSuperAdmin: false,
        roles: [],
        loaded: true,
        loading: false,
        error: 'Gagal memuat izin akses. Menu disembunyikan demi keamanan.'
      });
    }
  },

  can: (code) => {
    const { isSuperAdmin, permissions } = get();
    return isSuperAdmin || permissions.includes(code);
  },

  canAny: (codes) => {
    const { isSuperAdmin, permissions } = get();
    if (isSuperAdmin) return true;
    return codes.some((c) => permissions.includes(c));
  },

  reset: () => {
    set({ permissions: [], isSuperAdmin: false, roles: [], loaded: false, loading: false, error: null });
  }
}));

// ── Auto-refresh & lifecycle (client only) ─────────────────────────────────

if (typeof window !== 'undefined') {
  const maybeFetch = () => {
    // Hanya refresh bila masih ada token auth (masih login).
    if (!window.localStorage.getItem(TOKEN_KEY)) return;
    void useAccessStore.getState().fetchPermissions();
  };

  window.addEventListener('focus', maybeFetch);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') maybeFetch();
  });

  const intervalId = window.setInterval(maybeFetch, REFRESH_INTERVAL_MS);

  // Logout (dipatch auth-store logout manual & api.ts saat 401) → reset state.
  window.addEventListener('auth:logout', () => {
    useAccessStore.getState().reset();
  });

  // Bersihkan interval saat halaman ditutup / HMR.
  window.addEventListener('beforeunload', () => {
    window.clearInterval(intervalId);
  });
}
