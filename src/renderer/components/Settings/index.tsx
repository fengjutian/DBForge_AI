import React, { useEffect, useState } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import type { AIProvider, AuditEntry } from '../../../shared/types'

const PROVIDERS: AIProvider[] = ['openai', 'groq', 'claude', 'deepseek', 'ollama']
const MODELS: Record<AIProvider, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  groq: ['llama3-70b-8192', 'llama3-8b-8192', 'mixtral-8x7b-32768'],
  claude: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  ollama: ['llama3', 'codellama', 'mistral']
}

const DEFAULT_MODEL: Record<AIProvider, string> = {
  openai: 'gpt-4o-mini',
  groq: 'llama3-70b-8192',
  claude: 'claude-3-5-sonnet-20241022',
  deepseek: 'deepseek-chat',
  ollama: 'llama3'
}

const TABS = ['AI 配置', '外观', 'mysqldump', '快捷键', '审计日志', '关于'] as const
type SettingsTab = typeof TABS[number]

interface Props { onClose: () => void }

export default function Settings({ onClose }: Props): React.ReactElement {
  const { config, loadSettings, updateAIConfig, setTheme, setLanguage, updateShortcut } = useSettingsStore()
  const [activeTab, setActiveTab] = useState<SettingsTab>('AI 配置')
  const [dumpPath, setDumpPath] = useState('')
  const [dumpStatus, setDumpStatus] = useState<string | null>(null)
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [editingShortcut, setEditingShortcut] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [apiKeySaved, setApiKeySaved] = useState(false)

  useEffect(() => { loadSettings() }, [loadSettings])
  useEffect(() => {
    if (config?.mysqldumpPath) setDumpPath(config.mysqldumpPath)
  }, [config])

  // Load decrypted API key on mount
  useEffect(() => {
    window.electronAPI.ai.getConfig().then(cfg => {
      if (cfg?.apiKey) setApiKey(cfg.apiKey)
    }).catch(() => {})
  }, [])

  const detectDump = async () => {
    const path = await window.electronAPI.backup.detectTool()
    if (path) { setDumpPath(path); setDumpStatus(`✓ 检测到: ${path}`) }
    else setDumpStatus('✗ 未检测到 mysqldump，请手动指定路径')
  }

  const loadAudit = async () => {
    const entries = await window.electronAPI.audit.list()
    setAuditEntries(entries)
  }

  useEffect(() => {
    if (activeTab === '审计日志') loadAudit()
  }, [activeTab])

  if (!config) return <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"><div className="bg-white dark:bg-gray-800 rounded-lg p-8 text-sm">加载中...</div></div>

  const ai = config.ai

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[680px] h-[520px] flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-36 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col py-2">
          {TABS.map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`text-left text-sm px-4 py-2 ${activeTab === t ? 'bg-green-50 dark:bg-green-900/30 text-green-600 font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
              {t}
            </button>
          ))}
          <div className="flex-1" />
          <button onClick={onClose} className="text-sm px-4 py-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">关闭</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'AI 配置' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-sm">AI 配置</h3>
              <Field label="提供商">
                <select className={sel} value={ai.provider} onChange={e => {
                  const provider = e.target.value as AIProvider
                  updateAIConfig({ provider, model: DEFAULT_MODEL[provider] })
                  setApiKey('')
                  setApiKeySaved(false)
                  // reload key for new provider
                  window.electronAPI.ai.getConfig().then(cfg => {
                    if (cfg?.apiKey) setApiKey(cfg.apiKey)
                  }).catch(() => {})
                }}>
                  {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="模型">
                <select className={sel} value={ai.model} onChange={e => updateAIConfig({ model: e.target.value })}>
                  {(MODELS[ai.provider] ?? []).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              {ai.provider !== 'ollama' && (
                <Field label="API Key">
                  <div className="flex gap-2">
                    <input className={inp} type="password"
                      placeholder="sk-..."
                      value={apiKey}
                      onChange={e => { setApiKey(e.target.value); setApiKeySaved(false) }}
                      onBlur={() => { if (apiKey) { updateAIConfig({ apiKey }); setApiKeySaved(true) } }}
                      onKeyDown={e => { if (e.key === 'Enter' && apiKey) { updateAIConfig({ apiKey }); setApiKeySaved(true) } }}
                    />
                    {apiKeySaved && <span className="text-xs text-green-500 self-center shrink-0">✓ 已保存</span>}
                  </div>
                </Field>
              )}
              {ai.provider === 'ollama' && (
                <Field label="Base URL">
                  <input className={inp} value={ai.baseUrl ?? 'http://localhost:11434'} onChange={e => updateAIConfig({ baseUrl: e.target.value })} />
                </Field>
              )}
              <Field label="模式">
                <select className={sel} value={ai.mode} onChange={e => updateAIConfig({ mode: e.target.value as 'readonly' | 'full' })}>
                  <option value="readonly">只读（仅生成 SELECT）</option>
                  <option value="full">完整（允许所有 SQL）</option>
                </select>
              </Field>
              <Field label={`温度 (${ai.temperature})`}>
                <input type="range" min="0" max="1" step="0.1" value={ai.temperature}
                  onChange={e => updateAIConfig({ temperature: +e.target.value })} className="w-full" />
              </Field>
            </div>
          )}

          {activeTab === '外观' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-sm">外观与语言</h3>
              <Field label="主题">
                <select className={sel} value={config.theme} onChange={e => setTheme(e.target.value as 'system' | 'light' | 'dark')}>
                  <option value="system">跟随系统</option>
                  <option value="light">浅色</option>
                  <option value="dark">深色</option>
                </select>
              </Field>
              <Field label="语言">
                <select className={sel} value={config.language} onChange={e => setLanguage(e.target.value as 'zh' | 'en')}>
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                </select>
              </Field>
            </div>
          )}

          {activeTab === 'mysqldump' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-sm">mysqldump 配置</h3>
              <Field label="路径">
                <div className="flex gap-2">
                  <input className={inp} value={dumpPath} onChange={e => setDumpPath(e.target.value)} placeholder="/usr/bin/mysqldump" />
                  <button onClick={detectDump} className="text-sm px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 whitespace-nowrap">自动检测</button>
                </div>
              </Field>
              {dumpStatus && <p className={`text-xs ${dumpStatus.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>{dumpStatus}</p>}
            </div>
          )}

          {activeTab === '快捷键' && (
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">快捷键管理</h3>
              {Object.entries(config.shortcuts ?? {}).map(([action, shortcut]) => (
                <div key={action} className="flex items-center justify-between">
                  <span className="text-sm">{action}</span>
                  {editingShortcut === action ? (
                    <input autoFocus className={`${inp} w-40`} defaultValue={shortcut}
                      onBlur={e => { updateShortcut(action, e.target.value); setEditingShortcut(null) }}
                      onKeyDown={e => { if (e.key === 'Escape') setEditingShortcut(null) }} />
                  ) : (
                    <button onClick={() => setEditingShortcut(action)}
                      className="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600">
                      {shortcut || '未设置'}
                    </button>
                  )}
                </div>
              ))}
              {Object.keys(config.shortcuts ?? {}).length === 0 && (
                <p className="text-xs text-gray-400">暂无自定义快捷键</p>
              )}
            </div>
          )}

          {activeTab === '审计日志' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">审计日志</h3>
                <button onClick={loadAudit} className="text-xs text-green-500 hover:underline">刷新</button>
              </div>
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {auditEntries.length === 0 && <p className="text-xs text-gray-400">暂无审计记录</p>}
                {auditEntries.map(e => (
                  <div key={e.id} className={`text-xs p-2 rounded border ${e.result === 'success' ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20' : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'}`}>
                    <div className="flex justify-between">
                      <span className="font-mono truncate max-w-[300px]">{e.sql}</span>
                      <span className="text-gray-400 ml-2">{new Date(e.executedAt).toLocaleString()}</span>
                    </div>
                    <div className="text-gray-400 mt-0.5">{e.connectionName} · {e.affectedRows} 行受影响</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === '关于' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-sm">关于</h3>
              <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <p>DBForge AI v{config.version}</p>
                <p>跨平台桌面数据库管理工具</p>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={config.crashReportEnabled}
                    onChange={e => window.electronAPI.settings.set({ crashReportEnabled: e.target.checked })} />
                  发送崩溃报告（帮助改进产品）
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const sel = 'w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none'
const inp = 'flex-1 text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-green-500'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  )
}
