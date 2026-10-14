// ═════════════════════════════════════════════════════════════════════════════
// QUICK ADD MASTER DATA — pintu masuk modul (Update #007).
//
// Pakai di form transaksi:
//   import { QuickAddPelangganButton, toPelangganDropdown } from '@/components/erp/quick-add';
//   ...
//   <div className="flex items-start gap-1.5">
//     <SearchableDropdown className="flex-1 min-w-0" ... />
//     <QuickAddPelangganButton onCreated={(p) => {
//       setPelangganOptions((prev) => prev.some((x) => x.id === p.id) ? prev : [...prev, toPelangganDropdown(p)]);
//       handlePelangganChange(p.id); // auto-select + autofill seperti pilih manual
//     }} />
//   </div>
//
// Mapper (toXxxDropdown) mengubah response create (entity lengkap) menjadi
// bentuk baris dropdown yang dipakai form transaksi, sehingga opsi baru bisa
// langsung di-append ke state tanpa fetch ulang.
// ═════════════════════════════════════════════════════════════════════════════

import type { PelangganResponse, PelangganDropdown, SupplierResponse, SupplierDropdown, BarangResponse, BarangDropdown, SatuanResponse } from '@/types/api';

export { QuickAddPelangganButton, QuickAddSupplierButton, QuickAddBarangButton, QuickAddGudangButton, QuickAddKategoriButton, QuickAddSatuanButton, QuickAddSyaratBayarButton } from './quick-add-buttons';
export { QuickAddPelangganDialog, QuickAddSupplierDialog, QuickAddBarangDialog, QuickAddGudangDialog, QuickAddKategoriDialog, QuickAddSatuanDialog, QuickAddSyaratBayarDialog } from './quick-add-dialogs';

/** Response create pelanggan → baris PelangganDropdown (dipakai semua form penjualan). */
export function toPelangganDropdown(p: PelangganResponse): PelangganDropdown {
  return {
    id: p.id,
    kode: p.kode,
    nama: p.nama,
    alamat: p.alamat ?? undefined,
    telepon: p.telepon ?? undefined,
    kontakPerson: p.kontakPerson ?? undefined,
    email: p.email ?? undefined,
    syaratBayarId: p.syaratBayarId ?? (p.syaratBayar ? p.syaratBayar.id : undefined),
    singkatan: p.singkatan ?? undefined
  };
}

/** Response create supplier → baris SupplierDropdown (dipakai semua form pembelian). */
export function toSupplierDropdown(s: SupplierResponse): SupplierDropdown {
  return {
    id: s.id,
    kode: s.kode,
    nama: s.nama,
    alamat: s.alamat ?? undefined,
    telepon: s.telepon ?? undefined,
    kontakPerson: s.kontakPerson ?? undefined,
    email: s.email ?? undefined,
    syaratBayarId: s.syaratBayarId ?? (s.syaratBayar ? s.syaratBayar.id : undefined),
    currency: s.currency ?? undefined
  };
}

/** Response create barang → baris BarangDropdown (dipakai detail table semua modul). */
export function toBarangDropdown(b: BarangResponse): BarangDropdown {
  return {
    id: b.id,
    kode: b.kode,
    nama: b.nama,
    hargaPokok: Number(b.hargaPokok) || 0,
    hargaJual: Number(b.hargaJual) || 0,
    stok: Number(b.stok) || 0,
    itemType: b.itemType ?? undefined,
    stockItem: b.stockItem,
    metodeValuasi: b.metodeValuasi ?? undefined,
    satuanId: b.satuanId ?? undefined
  };
}

/**
 * Satuan dasar dari response create barang → baris SatuanResponse.
 * Dipakai host form untuk mendaftarkan satuan barang baru ke state satuanOptions
 * (satuan bisa saja baru dibuat lewat nested quick-add di dialog barang, sehingga
 * belum ada di daftar satuuan host).
 */
export function satuanFromBarang(b: BarangResponse): SatuanResponse | null {
  if (!b.satuan?.id || !b.satuan?.nama) return null;
  return { id: b.satuan.id, nama: b.satuan.nama, status: 'AKTIF' };
}
