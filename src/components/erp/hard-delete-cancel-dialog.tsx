'use client';

/**
 * Dialog konfirmasi pembatalan dokumen = HARD DELETE (kebijakan baru Asahi).
 *
 * Pembatalan di modul apapun kini menghapus dokumen + datanya secara permanen;
 * histori lengkap tetap tersimpan di log dokumen terhapus (deleted_document_log).
 * Dialog ini meminta alasan (opsional) yang ikut tercatat di histori.
 */

import { useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Trash2 } from 'lucide-react';

interface HardDeleteCancelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Judul, mis. "Batalkan Pembayaran?" */
  title: string;
  /** Nama jenis dokumen untuk teks, mis. "pembayaran" */
  formLabel: string;
  submitting: boolean;
  /** Dipanggil saat user mengonfirmasi; reason bisa string kosong. */
  onConfirm: (reason: string) => void | Promise<void>;
}

export function HardDeleteCancelDialog({ open, onOpenChange, title, formLabel, submitting, onConfirm }: HardDeleteCancelDialogProps) {
  const [reason, setReason] = useState('');

  // Alasan di-reset saat dialog ditutup (handler, bukan effect) agar
  // pembukaan berikutnya mulai kosong.

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setReason('');
        onOpenChange(o);
      }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-left">
              <span className="block">
                Dokumen {formLabel} akan <strong className="text-destructive">dihapus permanen</strong> beserta seluruh datanya (rincian, jurnal terkait, dan workflow). Tindakan ini tidak dapat dibatalkan.
              </span>
              <span className="block text-muted-foreground">Histori dokumen tetap tersimpan di log dokumen terhapus untuk keperluan audit.</span>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Alasan penghapusan (opsional — akan tercatat di histori)" className="min-h-[70px] text-sm" disabled={submitting} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Tidak</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5"
            disabled={submitting}
            onClick={(e) => {
              e.preventDefault(); // jangan tutup otomatis — biarkan handler yang menutup setelah sukses
              void onConfirm(reason.trim());
            }}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Ya, Hapus Permanen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
