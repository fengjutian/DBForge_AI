import type { FilterRule } from './types'

/**
 * Build a SQL WHERE clause from client-side FilterRules.
 * Returns empty string when no filters are active.
 * Values are escaped by doubling single quotes.
 */
export function buildWhereClause(filters: Record<string, FilterRule>, tableAlias = ''): string {
  const entries = Object.entries(filters)
  if (entries.length === 0) return ''

  const prefix = tableAlias ? `\`${tableAlias}\`.` : ''

  const clauses = entries.map(([col, rule]) => {
    const colRef = `${prefix}\`${col}\``
    const escaped = String(rule.value).replace(/'/g, "''")
    return `${colRef} ${rule.op} '${escaped}'`
  })

  return ` WHERE ${clauses.join(' AND ')}`
}

/**
 * Escape a user-provided value for SQL string literal.
 */
export function escapeSqlValue(value: string): string {
  return value.replace(/'/g, "''")
}
