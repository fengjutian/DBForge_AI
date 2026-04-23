import React, { useState, useEffect, useRef } from 'react'
import { useResultStore, selectDisplayRows, selectTotalRows, selectColumns } from '../../store/resultStore'
import DataTable from '../DataTable'

export default function ResultPanel(): React.ReactElement {
  const store = useResultStore()
  const rows = selectDisplayRows(store)
  const total = selectTotalRows(store)
  const columns = selectColumns(store)
  const { status, error, pagination, sort, search, setPage, setSort, setSearch, setStatus, result } = store

  const [showSearch, setShowSearch] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const [jumpInput, setJumpInput] = useState('')

  // Ctrl+F to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault(); setShowSearch(true); setTimeout(() => searchRef.current?.focus(), 50)
      }
      if (e.key === 'Escape') setShowSearch(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize))

  const handleExportCSV = () => {
    if (!result) return
    const header = result.columns.map(c => c.name).join(',')
    const body = result.rows.map(r => result.columns.map(c => JSON.stringify(r[c.name] ?? '')).join(',')).join('\n')
    download(`data:text/csv;charset=utf-8,${encodeURIComponent(header + '\n' + body)}`, 'result.csv')
  }

  const handleExportJSON = () => {
    if (!result) return
    download(`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(result.rows, null, 2))}`, 'result.json')
  }

  const handleExportExcel = async () => {
    if (!result) return
    const ExcelJS = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Result')
    ws.addRow(result.columns.map(c => c.name))
    result.rows.forEach(r => ws.addRow(result.columns.map(c => r[c.name] as string ?? '')))
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'result.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  const handleCancel = () => {
    const qid = store.currentQueryId
    if (qid) window.electronAPI.query.cancel(qid)
    setStatus('cancelled')
  }

  const handleSort = (col: string, dir?: 'asc' | 'desc') => {
    if (dir) {
      setSort(col, dir)
    } else if (sort.column === col) {
      setSort(col, sort.direction === 'asc' ? 'desc' : 'asc')
    } else {
      setSort(col, 'asc')
    }
  }

  const handleJump = () => {
    const n = parseInt(jumpInput, 10)
    if (!isNaN(n) && n >= 1 && n <= totalPages) {
      setPage(n)
    }
    setJumpInput('')
  }

  return (
    <div className="h-full flex flex-col min-h-0 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
        {status === 'running' ? (
          <>
            <span className="text-xs text-yellow-500 animate-pulse">查询执行中...</span>
            <button onClick={handleCancel} className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700">取消</button>
          </>
        ) : (
          <>
            {result && (
              <span className="text-xs text-gray-500">
                {total.toLocaleString()} 行 · {result.executionTime}ms
              </span>
            )}
            {status === 'error' && <span className="text-xs text-red-500">✗ {error}</span>}
            {status === 'cancelled' && <span className="text-xs text-yellow-500">已取消</span>}
          </>
        )}
        <div className="flex-1" />
        {result && (
          <>
            <button onClick={() => { setShowSearch(true); setTimeout(() => searchRef.current?.focus(), 50) }}
              className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">
              🔍 搜索
            </button>
            <button onClick={handleExportCSV} className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">CSV</button>
            <button onClick={handleExportJSON} className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">JSON</button>
            <button onClick={handleExportExcel} className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">Excel</button>
          </>
        )}
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-yellow-50 dark:bg-yellow-900/20">
          <input ref={searchRef} className="flex-1 text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none"
            placeholder="搜索内容..." value={search} onChange={e => setSearch(e.target.value)} />
          <button onClick={() => { setShowSearch(false); setSearch('') }} className="text-xs text-gray-400 hover:text-gray-700">✕</button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-auto" style={{ flex: '1 1 0', minHeight: 0 }}>
        {!result && status === 'idle' && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">执行 SQL 查询后结果将显示在这里</div>
        )}
        {result && columns.length > 0 && (
          <DataTable
            columns={columns}
            rows={rows}
            rowOffset={(pagination.page - 1) * pagination.pageSize}
            sortColumn={sort.column}
            sortDirection={sort.direction}
            onSort={handleSort}
            sql={result?.sql}
          />
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0 text-xs flex-wrap min-h-[32px]">
          {/* Row range info */}
          <span className="text-gray-500 shrink-0">
            {total === 0
              ? '无数据'
              : `第 ${Math.min((pagination.page - 1) * pagination.pageSize + 1, total)}–${Math.min(pagination.page * pagination.pageSize, total)} 条，共 ${total.toLocaleString()} 条`}
          </span>

          <div className="flex-1" />

          {/* Page size selector */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-gray-400">每页</span>
            <select
              className="border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-700 focus:outline-none"
              value={pagination.pageSize}
              onChange={e => setPage(1, +e.target.value)}
            >
              {[20, 50, 100, 200, 500].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="text-gray-400">行</span>
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              disabled={pagination.page <= 1}
              onClick={() => setPage(1)}
              title="第一页"
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:cursor-not-allowed"
            >«</button>
            <button
              disabled={pagination.page <= 1}
              onClick={() => setPage(pagination.page - 1)}
              title="上一页"
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:cursor-not-allowed"
            >‹ 上一页</button>

            <span className="px-2 text-gray-500 shrink-0">
              {pagination.page} / {totalPages} 页 · 共 {total.toLocaleString()} 条
            </span>

            <button
              disabled={pagination.page >= totalPages}
              onClick={() => setPage(pagination.page + 1)}
              title="下一页"
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:cursor-not-allowed"
            >下一页 ›</button>
            <button
              disabled={pagination.page >= totalPages}
              onClick={() => setPage(totalPages)}
              title="最后一页"
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:cursor-not-allowed"
            >»</button>
          </div>

          {/* Jump to page */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-gray-400">跳转</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={jumpInput}
                onChange={e => setJumpInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleJump()}
                placeholder="页码"
                className="w-14 border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-700 focus:outline-none text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                onClick={handleJump}
                className="px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
              >GO</button>
            </div>
          )}
        </div>
    </div>
  )
}

function download(dataUrl: string, filename: string) {
  const a = document.createElement('a'); a.href = dataUrl; a.download = filename; a.click()
}
