import { BrowserWindow } from 'electron'
import type { SessionContext, ConnectionConfig, DatabaseSchema, ConnectionStatus } from '../../shared/types'
import { IPC } from '../../shared/ipc-channels'
import connectionManager from './ConnectionManager'

// ============================================================
// DBSessionManager — singleton
// ============================================================
// Unifies connection activation + schema fetching into a single
// "session" lifecycle. Every active session carries its connection
// config, schema, and status together — consumers read from one
// place instead of fetching schema independently.
// ============================================================

class DBSessionManager {
  private static instance: DBSessionManager | null = null

  /** Active sessions keyed by connection id */
  private sessions: Map<string, SessionContext> = new Map()

  private constructor() {}

  static getInstance(): DBSessionManager {
    if (!DBSessionManager.instance) {
      DBSessionManager.instance = new DBSessionManager()
    }
    return DBSessionManager.instance
  }

  // ============================================================
  // Lifecycle
  // ============================================================

  /**
   * Activate a connection AND fetch its schema in one operation.
   * Returns the unified SessionContext.
   * Pushes events to all renderer windows on success/failure.
   */
  async activate(connectionId: string): Promise<SessionContext> {
    const config = connectionManager.getConnection(connectionId)
    if (!config) throw new Error(`Connection not found: ${connectionId}`)

    try {
      // 1. Activate the connection pool (existing logic)
      await connectionManager.activateConnection(connectionId)

      // 2. Fetch schema
      const { dialect, pool } = connectionManager.getPool(connectionId) as any
      const schema: DatabaseSchema = await dialect.fetchSchema(pool, connectionId)

      // 3. Build session context
      const status = connectionManager.getConnectionStatus(connectionId)!
      const session: SessionContext = {
        connection: config,
        schema,
        status,
        activatedAt: Date.now()
      }

      this.sessions.set(connectionId, session)
      this.notify(IPC.SESSION_ACTIVATED, { connectionId, session })

      return session
    } catch (err) {
      // Deactivate pool on schema fetch failure
      await connectionManager.deactivateConnection(connectionId).catch(() => {})
      const msg = err instanceof Error ? err.message : String(err)
      this.notify(IPC.SESSION_ERROR, { connectionId, error: msg })
      throw err
    }
  }

  /**
   * Deactivate a connection and remove its session.
   */
  async deactivate(connectionId: string): Promise<void> {
    this.sessions.delete(connectionId)
    await connectionManager.deactivateConnection(connectionId)
    this.notify(IPC.SESSION_DEACTIVATED, { connectionId })
  }

  /**
   * Refresh the schema for an active session.
   */
  async refreshSchema(connectionId: string): Promise<SessionContext> {
    const session = this.sessions.get(connectionId)
    if (!session) throw new Error(`No active session for connection: ${connectionId}`)

    const { dialect, pool } = connectionManager.getPool(connectionId) as any
    const schema: DatabaseSchema = await dialect.fetchSchema(pool, connectionId)

    const updated: SessionContext = {
      ...session,
      schema,
      status: connectionManager.getConnectionStatus(connectionId) ?? session.status,
      activatedAt: Date.now()
    }

    this.sessions.set(connectionId, updated)
    this.notify(IPC.SESSION_SCHEMA_REFRESHED, { connectionId, session: updated })

    return updated
  }

  // ============================================================
  // Queries
  // ============================================================

  /** Get the full session context for a connection, or null */
  getSession(connectionId: string): SessionContext | null {
    return this.sessions.get(connectionId) ?? null
  }

  /** Get the schema portion only (convenience for consumers) */
  getSchema(connectionId: string): DatabaseSchema | null {
    return this.sessions.get(connectionId)?.schema ?? null
  }

  /** List all active session ids */
  getActiveIds(): string[] {
    return Array.from(this.sessions.keys())
  }

  /** Check if a connection has an active session */
  hasSession(connectionId: string): boolean {
    return this.sessions.has(connectionId)
  }

  /** Number of active sessions */
  get activeCount(): number {
    return this.sessions.size
  }

  // ============================================================
  // Internal
  // ============================================================

  private notify(channel: string, data: unknown): void {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) win.webContents.send(channel, data)
    }
  }
}

export const dbSessionManager = DBSessionManager.getInstance()
export default dbSessionManager
