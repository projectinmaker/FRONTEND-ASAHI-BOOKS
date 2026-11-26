// ─────────────────────────────────────────────────────────────────────────────
// Klasifikasi kategori COA untuk fitur Saldo Awal (modul Akun Perkiraan).
//
// Sesuai catatan update:
// - Input saldo awal cukup SATU nilai + tanggal; sisi debit/kredit otomatis
//   mengikuti saldo normal akun.
// - === Update #075 — saldo awal untuk SEMUA akun perkiraan, sama seperti
//   yang sudah diterapkan untuk Kas & Bank. === Piutang Usaha, Piutang
//   Lain-lain, Persediaan, Aset Tetap, Hutang Usaha, dan Kewajiban Jangka
//   Panjang kini didukung, ditambah 9 kategori lama. Pengecualian yang
//   tetap (dikelola sistem): Modal Saldo Laba, akun Clearing, penampung
//   selisih saldo awal, dan HPP legacy. Control account & sub-akun
//   subledger mitra ditolak di layer validasi (bukan kategori).
//
// Mirror dari backend: app/services/coa_category.py — jaga keduanya sinkron.
// ─────────────────────────────────────────────────────────────────────────────

export const OPENING_BALANCE_DIFF_SYSTEM_TYPE = 'OPENING_BALANCE_DIFF';

export type CoaCategoryKey = 'KAS_DAN_BANK' | 'PIUTANG_USAHA' | 'PIUTANG_LAIN_LAIN' | 'PERSEDIAAN' | 'ASET_LANCAR_LAINNYA' | 'ASET_TETAP' | 'HUTANG_USAHA' | 'KEWAJIBAN_LAINNYA' | 'KEWAJIBAN_JANGKA_PANJANG' | 'MODAL' | 'MODAL_SISTEM' | 'PENDAPATAN' | 'PENDAPATAN_LAINNYA' | 'HPP' | 'HPP_LEGACY' | 'BEBAN' | 'BEBAN_LAINNYA' | 'CLEARING' | 'PENAMPUNG_SELISIH';

export interface CoaCategoryInfo {
  key: CoaCategoryKey;
  label: string;
  /** Pemetaan saldo normal per kategori (Kas dan Bank/HPP/Beban/Beban
   *  Lainnya/Aset = DEBIT; Kewajiban/Modal/Pendapatan = KREDIT). */
  saldoNormal: 'DEBIT' | 'KREDIT';
  /** Update #075 — true untuk semua kategori bisnis (semua akun
   *  perkiraan, sama seperti Kas & Bank); false hanya untuk kategori
   *  yang dikelola sistem. */
  saldoAwalEligible: boolean;
  /** Petunjuk bila tidak didukung (kategori yang dikelola sistem). */
  hint?: string;
}

const CATEGORY_INFO: Record<CoaCategoryKey, CoaCategoryInfo> = {
  KAS_DAN_BANK: { key: 'KAS_DAN_BANK', label: 'Kas dan Bank', saldoNormal: 'DEBIT', saldoAwalEligible: true },
  PIUTANG_USAHA: {
    key: 'PIUTANG_USAHA',
    label: 'Piutang Usaha',
    saldoNormal: 'DEBIT',
    // Update #075 — didukung saldo awal langsung (semua akun perkiraan,
    // sama seperti Kas & Bank). Piutang per pelanggan sebaiknya tetap
    // diinput dari halaman Pelanggan agar subledger rapi; akar AR control
    // account tetap ditolak layer validasi.
    saldoAwalEligible: true
  },
  PIUTANG_LAIN_LAIN: {
    key: 'PIUTANG_LAIN_LAIN',
    label: 'Piutang Lain-lain',
    saldoNormal: 'DEBIT',
    // Update #075 — didukung saldo awal langsung.
    saldoAwalEligible: true
  },
  PERSEDIAAN: {
    key: 'PERSEDIAAN',
    label: 'Persediaan',
    saldoNormal: 'DEBIT',
    // Update #075 — didukung saldo awal langsung. Stok awal per barang
    // tetap lebih disarankan (kartu stok ikut terbentuk); akar INVENTORY
    // control account tetap ditolak layer validasi.
    saldoAwalEligible: true
  },
  ASET_LANCAR_LAINNYA: { key: 'ASET_LANCAR_LAINNYA', label: 'Aset Lancar Lainnya', saldoNormal: 'DEBIT', saldoAwalEligible: true },
  ASET_TETAP: {
    key: 'ASET_TETAP',
    label: 'Aset Tetap',
    saldoNormal: 'DEBIT',
    // Update #075 — didukung saldo awal langsung. Aset per unit tetap
    // lebih disarankan lewat modul Aset Tetap (penyusutan otomatis +
    // register aset).
    saldoAwalEligible: true
  },
  HUTANG_USAHA: {
    key: 'HUTANG_USAHA',
    label: 'Hutang Usaha',
    saldoNormal: 'KREDIT',
    // Update #075 — didukung saldo awal langsung. Hutang per supplier
    // sebaiknya tetap diinput dari halaman Supplier agar subledger rapi;
    // akar AP control account tetap ditolak layer validasi.
    saldoAwalEligible: true
  },
  KEWAJIBAN_LAINNYA: { key: 'KEWAJIBAN_LAINNYA', label: 'Kewajiban Lainnya', saldoNormal: 'KREDIT', saldoAwalEligible: true },
  KEWAJIBAN_JANGKA_PANJANG: {
    key: 'KEWAJIBAN_JANGKA_PANJANG',
    label: 'Kewajiban Jangka Panjang',
    saldoNormal: 'KREDIT',
    // Update #075 — didukung saldo awal langsung.
    saldoAwalEligible: true
  },
  MODAL: { key: 'MODAL', label: 'Modal', saldoNormal: 'KREDIT', saldoAwalEligible: true },
  MODAL_SISTEM: {
    key: 'MODAL_SISTEM',
    label: 'Modal (Saldo Laba)',
    saldoNormal: 'KREDIT',
    saldoAwalEligible: false,
    hint: 'Nilai laba ditahan / laba tahun berjalan dihitung otomatis oleh sistem.'
  },
  PENDAPATAN: { key: 'PENDAPATAN', label: 'Pendapatan', saldoNormal: 'KREDIT', saldoAwalEligible: true },
  PENDAPATAN_LAINNYA: { key: 'PENDAPATAN_LAINNYA', label: 'Pendapatan Lainnya', saldoNormal: 'KREDIT', saldoAwalEligible: true },
  HPP: { key: 'HPP', label: 'HPP', saldoNormal: 'DEBIT', saldoAwalEligible: true },
  HPP_LEGACY: {
    key: 'HPP_LEGACY',
    label: 'HPP (Legacy)',
    saldoNormal: 'DEBIT',
    saldoAwalEligible: false,
    hint: 'Akun legacy terkunci dan tidak bisa dipakai transaksi baru.'
  },
  BEBAN: { key: 'BEBAN', label: 'Beban', saldoNormal: 'DEBIT', saldoAwalEligible: true },
  BEBAN_LAINNYA: { key: 'BEBAN_LAINNYA', label: 'Beban Lainnya', saldoNormal: 'DEBIT', saldoAwalEligible: true },
  CLEARING: {
    key: 'CLEARING',
    label: 'Akun Clearing',
    saldoNormal: 'DEBIT',
    saldoAwalEligible: false,
    hint: 'Akun clearing harus selalu nol — tidak didukung saldo awal.'
  },
  PENAMPUNG_SELISIH: {
    key: 'PENAMPUNG_SELISIH',
    label: 'Penampung Selisih Saldo Awal',
    saldoNormal: 'KREDIT',
    saldoAwalEligible: false,
    hint: 'Akun penampung selisih saldo awal — dikelola otomatis oleh sistem.'
  }
};

const PREFIX3_MAP: Record<string, CoaCategoryKey> = {
  '111': 'KAS_DAN_BANK',
  '112': 'PIUTANG_USAHA',
  '113': 'PIUTANG_LAIN_LAIN',
  '114': 'PERSEDIAAN',
  '115': 'ASET_LANCAR_LAINNYA',
  '116': 'ASET_LANCAR_LAINNYA',
  '117': 'ASET_LANCAR_LAINNYA',
  '121': 'ASET_TETAP',
  '122': 'ASET_TETAP',
  '211': 'HUTANG_USAHA'
};

const PREFIX2_MAP: Record<string, CoaCategoryKey> = {
  '11': 'ASET_LANCAR_LAINNYA',
  '12': 'ASET_TETAP',
  '21': 'KEWAJIBAN_LAINNYA',
  '22': 'KEWAJIBAN_JANGKA_PANJANG',
  '31': 'MODAL',
  '32': 'MODAL_SISTEM',
  '33': 'MODAL',
  '41': 'PENDAPATAN',
  '42': 'PENDAPATAN_LAINNYA',
  '51': 'HPP_LEGACY',
  '52': 'HPP',
  '53': 'HPP',
  '61': 'BEBAN',
  '62': 'BEBAN',
  '63': 'BEBAN_LAINNYA',
  '71': 'BEBAN_LAINNYA'
};

const INVENTORY_SUBCLASSES = ['INVENTORY_RAW', 'INVENTORY_AUX', 'INVENTORY_WIP', 'INVENTORY_FINISHED'];

export interface CoaCategoryInput {
  /** typeCode template tipe akun (mode create) — sinyal klasifikasi utama
   *  karena akun belum tersimpan (belum ada subclass/kode final). */
  typeCode?: string | null;
  kode?: string | null;
  indukKode?: string | null;
  accountSubclass?: string | null;
  systemAccountType?: string | null;
}

/** Pemetaan typeCode registry (GET /coa/account-types) → kategori. */
const TEMPLATE_TYPE_CODE_MAP: Record<string, CoaCategoryKey> = {
  KAS_BANK: 'KAS_DAN_BANK',
  PIUTANG_USAHA: 'PIUTANG_USAHA',
  PERSEDIAAN: 'PERSEDIAAN',
  ASET_LANCAR_LAINNYA: 'ASET_LANCAR_LAINNYA',
  ASET_TETAP: 'ASET_TETAP',
  HUTANG_USAHA: 'HUTANG_USAHA',
  KEWAJIBAN_LAINNYA: 'KEWAJIBAN_LAINNYA',
  MODAL: 'MODAL',
  PENDAPATAN: 'PENDAPATAN',
  HPP: 'HPP',
  BEBAN: 'BEBAN',
  PENDAPATAN_LAINNYA: 'PENDAPATAN_LAINNYA',
  BEBAN_LAINNYA: 'BEBAN_LAINNYA'
};

/** Klasifikasikan akun ke salah satu kategori COA (null bila tak dikenali). */
export function classifyCoaCategory(input: CoaCategoryInput): CoaCategoryKey | null {
  const { typeCode, kode, indukKode, accountSubclass, systemAccountType } = input;

  // 0. typeCode template (mode create — akun belum tersimpan)
  if (typeCode && TEMPLATE_TYPE_CODE_MAP[typeCode]) return TEMPLATE_TYPE_CODE_MAP[typeCode];

  // 1. Override berdasarkan systemAccountType
  if (systemAccountType) {
    if (systemAccountType === 'AR_CONTROL') return 'PIUTANG_USAHA';
    if (systemAccountType === 'AP_CONTROL') return 'HUTANG_USAHA';
    if (systemAccountType === 'BANK_CLEARING') return 'CLEARING';
    if (systemAccountType === 'RETAINED_EARNINGS' || systemAccountType === 'CURRENT_EARNINGS') return 'MODAL_SISTEM';
    if (systemAccountType === 'LEGACY_COGS_PURCHASE') return 'HPP_LEGACY';
    if (systemAccountType === OPENING_BALANCE_DIFF_SYSTEM_TYPE) return 'PENAMPUNG_SELISIH';
  }

  // 2. Klasifikasi berdasarkan accountSubclass
  if (accountSubclass) {
    if (accountSubclass === 'CASH_BANK') return 'KAS_DAN_BANK';
    if (INVENTORY_SUBCLASSES.includes(accountSubclass)) return 'PERSEDIAAN';
    if (accountSubclass === 'FIXED_ASSET_COST' || accountSubclass === 'CONTRA_ASSET') return 'ASET_TETAP';
  }

  // 3. Fallback prefiks kode (akun sendiri dulu, lalu induk)
  for (const source of [kode, indukKode]) {
    if (!source) continue;
    const text = String(source).trim();
    if (text.length < 2 || !/^\d{2}/.test(text)) continue;
    const prefix3 = text.slice(0, 3);
    if (PREFIX3_MAP[prefix3]) return PREFIX3_MAP[prefix3];
    const prefix2 = text.slice(0, 2);
    if (PREFIX2_MAP[prefix2]) return PREFIX2_MAP[prefix2];
  }

  return null;
}

/** Metadata kategori (label, saldo normal, kelayakan, hint). */
export function getCoaCategoryInfo(key: CoaCategoryKey | null): CoaCategoryInfo | null {
  return key ? (CATEGORY_INFO[key] ?? null) : null;
}

/** True untuk semua kategori bisnis (Update #075 — semua akun
 *  perkiraan, sama seperti Kas & Bank); false hanya untuk kategori yang
 *  dikelola sistem. */
export function isSaldoAwalEligible(key: CoaCategoryKey | null): boolean {
  const info = getCoaCategoryInfo(key);
  return !!info?.saldoAwalEligible;
}
