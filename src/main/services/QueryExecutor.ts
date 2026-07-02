import type { DangerousCheckResult, QueryOptions, QueryResult } from '@dbforge/shared'
import configStore from './ConfigStore'
import connectionManager from './ConnectionManager'
import { getDialect } from './dialect/DialectInterface'

function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\r\n]*/g, ' ')
}
function normalizeSql(sql: string): string {
  return stripComments(sql).replace(/\s+/g, ' ').trim().toUpperCase()
}

export function isDangerous(sql: string): DangerousCheckResult {
  const normalized = normalizeSql(sql)
  const reasons: string[] = []
  if (/\bDROP\b/.test(normalized)) reasons.push('Contains DROP statement - may cause permanent data loss')
  if (/\bTRUNCATE\b/.test(normalized)) reasons.push('Contains TRUNCATE statement - will empty entire table')
  if (/\bDELETE\b/.test(normalized)) {
    const dm = normalized.match(/\bDELETE\b(.*)/)
    if (dm && !/\bWHERE\b/.test(dm[1])) reasons.push('DELETE without WHERE clause - will delete all rows')
  }
  return { isDangerous: reasons.length > 0, reasons }
}

class QueryExecutor {
  private static instance: QueryExecutor | null = null
  static getInstance(): QueryExecutor {
    if (!QueryExecutor.instance) QueryExecutor.instance = new QueryExecutor()
    return QueryExecutor.instance
  }

  async execute(options: QueryOptions): Promise<QueryResult> {
    const { connectionId, sql } = options
    const conn = connectionManager.getPool(connectionId)
    const dialect = conn.dialect
    const aiConfig = configStore.get('ai')

    if (aiConfig.mode === 'readonly' && !dialect.isReadOnlySQL(sql)) {
      throw new Error('Read-only mode: only SELECT/SHOW/DESCRIBE/EXPLAIN are allowed')
    }
    return dialect.executeQuery(conn.pool, sql, options.timeout, options.abortSignal)
  }
}

export const queryExecutor = QueryExecutor.getInstance()
export default queryExecutor
