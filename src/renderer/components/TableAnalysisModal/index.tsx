import React, { useEffect, useState } from 'react'
import { useAIStream, newStreamId } from '../../hooks/useAIStream'
import MarkdownRenderer from '../MarkdownRenderer'

export type AnalysisType = 'dependencies' | 'data-dict' | 'indexes' | 'query-perf'

interface Props {
  connectionId: string
  dbName: string
  tableName: string
  type: AnalysisType
  onClose: () => void
}

const TYPE_CONFIG: Record<AnalysisType, { label: string; icon: string; color: string }> = {
  'dependencies':  { label: '依赖关系分析', icon: '🔗', color: 'blue' },
  'data-dict':     { label: '数据字典',     icon: '📖', color: 'purple' },
  'indexes':       { label: '索引分析',     icon: '⚡', color: 'amber' },
  'query-perf':    { label: '查询性能分析', icon: '📊', color: 'green' },
}

export default function TableAnalysisModal({ connectionId, dbName, tableName, type, onClose }: Props): React.ReactElement {
  const { startStream, clearStream, isStreaming, getText, getThinking } = useAIStream()
  const [streamId] = useState(() => newStreamId(type))
  const [error, setError] = useState<string | null>(null)
  const [latency, setLatency] = useState<number | null>(null)
  const [done, setDone] = useState(false)
  const [copied, setCopied] = useState(false)

  const cfg = TYPE_CONFIG[type]

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      clearStream(streamId)
      startStream(streamId)
      setError(null)
      setDone(false)
      setLatency(null)
      try {
        let res: { content: string; latency: number }
        if (type === 'dependencies') {
          res = await window.electronAPI.ai.analyzeTableDependencies({ connectionId, dbName, tableName, streamId })
        } else if (type === 'data-dict') {
          res = await window.electronAPI.ai.generateTableDataDict({ connectionId, dbName, tableName, streamId })
        } else if (type === 'indexes') {
          res = await window.electronAPI.ai.analyzeTableIndexes({ connectionId, dbName, tableName, streamId })
        } else {
          // query-perf: fetch history first
          const history = await window.electronAPI.history.list(200)
          const relevant = history
            .filter(h => h.connectionId === connectionId)
            .map(h => ({ sql: h.sql, duration: h.duration, executedAt: h.executedAt, success: h.success }))
          res = await window.electronAPI.ai.analyzeTableQueryPerf({ connectionId, dbName, tableName, streamId, history: relevant })
        }
        if (!cancelled) { setLatency(res.latency); setDone(true) }
      } catch (e) {
        if (!cancelled) setError((e as Error).message ?? String(e))
      }
    }
    run()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const streaming = isStreaming(streamId)
  const text = getText(streamId)
  const thinking = getThinking(streamId)

  const borderColor = {
    blue: 'border-blue-500', purple: 'border-purple-500',
    amber: 'border-amber-500', green: 'border-green-500'
  }[cfg.color]

  const handleCopy = async () => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className={`bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col border-t-4 ${borderColor}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <span className="text-xl">{cfg.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">{cfg.label}</div>
            <div className="text-xs text-gray-400 font-mono truncate">{dbName}.{tableName}</div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {streaming && (
              <span className="flex items-center gap-1.5 text-xs text-blue-500">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                分析中...
              </span>
            )}
            {done && latency && (
              <span className="text-xs text-gray-400">{(latency / 1000).toFixed(1)}s</span>
            )}
            {done && text && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors"
                title="复制分析结果"
              >
                {copied ? (
                  <>
                    <span className="text-green-500">✓</span>
                    <span className="text-green-500">已复制</span>
                  </>
                ) : (
                  <>
                    <span>📋</span>
                    <span>复制</span>
                  </>
                )}
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {error && (
            <div className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded p-3">✗ {error}</div>
          )}

          {/* Thinking process */}
          {thinking && <ThinkingBox text={thinking} streaming={streaming} />}

          {/* Streaming / final content */}
          {text ? (
            <MarkdownRenderer content={text} streaming={streaming} />
          ) : streaming && !thinking ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 py-4">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function ThinkingBox({ text, streaming }: { text: string; streaming: boolean }): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false)
  return (
    <div className="rounded border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 text-xs">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded transition-colors"
      >
        {streaming
          ? <span className="w-3 h-3 border-2 border-purple-400 rounded-full animate-pulse flex-shrink-0" />
          : <span className="text-purple-400 flex-shrink-0">💭</span>}
        <span className="font-medium flex-1 text-left">思考过程</span>
        <span className="opacity-60">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 text-purple-700 dark:text-purple-300 max-h-48 overflow-y-auto leading-relaxed border-t border-purple-200 dark:border-purple-800 pt-2">
          <MarkdownRenderer content={text} streaming={streaming} />
        </div>
      )}
    </div>
  )
}
