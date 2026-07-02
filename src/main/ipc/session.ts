import { ipcMain } from 'electron'
import { IPC } from '@dbforge/shared'
import dbSessionManager from '../services/DBSessionManager'

function wrapError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err)
  const error = new Error(message)
  ;(error as Error & { code: string; userMessage: string }).code = 'IPC_ERROR'
  ;(error as Error & { code: string; userMessage: string }).userMessage = message
  return error
}

export function register(): void {
  // ── Activate (connect + fetch schema) ──

  ipcMain.handle(IPC.SESSION_ACTIVATE, async (_event, connectionId: string) => {
    try {
      return await dbSessionManager.activate(connectionId)
    } catch (err) {
      throw wrapError(err)
    }
  })

  // ── Deactivate ──

  ipcMain.handle(IPC.SESSION_DEACTIVATE, async (_event, connectionId: string) => {
    try {
      await dbSessionManager.deactivate(connectionId)
      return { success: true }
    } catch (err) {
      throw wrapError(err)
    }
  })

  // ── Refresh schema for an active session ──

  ipcMain.handle(IPC.SESSION_REFRESH_SCHEMA, async (_event, connectionId: string) => {
    try {
      return await dbSessionManager.refreshSchema(connectionId)
    } catch (err) {
      throw wrapError(err)
    }
  })

  // ── Get full session context ──

  ipcMain.handle(IPC.SESSION_GET, async (_event, connectionId: string) => {
    try {
      const session = dbSessionManager.getSession(connectionId)
      if (!session) throw new Error(`No active session: ${connectionId}`)
      return session
    } catch (err) {
      throw wrapError(err)
    }
  })

  // ── Get schema only ──

  ipcMain.handle(IPC.SESSION_GET_SCHEMA, async (_event, connectionId: string) => {
    try {
      const schema = dbSessionManager.getSchema(connectionId)
      if (!schema) throw new Error(`No schema for connection: ${connectionId}`)
      return schema
    } catch (err) {
      throw wrapError(err)
    }
  })
}
