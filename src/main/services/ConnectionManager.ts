import mysql2 from 'mysql2/promise'
import { BrowserWindow } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import type { ConnectionConfig, ConnectionStatus, TestResult } from '../../shared/types'
import { IPC } from '../../shared/ipc-channels'
import configStore from './ConfigStore'

// ============================================================
// ConnectionManager — singleton
// ============================================================

class ConnectionManager {
  private static instance: ConnectionManager | null = null

  /** Active connection pools, keyed by connection id */
  private pools: Map<string, mysql2.Pool> = new Map()

  /** Current status for each known connection */
  private statuses: Map<string, ConnectionStatus> = new Map()

  private constructor() {}

  static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager()
    }
    return ConnectionManager.instance
  }

  // ============================================================
  // Connection config CRUD (delegates to ConfigStore)
  // ============================================================

  /** Return all saved connection configs (passwords decrypted). */
  listConnections(): ConnectionConfig[] {
    return configStore.getConnections()
  }

  /** Return a single connection config by id. */
  getConnection(id: string): ConnectionConfig | undefined {
    return configStore.getConnection(id)
  }

  /** Create a new connection config and persist it. */
  createConnection(config: Omit<ConnectionConfig, 'id' | 'createdAt' | 'updatedAt'>): ConnectionConfig {
    const now = Date.now()
    const full: ConnectionConfig = {
      ...config,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now
    }
    configStore.saveConnection(full)
    // Initialize status as disconnected
    this.statuses.set(full.id, { id: full.id, state: 'disconnected' })
    return full
  }

  /** Update an existing connection config. */
  updateConnection(id: string, updates: Partial<Omit<ConnectionConfig, 'id' | 'createdAt'>>): ConnectionConfig {
    const existing = configStore.getConnection(id)
    if (!existing) {
      throw new Error(`Connection not found: ${id}`)
    }
    const updated: ConnectionConfig = {
      ...existing,
      ...updates,
      id,
      createdAt: existing.createdAt,
      updatedAt: Date.now()
    }
    configStore.saveConnection(updated)
    return updated
  }

  /** Delete a connection config and close its pool if active. */
  async deleteConnection(id: string): Promise<void> {
    await this.deactivateConnection(id)
    configStore.deleteConnection(id)
    this.statuses.delete(id)
  }

  // ============================================================
  // Connection pool lifecycle
  // ============================================================

  /**
   * Activate a connection: create a mysql2 pool and verify connectivity.
   * Notifies renderer of status changes.
   */
  async activateConnection(id: string): Promise<void> {
    const config = configStore.getConnection(id)
    if (!config) {
      throw new Error(`Connection not found: ${id}`)
    }

    // If already connected, do nothing
    if (this.pools.has(id)) {
      return
    }

    this.setStatus(id, { id, state: 'connecting' })

    try {
      const pool = this.createPool(config)
      // Verify the connection is actually reachable
      const conn = await pool.getConnection()
      conn.release()

      this.pools.set(id, pool)
      this.setStatus(id, { id, state: 'connected' })

      // Listen for pool errors (e.g. unexpected disconnects)
      pool.on('connection', () => {
        // connection established — no-op
      })
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      this.setStatus(id, { id, state: 'error', error })
      throw err
    }
  }

  /**
   * Deactivate a connection: drain and close the pool.
   */
  async deactivateConnection(id: string): Promise<void> {
    const pool = this.pools.get(id)
    if (!pool) {
      return
    }
    this.pools.delete(id)
    try {
      await pool.end()
    } catch {
      // Ignore errors during pool shutdown
    }
    this.setStatus(id, { id, state: 'disconnected' })
  }

  /**
   * Test a connection config without persisting it.
   * Resolves within 3 seconds with success/failure result.
   */
  async testConnection(config: ConnectionConfig): Promise<TestResult> {
    const start = Date.now()
    let pool: mysql2.Pool | null = null

    const timeout = new Promise<TestResult>((resolve) =>
      setTimeout(
        () =>
          resolve({
            success: false,
            error: 'Connection timed out after 3 seconds',
            errorCode: 'ETIMEDOUT',
            suggestions: [
              'Check that the host and port are correct',
              'Ensure the MySQL server is running and reachable',
              'Check firewall rules'
            ]
          }),
        3000
      )
    )

    const attempt = async (): Promise<TestResult> => {
      try {
        pool = this.createPool(config)
        const conn = await pool.getConnection()
        conn.release()
        const latency = Date.now() - start
        return { success: true, latency }
      } catch (err) {
        const mysqlErr = err as NodeJS.ErrnoException & { code?: string; errno?: number }
        const errorCode = mysqlErr.code ?? 'UNKNOWN'
        const error = mysqlErr.message ?? String(err)
        return {
          success: false,
          error,
          errorCode,
          suggestions: this.buildErrorSuggestions(errorCode)
        }
      } finally {
        if (pool) {
          try {
            await pool.end()
          } catch {
            // ignore
          }
        }
      }
    }

    return Promise.race([attempt(), timeout])
  }

  // ============================================================
  // Status management
  // ============================================================

  /** Return the current status for a connection. */
  getConnectionStatus(id: string): ConnectionStatus {
    return this.statuses.get(id) ?? { id, state: 'disconnected' }
  }

  /** Return statuses for all known connections. */
  getAllStatuses(): ConnectionStatus[] {
    return Array.from(this.statuses.values())
  }

  // ============================================================
  // Pool accessor (used by QueryExecutor)
  // ============================================================

  /** Get the active pool for a connection. Throws if not connected. */
  getPool(connectionId: string): mysql2.Pool {
    const pool = this.pools.get(connectionId)
    if (!pool) {
      throw new Error(`No active connection pool for id: ${connectionId}`)
    }
    return pool
  }

  // ============================================================
  // Export / Import
  // ============================================================

  /**
   * Export selected connections as a JSON string.
   * Password fields are redacted (replaced with empty string).
   */
  exportConnections(ids: string[]): string {
    const connections = configStore.getConnections()
    const selected = ids.length > 0 ? connections.filter((c) => ids.includes(c.id)) : connections

    const sanitized = selected.map((c) => {
      const exported: ConnectionConfig = {
        ...c,
        password: '' // redact password
      }
      // Redact SSH password as well
      if (exported.ssh?.password) {
        exported.ssh = { ...exported.ssh, password: '' }
      }
      return exported
    })

    return JSON.stringify({ version: 1, connections: sanitized }, null, 2)
  }

  /**
   * Import connections from a JSON string.
   * Assigns new IDs and timestamps to avoid collisions.
   * Returns the list of imported configs.
   */
  importConnections(json: string): ConnectionConfig[] {
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      throw new Error('Invalid JSON format')
    }

    // Support both { version, connections: [...] } and plain array
    let rawList: unknown[]
    if (Array.isArray(parsed)) {
      rawList = parsed
    } else if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'connections' in parsed &&
      Array.isArray((parsed as { connections: unknown }).connections)
    ) {
      rawList = (parsed as { connections: unknown[] }).connections
    } else {
      throw new Error('Invalid connections format: expected array or { connections: [...] }')
    }

    const now = Date.now()
    const imported: ConnectionConfig[] = []

    for (const raw of rawList) {
      if (!this.isValidConnectionConfig(raw)) {
        continue // skip invalid entries
      }
      const config: ConnectionConfig = {
        ...(raw as ConnectionConfig),
        id: uuidv4(), // always assign a new id
        createdAt: now,
        updatedAt: now,
        password: (raw as ConnectionConfig).password ?? '' // keep exported (possibly empty) password
      }
      configStore.saveConnection(config)
      this.statuses.set(config.id, { id: config.id, state: 'disconnected' })
      imported.push(config)
    }

    return imported
  }

  // ============================================================
  // Private helpers
  // ============================================================

  private createPool(config: ConnectionConfig): mysql2.Pool {
    return mysql2.createPool({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database,
      connectionLimit: 10,
      connectTimeout: 3000,
      ssl: config.ssl?.enabled
        ? {
            rejectUnauthorized: config.ssl.rejectUnauthorized ?? true,
            ca: config.ssl.ca,
            cert: config.ssl.cert,
            key: config.ssl.key
          }
        : undefined
    })
  }

  private setStatus(id: string, status: ConnectionStatus): void {
    this.statuses.set(id, status)
    this.notifyRenderer(status)
  }

  /** Broadcast connection status change to all renderer windows. */
  private notifyRenderer(status: ConnectionStatus): void {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC.CONNECTION_STATUS_CHANGED, status)
      }
    }
  }

  private buildErrorSuggestions(errorCode: string): string[] {
    const suggestions: string[] = []
    switch (errorCode) {
      case 'ECONNREFUSED':
        suggestions.push('Ensure the MySQL server is running on the specified host and port')
        suggestions.push('Check that the port number is correct (default: 3306)')
        break
      case 'ENOTFOUND':
      case 'EAI_AGAIN':
        suggestions.push('Check that the hostname is correct and DNS is resolving')
        break
      case 'ER_ACCESS_DENIED_ERROR':
        suggestions.push('Verify the username and password are correct')
        suggestions.push('Ensure the user has permission to connect from this host')
        break
      case 'ER_BAD_DB_ERROR':
        suggestions.push('The specified database does not exist')
        suggestions.push('Leave the database field empty to connect without selecting a database')
        break
      case 'ETIMEDOUT':
        suggestions.push('The server did not respond in time — check host, port and firewall rules')
        break
      default:
        suggestions.push('Check the host, port, username and password')
        suggestions.push('Ensure the MySQL server is running and accessible')
    }
    return suggestions
  }

  private isValidConnectionConfig(raw: unknown): boolean {
    if (raw === null || typeof raw !== 'object') return false
    const c = raw as Record<string, unknown>
    return (
      typeof c.name === 'string' &&
      typeof c.host === 'string' &&
      typeof c.port === 'number' &&
      typeof c.username === 'string'
    )
  }
}

// Export singleton accessor
export const connectionManager = ConnectionManager.getInstance()
export default connectionManager
