'use client';

// === Update ASAHI #019 — Preferensi → Penjualan & Pembelian ===
//
// Grup preferensi 'penjualan_pembelian' (auto settlement faktur, mode retur,
// konfirmasi faktur, pesan pembayaran lebih) + Card "Pembayaran Pesanan":
// UI grup 'pembayaran_pesanan' (BIAYA_BEDA_AKUN) DIGABUNG dengan AkunPicker
// SettingAkun key BIAYA_PESANAN yang hanya tampil/di-enable saat
// BIAYA_BEDA_AKUN aktif (nilai dibaca dari response + draft lokal).

import { useCallback, useState } from 'react';
import PreferensiGroupForm from '@/components/erp/preferensi/preferensi-group-form';
import AkunPicker from '@/components/erp/preferensi/akun-picker';
import type { PreferensiGroup } from '@/types/api';

interface PenjualanPembelianPageProps {
  refreshKey?: number;
}

export default function PenjualanPembelianPage({ refreshKey }: PenjualanPembelianPageProps) {
  // Nilai BIAYA_BEDA_AKUN (tersimpan + draft) — mengatur tampil picker akun.
  const [biayaBedaAkun, setBiayaBedaAkun] = useState(false);

  const handleLoaded = useCallback((group: PreferensiGroup) => {
    const item = group.items.find((i) => i.key === 'BIAYA_BEDA_AKUN');
    setBiayaBedaAkun(item?.value === true);
  }, []);

  const handleValueChange = useCallback((key: string, value: string | number | boolean) => {
    if (key === 'BIAYA_BEDA_AKUN') setBiayaBedaAkun(value === true);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Penjualan &amp; Pembelian</h2>
        <p className="text-sm text-muted-foreground">Perilaku default faktur penjualan/pembelian, retur, dan konfirmasi saat membuat dokumen.</p>
      </div>

      <PreferensiGroupForm groupId="penjualan_pembelian" refreshKey={refreshKey} />

      {/* ── Pembayaran Pesanan: grup 'pembayaran_pesanan' + akun biaya pesanan ── */}
      <PreferensiGroupForm
        groupId="pembayaran_pesanan"
        title="Pembayaran Pesanan"
        description="Opsi pembayaran di muka untuk pesanan (PO/SO) — biaya pesanan dapat disimpan ke akun terpisah."
        refreshKey={refreshKey}
        onLoaded={handleLoaded}
        onValueChange={handleValueChange}
      >
        {/* Picker akun hanya tampil saat "Simpan biaya pesanan ke akun berbeda"
            aktif (nilai tersimpan maupun draft lokal). */}
        {biayaBedaAkun && (
          <div className="rounded-md border bg-muted/30 p-4">
            <AkunPicker
              settingKey="BIAYA_PESANAN"
              label="Akun Biaya Pesanan"
              help="Akun beban untuk biaya-biaya pesanan (mis. biaya admin/kargo) saat diposting bersama pembayaran pesanan."
              refreshKey={refreshKey}
            />
          </div>
        )}
      </PreferensiGroupForm>
    </div>
  );
}
