'use client';

// === Update #059 — Error boundary GLOBAL (jaring pengaman #3, terakhir) ===
//
// Menangkap exception yang terjadi DI LUAR error.tsx (mis. error pada root
// layout / proses hydration) yang sebelumnya jatuh ke halaman default
// Next.js "Application error: a client-side exception…".
//
// PENTING: global-error ME-REPLACE root layout saat aktif, jadi WAJIB
// merender <html> + <body> sendiri (kelas body mengikuti layout.tsx:
// antialiased bg-background text-foreground). Font variabel Geist tidak
// tersedia di sini — fallback font sistem cukup untuk layar error.

import { AppErrorScreen } from '@/components/erp/error-screen';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="id">
      <body className="antialiased bg-background text-foreground">
        <AppErrorScreen error={error} reset={reset} />
      </body>
    </html>
  );
}
