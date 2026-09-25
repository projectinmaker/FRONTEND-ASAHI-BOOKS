'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableDropdown, type SearchableDropdownOption } from '@/components/ui/searchable-dropdown';
import { EmptyState } from '@/components/ui/empty-state';
import { Plus, Trash2, Loader2, RefreshCw, AlertCircle, Wallet, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { organisasiApi } from '@/lib/organisasi-api';
import type { OrgUnit, KlasifikasiArusKasMapping, KlasifikasiArusKasCreate, KlasifikasiTargetType, KategoriArusKas, COADropdownResponse } from '@/types/api';

// ─── Constants ────────────────────────────────────────────────────────────

const TARGET_TYPE_LABELS: Record<KlasifikasiTargetType, string> = {
  ACCOUNT: 'Akun COA',
  JOURNAL: 'Jurnal'
};

const CATEGORY_LABELS: Record<KategoriArusKas, string> = {
  OPERASIONAL: 'Operasional',
  INVESTASI: 'Investasi',
  PEMBIAYAAN: 'Pembiayaan',
  BELUM_DIKLASIFIKASIKAN: 'Belum Diklasifikasi'
};

const CATEGORY_BADGE_CLS: Record<KategoriArusKas, string> = {
  OPERASIONAL: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  INVESTASI: 'bg-violet-100 text-violet-700 border-violet-200',
  PEMBIAYAAN: 'bg-amber-100 text-amber-700 border-amber-200',
  BELUM_DIKLASIFIKASIKAN: 'bg-gray-100 text-gray-600 border-gray-200'
};

function categoryBadge(category: KategoriArusKas) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${CATEGORY_BADGE_CLS[category]}`}>{CATEGORY_LABELS[category]}</span>;
}

function targetTypeBadge(t: KlasifikasiTargetType) {
  const cls = t === 'ACCOUNT' ? 'bg-cyan-100 text-cyan-700 border-cyan-200' : 'bg-teal-100 text-teal-700 border-teal-200';
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{TARGET_TYPE_LABELS[t]}</span>;
}

const TARGET_TYPE_OPTIONS: { value: KlasifikasiTargetType; label: string }[] = [
  { value: 'ACCOUNT', label: 'Akun COA' },
  { value: 'JOURNAL', label: 'Jurnal' }
];

const CATEGORY_OPTIONS: { value: KategoriArusKas; label: string }[] = [
  { value: 'OPERASIONAL', label: 'Operasional' },
  { value: 'INVESTASI', label: 'Investasi' },
  { value: 'PEMBIAYAAN', label: 'Pembiayaan' },
  { value: 'BELUM_DIKLASIFIKASIKAN', label: 'Belum Diklasifikasi' }
];

// ─── Props ─────────────────────────────────────────────────────────────────

interface KlasifikasiArusKasPageProps {
  refreshKey?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Create Dialog
// ═══════════════════════════════════════════════════════════════════════════

function CreateMappingDialog({ open, onOpenChange, existing, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; existing: KlasifikasiArusKasMapping[]; onCreated: () => void }) {
  const [targetType, setTargetType] = useState<KlasifikasiTargetType>('ACCOUNT');
  const [targetId, setTargetId] = useState<string>('');
  const [journalIdInput, setJournalIdInput] = useState<string>('');
  const [category, setCategory] = useState<KategoriArusKas>('OPERASIONAL');
  const [submitting, setSubmitting] = useState(false);

  // COA dropdown options (loaded when targetType = ACCOUNT)
  const [coaOptions, setCoaOptions] = useState<COADropdownResponse[]>([]);
  const [coaLoading, setCoaLoading] = useState(false);
  const [coaError, setCoaError] = useState<string | null>(null);

  // Reset form on dialog open
  useEffect(() => {
    if (open) {
      setTargetType('ACCOUNT');
      setTargetId('');
      setJournalIdInput('');
      setCategory('OPERASIONAL');
    }
  }, [open]);

  // Load COA dropdown whenever dialog opens
  const fetchCoa = useCallback(async () => {
    setCoaLoading(true);
    setCoaError(null);
    try {
      const res = await api.get<COADropdownResponse[]>('/master/coa-dropdown');
      setCoaOptions(res);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal memuat daftar akun COA';
      setCoaError(msg);
    } finally {
      setCoaLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && targetType === 'ACCOUNT') {
      fetchCoa();
    }
  }, [open, targetType, fetchCoa]);

  // Build COA options filtered by not-already-mapped
  const mappedAccountIds = new Set(existing.filter((m) => m.targetType === 'ACCOUNT').map((m) => m.targetId));
  const accountOptions: SearchableDropdownOption[] = coaOptions
    .filter((c) => c.status === 'AKTIF' && !mappedAccountIds.has(c.id))
    .map((c) => ({
      id: c.id,
      label: `${c.kode} — ${c.nama}`,
      subtitle: c.header
    }));

  // Reset target selection whenever targetType changes
  useEffect(() => {
    setTargetId('');
    setJournalIdInput('');
  }, [targetType]);

  const canSubmit = (): boolean => {
    if (targetType === 'ACCOUNT') return !!targetId;
    return !!journalIdInput.trim();
  };

  const handleSubmit = async () => {
    if (!canSubmit()) {
      toast.error(targetType === 'ACCOUNT' ? 'Akun COA wajib dipilih' : 'Journal ID wajib diisi');
      return;
    }

    const finalTargetId = targetType === 'ACCOUNT' ? targetId : journalIdInput.trim();
    const payload: KlasifikasiArusKasCreate = {
      targetType,
      targetId: finalTargetId,
      category
    };

    setSubmitting(true);
    try {
      await organisasiApi.setKlasifikasi(payload);
      toast.success('Klasifikasi arus kas berhasil disimpan');
      onOpenChange(false);
      onCreated();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal menyimpan klasifikasi';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Tambah Klasifikasi Arus Kas
          </DialogTitle>
          <DialogDescription>Petakan akun COA atau jurnal ke kategori arus kas (operasional, investasi, pembiayaan).</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="target-type">Tipe Target</Label>
            <Select value={targetType} onValueChange={(v) => setTargetType(v as KlasifikasiTargetType)}>
              <SelectTrigger id="target-type">
                <SelectValue placeholder="Pilih tipe target" />
              </SelectTrigger>
              <SelectContent>
                {TARGET_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="target-id">{targetType === 'ACCOUNT' ? 'Akun COA' : 'Journal ID'}</Label>
            {targetType === 'ACCOUNT' ? (
              <>
                <SearchableDropdown value={targetId} onValueChange={setTargetId} options={accountOptions} placeholder="Pilih akun COA..." searchPlaceholder="Cari kode atau nama akun..." emptyText={coaError ? 'Gagal memuat akun.' : 'Tidak ada akun tersedia.'} loading={coaLoading} error={coaError ?? undefined} />
                {coaError && (
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={fetchCoa}>
                    <RefreshCw className="h-3 w-3" /> Muat ulang
                  </Button>
                )}
              </>
            ) : (
              <Input id="target-id" placeholder="Contoh: JRN-2024-001" value={journalIdInput} onChange={(e) => setJournalIdInput(e.target.value)} autoFocus />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="category">Kategori Arus Kas</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as KategoriArusKas)}>
              <SelectTrigger id="category">
                <SelectValue placeholder="Pilih kategori" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {CATEGORY_OPTIONS.map((opt) => (
                <Badge key={opt.value} variant="outline" className={category === opt.value ? CATEGORY_BADGE_CLS[opt.value] : 'opacity-60'}>
                  {opt.label}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !canSubmit()} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Simpan Klasifikasi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Delete Confirmation
// ═══════════════════════════════════════════════════════════════════════════

function DeleteMappingDialog({ open, onOpenChange, mapping, onConfirm, loading }: { open: boolean; onOpenChange: (open: boolean) => void; mapping: KlasifikasiArusKasMapping | null; onConfirm: () => void; loading: boolean }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus Klasifikasi</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>
              Apakah Anda yakin ingin menghapus klasifikasi ini?
              <p className="mt-2 text-xs">
                Tipe: <span className="font-medium">{mapping ? TARGET_TYPE_LABELS[mapping.targetType] : ''}</span>
                {' · '}Target: <span className="font-mono">{mapping?.targetId}</span>
                {' · '}Kategori: {mapping && <span className="font-medium">{CATEGORY_LABELS[mapping.category]}</span>}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">Transaksi terkait akan kembali menjadi BELUM DIKLASIFIKASI pada laporan arus kas.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Batal</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={loading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Hapus
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Page — List of Mappings
// ═══════════════════════════════════════════════════════════════════════════

export default function KlasifikasiArusKasPage({ refreshKey }: KlasifikasiArusKasPageProps) {
  const [data, setData] = useState<KlasifikasiArusKasMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<KlasifikasiArusKasMapping | null>(null);
  const [deleting, setDeleting] = useState(false);

  // COA lookup for displaying target label (when targetType = ACCOUNT)
  const [coaMap, setCoaMap] = useState<Map<string, COADropdownResponse>>(new Map());
  const [coaLoaded, setCoaLoaded] = useState(false);
  const coaFetchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await organisasiApi.getKlasifikasi(0, 500);
      setData(res);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal memuat data klasifikasi arus kas';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  // Lazy-load COA dropdown for label display (delayed slightly to avoid race)
  const fetchCoaForLabels = useCallback(async () => {
    if (coaLoaded) return;
    try {
      const res = await api.get<COADropdownResponse[]>('/master/coa-dropdown');
      const map = new Map<string, COADropdownResponse>();
      res.forEach((c) => map.set(c.id, c));
      setCoaMap(map);
      setCoaLoaded(true);
    } catch {
      // Silent fail — labels will fall back to raw ID
    }
  }, [coaLoaded]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  // Debounced COA fetch after data loaded (only if there are ACCOUNT mappings)
  useEffect(() => {
    if (!loading && data.some((m) => m.targetType === 'ACCOUNT')) {
      coaFetchTimer.current = setTimeout(() => {
        fetchCoaForLabels();
      }, 200);
      return () => {
        if (coaFetchTimer.current) clearTimeout(coaFetchTimer.current);
      };
    }
  }, [loading, data, fetchCoaForLabels]);

  const targetLabel = (m: KlasifikasiArusKasMapping): string => {
    if (m.targetType === 'ACCOUNT') {
      const coa = coaMap.get(m.targetId);
      return coa ? `${coa.kode} — ${coa.nama}` : m.targetId;
    }
    return m.targetId;
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      // Re-classify to BELUM_DIKLASIFIKASIKAN effectively removes the mapping.
      // Backend uses PUT /klasifikasi-arus-kas with category BELUM_DIKLASIFIKASIKAN
      // to unset (per organisasiApi.setKlasifikasi). We follow that contract.
      await organisasiApi.setKlasifikasi({
        targetType: deleteTarget.targetType,
        targetId: deleteTarget.targetId,
        category: 'BELUM_DIKLASIFIKASIKAN'
      });
      toast.success('Klasifikasi berhasil dihapus');
      setDeleteTarget(null);
      fetchData();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Gagal menghapus klasifikasi';
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  const SkeletonRows = () => (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell>
            <Skeleton className="h-5 w-24 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-44" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-24 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-8 w-12 rounded ml-auto" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );

  const counts = {
    total: data.length,
    account: data.filter((m) => m.targetType === 'ACCOUNT').length,
    journal: data.filter((m) => m.targetType === 'JOURNAL').length
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Klasifikasi Arus Kas
          </h2>
          <p className="text-sm text-muted-foreground">{loading ? 'Memuat data...' : `${counts.total} mapping · ${counts.account} akun · ${counts.journal} jurnal`}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={fetchData} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Tambah Mapping
          </Button>
        </div>
      </div>

      {/* Info banner */}
      <Card className="border-violet-200 bg-violet-50/40">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Tujuan:</span> Klasifikasi ini menentukan kategori arus kas (operasional / investasi / pembiayaan) untuk akun COA atau jurnal tertentu. Transaksi yang akunnya belum dipetakan akan otomatis masuk kategori <span className="font-medium">Belum Diklasifikasi</span>.
          </p>
        </CardContent>
      </Card>

      {/* Error */}
      {error && !loading && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <p className="text-sm text-destructive flex-1">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchData}>
              Coba Lagi
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto" style={{ maxHeight: '500px', overflowY: 'auto' }}>
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="whitespace-nowrap">Tipe Target</TableHead>
                  <TableHead className="whitespace-nowrap">Target</TableHead>
                  <TableHead className="whitespace-nowrap">Kategori</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <SkeletonRows />
                ) : data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="p-0">
                      <EmptyState icon={Wallet} title="Belum ada mapping klasifikasi." description="Tambahkan mapping untuk akun COA atau jurnal agar laporan arus kas terklasifikasi dengan benar." />
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((row) => (
                    <TableRow key={`${row.targetType}-${row.targetId}`}>
                      <TableCell className="whitespace-nowrap">{targetTypeBadge(row.targetType)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {row.targetType === 'ACCOUNT' ? (
                          <div className="flex flex-col">
                            <span className="font-medium">{targetLabel(row)}</span>
                            <span className="text-xs text-muted-foreground font-mono">{row.targetId}</span>
                          </div>
                        ) : (
                          <span className="font-mono text-sm">{row.targetId}</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{categoryBadge(row.category)}</TableCell>
                      <TableCell className="whitespace-nowrap text-center">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(row)} aria-label="Hapus mapping">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CreateMappingDialog open={createOpen} onOpenChange={setCreateOpen} existing={data} onCreated={fetchData} />
      <DeleteMappingDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
        mapping={deleteTarget}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
