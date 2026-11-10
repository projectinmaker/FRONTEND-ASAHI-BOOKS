'use client';

/**
 * Dialog konfirmasi pembatalan dokumen (Update AUD-01 — non-destruktif).
 *
 * === Update #051 — AUDIT TEKS ===
 * Istilah teknis yang membingungkan user dihapus/diterjemahkan:
 * - "jurnal pembalik (non-destruktif)" → "pencatatan pembalikan otomatis"
 *   (mekanismenya dijelaskan dengan efeknya bagi user: saldo kembali,
 *   jejak tetap tersimpan — bukan dengan istilah akuntansi/internal).
 * - "BATAL/DIBATALKAN" (dua ejaan status sekaligus) → "Dibatalkan"
 *   (satu sebutan, sama seperti badge yang tampil di daftar dokumen).
 * - "tercatat di jurnal pembalik & workflow" → "tercatat di riwayat
 *   pembatalan" (workflow = istilah internal sistem).
 * Makna teknis tetap sama — hanya bahasanya yang dibuat awam.
 *
 * Dokumen yang SUDAH diposting dibatalkan dengan pencatatan pembalikan
 * otomatis: dokumen berstatus Dibatalkan, catatan asli tetap tersimpan
 * untuk audit, saldo & outstanding dipulihkan otomatis. Dokumen draft
 * (belum posting) dihapus permanen seperti kebijakan lama, dengan
 * jejak penghapusan ke log dokumen terhapus.
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
                    Dokumen {formLabel} sudah tercatat final. Pembatalannya dilakukan lewat <strong className="text-destructive">pencatatan pembalikan otomatis</strong>: saldo &amp; data terkait dikembalikan seperti sebelumnya, dokumen menjadi berstatus <strong>Dibatalkan</strong>, dan catatan aslinya tetap tersimpan untuk audit.
                  </span>
                  <span className="block text-muted-foreground">Periode akuntansi yang sudah ditutup tidak bisa dibatalkan — buka dulu periode tersebut lewat menu Penutupan Periode.</span>
                </>
              )}
              {posted === false && (
                <>
                  <span className="block">
                    Dokumen {formLabel} masih draft (belum tercatat final) dan akan <strong className="text-destructive">dihapus permanen</strong> beserta datanya. Tindakan ini tidak bisa dibatalkan.
                  </span>
                  <span className="block text-muted-foreground">Jejak dokumen yang dihapus tetap tersimpan di riwayat untuk keperluan audit.</span>
                </>
              )}
              {posted === undefined && (
                <>
                  <span className="block">
                    Bila dokumen {formLabel} <strong>sudah tercatat final</strong>: dibatalkan lewat pencatatan pembalikan otomatis — saldo &amp; data terkait dikembalikan, dokumen menjadi <strong>Dibatalkan</strong>, catatan asli tetap tersimpan untuk audit.
                  </span>
                  <span className="block">
                    Bila masih <strong>draft</strong>: dokumen dihapus permanen beserta datanya (jejaknya tetap tersimpan di riwayat).
                  </span>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={posted ? `Alasan pembatalan (opsional — tercatat di riwayat pembatalan)` : `Alasan pembatalan (opsional — tercatat di riwayat)`} className="min-h-[70px] text-sm" disabled={submitting} />
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
            {posted === false ? 'Ya, Hapus Permanen' : 'Ya, Batalkan'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
