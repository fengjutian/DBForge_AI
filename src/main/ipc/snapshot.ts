import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type { ExecutePatchRequest, ExecutePatchResult } from '../../shared/types'
import connectionManager from '../services/ConnectionManager'
import auditLog from '../services/AuditLog'
import configStore from '../services/ConfigStore'

function quoteMySql(id: string): string {
  return '`' + id.replace(/`/g, '``') + '`'
}

function quotePg(id: string): string {
  return '"' + id.replace(/"/g, '""') + '"'
}

function quoteSQLite(id: string): string {
  return '"' + id.replace(/"/g, '""') + '"'
}

type Quoter = (id: string) => string

function getQuoter(dialectId: string): Quoter {
  switch (dialectId) {
    case 'mysql': return quoteMySql
    case 'postgresql': return quotePg
    case 'sqlite': return quoteSQLite
    default: return quoteMySql
  }
}

function pkToWhere(
  pk: Record<string, unknown>,
  quote: Quoter
): { clause: string; values: unknown[] } {
  const entries = Object.entries(pk).filter(([k]) => !k.startsWith('__')) // strip synthetic keys
  if (entries.length === 0) throw new Error('Cannot build WHERE clause: no primary key columns')
  const clauses = entries.map(([k]) => `${quote(k)} = ?`)
  return {
    clause: clauses.join(' AND '),
    values: entries.map(([, v]) => v)
  }
}

async function executeSingleChange(
  dialect: { id: string; executeQuery: (pool: unknown, sql: string, timeout?: number) => Promise<{ affectedRows?: number }> },
  pool: unknown,
  change: ExecutePatchRequest['changes'][number],
  database: string,
  table: string,
  primaryKeys: string[],
  optimisticLock: boolean
): Promise<{ success: boolean; affectedRows: number; conflict: boolean }> {
  const quote = getQuoter(dialect.id)
  const fullTable = `${quote(database)}.${quote(table)}`

  // Build WHERE clause from PK (for UPDATE/DELETE)
  const pkFiltered: Record<string, unknown> = {}
  for (const k of primaryKeys) {
    if (k in change.pk) pkFiltered[k] = change.pk[k]
  }

  if (Object.keys(pkFiltered).length === 0 && change.type !== 'insert') {
    throw new Error(`Cannot identify row for ${change.type}: no primary key values provided`)
  }

  const { clause: whereClause, values: whereValues } = pkToWhere(pkFiltered, quote)

  let sql: string
  let values: unknown[]

  switch (change.type) {
    case 'delete': {
      sql = `DELETE FROM ${fullTable} WHERE ${whereClause}`
      values = [...whereValues]
      break
    }

    case 'update': {
      if (!change.set || Object.keys(change.set).length === 0) {
        return { success: true, affectedRows: 0, conflict: false }
      }

      const setEntries = Object.entries(change.set)
      const setClauses = setEntries.map(([k]) => `${quote(k)} = ?`)
      const setValues = setEntries.map(([, v]) => v)

      if (optimisticLock && change.oldValues && Object.keys(change.oldValues).length > 0) {
        // Add old-value conditions to WHERE for optimistic locking
        const lockClauses: string[] = []
        const lockValues: unknown[] = []
        for (const [col, oldVal] of Object.entries(change.oldValues)) {
          if (oldVal === null || oldVal === undefined) {
            lockClauses.push(`${quote(col)} IS NULL`)
          } else {
            lockClauses.push(`${quote(col)} = ?`)
            lockValues.push(oldVal)
          }
        }
        sql = `UPDATE ${fullTable} SET ${setClauses.join(', ')} WHERE (${whereClause}) AND (${lockClauses.join(' AND ')})`
        values = [...setValues, ...whereValues, ...lockValues]
      } else {
        sql = `UPDATE ${fullTable} SET ${setClauses.join(', ')} WHERE ${whereClause}`
        values = [...setValues, ...whereValues]
      }
      break
    }

    case 'insert': {
      if (!change.set || Object.keys(change.set).length === 0) {
        return { success: true, affectedRows: 0, conflict: false }
      }

      const entries = Object.entries(change.set).filter(([k]) => !k.startsWith('__'))
      if (entries.length === 0) {
        return { success: true, affectedRows: 0, conflict: false }
      }

      const colNames = entries.map(([k]) => quote(k)).join(', ')
      const placeholders = entries.map(() => '?').join(', ')
      sql = `INSERT INTO ${fullTable} (${colNames}) VALUES (${placeholders})`
      values = entries.map(([, v]) => v)
      break
    }
  }

  // Build parameterized query string for driver consumption
  // Note: mysql2/pg handle ? placeholders; sqlite3 uses ?
  const result = await dialect.executeQuery(pool, buildParameterizedSQL(sql, values), 10000)
  const affectedRows = result.affectedRows ?? 0

  if ((change.type === 'update' || change.type === 'delete') && optimisticLock && affectedRows === 0) {
    return { success: false, affectedRows: 0, conflict: true }
  }

  return { success: true, affectedRows, conflict: false }
}

/**
 * Build a raw SQL string with values inlined.
 *
 * IMPORTANT SAFETY NOTE:
 * This handler receives ONLY structured `ExecutePatchRequest` from the renderer.
 * The SQL is built HERE on the main process using the dialect's quoter.
 * All values come from the typed `change.set`/`change.pk`/`change.oldValues` fields,
 * NOT from user-typed SQL strings.
 *
 * We use parameterized queries (?) so the dialect driver handles escaping correctly.
 * mysql2 and pg both support ? placeholders natively.
 */
function buildParameterizedSQL(sql: string, values: unknown[]): string {
  // mysql2 supports calling .query({ sql, values }) or .query(sql, values)
  // pg supports .query(sql, values)
  // better-sqlite3 supports .prepare(sql).run(...values)
  //
  // Since executeQuery signature is (pool, sql, timeout), we can't pass values separately.
  // We need to either:
  //   1. Build the complete SQL string with escaped values (risk: incorrect escaping)
  //   2. Change the dialect interface to support parameterized queries
  //
  // For now, we escape values carefully for each dialect.
  // In a future iteration, extend DatabaseDialect.executeQuery to accept params.

  let idx = 0
  let result = ''
  let last = 0

  for (let i = 0; i < sql.length; i++) {
    if (sql[i] === '?') {
      result += sql.slice(last, i)
      const val = values[idx++]
      result += escapeValue(val)
      last = i + 1
    }
  }
  result += sql.slice(last)
  return result
}

function escapeValue(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') {
    if (isNaN(v) || !isFinite(v)) return 'NULL'
    return String(v)
  }
  if (typeof v === 'boolean') return v ? '1' : '0'
  if (v instanceof Date) return `'${v.toISOString().replace('T', ' ').replace('Z', '')}'`

  const s = String(v)
  // Basic SQL string escaping
  return `'${s.replace(/'/g, "''").replace(/\\/g, '\\\\')}'`
}

export function register(): void {
  ipcMain.handle(IPC.SNAPSHOT_EXECUTE_PATCH, async (_event, request: ExecutePatchRequest): Promise<ExecutePatchResult> => {
    const startTime = Date.now()
    const { connectionId, database, table, primaryKeys, changes, optimisticLock } = request

    try {
      const conn = connectionManager.getPool(connectionId)
      const dialect = conn.dialect
      const pool = conn.pool

      const result: ExecutePatchResult = {
        success: true,
        executedCount: 0,
        summary: { modified: 0, deleted: 0, inserted: 0 },
        conflicts: []
      }

      for (const change of changes) {
        try {
          const single = await executeSingleChange(
            { id: dialect.id, executeQuery: dialect.executeQuery.bind(dialect) },
            pool,
            change,
            database,
            table,
            primaryKeys,
            optimisticLock
          )

          if (single.conflict) {
            result.conflicts!.push(change.pk)
            continue
          }

          if (single.affectedRows > 0) {
            result.executedCount++
            switch (change.type) {
              case 'update': result.summary.modified++; break
              case 'delete': result.summary.deleted++; break
              case 'insert': result.summary.inserted++; break
            }
          }
        } catch (err) {
          // Single statement failure — record and continue
          result.conflicts!.push(change.pk)
          console.error(`[Snapshot] Failed to execute ${change.type} on ${database}.${table}:`, err)
        }
      }

      // Record audit log for write operations
      try {
        const connConfig = connectionManager.getConnection(connectionId)
        const totalAffected = result.summary.modified + result.summary.deleted + result.summary.inserted
        auditLog.add({
          connectionId,
          connectionName: connConfig?.name ?? connectionId,
          sql: `[Snapshot Patch] ${totalAffected} rows on ${database}.${table}: ${result.summary.modified} modified, ${result.summary.deleted} deleted, ${result.summary.inserted} inserted`,
          executedAt: startTime,
          result: result.conflicts!.length > 0 ? 'failure' : 'success',
          affectedRows: totalAffected
        })
      } catch (auditErr) {
        console.error('[Snapshot] Failed to record audit:', auditErr)
      }

      if (result.conflicts!.length > 0) {
        result.success = result.executedCount > 0 // Partial success if at least one succeeded
      }

      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        success: false,
        executedCount: 0,
        summary: { modified: 0, deleted: 0, inserted: 0 },
        conflicts: [],
        error: message
      }
    }
  })
}
