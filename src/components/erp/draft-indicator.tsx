'use client';

/**
 * Indikator kecil "Draft otomatis tersimpan" + tombol buang draft.
 * Dipasang di header form (mis. di dalam FormTabShell action slot).
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Save, Trash2 } from 'lucide-react';

interface DraftIndicatorProps {
  hasDraft: boolean;
  ageLabel: string | null;
  onDiscard: () => void;
  /** Label pendek nama form untuk teks konfirmasi, mis. "Pembayaran". */
  formLabel?: string;
}

export function DraftIndicator({ hasDraft, ageLabel, onDiscard, formLabel = 'form' }: DraftIndicatorProps) {
  const [open, setOpen] = useState(false);

  if (!hasDraft) return null;

  return (
    <>
      <div className="flex items-center gap-1.5">
        <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50">
          <Save className="h-3 w-3" />
          Draft tersimpan{ageLabel ? ` • ${ageLabel}` : ''}
        </Badge>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setOpen(true)} title="Buang draft yang tersimpan">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Buang draft {formLabel}?</AlertDialogTitle>
            <AlertDialogDescription>Isian yang tersimpan otomatis akan dihapus dan form dikosongkan. Tindakan ini tidak bisa dibatalkan.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                onDiscard();
                setOpen(false);
              }}>
              Ya, Buang Draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
