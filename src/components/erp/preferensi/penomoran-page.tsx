'use client';

// === Update ASAHI #019 — Preferensi → Penomoran Dokumen ===
//
// Grup preferensi 'penomoran' (KODE_PERUSAHAAN_NOMOR + 21 PREFIX_* —
// de-hardcode nomor dokumen). Header menampilkan CONTOH format nomor dokumen
// dinamis dari nilai KODE_PERUSAHAAN_NOMOR saat ini (tersimpan/draft):
// "PREFIX KODE/TAHUN/URUT" → mis. "SO ASI/2026/001".

import { useCallback, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import PreferensiGroupForm from '@/components/erp/preferensi/preferensi-group-form';
import { usePreferensiStore } from '@/store/preferensi-store';
import type { PreferensiGroup } from '@/types/api';

interface PenomoranPageProps {
  refreshKey?: number;
}

export default function PenomoranPage({ refreshKey }: PenomoranPageProps) {
  // Kode perusahaan: nilai tersimpan dari store (default 'ASI' bila belum
  // termuat — fail-open) + draft lokal mengikuti edit user.
  const savedKode = usePreferensiStore((s) => {
    const v = s.prefs['KODE_PERUSAHAAN_NOMOR'];
    return typeof v === 'string' && v ? v : 'ASI';
  });
  const [kode, setKode] = useState<string>(savedKode);

  const handleLoaded = useCallback((group: PreferensiGroup) => {
    const item = group.items.find((i) => i.key === 'KODE_PERUSAHAAN_NOMOR');
    if (item && typeof item.value === 'string' && item.value) setKode(item.value);
  }, []);

  const handleValueChange = useCallback((key: string, value: string | number | boolean) => {
    if (key === 'KODE_PERUSAHAAN_NOMOR' && typeof value === 'string') setKode(value || 'ASI');
  }, []);

  const tahun = new Date().getFullYear();
  const kodeTampil = (kode || 'ASI').toUpperCase();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Penomoran Dokumen</h2>
        <p className="text-sm text-muted-foreground">
          Kode perusahaan dan prefix tiap jenis dokumen — sebelumnya hardcoded di backend (mis. &ldquo;ASI&rdquo;, &ldquo;SO&rdquo;, &ldquo;INV&rdquo;). Berlaku untuk dokumen BARU; nomor dokumen lama tidak diubah.
        </p>
      </div>

      {/* ── Contoh format nomor dokumen (dinamis) ── */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Contoh Nomor Dokumen</CardTitle>
          <CardDescription>Format: PREFIX KODE PERUSAHAAN/TAHUN/NOMOR URUT — contoh berikut mengikuti kode perusahaan saat ini ({kodeTampil}).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="font-mono text-xs">
            SO {kodeTampil}/{tahun}/001
          </Badge>
          <Badge variant="secondary" className="font-mono text-xs">
            INV {kodeTampil}/{tahun}/001
          </Badge>
          <Badge variant="secondary" className="font-mono text-xs">
            PO {kodeTampil}/{tahun}/001
          </Badge>
          <Badge variant="secondary" className="font-mono text-xs">
            JV {kodeTampil}/{tahun}/001
          </Badge>
          <p className="w-full text-xs text-muted-foreground">Nilai prefix dinormalisasi ke HURUF BESAR oleh backend (huruf, angka, dan tanda hubung, maks 10 karakter).</p>
        </CardContent>
      </Card>

      <PreferensiGroupForm groupId="penomoran" refreshKey={refreshKey} onLoaded={handleLoaded} onValueChange={handleValueChange} />
    </div>
  );
}
