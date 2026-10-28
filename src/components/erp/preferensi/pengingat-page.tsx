'use client';

// === Update ASAHI #019 — Preferensi → Pengingat ===
//
// Grup preferensi 'pengingat': PENGINGAT_AKTIF, PENGINGAT_BARANG_DIPESAN,
// dan 4 item number (PENGINGAT_PIUTANG_HARI, PENGINGAT_DISKON_PIUTANG_HARI,
// PENGINGAT_HUTANG_HARI, PENGINGAT_DISKON_HUTANG_HARI) — item number
// dirender sebagai Input number dengan label "... hari sebelum jatuh tempo".

import PreferensiGroupForm from '@/components/erp/preferensi/preferensi-group-form';

interface PengingatPageProps {
  refreshKey?: number;
}

export default function PengingatPage({ refreshKey }: PengingatPageProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Pengingat</h2>
        <p className="text-sm text-muted-foreground">Pengingat yang tampil saat sistem mulai — barang yang perlu dipesan serta piutang/hutang menjelang jatuh tempo (jumlah hari sebelum jatuh tempo).</p>
      </div>

      <PreferensiGroupForm groupId="pengingat" refreshKey={refreshKey} />
    </div>
  );
}
