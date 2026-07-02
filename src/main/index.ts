import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'
import { electronApp, is } from '@electron-toolkit/utils'
import configStore from './services/ConfigStore'
import historyStore from './services/HistoryStore'
import auditLog from './services/AuditLog'
import snippetStore from './services/SnippetStore'
import sessionManager from './services/SessionManager'
import autoUpdater from './services/AutoUpdater'
import { register as registerConnectionHandlers } from './ipc/connection'
import { register as registerQueryHandlers } from './ipc/query'
import { register as registerSnapshotHandlers } from './ipc/snapshot'
import { register as registerExportHandlers } from './ipc/export'
import { register as registerAIHandlers } from './ipc/ai'
import { register as registerBackupHandlers } from './ipc/backup'
import { register as registerSettingsHandlers } from './ipc/settings'
import { register as registerSessionHandlers } from './ipc/session'
import { registerPluginHandlers } from './ipc/plugin'
import { registerMCPHandlers } from './ipc/mcp'
import { registerNotebookHandlers } from './ipc/notebook'
import { bootstrapDialects } from './services/dialect/index'
import connectionManager from './services/ConnectionManager'
import { pluginHost } from './services/PluginHost'
import { mcpServer } from './services/MCPServer'

// ── MCP standalone mode ──────────────────────────────────────
if (process.argv.includes('--mcp')) {
  app.whenReady().then(async () => {
    await configStore.init()
    bootstrapDialects()

    // Auto-activate all saved connections for MCP mode
    const connections = configStore.getConnections()
    for (const conn of connections) {
      try {
        await connectionManager.activateConnection(conn.id)
        console.error(`[MCPServer] Activated connection: ${conn.name}`)
      } catch (err) {
        console.error(`[MCPServer] Failed to activate ${conn.name}:`, err)
      }
    }

    mcpServer.startStdio()
  })
  app.on('window-all-closed', () => {})
} else {

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
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  // ── Window control IPC handlers ───────────────────────────
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })
  ipcMain.handle('window:unmaximize', () => mainWindow?.unmaximize())
  ipcMain.handle('window:close', () => mainWindow?.close())
  ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false)
  ipcMain.handle('window:open-terminal', () => {
    const platform = process.platform
    console.log('[Main] Opening terminal on', platform)
    try {
      if (platform === 'win32') {
        // Use 'start' command to open a new visible cmd window
        spawn('cmd.exe', ['/c', 'start', 'cmd.exe'], {
          detached: true,
          stdio: 'ignore',
          windowsHide: false
        }).unref()
      } else if (platform === 'darwin') {
        spawn('open', ['-a', 'Terminal'], { detached: true, stdio: 'ignore' }).unref()
      } else {
        // Linux: try common terminals
        const terminals = ['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xfce4-terminal', 'lxterminal']
        let spawned = false
        for (const term of terminals) {
          try {
            spawn(term, [], { detached: true, stdio: 'ignore' }).unref()
            spawned = true
            break
          } catch { /* try next */ }
        }
        if (!spawned) {
          spawn('xterm', [], { detached: true, stdio: 'ignore' }).unref()
        }
      }
    } catch (err) {
      console.error('[Main] Failed to open terminal:', err)
    }
  })

  // Notify renderer when maximized state changes
  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximized-changed', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximized-changed', false))

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
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
  bootstrapDialects()
  historyStore.init()
  auditLog.init()
  snippetStore.init()
  sessionManager.start()
  pluginHost.init()
  await autoUpdater.init()

  // Register all IPC handlers
  registerConnectionHandlers()
  registerQueryHandlers()
  registerSnapshotHandlers()
  registerExportHandlers()
  registerAIHandlers()
  registerBackupHandlers()
  registerSettingsHandlers()
  registerSessionHandlers()
  registerPluginHandlers()
  registerMCPHandlers()
  registerNotebookHandlers()

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  pluginHost.shutdownAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

} // end if (--mcp) else
