import { create } from 'zustand'
import type { ConnectionConfig, ConnectionStatus } from '../../shared/types'
import type { ElectronAPI } from '../../main/preload'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

interface ConnectionState {
  connections: ConnectionConfig[]
  activeConnectionId: string | null
  activeDatabase: string | null
  statuses: Record<string, ConnectionStatus>
  loading: boolean
  error: string | null

  // Actions
  loadConnections: () => Promise<void>
  createConnection: (config: ConnectionConfig) => Promise<void>
  updateConnection: (config: ConnectionConfig) => Promise<void>
  deleteConnection: (id: string) => Promise<void>
  activateConnection: (id: string) => Promise<void>
  deactivateConnection: (id: string) => Promise<void>
  switchDatabase: (connectionId: string, database: string) => Promise<void>
  updateStatus: (status: ConnectionStatus) => void
  /** Used by sessionStore to sync activeConnectionId after unified activation */
  updateActiveConnectionId: (id: string | null) => void
  /** Used by sessionStore to clear on deactivation/error */
  clearActiveConnectionId: () => void
}

export const useConnectionStore = create<ConnectionState>((set, get) => {
  // Listen for status changes pushed from main process
  window.electronAPI.connection.onStatusChanged((status) => {
    get().updateStatus(status as ConnectionStatus)
  })

  return {
    connections: [],
    activeConnectionId: null,
    activeDatabase: null,
    statuses: {},
    loading: false,
    error: null,

    loadConnections: async () => {
      set({ loading: true, error: null })
      try {
        const connections = await window.electronAPI.connection.list()
        set({ connections: connections as ConnectionConfig[], loading: false })
      } catch (err) {
        set({ error: (err as Error).message, loading: false })
      }
    },

    createConnection: async (config) => {
      await window.electronAPI.connection.create(config)
      await get().loadConnections()
    },

    updateConnection: async (config) => {
      await window.electronAPI.connection.update(config)
      await get().loadConnections()
      // If the updated connection is the active one, sync activeDatabase
      if (get().activeConnectionId === config.id) {
        set({ activeDatabase: config.database ?? null })
      }
    },

    deleteConnection: async (id) => {
      await window.electronAPI.connection.delete(id)
      set((state) => ({
        connections: state.connections.filter((c) => c.id !== id),
        activeConnectionId: state.activeConnectionId === id ? null : state.activeConnectionId,
        statuses: Object.fromEntries(
          Object.entries(state.statuses).filter(([key]) => key !== id)
        )
      }))
    },

    activateConnection: async (id) => {
      await window.electronAPI.connection.activate(id)
      const conn = get().connections.find(c => c.id === id)
      set({ activeConnectionId: id, activeDatabase: conn?.database ?? null })
    },

    deactivateConnection: async (id) => {
      await window.electronAPI.connection.deactivate(id)
      set((state) => ({
        activeConnectionId: state.activeConnectionId === id ? null : state.activeConnectionId,
        activeDatabase: state.activeConnectionId === id ? null : state.activeDatabase
      }))
    },

    switchDatabase: async (connectionId, database) => {
      await window.electronAPI.query.execute({
        connectionId,
        sql: `USE \`${database}\``
      })
      set({ activeDatabase: database })
    },

    updateStatus: (status) => {
      set((state) => ({
        statuses: { ...state.statuses, [status.id]: status }
      }))
    },

    updateActiveConnectionId: (id) => {
      set((state) => {
        if (state.activeConnectionId === id) return state // no change
        const conn = state.connections.find(c => c.id === id)
        return {
          activeConnectionId: id,
          activeDatabase: conn?.database ?? null
        }
      })
    },

    clearActiveConnectionId: () => {
      set((state) => ({
        activeConnectionId: null,
        activeDatabase: null
      }))
    }
  }
})
