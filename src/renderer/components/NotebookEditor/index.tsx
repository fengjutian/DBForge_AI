// ============================================================
// NotebookEditor — SQL + Markdown notebook component
// ============================================================

import React, { useState, useCallback, useRef, useEffect } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor as monacoEditor } from 'monaco-editor'
import { Play, Plus, Trash2, ChevronDown, ChevronRight, FileText, Database, GripVertical, X } from 'lucide-react'
import type { NotebookDocument, NotebookCell, ColumnMeta } from '@dbforge/shared'
import { resolveVariables, resolveSQLVariables, hasUnresolvedVariables } from '../../utils/notebookResolver'
import MarkdownRenderer from '../MarkdownRenderer'
import DataTable from '../DataTable'

// ── Types ────────────────────────────────────────────────────

interface NotebookEditorProps {
  doc: NotebookDocument
  onChange: (doc: NotebookDocument) => void
  onClose?: () => void
  onExecuteCell: (cellId: string, sql: string) => Promise<{
    columns: ColumnMeta[]
    rows: Record<string, unknown>[]
    duration: number
  }>
  connectionName?: string
}

// ── Cell Component ───────────────────────────────────────────

function NotebookCellView({
  cell,
  cells,
  parameters,
  isExecuting,
  onUpdate,
  onDelete,
  onExecute,
  onToggleCollapse,
}: {
  cell: NotebookCell
  cells: NotebookCell[]
  parameters: Record<string, string>
  isExecuting: boolean
  onUpdate: (updated: NotebookCell) => void
  onDelete: () => void
  onExecute: () => void
  onToggleCollapse: () => void
}) {
  const [editing, setEditing] = useState(false)
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null)

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor
    if (cell.type === 'sql') {
      // Set SQL language
      setTimeout(() => {
        editor.focus()
      }, 100)
    }
  }, [cell.type])

  if (cell.type === 'markdown') {
    const resolved = resolveVariables(cell.content, cells, parameters)
    return (
      <div className="group border border-transparent hover:border-gray-200 dark:hover:border-gray-700 rounded-lg transition-colors">
        <div className="flex items-center gap-1 px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onToggleCollapse} className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
            {cell.collapsed ? <ChevronRight className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
          </button>
          <span className="text-xs text-gray-400 flex-1">Markdown</span>
          <button onClick={() => setEditing(!editing)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-1">
            {editing ? '预览' : '编辑'}
          </button>
          <button onClick={onDelete} className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20">
            <Trash2 className="w-3 h-3 text-red-400" />
          </button>
        </div>

        {cell.collapsed ? (
          <div className="px-4 py-1 text-xs text-gray-400 italic">点击展开</div>
        ) : editing ? (
          <textarea
            className="w-full min-h-[60px] px-4 py-2 text-sm font-mono bg-transparent resize-y focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
            value={cell.content}
            onChange={e => onUpdate({ ...cell, content: e.target.value })}
            onBlur={() => setEditing(false)}
            autoFocus
          />
        ) : (
          <div className="px-4 py-2 prose dark:prose-invert prose-sm max-w-none cursor-text min-h-[24px]"
            onClick={() => setEditing(true)}>
            <MarkdownRenderer content={resolved} />
          </div>
        )}
      </div>
    )
  }

  // SQL cell
  return (
    <div className={`border rounded-lg transition-colors ${
      cell.result?.error
        ? 'border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-900/10'
        : 'border-gray-200 dark:border-gray-700'
    }`}>
      {/* Cell toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 dark:bg-gray-800/50 rounded-t-lg border-b border-gray-200 dark:border-gray-700">
        <GripVertical className="w-3 h-3 text-gray-400 cursor-grab" />
        <Database className="w-3 h-3 text-blue-500" />
        <span className="text-xs text-gray-500 flex-1">
          SQL {cell.name && <span className="text-blue-500 font-mono">{cell.name}</span>}
        </span>
        <input
          className="w-24 text-xs px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-mono"
          placeholder="cell name"
          value={cell.name ?? ''}
          onChange={e => onUpdate({ ...cell, name: e.target.value || undefined })}
        />
        <button
          onClick={onExecute}
          disabled={isExecuting}
          className="flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-green-600 hover:bg-green-700 text-white font-medium disabled:opacity-50 transition-colors"
        >
          <Play className="w-3 h-3" />
          {isExecuting ? '执行中...' : '运行'}
        </button>
        <button onClick={onDelete} className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20">
          <Trash2 className="w-3 h-3 text-red-400" />
        </button>
      </div>

      {/* Editor */}
      <div className="min-h-[60px]">
        <Editor
          height="80px"
          language="sql"
          theme="vs-dark"
          value={cell.content}
          onChange={val => onUpdate({ ...cell, content: val ?? '' })}
          onMount={handleEditorMount}
          options={{
            minimap: { enabled: false },
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            fontSize: 13,
            lineHeight: 20,
            padding: { top: 8, bottom: 8 },
            automaticLayout: true,
          }}
        />
      </div>

      {/* Result */}
      {cell.result && !cell.result.error && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-400 bg-gray-50 dark:bg-gray-800/50">
            <span>{cell.result.rowCount} 行</span>
            <span>·</span>
            <span>{cell.result.duration}ms</span>
          </div>
          <div className="max-h-[300px] overflow-auto">
            <DataTable
              columns={cell.result.columns}
              rows={cell.result.rows}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {cell.result?.error && (
        <div className="border-t border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-600 dark:text-red-400 font-mono whitespace-pre-wrap">
          {cell.result.error}
        </div>
      )}
    </div>
  )
}

// ── NotebookEditor ───────────────────────────────────────────

export default function NotebookEditor({
  doc,
  onChange,
  onClose,
  onExecuteCell,
  connectionName,
}: NotebookEditorProps) {
  const [isExecuting, setIsExecuting] = useState<string | null>(null)
  const [params, setParams] = useState<Record<string, string>>(doc.parameters ?? {})

  const updateCell = useCallback((index: number, updated: NotebookCell) => {
    const cells = [...doc.cells]
    cells[index] = updated
    onChange({ ...doc, cells })
  }, [doc, onChange])

  const deleteCell = useCallback((index: number) => {
    const cells = doc.cells.filter((_, i) => i !== index)
    onChange({ ...doc, cells })
  }, [doc, onChange])

  const addCell = useCallback((type: 'sql' | 'markdown') => {
    const cell: NotebookCell = {
      id: `cell-${Date.now()}`,
      type,
      content: type === 'sql' ? 'SELECT 1' : '新 Markdown 单元格',
    }
    onChange({ ...doc, cells: [...doc.cells, cell] })
  }, [doc, onChange])

  const executeCell = useCallback(async (index: number) => {
    const cell = doc.cells[index]
    if (cell.type !== 'sql') return

    setIsExecuting(cell.id)
    try {
      // Resolve SQL variables
      const resolvedSQL = resolveSQLVariables(cell.content, doc.cells, params)
      const result = await onExecuteCell(cell.id, resolvedSQL)
      updateCell(index, {
        ...cell,
        content: cell.content, // keep original SQL (not resolved)
        result: {
          columns: result.columns,
          rows: result.rows,
          rowCount: result.rows.length,
          duration: result.duration,
        }
      })
    } catch (err) {
      updateCell(index, {
        ...cell,
        result: {
          columns: [],
          rows: [],
          rowCount: 0,
          duration: 0,
          error: err instanceof Error ? err.message : String(err),
        }
      })
    } finally {
      setIsExecuting(null)
    }
  }, [doc, params, onExecuteCell, updateCell])

  const executeAll = useCallback(async () => {
    for (let i = 0; i < doc.cells.length; i++) {
      if (doc.cells[i].type === 'sql') {
        await executeCell(i)
      }
    }
  }, [doc, executeCell])

  const toggleCollapse = useCallback((index: number) => {
    const cell = doc.cells[index]
    updateCell(index, { ...cell, collapsed: !cell.collapsed })
  }, [doc, updateCell])

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <FileText className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Notebook {connectionName && <span className="text-gray-400">· {connectionName}</span>}
        </span>
        <div className="flex-1" />
        {onClose && (
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        )}
        <button
          onClick={executeAll}
          disabled={isExecuting !== null}
          className="flex items-center gap-1 px-3 py-1 text-xs rounded bg-green-600 hover:bg-green-700 text-white font-medium disabled:opacity-50 transition-colors"
        >
          <Play className="w-3 h-3" />
          全部运行
        </button>
      </div>

      {/* Parameters */}
      {Object.keys(params).length > 0 && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800 text-xs shrink-0">
          <span className="text-blue-600 dark:text-blue-400 font-medium">参数:</span>
          {Object.entries(params).map(([key, val]) => (
            <span key={key} className="flex items-center gap-1">
              <code className="text-blue-700 dark:text-blue-300">{key}</code>
              <span>=</span>
              <input
                className="w-24 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-mono text-xs"
                value={val}
                onChange={e => {
                  const newParams = { ...params, [key]: e.target.value }
                  setParams(newParams)
                  onChange({ ...doc, parameters: newParams })
                }}
              />
            </span>
          ))}
        </div>
      )}

      {/* Cells */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {doc.cells.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <FileText className="w-8 h-8 mb-2" />
            <p className="text-sm">空 Notebook</p>
            <p className="text-xs mt-1">添加 SQL 或 Markdown 单元格开始</p>
          </div>
        )}

        {doc.cells.map((cell, i) => (
          <NotebookCellView
            key={cell.id}
            cell={cell}
            cells={doc.cells}
            parameters={params}
            isExecuting={isExecuting === cell.id}
            onUpdate={updated => updateCell(i, updated)}
            onDelete={() => deleteCell(i)}
            onExecute={() => executeCell(i)}
            onToggleCollapse={() => toggleCollapse(i)}
          />
        ))}
      </div>

      {/* Add cell bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-t border-gray-200 dark:border-gray-700 shrink-0 bg-gray-50 dark:bg-gray-800/50">
        <button
          onClick={() => addCell('markdown')}
          className="flex items-center gap-1 px-3 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
        >
          <Plus className="w-3 h-3" /> Markdown
        </button>
        <button
          onClick={() => addCell('sql')}
          className="flex items-center gap-1 px-3 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
        >
          <Plus className="w-3 h-3" /> SQL
        </button>
        <div className="flex-1" />
        <span className="text-xs text-gray-400">{doc.cells.length} cells</span>
      </div>
    </div>
  )
}
