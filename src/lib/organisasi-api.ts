import { api } from '@/lib/api';
import type { OrgUnit, OrgUnitCreate, OrgUnitUpdate, OrgDokumenResponse, OrgDokumenUpdate, KlasifikasiArusKasMapping, KlasifikasiArusKasCreate, ValidasiLaporanResponse, AuditLog } from '@/types/api';

export const organisasiApi = {
  // Units CRUD
  getUnits: (params: { kind?: string; parentId?: string; skip?: number; limit?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.kind) query.set('kind', params.kind);
    if (params.parentId) query.set('parentId', params.parentId);
    query.set('skip', String(params.skip || 0));
    query.set('limit', String(params.limit || 500));
    return api.get<OrgUnit[]>(`/organisasi/units?${query.toString()}`);
  },

  createUnit: (data: OrgUnitCreate) => api.post<OrgUnit>('/organisasi/units', data),

  updateUnit: (id: string, data: OrgUnitUpdate) => api.put<OrgUnit>(`/organisasi/units/${id}`, data),

  // Document dimensions
  getDokumenDims: (kind: string, documentId: string) => api.get<OrgDokumenResponse>(`/organisasi/dokumen/${kind}/${documentId}`),

  updateDokumenDims: (kind: string, documentId: string, data: OrgDokumenUpdate) => api.put<OrgDokumenResponse>(`/organisasi/dokumen/${kind}/${documentId}`, data),

  // Audit log
  getAudit: (skip: number = 0, limit: number = 100) => api.get<AuditLog[]>(`/organisasi/audit?skip=${skip}&limit=${limit}`),

  // Klasifikasi Arus Kas
  getKlasifikasi: (skip: number = 0, limit: number = 100) => api.get<KlasifikasiArusKasMapping[]>(`/organisasi/klasifikasi-arus-kas?skip=${skip}&limit=${limit}`),

  setKlasifikasi: (data: KlasifikasiArusKasCreate) => api.put<KlasifikasiArusKasMapping>('/organisasi/klasifikasi-arus-kas', data),

  // Validasi Laporan
  getValidasi: (dari: string, sampai: string, companyId?: string) => {
    const query = new URLSearchParams({ dari, sampai });
    if (companyId) query.set('companyId', companyId);
    return api.get<ValidasiLaporanResponse>(`/laporan/validasi?${query.toString()}`);
  }
};
