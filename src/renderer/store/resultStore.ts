import { create } from 'zustand'
import type { QueryResult, ColumnMeta } from '../../shared/types'

export type QueryStatus = 'idle' | 'running' | 'cancelled' | 'error'

export interface SortState {
  column: string | null
  direction: 'asc' | 'desc'
}

export interface PaginationState {
  page: number
  pageSize: number
}

interface ResultState {
  result: QueryResult | null
  status: QueryStatus
  error: string | null
  currentQueryId: string | null
  connectionId: string | null
  pagination: PaginationState
  sort: SortState
  search: string

  // Actions
  setResult: (result: QueryResult, connectionId?: string) => void
  setStatus: (status: QueryStatus, error?: string) => void
  setPage: (page: number, pageSize?: number) => void
  setSort: (column: string | null, direction?: 'asc' | 'desc') => void
  setSearch: (search: string) => void
  clearResult: () => void
  setQueryId: (queryId: string | null) => void
}

export const useResultStore = create<ResultState>((set) => ({
  result: null,
  status: 'idle',
  error: null,
  currentQueryId: null,
  connectionId: null,
  pagination: { page: 1, pageSize: 100 },
  sort: { column: null, direction: 'asc' },
  search: '',

  setResult: (result, connectionId) => {
    set({ result, status: 'idle', error: null, connectionId: connectionId ?? null, pagination: { page: 1, pageSize: 100 } })
  },

  setStatus: (status, error) => {
    set({ status, error: error ?? null })
  },

  setPage: (page, pageSize) => {
    set((state) => ({
      pagination: {
        page,
        pageSize: pageSize ?? state.pagination.pageSize
      }
    }))
  },

  setSort: (column, direction = 'asc') => {
    set({ sort: { column, direction } })
  },

  setSearch: (search) => {
    set((state) => ({ search, pagination: { page: 1, pageSize: state.pagination.pageSize } }))
  },

  clearResult: () => {
    set({
      result: null,
      status: 'idle',
      error: null,
      currentQueryId: null,
      connectionId: null,
      sort: { column: null, direction: 'asc' },
      search: '',
      pagination: { page: 1, pageSize: 100 }
    })
  },

  setQueryId: (queryId) => {
    set({ currentQueryId: queryId })
  }
}))

// Derived selector: get filtered + sorted + paginated rows
export const selectDisplayRows = (state: ResultState): Record<string, unknown>[] => {
  if (!state.result) return []

  let rows = state.result.rows

  // Filter by search
  if (state.search) {
    const lower = state.search.toLowerCase()
    rows = rows.filter((row) =>
      Object.values(row).some((v) => {
        const s = v !== null && v !== undefined && typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')
        return s.toLowerCase().includes(lower)
      })
    )
  }

  // Sort
  if (state.sort.column) {
    const col = state.sort.column
    const dir = state.sort.direction === 'asc' ? 1 : -1
    rows = [...rows].sort((a, b) => {
      const av = a[col] ?? ''
      const bv = b[col] ?? ''
      const safeStr = (v: unknown): string => v !== null && v !== undefined && typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')
      return safeStr(av).localeCompare(safeStr(bv)) * dir
    })
  }

  // Paginate
  const { page, pageSize } = state.pagination
  const start = (page - 1) * pageSize
  return rows.slice(start, start + pageSize)
}

export const selectTotalRows = (state: ResultState): number => {
  if (!state.result) return 0
  if (!state.search) return state.result.rows.length

  const lower = state.search.toLowerCase()
  return state.result.rows.filter((row) =>
    Object.values(row).some((v) => {
      const s = v !== null && v !== undefined && typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')
      return s.toLowerCase().includes(lower)
    }).length
}

export const selectColumns = (state: ResultState): ColumnMeta[] => {
  return state.result?.columns ?? []
}
