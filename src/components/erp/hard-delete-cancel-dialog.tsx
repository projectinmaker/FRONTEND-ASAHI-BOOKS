'use client';

/**
 * Dialog konfirmasi pembatalan dokumen (Update AUD-01 — non-destruktif).
 *
 * Dokumen yang SUDAH diposting dibatalkan dengan JURNAL PEMBALIK:
 * dokumen berstatus BATAL/DIBATALKAN, jurnal asli tetap tersimpan untuk
 * audit, saldo & outstanding dipulihkan otomatis. Dokumen draft (belum
 * posting) dihapus permanen seperti kebijakan lama, dengan snapshot
 * histori ke log dokumen terhapus.
 */

import { useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Trash2, Undo2 } from 'lucide-react';

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
  /** Update AUD-01 — true bila dokumen sudah diposting (punya jurnal):
   *  pembatalan akan membuat jurnal pembalik, bukan penghapusan. */
  posted?: boolean;
}

export function HardDeleteCancelDialog({ open, onOpenChange, title, formLabel, submitting, onConfirm, posted }: HardDeleteCancelDialogProps) {
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
            {posted ? <Undo2 className="h-5 w-5 text-destructive" /> : <Trash2 className="h-5 w-5 text-destructive" />}
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-left">
              {posted === true && (
                <>
                  <span className="block">
                    Dokumen {formLabel} sudah <strong>diposting</strong> — pembatalan dibuatkan <strong className="text-destructive">jurnal pembalik</strong> (non-destruktif). Dokumen berstatus <strong>BATAL/DIBATALKAN</strong>, jurnal asli tetap tersimpan untuk audit, dan saldo piutang/hutang/kas dipulihkan otomatis.
                  </span>
                  <span className="block text-muted-foreground">Periode yang sudah ditutup tidak bisa dibatalkan — buka periode terlebih dahulu lewat Penutupan Periode.</span>
                </>
              )}
              {posted === false && (
                <>
                  <span className="block">
                    Dokumen {formLabel} belum diposting (draft) dan akan <strong className="text-destructive">dihapus permanen</strong> beserta datanya. Tindakan ini tidak dapat dibatalkan.
                  </span>
                  <span className="block text-muted-foreground">Histori dokumen tetap tersimpan di log dokumen terhapus untuk keperluan audit.</span>
                </>
              )}
              {posted === undefined && (
                <>
                  <span className="block">
                    Bila dokumen {formLabel} <strong>sudah diposting</strong>: dibuatkan <strong className="text-destructive">jurnal pembalik</strong> (non-destruktif) — dokumen berstatus BATAL/DIBATALKAN, jurnal asli tetap tersimpan untuk audit, saldo &amp; outstanding dipulihkan.
                  </span>
                  <span className="block">
                    Bila masih <strong>draft</strong>: dihapus permanen beserta datanya (histori snapshot tetap tersimpan).
                  </span>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={`Alasan pembatalan (opsional — ${posted ? 'tercatat di jurnal pembalik & workflow' : 'akan tercatat di histori'})`} className="min-h-[70px] text-sm" disabled={submitting} />
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
            {posted === true ? 'Ya, Batalkan (Jurnal Pembalik)' : posted === false ? 'Ya, Hapus Permanen' : 'Ya, Batalkan Dokumen'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
