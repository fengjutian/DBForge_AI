// ============================================================
// Notebook variable resolver
// ============================================================
// Resolves {{cellName}}, {{cellName.columnName}}, and
// {{cellName.columnName[rowIndex]}} references within notebook
// cells, replacing them with values from executed cell results.

import type { NotebookCell, NotebookCellResult, NotebookVariable } from '@dbforge/shared'

/** Regex matching {{...}} variable references */
const VAR_RE = /\{\{([^}]+)\}\}/g

/**
 * Parse a variable reference string like "cellName.col[0]" into parts.
 */
export function parseVariableRef(ref: string): NotebookVariable | null {
  const trimmed = ref.trim()
  // {{$paramName}} — global parameter
  if (trimmed.startsWith('$')) {
    return { cellName: trimmed }
  }

  // {{cellName.columnName[0]}} or {{cellName.columnName}} or {{cellName}}
  const match = trimmed.match(/^(\w+)(?:\.(\w+))?(?:\[(\d+)\])?$/)
  if (!match) return null

  return {
    cellName: match[1],
    columnName: match[2],
    rowIndex: match[3] !== undefined ? parseInt(match[3], 10) : undefined,
  }
}

/**
 * Resolve a variable to its string value.
 */
function resolveVariable(
  varRef: NotebookVariable,
  cells: NotebookCell[],
  parameters: Record<string, string>
): string {
  // Global parameters: {{$paramName}}
  if (varRef.cellName.startsWith('$')) {
    const key = varRef.cellName.slice(1)
    return parameters[key] ?? `{{${varRef.cellName}}}`
  }

  // Find the referenced cell
  const cell = cells.find(c => c.name === varRef.cellName)
  if (!cell?.result || cell.result.error) {
    return `{{${varRef.cellName}${varRef.columnName ? '.' + varRef.columnName : ''}${varRef.rowIndex !== undefined ? '[' + varRef.rowIndex + ']' : ''}}}`
  }

  const result: NotebookCellResult = cell.result

  // {{cellName}} — return all results as JSON
  if (!varRef.columnName) {
    return JSON.stringify(result.rows)
  }

  // {{cellName.columnName}} — return column values as comma-separated
  const values = result.rows.map(r => r[varRef.columnName!])

  if (varRef.rowIndex !== undefined) {
    // {{cellName.columnName[0]}} — single value
    return valueToString(values[varRef.rowIndex])
  }

  // {{cellName.columnName}} — all values comma-separated
  return values.map(v => valueToString(v)).join(', ')
}

function valueToString(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/**
 * Resolve all {{...}} variable references in a text string.
 */
export function resolveVariables(
  text: string,
  cells: NotebookCell[],
  parameters: Record<string, string>
): string {
  return text.replace(VAR_RE, (_match, ref) => {
    const parsed = parseVariableRef(ref)
    if (!parsed) return `{{${ref}}}`
    return resolveVariable(parsed, cells, parameters)
  })
}

/**
 * Resolve variables in a SQL cell's content before execution.
 * Also resolves {{$paramName}} in SQL for parameterized queries.
 */
export function resolveSQLVariables(
  sql: string,
  cells: NotebookCell[],
  parameters: Record<string, string>
): string {
  return sql.replace(VAR_RE, (_match, ref) => {
    const trimmed = ref.trim()

    // Global parameters: replace {{$param}} with literal value (quoted for SQL)
    if (trimmed.startsWith('$')) {
      const key = trimmed.slice(1)
      const val = parameters[key]
      if (val === undefined) return `{{${trimmed}}}`
      // Quote the value for SQL safety
      return `'${val.replace(/'/g, "''")}'`
    }

    const parsed = parseVariableRef(trimmed)
    if (!parsed) return `{{${trimmed}}}`

    // For SQL, resolve to a value suitable for IN clauses etc.
    if (!parsed.columnName) {
      // {{cellName}} in SQL context — not directly usable, leave as-is
      return `{{${trimmed}}}`
    }

    // Look up the source cell by parsed.cellName
    const sourceCell = cells.find(c => c.name === parsed.cellName)
    if (!sourceCell?.result || sourceCell.result.error) {
      return `{{${trimmed}}}`
    }

    if (parsed.rowIndex !== undefined) {
      const val = sourceCell.result.rows[parsed.rowIndex]?.[parsed.columnName!]
      return val === null || val === undefined ? 'NULL' : `'${String(val).replace(/'/g, "''")}'`
    }

    // Comma-separated, quoted values for IN clauses
    const values = sourceCell.result.rows.map(r => {
      const v = r[parsed.columnName!]
      if (v === null || v === undefined) return 'NULL'
      return `'${String(v).replace(/'/g, "''")}'`
    })
    return values.join(', ')
  })
}

/**
 * Check if a string contains any unresolved variables.
 */
export function hasUnresolvedVariables(text: string): boolean {
  VAR_RE.lastIndex = 0
  return VAR_RE.test(text)
}
