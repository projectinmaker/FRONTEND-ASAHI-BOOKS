import { create } from 'zustand';
import type { ModuleId } from './erp-store';

// ═══════════════════════════════════════════════════════════════════════════
// Tab Store — MDI Tabbed Interface
// ═══════════════════════════════════════════════════════════════════════════

export interface OpenTab {
  id: string;
  title: string;
  module: ModuleId;
  subPage?: string;
  /** 'list' for sub-page lists, 'form' for create/edit/detail */
  tabType: 'list' | 'form';
  /** Identifies which form component to render (e.g. 'pembayaran-create', 'pembayaran-edit') */
  formKey?: string;
  /** Props passed to the form component */
  formProps?: Record<string, unknown>;
  /** Whether the tab can be closed (dashboard tab is not closable) */
  closable: boolean;
  /** === Update #043 — dedupe form tab: key `module::subPage::formKey::entityKey`
   *  (entity dari props: id / penawaranId / ropId / dll; '' untuk form tambah).
   *  Tab dengan key sama TIDAK diduplikat — di-update di tempat + seq dinaikkan
   *  supaya konten remount dengan data segar. === */
  dedupeKey?: string;
  /** Update #043 — counter yang dinaikkan setiap kali tab sama dibuka lagi
   *  (dipakai sebagai React key konten tab di page.tsx → remount). */
  seq?: number;
}

interface TabStoreState {
  tabs: OpenTab[];
  activeTabId: string | null;

  // Opens a nav tab (from sidebar click). If tab exists, switches to it.
  openNavTab: (module: ModuleId, subPage: string, title: string) => void;

  // Opens a form tab. Generates unique id.
  openFormTab: (config: {
    title: string;
    module: ModuleId;
    subPage: string;
    formKey: string;
    formProps?: Record<string, unknown>;
    /** If true, close the current tab when this form opens */
    replaceCurrent?: boolean;
  }) => string;

  // Close a tab and switch to the previous one
  closeTab: (tabId: string) => void;

  // Switch active tab
  setActiveTab: (tabId: string) => void;

  // Close all tabs except the active one
  closeOtherTabs: (tabId: string) => void;

  // Get the currently active tab
  getActiveTab: () => OpenTab | null;

  // Refresh a list tab's data (triggers re-render by bumping a key)
  refreshListTab: (module: ModuleId, subPage: string) => void;

  // Track refresh keys for list tabs
  refreshKeys: Record<string, number>;
}

let tabIdCounter = 0;
function genTabId() {
  return `tab-${Date.now()}-${++tabIdCounter}`;
}

// ── Update #043 — ekstrak identitas entity dari formProps untuk dedupe ──────
// Pemanggil openFormTab di codebase memakai pola: { id } (mayoritas edit/cetak),
// { penawaranId }, { ropId }, { jurnalId }, { coaId }, { preselectedCoaId },
// atau object bersarang ({ po, invoice, penawaran, item, row }). Form "tambah"
// tanpa entity → '' (dedupe antar tombol Tambah yang sama → tab di-refresh).
const ENTITY_PROP_KEYS = ['id', 'penawaranId', 'ropId', 'jurnalId', 'lppbId', 'coaId', 'preselectedCoaId', 'barangId', 'documentId'] as const;
const ENTITY_NESTED_KEYS = ['po', 'invoice', 'penawaran', 'item', 'row', 'data', 'document'] as const;

function extractEntityId(props?: Record<string, unknown>): string {
  if (!props) return '';
  for (const key of ENTITY_PROP_KEYS) {
    const v = props[key];
    if (typeof v === 'string' && v) return v;
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  for (const key of ENTITY_NESTED_KEYS) {
    const nested = props[key] as { id?: unknown } | undefined;
    const id = nested?.id;
    if (typeof id === 'string' && id) return id;
    if (typeof id === 'number' && Number.isFinite(id)) return String(id);
  }
  return '';
}

export const useTabStore = create<TabStoreState>((set, get) => ({
  tabs: [
    {
      id: 'tab-dashboard',
      title: 'Dashboard',
      module: 'dashboard',
      tabType: 'list',
      closable: false
    }
  ],
  activeTabId: 'tab-dashboard',
  refreshKeys: {},

  openNavTab: (module, subPage, title) => {
    const { tabs } = get();
    // Check if this nav tab already exists
    const existing = tabs.find((t) => t.module === module && t.subPage === subPage && t.tabType === 'list');
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }
    const newTab: OpenTab = {
      id: `tab-${module}-${subPage}`,
      title,
      module,
      subPage,
      tabType: 'list',
      closable: true
    };
    set({
      tabs: [...tabs, newTab],
      activeTabId: newTab.id
    });
  },

  openFormTab: ({ title, module, subPage, formKey, formProps, replaceCurrent }) => {
    const id = genTabId();
    const { tabs, activeTabId } = get();
    // === Update #043 — dedupe form tab: entity sama (module/subPage/formKey/
    // entityKey identik) → UPDATE tab existing (title + props + seq dinaikkan
    // untuk remount data segar) dan aktifkan — TIDAK push tab baru.
    // id tab (dan posisinya di barisan) dipertahankan. ===
    const dedupeKey = `${module}::${subPage ?? ''}::${formKey}::${extractEntityId(formProps)}`;
    const existing = tabs.find((t) => t.tabType === 'form' && t.dedupeKey === dedupeKey);
    if (existing) {
      const seq = (existing.seq ?? 0) + 1;
      const updated: OpenTab = { ...existing, title, formProps, seq };
      set({
        tabs: tabs.map((t) => (t.id === existing.id ? updated : t)),
        activeTabId: existing.id
      });
      return existing.id;
    }
    const newTab: OpenTab = {
      id,
      title,
      module,
      subPage,
      tabType: 'form',
      formKey,
      formProps,
      closable: true,
      dedupeKey,
      seq: 1
    };
    let newTabs: OpenTab[];
    if (replaceCurrent && activeTabId) {
      // Replace the current active tab
      newTabs = tabs.map((t) => (t.id === activeTabId ? newTab : t));
    } else {
      newTabs = [...tabs, newTab];
    }
    set({ tabs: newTabs, activeTabId: id });
    return id;
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId } = get();
    const idx = tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    const newTabs = tabs.filter((t) => t.id !== tabId);
    let newActiveId = activeTabId;
    if (activeTabId === tabId) {
      // Switch to adjacent tab
      newActiveId = newTabs[Math.min(idx, newTabs.length - 1)]?.id || null;
    }
    set({ tabs: newTabs, activeTabId: newActiveId });
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  closeOtherTabs: (tabId) => {
    const { tabs } = get();
    set({ tabs: tabs.filter((t) => t.id === tabId || !t.closable) });
  },

  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.id === activeTabId) || null;
  },

  refreshListTab: (module, subPage) => {
    const key = `${module}:${subPage}`;
    set((state) => ({
      refreshKeys: { ...state.refreshKeys, [key]: Date.now() }
    }));
  }
}));
