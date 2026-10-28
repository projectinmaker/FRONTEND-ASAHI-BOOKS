'use client';

// === Update ASAHI #023 — store registry export laporan ===
//
// Setiap komponen laporan me-register {endpoint, filename} saat data
// berhasil dimuat (sinkron dengan filter yang SEDANG ditampilkan);
// ReportActions membacanya untuk tombol Export Excel.
//
// Pola sama dengan store Zustand lain di proyek (preferensi-store, tab-store):
// tidak ada fetch di sini — murni registry key → spec yang ditulis komponen
// laporan (pemilik state filter) dan dibaca tombol export global ReportActions
// yang dirender ReportsModule di luar komponen laporan.

import { create } from 'zustand';

export interface ReportExportSpec {
  /** URL relatif API, sudah berisi query string filter. */
  endpoint: string;
  /** Nama file fallback (.xlsx). */
  filename: string;
}

interface ReportExportState {
  specs: Record<string, ReportExportSpec>;
  register: (subPage: string, spec: ReportExportSpec) => void;
}

export const useReportExportStore = create<ReportExportState>((set) => ({
  specs: {},
  register: (subPage, spec) => set((s) => ({ specs: { ...s.specs, [subPage]: spec } }))
}));
