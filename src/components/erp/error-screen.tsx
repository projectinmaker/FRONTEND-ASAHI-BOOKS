'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw, WifiOff } from 'lucide-react';

/**
 * === Update #059 — layar error ramah, pengganti halaman default Next.js ===
 *
 * SEBELUM: exception client-side apa pun — paling sering: chunk JS modul gagal
 * dimuat karena koneksi USER terputus (semua modul ERP dimuat dinamis via
 * next/dynamic, ssr:false) — menjatuhkan aplikasi ke halaman default Next.js:
 * "Application error: a client-side exception has occurred while loading
 * app.mamdev.cloud (see the browser console for more information)." — bahasa
 * Inggris, menakutkan, tanpa instruksi, tanpa tombol pemulihan.
 *
 * SEKARANG ada dua varian UI berbahasa Indonesia (deteksi kondisi offline via
 * navigator.onLine supaya pesannya tepat):
 * 1. AppErrorScreen  — layar penuh; dipakai src/app/error.tsx (boundary route)
 *    dan src/app/global-error.tsx (fallback terakhir, me-replace root layout).
 * 2. ModuleErrorCard — kartu inline di area konten; dipakai
 *    ModuleErrorBoundary (sidebar, header, dan tab bar tetap utuh).
 * Keduanya: penegasan data aman + tombol "Coba Lagi" (render ulang modul yang
 * gagal — chunk diunduh ulang, otomatis berhasil begitu koneksi pulih) +
 * tombol "Muat Ulang Halaman" + kode referensi untuk administrator.
 */

const PRIMARY_BUTTON = 'inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
const OUTLINE_BUTTON = 'inline-flex h-10 items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function ErrorActions({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <button type="button" className={PRIMARY_BUTTON} onClick={onRetry}>
        <RefreshCw className="size-4" aria-hidden="true" />
        Coba Lagi
      </button>
      <button type="button" className={OUTLINE_BUTTON} onClick={() => window.location.reload()}>
        <RotateCcw className="size-4" aria-hidden="true" />
        Muat Ulang Halaman
      </button>
    </div>
  );
}

/**
 * Layar penuh — dipakai app/error.tsx & app/global-error.tsx.
 * Bila error terjadi saat offline, layar ini otomatis mencoba pulih (reset)
 * begitu browser melaporkan koneksi kembali (event 'online').
 */
export function AppErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const offline = isBrowserOffline();

  // Detail teknis ke console supaya mudah dilampirkan administrator.
  useEffect(() => {
    console.error('[Asahi] Error boundary (layar penuh):', error);
  }, [error]);

  // Offline saat error terjadi → pulihkan otomatis saat browser 'online'.
  useEffect(() => {
    if (!offline) return;
    const onOnline = () => reset();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [offline, reset]);

  return (
    <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-4 py-10 text-center text-foreground">
      <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700" aria-hidden="true">
        {offline ? <WifiOff className="size-7" /> : <AlertTriangle className="size-7" />}
      </div>
      <div className="max-w-md space-y-2">
        <h1 className="text-lg font-semibold">{offline ? 'Koneksi internet Anda sedang terputus' : 'Terjadi kesalahan pada aplikasi'}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {offline ? (
            <>
              Tenang — data yang sudah tersimpan aman. Periksa koneksi internet Anda, lalu tekan <strong className="font-semibold text-foreground">Coba Lagi</strong>. Halaman ini akan mencoba pulih otomatis begitu koneksi kembali.
            </>
          ) : (
            <>
              Tenang — data yang sudah tersimpan aman. Tekan <strong className="font-semibold text-foreground">Coba Lagi</strong>; bila masih gagal, muat ulang halaman. Bila masalah berlanjut, hubungi administrator.
            </>
          )}
        </p>
      </div>
      <ErrorActions onRetry={reset} />
      {error?.digest ? <p className="text-xs text-muted-foreground/70">Kode referensi: {error.digest}</p> : null}
    </div>
  );
}

/**
 * Kartu inline di area konten — dipakai ModuleErrorBoundary: hanya area
 * modul yang diganti kartu pemulihan; sidebar, header, dan tab bar tetap
 * utuh sehingga user masih bisa pindah ke modul lain yang sudah ter-load.
 */
export function ModuleErrorCard({ error, onRetry }: { error: Error & { digest?: string }; onRetry: () => void }) {
  const offline = isBrowserOffline();

  return (
    <div role="alert" className="flex min-h-full flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700" aria-hidden="true">
        {offline ? <WifiOff className="size-6" /> : <AlertTriangle className="size-6" />}
      </div>
      <div className="max-w-md space-y-1.5">
        <h2 className="text-base font-semibold">{offline ? 'Koneksi internet Anda sedang terputus' : 'Modul gagal dimuat'}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {offline ? (
            <>Tenang — data yang sudah tersimpan aman. Periksa koneksi internet Anda; modul ini akan mencoba dimuat ulang otomatis begitu koneksi kembali.</>
          ) : (
            <>
              Tenang — data yang sudah tersimpan aman. Tekan <strong className="font-semibold text-foreground">Coba Lagi</strong>; bila masih gagal, muat ulang halaman.
            </>
          )}
        </p>
      </div>
      <ErrorActions onRetry={onRetry} />
      {error?.digest ? <p className="text-xs text-muted-foreground/70">Kode referensi: {error.digest}</p> : null}
    </div>
  );
}
