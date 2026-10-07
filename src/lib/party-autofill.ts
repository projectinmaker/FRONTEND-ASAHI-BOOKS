// ─── Auto-fill dari master data (Update #4) ─────────────────────────────────
// Prinsip: field di form transaksi yang berkaitan dengan master data
// (pelanggan/supplier) ditarik OTOMATIS saat party dipilih — tidak perlu
// input manual lagi. Data mengikuti master terbaru pada saat pemilihan.
//
// Yang ditarik otomatis saat pelanggan/supplier dipilih:
//   • Alamat            → field alamat / alamat pengiriman form
//   • Syarat Bayar      → default syarat bayar party (bila ada)
//   • Mata Uang (PO)    → currency default supplier (bila ada & valid)

import type { PelangganDropdown, SupplierDropdown } from '@/types/api';

export type PartyMasterRow = PelangganDropdown | SupplierDropdown;

/**
 * Cari baris master (pelanggan/supplier) dari daftar dropdown berdasarkan id.
 * Mengembalikan undefined bila party tidak ditemukan (mis. data histori yang
 * sudah nonaktif) — pemanggil cukup membiarkan isian lama apa adanya.
 */
export function findPartyMaster<T extends PartyMasterRow>(rows: T[] | undefined | null, id: string | null | undefined): T | undefined {
  if (!id || !rows) return undefined;
  return rows.find((row) => row.id === id);
}

/**
 * Label kecil untuk keterangan di bawah field alamat pada form transaksi.
 */
export const AUTOFILL_HINT = {
  pelanggan: 'Otomatis ditarik dari master Pelanggan saat dipilih — tetap bisa disunting bila perlu.',
  supplier: 'Otomatis ditarik dari master Supplier saat dipilih — tetap bisa disunting bila perlu.'
} as const;
