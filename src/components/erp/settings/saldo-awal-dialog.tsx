'use client';

// ═════════════════════════════════════════════════════════════════════════════
// SALDO AWAL PIUTANG/HUTANG PER MITRA — Update #028.
//
// Dialog "Set Saldo Awal" untuk modul Pelanggan (piutang) & Supplier (hutang):
// mencatat sisa piutang/hutang sebelum sistem dipakai SEKALI per mitra.
// Sistem membuat jurnal POSTED (RefModule.SALDO_AWAL):
//   Piutang : D [Piutang - {Nama}] / K [akun penyeimbang ekuitas]
//   Hutang  : D [akun penyeimbang] / K [Hutang - {Nama}]
// Penyeimbang disarankan "Laba (Rugi) Ditahan" (mirror sheet SaldoAwal
// template Master MAS). Pembatalan = jurnal pembalik → set ulang diperbolehkan.
//
// Komponen ini SELF-CONTAINED (fetch info + COA ekuitas sendiri) supaya
// pemasangan di pelanggan-page.tsx / supplier-page.tsx cukup 3 baris —
// lihat BACA-DULU update #028.
// ═════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, BookOpen, ShieldCheck, XCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import type { COADropdownResponse, SaldoAwalInfoResponse, SaldoAwalSetResponse } from '@/types/api';

export interface SaldoAwalMitra {
  id: string;
  kode: string;
  nama: string;
}

interface SaldoAwalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 'piutang' = Pelanggan (AR) · 'hutang' = Supplier (AP) */
  jenis: 'piutang' | 'hutang';
  mitra: SaldoAwalMitra | null;
  /** Callback setelah set/batal sukses (mis. refresh daftar) */
  onSuccess?: () => void;
}

const fmtIDR = (v?: number | null) => (v == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v));

const fmtTanggal = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

export function SaldoAwalDialog({ open, onOpenChange, jenis, mitra, onSuccess }: SaldoAwalDialogProps) {
  const labelJenis = jenis === 'piutang' ? 'Piutang' : 'Hutang';
  const basePath = jenis === 'piutang' ? 'pelanggan' : 'supplier';

  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<SaldoAwalInfoResponse | null>(null);
  const [ekuitasOptions, setEkuitasOptions] = useState<COADropdownResponse[]>([]);
  const [nominal, setNominal] = useState('');
  const [tanggal, setTanggal] = useState(() => new Date().toISOString().slice(0, 10));
  const [akunPenyeimbangId, setAkunPenyeimbangId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [konfirmasiBatal, setKonfirmasiBatal] = useState(false);
  const [error, setError] = useState('');

  const muatInfo = useCallback(
    async (id: string) => {
      const res = await api.get<SaldoAwalInfoResponse>(`/master/${basePath}/${id}/saldo-awal`);
      setInfo(res);
    },
    [basePath]
  );

  useEffect(() => {
    if (!open || !mitra) return;
    let dibatalkan = false;
    setLoading(true);
    setError('');
    setKonfirmasiBatal(false);
    setNominal('');
    setTanggal(new Date().toISOString().slice(0, 10));
    setAkunPenyeimbangId('');
    setInfo(null);

    // COA ekuitas (MODAL) untuk pilihan akun penyeimbang — pola yang sama
    // dengan form master lain (kas-bank-akun / quick-add pelanggan).
    api
      .get<COADropdownResponse[]>('/master/coa-dropdown')
      .then((res) => {
        if (dibatalkan) return;
        const semua = Array.isArray(res) ? res : [];
        const ekuitas = semua.filter((c) => c.header === 'MODAL' && c.tingkat === 'DETAIL' && c.status === 'AKTIF');
        setEkuitasOptions(ekuitas);
        // Pre-select: akun ber-nama "laba ... ditahan" bila ada, kalau tidak
        // akun ekuitas pertama (user tetap wajib memilih bila belum terisi).
        const laba = ekuitas.find((c) => c.nama.toLowerCase().includes('laba'));
        if (laba) setAkunPenyeimbangId(laba.id);
        else if (ekuitas.length > 0) setAkunPenyeimbangId(ekuitas[0].id);
      })
      .catch(() => {
        if (!dibatalkan) setEkuitasOptions([]);
      });

    muatInfo(mitra.id)
      .catch(() => {
        if (!dibatalkan) setInfo({ exists: false });
      })
      .finally(() => {
        if (!dibatalkan) setLoading(false);
      });

    return () => {
      dibatalkan = true;
    };
  }, [open, mitra, muatInfo]);

  if (!mitra) return null;

  const simpan = async () => {
    setError('');
    const nilai = Number(nominal) || 0;
    if (nilai <= 0) {
      setError('Nominal saldo awal harus lebih besar dari nol.');
      return;
    }
    if (!tanggal) {
      setError('Tanggal saldo awal wajib diisi.');
      return;
    }
    if (!akunPenyeimbangId) {
      setError('Akun penyeimbang wajib dipilih (kelompok EKUITAS — disarankan Laba (Rugi) Ditahan).');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<SaldoAwalSetResponse>(`/master/${basePath}/${mitra.id}/saldo-awal`, {
        nominal: nilai,
        tanggal,
        akunPenyeimbangId
      });
      toast.success(`Saldo awal ${labelJenis.toLowerCase()} ${mitra.nama} tercatat — jurnal ${res.noJurnal}`);
      await muatInfo(mitra.id);
      onSuccess?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : `Gagal menyimpan saldo awal ${labelJenis.toLowerCase()}`);
    } finally {
      setSubmitting(false);
    }
  };

  const batalkan = async () => {
    setError('');
    setCancelling(true);
    try {
      await api.post(`/master/${basePath}/${mitra.id}/saldo-awal/batal`);
      toast.success(`Saldo awal ${labelJenis.toLowerCase()} ${mitra.nama} dibatalkan (jurnal pembalik dibuat)`);
      setKonfirmasiBatal(false);
      await muatInfo(mitra.id);
      onSuccess?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Gagal membatalkan saldo awal');
    } finally {
      setCancelling(false);
    }
  };

  const subAkunLabel = info?.subAkun ? `${info.subAkun.kode} — ${info.subAkun.nama}` : `Sub-akun ${labelJenis.toLowerCase()} (dibuat otomatis bila belum ada)`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            Saldo Awal {labelJenis} — {mitra.nama}
          </DialogTitle>
          <DialogDescription>
            Mencatat sisa {labelJenis.toLowerCase()} sebelum sistem dipakai (sekali per mitra). Sistem membuat jurnal:{' '}
            {jenis === 'piutang' ? (
              <>
                D <span className="font-medium">Piutang - {mitra.nama}</span> / K <span className="font-medium">akun penyeimbang ekuitas</span>.
              </>
            ) : (
              <>
                D <span className="font-medium">akun penyeimbang ekuitas</span> / K <span className="font-medium">Hutang - {mitra.nama}</span>.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memuat saldo awal…
          </div>
        ) : (
          <div className="space-y-4">
            {/* Ringkasan saldo berjalan */}
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Sub-akun {labelJenis.toLowerCase()}</span>
                <span className="font-medium">{subAkunLabel}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Saldo {labelJenis.toLowerCase()} berjalan (GL)</span>
                <span className="font-semibold tabular-nums">{fmtIDR(info?.saldoBerjalan ?? 0)}</span>
              </div>
            </div>

            {info?.exists ? (
              /* ── Saldo awal sudah ada ── */
              <div className="space-y-3">
                <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div className="w-full space-y-1">
                    <p className="font-medium text-emerald-800 dark:text-emerald-300">Saldo awal {labelJenis.toLowerCase()} sudah tercatat</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
                      <span className="text-muted-foreground">Nominal</span>
                      <span className="text-right font-semibold">{fmtIDR(info.nominal)}</span>
                      <span className="text-muted-foreground">Tanggal</span>
                      <span className="text-right">{fmtTanggal(info.tanggal)}</span>
                      <span className="text-muted-foreground">No. Jurnal</span>
                      <span className="text-right">{info.noJurnal ?? '—'}</span>
                      <span className="text-muted-foreground">Penyeimbang</span>
                      <span className="text-right">{info.akunPenyeimbang ? `${info.akunPenyeimbang.kode} — ${info.akunPenyeimbang.nama}` : '—'}</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Mengganti nilai? Batalkan dulu — sistem membuat jurnal pembalik (jejak audit tetap utuh), lalu set ulang.</p>
                {konfirmasiBatal ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                    <span className="text-sm font-medium text-destructive">Yakin batalkan saldo awal {labelJenis.toLowerCase()} ini?</span>
                    <div className="flex shrink-0 gap-2">
                      <Button variant="outline" size="sm" onClick={() => setKonfirmasiBatal(false)} disabled={cancelling}>
                        Tidak
                      </Button>
                      <Button variant="destructive" size="sm" onClick={batalkan} disabled={cancelling}>
                        {cancelling ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <XCircle className="mr-1 h-3.5 w-3.5" />}
                        Ya, batalkan
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setKonfirmasiBatal(true)} disabled={cancelling}>
                    <XCircle className="mr-1 h-3.5 w-3.5" /> Batalkan Saldo Awal
                  </Button>
                )}
              </div>
            ) : (
              /* ── Form set saldo awal ── */
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sa-nominal">
                    Nominal Saldo Awal <span className="text-destructive">*</span>
                  </Label>
                  <CurrencyInput id="sa-nominal" allowDecimal placeholder="0" value={nominal} onValueChange={(v) => setNominal(v)} disabled={submitting} />
                  <p className="text-[11px] text-muted-foreground">Sisa {labelJenis.toLowerCase()} mitra ini per tanggal di bawah (bukan tambahan bulanan).</p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="sa-tanggal">
                      Tanggal Jurnal <span className="text-destructive">*</span>
                    </Label>
                    <Input id="sa-tanggal" type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} disabled={submitting} />
                    <p className="text-[11px] text-muted-foreground">Umumnya awal periode (mis. 01-01).</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>
                      Akun Penyeimbang <span className="text-destructive">*</span>
                    </Label>
                    <SearchableDropdown value={akunPenyeimbangId} onValueChange={setAkunPenyeimbangId} options={ekuitasOptions.map((c) => ({ id: c.id, label: `${c.kode} — ${c.nama}` }))} placeholder={ekuitasOptions.length === 0 ? 'Tidak ada akun EKUITAS aktif…' : 'Pilih akun ekuitas…'} disabled={submitting} />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Hanya akun kelompok EKUITAS yang bisa dipilih — disarankan <span className="font-medium">Laba (Rugi) Ditahan</span> (penyeimbang saldo awal piutang/hutang, tidak mempengaruhi laba rugi periode).
                </p>
              </div>
            )}

            {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting || cancelling}>
            Tutup
          </Button>
          {!loading && !info?.exists && (
            <Button onClick={simpan} disabled={submitting}>
              {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Simpan Saldo Awal
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
