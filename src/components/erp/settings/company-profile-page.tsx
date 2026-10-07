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
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Building2, Coins, Loader2, MapPin, Pencil, Plus, Save, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useCompanyStore } from '@/store/company-store';
import type { CompanyProfileResponse, MataUangResponse, AlamatPengirimanResponse } from '@/types/api';

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

interface MataUangFormState {
  id?: string;
  kode: string;
  nama: string;
  isAktif: boolean;
}

interface AlamatFormState {
  id?: string;
  prefix: string;
  nama: string;
  isAktif: boolean;
}

interface PendingDelete {
  kind: 'mata-uang' | 'alamat';
  id: string;
  label: string;
}

export default function CompanyProfilePage({ refreshKey }: CompanyProfilePageProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({ namaPerusahaan: '', alamat: '', telepon: '', email: '', logo: null });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refreshStore = useCompanyStore((s) => s.fetch);

  // ── Update ASAHI #3: mata uang & alamat pengiriman ──
  const [mataUang, setMataUang] = useState<MataUangResponse[]>([]);
  const [mataUangLoading, setMataUangLoading] = useState(true);
  const [mataUangDialog, setMataUangDialog] = useState<MataUangFormState | null>(null);
  const [mataUangSaving, setMataUangSaving] = useState(false);
  const [alamatKirim, setAlamatKirim] = useState<AlamatPengirimanResponse[]>([]);
  const [alamatLoading, setAlamatLoading] = useState(true);
  const [alamatDialog, setAlamatDialog] = useState<AlamatFormState | null>(null);
  const [alamatSaving, setAlamatSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  // ── Update ASAHI #3: muat daftar mata uang & alamat pengiriman ──
  const loadMataUang = useCallback(async () => {
    setMataUangLoading(true);
    try {
      setMataUang(await api.get<MataUangResponse[]>('/master/mata-uang'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal memuat daftar mata uang');
    } finally {
      setMataUangLoading(false);
    }
  }, []);

  const loadAlamatKirim = useCallback(async () => {
    setAlamatLoading(true);
    try {
      setAlamatKirim(await api.get<AlamatPengirimanResponse[]>('/master/alamat-pengiriman'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal memuat daftar alamat pengiriman');
    } finally {
      setAlamatLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMataUang();
    void loadAlamatKirim();
  }, [loadMataUang, loadAlamatKirim, refreshKey]);

  const saveMataUang = async () => {
    if (!mataUangDialog) return;
    const kode = mataUangDialog.kode.trim().toUpperCase();
    const nama = mataUangDialog.nama.trim();
    if (!kode || !nama) {
      toast.error('Kode dan nama mata uang wajib diisi');
      return;
    }
    setMataUangSaving(true);
    try {
      if (mataUangDialog.id) {
        await api.put<MataUangResponse>(`/master/mata-uang/${mataUangDialog.id}`, { kode, nama, isAktif: mataUangDialog.isAktif });
        toast.success(`Mata uang ${kode} diperbarui`);
      } else {
        await api.post<MataUangResponse>('/master/mata-uang', { kode, nama, isAktif: mataUangDialog.isAktif });
        toast.success(`Mata uang ${kode} ditambahkan`);
      }
      setMataUangDialog(null);
      await loadMataUang();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal menyimpan mata uang');
    } finally {
      setMataUangSaving(false);
    }
  };

  const saveAlamatKirim = async () => {
    if (!alamatDialog) return;
    const prefix = alamatDialog.prefix.trim();
    const nama = alamatDialog.nama.trim();
    if (!prefix || !nama) {
      toast.error('Prefix dan nama gudang wajib diisi');
      return;
    }
    setAlamatSaving(true);
    try {
      if (alamatDialog.id) {
        await api.put<AlamatPengirimanResponse>(`/master/alamat-pengiriman/${alamatDialog.id}`, { prefix, nama, isAktif: alamatDialog.isAktif });
        toast.success('Alamat pengiriman diperbarui');
      } else {
        await api.post<AlamatPengirimanResponse>('/master/alamat-pengiriman', { prefix, nama, isAktif: alamatDialog.isAktif });
        toast.success('Alamat pengiriman ditambahkan');
      }
      setAlamatDialog(null);
      await loadAlamatKirim();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal menyimpan alamat pengiriman');
    } finally {
      setAlamatSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const endpoint = pendingDelete.kind === 'mata-uang' ? '/master/mata-uang' : '/master/alamat-pengiriman';
      await api.delete(`${endpoint}/${pendingDelete.id}`);
      toast.success(`${pendingDelete.label} dihapus`);
      setPendingDelete(null);
      if (pendingDelete.kind === 'mata-uang') await loadMataUang();
      else await loadAlamatKirim();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal menghapus');
    } finally {
      setDeleting(false);
    }
  };

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
            <Textarea id="alamat" value={form.alamat} onChange={(e) => updateForm('alamat', e.target.value)} placeholder="Alamat lengkap perusahaan" rows={3} />
            <p className="text-xs text-muted-foreground">Bisa multi-baris — tekan Enter untuk memecah baris (contoh: enter setelah &ldquo;Jatireja&rdquo;) agar kop dokumen tidak kepanjangan.</p>
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

      {/* ══ Update ASAHI #3 — Mata Uang (dropdown Currency SO/PO) ══ */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="size-5" /> Mata Uang
          </CardTitle>
          <CardDescription>
            Daftar mata uang untuk pilihan <em>Currency</em> saat input Pesanan Penjualan / Pesanan Pembelian. Mata uang yang dipilih ikut tampil pada cetak Purchase Order. Nonaktifkan (jangan hapus) bila tidak ingin dipakai lagi tetapi masih tercatat di dokumen lama.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mataUangLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Kode</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-24 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mataUang.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Belum ada mata uang.
                      </TableCell>
                    </TableRow>
                  ) : (
                    mataUang.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono font-medium">{row.kode}</TableCell>
                        <TableCell>{row.nama}</TableCell>
                        <TableCell>
                          <Badge variant={row.isAktif ? 'secondary' : 'outline'}>{row.isAktif ? 'Aktif' : 'Nonaktif'}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" aria-label={`Edit mata uang ${row.kode}`} onClick={() => setMataUangDialog({ id: row.id, kode: row.kode, nama: row.nama, isAktif: row.isAktif })}>
                              <Pencil className="size-4" />
                            </Button>
                            <Button variant="ghost" size="icon" aria-label={`Hapus mata uang ${row.kode}`} disabled={row.kode === 'IDR'} onClick={() => setPendingDelete({ kind: 'mata-uang', id: row.id, label: `Mata uang ${row.kode}` })}>
                              <Trash2 className="size-4 text-destructive" />
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
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setMataUangDialog({ kode: '', nama: '', isAktif: true })}>
            <Plus className="size-4" /> Tambah Mata Uang
          </Button>
        </CardContent>
      </Card>

      {/* ══ Update ASAHI #3 — Alamat Pengiriman (gudang tujuan PO) ══ */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="size-5" /> Alamat Pengiriman
          </CardTitle>
          <CardDescription>
            Daftar gudang tujuan untuk Purchase Order — saat input PO wajib memilih satu (checkbox). Saat dicetak, alamat tampil di bawah tabel barang sebagai <em>prefix</em> + nama gudang, dengan opsi tambahan PPIC. Mengubah daftar ini tidak mengubah PO yang sudah tersimpan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {alamatLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prefix</TableHead>
                    <TableHead>Nama Gudang</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-24 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alamatKirim.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Belum ada alamat pengiriman.
                      </TableCell>
                    </TableRow>
                  ) : (
                    alamatKirim.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.prefix}</TableCell>
                        <TableCell className="font-medium">{row.nama}</TableCell>
                        <TableCell>
                          <Badge variant={row.isAktif ? 'secondary' : 'outline'}>{row.isAktif ? 'Aktif' : 'Nonaktif'}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" aria-label={`Edit alamat ${row.nama}`} onClick={() => setAlamatDialog({ id: row.id, prefix: row.prefix, nama: row.nama, isAktif: row.isAktif })}>
                              <Pencil className="size-4" />
                            </Button>
                            <Button variant="ghost" size="icon" aria-label={`Hapus alamat ${row.nama}`} onClick={() => setPendingDelete({ kind: 'alamat', id: row.id, label: `Alamat ${row.nama}` })}>
                              <Trash2 className="size-4 text-destructive" />
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
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() =>
              setAlamatDialog({
                prefix: form.namaPerusahaan.trim() || 'PT ASAHI SUKSES INDUSTRI',
                nama: '',
                isAktif: true
              })
            }>
            <Plus className="size-4" /> Tambah Alamat Pengiriman
          </Button>
        </CardContent>
      </Card>

      {/* ══ Dialog: tambah/edit mata uang ══ */}
      <Dialog open={!!mataUangDialog} onOpenChange={(open) => !open && setMataUangDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{mataUangDialog?.id ? 'Edit Mata Uang' : 'Tambah Mata Uang'}</DialogTitle>
            <DialogDescription>Kode mengikuti standar ISO 4217 (contoh: EUR, CNY, SGD). IDR tidak dapat dihapus atau dinonaktifkan.</DialogDescription>
          </DialogHeader>
          {mataUangDialog && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mata-uang-kode">Kode *</Label>
                  <Input id="mata-uang-kode" value={mataUangDialog.kode} maxLength={8} onChange={(e) => setMataUangDialog({ ...mataUangDialog, kode: e.target.value.toUpperCase() })} placeholder="EUR" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mata-uang-nama">Nama *</Label>
                  <Input id="mata-uang-nama" value={mataUangDialog.nama} maxLength={100} onChange={(e) => setMataUangDialog({ ...mataUangDialog, nama: e.target.value })} placeholder="Euro" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="mata-uang-aktif" checked={mataUangDialog.isAktif} onCheckedChange={(checked) => setMataUangDialog({ ...mataUangDialog, isAktif: checked === true })} />
                <Label htmlFor="mata-uang-aktif" className="cursor-pointer font-normal">
                  Aktif (tampil di dropdown Currency form pesanan)
                </Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMataUangDialog(null)}>
              Batal
            </Button>
            <Button onClick={saveMataUang} disabled={mataUangSaving} className="gap-2">
              {mataUangSaving && <Loader2 className="size-4 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ Dialog: tambah/edit alamat pengiriman ══ */}
      <Dialog open={!!alamatDialog} onOpenChange={(open) => !open && setAlamatDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{alamatDialog?.id ? 'Edit Alamat Pengiriman' : 'Tambah Alamat Pengiriman'}</DialogTitle>
            <DialogDescription>Prefix tampil di baris pertama alamat (biasanya nama perusahaan), nama gudang di baris kedua.</DialogDescription>
          </DialogHeader>
          {alamatDialog && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="alamat-prefix">Prefix *</Label>
                <Input id="alamat-prefix" value={alamatDialog.prefix} maxLength={200} onChange={(e) => setAlamatDialog({ ...alamatDialog, prefix: e.target.value })} placeholder="PT ASAHI SUKSES INDUSTRI" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="alamat-nama">Nama Gudang *</Label>
                <Input id="alamat-nama" value={alamatDialog.nama} maxLength={200} onChange={(e) => setAlamatDialog({ ...alamatDialog, nama: e.target.value })} placeholder="P I - GUDANG ATAS TOOL" />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="alamat-aktif" checked={alamatDialog.isAktif} onCheckedChange={(checked) => setAlamatDialog({ ...alamatDialog, isAktif: checked === true })} />
                <Label htmlFor="alamat-aktif" className="cursor-pointer font-normal">
                  Aktif (tampil di form Purchase Order)
                </Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlamatDialog(null)}>
              Batal
            </Button>
            <Button onClick={saveAlamatKirim} disabled={alamatSaving} className="gap-2">
              {alamatSaving && <Loader2 className="size-4 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ Konfirmasi hapus (mata uang / alamat pengiriman) ══ */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {pendingDelete?.kind === 'mata-uang' ? 'Mata Uang' : 'Alamat Pengiriman'}?</AlertDialogTitle>
            <AlertDialogDescription>{pendingDelete?.kind === 'mata-uang' ? `${pendingDelete.label} akan dihapus dari daftar. Bila masih dipakai dokumen pesanan, penghapusan ditolak sistem — nonaktifkan saja.` : `${pendingDelete?.label} akan dihapus dari daftar. PO yang sudah tersimpan tetap aman (cetakan memakai salinan alamat).`}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={deleting}
              className="gap-2">
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
