/**
 * === Update #043 — auto-singkatan nama perusahaan (Pelanggan & Supplier) ===
 * Aturan SAMA dengan backend #043 (segmen nomor dokumen):
 *  1. uppercase, token = split whitespace / titik / koma.
 *  2. buang token generik: PT, CV, UD, PMA, PMDN, TBK, PJ, PK, CP, FA, CO,
 *     LTD, INC, PERUSAHAAN, KOPERASI, &, AND, DAN.
 *  3. inisial tiap token sisanya digabung —
 *     "PT. TOYOTA BOSHOKU INDONESIA" → "TBI"; "PT TOYOTA BOSHOKU" → "TB".
 *  4. hanya 1 token non-generik → 3 karakter pertama token.
 *  5. kosong → 3 karakter pertama nama bersih.
 *  6. maksimal 20 karakter.
 */
const GENERIC_TOKENS = new Set(['PT', 'CV', 'UD', 'PMA', 'PMDN', 'TBK', 'PJ', 'PK', 'CP', 'FA', 'CO', 'LTD', 'INC', 'PERUSAHAAN', 'KOPERASI', '&', 'AND', 'DAN']);

export function deriveSingkatan(nama: string): string {
  const clean = (nama || '').toUpperCase().trim();
  if (!clean) return '';
  const tokens = clean.split(/[\s.,]+/).filter(Boolean);
  const meaningful = tokens.filter((t) => !GENERIC_TOKENS.has(t));
  let result: string;
  if (meaningful.length === 0) {
    // Seluruh token generik → 3 karakter pertama nama bersih (tanpa spasi).
    result = clean.replace(/\s+/g, '').slice(0, 3);
  } else if (meaningful.length === 1) {
    result = meaningful[0].slice(0, 3);
  } else {
    result = meaningful.map((t) => t.charAt(0)).join('');
  }
  return result.slice(0, 20);
}
