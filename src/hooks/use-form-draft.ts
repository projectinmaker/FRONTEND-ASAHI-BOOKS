'use client';

/**
 * Draft otomatis untuk semua form ERP Asahi Books.
 *
 * Kebutuhan user: "setiap form harus ada draft otomatis — misal pindah ke
 * tab/modul lain, pas kembali lagi isian form-nya harus tetap ada."
 *
 * Implementasi: state form disimpan ke localStorage (debounced) dengan kunci
 * unik per (userId, modul, jenisForm, mode). Form di-mount ulang (pindah tab /
 * modul / refresh halaman) → draft dipulihkan otomatis. Draft dibuang setelah
 * submit sukses, atau lewat tombol "Buang Draft".
 *
 * Contoh pemakaian di form:
 *
 *   const userId = useAuthStore((s) => s.user?.id ?? 'anon');
 *   const draft = useFormDraft<PembayaranFormState>(draftKey(userId, 'kasbank', 'pembayaran', 'create'));
 *
 *   // restore saat mount (hanya mode create / form kosong):
 *   useEffect(() => {
 *     if (!editingId && draft.draft) setForm(draft.draft);
 *   }, []); // eslint-disable-line react-hooks/exhaustive-deps
 *
 *   // simpan tiap perubahan:
 *   useEffect(() => { if (!editingId) draft.saveDraft(form); }, [form]);
 *
 *   // setelah submit sukses:
 *   draft.clearDraft();
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const PREFIX = 'asahi-draft:';

interface StoredDraft<T> {
  at: string; // ISO timestamp saat terakhir disimpan
  data: T;
}

export interface FormDraftApi<T> {
  /** Draft yang tersimpan (null bila tidak ada). Terbaca sekali saat mount. */
  draft: T | null;
  /** true bila ada draft tersimpan. */
  hasDraft: boolean;
  /** ISO timestamp penyimpanan terakhir. */
  draftUpdatedAt: string | null;
  /** Label usia draft yang ramah user, mis. "2 mnt lalu". */
  draftAgeLabel: string | null;
  /** Simpan state form (debounced ~600ms). Aman dipanggil tiap render/change. */
  saveDraft: (data: T) => void;
  /** Buang draft (dipanggil setelah submit sukses / tombol Buang Draft). */
  clearDraft: () => void;
  /** Baca draft sekali lagi secara sinkron (untuk restore manual). */
  peekDraft: () => T | null;
}

/** Susun kunci draft yang unik per user + modul + form + mode. */
export function draftKey(userId: string, module: string, form: string, mode: 'create' | 'edit' = 'create'): string {
  return `${PREFIX}${userId}:${module}:${form}:${mode}`;
}

function readStored<T>(storageKey: string): StoredDraft<T> | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft<T>;
    if (!parsed || typeof parsed.at !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function ageLabel(iso: string): string | null {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  const mnt = Math.floor(ms / 60000);
  if (mnt < 1) return 'baru saja';
  if (mnt < 60) return `${mnt} mnt lalu`;
  const jam = Math.floor(mnt / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.floor(jam / 24);
  return `${hari} hari lalu`;
}

export function useFormDraft<T>(storageKey: string, opts?: { debounceMs?: number }): FormDraftApi<T> {
  const debounceMs = opts?.debounceMs ?? 600;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [state, setState] = useState<{ draft: T | null; at: string | null }>(() => {
    if (typeof window === 'undefined') return { draft: null, at: null };
    const stored = readStored<T>(storageKey);
    return stored ? { draft: stored.data, at: stored.at } : { draft: null, at: null };
  });

  // Debounce timer dibersihkan saat unmount.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const saveDraft = useCallback(
    (data: T) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        try {
          const at = new Date().toISOString();
          window.localStorage.setItem(storageKey, JSON.stringify({ at, data } satisfies StoredDraft<T>));
          setState({ draft: data, at });
        } catch {
          // localStorage penuh / tidak tersedia — draft opsional, jangan ganggu form.
        }
      }, debounceMs);
    },
    [storageKey, debounceMs]
  );

  const clearDraft = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* abaikan */
    }
    setState({ draft: null, at: null });
  }, [storageKey]);

  const peekDraft = useCallback(() => {
    const stored = readStored<T>(storageKey);
    return stored ? stored.data : null;
  }, [storageKey]);

  return {
    draft: state.draft,
    hasDraft: state.draft !== null,
    draftUpdatedAt: state.at,
    draftAgeLabel: state.at ? ageLabel(state.at) : null,
    saveDraft,
    clearDraft,
    peekDraft
  };
}
