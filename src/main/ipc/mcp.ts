// ============================================================
// MCP Server IPC Handlers
// ============================================================

import { ipcMain, app } from 'electron'
import { join } from 'path'
import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'fs'
import { IPC } from '@dbforge/shared'
import { mcpServer } from '../services/MCPServer'

export function registerMCPHandlers(): void {
  // Get MCP server status
  ipcMain.handle(IPC.MCP_STATUS, async () => {
    return { running: mcpServer.isRunning() }
  })

  // Start MCP server (embedded mode — future use)
  ipcMain.handle(IPC.MCP_START, async () => {
    // In embedded mode, we'd start on a local TCP port
    // For now, MCP only works via --mcp CLI flag
    return { success: false, error: 'MCP server is started via CLI: dbforge --mcp' }
  })

  // Stop MCP server
  ipcMain.handle(IPC.MCP_STOP, async () => {
    mcpServer.stop()
    return { success: true }
  })

  // Install MCP config for a target client
  ipcMain.handle(IPC.MCP_INSTALL_CONFIG, async (_event, target: 'claude' | 'cursor') => {
    try {
      return installMCPConfig(target)
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
}

/** Generate and write MCP client configuration */
function installMCPConfig(target: 'claude' | 'cursor'): { success: boolean; configPath?: string; error?: string } {
  const isWindows = process.platform === 'win32'
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '~'

  // Determine the executable path
  const exePath = process.argv0.includes('electron')
    ? join(app.getAppPath(), '../../node_modules/.bin/electron')
    : process.argv0

  const mcpCommand = isWindows
    ? `"${exePath}" --mcp`
    : `${exePath} --mcp`

  if (target === 'claude') {
    let configDir: string
    if (process.platform === 'darwin') {
      configDir = join(home, 'Library', 'Application Support', 'Claude')
    } else if (process.platform === 'win32') {
      configDir = join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'Claude')
    } else {
      configDir = join(home, '.config', 'Claude')
    }

    const configPath = join(configDir, 'claude_desktop_config.json')
    mkdirSync(configDir, { recursive: true })

    let config: Record<string, unknown> = {}
    if (existsSync(configPath)) {
      try {
        config = JSON.parse(readFileSync(configPath, 'utf-8'))
      } catch { /* use empty config */ }
    }

    config.mcpServers = {
      ...(config.mcpServers as Record<string, unknown> ?? {}),
      'dbforge': {
        command: isWindows ? 'node' : exePath,
        args: isWindows ? [exePath, '--mcp'] : ['--mcp']
      }
    }

    writeFileSync(configPath, JSON.stringify(config, null, 2))
    return { success: true, configPath }
  }

  if (target === 'cursor') {
    // Cursor uses .cursor/mcp.json in project root, or global
    const configDir = join(home, '.cursor')
    const configPath = join(configDir, 'mcp.json')
    mkdirSync(configDir, { recursive: true })

    let config: Record<string, unknown> = {}
    if (existsSync(configPath)) {
      try {
        config = JSON.parse(readFileSync(configPath, 'utf-8'))
      } catch { /* use empty config */ }
    }

    config.mcpServers = {
      ...(config.mcpServers as Record<string, unknown> ?? {}),
      'dbforge': {
        command: isWindows ? 'node' : exePath,
        args: isWindows ? [exePath, '--mcp'] : ['--mcp']
      }
    }

    writeFileSync(configPath, JSON.stringify(config, null, 2))
    return { success: true, configPath }
  }

  return { success: false, error: `Unknown target: ${target}` }
}
