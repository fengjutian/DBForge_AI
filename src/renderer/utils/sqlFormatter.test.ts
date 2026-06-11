import { describe, it, expect, vi } from 'vitest'

// Mock sql-formatter
vi.mock('sql-formatter', () => ({
  format: vi.fn((sql: string, _options: unknown) => {
    // Simulate formatting: uppercase keywords, simple indentation
    if (sql === 'THROW_ERROR') {
      throw new Error('Format error')
    }
    return sql
      .replace(/\bselect\b/gi, 'SELECT')
      .replace(/\bfrom\b/gi, 'FROM')
      .replace(/\bwhere\b/gi, 'WHERE')
      .replace(/\band\b/gi, 'AND')
  })
}))

import { formatSQL } from './sqlFormatter'

describe('formatSQL', () => {
  it('formats a simple SELECT query', () => {
    const result = formatSQL('select * from users where id = 1')
    expect(result).toBe('SELECT * FROM users WHERE id = 1')
  })

  it('formats multi-keyword query', () => {
    const result = formatSQL('select name, email from users where active = 1 and age > 18')
    expect(result).toBe('SELECT name, email FROM users WHERE active = 1 AND age > 18')
  })

  it('returns original SQL when formatter throws', () => {
    const result = formatSQL('THROW_ERROR')
    expect(result).toBe('THROW_ERROR')
  })

  it('handles empty string', () => {
    expect(formatSQL('')).toBe('')
  })

  it('handles SQL with special characters', () => {
    const sql = 'select * from `order items` where `price$` > 100'
    const result = formatSQL(sql)
    expect(result).toContain('SELECT')
    expect(result).toContain('FROM')
    expect(result).toContain('WHERE')
  })

  it('preserves string literals', () => {
    const sql = "SELECT * FROM users WHERE name = 'Alice'"
    expect(formatSQL(sql)).toBe(sql)
  })
})
