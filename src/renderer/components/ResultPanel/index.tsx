import React, { useState, useEffect, useRef } from 'react'
import { Database, X, Search, Upload, ChevronDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useResultStore, selectDisplayRows, selectTotalRows, selectColumns } from '../../store/resultStore'
import { useConnectionStore } from '../../store/connectionStore'
import { useFormulaStore } from '../../store/formulaStore'
import DataTable from '../DataTable'
import FormulaBar from '../DataTable/FormulaBar'
import SelectionBar from '../DataTable/SelectionBar'

export default function ResultPanel(): React.ReactElement {
  const store = useResultStore()
  const rows = selectDisplayRows(store)
  const total = selectTotalRows(store)
  const columns = selectColumns(store)
  const { status, error, pagination, sort, search, setPage, setSort, setSearch, setStatus, result, connectionId } = store
  const { activeDatabase } = useConnectionStore()
  const addComputedColumn = useFormulaStore(s => s.addComputedColumn)
  const removeComputedColumn = useFormulaStore(s => s.removeComputedColumn)
  const computedColumns = useFormulaStore(s => s.computedColumns)

  const [showSearch, setShowSearch] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showComputedColInput, setShowComputedColInput] = useState(false)
  const [computedColName, setComputedColName] = useState('')
  const [computedColExpr, setComputedColExpr] = useState('')
  const [exportProgress, setExportProgress] = useState<{ type: string; progress: number } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [jumpInput, setJumpInput] = useState('')
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const ccInputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize))

  const handleExportCSV = async (fullExport = false) => {
    if (!result || !store.connectionId) return
    setShowExportMenu(false)
    
    try {
      const exportResult = await window.electronAPI.export.csv({
        connectionId: store.connectionId,
        sql: result.sql,
        fullExport
      })
      
      if (exportResult.success && exportResult.filePath) {
      }
    } catch (err: any) {
      alert(`导出失败: ${err.userMessage || err.message}`)
    }
  }

  const handleExportJSON = async (fullExport = false) => {
    if (!result || !store.connectionId) return
    setShowExportMenu(false)
    
    try {
      const exportResult = await window.electronAPI.export.json({
        connectionId: store.connectionId,
        sql: result.sql,
        fullExport
      })
      
      if (exportResult.success && exportResult.filePath) {
      }
    } catch (err: any) {
      alert(`导出失败: ${err.userMessage || err.message}`)
    }
  }

  const handleExportExcel = async (fullExport = false) => {
    if (!result || !store.connectionId) return
    setShowExportMenu(false)
    
    try {
      const exportResult = await window.electronAPI.export.excel({
        connectionId: store.connectionId,
        sql: result.sql,
        fullExport
      })
      
      if (exportResult.success && exportResult.filePath) {
      }
    } catch (err: any) {
      alert(`导出失败: ${err.userMessage || err.message}`)
    }
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
      <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 flex-shrink-0">
        {status === 'running' ? (
          <>
            <span className="text-xs text-yellow-500 animate-pulse">查询执行中...</span>
            <button onClick={handleCancel} className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700">取消</button>
          </>
        ) : (
          <>
            {result && (
              <>
                {activeDatabase && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-medium"><Database className="w-3 h-3 inline mr-1" />{activeDatabase}</span>
                )}
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {total.toLocaleString()} 行 · {result.executionTime}ms
                </span>
                {/* Computed column tags */}
                {computedColumns.map(cc => (
                  <span key={cc.id} className="inline-flex items-center gap-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-700">
                    <span className="font-mono">{cc.name}</span>
                    <span className="text-blue-400">=</span>
                    <span className="font-mono text-[10px] max-w-[120px] truncate">{cc.expression}</span>
                    <button onClick={() => removeComputedColumn(cc.id)} className="hover:text-red-500 leading-none ml-0.5"><X className="w-2.5 h-2.5" /></button>
                  </span>
                ))}
              </>
            )}
            {status === 'error' && <span className="text-xs text-red-500"><X className="w-3 h-3 inline mr-1 align-middle" />{error}</span>}
            {status === 'cancelled' && <span className="text-xs text-yellow-500">已取消</span>}
          </>
        )}
        <div className="flex-1" />
        {result && (
          <>
            <button onClick={() => { setShowSearch(true); setTimeout(() => searchRef.current?.focus(), 50) }}
              className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">
              <Search className="w-3 h-3 inline mr-1" />搜索
            </button>

            <button onClick={() => { setShowComputedColInput(true); setTimeout(() => ccInputRef.current?.focus(), 50) }}
              className="text-xs px-2 py-1 rounded border border-blue-300 dark:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400"
              title="添加计算列">
              <Plus className="w-3 h-3 inline mr-1" />计算列
            </button>
            
            <div className="relative" ref={exportMenuRef}>
              <button onClick={() => setShowExportMenu(!showExportMenu)}
                className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-1">
                <Upload className="w-3 h-3 inline mr-1" />导出
                <span className="text-gray-400"><ChevronDown className="w-3 h-3 inline" /></span>
              </button>
              
              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-50 overflow-hidden">
                  <div className="px-3 py-2 text-xs text-gray-500 border-b border-gray-100 dark:border-gray-700">
                    导出格式
                  </div>
                  
                  <div className="py-1">
                    <button onClick={() => handleExportCSV(false)} 
                      className="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 flex justify-between items-center">
                      <span>当前页 CSV</span>
                      <span className="text-gray-400 text-[10px]">({rows.length} 行)</span>
                    </button>
                    <button onClick={() => handleExportCSV(true)} 
                      className="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 flex justify-between items-center">
                      <span>全量 CSV</span>
                      <span className="text-gray-400 text-[10px]">(最多 10 万行)</span>
                    </button>
                  </div>
                  
                  <div className="py-1 border-t border-gray-100 dark:border-gray-700">
                    <button onClick={() => handleExportJSON(false)} 
                      className="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 flex justify-between items-center">
                      <span>当前页 JSON</span>
                      <span className="text-gray-400 text-[10px]">({rows.length} 行)</span>
                    </button>
                    <button onClick={() => handleExportJSON(true)} 
                      className="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 flex justify-between items-center">
                      <span>全量 JSON</span>
                      <span className="text-gray-400 text-[10px]">(最多 10 万行)</span>
                    </button>
                  </div>
                  
                  <div className="py-1 border-t border-gray-100 dark:border-gray-700">
                    <button onClick={() => handleExportExcel(false)} 
                      className="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 flex justify-between items-center">
                      <span>当前页 Excel</span>
                      <span className="text-gray-400 text-[10px]">({rows.length} 行)</span>
                    </button>
                    <button onClick={() => handleExportExcel(true)} 
                      className="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 flex justify-between items-center">
                      <span>全量 Excel</span>
                      <span className="text-gray-400 text-[10px]">(最多 10 万行)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showSearch && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-yellow-50 dark:bg-yellow-900/20">
          <input ref={searchRef} className="flex-1 text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none"
            placeholder="搜索内容..." value={search} onChange={e => setSearch(e.target.value)} />
          <button onClick={() => { setShowSearch(false); setSearch('') }} className="text-xs text-gray-400 hover:text-gray-700"><X className="w-3 h-3" /></button>
        </div>
      )}

      {/* Computed column input */}
      {showComputedColInput && result && (
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
            placeholder="公式，如 =amount*0.85 或 =IF(score>=60,'及格','不及格')"
            value={computedColExpr}
            onChange={e => setComputedColExpr(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && computedColName.trim() && computedColExpr.trim()) {
                addComputedColumn({ name: computedColName.trim(), expression: computedColExpr.trim(), dependencies: [] })
                setComputedColName('')
                setComputedColExpr('')
                setShowComputedColInput(false)
              } else if (e.key === 'Escape') {
                setShowComputedColInput(false)
                setComputedColName('')
                setComputedColExpr('')
              }
            }}
          />
          <button
            onClick={() => {
              if (computedColName.trim() && computedColExpr.trim()) {
                addComputedColumn({ name: computedColName.trim(), expression: computedColExpr.trim(), dependencies: [] })
                setComputedColName('')
                setComputedColExpr('')
                setShowComputedColInput(false)
              }
            }}
            disabled={!computedColName.trim() || !computedColExpr.trim()}
            className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 shrink-0"
          >添加</button>
          <button onClick={() => { setShowComputedColInput(false); setComputedColName(''); setComputedColExpr('') }}
            className="text-xs text-gray-400 hover:text-gray-600 shrink-0"><X className="w-3 h-3" /></button>
        </div>
      )}

      {/* Formula bar */}
      {result && columns.length > 0 && <FormulaBar />}

      <div style={{ flex: '1 1 0', minHeight: 0 }}>
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

      <SelectionBar />

      {result && total > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0 text-xs flex-wrap min-h-[32px]">
          <span className="text-gray-500 shrink-0">
            {`第 ${Math.min((pagination.page - 1) * pagination.pageSize + 1, total)}–${Math.min(pagination.page * pagination.pageSize, total)} 条，共 ${total.toLocaleString()} 条`}
          </span>

          <div className="flex-1" />

          <div className="flex items-center gap-1 shrink-0">
            <span className="text-gray-400">每页</span>
            <select
              className="border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-700 focus:outline-none"
              value={pagination.pageSize}
              onChange={e => setPage(1, +e.target.value)}
            >
              {[20, 50, 100, 200, 500, 1000, 3000, 5000, 10000, 30000, 50000, 100000, 300000, 500000, 1000000, 2000000, 3000000, 5000000, 10000000].map(n => <option key={n} value={n}>{n.toLocaleString()}</option>)}
            </select>
            <span className="text-gray-400">行</span>
          </div>

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
            ><ChevronLeft className="w-3 h-3 inline mr-1" />上一页</button>

            <span className="px-2 text-gray-500 shrink-0">
              {pagination.page} / {totalPages} 页 · 共 {total.toLocaleString()} 条
            </span>

            <button
              disabled={pagination.page >= totalPages}
              onClick={() => setPage(pagination.page + 1)}
              title="下一页"
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:cursor-not-allowed"
            >下一页<ChevronRight className="w-3 h-3 inline ml-1" /></button>
            <button
              disabled={pagination.page >= totalPages}
              onClick={() => setPage(totalPages)}
              title="最后一页"
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:cursor-not-allowed"
            >»</button>
          </div>

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
      )}
    </div>
  )
}
