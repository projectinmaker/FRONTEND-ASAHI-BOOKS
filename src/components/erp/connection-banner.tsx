'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, WifiOff, X } from 'lucide-react';
import { toast } from 'sonner';
import { pingServer, NET_DOWN_EVENT, NET_UP_EVENT } from '@/lib/api';

/**
 * === Update #055 — banner "Koneksi ke server terputus" ===
 *
 * SEBELUM: bila koneksi ke backend terganggu, request gagal dengan pesan
 * singkat "Tidak terhubung ke server" — user kaget/bingung harus ngapain.
 *
 * SEKARANG: begitu ada request yang gagal karena jaringan (ApiError status 0
 * dari api.ts), banner kuning ini muncul otomatis di atas layar berisi:
 * 1. Penjelasan apa yang terjadi + penegasan DATA YANG SUDAH TERSIMPAN AMAN.
 * 2. Instruksi urut: periksa koneksi internet → tunggu & coba lagi →
 *    muat ulang halaman (F5 / Ctrl+R) → hubungi administrator bila berlanjut.
 * 3. Peringatan lembut: ada pekerjaan belum disimpan? Jangan tutup halaman
 *    dulu — tekan "Coba Lagi" (biasanya pulih dalam beberapa saat).
 *
 * Perilaku:
 * - Tombol "Coba Lagi" → ping ringan GET /health (tanpa auth) via pingServer().
 * - Selama banner tampil, auto-ping tiap 30 detik — bila server kembali,
 *   banner menutup sendiri + toast "koneksi kembali normal".
 * - Request BERHASIL apa pun juga menutup banner (event NET_UP dari api.ts).
 * - Tombol ✕ menutup banner manual (muncul lagi bila koneksi masih putus
 *   dan ada request baru yang gagal).
 *
 * Dipasang di src/app/page.tsx — di halaman login DAN di dalam shell ERP.
 */
export function ConnectionStatusBanner() {
  const [offline, setOffline] = useState(false);
  const [checking, setChecking] = useState(false);
  // true saat pernah offline — supaya toast "pulih" hanya sekali per pemulihan
  const wasOffline = useRef(false);

  useEffect(() => {
    const onDown = () => {
      setOffline(true);
      wasOffline.current = true;
    };
    const onUp = () => setOffline(false);
    window.addEventListener(NET_DOWN_EVENT, onDown);
    window.addEventListener(NET_UP_EVENT, onUp);
    return () => {
      window.removeEventListener(NET_DOWN_EVENT, onDown);
      window.removeEventListener(NET_UP_EVENT, onUp);
    };
  }, []);

  // Toast sekali saat koneksi pulih (banner tertutup otomatis).
  useEffect(() => {
    if (!offline && wasOffline.current) {
      wasOffline.current = false;
      toast.success('Koneksi ke server kembali normal.');
    }
  }, [offline]);

  const retry = useCallback(async () => {
    setChecking(true);
    const ok = await pingServer();
    setChecking(false);
    if (ok) {
      setOffline(false);
    } else {
      toast.error('Server masih tidak dapat dihubungi. Bila terus berlanjut, hubungi administrator.');
    }
  }, []);

  // Auto-ping tiap 30 detik selama offline — banner menutup sendiri saat pulih.
  useEffect(() => {
    if (!offline) return;
    const timer = window.setInterval(() => {
      void (async () => {
        if (await pingServer()) setOffline(false);
      })();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [offline]);

  if (!offline) return null;

  return (
    <div role="alert" aria-live="assertive" className="fixed inset-x-0 top-0 z-[80] border-b border-amber-300 bg-amber-50 text-amber-900 shadow-md">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <WifiOff className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Koneksi ke server terputus</p>
            <p className="mt-0.5 text-xs leading-relaxed">
              Aplikasi tidak dapat menghubungi server. <strong>Tenang — data yang sudah tersimpan aman.</strong> Silakan periksa koneksi internet Anda, tunggu sebentar, lalu coba lagi. Bila masih gagal, muat ulang halaman (tekan F5 / Ctrl+R). Bila masalah berlanjut, hubungi administrator.
            </p>
            <p className="mt-1 text-xs italic">Ada pekerjaan yang belum disimpan? Jangan tutup halaman dulu — tekan &ldquo;Coba Lagi&rdquo;, biasanya koneksi pulih dalam beberapa saat.</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:ml-auto sm:pt-0.5">
          <Button size="sm" variant="outline" className="gap-2 border-amber-300 bg-white hover:bg-amber-100" onClick={() => void retry()} disabled={checking}>
            {checking ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}
            Coba Lagi
          </Button>
          <Button size="sm" variant="outline" className="gap-2 border-amber-300 bg-white hover:bg-amber-100" onClick={() => window.location.reload()}>
            Muat Ulang Halaman
          </Button>
          <Button size="icon" variant="ghost" className="size-8 text-amber-700 hover:bg-amber-100" aria-label="Tutup pesan koneksi (akan muncul lagi bila masih terputus)" onClick={() => setOffline(false)}>
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
