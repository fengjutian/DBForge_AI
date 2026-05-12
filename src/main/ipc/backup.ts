import { ipcMain, BrowserWindow, dialog } from 'electron'
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

  // ── Dialog APIs ──────────────────────────────────────────────
  ipcMain.handle('dialog:selectSavePath', async (_event, defaultPath?: string) => {
    try {
      const result = await dialog.showSaveDialog({
        title: '选择备份保存位置',
        defaultPath: defaultPath || undefined,
        filters: [
          { name: 'SQL 文件', extensions: ['sql'] },
          { name: '压缩备份', extensions: ['gz'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      })
      if (result.canceled) return null
      return result.filePath
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle('dialog:selectFile', async (_event, filters?: { name: string; extensions: string[] }[]) => {
    try {
      const result = await dialog.showOpenDialog({
        title: '选择备份文件',
        properties: ['openFile'],
        filters: filters || [
          { name: 'SQL 文件', extensions: ['sql', 'gz'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      })
      if (result.canceled) return null
      return result.filePaths[0] || null
    } catch (err) {
      throw wrapError(err)
    }
  })
}
