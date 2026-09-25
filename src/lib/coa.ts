import { api, type PaginatedResponse } from '@/lib/api';
import type { COAResponse } from '@/types/api';

export const ACCOUNT_CLASSES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'COGS', 'EXPENSE'];
export const FINANCIAL_STATEMENTS = ['NERACA', 'LABA RUGI'];
export const SUBLEDGER_TYPES = ['AR', 'AP', 'INVENTORY', 'BANK_TRANSFER'];

// Sumber: app/schemas/coa.py (KNOWN_SYSTEM_ACCOUNT_TYPES) — sync dengan backend.
// Dipakai untuk dropdown `systemAccountType` di form COA. Update bersamaan
// kalau backend menambah enum baru.
export const SYSTEM_ACCOUNT_TYPES = ['AR_CONTROL', 'AP_CONTROL', 'BANK_CLEARING', 'CURRENT_EARNINGS', 'RETAINED_EARNINGS', 'COGS_FINISHED_GOODS', 'INVENTORY_RAW', 'INVENTORY_AUX', 'INVENTORY_WIP', 'INVENTORY_FINISHED', 'LEGACY_COGS_PURCHASE', 'DIVIDEND', 'CASH_BANK', 'FIXED_ASSET', 'ACCUM_DEPR', 'DEPRECIATION_EXPENSE', 'VAT_INPUT', 'VAT_OUTPUT', 'SALES', 'OTHER_INCOME', 'OTHER_EXPENSE', 'SELLING_EXPENSE', 'ADMIN_EXPENSE', 'FACTORY_OVERHEAD', 'INCOME_TAX', 'CORPORATE_INCOME_TAX', 'OTHER_AR'] as const;
export const isActive = (a: COAResponse) => a.active ?? a.status === 'AKTIF';
export const canPostManually = (a: COAResponse) => isActive(a) && a.tingkat === 'DETAIL' && a.isPostableForManual === true && a.allowManualPosting !== false && !a.isControlAccount && !a.isLegacyLocked && !a.isSystemAccount;
export interface COAFilters {
  tingkat?: string;
  activeOnly?: boolean;
  allowManualPosting?: boolean;
  isControlAccount?: boolean;
  subledgerType?: string;
  accountClass?: string;
}
export function coaQuery(filters: COAFilters): URLSearchParams {
  const params = new URLSearchParams();
  const names: Record<string, string> = { activeOnly: 'active_only', allowManualPosting: 'allow_manual_posting', isControlAccount: 'is_control_account', subledgerType: 'subledger_type', accountClass: 'account_class' };
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== '') params.set(names[k] || k, String(v));
  });
  return params;
}
export async function loadCOA(filters: COAFilters = {}): Promise<COAResponse[]> {
  const params = coaQuery(filters);
  params.set('limit', '500');
  const result: COAResponse[] = [];
  for (let skip = 0; ; ) {
    params.set('skip', String(skip));
    const page = await api.get<PaginatedResponse<COAResponse>>('/coa/?' + params);
    result.push(...page.data);
    skip += page.data.length;
    if (!page.data.length || skip >= page.total) return result;
  }
}
export const EXPECTED_SYSTEM_TYPES: Record<string, string> = {
  PIUTANG_USAHA: 'AR_CONTROL',
  HUTANG_USAHA: 'AP_CONTROL',
  BANK_CLEARING: 'BANK_CLEARING',
  HPP_PRODUK_JADI: 'COGS_FINISHED_GOODS',
  LABA_RUGI_TAHUN_BERJALAN: 'CURRENT_EARNINGS',
  LABA_DITAHAN: 'RETAINED_EARNINGS',
  PERSEDIAAN_BAHAN_BAKU: 'INVENTORY_RAW',
  PERSEDIAAN_BAHAN_PEMBANTU: 'INVENTORY_AUX',
  PERSEDIAAN_WIP: 'INVENTORY_WIP',
  PERSEDIAAN_BARANG_JADI: 'INVENTORY_FINISHED'
};

export async function loadSystemCOA(): Promise<COAResponse[]> {
  return (await loadCOA({ tingkat: 'DETAIL', activeOnly: true })).filter((a) => isActive(a) && a.isPostableForSystem === true && a.allowSystemPosting !== false && !a.isLegacyLocked && !a.isSystemAccount);
}
