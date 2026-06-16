// ============================================================
// SQLiteDialect - SQLite implementation (file-based)
// ============================================================

import type { DatabaseDialect, BackupParams, RestoreParams } from './DialectInterface'
import type { DatabaseSchema, ColumnMeta, QueryResult, ConnectionConfig } from '../../../shared/types'

export class SQLiteDialect implements DatabaseDialect {
  readonly id = 'sqlite'

  readonly config = {
    type: 'sqlite' as const,
    defaultPort: 0,
    supportsSSL: false,
    supportsSchema: false,
    driverName: 'better-sqlite3',
    requiresDatabaseForConnect: true
  }

  getDefaultPort(): number { return 0 }

  createPool(config: ConnectionConfig): unknown {
    const Database = require('better-sqlite3')
    return new Database(config.database || ':memory:')
  }

  async executeQuery(pool: unknown, sql: string): Promise<QueryResult> {
    const db = pool as any
    const start = Date.now()
    const stmt = db.prepare(sql)
    const upper = sql.trim().toUpperCase()
    const isSelect = upper.startsWith('SELECT') || upper.startsWith('WITH')
    const rows: any[] = isSelect ? stmt.all() : []
    const cols: ColumnMeta[] = rows.length > 0
      ? Object.keys(rows[0]).map(k => ({ name: k, type: 'TEXT', nullable: true }))
      : []
    const info = isSelect ? undefined : stmt.run()
    return {
      columns: cols, rows: rows as Record<string, unknown>[],
      affectedRows: info?.changes, executionTime: Date.now() - start, sql
    }
  }

  async fetchSchema(pool: unknown, connectionId: string): Promise<DatabaseSchema> {
    const db = pool as any
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all() as { name: string }[]

    const result = { name: 'main', tables: [] as any[] }

    for (const t of tables) {
      const colQuery = 'PRAGMA table_info(' + JSON.stringify(t.name) + ')'
      const fkQuery = 'PRAGMA foreign_key_list(' + JSON.stringify(t.name) + ')'
      const cols = db.prepare(colQuery).all() as any[]
      const fks = db.prepare(fkQuery).all() as any[]

      result.tables.push({
        name: t.name,
        columns: cols.map(c => ({
          name: c.name, type: c.type,
          nullable: !c.notnull,
          defaultValue: c.dflt_value ?? undefined,
          comment: undefined
        })),
        primaryKeys: cols.filter(c => c.pk).map(c => c.name),
        foreignKeys: fks.map(f => ({
          columnName: f.from, referencedTable: f.table, referencedColumn: f.to
        }))
      })
    }

    return { connectionId, databases: [result], fetchedAt: Date.now() }
  }

  isReadOnlySQL(sql: string): boolean {
    const n = sql.trim().toUpperCase()
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/--[^\r\n]*/g, '')
      .replace(/\s+/g, ' ')
    return n.startsWith('SELECT') || n.startsWith('PRAGMA') ||
           n.startsWith('EXPLAIN') || n.startsWith('WITH') || n.startsWith('USE')
  }

  formatSQL(sql: string): string { return sql }

  getDefaultDumpArgs(params: BackupParams): string[] | null {
    return []
  }

  getDefaultRestoreArgs(params: RestoreParams): string[] | null {
    return []
  }

  buildErrorSuggestions(_errorCode: string): string[] {
    return ['Check SQLite DB file path is correct and file is accessible']
  }
}
