import { BrowserWindow } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import type { ConnectionConfig, ConnectionStatus, TestResult } from '../../shared/types'
import { IPC } from '../../shared/ipc-channels'
import configStore from './ConfigStore'
import { getDialect, type DatabaseDialect } from './dialect/DialectInterface'

// ============================================================
// ConnectionManager — singleton
// ============================================================

interface ActiveConnection {
  config: ConnectionConfig
  pool: unknown
  dialect: DatabaseDialect
}

class ConnectionManager {
  private static instance: ConnectionManager | null = null

  /** Active connections, keyed by connection id */
  private connections: Map<string, ActiveConnection> = new Map()

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

  listConnections(): ConnectionConfig[] { return configStore.getConnections() }

  getConnection(id: string): ConnectionConfig | undefined {
    return configStore.getConnection(id)
  }

  createConnection(config: Omit<ConnectionConfig, 'id' | 'createdAt' | 'updatedAt'>): ConnectionConfig {
    const now = Date.now()
    // Default databaseType to mysql for backward compatibility
    const full: ConnectionConfig = {
      ...config,
      databaseType: config.databaseType || 'mysql',
      id: uuidv4(),
      createdAt: now,
      updatedAt: now
    }
    // If port not specified, use dialect default
    if (!full.port) {
      const dialect = getDialect(full.databaseType)
      if (dialect) full.port = dialect.getDefaultPort()
    }
    configStore.saveConnection(full)
    this.statuses.set(full.id, { id: full.id, state: 'disconnected' })
    return full
  }

  updateConnection(id: string, updates: Partial<Omit<ConnectionConfig, 'id' | 'createdAt'>>): ConnectionConfig {
    const existing = configStore.getConnection(id)
    if (!existing) throw new Error(`Connection not found: ${id}`)
    const updated: ConnectionConfig = {
      ...existing,
      ...updates,
      id,
      databaseType: updates.databaseType || existing.databaseType || 'mysql',
      createdAt: existing.createdAt,
      updatedAt: Date.now()
    }
    configStore.saveConnection(updated)
    return updated
  }

  async deleteConnection(id: string): Promise<void> {
    await this.deactivateConnection(id)
    configStore.deleteConnection(id)
    this.statuses.delete(id)
  }

  // ============================================================
  // Connection lifecycle
  // ============================================================

  async activateConnection(id: string): Promise<void> {
    const config = configStore.getConnection(id)
    if (!config) throw new Error(`Connection not found: ${id}`)

    const dialect = getDialect(config.databaseType || 'mysql')
    if (!dialect) throw new Error(`Unsupported database type: ${config.databaseType || 'mysql'}`)

    this.setStatus(id, { id, state: 'connecting' })
    try {
      const pool = dialect.createPool(config)
      // Verify connection
      await dialect.executeQuery(pool, dialect.id === 'postgresql' ? 'SELECT 1' : 'SELECT 1')
      this.connections.set(id, { config, pool, dialect })
      this.setStatus(id, { id, state: 'connected' })
    } catch (err) {
      this.setStatus(id, { id, state: 'error', error: String(err) })
      throw err
    }
  }

  async deactivateConnection(id: string): Promise<void> {
    const conn = this.connections.get(id)
    if (!conn) return
    this.connections.delete(id)
    const dialect = conn.dialect
    try {
      const pool = conn.pool as any
      if (pool?.end) await pool.end()
      else if (pool?.close) await pool.close()
    } catch { /* ignore */ }
    this.setStatus(id, { id, state: 'disconnected' })
  }

  async testConnection(config: ConnectionConfig): Promise<TestResult> {
    const start = Date.now()
    const dialect = getDialect(config.databaseType || 'mysql')
    if (!dialect) throw new Error(`Unsupported database type: ${config.databaseType || 'mysql'}`)

    try {
      const pool = dialect.createPool(config)
      await dialect.executeQuery(pool, dialect.id === 'postgresql' ? 'SELECT 1' : 'SELECT 1')
      const p = pool as any
      if (p?.end) await p.end()
      else if (p?.close) await p.close()
      return { success: true, latency: Date.now() - start }
    } catch (err: any) {
      const msg = err?.message ?? String(err)
      const code = err?.code ?? ''
      return { success: false, error: msg, errorCode: code, suggestions: dialect.buildErrorSuggestions(code), latency: Date.now() - start }
    }
  }

  getConnectionStatus(id: string): ConnectionStatus | undefined {
    return this.statuses.get(id)
  }

  // ============================================================
  // Pool access for query/schema operations
  // ============================================================

  getPool(connectionId: string): ActiveConnection {
    const conn = this.connections.get(connectionId)
    if (!conn) throw new Error(`No active connection pool for id: ${connectionId}`)
    return conn
  }

  getDialect(connectionId: string): DatabaseDialect {
    return this.getPool(connectionId).dialect
  }

  getConnectionConfig(connectionId: string): ConnectionConfig {
    return this.getPool(connectionId).config
  }

  // ============================================================
  // Export / Import
  // ============================================================

  exportConnections(ids: string[]): string {
    const connections = ids.map(id => configStore.getConnection(id)).filter(Boolean) as ConnectionConfig[]
    const safeExport = connections.map(c => ({ ...c, password: '', ssl: c.ssl?.enabled ? { enabled: true } : undefined }))
    return JSON.stringify({ connections: safeExport }, null, 2)
  }

  importConnections(json: string): ConnectionConfig[] {
    let rawList: unknown[] | undefined
    try {
      const parsed = JSON.parse(json)
      if (Array.isArray(parsed)) rawList = parsed
      else if (Array.isArray((parsed as any)?.connections)) rawList = (parsed as any).connections
      else throw new Error('Invalid connections format')
    } catch { throw new Error('Invalid JSON format') }

    const now = Date.now()
    const imported: ConnectionConfig[] = []
    for (const raw of rawList ?? []) {
      if (!this.isValidConnectionConfig(raw)) continue
      const config: ConnectionConfig = {
        ...(raw as ConnectionConfig),
        databaseType: (raw as any).databaseType || 'mysql',
        id: uuidv4(), createdAt: now, updatedAt: now,
        password: (raw as ConnectionConfig).password ?? ''
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

  private setStatus(id: string, status: ConnectionStatus): void {
    this.statuses.set(id, status)
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.CONNECTION_STATUS_CHANGED, status)
    }
  }

  private isValidConnectionConfig(raw: unknown): boolean {
    if (!raw || typeof raw !== 'object') return false
    const c = raw as Record<string, unknown>
    return typeof c.name === 'string' && typeof c.host === 'string' && typeof c.port === 'number' && typeof c.username === 'string'
  }
}

export const connectionManager = ConnectionManager.getInstance()
export default connectionManager
