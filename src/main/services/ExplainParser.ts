// ============================================================
// ExplainParser — Parse database EXPLAIN output into unified IR
// ============================================================

import type { ExplainPlanNode, ExplainResult } from '@dbforge/shared'

/**
 * Parse an EXPLAIN result from any supported database.
 * Returns unified ExplainPlanNode tree or null if parsing fails.
 */
export function parseExplain(
  rawOutput: string,
  databaseType: string
): ExplainPlanNode | null {
  switch (databaseType) {
    case 'mysql':
    case 'mariadb':
      return parseMySQLExplain(rawOutput)
    case 'postgresql':
      return parsePostgresExplain(rawOutput)
    case 'sqlite':
      return parseSQLiteExplain(rawOutput)
    default:
      return null
  }
}

// ── MySQL ────────────────────────────────────────────────────

function parseMySQLExplain(raw: string): ExplainPlanNode | null {
  try {
    const parsed = JSON.parse(raw)
    // MySQL EXPLAIN FORMAT=JSON returns { query_block: { ... } }
    if (parsed.query_block) {
      return parseMySQLBlock(parsed.query_block, 'root')
    }
    // Handle array of query blocks
    if (Array.isArray(parsed)) {
      const children = parsed.map((b: Record<string, unknown>, i: number) =>
        parseMySQLBlock(b.query_block as Record<string, unknown>, `qb-${i}`)
      ).filter(Boolean) as ExplainPlanNode[]

      if (children.length === 1) return children[0]
      return {
        id: 'root',
        operation: 'Multiple Query Blocks',
        startupCost: 0,
        totalCost: 0,
        planRows: 0,
        planWidth: 0,
        children,
        warnings: []
      }
    }
    return null
  } catch {
    return null
  }
}

function parseMySQLBlock(
  block: Record<string, unknown> | undefined,
  id: string
): ExplainPlanNode | null {
  if (!block) return null

  const table = block.table as Record<string, unknown> | undefined
  const costInfo = table?.cost_info as Record<string, unknown> | undefined

  const node: ExplainPlanNode = {
    id,
    operation: (table?.access_type as string) ?? (block.select_id ? `SELECT #${block.select_id}` : 'Unknown'),
    relation: table?.table_name as string | undefined,
    startupCost: parseFloat((costInfo?.read_cost as string) ?? '0'),
    totalCost: parseFloat((costInfo?.prefix_cost as string) ?? '0'),
    planRows: (table?.rows_examined_per_scan as number) ?? 0,
    planWidth: 0,
    filter: table?.filtered ? `${table.filtered}%` : undefined,
    indexName: (table?.key as string) || ((table?.possible_keys as string[])?.[0]),
    children: [],
    warnings: []
  }

  // Check for ordering/grouping operations
  if (block.ordering_operation) {
    node.operation = `Sort (${node.operation})`
  }

  return node
}

// ── PostgreSQL ───────────────────────────────────────────────

interface PGPlanNode {
  'Plan'?: PGPlanNode
  'Plans'?: PGPlanNode[]
  'Node Type'?: string
  'Relation Name'?: string
  'Alias'?: string
  'Startup Cost'?: number
  'Total Cost'?: number
  'Plan Rows'?: number
  'Plan Width'?: number
  'Actual Rows'?: number
  'Actual Total Time'?: number
  'Actual Loops'?: number
  'Filter'?: string
  'Index Name'?: string
  'Join Type'?: string
}

function parsePostgresExplain(raw: string): ExplainPlanNode | null {
  try {
    // PostgreSQL EXPLAIN (FORMAT JSON) returns [{ "Plan": {...} }]
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].Plan) {
      return parsePGNode(parsed[0].Plan, 'root')
    }
    return null
  } catch {
    return null
  }
}

function parsePGNode(pg: PGPlanNode, id: string): ExplainPlanNode {
  const node: ExplainPlanNode = {
    id,
    operation: pg['Node Type'] ?? 'Unknown',
    relation: pg['Relation Name'],
    alias: pg['Alias'],
    startupCost: pg['Startup Cost'] ?? 0,
    totalCost: pg['Total Cost'] ?? 0,
    planRows: pg['Plan Rows'] ?? 0,
    planWidth: pg['Plan Width'] ?? 0,
    actualRows: pg['Actual Rows'],
    actualTime: pg['Actual Total Time'],
    loops: pg['Actual Loops'],
    filter: pg['Filter'],
    indexName: pg['Index Name'],
    joinType: pg['Join Type'],
    children: (pg['Plans'] ?? []).map((child, i) =>
      parsePGNode(child, `${id}-${i}`)
    ),
    warnings: []
  }

  // Add warnings for expensive operations
  if (node.planRows > 10000 && node.operation === 'Seq Scan') {
    node.warnings.push(`全表扫描 ${node.relation ?? '?'}，预计扫描 ${node.planRows} 行 — 考虑添加索引`)
  }
  if (node.actualTime && node.actualTime > 1000) {
    node.warnings.push(`实际耗时 ${node.actualTime.toFixed(1)}ms — 需要优化`)
  }

  return node
}

// ── SQLite ───────────────────────────────────────────────────

function parseSQLiteExplain(raw: string): ExplainPlanNode | null {
  // SQLite EXPLAIN QUERY PLAN returns a table with columns:
  // id, parent, notused, detail
  const lines = raw.trim().split('\n')
  if (lines.length < 2) return null

  // Try to parse as tabular output
  const rows = lines.slice(1).map(line =>
    line.split('|').map(s => s.trim())
  ).filter(r => r.length >= 4)

  if (rows.length === 0) return null

  // Build tree from parent references
  const nodes = new Map<string, ExplainPlanNode>()

  for (const [id, parent, , detail] of rows) {
    const operation = parseSQLiteDetail(detail)
    nodes.set(id, {
      id: `sqlite-${id}`,
      operation: operation.type,
      relation: operation.table,
      startupCost: 0,
      totalCost: 0,
      planRows: operation.rows ?? 0,
      planWidth: 0,
      indexName: operation.index,
      children: [],
      warnings: []
    })
  }

  // Wire up children
  for (const [id, parent] of rows.map(r => [r[0], r[1]])) {
    if (parent === '0' || !parent) continue
    const child = nodes.get(id)
    const parentNode = nodes.get(parent)
    if (child && parentNode) {
      parentNode.children.push(child)
    }
  }

  // Return root (id=0 or first node)
  const root = nodes.get('0') ?? nodes.values().next().value
  return root ?? null
}

function parseSQLiteDetail(detail: string): {
  type: string
  table?: string
  index?: string
  rows?: number
} {
  // Examples:
  // "SCAN TABLE users"
  // "SEARCH TABLE orders USING INDEX idx_date (date>?)"
  // "USE TEMP B-TREE FOR ORDER BY"

  if (detail.startsWith('SCAN TABLE')) {
    return { type: 'Seq Scan', table: detail.slice(11).trim() }
  }
  if (detail.startsWith('SEARCH TABLE')) {
    const match = detail.match(/SEARCH TABLE (\w+) USING (?:COVERING )?INDEX (\w+)/)
    return { type: 'Index Scan', table: match?.[1], index: match?.[2] }
  }
  if (detail.includes('TEMP')) {
    return { type: 'Temp', table: detail }
  }
  if (detail.includes('ORDER BY')) {
    return { type: 'Sort' }
  }
  if (detail.includes('GROUP BY')) {
    return { type: 'Aggregate' }
  }
  return { type: detail.split(' ')[0] }
}
