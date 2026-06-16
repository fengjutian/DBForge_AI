import React, { useEffect, useState } from 'react'
import { AlertTriangle, Lock } from 'lucide-react'
import TitleBar from './components/TitleBar'
import MenuBar from './components/MenuBar'
import StatusBar from './components/StatusBar'
import ConnectionPanel from './components/ConnectionPanel'
import SchemaBrowser from './components/SchemaBrowser'
import SQLEditor from './components/SQLEditor'
import TabManager from './components/TabManager'
import ResultPanel from './components/ResultPanel'
import PreviewPanel from './components/PreviewPanel'
import AIPanel from './components/AIPanel'
import BackupDialog from './components/BackupDialog'
import Settings from './components/Settings'
import Onboarding from './components/Onboarding'
import { useSettingsStore } from './store/settingsStore'
import { useEditorStore } from './store/editorStore'
import { useResultStore } from './store/resultStore'
import { useConnectionStore } from './store/connectionStore'
import { useResize } from './hooks/useResize'

// ── Error Boundary ────────────────────────────────────────────
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
          <div className="text-center space-y-4 max-w-md">
            <AlertTriangle className="w-8 h-8 mx-auto text-red-500" />
            <h1 className="text-xl font-bold text-red-600">应用发生错误</h1>
            <p className="text-sm text-gray-500">{this.state.error?.message}</p>
            <button className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
              onClick={() => this.setState({ hasError: false })}>
              重试
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Session Lock Screen ───────────────────────────────────────
function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('')
  return (
    <div className="fixed inset-0 bg-gray-900/95 flex items-center justify-center z-[100]">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 w-80 text-center space-y-4">
        <Lock className="w-8 h-8 mx-auto text-gray-400" />
        <h2 className="font-bold text-lg">会话已锁定</h2>
        <p className="text-sm text-gray-500">由于长时间未操作，会话已自动锁定</p>
        <button onClick={onUnlock}
          className="w-full py-2 rounded bg-green-600 text-white hover:bg-green-700 text-sm font-medium">
          解锁
        </button>
      </div>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────
function App(): React.ReactElement {
  const { config, loadSettings } = useSettingsStore()
  const { tabs, activeTabId } = useEditorStore()
  const { clearResult } = useResultStore()
  const { activeConnectionId } = useConnectionStore()

  // Reset result panel when switching tabs
  useEffect(() => {
    clearResult()
  }, [activeTabId])

  const [locked, setLocked] = useState(false)
  const [showBackup, setShowBackup] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [leftPanel, setLeftPanel] = useState<'connections' | 'schema'>('connections')
  const [rightPanel, setRightPanel] = useState<'ai' | null>(null)
  const [databases, setDatabases] = useState<string[]>([])

  // Resizable panels
  const [leftWidth, leftDragProps] = useResize({ direction: 'horizontal', initialSize: 224, min: 300, max: 500 })
  const [rightWidth, rightDragProps] = useResize({ direction: 'horizontal', initialSize: 288, min: 160, max: 600, reverse: true })
  const [resultHeight, resultDragProps] = useResize({ direction: 'vertical', initialSize: 320, min: 120, max: 800, reverse: true })

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // Show onboarding if not completed
  useEffect(() => {
    if (config && !config.onboardingCompleted) setShowOnboarding(true)
  }, [config])

  // Load database list when connection changes
  useEffect(() => {
    if (!activeConnectionId) { setDatabases([]); return }
    window.electronAPI.query.execute({ connectionId: activeConnectionId, sql: 'SHOW DATABASES' })
      .then(result => {
        const dbs = result.rows.map(r => Object.values(r)[0] as string).filter(Boolean)
        setDatabases(dbs)
      })
      .catch(() => setDatabases([]))
  }, [activeConnectionId])

  // Apply theme
  useEffect(() => {
    if (!config) return
    const root = document.documentElement
    if (config.theme === 'dark') {
      root.classList.add('dark')
      return
    }
    if (config.theme === 'light') {
      root.classList.remove('dark')
      return
    }
    // system
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.matches ? root.classList.add('dark') : root.classList.remove('dark')
    const handler = (e: MediaQueryListEvent) => e.matches ? root.classList.add('dark') : root.classList.remove('dark')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [config?.theme])

  // Session lock listener
  useEffect(() => {
    const unsub = window.electronAPI.session.onLock(() => setLocked(true))
    return () => { unsub() }
  }, [])

  const handleUnlock = async () => {
    await window.electronAPI.session.extend()
    setLocked(false)
  }

  const activeTab = tabs.find(t => t.id === activeTabId)

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
        {/* VSCode-style custom title bar */}
        <TitleBar
          onOpenSettings={() => setShowSettings(true)}
          onToggleAI={() => setRightPanel(p => p === 'ai' ? null : 'ai')}
          aiPanelOpen={rightPanel === 'ai'}
          onOpenBackup={() => setShowBackup(true)}
          databases={databases}
        />

        {/* Menu bar */}
        <MenuBar
          onOpenSettings={() => setShowSettings(true)}
          onToggleAI={() => setRightPanel(p => p === 'ai' ? null : 'ai')}
          aiPanelOpen={rightPanel === 'ai'}
          onToggleConnectionPanel={() => setLeftPanel('connections')}
          onToggleSchemaPanel={() => setLeftPanel('schema')}
        />

        {/* Main layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left sidebar */}
          <div className="flex flex-col border-r border-gray-200 dark:border-gray-700 flex-shrink-0 overflow-hidden"
            style={{ width: leftWidth }}>
            <div className="flex border-b border-gray-200 dark:border-gray-700">
              <button onClick={() => setLeftPanel('connections')}
                className={`flex-1 text-xs py-1.5 font-medium ${leftPanel === 'connections' ? 'bg-white dark:bg-gray-900 text-green-600 border-b-2 border-green-500' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                连接
              </button>
              <button onClick={() => setLeftPanel('schema')}
                className={`flex-1 text-xs py-1.5 font-medium ${leftPanel === 'schema' ? 'bg-white dark:bg-gray-900 text-green-600 border-b-2 border-green-500' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                Schema
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {leftPanel === 'connections' ? <ConnectionPanel /> : <SchemaBrowser />}
            </div>
          </div>

          {/* Left resize handle */}
          <div
            {...leftDragProps}
            className="w-1 flex-shrink-0 cursor-col-resize hover:bg-green-400 dark:hover:bg-green-500 active:bg-green-500 transition-colors bg-transparent group relative"
            title="拖拽调整宽度"
          >
            <div className="absolute inset-y-0 -left-0.5 -right-0.5 group-hover:bg-green-400/30 dark:group-hover:bg-green-500/30 transition-colors" />
          </div>

          {/* Center: editor + results */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            <TabManager />
            <div className="flex-1 flex flex-col overflow-hidden">
              {activeTab?.type === 'preview' ? (
                /* Preview tab: full-height result table, no editor */
                <PreviewPanel tab={activeTab} />
              ) : (
                <>
                  {/* Editor area */}
                  <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
                    {activeTab ? <SQLEditor tabId={activeTab.id} /> : (
                      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                        点击 + 新建查询标签页
                      </div>
                    )}
                  </div>

                  {/* Vertical resize handle */}
                  <div
                    {...resultDragProps}
                    className="h-1 flex-shrink-0 cursor-row-resize hover:bg-green-400 dark:hover:bg-green-500 active:bg-green-500 transition-colors bg-transparent group relative border-t border-gray-200 dark:border-gray-700"
                    title="拖拽调整高度"
                  >
                    <div className="absolute inset-x-0 -top-0.5 -bottom-0.5 group-hover:bg-green-400/30 dark:group-hover:bg-green-500/30 transition-colors" />
                  </div>

                  {/* Result panel */}
                  <div className="flex-shrink-0 flex flex-col overflow-hidden" style={{ height: resultHeight }}>
                    <ResultPanel />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right panel: AI */}
          {rightPanel === 'ai' && (
            <>
              {/* Right resize handle */}
              <div
                {...rightDragProps}
                className="w-1 flex-shrink-0 cursor-col-resize hover:bg-green-400 dark:hover:bg-green-500 active:bg-green-500 transition-colors bg-transparent group relative border-l border-gray-200 dark:border-gray-700"
                title="拖拽调整宽度"
              >
                <div className="absolute inset-y-0 -left-0.5 -right-0.5 group-hover:bg-green-400/30 dark:group-hover:bg-green-500/30 transition-colors" />
              </div>
              <div className="flex-shrink-0 overflow-hidden" style={{ width: rightWidth }}>
                <AIPanel />
              </div>
            </>
          )}
        </div>

        {/* VSCode-style status bar */}
        <StatusBar />

        {/* Modals */}
        {showBackup && <BackupDialog onClose={() => setShowBackup(false)} />}
        {showSettings && <Settings onClose={() => setShowSettings(false)} />}
        {showOnboarding && <Onboarding onComplete={() => setShowOnboarding(false)} />}
        {locked && <LockScreen onUnlock={handleUnlock} />}
      </div>
    </ErrorBoundary>
  )
}

export default App
