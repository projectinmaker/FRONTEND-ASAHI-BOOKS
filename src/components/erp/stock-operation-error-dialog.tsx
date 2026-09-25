'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';
import { describeStockOperationError } from '@/lib/delivery-receipt';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useTabStore } from '@/store/tab-store';
import type { StockOperationError } from '@/lib/delivery-receipt';

export function StockOperationErrorDialog({ error, onClose }: { error: StockOperationError | null; onClose: () => void }) {
  const openNavTab = useTabStore(state => state.openNavTab);
  return (
    <AlertDialog open={error?.presentation === 'modal'} onOpenChange={open => { if (!open) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{error?.title}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-wrap">{error?.detail}</AlertDialogDescription>
        </AlertDialogHeader>
        {error?.guidance === 'grni' && <div className="space-y-2 text-sm">
          <p>Untuk melanjutkan penerimaan:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Buka menu Setting Akun.</li>
            <li>Atur PENERIMAAN_DALAM_PROSES ke akun GRNI yang sesuai: kewajiban DETAIL, terpisah dari akun utang supplier. Simpan pengaturannya.</li>
            <li>Kembali ke penerimaan dan coba finalisasi lagi.</li>
          </ol>
        </div>}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Tutup</AlertDialogCancel>
          {error?.guidance === 'grni' && <AlertDialogAction onClick={() => { onClose(); openNavTab('settings', 'setting-akun', 'Setting Akun'); }}>Buka Setting Akun</AlertDialogAction>}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function useStockOperationError(documentType: string) {
  const [error, setError] = useState<StockOperationError | null>(null);
  const clearError = useCallback(() => setError(null), []);
  const handleError = useCallback((cause: unknown, fallback: string) => {
    const description = cause instanceof ApiError && cause.status === 400
      ? describeStockOperationError(documentType, cause.detail) : null;
    if (description?.presentation === 'modal') setError(description);
    else toast.error(cause instanceof Error ? cause.message : fallback, { description: description?.hint });
  }, [documentType]);
  return { error, clearError, handleError };
}
