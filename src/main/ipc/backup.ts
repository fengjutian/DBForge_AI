import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type { BackupOptions, BackupProgress, IPCError } from '../../shared/types'
import backupManager from '../services/BackupManager'

function wrapError(err: unknown): IPCError {
  const message = err instanceof Error ? err.message : String(err)
  return {
    code: 'IPC_ERROR',
    message,
    userMessage: message
  }
}

function broadcastProgress(progress: BackupProgress): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.BACKUP_PROGRESS, progress)
    }
  }
}

export function register(): void {
  ipcMain.handle(IPC.BACKUP_DETECT_TOOL, async () => {
    try {
      return await backupManager.detectMysqldump()
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.BACKUP_VALIDATE_PATH, async (_event, execPath: string) => {
    try {
      return await backupManager.validateMysqldumpPath(execPath)
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.BACKUP_START, async (_event, options: BackupOptions) => {
    try {
      const filePath = await backupManager.backup(options, (progress) => {
        broadcastProgress(progress)
      })
      return { success: true, filePath }
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.BACKUP_RESTORE, async (_event, connectionId: string, filePath: string) => {
    try {
      await backupManager.restore(connectionId, filePath, (progress) => {
        broadcastProgress(progress)
      })
      return { success: true }
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.BACKUP_OPEN_FOLDER, async (_event, filePath: string) => {
    try {
      await backupManager.openBackupFolder(filePath)
      return { success: true }
    } catch (err) {
      throw wrapError(err)
    }
  })
}
