import { describe, it, expect, vi } from 'vitest'

// Mock electron and electron-dependent modules before importing QueryExecutor
vi.mock('electron', () => ({
  safeStorage: { isEncryptionAvailable: () => false, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() },
  app: { getPath: () => '/tmp' },
  BrowserWindow: { getAllWindows: () => [] }
}))
vi.mock('electron-store', () => ({ default: class { store = {}; get = () => undefined; set = () => {} } }))
vi.mock('mysql2/promise', () => ({ default: { createPool: () => ({}) } }))
vi.mock('uuid', () => ({ v4: () => 'test-uuid' }))

import { isDangerous } from './QueryExecutor'

describe('isDangerous', () => {
  // ── Safe statements ──────────────────────────────────────────
  it('returns false for a plain SELECT', () => {
    const result = isDangerous('SELECT * FROM users')
    expect(result.isDangerous).toBe(false)
    expect(result.reasons).toHaveLength(0)
  })

  it('returns false for DELETE with WHERE clause', () => {
    const result = isDangerous('DELETE FROM users WHERE id = 1')
    expect(result.isDangerous).toBe(false)
  })

  it('returns false for UPDATE with WHERE clause', () => {
    const result = isDangerous('UPDATE users SET name = "foo" WHERE id = 1')
    expect(result.isDangerous).toBe(false)
  })

  // ── DROP ─────────────────────────────────────────────────────
  it('detects DROP TABLE', () => {
    const result = isDangerous('DROP TABLE users')
    expect(result.isDangerous).toBe(true)
    expect(result.reasons.some((r) => r.includes('DROP'))).toBe(true)
  })

  it('detects DROP with mixed case', () => {
    const result = isDangerous('drop table users')
    expect(result.isDangerous).toBe(true)
  })

  it('detects DROP with extra whitespace', () => {
    const result = isDangerous('  DROP   TABLE   users  ')
    expect(result.isDangerous).toBe(true)
  })

  it('detects DROP hidden in a block comment prefix', () => {
    // The DROP keyword itself is not inside a comment
    const result = isDangerous('/* safe */ DROP TABLE users')
    expect(result.isDangerous).toBe(true)
  })

  it('does NOT flag DROP inside a block comment', () => {
    const result = isDangerous('/* DROP TABLE users */ SELECT 1')
    expect(result.isDangerous).toBe(false)
  })

  it('does NOT flag DROP inside a line comment', () => {
    const result = isDangerous('SELECT 1 -- DROP TABLE users')
    expect(result.isDangerous).toBe(false)
  })

  // ── TRUNCATE ─────────────────────────────────────────────────
  it('detects TRUNCATE TABLE', () => {
    const result = isDangerous('TRUNCATE TABLE orders')
    expect(result.isDangerous).toBe(true)
    expect(result.reasons.some((r) => r.includes('TRUNCATE'))).toBe(true)
  })

  it('detects TRUNCATE with mixed case', () => {
    const result = isDangerous('truncate table orders')
    expect(result.isDangerous).toBe(true)
  })

  it('does NOT flag TRUNCATE inside a comment', () => {
    const result = isDangerous('/* TRUNCATE TABLE orders */ SELECT 1')
    expect(result.isDangerous).toBe(false)
  })

  // ── DELETE without WHERE ──────────────────────────────────────
  it('detects DELETE without WHERE', () => {
    const result = isDangerous('DELETE FROM users')
    expect(result.isDangerous).toBe(true)
    expect(result.reasons.some((r) => r.includes('DELETE'))).toBe(true)
  })

  it('detects DELETE without WHERE — mixed case', () => {
    const result = isDangerous('delete from users')
    expect(result.isDangerous).toBe(true)
  })

  it('detects DELETE without WHERE — extra whitespace', () => {
    const result = isDangerous('  DELETE   FROM   users  ')
    expect(result.isDangerous).toBe(true)
  })

  it('does NOT flag DELETE with WHERE', () => {
    const result = isDangerous('DELETE FROM users WHERE active = 0')
    expect(result.isDangerous).toBe(false)
  })

  it('does NOT flag DELETE with WHERE — mixed case', () => {
    const result = isDangerous('delete from users where active = 0')
    expect(result.isDangerous).toBe(false)
  })

  // ── Multiple reasons ─────────────────────────────────────────
  it('returns multiple reasons when multiple dangers exist', () => {
    // Contrived but valid: two statements separated by semicolon
    const result = isDangerous('DROP TABLE a; TRUNCATE TABLE b')
    expect(result.isDangerous).toBe(true)
    expect(result.reasons.length).toBeGreaterThanOrEqual(2)
  })

  // ── Comment stripping ─────────────────────────────────────────
  it('strips block comments before analysis', () => {
    const result = isDangerous('SELECT /* DROP TABLE x */ * FROM users')
    expect(result.isDangerous).toBe(false)
  })

  it('strips line comments before analysis', () => {
    const result = isDangerous('SELECT * FROM users -- DROP TABLE x')
    expect(result.isDangerous).toBe(false)
  })
})
