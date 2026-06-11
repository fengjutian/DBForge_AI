// ============================================================
// SQLServerDialect — Microsoft SQL Server skeleton
// ============================================================
// NOTE: Requires 'mssql' package (npm install mssql) to function.
// This skeleton shows the pattern for adding new databases.

import type { DatabaseDialect, BackupParams, RestoreParams } from './DialectInterface'
import type { DatabaseSchema, ColumnMeta, QueryResult, ConnectionConfig } from '../../../shared/types'

export class SQLServerDialect implements DatabaseDialect {
  readonly id = 'mssql'

  readonly config = {
    type: 'mssql' as const,
    defaultPort: 1433,
    supportsSSL: true,
    supportsSchema: true,
    driverName: 'mssql',
    requiresDatabaseForConnect: true
  }

  getDefaultPort(): number { return 1433 }

  createPool(_config: ConnectionConfig): unknown {
    throw new Error('SQL Server support requires installing "mssql" package: npm install mssql')
  }

  async executeQuery(_pool: unknown, _sql: string): Promise<QueryResult> {
    throw new Error('Not implemented — install mssql package')
  }

  async fetchSchema(_pool: unknown, connectionId: string): Promise<DatabaseSchema> {
    return { connectionId, databases: [], fetchedAt: Date.now() }
  }

  isReadOnlySQL(sql: string): boolean {
    const n = sql.trim().toUpperCase()
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\r\n]*/g, '').replace(/\s+/g, ' ')
    return n.startsWith('SELECT') || n.startsWith('EXEC') || n.startsWith('WITH')
  }

  formatSQL(sql: string): string {
    try { const { format } = require('sql-formatter'); return format(sql, { language: 'tsql', tabWidth: 2, keywordCase: 'upper' }) }
    catch { return sql }
  }

  getDefaultDumpArgs(_params: BackupParams): string[] | null { return null }

  getDefaultRestoreArgs(_params: RestoreParams): string[] | null { return null }

  buildErrorSuggestions(_errorCode: string): string[] {
    return ['Check SQL Server host, port, username, password and instance name']
  }
}
