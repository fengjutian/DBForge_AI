import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type { IPCError } from '../../shared/types'
import connectionManager from '../services/ConnectionManager'
import configStore from '../services/ConfigStore'
import { v4 as uuidv4 } from 'uuid'

function wrapError(err: unknown): IPCError {
  const message = err instanceof Error ? err.message : String(err)
  return {
    code: 'IPC_ERROR',
    message,
    userMessage: message
  }
}

export function register(): void {
  // ── Connection CRUD ──────────────────────────────────────────

  ipcMain.handle(IPC.CONNECTION_LIST, () => {
    try {
      return connectionManager.listConnections()
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.CONNECTION_CREATE, (_event, config) => {
    try {
      return connectionManager.createConnection(config)
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.CONNECTION_UPDATE, (_event, config) => {
    try {
      return connectionManager.updateConnection(config.id, config)
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.CONNECTION_DELETE, async (_event, id: string) => {
    try {
      await connectionManager.deleteConnection(id)
      return { success: true }
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.CONNECTION_TEST, async (_event, config) => {
    try {
      return await connectionManager.testConnection(config)
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.CONNECTION_ACTIVATE, async (_event, id: string) => {
    try {
      await connectionManager.activateConnection(id)
      return { success: true }
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.CONNECTION_DEACTIVATE, async (_event, id: string) => {
    try {
      await connectionManager.deactivateConnection(id)
      return { success: true }
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.CONNECTION_STATUS, (_event, id: string) => {
    try {
      return connectionManager.getConnectionStatus(id)
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.CONNECTION_EXPORT, (_event, ids: string[]) => {
    try {
      return connectionManager.exportConnections(ids)
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.CONNECTION_IMPORT, (_event, json: string) => {
    try {
      return connectionManager.importConnections(json)
    } catch (err) {
      throw wrapError(err)
    }
  })

  // ── Connection Groups ────────────────────────────────────────

  ipcMain.handle(IPC.CONNECTION_GROUP_LIST, () => {
    try {
      return configStore.getConnectionGroups()
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.CONNECTION_GROUP_CREATE, (_event, group) => {
    try {
      const groups = configStore.getConnectionGroups()
      const newGroup = { ...group, id: uuidv4() }
      groups.push(newGroup)
      configStore.saveConnectionGroups(groups)
      return newGroup
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.CONNECTION_GROUP_UPDATE, (_event, group) => {
    try {
      const groups = configStore.getConnectionGroups()
      const idx = groups.findIndex((g) => g.id === group.id)
      if (idx < 0) throw new Error(`Group not found: ${group.id}`)
      groups[idx] = group
      configStore.saveConnectionGroups(groups)
      return group
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.CONNECTION_GROUP_DELETE, (_event, id: string) => {
    try {
      const groups = configStore.getConnectionGroups().filter((g) => g.id !== id)
      configStore.saveConnectionGroups(groups)
      return { success: true }
    } catch (err) {
      throw wrapError(err)
    }
  })
}
