import { BrowserWindow } from 'electron'
import type { UpdateStatusEvent, UpdateInfo } from '../../shared/types'
import { IPC } from '../../shared/ipc-channels'

// ============================================================
// AutoUpdater — singleton
// ============================================================

class AutoUpdater {
  private static instance: AutoUpdater | null = null
  private initialized: boolean = false

  private constructor() {}

  static getInstance(): AutoUpdater {
    if (!AutoUpdater.instance) {
      AutoUpdater.instance = new AutoUpdater()
    }
    return AutoUpdater.instance
  }

  // ============================================================
  // Lifecycle
  // ============================================================

  /**
   * Initialize the auto-updater and start a silent background check.
   * Should be called once after the app window is ready.
   * All errors are silently ignored to avoid disrupting the main flow.
   */
  async init(): Promise<void> {
    if (this.initialized) return
    this.initialized = true

    try {
      await this.setupUpdater()
    } catch {
      // Silent failure — updater is non-critical
    }
  }

  // ============================================================
  // Manual check
  // ============================================================

  /**
   * Manually trigger an update check (e.g. from the settings page).
   */
  async checkForUpdates(): Promise<void> {
    try {
      const { autoUpdater } = await import('electron-updater')
      await autoUpdater.checkForUpdates()
    } catch {
      // Silent failure
    }
  }

  /**
   * Start downloading the available update in the background.
   */
  async downloadUpdate(): Promise<void> {
    try {
      const { autoUpdater } = await import('electron-updater')
      await autoUpdater.downloadUpdate()
    } catch {
      // Silent failure
    }
  }

  /**
   * Quit the app and install the downloaded update.
   */
  async installUpdate(): Promise<void> {
    try {
      const { autoUpdater } = await import('electron-updater')
      autoUpdater.quitAndInstall()
    } catch {
      // Silent failure
    }
  }

  // ============================================================
  // Private setup
  // ============================================================

  private async setupUpdater(): Promise<void> {
    const { autoUpdater } = await import('electron-updater')

    // Disable auto-download so we can show a notification first
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    // Silence logger to avoid leaking info in production logs
    autoUpdater.logger = null

    // ---- Event handlers ----

    autoUpdater.on('checking-for-update', () => {
      this.broadcast({ status: 'checking' })
    })

    autoUpdater.on('update-available', (info) => {
      const updateInfo: UpdateInfo = {
        version: info.version,
        releaseNotes:
          typeof info.releaseNotes === 'string'
            ? info.releaseNotes
            : Array.isArray(info.releaseNotes)
              ? (info.releaseNotes as Array<{ note?: string }>)
                  .map((n) => n.note ?? '')
                  .join('\n')
              : undefined,
        releaseDate: info.releaseDate
      }
      this.broadcast({ status: 'available', info: updateInfo })
    })

    autoUpdater.on('update-not-available', () => {
      this.broadcast({ status: 'not-available' })
    })

    autoUpdater.on('download-progress', (progress) => {
      this.broadcast({ status: 'downloading', progress: Math.round(progress.percent) })
    })

    autoUpdater.on('update-downloaded', (info) => {
      const updateInfo: UpdateInfo = {
        version: info.version,
        releaseNotes:
          typeof info.releaseNotes === 'string'
            ? info.releaseNotes
            : undefined,
        releaseDate: info.releaseDate
      }
      this.broadcast({ status: 'downloaded', info: updateInfo })
    })

    autoUpdater.on('error', () => {
      // Silent — do not broadcast error to avoid alarming users
      // Only broadcast if we want to show a subtle indicator
      this.broadcast({ status: 'error' })
    })

    // Trigger the initial silent check
    try {
      await autoUpdater.checkForUpdates()
    } catch {
      // Silent failure
    }
  }

  // ============================================================
  // Broadcast helpers
  // ============================================================

  private broadcast(event: UpdateStatusEvent): void {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC.UPDATER_STATUS, event)
      }
    }
  }
}

export const autoUpdater = AutoUpdater.getInstance()
export default autoUpdater
