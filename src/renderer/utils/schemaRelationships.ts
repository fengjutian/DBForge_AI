// ============================================================
// Schema Relationship Detector
// Infers cardinality (1:1, 1:N, N:M) from schema metadata.
// ============================================================

import type { DatabaseInfo, IndexInfo, TableInfo } from '../../shared/types'

// ── Types ─────────────────────────────────────────────────────

export type Cardinality = '1:1' | '1:N' | 'N:M'

export interface Relationship {
  /** Source (FK-owning) table */
  fromTable: string
  fromColumn: string
  /** Referenced (target) table */
  toTable: string
  toColumn: string
  /** Inferred cardinality */
  cardinality: Cardinality
  /**
   * For N:M relationships, the junction table that bridges them.
   * Undefined for 1:1 and 1:N.
   */
  junctionTable?: string
}

/** Describes a table detected as a junction (bridge) table */
export interface JunctionTableInfo {
  tableName: string
  leftTable: string
  leftColumn: string
  rightTable: string
  rightColumn: string
}

// ── Utility helpers ───────────────────────────────────────────

/**
 * Build a Set of "table.column" keys that have a UNIQUE index.
 * This includes PK columns (which are always unique) and columns
 * covered by a UNIQUE constraint/index.
 */
function buildUniqueColumnSet(
  table: TableInfo,
  dbIndexes: IndexInfo[] | undefined
): Set<string> {
  const set = new Set<string>()

  // 1. PK columns are inherently unique
  for (const pk of table.primaryKeys) {
    set.add(pk)
  }

  // 2. Unique indexes (including those from UNIQUE constraints)
  const tableIndexes = (dbIndexes ?? []).filter(
    ix => ix.tableName === table.name
  )
  for (const ix of tableIndexes) {
    if (ix.unique) {
      for (const col of ix.columns) {
        set.add(col)
      }
    }
  }

  return set
}

/**
 * Detect junction (bridge) tables that create N:M relationships.
 *
 * A junction table has exactly 2 foreign keys forming its composite primary key.
 *
 * NOTE: This only detects the classic junction-table pattern (composite PK of 2 FKs).
 * A variant where the junction has a surrogate auto-increment PK with a UNIQUE
 * constraint on the 2 FK columns will NOT be detected as N:M — it instead produces
 * two 1:N relationships. This is a known limitation that may be addressed in a
 * future enhancement.
 */
function detectJunctionTables(
  db: DatabaseInfo,
  tableIndex: Map<string, TableInfo>
): JunctionTableInfo[] {
  const junctions: JunctionTableInfo[] = []

  for (const table of db.tables) {
    const fks = table.foreignKeys
    // Must have exactly 2 FKs
    if (fks.length !== 2) continue

    // Both FK columns must together form the primary key
    const pkSet = new Set(table.primaryKeys)
    if (
      pkSet.size !== 2 ||
      !pkSet.has(fks[0].columnName) ||
      !pkSet.has(fks[1].columnName)
    ) {
      continue
    }

    // Ensure both referenced tables exist in this database
    const leftTable = tableIndex.get(fks[0].referencedTable)
    const rightTable = tableIndex.get(fks[1].referencedTable)
    if (!leftTable || !rightTable) continue

    junctions.push({
      tableName: table.name,
      leftTable: fks[0].referencedTable,
      leftColumn: fks[0].referencedColumn,
      rightTable: fks[1].referencedTable,
      rightColumn: fks[1].referencedColumn,
    })
  }

  return junctions
}

// ── Main API ──────────────────────────────────────────────────

/**
 * Given a database schema, infer all table relationships with
 * cardinality labels.
 *
 * Rules:
 *  - **1:1** – FK column has a UNIQUE index (or is the PK of the
 *    source table).
 *  - **1:N** – FK column has no unique constraint (default).
 *  - **N:M** – A junction table with a composite PK of exactly
 *    two FK columns bridges two tables.
 */
export function detectRelationships(db: DatabaseInfo): Relationship[] {
  // Build a table-name→TableInfo lookup
  const tableIndex = new Map<string, TableInfo>()
  for (const t of db.tables) {
    tableIndex.set(t.name, t)
  }

  // Build unique-column sets per table
  const uniqueCols = new Map<string, Set<string>>()
  for (const t of db.tables) {
    uniqueCols.set(t.name, buildUniqueColumnSet(t, db.indexes))
  }

  // 1. Detect N:M junctions first
  const junctions = detectJunctionTables(db, tableIndex)
  const junctionTableNames = new Set(junctions.map(j => j.tableName))

  // 2. Build relationships from FKs (skip junction tables — they are
  //    handled above as N:M bridges)
  const relationships: Relationship[] = []

  for (const table of db.tables) {
    // Skip junction tables — their FKs are already captured as N:M
    if (junctionTableNames.has(table.name)) continue

    for (const fk of table.foreignKeys) {
      const uCols = uniqueCols.get(table.name) ?? new Set()
      const isOneToOne = uCols.has(fk.columnName)

      relationships.push({
        fromTable: table.name,
        fromColumn: fk.columnName,
        toTable: fk.referencedTable,
        toColumn: fk.referencedColumn,
        cardinality: isOneToOne ? '1:1' : '1:N',
      })
    }
  }

  // 3. Add N:M relationships from junctions
  for (const j of junctions) {
    relationships.push({
      fromTable: j.leftTable,
      fromColumn: j.leftColumn,
      toTable: j.rightTable,
      toColumn: j.rightColumn,
      cardinality: 'N:M',
      junctionTable: j.tableName,
    })
  }

  return relationships
}
