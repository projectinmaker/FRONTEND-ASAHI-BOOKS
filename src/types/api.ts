/**
 * ASAHI Books — API Types
 *
 * Seluruh tipe data yang digunakan untuk komunikasi dengan backend.
 * Field menggunakan camelCase karena backend (Pydantic alias_generator=to_camel)
 * mengembalikan response dalam format camelCase.
 */

// ── Enums ─────────────────────────────────────────────────────────────

export type HeaderCOA = 'AKTIVA' | 'KEWAJIBAN' | 'MODAL' | 'PENDAPATAN' | 'HPP' | 'BEBAN';
export type SaldoNormal = 'DEBIT' | 'KREDIT';
export type TingkatAkun = 'HEADER' | 'GROUP' | 'DETAIL';
export type RolePengguna = 'ADMINISTRATOR' | 'MANAJER_KEUANGAN' | 'STAFF_AKUNTANSI' | 'STAFF_GUDANG' | 'STAFF_PENJUALAN' | 'STAFF_PEMBELIAN' | 'STAFF_ENGINEERING';

// ── Auth ──────────────────────────────────────────────────────────────

export interface LoginRequest {
  username: string;
  password: string;
}

export interface UserResponse {
  id: string;
  username: string;
  namaLengkap: string;
  email: string;
  role: RolePengguna;
  status: string;
  createdAt: string;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: string;
  user: UserResponse;
}

// ── COA (Akun Perkiraan) ─────────────────────────────────────────────

export interface COARules {
  accountClass?: string | null;
  accountSubclass?: string | null;
  financialStatement?: string | null;
  reportGroup?: string | null;
  systemAccountType?: string | null;
  allowSystemPosting?: boolean;
  allowManualPosting?: boolean;
  isControlAccount?: boolean;
  subledgerType?: string | null;
  reconciliationRequired?: boolean;
  active?: boolean;
}

export interface COAResponse extends COARules {
  tanggal?: string | null;
  isSubledger?: boolean;
  isPostableForManual?: boolean;
  isPostableForSystem?: boolean;
  isLegacyLocked?: boolean;
  isSystemAccount?: boolean;
  id: string;
  kode: string;
  nama: string;
  header: HeaderCOA;
  tingkat: TingkatAkun;
  indukId: string | null;
  indukKode: string | null;
  saldoNormal: SaldoNormal;
  saldo: number;
  status: string;
  jenisKasBank: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface COACreate extends COARules {
  kode?: string; // mode typeCode: kosong = auto-generate dari parent
  nama: string;
  header?: HeaderCOA; // wajib hanya pada mode legacy (tanpa typeCode)
  tingkat?: TingkatAkun;
  indukId?: string | null;
  indukKode?: string | null;
  saldoNormal?: SaldoNormal;
  status?: string;
  jenisKasBank?: string | null;
  // Catatan COA v2: backend menerima `saldo` (Decimal, default 0) dan
  // `tanggal` (Optional[datetime], ISO format) langsung di endpoint create.
  // Frontend saat ini tetap mengirim saldo awal lewat endpoint terpisah
  // (/coa/saldo-awal) untuk konsistensi dengan jurnal berpasangan, tapi
  // field ini tetap di-type untuk keselarasan dengan backend schema.
  saldo?: number;
  tanggal?: string | null;
  // === Mode baru (revisi form COA) — derivasi server-side ===
  // Kirim typeCode dari GET /coa/account-types; server menurunkan
  // header/tingkat/saldoNormal/klasifikasi dari template registry.
  typeCode?: string;
  isSub?: boolean;
  structuralType?: 'GROUP' | 'DETAIL'; // untuk akun level root
}

export interface COAUpdate extends COARules {
  nama?: string;
  indukId?: string | null;
  indukKode?: string | null;
  saldo?: number;
  status?: string;
  tanggal?: string | null;
}

// ── COA — Registry Tipe Akun (revisi form COA) ──────────────────────

export interface AccountTypeTemplate {
  typeCode: string;
  displayName: string;
  accountClass: string; // ASSET | LIABILITY | EQUITY | REVENUE | COGS | EXPENSE
  financialStatement: string; // NERACA | LABA RUGI
  reportGroup?: string | null;
  accountSubclass?: string | null;
  saldoNormal: SaldoNormal;
  defaultPostingLevel: string;
  defaultSystemPosting: boolean;
  defaultManualPosting: boolean;
  defaultControl: boolean;
  defaultReconciliation: boolean;
  subledgerType?: string | null;
  isSystemReserved: boolean;
  allowedParentSubclasses: string[];
  supportsRoot: boolean;
  requiresJenisKasBank: boolean;
}

export interface COAParentOption {
  id: string;
  kode: string;
  nama: string;
  tingkat: TingkatAkun;
  accountClass?: string | null;
  accountSubclass?: string | null;
  recommended: boolean;
}

export interface COAPreviewRequest {
  typeCode: string;
  isSub?: boolean;
  indukId?: string | null;
  structuralType?: 'GROUP' | 'DETAIL' | null;
  kode?: string | null;
  nama?: string | null;
  jenisKasBank?: string | null;
}

export interface COAPreviewResponse {
  typeCode: string;
  displayName: string;
  kode?: string | null;
  kodeGenerated: boolean;
  nama?: string | null;
  indukId?: string | null;
  indukKode?: string | null;
  indukNama?: string | null;
  tingkat?: TingkatAkun | null;
  header?: HeaderCOA | null;
  saldoNormal?: SaldoNormal | null;
  accountClass?: string | null;
  accountSubclass?: string | null;
  financialStatement?: string | null;
  reportGroup?: string | null;
  allowSystemPosting?: boolean | null;
  allowManualPosting?: boolean | null;
  isControlAccount?: boolean | null;
  subledgerType?: string | null;
  systemAccountType?: string | null;
  reconciliationRequired?: boolean | null;
  active?: boolean | null;
  jenisKasBank?: string | null;
  warnings: string[];
  errors: string[];
}

// ── Simple / Nested objects ──────────────────────────────────────────

export interface COASimple {
  id: string;
  kode: string;
  nama: string;
  header?: string;
  tingkat?: string;
  status?: string;
}

// ── Setting Akun (default COA mapping per transaction type) ──

export interface SettingAkunResponse {
  id: string;
  key: string;
  label: string;
  akunPerkiraanId: string;
  akunPerkiraan: COASimple | null;
  createdAt: string;
  updatedAt: string;
}

export interface SettingAkunUpdate {
  akunPerkiraanId: string;
}

// ── Setting Aplikasi Global (non-COA, mis. METODE_VALUASI) ──

export interface AppSettingResponse {
  key: string;
  value: string;
  updatedAt?: string | null;
}

export interface AppSettingUpdate {
  value: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// === Update ASAHI #019 — PREFERENSI (GET/PUT /master/preferensi) ===
// Konfigurasi aplikasi terpusat (konfirmasi keluar, format tanggal, metode
// valuasi, pengingat, penjualan-pembelian, perpajakan, font, penomoran
// dokumen). Registry sumber kebenaran ada di backend preferensi_service.
// ═══════════════════════════════════════════════════════════════════════════

export interface PreferensiOption {
  value: string;
  label: string;
}

export type PreferensiItemType = 'boolean' | 'select' | 'number' | 'text';

export interface PreferensiItem {
  key: string;
  label: string;
  type: PreferensiItemType;
  /** Nilai saat ini (dari app_setting; fallback default registry). */
  value: string | number | boolean;
  default: string | number | boolean;
  options?: PreferensiOption[];
  min?: number;
  max?: number;
  help?: string | null;
}

export interface PreferensiGroup {
  id: string;
  label: string;
  description?: string | null;
  items: PreferensiItem[];
}

export interface PreferensiResponse {
  groups: PreferensiGroup[];
}

/** Body PUT /master/preferensi — hanya key yang berubah dikirim. */
export interface PreferensiUpdatePayload {
  updates: Record<string, string | number | boolean>;
}

export interface KategoriSimple {
  id: string;
  nama: string;
}

export interface SatuanSimple {
  id: string;
  nama: string;
}

// ── Nested simple types untuk relasi master data ─────────────────────────────
// Dipakai di response Pelanggan/Supplier/Barang/Gudang/KategoriAset untuk embed
// related object (FK yang sudah di-join di backend).

export interface SyaratBayarSimple {
  id: string;
  nama: string;
  hari: number | null;
}

// ── ItemTypeBarang enum (Phase 2 — Master Data Foundation) ─────────────────
// Sumber: app/models/master/barang.py ItemTypeBarang.
// Dipakai di Barang.itemType, ganti field legacy `jenisBarang` (string).
export type ItemTypeBarang = 'BARANG_DAGANG' | 'BARANG_JADI' | 'BARANG_BAKU' | 'BARANG_BANTU' | 'JASA';

export const ITEM_TYPE_LABELS: Record<ItemTypeBarang, string> = {
  BARANG_DAGANG: 'Barang Dagang',
  BARANG_JADI: 'Barang Jadi',
  BARANG_BAKU: 'Bahan Baku',
  BARANG_BANTU: 'Bahan Pembantu',
  JASA: 'Jasa'
};

export const ITEM_TYPE_OPTIONS: { value: ItemTypeBarang; label: string }[] = [
  { value: 'BARANG_DAGANG', label: 'Barang Dagang' },
  { value: 'BARANG_JADI', label: 'Barang Jadi' },
  { value: 'BARANG_BAKU', label: 'Bahan Baku' },
  { value: 'BARANG_BANTU', label: 'Bahan Pembantu' },
  { value: 'JASA', label: 'Jasa' }
];

// ── Tax status (Phase 2) — untuk Pelanggan/Supplier ─────────────────────────
export type TaxStatus = 'PKP' | 'NON_PKP' | null;

export const TAX_STATUS_OPTIONS: { value: TaxStatus; label: string }[] = [
  { value: 'PKP', label: 'PKP (Pengusaha Kena Pajak)' },
  { value: 'NON_PKP', label: 'Non-PKP' }
];

// ── Pelanggan ────────────────────────────────────────────────────────

export interface PelangganResponse {
  id: string;
  kode: string;
  nama: string;
  alamat: string | null;
  telepon: string | null;
  email: string | null;
  kontakPerson: string | null;
  npwp: string | null;
  // === Phase 2 — field baru ===
  nitku?: string | null;
  creditLimit?: number | null;
  taxStatus?: TaxStatus;
  syaratBayarId?: string | null;
  syaratBayar?: SyaratBayarSimple | null;
  // === Update #003 — singkatan nama perusahaan ===
  singkatan?: string | null;
  // === Legacy (tetap ada di response, jangan di-update dari form) ===
  syaratBayarDefault: string | null;
  status: string;
  akunPiutangId?: string | null;
  akunPiutang?: AkunPerkiraanSimple | null;
  createdAt: string;
  updatedAt: string;
}

export interface PelangganCreate {
  kode: string;
  nama: string;
  alamat?: string | null;
  telepon?: string | null;
  email?: string | null;
  kontakPerson?: string | null;
  npwp?: string | null;
  // === Phase 2 — field baru (opsional) ===
  nitku?: string | null;
  creditLimit?: number | null;
  taxStatus?: TaxStatus;
  syaratBayarId?: string | null;
  // === Update #003 — singkatan nama perusahaan (segmen nomor SO) ===
  singkatan?: string | null;
  // === Legacy ===
  syaratBayarDefault?: string | null;
  akunPiutangId?: string | null;
  // Induk untuk auto-create COA subledger piutang (dari dropdown "Pilih Akun
  // Perkiraan"; default = root Setting Akun PIUTANG_USAHA)
  akunPiutangParentId?: string | null;
}

export interface PelangganUpdate {
  kode?: string;
  nama?: string;
  alamat?: string | null;
  telepon?: string | null;
  email?: string | null;
  kontakPerson?: string | null;
  npwp?: string | null;
  // === Phase 2 — field baru (opsional) ===
  nitku?: string | null;
  creditLimit?: number | null;
  taxStatus?: TaxStatus;
  syaratBayarId?: string | null;
  // === Update #003 — singkatan (null = hapus) ===
  singkatan?: string | null;
  // === Legacy ===
  syaratBayarDefault?: string | null;
  status?: string;
}

// Response dari GET /master/pelanggan-coa — COA detail under "Piutang Usaha"
// + LEFT JOIN pelanggan (kalau sudah di-link). coaId/kode/nama bisa null
// untuk baris "pelanggan tanpa akun piutang" (belum ter-link ke COA mana pun).
export interface PelangganCOAItem {
  coaId: string | null;
  kode: string | null;
  nama: string | null;
  pelangganId: string | null;
  kodePelanggan: string | null;
  namaPelanggan: string | null;
  alamat: string | null;
  telepon: string | null;
  email: string | null;
  kontakPerson: string | null;
  npwp: string | null;
  // === Update #003 — singkatan nama perusahaan ===
  singkatan: string | null;
  syaratBayarDefault: string | null;
  status: string;
  isLinked: boolean;
}

// Request body untuk POST /master/pelanggan-from-coa
export interface PelangganFromCOACreate {
  coaId: string;
  kode: string;
  nama: string;
  alamat?: string | null;
  telepon?: string | null;
  email?: string | null;
  kontakPerson?: string | null;
  npwp?: string | null;
  syaratBayarDefault?: string | null;
}

// ── Supplier ─────────────────────────────────────────────────────────

export interface SupplierFoundationFields {
  supplierType?: string | null;
  city?: string | null;
  province?: string | null;
  country?: string | null;
  postalCode?: string | null;
  currency?: string | null;
  bankName?: string | null;
  bankAccountNo?: string | null;
  bankAccountName?: string | null;
}

export interface SupplierResponse extends SupplierFoundationFields {
  id: string;
  kode: string;
  nama: string;
  alamat: string | null;
  telepon: string | null;
  email: string | null;
  kontakPerson: string | null;
  npwp: string | null;
  // === Phase 2 — field baru ===
  nitku?: string | null;
  creditLimit?: number | null;
  taxStatus?: TaxStatus;
  syaratBayarId?: string | null;
  syaratBayar?: SyaratBayarSimple | null;
  // === Legacy (tetap ada di response, jangan di-update dari form) ===
  syaratBayarDefault: string | null;
  status: string;
  akunHutangId?: string | null;
  akunHutang?: AkunPerkiraanSimple | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierCreate extends SupplierFoundationFields {
  kode: string;
  nama: string;
  alamat?: string | null;
  telepon?: string | null;
  email?: string | null;
  kontakPerson?: string | null;
  npwp?: string | null;
  // === Phase 2 — field baru (opsional) ===
  nitku?: string | null;
  creditLimit?: number | null;
  taxStatus?: TaxStatus;
  syaratBayarId?: string | null;
  // === Legacy ===
  syaratBayarDefault?: string | null;
  akunHutangId?: string | null;
}

export interface SupplierUpdate extends SupplierFoundationFields {
  kode?: string;
  nama?: string;
  alamat?: string | null;
  telepon?: string | null;
  email?: string | null;
  kontakPerson?: string | null;
  npwp?: string | null;
  // === Phase 2 — field baru (opsional) ===
  nitku?: string | null;
  creditLimit?: number | null;
  taxStatus?: TaxStatus;
  syaratBayarId?: string | null;
  // === Legacy ===
  syaratBayarDefault?: string | null;
  status?: string;
}

// Response dari GET /master/supplier-coa — COA detail under "Hutang Usaha"
// + LEFT JOIN supplier (kalau sudah di-link)
export interface SupplierCOAItem extends SupplierFoundationFields {
  // coaId/kode/nama bisa null untuk baris "supplier tanpa akun hutang"
  // (belum ter-link ke COA mana pun).
  coaId: string | null;
  kode: string | null;
  nama: string | null;
  supplierId: string | null;
  kodeSupplier: string | null;
  namaSupplier: string | null;
  alamat: string | null;
  telepon: string | null;
  email: string | null;
  kontakPerson: string | null;
  npwp: string | null;
  syaratBayarDefault: string | null;
  status: string;
  isLinked: boolean;
}

// Request body untuk POST /master/supplier-from-coa
export interface SupplierFromCOACreate {
  coaId: string;
  kode: string;
  nama: string;
  alamat?: string | null;
  telepon?: string | null;
  email?: string | null;
  kontakPerson?: string | null;
  npwp?: string | null;
  syaratBayarDefault?: string | null;
}

// ── Barang ───────────────────────────────────────────────────────────

export interface BarangSatuanResponse {
  id: string;
  barangId: string;
  satuanId: string;
  isUtama: boolean;
  isiSatuan?: number;
  satuan: SatuanSimple;
}

export interface BarangSatuanCreate {
  barangId: string;
  satuanId: string;
  isUtama?: boolean;
  isiSatuan?: number;
}

export interface BarangSatuanUpdate {
  satuanId?: string;
  isUtama?: boolean;
  isiSatuan?: number;
}

export type JenisBarang = 'BARANG_DAGANG' | 'JASA' | 'ASET_TETAP' | 'MATERIAL' | 'LAINNYA';

export const JENIS_BARANG_OPTIONS: { value: JenisBarang; label: string; deskripsi: string }[] = [
  { value: 'BARANG_DAGANG', label: 'Barang Dagang', deskripsi: 'Barang yang diperjualbelikan (inventory)' },
  { value: 'JASA', label: 'Jasa', deskripsi: 'Layanan non-fisik' },
  { value: 'ASET_TETAP', label: 'Aset Tetap', deskripsi: 'Aset jangka panjang' },
  { value: 'MATERIAL', label: 'Material', deskripsi: 'Bahan baku / material produksi' },
  { value: 'LAINNYA', label: 'Lainnya', deskripsi: 'Jenis lain' }
];

// ── Akun Persediaan (mapping barang → COA) — Tahap 1 ──────────────────

export interface AkunPersediaanSimple {
  id: string;
  kode: string;
  nama: string;
  header: string;
  tingkat: string;
  status: string;
}

export interface BarangAkunPersediaanItem {
  id: string;
  kode: string;
  nama: string;
  header: string;
  tingkat: string;
  status: string;
}

export interface BarangResponse {
  metodeValuasi?: string;
  id: string;
  kode: string;
  nama: string;
  kategoriId: string;
  satuanId: string;
  hargaPokok: number;
  /** Harga jual default (bukan HPP — HPP mengikuti valuasi stok). */
  hargaJual: number;
  stokMinimum: number;
  stok: number;
  status: string;
  // === Phase 2 — field baru (prefer pakai ini) ===
  itemType?: ItemTypeBarang | null;
  akunHppId?: string | null;
  akunPenjualanId?: string | null;
  akunReturPenjualanId?: string | null;
  akunDiskonPenjualanId?: string | null;
  stockItem: boolean;
  akunHpp?: AkunPerkiraanSimple | null;
  akunPenjualan?: AkunPerkiraanSimple | null;
  akunReturPenjualan?: AkunPerkiraanSimple | null;
  akunDiskonPenjualan?: AkunPerkiraanSimple | null;
  // === Legacy (tetap ada, jangan di-update dari form — pakai itemType) ===
  jenisBarang?: JenisBarang;
  /** Tahap 1: mapping akun Persediaan. null untuk barang lama yang belum dipetakan. */
  akunPersediaanId: string | null;
  /** Tahap 1: object akun Persediaan (boleh null). Detail barang tetap mengembalikan object akun + status walau akun NONAKTIF. */
  akunPersediaan: AkunPersediaanSimple | null;
  createdAt: string;
  updatedAt: string;
  kategori: KategoriSimple;
  satuan: SatuanSimple;
  daftarSatuan: BarangSatuanResponse[];
}

export interface BarangCreate {
  kode: string;
  nama: string;
  kategoriId: string;
  satuanId: string;
  hargaPokok?: number;
  /** Harga jual default (bukan HPP). */
  hargaJual?: number;
  stokMinimum?: number;
  // === Phase 2 — field baru ===
  itemType?: ItemTypeBarang | null;
  akunHppId?: string | null;
  akunPenjualanId?: string | null;
  akunReturPenjualanId?: string | null;
  akunDiskonPenjualanId?: string | null;
  stockItem?: boolean;
  // Task 27-c — dynamic form barang: metode valuasi opsional saat create (AVERAGE/FIFO/FEFO).
  metodeValuasi?: string;
  // Task 27-c — dynamic form barang: status opsional saat create ('AKTIF'/'NONAKTIF').
  status?: string;
  // === Legacy ===
  jenisBarang?: JenisBarang;
  /** Tahap 1: opsional. Kirim UUID valid, atau null untuk kosong. Jangan kirim object akunPersediaan. */
  akunPersediaanId?: string | null;
}

export interface BarangUpdate {
  nama?: string;
  kategoriId?: string | null;
  satuanId?: string | null;
  hargaPokok?: number | null;
  hargaJual?: number | null;
  stokMinimum?: number | null;
  status?: string;
  // === Phase 2 — field baru ===
  itemType?: ItemTypeBarang | null;
  akunHppId?: string | null;
  akunPenjualanId?: string | null;
  akunReturPenjualanId?: string | null;
  akunDiskonPenjualanId?: string | null;
  stockItem?: boolean | null;
  // === Legacy ===
  jenisBarang?: JenisBarang | null;
  /** Tahap 1: kirim null untuk mengosongkan mapping; hilangkan field untuk mempertahankan mapping lama. */
  akunPersediaanId?: string | null;
}

// ── Dropdown / Lookup ─────────────────────────────────────────────────

export interface KategoriBarangResponse {
  id: string;
  kode: string;
  nama: string;
  status: string;
}

export interface SatuanResponse {
  id: string;
  nama: string;
  status: string;
}

export interface KategoriBarangCreate {
  kode: string;
  nama: string;
}

export interface KategoriBarangUpdate {
  kode?: string;
  nama?: string;
  status?: string;
}

export interface SatuanCreate {
  nama: string;
}

export interface SatuanUpdate {
  nama?: string;
  status?: string;
}

// ── Additional Dropdown Types ───────────────────────────────────────

export interface GudangCreate {
  kode: string;
  nama: string;
  alamat?: string | null;
}

export interface GudangUpdate {
  nama?: string | null;
  alamat?: string | null;
  status?: string | null;
}

export interface GudangResponse {
  id: string;
  kode: string;
  nama: string;
  alamat: string | null;
  totalBarang: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyaratBayarResponse {
  id: string;
  nama: string;
  hari: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyaratBayarCreate {
  nama: string;
  hari?: number | null;
}

export interface SyaratBayarUpdate {
  nama?: string;
  hari?: number | null;
}

export interface KategoriAsetResponse {
  id: string;
  kode: string;
  nama: string;
  // === Phase 2 — field baru ===
  akunAsetId?: string | null;
  akunAkumulasiId?: string | null;
  akunBebanId?: string | null;
  defaultUsefulLife?: number | null;
  defaultMethod?: MetodePenyusutan | null;
  akunAset?: AkunPerkiraanSimple | null;
  akunAkumulasi?: AkunPerkiraanSimple | null;
  akunBeban?: AkunPerkiraanSimple | null;
  // === Existing ===
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface KategoriAsetCreate {
  kode: string;
  nama: string;
  // === Phase 2 — field baru (opsional) ===
  akunAsetId?: string | null;
  akunAkumulasiId?: string | null;
  akunBebanId?: string | null;
  defaultUsefulLife?: number | null;
  defaultMethod?: MetodePenyusutan | null;
}

export interface KategoriAsetUpdate {
  nama?: string;
  status?: string;
  // === Phase 2 — field baru ===
  akunAsetId?: string | null;
  akunAkumulasiId?: string | null;
  akunBebanId?: string | null;
  defaultUsefulLife?: number | null;
  defaultMethod?: MetodePenyusutan | null;
}

export interface KasBankAkunResponse {
  id: string;
  kode: string;
  nama: string;
  jenis: string;
  saldo: number;
  status: string;
  akunPerkiraan: COASimple;
  // === Phase 2 — field baru ===
  currency: string; // ISO 4217, default "IDR"
  createdAt: string;
  updatedAt: string;
}

export interface KasBankAkunCreate {
  kode: string;
  nama: string;
  jenis: string;
  akunPerkiraanId: string;
  // === Phase 2 — field baru (opsional, default "IDR") ===
  currency?: string;
}

export interface KasBankAkunUpdate {
  nama?: string;
  jenis?: string;
  akunPerkiraanId?: string;
  status?: string;
  // === Phase 2 — field baru (opsional) ===
  currency?: string;
}

export interface COADropdownResponse {
  id: string;
  kode: string;
  nama: string;
  header: string;
  tingkat: string;
  status: string;
}

// ── Workflow (Tahap 2) ─────────────────────────────────────────────────

export type WorkflowState = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'POSTED' | 'EXECUTED' | 'CANCELLED';

export type WorkflowAction = 'submit' | 'approve' | 'reject' | 'withdraw' | 'post' | 'execute' | 'cancel';

export interface WorkflowHistoryItem {
  version: number;
  action: string;
  fromState: string;
  toState: string;
  actorId: string | null;
  reason: string | null;
  at: string;
}

export interface WorkflowResponse {
  documentType: string;
  documentId: string;
  documentNumber: string;
  createdBy: string | null;
  submittedBy: string | null;
  approvedBy: string | null;
  canEdit: boolean;
  tanggal: string;
  total: string;
  state: WorkflowState;
  documentStatus: string;
  version: number;
  journalId: string | null;
  availableActions: WorkflowAction[];
  history: WorkflowHistoryItem[];
}

export interface WorkflowQueueItem {
  documentType: string;
  documentId: string;
  documentNumber: string;
  state: WorkflowState;
  version: number;
  total: string;
  createdBy: string | null;
  tanggal: string;
}

export interface WorkflowActionRequest {
  expectedVersion: number;
  reason?: string;
}

export interface WorkflowCapabilities {
  role: string;
  documentTypes: string[];
  canApprove: boolean;
}

// === Update #4 — dropdown membawa data master untuk auto-fill form ===
// Saat pelanggan/supplier dipilih di form transaksi (SO/PO/Invoice/Penawaran/
// Pengiriman/Penerimaan), field alamat ditarik otomatis dari sini.
export interface PelangganDropdown {
  id: string;
  kode: string;
  nama: string;
  alamat?: string | null;
  telepon?: string | null;
  kontakPerson?: string | null;
  email?: string | null;
  syaratBayarId?: string | null;
  // === Update #003 — singkatan nama perusahaan (auto-fill form Penawaran/SO) ===
  singkatan?: string | null;
}

export interface SupplierDropdown {
  id: string;
  kode: string;
  nama: string;
  alamat?: string | null;
  telepon?: string | null;
  kontakPerson?: string | null;
  email?: string | null;
  syaratBayarId?: string | null;
  /** Mata uang default supplier (mis. "USD") — dipakai form PO. */
  currency?: string | null;
}

export interface BarangDropdown {
  id: string;
  kode: string;
  nama: string;
  hargaPokok: number;
  /** Harga jual default — dipakai auto-fill harga di form SO. */
  hargaJual: number;
  stok: number;
  // === Phase 2/3 — field baru (optional, forward-compatible).
  itemType?: ItemTypeBarang | null;
  stockItem?: boolean;
  // === Update #4 — deteksi FEFO di form penerimaan (input kedaluwarsa kondisional).
  metodeValuasi?: string | null;
  // === Update ASAHI #4 — satuan default barang (base_uom) untuk auto-fill
  // dropdown satuan di form penjualan/pembelian (sejalan auto-fill harga).
  satuanId?: string | null;
}

// ── Enums (Phase 5) ─────────────────────────────────────────────────

export type StatusTransaksi = 'DRAFT' | 'DIPROSES' | 'SELESAI' | 'BATAL';
export type StatusPenjualan = 'DRAFT' | 'DIPROSES' | 'SELESAI' | 'DIBATALKAN';
export type StatusPersediaan = 'DIAJUKAN' | 'DISETUJUI' | 'DITOLAK' | 'SELESAI' | 'BATAL';
export type StatusAsetTetap = 'AKTIF' | 'DIHAPUSKAN' | 'DALAM_PERBAIKAN';
export type TipePenyesuaian = 'TAMBAH' | 'KURANG';
export type ProsesPemindahan = 'KIRIM' | 'TERIMA';
export type MetodePenyusutan = 'GARIS_LURUS' | 'SALDO_MENURUN' | 'JUMLAH_ANGKA';

// ── Shared Simple Types (Phase 5) ───────────────────────────────────

export interface PenggunaSimple {
  id: string;
  nama: string;
}

export interface JurnalSimple {
  id: string;
  noJurnal: string;
}

export interface BarangSimple {
  id: string;
  kode: string;
  nama: string;
  hargaPokok: number;
}

export interface GudangSimple {
  id: string;
  kode: string;
  nama: string;
}

export interface KasBankSimple {
  id: string;
  kode: string;
  nama: string;
  jenis: string;
  akunPerkiraan: AkunPerkiraanSimple | null;
}

export interface AkunPerkiraanSimple {
  id: string;
  kode: string;
  nama: string;
}

export interface PelangganSimple {
  id: string;
  kode: string;
  nama: string;
  /** Update ASAHI — alamat master pelanggan; dipakai cetak Delivery Order (Pengiriman). */
  alamat?: string | null;
}

export interface SyaratBayarSimple {
  id: string;
  nama: string;
  hari: number | null;
}

export interface SupplierSimple {
  id: string;
  kode: string;
  nama: string;
  // === Update ASAHI (cetak PO): Kontak Person & Telepon supplier ===
  kontakPerson?: string | null;
  telepon?: string | null;
}

export interface SalesOrderSimple {
  id: string;
  noPesanan: string;
  // === Update #4 — No PO customer (tampil di print invoice/SJ/SO & info form) ===
  customerPoNumber?: string | null;
}

export interface PurchaseOrderSimple {
  id: string;
  noPesanan: string;
}

// ── Transaksi Biaya (shared) ─────────────────────────────────────────

export interface TransaksiBiayaCreate {
  nama: string;
  jumlah: number;
}

export interface TransaksiBiayaResponse extends TransaksiBiayaCreate {
  id: string;
}

// ── Penawaran (Quotation) ────────────────────────────────────────────

export interface PenawaranDetailCreate {
  barangId: string;
  satuanId?: string | null;
  qty: number;
  harga: number;
  diskon?: number;
  subTotal?: number;
  keterangan?: string | null;
}

export interface PenawaranDetailResponse extends PenawaranDetailCreate {
  id: string;
  barang?: { id: string; kode: string; nama: string } | null;
  satuan?: { id: string; nama: string } | null;
}

export interface PenawaranCreate {
  pelangganId: string;
  tanggal: string;
  berlakuHingga?: string | null;
  syaratBayarId?: string | null;
  alamatPengiriman?: string | null;
  keterangan?: string | null;
  // === Update #003 — dibawa ke SO saat konversi ===
  customerPoNumber?: string | null;
  customerCode?: string | null;
  mataUang?: string;
  diskonGlobal?: number;
  ppn?: number;
  details: PenawaranDetailCreate[];
  biayaTambahan?: TransaksiBiayaCreate[];
}

export type PenawaranUpdate = Partial<PenawaranCreate>;

export interface PenawaranResponse {
  id: string;
  noPenawaran: string;
  tanggal: string;
  berlakuHingga?: string | null;
  pelangganId: string;
  syaratBayarId?: string | null;
  alamatPengiriman?: string | null;
  keterangan?: string | null;
  // === Update #003 ===
  customerPoNumber?: string | null;
  customerCode?: string | null;
  mataUang: string;
  diskonGlobal: string;
  ppn: string;
  subTotal: string;
  totalDiskon: string;
  totalPpn: string;
  totalBiayaTambahan: string;
  grandTotal: string;
  status: string;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  pelanggan?: { id: string; kode: string; nama: string } | null;
  syaratBayar?: { id: string; nama: string; hari?: number | null } | null;
  creator?: { id: string; nama: string } | null;
  details: PenawaranDetailResponse[];
  biayaTambahan: TransaksiBiayaResponse[];
}

// ── Tukar Faktur / Tanda Terima (Update #4) ──────────────────────────

export interface TukarFakturDetailResponse {
  id: string;
  barangId: string;
  satuanId?: string | null;
  qty: number;
  barang?: { id: string; kode: string; nama: string; hargaPokok?: number | string | null } | null;
  satuan?: { id: string; nama: string } | null;
}

export interface TukarFakturCreate {
  tanggal: string;
  salesInvoiceId: string;
  keterangan?: string | null;
}

export type TukarFakturUpdate = Partial<Pick<TukarFakturCreate, 'tanggal' | 'keterangan'>>;

export interface TukarFakturResponse {
  id: string;
  noTukarFaktur: string;
  tanggal: string;
  salesInvoiceId: string;
  pelangganId: string;
  /** Snapshot nomor SO sumber invoice (null bila invoice tanpa SO). */
  noSo?: string | null;
  /** Snapshot No PO customer dari SO (null bila tidak ada). */
  noPoCustomer?: string | null;
  /** Snapshot No Surat Jalan ter-link (join koma; null bila invoice dari SO langsung). */
  noSuratJalan?: string | null;
  /** Snapshot grand total invoice saat TF dibuat. */
  total: string | number;
  keterangan?: string | null;
  status: 'DRAFT' | 'SELESAI' | string;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  pelanggan?: { id: string; kode: string; nama: string } | null;
  salesInvoice?: { id: string; noInvoice: string } | null;
  creator?: { id: string; username: string; namaLengkap?: string | null } | null;
  details: TukarFakturDetailResponse[];
}

// ── Sisa qty dokumen sumber (tarik data SO/PO) ───────────────────────

export interface SalesOrderSisaDetail {
  salesOrderDetailId: string;
  barangId: string;
  kodeBarang: string;
  namaBarang: string;
  satuanId?: string | null;
  satuanNama?: string | null;
  qtyPesanan: number;
  qtyTerkirim: number;
  qtyTerfaktur: number;
  sisaKirim: number;
  sisaFaktur: number;
  harga: number;
  diskon: number;
}

export interface SalesOrderSisaResponse {
  salesOrderId: string;
  pelangganId: string;
  syaratBayarId?: string | null;
  noPesanan: string;
  alamatPengiriman?: string | null;
  details: SalesOrderSisaDetail[];
}

// ── Update #004: sisa DO (tarik No DO di form Invoice — mirror pola No SO) ──
export interface PengirimanSisaDetail {
  deliveryDetailId: string;
  salesOrderDetailId?: string | null;
  barangId: string;
  kodeBarang: string | null;
  namaBarang: string | null;
  satuanId?: string | null;
  satuanNama?: string | null;
  qtyKirim: number;
  qtyTerfaktur: number;
  sisaFaktur: number;
  harga: number;
  diskon: number;
}

export interface PengirimanSisaResponse {
  pengirimanId: string;
  noSuratJalan: string;
  tanggal: string;
  salesOrderId: string;
  noPesanan?: string | null;
  pelangganId: string;
  pelangganNama?: string | null;
  alamatPengiriman?: string | null;
  gudangId?: string | null;
  details: PengirimanSisaDetail[];
}

export interface PurchaseOrderSisaDetail {
  purchaseOrderDetailId: string;
  barangId: string;
  kodeBarang: string;
  namaBarang: string;
  satuanId?: string | null;
  satuanNama?: string | null;
  qtyPesanan: number;
  qtyDiterima: number;
  qtyTerfaktur: number;
  sisaTerima: number;
  sisaFaktur: number;
  harga: number;
  diskon: number;
}

export interface PurchaseOrderSisaResponse {
  purchaseOrderId: string;
  supplierId: string;
  noPesanan: string;
  alamat?: string | null;
  syaratBayarId?: string | null;
  details: PurchaseOrderSisaDetail[];
}

// ── Pilihan akun per aktivitas (form Barang & Jasa) ──────────────────

export interface BarangAkunPilihan {
  id: string;
  kode: string;
  nama: string;
}

export interface BarangAkunPilihanResponse {
  hpp: BarangAkunPilihan[];
  penjualan: BarangAkunPilihan[];
  retur: BarangAkunPilihan[];
  diskon: BarangAkunPilihan[];
}

// ── Kas & Bank ───────────────────────────────────────────────────────

// === Update #16 — preview nomor dokumen berikutnya (form ala Accurate) ===
export interface NomorPreviewResponse {
  nomor: string;
}

export interface PembayaranRincianCreate {
  akunPerkiraanId: string;
  nilai: number;
  // === Update #16 — keterangan per baris rincian (kolom Catatan grid
  // detail, paritas Accurate "Pembayaran Lain") ===
  keterangan?: string | null;
}

export interface PembayaranRincianResponse extends PembayaranRincianCreate {
  id: string;
  akunPerkiraan: AkunPerkiraanSimple;
}

export interface PembayaranKasCreate {
  tanggal: string;
  kasBankId: string;
  // === Update #16 — noNukti kini opsional (form ala Accurate tanpa field
  // No Bukti); kosong → backend auto-isi = nomor dokumen ===
  noNukti?: string | null;
  noCek?: string | null;
  // === Update #16 — "Cek Kosong" (paritas Accurate): True = via cek kosong,
  // No. Cek boleh kosong ===
  cekKosong?: boolean;
  // === Update cetak "Bayar Pemasok" — info cek & mata uang ===
  tanggalCek?: string | null;
  jumlahCek?: number | string | null;
  mataUang?: string;
  nilaiTukar?: number | string;
  penerima?: string | null;
  catatan?: string | null;
  rincian: PembayaranRincianCreate[];
  // === Update #02 — jenis transaksi kas (lihat JenisTransaksiKas) ===
  jenisTransaksi?: JenisTransaksiKas;
}

// ── Payment Allocation (Phase 1.B) ─────────────────────────────────────────
// Field `alokasi` di PembayaranKasResponse & PenerimaanKasResponse dipakai
// backend untuk menyimpan informasi settlement (pelunasan invoice via kas/bank).
// Kalau array kosong → dokumen tersebut adalah transaksi generic (bukan settlement).
// Kalau array ada isi → dokumen tersebut adalah AR/AP Settlement.
// Backend source: app/schemas/settlement.py AllocationResponse.

export interface PaymentAllocationItem {
  id: string;
  invoiceId: string;
  nilai: number | string; // Decimal di backend, bisa string atau number di frontend
  akunPerkiraanId: string;
  // === Update cetak "Bayar Pemasok" — diskon pelunasan & detail faktur ===
  diskon?: number | string;
  // === Update #01 — PPh 23 pelunasan per faktur (piutang: dipotong pelanggan;
  // hutang: ditahan dari pembayaran supplier). Kas = nilai − diskon − pph23. ===
  pph23?: number | string;
  terutang?: number | string | null;
  noFaktur?: string | null;
  tanggalFaktur?: string | null;
  jatuhTempo?: string | null;
  nilaiTagihan?: number | string | null;
}

// Helper untuk cek apakah dokumen kas/bank adalah settlement.
// Pakai helper ini di komponen untuk tentukan apakah perlu tampilkan badge
// "AR Settlement" / "AP Settlement".
export const isSettlement = (alokasi?: PaymentAllocationItem[] | null): boolean => {
  return !!alokasi && alokasi.length > 0;
};

export interface PembayaranKasResponse {
  id: string;
  noBukti: string;
  tanggal: string;
  kasBankId: string;
  noNukti: string;
  noCek: string | null;
  // === Update #16 — "Cek Kosong" (paritas Accurate) ===
  cekKosong?: boolean;
  // === Update cetak "Bayar Pemasok" — info cek & mata uang ===
  tanggalCek: string | null;
  jumlahCek: number | string | null;
  mataUang: string;
  nilaiTukar: number | string;
  penerima: string | null;
  catatan: string | null;
  autoPostJurnal: boolean;
  totalNilai: number;
  status: StatusTransaksi;
  jurnalUmumId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  kasBank: KasBankSimple | null;
  creator: PenggunaSimple | null;
  rincian: PembayaranRincianResponse[];
  // === Update #5 — penalti pelunasan (backend: pembayaran_kas.penalti) ===
  // totalNilai = Σ rincian − Σ alokasi.diskon + penalti
  penalti?: number | string;
  akunPenaltiId?: string | null;
  // === Phase 1.B — field tambahan dari backend ===
  supplierId?: string | null;
  supplier?: { id: string; nama: string; alamat: string | null } | null;
  alokasi?: PaymentAllocationItem[];
  jurnal?: { id: string; noJurnal: string } | null;
  // === Update #02 — jenis transaksi ===
  jenisTransaksi?: string;
}

export interface PenerimaanRincianCreate {
  akunPerkiraanId: string;
  nilai: number;
  // === Update #16 — keterangan per baris rincian (kolom Catatan grid
  // detail, paritas Accurate "Penerimaan Lain") ===
  keterangan?: string | null;
}

export interface PenerimaanRincianResponse extends PenerimaanRincianCreate {
  id: string;
  akunPerkiraan: AkunPerkiraanSimple;
}

export interface PenerimaanKasCreate {
  tanggal: string;
  kasBankId: string;
  // === Update #16 — noNukti kini opsional (form ala Accurate tanpa field
  // No Bukti); kosong → backend auto-isi = nomor dokumen ===
  noNukti?: string | null;
  noCek?: string | null;
  pemberi?: string | null;
  catatan?: string | null;
  rincian: PenerimaanRincianCreate[];
  // === Update #02 — jenis transaksi kas (lihat JenisTransaksiKas) ===
  jenisTransaksi?: JenisTransaksiKas;
}

export interface PenerimaanKasResponse {
  id: string;
  noBukti: string;
  tanggal: string;
  kasBankId: string;
  noNukti: string;
  noCek: string | null;
  pemberi: string | null;
  catatan: string | null;
  autoPostJurnal: boolean;
  totalNilai: number;
  status: StatusTransaksi;
  jurnalUmumId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  kasBank: KasBankSimple | null;
  creator: PenggunaSimple | null;
  rincian: PenerimaanRincianResponse[];
  // === Update #5 — penalti pelunasan piutang (backend: pembayaran_kas.penalti) ===
  penalti?: number | string;
  akunPenaltiId?: string | null;
  // === Phase 1.B — field tambahan dari backend ===
  pelangganId?: string | null;
  // === Update #16 — relasi pelanggan (paritas supplier di PembayaranKasResponse;
  // dipakai laporan "Cetak Daftar Penerimaan" untuk baris settlement piutang) ===
  pelanggan?: { id: string; nama: string; alamat?: string | null } | null;
  alokasi?: PaymentAllocationItem[];
  jurnal?: { id: string; noJurnal: string } | null;
  // === Update #02 — jenis transaksi ===
  jenisTransaksi?: string;
}

// ── Update #02 — Jenis Transaksi Kas & Bank ────────────────────────────────
// Pilihan jenis transaksi pada form Penerimaan & Pembayaran:
// 1. PELUNASAN_INVOICE — pilih pihak → invoice outstanding → nominal → posting.
// 2. TRANSAKSI_LAINNYA — akun lawan bebas dari COA (non-invoice).
// (Update #14 — BELUM_TERIDENTIFIKASI dihapus bersama fitur Identifikasi
//  & Alokasi.)
export type JenisTransaksiKas = 'PELUNASAN_INVOICE' | 'TRANSAKSI_LAINNYA';

export const JENIS_TRANSAKSI_KAS_LABELS: Record<JenisTransaksiKas, string> = {
  PELUNASAN_INVOICE: 'Pelunasan Invoice',
  TRANSAKSI_LAINNYA: 'Transaksi Lainnya'
};

export interface TransferBankCreate {
  tanggal: string;
  dariKasBankId: string;
  keKasBankId: string;
  nilaiTransfer: number;
  biayaTransfer?: number;
  informasi?: string | null;
}

export interface TransferBankResponse {
  id: string;
  noTransfer: string;
  tanggal: string;
  dariKasBankId: string;
  keKasBankId: string;
  nilaiTransfer: number;
  biayaTransfer: number;
  informasi: string | null;
  autoPostJurnal: boolean;
  status: StatusTransaksi;
  jurnalUmumId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  dariKasBank: KasBankSimple | null;
  keKasBank: KasBankSimple | null;
  creator: PenggunaSimple | null;
}

export interface PembayaranKasUpdate {
  tanggal?: string;
  kasBankId?: string;
  noNukti?: string;
  noCek?: string | null;
  // === Update #16 — "Cek Kosong" (paritas Accurate; editable) ===
  cekKosong?: boolean | null;
  // === Update cetak "Bayar Pemasok" — info cek & mata uang (editable) ===
  tanggalCek?: string | null;
  jumlahCek?: number | string | null;
  mataUang?: string;
  nilaiTukar?: number | string;
  penerima?: string | null;
  catatan?: string | null;
  // === Update #02 — jenis immutable (nilai sama dengan tersimpan) ===
  jenisTransaksi?: JenisTransaksiKas;
}

export interface PenerimaanKasUpdate {
  tanggal?: string;
  kasBankId?: string;
  noNukti?: string;
  noCek?: string | null;
  pemberi?: string | null;
  catatan?: string | null;
  // === Update #02 — jenis immutable (nilai sama dengan tersimpan) ===
  jenisTransaksi?: JenisTransaksiKas;
}

export interface TransferBankUpdate {
  tanggal?: string;
  dariKasBankId?: string;
  keKasBankId?: string;
  nilaiTransfer?: number;
  biayaTransfer?: number;
  informasi?: string | null;
}

// ── Penjualan ────────────────────────────────────────────────────────

export interface SalesOrderDetailCreate {
  satuanId?: string | null;
  barangId: string;
  harga: number;
  qty: number;
  diskon?: number | null;
  subTotal?: number;
}

export interface SalesOrderDetailResponse extends SalesOrderDetailCreate {
  satuan?: { id: string; nama: string } | null;
  subTotal: number;
  id: string;
  barang: BarangSimple | null;
}

export interface SalesOrderCreate {
  currency?: string;
  customerPoNumber?: string | null;
  customerPoDate?: string | null;
  /** Update ASAHI (revisi SO): singkatan bebas nama perusahaan customer — segmen nomor SO "SO ASI/TBI/2026/001"; kosong → "SO ASI/-/2026/001". */
  customerCode?: string | null;

  tanggal: string;
  pelangganId: string;
  syaratBayarId?: string | null;
  tanggalPengiriman?: string | null;
  alamatPengiriman?: string | null;
  diskonGlobal?: number | null;
  ppn?: number;
  keterangan?: string | null;
  /** @deprecated Orders never post journals. */
  autoPostJurnal?: false;
  details: SalesOrderDetailCreate[];
  biayaTambahan?: TransaksiBiayaCreate[];
}

export interface SalesOrderUpdate {
  currency?: string | null;
  customerPoNumber?: string | null;
  customerPoDate?: string | null;
  details?: SalesOrderDetailCreate[];

  tanggal?: string;
  pelangganId?: string;
  syaratBayarId?: string | null;
  tanggalPengiriman?: string | null;
  alamatPengiriman?: string | null;
  diskonGlobal?: number | null;
  ppn?: number;
  keterangan?: string | null;
}

export interface SalesOrderResponse {
  currency?: string | null;
  customerPoNumber?: string | null;
  customerPoDate?: string | null;
  fulfillmentStatus?: string | null;
  /** Singkatan customer yang dipakai di nomor SO (immutable setelah create). */
  customerCode?: string | null;

  id: string;
  noPesanan: string;
  tanggal: string;
  pelangganId: string;
  syaratBayarId: string | null;
  tanggalPengiriman: string | null;
  alamatPengiriman: string | null;
  diskonGlobal: number;
  ppn: number;
  keterangan: string | null;
  /** @deprecated Retained only for legacy responses. */
  autoPostJurnal: boolean;
  subTotal: number;
  totalDiskon: number;
  totalPpn: number;
  totalBiayaTambahan: number;
  grandTotal: number;
  status: StatusPenjualan;
  jurnalUmumId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  pelanggan: PelangganSimple | null;
  syaratBayar: SyaratBayarSimple | null;
  creator: PenggunaSimple | null;
  jurnal: JurnalSimple | null;
  details: SalesOrderDetailResponse[];
  biayaTambahan: TransaksiBiayaResponse[];
}

export interface SalesInvoiceDetailCreate {
  barangId: string;
  harga: number;
  qty: number;
  diskon?: number | null;
  subTotal: number;
  // === Phase 4 — source-line trace (optional, kalau di-set dari delivery line) ===
  salesOrderDetailId?: string | null;
  deliveryDetailId?: string | null;
}

export interface SalesInvoiceDetailResponse extends SalesInvoiceDetailCreate {
  id: string;
  barang: BarangSimple | null;
  /** Update #5: nama satuan per baris (dari backend, untuk kolom Satuan di print) */
  satuan?: string | null;
}

export interface SalesInvoiceCreate {
  tanggal: string;
  pelangganId: string;
  // === Update #004: syaratBayarId / ekspedisi / tanggalPengiriman / diskonGlobal
  //     dihapus dari form invoice (field dokumen dihapus sesuai catatan user).
  //     Backend tetap menerima field tsb (opsional) demi kompatibilitas. ===
  salesOrderId?: string | null;
  alamatPengiriman?: string | null;
  mataUang?: string;
  ppn?: number;
  // === Update ASAHI — pilihan PPh23/PPN (bisa keduanya/salah satu/tidak sama sekali) ===
  ppnApplicable?: boolean;
  pph23Applicable?: boolean;
  pph23?: number;
  keterangan?: string | null;
  autoPostJurnal?: false;
  details: SalesInvoiceDetailCreate[];
  biayaTambahan?: TransaksiBiayaCreate[];
}

export interface SalesInvoiceUpdate {
  tanggal?: string;
  pelangganId?: string;
  // === Update #004: field berikut tidak lagi dikirim form (lihat SalesInvoiceCreate) ===
  salesOrderId?: string | null;
  alamatPengiriman?: string | null;
  mataUang?: string;
  ppn?: number;
  // === Update ASAHI — pilihan PPh23/PPN ===
  ppnApplicable?: boolean;
  pph23Applicable?: boolean;
  pph23?: number;
  keterangan?: string | null;
  autoPostJurnal?: boolean;
}

export interface SalesInvoiceResponse {
  id: string;
  noInvoice: string;
  // === Update #4 — No Surat Jalan ter-link (distinct via delivery detail, join koma; null bila dari SO langsung).
  noSuratJalan?: string | null;
  tanggal: string;
  pelangganId: string;
  syaratBayarId: string | null;
  salesOrderId: string | null;
  ekspedisi: string | null;
  tanggalPengiriman: string | null;
  alamatPengiriman: string | null;
  mataUang: string;
  diskonGlobal: number;
  ppn: number;
  // === Update ASAHI — pilihan PPh23/PPN ===
  ppnApplicable: boolean;
  pph23Applicable: boolean;
  pph23: number;
  totalPph23: number;
  keterangan: string | null;
  autoPostJurnal: boolean;
  subTotal: number;
  totalDiskon: number;
  totalPpn: number;
  totalBiayaTambahan: number;
  grandTotal: number;
  status: StatusPenjualan;
  jurnalUmumId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  pelanggan: PelangganSimple | null;
  syaratBayar: SyaratBayarSimple | null;
  salesOrder: SalesOrderSimple | null;
  creator: PenggunaSimple | null;
  jurnal: JurnalSimple | null;
  details: SalesInvoiceDetailResponse[];
  biayaTambahan: TransaksiBiayaResponse[];
}

export interface SalesReturDetailCreate {
  barangId: string;
  harga: number;
  qty: number;
  subTotal: number;
  // === Phase 4 — source-line trace (optional, kalau di-set dari invoice line) ===
  salesInvoiceDetailId?: string | null;
  pengirimanBarangDetailId?: string | null;
}

export interface SalesReturDetailResponse extends SalesReturDetailCreate {
  id: string;
  barang: BarangSimple | null;
  /** Update #5: nama satuan per baris (dari backend, untuk kolom Satuan di print) */
  satuan?: string | null;
}

export interface SalesReturCreate {
  tanggal: string;
  salesInvoiceId: string;
  pelangganId: string;
  pengirimanId?: string | null;
  gudangId?: string | null;
  alamatPengembalian?: string | null;
  noPengembalian?: string | null;
  diskonGlobal?: number | null;
  ppn?: number;
  keterangan?: string | null;
  autoPostJurnal?: false;
  details: SalesReturDetailCreate[];
}

export interface SalesReturUpdate {
  tanggal?: string;
  salesInvoiceId?: string;
  pelangganId?: string;
  pengirimanId?: string | null;
  gudangId?: string | null;
  alamatPengembalian?: string | null;
  noPengembalian?: string | null;
  diskonGlobal?: number | null;
  ppn?: number;
  keterangan?: string | null;
  autoPostJurnal?: boolean;
}

export interface SalesReturResponse {
  id: string;
  noRetur: string;
  tanggal: string;
  salesInvoiceId: string;
  pelangganId: string;
  pengirimanId: string | null;
  gudangId: string | null;
  alamatPengembalian: string | null;
  noPengembalian: string | null;
  diskonGlobal: number;
  ppn: number;
  keterangan: string | null;
  autoPostJurnal: boolean;
  subTotal: number;
  totalPpn: number;
  grandTotal: number;
  // AUD-12 (update #05) — PPh23 retur derived dari SI sumber (net-of-PPh23):
  // grand total retur = DPP + PPN − PPh23 retur (dihitung backend).
  pph23Applicable: boolean;
  pph23: number;
  totalPph23: number;
  status: StatusPenjualan;
  jurnalUmumId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Backend: SalesInvoiceSimpleResponse { id, no_invoice } — bukan Sales Order. */
  salesInvoice: { id: string; noInvoice: string } | null;
  pelanggan: PelangganSimple | null;
  pengiriman: { id: string; noSuratJalan: string } | null;
  gudang: GudangSimple | null;
  creator: PenggunaSimple | null;
  jurnal: JurnalSimple | null;
  details: SalesReturDetailResponse[];
}

export interface PengirimanBarangDetailCreate {
  barangId: string;
  qty: number;
  satuanId: string;
  // === Phase 4 — source-line trace (optional, kalau di-set dari SO line) ===
  salesOrderDetailId?: string | null;
}

export interface PengirimanBarangDetailResponse extends PengirimanBarangDetailCreate {
  id: string;
  barang: BarangSimple | null;
  satuan: { id: string; nama: string } | null;
}

export interface PengirimanBarangCreate {
  tanggal: string;
  salesOrderId: string;
  pelangganId: string;
  gudangId?: string | null;
  // === Update #004: field Ekspedisi dihapus dari form DO (backend tetap opsional) ===
  alamatPengiriman?: string | null;
  keterangan?: string | null;
  details: PengirimanBarangDetailCreate[];
}

export interface PengirimanBarangUpdate {
  tanggal?: string;
  salesOrderId?: string;
  pelangganId?: string;
  gudangId?: string | null;
  alamatPengiriman?: string | null;
  keterangan?: string | null;
}

export interface PengirimanBarangResponse {
  id: string;
  noSuratJalan: string;
  tanggal: string;
  salesOrderId: string;
  pelangganId: string;
  gudangId: string | null;
  ekspedisi: string | null;
  alamatPengiriman: string | null;
  keterangan: string | null;
  status: StatusPenjualan;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** UUID jurnal umum hasil posting HPP (saat finish_pengiriman), atau null. */
  jurnalUmumId: string | null;
  salesOrder: SalesOrderSimple | null;
  pelanggan: PelangganSimple | null;
  gudang: GudangSimple | null;
  creator: PenggunaSimple | null;
  details: PengirimanBarangDetailResponse[];
}

// ── Pembelian ────────────────────────────────────────────────────────

/** Update #002: ringkasan SO ter-link pada baris detail PO (nested, untuk display). */
export interface SalesOrderMini {
  id: string;
  noPesanan: string;
  pelangganNama: string | null;
}

export interface PurchaseOrderDetailCreate {
  satuanId?: string | null;
  barangId: string;
  harga: number;
  qty: number;
  diskon?: number | null;
  subTotal?: number;
  // === Update #002 — tracking per baris: SO asal + jenis belanja ===
  salesOrderId?: string | null;
  jenisPembelian?: string | null;
}

export interface PurchaseOrderDetailResponse extends PurchaseOrderDetailCreate {
  satuan?: { id: string; nama: string } | null;
  subTotal: number;
  id: string;
  barang: BarangSimple | null;
  /** Update #002: SO ter-link per baris (null bila baris bukan untuk SO tertentu). */
  salesOrder?: SalesOrderMini | null;
}

export interface PurchaseOrderCreate {
  currency?: string;
  syaratBayarId?: string | null;
  // === Update ASAHI #3 — alamat pengiriman (wajib pilih satu) ===
  alamatPengirimanId: string;
  // === Update #003 — checkbox PPIC dihapus dari form PO ===
  // === Update #002 — snapshot PIC gudang untuk cetak PO ===
  picGudang?: string | null;
  picGudangTelepon?: string | null;

  tanggal: string;
  supplierId: string;
  tanggalKirim?: string | null;
  alamat?: string | null;
  diskonGlobal?: number | null;
  ppn?: number;
  // === Update ASAHI — pilihan PPh23/PPN (bisa keduanya/salah satu/tidak sama sekali) ===
  ppnApplicable?: boolean;
  pph23Applicable?: boolean;
  pph23?: number;
  keterangan?: string | null;
  /** @deprecated Orders never post journals. */
  autoPostJurnal?: false;
  details: PurchaseOrderDetailCreate[];
  biayaTambahan?: TransaksiBiayaCreate[];
}

export interface PurchaseOrderUpdate {
  currency?: string | null;
  syaratBayarId?: string | null;
  // === Update ASAHI #3 ===
  alamatPengirimanId?: string | null;
  // === Update #003 — ppic dihapus ===
  // === Update #002 — snapshot PIC gudang (string kosong = hapus) ===
  picGudang?: string | null;
  picGudangTelepon?: string | null;
  details?: PurchaseOrderDetailCreate[];

  tanggal?: string;
  supplierId?: string;
  tanggalKirim?: string | null;
  alamat?: string | null;
  diskonGlobal?: number | null;
  ppn?: number;
  // === Update ASAHI — pilihan PPh23/PPN ===
  ppnApplicable?: boolean;
  pph23Applicable?: boolean;
  pph23?: number;
  keterangan?: string | null;
}

export interface PurchaseOrderResponse {
  currency?: string | null;
  syaratBayarId?: string | null;
  syaratBayar?: SyaratBayarSimple | null;
  supplierNameSnapshot?: string | null;
  // === Update ASAHI #3 — alamat pengiriman ===
  alamatPengirimanId?: string | null;
  /** Snapshot teks "<prefix>\n<nama>" — dipakai untuk cetak PO. */
  alamatPengiriman?: string | null;
  // === Update #003 — ppic dihapus dari form/cetak PO ===
  // === Update #002 — snapshot PIC gudang untuk cetak PO ===
  picGudang?: string | null;
  picGudangTelepon?: string | null;

  id: string;
  noPesanan: string;
  tanggal: string;
  supplierId: string;
  tanggalKirim: string | null;
  alamat: string | null;
  diskonGlobal: number;
  ppn: number;
  // === Update ASAHI — pilihan PPh23/PPN ===
  ppnApplicable: boolean;
  pph23Applicable: boolean;
  pph23: number;
  totalPph23: number;
  keterangan: string | null;
  /** @deprecated Retained only for legacy responses. */
  autoPostJurnal: boolean;
  subTotal: number;
  totalDiskon: number;
  totalPpn: number;
  totalBiayaTambahan: number;
  grandTotal: number;
  status: StatusPenjualan;
  jurnalUmumId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  supplier: SupplierSimple | null;
  creator: PenggunaSimple | null;
  jurnal: JurnalSimple | null;
  details: PurchaseOrderDetailResponse[];
  biayaTambahan: TransaksiBiayaResponse[];
}

export interface PurchaseInvoiceDetailCreate {
  satuanId?: string | null;
  barangId: string;
  harga: number;
  qty: number;
  diskon?: number | null;
  subTotal: number;
  // === Phase 5 — source-line trace (optional, kalau di-set dari receipt line) ===
  purchaseOrderDetailId?: string | null;
  penerimaanBarangDetailId?: string | null;
}

export interface PurchaseInvoiceDetailResponse extends PurchaseInvoiceDetailCreate {
  satuan?: SatuanSimple | null;
  id: string;
  barang: BarangSimple | null;
  /** Update #5: nama satuan per baris sebagai string (dari backend, untuk kolom Satuan di print) */
  satuanNama?: string | null;
}

export interface PurchaseInvoiceCreate {
  purchaseOrderId?: string | null;
  invoiceType?: string | null;
  tanggal: string;
  supplierId: string;
  noFaktur: string;
  alamat?: string | null;
  diskonGlobal?: number | null;
  ppn?: number;
  // AUD-09 (update #04) — PPh 23 opsional di PI (persen 0-100; hutang net +
  // Cr Hutang PPh 23 saat posting). pph23 hanya dipakai bila pph23Applicable.
  pph23?: number;
  pph23Applicable?: boolean;
  keterangan?: string | null;
  autoPostJurnal?: false;
  details: PurchaseInvoiceDetailCreate[];
  biayaTambahan?: TransaksiBiayaCreate[];
}

export interface PurchaseInvoiceUpdate {
  purchaseOrderId?: string | null;
  invoiceType?: string | null;
  tanggal?: string;
  supplierId?: string;
  noFaktur?: string | null;
  alamat?: string | null;
  diskonGlobal?: number | null;
  ppn?: number;
  // AUD-09 — PPh 23 PI (hanya bisa diubah saat masih draft)
  pph23?: number;
  pph23Applicable?: boolean;
  keterangan?: string | null;
  autoPostJurnal?: boolean;
}

export interface PurchaseInvoiceResponse {
  purchaseOrderId?: string | null;
  invoiceType?: string | null;
  purchaseOrder?: PurchaseOrderSimple | null;
  id: string;
  noForm: string;
  noFaktur: string;
  tanggal: string;
  supplierId: string;
  alamat: string | null;
  diskonGlobal: number;
  ppn: number;
  // AUD-09 (update #04) — PPh 23 pada Purchase Invoice
  pph23: number | null;
  pph23Applicable: boolean;
  totalPph23: number;
  keterangan: string | null;
  autoPostJurnal: boolean;
  subTotal: number;
  totalDiskon: number;
  totalPpn: number;
  totalBiayaTambahan: number;
  grandTotal: number;
  status: StatusPenjualan;
  jurnalUmumId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  supplier: SupplierSimple | null;
  creator: PenggunaSimple | null;
  jurnal: JurnalSimple | null;
  details: PurchaseInvoiceDetailResponse[];
  biayaTambahan: TransaksiBiayaResponse[];
}

export interface PurchaseReturDetailCreate {
  barangId: string;
  harga: number;
  qty: number;
  subTotal: number;
  // === Phase 5 — source-line trace (optional, kalau di-set dari invoice/receipt line) ===
  purchaseOrderDetailId?: string | null;
  penerimaanBarangDetailId?: string | null;
  purchaseInvoiceDetailId?: string | null;
}

export interface PurchaseReturDetailResponse extends PurchaseReturDetailCreate {
  id: string;
  barang: BarangSimple | null;
  /** Update #5: nama satuan per baris (dari backend, untuk kolom Satuan di print) */
  satuan?: string | null;
}

export interface PurchaseReturCreate {
  tanggal: string;
  purchaseOrderId: string;
  supplierId: string;
  /** Audit COA: wajib diisi — backend reject saat finish_retur jika kosong. Link ke invoice sumber untuk control_account. */
  purchaseInvoiceId?: string | null;
  gudangId?: string | null;
  alamat?: string | null;
  ppn?: number;
  keterangan?: string | null;
  autoPostJurnal?: false;
  details: PurchaseReturDetailCreate[];
}

export interface PurchaseReturUpdate {
  tanggal?: string;
  purchaseOrderId?: string | null;
  supplierId?: string;
  /** Audit COA: kirim null untuk hapus link. Hilangkan field untuk preserve. */
  purchaseInvoiceId?: string | null;
  gudangId?: string | null;
  alamat?: string | null;
  ppn?: number;
  keterangan?: string | null;
  autoPostJurnal?: boolean;
}

export interface PurchaseReturResponse {
  id: string;
  noRetur: string;
  tanggal: string;
  purchaseOrderId: string;
  supplierId: string;
  /** Audit COA: UUID invoice sumber, atau null. */
  purchaseInvoiceId: string | null;
  gudangId: string | null;
  alamat: string | null;
  ppn: number;
  keterangan: string | null;
  autoPostJurnal: boolean;
  subTotal: number;
  totalPpn: number;
  grandTotal: number;
  status: StatusPenjualan;
  jurnalUmumId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  purchaseOrder: PurchaseOrderSimple | null;
  supplier: SupplierSimple | null;
  gudang: GudangSimple | null;
  creator: PenggunaSimple | null;
  jurnal: JurnalSimple | null;
  details: PurchaseReturDetailResponse[];
}

export interface PenerimaanBarangDetailCreate {
  barangId: string;
  qty: number;
  satuanId: string;
  hargaPerolehan?: number | null;
  tanggalKedaluwarsa?: string | null;
  // === Phase 5 — source-line trace (optional, kalau di-set dari PO line) ===
  purchaseOrderDetailId?: string | null;
}

export interface PenerimaanBarangDetailResponse extends PenerimaanBarangDetailCreate {
  id: string;
  barang: BarangSimple | null;
  satuan: { id: string; nama: string } | null;
}

export interface PenerimaanBarangCreate {
  tanggal: string;
  purchaseOrderId: string;
  supplierId: string;
  gudangId?: string | null;
  alamat?: string | null;
  keterangan?: string | null;
  details: PenerimaanBarangDetailCreate[];
  /** Tahap 2: opsional. Link ke Purchase Invoice yang belum di-POST (status DRAFT/DIPROSES). */
  purchaseInvoiceId?: string | null;
}

export interface PenerimaanBarangUpdate {
  tanggal?: string;
  purchaseOrderId?: string | null;
  supplierId?: string;
  gudangId?: string | null;
  alamat?: string | null;
  keterangan?: string | null;
  /** Tahap 2: kirim null eksplisit untuk mengosongkan link. Hilangkan field untuk preserve link lama. */
  purchaseInvoiceId?: string | null;
}

export interface PenerimaanBarangResponse {
  id: string;
  noForm: string;
  tanggal: string;
  purchaseOrderId: string;
  supplierId: string;
  gudangId: string | null;
  alamat: string | null;
  keterangan: string | null;
  status: StatusPenjualan;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Tahap 2: UUID invoice yang di-link, atau null. */
  purchaseInvoiceId: string | null;
  /** Tahap 2: UUID jurnal umum hasil posting (saat finish_penerimaan), atau null. */
  jurnalUmumId: string | null;
  purchaseOrder: PurchaseOrderSimple | null;
  supplier: SupplierSimple | null;
  gudang: GudangSimple | null;
  creator: PenggunaSimple | null;
  details: PenerimaanBarangDetailResponse[];
}

// ── LPPB — Laporan Pemeriksaan & Pengujian Barang (Update ASAHI #005) ──

export interface LppbDetailCreate {
  urutan: number;
  /** Null = baris jasa pengujian manual (mis. NDT, berpasangan di bawah barangnya). */
  barangId?: string | null;
  purchaseOrderDetailId?: string | null;
  kodeMaterial?: string | null;
  deskripsiSpesifikasi: string;
  satuan?: string | null;
  qtyPo: number;
  qtyPenerimaan: number;
  qtyBaik: number;
  qtyTidakBaik: number;
}

export interface LppbDetailResponse extends LppbDetailCreate {
  id: string;
  qtySudahDiterima: number;
  qtyBelumDiterima: number;
}

export interface LppbCreate {
  tanggal: string;
  purchaseOrderId: string;
  tanggalTerima?: string | null;
  nomorDo?: string | null;
  nomorRi?: string | null;
  proyek?: string | null;
  revisi?: string | null;
  noFormat?: string | null;
  keterangan?: string | null;
  mengetahuiJabatan?: string | null;
  mengetahuiNama?: string | null;
  details: LppbDetailCreate[];
}

export interface LppbUpdate {
  tanggal?: string;
  purchaseOrderId?: string;
  tanggalTerima?: string | null;
  nomorDo?: string | null;
  nomorRi?: string | null;
  proyek?: string | null;
  revisi?: string | null;
  noFormat?: string | null;
  keterangan?: string | null;
  mengetahuiJabatan?: string | null;
  mengetahuiNama?: string | null;
  details?: LppbDetailCreate[];
}

export interface LppbResponse {
  id: string;
  noForm: string;
  tanggal: string;
  tanggalTerima: string | null;
  purchaseOrderId: string;
  supplierId: string;
  nomorDo: string | null;
  nomorRi: string | null;
  proyek: string | null;
  revisi: string | null;
  noFormat: string | null;
  keterangan: string | null;
  mengetahuiJabatan: string | null;
  mengetahuiNama: string | null;
  status: StatusPenjualan;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  totalItem?: number;
  purchaseOrder: PurchaseOrderSimple | null;
  supplier: SupplierSimple | null;
  creator: PenggunaSimple | null;
  details: LppbDetailResponse[];
}

// ── Persediaan ───────────────────────────────────────────────────────

export interface PenyesuaianStokCreate {
  tanggalKedaluwarsa?: string | null;
  tanggal: string;
  barangId: string;
  gudangId?: string | null;
  tipe: TipePenyesuaian;
  qty: number;
  biayaSatuan?: number;
  alasan?: string | null;
  autoPostJurnal?: boolean;
}

export interface PenyesuaianStokUpdate {
  tanggalKedaluwarsa?: string | null;
  tanggal?: string;
  barangId?: string;
  gudangId?: string | null;
  tipe?: TipePenyesuaian;
  qty?: number;
  biayaSatuan?: number;
  alasan?: string | null;
  autoPostJurnal?: boolean;
}

export interface PenyesuaianStokResponse {
  tanggalKedaluwarsa?: string | null;
  id: string;
  noAdj: string;
  tanggal: string;
  barangId: string;
  gudangId: string | null;
  tipe: TipePenyesuaian;
  qty: number;
  biayaSatuan: number;
  alasan: string | null;
  autoPostJurnal: boolean;
  total: number;
  status: StatusPersediaan;
  jurnalUmumId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  barang: BarangSimple | null;
  gudang: GudangSimple | null;
  creator: PenggunaSimple | null;
  jurnal: JurnalSimple | null;
}

export interface PemindahanBarangCreate {
  tanggal: string;
  proses: ProsesPemindahan;
  dariGudangId: string;
  keGudangId: string;
  barangId: string;
  qty: number;
  autoPostJurnal?: boolean;
  keterangan?: string | null;
}

export interface PemindahanBarangUpdate {
  tanggal?: string;
  proses?: ProsesPemindahan;
  dariGudangId?: string;
  keGudangId?: string;
  barangId?: string;
  qty?: number;
  autoPostJurnal?: boolean;
  keterangan?: string | null;
}

export interface PemindahanBarangResponse {
  id: string;
  noPemindahan: string;
  tanggal: string;
  proses: ProsesPemindahan;
  dariGudangId: string;
  keGudangId: string;
  barangId: string;
  qty: number;
  autoPostJurnal: boolean;
  keterangan: string | null;
  status: StatusPersediaan;
  jurnalUmumId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  dariGudang: GudangSimple | null;
  keGudang: GudangSimple | null;
  barang: BarangSimple | null;
  creator: PenggunaSimple | null;
  jurnal: JurnalSimple | null;
}

export interface PermintaanBarangCreate {
  tanggal: string;
  barangId: string;
  qty: number;
  diajukanOleh: string;
  keterangan?: string | null;
  // === Update #4 — link opsional ke Sales Order (informasional). ===
  salesOrderId?: string | null;
}

export interface PermintaanBarangUpdate {
  tanggal?: string;
  barangId?: string;
  qty?: number;
  diajukanOleh?: string;
  keterangan?: string | null;
  salesOrderId?: string | null;
}

export interface PermintaanBarangResponse {
  id: string;
  noPermintaan: string;
  tanggal: string;
  barangId: string;
  qty: number;
  diajukanOleh: string;
  keterangan: string | null;
  status: StatusPersediaan;
  jurnalUmumId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  barang: BarangSimple | null;
  creator: PenggunaSimple | null;
  jurnal: JurnalSimple | null;
  // === Update #4 — link SO (informasional). ===
  salesOrderId?: string | null;
  salesOrder?: SalesOrderSimple | null;
}

// ── Aset Tetap ───────────────────────────────────────────────────────

// Acquisition source type (Phase 7 — Roadmap §24: "Acquisition source trace")
// Sumber: app/models/transaksi/aset_tetap/aset_tetap.py AcquisitionSourceType
export type AcquisitionSourceType = 'MANUAL_JOURNAL' | 'PURCHASE_INVOICE' | 'SALDO_AWAL' | 'DIRECT';

export const ACQUISITION_SOURCE_TYPE_OPTIONS: { value: AcquisitionSourceType; label: string }[] = [
  { value: 'DIRECT', label: 'Direct (tanpa source dokumen)' },
  { value: 'MANUAL_JOURNAL', label: 'Jurnal Manual' },
  { value: 'PURCHASE_INVOICE', label: 'Purchase Invoice' },
  { value: 'SALDO_AWAL', label: 'Saldo Awal' }
];

export interface AsetTetapCreate {
  kode: string;
  nama: string;
  kategoriAsetId: string;
  akunAsetId: string;
  akunAkumulasiId: string;
  akunBebanId: string;
  kuantitas?: number;
  nilaiPerolehan?: number;
  tanggalMulai: string;
  catatan?: string | null;
  autoPostJurnal?: boolean;
  // === Phase 7 — acquisition source (opsional) ===
  acquisitionSourceType?: AcquisitionSourceType | null;
  acquisitionSourceId?: string | null;
  acquisitionDate?: string | null; // ISO date (YYYY-MM-DD)
}

export interface AsetTetapResponse {
  id: string;
  kode: string;
  nama: string;
  kategoriAsetId: string;
  akunAsetId: string;
  akunAkumulasiId: string;
  akunBebanId: string;
  kuantitas: number;
  nilaiPerolehan: number;
  tanggalMulai: string;
  catatan: string | null;
  autoPostJurnal: boolean;
  status: StatusAsetTetap;
  umurAset?: number;
  metodePenyusutan?: MetodePenyusutan;
  nilaiSisa?: number;
  nilaiBuku?: number;
  akumulasiPenyusutan?: number;
  penyusutanPerBulan?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  kategoriAset: { id: string; kode: string; nama: string } | null;
  akunAset: AkunPerkiraanSimple | null;
  akunAkumulasi: AkunPerkiraanSimple | null;
  akunBeban: AkunPerkiraanSimple | null;
  creator: PenggunaSimple | null;
  // === Phase 7 — acquisition source (opsional, kalau di-set saat create) ===
  acquisitionSourceType?: AcquisitionSourceType | null;
  acquisitionSourceId?: string | null;
  acquisitionSourceNo?: string | null;
  acquisitionDate?: string | null; // ISO date (YYYY-MM-DD)
}

export interface AsetTetapUpdate {
  kode?: string;
  nama?: string;
  kategoriAsetId?: string;
  akunAsetId?: string;
  akunAkumulasiId?: string;
  akunBebanId?: string;
  kuantitas?: number;
  nilaiPerolehan?: number;
  tanggalMulai?: string;
  catatan?: string | null;
  autoPostJurnal?: boolean;
  // === Phase 7 — acquisition source (opsional) ===
  acquisitionSourceType?: AcquisitionSourceType | null;
  acquisitionSourceId?: string | null;
  acquisitionDate?: string | null;
}

// ── Asset Register Reconciliation (Phase 7 — Roadmap §24) ──────────────────
// GET /aset-tetap/rekonsiliasi/register-vs-gl

export interface AssetReconciliationSummary {
  totalNilaiPerolehanRegister: number | string;
  totalAkumulasiPenyusutanRegister: number | string;
  totalNilaiBukuRegister: number | string;
  totalAssetCount: number;
}

export interface AssetReconciliationPerAkun {
  akunAsetId: string;
  akunAsetKode: string;
  akunAsetNama: string;
  nilaiPerolehanRegister: number | string;
  saldoGlCost: number | string;
  selisihCost: number | string;
  akunAkumulasiId: string;
  akunAkumulasiKode: string;
  akunAkumulasiNama: string;
  akumulasiPenyusutanRegister: number | string;
  saldoGlAccum: number | string;
  selisihAccum: number | string;
  assetCount: number;
}

export interface AssetReconciliationResponse {
  basis: string;
  asOf: string;
  summary: AssetReconciliationSummary;
  perAkun: AssetReconciliationPerAkun[];
  catatan: string;
}

// GET /aset-tetap/rekonsiliasi/register-vs-gl/summary
export interface AssetReconciliationSummaryResponse {
  basis: string;
  asOf: string;
  summary: AssetReconciliationSummary;
  reconciliationStatus: 'MATCH' | 'MISMATCH';
  akunCount: number;
}

// ── Jurnal Umum (General Ledger) ─────────────────────────────────────

// RefModule enum — sesuai backend app/models/transaksi/jurnal.py
// Setelah RefModule refactor Phase 1: 26 enum (20 canonical + 6 legacy).
// Sumber kebenaran: endpoint GET /jurnal/ref-modules (lihat src/lib/ref-module.ts).
export type RefModule =
  // === Accounting / GL ===
  | 'MANUAL'
  | 'SALDO_AWAL'
  | 'PENUTUPAN_PERIODE'
  // === Penjualan (Sales) ===
  | 'SALES_ORDER'
  | 'SALES_DELIVERY'
  | 'SALES_INVOICE'
  | 'SALES_RETUR'
  | 'AR_SETTLEMENT'
  // === Pembelian (Purchase) ===
  | 'PURCHASE_ORDER'
  | 'PURCHASE_RECEIPT'
  | 'PURCHASE_INVOICE'
  | 'PURCHASE_RETUR'
  | 'AP_SETTLEMENT'
  // === Persediaan ===
  | 'INVENTORY_ADJUSTMENT'
  | 'INVENTORY_TRANSFER'
  // === Aset Tetap ===
  | 'ASSET_CAPITALIZATION'
  | 'ASSET_DEPRECIATION'
  | 'ASSET_DISPOSAL'
  // === Kas & Bank ===
  | 'BANK_TRANSFER'
  | 'BANK_RECONCILIATION'
  // === Legacy (jangan dipakai untuk transaksi baru) ===
  | 'PEMBAYARAN'
  | 'PENERIMAAN'
  | 'TRANSFER_BANK'
  | 'PENYESUAIAN_STOK'
  | 'PENYUSUTAN'
  | 'REKONSILIASI_BANK';

// RefModule option — single source of truth dari backend.
// Frontend HARUS fetch via /jurnal/ref-modules (lihat src/lib/ref-module.ts),
// jangan hardcode daftar enum di komponen.
export interface RefModuleOption {
  value: string;
  label: string;
  group: string;
  isLegacy: boolean;
}

export type StatusJurnal = 'POSTED' | 'DRAFT';

export interface JurnalDetailItem {
  id: string;
  akunPerkiraanId: string;
  debit: number;
  kredit: number;
  keterangan: string | null;
  akunPerkiraan: { id: string; kode: string; nama: string };
}

export interface JurnalUmumListResponse {
  id: string;
  noJurnal: string;
  tanggal: string;
  tipeTransaksi: string | null;
  refModule: RefModule | null;
  refNo: string | null;
  /** ID jurnal sumber bila ini jurnal pembalik (reversal) — tidak bisa diedit manual. */
  reversalOfId?: string | null;
  totalDebit: number;
  totalKredit: number;
  keterangan: string | null;
  status: StatusJurnal;
  createdBy: string;
  creator: { id: string; username: string; namaLengkap: string };
  createdAt: string;
}

export interface JurnalUmumDetailResponse extends JurnalUmumListResponse {
  refId: string | null;
  details: JurnalDetailItem[];
  updatedAt: string;
}

export interface JurnalManualDetailCreate {
  akunPerkiraanId: string;
  debit: number;
  kredit: number;
  keterangan?: string;
}

export interface JurnalManualCreate {
  tanggal: string;
  keterangan: string;
  details: JurnalManualDetailCreate[];
}

// ── Pengguna (User CRUD) ─────────────────────────────────────────────

export interface PenggunaResponse {
  id: string;
  username: string;
  namaLengkap: string;
  email: string;
  role: RolePengguna;
  status: string;
  createdAt: string;
}

export interface PenggunaCreate {
  username: string;
  namaLengkap: string;
  email: string;
  password: string;
  role?: RolePengguna;
}

export interface PenggunaUpdate {
  namaLengkap?: string;
  email?: string;
  password?: string;
  role?: RolePengguna;
  status?: string;
}

// ── Karyawan (Employee CRUD) ─────────────────────────────────────────

export type Departemen = 'DIREKSI' | 'KEUANGAN' | 'AKUNTANSI' | 'GUDANG' | 'PENJUALAN' | 'ADMINISTRASI' | 'PRODUKSI';

export interface KaryawanResponse {
  id: string;
  nik: string;
  nama: string;
  jabatan: string | null;
  departemen: Departemen | null;
  email: string | null;
  noHp: string | null;
  akunPiutangId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  akunPiutang: { id: string; kode: string; nama: string };
}

export interface KaryawanCreate {
  nik: string;
  nama: string;
  jabatan?: string | null;
  departemen?: Departemen | null;
  email?: string | null;
  noHp?: string | null;
  akunPiutangId: string;
}

export interface KaryawanUpdate {
  nama?: string;
  jabatan?: string | null;
  departemen?: Departemen | null;
  email?: string | null;
  noHp?: string | null;
  akunPiutangId?: string | null;
  status?: string;
}

// ── Dashboard ─────────────────────────────────────────────────────────

export interface LabaRugiWidget {
  pendapatan: number;
  hpp: number;
  labaKotor: number;
  beban: number;
  labaBersih: number;
  // === Update #7 / M-02: laba usaha (laba kotor − beban operasional, sebelum
  // pendapatan lain-lain). Opsional — backend lama tidak mengirim.
  labaUsaha?: number | string;
}

export interface CashflowWidget {
  saldoAwal: number;
  penerimaan: number;
  pengeluaran: number;
  saldoAkhir: number;
}

export interface BebanBiayaItem {
  namaBeban: string;
  jumlah: number;
}

export interface BebanBiayaWidget {
  items: BebanBiayaItem[];
}

export interface TrenPenjualanItem {
  bulan: string;
  total: number;
}

export interface TrenPenjualanWidget {
  items: TrenPenjualanItem[];
  // === Phase 10 — label_note: penjelasan bahwa ini Invoice Turnover, bukan GL Revenue ===
  labelNote?: string | null;
}

export interface FakturJatuhTempoItem {
  noFaktur: string;
  pelanggan: string;
  jumlah: number; // remaining outstanding (bukan original)
  jatuhTempo: string;
  status: string; // "OVERDUE" jika jatuh tempo sudah lewat
  // === Phase 10 — field baru ===
  isOverdue?: boolean;
  originalNilai?: number | null; // original invoice amount (for reference)
}

export interface AktivitasItem {
  tipe: string;
  deskripsi: string;
  nomor: string;
  tanggal: string;
  jumlah: number | null;
}

// === Phase 10 — 3 widget baru di Dashboard Summary ===

export interface InventoryValueWidget {
  totalNilai: number | string;
  totalQty: number;
  barangCount: number;
  asOf?: string | null;
}

export interface LowStockItem {
  barangId: string;
  kode: string;
  nama: string;
  stok: number;
  stokMinimum: number;
  selisih: number;
}

export interface LowStockWidget {
  count: number;
  items: LowStockItem[];
}

export interface AccountingHealthSummaryWidget {
  overallStatus: string; // "HEALTHY" | "ISSUES_FOUND" | "UNKNOWN"
  matchCount: number;
  mismatchCount: number;
  notConfiguredCount: number;
  totalChecks: number;
  error?: string | null;
}

export interface DashboardSummaryResponse {
  // === Update #018 — dashboard per role: SEMUA section opsional. Backend
  // hanya mengirim section yang cocok dengan permission user
  // (lihat SECTION_PERMISSIONS di endpoints/dashboard.py). ===
  labaRugi?: LabaRugiWidget | null;
  cashflow?: CashflowWidget | null;
  bebanBiaya?: BebanBiayaWidget | null;
  trenPenjualan?: TrenPenjualanWidget | null;
  fakturJatuhTempo?: { items: FakturJatuhTempoItem[] } | null;
  aktivitasTerbaru?: { items: AktivitasItem[] } | null;
  // === Phase 10 — 3 widget baru (optional, null kalau service error) ===
  inventoryValue?: InventoryValueWidget | null;
  lowStock?: LowStockWidget | null;
  accountingHealth?: AccountingHealthSummaryWidget | null;
  // === Update #018 — widget Produksi & Pembelian (dashboard per role) ===
  produksi?: ProduksiWidget | null;
  pembelian?: PembelianWidget | null;
}

// === Update #018 — Widget Produksi (role Staf Engineering dll.) ===

export interface ProduksiRopTerbaruItem {
  id: string;
  noRop: string;
  tanggal?: string | null;
  projectName: string;
  model?: string | null;
  status: string; // "DRAFT" | "DIBUAT"
  totalItem: number;
}

export interface ProduksiWidget {
  totalRop: number;
  draft: number;
  dibuat: number;
  totalPart: number;
  terbaru: ProduksiRopTerbaruItem[];
}

// === Update #018 — Widget Pembelian (role Staf Pembelian dll.) ===

export interface PembelianPoItem {
  id: string;
  noPesanan: string;
  tanggal?: string | null;
  supplier: string;
  grandTotal: number | string;
  status: string; // DRAFT | DIPROSES | SELESAI | DIBATALKAN
}

export interface PembelianWidget {
  totalPo: number;
  draft: number;
  diproses: number;
  selesai: number;
  dibatalkan: number;
  nilaiOpen: number | string;
  terbaru: PembelianPoItem[];
}

// ── Laporan ───────────────────────────────────────────────────────────

export interface LaporanPeriode {
  dari: string | null;
  sampai: string | null;
}

export interface LaporanAkunItem {
  kodeAkun: string;
  namaAkun: string;
  total: number;
}

export interface LabaRugiLaporanResponse {
  periode: LaporanPeriode;
  pendapatan: LaporanAkunItem[];
  hpp: LaporanAkunItem[];
  beban: LaporanAkunItem[];
  // === Update #7 / M-02: section pendapatan lain-lain (akun report_group OTHER_INCOME,
  // mis. bunga/pendapatan non-operasional) dipisah dari pendapatan usaha, plus total
  // laba usaha (laba kotor − beban). Opsional — backend lama tidak mengirim.
  // Variasi snake_case disediakan sebagai fallback bila respons tidak memakai alias camelCase.
  pendapatanLain?: LaporanAkunItem[];
  pendapatan_lain?: LaporanAkunItem[];
  totalPendapatan: number;
  totalHpp: number;
  totalBeban: number;
  totalPendapatanLain?: number | string;
  total_pendapatan_lain?: number | string;
  labaKotor: number;
  labaBersih: number;
  labaUsaha?: number | string;
  laba_usaha?: number | string;
}

export interface NeracaLaporanResponse {
  tanggal: string;
  aset: LaporanAkunItem[];
  kewajiban: LaporanAkunItem[];
  ekuitas: LaporanAkunItem[];
  totalAset: number;
  totalKewajiban: number;
  totalEkuitas: number;
}

export interface ArusKasCounterAccount {
  accountId?: string | null;
  accountCode?: string | null;
  accountName?: string | null;
  jumlah: number;
}

export interface ArusKasItem {
  // Legacy (tetap dikirim backend untuk backward compatibility)
  nama: string;
  jumlah: number;
  journalId?: string | null;
  noJurnal?: string | null;
  // === Revisi: identitas COA & narasi (additive) ===
  category?: 'OPERASIONAL' | 'INVESTASI' | 'PEMBIAYAAN' | 'BELUM_DIKLASIFIKASIKAN' | null;
  direction?: 'INFLOW' | 'OUTFLOW' | null;
  accountId?: string | null;
  accountCode?: string | null;
  accountName?: string | null;
  cashAccountId?: string | null;
  cashAccountCode?: string | null;
  cashAccountName?: string | null;
  transactionDescription?: string | null;
  lineDescription?: string | null;
  sourceModule?: string | null;
  sourceId?: string | null;
  sourceNo?: string | null;
  tanggal?: string | null;
  reversalOfId?: string | null;
  reversalOfNoJurnal?: string | null;
  allocationStatus?: 'EXACT' | 'MIXED_UNALLOCATED' | null;
  counterAccounts?: ArusKasCounterAccount[];
}

export interface ArusKasAccountGroup {
  accountId?: string | null;
  accountCode?: string | null;
  accountName?: string | null;
  inflow: number;
  outflow: number;
  net: number;
  transactionCount: number;
}

export interface ArusKasBagian {
  items: ArusKasItem[];
  total: number;
  // Ringkasan per akun lawan (additive; diisi view=detail & summary)
  accountGroups?: ArusKasAccountGroup[];
}

export interface ArusKasLaporanResponse {
  periode: LaporanPeriode;
  operasional: ArusKasBagian;
  investasi: ArusKasBagian;
  pembiayaan: ArusKasBagian;
  belumDiklasifikasikan?: ArusKasBagian;
  jumlahJurnalBelumDiklasifikasi?: number;
  klasifikasiLengkap?: boolean;
  selisihRekonsiliasi?: number;
  netChange: number;
  saldoAwal: number;
  saldoAkhir: number;
}

export interface BukuBesarAkunInfo {
  kode: string;
  nama: string;
}

export interface BukuBesarTransaksi {
  tanggal: string;
  noJurnal: string;
  deskripsi: string;
  debit: number;
  kredit: number;
  saldo: number;
}

export interface BukuBesarLaporanResponse {
  akun: BukuBesarAkunInfo;
  periode: LaporanPeriode;
  saldoAwal: number;
  transaksi: BukuBesarTransaksi[];
  totalDebit: number;
  totalKredit: number;
  saldoAkhir: number;
}

export interface MutasiKasBankTransaksi {
  tanggal: string;
  noJurnal: string;
  deskripsi: string;
  debit: number;
  kredit: number;
  saldo: number;
}

export interface MutasiKasBankLaporanResponse {
  akun: BukuBesarAkunInfo;
  periode: LaporanPeriode;
  saldoAwal: number;
  transaksi: MutasiKasBankTransaksi[];
  totalDebit: number;
  totalKredit: number;
  saldoAkhir: number;
}

export interface RekapKasBankItem {
  kode: string;
  nama: string;
  jenis: string;
  saldoAwal: number;
  totalMasuk: number;
  totalKeluar: number;
  saldoAkhir: number;
}

export interface RekapKasBankLaporanResponse {
  periode: LaporanPeriode;
  akun: RekapKasBankItem[];
}

// ── Neraca Saldo (Trial Balance) ────────────────────────────────

export interface NeracaSaldoItem {
  kodeAkun: string;
  namaAkun: string;
  saldoNormal: string;
  totalDebit: number;
  totalKredit: number;
  saldo: number;
}

export interface NeracaSaldoResponse {
  periode: LaporanPeriode;
  akun: NeracaSaldoItem[];
  totalDebit: number;
  totalKredit: number;
  selisih: number;
}

// ── Perubahan Modal ────────────────────────────────────────────

export interface PerubahanModalItem {
  kodeAkun: string;
  namaAkun: string;
  saldoAwal: number;
  mutasiDebit: number;
  mutasiKredit: number;
  perubahan: number;
  saldoAkhir: number;
}

export interface PerubahanModalResponse {
  periode: LaporanPeriode;
  akunModal: PerubahanModalItem[];
  labaRugiBerjalan: number;
  totalModalAwal: number;
  totalModalAkhir: number;
}

// ── Umur Piutang / Hutang (Aging) ─────────────────────────────

export interface UmurInvoice {
  noDokumen: string;
  tanggal: string;
  jatuhTempo: string;
  nilai: number;
  umurHari: number;
}

export interface UmurItem {
  nama: string;
  total: number;
  belumJatuhTempo: number;
  umur130: number;
  umur3160: number;
  umur6190: number;
  umur91Plus: number;
  rincian: UmurInvoice[];
}

export interface UmurPiutangResponse {
  asOfDate: string;
  items: UmurItem[];
  total: number;
  totalBelumJatuhTempo: number;
  totalUmur130: number;
  totalUmur3160: number;
  totalUmur6190: number;
  totalUmur91Plus: number;
}

export interface UmurHutangResponse {
  asOfDate: string;
  items: UmurItem[];
  total: number;
  totalBelumJatuhTempo: number;
  totalUmur130: number;
  totalUmur3160: number;
  totalUmur6190: number;
  totalUmur91Plus: number;
}

// ── Saldo Awal ─────────────────────────────────────────────────

export interface SaldoAwalItem {
  akunPerkiraanId: string;
  kodeAkun: string;
  namaAkun: string;
  saldoNormal: string;
  debit: number;
  kredit: number;
  /** Satu nilai bersih (sisi mengikuti saldo normal akun). */
  nilai?: number;
}

/** Input saldo awal: cukup SATU nilai per akun — sisi debit/kredit
 *  otomatis dari saldo normal akun, selisih dipampangkan sistem ke
 *  akun "Selisih Saldo Awal" (Modal). */
export interface SaldoAwalItemInput {
  akunPerkiraanId: string;
  nilai: number;
}

export interface SaldoAwalRequest {
  tanggal: string;
  items: SaldoAwalItemInput[];
}

export interface SaldoAwalResponse {
  sudahDiset: boolean;
  tanggal: string | null;
  /** AUD-15 — tahun buku set yang aktif (SA-{tahun}). */
  tahun?: number | null;
  /** AUD-15 — daftar tahun yang sudah punya set saldo awal. */
  tahunTersedia: number[];
  items: SaldoAwalItem[];
  totalDebit: number;
  totalKredit: number;
  selisih: number;
}

// ── Penutupan Periode ───────────────────────────────────────

export interface PenutupanPeriodeCloser {
  id: string;
  nama: string;
}

export interface PenutupanPeriodeJurnal {
  id: string;
  noJurnal: string;
}

export interface PenutupanPeriodeResponse {
  id: string;
  tahun: number;
  bulan: number;
  status: string;
  labaRugi: number | null;
  keterangan: string | null;
  jurnalPenutupanId: string | null;
  closedBy: string | null;
  closedAt: string | null;
  reopenedBy: string | null;
  reopenedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  closer: PenutupanPeriodeCloser | null;
  reopener: PenutupanPeriodeCloser | null;
  jurnal: PenutupanPeriodeJurnal | null;
}

export interface TutupPeriodeRequest {
  tahun: number;
  bulan: number;
  keterangan?: string;
  withClosingEntry?: boolean;
}

export interface BukaPeriodeRequest {
  tahun: number;
  bulan: number;
  alasan?: string;
}

export interface PeriodeStatusResponse {
  tahun: number;
  bulan: number;
  status: string;
  labaRugi: number | null;
}

// ── Penutupan Tahun (AUD-14 update #04 — closing tahunan) ────────────────────
// GET  /periode/penutupan-periode/tahun            → PenutupanTahunItem[]
// POST /periode/penutupan-periode/tutup-tahun/{tahun} → PenutupanTahunItem
// POST /periode/penutupan-periode/buka-tahun/{tahun}  → PenutupanTahunItem
//
// Transfer saldo Laba (Rugi) Tahun Berjalan (322000) → Laba (Rugi) Ditahan
// (321000) via jurnal CL-YEAR-{tahun}. labaRugi dikirim sebagai string
// (Decimal) — parse dengan parseFloat/formatRp di UI.

export interface PenutupanTahunItem {
  tahun: number;
  /** 'DITUTUP' | 'DIBUKA' (record tahunan) | 'TERBUKA' (belum pernah ditutup tahunan). */
  status: string;
  labaRugi: string | null;
  keterangan: string | null;
  jurnalPenutupanId: string | null;
  closedAt: string | null;
  reopenedAt: string | null;
  reopenAlasan: string | null;
  /** Jumlah bulan periode dengan status DITUTUP pada tahun ini (0-12). */
  bulanDitutup: number;
  /** True kalau 12/12 bulan sudah DITUTUP — syarat tutup tahun. */
  semuaBulanDitutup: boolean;
}

// ── Pre-Close Readiness (Phase 8 — Roadmap §25) ──────────────────────────────
// GET /penutupan-periode/pre-close-readiness?tahun=...&bulan=...

export interface PreCloseReadinessChecks {
  trialBalanceBalanced: boolean;
  trialBalanceEndingBalanced: boolean;
  balanceSheetBalanced: boolean;
  equityReconciled: boolean;
  cashFlowReconciled: boolean;
  noDraftJournals: boolean;
  noInvalidJournals: boolean;
  previousPeriodClosed: boolean;
  periodNotAlreadyClosed: boolean;
}

export interface PreCloseReadinessDetail {
  reportValidation?: Record<string, unknown>;
  draftJournalsCount: number;
  invalidJournalsCount: number;
  previousPeriod: { tahun: number; bulan: number; closed: boolean } | null;
}

export interface PreCloseReadinessResponse {
  ready: boolean;
  periode: { tahun: number; bulan: number };
  checks: PreCloseReadinessChecks;
  blockingIssues: string[];
  detail: PreCloseReadinessDetail;
}

// ── GL Reconciliation (Phase 8 — Roadmap §25) ────────────────────────────────
// GET /penutupan-periode/gl-reconciliation?tahun=...&bulan=...

export interface GlReconciliationTrialBalance {
  totalDebit: number | string;
  totalKredit: number | string;
  selisihMutasi: number | string;
  totalSaldoDebit: number | string;
  totalSaldoKredit: number | string;
  selisihSaldo: number | string;
  mutasiMatch: boolean;
  saldoMatch: boolean;
}

export interface GlReconciliationBalanceSheet {
  totalAset: number | string;
  totalKewajiban: number | string;
  totalEkuitas: number | string;
  selisih: number | string;
  match: boolean;
}

export interface GlReconciliationResponse {
  periode: { tahun: number; bulan: number };
  trialBalance: GlReconciliationTrialBalance;
  balanceSheet: GlReconciliationBalanceSheet;
  reconciliationStatus: 'MATCH' | 'MISMATCH';
}

// ── Phase 9 — Financial Reconciliation (Roadmap §26) ──────────────────────────
// 3 endpoint detail + 1 endpoint aggregate (Accounting Health Dashboard)

// GET /laporan/rekonsiliasi/grni?as_of=YYYY-MM-DD
export interface GrniReconciliationResponse {
  asOf: string;
  grniAccountId: string | null;
  grniAccountKode: string;
  grniAccountNama: string;
  openGrniValue: number | string;
  grniGlBalance: number | string;
  selisih: number | string;
  match: boolean;
  openReceiptsCount: number;
  catatan: string;
}

// GET /laporan/rekonsiliasi/cashflow-vs-bs?dari=...&sampai=...
export interface CashflowVsBsReconciliationResponse {
  periode: { dateFrom: string; dateTo: string };
  cashFlowEnding: number | string;
  balanceSheetCash: number | string;
  selisih: number | string;
  match: boolean;
  catatan: string;
}

// GET /laporan/rekonsiliasi/equity-vs-bs?dari=...&sampai=...
export interface EquityVsBsReconciliationResponse {
  periode: { dateFrom: string; dateTo: string };
  equityClosing: number | string;
  balanceSheetEquity: number | string;
  selisih: number | string;
  match: boolean;
  catatan: string;
}

// GET /laporan/accounting-health?as_of=YYYY-MM-DD
export interface AccountingHealthItem {
  name: string;
  status: 'MATCH' | 'MISMATCH' | 'NOT_CONFIGURED';
  selisih: string;
  detail: string;
}

export interface AccountingHealthSummary {
  totalChecks: number;
  matchCount: number;
  mismatchCount: number;
  notConfiguredCount: number;
}

export interface AccountingHealthResponse {
  asOf: string;
  overallStatus: 'HEALTHY' | 'ISSUES_FOUND';
  reconciliations: AccountingHealthItem[];
  summary: AccountingHealthSummary;
}

// ── Rekonsiliasi Bank ──────────────────────────────────────────────────

export interface RekonsiliasiKasBankSimple {
  id: string;
  kode: string;
  nama: string;
  jenis: string;
}

export interface RekonsiliasiAkunSimple {
  id: string;
  kode: string;
  nama: string;
}

export interface RekonsiliasiJurnalSimple {
  id: string;
  noJurnal: string;
}

export interface RekonsiliasiPenggunaSimple {
  id: string;
  nama: string;
}

export interface RekonsiliasiDetailResponse {
  id: string;
  tipe: string; // MEMO | PENYESUAIAN
  keterangan: string;
  jumlah: number;
  sisi: string; // DEBIT | KREDIT
  akunPerkiraanId: string | null;
  createdAt: string;
  updatedAt: string;
  akunPerkiraan: RekonsiliasiAkunSimple | null;
}

export interface RekonsiliasiBankResponse {
  id: string;
  kasBankAkunId: string;
  tanggalAkhir: string;
  saldoBank: number;
  saldoBuku: number;
  selisih: number;
  status: string; // DRAFT | SELESAI | BATAL
  keterangan: string | null;
  jurnalPenyesuaianId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  kasBank: RekonsiliasiKasBankSimple | null;
  jurnal: RekonsiliasiJurnalSimple | null;
  creator: RekonsiliasiPenggunaSimple | null;
  details: RekonsiliasiDetailResponse[];
}

export interface RekonsiliasiBankCreate {
  kasBankAkunId: string;
  tanggalAkhir: string;
  saldoBank: number;
  keterangan?: string;
}

export interface RekonsiliasiBankUpdate {
  saldoBank?: number;
  keterangan?: string;
}

export interface RekonsiliasiDetailCreate {
  tipe: string; // MEMO | PENYESUAIAN
  keterangan: string;
  jumlah: number;
  sisi: string; // DEBIT | KREDIT
  akunPerkiraanId?: string | null;
}

export interface RekonsiliasiDetailUpdate {
  keterangan?: string;
  jumlah?: number;
  sisi?: string;
  akunPerkiraanId?: string | null;
}

export interface SaldoBukuPreviewResponse {
  kasBankAkunId: string;
  kasBankNama: string;
  tanggalAkhir: string;
  saldoBuku: number;
}

// ── Stok Kartu ─────────────────────────────────────────────────────────

export interface StokKartuBarangSimple {
  id: string;
  kode: string;
  nama: string;
}

export interface StokKartuGudangSimple {
  id: string;
  kode: string;
  nama: string;
}

export interface MetodeValuasiOption {
  value: string;
  label: string;
}

export interface StokKartuEntryResponse {
  id: string;
  tanggal: string;
  tipe: string;
  refModule: string | null;
  refNo: string | null;
  keterangan: string | null;
  masukQty: number;
  masukHarga: number;
  masukTotal: number;
  keluarQty: number;
  keluarHarga: number;
  keluarTotal: number;
  saldoQty: number;
  saldoHarga: number;
  saldoTotal: number;
  gudang: StokKartuGudangSimple | null;
}

export interface StokKartuLayerInfo {
  id: string;
  hargaSatuan: number;
  qtySisa: number;
  totalNilai: number;
  tanggalMasuk: string;
  tanggalKedaluwarsa: string | null;
  refNo: string | null;
}

export interface StokKartuSummaryResponse {
  barangId: string;
  barangKode: string;
  barangNama: string;
  metodeValuasi: string;
  stokQty: number;
  hargaPokok: number;
  totalNilai: number;
  layers: StokKartuLayerInfo[];
}

// ── Pelunasan (Tahap 3 — Payment Allocation) ────────────────────────────

export type JenisPelunasan = 'piutang' | 'hutang';
export type StatusPembayaran = 'BELUM_DIBAYAR' | 'PARSIAL' | 'LUNAS' | 'LEBIH_BAYAR';

export interface PelunasanAlokasiCreate {
  invoiceId: string;
  nilai: string;
  /** Update cetak "Bayar Pemasok" — diskon pelunasan per faktur (hutang) */
  diskon?: string;
  /** Update #01 — PPh 23 per faktur (piutang & hutang): potongan pajak atas
   * pembayaran; kas = nilai − diskon − pph23; sisa tagihan turun penuh. */
  pph23?: string;
}

export interface PelunasanCreate {
  pihakId: string;
  tanggal: string;
  kasBankId: string;
  /** Wajib sesuai skema backend SettlementCreate (no_nukti min_length=1) */
  noNukti: string;
  alokasi: PelunasanAlokasiCreate[];
  catatan?: string;
  /** Update #5: penalti/denda (≥ 0); totalNilai backend = Σ alokasi + penalti */
  penalti?: string;
  /** Wajib bila penalti > 0 (akun AKTIF leaf, bukan kas/bank/AR/AP) */
  akunPenaltiId?: string | null;
  /** Update cetak "Bayar Pemasok" — info header cek & mata uang (hutang) */
  noCek?: string | null;
  tanggalCek?: string | null;
  jumlahCek?: number | string | null;
  mataUang?: string;
  nilaiTukar?: number | string;
}

export interface PelunasanAlokasiResponse {
  id: string;
  invoiceId: string;
  nilai: string;
  akunPerkiraanId: string;
}

export interface PelunasanResponse {
  id: string;
  noBukti: string;
  jenis: JenisPelunasan;
  tanggal: string;
  totalNilai: string;
  status: string;
  jurnalUmumId: string | null;
  pihakId: string | null;
  alokasi: PelunasanAlokasiResponse[];
  /** Update #5 */
  penalti?: string;
  akunPenaltiId?: string | null;
}

export interface InvoiceSaldoResponse {
  invoiceId: string;
  /** Backend: no_dokumen (nomor invoice/form dokumen sumber) */
  noDokumen: string;
  pihakId: string;
  tanggal: string;
  /** Backend: jatuh_tempo (nullable di model, string date "YYYY-MM-DD") */
  jatuhTempo: string | null;
  nilaiTagihan: string;
  totalBayar: string;
  totalRetur: string;
  sisaTagihan: string;
  kelebihan: string;
  statusPembayaran: StatusPembayaran;
  aktif: boolean;
}

export interface TagihanListResponse {
  data: InvoiceSaldoResponse[];
  total: number;
  skip: number;
  limit: number;
}

export interface InvoicePaymentHistoryItem {
  paymentId: string;
  noBukti: string;
  tanggal: string;
  nilai: string;
  status: string;
  dihitung: boolean;
}

export interface InvoiceSaldoDetailResponse extends InvoiceSaldoResponse {
  asOfDate: string;
  pembayaran: InvoicePaymentHistoryItem[];
}

// ── Import & Export Excel (Update #5) ────────────────────────────────────

/** Item GET /master/coa-dropdown */
export interface CoaDropdownItem {
  id: string;
  kode: string;
  nama: string;
  header: string;
  tingkat: string;
  status: string;
}

export interface ImportRowError {
  baris: number;
  pesan: string;
}

/** Response POST /master/{entity}/import */
export interface ImportResult {
  totalBaris: number;
  sukses: number;
  gagal: number;
  errors: ImportRowError[];
}

// ── Stok Rekonsiliasi (Tahap 4) ─────────────────────────────────────────

export interface StokRekonsiliasiLocation {
  gudangId: string | null;
  locationKey: string;
  qty: number;
  nilai: number | null;
}

export interface StokRekonsiliasiResponse {
  barangId: string;
  barangKode: string;
  barangNama: string;
  stokMaster: number;
  stokGudang: number;
  selisihQty: number;
  nilaiGudang: number | null;
  locations: StokRekonsiliasiLocation[];
  perluInisialisasi: boolean;
  layerQty: number;
  layerNilai: number | null;
  layerTanpaExpiry: number;
}

export interface StokRekonsiliasiBukuBesarItem {
  akunId: string;
  nilaiStok: string;
  nilaiBukuBesar: string;
  selisih: string;
}

export interface StokRekonsiliasiBukuBesarResponse {
  basis: string;
  data: StokRekonsiliasiBukuBesarItem[];
  barangTanpaMapping: string[];
  catatan: string[];
}

// ── Aset Transaksi (Tahap 4) ────────────────────────────────────────────

export type JenisAsetTransaksi = 'KAPITALISASI' | 'REGISTRASI' | 'PENYUSUTAN' | 'MUTASI' | 'PELEPASAN';

export interface AsetTransaksiCreate {
  asetId: string;
  jenis: JenisAsetTransaksi;
  tanggal: string;
  umurBulan?: number;
  nilaiSisa?: string;
  akunLawanId?: string;
  sourceJournalId?: string;
  akumulasiAwal?: string;
  lokasi?: string;
  nilaiPelepasan?: string;
  akunLabaRugiId?: string;
}

export interface AsetTransaksiResponse {
  id: string;
  asetId: string;
  jenis: JenisAsetTransaksi;
  tanggal: string;
  status: string;
  total: string;
  parameter: Record<string, unknown>;
  sebelum: Record<string, unknown> | null;
  sesudah: Record<string, unknown> | null;
  jurnalUmumId: string | null;
  sourceJournalId: string | null;
  createdBy: string;
  createdAt: string;
}

// ── Tahap 3: Rekonsiliasi Persediaan & Audit Transaksi ────────────────

export interface RekonsiliasiPersediaanAkunItem {
  id: string;
  kode: string;
  nama: string;
  status?: string | null;
}

export interface RekonsiliasiPersediaanBarangItem {
  id: string;
  kode: string;
  nama: string;
  qty: number;
  nilaiStok: number | string;
  akunPersediaanId?: string | null;
  statusMapping: 'MAPPED' | 'FALLBACK';
}

export interface RekonsiliasiPersediaanAkunRow {
  akun: RekonsiliasiPersediaanAkunItem;
  saldoBukuBesar: number | string;
  totalNilaiStok: number | string;
  selisih: number | string;
  status: 'MATCH' | 'MISMATCH';
  barang: RekonsiliasiPersediaanBarangItem[];
}

export interface RekonsiliasiPersediaanBarangBelumDipetakan {
  id: string;
  kode: string;
  nama: string;
  qty: number;
  nilaiStok: number | string;
  kategori?: string | null;
}

export interface RekonsiliasiPersediaanRingkasan {
  totalAkunDiperiksa: number;
  totalAkunMatch: number;
  totalAkunMismatch: number;
  totalAkunUnmapped: number;
  totalSelisih: number | string;
}

export interface RekonsiliasiPersediaanResponse {
  /** Backend koreksi: basis = "CURRENT_ALL_POSTED" (saldo terkini, semua jurnal POSTED termasuk future-dated). */
  basis: string;
  /** True kalau response include jurnal POSTED dengan tanggal masa depan. */
  includesFuturePostings: boolean;
  asOf: string;
  ringkasan: RekonsiliasiPersediaanRingkasan;
  items: RekonsiliasiPersediaanAkunRow[];
  barangBelumDipetakan: RekonsiliasiPersediaanBarangBelumDipetakan[];
}

export interface RekonsiliasiPersediaanRingkasanResponse {
  basis: string;
  includesFuturePostings: boolean;
  asOf: string;
  ringkasan: RekonsiliasiPersediaanRingkasan;
}

// Audit Transaksi Persediaan
export type TipeAuditPersediaan = 'PENERIMAAN' | 'PENGIRIMAN' | 'RETUR_PEMBELIAN' | 'RETUR_PENJUALAN' | 'PENYESUAIAN';

export interface AuditTransaksiAnomali {
  tipe: TipeAuditPersediaan;
  id: string;
  noDokumen?: string | null;
  status?: string | null;
  jurnalUmumId?: string | null;
  catatan: string;
}

/** Backend return summary sebagai plain dict dengan snake_case keys (lihat rekonsiliasi_persediaan_service.py:295-297).
 *  Field names sengaja snake_case untuk match response backend. */
export interface AuditPersediaanSummary {
  penerimaan_total: number;
  penerimaan_dengan_jurnal: number;
  penerimaan_tanpa_jurnal: number;
  pengiriman_total: number;
  pengiriman_dengan_jurnal: number;
  pengiriman_tanpa_jurnal: number;
  retur_pembelian_total: number;
  retur_pembelian_dengan_jurnal: number;
  retur_pembelian_tanpa_jurnal: number;
  retur_penjualan_total: number;
  retur_penjualan_dengan_jurnal: number;
  retur_penjualan_tanpa_jurnal: number;
  penyesuaian_total: number;
  penyesuaian_dengan_jurnal: number;
  penyesuaian_tanpa_jurnal: number;
}

export interface AuditTransaksiPersediaanResponse {
  periode: { dari: string; sampai: string };
  summary: AuditPersediaanSummary;
  anomali: AuditTransaksiAnomali[];
}

// ── RBAC v2 (Role & Akses) ────────────────────────────────────────────
// Kontrak API /auth/me/permissions + /access/* (backend RBAC v2, live).

/** Role singkat tanpa detail izin (dipakai di me/permissions & summary akses user). */
export interface RoleBrief {
  id: string;
  code: string;
  name: string;
}

/** Respons GET /auth/me/permissions */
export interface MePermissionsResponse {
  isSuperAdmin: boolean;
  permissions: string[];
  roles: RoleBrief[];
}

/** Satu aksi permission dalam registry (GET /access/permissions). */
export interface RegistryActionItem {
  code: string;
  action: string;
  description: string;
  isSensitive: boolean;
}

/** Satu resource (menu) dalam registry — berisi daftar aksi. */
export interface RegistryResourceItem {
  resource: string;
  label: string;
  actions: RegistryActionItem[];
}

/** Satu modul registry — berisi daftar resource. */
export interface RegistryModuleItem {
  module: string;
  label: string;
  resources: RegistryResourceItem[];
}

/** Respons GET /access/permissions (tree modul → resource → aksi). */
export interface RegistryTreeResponse {
  modules: RegistryModuleItem[];
}

/** Respons GET /access/roles → data: RoleSummary[] */
export interface RoleListResponse {
  data: RoleSummary[];
  total: number;
}

/** Ringkasan template role dari GET /access/roles. */
export interface RoleSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissionCount: number;
}

/** Detail template role dari GET /access/roles/{id}. */
export interface RoleDetail extends RoleSummary {
  permissions: string[];
}

/** Override tersimpan pada user (respons summary). */
export interface AccessOverride {
  permissionCode: string;
  effect: 'ALLOW' | 'DENY';
  reason: string | null;
  grantedBy: string | null;
}

/** Override yang dikirim saat PUT (payload). */
export interface AccessOverrideInput {
  permissionCode: string;
  effect: 'ALLOW' | 'DENY';
}

/** Ringkasan akses user (GET/PUT /access/users/{id}/access). */
export interface UserAccessSummary {
  user: {
    id: string;
    nama: string;
    username: string;
    roleEnum: string;
  };
  isSuperAdmin: boolean;
  roles: RoleBrief[];
  templateCode: string | null;
  templateName: string | null;
  templatePermissions: string[];
  overrides: AccessOverride[];
  effectivePermissions: string[];
  effectiveCount: number;
}

/** Payload PUT /access/users/{id}/access.
 *  templateCode null = jangan ubah role; overrides null = jangan ubah.
 *  roleIds = kontrak backend ASLI (role-link REPLACE-SET) — dikirim bersamaan
 *  agar payload kompatibel dengan kedua keluarga backend; sisi yang tidak
 *  mengenal field tsb. mengabaikannya (extra field di-ignore Pydantic). */
export interface UserAccessUpdatePayload {
  templateCode?: string | null;
  roleIds?: string[];
  overrides?: AccessOverrideInput[] | null;
  reason: string;
}

/** Satu baris log audit perubahan akses (GET /access/audit-logs). */
export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  /** Backend asli menyertakan nama aktor/target langsung (best-effort). */
  actorNama?: string | null;
  targetNama?: string | null;
  targetUserId: string | null;
  action: string;
  reason: string | null;
  /** Ringkasan slim: templateCode, roles (kode), overrides, effectiveCount. */
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  /** Backend asli memakai `createdAt` — dinormalisasi ke `at` saat load. */
  createdAt?: string | null;
  at: string | null;
}

/** Respons GET /access/audit-logs. */
export interface AuditLogListResponse {
  data: AuditLogEntry[];
  total: number;
  skip: number;
  limit: number;
}

// ============================================================
// HARD DELETE (pembatalan = hapus permanen + histori)
// ============================================================

/** Respons endpoint /cancel (kini hard delete dengan jejak histori). */
export interface HardDeleteResponse {
  success: boolean;
  documentType: string;
  documentId: string;
  documentNumber: string | null;
  deletedAt: string;
  message: string;
}

/** Ringkasan entri GET /histori/dokumen-terhapus (tanpa snapshot). */
export interface DeletedDocumentLogResponse {
  id: string;
  documentType: string;
  documentId: string;
  documentNumber: string | null;
  documentDate: string | null;
  documentStatus: string | null;
  totalAmount: string | null;
  deletedBy: { id: string; username: string; namaLengkap: string | null } | null;
  deletedAt: string;
  reason: string | null;
}

export interface DeletedDocumentLogDetailResponse extends DeletedDocumentLogResponse {
  snapshot: Record<string, unknown>;
}

export interface DeletedDocumentLogListResponse {
  data: DeletedDocumentLogResponse[];
  total: number;
  skip: number;
  limit: number;
}

// ── Histori Pembatalan (AUD-01 update #05 — reversal & hard delete) ───────────
// GET /histori/pembatalan?limit=...&documentType=...

/** Jurnal pembalik yang dibuat saat pembatalan mode REVERSAL. */
export interface PembatalanReversalJurnal {
  id: string;
  noJurnal: string;
  reversalOf?: string | null;
}

export interface PembatalanHistoriRow {
  id: string;
  documentType: string;
  documentId: string;
  documentNumber: string | null;
  documentDate: string | null;
  documentStatus: string | null;
  /** Decimal sebagai string — format dengan formatRp(Number(...)) di UI. */
  totalAmount: string | null;
  reason: string | null;
  /** 'REVERSAL' (jurnal pembalik) | 'HARD_DELETE' (hapus permanen). */
  mode: string;
  reversalJurnalIds: PembatalanReversalJurnal[];
  /** Username user yang membatalkan. */
  cancelledBy: string | null;
  cancelledAt: string | null;
}

export interface PembatalanHistoriListResponse {
  data: PembatalanHistoriRow[];
  total: number;
  skip: number;
  limit: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROFIL PERUSAHAAN & REKENING BANK (header cetak/PDF) — update ASAHI
// ═══════════════════════════════════════════════════════════════════════════

export interface RekeningBankResponse {
  id: string;
  namaBank: string;
  noRekening: string;
  /** Kode mata uang (IDR/USD/...) — tampil sebagai "Acc Nbr <nomor> (<kode>)". */
  mataUang: string;
  isAktif: boolean;
  updatedAt: string | null;
}

export interface RekeningBankCreate {
  namaBank: string;
  noRekening: string;
  mataUang: string;
  isAktif?: boolean;
}

export interface RekeningBankUpdate {
  namaBank?: string;
  noRekening?: string;
  mataUang?: string;
  isAktif?: boolean;
}

export interface CompanyProfileResponse {
  id: string;
  namaPerusahaan: string;
  alamat: string;
  telepon: string | null;
  email: string | null;
  /** Logo sebagai data URL (data:image/...;base64,...) — langsung dipakai <img>. */
  logo: string | null;
  /** Update ASAHI #6: slogan — tampil khusus di header cetak Invoice Penjualan. */
  slogan: string | null;
  /** Update ASAHI #6: rekening bank AKTIF (embed dari backend). */
  rekeningBank: RekeningBankResponse[];
  updatedAt: string | null;
  // === Update ASAHI #019 — kolom baru Pengaturan (Umum/Periode/Pajak); semua
  // opsional/nullable karena additive migration (backend kirim null bila kosong). ===
  fax?: string | null;
  negara?: string | null;
  mataUang?: string | null;
  /** ISO date (YYYY-MM-DD) — null bila belum diisi. */
  tanggalMulai?: string | null;
  tahunFiskal?: string | null;
  periodeDefault?: string | null;
  noSeriFakturPajak?: string | null;
  npwp?: string | null;
  noPengukuhanPkp?: string | null;
  branchCode?: string | null;
  jenisUsaha?: string | null;
  kluSpt?: string | null;
}

export interface CompanyProfileUpdate {
  namaPerusahaan: string;
  alamat: string;
  telepon?: string | null;
  email?: string | null;
  logo?: string | null;
  /** Update ASAHI #6: slogan opsional (null/kosong = invoice tanpa slogan). */
  slogan?: string | null;
  // === Update ASAHI #019 — field baru; semua opsional karena backend kini
  // partial-update (exclude_unset) — halaman Periode/Pajak/Umum boleh kirim
  // subset field saja tanpa menimpa field lain. ===
  fax?: string | null;
  negara?: string | null;
  mataUang?: string | null;
  tanggalMulai?: string | null;
  tahunFiskal?: string | null;
  periodeDefault?: string | null;
  noSeriFakturPajak?: string | null;
  npwp?: string | null;
  noPengukuhanPkp?: string | null;
  branchCode?: string | null;
  jenisUsaha?: string | null;
  kluSpt?: string | null;
}

// ═════════════════════════════════════════════════════════════════════════
// MATA UANG & ALAMAT PENGIRIMAN — update ASAHI #3 (Pengaturan → Profil Perusahaan)
// ═════════════════════════════════════════════════════════════════════════

export interface MataUangResponse {
  id: string;
  kode: string;
  nama: string;
  isAktif: boolean;
  updatedAt: string | null;
}

export interface MataUangCreate {
  kode: string;
  nama: string;
  isAktif?: boolean;
}

export interface MataUangUpdate {
  kode?: string;
  nama?: string;
  isAktif?: boolean;
}

export interface AlamatPengirimanResponse {
  id: string;
  prefix: string;
  nama: string;
  isAktif: boolean;
  // === Update #002 — PIC gudang: auto-fill form PO & tampil di cetak ===
  picNama?: string | null;
  picTelepon?: string | null;
  updatedAt: string | null;
}

export interface AlamatPengirimanCreate {
  prefix: string;
  nama: string;
  isAktif?: boolean;
  picNama?: string | null;
  picTelepon?: string | null;
}

export interface AlamatPengirimanUpdate {
  prefix?: string;
  nama?: string;
  isAktif?: boolean;
  picNama?: string | null;
  picTelepon?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// REQUEST ORDER PART (PRODUKSI) — form pre-PO yang diajukan Engineering
// sebelum masuk ke Purchasing
// ═══════════════════════════════════════════════════════════════════════════

export type RequestOrderPartStatus = 'DRAFT' | 'DIBUAT';

/** Ringkasan SO ter-link pada ROP (nested di response ROP). */
export interface RequestOrderPartSalesOrder {
  id: string;
  noPesanan: string;
  customerCode: string | null;
  customerPoNumber: string | null;
  status: string;
  tanggal: string;
}

/** Pembuat ROP (nested di response ROP). */
export interface RequestOrderPartCreator {
  id: string;
  username: string;
  namaLengkap: string;
}

/** Baris item ROP. PERHATIAN: qty diserialisasi backend sebagai STRING
 *  desimal ("4.00") — normalisasi ke number di UI sebelum dipakai/dikirim.
 *  Update #003: qs kini bertipe data seperti ID PART (kode teks alfanumerik)
 *  dan keterangan dipecah dua: keteranganOrder + keteranganStok. */
export interface RequestOrderPartItem {
  id: string;
  no: number;
  idPart: string;
  description: string;
  material: string | null;
  qty: string | number;
  qs: string | null;
  supplierId: string | null;
  keteranganOrder: string | null;
  keteranganStok: string | null;
  supplier: SupplierSimple | null;
}

export interface RequestOrderPart {
  id: string;
  noRop: string;
  tanggal: string;
  projectName: string;
  model: string | null;
  salesOrderId: string | null;
  pelangganId: string | null;
  catatan: string | null;
  dibuatOleh: string | null;
  diperiksaOleh: string | null;
  diketahuiOleh: string | null;
  disetujuiOleh: string | null;
  status: RequestOrderPartStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  salesOrder: RequestOrderPartSalesOrder | null;
  pelanggan: PelangganSimple | null;
  creator: RequestOrderPartCreator | null;
  items: RequestOrderPartItem[];
}

/** Baris list ROP — header + totalItem, TANPA array items. */
export interface RequestOrderPartListRow extends Omit<RequestOrderPart, 'items'> {
  totalItem: number;
}

export interface RequestOrderPartItemCreate {
  no: number;
  idPart: string;
  description: string;
  material?: string | null;
  qty: number;
  /** Update #003: kode QS (seperti ID PART) — teks, kosong = null. */
  qs?: string | null;
  supplierId?: string | null;
  keteranganOrder?: string | null;
  keteranganStok?: string | null;
}

export interface RequestOrderPartCreate {
  tanggal: string;
  projectName: string;
  model?: string | null;
  salesOrderId?: string | null;
  catatan?: string | null;
  dibuatOleh?: string | null;
  diperiksaOleh?: string | null;
  diketahuiOleh?: string | null;
  disetujuiOleh?: string | null;
  items: RequestOrderPartItemCreate[];
}

/** PUT partial — hanya field yang berubah; `items` bila dikirim MENGGANTI
 *  seluruh baris. Hanya boleh untuk status DRAFT. */
export interface RequestOrderPartUpdate {
  tanggal?: string;
  projectName?: string;
  model?: string | null;
  salesOrderId?: string | null;
  catatan?: string | null;
  dibuatOleh?: string | null;
  diperiksaOleh?: string | null;
  diketahuiOleh?: string | null;
  disetujuiOleh?: string | null;
  items?: RequestOrderPartItemCreate[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Update #018 — Opsi/dropdown form ROP (GET /produksi/request-order-part/opsi)
// Satu endpoint scoped permission produksi (menggantikan panggilan ke
// /penjualan/sales-order + /master/supplier-dropdown) supaya role Staf
// Engineering yang hanya berpermission produksi tetap bisa mengisi form.
// ═══════════════════════════════════════════════════════════════════════════

/** Opsi SO ringan untuk dropdown form ROP — hanya field yang dipakai form. */
export interface RopSalesOrderOption {
  id: string;
  noPesanan: string;
  customerPoNumber?: string | null;
  tanggal: string;
  status: string;
  pelanggan?: { id: string; kode: string; nama: string } | null;
}

export interface RequestOrderPartOptionsResponse {
  salesOrders: RopSalesOrderOption[];
  suppliers: SupplierDropdown[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Update AUD-01 — Pembatalan non-destruktif (jurnal pembalik)
// ═══════════════════════════════════════════════════════════════════════════

/** Response POST /{dokumen}/{id}/cancel — dua mode:
 *  - mode REVERSAL: dokumen posted dibatalkan dengan jurnal pembalik
 *    (dokumen & jurnal asli tetap tersimpan; status BATAL/DIBATALKAN).
 *  - tanpa mode (hard delete): dokumen draft dihapus permanen + snapshot
 *    ke log dokumen terhapus (perilaku lama).
 */
export interface CancelDocumentResponse extends HardDeleteResponse {
  mode?: 'REVERSAL';
  status?: string;
  reversalJournalId?: string;
  reversalJournalNo?: string;
  cancelledAt?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Update AUD-17 — Rekap Pajak PPN & PPh 23
// ═══════════════════════════════════════════════════════════════════════════

export interface RekapPpnItem {
  tanggal: string;
  noDokumen: string;
  pihak: string | null;
  jenis: 'KELUARAN' | 'MASUKAN' | 'RETUR_KELUARAN' | 'RETUR_MASUKAN';
  dpp: string | number;
  ppn: string | number;
}

export interface RekapPpnMasaItem {
  masa: string;
  dppKeluaran: string | number;
  ppnKeluaran: string | number;
  dppMasukan: string | number;
  ppnMasukan: string | number;
  dppReturKeluaran: string | number;
  ppnReturKeluaran: string | number;
  dppReturMasukan: string | number;
  ppnReturMasukan: string | number;
  ppnNeto: string | number;
}

export interface RekapPpnResponse {
  periode: { dari: string; sampai: string };
  ringkasanMasa: RekapPpnMasaItem[];
  rincian: RekapPpnItem[];
  total: RekapPpnMasaItem | null;
}

export interface RekapPph23Item {
  tanggal: string;
  pihak: string | null;
  npwp: string | null;
  noBukti: string;
  noInvoice: string | null;
  dasar: string | number;
  pph23: string | number;
  sumber: 'PELUNASAN';
  sisi: 'DIPOTONG_DARI_KITA' | 'KITA_POTONG';
}

export interface RekapPph23PihakItem {
  pihak: string | null;
  npwp: string | null;
  sisi: string;
  totalDasar: string | number;
  totalPph23: string | number;
}

export interface RekapPph23Response {
  periode: { dari: string; sampai: string };
  rincian: RekapPph23Item[];
  perPihak: RekapPph23PihakItem[];
  totalDipotongDariKita: string | number;
  totalKitaPotong: string | number;
}
