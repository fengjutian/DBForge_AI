// ============================================================
// OracleDialect — Oracle Database skeleton
// ============================================================
// NOTE: Requires 'oracledb' package to function.
// This skeleton shows the pattern for adding Oracle support.

import type { DatabaseDialect, BackupParams, RestoreParams } from './DialectInterface'
import type { DatabaseSchema, ColumnMeta, QueryResult, ConnectionConfig } from '@dbforge/shared'

export class OracleDialect implements DatabaseDialect {
  readonly id = 'oracle'

  readonly config = {
    type: 'oracle' as const,
    defaultPort: 1521,
    supportsSSL: true,
    supportsSchema: true,
    driverName: 'oracledb',
    requiresDatabaseForConnect: true
  }

  getDefaultPort(): number { return 1521 }

  createPool(_config: ConnectionConfig): unknown {
    throw new Error('Oracle support requires "oracledb" package. See: https://oracle.github.io/node-oracledb/')
  }

  async executeQuery(_pool: unknown, _sql: string): Promise<QueryResult> {
    throw new Error('Not implemented — install oracledb package')
  }

  async fetchSchema(_pool: unknown, connectionId: string): Promise<DatabaseSchema> {
    return { connectionId, databases: [], fetchedAt: Date.now() }
  }

  isReadOnlySQL(sql: string): boolean {
    const n = sql.trim().toUpperCase()
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\r\n]*/g, '').replace(/\s+/g, ' ')
    return n.startsWith('SELECT') || n.startsWith('WITH')
  }

  formatSQL(sql: string): string {
    try { const { format } = require('sql-formatter'); return format(sql, { language: 'plsql', tabWidth: 2, keywordCase: 'upper' }) }
    catch { return sql }
  }

  getDefaultDumpArgs(_params: BackupParams): string[] | null { return null }

  getDefaultRestoreArgs(_params: RestoreParams): string[] | null { return null }

  buildErrorSuggestions(_errorCode: string): string[] {
    return ['Check Oracle host, port, SID/Service Name, username and password']
  }
}
