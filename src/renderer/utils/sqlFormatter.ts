import { format } from 'sql-formatter'

export function formatSQL(sql: string): string {
  try {
    return format(sql, { language: 'mysql', tabWidth: 2, keywordCase: 'upper' })
  } catch {
    return sql
  }
}
