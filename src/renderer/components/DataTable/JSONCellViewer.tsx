// ============================================================
// JSONCellViewer — Interactive JSON/JSONB cell renderer
// ============================================================
// Replaces plain JSON.stringify in DataTable for JSON columns.
// Three modes: inline (truncated preview), tree (expandable),
// and editor (Monaco popup for editing).

import React, { useState, useCallback } from 'react'
import { ChevronDown, ChevronRight, Copy, Maximize2, Code } from 'lucide-react'

interface JSONCellViewerProps {
  value: unknown
  /** Maximum characters to show in inline mode (default 60) */
  maxLength?: number
  /** Called when the user edits and saves the JSON */
  onSave?: (newValue: string) => void
  /** Whether this is a read-only display */
  readOnly?: boolean
}

// ── Helpers ──────────────────────────────────────────────────

function isJSONObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isJSONArray(v: unknown): v is unknown[] {
  return Array.isArray(v)
}

function formatJSON(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

function tryParseJSON(raw: string): { parsed: unknown; isJSON: boolean } {
  try {
    return { parsed: JSON.parse(raw), isJSON: true }
  } catch {
    return { parsed: raw, isJSON: false }
  }
}

// ── JSONTree ─────────────────────────────────────────────────

function JSONTree({
  data,
  depth = 0,
  path = '',
}: {
  data: unknown
  depth?: number
  path?: string
}) {
  const [expanded, setExpanded] = useState(depth < 3)

  if (data === null) return <span className="text-gray-400 font-mono text-xs">null</span>
  if (data === undefined) return <span className="text-gray-400 font-mono text-xs">undefined</span>

  if (typeof data === 'string') {
    const display = data.length > 80 ? data.slice(0, 80) + '...' : data
    return <span className="text-green-600 dark:text-green-400 font-mono text-xs">"{display}"</span>
  }
  if (typeof data === 'number') {
    return <span className="text-blue-600 dark:text-blue-400 font-mono text-xs">{data}</span>
  }
  if (typeof data === 'boolean') {
    return <span className="text-purple-600 dark:text-purple-400 font-mono text-xs">{String(data)}</span>
  }

  if (isJSONArray(data)) {
    if (data.length === 0) return <span className="text-gray-400 font-mono text-xs">[]</span>
    return (
      <div>
        <button onClick={() => setExpanded(!expanded)} className="inline-flex items-center gap-0.5 hover:opacity-70">
          {expanded ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
          <span className="text-gray-500 font-mono text-xs">[{data.length}]</span>
        </button>
        {expanded && (
          <div className="ml-3 border-l border-gray-200 dark:border-gray-700 pl-2">
            {data.map((item, i) => (
              <div key={i} className="flex items-start gap-1">
                <span className="text-gray-400 font-mono text-[10px] shrink-0 mt-0.5">{i}:</span>
                <JSONTree data={item} depth={depth + 1} path={`${path}[${i}]`} />
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (isJSONObject(data)) {
    const keys = Object.keys(data)
    if (keys.length === 0) return <span className="text-gray-400 font-mono text-xs">{'{}'}</span>
    return (
      <div>
        <button onClick={() => setExpanded(!expanded)} className="inline-flex items-center gap-0.5 hover:opacity-70">
          {expanded ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
          <span className="text-gray-500 font-mono text-xs">{`{${keys.length}}`}</span>
        </button>
        {expanded && (
          <div className="ml-3 border-l border-gray-200 dark:border-gray-700 pl-2">
            {keys.map(key => (
              <div key={key} className="flex items-start gap-1">
                <span className="text-amber-600 dark:text-amber-400 font-mono text-xs shrink-0">{key}:</span>
                <JSONTree data={(data as Record<string, unknown>)[key]} depth={depth + 1} path={`${path}.${key}`} />
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{String(data)}</span>
}

// ── JSONCellViewer ───────────────────────────────────────────

export default function JSONCellViewer({ value, maxLength = 60, onSave, readOnly }: JSONCellViewerProps) {
  const [mode, setMode] = useState<'inline' | 'tree' | 'editor'>('inline')
  const [editValue, setEditValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)

  const jsonStr = formatJSON(value)
  const { isJSON } = tryParseJSON(typeof value === 'string' ? value : jsonStr)

  const handleEdit = useCallback(() => {
    setEditValue(jsonStr)
    setMode('editor')
    setError(null)
    setShowModal(true)
  }, [jsonStr])

  const handleSave = useCallback(() => {
    try {
      JSON.parse(editValue) // validate
      onSave?.(editValue)
      setShowModal(false)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid JSON')
    }
  }, [editValue, onSave])

  if (!isJSON) {
    // Not JSON — render as plain text
    return (
      <span className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate block max-w-[200px]"
        title={jsonStr}>
        {jsonStr.length > maxLength ? jsonStr.slice(0, maxLength) + '...' : jsonStr}
      </span>
    )
  }

  return (
    <>
      {/* Inline display */}
      <div className="group flex items-center gap-1 min-w-0" title={mode === 'inline' ? jsonStr : undefined}>
        {mode === 'inline' ? (
          <span className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate flex-1 cursor-pointer"
            onClick={() => setMode('tree')}>
            <Code className="w-2.5 h-2.5 inline mr-1 text-blue-400" />
            {jsonStr.length > maxLength ? jsonStr.slice(0, maxLength) + '...' : jsonStr}
          </span>
        ) : (
          <div className="flex-1 text-xs max-h-[150px] overflow-y-auto">
            <JSONTree data={tryParseJSON(typeof value === 'string' ? value : jsonStr).parsed} />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={() => setMode(mode === 'tree' ? 'inline' : 'tree')}
            className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            title={mode === 'tree' ? '收拢' : '展开'}
          >
            {mode === 'tree'
              ? <ChevronRight className="w-3 h-3 text-gray-400" />
              : <ChevronDown className="w-3 h-3 text-gray-400" />
            }
          </button>

          <button
            onClick={() => navigator.clipboard.writeText(jsonStr)}
            className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            title="复制 JSON"
          >
            <Copy className="w-3 h-3 text-gray-400" />
          </button>

          {!readOnly && onSave && (
            <button
              onClick={handleEdit}
              className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
              title="编辑 JSON"
            >
              <Maximize2 className="w-3 h-3 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Editor Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-[600px] max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <span className="text-sm font-semibold">编辑 JSON</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  className="px-3 py-1 text-xs rounded bg-green-600 hover:bg-green-700 text-white font-medium"
                >
                  保存
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-lg"
                >
                  ×
                </button>
              </div>
            </div>
            {error && (
              <div className="px-4 py-2 text-xs text-red-500 bg-red-50 dark:bg-red-900/20">{error}</div>
            )}
            <textarea
              className="flex-1 p-4 text-xs font-mono bg-gray-50 dark:bg-gray-900 resize-none focus:outline-none"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              spellCheck={false}
            />
          </div>
        </div>
      )}
    </>
  )
}
