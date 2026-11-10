// ═════════════════════════════════════════════════════════════════════════════
// === Update #049 — NAVIGASI OTOMATIS KE FIELD WAJIB YANG TERLEWAT ===
//
// Saat user klik "Simpan" padahal ada field wajib (tanda *) yang belum diisi,
// form kini otomatis menggulir (scroll) dan memfokuskan field pertama yang
// terlewat — bukan hanya menampilkan teks error merah yang kadang berada di
// luar layar.
//
// Cara pakai (di dalam komponen form):
//   1. Bungkus isi form dengan <div ref={formRef}> (scope pencarian supaya
//      tidak salah sasaran saat beberapa tab form terbuka bersamaan).
//   2. Beri id pada wrapper div field wajib:  id="field-<key>"
//      (mis. id="field-supplierId", id="field-tanggal", id="field-detail").
//   3. Saat validasi gagal:
//        focusFormError(Object.keys(errs), { root: formRef.current });
// ═════════════════════════════════════════════════════════════════════════════

export interface FocusFormErrorOptions {
  /** Elemen pembatas pencarian (form sendiri). Default: seluruh document. */
  root?: HTMLElement | null;
  /** Prefix id anchor. Default "field-" (id="field-<key>"). */
  prefix?: string;
}

/**
 * Scroll + fokus ke field wajib pertama (urutan keys) yang ditemukan.
 * Mengembalikan true bila ada field yang berhasil dituju.
 */
export function focusFormError(keys: string | string[], opts?: FocusFormErrorOptions): boolean {
  if (typeof document === 'undefined') return false;
  const list = Array.isArray(keys) ? keys : [keys];
  if (!list.length) return false;
  const prefix = opts?.prefix ?? 'field-';
  const scope: ParentNode = opts?.root ?? document;
  for (const key of list) {
    if (!key) continue;
    const anchor = scope.querySelector(`#${prefix}${key}`) as HTMLElement | null;
    if (!anchor) continue;
    anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Fokus diberi jeda supaya scroll selesai dulu (fokus ikut menggulir
    // bila bareng — preventScroll menjaga posisi hasil scroll).
    window.setTimeout(() => {
      const focusable = anchor.querySelector<HTMLElement>('input:not([type="hidden"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])');
      focusable?.focus({ preventScroll: true });
    }, 380);
    return true;
  }
  return false;
}
