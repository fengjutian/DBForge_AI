import type { FieldPacket, RowDataPacket } from 'mysql2'
import type { ColumnMeta, DangerousCheckResult, QueryOptions, QueryResult } from '../../shared/types'
import configStore from './ConfigStore'
import connectionManager from './ConnectionManager'

// ============================================================
// QueryExecutor — singleton
// ============================================================

/**
 * Strip SQL comments and normalize whitespace for pattern matching.
 * Handles both -- line comments and /* block comments *\/
 */
function stripComments(sql: string): string {
  // Remove block comments /* ... */
  let result = sql.replace(/\/\*[\s\S]*?\*\//g, ' ')
  // Remove line comments -- ...
  result = result.replace(/--[^\r\n]*/g, ' ')
  return result
}

/**
 * Normalize SQL for analysis: strip comments, collapse whitespace, uppercase.
 */
function normalizeSql(sql: string): string {
  return stripComments(sql).replace(/\s+/g, ' ').trim().toUpperCase()
}

/**
 * Pure function: check whether a SQL statement is potentially dangerous.
 * Handles case variants, extra whitespace, and SQL comments.
 */
export function isDangerous(sql: string): DangerousCheckResult {
  const normalized = normalizeSql(sql)
  const reasons: string[] = []

  // Check for DROP statements
  if (/\bDROP\b/.test(normalized)) {
    reasons.push('包含 DROP 语句，可能导致数据永久丢失')
  }

  // Check for TRUNCATE statements
  if (/\bTRUNCATE\b/.test(normalized)) {
    reasons.push('包含 TRUNCATE 语句，将清空整张表')
  }

  // Check for DELETE without WHERE clause
  // Match DELETE ... FROM ... (no WHERE) or DELETE FROM ... (no WHERE)
  if (/\bDELETE\b/.test(normalized)) {
    // Extract the portion after DELETE to check for WHERE
    const deleteMatch = normalized.match(/\bDELETE\b(.*)/)
    if (deleteMatch) {
      const afterDelete = deleteMatch[1]
      if (!/\bWHERE\b/.test(afterDelete)) {
        reasons.push('DELETE 语句缺少 WHERE 子句，将删除所有行')
      }
    }
  }

  return {
    isDangerous: reasons.length > 0,
    reasons
  }
}

/**
 * Determine if a SQL statement is a SELECT query (read-only).
 * Strips comments and leading whitespace before checking.
 */
function isSelectStatement(sql: string): boolean {
  const normalized = normalizeSql(sql)
  return normalized.startsWith('SELECT') || normalized.startsWith('SHOW') || normalized.startsWith('DESCRIBE') || normalized.startsWith('EXPLAIN')
}

class QueryExecutor {
  private static instance: QueryExecutor | null = null

  private constructor() {}

  static getInstance(): QueryExecutor {
    if (!QueryExecutor.instance) {
      QueryExecutor.instance = new QueryExecutor()
    }
    return QueryExecutor.instance
  }

  /**
   * Execute a SQL query against the specified connection pool.
   * Supports timeout (default 30s) and cancellation via AbortSignal.
   * In readonly mode, only SELECT/SHOW/DESCRIBE/EXPLAIN statements are allowed.
   */
  async execute(options: QueryOptions): Promise<QueryResult> {
    const { connectionId, sql, timeout = 30000, abortSignal } = options

    // Check readonly mode
    const aiConfig = configStore.get('ai')
    if (aiConfig.mode === 'readonly' && !isSelectStatement(sql)) {
      throw new Error('只读模式下仅允许执行 SELECT、SHOW、DESCRIBE、EXPLAIN 语句')
    }

    // Check if already aborted before starting
    if (abortSignal?.aborted) {
      throw new Error('查询已被取消')
    }

    const pool = connectionManager.getPool(connectionId)
    const startTime = Date.now()

    // Build the execution promise
    const executePromise = async (): Promise<QueryResult> => {
      const connection = await pool.getConnection()
      try {
        // Wire up abort signal to kill the query
        let abortHandler: (() => void) | null = null
        if (abortSignal) {
          abortHandler = () => {
            connection.destroy()
          }
          abortSignal.addEventListener('abort', abortHandler, { once: true })
        }

        try {
          const [rows, fields] = await connection.query<RowDataPacket[]>(sql)
          const executionTime = Date.now() - startTime

          // Build column metadata from field packets
          const columns: ColumnMeta[] = (fields as FieldPacket[]).map((f) => ({
            name: f.name,
            type: f.type !== undefined ? String(f.type) : 'UNKNOWN',
            nullable: true // mysql2 FieldPacket doesn't expose nullable directly
          }))

          // Determine affectedRows for DML statements
          const resultMeta = rows as unknown as { affectedRows?: number }
          const affectedRows =
            !Array.isArray(rows) && resultMeta.affectedRows !== undefined
              ? resultMeta.affectedRows
              : Array.isArray(rows)
                ? undefined
                : undefined

          const resultRows: Record<string, unknown>[] = Array.isArray(rows)
            ? (rows as RowDataPacket[]).map((row) => row as Record<string, unknown>)
            : []

          return {
            columns,
            rows: resultRows,
            affectedRows,
            executionTime,
            sql
          }
        } finally {
          if (abortHandler && abortSignal) {
            abortSignal.removeEventListener('abort', abortHandler)
          }
        }
      } finally {
        try {
          connection.release()
        } catch {
          // ignore release errors after destroy
        }
      }
    }

    // Start execution once, share the promise
    const executionPromise = executePromise()

    // Build timeout promise that cleans up after execution
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`查询超时（超过 ${timeout / 1000} 秒），请优化 SQL 或增加超时时间`))
      }, timeout)
      // Clean up timer when execution settles
      executionPromise.then(
        () => clearTimeout(timer),
        () => clearTimeout(timer)
      )
    })

    // Build abort promise
    const abortPromise = abortSignal
      ? new Promise<never>((_, reject) => {
          if (abortSignal.aborted) {
            reject(new Error('查询已被取消'))
            return
          }
          abortSignal.addEventListener(
            'abort',
            () => reject(new Error('查询已被取消')),
            { once: true }
          )
        })
      : null

    const racers: Promise<QueryResult | never>[] = [executionPromise, timeoutPromise]
    if (abortPromise) {
      racers.push(abortPromise)
    }

    return Promise.race(racers)
  }
}

export const queryExecutor = QueryExecutor.getInstance()
export default queryExecutor
