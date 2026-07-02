import { create } from 'zustand'
import type { QueryResult } from '@dbforge/shared'

export type TabType = 'query' | 'preview'

export interface Tab {
  id: string
  type: TabType
  connectionId: string | null
  title: string
  content: string
  isDirty: boolean
  // preview tabs carry their own result
  previewResult?: QueryResult | null
  previewStatus?: 'idle' | 'running' | 'error'
  previewError?: string | null
  // for preview tabs: identifies the table so we can reuse the tab
  previewKey?: string // e.g. "dbName.tableName"
  previewTable?: { dbName: string; tableName: string }
  previewTotal?: number // total row count from COUNT(*)
  /** When true, FormulaBar is shown by default and page size defaults to 1000 */
  formulaMode?: boolean
}

const createEmptyTab = (): Tab => ({
  id: `tab-${Date.now()}`,
  type: 'query',
  connectionId: null,
  title: 'New Query',
  content: '',
  isDirty: false
})

interface EditorState {
  tabs: Tab[]
  activeTabId: string

  // Cross-component: SQL pending AI explanation (set by SQLEditor context menu)
  pendingExplainSQL: string | null
  setPendingExplainSQL: (sql: string | null) => void

  // Actions
  addTab: (tab?: Partial<Omit<Tab, 'id'>>) => void
  closeTab: (id: string) => void
  renameTab: (id: string, title: string) => void
  setActiveTab: (id: string) => void
  updateContent: (id: string, content: string) => void
  reorderTabs: (fromIndex: number, toIndex: number) => void
  // Preview tab actions
  openPreviewTab: (previewKey: string, title: string, connectionId: string) => string
  openFormulaViewTab: (previewKey: string, title: string, connectionId: string) => string
  updatePreviewTab: (id: string, patch: Partial<Pick<Tab, 'previewResult' | 'previewStatus' | 'previewError' | 'previewTotal'>>) => void
}

const initialTab = createEmptyTab()

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [initialTab],
  activeTabId: initialTab.id,
  pendingExplainSQL: null,

  setPendingExplainSQL: (sql) => set({ pendingExplainSQL: sql }),

  addTab: (partial) => {
    const tab: Tab = {
      ...createEmptyTab(),
      ...partial
    }
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id
    }))
  },

  closeTab: (id) => {
    set((state) => {
      const remaining = state.tabs.filter((t) => t.id !== id)

      // Always keep at least one tab
      if (remaining.length === 0) {
        const empty = createEmptyTab()
        return { tabs: [empty], activeTabId: empty.id }
      }

      // If closing the active tab, activate the nearest one
      let nextActiveId = state.activeTabId
      if (state.activeTabId === id) {
        const closedIndex = state.tabs.findIndex((t) => t.id === id)
        const nextTab = remaining[Math.min(closedIndex, remaining.length - 1)]
        nextActiveId = nextTab.id
      }

      return { tabs: remaining, activeTabId: nextActiveId }
    })
  },

  renameTab: (id, title) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, title } : t))
    }))
  },

  setActiveTab: (id) => {
    if (get().tabs.some((t) => t.id === id)) {
      set({ activeTabId: id })
    }
  },

  updateContent: (id, content) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id ? { ...t, content, isDirty: content !== '' } : t
      )
    }))
  },

  reorderTabs: (fromIndex, toIndex) => {
    set((state) => {
      const tabs = [...state.tabs]
      const [moved] = tabs.splice(fromIndex, 1)
      tabs.splice(toIndex, 0, moved)
      return { tabs }
    })
  },

  openPreviewTab: (previewKey, title, connectionId) => {
    const existing = get().tabs.find(t => t.type === 'preview' && t.previewKey === previewKey)
    if (existing) {
      set({ activeTabId: existing.id })
      return existing.id
    }
    const tab: Tab = {
      id: `preview-${Date.now()}`,
      type: 'preview',
      connectionId,
      title,
      content: '',
      isDirty: false,
      previewKey,
      previewTable: (() => {
        const parts = previewKey.split('.')
        return { dbName: parts[0], tableName: parts[1] }
      })(),
      previewResult: null,
      previewStatus: 'idle',
      previewError: null,
      previewTotal: undefined
    }
    set((state) => ({ tabs: [...state.tabs, tab], activeTabId: tab.id }))
    return tab.id
  },

  openFormulaViewTab: (previewKey, title, connectionId) => {
    const tab: Tab = {
      id: `formula-${Date.now()}`,
      type: 'preview',
      connectionId,
      title,
      content: '',
      isDirty: false,
      previewKey,
      formulaMode: true,
      previewTable: (() => {
        const parts = previewKey.split('.')
        return { dbName: parts[0], tableName: parts[1] }
      })(),
      previewResult: null,
      previewStatus: 'idle',
      previewError: null,
      previewTotal: undefined
    }
    set((state) => ({ tabs: [...state.tabs, tab], activeTabId: tab.id }))
    return tab.id
  },

  updatePreviewTab: (id, patch) => {
    set((state) => ({
      tabs: state.tabs.map(t => t.id === id ? { ...t, ...patch } : t)
    }))
  }
}))
