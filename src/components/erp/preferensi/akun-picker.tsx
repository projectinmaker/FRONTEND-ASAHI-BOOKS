'use client';

// === Update ASAHI #019 — AkunPicker ===
//
// Komponen pemilih akun untuk key SettingAkun (dipakai halaman Preferensi →
// Perusahaan / Akun Default / Penjualan & Pembelian). Pola mengikuti
// settings/setting-akun-page.tsx: SearchableDropdown dengan opsi COA dari
// loadCOA({activeOnly:true}); nilai saat ini ditampilkan (kode + nama).
//
// - GET /master/setting-akun → cari baris dengan key; key yang belum ada di
//   backend tetap bisa dikonfigurasi (PUT auto-create → placeholder kosong).
// - Simpan → PUT /master/setting-akun/{key} {akunPerkiraanId}.
// - Cache bersama antar-picker dalam satu halaman (satu GET setting-akun +
// satu GET COA untuk N picker); cache di-reset saat refreshKey berubah.

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { AlertCircle, CheckCircle2, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { loadCOA } from '@/lib/coa';
import type { COAResponse, SettingAkunResponse } from '@/types/api';

interface AkunPickerProps {
  /** Key SettingAkun (mis. 'LABA_DITAHAN', 'BIAYA_PESANAN'). */
  settingKey: string;
  label: string;
  help?: string;
  refreshKey?: number;
}

// ── Cache bersama (keyed oleh refreshKey) ────────────────────────────────────
// Halaman Akun Default memasang ±15 picker — tanpa cache ini akan memicu
// 30 request identik. Ganti refreshKey (refresh tab) → fetch ulang.
let shared: { key: string; settings: Promise<SettingAkunResponse[]>; coa: Promise<COAResponse[]> } | null = null;

function loadShared(refreshKey?: number): { key: string; settings: Promise<SettingAkunResponse[]>; coa: Promise<COAResponse[]> } {
  const key = String(refreshKey ?? '');
  if (!shared || shared.key !== key) {
    shared = {
      key,
      settings: api.get<SettingAkunResponse[]>('/master/setting-akun'),
      coa: loadCOA({ activeOnly: true })
    };
  }
  return shared;
}

/** Reset cache bersama (dipanggil setelah simpan agar sesi berikut fresh). */
function invalidateShared(): void {
  shared = null;
}

interface CurrentAkun {
  akunPerkiraanId: string;
  kode?: string | null;
  nama?: string | null;
}

export default function AkunPicker({ settingKey, label, help, refreshKey }: AkunPickerProps) {
  const [current, setCurrent] = useState<CurrentAkun | null>(null);
  const [coaOptions, setCoaOptions] = useState<COAResponse[]>([]);
  const [selection, setSelection] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const s = loadShared(refreshKey);
    try {
      const [settingsRes, coaRes] = await Promise.all([s.settings, s.coa]);
      const rows = Array.isArray(settingsRes) ? settingsRes : [];
      // Baris untuk key ini (global). Key belum ada → placeholder kosong:
      // backend PUT auto-create key saat disimpan.
      const row = rows.find((r) => r.key === settingKey);
      if (row && row.akunPerkiraanId) {
        setCurrent({ akunPerkiraanId: row.akunPerkiraanId, kode: row.akunPerkiraan?.kode, nama: row.akunPerkiraan?.nama });
        setSelection(row.akunPerkiraanId);
      } else {
        setCurrent(null);
        setSelection('');
      }
      setCoaOptions(Array.isArray(coaRes) ? coaRes : []);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Gagal memuat setting akun');
    } finally {
      setLoading(false);
    }
  }, [settingKey, refreshKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = !!selection && selection !== (current?.akunPerkiraanId ?? '');

  const handleSave = async () => {
    if (!selection) {
      toast.error(`Pilih akun untuk "${label}" terlebih dahulu`);
      return;
    }
    setSaving(true);
    try {
      const updated = await api.put<SettingAkunResponse>(`/master/setting-akun/${settingKey}`, { akunPerkiraanId: selection });
      setCurrent({ akunPerkiraanId: updated.akunPerkiraanId, kode: updated.akunPerkiraan?.kode, nama: updated.akunPerkiraan?.nama });
      toast.success(`Akun "${label}" diperbarui${updated.akunPerkiraan ? `: ${updated.akunPerkiraan.kode} — ${updated.akunPerkiraan.nama}` : ''}`);
      // Simpan bisa membuat key baru (auto-create) → reset cache bersama agar
      // picker lain yang dibuka nanti melihat baris terbaru.
      invalidateShared();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal menyimpan setting akun');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => setSelection(current?.akunPerkiraanId ?? '');

  const selectedOption = coaOptions.find((c) => c.id === selection);

  if (loading) {
    return (
      <div className="space-y-2" aria-label={`Memuat akun ${label}`}>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label>{label}</Label>
        {/* Nilai saat ini (kode + nama) / status belum diatur */}
        {current ? (
          <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1 font-normal max-w-[55%]">
            <CheckCircle2 className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {current.kode ? `${current.kode} — ${current.nama ?? ''}` : 'Tersimpan'}
            </span>
          </Badge>
        ) : (
          <Badge variant="outline" className="font-normal">
            Belum diatur
          </Badge>
        )}
      </div>

      {error ? (
        <div className="flex items-center gap-1.5 text-xs text-destructive" role="alert">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>
            {error}{' '}
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => void load()}>
              Coba lagi
            </Button>
          </span>
        </div>
      ) : (
        <>
          <SearchableDropdown
            value={selection}
            onValueChange={setSelection}
            disabled={saving}
            options={coaOptions.map((c) => ({
              id: c.id,
              label: `${c.kode} — ${c.nama}`,
              subtitle: c.header
            }))}
            placeholder="Pilih akun perkiraan..."
            emptyText="Tidak ada akun ditemukan"
          />
          {/* Akun tersimpan tidak tersedia dalam daftar akun aktif → sarankan ganti. */}
          {selection && !selectedOption && current && selection === current.akunPerkiraanId && (
            <p role="alert" className="text-xs text-amber-700">
              Akun tersimpan {current.kode} — {current.nama} tidak tersedia dalam pilihan akun aktif. Pilih akun pengganti.
            </p>
          )}
          {help && <p className="text-xs text-muted-foreground">{help}</p>}
          <div className="flex gap-2">
            {dirty && (
              <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                Simpan
              </Button>
            )}
            {dirty && (
              <Button size="sm" variant="outline" onClick={handleReset} disabled={saving}>
                Batal
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
