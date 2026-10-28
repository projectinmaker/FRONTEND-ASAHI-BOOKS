'use client';

// === Update ASAHI #019 — Preferensi → Font ===
//
// Grup preferensi 'font' (FONT_APLIKASI) + Card pratinjau yang font-nya
// berganti LANGSUNG mengikuti pilihan lokal (belum disimpan pun sudah
// terlihat). Setelah Simpan, usePreferensiStore diperbarui dan store
// menerapkan font ke document.body (seluruh aplikasi).

import { useCallback, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import PreferensiGroupForm from '@/components/erp/preferensi/preferensi-group-form';
import { FONT_STACKS, usePreferensiStore } from '@/store/preferensi-store';
import type { PreferensiGroup } from '@/types/api';

interface FontPageProps {
  refreshKey?: number;
}

export default function FontPage({ refreshKey }: FontPageProps) {
  // Draft lokal FONT_APLIKASI (untuk pratinjau) — nilai tersimpan dari store
  // sebagai nilai awal (default 'DEFAULT' bila belum termuat).
  const savedFont = usePreferensiStore((s) => {
    const v = s.prefs['FONT_APLIKASI'];
    return typeof v === 'string' && v ? v : 'DEFAULT';
  });
  const [draftFont, setDraftFont] = useState<string>(savedFont);

  const handleLoaded = useCallback((group: PreferensiGroup) => {
    const item = group.items.find((i) => i.key === 'FONT_APLIKASI');
    if (item && typeof item.value === 'string' && item.value) setDraftFont(item.value);
  }, []);

  const handleValueChange = useCallback((key: string, value: string | number | boolean) => {
    if (key === 'FONT_APLIKASI' && typeof value === 'string') setDraftFont(value);
  }, []);

  // 'DEFAULT' → tanpa inline style (font aplikasi dari CSS).
  const previewStack = draftFont ? FONT_STACKS[String(draftFont).toUpperCase()] : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Font</h2>
        <p className="text-sm text-muted-foreground">Font aplikasi — berlaku untuk seluruh antarmuka setelah disimpan (tidak memengaruhi dokumen cetak/PDF).</p>
      </div>

      <PreferensiGroupForm groupId="font" refreshKey={refreshKey} onLoaded={handleLoaded} onValueChange={handleValueChange} />

      {/* ── Pratinjau font langsung (mengikuti pilihan lokal) ── */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Pratinjau</CardTitle>
          <CardDescription>Contoh tampilan teks dengan font &ldquo;{draftFont || 'DEFAULT'}&rdquo; — berganti langsung saat pilihan diubah (belum disimpan pun sudah terlihat).</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="space-y-3 rounded-md border bg-background p-4"
            style={previewStack ? { fontFamily: previewStack } : undefined}
            aria-label={`Pratinjau font ${draftFont}`}>
            <p className="text-lg font-semibold">PT Asahi — Bukti Kas &amp; Bank</p>
            <p className="text-sm">
              Nomor: VC ASI/2026/001 — Tanggal: 05/02/2026. Pembayaran lain-lain kepada vendor dengan mata uang rupiah, disertai keterangan transaksi dan lampiran bukti pendukung.
            </p>
            <p className="text-sm">The quick brown fox jumps over the lazy dog — 0123456789 — Rp 20.000.000,00</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
