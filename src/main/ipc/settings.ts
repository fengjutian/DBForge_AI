import { ipcMain } from 'electron'
import { IPC } from '@dbforge/shared'
import type { AppConfig, IPCError, SqlSnippet } from '@dbforge/shared'
import configStore from '../services/ConfigStore'
import auditLog from '../services/AuditLog'
import snippetStore from '../services/SnippetStore'
import sessionManager from '../services/SessionManager'
import autoUpdater from '../services/AutoUpdater'

function wrapError(err: unknown): IPCError {
  const message = err instanceof Error ? err.message : String(err)
  return {
    code: 'IPC_ERROR',
    message,
    userMessage: message
  }
}

export function register(): void {
  // ── Settings ───────────────────────────────────────────────

  ipcMain.handle(IPC.SETTINGS_GET, () => {
    try {
      return configStore.getAll()
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.SETTINGS_SET, (_event, partial: Partial<AppConfig>) => {
    try {
      for (const key of Object.keys(partial) as Array<keyof AppConfig>) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        configStore.set(key, (partial as any)[key])
      }
      return { success: true }
    } catch (err) {
      throw wrapError(err)
    }
  })

  // ── History ────────────────────────────────────────────────

  ipcMain.handle(IPC.HISTORY_LIST, (_event, limit?: number) => {
    try {
      const history = configStore.getQueryHistory()
      return limit != null ? history.slice(0, limit) : history
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.HISTORY_SEARCH, (_event, keyword: string, connectionId?: string) => {
    try {
      let history = configStore.getQueryHistory()
      if (connectionId) {
        history = history.filter((h) => h.connectionId === connectionId)
      }
      if (keyword) {
        const kw = keyword.toLowerCase()
        history = history.filter(
          (h) =>
            h.sql.toLowerCase().includes(kw) ||
            h.connectionName.toLowerCase().includes(kw)
        )
      }
      return history
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.HISTORY_CLEAR, () => {
    try {
      configStore.clearQueryHistory()
      return { success: true }
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.HISTORY_DELETE, (_event, id: number) => {
    try {
      configStore.deleteQueryHistoryById(id)
      return { success: true }
    } catch (err) {
      throw wrapError(err)
    }
  })

  // ── Audit ──────────────────────────────────────────────────

  ipcMain.handle(IPC.AUDIT_LIST, (_event, options?: { startTime?: number; endTime?: number; connectionId?: string }) => {
    try {
      return auditLog.list({
        connectionId: options?.connectionId,
        fromTime: options?.startTime,
        toTime: options?.endTime
      })
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.AUDIT_EXPORT, (_event, options?: { startTime?: number; endTime?: number; connectionId?: string }) => {
    try {
      return auditLog.exportCSV({
        connectionId: options?.connectionId,
        fromTime: options?.startTime,
        toTime: options?.endTime
      })
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.AUDIT_CLEAR_OLD, () => {
    try {
      const retentionDays = configStore.get('auditRetentionDays') ?? 90
      auditLog.purgeOlderThan(retentionDays)
      return { success: true }
    } catch (err) {
      throw wrapError(err)
    }
  })

  // ── Snippets ───────────────────────────────────────────────

  ipcMain.handle(IPC.SNIPPET_LIST, () => {
    try {
      return snippetStore.list()
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.SNIPPET_CREATE, (_event, snippet: Omit<SqlSnippet, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      return snippetStore.create(snippet)
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.SNIPPET_UPDATE, (_event, snippet: SqlSnippet) => {
    try {
      const updated = snippetStore.update(snippet.id, snippet)
      if (!updated) throw new Error(`Snippet not found: ${snippet.id}`)
      return updated
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.SNIPPET_DELETE, (_event, id: number) => {
    try {
      const deleted = snippetStore.delete(id)
      return { success: deleted }
    } catch (err) {
      throw wrapError(err)
    }
  })

  // ── Session (timeout / lock) ───────────────────────────────

  ipcMain.handle(IPC.SESSION_EXTEND, () => {
    try {
      sessionManager.extendSession()
      return { success: true }
    } catch (err) {
      throw wrapError(err)
    }
  })

  // ── Auto-updater ───────────────────────────────────────────

  ipcMain.handle(IPC.UPDATER_CHECK, async () => {
    try {
      await autoUpdater.checkForUpdates()
      return { success: true }
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.UPDATER_DOWNLOAD, async () => {
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.UPDATER_INSTALL, async () => {
    try {
      await autoUpdater.installUpdate()
      return { success: true }
    } catch (err) {
      throw wrapError(err)
    }
  })
}
