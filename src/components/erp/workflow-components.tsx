'use client';

import { StockOperationErrorDialog, useStockOperationError } from '@/components/erp/stock-operation-error-dialog';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';
import { CheckCircle2, XCircle, Send, ArrowUpCircle, FileCheck, PlayCircle, Undo2, Ban } from 'lucide-react';
import { toast } from 'sonner';
import type { WorkflowState, WorkflowAction, WorkflowResponse } from '@/types/api';
import { ApiError } from '@/lib/api';
import { useTabStore } from '@/store/tab-store';
import { workflowApi } from '@/lib/workflow-api';

// ─── Status Badge ────────────────────────────────────────────────────────────

const STATE_CONFIG: Record<WorkflowState, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  PENDING: { label: 'Menunggu persetujuan', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  APPROVED: { label: 'Disetujui', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  REJECTED: { label: 'Ditolak', className: 'bg-red-100 text-red-700 border-red-200' },
  POSTED: { label: 'Sudah diposting', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  EXECUTED: { label: 'Sudah dieksekusi', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  CANCELLED: { label: 'Dibatalkan', className: 'bg-gray-100 text-gray-500 border-gray-200' }
};

export function WorkflowStateBadge({ state }: { state: WorkflowState }) {
  const c = STATE_CONFIG[state] || STATE_CONFIG.DRAFT;
  return (
    <Badge variant="secondary" className={`${c.className} text-xs whitespace-nowrap`}>
      {c.label}
    </Badge>
  );
}

// ─── Action buttons ──────────────────────────────────────────────────────────

const ACTION_CONFIG: Record<
  WorkflowAction,
  {
    label: string;
    icon: React.ElementType;
    variant: 'default' | 'outline' | 'destructive';
    className?: string;
    needsReason?: boolean;
  }
> = {
  submit: { label: 'Ajukan', icon: Send, variant: 'outline', className: 'text-blue-600 hover:text-blue-700' },
  approve: { label: 'Setujui', icon: CheckCircle2, variant: 'outline', className: 'text-emerald-600 hover:text-emerald-700' },
  reject: { label: 'Tolak', icon: XCircle, variant: 'outline', className: 'text-red-600 hover:text-red-700', needsReason: true },
  withdraw: { label: 'Tarik', icon: Undo2, variant: 'outline', className: 'text-amber-600 hover:text-amber-700', needsReason: true },
  post: { label: 'Posting', icon: FileCheck, variant: 'default' },
  execute: { label: 'Eksekusi', icon: PlayCircle, variant: 'default' },
  cancel: { label: 'Batalkan', icon: Ban, variant: 'outline', className: 'text-red-600 hover:text-red-700', needsReason: true }
};

export function WorkflowActions({ actions, onAction }: { actions: WorkflowAction[]; onAction: (action: WorkflowAction) => void }) {
  if (!actions || actions.length === 0) return null;

  return (
    <div className="inline-flex flex-wrap items-center gap-1">
      {actions.map((action) => {
        const config = ACTION_CONFIG[action];
        if (!config) return null;
        const Icon = config.icon;
        return (
          <Button key={action} variant={config.variant} size="sm" className={`h-7 gap-1.5 text-xs ${config.className || ''}`} onClick={() => onAction(action)}>
            <Icon className="h-3.5 w-3.5" />
            {config.label}
          </Button>
        );
      })}
    </div>
  );
}

// ─── Cell component (handles its own reason dialog & API call) ───────────────

interface WorkflowActionsCellProps {
  onEdit?: () => void;
  documentType: string;
  documentId: string;
  version: number;
  availableActions: WorkflowAction[];
  onDone?: () => void;
}

export function WorkflowActionsCell({ documentType, documentId, version, availableActions, onDone, onEdit }: WorkflowActionsCellProps) {
  const { error: stockError, clearError: clearStockError, handleError: handleStockError } = useStockOperationError(documentType);
  const [validationError, setValidationError] = React.useState('');
  const openFormTab = useTabStore((s) => s.openFormTab);
  const [pendingAction, setPendingAction] = React.useState<WorkflowAction | null>(null);
  const [reason, setReason] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const runAction = React.useCallback(
    async (action: WorkflowAction, reasonText?: string) => {
      setSubmitting(true);
      try {
        await workflowApi.performAction(documentType, documentId, action, {
          expectedVersion: version,
          reason: reasonText && reasonText.trim() ? reasonText.trim() : undefined
        });
        const cfg = ACTION_CONFIG[action];
        toast.success(`${cfg?.label || 'Aksi'} berhasil`);
        setPendingAction(null);
        setReason('');
        onDone?.();
      } catch (e) {
        setPendingAction(null);
        if (documentType === 'penerimaan_barang' || documentType === 'pengiriman_barang' || documentType === 'sales_retur' || documentType === 'purchase_retur') {
          handleStockError(e, `Gagal melakukan aksi ${action}`);
        } else if ((documentType === 'penyesuaian_stok' || documentType === 'jurnal_umum') && e instanceof ApiError && e.status === 400) {
          // JRN-001: penolakan validasi (mis. akun kontrol pada jurnal manual) —
          // tampilkan detail error secara persisten di dialog, bukan toast sekilas.
          setValidationError(e.detail);
        } else {
          toast.error(e instanceof Error ? e.message : `Gagal melakukan aksi ${action}`);
        }
        // JRN-001: kegagalan aksi BUKAN berarti dokumen terposting/berubah status.
        // Muat ulang state workflow agar versi & status yang tampil selalu yang
        // terbaru dari server (menghindari stale expectedVersion / loop 409).
        onDone?.();
      } finally {
        setSubmitting(false);
      }
    },
    [documentType, documentId, version, onDone, handleStockError]
  );

  const handleClick = (action: WorkflowAction) => {
    if (submitting) return;
    if (ACTION_CONFIG[action]?.needsReason) {
      setReason('');
      setPendingAction(action);
    } else void runAction(action);
  };

  const confirmReason = React.useCallback(() => {
    if (!pendingAction) return;
    void runAction(pendingAction, reason);
  }, [pendingAction, reason, runAction]);

  if (!availableActions || availableActions.length === 0) return null;

  return (
    <>
      <div className={submitting ? 'pointer-events-none opacity-60' : undefined} aria-busy={submitting}>
        <WorkflowActions actions={availableActions} onAction={handleClick} />
      </div>
      <StockOperationErrorDialog error={stockError} onClose={clearStockError} />
      <AlertDialog
        open={!!validationError}
        onOpenChange={(open) => {
          if (!open) setValidationError('');
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{documentType === 'jurnal_umum' ? 'Aksi Jurnal Ditolak' : validationError.includes('Gudang wajib diisi') ? 'Gudang Belum Diisi' : validationError.includes('FEFO') && validationError.includes('tanggal_kedaluwarsa') ? 'Tanggal Kedaluwarsa Belum Diisi' : 'Penyesuaian Tidak Dapat Diproses'}</AlertDialogTitle>
            <AlertDialogDescription>
              {validationError}
              {documentType === 'jurnal_umum' && <span className="mt-2 block text-xs text-muted-foreground">Dokumen tetap pada status workflow saat ini — belum terposting. Gunakan alur koreksi draft sesuai status workflow bila perlu perbaikan.</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Tutup</AlertDialogCancel>
            {(validationError.includes('Gudang wajib diisi') || (validationError.includes('FEFO') && validationError.includes('tanggal_kedaluwarsa'))) && (
              <AlertDialogAction
                onClick={() => {
                  setValidationError('');
                  if (onEdit) onEdit();
                  else openFormTab({ title: 'Edit Penyesuaian Persediaan', module: 'inventory', subPage: 'penyesuaian', formKey: 'penyesuaian-edit', formProps: { id: documentId } });
                }}>
                Edit Penyesuaian
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(o) => {
          if (!o && !submitting) {
            setPendingAction(null);
            setReason('');
          }
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingAction ? ACTION_CONFIG[pendingAction]?.label : ''} dokumen?</AlertDialogTitle>
            <AlertDialogDescription>Berikan alasan untuk aksi ini (opsional untuk beberapa aksi, namun disarankan).</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea placeholder="Tulis alasan..." value={reason} onChange={(e) => setReason(e.target.value)} rows={3} disabled={submitting} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmReason();
              }}
              disabled={submitting}
              className={pendingAction === 'reject' || pendingAction === 'cancel' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {pendingAction ? ACTION_CONFIG[pendingAction]?.label : 'Lanjutkan'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Convenience: render state badge + actions together ──────────────────────

export function WorkflowStateAndActions({ workflow, onDone }: { workflow: WorkflowResponse | null | undefined; onDone?: () => void }) {
  if (!workflow) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <WorkflowStateBadge state={workflow.state} />
      <WorkflowActionsCell documentType={workflow.documentType} documentId={workflow.documentId} version={workflow.version} availableActions={workflow.availableActions} onDone={onDone} />
    </div>
  );
}
