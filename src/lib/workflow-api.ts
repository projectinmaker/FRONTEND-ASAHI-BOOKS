import { api, type PaginatedResponse } from '@/lib/api';
import type { WorkflowResponse, WorkflowQueueItem, WorkflowActionRequest, WorkflowCapabilities } from '@/types/api';

export const workflowApi = {
  getCapabilities: () => api.get<WorkflowCapabilities>('/workflow'),

  getQueue: (state: string = 'PENDING', skip: number = 0, limit: number = 100) => api.get<PaginatedResponse<WorkflowQueueItem>>(`/workflow/queue?state=${state}&skip=${skip}&limit=${limit}`),

  getWorkflow: (documentType: string, documentId: string) => api.get<WorkflowResponse>(`/workflow/${documentType}/${documentId}`),

  performAction: (documentType: string, documentId: string, action: string, body: WorkflowActionRequest) => api.post<WorkflowResponse>(`/workflow/${documentType}/${documentId}/${action}`, body)
};
