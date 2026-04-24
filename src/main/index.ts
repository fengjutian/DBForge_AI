import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import configStore from './services/ConfigStore'
import historyStore from './services/HistoryStore'
import auditLog from './services/AuditLog'
import snippetStore from './services/SnippetStore'
import sessionManager from './services/SessionManager'
import autoUpdater from './services/AutoUpdater'
import { register as registerConnectionHandlers } from './ipc/connection'
import { register as registerQueryHandlers } from './ipc/query'
import { register as registerExportHandlers } from './ipc/export'
import { register as registerAIHandlers } from './ipc/ai'
import { register as registerBackupHandlers } from './ipc/backup'
import { register as registerSettingsHandlers } from './ipc/settings'

// Global uncaught exception handler - prevents white screen
process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught exception:', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled rejection:', reason)
})

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    if (is.dev) {
      mainWindow?.webContents.openDevTools()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load the renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  // Set app user model id for Windows
  electronApp.setAppUserModelId('com.dbforge.ai')

  // Initialize services
  await configStore.init()
  historyStore.init()
  auditLog.init()
  snippetStore.init()
  sessionManager.start()
  await autoUpdater.init()

  // Register all IPC handlers
  registerConnectionHandlers()
  registerQueryHandlers()
  registerExportHandlers()
  registerAIHandlers()
  registerBackupHandlers()
  registerSettingsHandlers()

  // Default open or close DevTools by F12 in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
