'use client';

import React from 'react';
import { ModuleErrorCard } from './error-screen';

/**
 * === Update #059 — error boundary khusus AREA KONTEN MODUL ===
 *
 * Semua modul ERP dimuat dinamis (next/dynamic, ssr:false). Saat koneksi USER
 * terputus, chunk JS modul yang belum ter-cache gagal diunduh saat tab
 * dibuka/dipindah → exception saat render. SEBELUM update ini exception itu
 * menjatuhkan SELURUH halaman ke error default Next.js ("Application error:
 * a client-side exception has occurred…"). SEKARANG boundary ini menangkapnya
 * di area konten saja — sidebar, header, dan tab bar tetap utuh — dengan
 * perilaku:
 * - kartu pemulihan ramah (ModuleErrorCard) menggantikan isi modul;
 * - tombol "Coba Lagi" me-render ulang modul (chunk diunduh ulang — berhasil
 *   begitu koneksi pulih);
 * - event browser 'online' memicu pemulihan OTOMATIS tanpa user tekan apa pun.
 *
 * Dipasang di src/app/page.tsx mengelilingi <ModuleContent>, dengan key yang
 * mengikuti tab aktif supaya pindah tab selalu memulai boundary dari state
 * bersih. Boundary level route & global tetap ada sebagai jaring pengaman
 * terakhir: src/app/error.tsx & src/app/global-error.tsx.
 */
interface ModuleErrorBoundaryState {
  error: (Error & { digest?: string }) | null;
}

export class ModuleErrorBoundary extends React.Component<{ children: React.ReactNode }, ModuleErrorBoundaryState> {
  state: ModuleErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error & { digest?: string }): ModuleErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Detail teknis ke console supaya mudah dilampirkan administrator.
    console.error('[Asahi] Gagal memuat modul (boundary area konten):', error);
  }

  componentDidMount() {
    window.addEventListener('online', this.handleOnline);
  }

  componentWillUnmount() {
    window.removeEventListener('online', this.handleOnline);
  }

  // Koneksi user kembali → coba pulihkan modul otomatis.
  private handleOnline = () => {
    if (this.state.error) this.retry();
  };

  private retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return <ModuleErrorCard error={this.state.error} onRetry={this.retry} />;
    }
    return this.props.children;
  }
}
