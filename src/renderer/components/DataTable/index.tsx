import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Check, X, ArrowUp, ArrowDown, FileText, Camera, ChevronDown } from 'lucide-react'
import { createPortal } from 'react-dom'
import type { ColumnMeta } from '../../../shared/types'

interface DataTableProps {
  columns: ColumnMeta[]
  rows: Record<string, unknown>[]
  rowOffset?: number
  sortColumn?: string | null
  sortDirection?: 'asc' | 'desc'
  onSort?: (col: string, dir: 'asc' | 'desc') => void
  sql?: string
  tableRef?: React.RefObject<HTMLDivElement>
}

// col => { op, value }
interface FilterRule { op: '=' | '<>' | '>' | '<' | 'LIKE'; value: string }

interface TooltipState { content: string; x: number; y: number }
interface CtxMenu { col: string; x: number; y: number; cellValue: unknown }

const DEFAULT_COL_W = 150
const MIN_COL_W = 40
const DEFAULT_ROW_H = 26
const MIN_ROW_H = 18
const ROW_NUM_W = 40
const TOOLTIP_DELAY = 600

// ── apply a single filter rule to a value ─────────────────────
function matchFilter(value: unknown, rule: FilterRule): boolean {
  const str = value === null || value === undefined ? '' : String(value)
  const v = rule.value
  switch (rule.op) {
    case '=':    return str === v
    case '<>':   return str !== v
    case '>':    return str > v
    case '<':    return str < v
    case 'LIKE': {
      // support % wildcard
      const pattern = v.replace(/%/g, '.*').replace(/_/g, '.')
      return new RegExp(`^${pattern}$`, 'i').test(str)
    }
  }
}

// ── Cell Tooltip ───────────────────────────────────────────────
function CellTooltip({ content, x, y }: TooltipState) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  useEffect(() => {
    if (!ref.current) return
    const { width, height } = ref.current.getBoundingClientRect()
    const GAP = 12
    let tx = x + GAP, ty = y + GAP
    if (tx + width > window.innerWidth - 8) tx = x - width - GAP
    if (ty + height > window.innerHeight - 8) ty = y - height - GAP
    setPos({ x: Math.max(8, tx), y: Math.max(8, ty) })
  }, [x, y])
  return createPortal(
    <div ref={ref} className="fixed z-[9999] max-w-sm px-2.5 py-1.5 rounded-md shadow-lg text-xs font-mono
      bg-gray-900 text-gray-100 dark:bg-gray-100 dark:text-gray-900
      border border-gray-700 dark:border-gray-300 pointer-events-none whitespace-pre-wrap break-all leading-relaxed"
      style={{ left: pos.x, top: pos.y }}>{content}</div>,
    document.body
  )
}

// ── SQL Modal ──────────────────────────────────────────────────
function SQLModal({ sql, onClose }: { sql: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard.writeText(sql); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-[640px] max-h-[70vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <span className="font-semibold text-sm">执行的 SQL</span>
          <div className="flex items-center gap-2">
            <button onClick={copy} className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">
              {copied ? <><Check className="w-2.5 h-2.5 inline mr-0.5" />已复制</> : '复制'}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-lg leading-none"><X className="w-3 h-3" /></button>
          </div>
        </div>
        <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-all leading-relaxed">{sql}</pre>
      </div>
    </div>,
    document.body
  )
}

// ── Column Context Menu ────────────────────────────────────────
function ColContextMenu({
  menu, onClose, onSort, onFilter, onClearFilter, onViewSQL, onScreenshot, hasSql, activeFilter
}: {
  menu: CtxMenu
  onClose: () => void
  onSort: (col: string, dir: 'asc' | 'desc') => void
  onFilter: (col: string, rule: FilterRule) => void
  onClearFilter: (col: string) => void
  onViewSQL: () => void
  onScreenshot: () => void
  hasSql: boolean
  activeFilter?: FilterRule
}) {
  const { col, x, y, cellValue } = menu
  const val = cellValue !== null && cellValue !== undefined ? String(cellValue) : null

  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  useEffect(() => {
    if (!menuRef.current) return
    const { width, height } = menuRef.current.getBoundingClientRect()
    setPos({
      x: x + width > window.innerWidth - 8 ? x - width : x,
      y: y + height > window.innerHeight - 8 ? y - height : y
    })
  }, [x, y])

  const item = (icon: React.ReactNode, label: string, onClick: () => void, cls = '') => (
    <button onClick={() => { onClick(); onClose() }}
      className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 ${cls}`}>
      <span className="w-3 text-center shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  )

  const OPS: FilterRule['op'][] = ['=', '<>', '>', '<', 'LIKE']

  return createPortal(
    <div className="fixed inset-0 z-[200]" onClick={onClose}>
      <div ref={menuRef}
        className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl py-1 w-52 text-gray-900 dark:text-gray-100"
        style={{ left: pos.x, top: pos.y }}
        onClick={e => e.stopPropagation()}>

        {/* Sort */}
        {item(<ArrowUp className="w-2.5 h-2.5" />, `升序 (${col} ASC)`, () => onSort(col, 'asc'), 'text-green-600 dark:text-green-400')}
        {item(<ArrowDown className="w-2.5 h-2.5" />, `降序 (${col} DESC)`, () => onSort(col, 'desc'), 'text-green-600 dark:text-green-400')}

        <div className="my-1 border-t border-gray-100 dark:border-gray-700" />

        {/* Filter by cell value */}
        {val !== null && (
          <>
            <div className="px-3 py-1 text-xs text-gray-400 select-none">按单元格值筛选</div>
            {OPS.map(op => {
              const displayVal = op === 'LIKE' ? `%${val}%` : val
              const rule: FilterRule = { op, value: op === 'LIKE' ? `%${val}%` : val }
              const isActive = activeFilter?.op === op && activeFilter?.value === rule.value
              return (
                <button key={op}
                  onClick={() => { onFilter(col, rule); onClose() }}
                  className={`w-full text-left px-3 py-1 text-xs font-mono hover:bg-gray-100 dark:hover:bg-gray-700 truncate
                    ${isActive ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>
                  {isActive && <span className="mr-1"><Check className="w-2.5 h-2.5 inline" /></span>}
                  {col} {op} '{displayVal}'
                </button>
              )
            })}
            <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
          </>
        )}

        {/* Custom filter */}
        <div className="px-3 py-1 text-xs text-gray-400 select-none">自定义筛选</div>
        {OPS.map(op => (
          <div key={op} className="flex items-center gap-1 px-2 py-0.5">
            <span className="text-xs font-mono text-gray-500 dark:text-gray-400 w-6 shrink-0">{op}</span>
            <input
              className="w-0 flex-1 text-xs border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-green-400"
              placeholder="输入值后回车..."
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const v = (e.target as HTMLInputElement).value.trim()
                  if (v) { onFilter(col, { op, value: v }); onClose() }
                }
              }}
            />
          </div>
        ))}

        {/* Clear filter */}
        {activeFilter && (
          <>
            <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
            {item(<X className="w-2.5 h-2.5" />, '清除此列筛选', () => onClearFilter(col), 'text-red-500')}
          </>
        )}

        <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
        {hasSql && item(<FileText className="w-2.5 h-2.5" />, '查看执行的 SQL', onViewSQL)}
        {item(<Camera className="w-2.5 h-2.5" />, '截图保存', onScreenshot)}
      </div>
    </div>,
    document.body
  )
}

// ── Main DataTable ─────────────────────────────────────────────
export default function DataTable({
  columns, rows, rowOffset = 0,
  sortColumn, sortDirection, onSort,
  sql, tableRef
}: DataTableProps): React.ReactElement {
  const [colWidths, setColWidths] = useState<Record<string, number>>({})
  const [rowHeights, setRowHeights] = useState<Record<number, number>>({})
  const [selectedCol, setSelectedCol] = useState<string | null>(null)
  const [selectedRow, setSelectedRow] = useState<number | null>(null)
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: string } | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const [showSQL, setShowSQL] = useState(false)
  const [filters, setFilters] = useState<Record<string, FilterRule>>({})

  const colDrag = useRef<{ col: string; startX: number; startW: number } | null>(null)
  const rowDrag = useRef<{ row: number; startY: number; startH: number } | null>(null)
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const internalRef = useRef<HTMLDivElement>(null)
  const containerRef = tableRef ?? internalRef

  const getColW = (name: string) => colWidths[name] ?? DEFAULT_COL_W
  const getRowH = (i: number) => rowHeights[i] ?? DEFAULT_ROW_H

  // ── Apply filters ──────────────────────────────────────────
  const filteredRows = useMemo(() => {
    const activeFilters = Object.entries(filters)
    if (activeFilters.length === 0) return rows
    return rows.filter(row =>
      activeFilters.every(([col, rule]) => matchFilter(row[col], rule))
    )
  }, [rows, filters])

  const filterCount = Object.keys(filters).length

  // ── Column resize ──────────────────────────────────────────
  const onColResizeStart = useCallback((e: React.MouseEvent, col: string) => {
    e.preventDefault(); e.stopPropagation()
    colDrag.current = { col, startX: e.clientX, startW: getColW(col) }
    const onMove = (ev: MouseEvent) => {
      if (!colDrag.current) return
      setColWidths(prev => ({ ...prev, [colDrag.current!.col]: Math.max(MIN_COL_W, colDrag.current!.startW + ev.clientX - colDrag.current!.startX) }))
    }
    const onUp = () => { colDrag.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }, [colWidths])

  // ── Row resize ─────────────────────────────────────────────
  const onRowResizeStart = useCallback((e: React.MouseEvent, rowIdx: number) => {
    e.preventDefault(); e.stopPropagation()
    rowDrag.current = { row: rowIdx, startY: e.clientY, startH: getRowH(rowIdx) }
    const onMove = (ev: MouseEvent) => {
      if (!rowDrag.current) return
      setRowHeights(prev => ({ ...prev, [rowDrag.current!.row]: Math.max(MIN_ROW_H, rowDrag.current!.startH + ev.clientY - rowDrag.current!.startY) }))
    }
    const onUp = () => { rowDrag.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }, [rowHeights])

  // ── Tooltip ────────────────────────────────────────────────
  const showTooltip = useCallback((e: React.MouseEvent, value: unknown) => {
    if (value === null || value === undefined) return
    const inner = (e.currentTarget as HTMLElement).querySelector('.cell-inner') as HTMLElement | null
    if (inner && inner.scrollWidth <= inner.clientWidth) return
    const { clientX, clientY } = e
    tooltipTimer.current = setTimeout(() => setTooltip({ content: String(value), x: clientX, y: clientY }), TOOLTIP_DELAY)
  }, [])
  const hideTooltip = useCallback(() => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current); setTooltip(null) }, [])
  const updateTooltipPos = useCallback((e: React.MouseEvent) => {
    setTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)
  }, [])

  // ── Context menu ───────────────────────────────────────────
  const onColContextMenu = useCallback((e: React.MouseEvent, col: string) => {
    e.preventDefault()
    setCtxMenu({ col, x: e.clientX, y: e.clientY, cellValue: rows[0]?.[col] ?? null })
  }, [rows])

  const handleFilter = useCallback((col: string, rule: FilterRule) => {
    setFilters(prev => ({ ...prev, [col]: rule }))
  }, [])

  const handleClearFilter = useCallback((col: string) => {
    setFilters(prev => { const n = { ...prev }; delete n[col]; return n })
  }, [])

  // ── Screenshot ─────────────────────────────────────────────
  const handleScreenshot = useCallback(async () => {
    const target = containerRef.current
    if (!target) return
    try {
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(target, { pixelRatio: 2 })
      const a = document.createElement('a'); a.href = dataUrl; a.download = `table-${Date.now()}.png`; a.click()
    } catch (e) { console.error('截图失败', e) }
  }, [containerRef])

  return (
    <div ref={internalRef}>
      {/* Active filter bar */}
      {filterCount > 0 && (
        <div className="flex items-center gap-2 px-2 py-1 bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800 flex-wrap">
          <span className="text-xs text-green-600 dark:text-green-400 shrink-0"><ChevronDown className="w-2.5 h-2.5 inline mr-0.5" />筛选中：</span>
          {Object.entries(filters).map(([col, rule]) => (
            <span key={col} className="inline-flex items-center gap-1 text-xs bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">
              <span className="font-mono">{col} {rule.op} '{rule.value}'</span>
              <button onClick={() => handleClearFilter(col)} className="hover:text-red-500 leading-none"><X className="w-2.5 h-2.5" /></button>
            </span>
          ))}
          <button onClick={() => setFilters({})} className="text-xs text-gray-400 hover:text-red-500 ml-auto shrink-0">清除全部</button>
          <span className="text-xs text-gray-500 shrink-0">{filteredRows.length} / {rows.length} 行</span>
        </div>
      )}

      <table className="text-xs border-collapse" style={{ tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
        <colgroup>
          <col style={{ width: ROW_NUM_W }} />
          {columns.map(col => <col key={col.name} style={{ width: getColW(col.name) }} />)}
        </colgroup>

        <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 z-10">
          <tr>
            <th className="border-b border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 select-none" style={{ width: ROW_NUM_W }} />
            {columns.map(col => {
              const isColSel = selectedCol === col.name
              const hasFilter = !!filters[col.name]
              return (
                <th key={col.name}
                  style={{ width: getColW(col.name), position: 'relative', overflow: 'hidden' }}
                  className={`px-2 py-1.5 text-left font-medium border-b border-r border-gray-200 dark:border-gray-700
                    select-none whitespace-nowrap transition-colors
                    ${isColSel ? 'bg-green-500 text-white dark:bg-green-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer'}`}
                  onClick={() => { setSelectedCol(isColSel ? null : col.name); onSort?.(col.name, sortColumn === col.name && sortDirection === 'asc' ? 'desc' : 'asc') }}
                  onContextMenu={e => onColContextMenu(e, col.name)}>
                  <span className="truncate flex items-center gap-1 pr-2">
                    {hasFilter && <span className="text-orange-400 shrink-0" title={`${filters[col.name].op} '${filters[col.name].value}'`}><ChevronDown className="w-2.5 h-2.5 inline" /></span>}
                    {col.name}
                    {sortColumn === col.name && <span className="ml-1">{sortDirection === 'asc' ? <ArrowUp className="w-2.5 h-2.5 inline" /> : <ArrowDown className="w-2.5 h-2.5 inline" />}</span>}
                  </span>
                  <div onMouseDown={e => onColResizeStart(e, col.name)}
                    className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-green-400/60 active:bg-green-500/80 transition-colors"
                    style={{ zIndex: 1 }} onClick={e => e.stopPropagation()} />
                </th>
              )
            })}
          </tr>
        </thead>

        <tbody>
          {filteredRows.map((row, i) => {
            const isRowSel = selectedRow === i
            const rowH = getRowH(i)
            return (
              <tr key={i} style={{ height: rowH }} className="border-b border-gray-100 dark:border-gray-800">
                <td style={{ width: ROW_NUM_W, height: rowH, position: 'relative', overflow: 'visible' }}
                  className={`border-r border-gray-200 dark:border-gray-700 text-right select-none cursor-pointer transition-colors
                    ${isRowSel ? 'bg-green-500 text-white font-bold' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                  onClick={() => setSelectedRow(isRowSel ? null : i)}>
                  <span className="px-2">{rowOffset + i + 1}</span>
                  <div onMouseDown={e => onRowResizeStart(e, i)}
                    className="absolute bottom-0 left-0 w-full h-1.5 cursor-row-resize hover:bg-green-400/60 active:bg-green-500/80 transition-colors"
                    style={{ zIndex: 1 }} onClick={e => e.stopPropagation()} />
                </td>
                {columns.map(col => {
                  const isColSel = selectedCol === col.name
                  const isCellHov = hoveredCell?.row === i && hoveredCell?.col === col.name
                  const bg = isCellHov ? 'bg-yellow-100 dark:bg-yellow-900/40'
                    : isRowSel && isColSel ? 'bg-green-300 dark:bg-green-700/70'
                    : isRowSel ? 'bg-green-100 dark:bg-green-900/40'
                    : isColSel ? 'bg-green-50 dark:bg-green-900/20' : ''
                  const value = row[col.name]
                  return (
                    <td key={col.name}
                      style={{ width: getColW(col.name), height: rowH, maxWidth: getColW(col.name) }}
                      onMouseEnter={e => { setHoveredCell({ row: i, col: col.name }); showTooltip(e, value) }}
                      onMouseLeave={() => { setHoveredCell(null); hideTooltip() }}
                      onMouseMove={updateTooltipPos}
                      onClick={() => setHoveredCell({ row: i, col: col.name })}
                      className={`px-2 font-mono border-r border-gray-100 dark:border-gray-800 overflow-hidden cursor-default transition-colors ${bg}`}>
                      <div className="cell-inner truncate" style={{ lineHeight: `${rowH}px` }}>
                        {value === null ? <span className="text-gray-400 italic">NULL</span> : String(value ?? '')}
                      </div>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>

      {tooltip && <CellTooltip {...tooltip} />}

      {ctxMenu && (
        <ColContextMenu
          menu={ctxMenu}
          onClose={() => setCtxMenu(null)}
          onSort={(col, dir) => onSort?.(col, dir)}
          onFilter={handleFilter}
          onClearFilter={handleClearFilter}
          onViewSQL={() => setShowSQL(true)}
          onScreenshot={handleScreenshot}
          hasSql={!!sql}
          activeFilter={filters[ctxMenu.col]}
        />
      )}

      {showSQL && sql && <SQLModal sql={sql} onClose={() => setShowSQL(false)} />}
    </div>
  )
}
