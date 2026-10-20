'use client';

/**
 * Dialog konfirmasi pembatalan dokumen — AUD-01 (update #05) 2-mode:
 *
 * 1. Dokumen SUDAH DIPPOSTING → dibatalkan dengan JURNAL PEMBALIK:
 *    dokumen & jurnal asli tetap tersimpan (audit trail utuh), alokasi
 *    pelunasan dihapus, status menjadi BATAL/Dibatalkan, nomor tetap terpakai.
 * 2. Dokumen DRAFT (tanpa jurnal) → dihapus permanen dengan snapshot histori
 *    (log dokumen terhapus).
 *
 * Alasan (reason) WAJIB — backend menolak pembatalan dokumen posted tanpa
 * alasan. Mode mana yang dipakai diputuskan backend per dokumen.
 */

import { useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Ban } from 'lucide-react';

interface HardDeleteCancelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Judul, mis. "Batalkan Invoice Penjualan?" */
  title: string;
  /** Nama jenis dokumen untuk teks, mis. "invoice penjualan" */
  formLabel: string;
  submitting: boolean;
  /** Dipanggil saat user mengonfirmasi; reason selalu non-kosong (wajib). */
  onConfirm: (reason: string) => void | Promise<void>;
}

export function HardDeleteCancelDialog({ open, onOpenChange, title, formLabel, submitting, onConfirm }: HardDeleteCancelDialogProps) {
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');

  // Alasan & error di-reset saat dialog ditutup (handler, bukan effect) agar
  // pembukaan berikutnya mulai kosong.
  const closeDialog = (o: boolean) => {
    if (!o) {
      setReason('');
      setReasonError('');
    }
    onOpenChange(o);
  };

  const handleConfirm = () => {
    if (!reason.trim()) {
      setReasonError('Alasan pembatalan wajib diisi — tercatat di histori pembatalan.');
      return;
    }
    setReasonError('');
    void onConfirm(reason.trim());
  };

  return (
    <AlertDialog open={open} onOpenChange={closeDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-destructive" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-left">
              <span className="block">
                Dokumen <strong>{formLabel}</strong> yang <strong>sudah diposting</strong> akan dibatalkan dengan <strong className="text-emerald-700">jurnal pembalik</strong> — dokumen &amp; jurnal asli tetap tersimpan (audit trail utuh), alokasi pelunasan dihapus, status menjadi <strong>BATAL/Dibatalkan</strong>, dan nomor tetap terpakai.
              </span>
              <span className="block text-muted-foreground">
                Dokumen <strong>DRAFT</strong> (tanpa jurnal) dihapus permanen dengan snapshot histori di log dokumen terhapus. Mode mana yang dipakai diputuskan otomatis per dokumen.
              </span>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (reasonError) setReasonError('');
            }}
            placeholder="Alasan pembatalan (wajib — tercatat di histori pembatalan)"
            className="min-h-[70px] text-sm"
            disabled={submitting}
            aria-invalid={!!reasonError}
          />
          {reasonError && (
            <p role="alert" className="text-xs text-destructive">
              {reasonError}
            </p>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Tidak</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5"
            disabled={submitting}
            onClick={(e) => {
              e.preventDefault(); // jangan tutup otomatis — biarkan handler yang menutup setelah sukses
              handleConfirm();
            }}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Ya, Batalkan Dokumen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
