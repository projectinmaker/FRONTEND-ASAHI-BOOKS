'use client';

// === Update ASAHI #019 — Pengaturan → Periode Akuntansi ===
//
// Form kolom company_profile: tanggalMulai (mulai akuntansi), tahunFiskal,
// periodeDefault (periode filter default di laporan/transaksi).
// Load GET /master/company-profile; Simpan → PUT partial (hanya field
// halaman ini — backend exclude_unset, tidak menimpa field halaman lain);
// toast + refresh useCompanyStore.fetch(true).

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarRange, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useCompanyStore } from '@/store/company-store';
import type { CompanyProfileResponse, CompanyProfileUpdate } from '@/types/api';

interface PeriodeAkuntansiPageProps {
  refreshKey?: number;
}

interface FormState {
  tanggalMulai: string; // ISO date (YYYY-MM-DD) atau ''
  tahunFiskal: string;
  periodeDefault: string; // '' bila belum diisi
}

// Opsi periode default (sesuai registry backend halaman laporan/transaksi).
const PERIODE_OPTIONS: { value: string; label: string }[] = [
  { value: 'BULAN_INI', label: 'Bulan Ini' },
  { value: 'BULAN_LALU', label: 'Bulan Lalu' },
  { value: 'TAHUN_INI', label: 'Tahun Ini' },
  { value: 'TAHUN_LALU', label: 'Tahun Lalu' },
  { value: 'SEMUA', label: 'Semua Periode' }
];

const EMPTY: FormState = { tanggalMulai: '', tahunFiskal: '', periodeDefault: '' };

export default function PeriodeAkuntansiPage({ refreshKey }: PeriodeAkuntansiPageProps) {
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
        tanggalMulai: res.tanggalMulai || '',
        tahunFiskal: res.tahunFiskal || '',
        periodeDefault: res.periodeDefault || ''
      };
      setForm(next);
      setInitial(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Gagal memuat periode akuntansi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const dirty = form.tanggalMulai !== initial.tanggalMulai || form.tahunFiskal !== initial.tahunFiskal || form.periodeDefault !== initial.periodeDefault;

  const handleSave = async () => {
    setSaving(true);
    try {
      // Payload PARTIAL — hanya field halaman ini (backend exclude_unset).
      await api.put<CompanyProfileResponse>('/master/company-profile', {
        tanggalMulai: form.tanggalMulai || null,
        tahunFiskal: form.tahunFiskal.trim() || null,
        periodeDefault: form.periodeDefault || null
      } satisfies Partial<CompanyProfileUpdate>);
      setInitial(form);
      // Refresh store supaya modul lain yang membaca profil memakai nilai baru.
      void refreshStore(true);
      toast.success('Periode akuntansi tersimpan');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal menyimpan periode akuntansi');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4" aria-label="Memuat periode akuntansi">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 w-full max-w-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <CalendarRange className="h-5 w-5" />
          Periode Akuntansi
        </h2>
        <p className="text-sm text-muted-foreground">Tanggal mulai akuntansi, tahun fiskal, dan periode default untuk filter laporan &amp; transaksi.</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Periode</CardTitle>
          <CardDescription>Periode default dipakai sebagai nilai awal filter periode (mis. di Laporan dan daftar transaksi).</CardDescription>
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
                  <Label htmlFor="tanggal-mulai">Tanggal Mulai Akuntansi</Label>
                  <Input id="tanggal-mulai" type="date" value={form.tanggalMulai} onChange={(e) => setForm((p) => ({ ...p, tanggalMulai: e.target.value }))} />
                  <p className="text-xs text-muted-foreground">Tanggal pembukuan pertama perusahaan (mis. 01/01/2016).</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tahun-fiskal">Tahun Fiskal</Label>
                  <Input id="tahun-fiskal" value={form.tahunFiskal} onChange={(e) => setForm((p) => ({ ...p, tahunFiskal: e.target.value }))} placeholder="mis. 2026" maxLength={20} />
                  <p className="text-xs text-muted-foreground">Bulan/tahun fiskal bila berbeda dari tahun kalender (mis. &ldquo;2026&rdquo; atau &ldquo;Apr 2025–Mar 2026&rdquo;).</p>
                </div>
              </div>

              <div className="space-y-2 max-w-xs">
                <Label htmlFor="periode-default">Periode Default</Label>
                <Select value={form.periodeDefault} onValueChange={(v) => setForm((p) => ({ ...p, periodeDefault: v }))} disabled={saving}>
                  <SelectTrigger id="periode-default">
                    <SelectValue placeholder="Pilih periode default" />
                  </SelectTrigger>
                  <SelectContent>
                    {PERIODE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Periode terpilih menjadi filter awal laporan saat aplikasi dibuka.</p>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                {dirty && (
                  <Button variant="outline" onClick={() => setForm(initial)} disabled={saving}>
                    Batal
                  </Button>
                )}
                <Button onClick={handleSave} disabled={!dirty || saving} className="gap-2">
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Simpan Periode
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
