'use client';
import { loadCOA, canPostManually } from '@/lib/coa';
import { getRefModules, groupRefModules } from '@/lib/ref-module';
import type { COAResponse, RefModuleOption } from '@/types/api';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useERPStore } from '@/store/erp-store';
import { useTabStore } from '@/store/tab-store';
import { useAuthStore } from '@/store/auth-store';
import { useFormDraft, draftKey } from '@/hooks/use-form-draft';
import { DraftIndicator } from '@/components/erp/draft-indicator';
import { FormTabShell } from '@/components/erp/form-tab-shell';
import { api, PaginatedResponse, ApiError } from '@/lib/api';
import { formatRp, formatDate } from '@/lib/pdf-utils';
import { toCentsHalfUp, hasSubCentPrecision } from '@/lib/money';
import { toast } from 'sonner';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import type { JurnalUmumListResponse, JurnalUmumDetailResponse, JurnalManualCreate, COADropdownResponse, RefModule, StatusJurnal, WorkflowResponse } from '@/types/api';
import { BookOpen, Search, ChevronLeft, ChevronRight, Eye, ArrowUpRight, ArrowDownRight, Loader2, Plus, Trash2, FilePlus, Pencil } from 'lucide-react';
import { WorkflowStateBadge, WorkflowActionsCell } from '@/components/erp/workflow-components';
import { useWorkflowStates } from '@/lib/use-workflow-states';
import { workflowApi } from '@/lib/workflow-api';

// ─── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'Semua' },
  { value: 'POSTED', label: 'POSTED' },
  { value: 'DRAFT', label: 'DRAFT' }
];

// Warna badge per group (dipakai untuk enum canonical).
// Enum legacy selalu pakai warna abu-abu (lihat RefModuleBadge).
const REF_MODULE_GROUP_COLORS: Record<string, string> = {
  Accounting: 'bg-gray-100 text-gray-700 border-gray-200',
  Penjualan: 'bg-blue-100 text-blue-700 border-blue-200',
  Pembelian: 'bg-amber-100 text-amber-700 border-amber-200',
  Persediaan: 'bg-teal-100 text-teal-700 border-teal-200',
  'Aset Tetap': 'bg-violet-100 text-violet-700 border-violet-200',
  'Kas & Bank': 'bg-cyan-100 text-cyan-700 border-cyan-200'
};

// ─── Badge Components ───────────────────────────────────────────────────────

function StatusBadge({ status }: { status: StatusJurnal }) {
  if (status === 'POSTED') {
    return <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">POSTED</Badge>;
  }
  return <Badge className="border-amber-200 bg-amber-100 text-amber-700 hover:bg-amber-100">DRAFT</Badge>;
}

function RefModuleBadge({ module, lookup }: { module: RefModule | null; lookup?: Map<string, RefModuleOption> }) {
  if (!module) return <span className="text-muted-foreground">—</span>;
  const opt = lookup?.get(module);
  // Kalau lookup belum siap (mis. saat loading), fallback ke value mentah.
  const label = opt?.label || module.replace(/_/g, ' ');
  if (opt?.isLegacy) {
    return (
      <span title="Enum legacy — tidak dipakai untuk transaksi baru." className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500 opacity-70">
        {label}
      </span>
    );
  }
  const cls = (opt?.group && REF_MODULE_GROUP_COLORS[opt.group]) || 'bg-gray-100 text-gray-700 border-gray-200';
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

// ─── Summary Card ──────────────────────────────────────────────────────────

function SummaryCard({ icon: Icon, label, value, iconBgColor, iconColor, loading }: { icon: React.ElementType; label: string; value: string; iconBgColor: string; iconColor: string; loading?: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconBgColor}`}>{loading ? <Loader2 className={`h-6 w-6 animate-spin ${iconColor}`} /> : <Icon className={`h-6 w-6 ${iconColor}`} />}</div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground truncate">{label}</p>
          {loading ? <Skeleton className="mt-1.5 h-6 w-24" /> : <p className="mt-0.5 text-xl font-bold tracking-tight truncate">{value}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Skeleton helpers ───────────────────────────────────────────────────────

function SkeletonRows({ cols = 9 }: { cols?: number }) {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-24" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

// ─── Error Card ─────────────────────────────────────────────────────────────

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-destructive">
      <CardContent className="p-4">
        <p className="text-sm text-destructive font-medium">{message}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          Coba Lagi
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Props interface ─────────────────────────────────────────────────────────

interface GeneralLedgerProps {
  subPage?: string;
  refreshKey?: number;
  formMode?: string;
  formProps?: Record<string, unknown>;
}

// ─── Jurnal Detail Tab (rendered in tab) ─────────────────────────────────────

function JurnalUmumDetailTab({ jurnalId }: { jurnalId: string }) {
  const [detail, setDetail] = useState<JurnalUmumDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [wf, setWf] = useState<WorkflowResponse | null>(null);
  const openFormTab = useTabStore((s) => s.openFormTab);

  // RefModule lookup untuk badge di detail view.
  // Pakai cache service, jadi tidak fetch ulang kalau sudah di-cache.
  const [refModuleLookup, setRefModuleLookup] = useState<Map<string, RefModuleOption>>(new Map());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getRefModules(true);
        if (!cancelled) setRefModuleLookup(new Map(list.map((m) => [m.value, m])));
      } catch {
        // silently skip — badge fallback ke value mentah
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Workflow state — dipakai untuk tombol Edit (canEdit hanya true di DRAFT/REJECTED).
  useEffect(() => {
    let cancelled = false;
    workflowApi
      .getWorkflow('jurnal_umum', jurnalId)
      .then((w) => {
        if (!cancelled) setWf(w);
      })
      .catch(() => {
        // Jurnal sistem/reversal tidak punya workflow — biarkan null.
      });
    return () => {
      cancelled = true;
    };
  }, [jurnalId]);

  const fetchDetail = useCallback(async (id: string) => {
    setLoading(true);
    setError('');
    setDetail(null);
    try {
      const d = await api.get<JurnalUmumDetailResponse>(`/jurnal/${id}`);
      setDetail(d);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal memuat detail jurnal';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (jurnalId) fetchDetail(jurnalId);
  }, [jurnalId, fetchDetail]);

  const totalDebit = detail ? detail.details.reduce((s, d) => s + Number(d.debit), 0) : 0;
  const totalKredit = detail ? detail.details.reduce((s, d) => s + Number(d.kredit), 0) : 0;

  if (loading) {
    return (
      <FormTabShell title="Detail Jurnal Umum">
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-36" />
              </div>
            ))}
          </div>
          <Skeleton className="h-48 w-full" />
        </div>
      </FormTabShell>
    );
  }

  if (error) {
    return (
      <FormTabShell title="Detail Jurnal Umum">
        <div className="py-4 text-center text-sm text-destructive">{error}</div>
      </FormTabShell>
    );
  }

  return (
    <FormTabShell title="Detail Jurnal Umum">
      {detail && (
        <div className="space-y-4">
          {/* Header Info */}
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border p-4 bg-muted/30">
                <div className="space-y-0.5">
                  <Label className="text-xs text-muted-foreground">No Jurnal</Label>
                  <p className="text-sm font-semibold">{detail.noJurnal}</p>
                </div>
                <div className="space-y-0.5">
                  <Label className="text-xs text-muted-foreground">Tanggal</Label>
                  <p className="text-sm font-medium">{formatDate(detail.tanggal)}</p>
                </div>
                <div className="space-y-0.5">
                  <Label className="text-xs text-muted-foreground">Tipe Transaksi</Label>
                  <p className="text-sm font-medium">{detail.tipeTransaksi || '—'}</p>
                </div>
                <div className="space-y-0.5">
                  <Label className="text-xs text-muted-foreground">Ref Module</Label>
                  <div className="text-sm">
                    <RefModuleBadge module={detail.refModule} lookup={refModuleLookup} />
                  </div>
                </div>
                <div className="space-y-0.5">
                  <Label className="text-xs text-muted-foreground">Ref No</Label>
                  <p className="text-sm font-medium">{detail.refNo || '—'}</p>
                </div>
                <div className="space-y-0.5">
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <div className="text-sm">
                    <StatusBadge status={detail.status} />
                  </div>
                </div>
                <div className="sm:col-span-2 space-y-0.5">
                  <Label className="text-xs text-muted-foreground">Keterangan</Label>
                  <p className="text-sm font-medium">{detail.keterangan || '—'}</p>
                </div>
                <div className="space-y-0.5">
                  <Label className="text-xs text-muted-foreground">Dibuat Oleh</Label>
                  <p className="text-sm font-medium">{detail.creator.namaLengkap}</p>
                </div>
                {/* JRN-001: tombol koreksi draft — hanya untuk jurnal manual non-reversal
                    yang workflow-nya masih DRAFT/REJECTED (canEdit dari server). */}
                {detail.refModule === 'MANUAL' && !detail.reversalOfId && wf?.canEdit && (
                  <div className="sm:col-span-2 flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() =>
                        openFormTab({
                          title: `Edit ${detail.noJurnal}`,
                          module: 'general-ledger',
                          subPage: 'jurnal-umum',
                          formKey: 'jurnal-manual-edit',
                          formProps: { jurnalId: detail.id }
                        })
                      }>
                      <Pencil className="h-4 w-4" />
                      Edit Jurnal
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Line Items Table */}
          <Card>
            <CardContent className="p-0">
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">No</TableHead>
                      <TableHead>Akun Perkiraan</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Kredit</TableHead>
                      <TableHead>Keterangan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.details.map((item, idx) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell>
                          <span className="font-mono text-xs text-muted-foreground">{item.akunPerkiraan.kode}</span> <span className="text-sm">{item.akunPerkiraan.nama}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(item.debit) > 0 ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                              <ArrowUpRight className="h-3 w-3" />
                              {formatRp(item.debit)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(item.kredit) > 0 ? (
                            <span className="inline-flex items-center gap-1 text-rose-600 font-medium">
                              <ArrowDownRight className="h-3 w-3" />
                              {formatRp(item.kredit)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{item.keterangan || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Totals */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row justify-end gap-4 rounded-lg border p-4 bg-muted/30">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Total Debit</p>
                  <p className="text-lg font-bold text-emerald-600">{formatRp(totalDebit)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Total Kredit</p>
                  <p className="text-lg font-bold text-rose-600">{formatRp(totalKredit)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Selisih</p>
                  <p className={`text-lg font-bold ${totalDebit === totalKredit ? 'text-emerald-600' : 'text-destructive'}`}>{formatRp(Math.abs(totalDebit - totalKredit))}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </FormTabShell>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Jurnal Manual Create Form (rendered in tab)
// ════════════════════════════════════════════════════════════════════════════

interface JurnalManualDetailRow {
  akunPerkiraanId: string;
  debit: string;
  kredit: string;
  keterangan: string;
}

/** Bentuk data draft otomatis (localStorage) untuk jurnal manual create. */
interface JurnalManualDraftData {
  tanggal: string;
  keterangan: string;
  details: JurnalManualDetailRow[];
}

// Tanggal lokal (bukan UTC) — `toISOString()` memakai UTC sehingga jam 00:00–06:59 WIB
// masih terhitung "kemarin". Form tanggal <input type="date"> butuh tanggal lokal user.
const toLocalDateInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayIso = () => toLocalDateInput(new Date());
// Konversi timestamp backend (UTC ISO) → tanggal lokal untuk prefill form edit.
// Tanpa ini, slice(0,10) pada string UTC menggeser tanggal -1 hari untuk WIB (UTC+7).
const isoToLocalDateInput = (iso: string) => toLocalDateInput(new Date(iso));

const emptyDetailRow: JurnalManualDetailRow = {
  akunPerkiraanId: '',
  debit: '',
  kredit: '',
  keterangan: ''
};

// JRN-002 — validasi nilai baris pada angka HASIL pembulatan HALF_UP, cermin
// rule backend validate_entries ("debit atau kredit, bukan keduanya/nol").
// Pesan sengaja tidak menyalin teks server (aturan catatan: jangan match teks error).
function jurnalRowValueError(row: JurnalManualDetailRow): string {
  const rawDebit = parseFloat(row.debit) || 0;
  const rawKredit = parseFloat(row.kredit) || 0;
  if (rawDebit === 0 && rawKredit === 0) return ''; // baris belum diisi
  const debitCents = toCentsHalfUp(row.debit);
  const kreditCents = toCentsHalfUp(row.kredit);
  if (debitCents < 0 || kreditCents < 0) return 'Nilai debit/kredit tidak boleh negatif.';
  if (debitCents > 0 && kreditCents > 0) return 'Isi hanya salah satu sisi (debit atau kredit), bukan keduanya.';
  if (debitCents === 0 && kreditCents === 0) return 'Nilai menjadi 0 setelah dibulatkan ke 2 desimal (HALF_UP) — baris nol akan ditolak server. Naikkan nilai atau hapus baris ini.';
  return '';
}

function JurnalManualForm() {
  const [accountErrors, setAccountErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [tanggal, setTanggal] = useState<string>(todayIso());
  const [keterangan, setKeterangan] = useState<string>('');
  const [details, setDetails] = useState<JurnalManualDetailRow[]>([{ ...emptyDetailRow }, { ...emptyDetailRow }]);
  const [coaOptions, setCoaOptions] = useState<COAResponse[]>([]);
  const [loadingDropdowns, setLoadingDropdowns] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // ── Draft otomatis (form create; dipulihkan saat kembali ke form ini) ──
  const userId = useAuthStore((s) => s.user?.id ?? 'anon');
  const draft = useFormDraft<JurnalManualDraftData>(draftKey(userId, 'general-ledger', 'jurnal-manual', 'create'));
  const skipNextSaveRef = useRef(false);
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const d = draft.draft;
    if (!d) return;
    if (d.tanggal) setTanggal(d.tanggal);
    if (d.keterangan) setKeterangan(d.keterangan);
    if (Array.isArray(d.details) && d.details.length >= 2) setDetails(d.details);
    toast.info('Draft isian dipulihkan', { description: 'Isian terakhir form Jurnal Manual dimuat kembali otomatis.' });
  }, []);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    draft.saveDraft({ tanggal, keterangan, details });
  }, [tanggal, keterangan, details]);

  const handleDiscardDraft = useCallback(() => {
    skipNextSaveRef.current = true;
    draft.clearDraft();
    setTanggal(todayIso());
    setKeterangan('');
    setDetails([{ ...emptyDetailRow }, { ...emptyDetailRow }]);
    setAccountErrors({});
    setSubmitError('');
  }, []);

  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  // Fetch COA dropdown
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingDropdowns(true);
      try {
        const res = await loadCOA({ tingkat: 'DETAIL', activeOnly: true, allowManualPosting: true });
        if (!cancelled) setCoaOptions(res);
      } catch (err) {
        if (err instanceof ApiError) toast.error(err.detail);
        else toast.error('Gagal memuat daftar akun perkiraan');
      } finally {
        if (!cancelled) setLoadingDropdowns(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Computed totals — JRN-002: pratinjau membulatkan TIAP BARIS ke 2 desimal
  // (HALF_UP) lalu menjumlahkan dalam satuan sen, identik dengan
  // validate_entries di backend (bukan menjumlahkan mentah lalu membulatkan total).
  const totalDebitCents = details.reduce((sum, d) => sum + toCentsHalfUp(d.debit), 0);
  const totalKreditCents = details.reduce((sum, d) => sum + toCentsHalfUp(d.kredit), 0);
  const selisihCents = totalDebitCents - totalKreditCents;
  const isBalanced = selisihCents === 0;
  const rowValueErrors = details.map(jurnalRowValueError);
  const hasRowValueErrors = rowValueErrors.some(Boolean);
  const hasMinRows = details.length >= 2;
  const hasAllAccounts = details.every((d) => d.akunPerkiraanId);
  const hasAnyValue = details.some((d) => (parseFloat(d.debit) || 0) > 0 || (parseFloat(d.kredit) || 0) > 0);
  const rowError = (id: string) => (!id ? '' : accountErrors[id] || (!coaOptions.some((a) => a.id === id && canPostManually(a)) ? 'Akun tidak tersedia untuk jurnal manual. Pilih akun aktif yang mengizinkan posting manual.' : ''));
  const hasInvalidAccounts = details.some((d) => !!rowError(d.akunPerkiraanId));
  const canSubmit = !loadingDropdowns && !hasInvalidAccounts && !hasRowValueErrors && !submitting && !!tanggal && !!keterangan.trim() && hasMinRows && hasAllAccounts && hasAnyValue && isBalanced;

  const updateRow = (idx: number, field: keyof JurnalManualDetailRow, value: string) => {
    if (field === 'akunPerkiraanId') setSubmitError('');
    setDetails((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));
  };

  const addRow = () => {
    setDetails((prev) => [...prev, { ...emptyDetailRow }]);
  };

  const removeRow = (idx: number) => {
    if (details.length <= 2) {
      toast.error('Minimal harus ada 2 baris detail jurnal');
      return;
    }
    setDetails((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      toast.error('Periksa akun, nilai, dan keseimbangan jurnal sebelum menyimpan.');
      return;
    }
    if (!tanggal) {
      toast.error('Tanggal jurnal wajib diisi');
      return;
    }
    if (!keterangan.trim()) {
      toast.error('Keterangan jurnal wajib diisi');
      return;
    }
    if (!hasMinRows) {
      toast.error('Jurnal manual minimal terdiri dari 2 baris detail');
      return;
    }
    if (!hasAllAccounts) {
      toast.error('Setiap baris harus memiliki akun perkiraan');
      return;
    }
    if (!isBalanced) {
      toast.error(`Total debit dan kredit tidak seimbang setelah pembulatan per baris (selisih ${formatRp(Math.abs(selisihCents) / 100)})`);
      return;
    }

    setSubmitting(true);
    try {
      const payload: JurnalManualCreate = {
        tanggal,
        keterangan: keterangan.trim(),
        details: details.map((d) => ({
          akunPerkiraanId: d.akunPerkiraanId,
          debit: parseFloat(d.debit) || 0,
          kredit: parseFloat(d.kredit) || 0,
          keterangan: d.keterangan.trim() || undefined
        }))
      };
      await api.post<JurnalUmumDetailResponse>('/jurnal/manual', payload);
      toast.success('Jurnal manual berhasil dibuat');
      draft.clearDraft();
      refreshListTab('general-ledger', 'jurnal-umum');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      const message = err instanceof ApiError ? err.detail : 'Gagal membuat jurnal manual';
      setSubmitError(message);
      if (err instanceof ApiError && err.status === 400 && /CONTROL ACCOUNT|LEGACY|SYSTEM ACCOUNT|inactive/i.test(message)) {
        const code = message.match(/Akun\s+(\S+)/i)?.[1];
        const account = coaOptions.find((a) => a.kode === code);
        if (account) setAccountErrors((prev) => ({ ...prev, [account.id]: message }));
      }
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const coaDropdownOptions = coaOptions
    .filter((a) => canPostManually(a) && !accountErrors[a.id])
    .map((c) => ({
      id: c.id,
      label: `${c.kode} — ${c.nama}`
    }));

  return (
    <FormTabShell title="Buat Jurnal Manual">
      {submitError && (
        <p role="alert" className="mb-4 rounded border border-destructive p-3 text-sm text-destructive">
          {submitError}
        </p>
      )}
      <div className="space-y-4">
        {/* Header Info */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="jm-tanggal" className="text-xs font-medium text-muted-foreground">
                  Tanggal Jurnal
                </Label>
                <Input id="jm-tanggal" type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} disabled={submitting} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="jm-keterangan" className="text-xs font-medium text-muted-foreground">
                  Keterangan
                </Label>
                <Input id="jm-keterangan" placeholder="Keterangan jurnal (misal: penyesuaian awal periode)" value={keterangan} onChange={(e) => setKeterangan(e.target.value)} disabled={submitting} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Detail Lines */}
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div>
                <p className="text-sm font-semibold">Detail Jurnal</p>
                <p className="text-xs text-muted-foreground">Minimal 2 baris. Total debit harus sama dengan total kredit.</p>
              </div>
              <Button size="sm" variant="outline" className="gap-2" onClick={addRow} disabled={submitting}>
                <Plus className="h-4 w-4" />
                Tambah Baris
              </Button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-[40px]">No</TableHead>
                    <TableHead className="min-w-[240px]">Akun Perkiraan</TableHead>
                    <TableHead className="text-right min-w-[140px]">Debit</TableHead>
                    <TableHead className="text-right min-w-[140px]">Kredit</TableHead>
                    <TableHead className="min-w-[180px]">Keterangan</TableHead>
                    <TableHead className="w-[60px] text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {details.map((row, idx) => {
                    // JRN-002: pratinjau baris memakai nilai hasil pembulatan HALF_UP 2 desimal.
                    const debitCents = toCentsHalfUp(row.debit);
                    const kreditCents = toCentsHalfUp(row.kredit);
                    const valueError = rowValueErrors[idx];
                    return (
                      <TableRow key={idx} className={rowError(row.akunPerkiraanId) || valueError ? 'bg-destructive/10' : undefined}>
                        <TableCell className="text-muted-foreground align-top">{idx + 1}</TableCell>
                        <TableCell className="align-top">
                          <SearchableDropdown value={row.akunPerkiraanId} onValueChange={(v) => updateRow(idx, 'akunPerkiraanId', v)} options={coaDropdownOptions} placeholder="Pilih akun perkiraan" loading={loadingDropdowns} compact disabled={submitting} />
                          {rowError(row.akunPerkiraanId) && (
                            <p role="alert" className="mt-1 text-xs text-destructive">
                              {rowError(row.akunPerkiraanId)}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="align-top text-right">
                          <Input type="number" min="0" step="any" placeholder="0" value={row.debit} onChange={(e) => updateRow(idx, 'debit', e.target.value)} disabled={submitting} className="h-8 text-right" />
                          {debitCents > 0 && (
                            <span className="inline-flex items-center gap-1 mt-1 text-xs text-emerald-600 font-medium">
                              <ArrowUpRight className="h-3 w-3" />
                              {formatRp(debitCents / 100)}
                              {hasSubCentPrecision(row.debit) && <span className="font-normal text-muted-foreground">(dibulatkan)</span>}
                            </span>
                          )}
                          {valueError && (
                            <p role="alert" className="mt-1 text-xs text-destructive">
                              {valueError}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="align-top text-right">
                          <Input type="number" min="0" step="any" placeholder="0" value={row.kredit} onChange={(e) => updateRow(idx, 'kredit', e.target.value)} disabled={submitting} className="h-8 text-right" />
                          {kreditCents > 0 && (
                            <span className="inline-flex items-center gap-1 mt-1 text-xs text-rose-600 font-medium">
                              <ArrowDownRight className="h-3 w-3" />
                              {formatRp(kreditCents / 100)}
                              {hasSubCentPrecision(row.kredit) && <span className="font-normal text-muted-foreground">(dibulatkan)</span>}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="align-top">
                          <Input placeholder="Keterangan (opsional)" value={row.keterangan} onChange={(e) => updateRow(idx, 'keterangan', e.target.value)} disabled={submitting} className="h-8" />
                        </TableCell>
                        <TableCell className="align-top text-center">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removeRow(idx)} disabled={submitting || details.length <= 2} title="Hapus baris" aria-label="Hapus baris">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Totals */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row justify-end gap-4 rounded-lg border p-4 bg-muted/30">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total Debit</p>
                <p className="text-lg font-bold text-emerald-600">{formatRp(totalDebitCents / 100)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total Kredit</p>
                <p className="text-lg font-bold text-rose-600">{formatRp(totalKreditCents / 100)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Selisih</p>
                <p className={`text-lg font-bold ${isBalanced ? 'text-emerald-600' : 'text-destructive'}`}>{formatRp(Math.abs(selisihCents) / 100)}</p>
              </div>
            </div>
            {!isBalanced && <p className="mt-2 text-xs text-destructive text-right">Total debit dan kredit harus seimbang setelah pembulatan 2 desimal per baris (selisih 0).</p>}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="mr-auto">
            <DraftIndicator hasDraft={draft.hasDraft} ageLabel={draft.draftAgeLabel} onDiscard={handleDiscardDraft} formLabel="Jurnal Manual" />
          </div>
          <Button variant="outline" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Simpan Jurnal
          </Button>
        </div>
      </div>
    </FormTabShell>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Jurnal Manual Edit Form (JRN-001 — wire PUT /api/v1/jurnal/manual/{jurnal_id})
//
// Endpoint PUT /jurnal/manual/{id} menerima body yang sama dengan POST /jurnal/manual.
// Backend menolak (HTTP 400 {"detail": "..."}) bila ada baris yang memakai akun
// kontrol dengan allow_manual_posting=False. Frontend harus:
//   1. Menampilkan detail error apa adanya (sudah dipetakan ApiError.detail).
//   2. MEMPERTAHANKAN input pengguna agar bisa memilih akun lain (tidak reset form).
//   3. Menandai baris akun bermasalah secara spesifik.
// ════════════════════════════════════════════════════════════════════════════

function JurnalManualEditForm({ jurnalId }: { jurnalId: string }) {
  const [accountErrors, setAccountErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [tanggal, setTanggal] = useState<string>('');
  const [keterangan, setKeterangan] = useState<string>('');
  const [details, setDetails] = useState<JurnalManualDetailRow[]>([]);
  const [usedAccounts, setUsedAccounts] = useState<Map<string, { id: string; kode: string; nama: string }>>(new Map());
  const [coaOptions, setCoaOptions] = useState<COAResponse[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [noJurnal, setNoJurnal] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);

  // ── Prefill: fetch detail jurnal + COA dropdown ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingData(true);
      setLoadError('');
      try {
        const [detail, coa] = await Promise.all([api.get<JurnalUmumDetailResponse>(`/jurnal/${jurnalId}`), loadCOA({ tingkat: 'DETAIL', activeOnly: true, allowManualPosting: true }).catch(() => [] as COAResponse[])]);
        if (cancelled) return;

        // Guard UX — server tetap otoritatif (404/400) untuk kasus di luar cek ini.
        if (detail.refModule !== 'MANUAL' || detail.reversalOfId) {
          setLoadError('Jurnal ini bukan jurnal manual yang dapat diedit (jurnal sistem atau jurnal pembalik).');
          return;
        }
        if (detail.status === 'POSTED') {
          setLoadError('Jurnal sudah POSTED dan tidak dapat diubah.');
          return;
        }

        setNoJurnal(detail.noJurnal);
        setTanggal(isoToLocalDateInput(String(detail.tanggal)));
        setKeterangan(detail.keterangan || '');
        setDetails(
          detail.details.map((d) => ({
            akunPerkiraanId: d.akunPerkiraanId,
            debit: String(Number(d.debit) || 0),
            kredit: String(Number(d.kredit) || 0),
            keterangan: d.keterangan || ''
          }))
        );
        // Akun yang sudah terpakai tetap ditampilkan walau kebijakan akun berubah
        // setelah draft dibuat (skenario JRN-001 no. 3) — user melihat akun mana yang
        // perlu diganti, bukan baris kosong misterius.
        setUsedAccounts(new Map(detail.details.map((d) => [d.akunPerkiraanId, d.akunPerkiraan])));
        setCoaOptions(coa);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof ApiError ? err.detail : 'Gagal memuat detail jurnal';
        setLoadError(msg);
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jurnalId]);

  // Computed totals & validity — identik dengan form create
  // Computed totals — JRN-002: pratinjau membulatkan TIAP BARIS ke 2 desimal
  // (HALF_UP) lalu menjumlahkan dalam satuan sen, identik dengan
  // validate_entries di backend (bukan menjumlahkan mentah lalu membulatkan total).
  const totalDebitCents = details.reduce((sum, d) => sum + toCentsHalfUp(d.debit), 0);
  const totalKreditCents = details.reduce((sum, d) => sum + toCentsHalfUp(d.kredit), 0);
  const selisihCents = totalDebitCents - totalKreditCents;
  const isBalanced = selisihCents === 0;
  const rowValueErrors = details.map(jurnalRowValueError);
  const hasRowValueErrors = rowValueErrors.some(Boolean);
  const hasMinRows = details.length >= 2;
  const hasAllAccounts = details.every((d) => d.akunPerkiraanId);
  const hasAnyValue = details.some((d) => (parseFloat(d.debit) || 0) > 0 || (parseFloat(d.kredit) || 0) > 0);
  const rowError = (id: string) => {
    if (!id || loadingData) return '';
    if (accountErrors[id]) return accountErrors[id];
    if (usedAccounts.has(id) && !coaOptions.some((a) => a.id === id)) {
      return 'Akun ini tidak lagi tersedia untuk jurnal manual (mis. akun kontrol atau nonaktif). Pilih akun lain yang mengizinkan posting manual.';
    }
    return !coaOptions.some((a) => a.id === id && canPostManually(a)) ? 'Akun tidak tersedia untuk jurnal manual. Pilih akun aktif yang mengizinkan posting manual.' : '';
  };
  const hasInvalidAccounts = details.some((d) => !!rowError(d.akunPerkiraanId));
  const canSubmit = !loadingData && !hasInvalidAccounts && !hasRowValueErrors && !submitting && !!tanggal && !!keterangan.trim() && hasMinRows && hasAllAccounts && hasAnyValue && isBalanced;

  const updateRow = (idx: number, field: keyof JurnalManualDetailRow, value: string) => {
    if (field === 'akunPerkiraanId') setSubmitError('');
    setDetails((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));
  };

  const addRow = () => {
    setDetails((prev) => [...prev, { ...emptyDetailRow }]);
  };

  const removeRow = (idx: number) => {
    if (details.length <= 2) {
      toast.error('Minimal harus ada 2 baris detail jurnal');
      return;
    }
    setDetails((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      toast.error('Periksa akun, nilai, dan keseimbangan jurnal sebelum menyimpan.');
      return;
    }
    if (!tanggal) {
      toast.error('Tanggal jurnal wajib diisi');
      return;
    }
    if (!keterangan.trim()) {
      toast.error('Keterangan jurnal wajib diisi');
      return;
    }
    if (!hasMinRows) {
      toast.error('Jurnal manual minimal terdiri dari 2 baris detail');
      return;
    }
    if (!hasAllAccounts) {
      toast.error('Setiap baris harus memiliki akun perkiraan');
      return;
    }
    if (!isBalanced) {
      toast.error(`Total debit dan kredit tidak seimbang setelah pembulatan per baris (selisih ${formatRp(Math.abs(selisihCents) / 100)})`);
      return;
    }

    setSubmitting(true);
    try {
      const payload: JurnalManualCreate = {
        tanggal,
        keterangan: keterangan.trim(),
        details: details.map((d) => ({
          akunPerkiraanId: d.akunPerkiraanId,
          debit: parseFloat(d.debit) || 0,
          kredit: parseFloat(d.kredit) || 0,
          keterangan: d.keterangan.trim() || undefined
        }))
      };
      await api.put<JurnalUmumDetailResponse>(`/jurnal/manual/${jurnalId}`, payload);
      toast.success('Jurnal manual berhasil diperbarui');
      refreshListTab('general-ledger', 'jurnal-umum');
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      // JRN-001: tampilkan detail error dan PERTAHANKAN input (tidak reset form)
      // agar pengguna dapat memilih akun yang diizinkan.
      const message = err instanceof ApiError ? err.detail : 'Gagal memperbarui jurnal manual';
      setSubmitError(message);
      if (err instanceof ApiError && err.status === 400 && /CONTROL ACCOUNT|LEGACY|SYSTEM ACCOUNT|inactive/i.test(message)) {
        const code = message.match(/Akun\s+(\S+)/i)?.[1];
        const account = [...coaOptions, ...usedAccounts.values()].find((a) => a.kode === code);
        if (account) setAccountErrors((prev) => ({ ...prev, [account.id]: message }));
      }
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  // Dropdown options:
  // 1. Akun terpakai di draft yang tidak lolos filter manual → tetap tampil (disabled)
  //    supaya user tahu akun apa yang harus diganti.
  // 2. Akun yang valid untuk jurnal manual.
  // Catatan JRN-001: penyaringan UI tidak menggantikan validasi server.
  const coaDropdownOptions = [
    ...[...usedAccounts.values()].filter((a) => !coaOptions.some((c) => c.id === a.id)).map((a) => ({ id: a.id, label: `${a.kode} — ${a.nama}`, disabled: true })),
    ...coaOptions
      .filter((a) => canPostManually(a) && !accountErrors[a.id])
      .map((c) => ({
        id: c.id,
        label: `${c.kode} — ${c.nama}`
      }))
  ];

  if (loadingData) {
    return (
      <FormTabShell title="Edit Jurnal Manual">
        <div className="space-y-4 py-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </FormTabShell>
    );
  }

  if (loadError) {
    return (
      <FormTabShell title="Edit Jurnal Manual">
        <div className="py-4 text-center text-sm text-destructive">{loadError}</div>
      </FormTabShell>
    );
  }

  return (
    <FormTabShell title={`Edit Jurnal Manual${noJurnal ? ` — ${noJurnal}` : ''}`}>
      {submitError && (
        <p role="alert" className="mb-4 rounded border border-destructive p-3 text-sm text-destructive">
          {submitError}
        </p>
      )}
      <div className="space-y-4">
        {/* Header Info */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="jme-tanggal" className="text-xs font-medium text-muted-foreground">
                  Tanggal Jurnal
                </Label>
                <Input id="jme-tanggal" type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} disabled={submitting} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="jme-keterangan" className="text-xs font-medium text-muted-foreground">
                  Keterangan
                </Label>
                <Input id="jme-keterangan" placeholder="Keterangan jurnal (misal: penyesuaian awal periode)" value={keterangan} onChange={(e) => setKeterangan(e.target.value)} disabled={submitting} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Detail Lines */}
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div>
                <p className="text-sm font-semibold">Detail Jurnal</p>
                <p className="text-xs text-muted-foreground">Minimal 2 baris. Total debit harus sama dengan total kredit.</p>
              </div>
              <Button size="sm" variant="outline" className="gap-2" onClick={addRow} disabled={submitting}>
                <Plus className="h-4 w-4" />
                Tambah Baris
              </Button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-[40px]">No</TableHead>
                    <TableHead className="min-w-[240px]">Akun Perkiraan</TableHead>
                    <TableHead className="text-right min-w-[140px]">Debit</TableHead>
                    <TableHead className="text-right min-w-[140px]">Kredit</TableHead>
                    <TableHead className="min-w-[180px]">Keterangan</TableHead>
                    <TableHead className="w-[60px] text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {details.map((row, idx) => {
                    // JRN-002: pratinjau baris memakai nilai hasil pembulatan HALF_UP 2 desimal.
                    const debitCents = toCentsHalfUp(row.debit);
                    const kreditCents = toCentsHalfUp(row.kredit);
                    const valueError = rowValueErrors[idx];
                    return (
                      <TableRow key={idx} className={rowError(row.akunPerkiraanId) || valueError ? 'bg-destructive/10' : undefined}>
                        <TableCell className="text-muted-foreground align-top">{idx + 1}</TableCell>
                        <TableCell className="align-top">
                          <SearchableDropdown value={row.akunPerkiraanId} onValueChange={(v) => updateRow(idx, 'akunPerkiraanId', v)} options={coaDropdownOptions} placeholder="Pilih akun perkiraan" loading={loadingData} compact disabled={submitting} />
                          {rowError(row.akunPerkiraanId) && (
                            <p role="alert" className="mt-1 text-xs text-destructive">
                              {rowError(row.akunPerkiraanId)}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="align-top text-right">
                          <Input type="number" min="0" step="any" placeholder="0" value={row.debit} onChange={(e) => updateRow(idx, 'debit', e.target.value)} disabled={submitting} className="h-8 text-right" />
                          {debitCents > 0 && (
                            <span className="inline-flex items-center gap-1 mt-1 text-xs text-emerald-600 font-medium">
                              <ArrowUpRight className="h-3 w-3" />
                              {formatRp(debitCents / 100)}
                              {hasSubCentPrecision(row.debit) && <span className="font-normal text-muted-foreground">(dibulatkan)</span>}
                            </span>
                          )}
                          {valueError && (
                            <p role="alert" className="mt-1 text-xs text-destructive">
                              {valueError}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="align-top text-right">
                          <Input type="number" min="0" step="any" placeholder="0" value={row.kredit} onChange={(e) => updateRow(idx, 'kredit', e.target.value)} disabled={submitting} className="h-8 text-right" />
                          {kreditCents > 0 && (
                            <span className="inline-flex items-center gap-1 mt-1 text-xs text-rose-600 font-medium">
                              <ArrowDownRight className="h-3 w-3" />
                              {formatRp(kreditCents / 100)}
                              {hasSubCentPrecision(row.kredit) && <span className="font-normal text-muted-foreground">(dibulatkan)</span>}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="align-top">
                          <Input placeholder="Keterangan (opsional)" value={row.keterangan} onChange={(e) => updateRow(idx, 'keterangan', e.target.value)} disabled={submitting} className="h-8" />
                        </TableCell>
                        <TableCell className="align-top text-center">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removeRow(idx)} disabled={submitting || details.length <= 2} title="Hapus baris" aria-label="Hapus baris">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Totals */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row justify-end gap-4 rounded-lg border p-4 bg-muted/30">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total Debit</p>
                <p className="text-lg font-bold text-emerald-600">{formatRp(totalDebitCents / 100)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total Kredit</p>
                <p className="text-lg font-bold text-rose-600">{formatRp(totalKreditCents / 100)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Selisih</p>
                <p className={`text-lg font-bold ${isBalanced ? 'text-emerald-600' : 'text-destructive'}`}>{formatRp(Math.abs(selisihCents) / 100)}</p>
              </div>
            </div>
            {!isBalanced && <p className="mt-2 text-xs text-destructive text-right">Total debit dan kredit harus seimbang setelah pembulatan 2 desimal per baris (selisih 0).</p>}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Simpan Perubahan
          </Button>
        </div>
      </div>
    </FormTabShell>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

// ════════════════════════════════════════════════════════════════════════════
// Wrapper: routes formMode to detail tab, delegates list to inner
// ════════════════════════════════════════════════════════════════════════════

export default function GeneralLedgerPage({ subPage: propsSubPage, refreshKey, formMode, formProps }: GeneralLedgerProps) {
  // ── Form mode routing (before any hooks) ──
  if (formMode === 'detail') {
    const jurnalId = formProps?.jurnalId as string;
    if (!jurnalId) return null;
    return <JurnalUmumDetailTab jurnalId={jurnalId} />;
  }

  if (formMode === 'jurnal-manual-create') {
    return <JurnalManualForm />;
  }

  // JRN-001: form edit jurnal manual — PUT /api/v1/jurnal/manual/{jurnal_id}
  if (formMode === 'jurnal-manual-edit') {
    const jurnalId = formProps?.jurnalId as string;
    if (!jurnalId) return null;
    return <JurnalManualEditForm jurnalId={jurnalId} />;
  }

  return <GeneralLedgerList subPage={propsSubPage} refreshKey={refreshKey} />;
}

// ════════════════════════════════════════════════════════════════════════════
// List Component (all hooks live here)
// ════════════════════════════════════════════════════════════════════════════

function GeneralLedgerList({ subPage: propsSubPage, refreshKey }: { subPage?: string; refreshKey?: number }) {
  const activeSubPage = useERPStore((s) => s.activeSubPage);
  const subPage = propsSubPage || activeSubPage || 'jurnal-umum';
  const openFormTab = useTabStore((s) => s.openFormTab);
  const pageTitle = useERPStore((s) => s.pageTitle) || 'Jurnal Umum';
  const pageSubtitle = useERPStore((s) => s.pageSubtitle) || 'Daftar jurnal umum dan transaksi keuangan';

  // Data state
  const [data, setData] = useState<JurnalUmumListResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // RefModule options (fetch dari backend, cache 5 menit di service).
  // include_legacy=true supaya user bisa filter jurnal historis yang masih pakai enum legacy.
  const [refModuleGroups, setRefModuleGroups] = useState<ReturnType<typeof groupRefModules>>([]);
  const [refModuleLookup, setRefModuleLookup] = useState<Map<string, RefModuleOption>>(new Map());
  const [refModulesLoading, setRefModulesLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getRefModules(true);
        if (cancelled) return;
        setRefModuleGroups(groupRefModules(list));
        setRefModuleLookup(new Map(list.map((m) => [m.value, m])));
      } catch {
        // silently skip — badge akan fallback ke value mentah
      } finally {
        if (!cancelled) setRefModulesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Filters
  const [search, setSearch] = useState('');
  const [refModule, setRefModule] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [tanggalMulai, setTanggalMulai] = useState('');
  const [tanggalAkhir, setTanggalAkhir] = useState('');
  const [skip, setSkip] = useState(0);

  // Debounced search
  const searchRef = useRef(search);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      searchRef.current = search;
      setSkip(0);
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [search]);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('skip', String(skip));
      params.set('limit', String(PAGE_SIZE));
      if (searchRef.current) params.set('search', searchRef.current);
      if (refModule && refModule !== 'ALL') params.set('ref_module', refModule);
      if (status && status !== 'ALL') params.set('status', status);
      if (tanggalMulai) params.set('tanggalMulai', tanggalMulai);
      if (tanggalAkhir) params.set('tanggalAkhir', tanggalAkhir);

      const res = await api.get<PaginatedResponse<JurnalUmumListResponse>>(`/jurnal?${params.toString()}`);
      setData(res.data);
      setTotal(res.total);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal memuat data jurnal umum';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [skip, refModule, status, tanggalMulai, tanggalAkhir]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  // Reset to page 0 when filters change
  useEffect(() => {
    setSkip(0);
  }, [refModule, status, tanggalMulai, tanggalAkhir]);

  // Computed summary values
  const totalDebit = data.reduce((s, d) => s + Number(d.totalDebit), 0);
  const totalKredit = data.reduce((s, d) => s + Number(d.totalKredit), 0);

  const wfStates = useWorkflowStates(
    'jurnal_umum',
    data.map((d) => d.id),
    refreshKey
  );

  // Pagination
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(skip / PAGE_SIZE) + 1;
  const hasNext = skip + PAGE_SIZE < total;
  const hasPrev = skip > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="h-6 w-6" />
            {pageTitle}
          </h1>
          <p className="text-muted-foreground mt-1">{pageSubtitle}</p>
        </div>
        <Button
          className="gap-2 shrink-0"
          onClick={() =>
            openFormTab({
              title: 'Buat Jurnal Manual',
              module: 'general-ledger',
              subPage: 'jurnal-umum',
              formKey: 'jurnal-manual-create'
            })
          }>
          <FilePlus className="h-4 w-4" />
          Buat Jurnal Manual
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard icon={BookOpen} label="Total Jurnal" value={loading ? '...' : String(total)} iconBgColor="bg-violet-50" iconColor="text-violet-600" loading={loading} />
        <SummaryCard icon={ArrowUpRight} label="Total Debit (halaman ini)" value={loading ? '...' : formatRp(totalDebit)} iconBgColor="bg-emerald-50" iconColor="text-emerald-600" loading={loading} />
        <SummaryCard icon={ArrowDownRight} label="Total Kredit (halaman ini)" value={loading ? '...' : formatRp(totalKredit)} iconBgColor="bg-rose-50" iconColor="text-rose-600" loading={loading} />
      </div>

      {/* Search & Filters */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Cari no jurnal, keterangan, tipe transaksi..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {/* Filter row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Ref Module</Label>
              <Select value={refModule} onValueChange={setRefModule}>
                <SelectTrigger>
                  <SelectValue placeholder="Semua" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua</SelectItem>
                  {refModuleGroups.map((grp) => (
                    <SelectGroup key={grp.label}>
                      <SelectLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {grp.label}
                        {grp.label === 'Legacy' && <span className="ml-1 normal-case font-normal opacity-70">(historis)</span>}
                      </SelectLabel>
                      {grp.options.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className={opt.isLegacy ? 'opacity-60' : ''}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                  {refModulesLoading && refModuleGroups.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Memuat daftar...</div>}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Semua" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Tanggal Mulai</Label>
              <Input type="date" value={tanggalMulai} onChange={(e) => setTanggalMulai(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Tanggal Akhir</Label>
              <Input type="date" value={tanggalAkhir} onChange={(e) => setTanggalAkhir(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {error && !loading ? (
            <div className="p-4">
              <ErrorCard message={error} onRetry={fetchData} />
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>No Jurnal</TableHead>
                    <TableHead className="hidden lg:table-cell">Keterangan</TableHead>
                    <TableHead className="text-right">Total Debit</TableHead>
                    <TableHead className="text-right">Total Kredit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Workflow</TableHead>
                    <TableHead className="hidden md:table-cell">Ref Module</TableHead>
                    <TableHead className="hidden xl:table-cell">Dibuat Oleh</TableHead>
                    <TableHead className="w-[80px]">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <SkeletonRows cols={10} />
                  ) : data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        Tidak ada data jurnal umum.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="whitespace-nowrap">{formatDate(d.tanggal)}</TableCell>
                        <TableCell className="font-mono text-xs font-semibold whitespace-nowrap">{d.noJurnal}</TableCell>
                        <TableCell className="hidden lg:table-cell max-w-[200px] truncate">{d.keterangan || '—'}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                            <ArrowUpRight className="h-3 w-3" />
                            {formatRp(d.totalDebit)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-rose-600 font-medium">
                            <ArrowDownRight className="h-3 w-3" />
                            {formatRp(d.totalKredit)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={d.status} />
                        </TableCell>
                        <TableCell className="text-center">
                          {(() => {
                            const w = wfStates.states[d.id];
                            if (!w) return <span className="text-xs text-muted-foreground">—</span>;
                            return (
                              <div className="flex flex-col items-center gap-1">
                                <WorkflowStateBadge state={w.state} />
                                <WorkflowActionsCell documentType={w.documentType} documentId={w.documentId} version={w.version} availableActions={w.availableActions} onDone={wfStates.refresh} />
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <RefModuleBadge module={d.refModule} lookup={refModuleLookup} />
                        </TableCell>
                        <TableCell className="hidden xl:table-cell whitespace-nowrap">{d.creator.namaLengkap}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {/* JRN-001: tombol edit untuk jurnal manual yang workflow-nya
                                masih bisa dikoreksi (canEdit = DRAFT/REJECTED dari server). */}
                            {(() => {
                              const w = wfStates.states[d.id];
                              return w?.canEdit && d.refModule === 'MANUAL' && !d.reversalOfId ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    openFormTab({
                                      title: `Edit ${d.noJurnal}`,
                                      module: 'general-ledger',
                                      subPage: 'jurnal-umum',
                                      formKey: 'jurnal-manual-edit',
                                      formProps: { jurnalId: d.id }
                                    })
                                  }
                                  className="h-8 w-8 p-0"
                                  title="Edit Jurnal Manual"
                                  aria-label={`Edit jurnal manual ${d.noJurnal}`}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              ) : null;
                            })()}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                openFormTab({
                                  title: `Detail ${d.noJurnal}`,
                                  module: 'general-ledger',
                                  subPage: 'jurnal-umum',
                                  formKey: 'detail',
                                  formProps: { jurnalId: d.id }
                                })
                              }
                              className="h-8 w-8 p-0"
                              title="Lihat Detail">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {!error && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Halaman {currentPage} dari {totalPages} (total {total} data)
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={!hasPrev} onClick={() => setSkip((p) => Math.max(0, p - PAGE_SIZE))}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Sebelumnya
                </Button>
                <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => setSkip((p) => p + PAGE_SIZE)}>
                  Berikutnya
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
