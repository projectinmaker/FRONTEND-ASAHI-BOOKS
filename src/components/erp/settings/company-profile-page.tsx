'use client';

/**
 * Halaman Pengaturan → Profil Perusahaan (update ASAHI — cetak/PDF).
 *
 * Mengelola identitas perusahaan yang dipakai di header SEMUA dokumen
 * cetak/PDF: logo, nama perusahaan (menggantikan nama sistem "ASAHI Books"
 * yang dulu hardcoded), alamat, telepon, dan email.
 *
 * - Logo diunggah sebagai gambar (PNG/JPG/WebP, maks ±1.5 MB) → disimpan
 *   sebagai data URL di backend → langsung dirender <img> di template cetak.
 * - Setelah simpan, store company-profile di-refresh sehingga cetakan
 *   berikutnya langsung memakai identitas baru.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Building2, Loader2, Save, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useCompanyStore } from '@/store/company-store';
import type { CompanyProfileResponse } from '@/types/api';

// Batas ukuran file logo (sesuai validasi backend MAX_LOGO_DATA_URL ±1.5 MB).
const MAX_LOGO_BYTES = 1_500_000;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

interface FormState {
  namaPerusahaan: string;
  alamat: string;
  telepon: string;
  email: string;
  logo: string | null; // data URL
}

interface CompanyProfilePageProps {
  refreshKey?: number;
}

export default function CompanyProfilePage({ refreshKey }: CompanyProfilePageProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({ namaPerusahaan: '', alamat: '', telepon: '', email: '', logo: null });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refreshStore = useCompanyStore((s) => s.fetch);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<CompanyProfileResponse>('/master/company-profile');
      setForm({
        namaPerusahaan: res.namaPerusahaan || '',
        alamat: res.alamat || '',
        telepon: res.telepon || '',
        email: res.email || '',
        logo: res.logo || null
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal memuat profil perusahaan');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile, refreshKey]);

  const updateForm = (key: keyof FormState, value: string | null) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // ── Upload logo: file → data URL (divalidasi ukuran & tipe) ──
  const handleLogoChange = (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Format logo harus PNG, JPG, atau WebP');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error('Ukuran logo terlalu besar (maksimal ±1.5 MB). Kompres/kecilkan gambar dulu.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => updateForm('logo', String(reader.result));
    reader.onerror = () => toast.error('Gagal membaca file logo');
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!form.namaPerusahaan.trim()) {
      toast.error('Nama perusahaan wajib diisi');
      return;
    }
    if (!form.alamat.trim()) {
      toast.error('Alamat wajib diisi');
      return;
    }

    setSaving(true);
    try {
      await api.put<CompanyProfileResponse>('/master/company-profile', {
        namaPerusahaan: form.namaPerusahaan.trim(),
        alamat: form.alamat.trim(),
        telepon: form.telepon.trim() || null,
        email: form.email.trim() || null,
        logo: form.logo
      });
      // Refresh store supaya header cetak/PDF langsung memakai identitas baru.
      await refreshStore(true);
      toast.success('Profil perusahaan tersimpan — header cetak/PDF sudah diperbarui');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal menyimpan profil perusahaan');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4" aria-label="Memuat profil perusahaan">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-80 w-full max-w-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Profil Perusahaan</h2>
        <p className="text-muted-foreground">Identitas yang tampil di header semua dokumen cetak/PDF — Sales Order, Purchase Order, Invoice, Surat Jalan, Retur, Penawaran, Tukar Faktur, dan bukti Kas &amp; Bank.</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Identitas Perusahaan</CardTitle>
          <CardDescription>Nama perusahaan menggantikan nama sistem pada kop dokumen; logo tampil di sampingnya bila diunggah.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* ── Logo ── */}
          <div className="space-y-2">
            <Label>Logo</Label>
            <div className="flex items-start gap-4">
              <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                {form.logo ? (
                  <img src={form.logo} alt="Pratinjau logo perusahaan" className="size-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <Building2 className="size-8" />
                    <span className="text-[10px]">Belum ada logo</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    handleLogoChange(e.target.files?.[0]);
                    e.target.value = ''; // reset agar file yang sama bisa dipilih ulang
                  }}
                />
                <Button type="button" variant="outline" className="w-fit gap-2" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="size-4" /> Unggah Logo
                </Button>
                {form.logo && (
                  <Button type="button" variant="ghost" className="w-fit gap-2 text-destructive hover:text-destructive" onClick={() => updateForm('logo', null)}>
                    <Trash2 className="size-4" /> Hapus Logo
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">PNG / JPG / WebP, maksimal ±1.5 MB. Disarankan gambar persegi.</p>
              </div>
            </div>
          </div>

          {/* ── Nama perusahaan ── */}
          <div className="space-y-2">
            <Label htmlFor="nama-perusahaan">
              Nama Perusahaan <span className="text-destructive">*</span>
            </Label>
            <Input id="nama-perusahaan" value={form.namaPerusahaan} onChange={(e) => updateForm('namaPerusahaan', e.target.value)} placeholder="Contoh: PT Nama Perusahaan Anda" maxLength={200} />
            <p className="text-xs text-muted-foreground">Tampil di kop dokumen cetak/PDF menggantikan &ldquo;ASAHI Books&rdquo;.</p>
          </div>

          {/* ── Alamat ── */}
          <div className="space-y-2">
            <Label htmlFor="alamat">
              Alamat <span className="text-destructive">*</span>
            </Label>
            <Textarea id="alamat" value={form.alamat} onChange={(e) => updateForm('alamat', e.target.value)} placeholder="Alamat lengkap perusahaan" rows={2} />
          </div>

          {/* ── Telepon & email ── */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="telepon">Telepon</Label>
              <Input id="telepon" value={form.telepon} onChange={(e) => updateForm('telepon', e.target.value)} placeholder="Opsional — contoh: 021-89901234" maxLength={50} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => updateForm('email', e.target.value)} placeholder="Opsional" maxLength={100} />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Simpan Profil
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
