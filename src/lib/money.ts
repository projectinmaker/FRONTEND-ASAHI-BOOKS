/**
 * JRN-002 — paritas pembulatan nominal dengan backend.
 *
 * Backend (app/services/posting_service.py → validate_entries) membulatkan
 * tiap nominal ke 2 desimal dengan ROUND_HALF_UP via Decimal(str(value))
 * SEBELUM dijumlahkan, lalu membandingkan total hasil pembulatan.
 *
 * Float JavaScript tidak bisa mereplikasi HALF_UP secara tepat
 * (mis. (1.005).toFixed(2) === "1.00" karena 1.005 biner < 1.005 desimal),
 * maka helper ini mengoperasikan representasi STRING desial — sama seperti
 * Decimal(str(v)) di Python — dan menghasilkan integer SEN agar penjumlahan
 * multi-baris bebas galat floating point.
 */

/** Normalisasi input apa pun ke string desimal biasa (tanpa notasi eksponen). */
function toPlainDecimal(input: string | number): string {
  const raw = String(input ?? '').trim();
  if (raw === '' || raw === '+' || raw === '-') return '0';
  // Sudah desimal biasa? (tanda opsional, digit, titik, digit)
  if (/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(raw)) return raw;
  // Fallback untuk notasi eksponen ("1e-3") dsb. — parseFloat lalu repr terpendek.
  const n = Number(raw);
  return Number.isFinite(n) ? String(n) : '0';
}

/**
 * Bulatkan nominal ke satuan sen (2 desimal) dengan HALF_UP.
 * Selalu mengembalikan integer — aman untuk dijumlahkan tanpa galat float.
 * Contoh: "100.004" → 10000, "100.005" → 10001, "0.005" → 1, "-0.005" → -1.
 */
export function toCentsHalfUp(input: string | number): number {
  const s = toPlainDecimal(input);
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const [intPart, fracPart = ''] = body.split('.');
  // Dua digit fraksi pertama = sen; digit ke-3 menentukan arah pembulatan.
  const frac2 = (fracPart + '00').slice(0, 2);
  const firstDiscarded = fracPart.length > 2 ? fracPart[2] : '0';
  let cents = Number(`${intPart || '0'}${frac2}`);
  if (firstDiscarded >= '5') cents += 1; // HALF_UP: sisa ≥ setengah unit → naik
  return neg ? -cents : cents;
}

/**
 * True bila nominal punya lebih dari 2 desimal — nilainya akan dibulatkan
 * oleh backend (respons memakai nilai hasil normalisasi). Dipakai untuk
 * menampilkan penanda "(dibulatkan)" pada pratinjau baris.
 */
export function hasSubCentPrecision(input: string | number): boolean {
  const s = toPlainDecimal(input);
  const frac = s.split('.')[1] ?? '';
  return frac.length > 2;
}
