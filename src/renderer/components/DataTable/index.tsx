import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Check, X, ArrowUp, ArrowDown, FileText, Camera, ChevronDown, Copy, Calculator } from 'lucide-react'
import { createPortal } from 'react-dom'
import type { ColumnMeta, FilterRule } from '../../../shared/types'
import { useFormulaStore } from '../../store/formulaStore'
import { colToLetter, isFormula } from '../../utils/formulaEngine'

interface DataTableProps {
  columns: ColumnMeta[]
  rows: Record<string, unknown>[]
  rowOffset?: number
  sortColumn?: string | null
  sortDirection?: 'asc' | 'desc'
  onSort?: (col: string, dir: 'asc' | 'desc') => void
  sql?: string
  tableRef?: React.RefObject<HTMLDivElement>
  /** 'client' (default) — local filtering only; 'server' — also calls onFiltersChange for parent to re-query DB */
  filterMode?: 'client' | 'server'
  /** Called when filters change in 'server' mode */
  onFiltersChange?: (filters: Record<string, FilterRule>) => void
  /** Called when a cell is edited via double-click */
  onCellEdit?: (rowIndex: number, col: string, newValue: string, oldValue: unknown) => void
}

interface TooltipState { content: string; x: number; y: number }
interface CtxMenu { col: string; x: number; y: number; cellValue: unknown }
interface CellCtxMenu { rowIdx: number; col: string; value: unknown; x: number; y: number }
interface EditingCell { rowIdx: number; col: string }

const DEFAULT_COL_W = 150
const MIN_COL_W = 40
const DEFAULT_ROW_H = 26
const MIN_ROW_H = 18
const ROW_NUM_W = 40
const TOOLTIP_DELAY = 600

// ── safely convert any value to display string ───────────────
function valueToString(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

// ── apply a single filter rule to a value ─────────────────────
function matchFilter(value: unknown, rule: FilterRule): boolean {
  const str = value === null || value === undefined ? '' : valueToString(value)
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
  menu, onClose, onSort, onFilter, onClearFilter, onViewSQL, onScreenshot, onCopy, onCopyStructure, hasSql, activeFilter
}: {
  menu: CtxMenu
  onClose: () => void
  onSort: (col: string, dir: 'asc' | 'desc') => void
  onFilter: (col: string, rule: FilterRule) => void
  onClearFilter: (col: string) => void
  onViewSQL: () => void
  onScreenshot: () => void
  onCopy: (val: unknown) => void
  onCopyStructure: () => void
  hasSql: boolean
  activeFilter?: FilterRule
}) {
  const { col, x, y, cellValue } = menu
  const val = cellValue !== null && cellValue !== undefined ? valueToString(cellValue) : null

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

        {/* Copy */}
        {item(<Copy className="w-2.5 h-2.5" />, '复制', () => onCopy(menu.cellValue))}

        <div className="my-1 border-t border-gray-100 dark:border-gray-700" />

        {/* Copy table structure */}
        {item(<FileText className="w-2.5 h-2.5" />, '复制表结构', onCopyStructure)}

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

// ── Cell Context Menu (right-click on a cell) ────────────────
function CellContextMenu({
  menu, onClose, onCopy
}: {
  menu: CellCtxMenu
  onClose: () => void
  onCopy: (val: unknown) => void
}) {
  const { x, y } = menu
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  useEffect(() => {
    if (!ref.current) return
    const { width, height } = ref.current.getBoundingClientRect()
    setPos({
      x: x + width > window.innerWidth - 8 ? x - width : x,
      y: y + height > window.innerHeight - 8 ? y - height : y
    })
  }, [x, y])

  return createPortal(
    <div className="fixed inset-0 z-[200]" onClick={onClose}>
      <div ref={ref}
        className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl py-1 w-40 text-gray-900 dark:text-gray-100"
        style={{ left: pos.x, top: pos.y }}
        onClick={e => e.stopPropagation()}>
        <button onClick={() => { onCopy(menu.value); onClose() }}
          className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700">
          <Copy className="w-3 h-3 shrink-0" />
          <span>复制</span>
        </button>
      </div>
    </div>,
    document.body
  )
}

// ── Main DataTable ─────────────────────────────────────────────
export default function DataTable({
  columns, rows, rowOffset = 0,
  sortColumn, sortDirection, onSort,
  sql, tableRef,
  filterMode = 'client', onFiltersChange, onCellEdit
}: DataTableProps): React.ReactElement {
  const [colWidths, setColWidths] = useState<Record<string, number>>({})
  const [rowHeights, setRowHeights] = useState<Record<number, number>>({})
  const [rowNumWidth, setRowNumWidth] = useState(ROW_NUM_W)
  const [selectedCol, setSelectedCol] = useState<string | null>(null)
  const [selectedRow, setSelectedRow] = useState<number | null>(null)
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: string } | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const [showSQL, setShowSQL] = useState(false)
  const [filters, setFilters] = useState<Record<string, FilterRule>>({})
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [editValue, setEditValue] = useState('')
  const [cellCtxMenu, setCellCtxMenu] = useState<CellCtxMenu | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // ── Formula store integration ───────────────────────────
  const setColumns = useFormulaStore(s => s.setColumns)
  const setRows = useFormulaStore(s => s.setRows)
  const selectCell = useFormulaStore(s => s.selectCell)
  const extendSelection = useFormulaStore(s => s.extendSelection)
  const toggleCellSelection = useFormulaStore(s => s.toggleCellSelection)
  const selectAll = useFormulaStore(s => s.selectAll)
  const isCellSelected = useFormulaStore(s => s.isCellSelected)
  const getCellValue = useFormulaStore(s => s.getCellValue)
  const getCellFormula = useFormulaStore(s => s.getCellFormula)
  const hasFormula = useFormulaStore(s => s.hasFormula)
  const computedColumns = useFormulaStore(s => s.computedColumns)
  const getComputedColumns = useFormulaStore(s => s.getComputedColumns)

  // Build effective column list (real + computed)
  const effectiveColumns = useMemo(() => {
    const cc = getComputedColumns()
    const computedMetas: ColumnMeta[] = cc.map(c => ({
      name: c.name,
      type: 'formula',
      nullable: true,
    }))
    return [...columns, ...computedMetas]
  }, [columns, computedColumns])

  // Sync columns/rows to formula store
  useEffect(() => {
    setColumns(columns.map(c => c.name))
  }, [columns, setColumns])

  useEffect(() => {
    setRows(rows)
  }, [rows, setRows])

  // ── Stable ref to rowHeights for virtualizer estimateSize ──
  const rowHeightsRef = useRef(rowHeights)
  rowHeightsRef.current = rowHeights

  // ── React to filter changes in server mode ────────────────
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (filterMode !== 'server' || !onFiltersChange) return
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    onFiltersChange(filters)
  }, [filters, filterMode, onFiltersChange])

  // ── Ctrl+A select all keyboard handler ─────────────────────
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        // Only intercept when the table container or its children are focused
        const active = document.activeElement
        if (active === el || el.contains(active) || active === document.body) {
          e.preventDefault()
          selectAll()
        }
      }
    }
    el.addEventListener('keydown', onKeyDown)
    return () => el.removeEventListener('keydown', onKeyDown)
  }, [selectAll])

  const colDrag = useRef<{ col: string; startX: number; startW: number } | null>(null)
  const rowDrag = useRef<{ row: number; startY: number; startH: number } | null>(null)
  const tableScaleDrag = useRef<{
    startX: number; startY: number;
    colSizes: { name: string; origW: number }[];
    rowHeightsSnapshot: Record<number, number>;
    totalOrigW: number;
    totalOrigH: number;
  } | null>(null)
  const mouseDrag = useRef<{ startCol: number; startRow: number } | null>(null)
  const isDragging = useRef(false)
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const internalRef = useRef<HTMLDivElement>(null)
  const containerRef = tableRef ?? internalRef

  // ── Mouse drag-to-select ──────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!mouseDrag.current) return
      const el = document.elementFromPoint(e.clientX, e.clientY)
      if (!el) return
      // Find the nearest parent <td> with data attributes
      const td = (el as HTMLElement).closest?.('td[data-row-index][data-col-index]') as HTMLElement | null
      if (!td) return
      const colIdx = parseInt(td.dataset.colIndex ?? '', 10)
      const rowIdx = parseInt(td.dataset.rowIndex ?? '', 10)
      if (isNaN(colIdx) || isNaN(rowIdx)) return
      if (colIdx !== mouseDrag.current.startCol || rowIdx !== mouseDrag.current.startRow) {
        isDragging.current = true
      }
      extendSelection(colIdx, rowIdx)
    }
    const onUp = () => {
      mouseDrag.current = null
      // Reset dragging flag after a tick so onClick can read it
      setTimeout(() => { isDragging.current = false }, 0)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [extendSelection])

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

  // ── Virtual scroll ─────────────────────────────────────────
  const virtualizer = useVirtualizer({
    count: filteredRows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (i: number) => rowHeightsRef.current[i] ?? DEFAULT_ROW_H,
    overscan: 5,
    measureElement: (el: Element) => (el as HTMLElement).getBoundingClientRect().height,
  })
  const virtualItems = virtualizer.getVirtualItems()
  const totalVirtualSize = virtualizer.getTotalSize()

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
    const startH = rowHeightsRef.current[rowIdx] ?? DEFAULT_ROW_H
    rowDrag.current = { row: rowIdx, startY: e.clientY, startH }
    const onMove = (ev: MouseEvent) => {
      if (!rowDrag.current) return
      setRowHeights(prev => ({ ...prev, [rowDrag.current!.row]: Math.max(MIN_ROW_H, rowDrag.current!.startH + ev.clientY - rowDrag.current!.startY) }))
    }
    const onUp = () => { rowDrag.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }, [])

  // ── Table proportional scale (corner drag) ──────────────
  const onTableScaleStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const table = (e.currentTarget as HTMLElement).closest('table')
    if (!table) return
    const colgroup = table.querySelector('colgroup')
    if (!colgroup) return

    // Snapshot column widths from the DOM (direct read, no React re-render)
    const colEls = Array.from(colgroup.children) as HTMLElement[]
    const colSizes = colEls.map(el => ({
      name: el.dataset.colName ?? '',
      origW: parseFloat(el.style.width) || DEFAULT_COL_W,
    }))
    const totalOrigW = colSizes.reduce((a, b) => a + b.origW, 0)

    // Snapshot row heights from the ref (fast, no re-render)
    const rowHS: Record<number, number> = {}
    filteredRows.forEach((_, i) => { rowHS[i] = rowHeightsRef.current[i] ?? DEFAULT_ROW_H })
    const totalOrigH = Object.values(rowHS).reduce((a, b) => a + b, 0)

    tableScaleDrag.current = {
      startX: e.clientX, startY: e.clientY,
      colSizes, rowHeightsSnapshot: rowHS,
      totalOrigW, totalOrigH,
    }

    const onMove = (ev: MouseEvent) => {
      if (!tableScaleDrag.current) return
      const { startX, startY, colSizes, totalOrigW, totalOrigH } = tableScaleDrag.current
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (totalOrigW <= 0) return

      // ── Horizontal: directly manipulate colgroup DOM ──
      const scaleX = Math.max(0.3, (totalOrigW + dx) / totalOrigW)
      // Re-query colgroup each frame (safe — no React reconciliation during drag)
      const cg = table.querySelector('colgroup')
      if (cg) {
        const cols = cg.children as HTMLCollectionOf<HTMLElement>
        for (let ci = 0; ci < cols.length && ci < colSizes.length; ci++) {
          cols[ci].style.width = `${Math.max(MIN_COL_W, Math.round(colSizes[ci].origW * scaleX))}px`
        }
      }

      // ── Vertical: directly manipulate visible <tr> elements ──
      if (totalOrigH > 0) {
        const scaleY = Math.max(0.3, (totalOrigH + dy) / totalOrigH)
        const rows = table.querySelectorAll('tbody tr')
        // Update rowHeightsRef so the virtualizer's estimateSize stays correct
        const rh = tableScaleDrag.current.rowHeightsSnapshot
        for (let ri = 0; ri < rows.length; ri++) {
          const tr = rows[ri] as HTMLElement
          const dataIdx = parseInt(tr.dataset.index ?? '', 10)
          if (!isNaN(dataIdx) && rh[dataIdx] !== undefined) {
            const newH = Math.max(MIN_ROW_H, Math.round(rh[dataIdx] * scaleY))
            tr.style.height = `${newH}px`
            rowHeightsRef.current[dataIdx] = newH
          }
        }
        // Force virtualizer to re-measure
        virtualizer.measure()
      }
    }

    const onUp = () => {
      if (!tableScaleDrag.current) return
      const { colSizes, rowHeightsSnapshot } = tableScaleDrag.current

      // Read the current colgroup widths from the DOM (set by onMove)
      const finalColW: Record<string, number> = {}
      const cg = table.querySelector('colgroup')
      if (cg) {
        const cols = cg.children as HTMLCollectionOf<HTMLElement>
        for (let ci = 0; ci < cols.length; ci++) {
          const name = colSizes[ci]?.name
          if (name) {
            const w = parseFloat(cols[ci].style.width) || MIN_COL_W
            if (name === '__rowNum__') {
              // handled below in rowNumWidth
            } else {
              finalColW[name] = w
            }
          }
        }
      }

      // Read final row heights from rowHeightsRef (already updated by onMove)
      const finalRowH: Record<number, number> = {}
      for (const idxStr of Object.keys(rowHeightsSnapshot)) {
        const idx = Number(idxStr)
        finalRowH[idx] = rowHeightsRef.current[idx] ?? rowHeightsSnapshot[idx]
      }

      // Reset ref first
      tableScaleDrag.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)

      // Batch-commit to React state (single re-render)
      setColWidths(finalColW)
      setRowHeights(finalRowH)

      // Read row-num width from colgroup
      const firstCol = cg?.children[0] as HTMLElement | undefined
      if (firstCol) {
        const rnw = parseFloat(firstCol.style.width) || MIN_COL_W
        setRowNumWidth(rnw)
      }
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [filteredRows, virtualizer])

  // ── Tooltip ────────────────────────────────────────────────
  const showTooltip = useCallback((e: React.MouseEvent, value: unknown) => {
    if (value === null || value === undefined) return
    const inner = (e.currentTarget as HTMLElement).querySelector('.cell-inner') as HTMLElement | null
    if (inner && inner.scrollWidth <= inner.clientWidth) return
    const { clientX, clientY } = e
    tooltipTimer.current = setTimeout(() => setTooltip({ content: valueToString(value), x: clientX, y: clientY }), TOOLTIP_DELAY)
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

  // ── Copy cell value to clipboard ─────────────────────────
  const copyToClipboard = useCallback(async (value: unknown) => {
    try {
      await navigator.clipboard.writeText(valueToString(value))
    } catch { /* clipboard not available */ }
  }, [])

  // ── Copy table structure to clipboard ────────────────────
  const copyTableStructure = useCallback(async () => {
    const header = '列名\t类型\t允许NULL'
    const rows = columns.map(c => `${c.name}\t${c.type}\t${c.nullable ? 'YES' : 'NO'}`)
    const text = [header, ...rows].join('\n')
    try {
      await navigator.clipboard.writeText(text)
    } catch { /* clipboard not available */ }
  }, [columns])

  // ── Cell context menu ────────────────────────────────────
  const onCellContextMenu = useCallback((e: React.MouseEvent, rowIdx: number, col: string, value: unknown) => {
    e.preventDefault()
    setCellCtxMenu({ rowIdx, col, value, x: e.clientX, y: e.clientY })
  }, [])

  // ── Double-click editing ─────────────────────────────────
  const startEditing = useCallback((rowIdx: number, col: string, value: unknown) => {
    setEditingCell({ rowIdx, col })
    setEditValue(valueToString(value))
    // Focus the input on next render
    setTimeout(() => editInputRef.current?.focus(), 0)
  }, [])

  const commitEdit = useCallback(() => {
    if (!editingCell) return
    const { rowIdx, col } = editingCell
    const oldValue = filteredRows[rowIdx]?.[col]
    onCellEdit?.(rowIdx, col, editValue, oldValue)
    setEditingCell(null)
    setEditValue('')
  }, [editingCell, editValue, filteredRows, onCellEdit])

  const cancelEdit = useCallback(() => {
    setEditingCell(null)
    setEditValue('')
  }, [])

  const confirmSaveEdit = useCallback(() => {
    if (!editingCell) return
    const { rowIdx, col } = editingCell
    const oldValue = filteredRows[rowIdx]?.[col]
    const oldStr = valueToString(oldValue)

    // No actual changes — quietly exit edit mode
    if (editValue === oldStr) {
      setEditingCell(null)
      setEditValue('')
      return
    }

    // Changes detected — prompt user; abandoning is not allowed
    const save = window.confirm(`是否保存对 "${col}" 的修改？`)
    if (save) {
      commitEdit()
    } else {
      // Return to editing — user cannot abandon changes
      setTimeout(() => editInputRef.current?.focus(), 0)
    }
  }, [editingCell, editValue, filteredRows, commitEdit])

  return (
    <div ref={internalRef} className="h-full flex flex-col">
      {/* Active filter bar */}
      {filterCount > 0 && (
        <div className="flex items-center gap-2 px-2 py-1 bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800 flex-wrap flex-shrink-0">
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

      {/* Scrollable virtual table */}
      <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-auto">
        <table className="text-xs border-collapse select-none" style={{ tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
          <colgroup>
            <col data-col-name="__rowNum__" style={{ width: rowNumWidth }} />
            {effectiveColumns.map(col => <col key={col.name} data-col-name={col.name} style={{ width: getColW(col.name) }} />)}
          </colgroup>

          <thead className="sticky top-0 bg-green-600 text-white dark:bg-green-700 z-10">
            <tr>
              <th className="border-b border-r border-green-500 dark:border-green-600 bg-green-600 dark:bg-green-700 text-white select-none cursor-pointer"
                style={{ width: rowNumWidth, position: 'relative', overflow: 'hidden', minWidth: ROW_NUM_W }}
                onClick={selectAll}
                title="点击选中全部">
                {/* Excel-like corner drag handle */}
                <div onMouseDown={onTableScaleStart}
                  className="absolute right-0 bottom-0 w-3.5 h-3.5 cursor-nwse-resize hover:bg-white/30 active:bg-white/50 transition-colors"
                  style={{ zIndex: 2, clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
                  onClick={e => e.stopPropagation()} />
              </th>
              {effectiveColumns.map((col, colIdx) => {
                const isColSel = selectedCol === col.name
                const hasFilter = !!filters[col.name]
                const letter = colToLetter(colIdx)
                const isComputed = colIdx >= columns.length
                return (
                  <th key={col.name}
                    style={{ width: getColW(col.name), position: 'relative', overflow: 'hidden' }}
                    className={`px-2 py-1.5 text-left font-medium border-b border-r border-green-500 dark:border-green-600
                      select-none whitespace-nowrap transition-colors text-white
                      ${isComputed ? 'bg-blue-600 dark:bg-blue-800' : ''}
                      ${isColSel ? 'bg-green-700 dark:bg-green-800' : 'hover:bg-green-500 dark:hover:bg-green-600 cursor-pointer'}`}
                    onClick={() => { setSelectedCol(isColSel ? null : col.name); onSort?.(col.name, sortColumn === col.name && sortDirection === 'asc' ? 'desc' : 'asc') }}
                    onContextMenu={e => onColContextMenu(e, col.name)}>
                    <span className="truncate flex items-center gap-1 pr-2">
                      {hasFilter && <span className="text-orange-400 shrink-0" title={`${filters[col.name].op} '${filters[col.name].value}'`}><ChevronDown className="w-2.5 h-2.5 inline" /></span>}
                      <span className="text-green-200 dark:text-green-300 font-mono text-[10px]">{letter}</span>
                      {isComputed && <Calculator className="w-2.5 h-2.5 inline text-blue-200" />}
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
            {/* Top spacer for virtual scrolling */}
            {virtualItems.length > 0 && virtualItems[0].start > 0 && (
              <tr>
                <td colSpan={effectiveColumns.length + 1} style={{ height: virtualItems[0].start, padding: 0, border: 'none' }} />
              </tr>
            )}
            {virtualItems.map(virtualRow => {
              const i = virtualRow.index
              const row = filteredRows[i]
              const isRowSel = selectedRow === i
              const rowH = getRowH(i)
              return (
                <tr key={virtualRow.key}
                  data-index={i}
                  ref={virtualizer.measureElement}
                  style={{ height: rowH }}
                  className="border-b border-gray-100 dark:border-gray-800">
                  <td style={{ width: ROW_NUM_W, height: rowH, position: 'relative', overflow: 'visible' }}
                    className={`border-r border-gray-200 dark:border-gray-700 text-right select-none cursor-pointer transition-colors
                      ${isRowSel ? 'bg-green-500 text-white font-bold' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                    onClick={() => setSelectedRow(isRowSel ? null : i)}>
                    <span className="px-2">{rowOffset + i + 1}</span>
                    <div onMouseDown={e => onRowResizeStart(e, i)}
                      className="absolute bottom-0 left-0 w-full h-1.5 cursor-row-resize hover:bg-green-400/60 active:bg-green-500/80 transition-colors"
                      style={{ zIndex: 1 }} onClick={e => e.stopPropagation()} />
                  </td>
                  {effectiveColumns.map((col, colIdx) => {
                    const isColSel = selectedCol === col.name
                    const isCellHov = hoveredCell?.row === i && hoveredCell?.col === col.name
                    const cellSelected = isCellSelected(colIdx, i)
                    const bg = isCellHov ? 'bg-yellow-100 dark:bg-yellow-900/40'
                      : cellSelected ? 'bg-green-200 dark:bg-green-700/50'
                      : isRowSel ? 'bg-green-50 dark:bg-green-900/20'
                      : isColSel ? 'bg-green-50 dark:bg-green-900/20' : ''
                    const isEditing = editingCell?.rowIdx === i && editingCell?.col === col.name
                    const cellHasFormula = hasFormula(colIdx, i)
                    // Get value from formula store (handles computed columns + cell formulas)
                    const rawValue = colIdx < columns.length ? row[col.name] : undefined
                    const displayValue = getCellValue(colIdx, i)
                    const value = displayValue !== undefined ? displayValue : rawValue
                  return (
                    <td key={col.name}
                      data-row-index={i}
                      data-col-index={colIdx}
                      style={{
                        width: getColW(col.name), height: rowH, maxWidth: getColW(col.name),
                        position: 'relative',
                      }}
                      onMouseEnter={e => { if (!isEditing) { setHoveredCell({ row: i, col: col.name }); showTooltip(e, value) } }}
                      onMouseLeave={() => {
                        if (isEditing) {
                          confirmSaveEdit()
                        } else {
                          setHoveredCell(null);
                          hideTooltip()
                        }
                      }}
                      onMouseMove={isEditing ? undefined : updateTooltipPos}
                      onMouseDown={(e) => {
                        if (!isEditing && e.button === 0) {
                          mouseDrag.current = { startCol: colIdx, startRow: i }
                          selectCell(colIdx, i)
                        }
                      }}
                      onClick={(e) => {
                        if (isDragging.current) return
                        if (!isEditing) {
                          setHoveredCell({ row: i, col: col.name })
                          if (e.ctrlKey || e.metaKey) { toggleCellSelection(colIdx, i) }
                          else if (e.shiftKey) { extendSelection(colIdx, i) }
                          else { selectCell(colIdx, i) }
                        }
                      }}
                      onDoubleClick={() => {
                        selectCell(colIdx, i)
                        if (cellHasFormula) {
                          // Let user edit formula in the FormulaBar
                          // The formulaStore.editingCell is set by selectCell + FormulaBar handles the rest
                        } else {
                          startEditing(i, col.name, value)
                        }
                      }}
                      onContextMenu={e => onCellContextMenu(e, i, col.name, value)}
                      className={`px-2 font-mono border-r border-gray-100 dark:border-gray-800 overflow-hidden cursor-default transition-colors ${bg}`}>
                        {/* Formula indicator stripe */}
                        {cellHasFormula && (
                          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-blue-400 dark:bg-blue-500" />
                        )}
                        {isEditing ? (
                          <input
                            ref={editInputRef}
                            className="w-full h-full bg-white dark:bg-gray-700 border border-green-500 rounded px-1 outline-none text-xs"
                            style={{ lineHeight: `${rowH - 4}px` }}
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={confirmSaveEdit}
                            onKeyDown={e => {
                              if (e.key === 'Enter') commitEdit()
                              else if (e.key === 'Escape') confirmSaveEdit()
                            }}
                          />
                        ) : (
                          <div className={`cell-inner truncate ${cellHasFormula ? 'pl-1' : ''}`} style={{ lineHeight: `${rowH}px` }}>
                            {value === null ? <span className="text-gray-400 italic">NULL</span>
                              : value === undefined ? <span className="text-gray-300 italic">—</span>
                              : valueToString(value)}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {/* Bottom spacer for virtual scrolling */}
            {virtualItems.length > 0 && totalVirtualSize - (virtualItems[virtualItems.length - 1]?.end ?? 0) > 0 && (
              <tr>
                <td colSpan={effectiveColumns.length + 1} style={{
                  height: Math.max(0, totalVirtualSize - (virtualItems[virtualItems.length - 1]?.end ?? 0)),
                  padding: 0,
                  border: 'none'
                }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {tooltip && <CellTooltip {...tooltip} />}

      {cellCtxMenu && (
        <CellContextMenu
          menu={cellCtxMenu}
          onClose={() => setCellCtxMenu(null)}
          onCopy={copyToClipboard}
        />
      )}

      {ctxMenu && (
        <ColContextMenu
          menu={ctxMenu}
          onClose={() => setCtxMenu(null)}
          onSort={(col, dir) => onSort?.(col, dir)}
          onFilter={handleFilter}
          onClearFilter={handleClearFilter}
          onViewSQL={() => setShowSQL(true)}
          onScreenshot={handleScreenshot}
          onCopy={copyToClipboard}
          onCopyStructure={copyTableStructure}
          hasSql={!!sql}
          activeFilter={filters[ctxMenu.col]}
        />
      )}

      {showSQL && sql && <SQLModal sql={sql} onClose={() => setShowSQL(false)} />}
    </div>
  )
}
