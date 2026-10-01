'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatInputNumber, parseFormattedNumber } from '@/lib/money';

/**
 * Input nominal/harga dengan pemisah ribuan titik secara live.
 *
 * - `value` menyimpan CANONICAL string ("20000000" / "20000000.5" / "")
 *   sehingga logika submit Number(value) tidak perlu berubah.
 * - Tampilan otomatis berformat "20.000.000" (atau "20.000.000,5" bila
 *   `allowDecimal`).
 * - `onValueChange` menerima canonical string baru.
 */
export interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  value: string;
  onValueChange: (canonical: string) => void;
  /** Izinkan desimal (koma, maks 2 digit) — mis. debit/kredit jurnal. */
  allowDecimal?: boolean;
  /** Perataan teks; default kanan agar kolom nominal rapi. */
  align?: 'left' | 'right';
}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(({ className, value, onValueChange, allowDecimal = false, align = 'right', ...props }, ref) => {
  const display = formatInputNumber(value, allowDecimal);
  return <Input ref={ref} type="text" inputMode={allowDecimal ? 'decimal' : 'numeric'} autoComplete="off" className={cn('font-mono tabular-nums', align === 'right' && 'text-right', className)} value={display} onChange={(e) => onValueChange(parseFormattedNumber(e.target.value, allowDecimal))} onFocus={(e) => e.target.select()} {...props} />;
});

CurrencyInput.displayName = 'CurrencyInput';
