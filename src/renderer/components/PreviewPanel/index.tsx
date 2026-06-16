import React, { useState, useCallback } from 'react'
import { X, Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Tab } from '../../store/editorStore'
import { useEditorStore } from '../../store/editorStore'
import DataTable from '../DataTable'

interface PreviewPanelProps {
  tab: Tab
}

export default function PreviewPanel({ tab }: PreviewPanelProps): React.ReactElement {
  const { updatePreviewTab } = useEditorStore()
  const [page, setPageState] = useState(1)
  const [pageSize, setPageSizeState] = useState(100)
  const [sort, setSort] = useState<{ column: string | null; direction: 'asc' | 'desc' }>({ column: null, direction: 'asc' })
  const [showSearch, setShowSearch] = useState(false)
  const [search, setSearch] = useState('')
  const [jumpInput, setJumpInput] = useState('')

  const result = tab.previewResult
  const status = tab.previewStatus ?? 'idle'
  const error = tab.previewError
  const total = tab.previewTotal ?? 0
  const columns = result?.columns ?? []
  const rows = result?.rows ?? []
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const fetchPage = useCallback(async (newPage: number, newPageSize: number, newSort: typeof sort) => {
    if (!tab.connectionId || !tab.previewTable) return
    const { dbName, tableName } = tab.previewTable
    const offset = (newPage - 1) * newPageSize
    const orderClause = newSort.column
      ? ` ORDER BY \`${newSort.column}\` ${newSort.direction.toUpperCase()}`
      : ''
    updatePreviewTab(tab.id, { previewStatus: 'running', previewError: null })
    try {
      const dataResult = await window.electronAPI.query.execute({
        connectionId: tab.connectionId,
        sql: `SELECT * FROM \`${dbName}\`.\`${tableName}\`${orderClause} LIMIT ${newPageSize} OFFSET ${offset}`,
        queryId: `preview_${tab.id}_${newPage}`
      })
      updatePreviewTab(tab.id, { previewResult: dataResult, previewStatus: 'idle' })
    } catch (e) {
      updatePreviewTab(tab.id, { previewStatus: 'error', previewError: (e as Error).message })
    }
  }, [tab.id, tab.connectionId, tab.previewTable, updatePreviewTab])

  const setPage = (newPage: number) => {
    setPageState(newPage)
    fetchPage(newPage, pageSize, sort)
  }

  const setPageSize = (newSize: number) => {
    setPageSizeState(newSize)
    setPageState(1)
    fetchPage(1, newSize, sort)
  }

  const handleSort = (col: string, dir?: 'asc' | 'desc') => {
    const newSort = dir
      ? { column: col, direction: dir }
      : sort.column === col
      ? { column: col, direction: sort.direction === 'asc' ? 'desc' as const : 'asc' as const }
      : { column: col, direction: 'asc' as const }
    setSort(newSort)
    fetchPage(page, pageSize, newSort)
  }

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
    setPageState(1)
    setSort({ column: null, direction: 'asc' })
    fetchPage(1, pageSize, { column: null, direction: 'asc' })
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-green-500 dark:border-green-600 bg-green-600 text-white dark:bg-green-700 flex-shrink-0">
        {status === 'running' ? (
          <span className="text-xs text-yellow-500 animate-pulse">加载中...</span>
        ) : (
          <>
            {result && <span className="text-xs text-white/80">{result.executionTime}ms</span>}
            {status === 'error' && <span className="text-xs text-red-500"><X className="w-3 h-3 inline mr-1 align-middle" />{error}</span>}
          </>
        )}
        <div className="flex-1" />
        {result && (
          <>
            <button onClick={() => setShowSearch(!showSearch)}
              className="text-xs px-2 py-1 rounded border border-green-400 dark:border-green-500 hover:bg-green-500 dark:hover:bg-green-600">
              <Search className="w-3 h-3 inline mr-1" />搜索
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
      </div>

      {/* Search bar (client-side filter on current page) */}
      {showSearch && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-yellow-50 dark:bg-yellow-900/20 flex-shrink-0">
          <input autoFocus className="flex-1 text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none"
            placeholder="搜索当前页..." value={search} onChange={e => setSearch(e.target.value)} />
          <button onClick={() => { setShowSearch(false); setSearch('') }} className="text-xs text-gray-400 hover:text-gray-700"><X className="w-3 h-3" /></button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-auto" style={{ flex: '1 1 0', minHeight: 0 }}>
        {!result && status === 'idle' && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">加载预览数据...</div>
        )}
        {result && columns.length > 0 && (
          <DataTable
            columns={columns}
            rows={rows.filter(row => !search || Object.values(row).some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase())))}
            rowOffset={(page - 1) * pageSize}
            sortColumn={sort.column}
            sortDirection={sort.direction}
            onSort={handleSort}
            sql={result?.sql}
          />
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0 text-xs flex-wrap">
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-gray-400">每页</span>
          <select className="border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-700 focus:outline-none"
            value={pageSize} onChange={e => setPageSize(+e.target.value)}>
            {[20, 50, 100, 200, 500].map(n => <option key={n} value={n}>{n}</option>)}
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
    </div>
  )
}

function download(dataUrl: string, filename: string) {
  const a = document.createElement('a'); a.href = dataUrl; a.download = filename; a.click()
}
