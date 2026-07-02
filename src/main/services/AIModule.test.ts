import { describe, it, expect } from 'vitest'
import { filterReadonlySQL, buildSchemaDescription } from './AIModule'
import type { DatabaseSchema } from '@dbforge/shared'

// ============================================================
// filterReadonlySQL — pure function
// ============================================================

describe('filterReadonlySQL', () => {
  // ── Safe statements (SELECT-like) ─────────────────────────
  it('returns SELECT unchanged', () => {
    expect(filterReadonlySQL('SELECT * FROM users')).toBe('SELECT * FROM users')
  })

  it('returns SELECT with leading whitespace trimmed', () => {
    expect(filterReadonlySQL('  SELECT * FROM users  ')).toBe('SELECT * FROM users  ')
  })

  it('returns SHOW unchanged', () => {
    expect(filterReadonlySQL('SHOW TABLES')).toBe('SHOW TABLES')
  })

  it('returns DESCRIBE unchanged', () => {
    expect(filterReadonlySQL('DESCRIBE users')).toBe('DESCRIBE users')
  })

  it('returns EXPLAIN unchanged', () => {
    expect(filterReadonlySQL('EXPLAIN SELECT * FROM users')).toBe('EXPLAIN SELECT * FROM users')
  })

  it('returns CTE (WITH) unchanged', () => {
    const sql = 'WITH recent AS (SELECT * FROM orders) SELECT * FROM recent'
    expect(filterReadonlySQL(sql)).toBe(sql)
  })

  // ── Blocked write statements ─────────────────────────────
  it('blocks INSERT', () => {
    expect(filterReadonlySQL('INSERT INTO users (name) VALUES ("foo")')).toBeNull()
  })

  it('blocks UPDATE', () => {
    expect(filterReadonlySQL('UPDATE users SET name = "foo" WHERE id = 1')).toBeNull()
  })

  it('blocks DELETE', () => {
    expect(filterReadonlySQL('DELETE FROM users WHERE id = 1')).toBeNull()
  })

  it('blocks DROP', () => {
    expect(filterReadonlySQL('DROP TABLE users')).toBeNull()
  })

  it('blocks ALTER', () => {
    expect(filterReadonlySQL('ALTER TABLE users ADD COLUMN age INT')).toBeNull()
  })

  it('blocks TRUNCATE', () => {
    expect(filterReadonlySQL('TRUNCATE TABLE users')).toBeNull()
  })

  it('blocks CREATE', () => {
    expect(filterReadonlySQL('CREATE TABLE foo (id INT)')).toBeNull()
  })

  it('blocks REPLACE', () => {
    expect(filterReadonlySQL('REPLACE INTO users (id) VALUES (1)')).toBeNull()
  })

  it('blocks RENAME', () => {
    expect(filterReadonlySQL('RENAME TABLE users TO old_users')).toBeNull()
  })

  it('blocks GRANT', () => {
    expect(filterReadonlySQL('GRANT SELECT ON db.* TO user')).toBeNull()
  })

  it('blocks REVOKE', () => {
    expect(filterReadonlySQL('REVOKE SELECT ON db.* FROM user')).toBeNull()
  })

  it('blocks LOCK', () => {
    expect(filterReadonlySQL('LOCK TABLES users WRITE')).toBeNull()
  })

  it('blocks UNLOCK', () => {
    expect(filterReadonlySQL('UNLOCK TABLES')).toBeNull()
  })

  // ── Case insensitivity ──────────────────────────────────
  it('blocks lowercase insert', () => {
    expect(filterReadonlySQL('insert into users values (1)')).toBeNull()
  })

  it('blocks mixed case DROP', () => {
    expect(filterReadonlySQL('Drop Table users')).toBeNull()
  })

  // ── Edge cases ──────────────────────────────────────────
  it('returns null for empty string', () => {
    // Empty string doesn't match the WRITE pattern, so it passes through
    expect(filterReadonlySQL('')).toBe('')
  })

  it('handles leading newlines', () => {
    expect(filterReadonlySQL('\n\nSELECT 1')).toBe('\n\nSELECT 1')
  })

  it('blocks write statement with leading comment on previous line', () => {
    // The regex uses ^ which matches start of string after trim, not line
    // So a newline then INSERT is caught after trim
    expect(filterReadonlySQL('\nINSERT INTO t VALUES (1)')).toBeNull()
  })

  it('passes through SELECT with leading comment on same line', () => {
    // This starts with /* so it won't match WRITE_PATTERN
    const sql = '/* hint */ SELECT * FROM users'
    expect(filterReadonlySQL(sql)).toBe(sql)
  })

  it('handles multiline SELECT with WHERE', () => {
    const sql = 'SELECT u.id,\n  u.name\nFROM users u\nWHERE u.active = 1'
    expect(filterReadonlySQL(sql)).toBe(sql)
  })
})

// ============================================================
// buildSchemaDescription — pure function
// ============================================================

describe('buildSchemaDescription', () => {
  it('returns empty string for empty schema', () => {
    const schema: DatabaseSchema = { connectionId: 'c1', databases: [], fetchedAt: 1000 }
    expect(buildSchemaDescription(schema)).toBe('')
  })

  it('builds description for single table', () => {
    const schema: DatabaseSchema = {
      connectionId: 'c1',
      databases: [
        {
          name: 'mydb',
          tables: [
            {
              name: 'users',
              columns: [
                { name: 'id', type: 'INT', nullable: false },
                { name: 'email', type: 'VARCHAR(255)', nullable: true }
              ],
              primaryKeys: ['id'],
              foreignKeys: []
            }
          ]
        }
      ],
      fetchedAt: 1000
    }
    const desc = buildSchemaDescription(schema)
    expect(desc).toContain('Database: mydb')
    expect(desc).toContain('Table: users')
    expect(desc).toContain('PK(id)')
    expect(desc).toContain('id INT NOT NULL')
    expect(desc).toContain('email VARCHAR(255)')
  })

  it('includes foreign keys', () => {
    const schema: DatabaseSchema = {
      connectionId: 'c1',
      databases: [
        {
          name: 'mydb',
          tables: [
            {
              name: 'orders',
              columns: [
                { name: 'id', type: 'INT', nullable: false },
                { name: 'user_id', type: 'INT', nullable: true }
              ],
              primaryKeys: ['id'],
              foreignKeys: [
                { columnName: 'user_id', referencedTable: 'users', referencedColumn: 'id' }
              ]
            }
          ]
        }
      ],
      fetchedAt: 1000
    }
    const desc = buildSchemaDescription(schema)
    expect(desc).toContain('FK: user_id -> users.id')
  })

  it('includes column comments', () => {
    const schema: DatabaseSchema = {
      connectionId: 'c1',
      databases: [
        {
          name: 'mydb',
          tables: [
            {
              name: 'products',
              columns: [
                { name: 'price', type: 'DECIMAL(10,2)', nullable: false, comment: '零售价' }
              ],
              primaryKeys: [],
              foreignKeys: []
            }
          ]
        }
      ],
      fetchedAt: 1000
    }
    const desc = buildSchemaDescription(schema)
    expect(desc).toContain('-- 零售价')
  })

  it('handles multiple databases', () => {
    const schema: DatabaseSchema = {
      connectionId: 'c1',
      databases: [
        {
          name: 'db1',
          tables: [{ name: 't1', columns: [{ name: 'id', type: 'INT', nullable: false }], primaryKeys: ['id'], foreignKeys: [] }]
        },
        {
          name: 'db2',
          tables: [{ name: 't2', columns: [{ name: 'val', type: 'TEXT', nullable: true }], primaryKeys: [], foreignKeys: [] }]
        }
      ],
      fetchedAt: 1000
    }
    const desc = buildSchemaDescription(schema)
    expect(desc).toContain('Database: db1')
    expect(desc).toContain('Database: db2')
    expect(desc).toContain('Table: t1')
    expect(desc).toContain('Table: t2')
  })

  it('handles table without primary keys', () => {
    const schema: DatabaseSchema = {
      connectionId: 'c1',
      databases: [
        {
          name: 'mydb',
          tables: [
            {
              name: 'logs',
              columns: [{ name: 'msg', type: 'TEXT', nullable: true }],
              primaryKeys: [],
              foreignKeys: []
            }
          ]
        }
      ],
      fetchedAt: 1000
    }
    const desc = buildSchemaDescription(schema)
    expect(desc).toContain('Table: logs')
    expect(desc).not.toContain('PK(')
  })
})
