import { api, type PaginatedResponse } from '@/lib/api';
import type { PelunasanCreate, PelunasanResponse, TagihanListResponse, InvoiceSaldoDetailResponse, JenisPelunasan, StatusPembayaran } from '@/types/api';

// Re-export for convenience (other modules may import from here)
export type { PaginatedResponse };

export const pelunasanApi = {
  create: (jenis: JenisPelunasan, data: PelunasanCreate) => api.post<PelunasanResponse>(`/pelunasan/${jenis}`, data),

  getDetail: (jenis: JenisPelunasan, paymentId: string) => api.get<PelunasanResponse>(`/pelunasan/${jenis}/${paymentId}`),

  update: (jenis: JenisPelunasan, paymentId: string, data: PelunasanCreate) => api.put<PelunasanResponse>(`/pelunasan/${jenis}/${paymentId}`, data),

  getTagihan: (
    jenis: JenisPelunasan,
    params: {
      pihakId?: string;
      statusPembayaran?: StatusPembayaran | '';
      asOf?: string;
      skip?: number;
      limit?: number;
    } = {}
  ) => {
    const query = new URLSearchParams();
    if (params.pihakId) query.set('pihakId', params.pihakId);
    if (params.statusPembayaran) query.set('statusPembayaran', params.statusPembayaran);
    if (params.asOf) query.set('asOf', params.asOf);
    query.set('skip', String(params.skip || 0));
    query.set('limit', String(params.limit || 100));
    return api.get<TagihanListResponse>(`/pelunasan/tagihan/${jenis}?${query.toString()}`);
  },

  getInvoiceSaldo: (jenis: JenisPelunasan, invoiceId: string, asOf?: string) => {
    const query = asOf ? `?asOf=${asOf}` : '';
    return api.get<InvoiceSaldoDetailResponse>(`/pelunasan/invoice/${jenis}/${invoiceId}${query}`);
  }
};
