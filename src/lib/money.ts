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

// ─── Format Nominal (Display) ────────────────────────────────────────────────
// Standard format harga aplikasi: 20.000.000 — ribuan dipisah titik (id-ID),
// desimal (maks 2 digit) dipakai hanya bila ada, dipisah koma.

/** Format angka harga/nominal → "20.000.000" atau "20.000.000,5". */
export function formatNumberIDR(val: string | number | null | undefined, opts?: { maxFractionDigits?: number }): string {
  const n = typeof val === 'number' ? val : parseFloat(String(val ?? ''));
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('id-ID', {
    maximumFractionDigits: opts?.maxFractionDigits ?? 2
  });
}

/** Format nominal dengan prefix "Rp " → "Rp 20.000.000". */
export function formatRp(val: string | number | null | undefined): string {
  return 'Rp ' + formatNumberIDR(val);
}

// ─── Format Nominal (Input) ──────────────────────────────────────────────────
// Input harga menampilkan pemisah ribuan titik secara live saat mengetik.
// State form menyimpan CANONICAL string ("20000000" / "20000000.5" / "")
// sehingga logika submit (Number(...)) tidak perlu berubah.

/**
 * Ubah canonical → tampilan berformat.
 * "20000000" → "20.000.000"; "20000000.5" (allowDecimal) → "20.000.000,5".
 */
export function formatInputNumber(canonical: string, allowDecimal = false): string {
  const s = String(canonical ?? '').trim();
  if (s === '' || s === '.') return '';
  const [intPart, fracRaw] = s.split('.');
  const int = Number(intPart || '0');
  if (!Number.isFinite(int)) return '';
  const intFormatted = int.toLocaleString('id-ID');
  if (!allowDecimal) return intFormatted;
  // fracRaw undefined → canonical tidak punya bagian desimal ("20000000") → integer.
  if (fracRaw === undefined) return intFormatted;
  // fracRaw kosong → user baru mengetik separator desimal ("20.") → tampilkan koma.
  if (fracRaw === '') return `${intFormatted},`;
  // Fraksi hanya nol (".00" — mis. hasil Decimal backend) → tampilkan sebagai integer.
  const frac = fracRaw.slice(0, 2).replace(/0+$/, '');
  return frac ? `${intFormatted},${frac}` : intFormatted;
}

/**
 * Ubah teks input (boleh berisi titik/koma/formatan) → canonical.
 * "20.000.000" → "20000000"; "20.000.000,5" / "20000000.5" → "20000000.5".
 * Grup ribuan selalu 3 digit, sehingga separator terakhir yang diikuti
 * 1–2 digit dianggap desimal (deterministik).
 */
export function parseFormattedNumber(text: string, allowDecimal = false): string {
  const raw = String(text ?? '').trim();
  if (raw === '') return '';
  if (allowDecimal) {
    const m = raw.match(/[.,](\d{1,2})$/);
    if (m) {
      const intDigits = raw.slice(0, raw.length - m[0].length).replace(/[^\d]/g, '');
      const frac = m[1];
      return `${intDigits || '0'}.${frac}`;
    }
    return raw.replace(/[^\d]/g, '');
  }
  return raw.replace(/[^\d]/g, '');
}

/** Parse canonical string → number (aman untuk submit). "" → 0. */
export function parseInputValue(canonical: string | null | undefined): number {
  const n = parseFloat(String(canonical ?? ''));
  return Number.isFinite(n) ? n : 0;
}
