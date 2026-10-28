'use client';

// === Update ASAHI #019 — PreferensiGroupForm ===
//
// Renderer GENERIK satu grup preferensi: GET /master/preferensi → filter grup
// berdasarkan groupId → render item sesuai type-nya (boolean → Checkbox,
// select → Select dengan options, number → Input number dengan min/max,
// text → Input). Melacak perubahan (dirty); tombol Simpan (disabled bila tak
// ada perubahan) → PUT /master/preferensi {updates} → toast sukses → refresh
// usePreferensiStore.fetch(true) supaya font/format tanggal langsung terasa
// di seluruh aplikasi. Skeleton saat loading; error ApiError + tombol coba lagi.
//
// Catatan khusus:
// - Item number dikirim sebagai ANGKA; opsi select bernilai angka (mis.
//   RANGKAP_FAKTUR_PPN) tetap dikirim sebagai string (sesuai kontrak backend).

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { usePreferensiStore } from '@/store/preferensi-store';
import type { PreferensiGroup, PreferensiItem, PreferensiResponse, PreferensiUpdatePayload } from '@/types/api';

type PrefValue = string | number | boolean;

interface PreferensiGroupFormProps {
  /** Id grup di registry backend (mis. 'perusahaan', 'fitur', 'penomoran'). */
  groupId: string;
  /** Judul Card (default: label grup dari backend). */
  title?: string;
  /** Deskripsi Card (default: description grup dari backend). */
  description?: string;
  refreshKey?: number;
  /** Callback setelah snapshot termuat (halaman bisa membaca nilai item). */
  onLoaded?: (group: PreferensiGroup) => void;
  /** Callback setelah simpan sukses — menerima key yang ikut dikirim. */
  onSaved?: (updates: Record<string, PrefValue>) => void;
  /** Callback saat nilai lokal berubah (preview langsung, mis. halaman Font). */
  onValueChange?: (key: string, value: PrefValue) => void;
  /** Slot tambahan di dalam Card (mis. AkunPicker yang digabung grup). */
  children?: ReactNode;
}

export default function PreferensiGroupForm({ groupId, title, description, refreshKey, onLoaded, onSaved, onValueChange, children }: PreferensiGroupFormProps) {
  const [group, setGroup] = useState<PreferensiGroup | null>(null);
  const [values, setValues] = useState<Record<string, PrefValue>>({});
  const [initial, setInitial] = useState<Record<string, PrefValue>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStore = usePreferensiStore((s) => s.fetch);

  const applySnapshot = useCallback(
    (res: PreferensiResponse) => {
      const g = (res.groups ?? []).find((x) => x.id === groupId) ?? null;
      setGroup(g);
      const vals: Record<string, PrefValue> = {};
      for (const item of g?.items ?? []) vals[item.key] = item.value;
      setValues(vals);
      setInitial(vals);
      onLoaded?.(g ?? { id: groupId, label: groupId, items: [] });
    },
    [groupId, onLoaded]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<PreferensiResponse>('/master/preferensi');
      applySnapshot(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Gagal memuat preferensi');
    } finally {
      setLoading(false);
    }
  }, [applySnapshot]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const setValue = (key: string, value: PrefValue) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    onValueChange?.(key, value);
  };

  // Kunci yang nilainya berbeda dari snapshot server.
  const items = group?.items ?? [];
  const dirtyKeys = items
    .filter((item) => {
      const cur = values[item.key];
      const init = initial[item.key];
      if (item.type === 'number') {
        // Number: bandingkan secara numerik (draft string "" berarti belum berubah).
        if (cur === '' || cur === null || cur === undefined) return false;
        return Number(cur) !== Number(init);
      }
      return cur !== init;
    })
    .map((item) => item.key);
  const dirty = dirtyKeys.length > 0;

  const handleSave = async () => {
    const updates: Record<string, PrefValue> = {};
    for (const key of dirtyKeys) {
      const item = items.find((i) => i.key === key);
      if (!item) continue;
      const v = values[key];
      if (item.type === 'number') {
        if (v === '' || v === null || v === undefined) continue;
        const n = Number(v);
        if (isNaN(n)) {
          toast.error(`Nilai "${item.label}" harus berupa angka`);
          return;
        }
        if (item.min !== undefined && n < item.min) {
          toast.error(`Nilai "${item.label}" minimal ${item.min}`);
          return;
        }
        if (item.max !== undefined && n > item.max) {
          toast.error(`Nilai "${item.label}" maksimal ${item.max}`);
          return;
        }
        updates[key] = n;
      } else {
        // boolean / select / text — select bernilai angka tetap dikirim string.
        updates[key] = v;
      }
    }
    if (Object.keys(updates).length === 0) return;

    setSaving(true);
    try {
      const res = await api.put<PreferensiResponse>('/master/preferensi', { updates } satisfies PreferensiUpdatePayload);
      applySnapshot(res);
      // Refresh store app-wide (font <body>, format tanggal pdf-utils) —
      // preferensi baru langsung terasa tanpa reload.
      void refreshStore(true);
      onSaved?.(updates);
      toast.success('Preferensi tersimpan');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal menyimpan preferensi');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setValues(initial);
    for (const item of items) onValueChange?.(item.key, initial[item.key]);
  };

  if (loading) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4" aria-label="Memuat preferensi">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="max-w-2xl border-destructive">
        <CardHeader>
          <CardTitle>{title ?? 'Preferensi'}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-destructive font-medium">{error}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => void load()}>
                Coba Lagi
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!group) {
    return (
      <Card className="max-w-2xl">
        <CardContent className="py-6 text-sm text-muted-foreground">Grup preferensi &ldquo;{groupId}&rdquo; tidak ditemukan.</CardContent>
      </Card>
    );
  }

  const booleanItems = items.filter((i) => i.type === 'boolean');
  const fieldItems = items.filter((i) => i.type !== 'boolean');

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{title ?? group.label}</CardTitle>
        {(description ?? group.description) && <CardDescription>{description ?? group.description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-5">
        {/* ── Item boolean: kartu checkbox (grid 2 kolom di layar lebar) ── */}
        {booleanItems.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {booleanItems.map((item) => (
              <BooleanItem key={item.key} item={item} checked={values[item.key] === true} onChange={(v) => setValue(item.key, v)} />
            ))}
          </div>
        )}

        {/* ── Item select / number / text ── */}
        <div className="grid gap-4 sm:grid-cols-2">
          {fieldItems.map((item) => (
            <FieldItem key={item.key} item={item} value={values[item.key]} onChange={(v) => setValue(item.key, v)} />
          ))}
        </div>

        {/* ── Slot tambahan dari halaman (digabung dalam Card yang sama) ── */}
        {children}

        <div className="flex justify-end gap-2 pt-1">
          {dirty && (
            <Button variant="outline" onClick={handleReset} disabled={saving}>
              Batal
            </Button>
          )}
          <Button onClick={handleSave} disabled={!dirty || saving} className="gap-2">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Simpan Preferensi
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Item boolean ─────────────────────────────────────────────────────────────

function BooleanItem({ item, checked, onChange }: { item: PreferensiItem; checked: boolean; onChange: (v: boolean) => void }) {
  const id = `pref-${item.key}`;
  return (
    <div className="flex flex-row items-start gap-3 rounded-md border p-3.5 min-h-11">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
      <div className="grid gap-0.5">
        <Label htmlFor={id} className="font-normal text-sm cursor-pointer">
          {item.label}
        </Label>
        {item.help && <p className="text-xs text-muted-foreground">{item.help}</p>}
      </div>
    </div>
  );
}

// ── Item select / number / text ──────────────────────────────────────────────

function FieldItem({ item, value, onChange }: { item: PreferensiItem; value: PrefValue | undefined; onChange: (v: PrefValue) => void }) {
  const id = `pref-${item.key}`;

  if (item.type === 'select') {
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{item.label}</Label>
        <Select value={value === undefined || value === null ? '' : String(value)} onValueChange={(v) => onChange(v)}>
          <SelectTrigger id={id}>
            <SelectValue placeholder="Pilih nilai" />
          </SelectTrigger>
          <SelectContent>
            {(item.options ?? []).map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {item.help && <p className="text-xs text-muted-foreground">{item.help}</p>}
      </div>
    );
  }

  if (item.type === 'number') {
    const raw = value === undefined || value === null ? '' : String(value);
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{item.label}</Label>
        <Input id={id} type="number" inputMode="numeric" min={item.min} max={item.max} value={raw} onChange={(e) => onChange(e.target.value)} />
        {(item.help ?? (item.min !== undefined && item.max !== undefined ? `Rentang ${item.min}–${item.max}` : null)) && (
          <p className="text-xs text-muted-foreground">{item.help ?? `Rentang ${item.min}–${item.max}`}</p>
        )}
      </div>
    );
  }

  // type 'text' (mis. prefix nomor dokumen — group penomoran)
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{item.label}</Label>
      <Input id={id} value={value === undefined || value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value)} maxLength={10} placeholder={String(item.default ?? '')} autoComplete="off" />
      {item.help && <p className="text-xs text-muted-foreground">{item.help}</p>}
    </div>
  );
}
