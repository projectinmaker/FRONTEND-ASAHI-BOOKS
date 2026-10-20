'use client';

/**
 * Update #02 — Pemilih Jenis Transaksi untuk form Penerimaan & Pembayaran
 * (modul Kas & Bank). Tiga pilihan (koreksi miskom catatan-update-01):
 *
 * 1. PELUNASAN_INVOICE — Pelunasan Piutang di Penerimaan (pilih pelanggan →
 *    invoice penjualan outstanding → nominal → posting) / Pelunasan Hutang
 *    di Pembayaran (pilih supplier → invoice pembelian outstanding).
 * 2. TRANSAKSI_LAINNYA — penerimaan modal, pendapatan lain, biaya operasional,
 *    transaksi non-invoice; akun lawan dipilih dari COA (rincian).
 * 3. BELUM_TERIDENTIFIKASI — mutasi bank yang pihak/asalnya belum diketahui;
 *    posting ke akun penampung sementara, lalu Identifikasi & Alokasi.
 */

import { cn } from '@/lib/utils';
import { HandCoins, ReceiptText, HelpCircle } from 'lucide-react';
import type { JenisTransaksiKas } from '@/types/api';

interface Option {
  value: JenisTransaksiKas;
  title: string;
  description: string;
  icon: typeof HandCoins;
}

export function jenisTransaksiOptions(jenisDokumen: 'penerimaan' | 'pembayaran'): Option[] {
  const isPenerimaan = jenisDokumen === 'penerimaan';
  return [
    {
      value: 'PELUNASAN_INVOICE',
      title: 'Pelunasan Invoice',
      description: isPenerimaan ? 'Pilih pelanggan → invoice penjualan outstanding → nominal → posting ke akun piutang & Kas/Bank' : 'Pilih supplier → invoice pembelian outstanding → nominal → posting ke akun hutang & Kas/Bank',
      icon: HandCoins
    },
    {
      value: 'TRANSAKSI_LAINNYA',
      title: 'Transaksi Lainnya',
      description: isPenerimaan ? 'Penerimaan modal, pendapatan lain, dan transaksi non-invoice — akun lawan dipilih dari COA' : 'Biaya operasional, pembelian tunai, dan transaksi non-invoice — akun lawan dipilih dari COA',
      icon: ReceiptText
    },
    {
      value: 'BELUM_TERIDENTIFIKASI',
      title: 'Belum Teridentifikasi',
      description: 'Mutasi bank yang pelanggan/supplier atau transaksi asalnya belum diketahui — diposting ke akun penampung, lalu Identifikasi & Alokasi',
      icon: HelpCircle
    }
  ];
}

interface Props {
  value: JenisTransaksiKas;
  onValueChange: (v: JenisTransaksiKas) => void;
  jenisDokumen: 'penerimaan' | 'pembayaran';
  disabled?: boolean;
}

export function JenisTransaksiSelector({ value, onValueChange, jenisDokumen, disabled }: Props) {
  const options = jenisTransaksiOptions(jenisDokumen);
  return (
    <div role="radiogroup" aria-label="Jenis Transaksi" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {options.map((opt) => {
        const active = value === opt.value;
        const Icon = opt.icon;
        return (
          <button key={opt.value} type="button" role="radio" aria-checked={active} disabled={disabled} onClick={() => onValueChange(opt.value)} className={cn('flex h-full flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors', active ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500' : 'border-border bg-background hover:border-emerald-300 hover:bg-emerald-50/40', disabled && 'cursor-not-allowed opacity-60')}>
            <span className="flex items-center gap-2">
              <span className={cn('flex h-7 w-7 items-center justify-center rounded-md', active ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground')}>
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className={cn('text-sm font-semibold', active ? 'text-emerald-700' : 'text-foreground')}>{opt.title}</span>
            </span>
            <span className="text-[11px] leading-snug text-muted-foreground">{opt.description}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Badge jenis transaksi (dipakai form edit + tabel list Kas & Bank) ──────

import { Badge } from '@/components/ui/badge';

export function JenisTransaksiBadge({ jenis }: { jenis: string }) {
  switch (jenis) {
    case 'PELUNASAN_INVOICE':
      return <Badge className="border-violet-200 bg-violet-100 text-violet-700 hover:bg-violet-100">Pelunasan Invoice</Badge>;
    case 'BELUM_TERIDENTIFIKASI':
      return <Badge className="border-amber-200 bg-amber-100 text-amber-700 hover:bg-amber-100">Belum Teridentifikasi</Badge>;
    default:
      return <Badge variant="secondary">Transaksi Lainnya</Badge>;
  }
}
