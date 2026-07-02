import React, { useState, useCallback, useEffect } from 'react'
import { X, Search, RefreshCw, ChevronLeft, ChevronRight, Plus, Pencil, Save, Undo2, Bot, ChevronUp, ChevronDown, Lightbulb, Wrench } from 'lucide-react'
import type { Tab } from '../../store/editorStore'
import { useEditorStore } from '../../store/editorStore'
import type { FilterRule } from '@dbforge/shared'
import { buildWhereClause } from '@dbforge/shared'
import DataTable from '../DataTable'
import FormulaBar from '../DataTable/FormulaBar'
import SelectionBar from '../DataTable/SelectionBar'
import { useFormulaStore } from '../../store/formulaStore'
import { useEditBufferStore } from '../../store/editBufferStore'
import { useSessionStore } from '../../store/sessionStore'

interface PreviewPanelProps {
  tab: Tab
}

export default function PreviewPanel({ tab }: PreviewPanelProps): React.ReactElement {
  const { updatePreviewTab } = useEditorStore()
  const [page, setPageState] = useState(1)
  const [pageSize, setPageSizeState] = useState(tab.formulaMode ? 1000 : 100)
  const [sort, setSort] = useState<{ column: string | null; direction: 'asc' | 'desc' }>({ column: null, direction: 'asc' })
  const [showSearch, setShowSearch] = useState(false)
  const [search, setSearch] = useState('')
  const [jumpInput, setJumpInput] = useState('')
  const [filters, setFilters] = useState<Record<string, FilterRule>>({})
  const [showComputedColInput, setShowComputedColInput] = useState(false)
  const [computedColName, setComputedColName] = useState('')
  const [computedColExpr, setComputedColExpr] = useState('')
  const ccInputRef = React.useRef<HTMLInputElement>(null)

  // ── Edit mode ──────────────────────────────────────────
  const [editingMode, setEditingMode] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  const addComputedColumn = useFormulaStore(s => s.addComputedColumn)
  const removeComputedColumn = useFormulaStore(s => s.removeComputedColumn)
  const computedColumns = useFormulaStore(s => s.computedColumns)
  const setFormulaBarVisible = useFormulaStore(s => s.setFormulaBarVisible)

  // ── Edit buffer store ─────────────────────────────────
  const editHasChanges = useEditBufferStore(s => s.hasChanges)
  const editGetChangeSummary = useEditBufferStore(s => s.getChangeSummary)
  const editInitBuffer = useEditBufferStore(s => s.initBuffer)
  const editSetCell = useEditBufferStore(s => s.setCell)
  const editClearBuffer = useEditBufferStore(s => s.clearBuffer)
  const editGenerateStructuredChanges = useEditBufferStore(s => s.generateStructuredChanges)
  const editGetCellValue = useEditBufferStore(s => s.getCellValue)
  const editGetRowState = useEditBufferStore(s => s.getRowState)
  /** 订阅版本号，确保 editDisplayRows 在编辑后重新计算 */
  const editVersion = useEditBufferStore(s => s._version)

  // Show formula bar by default for formula-mode tabs
  useEffect(() => {
    if (tab.formulaMode) setFormulaBarVisible(true)
  }, [tab.formulaMode, setFormulaBarVisible])

  const result = tab.previewResult
  const status = tab.previewStatus ?? 'idle'
  const error = tab.previewError

  // ── AI Error Explanation ──────────────────────────────────
  const [previewAiAvailable, setPreviewAiAvailable] = useState(false)
  const [previewAiExplaining, setPreviewAiExplaining] = useState(false)
  const [previewAiAnalysis, setPreviewAiAnalysis] = useState<{ diagnosis: string; suggestions: string[]; fixedSql?: string; loading: boolean } | null>(null)
  const [previewAiExpanded, setPreviewAiExpanded] = useState(false)

  // Check if AI is configured when error changes
  useEffect(() => {
    if (status === 'error' && error) {
      setPreviewAiAnalysis(null)
      setPreviewAiExpanded(false)
      window.electronAPI.settings.get().then(cfg => {
        setPreviewAiAvailable(!!cfg.ai.apiKeyEncrypted)
      }).catch(() => setPreviewAiAvailable(false))
    }
  }, [status, error])

  const handlePreviewAiExplain = async () => {
    if (!error || !result?.sql || previewAiExplaining) return
    setPreviewAiExplaining(true)
    setPreviewAiExpanded(true)
    setPreviewAiAnalysis(null)
    try {
      const res = await window.electronAPI.ai.diagnoseError({ sql: result.sql, errorMessage: error })
      setPreviewAiAnalysis({ diagnosis: res.diagnosis, suggestions: res.suggestions, fixedSql: res.fixedSql, loading: false })
    } catch {
      setPreviewAiAnalysis({ diagnosis: 'AI 分析失败，请检查 AI 配置是否正确', suggestions: [], loading: false })
    } finally {
      setPreviewAiExplaining(false)
    }
  }
  const total = tab.previewTotal ?? 0
  const columns = result?.columns ?? []
  const rows = result?.rows ?? []
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const whereClause = buildWhereClause(filters)

  const fetchPage = useCallback(async (newPage: number, newPageSize: number, newSort: typeof sort, whereClause = '') => {
    if (!tab.connectionId || !tab.previewTable) return
    const { dbName, tableName } = tab.previewTable
    const offset = (newPage - 1) * newPageSize
    const orderClause = newSort.column
      ? ` ORDER BY \`${newSort.column}\` ${newSort.direction.toUpperCase()}`
      : ''
    updatePreviewTab(tab.id, { previewStatus: 'running', previewError: null })
    try {
      const sql = `SELECT * FROM \`${dbName}\`.\`${tableName}\`${whereClause}${orderClause} LIMIT ${newPageSize} OFFSET ${offset}`
      const dataResult = await window.electronAPI.query.execute({
        connectionId: tab.connectionId,
        sql,
        queryId: `preview_${tab.id}_${newPage}`
      })
      updatePreviewTab(tab.id, { previewResult: dataResult, previewStatus: 'idle' })
    } catch (e) {
      updatePreviewTab(tab.id, { previewStatus: 'error', previewError: (e as Error).message })
    }
  }, [tab.id, tab.connectionId, tab.previewTable, updatePreviewTab])

  const setPage = (newPage: number) => {
    setPageState(newPage)
    fetchPage(newPage, pageSize, sort, whereClause)
  }

  const setPageSize = (newSize: number) => {
    setPageSizeState(newSize)
    setPageState(1)
    fetchPage(1, newSize, sort, whereClause)
  }

  const handleSort = (col: string, dir?: 'asc' | 'desc') => {
    const newSort = dir
      ? { column: col, direction: dir }
      : sort.column === col
      ? { column: col, direction: sort.direction === 'asc' ? 'desc' as const : 'asc' as const }
      : { column: col, direction: 'asc' as const }
    setSort(newSort)
    fetchPage(page, pageSize, newSort, whereClause)
  }

  const handleFiltersChange = useCallback(async (newFilters: Record<string, FilterRule>) => {
    setFilters(newFilters)
    if (!tab.connectionId || !tab.previewTable) return
    const { dbName, tableName } = tab.previewTable
    const wc = buildWhereClause(newFilters)
    try {
      const countResult = await window.electronAPI.query.execute({
        connectionId: tab.connectionId,
        sql: `SELECT COUNT(*) AS cnt FROM \`${dbName}\`.\`${tableName}\`${wc}`,
        queryId: `preview_count_${tab.id}`
      })
      const newTotal = (countResult.rows[0]?.cnt as number) ?? 0
      updatePreviewTab(tab.id, { previewTotal: newTotal })
      setPageState(1)
      fetchPage(1, pageSize, sort, wc)
    } catch (e) {
      updatePreviewTab(tab.id, { previewError: (e as Error).message })
    }
  }, [tab.id, tab.connectionId, tab.previewTable, pageSize, sort, updatePreviewTab])

  const handleJump = () => {
    const n = parseInt(jumpInput, 10)
    if (!isNaN(n) && n >= 1 && n <= totalPages) setPage(n)
    setJumpInput('')
  }

  const handleExportCSV = () => {
    if (!result) return
    const header = result.columns.map(c => c.name).join(',')
    const body = result.rows.map(r => result.columns.map(c => JSON.stringify(r[c.name] ?? '')).join(',')).join('\n')
    download(`data:text/csv;charset=utf-8,${encodeURIComponent(header + '\n' + body)}`, 'preview.csv')
  }

  const handleExportJSON = () => {
    if (!result) return
    download(`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(result.rows, null, 2))}`, 'preview.json')
  }

  const handleExportExcel = async () => {
    if (!result) return
    const ExcelJS = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Preview')
    ws.addRow(result.columns.map(c => c.name))
    result.rows.forEach(r => ws.addRow(result.columns.map(c => r[c.name] as string ?? '')))
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'preview.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  const handleRefresh = () => {
    if (editingMode && editHasChanges()) {
      if (!confirm('刷新将丢失所有未保存的修改，确定继续？')) return
      editClearBuffer()
      setEditingMode(false)
      setSaveStatus('idle')
      setSaveError(null)
    }
    setFilters({})
    setPageState(1)
    setSort({ column: null, direction: 'asc' })
    fetchPage(1, pageSize, { column: null, direction: 'asc' })
    // Re-count without filters
    if (tab.connectionId && tab.previewTable) {
      const { dbName, tableName } = tab.previewTable
      window.electronAPI.query.execute({
        connectionId: tab.connectionId,
        sql: `SELECT COUNT(*) AS cnt FROM \`${dbName}\`.\`${tableName}\``,
        queryId: `preview_count_refresh_${tab.id}`
      }).then(countResult => {
        const newTotal = (countResult.rows[0]?.cnt as number) ?? 0
        updatePreviewTab(tab.id, { previewTotal: newTotal })
      }).catch(() => {})
    }
  }

  // ── Edit mode handlers ────────────────────────────────

  const enterEditMode = useCallback(() => {
    if (!result || !tab.connectionId || !tab.previewTable) return

    // Get primary keys from cached schema
    const schema = useSessionStore.getState().getSchema(tab.connectionId)
    const tableInfo = schema?.databases
      .find(d => d.name === tab.previewTable!.dbName)
      ?.tables.find(t => t.name === tab.previewTable!.tableName)
    const primaryKeys = tableInfo?.primaryKeys ?? []

    editInitBuffer({
      connectionId: tab.connectionId,
      database: tab.previewTable.dbName,
      table: tab.previewTable.tableName,
      columns: result.columns,
      primaryKeys,
      rows: result.rows,
      querySql: result.sql,
      capturedAt: Date.now()
    })

    setEditingMode(true)
    setSaveStatus('idle')
    setSaveError(null)
  }, [result, tab.connectionId, tab.previewTable, editInitBuffer])

  const exitEditMode = useCallback(() => {
    if (editHasChanges()) {
      if (!confirm('放弃所有未保存的修改？')) return
    }
    editClearBuffer()
    setEditingMode(false)
    setSaveStatus('idle')
    setSaveError(null)
  }, [editHasChanges, editClearBuffer])

  const handleSave = useCallback(async () => {
    if (!tab.connectionId || !tab.previewTable) return

    const structured = editGenerateStructuredChanges()
    if (!structured) {
      setSaveStatus('idle')
      return
    }

    setSaveStatus('saving')
    setSaveError(null)

    try {
      const patchResult = await window.electronAPI.snapshot.executePatch({
        connectionId: tab.connectionId,
        database: tab.previewTable.dbName,
        table: tab.previewTable.tableName,
        primaryKeys: useEditBufferStore.getState().getSnapshot()?.primaryKeys ?? [],
        changes: structured.changes,
        optimisticLock: true
      })

      if (patchResult.success && patchResult.conflicts && patchResult.conflicts.length === 0) {
        setSaveStatus('success')
        editClearBuffer()
        setEditingMode(false)
        // Refresh data
        fetchPage(page, pageSize, sort, whereClause)
        // Update total count
        window.electronAPI.query.execute({
          connectionId: tab.connectionId,
          sql: `SELECT COUNT(*) AS cnt FROM \`${tab.previewTable.dbName}\`.\`${tab.previewTable.tableName}\``,
          queryId: `preview_count_save_${tab.id}`
        }).then(countResult => {
          const newTotal = (countResult.rows[0]?.cnt as number) ?? 0
          updatePreviewTab(tab.id, { previewTotal: newTotal })
        }).catch(() => {})
      } else if (patchResult.conflicts && patchResult.conflicts.length > 0) {
        setSaveStatus('error')
        setSaveError(`${patchResult.conflicts.length} 行发生冲突（已被其他用户修改），其余修改已保存`)
      } else {
        setSaveStatus('error')
        setSaveError(patchResult.error ?? '保存失败')
      }
    } catch (err) {
      setSaveStatus('error')
      setSaveError(err instanceof Error ? err.message : '保存失败')
    }
  }, [tab.connectionId, tab.previewTable, tab.id, editGenerateStructuredChanges, editClearBuffer, fetchPage, page, pageSize, sort, whereClause, updatePreviewTab])

  const handleCellEdit = useCallback((rowIndex: number, col: string, newValue: string, oldValue: unknown) => {
    editSetCell(rowIndex, col, newValue, oldValue)
  }, [editSetCell])

  /** 单格编辑确认后直接保存到数据库 */
  const handleCellSave = useCallback(async (rowIndex: number, col: string, newValue: string, oldValue: unknown) => {
    if (!tab.connectionId || !tab.previewTable) return

    const snapshot = useEditBufferStore.getState().getSnapshot()
    if (!snapshot) return

    const structured = editGenerateStructuredChanges()
    if (!structured) return

    try {
      const patchResult = await window.electronAPI.snapshot.executePatch({
        connectionId: tab.connectionId,
        database: tab.previewTable.dbName,
        table: tab.previewTable.tableName,
        primaryKeys: snapshot.primaryKeys,
        changes: structured.changes,
        optimisticLock: true
      })

      if (patchResult.success && patchResult.conflicts && patchResult.conflicts.length === 0) {
        editClearBuffer()
        // 重新获取最新数据
        fetchPage(page, pageSize, sort, whereClause)
        // 更新总数
        window.electronAPI.query.execute({
          connectionId: tab.connectionId,
          sql: `SELECT COUNT(*) AS cnt FROM \`${tab.previewTable.dbName}\`.\`${tab.previewTable.tableName}\``,
          queryId: `preview_cell_save_${tab.id}`
        }).then(countResult => {
          const newTotal = (countResult.rows[0]?.cnt as number) ?? 0
          updatePreviewTab(tab.id, { previewTotal: newTotal })
        }).catch(() => {})
      } else if (patchResult.conflicts && patchResult.conflicts.length > 0) {
        setSaveStatus('error')
        setSaveError(`${patchResult.conflicts.length} 行发生冲突（已被其他用户修改）`)
      } else {
        setSaveStatus('error')
        setSaveError(patchResult.error ?? '保存失败')
      }
    } catch (err) {
      setSaveStatus('error')
      setSaveError(err instanceof Error ? err.message : '保存失败')
    }
  }, [tab.connectionId, tab.previewTable, tab.id, editGenerateStructuredChanges, editClearBuffer, fetchPage, page, pageSize, sort, whereClause, updatePreviewTab])

  // Build display rows for edit mode (merge snapshot + changes)
  const editDisplayRows = React.useMemo(() => {
    if (!editingMode || !result) return rows
    return result.rows.map((row, idx) => {
      const state = editGetRowState(idx)
      if (state === 'deleted') return { ...row, __edit_state: 'deleted' as const }
      const displayRow: Record<string, unknown> = { ...row, __edit_state: state }
      if (state === 'modified') {
        for (const col of result.columns) {
          const val = editGetCellValue(idx, col.name)
          if (val !== undefined) displayRow[col.name] = val
        }
      }
      return displayRow
    })
  }, [editingMode, result, rows, editGetRowState, editGetCellValue, editVersion])

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Toolbar */}
      <div className={`flex items-center gap-2 px-3 py-1.5 border-b flex-shrink-0 text-white ${editingMode ? 'bg-orange-600 dark:bg-orange-700 border-orange-500 dark:border-orange-600' : 'bg-green-600 dark:bg-green-700 border-green-500 dark:border-green-600'}`}>
        {editingMode ? (
          <>
            <span className="text-xs font-semibold flex items-center gap-1">
              <Pencil className="w-3 h-3" />编辑模式
            </span>
            {editHasChanges() && (() => {
              const s = editGetChangeSummary()
              return (
                <span className="text-xs text-orange-200">
                  修改 {s.modified} · 删除 {s.deleted} · 新增 {s.inserted}
                </span>
              )
            })()}
            {saveStatus === 'saving' && <span className="text-xs text-yellow-300 animate-pulse">保存中...</span>}
            {saveStatus === 'success' && <span className="text-xs text-green-300">✓ 已保存</span>}
            {saveStatus === 'error' && saveError && <span className="text-xs text-red-300" title={saveError}>{saveError}</span>}
          </>
        ) : (
          <>
            {status === 'running' ? (
              <span className="text-xs text-yellow-500 animate-pulse">加载中...</span>
            ) : (
              <>
                {result && <span className="text-xs text-white/80">{result.executionTime}ms</span>}
                {status === 'error' && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-xs text-red-500"><X className="w-3 h-3 inline mr-1 align-middle" />{error}</span>
                    {previewAiAvailable && !previewAiAnalysis && (
                      <button onClick={handlePreviewAiExplain} disabled={previewAiExplaining}
                        className="text-xs px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800 disabled:opacity-50 flex items-center gap-1">
                        <Bot className="w-3 h-3" />
                        {previewAiExplaining ? '分析中...' : 'AI 分析'}
                      </button>
                    )}
                    {previewAiAvailable && previewAiAnalysis && !previewAiAnalysis.loading && (
                      <button onClick={() => setPreviewAiExpanded(!previewAiExpanded)}
                        className="text-xs px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800 flex items-center gap-1">
                        <Bot className="w-3 h-3" />
                        {previewAiExpanded ? '收起分析' : 'AI 分析'}
                        {previewAiExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                )}
                {/* Computed column tags */}
                {computedColumns.map(cc => (
                  <span key={cc.id} className="inline-flex items-center gap-1 text-xs bg-blue-500/20 text-blue-200 px-1.5 py-0.5 rounded border border-blue-400/30">
                    <span className="font-mono">{cc.name}</span>
                    <button onClick={() => removeComputedColumn(cc.id)} className="hover:text-red-300 leading-none ml-0.5"><X className="w-2.5 h-2.5" /></button>
                  </span>
                ))}
              </>
            )}
          </>
        )}
        <div className="flex-1" />
        {result && !editingMode && (
          <button onClick={enterEditMode}
            className="text-xs px-2 py-1 rounded border border-orange-400 dark:border-orange-500 hover:bg-orange-500 dark:hover:bg-orange-600 bg-orange-600/30"
            title="进入编辑模式">
            <Pencil className="w-3 h-3 inline mr-1" />编辑
          </button>
        )}
        {result && editingMode && (
          <>
            <button onClick={handleSave}
              disabled={!editHasChanges() || saveStatus === 'saving'}
              className="text-xs px-2 py-1 rounded border border-orange-300 dark:border-orange-500 hover:bg-orange-500 dark:hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed"
              title="保存修改">
              <Save className="w-3 h-3 inline mr-1" />保存
            </button>
            <button onClick={exitEditMode}
              className="text-xs px-2 py-1 rounded border border-orange-300 dark:border-orange-500 hover:bg-orange-500 dark:hover:bg-orange-600"
              title="放弃修改并退出编辑">
              <Undo2 className="w-3 h-3 inline mr-1" />放弃
            </button>
          </>
        )}
        {result && (
          <>
            <button onClick={() => setShowSearch(!showSearch)}
              className={`text-xs px-2 py-1 rounded border hover:bg-green-500 dark:hover:bg-green-600 ${editingMode ? 'border-orange-400 dark:border-orange-500' : 'border-green-400 dark:border-green-500'}`}>
              <Search className="w-3 h-3 inline mr-1" />搜索
            </button>
            {!editingMode && (
              <>
                <button onClick={() => { setShowComputedColInput(true); setTimeout(() => ccInputRef.current?.focus(), 50) }}
                  className="text-xs px-2 py-1 rounded border border-blue-300 dark:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-300"
                  title="添加计算列">
                  <Plus className="w-3 h-3 inline mr-1" />计算列
                </button>
                <button onClick={handleExportCSV} className="text-xs px-2 py-1 rounded border border-green-400 dark:border-green-500 hover:bg-green-500 dark:hover:bg-green-600">CSV</button>
                <button onClick={handleExportJSON} className="text-xs px-2 py-1 rounded border border-green-400 dark:border-green-500 hover:bg-green-500 dark:hover:bg-green-600">JSON</button>
                <button onClick={handleExportExcel} className="text-xs px-2 py-1 rounded border border-green-400 dark:border-green-500 hover:bg-green-500 dark:hover:bg-green-600">Excel</button>
                <button onClick={handleRefresh}
                  className="text-xs px-2 py-1 rounded border border-green-400 dark:border-green-500 hover:bg-green-500 dark:hover:bg-green-600"
                  title="刷新数据">
                  <RefreshCw className="w-3 h-3 inline mr-1" />刷新
                </button>
              </>
            )}
          </>
        )}
      </div>

      {/* ── AI Error Explanation Panel ────────────────────────── */}
      {status === 'error' && (previewAiExplaining || (previewAiAnalysis && previewAiExpanded)) && (
        <div className="border-b border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 px-3 py-2 flex-shrink-0">
          {previewAiExplaining ? (
            <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
              <Bot className="w-4 h-4 animate-pulse" />AI 分析中...
            </div>
          ) : previewAiAnalysis && (
            <div className="space-y-2 text-xs">
              {/* Diagnosis */}
              <div>
                <div className="font-medium text-red-700 dark:text-red-300 flex items-center gap-1 mb-1">
                  <Lightbulb className="w-3.5 h-3.5" />错误分析
                </div>
                <div className="text-red-600 dark:text-red-400 whitespace-pre-wrap leading-relaxed">
                  {previewAiAnalysis.diagnosis}
                </div>
              </div>
              {/* Suggestions */}
              {previewAiAnalysis.suggestions.length > 0 && (
                <div>
                  <div className="font-medium text-red-700 dark:text-red-300 flex items-center gap-1 mb-1">
                    <Wrench className="w-3.5 h-3.5" />修复建议
                  </div>
                  <ul className="list-disc list-inside text-red-600 dark:text-red-400 space-y-0.5">
                    {previewAiAnalysis.suggestions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {/* Fixed SQL */}
              {previewAiAnalysis.fixedSql && (
                <div>
                  <div className="font-medium text-red-700 dark:text-red-300 flex items-center gap-1 mb-1">
                    <span className="font-mono text-[10px] bg-red-200 dark:bg-red-800 px-1 rounded">SQL</span>修复后的 SQL
                  </div>
                  <pre className="text-xs bg-white dark:bg-gray-800 border border-red-200 dark:border-red-700 rounded p-2 overflow-x-auto text-red-600 dark:text-red-400 font-mono">
                    {previewAiAnalysis.fixedSql}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Search bar (client-side filter on current page) */}
      {showSearch && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-yellow-50 dark:bg-yellow-900/20 flex-shrink-0">
          <input autoFocus className="flex-1 text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none"
            placeholder="搜索当前页..." value={search} onChange={e => setSearch(e.target.value)} />
          <button onClick={() => { setShowSearch(false); setSearch('') }} className="text-xs text-gray-400 hover:text-gray-700"><X className="w-3 h-3" /></button>
        </div>
      )}

      {/* Computed column input */}
      {showComputedColInput && result && !editingMode && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 flex-shrink-0">
          <span className="text-xs text-blue-600 dark:text-blue-400 font-medium shrink-0">计算列</span>
          <input
            ref={ccInputRef}
            className="flex-1 text-sm px-2 py-1 rounded border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="列名"
            value={computedColName}
            onChange={e => setComputedColName(e.target.value)}
          />
          <input
            className="flex-[2] text-sm px-2 py-1 rounded border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono"
            placeholder="公式，如 =amount*0.85"
            value={computedColExpr}
            onChange={e => setComputedColExpr(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && computedColName.trim() && computedColExpr.trim()) {
                addComputedColumn({ name: computedColName.trim(), expression: computedColExpr.trim(), dependencies: [] })
                setComputedColName('')
                setComputedColExpr('')
                setShowComputedColInput(false)
              } else if (e.key === 'Escape') {
                setShowComputedColInput(false); setComputedColName(''); setComputedColExpr('')
              }
            }}
          />
          <button onClick={() => {
            if (computedColName.trim() && computedColExpr.trim()) {
              addComputedColumn({ name: computedColName.trim(), expression: computedColExpr.trim(), dependencies: [] })
              setComputedColName(''); setComputedColExpr(''); setShowComputedColInput(false)
            }
          }} disabled={!computedColName.trim() || !computedColExpr.trim()}
            className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 shrink-0">添加</button>
          <button onClick={() => { setShowComputedColInput(false); setComputedColName(''); setComputedColExpr('') }}
            className="text-xs text-gray-400 hover:text-gray-600 shrink-0"><X className="w-3 h-3" /></button>
        </div>
      )}

      {/* Formula bar */}
      {result && columns.length > 0 && !editingMode && <FormulaBar />}

      {/* Table */}
      <div style={{ flex: '1 1 0', minHeight: 0 }}>
        {!result && status === 'idle' && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">加载预览数据...</div>
        )}
        {result && columns.length > 0 && (
          <DataTable
            columns={columns}
            rows={editingMode ? editDisplayRows.filter(row => !search || Object.values(row).some(v => {
              if (v && typeof v === 'object' && '__edit_state' in (v as object)) return false
              const s = v !== null && v !== undefined && typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')
              return s.toLowerCase().includes(search.toLowerCase())
            })) : rows.filter(row => !search || Object.values(row).some(v => {
              const s = v !== null && v !== undefined && typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')
              return s.toLowerCase().includes(search.toLowerCase())
            }))}
            rowOffset={editingMode ? 0 : (page - 1) * pageSize}
            sortColumn={editingMode ? null : sort.column}
            sortDirection={editingMode ? 'asc' : sort.direction}
            onSort={editingMode ? undefined : handleSort}
            sql={result?.sql}
            filterMode={editingMode ? 'client' : 'server'}
            onFiltersChange={editingMode ? undefined : handleFiltersChange}
            onCellEdit={editingMode ? handleCellEdit : undefined}
            onCellSave={editingMode ? handleCellSave : undefined}
          />
        )}
      </div>

      {!editingMode && <SelectionBar />}

      {/* Pagination — hidden in edit mode */}
      {result && total > 0 && !editingMode && (
      <div className="flex items-center gap-2 px-3 py-1.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0 text-xs flex-wrap">
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-gray-400">每页</span>
          <select className="border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-700 focus:outline-none"
            value={pageSize} onChange={e => setPageSize(+e.target.value)}>
            {[20, 50, 100, 200, 500, 1000, 3000, 5000, 10000, 30000, 50000, 100000, 300000, 500000, 1000000, 2000000, 3000000, 5000000, 10000000].map(n => <option key={n} value={n}>{n.toLocaleString()}</option>)}
          </select>
          <span className="text-gray-400">行</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button disabled={page <= 1 || status === 'running'} onClick={() => setPage(1)}
            className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:cursor-not-allowed">«</button>
          <button disabled={page <= 1 || status === 'running'} onClick={() => setPage(page - 1)}
            className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:cursor-not-allowed"><ChevronLeft className="w-3 h-3 inline mr-1" />上一页</button>
          <span className="px-2 text-gray-500 shrink-0">{page} / {totalPages} 页 · 共 {total.toLocaleString()} 条</span>
          <button disabled={page >= totalPages || status === 'running'} onClick={() => setPage(page + 1)}
            className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:cursor-not-allowed">下一页<ChevronRight className="w-3 h-3 inline ml-1" /></button>
          <button disabled={page >= totalPages || status === 'running'} onClick={() => setPage(totalPages)}
            className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:cursor-not-allowed">»</button>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-gray-400">跳转</span>
          <input type="number" min={1} max={totalPages} value={jumpInput}
            onChange={e => setJumpInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleJump()}
            placeholder="页码"
            className="w-14 border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-700 focus:outline-none text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
          <button onClick={handleJump}
            className="px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">GO</button>
        </div>
      </div>
      )}
    </div>
  )
}

function download(dataUrl: string, filename: string) {
  const a = document.createElement('a'); a.href = dataUrl; a.download = filename; a.click()
}
