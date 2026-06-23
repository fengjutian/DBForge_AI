import { describe, it, expect } from 'vitest'
import type { DatabaseInfo } from '../../shared/types'
import { detectRelationships, type Relationship } from './schemaRelationships'

// ── Fixtures ──────────────────────────────────────────────────

function makeDb(overrides?: Partial<DatabaseInfo>): DatabaseInfo {
  return {
    name: 'testdb',
    tables: [],
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────

describe('detectRelationships', () => {
  it('returns empty array for a database with no tables', () => {
    const db = makeDb()
    expect(detectRelationships(db)).toEqual([])
  })

  it('returns empty array for a table with no foreign keys', () => {
    const db = makeDb({
      tables: [
        {
          name: 'users',
          columns: [{ name: 'id', type: 'INT', nullable: false }],
          primaryKeys: ['id'],
          foreignKeys: [],
        },
      ],
    })
    expect(detectRelationships(db)).toEqual([])
  })

  it('detects 1:N relationship from a simple FK', () => {
    const db = makeDb({
      tables: [
        {
          name: 'orders',
          columns: [
            { name: 'id', type: 'INT', nullable: false },
            { name: 'user_id', type: 'INT', nullable: true },
          ],
          primaryKeys: ['id'],
          foreignKeys: [
            {
              columnName: 'user_id',
              referencedTable: 'users',
              referencedColumn: 'id',
            },
          ],
        },
        {
          name: 'users',
          columns: [{ name: 'id', type: 'INT', nullable: false }],
          primaryKeys: ['id'],
          foreignKeys: [],
        },
      ],
      indexes: [
        {
          name: 'idx_user_id',
          tableName: 'orders',
          columns: ['user_id'],
          unique: false,
        },
      ],
    })
    const rels = detectRelationships(db)
    expect(rels).toHaveLength(1)
    expect(rels[0]).toMatchObject({
      fromTable: 'orders',
      fromColumn: 'user_id',
      toTable: 'users',
      toColumn: 'id',
      cardinality: '1:N',
    })
  })

  it('detects 1:1 relationship when FK column has a UNIQUE index', () => {
    const db = makeDb({
      tables: [
        {
          name: 'profiles',
          columns: [
            { name: 'id', type: 'INT', nullable: false },
            { name: 'user_id', type: 'INT', nullable: false },
          ],
          primaryKeys: ['id'],
          foreignKeys: [
            {
              columnName: 'user_id',
              referencedTable: 'users',
              referencedColumn: 'id',
            },
          ],
        },
        {
          name: 'users',
          columns: [{ name: 'id', type: 'INT', nullable: false }],
          primaryKeys: ['id'],
          foreignKeys: [],
        },
      ],
      indexes: [
        {
          name: 'uq_user_id',
          tableName: 'profiles',
          columns: ['user_id'],
          unique: true,
        },
      ],
    })
    const rels = detectRelationships(db)
    expect(rels).toHaveLength(1)
    expect(rels[0].cardinality).toBe('1:1')
  })

  it('detects 1:1 when FK column is itself the PK', () => {
    const db = makeDb({
      tables: [
        {
          name: 'passports',
          columns: [
            { name: 'user_id', type: 'INT', nullable: false },
            { name: 'passport_no', type: 'VARCHAR(20)', nullable: false },
          ],
          primaryKeys: ['user_id'],
          foreignKeys: [
            {
              columnName: 'user_id',
              referencedTable: 'users',
              referencedColumn: 'id',
            },
          ],
        },
        {
          name: 'users',
          columns: [{ name: 'id', type: 'INT', nullable: false }],
          primaryKeys: ['id'],
          foreignKeys: [],
        },
      ],
    })
    const rels = detectRelationships(db)
    expect(rels).toHaveLength(1)
    expect(rels[0].cardinality).toBe('1:1')
  })

  it('detects N:M via junction table with composite PK of 2 FKs', () => {
    const db = makeDb({
      tables: [
        {
          name: 'students',
          columns: [{ name: 'id', type: 'INT', nullable: false }],
          primaryKeys: ['id'],
          foreignKeys: [],
        },
        {
          name: 'courses',
          columns: [{ name: 'id', type: 'INT', nullable: false }],
          primaryKeys: ['id'],
          foreignKeys: [],
        },
        {
          name: 'enrollments',
          columns: [
            { name: 'student_id', type: 'INT', nullable: false },
            { name: 'course_id', type: 'INT', nullable: false },
          ],
          primaryKeys: ['student_id', 'course_id'],
          foreignKeys: [
            {
              columnName: 'student_id',
              referencedTable: 'students',
              referencedColumn: 'id',
            },
            {
              columnName: 'course_id',
              referencedTable: 'courses',
              referencedColumn: 'id',
            },
          ],
        },
      ],
    })
    const rels = detectRelationships(db)
    // One N:M relationship bridging students ↔ courses
    expect(rels).toHaveLength(1)
    expect(rels[0]).toMatchObject({
      fromTable: 'students',
      toTable: 'courses',
      cardinality: 'N:M',
      junctionTable: 'enrollments',
    })
  })

  it('handles mixed relationships (1:N + N:M + 1:1)', () => {
    const db = makeDb({
      tables: [
        {
          name: 'users',
          columns: [{ name: 'id', type: 'INT', nullable: false }],
          primaryKeys: ['id'],
          foreignKeys: [],
        },
        {
          name: 'profiles',
          columns: [
            { name: 'id', type: 'INT', nullable: false },
            { name: 'user_id', type: 'INT', nullable: false },
          ],
          primaryKeys: ['id'],
          foreignKeys: [
            {
              columnName: 'user_id',
              referencedTable: 'users',
              referencedColumn: 'id',
            },
          ],
        },
        {
          name: 'orders',
          columns: [
            { name: 'id', type: 'INT', nullable: false },
            { name: 'user_id', type: 'INT', nullable: true },
          ],
          primaryKeys: ['id'],
          foreignKeys: [
            {
              columnName: 'user_id',
              referencedTable: 'users',
              referencedColumn: 'id',
            },
          ],
        },
        {
          name: 'products',
          columns: [{ name: 'id', type: 'INT', nullable: false }],
          primaryKeys: ['id'],
          foreignKeys: [],
        },
        {
          name: 'order_items',
          columns: [
            { name: 'order_id', type: 'INT', nullable: false },
            { name: 'product_id', type: 'INT', nullable: false },
          ],
          primaryKeys: ['order_id', 'product_id'],
          foreignKeys: [
            {
              columnName: 'order_id',
              referencedTable: 'orders',
              referencedColumn: 'id',
            },
            {
              columnName: 'product_id',
              referencedTable: 'products',
              referencedColumn: 'id',
            },
          ],
        },
      ],
      indexes: [
        {
          name: 'uq_user_id',
          tableName: 'profiles',
          columns: ['user_id'],
          unique: true,
        },
      ],
    })
    const rels = detectRelationships(db)

    // users ↔ profiles: 1:1 (via unique FK)
    // users ↔ orders: 1:N (no unique on orders.user_id)
    // orders ↔ products: N:M (via order_items junction)
    expect(rels).toHaveLength(3)

    const profileRel = rels.find(
      r => r.fromTable === 'profiles' || r.toTable === 'profiles'
    )!
    expect(profileRel.cardinality).toBe('1:1')

    const orderRel = rels.find(
      r =>
        r.fromTable === 'orders' &&
        r.toTable === 'users' &&
        r.cardinality === '1:N'
    )!
    expect(orderRel).toBeDefined()

    const junctionRel = rels.find(r => r.cardinality === 'N:M')!
    expect(junctionRel.junctionTable).toBe('order_items')
  })

  it('skips junction table FK references from direct relationship list', () => {
    // Verify that FKs belonging to a junction table do not
    // produce additional 1:N relationships alongside the N:M
    const db = makeDb({
      tables: [
        {
          name: 'a',
          columns: [{ name: 'id', type: 'INT', nullable: false }],
          primaryKeys: ['id'],
          foreignKeys: [],
        },
        {
          name: 'b',
          columns: [{ name: 'id', type: 'INT', nullable: false }],
          primaryKeys: ['id'],
          foreignKeys: [],
        },
        {
          name: 'a_b',
          columns: [
            { name: 'a_id', type: 'INT', nullable: false },
            { name: 'b_id', type: 'INT', nullable: false },
          ],
          primaryKeys: ['a_id', 'b_id'],
          foreignKeys: [
            {
              columnName: 'a_id',
              referencedTable: 'a',
              referencedColumn: 'id',
            },
            {
              columnName: 'b_id',
              referencedTable: 'b',
              referencedColumn: 'id',
            },
          ],
        },
      ],
    })
    const rels = detectRelationships(db)
    // Should have exactly 1 N:M, not 1 N:M + 2 extra 1:N relationships
    expect(rels).toHaveLength(1)
    expect(rels[0].cardinality).toBe('N:M')
  })
})
