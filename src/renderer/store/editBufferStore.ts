import { create } from 'zustand'
import type {
  TableSnapshot,
  CellChange,
  RowChange,
  ChangeSummary,
  PatchSQL,
  ExecutePatchChange
} from '@dbforge/shared'

// ── Internal buffer state (not exposed directly) ───────────────

interface BufferState {
  snapshot: TableSnapshot | null
  /** key = JSON.stringify(rowPk) */
  changes: Map<string, RowChange>
  /** 新增行计数器，用于生成唯一临时标识 */
  insertCounter: number
}

// ── Public store interface ─────────────────────────────────────

interface EditBufferState {
  /** 版本号，每次修改 bufferState 时递增，用于触发 zustand 重新渲染 */
  _version: number

  // ── Read-only accessors ──
  /** 当前是否有未保存的修改 */
  hasChanges: () => boolean
  /** 获取变更摘要 */
  getChangeSummary: () => ChangeSummary
  /** 获取某行的编辑后值（有修改返回新值，否则返回快照值） */
  getCellValue: (rowIndex: number, col: string) => unknown
  /** 获取某行的状态 */
  getRowState: (rowIndex: number) => 'clean' | 'modified' | 'deleted' | 'inserted'
  /** 获取当前快照的行数（含已插入的行） */
  getRowCount: () => number

  // ── Actions ──
  /** 用快照初始化缓冲区 */
  initBuffer: (snapshot: TableSnapshot) => void
  /** 单元格编辑（由 DataTable.onCellEdit 调用） */
  setCell: (rowIndex: number, col: string, newValue: unknown, oldValue: unknown) => void
  /** 删除一行 */
  deleteRow: (rowIndex: number) => void
  /** 在末尾插入一个空行 */
  insertRow: () => void
  /** 撤销一个单元格的修改 */
  undoCell: (rowIndex: number, col: string) => void
  /** 撤销一整行的所有修改 */
  undoRow: (rowIndex: number) => void
  /** 生成预览用的 SQL（纯前端，供用户预览） */
  generatePreviewSQL: () => PatchSQL | null
  /** 生成结构化变更（用于发送给后端安全执行） */
  generateStructuredChanges: () => { changes: ExecutePatchChange[]; summary: ChangeSummary } | null
  /** 获取当前快照 */
  getSnapshot: () => TableSnapshot | null
  /** 清空缓冲区 */
  clearBuffer: () => void
}

// ── Internal state holder (kept outside zustand's shallow merge) ──

let bufferState: BufferState = {
  snapshot: null,
  changes: new Map(),
  insertCounter: 0
}

function rowPkToString(pk: Record<string, unknown>): string {
  return JSON.stringify(pk, Object.keys(pk).sort())
}

// ── SQL value escaping (for preview only — never for actual execution) ──

function escapePreviewValue(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  // String — simple escaping for preview
  const s = String(v)
  return `'${s.replace(/'/g, "''").replace(/\\/g, '\\\\')}'`
}

function quoteIdentifier(id: string): string {
  return '`' + id.replace(/`/g, '``') + '`'
}

function pkToWhereClause(pk: Record<string, unknown>): string {
  return Object.entries(pk)
    .map(([k]) => `${quoteIdentifier(k)} = ${escapePreviewValue(pk[k])}`)
    .join(' AND ')
}

// ── Store ──────────────────────────────────────────────────────

let _versionCounter = 0

export const useEditBufferStore = create<EditBufferState>((_set, get) => ({
  _version: 0,

  hasChanges: () => bufferState.changes.size > 0,

  getChangeSummary: () => {
    let modified = 0, deleted = 0, inserted = 0
    for (const change of bufferState.changes.values()) {
      switch (change.type) {
        case 'modified': modified++; break
        case 'deleted': deleted++; break
        case 'inserted': inserted++; break
      }
    }
    return { modified, deleted, inserted }
  },

  getCellValue: (rowIndex, col) => {
    if (!bufferState.snapshot) return undefined

    // Check inserted rows first
    const insertKey = `__inserted__${rowIndex}`
    const insertedChange = bufferState.changes.get(insertKey)
    if (insertedChange) {
      return insertedChange.cells[col]?.newValue
    }

    // Check existing row changes
    if (rowIndex >= 0 && rowIndex < bufferState.snapshot.rows.length) {
      const row = bufferState.snapshot.rows[rowIndex]
      const pk = buildPkFromRow(row, bufferState.snapshot.primaryKeys, rowIndex)
      const key = rowPkToString(pk)
      const change = bufferState.changes.get(key)

      if (change?.type === 'deleted') return undefined
      if (change?.cells[col]) return change.cells[col].newValue
      return row[col]
    }

    return undefined
  },

  getRowState: (rowIndex) => {
    if (!bufferState.snapshot) return 'clean'

    // Check inserted rows
    const insertKey = `__inserted__${rowIndex}`
    if (bufferState.changes.has(insertKey)) return 'inserted'

    // Check existing rows
    if (rowIndex >= 0 && rowIndex < bufferState.snapshot.rows.length) {
      const row = bufferState.snapshot.rows[rowIndex]
      const pk = buildPkFromRow(row, bufferState.snapshot.primaryKeys, rowIndex)
      const key = rowPkToString(pk)
      const change = bufferState.changes.get(key)
      if (!change) return 'clean'
      return change.type
    }

    return 'clean'
  },

  getRowCount: () => {
    if (!bufferState.snapshot) return 0
    const insertedCount = [...bufferState.changes.values()]
      .filter(c => c.type === 'inserted').length
    return bufferState.snapshot.rows.length + insertedCount
  },

  // ── Actions ─────────────────────────────────────────────────

  initBuffer: (snapshot) => {
    bufferState = {
      snapshot,
      changes: new Map(),
      insertCounter: 0
    }
    _set({ _version: ++_versionCounter })
  },

  setCell: (rowIndex, col, newValue, oldValue) => {
    if (!bufferState.snapshot) return

    // Check if this is an inserted row
    const insertKey = `__inserted__${rowIndex}`
    const insertedChange = bufferState.changes.get(insertKey)
    if (insertedChange) {
      insertedChange.cells[col] = {
        rowPk: insertedChange.rowPk,
        column: col,
        oldValue: null,
        newValue
      }
      _set({ _version: ++_versionCounter })
      return
    }

    if (rowIndex < 0 || rowIndex >= bufferState.snapshot.rows.length) return

    const row = bufferState.snapshot.rows[rowIndex]
    const pk = buildPkFromRow(row, bufferState.snapshot.primaryKeys, rowIndex)
    const key = rowPkToString(pk)

    const existing = bufferState.changes.get(key)

    // If row was deleted, ignore cell edits
    if (existing?.type === 'deleted') return

    let _didMutate = false

    // If oldValue matches snapshot value, this is a real edit
    // If newValue === snapshot value, it's a revert
    const snapshotValue = row[col]

    const cellChange: CellChange = {
      rowPk: pk,
      column: col,
      oldValue: oldValue ?? snapshotValue,
      newValue
    }

    if (existing && existing.type === 'modified') {
      // If the new value matches the snapshot value, remove this cell's change
      if (newValue === snapshotValue || (newValue === null && snapshotValue === null)) {
        delete existing.cells[col]
        _didMutate = true
        // If no cells left changed, remove the entire row change
        if (Object.keys(existing.cells).length === 0) {
          bufferState.changes.delete(key)
        }
      } else {
        existing.cells[col] = cellChange
        _didMutate = true
      }
    } else {
      // First modification for this row
      if (newValue !== snapshotValue && !(newValue === null && snapshotValue === null)) {
        bufferState.changes.set(key, {
          type: 'modified',
          rowPk: pk,
          rowIndex,
          cells: { [col]: cellChange }
        })
        _didMutate = true
      }
    }

    if (_didMutate) _set({ _version: ++_versionCounter })
  },

  deleteRow: (rowIndex) => {
    if (!bufferState.snapshot) return

    // Check if it's an inserted row → just remove it
    const insertKey = `__inserted__${rowIndex}`
    if (bufferState.changes.has(insertKey)) {
      bufferState.changes.delete(insertKey)
      _set({ _version: ++_versionCounter })
      return
    }

    if (rowIndex < 0 || rowIndex >= bufferState.snapshot.rows.length) return

    const row = bufferState.snapshot.rows[rowIndex]
    const pk = buildPkFromRow(row, bufferState.snapshot.primaryKeys, rowIndex)
    const key = rowPkToString(pk)

    const existing = bufferState.changes.get(key)

    if (existing?.type === 'inserted') {
      // Remove the inserted row entirely
      bufferState.changes.delete(key)
      _set({ _version: ++_versionCounter })
      return
    }

    bufferState.changes.set(key, {
      type: 'deleted',
      rowPk: pk,
      rowIndex,
      cells: {}
    })
    _set({ _version: ++_versionCounter })
  },

  insertRow: () => {
    if (!bufferState.snapshot) return

    const idx = bufferState.snapshot.rows.length + bufferState.insertCounter
    bufferState.insertCounter++

    const insertKey = `__inserted__${idx}`
    bufferState.changes.set(insertKey, {
      type: 'inserted',
      rowPk: { __inserted_id__: idx },
      rowIndex: idx,
      cells: {}
    })
    _set({ _version: ++_versionCounter })
  },

  undoCell: (rowIndex, col) => {
    if (!bufferState.snapshot) return

    let _didMutate = false

    const insertKey = `__inserted__${rowIndex}`
    const insertedChange = bufferState.changes.get(insertKey)
    if (insertedChange) {
      delete insertedChange.cells[col]
      _set({ _version: ++_versionCounter })
      return
    }

    if (rowIndex < 0 || rowIndex >= bufferState.snapshot.rows.length) return
    const row = bufferState.snapshot.rows[rowIndex]
    const pk = buildPkFromRow(row, bufferState.snapshot.primaryKeys, rowIndex)
    const key = rowPkToString(pk)
    const change = bufferState.changes.get(key)
    if (change) {
      delete change.cells[col]
      _didMutate = true
      if (Object.keys(change.cells).length === 0) {
        bufferState.changes.delete(key)
      }
    }

    if (_didMutate) _set({ _version: ++_versionCounter })
  },

  undoRow: (rowIndex) => {
    if (!bufferState.snapshot) return

    const insertKey = `__inserted__${rowIndex}`
    if (bufferState.changes.has(insertKey)) {
      bufferState.changes.delete(insertKey)
      _set({ _version: ++_versionCounter })
      return
    }

    if (rowIndex < 0 || rowIndex >= bufferState.snapshot.rows.length) return
    const row = bufferState.snapshot.rows[rowIndex]
    const pk = buildPkFromRow(row, bufferState.snapshot.primaryKeys, rowIndex)
    const key = rowPkToString(pk)
    bufferState.changes.delete(key)
    _set({ _version: ++_versionCounter })
  },

  generatePreviewSQL: () => {
    if (!bufferState.snapshot) return null

    const { database, table } = bufferState.snapshot
    const fullTable = `${quoteIdentifier(database)}.${quoteIdentifier(table)}`
    const statements: string[] = []
    const summary: ChangeSummary = { modified: 0, deleted: 0, inserted: 0 }

    // Deletes first
    for (const change of bufferState.changes.values()) {
      if (change.type !== 'deleted') continue
      statements.push(`DELETE FROM ${fullTable} WHERE ${pkToWhereClause(change.rowPk)};`)
      summary.deleted++
    }

    // Updates
    for (const change of bufferState.changes.values()) {
      if (change.type !== 'modified') continue
      const setClauses = Object.values(change.cells)
        .map(c => `${quoteIdentifier(c.column)} = ${escapePreviewValue(c.newValue)}`)
        .join(', ')
      statements.push(`UPDATE ${fullTable} SET ${setClauses} WHERE ${pkToWhereClause(change.rowPk)};`)
      summary.modified++
    }

    // Inserts
    for (const change of bufferState.changes.values()) {
      if (change.type !== 'inserted') continue
      const cellEntries = Object.values(change.cells)
      if (cellEntries.length === 0) continue
      const colNames = cellEntries.map(c => quoteIdentifier(c.column)).join(', ')
      const values = cellEntries.map(c => escapePreviewValue(c.newValue)).join(', ')
      statements.push(`INSERT INTO ${fullTable} (${colNames}) VALUES (${values});`)
      summary.inserted++
    }

    if (statements.length === 0) return null
    return { statements, summary }
  },

  generateStructuredChanges: () => {
    if (!bufferState.snapshot) return null

    const snapshot = bufferState.snapshot
    const executeChanges: ExecutePatchChange[] = []
    const summary: ChangeSummary = { modified: 0, deleted: 0, inserted: 0 }

    // Deletes
    for (const change of bufferState.changes.values()) {
      if (change.type !== 'deleted') continue
      executeChanges.push({ type: 'delete', pk: { ...change.rowPk } })
      summary.deleted++
    }

    // Updates (with old values for optimistic locking)
    for (const change of bufferState.changes.values()) {
      if (change.type !== 'modified') continue
      const set: Record<string, unknown> = {}
      const oldValues: Record<string, unknown> = {}
      for (const cell of Object.values(change.cells)) {
        set[cell.column] = cell.newValue
        oldValues[cell.column] = cell.oldValue
      }
      executeChanges.push({
        type: 'update',
        pk: { ...change.rowPk },
        set,
        oldValues
      })
      summary.modified++
    }

    // Inserts
    for (const change of bufferState.changes.values()) {
      if (change.type !== 'inserted') continue
      const cellEntries = Object.values(change.cells)
      if (cellEntries.length === 0) continue
      const set: Record<string, unknown> = {}
      for (const cell of cellEntries) {
        set[cell.column] = cell.newValue
      }
      executeChanges.push({ type: 'insert', pk: {}, set })
      summary.inserted++
    }

    if (executeChanges.length === 0) return null
    return { changes: executeChanges, summary }
  },

  getSnapshot: () => bufferState.snapshot,

  clearBuffer: () => {
    bufferState = {
      snapshot: null,
      changes: new Map(),
      insertCounter: 0
    }
    _set({ _version: ++_versionCounter })
  }
}))

// ── Helper ─────────────────────────────────────────────────────

function buildPkFromRow(
  row: Record<string, unknown>,
  primaryKeys: string[],
  rowIndex: number
): Record<string, unknown> {
  if (primaryKeys.length === 0) {
    // Fallback: use row index + all column values as identity
    // This is fragile but allows editing tables without PK
    return { __row_index__: rowIndex }
  }
  const pk: Record<string, unknown> = {}
  for (const key of primaryKeys) {
    pk[key] = row[key]
  }
  return pk
}
