'use client';

// === Update ASAHI #019 — Pengaturan → Pajak ===
//
// Form kolom pajak company_profile: noSeriFakturPajak, npwp,
// noPengukuhanPkp, branchCode, jenisUsaha, kluSpt.
// Load GET /master/company-profile; Simpan → PUT partial (hanya field
// halaman ini — backend exclude_unset, tidak menimpa field halaman lain);
// toast + refresh useCompanyStore.fetch(true).

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Percent, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useCompanyStore } from '@/store/company-store';
import type { CompanyProfileResponse, CompanyProfileUpdate } from '@/types/api';

interface PajakPageProps {
  refreshKey?: number;
}

interface FormState {
  noSeriFakturPajak: string;
  npwp: string;
  noPengukuhanPkp: string;
  branchCode: string;
  jenisUsaha: string;
  kluSpt: string;
}

const EMPTY: FormState = { noSeriFakturPajak: '', npwp: '', noPengukuhanPkp: '', branchCode: '', jenisUsaha: '', kluSpt: '' };

export default function PajakPage({ refreshKey }: PajakPageProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [initial, setInitial] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const refreshStore = useCompanyStore((s) => s.fetch);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<CompanyProfileResponse>('/master/company-profile');
      const next: FormState = {
        noSeriFakturPajak: res.noSeriFakturPajak || '',
        npwp: res.npwp || '',
        noPengukuhanPkp: res.noPengukuhanPkp || '',
        branchCode: res.branchCode || '',
        jenisUsaha: res.jenisUsaha || '',
        kluSpt: res.kluSpt || ''
      };
      setForm(next);
      setInitial(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Gagal memuat data pajak');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const dirty = (Object.keys(form) as (keyof FormState)[]).some((k) => form[k] !== initial[k]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Payload PARTIAL — hanya field halaman ini (backend exclude_unset).
      // String kosong dikirim sebagai null (kolom nullable).
      await api.put<CompanyProfileResponse>('/master/company-profile', {
        noSeriFakturPajak: form.noSeriFakturPajak.trim() || null,
        npwp: form.npwp.trim() || null,
        noPengukuhanPkp: form.noPengukuhanPkp.trim() || null,
        branchCode: form.branchCode.trim() || null,
        jenisUsaha: form.jenisUsaha.trim() || null,
        kluSpt: form.kluSpt.trim() || null
      } satisfies Partial<CompanyProfileUpdate>);
      setInitial(form);
      // Refresh store supaya modul lain yang membaca profil memakai nilai baru.
      void refreshStore(true);
      toast.success('Data pajak tersimpan');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal menyimpan data pajak');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4" aria-label="Memuat data pajak">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-80 w-full max-w-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Percent className="h-5 w-5" />
          Pajak
        </h2>
        <p className="text-sm text-muted-foreground">Identitas perpajakan perusahaan untuk keperluan Faktur Pajak &amp; e-Faktur (DJP). Tarif dan opsi pajak transaksi ada di Preferensi → Perpajakan.</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Identitas Perpajakan</CardTitle>
          <CardDescription>Data ini melengkapi header Faktur Pajak (npwp, pengukuhan PKP) dan profil DJP (jenis usaha / KLU SPT).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}{' '}
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => void load()}>
                Coba lagi
              </Button>
            </p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="no-seri-faktur-pajak">No. Seri Faktur Pajak</Label>
                  <Input id="no-seri-faktur-pajak" value={form.noSeriFakturPajak} onChange={(e) => setForm((p) => ({ ...p, noSeriFakturPajak: e.target.value }))} placeholder="mis. 010.000-26.00000001" maxLength={50} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="npwp">NPWP</Label>
                  <Input id="npwp" value={form.npwp} onChange={(e) => setForm((p) => ({ ...p, npwp: e.target.value }))} placeholder="mis. 01.234.567.8-090.000" maxLength={50} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="no-pengukuhan-pkp">No. Pengukuhan PKP</Label>
                  <Input id="no-pengukuhan-pkp" value={form.noPengukuhanPkp} onChange={(e) => setForm((p) => ({ ...p, noPengukuhanPkp: e.target.value }))} placeholder="mis. 000012345678901" maxLength={50} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="branch-code">Kode Cabang (Branch)</Label>
                  <Input id="branch-code" value={form.branchCode} onChange={(e) => setForm((p) => ({ ...p, branchCode: e.target.value }))} placeholder="mis. 000 (kantor pusat)" maxLength={10} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="jenis-usaha">Jenis Usaha</Label>
                <Input id="jenis-usaha" value={form.jenisUsaha} onChange={(e) => setForm((p) => ({ ...p, jenisUsaha: e.target.value }))} placeholder="Manufaktur dan Perdagangan Umum" maxLength={200} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="klu-spt">KLU SPT</Label>
                <Input id="klu-spt" value={form.kluSpt} onChange={(e) => setForm((p) => ({ ...p, kluSpt: e.target.value }))} placeholder="Kode Kegiatan Usaha Utama untuk SPT (mis. 28999)" maxLength={200} />
                <p className="text-xs text-muted-foreground">Klasifikasi usaha utama menurut KLU DJP — dipakai saat pelaporan SPT.</p>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                {dirty && (
                  <Button variant="outline" onClick={() => setForm(initial)} disabled={saving}>
                    Batal
                  </Button>
                )}
                <Button onClick={handleSave} disabled={!dirty || saving} className="gap-2">
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Simpan Pajak
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
