import { api } from '@/lib/api';
import type { WorkflowResponse, WorkflowActionRequest, WorkflowPendingSummary, WorkflowStateLite, ApprovalConfigItem, ApprovalConfigUpdateRequest } from '@/types/api';

// ═══════════════════════════════════════════════════════════════════════════
// === Update #071 —
//  • getQueue/getCapabilities DIHAPUS (halaman Antrean Persetujuan dihapus;
//    backend menghapus GET /workflow/queue dan GET /workflow).
//  • BARU getPendingSummary — badge lonceng header (query agregasi ringan).
//  • BARU getStates — status persetujuan BATCH satu halaman daftar
//    (pengganti polling per-baris N+1; riwayat tetap on-demand per dokumen).
//  • BARU getApprovalConfig/updateApprovalConfig — Preferensi ▸ Persetujuan.
// ═══════════════════════════════════════════════════════════════════════════

export const workflowApi = {
  getWorkflow: (documentType: string, documentId: string) => api.get<WorkflowResponse>(`/workflow/${documentType}/${documentId}`),

  getStates: (documentType: string, documentIds: string[]) => api.get<{ data: WorkflowStateLite[] }>(`/workflow/states?documentType=${encodeURIComponent(documentType)}&ids=${documentIds.join(',')}`),

  performAction: (documentType: string, documentId: string, action: string, body: WorkflowActionRequest) => api.post<WorkflowResponse>(`/workflow/${documentType}/${documentId}/${action}`, body),

  getPendingSummary: () => api.get<WorkflowPendingSummary>('/workflow/pending-summary'),

  getApprovalConfig: () => api.get<{ data: ApprovalConfigItem[] }>('/workflow/approval-config'),

  updateApprovalConfig: (documentType: string, body: ApprovalConfigUpdateRequest) => api.put<{ documentType: string; enabled: boolean; approverCount: number }>(`/workflow/approval-config/${documentType}`, body)
};
