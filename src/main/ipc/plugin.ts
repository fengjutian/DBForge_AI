// ============================================================
// Plugin IPC Handlers
// ============================================================

import { ipcMain } from 'electron'
import { IPC } from '@dbforge/shared'
import type { InstalledPlugin, PluginRegistryEntry, PluginManifest, PluginCapability } from '@dbforge/shared'
import { pluginHost, getOfficialRegistry } from '../services/PluginHost'

export function registerPluginHandlers(): void {
  // List installed plugins
  ipcMain.handle(IPC.PLUGIN_LIST, async (): Promise<InstalledPlugin[]> => {
    return pluginHost.listPlugins()
  })

  // Get official registry
  ipcMain.handle(IPC.PLUGIN_GET_REGISTRY, async (): Promise<PluginRegistryEntry[]> => {
    return getOfficialRegistry()
  })

  // Install a plugin from registry
  ipcMain.handle(IPC.PLUGIN_INSTALL, async (
    _event,
    entry: PluginRegistryEntry
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // In production, this would download and extract the plugin
      // For now, just register the manifest
      const manifest: PluginManifest = {
        name: entry.name,
        version: entry.version,
        description: entry.description,
        author: '',
        main: 'main.js',
        type: entry.type,
        engines: { dbforge: '>=1.2.0' },
        capabilities: [] as PluginCapability[]
      }
      const ok = pluginHost.installPlugin(manifest, '')
      return { success: ok, error: ok ? undefined : 'Plugin already installed' }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // Uninstall a plugin
  ipcMain.handle(IPC.PLUGIN_UNINSTALL, async (
    _event,
    name: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const ok = pluginHost.uninstallPlugin(name)
      return { success: ok, error: ok ? undefined : 'Plugin not found' }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // Enable a plugin
  ipcMain.handle(IPC.PLUGIN_ENABLE, async (
    _event,
    name: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const ok = pluginHost.enablePlugin(name)
      return { success: ok, error: ok ? undefined : 'Plugin not found' }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // Disable a plugin
  ipcMain.handle(IPC.PLUGIN_DISABLE, async (
    _event,
    name: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const ok = pluginHost.disablePlugin(name)
      return { success: ok, error: ok ? undefined : 'Plugin not found' }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
}
