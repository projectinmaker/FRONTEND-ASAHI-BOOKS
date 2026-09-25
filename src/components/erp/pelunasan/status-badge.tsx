'use client';

import { Badge } from '@/components/ui/badge';
import type { StatusPembayaran } from '@/types/api';

/**
 * Badge for invoice payment status (BELUM_DIBAYAR / PARSIAL / LUNAS / LEBIH_BAYAR).
 * Shared between Pelunasan module and Sales/Purchasing invoice lists.
 */
export function StatusPembayaranBadge({ status }: { status: StatusPembayaran | string | null | undefined }) {
  switch (status) {
    case 'BELUM_DIBAYAR':
      return (
        <Badge variant="secondary" className="bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-100 text-xs">
          Belum Dibayar
        </Badge>
      );
    case 'PARSIAL':
      return (
        <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 text-xs">
          Parsial
        </Badge>
      );
    case 'LUNAS':
      return (
        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 text-xs">
          Lunas
        </Badge>
      );
    case 'LEBIH_BAYAR':
      return (
        <Badge variant="secondary" className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 text-xs">
          Lebih Bayar
        </Badge>
      );
    default:
      return <span className="text-xs text-muted-foreground">—</span>;
  }
}
