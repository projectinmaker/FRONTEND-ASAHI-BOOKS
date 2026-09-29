import Script from 'next/script';

import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster as SonnerToaster } from '@/components/ui/sonner';
import { Toaster } from '@/components/ui/toaster';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin']
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin']
});

export const metadata: Metadata = {
  title: 'ASAHI Books - System Accounting ASAHI',
  description: 'Software akuntansi terintegrasi untuk manajemen keuangan. Modul Kas & Bank, Penjualan, Pembelian, Persediaan, Aset Tetap, Buku Besar, dan Laporan Keuangan.',
  keywords: ['ASAHI Books', 'System Accounting ASAHI', 'Software Akuntansi', 'Sistem Akuntansi'],
  authors: [{ name: 'ASAHI Books Team' }],
  icons: {
    icon: 'https://cdn-icons-png.flaticon.com/512/5277/5277464.png'
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
        <Script
          id="crypto-polyfill"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                if (typeof window === "undefined") return;
                if (!window.crypto) { window.crypto = {}; }
                if (typeof window.crypto.randomUUID !== "function") {
                  window.crypto.randomUUID = function () {
                    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
                      var r = (Math.random() * 16) | 0;
                      var v = c === "x" ? r : (r & 0x3) | 0x8;
                      return v.toString(16);
                    });
                  };
                }
              })();
            `
          }}
        />
        {children}
        <SonnerToaster />
        <Toaster />
      </body>
    </html>
  );
}
