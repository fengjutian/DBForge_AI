import { BrowserWindow } from 'electron'
import type { SessionWarning } from '@dbforge/shared'
import { IPC } from '@dbforge/shared'
import configStore from './ConfigStore'
import connectionManager from './ConnectionManager'

// ============================================================
// SessionManager — singleton
// ============================================================

const WARNING_BEFORE_MS = 5 * 60 * 1000 // 5 minutes before timeout

class SessionManager {
  private static instance: SessionManager | null = null

  private timeoutTimer: ReturnType<typeof setTimeout> | null = null
  private warningTimer: ReturnType<typeof setTimeout> | null = null
  private lastActivityAt: number = Date.now()
  private isLocked: boolean = false

  private constructor() {}

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager()
    }
    return SessionManager.instance
  }

  // ============================================================
  // Lifecycle
  // ============================================================

  /**
   * Start the session timeout watcher.
   * Should be called after the app is ready and config is loaded.
   */
  start(): void {
    this.resetTimers()
  }

  /**
   * Stop all timers (e.g. on app quit).
   */
  stop(): void {
    this.clearTimers()
  }

  // ============================================================
  // Activity tracking
  // ============================================================

  /**
   * Record user activity — resets the inactivity timer.
   * Call this from IPC handlers whenever the user performs an action.
   */
  recordActivity(): void {
    this.lastActivityAt = Date.now()
    if (this.isLocked) return // don't reset while locked
    this.resetTimers()
  }

  // ============================================================
  // Session extension
  // ============================================================

  /**
   * Extend the current session (called when user clicks "延长会话").
   * Resets the inactivity timer without requiring re-authentication.
   */
  extendSession(): void {
    this.lastActivityAt = Date.now()
    this.isLocked = false
    this.resetTimers()
  }

  // ============================================================
  // Lock / unlock
  // ============================================================

  /**
   * Manually lock the session.
   */
  async lock(): Promise<void> {
    await this.doLock()
  }

  /**
   * Unlock the session (after user re-authenticates / reconnects).
   */
  unlock(): void {
    this.isLocked = false
    this.extendSession()
  }

  // ============================================================
  // Config
  // ============================================================

  getTimeoutMinutes(): number {
    return configStore.get('sessionTimeout') ?? 0
  }

  // ============================================================
  // Private helpers
  // ============================================================

  private resetTimers(): void {
    this.clearTimers()

    const timeoutMinutes = this.getTimeoutMinutes()
    if (timeoutMinutes <= 0) return // 0 = never timeout

    const timeoutMs = timeoutMinutes * 60 * 1000

    // Warning timer: fire 5 minutes before timeout (only if timeout > 5 min)
    if (timeoutMs > WARNING_BEFORE_MS) {
      this.warningTimer = setTimeout(() => {
        this.sendWarning(5)
      }, timeoutMs - WARNING_BEFORE_MS)
    }

    // Lock timer
    this.timeoutTimer = setTimeout(() => {
      this.doLock()
    }, timeoutMs)
  }

  private clearTimers(): void {
    if (this.timeoutTimer !== null) {
      clearTimeout(this.timeoutTimer)
      this.timeoutTimer = null
    }
    if (this.warningTimer !== null) {
      clearTimeout(this.warningTimer)
      this.warningTimer = null
    }
  }

  private async doLock(): Promise<void> {
    this.isLocked = true
    this.clearTimers()

    // Disconnect all active connections
    try {
      const statuses = connectionManager.getAllStatuses()
      const activeIds = statuses
        .filter((s) => s.state === 'connected' || s.state === 'connecting')
        .map((s) => s.id)

      await Promise.allSettled(activeIds.map((id) => connectionManager.deactivateConnection(id)))
    } catch {
      // Ignore errors during lock
    }

    // Push lock event to all renderer windows
    this.broadcast(IPC.SESSION_LOCK, { lockedAt: Date.now() })
  }

  private sendWarning(minutesRemaining: number): void {
    const warning: SessionWarning = { minutesRemaining }
    this.broadcast(IPC.SESSION_WARNING, warning)
  }

  private broadcast(channel: string, data: unknown): void {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data)
      }
    }
  }
}

export const sessionManager = SessionManager.getInstance()
export default sessionManager
