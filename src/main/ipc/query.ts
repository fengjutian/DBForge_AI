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

    try {
      result = await queryExecutor.execute({ ...rest, abortSignal: controller.signal })
      success = true

      // Record history
      const connConfig = connectionManager.getConnection(rest.connectionId)
      const limit = configStore.get('historyLimit') ?? 1000
      historyStore.add(
        {
          connectionId: rest.connectionId,
          connectionName: connConfig?.name ?? rest.connectionId,
          sql: rest.sql,
          executedAt: startTime,
          duration: result.executionTime,
          rowCount: result.rows.length,
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

      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)

      // Record failed audit entry for write operations
      const connConfig = connectionManager.getConnection(rest.connectionId)
      auditLog.add({
        connectionId: rest.connectionId,
        connectionName: connConfig?.name ?? rest.connectionId,
        sql: rest.sql,
        executedAt: startTime,
        result: 'failure',
        affectedRows: 0,
        errorMessage: message
      })

      if (!success) {
        const limit = configStore.get('historyLimit') ?? 1000
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
      }

      throw wrapError(err)
    } finally {
      activeQueries.delete(id)
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
