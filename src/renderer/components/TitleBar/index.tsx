import React, { useEffect, useState } from 'react'
import { Database, Square, Minus, X, Maximize2 } from 'lucide-react'
import { useConnectionStore } from '../../store/connectionStore'

// ── Props ─────────────────────────────────────────────────────
interface TitleBarProps {
  /** Callback to open settings */
  onOpenSettings: () => void
  /** Callback to toggle AI panel */
  onToggleAI: () => void
  /** Whether the AI panel is currently open */
  aiPanelOpen: boolean
  /** Callback to open backup dialog */
  onOpenBackup: () => void
  /** Connection database list */
  databases: string[]
}

// ── TitleBar ──────────────────────────────────────────────────
function TitleBar({
  onOpenSettings,
  onToggleAI,
  aiPanelOpen,
  onOpenBackup,
  databases
}: TitleBarProps): React.ReactElement {
  const {
    connections,
    statuses,
    activeConnectionId,
    activeDatabase,
    switchDatabase
  } = useConnectionStore()

  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    // Check initial maximized state
    window.electronAPI.window.isMaximized().then(setMaximized)
    // Listen for changes
    const unsub = window.electronAPI.window.onMaximizedChanged(setMaximized)
    return () => { unsub() }
  }, [])

  const handleMinimize = () => window.electronAPI.window.minimize()
  const handleMaximize = () => window.electronAPI.window.maximize()
  const handleClose = () => window.electronAPI.window.close()

  const conn = connections.find(c => c.id === activeConnectionId)
  const status = activeConnectionId
    ? (statuses[activeConnectionId]?.state ?? 'connecting')
    : null
  const statusColor =
    status === 'connected'
      ? 'bg-green-500'
      : status === 'error'
        ? 'bg-red-500'
        : status === 'connecting'
          ? 'bg-yellow-400 animate-pulse'
          : 'bg-gray-400'

  return (
    <div
      className={`
        flex items-center h-9 flex-shrink-0 select-none
        bg-green-600 dark:bg-green-600 bg-green-500 text-white dark:text-white
        border-b border-green-700 dark:border-green-700 border-green-600

      `}
    >
      {/* ── Left: app icon + title (draggable) ───────────── */}
      <div className="flex items-center gap-2 pl-4 pr-3 h-full titlebar-drag">
        <Database className="w-4 h-4 text-green-500" />
        <span className="font-semibold text-sm tracking-wide">DBForge AI</span>
      </div>

      {/* ── Center: connection status (draggable) ────────── */}
      <div className="flex-1 flex items-center gap-2 min-w-0 h-full titlebar-drag">
        {conn ? (
          <div className="flex items-center gap-1.5 text-[11px] ml-2">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded
              bg-[#2d2d2d] dark:bg-[#2d2d2d] bg-gray-100">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor}`} />
              <span className="font-medium text-gray-200 dark:text-gray-200 text-gray-700">{conn.name}</span>
              <span className="text-gray-500 dark:text-gray-500 font-mono">{conn.host}:{conn.port}</span>
            </div>
            {status === 'connected' && databases.length > 0 && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded
                bg-[#2d2d2d] dark:bg-[#2d2d2d] bg-gray-100">
                <Database className="w-3 h-3 text-green-400" />
                <select
                  value={activeDatabase ?? ''}
                  onChange={e => {
                    if (e.target.value) {
                      switchDatabase(activeConnectionId!, e.target.value)
                      document.body.focus()
                    }
                  }}
                  className="text-[11px] bg-transparent border-none outline-none
                    text-green-400 dark:text-green-400 text-green-600
                    cursor-pointer max-w-[140px] appearance-none"
                >
                  {!activeDatabase && <option value="" disabled>选择数据库</option>}
                  {databases.map(db => (
                    <option key={db} value={db}>{db}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded
            bg-[#2d2d2d] dark:bg-[#2d2d2d] bg-gray-100 text-[11px] text-gray-500 ml-2">
            <span className="w-2 h-2 rounded-full bg-gray-600" />
            未连接
          </div>
        )}
      </div>

      {/* ── Right: action buttons + window controls ──────── */}
      <div className="flex items-center h-full">
        {/* Action buttons */}
        <div className="flex items-center gap-1 px-2 h-full">
          <button
            onClick={onOpenBackup}
            className="px-2 py-0.5 text-[11px] rounded
              text-white dark:text-white
              hover:bg-green-700 dark:hover:bg-green-700 hover:bg-green-700"
          >
            备份
          </button>
          <button
            onClick={onOpenSettings}
            className="px-2 py-0.5 text-[11px] rounded
              text-white dark:text-white
              hover:bg-green-700 dark:hover:bg-green-700 hover:bg-green-700"
          >
            设置
          </button>
          <button
            onClick={onToggleAI}
            className={`px-2 py-0.5 text-[11px] rounded
              ${aiPanelOpen
                ? 'bg-green-800 text-white'
                : 'text-white dark:text-white hover:bg-green-700 dark:hover:bg-green-700 hover:bg-green-700'
              }`}
          >
            AI
          </button>
        </div>

        {/* Separator line */}
        <div className="w-px h-5 bg-[#3c3c3c] dark:bg-[#3c3c3c] bg-gray-300 mx-1" />

        {/* Window control buttons */}
        <div className="flex h-full">
          <button
            onClick={handleMinimize}
            className="w-11 h-full flex items-center justify-center
              text-white dark:text-white
              hover:bg-green-700 dark:hover:bg-green-700 hover:bg-green-700
              transition-colors duration-75"
            title="最小化"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleMaximize}
            className="w-11 h-full flex items-center justify-center
              text-white dark:text-white
              hover:bg-green-700 dark:hover:bg-green-700 hover:bg-green-700
              transition-colors duration-75"
            title={maximized ? '还原' : '最大化'}
          >
            {maximized ? (
              <Square className="w-3 h-3" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={handleClose}
            className="w-11 h-full flex items-center justify-center
              text-white dark:text-white
              hover:bg-red-600 hover:text-white
              transition-colors duration-75"
            title="关闭"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default TitleBar
