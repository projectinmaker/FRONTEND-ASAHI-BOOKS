'use client';

// === Update ASAHI #019 — Preferensi Store ===
//
// Konfigurasi aplikasi terpusat dari backend (GET /master/preferensi):
// konfirmasi keluar, format tanggal, font aplikasi, dst. Registry sumber
// kebenaran ada di app/services/preferensi_service.py (backend); store ini
// hanya MELATAKAN item preferensi menjadi map key → value agar mudah dibaca
// komponen mana pun (sidebar, pdf-utils, dsb.) tanpa memetakan grup.
//
// Prinsip (pola sama dengan company-store):
// - Fetch sekali per sesi (ensureLoaded); fail-open ke default lama bila
//   endpoint gagal (aplikasi tetap jalan dengan perilaku hardcoded lama).
// - FONT_APLIKASI diterapkan ke document.body.style.fontFamily saat termuat
//   dan setelah simpan ('DEFAULT' menghapus inline style → font CSS default).

import { create } from 'zustand';
import { api } from '@/lib/api';
import type { PreferensiResponse } from '@/types/api';

export type PrefValue = string | number | boolean;

// ── Font stack per pilihan FONT_APLIKASI (Preferensi → Font) ─────────────────
// Map kode preferensi → CSS font-family. 'DEFAULT' = hapus inline style.
export const FONT_STACKS: Record<string, string> = {
  INTER: 'Inter, ui-sans-serif, system-ui, sans-serif',
  ARIAL: 'Arial, Helvetica, sans-serif',
  HELVETICA: 'Helvetica, Arial, sans-serif',
  TIMES_NEW_ROMAN: '"Times New Roman", Times, serif',
  GEORGIA: 'Georgia, serif',
  VERDANA: 'Verdana, Geneva, sans-serif',
  TAHOMA: 'Tahoma, Verdana, sans-serif',
  TREBUCHET_MS: '"Trebuchet MS", Tahoma, sans-serif',
  COURIER_NEW: '"Courier New", Courier, monospace'
};

/** Terapkan font ke <body> (inline style). 'DEFAULT'/kode tak dikenal → hapus. */
export function applyFont(font: string | undefined | null): void {
  if (typeof document === 'undefined') return;
  const stack = font ? FONT_STACKS[String(font).toUpperCase()] : undefined;
  if (stack) {
    document.body.style.fontFamily = stack;
  } else {
    // DEFAULT → kembali ke font aplikasi dari CSS (tanpa inline style).
    document.body.style.fontFamily = '';
  }
}

/** Flatten response GET /master/preferensi → Record<key, value>. */
function flatten(res: PreferensiResponse): Record<string, PrefValue> {
  const out: Record<string, PrefValue> = {};
  for (const group of res.groups ?? []) {
    for (const item of group.items ?? []) {
      out[item.key] = item.value;
    }
  }
  return out;
}

interface PreferensiState {
  /** Preferensi ter-flatten: key → nilai saat ini (mis. 'FORMAT_TANGGAL'). */
  prefs: Record<string, PrefValue>;
  loaded: boolean;
  loading: boolean;
  /** Muat preferensi (sekali; force=true untuk refresh setelah simpan). */
  fetch: (force?: boolean) => Promise<void>;
  /** Pastikan sudah termuat — dipanggil dari mount sidebar/HomePage. */
  ensureLoaded: () => void;
  /** Baca nilai preferensi dengan fallback bila belum termuat / key tak ada. */
  getValue: (key: string, fallback?: PrefValue) => PrefValue | undefined;
  /** Reset saat logout (juga hapus inline font di <body>). */
  reset: () => void;
}

export const usePreferensiStore = create<PreferensiState>((set, get) => ({
  prefs: {},
  loaded: false,
  loading: false,

  fetch: async (force = false) => {
    if (get().loading) return;
    if (get().loaded && !force) return;
    set({ loading: true });
    try {
      const res = await api.get<PreferensiResponse>('/master/preferensi');
      const prefs = flatten(res);
      set({ prefs, loaded: true, loading: false });
      // Terapkan font aplikasi begitu preferensi termuat.
      applyFont(prefs['FONT_APLIKASI'] as string | undefined);
    } catch {
      // Fail-open: tandai loaded agar tidak retry terus; komponen memakai
      // perilaku default lama (format tanggal id-ID, font default, dst.).
      set({ prefs: {}, loaded: true, loading: false });
    }
  },

  ensureLoaded: () => {
    if (!get().loaded && !get().loading) {
      void get().fetch();
    }
  },

  getValue: (key, fallback) => {
    const val = get().prefs[key];
    return val !== undefined ? val : fallback;
  },

  reset: () => {
    set({ prefs: {}, loaded: false, loading: false });
    // Hapus inline font agar sesi/login berikutnya mulai dari font default.
    applyFont(undefined);
  }
}));

// ── Selector ringkas (derived) ───────────────────────────────────────────────

/** Format tanggal preferensi (FORMAT_TANGGAL) — '' bila belum termuat. */
export function usePreferensiDateFormat(): string {
  const v = usePreferensiStore((s) => s.prefs['FORMAT_TANGGAL']);
  return typeof v === 'string' ? v : '';
}

/** Font aplikasi preferensi (FONT_APLIKASI) — 'DEFAULT' bila belum termuat. */
export function usePreferensiFont(): string {
  const v = usePreferensiStore((s) => s.prefs['FONT_APLIKASI']);
  return typeof v === 'string' && v ? v : 'DEFAULT';
}
