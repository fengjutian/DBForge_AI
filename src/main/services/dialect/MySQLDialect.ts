// ============================================================
// MySQLDialect — MySQL / MariaDB implementation
// ============================================================

import mysql2 from 'mysql2/promise'
import type { DatabaseDialect, BackupParams, RestoreParams } from './DialectInterface'
import type { DatabaseSchema, ColumnMeta, QueryResult, ConnectionConfig } from '../../../shared/types'

export class MySQLDialect implements DatabaseDialect {
  readonly id = 'mysql'

  readonly config = {
    type: 'mysql' as const,
    defaultPort: 3306,
    supportsSSL: true,
    supportsSchema: false,
    driverName: 'mysql2',
    requiresDatabaseForConnect: false
  }

  getDefaultPort(): number { return 3306 }

  createPool(config: ConnectionConfig): unknown {
    return mysql2.createPool({
      host: config.host, port: config.port, user: config.username,
      password: config.password, database: config.database,
      charset: 'utf8mb4',
      connectionLimit: 10, connectTimeout: 3000,
      ssl: config.ssl?.enabled ? {
        rejectUnauthorized: config.ssl.rejectUnauthorized ?? true,
        ca: config.ssl.ca, cert: config.ssl.cert, key: config.ssl.key
      } : undefined
    })
  }

  async executeQuery(pool: unknown, sql: string, timeout = 30000): Promise<QueryResult> {
    const mysqlPool = pool as mysql2.Pool
    const start = Date.now()
    const conn = await mysqlPool.getConnection()
    try {
      const [rows, fields] = await conn.query({ sql, timeout } as any)
      const cols: { name: string; type: string; nullable: boolean }[] = (fields as any[])?.map(f => ({
        name: f.name, type: f.type !== undefined ? String(f.type) : 'UNKNOWN', nullable: true
      })) ?? []
      const resultRows: Record<string, unknown>[] = Array.isArray(rows) ? rows as Record<string, unknown>[] : []
      const affectedRows = !Array.isArray(rows) && (rows as any)?.affectedRows !== undefined ? (rows as any).affectedRows : undefined
      return { columns: cols, rows: resultRows, affectedRows, executionTime: Date.now() - start, sql }
    } finally { conn.release() }
  }

  async fetchSchema(pool: unknown, connectionId: string): Promise<DatabaseSchema> {
    const mysqlPool = pool as mysql2.Pool
    const q = async (sql: string, params?: any[]) => {
      const [r] = await mysqlPool.query(sql, params) as [any[], any]
      return r
    }
    const dbRows = await q("SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA ORDER BY SCHEMA_NAME")
    const dbNames: string[] = dbRows.map(r => r.SCHEMA_NAME)
    if (dbNames.length === 0) return { connectionId, databases: [], fetchedAt: Date.now() }

    const ph = dbNames.map(() => '?').join(',')
    const tables = await q("SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA IN (" + ph + ") AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_SCHEMA, TABLE_NAME", dbNames)
    const cols = await q("SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT, COLUMN_KEY FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA IN (" + ph + ") ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION", dbNames)
    const fks = await q("SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA IN (" + ph + ") AND REFERENCED_TABLE_NAME IS NOT NULL", dbNames)

    const colMap = new Map<string, any[]>()
    for (const c of cols) {
      const k = c.TABLE_SCHEMA + '.' + c.TABLE_NAME
      if (!colMap.has(k)) colMap.set(k, [])
      colMap.get(k)!.push(c)
    }
    const fkMap = new Map<string, any[]>()
    for (const f of fks) {
      const k = f.TABLE_SCHEMA + '.' + f.TABLE_NAME
      if (!fkMap.has(k)) fkMap.set(k, [])
      fkMap.get(k)!.push({ c: f.COLUMN_NAME, rt: f.REFERENCED_TABLE_NAME, rc: f.REFERENCED_COLUMN_NAME })
    }

    const dbMap = new Map<string, any>()
    for (const d of dbNames) dbMap.set(d, { name: d, tables: [] as any[] })

    for (const t of tables) {
      const key = t.TABLE_SCHEMA + '.' + t.TABLE_NAME
      const cCols = colMap.get(key) ?? []
      const tCols = cCols.map(c => ({ name: c.COLUMN_NAME, type: c.COLUMN_TYPE, nullable: c.IS_NULLABLE === 'YES', defaultValue: c.COLUMN_DEFAULT ?? undefined, comment: c.COLUMN_COMMENT || undefined }))
      const pks = cCols.filter(c => c.COLUMN_KEY === 'PRI').map(c => c.COLUMN_NAME)
      const tFks = (fkMap.get(key) ?? []).map(f => ({ columnName: f.c, referencedTable: f.rt, referencedColumn: f.rc }))
      const dataSize = (t.DATA_LENGTH != null || t.INDEX_LENGTH != null)
        ? ((t.DATA_LENGTH ?? 0) + (t.INDEX_LENGTH ?? 0)) || undefined
        : undefined
      dbMap.get(t.TABLE_SCHEMA)!.tables.push({ name: t.TABLE_NAME, columns: tCols, primaryKeys: pks, foreignKeys: tFks, rowCount: t.TABLE_ROWS ?? undefined, dataSize })
    }

    return { connectionId, databases: dbNames.map(d => dbMap.get(d)!), fetchedAt: Date.now() }
  }

  isReadOnlySQL(sql: string): boolean {
    const n = sql.trim().toUpperCase().replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\r\n]*/g, '').replace(/\s+/g, ' ')
    return n.startsWith('SELECT') || n.startsWith('SHOW') || n.startsWith('DESCRIBE') || n.startsWith('EXPLAIN') || n.startsWith('WITH') || n.startsWith('USE')
  }

  formatSQL(sql: string): string {
    try { const { format } = require('sql-formatter'); return format(sql, { language: 'mysql', tabWidth: 2, keywordCase: 'upper' }) }
    catch { return sql }
  }

  getDefaultDumpArgs(params: BackupParams): string[] | null {
    return [params.dumpPath || 'mysqldump', '-h', params.host, '-P', String(params.port), '-u', params.username, '-p' + params.password, '--single-transaction', '--routines', '--triggers', params.database]
  }

  getDefaultRestoreArgs(params: RestoreParams): string[] | null {
    return [params.restoreBinPath || 'mysql', '-h', params.host, '-P', String(params.port), '-u', params.username, '-p' + params.password, params.database]
  }

  buildErrorSuggestions(errorCode: string): string[] {
    const s: string[] = []
    switch (errorCode) {
      case 'ECONNREFUSED': s.push('Ensure MySQL server is running on the specified host:port'); break
      case 'ENOTFOUND': s.push('Check that the hostname is correct'); break
      case 'ER_ACCESS_DENIED_ERROR': s.push('Verify username and password are correct'); break
      case 'ER_BAD_DB_ERROR': s.push('The specified database does not exist'); break
      case 'ETIMEDOUT': s.push('Server did not respond in time — check host, port and firewall'); break
      default: s.push('Check host, port, username and password')
    }
    return s
  }
}
