'use client';
import { Input } from '@/components/ui/input';
import type { COARules } from '@/types/api';
import { ACCOUNT_CLASSES, FINANCIAL_STATEMENTS, SUBLEDGER_TYPES, SYSTEM_ACCOUNT_TYPES } from '@/lib/coa';
export const defaultRules: COARules = { accountClass: null, accountSubclass: null, financialStatement: null, reportGroup: null, systemAccountType: null, allowSystemPosting: true, allowManualPosting: true, isControlAccount: false, subledgerType: null, reconciliationRequired: false, active: true };
export function COARulesForm({ value, onChange, admin, disabled }: { value: COARules; onChange: (v: COARules) => void; admin: boolean; disabled: boolean }) {
  const set = (key: keyof COARules, v: string | boolean | null) => onChange({ ...value, [key]: v, ...(key === 'isControlAccount' && v === true ? { allowManualPosting: false } : {}) });
  return (
    <fieldset disabled={disabled} className="space-y-4 rounded border p-4">
      <legend className="px-2 font-semibold">Klasifikasi & Control</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {(['accountClass', 'financialStatement', 'subledgerType'] as const).map((key) => (
          <label key={key} className="space-y-1 text-sm">
            {{ accountClass: 'Kelas akun', financialStatement: 'Laporan keuangan', subledgerType: 'Jenis subledger' }[key]}
            <select className="block w-full rounded border bg-background p-2" value={value[key] || ''} onChange={(e) => set(key, e.target.value || null)} required={key === 'subledgerType' && value.isControlAccount}>
              <option value="">{key === 'accountClass' ? 'Otomatis dari header' : 'Tidak dipilih'}</option>
              {(key === 'accountClass' ? ACCOUNT_CLASSES : key === 'financialStatement' ? FINANCIAL_STATEMENTS : SUBLEDGER_TYPES).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        ))}
        {(['accountSubclass', 'reportGroup'] as const).map((key) => (
          <label key={key} className="space-y-1 text-sm">
            {key === 'accountSubclass' ? 'Subkelas akun' : 'Grup laporan'}
            <Input value={value[key] || ''} onChange={(e) => set(key, e.target.value || null)} />
          </label>
        ))}
        <label className="space-y-1 text-sm">
          Tipe akun sistem
          <select className="block w-full rounded border bg-background p-2" value={value.systemAccountType || ''} onChange={(e) => set('systemAccountType', e.target.value || null)} disabled={!admin} title={admin ? 'Khusus akun sistem (control account, akun auto-posting, dsb). Biasanya di-set via migration runner.' : 'Hanya administrator yang dapat mengubah tipe akun sistem.'}>
            <option value="">Tidak dipilih</option>
            {SYSTEM_ACCOUNT_TYPES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          {!admin && <span className="block text-[11px] text-muted-foreground">Hanya admin yang dapat mengubah.</span>}
        </label>
      </div>
      <p className="font-medium">Aturan Posting</p>
      <div className="flex flex-wrap gap-4">
        {(['allowSystemPosting', 'allowManualPosting', 'isControlAccount', 'reconciliationRequired', 'active'] as const).map((key) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!value[key]} disabled={key === 'allowManualPosting' && !!value.isControlAccount} onChange={(e) => set(key, e.target.checked)} />
            {{ allowSystemPosting: 'Posting sistem', allowManualPosting: 'Jurnal manual', isControlAccount: 'Control account', reconciliationRequired: 'Wajib rekonsiliasi', active: 'Aktif' }[key]}
          </label>
        ))}
      </div>
      {value.isControlAccount && !value.subledgerType && (
        <p role="alert" className="text-sm text-destructive">
          Jenis subledger wajib dipilih untuk control account.
        </p>
      )}
    </fieldset>
  );
}
