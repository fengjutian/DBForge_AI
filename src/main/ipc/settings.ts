import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type { AppConfig, IPCError, SqlSnippet } from '../../shared/types'
import configStore from '../services/ConfigStore'
import historyStore from '../services/HistoryStore'
import auditLog from '../services/AuditLog'
import snippetStore from '../services/SnippetStore'
import sessionManager from '../services/SessionManager'
import autoUpdater from '../services/AutoUpdater'
import connectionManager from '../services/ConnectionManager'

function wrapError(err: unknown): IPCError {
  const message = err instanceof Error ? err.message : String(err)
  return {
    code: 'IPC_ERROR',
    message,
    userMessage: message
  }
}

export function register(): void {
  // ── Settings ─────────────────────────────────────────────────

  ipcMain.handle(IPC.SETTINGS_GET, () => {
    try {
      return configStore.getAll()
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.SETTINGS_SET, (_event, partial: Partial<AppConfig>) => {
    try {
      for (const key of Object.keys(partial) as Array<keyof AppConfig>) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        configStore.set(key, (partial as any)[key])
      }
      return { success: true }
    } catch (err) {
      throw wrapError(err)
    }
  })

  // ── History ───────────────────────────────────────────────────

  ipcMain.handle(IPC.HISTORY_LIST, (_event, limit?: number) => {
    try {
      return historyStore.list(limit)
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.HISTORY_SEARCH, (_event, keyword: string, connectionId?: string) => {
    try {
      if (connectionId) {
        return historyStore.listByConnection(connectionId)
      }
      return historyStore.search(keyword)
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.HISTORY_CLEAR, () => {
    try {
      historyStore.clear()
      return { success: true }
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.HISTORY_DELETE, (_event, id: number) => {
    try {
      historyStore.deleteById(id)
      return { success: true }
    } catch (err) {
      throw wrapError(err)
    }
  })

  // ── Audit ─────────────────────────────────────────────────────

  ipcMain.handle(IPC.AUDIT_LIST, (_event, options?: { startTime?: number; endTime?: number; connectionId?: string }) => {
    try {
      return auditLog.list({
        connectionId: options?.connectionId,
        fromTime: options?.startTime,
        toTime: options?.endTime
      })
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.AUDIT_EXPORT, (_event, options?: { startTime?: number; endTime?: number; connectionId?: string }) => {
    try {
      return auditLog.exportCSV({
        connectionId: options?.connectionId,
        fromTime: options?.startTime,
        toTime: options?.endTime
      })
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.AUDIT_CLEAR_OLD, () => {
    try {
      const retentionDays = configStore.get('auditRetentionDays') ?? 90
      auditLog.purgeOlderThan(retentionDays)
      return { success: true }
    } catch (err) {
      throw wrapError(err)
    }
  })

  // ── Snippets ──────────────────────────────────────────────────

  ipcMain.handle(IPC.SNIPPET_LIST, () => {
    try {
      return snippetStore.list()
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.SNIPPET_CREATE, (_event, snippet: Omit<SqlSnippet, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      return snippetStore.create(snippet)
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.SNIPPET_UPDATE, (_event, snippet: SqlSnippet) => {
    try {
      const updated = snippetStore.update(snippet.id, snippet)
      if (!updated) throw new Error(`Snippet not found: ${snippet.id}`)
      return updated
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.SNIPPET_DELETE, (_event, id: number) => {
    try {
      const deleted = snippetStore.delete(id)
      return { success: deleted }
    } catch (err) {
      throw wrapError(err)
    }
  })

  // ── Schema ────────────────────────────────────────────────────

  ipcMain.handle(IPC.SCHEMA_FETCH, async (_event, connectionId: string) => {
    try {
      return await fetchSchema(connectionId)
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.SCHEMA_REFRESH, async (_event, connectionId: string) => {
    try {
      return await fetchSchema(connectionId)
    } catch (err) {
      throw wrapError(err)
    }
  })

  // ── Session ───────────────────────────────────────────────────

  ipcMain.handle(IPC.SESSION_EXTEND, () => {
    try {
      sessionManager.extendSession()
      return { success: true }
    } catch (err) {
      throw wrapError(err)
    }
  })

  // ── Auto-updater ──────────────────────────────────────────────

  ipcMain.handle(IPC.UPDATER_CHECK, async () => {
    try {
      await autoUpdater.checkForUpdates()
      return { success: true }
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.UPDATER_DOWNLOAD, async () => {
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.UPDATER_INSTALL, async () => {
    try {
      await autoUpdater.installUpdate()
      return { success: true }
    } catch (err) {
      throw wrapError(err)
    }
  })
}

// ── Schema fetch helper ───────────────────────────────────────

export async function fetchSchema(connectionId: string) {
  const pool = connectionManager.getPool(connectionId)

  // 1. All databases
  const [dbRows] = await pool.query<import('mysql2').RowDataPacket[]>(
    `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA ORDER BY SCHEMA_NAME`
  )
  const dbNames: string[] = dbRows.map(r => r['SCHEMA_NAME'])
  if (dbNames.length === 0) return { connectionId, databases: [], fetchedAt: Date.now() }

  const placeholders = dbNames.map(() => '?').join(',')

  // 2. All tables in one query
  const [tableRows] = await pool.query<import('mysql2').RowDataPacket[]>(
    `SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_ROWS
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA IN (${placeholders}) AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_SCHEMA, TABLE_NAME`,
    dbNames
  )

  // 3. All columns in one query
  const [colRows] = await pool.query<import('mysql2').RowDataPacket[]>(
    `SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE,
            COLUMN_DEFAULT, COLUMN_COMMENT, COLUMN_KEY
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA IN (${placeholders})
     ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION`,
    dbNames
  )

  // 4. All foreign keys in one query
  const [fkRows] = await pool.query<import('mysql2').RowDataPacket[]>(
    `SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME,
            REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
     FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA IN (${placeholders})
       AND REFERENCED_TABLE_NAME IS NOT NULL`,
    dbNames
  )

  // Build lookup maps
  type ColInfo = import('../../shared/types').ColumnInfo & { tableName: string; dbName: string; isPK: boolean }
  const colMap = new Map<string, ColInfo[]>()
  for (const col of colRows) {
    const key = `${col['TABLE_SCHEMA']}.${col['TABLE_NAME']}`
    if (!colMap.has(key)) colMap.set(key, [])
    colMap.get(key)!.push({
      dbName: col['TABLE_SCHEMA'],
      tableName: col['TABLE_NAME'],
      name: col['COLUMN_NAME'],
      type: col['COLUMN_TYPE'],
      nullable: col['IS_NULLABLE'] === 'YES',
      defaultValue: col['COLUMN_DEFAULT'] ?? undefined,
      comment: col['COLUMN_COMMENT'] || undefined,
      isPK: col['COLUMN_KEY'] === 'PRI'
    })
  }

  const fkMap = new Map<string, import('../../shared/types').ForeignKeyInfo[]>()
  for (const fk of fkRows) {
    const key = `${fk['TABLE_SCHEMA']}.${fk['TABLE_NAME']}`
    if (!fkMap.has(key)) fkMap.set(key, [])
    fkMap.get(key)!.push({
      columnName: fk['COLUMN_NAME'],
      referencedTable: fk['REFERENCED_TABLE_NAME'],
      referencedColumn: fk['REFERENCED_COLUMN_NAME']
    })
  }

  // Assemble result
  const dbMap = new Map<string, import('../../shared/types').DatabaseInfo>()
  for (const db of dbNames) dbMap.set(db, { name: db, tables: [] })

  for (const tableRow of tableRows) {
    const dbName: string = tableRow['TABLE_SCHEMA']
    const tableName: string = tableRow['TABLE_NAME']
    const key = `${dbName}.${tableName}`

    const cols = colMap.get(key) ?? []
    const columns: import('../../shared/types').ColumnInfo[] = cols.map(c => ({
      name: c.name, type: c.type, nullable: c.nullable,
      defaultValue: c.defaultValue, comment: c.comment
    }))
    const primaryKeys = cols.filter(c => c.isPK).map(c => c.name)
    const foreignKeys = fkMap.get(key) ?? []

    dbMap.get(dbName)?.tables.push({ name: tableName, columns, primaryKeys, foreignKeys, rowCount: tableRow['TABLE_ROWS'] ?? undefined })
  }

  return {
    connectionId,
    databases: dbNames.map(db => dbMap.get(db)!),
    fetchedAt: Date.now()
  }
}
