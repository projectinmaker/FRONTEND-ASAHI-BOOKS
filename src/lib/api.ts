/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * ASAHI Books — API Client
 *
 * Konfigurasi base URL via environment variable NEXT_PUBLIC_API_URL.
 * Default: http://localhost:8000/api/v1
 *
 * Jika backend berjalan di dalam sandbox (mini-service),
 * gunakan format: /api/v1 (relative, dengan XTransformPort di setiap endpoint)
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

/**
 * Port backend untuk gateway sandbox (Caddy XTransformPort).
 * Di-set via NEXT_PUBLIC_API_PORT (mis. "8000") — hanya relevan bila API_BASE
 * berupa path relatif. Di environment lokal (API_BASE http://localhost:8000)
 * variabel ini dikosongkan sehingga URL tidak berubah.
 */
const API_GATEWAY_PORT = process.env.NEXT_PUBLIC_API_PORT || '';

/**
 * Bangun URL lengkap. Bila berjalan di balik gateway sandbox, setiap request
 * diberi query XTransformPort agar di-forward ke port backend yang benar.
 * Query param tambahan ini diabaikan oleh FastAPI, jadi aman untuk semua endpoint.
 */
function buildUrl(endpoint: string): string {
  let url = `${API_BASE}${endpoint}`;
  if (API_GATEWAY_PORT) {
    url += `${endpoint.includes('?') ? '&' : '?'}XTransformPort=${API_GATEWAY_PORT}`;
  }
  return url;
}

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('asahi_erp_token');
}

function setToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) {
    localStorage.setItem('asahi_erp_token', token);
  } else {
    localStorage.removeItem('asahi_erp_token');
  }
}

export { setToken };

// ── Update #055 — status koneksi ke server (dipakai ConnectionStatusBanner) ──
// Setiap request yang gagal karena JARINGAN (bukan HTTP error) memancarkan
// event 'asahi:net-down'; setiap request BERHASIL memancarkan 'asahi:net-up'.
// Banner koneksi (src/components/erp/connection-banner.tsx) mendengarkan
// event ini → muncul otomatis saat terputus, menutup sendiri saat pulih.
export const NET_DOWN_EVENT = 'asahi:net-down';
export const NET_UP_EVENT = 'asahi:net-up';

function notifyNetDown() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(NET_DOWN_EVENT));
}

function notifyNetUp() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(NET_UP_EVENT));
}

/**
 * Update #055 — pesan ramah saat koneksi ke backend terputus (status 0).
 * Dipakai semua jalur fetch di file ini supaya instruksinya konsisten:
 * data aman → periksa internet → coba lagi → muat ulang → hubungi admin.
 */
const NETWORK_ERROR_MESSAGE = 'Koneksi ke server terputus. Tenang — data yang sudah tersimpan aman. ' + 'Silakan periksa koneksi internet Anda, tunggu sebentar, lalu coba lagi. ' + 'Bila masih gagal, muat ulang halaman (tekan F5 / Ctrl+R). ' + 'Bila masalah berlanjut, hubungi administrator.';

/**
 * Update #055 — ping ringan GET /health (root backend, tanpa auth).
 * Dipakai tombol "Coba Lagi" pada banner koneksi. URL root diturunkan dari
 * API_BASE (dipangkas akhiran /api/v1) karena /health didaftarkan di root
 * aplikasi, bukan di bawah prefix /api/v1.
 */
export async function pingServer(): Promise<boolean> {
  try {
    const root = API_BASE.replace(/\/api\/v1\/?$/, '');
    let url = `${root}/health`;
    if (API_GATEWAY_PORT) url += `?XTransformPort=${API_GATEWAY_PORT}`;
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    // === Update #056 — ping sukses juga dihitung sebagai NET_UP. Ping ini
    // adalah jalur pemulihan paling awal (tombol "Coba Lagi" + auto-ping 30
    // detik pada banner koneksi), jadi listener NET_UP (mis. access-store
    // yang memuat ulang izin setelah koneksi pulih) ikut terpicu SEGERA —
    // tidak menunggu request data pertama yang sukses. ===
    if (res.ok) notifyNetUp();
    return res.ok;
  } catch {
    return false;
  }
}

// ── Error Message Mapper (Central) ─────────────────────────────────────
// Transform pesan error backend → pesan user-friendly Bahasa Indonesia
// Tambahkan mapping di sini untuk konsisten di semua modul

const ERROR_MESSAGES: Record<number, string> = {
  400: 'Permintaan tidak valid. Periksa kembali data yang dimasukkan.',
  401: 'Sesi telah berakhir. Silakan login kembali.',
  403: 'Anda tidak memiliki akses untuk melakukan aksi ini.',
  404: 'Data tidak ditemukan.',
  409: 'Data sudah ada atau terjadi konflik.',
  422: 'Data yang dikirim tidak valid. Periksa kembali isian form.',
  429: 'Terlalu banyak permintaan. Coba lagi sebentar.',
  500: 'Terjadi kesalahan di server. Coba lagi atau hubungi administrator.',
  502: 'Server tidak dapat dijangkau. Coba lagi sebentar.',
  503: 'Server sedang maintenance. Coba lagi nanti.'
};

function getErrorMessage(status: number, detail?: unknown): string {
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item.msg === 'string') return [Array.isArray(item.loc) ? item.loc.filter((part: unknown) => part !== 'body').join('.') : '', item.msg].filter(Boolean).join(': ');
        return '';
      })
      .filter(Boolean);
    if (messages.length) return messages.join('; ');
  }
  // Prioritas:
  // 1. Pesan spesifik dari backend (kalau ada dan informatif)
  // 2. Mapping status code di ERROR_MESSAGES
  // 3. Fallback ke statusText
  if (typeof detail === 'string' && detail.trim() && detail !== 'Internal Server Error') {
    return detail;
  }
  return ERROR_MESSAGES[status] || 'Terjadi kesalahan. Coba lagi.';
}

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>)
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Idempotency-Key wajib untuk POST create dokumen (tahap 2 backend)
  if (options.method === 'POST' && !headers['Idempotency-Key']) {
    headers['Idempotency-Key'] = crypto.randomUUID();
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(endpoint), {
      ...options,
      headers
    });
  } catch (err) {
    // Network error — backend tidak nyala, CORS issue, atau koneksi ditolak
    // Browser throw TypeError dengan message "Failed to fetch" (Chrome) atau
    // "NetworkError when attempting to fetch resource" (Firefox)
    // === Update #055 — pesan ramah + instruksi lengkap (data aman, periksa
    // internet, coba lagi, F5, hubungi admin) + panggil banner koneksi. ===
    notifyNetDown();
    throw new ApiError(
      0, // status 0 = network error (bukan HTTP status)
      NETWORK_ERROR_MESSAGE
    );
  }

  if (!res.ok) {
    if (res.status === 401) {
      // === Update #043 — token invalid/kadaluarsa: TIDAK lagi logout senyap.
      // Token + user dibersihkan lalu dispatch 'auth:expired' (listener
      // auth-store → markSessionExpired + bersihkan token/user; state tab
      // dibiarkan) — popup "Sesi Berakhir" ditangani page.tsx. ApiError 401
      // tetap dilempar ke pemanggil (pesan sesi tetap dipakai). ===
      setToken(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('asahi_erp_user');
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }
    }
    const errorBody = await res.json().catch(() => ({ detail: res.statusText }));
    const backendDetail = errorBody.detail || errorBody.message;
    throw new ApiError(res.status, getErrorMessage(res.status, backendDetail));
  }

  // === Update #055 — request sukses → server terjangkau → tutup banner
  // koneksi bila sedang tampil (event dipancarkan di setiap request sukses;
  // banner hanya bereaksi bila memang sedang offline). ===
  notifyNetUp();

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Convenience wrappers ──────────────────────────────────────────────

export const api = {
  get: <T>(endpoint: string) => apiRequest<T>(endpoint, { method: 'GET' }),

  post: <T>(endpoint: string, body?: any) =>
    apiRequest<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined
    }),

  put: <T>(endpoint: string, body?: any) =>
    apiRequest<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined
    }),

  delete: <T>(endpoint: string) => apiRequest<T>(endpoint, { method: 'DELETE' })
};

// ── Pagination response wrapper ───────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  skip: number;
  limit: number;
}

// ── File download & multipart upload (Export/Import Excel) ────────────

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = { ...extra };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function throwApiError(res: Response): Promise<never> {
  if (res.status === 401) {
    // === Update #043 — mirror apiRequest 401: 'auth:expired' (popup sesi
    // berakhir; bukan logout senyap). ===
    setToken(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('asahi_erp_user');
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
  }
  const errorBody = await res.json().catch(() => ({ detail: res.statusText }));
  const backendDetail = errorBody.detail || errorBody.message;
  throw new ApiError(res.status, getErrorMessage(res.status, backendDetail));
}

/**
 * Unduh file biner (Export Excel) — GET dengan Bearer, simpan via anchor
 * .download; nama file diambil dari Content-Disposition bila tersedia.
 */
export async function downloadFile(endpoint: string, fallbackName: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(buildUrl(endpoint), { headers: authHeaders() });
  } catch {
    // === Update #055 — pesan ramah + banner koneksi (mirror apiRequest). ===
    notifyNetDown();
    throw new ApiError(0, NETWORK_ERROR_MESSAGE);
  }
  if (!res.ok) await throwApiError(res);
  notifyNetUp();
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = match?.[1]?.trim() || fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return filename;
}

/**
 * Upload multipart (Import Excel) — POST FormData; Content-Type diatur
 * browser (boundary), Idempotency-Key dibuat per permintaan.
 */
export async function postForm<T>(endpoint: string, form: FormData): Promise<T> {
  const headers = authHeaders();
  headers['Idempotency-Key'] = crypto.randomUUID();
  let res: Response;
  try {
    res = await fetch(buildUrl(endpoint), { method: 'POST', headers, body: form });
  } catch {
    // === Update #055 — pesan ramah + banner koneksi (mirror apiRequest). ===
    notifyNetDown();
    throw new ApiError(0, NETWORK_ERROR_MESSAGE);
  }
  if (!res.ok) await throwApiError(res);
  notifyNetUp();
  if (res.status === 204) return undefined as T;
  return res.json();
}
