import { create } from 'zustand'
import type { ModuleId } from './erp-store'

// ═══════════════════════════════════════════════════════════════════════════
// Tab Store — MDI Tabbed Interface
// ═══════════════════════════════════════════════════════════════════════════

export interface OpenTab {
  id: string
  title: string
  module: ModuleId
  subPage?: string
  /** 'list' for sub-page lists, 'form' for create/edit/detail */
  tabType: 'list' | 'form'
  /** Identifies which form component to render (e.g. 'pembayaran-create', 'pembayaran-edit') */
  formKey?: string
  /** Props passed to the form component */
  formProps?: Record<string, unknown>
  /** Whether the tab can be closed (dashboard tab is not closable) */
  closable: boolean
}

interface TabStoreState {
  tabs: OpenTab[]
  activeTabId: string | null

  // Opens a nav tab (from sidebar click). If tab exists, switches to it.
  openNavTab: (module: ModuleId, subPage: string, title: string) => void

  // Opens a form tab. Generates unique id.
  openFormTab: (config: {
    title: string
    module: ModuleId
    subPage: string
    formKey: string
    formProps?: Record<string, unknown>
    /** If true, close the current tab when this form opens */
    replaceCurrent?: boolean
  }) => string

  // Close a tab and switch to the previous one
  closeTab: (tabId: string) => void

  // Switch active tab
  setActiveTab: (tabId: string) => void

  // Close all tabs except the active one
  closeOtherTabs: (tabId: string) => void

  // Get the currently active tab
  getActiveTab: () => OpenTab | null

  // Refresh a list tab's data (triggers re-render by bumping a key)
  refreshListTab: (module: ModuleId, subPage: string) => void

  // Track refresh keys for list tabs
  refreshKeys: Record<string, number>
}

let tabIdCounter = 0
function genTabId() {
  return `tab-${Date.now()}-${++tabIdCounter}`
}

export const useTabStore = create<TabStoreState>((set, get) => ({
  tabs: [
    {
      id: 'tab-dashboard',
      title: 'Dashboard',
      module: 'dashboard',
      tabType: 'list',
      closable: false,
    },
  ],
  activeTabId: 'tab-dashboard',
  refreshKeys: {},

  openNavTab: (module, subPage, title) => {
    const { tabs } = get()
    // Check if this nav tab already exists
    const existing = tabs.find(
      (t) => t.module === module && t.subPage === subPage && t.tabType === 'list'
    )
    if (existing) {
      set({ activeTabId: existing.id })
      return
    }
    const newTab: OpenTab = {
      id: `tab-${module}-${subPage}`,
      title,
      module,
      subPage,
      tabType: 'list',
      closable: true,
    }
    set({
      tabs: [...tabs, newTab],
      activeTabId: newTab.id,
    })
  },

  openFormTab: ({ title, module, subPage, formKey, formProps, replaceCurrent }) => {
    const id = genTabId()
    const { tabs, activeTabId } = get()
    const newTab: OpenTab = {
      id,
      title,
      module,
      subPage,
      tabType: 'form',
      formKey,
      formProps,
      closable: true,
    }
    let newTabs: OpenTab[]
    if (replaceCurrent && activeTabId) {
      // Replace the current active tab
      newTabs = tabs.map((t) => (t.id === activeTabId ? newTab : t))
    } else {
      newTabs = [...tabs, newTab]
    }
    set({ tabs: newTabs, activeTabId: id })
    return id
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex((t) => t.id === tabId)
    if (idx === -1) return
    const newTabs = tabs.filter((t) => t.id !== tabId)
    let newActiveId = activeTabId
    if (activeTabId === tabId) {
      // Switch to adjacent tab
      newActiveId = newTabs[Math.min(idx, newTabs.length - 1)]?.id || null
    }
    set({ tabs: newTabs, activeTabId: newActiveId })
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  closeOtherTabs: (tabId) => {
    const { tabs } = get()
    set({ tabs: tabs.filter((t) => t.id === tabId || !t.closable) })
  },

  getActiveTab: () => {
    const { tabs, activeTabId } = get()
    return tabs.find((t) => t.id === activeTabId) || null
  },

  refreshListTab: (module, subPage) => {
    const key = `${module}:${subPage}`
    set((state) => ({
      refreshKeys: { ...state.refreshKeys, [key]: Date.now() },
    }))
  },
}))
