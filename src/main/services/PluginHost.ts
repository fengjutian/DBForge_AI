// ============================================================
// PluginHost — JSON-RPC 2.0 stdio plugin manager
// ============================================================
// Manages external plugin processes that communicate via
// JSON-RPC 2.0 over stdin/stdout. Supports driver, ai-provider,
// exporter, tool, and theme plugin types.

import { ChildProcess, spawn } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, unlinkSync } from 'fs'
import type {
  PluginManifest,
  InstalledPlugin,
  PluginType,
  PluginCapability,
  PluginRegistryEntry
} from '@dbforge/shared'

// ── Plugin Instance ────────────────────────────────────────

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

interface PluginInstance {
  manifest: PluginManifest
  process: ChildProcess | null
  installPath: string
  enabled: boolean
  installedAt: number
  pending: Map<number | string, PendingRequest>
  nextId: number
  buffer: string
}

// ── PluginHost ─────────────────────────────────────────────

const PLUGINS_DIR = join(app?.getPath?.('userData') ?? '', 'plugins')
const REQUEST_TIMEOUT = 30000 // 30 seconds

class PluginHost {
  private plugins = new Map<string, PluginInstance>()
  private initialized = false

  /** Ensure plugins directory exists and load installed plugins */
  init(): void {
    if (this.initialized) return
    this.initialized = true
    if (!existsSync(PLUGINS_DIR)) {
      mkdirSync(PLUGINS_DIR, { recursive: true })
    }
    this.loadInstalledPlugins()
  }

  /** Load all plugins from the plugins directory */
  private loadInstalledPlugins(): void {
    if (!existsSync(PLUGINS_DIR)) return
    const entries = readdirSync(PLUGINS_DIR, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const manifestPath = join(PLUGINS_DIR, entry.name, 'plugin.json')
      if (existsSync(manifestPath)) {
        try {
          const manifest: PluginManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
          const configPath = join(PLUGINS_DIR, entry.name, '.enabled')
          const enabled = existsSync(configPath)
          this.plugins.set(manifest.name, {
            manifest,
            process: null,
            installPath: join(PLUGINS_DIR, entry.name),
            enabled,
            installedAt: Date.now(),
            pending: new Map(),
            nextId: 1,
            buffer: ''
          })
          console.log(`[PluginHost] Found plugin: ${manifest.name} v${manifest.version} (enabled: ${enabled})`)
        } catch (err) {
          console.error(`[PluginHost] Failed to load plugin manifest from ${manifestPath}:`, err)
        }
      }
    }
  }

  /** Start a plugin process */
  start(name: string): boolean {
    const plugin = this.plugins.get(name)
    if (!plugin) return false
    if (plugin.process) return true // already running

    const mainPath = join(plugin.installPath, plugin.manifest.main)
    if (!existsSync(mainPath)) {
      console.error(`[PluginHost] Plugin main not found: ${mainPath}`)
      return false
    }

    try {
      // Detect runtime: .js/.ts files need Node.js; others executed directly
      const ext = mainPath.split('.').pop()?.toLowerCase()
      const isScript = ext === 'js' || ext === 'ts' || ext === 'mjs' || ext === 'cjs'
      const [cmd, args] = isScript
        ? ['node', [mainPath]]
        : process.platform === 'win32'
          ? [mainPath, []]
          : [mainPath, []]

      const proc = spawn(cmd, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      })

      proc.stdout?.on('data', (data: Buffer) => {
        plugin.buffer += data.toString('utf-8')
        this.processBuffer(name)
      })

      proc.stderr?.on('data', (data: Buffer) => {
        console.error(`[PluginHost:${name}] stderr:`, data.toString('utf-8'))
      })

      proc.on('exit', (code, signal) => {
        console.log(`[PluginHost:${name}] Process exited (code=${code}, signal=${signal})`)
        plugin.process = null
        // Reject all pending requests
        for (const [, pending] of plugin.pending) {
          clearTimeout(pending.timer)
          pending.reject(new Error(`Plugin process exited (code=${code})`))
        }
        plugin.pending.clear()
      })

      proc.on('error', (err) => {
        console.error(`[PluginHost:${name}] Process error:`, err.message)
        plugin.process = null
      })

      plugin.process = proc
      plugin.buffer = ''
      console.log(`[PluginHost] Started plugin: ${name}`)
      return true
    } catch (err) {
      console.error(`[PluginHost] Failed to start plugin ${name}:`, err)
      return false
    }
  }

  /** Stop a plugin process */
  stop(name: string): void {
    const plugin = this.plugins.get(name)
    if (!plugin?.process) return
    try {
      // Send shutdown notification
      this.sendNotification(name, 'shutdown')
      setTimeout(() => {
        if (plugin.process) {
          plugin.process?.kill()
          plugin.process = null
        }
      }, 2000)
    } catch {
      plugin.process.kill()
      plugin.process = null
    }
  }

  /** Process accumulated stdout buffer, extracting JSON-RPC messages */
  private processBuffer(name: string): void {
    const plugin = this.plugins.get(name)
    if (!plugin) return

    // Messages are newline-delimited JSON
    const lines = plugin.buffer.split('\n')
    plugin.buffer = lines.pop() ?? '' // keep incomplete last line

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const msg = JSON.parse(line)
        this.handleMessage(name, msg)
      } catch {
        console.error(`[PluginHost:${name}] Invalid JSON in stdout:`, line.slice(0, 200))
      }
    }
  }

  /** Handle an incoming JSON-RPC message from a plugin */
  private handleMessage(name: string, msg: Record<string, unknown>): void {
    // Response to a pending request
    if ('id' in msg && ('result' in msg || 'error' in msg)) {
      const plugin = this.plugins.get(name)
      const pending = plugin?.pending.get(msg.id as number | string)
      if (pending) {
        clearTimeout(pending.timer)
        plugin!.pending.delete(msg.id as number | string)
        if ('error' in msg && msg.error) {
          pending.reject(new Error((msg.error as Record<string, string>).message ?? 'Plugin error'))
        } else {
          pending.resolve(msg.result)
        }
      }
      return
    }
  }

  /** Call a plugin method and return the result */
  async call<T>(
    name: string,
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    const plugin = this.plugins.get(name)
    if (!plugin) throw new Error(`Plugin not found: ${name}`)
    if (!plugin.enabled) throw new Error(`Plugin is disabled: ${name}`)
    if (!plugin.process) {
      if (!this.start(name)) throw new Error(`Failed to start plugin: ${name}`)
    }

    const id = plugin.nextId++
    const request = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params: params ?? {}
    })

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        plugin.pending.delete(id)
        reject(new Error(`Plugin request timed out: ${method}`))
      }, REQUEST_TIMEOUT)

      plugin.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })

      try {
        plugin.process?.stdin?.write(request + '\n')
      } catch (err) {
        clearTimeout(timer)
        plugin.pending.delete(id)
        reject(err)
      }
    })
  }

  /** Send a one-way notification to a plugin (no response expected) */
  sendNotification(name: string, method: string, params?: Record<string, unknown>): void {
    const plugin = this.plugins.get(name)
    if (!plugin?.process) return
    try {
      plugin.process?.stdin?.write(JSON.stringify({
        jsonrpc: '2.0',
        method,
        params: params ?? {}
      }) + '\n')
    } catch {
      // ignore
    }
  }

  /** Install a plugin (from a local path or extracted directory) */
  installPlugin(manifest: PluginManifest, sourcePath: string): boolean {
    if (this.plugins.has(manifest.name)) {
      console.warn(`[PluginHost] Plugin already installed: ${manifest.name}`)
      return false
    }

    const destPath = join(PLUGINS_DIR, manifest.name)
    if (!existsSync(destPath)) {
      // In production, this would copy/extract the plugin files
      // For now, we just register it
      mkdirSync(destPath, { recursive: true })
    }

    // Write manifest
    writeFileSync(join(destPath, 'plugin.json'), JSON.stringify(manifest, null, 2))

    // Mark as enabled
    writeFileSync(join(destPath, '.enabled'), '')

    this.plugins.set(manifest.name, {
      manifest,
      process: null,
      installPath: destPath,
      enabled: true,
      installedAt: Date.now(),
      pending: new Map(),
      nextId: 1,
      buffer: ''
    })

    console.log(`[PluginHost] Installed plugin: ${manifest.name}`)
    return true
  }

  /** Uninstall a plugin */
  uninstallPlugin(name: string): boolean {
    const plugin = this.plugins.get(name)
    if (!plugin) return false

    this.stop(name)
    this.plugins.delete(name)
    console.log(`[PluginHost] Uninstalled plugin: ${name}`)
    return true
  }

  /** Enable a plugin */
  enablePlugin(name: string): boolean {
    const plugin = this.plugins.get(name)
    if (!plugin) return false
    plugin.enabled = true
    writeFileSync(join(plugin.installPath, '.enabled'), '')
    return true
  }

  /** Disable a plugin */
  disablePlugin(name: string): boolean {
    const plugin = this.plugins.get(name)
    if (!plugin) return false
    this.stop(name)
    plugin.enabled = false
    const enabledPath = join(plugin.installPath, '.enabled')
    if (existsSync(enabledPath)) {
      unlinkSync(enabledPath)
    }
    return true
  }

  /** List all installed plugins */
  listPlugins(): InstalledPlugin[] {
    return Array.from(this.plugins.values()).map(p => ({
      manifest: p.manifest,
      installPath: p.installPath,
      installedAt: p.installedAt,
      enabled: p.enabled
    }))
  }

  /** Get a plugin by name */
  getPlugin(name: string): InstalledPlugin | undefined {
    const p = this.plugins.get(name)
    if (!p) return undefined
    return {
      manifest: p.manifest,
      installPath: p.installPath,
      installedAt: p.installedAt,
      enabled: p.enabled
    }
  }

  /** Check if a plugin with the given name and type exists and is enabled */
  hasCapability(name: string, capability: PluginCapability): boolean {
    const plugin = this.plugins.get(name)
    if (!plugin?.enabled) return false
    return plugin.manifest.capabilities.includes(capability)
  }

  /** Find plugins by type */
  findByType(type: PluginType): InstalledPlugin[] {
    return this.listPlugins().filter(p => p.manifest.type === type && p.enabled)
  }

  /** Shut down all plugin processes */
  shutdownAll(): void {
    for (const [name] of this.plugins) {
      this.stop(name)
    }
  }
}

export const pluginHost = new PluginHost()

// ── Plugin Registry (official) ─────────────────────────────

const OFFICIAL_REGISTRY: PluginRegistryEntry[] = []

export function getOfficialRegistry(): PluginRegistryEntry[] {
  return OFFICIAL_REGISTRY
}

export function addRegistryEntry(entry: PluginRegistryEntry): void {
  OFFICIAL_REGISTRY.push(entry)
}
