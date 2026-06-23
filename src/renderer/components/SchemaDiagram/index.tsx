import React, { useMemo, useRef, useState, useCallback } from 'react'
import { X, Info } from 'lucide-react'
import type { DatabaseInfo, TableInfo } from '../../../shared/types'
import { detectRelationships, type Relationship, type Cardinality } from '../../utils/schemaRelationships'

// ── Props ─────────────────────────────────────────────────────

interface Props {
  db: DatabaseInfo
  onClose: () => void
}

// ── Layout constants ──────────────────────────────────────────

const COL_H = 22
const HEADER_H = 32
const NODE_W = 200
const H_GAP = 100
const V_GAP = 60
const JUNCTION_W = 140
const JUNCTION_H = 36

// ── Cardinality colors ────────────────────────────────────────

const CARD_COLORS: Record<Cardinality, { stroke: string; label: string }> = {
  '1:1': { stroke: '#22c55e', label: '1 : 1' },
  '1:N': { stroke: '#3b82f6', label: '1 : N' },
  'N:M': { stroke: '#a855f7', label: 'N : M' },
}

interface NodePos { x: number; y: number }

// ── Helpers ───────────────────────────────────────────────────

function tableHeight(t: TableInfo): number {
  return HEADER_H + t.columns.length * COL_H
}

function isJunctionTable(tables: TableInfo[], relationships: Relationship[], tableName: string): boolean {
  return relationships.some(r => r.junctionTable === tableName)
}

// ── Component ─────────────────────────────────────────────────

export default function SchemaDiagram({ db, onClose }: Props): React.ReactElement {
  const svgRef = useRef<SVGSVGElement>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [hoveredRel, setHoveredRel] = useState<string | null>(null)

  // Detect relationships
  const relationships = useMemo(() => detectRelationships(db), [db])
  const junctionNames = useMemo(
    () => new Set(relationships.filter(r => r.junctionTable).map(r => r.junctionTable!)),
    [relationships]
  )

  // All tables involved in relationships + junction tables
  const involvedNames = useMemo(() => {
    const s = new Set<string>()
    for (const r of relationships) {
      s.add(r.fromTable)
      s.add(r.toTable)
      if (r.junctionTable) s.add(r.junctionTable)
    }
    // If no relationships, show all tables
    if (s.size === 0) {
      db.tables.forEach(t => s.add(t.name))
    }
    return s
  }, [relationships, db.tables])

  const tables = useMemo(
    () => db.tables.filter(t => involvedNames.has(t.name)),
    [db.tables, involvedNames]
  )

  // Initial grid layout
  const initialPositions = useMemo<Record<string, NodePos>>(() => {
    const regular = tables.filter(t => !junctionNames.has(t.name))
    const junctions = tables.filter(t => junctionNames.has(t.name))
    const all = [...regular, ...junctions]
    const cols = Math.max(1, Math.ceil(Math.sqrt(all.length)))
    const pos: Record<string, NodePos> = {}
    all.forEach((t, i) => {
      const isJunction = junctionNames.has(t.name)
      pos[t.name] = {
        x: (i % cols) * (NODE_W + H_GAP),
        y: Math.floor(i / cols) * (180 + V_GAP),
      }
      // Offset junction tables slightly to distinguish
      if (isJunction) {
        pos[t.name].x += 30
        pos[t.name].y += 20
      }
    })
    return pos
  }, [tables, junctionNames])

  const [positions, setPositions] = useState<Record<string, NodePos>>(initialPositions)

  // ── Drag state ────────────────────────────────────────────
  const dragState = useRef<
    | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number }
    | { kind: 'node'; name: string; startX: number; startY: number; nodeX: number; nodeY: number }
    | null
  >(null)

  // ── Edge rendering ────────────────────────────────────────
  const edgePath = useCallback(
    (rel: Relationship, posA: NodePos, posB: NodePos): string => {
      // Determine which side to connect
      const fromRight = posA.x + NODE_W < posB.x + NODE_W / 2
      const fx = fromRight ? posA.x + NODE_W : posA.x
      const tx = fromRight ? posB.x : posB.x + NODE_W
      const fy = posA.y + HEADER_H / 2
      const ty = posB.y + HEADER_H / 2
      const mx = (fx + tx) / 2
      return `M ${fx} ${fy} C ${mx} ${fy}, ${mx} ${ty}, ${tx} ${ty}`
    },
    []
  )

  const edgeMidpoint = useCallback(
    (rel: Relationship, posA: NodePos, posB: NodePos): { x: number; y: number } => {
      const fromRight = posA.x + NODE_W < posB.x + NODE_W / 2
      const fx = fromRight ? posA.x + NODE_W : posA.x
      const tx = fromRight ? posB.x : posB.x + NODE_W
      const fy = posA.y + HEADER_H / 2
      const ty = posB.y + HEADER_H / 2
      return { x: (fx + tx) / 2, y: (fy + ty) / 2 }
    },
    []
  )

  // ── Mouse handlers ────────────────────────────────────────
  const onNodeMouseDown = useCallback(
    (e: React.MouseEvent, name: string) => {
      e.stopPropagation()
      dragState.current = {
        kind: 'node',
        name,
        startX: e.clientX,
        startY: e.clientY,
        nodeX: positions[name].x,
        nodeY: positions[name].y,
      }
    },
    [positions]
  )

  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    dragState.current = {
      kind: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    }
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

  const onMouseUp = () => {
    dragState.current = null
  }

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    setZoom(z => Math.min(2.5, Math.max(0.2, z - e.deltaY * 0.001)))
  }

  // ── Theme colors ──────────────────────────────────────────
  const isDark = document.documentElement.classList.contains('dark')
  const bg = isDark ? '#111827' : '#f9fafb'
  const nodeBg = isDark ? '#1f2937' : '#ffffff'
  const nodeHeader = isDark ? '#064e3b' : '#d1fae5'
  const junctionBg = isDark ? '#1e293b' : '#f1f5f9'
  const junctionHeader = isDark ? '#334155' : '#cbd5e1'
  const textColor = isDark ? '#f3f4f6' : '#111827'
  const textMuted = isDark ? '#9ca3af' : '#6b7280'
  const borderColor = isDark ? '#374151' : '#e5e7eb'
  const junctionBorder = isDark ? '#475569' : '#94a3b8'
  const pkColor = isDark ? '#fbbf24' : '#d97706'
  const fkColor = isDark ? '#4ade80' : '#16a34a'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl flex flex-col"
        style={{ width: '85vw', height: '80vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <span className="font-semibold text-sm">
            Schema Diagram · <span className="text-purple-500">{db.name}</span>
            <span className="ml-2 text-xs text-gray-400 font-normal">
              关系图（{tables.length} 张表 · {relationships.length} 个关系）
            </span>
          </span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              滚轮缩放 · 拖拽表节点或画布
            </span>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-lg leading-none"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Canvas ── */}
        <div
          className="flex-1 overflow-hidden rounded-b-xl select-none"
          style={{ background: bg }}
          onMouseDown={onCanvasMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onWheel={onWheel}
        >
          <svg ref={svgRef} width="100%" height="100%" style={{ cursor: 'grab' }}>
            <defs>
              {/* Arrow markers for each cardinality type */}
              <marker id="sc-arrow-1to1" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill={CARD_COLORS['1:1'].stroke} />
              </marker>
              <marker id="sc-arrow-1toN" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill={CARD_COLORS['1:N'].stroke} />
              </marker>
              <marker id="sc-arrow-NtoM" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill={CARD_COLORS['N:M'].stroke} />
              </marker>
              <pattern id="sc-dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1" fill={isDark ? '#374151' : '#e2e8f0'} />
              </pattern>
            </defs>

            <rect width="100%" height="100%" fill="url(#sc-dots)" />

            <g transform={`translate(${pan.x + 40},${pan.y + 40}) scale(${zoom})`}>
              {/* ── Edges ── */}
              {relationships.map((rel, i) => {
                const posA = positions[rel.fromTable]
                const posB = positions[rel.toTable]
                if (!posA || !posB) return null

                const path = edgePath(rel, posA, posB)
                const mid = edgeMidpoint(rel, posA, posB)
                const card = CARD_COLORS[rel.cardinality]
                const rKey = relKey(rel)
                const isHovered = hoveredRel === rKey
                const markerId =
                  rel.cardinality === '1:1'
                    ? 'url(#sc-arrow-1to1)'
                    : rel.cardinality === '1:N'
                      ? 'url(#sc-arrow-1toN)'
                      : 'url(#sc-arrow-NtoM)'

                return (
                  <g key={rKey}>
                    {/* Invisible wider path for hover detection */}
                    <path
                      d={path}
                      fill="none"
                      stroke="transparent"
                      strokeWidth="12"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredRel(rKey)}
                      onMouseLeave={() => setHoveredRel(null)}
                    />
                    {/* Visible path */}
                    <path
                      d={path}
                      fill="none"
                      stroke={isHovered ? '#f59e0b' : card.stroke}
                      strokeWidth={isHovered ? 2.5 : 1.5}
                      strokeDasharray={rel.cardinality === '1:N' ? '6,3' : rel.cardinality === 'N:M' ? '3,3' : 'none'}
                      markerEnd={markerId}
                      style={{ cursor: 'pointer', transition: 'stroke 0.15s' }}
                      onMouseEnter={() => setHoveredRel(rKey)}
                      onMouseLeave={() => setHoveredRel(null)}
                    />
                    {/* Cardinality label background */}
                    <rect
                      x={mid.x - 22}
                      y={mid.y - 10}
                      width={44}
                      height={18}
                      rx="4"
                      fill={isDark ? '#1f2937' : '#ffffff'}
                      stroke={card.stroke}
                      strokeWidth="1"
                    />
                    {/* Cardinality label text */}
                    <text
                      x={mid.x}
                      y={mid.y + 4}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="700"
                      fill={card.stroke}
                      style={{ pointerEvents: 'none' }}
                    >
                      {card.label}
                    </text>
                    {/* Junction table name shown below label for N:M */}
                    {rel.junctionTable && isHovered && (
                      <text
                        x={mid.x}
                        y={mid.y + 22}
                        textAnchor="middle"
                        fontSize="8"
                        fill={isDark ? '#a78bfa' : '#7c3aed'}
                        style={{ pointerEvents: 'none' }}
                      >
                        via {rel.junctionTable}
                      </text>
                    )}
                  </g>
                )
              })}

              {/* ── Table nodes ── */}
              {tables.map(table => {
                const isJunction = junctionNames.has(table.name)
                const pos = positions[table.name]
                if (!pos) return null
                const height = tableHeight(table)
                const w = isJunction ? JUNCTION_W : NODE_W
                const h = isJunction ? JUNCTION_H : height

                return (
                  <g
                    key={table.name}
                    transform={`translate(${pos.x},${pos.y})`}
                    style={{ cursor: 'move' }}
                    onMouseDown={e => onNodeMouseDown(e, table.name)}
                  >
                    {/* Shadow */}
                    <rect x="2" y="2" width={w} height={h} rx="8" fill="rgba(0,0,0,0.06)" />
                    {/* Body */}
                    <rect
                      width={w}
                      height={h}
                      rx="8"
                      fill={isJunction ? junctionBg : nodeBg}
                      stroke={isJunction ? junctionBorder : borderColor}
                      strokeWidth={1}
                      strokeDasharray={isJunction ? '4,3' : 'none'}
                    />
                    {/* Header bg */}
                    <rect
                      width={w}
                      height={HEADER_H}
                      rx="8"
                      fill={isJunction ? junctionHeader : nodeHeader}
                    />
                    <rect
                      y={HEADER_H - 8}
                      width={w}
                      height={8}
                      fill={isJunction ? junctionHeader : nodeHeader}
                    />
                    {/* Table name */}
                    <text
                      x={w / 2}
                      y={HEADER_H / 2 + 5}
                      textAnchor="middle"
                      fontSize={isJunction ? '11' : '12'}
                      fontWeight="600"
                      fill={textColor}
                      style={{ pointerEvents: 'none' }}
                    >
                      {table.name}
                      {isJunction && (
                        <tspan fill={textMuted} fontSize="9" fontWeight="400">
                          {' '}(桥接)
                        </tspan>
                      )}
                    </text>

                    {/* Columns (only for non-junction tables) */}
                    {!isJunction &&
                      table.columns.map((col, ci) => {
                        const isPK = table.primaryKeys.includes(col.name)
                        const isFK = table.foreignKeys.some(fk => fk.columnName === col.name)
                        const cy = HEADER_H + ci * COL_H
                        return (
                          <g key={col.name} style={{ pointerEvents: 'none' }}>
                            {ci % 2 === 1 && (
                              <rect
                                x={1}
                                y={cy}
                                width={w - 2}
                                height={COL_H}
                                fill={isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'}
                              />
                            )}
                            <text
                              x={10}
                              y={cy + COL_H / 2 + 4}
                              fontSize="10"
                              fill={isPK ? pkColor : isFK ? fkColor : textMuted}
                            >
                              {isPK ? (
                                <tspan fill="#f59e0b" fontWeight="bold">
                                  PK
                                </tspan>
                              ) : isFK ? (
                                <tspan fill="#22c55e" fontWeight="bold">
                                  FK
                                </tspan>
                              ) : (
                                <tspan>·</tspan>
                              )}
                            </text>
                            <text
                              x={28}
                              y={cy + COL_H / 2 + 4}
                              fontSize="11"
                              fill={isPK ? pkColor : isFK ? fkColor : textColor}
                              fontWeight={isPK ? '600' : '400'}
                            >
                              {col.name}
                            </text>
                            <text
                              x={w - 8}
                              y={cy + COL_H / 2 + 4}
                              textAnchor="end"
                              fontSize="10"
                              fill={textMuted}
                            >
                              {col.type.split('(')[0]}
                            </text>
                            <line
                              x1={0}
                              y1={cy + COL_H}
                              x2={w}
                              y2={cy + COL_H}
                              stroke={borderColor}
                              strokeWidth="0.5"
                            />
                          </g>
                        )
                      })}
                  </g>
                )
              })}
            </g>
          </svg>
        </div>

        {/* ── Legend ── */}
        <div className="absolute bottom-4 right-4 flex items-center gap-3 text-xs bg-white/80 dark:bg-gray-800/80 backdrop-blur px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 inline-block" style={{ backgroundColor: '#22c55e' }} />
            1:1
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 inline-block border-dashed" style={{ borderBottom: '2px dashed #3b82f6' }} />
            1:N
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 inline-block" style={{ borderBottom: '2px dotted #a855f7' }} />
            N:M
          </span>
          <span className="text-gray-400">|</span>
          <span className="text-gray-500" style={{ color: junctionBorder }}>
            桥接表
          </span>
          <Info className="w-3 h-3 text-gray-400" />
        </div>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────

function relKey(rel: Relationship): string {
  return `${rel.fromTable}.${rel.fromColumn}→${rel.toTable}.${rel.toColumn}`
}
