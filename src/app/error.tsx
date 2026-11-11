'use client';

// === Update #059 — Error boundary LEVEL ROUTE (jaring pengaman #2) ===
//
// Menangkap exception client-side yang lolos dari ModuleErrorBoundary (mis.
// error pada shell sidebar/header/tab, atau gagal-muat chunk saat halaman
// di-reload dalam kondisi offline). SEBELUM update ini, exception seperti itu
// menjatuhkan aplikasi ke halaman default Next.js: "Application error: a
// client-side exception has occurred while loading app.mamdev.cloud". SEKARANG
// diganti AppErrorScreen berbahasa Indonesia: data aman + tombol "Coba Lagi"
// (reset me-render ulang segmen yang gagal) + "Muat Ulang Halaman" + kode
// referensi. Root layout (font, toaster) tetap tampil — boundary ini TIDAK
// me-replace layout. Urutan jaring pengaman #059:
//   1. ModuleErrorBoundary (area konten modul — paling dalam)
//   2. error.tsx ini (level route)
//   3. global-error.tsx (fallback terakhir, me-replace root layout)

import { AppErrorScreen } from '@/components/erp/error-screen';

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <AppErrorScreen error={error} reset={reset} />;
}
