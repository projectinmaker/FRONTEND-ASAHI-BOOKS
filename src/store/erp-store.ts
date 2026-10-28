import { create } from 'zustand';

// === Update ASAHI #019 — ModuleId tambah 'preferensi' (modul Preferensi baru). ===
// === Update ASAHI #020 — ModuleId hapus 'organisasi' (fitur dihapus). ===
export type ModuleId = 'dashboard' | 'cash-bank' | 'sales' | 'purchasing' | 'fixed-assets' | 'inventory' | 'production' | 'general-ledger' | 'reports' | 'settings' | 'preferensi' | 'workflow-queue';

export type SubPageId = string;

interface ERPState {
  activeModule: ModuleId;
  activeSubPage: SubPageId | null;
  pageTitle: string;
  pageSubtitle: string;
  setActiveModule: (module: ModuleId) => void;
  setActiveSubPage: (subPage: SubPageId | null) => void;
  navigateTo: (module: ModuleId, subPage?: SubPageId) => void;
  setPageTitle: (title: string, subtitle?: string) => void;
}

export const useERPStore = create<ERPState>((set) => ({
  activeModule: 'dashboard',
  activeSubPage: null,
  pageTitle: '',
  pageSubtitle: '',
  setActiveModule: (module) => set({ activeModule: module, activeSubPage: null }),
  setActiveSubPage: (subPage) => set({ activeSubPage: subPage }),
  navigateTo: (module, subPage) => set({ activeModule: module, activeSubPage: subPage || null }),
  setPageTitle: (title, subtitle = '') => set({ pageTitle: title, pageSubtitle: subtitle })
}));
