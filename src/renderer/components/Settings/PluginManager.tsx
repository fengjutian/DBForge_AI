// ============================================================
// PluginManager — plugin management panel in Settings
// ============================================================

import React, { useState, useEffect, useCallback } from 'react'
import { Package, Download, Trash2, Power, PowerOff, RefreshCw, Puzzle } from 'lucide-react'

interface InstalledPlugin {
  manifest: {
    name: string
    version: string
    description: string
    author: string
    type: string
    capabilities: string[]
  }
  enabled: boolean
  installedAt: number
}

interface RegistryEntry {
  name: string
  version: string
  description: string
  type: string
  download: string
}

export default function PluginManager(): React.ReactElement {
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([])
  const [registry, setRegistry] = useState<RegistryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [p, r] = await Promise.all([
        window.electronAPI.plugins.list(),
        window.electronAPI.plugins.getRegistry()
      ])
      setPlugins(p as InstalledPlugin[])
      setRegistry(r as RegistryEntry[])
      setError(null)
    } catch (err) {
      setError('Failed to load plugins')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleInstall = async (entry: RegistryEntry) => {
    setInstalling(entry.name)
    try {
      const result = await window.electronAPI.plugins.install(entry)
      if ((result as { success: boolean }).success) {
        await loadData()
      } else {
        setError((result as { error?: string }).error ?? 'Install failed')
      }
    } catch {
      setError('Install failed')
    } finally {
      setInstalling(null)
    }
  }

  const handleUninstall = async (name: string) => {
    try {
      const result = await window.electronAPI.plugins.uninstall(name)
      if ((result as { success: boolean }).success) {
        await loadData()
      } else {
        setError((result as { error?: string }).error ?? 'Uninstall failed')
      }
    } catch {
      setError('Uninstall failed')
    }
  }

  const handleToggle = async (name: string, enabled: boolean) => {
    try {
      const result = enabled
        ? await window.electronAPI.plugins.enable(name)
        : await window.electronAPI.plugins.disable(name)
      if ((result as { success: boolean }).success) {
        await loadData()
      } else {
        setError((result as { error?: string }).error ?? 'Toggle failed')
      }
    } catch {
      setError('Toggle failed')
    }
  }

  const typeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      driver: '数据库驱动',
      'ai-provider': 'AI 提供商',
      exporter: '导出器',
      tool: '工具',
      theme: '主题'
    }
    return labels[type] ?? type
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        加载中...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="px-3 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">关闭</button>
        </div>
      )}

      {/* Installed Plugins */}
      <section>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
          <Puzzle className="w-4 h-4" />
          已安装插件 ({plugins.length})
        </h3>

        {plugins.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">
            暂无已安装的插件。从下方官方注册表安装。
          </p>
        ) : (
          <div className="space-y-2">
            {plugins.map(p => (
              <div key={p.manifest.name}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border
                  ${p.enabled
                    ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                    : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 opacity-60'
                  }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0
                    ${p.enabled ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                               : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}>
                    <Package className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {p.manifest.name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      v{p.manifest.version} · {typeLabel(p.manifest.type)}
                      {p.manifest.author && ` · ${p.manifest.author}`}
                    </div>
                    {p.manifest.description && (
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-1">
                        {p.manifest.description}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleToggle(p.manifest.name, !p.enabled)}
                    className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title={p.enabled ? '禁用' : '启用'}
                  >
                    {p.enabled
                      ? <PowerOff className="w-4 h-4 text-amber-500" />
                      : <Power className="w-4 h-4 text-gray-400" />
                    }
                  </button>
                  <button
                    onClick={() => handleUninstall(p.manifest.name)}
                    className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="卸载"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Available Plugins (Registry) */}
      {registry.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
            <Download className="w-4 h-4" />
            可用插件 ({registry.length})
          </h3>

          <div className="space-y-2">
            {registry
              .filter(e => !plugins.some(p => p.manifest.name === e.name))
              .map(entry => (
                <div key={entry.name}
                  className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                      <Download className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {entry.name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        v{entry.version} · {typeLabel(entry.type)}
                      </div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-1">
                        {entry.description}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleInstall(entry)}
                    disabled={installing === entry.name}
                    className="shrink-0 text-xs px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-700
                      text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {installing === entry.name ? '安装中...' : '安装'}
                  </button>
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  )
}
