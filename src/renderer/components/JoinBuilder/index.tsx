import React, { useMemo, useRef, useState, useCallback } from 'react'
import type { DatabaseInfo, TableInfo } from '../../../shared/types'

// ── Types ─────────────────────────────────────────────────────

type JoinType = 'INNER JOIN' | 'LEFT JOIN' | 'RIGHT JOIN' | 'FULL OUTER JOIN'

interface JoinEdge {
  id: string
  fromTable: string
  fromCol: string
  toTable: string
  toCol: string
  joinType: JoinType
}

interface SelectedTable {
  name: string
  alias: string
  selectedCols: Set<string>
}

interface NodePos { x: number; y: number }

interface Props {
  db: DatabaseInfo
  onClose: () => void
  onInsertSQL: (sql: string) => void
}

// ── Constants ─────────────────────────────────────────────────

const COL_H = 22
const HEADER_H = 34
const NODE_W = 200
const H_GAP = 100
const V_GAP = 60

const JOIN_COLORS: Record<JoinType, string> = {
  'INNER JOIN': '#3b82f6',
  'LEFT JOIN': '#10b981',
  'RIGHT JOIN': '#f59e0b',
  'FULL OUTER JOIN': '#8b5cf6',
}

function tableHeight(t: TableInfo) {
  return HEADER_H + t.columns.length * COL_H
}

function genId() {
  return Math.random().toString(36).slice(2, 9)
}

// ── SQL Generator ─────────────────────────────────────────────

function buildSQL(
  tables: SelectedTable[],
  edges: JoinEdge[],
  dbName: string,
  allTables: TableInfo[]
): string {
  if (tables.length === 0) return ''

  const selectCols: string[] = []
  tables.forEach(t => {
    if (t.selectedCols.size === 0) {
      selectCols.push(`  ${t.alias}.*`)
    } else {
      t.selectedCols.forEach(col => {
        selectCols.push(`  ${t.alias}.${col}`)
      })
    }
  })

  const base = tables[0]
  const baseInfo = allTables.find(t => t.name === base.name)
  if (!baseInfo) return ''

  let sql = `SELECT\n${selectCols.join(',\n')}\nFROM \`${dbName}\`.\`${base.name}\` AS ${base.alias}`

  // BFS to order joins
  const visited = new Set<string>([base.name])
  const queue = [base.name]
  while (queue.length > 0) {
    const cur = queue.shift()!
    edges.forEach(e => {
      if (e.fromTable === cur && !visited.has(e.toTable)) {
        visited.add(e.toTable)
        queue.push(e.toTable)
        const toAlias = tables.find(t => t.name === e.toTable)?.alias ?? e.toTable
        const fromAlias = tables.find(t => t.name === e.fromTable)?.alias ?? e.fromTable
        sql += `\n${e.joinType} \`${dbName}\`.\`${e.toTable}\` AS ${toAlias}`
        sql += `\n  ON ${fromAlias}.${e.fromCol} = ${toAlias}.${e.toCol}`
      } else if (e.toTable === cur && !visited.has(e.fromTable)) {
        visited.add(e.fromTable)
        queue.push(e.fromTable)
        const fromAlias = tables.find(t => t.name === e.fromTable)?.alias ?? e.fromTable
        const toAlias = tables.find(t => t.name === e.toTable)?.alias ?? e.toTable
        sql += `\n${e.joinType} \`${dbName}\`.\`${e.fromTable}\` AS ${fromAlias}`
        sql += `\n  ON ${toAlias}.${e.toCol} = ${fromAlias}.${e.fromCol}`
      }
    })
  }

  sql += '\nLIMIT 100'
  return sql
}

// ── JoinEdgePanel ─────────────────────────────────────────────

function JoinEdgePanel({
  edge,
  tables,
  allTables,
  onChange,
  onRemove,
}: {
  edge: JoinEdge
  tables: SelectedTable[]
  allTables: TableInfo[]
  onChange: (e: JoinEdge) => void
  onRemove: () => void
}) {
  const fromInfo = allTables.find(t => t.name === edge.fromTable)
  const toInfo = allTables.find(t => t.name === edge.toTable)

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-xs flex-wrap">
      <select
        value={edge.joinType}
        onChange={e => onChange({ ...edge, joinType: e.target.value as JoinType })}
        className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-1.5 py-1 text-xs font-medium"
        style={{ color: JOIN_COLORS[edge.joinType] }}
      >
        {(Object.keys(JOIN_COLORS) as JoinType[]).map(j => (
          <option key={j} value={j}>{j}</option>
        ))}
      </select>

      <span className="text-gray-500">从</span>
      <select
        value={edge.fromTable}
        onChange={e => onChange({ ...edge, fromTable: e.target.value, fromCol: allTables.find(t => t.name === e.target.value)?.columns[0]?.name ?? '' })}
        className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-1.5 py-1"
      >
        {tables.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
      </select>
      <select
        value={edge.fromCol}
        onChange={e => onChange({ ...edge, fromCol: e.target.value })}
        className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-1.5 py-1 font-mono"
      >
        {fromInfo?.columns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
      </select>

      <span className="text-gray-500">=</span>

      <select
        value={edge.toTable}
        onChange={e => onChange({ ...edge, toTable: e.target.value, toCol: allTables.find(t => t.name === e.target.value)?.columns[0]?.name ?? '' })}
        className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-1.5 py-1"
      >
        {tables.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
      </select>
      <select
        value={edge.toCol}
        onChange={e => onChange({ ...edge, toCol: e.target.value })}
        className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-1.5 py-1 font-mono"
      >
        {toInfo?.columns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
      </select>

      <button onClick={onRemove} className="ml-auto text-red-400 hover:text-red-600 px-1">✕</button>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────

export default function JoinBuilder({ db, onClose, onInsertSQL }: Props): React.ReactElement {
  const [selectedTables, setSelectedTables] = useState<SelectedTable[]>([])
  const [edges, setEdges] = useState<JoinEdge[]>([])
  const [positions, setPositions] = useState<Record<string, NodePos>>({})
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [activeTab, setActiveTab] = useState<'canvas' | 'columns' | 'sql'>('canvas')
  const [pendingEdge, setPendingEdge] = useState<{ fromTable: string; fromCol: string } | null>(null)

  const dragState = useRef<
    | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number }
    | { kind: 'node'; name: string; startX: number; startY: number; nodeX: number; nodeY: number }
    | null
  >(null)

  const isDark = document.documentElement.classList.contains('dark')
  const bg = isDark ? '#111827' : '#f9fafb'
  const nodeBg = isDark ? '#1f2937' : '#ffffff'
  const nodeHeader = isDark ? '#1e3a5f' : '#dbeafe'
  const textColor = isDark ? '#f3f4f6' : '#111827'
  const textMuted = isDark ? '#9ca3af' : '#6b7280'
  const borderColor = isDark ? '#374151' : '#e5e7eb'
  const pkColor = isDark ? '#fbbf24' : '#d97706'
  const fkColor = isDark ? '#60a5fa' : '#2563eb'

  // Add table to canvas
  const addTable = useCallback((tableName: string, autoClose = false) => {
    if (selectedTables.find(t => t.name === tableName)) return
    const info = db.tables.find(t => t.name === tableName)!
    const idx = selectedTables.length
    const cols = Math.max(1, Math.ceil(Math.sqrt(idx + 1)))
    const x = (idx % cols) * (NODE_W + H_GAP) + 40
    const y = Math.floor(idx / cols) * (tableHeight(info) + V_GAP) + 40

    setSelectedTables(prev => [...prev, {
      name: tableName,
      alias: tableName.slice(0, 1).toLowerCase() + (selectedTables.length + 1),
      selectedCols: new Set()
    }])
    setPositions(prev => ({ ...prev, [tableName]: { x, y } }))

    // Auto-detect FK edges
    const newEdges: JoinEdge[] = []
    info.foreignKeys.forEach(fk => {
      if (selectedTables.find(t => t.name === fk.referencedTable)) {
        newEdges.push({
          id: genId(),
          fromTable: tableName,
          fromCol: fk.columnName,
          toTable: fk.referencedTable,
          toCol: fk.referencedColumn,
          joinType: 'INNER JOIN'
        })
      }
    })
    // Also check if existing tables FK to this new table
    selectedTables.forEach(st => {
      const stInfo = db.tables.find(t => t.name === st.name)
      stInfo?.foreignKeys.forEach(fk => {
        if (fk.referencedTable === tableName) {
          newEdges.push({
            id: genId(),
            fromTable: st.name,
            fromCol: fk.columnName,
            toTable: tableName,
            toCol: fk.referencedColumn,
            joinType: 'INNER JOIN'
          })
        }
      })
    })
    if (newEdges.length > 0) setEdges(prev => [...prev, ...newEdges])
    if (autoClose) onClose()
  }, [selectedTables, db.tables, onClose])

  const removeTable = (name: string) => {
    setSelectedTables(prev => prev.filter(t => t.name !== name))
    setEdges(prev => prev.filter(e => e.fromTable !== name && e.toTable !== name))
    setPositions(prev => { const p = { ...prev }; delete p[name]; return p })
  }

  // Edge path
  const edgePath = useCallback((e: JoinEdge) => {
    const from = positions[e.fromTable]
    const to = positions[e.toTable]
    const fromInfo = db.tables.find(t => t.name === e.fromTable)
    const toInfo = db.tables.find(t => t.name === e.toTable)
    if (!from || !to || !fromInfo || !toInfo) return ''
    const fromColIdx = fromInfo.columns.findIndex(c => c.name === e.fromCol)
    const toColIdx = toInfo.columns.findIndex(c => c.name === e.toCol)
    const fy = from.y + HEADER_H + Math.max(0, fromColIdx) * COL_H + COL_H / 2
    const ty = to.y + HEADER_H + Math.max(0, toColIdx) * COL_H + COL_H / 2
    const fromRight = from.x + NODE_W / 2 < to.x + NODE_W / 2
    const fx = fromRight ? from.x + NODE_W : from.x
    const tx = fromRight ? to.x : to.x + NODE_W
    const mx = (fx + tx) / 2
    return `M ${fx} ${fy} C ${mx} ${fy}, ${mx} ${ty}, ${tx} ${ty}`
  }, [positions, db.tables])

  // Drag handlers
  const onNodeMouseDown = useCallback((e: React.MouseEvent, name: string) => {
    e.stopPropagation()
    dragState.current = { kind: 'node', name, startX: e.clientX, startY: e.clientY, nodeX: positions[name].x, nodeY: positions[name].y }
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

  // Column click for pending edge
  const onColClick = (tableName: string, colName: string) => {
    if (!pendingEdge) {
      setPendingEdge({ fromTable: tableName, fromCol: colName })
    } else {
      if (pendingEdge.fromTable !== tableName) {
        setEdges(prev => [...prev, {
          id: genId(),
          fromTable: pendingEdge.fromTable,
          fromCol: pendingEdge.fromCol,
          toTable: tableName,
          toCol: colName,
          joinType: 'INNER JOIN'
        }])
      }
      setPendingEdge(null)
    }
  }

  const sql = useMemo(() =>
    buildSQL(selectedTables, edges, db.name, db.tables),
    [selectedTables, edges, db]
  )

  const addManualEdge = () => {
    if (selectedTables.length < 2) return
    const t0 = selectedTables[0]
    const t1 = selectedTables[1]
    const info0 = db.tables.find(t => t.name === t0.name)
    const info1 = db.tables.find(t => t.name === t1.name)
    setEdges(prev => [...prev, {
      id: genId(),
      fromTable: t0.name,
      fromCol: info0?.columns[0]?.name ?? '',
      toTable: t1.name,
      toCol: info1?.columns[0]?.name ?? '',
      joinType: 'INNER JOIN'
    }])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl flex flex-col"
        style={{ width: '92vw', height: '88vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-sm">🔗 可视化 JOIN 构建器</span>
            <span className="text-xs text-gray-400">数据库: <span className="text-blue-500 font-mono">{db.name}</span></span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onInsertSQL(sql)}
              disabled={!sql}
              className="text-xs px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
            >
              ↗ 插入到编辑器
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-lg leading-none px-1">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: table list */}
          <div className="w-44 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
            <div className="px-3 py-2 text-xs font-semibold text-gray-500 border-b border-gray-100 dark:border-gray-800">
              表列表 ({db.tables.length})
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {db.tables.map(t => {
                const added = !!selectedTables.find(s => s.name === t.name)
                return (
                  <div
                    key={t.name}
                    onClick={() => added ? removeTable(t.name) : addTable(t.name, true)}
                    className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs transition-colors ${
                      added
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <span>{added ? '✓' : '+'}</span>
                    <span className="font-mono truncate">{t.name}</span>
                  </div>
                )
              })}
            </div>
            <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400">
              点击添加/移除表
            </div>
          </div>

          {/* Center: canvas + tabs */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              {(['canvas', 'columns', 'sql'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                    activeTab === tab
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  {tab === 'canvas' ? '🖼 画布' : tab === 'columns' ? '📋 列选择' : '📝 SQL 预览'}
                </button>
              ))}
              {pendingEdge && (
                <div className="ml-auto flex items-center gap-2 px-3 text-xs text-amber-600 dark:text-amber-400">
                  <span className="animate-pulse">●</span>
                  已选 {pendingEdge.fromTable}.{pendingEdge.fromCol}，点击目标列完成连接
                  <button onClick={() => setPendingEdge(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                </div>
              )}
            </div>

            {/* Canvas tab */}
            {activeTab === 'canvas' && (
              <div
                className="flex-1 overflow-hidden select-none relative"
                style={{ background: bg }}
                onMouseDown={onCanvasMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                onWheel={onWheel}
              >
                {selectedTables.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center text-gray-400 text-sm space-y-1">
                      <div className="text-3xl">🗂</div>
                      <div>从左侧点击表名添加到画布</div>
                      <div className="text-xs">点击列名可手动连接 JOIN 条件</div>
                    </div>
                  </div>
                )}
                <svg width="100%" height="100%" style={{ cursor: 'grab' }}>
                  <defs>
                    <marker id="jb-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                      <path d="M0,0 L0,6 L8,3 z" fill={isDark ? '#4b5563' : '#94a3b8'} />
                    </marker>
                    <pattern id="jb-dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                      <circle cx="1" cy="1" r="1" fill={isDark ? '#374151' : '#e2e8f0'} />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#jb-dots)" />

                  <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
                    {/* Edges */}
                    {edges.map(e => (
                      <path
                        key={e.id}
                        d={edgePath(e)}
                        fill="none"
                        stroke={JOIN_COLORS[e.joinType]}
                        strokeWidth="2"
                        strokeDasharray="6,3"
                        markerEnd="url(#jb-arrow)"
                        opacity="0.8"
                      />
                    ))}

                    {/* Nodes */}
                    {selectedTables.map(st => {
                      const tableInfo = db.tables.find(t => t.name === st.name)!
                      const pos = positions[st.name] ?? { x: 0, y: 0 }
                      const h = tableHeight(tableInfo)
                      return (
                        <g
                          key={st.name}
                          transform={`translate(${pos.x},${pos.y})`}
                          style={{ cursor: 'move' }}
                          onMouseDown={e => onNodeMouseDown(e, st.name)}
                        >
                          <rect x="3" y="3" width={NODE_W} height={h} rx="8" fill="rgba(0,0,0,0.08)" />
                          <rect width={NODE_W} height={h} rx="8" fill={nodeBg} stroke={borderColor} strokeWidth="1" />
                          <rect width={NODE_W} height={HEADER_H} rx="8" fill={nodeHeader} />
                          <rect y={HEADER_H - 8} width={NODE_W} height={8} fill={nodeHeader} />
                          <text x={NODE_W / 2} y={HEADER_H / 2 + 5} textAnchor="middle" fontSize="12" fontWeight="600" fill={textColor} style={{ pointerEvents: 'none' }}>
                            {st.name}
                          </text>
                          <text x={NODE_W - 8} y={HEADER_H / 2 + 5} textAnchor="end" fontSize="10" fill={textMuted} style={{ pointerEvents: 'none' }}>
                            {st.alias}
                          </text>

                          {tableInfo.columns.map((col, ci) => {
                            const isPK = tableInfo.primaryKeys.includes(col.name)
                            const isFK = tableInfo.foreignKeys.some(fk => fk.columnName === col.name)
                            const cy = HEADER_H + ci * COL_H
                            const isPending = pendingEdge?.fromTable === st.name && pendingEdge?.fromCol === col.name
                            return (
                              <g
                                key={col.name}
                                style={{ cursor: 'pointer' }}
                                onClick={e => { e.stopPropagation(); onColClick(st.name, col.name) }}
                              >
                                {ci % 2 === 1 && (
                                  <rect x={1} y={cy} width={NODE_W - 2} height={COL_H}
                                    fill={isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'} />
                                )}
                                {isPending && (
                                  <rect x={1} y={cy} width={NODE_W - 2} height={COL_H} fill="rgba(245,158,11,0.2)" />
                                )}
                                <text x={10} y={cy + COL_H / 2 + 4} fontSize="10" fill={isPK ? pkColor : isFK ? fkColor : textMuted}>
                                  {isPK ? '🔑' : isFK ? '🔗' : '·'}
                                </text>
                                <text x={28} y={cy + COL_H / 2 + 4} fontSize="11" fill={isPK ? pkColor : isFK ? fkColor : textColor} fontWeight={isPK ? '600' : '400'}>
                                  {col.name}
                                </text>
                                <text x={NODE_W - 8} y={cy + COL_H / 2 + 4} textAnchor="end" fontSize="10" fill={textMuted}>
                                  {col.type.split('(')[0]}
                                </text>
                                <line x1={0} y1={cy + COL_H} x2={NODE_W} y2={cy + COL_H} stroke={borderColor} strokeWidth="0.5" />
                              </g>
                            )
                          })}
                        </g>
                      )
                    })}
                  </g>
                </svg>

                {/* Zoom controls */}
                <div className="absolute bottom-3 right-3 flex items-center gap-1">
                  <button onClick={() => setZoom(z => Math.min(2.5, z + 0.1))} className="w-7 h-7 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm">+</button>
                  <span className="text-xs text-gray-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
                  <button onClick={() => setZoom(z => Math.max(0.2, z - 0.1))} className="w-7 h-7 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm">−</button>
                  <button onClick={() => { setPan({ x: 0, y: 0 }); setZoom(1) }} className="text-xs px-2 h-7 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm ml-1">重置</button>
                </div>
              </div>
            )}

            {/* Columns tab */}
            {activeTab === 'columns' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {selectedTables.length === 0 && (
                  <div className="text-center text-gray-400 text-sm mt-8">请先在画布中添加表</div>
                )}
                {selectedTables.map(st => {
                  const info = db.tables.find(t => t.name === st.name)!
                  const allSelected = st.selectedCols.size === 0
                  return (
                    <div key={st.name} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <div className="flex items-center gap-3 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-gray-700">
                        <span className="font-semibold text-sm text-blue-600 dark:text-blue-400">{st.name}</span>
                        <span className="text-xs text-gray-400">别名:</span>
                        <input
                          value={st.alias}
                          onChange={e => setSelectedTables(prev => prev.map(t => t.name === st.name ? { ...t, alias: e.target.value } : t))}
                          className="text-xs font-mono px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 w-16"
                        />
                        <button
                          onClick={() => setSelectedTables(prev => prev.map(t => t.name === st.name ? { ...t, selectedCols: new Set() } : t))}
                          className={`ml-auto text-xs px-2 py-0.5 rounded ${allSelected ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500'}`}
                        >
                          全选 (*)
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-1 p-2">
                        {info.columns.map(col => {
                          const checked = st.selectedCols.has(col.name)
                          return (
                            <label key={col.name} className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer text-xs">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={e => {
                                  setSelectedTables(prev => prev.map(t => {
                                    if (t.name !== st.name) return t
                                    const s = new Set(t.selectedCols)
                                    e.target.checked ? s.add(col.name) : s.delete(col.name)
                                    return { ...t, selectedCols: s }
                                  }))
                                }}
                                className="rounded"
                              />
                              <span className="font-mono text-gray-700 dark:text-gray-300">{col.name}</span>
                              <span className="text-gray-400">{col.type.split('(')[0]}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* SQL preview tab */}
            {activeTab === 'sql' && (
              <div className="flex-1 flex flex-col overflow-hidden p-4 gap-3">
                <pre className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-xs font-mono text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 whitespace-pre-wrap">
                  {sql || '-- 请先在画布中添加表并配置 JOIN 条件'}
                </pre>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => sql && navigator.clipboard.writeText(sql)}
                    disabled={!sql}
                    className="text-xs px-3 py-1.5 rounded border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
                  >
                    📋 复制
                  </button>
                  <button
                    onClick={() => onInsertSQL(sql)}
                    disabled={!sql}
                    className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 font-medium"
                  >
                    ↗ 插入到编辑器
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: JOIN conditions */}
          <div className="w-72 flex-shrink-0 border-l border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-gray-500">JOIN 条件 ({edges.length})</span>
              <button
                onClick={addManualEdge}
                disabled={selectedTables.length < 2}
                className="text-xs px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-40"
              >
                + 添加
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {edges.length === 0 && (
                <div className="text-center text-gray-400 text-xs mt-6 px-3">
                  <div className="mb-1">暂无 JOIN 条件</div>
                  <div>添加多张表后会自动检测外键关系，或点击列名手动连接</div>
                </div>
              )}
              {edges.map(e => (
                <JoinEdgePanel
                  key={e.id}
                  edge={e}
                  tables={selectedTables}
                  allTables={db.tables}
                  onChange={updated => setEdges(prev => prev.map(x => x.id === e.id ? updated : x))}
                  onRemove={() => setEdges(prev => prev.filter(x => x.id !== e.id))}
                />
              ))}
            </div>

            {/* Legend */}
            <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-800 space-y-1">
              <div className="text-xs font-semibold text-gray-400 mb-1">JOIN 类型</div>
              {(Object.entries(JOIN_COLORS) as [JoinType, string][]).map(([type, color]) => (
                <div key={type} className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="w-3 h-0.5 inline-block rounded" style={{ background: color }} />
                  {type}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
