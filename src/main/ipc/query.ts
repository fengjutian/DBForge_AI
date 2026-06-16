import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type { IPCError, QueryOptions } from '../../shared/types'
import { queryExecutor, isDangerous } from '../services/QueryExecutor'
import historyStore from '../services/HistoryStore'
import auditLog from '../services/AuditLog'
import connectionManager from '../services/ConnectionManager'
import configStore from '../services/ConfigStore'

function wrapError(err: unknown): IPCError {
  const message = err instanceof Error ? err.message : String(err)
  return {
    code: 'IPC_ERROR',
    message,
    userMessage: message
  }
}

/** Active AbortControllers keyed by a client-provided queryId */
const activeQueries = new Map<string, AbortController>()

export function register(): void {
  ipcMain.handle(IPC.QUERY_EXECUTE, async (_event, options: Omit<QueryOptions, 'abortSignal'> & { queryId?: string }) => {
    const { queryId, ...rest } = options
    const controller = new AbortController()
    const id = queryId ?? `q_${Date.now()}`
    activeQueries.set(id, controller)

    const startTime = Date.now()
    let success = false
    let result
    let caughtError: unknown = null

    try {
      result = await queryExecutor.execute({ ...rest, abortSignal: controller.signal })
      success = true
      // Fall through to finally for history/audit recording
      return result
    } catch (err) {
      caughtError = err
      // Fall through to finally for history/audit recording
    } finally {
      // Record history and audit — best-effort, never fail the query
      try {
        const connConfig = connectionManager.getConnection(rest.connectionId)
        const limit = configStore.get('historyLimit') ?? 1000

        if (success && result) {
          historyStore.add(
            {
              connectionId: rest.connectionId,
              connectionName: connConfig?.name ?? rest.connectionId,
              sql: rest.sql,
              executedAt: startTime,
              duration: result.executionTime,
              rowCount: result.rows?.length ?? 0,
              success: true
            },
            limit
          )

          // Audit log for write operations
          if (result.affectedRows !== undefined) {
            auditLog.add({
              connectionId: rest.connectionId,
              connectionName: connConfig?.name ?? rest.connectionId,
              sql: rest.sql,
              executedAt: startTime,
              result: 'success',
              affectedRows: result.affectedRows ?? 0
            })
          }
        } else {
          historyStore.add(
            {
              connectionId: rest.connectionId,
              connectionName: connConfig?.name ?? rest.connectionId,
              sql: rest.sql,
              executedAt: startTime,
              duration: Date.now() - startTime,
              rowCount: 0,
              success: false
            },
            limit
          )

          // Audit all failed queries
          auditLog.add({
            connectionId: rest.connectionId,
            connectionName: connConfig?.name ?? rest.connectionId,
            sql: rest.sql,
            executedAt: startTime,
            result: 'failure',
            affectedRows: 0,
            errorMessage: undefined
          })
        }
      } catch (recordErr) {
        // History/audit recording failure must never affect query execution
        console.error('[Query] Failed to record history/audit:', recordErr)
      }

      activeQueries.delete(id)

      // If the query failed, throw the error after recording history
      if (!success && caughtError) {
        throw wrapError(caughtError)
      }
    }
  })

  ipcMain.handle(IPC.QUERY_CANCEL, (_event, queryId: string) => {
    const controller = activeQueries.get(queryId)
    if (controller) {
      controller.abort()
      activeQueries.delete(queryId)
      return { success: true }
    }
    return { success: false, message: 'Query not found' }
  })

  ipcMain.handle(IPC.QUERY_DANGEROUS_CHECK, (_event, sql: string) => {
    try {
      return isDangerous(sql)
    } catch (err) {
      throw wrapError(err)
    }
  })
}
