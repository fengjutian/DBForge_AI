import { create } from 'zustand'
import type { SessionContext, DatabaseSchema } from '../../shared/types'
import { useConnectionStore } from './connectionStore'

interface SessionState {
  /** All active sessions, keyed by connectionId */
  sessions: Record<string, SessionContext>

  /** Loading state for activation */
  activatingId: string | null

  /** Error message per connection */
  errors: Record<string, string>

  // ── Actions ──

  /** Activate a connection — creates pool + fetches schema in one call */
  activate: (connectionId: string) => Promise<SessionContext>

  /** Deactivate a connection — closes pool + removes session */
  deactivate: (connectionId: string) => Promise<void>

  /** Refresh schema for an active session */
  refreshSchema: (connectionId: string) => Promise<SessionContext>

  /** Get the full session context for a connection */
  getSession: (connectionId: string) => SessionContext | null

  /** Get the schema for a connection (convenience) */
  getSchema: (connectionId: string) => DatabaseSchema | null

  /** Check if a connection has an active session */
  hasSession: (connectionId: string) => boolean

  /** Internal: upsert a session from a push event */
  _upsertSession: (connectionId: string, session: SessionContext) => void

  /** Internal: remove a session */
  _removeSession: (connectionId: string) => void

  /** Internal: set error */
  _setError: (connectionId: string, error: string) => void
}

export const useSessionStore = create<SessionState>((set, get) => {
  // Listen for push events from main process
  const offActivated = window.electronAPI.dbSession.onActivated(
    ({ connectionId, session }) => {
      get()._upsertSession(connectionId, session)
      // Also sync activeConnectionId in connectionStore
      useConnectionStore.getState().updateActiveConnectionId(connectionId)
    }
  )

  const offDeactivated = window.electronAPI.dbSession.onDeactivated(
    ({ connectionId }) => {
      get()._removeSession(connectionId)
      if (useConnectionStore.getState().activeConnectionId === connectionId) {
        useConnectionStore.getState().clearActiveConnectionId()
      }
    }
  )

  const offRefreshed = window.electronAPI.dbSession.onSchemaRefreshed(
    ({ connectionId, session }) => {
      get()._upsertSession(connectionId, session)
    }
  )

  const offError = window.electronAPI.dbSession.onError(
    ({ connectionId, error }) => {
      get()._setError(connectionId, error)
      if (useConnectionStore.getState().activeConnectionId === connectionId) {
        useConnectionStore.getState().clearActiveConnectionId()
      }
    }
  )

  // Cleanup on store teardown (only in dev HMR)
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      offActivated()
      offDeactivated()
      offRefreshed()
      offError()
    })
  }

  return {
    sessions: {},
    activatingId: null,
    errors: {},

    activate: async (connectionId) => {
      set({ activatingId: connectionId })
      try {
        const session = await window.electronAPI.dbSession.activate(connectionId)
        set((state) => ({
          sessions: { ...state.sessions, [connectionId]: session },
          activatingId: null,
          errors: { ...state.errors, [connectionId]: '' }
        }))
        // Sync activeConnectionId
        useConnectionStore.getState().updateActiveConnectionId(connectionId)
        return session
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        set((state) => ({
          activatingId: null,
          errors: { ...state.errors, [connectionId]: msg }
        }))
        throw err
      }
    },

    deactivate: async (connectionId) => {
      try {
        await window.electronAPI.dbSession.deactivate(connectionId)
        set((state) => {
          const { [connectionId]: _, ...rest } = state.sessions
          const { [connectionId]: __, ...restErrors } = state.errors
          return { sessions: rest, errors: restErrors }
        })
        if (useConnectionStore.getState().activeConnectionId === connectionId) {
          useConnectionStore.getState().clearActiveConnectionId()
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        set((state) => ({
          errors: { ...state.errors, [connectionId]: msg }
        }))
        throw err
      }
    },

    refreshSchema: async (connectionId) => {
      try {
        const session = await window.electronAPI.dbSession.refreshSchema(connectionId)
        set((state) => ({
          sessions: { ...state.sessions, [connectionId]: session }
        }))
        return session
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        set((state) => ({
          errors: { ...state.errors, [connectionId]: msg }
        }))
        throw err
      }
    },

    getSession: (connectionId) => {
      return get().sessions[connectionId] ?? null
    },

    getSchema: (connectionId) => {
      return get().sessions[connectionId]?.schema ?? null
    },

    hasSession: (connectionId) => {
      return connectionId in get().sessions
    },

    _upsertSession: (connectionId, session) => {
      set((state) => ({
        sessions: { ...state.sessions, [connectionId]: session },
        errors: { ...state.errors, [connectionId]: '' }
      }))
    },

    _removeSession: (connectionId) => {
      set((state) => {
        const { [connectionId]: _, ...rest } = state.sessions
        return { sessions: rest }
      })
    },

    _setError: (connectionId, error) => {
      set((state) => ({
        errors: { ...state.errors, [connectionId]: error }
      }))
    }
  }
})
