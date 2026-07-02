import React, { useMemo, useRef, useState, useCallback } from 'react'
import { X } from 'lucide-react'
import type { DatabaseInfo, TableInfo } from '@dbforge/shared'

interface Props {
  db: DatabaseInfo
  focusTable?: string
  onClose: () => void
}

interface NodePos { x: number; y: number }

const COL_H = 22
const HEADER_H = 32
const NODE_W = 200
const H_GAP = 80
const V_GAP = 40

function tableHeight(t: TableInfo) {
  return HEADER_H + t.columns.length * COL_H
}

export default function ERDiagram({ db, focusTable, onClose }: Props): React.ReactElement {
  const svgRef = useRef<SVGSVGElement>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)

  const isAllTables = !focusTable

  // Collect focus table + directly related tables (or all tables if no focusTable)
  const relatedNames = useMemo(() => {
    if (isAllTables) {
      return new Set(db.tables.map(t => t.name))
    }
    const focusTableInfo = db.tables.find(t => t.name === focusTable)
    const s = new Set<string>([focusTable])
    focusTableInfo?.foreignKeys.forEach(fk => s.add(fk.referencedTable))
    db.tables.forEach(t => { if (t.foreignKeys.some(fk => fk.referencedTable === focusTable)) s.add(t.name) })
    return s
  }, [db, focusTable, isAllTables])

  const tables = useMemo(() => db.tables.filter(t => relatedNames.has(t.name)), [db, relatedNames])

  const focusTableInfo = db.tables.find(t => t.name === focusTable)

  // Initial layout
  const initialPositions = useMemo<Record<string, NodePos>>(() => {
    const cols = Math.max(1, Math.ceil(Math.sqrt(tables.length)))
    const pos: Record<string, NodePos> = {}
    tables.forEach((t, i) => {
      pos[t.name] = {
        x: (i % cols) * (NODE_W + H_GAP),
        y: Math.floor(i / cols) * (180 + V_GAP)
      }
    })
    return pos
  }, [tables])

  const [positions, setPositions] = useState<Record<string, NodePos>>(initialPositions)

  // Drag state — either panning canvas or dragging a node
  const dragState = useRef<
    | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number }
    | { kind: 'node'; name: string; startX: number; startY: number; nodeX: number; nodeY: number }
    | null
  >(null)

  const edges = useMemo(() => {
    const result: { from: string; fromCol: string; to: string; toCol: string }[] = []
    tables.forEach(t => {
      t.foreignKeys.forEach(fk => {
        if (relatedNames.has(fk.referencedTable)) {
          result.push({ from: t.name, fromCol: fk.columnName, to: fk.referencedTable, toCol: fk.referencedColumn })
        }
      })
    })
    return result
  }, [tables, relatedNames])

  // Edge path using current positions
  const edgePath = useCallback((e: typeof edges[0]) => {
    const from = positions[e.from]
    const to = positions[e.to]
    const fromTable = tables.find(t => t.name === e.from)
    const toTable = tables.find(t => t.name === e.to)
    if (!from || !to || !fromTable || !toTable) return ''
    const fromColIdx = fromTable.columns.findIndex(c => c.name === e.fromCol)
    const toColIdx = toTable.columns.findIndex(c => c.name === e.toCol)
    const fy = from.y + HEADER_H + fromColIdx * COL_H + COL_H / 2
    const ty = to.y + HEADER_H + toColIdx * COL_H + COL_H / 2
    const fromRight = from.x + NODE_W < to.x + NODE_W / 2
    const fx = fromRight ? from.x + NODE_W : from.x
    const tx = fromRight ? to.x : to.x + NODE_W
    const mx = (fx + tx) / 2
    return `M ${fx} ${fy} C ${mx} ${fy}, ${mx} ${ty}, ${tx} ${ty}`
  }, [positions, tables])

  // Mouse handlers
  const onNodeMouseDown = useCallback((e: React.MouseEvent, name: string) => {
    e.stopPropagation()
    dragState.current = {
      kind: 'node',
      name,
      startX: e.clientX,
      startY: e.clientY,
      nodeX: positions[name].x,
      nodeY: positions[name].y
    }
  }, [positions])

  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    dragState.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
  }

  const onMouseMove = (e: React.MouseEvent) => {
    const d = dragState.current
    if (!d) return
    if (d.kind === 'pan') {
      setPan({ x: d.panX + e.clientX - d.startX, y: d.panY + e.clientY - d.startY })
    } else {
      const dx = (e.clientX - d.startX) / zoom
      const dy = (e.clientY - d.startY) / zoom
      setPositions(prev => ({ ...prev, [d.name]: { x: d.nodeX + dx, y: d.nodeY + dy } }))
    }
  }

  const onMouseUp = () => { dragState.current = null }

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    setZoom(z => Math.min(2.5, Math.max(0.2, z - e.deltaY * 0.001)))
  }

  const isDark = document.documentElement.classList.contains('dark')
  const bg = isDark ? '#111827' : '#f9fafb'
  const nodeBg = isDark ? '#1f2937' : '#ffffff'
  const nodeHeader = isDark ? '#064e3b' : '#d1fae5'
  const nodeHeaderFocus = isDark ? '#065f46' : '#22c55e'
  const textColor = isDark ? '#f3f4f6' : '#111827'
  const textMuted = isDark ? '#9ca3af' : '#6b7280'
  const borderColor = isDark ? '#374151' : '#e5e7eb'
  const pkColor = isDark ? '#fbbf24' : '#d97706'
  const fkColor = isDark ? '#4ade80' : '#16a34a'
  const edgeColor = isDark ? '#4b5563' : '#94a3b8'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl flex flex-col"
        style={{ width: '85vw', height: '80vh' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <span className="font-semibold text-sm">
            {isAllTables ? (
              <>ER 图 · <span className="text-green-500">{db.name}</span>
              <span className="ml-2 text-xs text-gray-400 font-normal">所有表（{tables.length} 张）</span></>
            ) : (
              <>ER 图 · <span className="text-green-500">{focusTable}</span>
              <span className="ml-2 text-xs text-gray-400 font-normal">及关联表（{tables.length} 张）</span></>
            )}
          </span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">滚轮缩放 · 拖拽表节点或画布</span>
            <button onClick={onClose}
              className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-lg leading-none"><X className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-hidden rounded-b-xl select-none"
          style={{ background: bg }}
          onMouseDown={onCanvasMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onWheel={onWheel}>
          <svg ref={svgRef} width="100%" height="100%" style={{ cursor: 'grab' }}>
            <defs>
              <marker id="er-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill={edgeColor} />
              </marker>
              <pattern id="er-dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1" fill={isDark ? '#374151' : '#e2e8f0'} />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#er-dots)" />

            <g transform={`translate(${pan.x + 40},${pan.y + 40}) scale(${zoom})`}>
              {/* Edges — rendered below nodes */}
              {edges.map((e, i) => (
                <path key={i} d={edgePath(e)}
                  fill="none" stroke={edgeColor} strokeWidth="1.5"
                  strokeDasharray="5,3" markerEnd="url(#er-arrow)" />
              ))}

              {/* Nodes */}
              {tables.map(table => {
                const pos = positions[table.name]
                const height = tableHeight(table)
                const isFocus = !isAllTables && table.name === focusTable
                return (
                  <g key={table.name}
                    transform={`translate(${pos.x},${pos.y})`}
                    style={{ cursor: 'move' }}
                    onMouseDown={e => onNodeMouseDown(e, table.name)}>
                    {/* Shadow */}
                    <rect x="3" y="3" width={NODE_W} height={height} rx="8" fill="rgba(0,0,0,0.08)" />
                    {/* Body */}
                    <rect width={NODE_W} height={height} rx="8"
                      fill={nodeBg}
                      stroke={isFocus ? '#22c55e' : borderColor}
                      strokeWidth={isFocus ? 2 : 1} />
                    {/* Header bg */}
                    <rect width={NODE_W} height={HEADER_H} rx="8"
                      fill={isFocus ? nodeHeaderFocus : nodeHeader} />
                    <rect y={HEADER_H - 8} width={NODE_W} height={8}
                      fill={isFocus ? nodeHeaderFocus : nodeHeader} />
                    {/* Table name */}
                    <text x={NODE_W / 2} y={HEADER_H / 2 + 5} textAnchor="middle"
                      fontSize="12" fontWeight="600"
                      fill={isFocus ? '#ffffff' : textColor}
                      style={{ pointerEvents: 'none' }}>
                      {table.name}
                    </text>

                    {/* Columns */}
                    {table.columns.map((col, ci) => {
                      const isPK = table.primaryKeys.includes(col.name)
                      const isFK = table.foreignKeys.some(fk => fk.columnName === col.name)
                      const cy = HEADER_H + ci * COL_H
                      return (
                        <g key={col.name} style={{ pointerEvents: 'none' }}>
                          {ci % 2 === 1 && (
                            <rect x={1} y={cy} width={NODE_W - 2} height={COL_H}
                              fill={isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'} />
                          )}
                          <text x={10} y={cy + COL_H / 2 + 4} fontSize="10"
                            fill={isPK ? pkColor : isFK ? fkColor : textMuted}>
                            {isPK ? <tspan fill="#f59e0b" fontWeight="bold">PK</tspan> : isFK ? <tspan fill="#22c55e" fontWeight="bold">FK</tspan> : <tspan>·</tspan>}
                          </text>
                          <text x={28} y={cy + COL_H / 2 + 4} fontSize="11"
                            fill={isPK ? pkColor : isFK ? fkColor : textColor}
                            fontWeight={isPK ? '600' : '400'}>
                            {col.name}
                          </text>
                          <text x={NODE_W - 8} y={cy + COL_H / 2 + 4} textAnchor="end"
                            fontSize="10" fill={textMuted}>
                            {col.type.split('(')[0]}
                          </text>
                          <line x1={0} y1={cy + COL_H} x2={NODE_W} y2={cy + COL_H}
                            stroke={borderColor} strokeWidth="0.5" />
                        </g>
                      )
                    })}
                  </g>
                )
              })}
            </g>
          </svg>
        </div>

        {/* Legend */}
        <div className="absolute bottom-4 right-4 flex items-center gap-3 text-xs text-gray-400 bg-white/80 dark:bg-gray-800/80 backdrop-blur px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
          <span style={{ color: pkColor }}>PK 主键</span>
          <span style={{ color: fkColor }}>FK 外键</span>
          <span>— 关联关系</span>
        </div>
      </div>
    </div>
  )
}
