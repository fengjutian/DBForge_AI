// ============================================================
// SQLiteDialect - SQLite implementation (file-based)
// ============================================================

import type { DatabaseDialect, BackupParams, RestoreParams } from './DialectInterface'
import type { DatabaseSchema, ColumnMeta, QueryResult, ConnectionConfig, ViewInfo, IndexInfo, TriggerInfo } from '../../../shared/types'

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

    // ── Views ──
    const viewRows = db.prepare(
      "SELECT name, sql FROM sqlite_master WHERE type='view' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all() as { name: string; sql: string }[]
    const views: ViewInfo[] = viewRows.map(v => ({ name: v.name, definition: v.sql ?? undefined }))

    // ── Indexes ──
    const idxRows = db.prepare(
      "SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all() as { name: string; tbl_name: string; sql: string }[]
    const indexes: IndexInfo[] = idxRows.map(ix => {
      const isUnique = /\bUNIQUE\b/i.test(ix.sql ?? '')
      // Parse columns from: CREATE [UNIQUE] INDEX name ON table (col1, col2)
      const colMatch = (ix.sql ?? '').match(/\(([^)]+)\)/)
      const columns = colMatch ? colMatch[1].split(',').map(s => s.trim()) : []
      return { name: ix.name, tableName: ix.tbl_name, columns, unique: isUnique }
    })

    // ── Triggers ──
    const trigRows = db.prepare(
      "SELECT name, tbl_name, sql FROM sqlite_master WHERE type='trigger' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all() as { name: string; tbl_name: string; sql: string }[]
    const triggers: TriggerInfo[] = trigRows.map(tr => ({
      name: tr.name,
      tableName: tr.tbl_name,
      timing: /\bBEFORE\b/i.test(tr.sql ?? '') ? 'BEFORE' : (/\bINSTEAD OF\b/i.test(tr.sql ?? '') ? 'INSTEAD OF' : 'AFTER'),
      event: /\bINSERT\b/i.test(tr.sql ?? '') ? 'INSERT' : (/\bDELETE\b/i.test(tr.sql ?? '') ? 'DELETE' : 'UPDATE'),
      definition: tr.sql ?? undefined
    }))

    const result = { name: 'main', tables: [] as any[], views, indexes, triggers }

    // Try dbstat virtual table for per-table storage sizes
    let sizeMap = new Map<string, number>()
    try {
      // dbstat requires SQLITE_ENABLE_DBSTAT_VTAB compile option
      const sr = db.prepare(
        "SELECT name, SUM(pgsize) AS total_size FROM dbstat WHERE name NOT LIKE 'sqlite_%' GROUP BY name"
      ).all() as { name: string; total_size: number }[]
      for (const r of sr) sizeMap.set(r.name, r.total_size)
    } catch { /* dbstat not available */ }

    for (const t of tables) {
      const colQuery = 'PRAGMA table_info(' + JSON.stringify(t.name) + ')'
      const fkQuery = 'PRAGMA foreign_key_list(' + JSON.stringify(t.name) + ')'
      const cols = db.prepare(colQuery).all() as any[]
      const fks = db.prepare(fkQuery).all() as any[]

      // Accurate row count (full scan — fast for typical SQLite files)
      let rowCount: number | undefined
      try {
        rowCount = (db.prepare(`SELECT COUNT(*) AS cnt FROM "${t.name}"`).get() as { cnt: number }).cnt
      } catch { /* table might be locked or virtual */ }

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
        })),
        rowCount,
        dataSize: sizeMap.get(t.name)
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
