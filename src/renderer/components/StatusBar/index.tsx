import React from 'react'
import {
  Database,
  Server,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Sun,
  Moon,
  Globe
} from 'lucide-react'
import { useConnectionStore } from '../../store/connectionStore'
import { useResultStore } from '../../store/resultStore'
import { useSettingsStore } from '../../store/settingsStore'
import type { DatabaseType } from '../../../shared/types'

// ── Database type icons ───────────────────────────────────────
const dbTypeLabels: Record<DatabaseType, string> = {
  mysql: 'MySQL',
  postgresql: 'PostgreSQL',
  sqlite: 'SQLite',
  mssql: 'MSSQL',
  oracle: 'Oracle'
}

// ── StatusBar ─────────────────────────────────────────────────
function StatusBar(): React.ReactElement {
  const {
    connections,
    statuses,
    activeConnectionId,
    activeDatabase
  } = useConnectionStore()

  const { status: queryStatus, result } = useResultStore()
  const { config } = useSettingsStore()

  const conn = connections.find(c => c.id === activeConnectionId)
  const connStatus = activeConnectionId
    ? (statuses[activeConnectionId]?.state ?? 'connecting')
    : null

  // ── Query status display ────────────────────────────────────
  const queryStatusIcon = () => {
    switch (queryStatus) {
      case 'running':
        return <Loader2 className="w-3 h-3 animate-spin" />
      case 'error':
        return <XCircle className="w-3 h-3 text-red-400" />
      case 'cancelled':
        return <AlertCircle className="w-3 h-3 text-yellow-400" />
      default:
        return result ? <CheckCircle2 className="w-3 h-3 text-green-400" /> : null
    }
  }

  const queryStatusText = () => {
    switch (queryStatus) {
      case 'running':
        return '查询执行中...'
      case 'error':
        return '查询失败'
      case 'cancelled':
        return '已取消'
      default:
        return result ? `${result.rows.length} 行` : '就绪'
    }
  }

  const themeLabel = config?.theme === 'dark' ? '深色' : config?.theme === 'light' ? '浅色' : '跟随系统'
  const languageLabel = config?.language === 'en' ? 'EN' : '中文'

  return (
    <div className="flex items-center h-[22px] flex-shrink-0 select-none
      bg-[#007acc] text-white text-[11px] px-2 gap-1"
    >
      {/* ── Left section ──────────────────────────────────── */}
      <div className="flex items-center gap-1 flex-1 min-w-0">
        {/* Connection status */}
        {conn ? (
          <>
            {connStatus === 'connected' ? (
              <Server className="w-3 h-3 text-green-200" />
            ) : connStatus === 'connecting' ? (
              <Loader2 className="w-3 h-3 animate-spin text-yellow-200" />
            ) : (
              <XCircle className="w-3 h-3 text-red-300" />
            )}
            <span className="truncate max-w-[120px]">{conn.name}</span>
            <span className="text-white/60">|</span>
            <span className="text-white/70 text-[10px]">{dbTypeLabels[conn.databaseType]}</span>
            {activeDatabase && (
              <>
                <span className="text-white/60">|</span>
                <Database className="w-3 h-3 text-green-200 flex-shrink-0" />
                <span className="truncate max-w-[100px]">{activeDatabase}</span>
              </>
            )}
          </>
        ) : (
          <span className="text-white/60">未连接</span>
        )}
      </div>

      {/* ── Right section ─────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {/* Row count / query status */}
        {queryStatusIcon() && (
          <span className="flex items-center gap-1 text-white/80">
            {queryStatusIcon()}
            <span>{queryStatusText()}</span>
          </span>
        )}

        <span className="text-white/40">|</span>

        {/* Encoding */}
        <span className="flex items-center gap-1 text-white/80">
          <Globe className="w-3 h-3" />
          UTF-8
        </span>

        <span className="text-white/40">|</span>

        {/* Theme */}
        <span className="flex items-center gap-1 text-white/80">
          {config?.theme === 'dark' ? (
            <Moon className="w-3 h-3" />
          ) : (
            <Sun className="w-3 h-3" />
          )}
          {themeLabel}
        </span>

        <span className="text-white/40">|</span>

        {/* Language */}
        <span className="text-white/80">{languageLabel}</span>
      </div>
    </div>
  )
}

export default StatusBar
