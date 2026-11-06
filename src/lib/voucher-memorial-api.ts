/**
 * === Update #044 — API client Voucher Memorial (Gagal Tagih) ===
 * Cabang "Gagal Tagih" alur Penerimaan Piutang modul Kas & Bank:
 * penghapusan piutang non-kas (Dr Beban Penghapusan Piutang, Cr Piutang Usaha).
 */
import { api } from '@/lib/api';
import type { PaginatedResponse } from '@/lib/api';
import type { VoucherMemorialCreate, VoucherMemorialResponse, VoucherMemorialSummaryResponse } from '@/types/api';

export const voucherMemorialApi = {
  /** Daftar Voucher Memorial (filter + pagination). */
  list: (
    params: {
      skip?: number;
      limit?: number;
      search?: string;
      status?: string;
      pelangganId?: string;
      tanggalFrom?: string;
      tanggalTo?: string;
    } = {}
  ) => {
    const query = new URLSearchParams();
    query.set('skip', String(params.skip || 0));
    query.set('limit', String(params.limit || 100));
    if (params.search) query.set('search', params.search);
    if (params.status && params.status !== 'ALL') query.set('status', params.status);
    if (params.pelangganId) query.set('pelanggan_id', params.pelangganId);
    if (params.tanggalFrom) query.set('tanggal_from', params.tanggalFrom);
    if (params.tanggalTo) query.set('tanggal_to', params.tanggalTo);
    return api.get<PaginatedResponse<VoucherMemorialResponse>>(`/kas-bank/voucher-memorial?${query.toString()}`);
  },

  /** Preview nomor berikutnya "VM ASI/YYYY/NNN" (indikatif, tanpa create). */
  nextNomor: (tanggal?: string) => {
    const query = tanggal ? `?tanggal=${tanggal}` : '';
    return api.get<{ nomor: string }>(`/kas-bank/voucher-memorial/next-nomor${query}`);
  },

  /** Detail 1 Voucher Memorial (dipakai tab Cetak). */
  getDetail: (id: string) => api.get<VoucherMemorialResponse>(`/kas-bank/voucher-memorial/${id}`),

  /** Buat Voucher Memorial ( Administrator → langsung posting; lainnya DRAFT workflow). */
  create: (data: VoucherMemorialCreate) => api.post<VoucherMemorialSummaryResponse>('/kas-bank/voucher-memorial', data),

  /** Batalkan/hapus (DRAFT → hard delete; posted → jurnal pembalik + BATAL). */
  cancel: (id: string, reason?: string) =>
    api.post<{ message?: string; documentNumber?: string }>(`/kas-bank/voucher-memorial/${id}/cancel`, {
      reason: reason || undefined
    })
};
