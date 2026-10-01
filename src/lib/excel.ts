/**
 * ASAHI Books — Util Import & Export Excel (Update #5)
 *
 * - downloadExcelFile: GET endpoint export backend (dengan Bearer token)
 *   → blob → anchor download. Filename diambil dari Content-Disposition
 *   backend, fallback ke parameter.
 * - uploadExcelFile: POST multipart/form-data (field "file") → ImportResult.
 *
 * URL building & token mengikuti konvensi src/lib/api.ts (gateway
 * XTransformPort + localStorage asahi_erp_token).
 */

import type { ImportResult } from '@/types/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
const API_GATEWAY_PORT = process.env.NEXT_PUBLIC_API_PORT || '';

function buildExcelUrl(endpoint: string): string {
  let url = `${API_BASE}${endpoint}`;
  if (API_GATEWAY_PORT) {
    url += `${endpoint.includes('?') ? '&' : '?'}XTransformPort=${API_GATEWAY_PORT}`;
  }
  return url;
}

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('asahi_erp_token');
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const detail = body?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (Array.isArray(detail) && detail.length) {
      const first = detail[0];
      if (first && typeof first.msg === 'string') return first.msg;
    }
  } catch {
    // body bukan JSON — abaikan
  }
  return `Gagal memproses file (HTTP ${res.status}).`;
}

/**
 * Download file Excel dari endpoint export backend.
 * @param endpoint  path relatif API, mis. '/master/barang/export?search=abc'
 * @param fallbackFilename  nama file bila backend tidak menyertakan
 *                          Content-Disposition
 */
export async function downloadExcelFile(endpoint: string, fallbackFilename: string): Promise<void> {
  const headers: Record<string, string> = {};
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(buildExcelUrl(endpoint), { headers });
  } catch {
    throw new Error('Tidak terhubung ke server');
  }

  if (!res.ok) throw new Error(await parseErrorMessage(res));

  const blob = await res.blob();

  // Ambil filename dari header kalau ada
  const cd = res.headers.get('Content-Disposition') || '';
  const match = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  const filename = match?.[1]?.trim() || fallbackFilename;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Upload file Excel ke endpoint import backend (multipart, field "file").
 * Mengembalikan ringkasan hasil import per baris.
 */
export async function uploadExcelFile(endpoint: string, file: File): Promise<ImportResult> {
  const headers: Record<string, string> = {};
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // Content-Type TIDAK diset — browser yang menetapkan multipart boundary.

  const form = new FormData();
  form.append('file', file);

  let res: Response;
  try {
    res = await fetch(buildExcelUrl(endpoint), { method: 'POST', headers, body: form });
  } catch {
    throw new Error('Tidak terhubung ke server');
  }

  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return (await res.json()) as ImportResult;
}
