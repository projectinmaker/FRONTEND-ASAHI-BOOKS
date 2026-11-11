import { create } from 'zustand';
import { api, ApiError, NET_DOWN_EVENT, NET_UP_EVENT } from '@/lib/api';
import type { MePermissionsResponse, RoleBrief } from '@/types/api';

/**
 * Access Store — permission efektif pengguna aktif (RBAC v2).
 *
 * Sumber: GET /auth/me/permissions.
 * Prinsip FAIL-CLOSED: bila gagal memuat → loaded=true + permissions kosong,
 * sehingga semua menu tergating tersembunyi sampai "Coba Lagi" berhasil.
 *
 * === Update #056 — pengecualian untuk KONEKSI TERPUTUS (ApiError status 0) ===
 * Kegagalan jaringan BUKAN masalah izin: izin terakhir yang berhasil dimuat
 * DIKONSUMSI APA ADANYA (menu tetap tampil, tidak ada pesan menakutkan di
 * sidebar). Penjelasan bagi user cukup satu sumber: banner global "Koneksi
 * ke server terputus" (ConnectionStatusBanner, #055). Fail-closed tetap
 * berlaku untuk error non-jaringan (server menjawab tapi endpoint izin gagal).
 * Keamanan tetap terjaga: backend memvalidasi permission pada SETIAP request,
 * sehingga menu yang tetap tampil hanyalah pintasan navigasi — aksi tanpa
 * izin tetap ditolak server dengan 403.
 *
 * === Update #058 — skeleton sidebar selama koneksi terputus ===
 * Saat terputus, sidebar TIDAK lagi menampilkan menu lama: state `reconnecting`
 * (true sejak event NET_DOWN / kegagalan jaringan, kembali false hanya setelah
 * izin BERHASIL dimuat ulang) membuat sidebar terus menampilkan efek loading
 * skeleton — sinyal bahwa aplikasi sedang otomatis mencoba menyambung kembali
 * (banner koneksi #055 + auto-ping 30 detik). Izin terakhir tetap di cache,
 * sehingga begitu koneksi pulih menu langsung muncul utuh tanpa aksi user.
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
  /**
   * === Update #058 — true sejak koneksi terputus (event NET_DOWN atau
   * ApiError status 0) sampai izin BERHASIL dimuat ulang. Selama true,
   * sidebar menampilkan skeleton "Menyambungkan kembali…" (bukan menu lama).
   */
  reconnecting: boolean;
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
  reconnecting: false,

  fetchPermissions: async () => {
    // Jangan fetch bila belum login (tidak ada token).
    if (!hasAuthToken()) {
      set({ permissions: [], isSuperAdmin: false, roles: [], loaded: false, loading: false, error: null, reconnecting: false });
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
        error: null,
        // === Update #058 — izin berhasil dimuat (ulang) → koneksi pasti hidup
        // → skeleton "Menyambungkan kembali…" diganti menu. ===
        reconnecting: false
      });
    } catch (err) {
      // === Update #056 — koneksi terputus (status 0): JANGAN wipe izin &
      // JANGAN set error; banner global koneksi (#055) sudah menjelaskan apa
      // yang terjadi + instruksi ke user. loaded dibiarkan apa adanya.
      // === Update #058 — selama offline, sidebar menampilkan skeleton
      // "Menyambungkan kembali…" (reconnecting: true), BUKAN menu lama;
      // izin terakhir tetap di cache supaya pemulihan instan.
      // Pemulihan: listener NET_UP di bawah otomatis memuat ulang izin begitu
      // koneksi kembali (plus focus / visibilitychange / interval 5 menit);
      // sukses → reconnecting kembali false → menu muncul lagi sendiri. ===
      if (err instanceof ApiError && err.status === 0) {
        set({ loading: false, reconnecting: true });
        return;
      }
      // FAIL-CLOSED (error non-jaringan: server menjawab tapi endpoint izin
      // gagal — 500/403 dll): izin kosong + error terisi → UI menampilkan
      // banner + tombol Coba Lagi.
      set({
        permissions: [],
        isSuperAdmin: false,
        roles: [],
        loaded: true,
        loading: false,
        error: 'Gagal memuat izin akses. Menu disembunyikan demi keamanan.',
        // === Update #058 — error non-jaringan: keadaan fail-closed (banner
        // amber + tombol Coba Lagi) yang berlaku, bukan skeleton reconnect. ===
        reconnecting: false
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
    set({ permissions: [], isSuperAdmin: false, roles: [], loaded: false, loading: false, error: null, reconnecting: false });
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

  // === Update #056 — koneksi pulih → muat ulang izin OTOMATIS. ===
  // NET_UP dipicu api.ts pada SETIAP request sukses, jadi refetch hanya
  // dilakukan bila sebelumnya benar-benar ada kegagalan jaringan (transisi
  // down → up), bukan setiap request. Dengan begitu menu yang selama offline
  // tampil memakai izin lama langsung disegarkan begitu server kembali
  // — tanpa user perlu tekan apa pun / refresh halaman.
  let netWasDown = false;
  window.addEventListener(NET_DOWN_EVENT, () => {
    netWasDown = true;
    // === Update #058 — begitu ADA request gagal karena jaringan, sidebar
    // langsung beralih ke skeleton "Menyambungkan kembali…" — tanpa menunggu
    // percobaan muat ulang izin berikutnya (focus / interval / NET_UP).
    // Selama offline flag ini tetap true; setiap kegagalan jaringan baru
    // hanya memastikan flag tetap menyala. ===
    useAccessStore.setState({ reconnecting: true });
  });
  window.addEventListener(NET_UP_EVENT, () => {
    if (!netWasDown) return;
    netWasDown = false;
    maybeFetch();
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
