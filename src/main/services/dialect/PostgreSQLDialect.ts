// ============================================================
// PostgreSQLDialect - PostgreSQL implementation
// ============================================================

import type { DatabaseDialect, BackupParams, RestoreParams } from './DialectInterface'
import type { DatabaseSchema, ColumnMeta, QueryResult, ConnectionConfig } from '../../../shared/types'

function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\r\n]*/g, ' ')
}

function normalizeSql(sql: string): string {
  return stripComments(sql).replace(/\s+/g, ' ').trim().toUpperCase()
}

export class PostgreSQLDialect implements DatabaseDialect {
  readonly id = 'postgresql'

  readonly config = {
    type: 'postgresql' as const,
    defaultPort: 5432,
    supportsSSL: true,
    supportsSchema: true,
    driverName: 'pg',
    requiresDatabaseForConnect: true
  }

  getDefaultPort(): number { return 5432 }

  createPool(config: ConnectionConfig): unknown {
    const { Pool } = require('pg')
    return new Pool({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database || 'postgres',
      max: 10,
      connectionTimeoutMillis: 3000,
      ssl: config.ssl?.enabled ? { rejectUnauthorized: config.ssl.rejectUnauthorized ?? true } : undefined
    })
  }

  async executeQuery(pool: unknown, sql: string): Promise<QueryResult> {
    const pgPool = pool as import('pg').Pool
    const start = Date.now()
    const client = await pgPool.connect()
    try {
      const res = await client.query({ text: sql, rowMode: 'array' })
      const cols: ColumnMeta[] = res.fields.map(f => ({
        name: f.name, type: (f as any).dataTypeID ? String((f as any).dataTypeID) : 'UNKNOWN', nullable: true
      }))
      const rows: Record<string, unknown>[] = (res.rows as unknown[][]).map((row, ri) => {
        const obj: Record<string, unknown> = {}
        for (let i = 0; i < res.fields.length; i++) {
          obj[res.fields[i].name] = row[i]
        }
        return obj
      })
      const affectedRows = (res as any).rowCount !== undefined && res.command !== 'SELECT' ? (res as any).rowCount : undefined
      return { columns: cols, rows, affectedRows, executionTime: Date.now() - start, sql }
    } finally { client.release() }
  }

  async fetchSchema(pool: unknown, connectionId: string): Promise<DatabaseSchema> {
    const pgPool = pool as import('pg').Pool
    const q = async (sql: string) => { const r = await pgPool.query(sql); return r.rows }
    const dbRows: any[] = await q(`SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname`)
    const dbNames: string[] = dbRows.map(r => r.datname)
    if (dbNames.length === 0) return { connectionId, databases: [], fetchedAt: Date.now() }

    const cols: any[] = await q(
      `SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default, udt_name FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema, table_name, ordinal_position`
    )
    const fks: any[] = await q(
      `SELECT tc.table_schema, tc.table_name, kcu.column_name, ccu.table_schema AS ref_schema, ccu.table_name AS ref_table, ccu.column_name AS ref_column FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema NOT IN ('pg_catalog','information_schema')`
    )
    // Proper PK detection via information_schema
    const pks: any[] = await q(
      `SELECT kcu.table_schema, kcu.table_name, kcu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema NOT IN ('pg_catalog','information_schema')`
    )

    // Table sizes and row estimates
    const sizes: any[] = await q(
      `SELECT schemaname, tablename,
              pg_total_relation_size('"'||schemaname||'"."'||tablename||'"')::bigint AS size_bytes,
              COALESCE(c.reltuples, 0)::bigint AS row_estimate
       FROM pg_tables t
       LEFT JOIN pg_class c ON c.oid = ('"'||t.schemaname||'"."'||t.tablename||'"')::regclass
       WHERE t.schemaname NOT IN ('pg_catalog','information_schema')`
    )
    const sizeMap = new Map<string, number>()
    const rowEstMap = new Map<string, number>()
    for (const s of sizes) {
      sizeMap.set(`${s.schemaname}.${s.tablename}`, Number(s.size_bytes))
      if (s.row_estimate > 0) rowEstMap.set(`${s.schemaname}.${s.tablename}`, Number(s.row_estimate))
    }

    const colMap = new Map<string, any[]>()
    for (const c of cols) {
      const k = `${c.table_schema}.${c.table_name}`
      if (!colMap.has(k)) colMap.set(k, [])
      colMap.get(k)!.push(c)
    }
    const fkMap = new Map<string, any[]>()
    for (const f of fks) {
      const k = `${f.table_schema}.${f.table_name}`
      if (!fkMap.has(k)) fkMap.set(k, [])
      fkMap.get(k)!.push(f)
    }

    const pkMap = new Map<string, Set<string>>()
    for (const pk of pks) {
      const k = `${pk.table_schema}.${pk.table_name}`
      if (!pkMap.has(k)) pkMap.set(k, new Set())
      pkMap.get(k)!.add(pk.column_name)
    }

    const tablesBySchema = new Map<string, string[]>()
    for (const c of cols) {
      const k = c.table_schema
      if (!tablesBySchema.has(k)) tablesBySchema.set(k, [])
      const tables = tablesBySchema.get(k)!
      if (!tables.includes(c.table_name)) tables.push(c.table_name)
    }

    return {
      connectionId,
      databases: Array.from(tablesBySchema.entries()).map(([schema, tableNames]) => ({
        name: schema,
        tables: tableNames.map(tn => {
          const key = `${schema}.${tn}`
          const cCols = colMap.get(key) ?? []
          const tableCols = cCols.map(c => ({
            name: c.column_name, type: c.udt_name || c.data_type,
            nullable: c.is_nullable === 'YES',
            defaultValue: c.column_default ?? undefined, comment: undefined
          }))
          const pkCols = Array.from(pkMap.get(key) ?? [])
          const tableFKs = (fkMap.get(key) ?? []).map(f => ({
            columnName: f.column_name,
            referencedTable: `${f.ref_schema}.${f.ref_table}`,
            referencedColumn: f.ref_column
          }))
          return { name: tn, columns: tableCols, primaryKeys: pkCols, foreignKeys: tableFKs, rowCount: rowEstMap.get(key), dataSize: sizeMap.get(key) }
        })
      })),
      fetchedAt: Date.now()
    }
  }

  isReadOnlySQL(sql: string): boolean {
    const n = normalizeSql(sql)
    const writePattern = /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|REPLACE|GRANT|REVOKE|LOCK)\b/i
    if (writePattern.test(n)) return false
    return n.startsWith('SELECT') || n.startsWith('SHOW') || n.startsWith('EXPLAIN') || n.startsWith('WITH') || n.startsWith('SET')
  }

  formatSQL(sql: string): string {
    try {
      const { format } = require('sql-formatter')
      return format(sql, { language: 'postgresql', tabWidth: 2, keywordCase: 'upper' })
    } catch { return sql }
  }

  getDefaultDumpArgs(params: BackupParams): string[] | null {
    const pgDumpPath = params.dumpPath || 'pg_dump'
    const args = [pgDumpPath, '-h', params.host, '-p', String(params.port), '-U', params.username, '--no-password']
    if (params.compress) args.push('-Z', '9')
    // Use PGPASSWORD env var instead of command-line password
    return args
  }

  getDefaultRestoreArgs(params: RestoreParams): string[] | null {
    const psqlPath = params.restoreBinPath || 'psql'
    return [psqlPath, '-h', params.host, '-p', String(params.port), '-U', params.username, '-d', params.database, '-f', params.inputPath]
  }

  buildErrorSuggestions(errorCode: string): string[] {
    const s: string[] = []
    switch (errorCode) {
      case 'ECONNREFUSED':
        s.push('Ensure the PostgreSQL server is running on the specified host and port')
        break
      case 'ENOTFOUND': s.push('Check the hostname is correct'); break
      case '28P01': // invalid password
        s.push('Verify the username and password are correct')
        break
      case '3D000': // database does not exist
        s.push('The specified database does not exist')
        break
      default:
        s.push('Check the host, port, username, password and database name')
    }
    return s
  }
}
