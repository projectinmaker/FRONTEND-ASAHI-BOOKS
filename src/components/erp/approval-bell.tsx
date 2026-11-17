'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Approval Bell — badge lonceng notifikasi dokumen menunggu persetujuan.
//
// === Update #071 — komponen ini PENGGANTI halaman "Antrean Persetujuan"
//     (workflow-queue.tsx, dihapus). Latar belakang: maker-checker kini
//     DIKONFIGURASI per jenis dokumen (Preferensi ▸ Persetujuan) — dokumen
//     jenis yang diaktifkan menunggu persetujuan approver; jenis non-aktif
//     (default) langsung final. Halaman antrean terpisah tidak diperlukan —
//     approver cukup perlu TAHU bahwa ada aktivitas menunggu persetujuan.
//
//     Desain:
//     • Sumber data: GET /workflow/pending-summary — endpoint ringan (satu
//       query agregasi COUNT per document_type; pengganti /workflow/queue
//       yang fetch detail dokumen per baris / N+1 — berat bila di-poll).
//     • Polling tiap 30 detik (hanya saat tab browser terlihat) + refresh
//       saat window kembali difokuskan — pola yang sama dengan access-store
//       (izin) dan connection-banner (ping /health). Kegagalan jaringan
//       DIAMKAN (pertahankan angka terakhir) — banner koneksi global
//       (ConnectionStatusBanner) sudah menjadi satu-satunya sumber pesan
//       saat server tidak terjangkau.
//     • Hanya tampil bagi pengguna dengan izin workflow.queue.view
//       (Super Admin / Finance Manager) — RBAC-nya identik dengan menu
//       Antrean Persetujuan yang lama.
//     • Klik jenis dokumen → buka tab daftar dokumen modul terkait;
//       persetujuan dilakukan lewat kolom "Persetujuan" pada daftar
//       tersebut (tidak berubah).
// ═══════════════════════════════════════════════════════════════════════════

import * as React from 'react';
import { Bell, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAccessStore } from '@/store/access-store';
import { useTabStore } from '@/store/tab-store';
import { workflowApi } from '@/lib/workflow-api';
import type { ModuleId } from '@/store/erp-store';
import type { WorkflowPendingSummary } from '@/types/api';

const POLL_INTERVAL_MS = 30_000; // 30 detik

// Label Indonesia per document_type.
const DOC_TYPE_LABEL: Record<string, string> = {
  sales_order: 'Pesanan Penjualan',
  pengiriman_barang: 'Pengiriman Barang',
  sales_invoice: 'Invoice Penjualan',
  sales_retur: 'Retur Penjualan',
  purchase_order: 'Pesanan Pembelian',
  penerimaan_barang: 'Penerimaan Barang',
  purchase_invoice: 'Invoice Pembelian',
  purchase_retur: 'Retur Pembelian',
  transfer_bank: 'Transfer Bank',
  pembayaran_kas: 'Pembayaran Kas',
  penerimaan_kas: 'Penerimaan Kas',
  voucher_memorial: 'Voucher Memorial',
  penyesuaian_stok: 'Penyesuaian Stok',
  pemindahan_barang: 'Pemindahan Barang',
  permintaan_barang: 'Permintaan Barang',
  jurnal_umum: 'Jurnal Umum',
  asset_event: 'Transaksi Aset'
};

// Tujuan navigasi per document_type → (module, subPage) tempat daftar
// dokumen berada. Setelah Update #071, dokumen yang menunggu persetujuan
// berasal dari jenis yang diaktifkan di Preferensi ▸ Persetujuan (Kas &
// Bank, Persediaan, Aset Tetap, Jurnal Manual). Jenis lain tetap dipetakan
// sebagai pengaman untuk data lama yang mungkin masih menggantung.
const DOC_TYPE_TARGET: Record<string, { module: ModuleId; subPage: string; title: string }> = {
  pembayaran_kas: { module: 'cash-bank', subPage: 'pembayaran', title: 'Pembayaran' },
  penerimaan_kas: { module: 'cash-bank', subPage: 'penerimaan', title: 'Penerimaan' },
  transfer_bank: { module: 'cash-bank', subPage: 'transfer-bank', title: 'Transfer Bank' },
  voucher_memorial: { module: 'cash-bank', subPage: 'voucher-memorial', title: 'Voucher Memorial' },
  penyesuaian_stok: { module: 'inventory', subPage: 'penyesuaian', title: 'Penyesuaian' },
  pemindahan_barang: { module: 'inventory', subPage: 'pemindahan-barang', title: 'Pemindahan Barang' },
  permintaan_barang: { module: 'inventory', subPage: 'permintaan-barang', title: 'Permintaan Barang' },
  jurnal_umum: { module: 'general-ledger', subPage: 'jurnal-umum', title: 'Jurnal Umum' },
  asset_event: { module: 'fixed-assets', subPage: 'transaksi-aset', title: 'Transaksi Aset' },
  sales_order: { module: 'sales', subPage: 'pesanan', title: 'Sales Order' },
  pengiriman_barang: { module: 'sales', subPage: 'pengiriman', title: 'Pengiriman' },
  sales_invoice: { module: 'sales', subPage: 'invoice', title: 'Invoice' },
  sales_retur: { module: 'sales', subPage: 'retur', title: 'Retur' },
  purchase_order: { module: 'purchasing', subPage: 'pesanan', title: 'Pesanan' },
  penerimaan_barang: { module: 'inventory', subPage: 'penerimaan', title: 'Penerimaan' },
  purchase_invoice: { module: 'purchasing', subPage: 'invoice', title: 'Invoice' },
  purchase_retur: { module: 'purchasing', subPage: 'retur', title: 'Retur' }
};

function docTypeLabel(t: string): string {
  return DOC_TYPE_LABEL[t] || t;
}

export function ApprovalBell() {
  const permissions = useAccessStore((s) => s.permissions);
  const isSuperAdmin = useAccessStore((s) => s.isSuperAdmin);
  // Izin yang sama dengan menu Antrean Persetujuan yang lama.
  const allowed = isSuperAdmin || permissions.includes('workflow.queue.view');

  const [summary, setSummary] = React.useState<WorkflowPendingSummary | null>(null);
  const [open, setOpen] = React.useState(false);
  const inFlight = React.useRef(false);
  const openNavTab = useTabStore((s) => s.openNavTab);

  const fetchSummary = React.useCallback(async () => {
    if (inFlight.current) return; // cegah poll paralel
    inFlight.current = true;
    try {
      const res = await workflowApi.getPendingSummary();
      setSummary(res);
    } catch {
      // Diamkan kegagalan (termasuk koneksi terputus): pertahankan angka
      // terakhir — banner koneksi global sudah menjelaskan status server.
    } finally {
      inFlight.current = false;
    }
  }, []);

  React.useEffect(() => {
    if (!allowed) return;
    void fetchSummary();
    const id = window.setInterval(() => {
      // Hanya poll saat tab browser terlihat — hemat request tak perlu.
      if (document.visibilityState === 'visible') void fetchSummary();
    }, POLL_INTERVAL_MS);
    const onFocus = () => void fetchSummary();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [allowed, fetchSummary]);

  if (!allowed) return null;

  const total = summary?.total ?? 0;
  const entries = Object.entries(summary?.perType ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8" title="Notifikasi persetujuan" aria-label={`Notifikasi persetujuan${total > 0 ? ` — ${total} dokumen menunggu` : ''}`}>
          <Bell className={`h-4 w-4 ${total > 0 ? 'text-foreground' : 'text-muted-foreground'}`} />
          {total > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">{total > 99 ? '99+' : total}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Menunggu Persetujuan</span>
            {total > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">{total}</span>}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void fetchSummary()} title="Muat ulang" aria-label="Muat ulang notifikasi persetujuan">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Isi */}
        {summary === null ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">Memuat…</div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
            <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            <p className="text-sm text-muted-foreground">Tidak ada dokumen yang menunggu persetujuan.</p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {entries.map(([docType, count]) => {
              const target = DOC_TYPE_TARGET[docType];
              return (
                <button
                  key={docType}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted/60 disabled:cursor-default disabled:opacity-70"
                  disabled={!target}
                  onClick={() => {
                    if (!target) return;
                    openNavTab(target.module, target.subPage, target.title);
                    setOpen(false);
                  }}>
                  <span className="truncate">{docTypeLabel(docType)}</span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="border-t px-4 py-2.5">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Klik jenis dokumen untuk membuka daftarnya. Persetujuan dilakukan melalui kolom <span className="font-medium">Persetujuan</span> pada daftar dokumen modul terkait.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
