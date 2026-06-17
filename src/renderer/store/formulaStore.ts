import { create } from 'zustand'
import type { CellFormula, CellSelection, ComputedColumnDef, SelectionAggregate } from '../../shared/types'
import { parseFormula, DependencyGraph, toKey, colToLetter, isFormula, type CellGetter } from '../utils/formulaEngine'

// ── State shape ────────────────────────────────────────────────

interface FormulaState {
  // Cell-level formulas: cellKey → formula definition
  cellFormulas: Record<string, CellFormula>

  // Computed columns: virtual columns applied to every row
  computedColumns: ComputedColumnDef[]

  // Current cell selection
  selection: CellSelection

  // Whether the formula bar is active
  formulaBarVisible: boolean

  // Currently editing cell (for formula bar binding)
  editingCell: { col: number; row: number } | null

  // Column metadata for name → index mapping (set externally by DataTable)
  columnNames: string[]
  columnIndexMap: Record<string, number>  // colName → 0-based index

  // Raw row data for evaluation context
  rows: Record<string, unknown>[]

  // ── Actions ──
  /** Set the column metadata for resolving [colname] references */
  setColumns: (names: string[]) => void

  /** Set the raw rows data for evaluation */
  setRows: (rows: Record<string, unknown>[]) => void

  /** Set a formula on a cell */
  setCellFormula: (col: number, row: number, expression: string) => void

  /** Remove a formula from a cell */
  removeCellFormula: (col: number, row: number) => void

  /** Select a cell (click) */
  selectCell: (col: number, row: number) => void

  /** Extend selection (shift-click) */
  extendSelection: (col: number, row: number) => void

  /** Clear selection */
  clearSelection: () => void

  /** Show/hide formula bar */
  setFormulaBarVisible: (visible: boolean) => void

  /** Set the currently editing cell */
  setEditingCell: (cell: { col: number; row: number } | null) => void

  /** Get the displayed value for a cell (computed if formula, raw otherwise) */
  getCellValue: (col: number, row: number) => unknown

  /** Get the formula expression for a cell (or empty string) */
  getCellFormula: (col: number, row: number) => string

  /** Check if a cell has a formula */
  hasFormula: (col: number, row: number) => boolean

  /** Recalculate all formulas */
  recalcAll: () => void

  /** Add a computed column */
  addComputedColumn: (def: Omit<ComputedColumnDef, 'id'>) => string

  /** Remove a computed column */
  removeComputedColumn: (id: string) => void

  /** Get computed column definitions (for rendering) */
  getComputedColumns: () => ComputedColumnDef[]

  /** Compute selection aggregate (SUM/AVG/COUNT) */
  getSelectionAggregate: () => SelectionAggregate
}

// ── Dependency graph instance ──────────────────────────────────
const depGraph = new DependencyGraph()

// ── Store ──────────────────────────────────────────────────────

export const useFormulaStore = create<FormulaState>((set, get) => ({
  cellFormulas: {},
  computedColumns: [],
  selection: { anchor: null, focus: null },
  formulaBarVisible: true,
  editingCell: null,
  columnNames: [],
  columnIndexMap: {},
  rows: [],

  setColumns: (names) => {
    const map: Record<string, number> = {}
    names.forEach((n, i) => { map[n] = i })
    set({ columnNames: names, columnIndexMap: map })
  },

  setRows: (rows) => {
    set({ rows })
  },

  setCellFormula: (col, row, expression) => {
    const key = toKey(col, row)
    const state = get()

    try {
      const parsed = parseFormula(expression)
      const getter = buildCellGetter(state)

      // Track dependencies in the graph
      depGraph.set(key, parsed.dependencies)

      // Evaluate
      const value = parsed.evaluate(getter)

      const formula: CellFormula = {
        expression: expression.startsWith('=') ? expression : `=${expression}`,
        computedValue: value,
        dependencies: parsed.dependencies,
      }

      set({
        cellFormulas: { ...state.cellFormulas, [key]: formula },
      })

      // Recalculate dependents
      recalcDependents(key, get)
    } catch (err) {
      const formula: CellFormula = {
        expression: expression.startsWith('=') ? expression : `=${expression}`,
        computedValue: '#ERROR!',
        dependencies: [],
        error: err instanceof Error ? err.message : String(err),
      }
      set({
        cellFormulas: { ...state.cellFormulas, [key]: formula },
      })
    }
  },

  removeCellFormula: (col, row) => {
    const key = toKey(col, row)
    const state = get()
    const { [key]: _, ...rest } = state.cellFormulas
    depGraph.remove(key)

    set({ cellFormulas: rest })

    // Recalc any formulas that depended on this cell
    recalcDependents(key, get)
  },

  selectCell: (col, row) => {
    set({
      selection: { anchor: { col, row }, focus: { col, row } },
      editingCell: null,
    })
  },

  extendSelection: (col, row) => {
    set((state) => ({
      selection: {
        anchor: state.selection.anchor ?? { col, row },
        focus: { col, row },
      },
    }))
  },

  clearSelection: () => {
    set({ selection: { anchor: null, focus: null }, editingCell: null })
  },

  setFormulaBarVisible: (visible) => set({ formulaBarVisible: visible }),

  setEditingCell: (cell) => set({ editingCell: cell }),

  getCellValue: (col, row) => {
    const state = get()
    const key = toKey(col, row)
    const formula = state.cellFormulas[key]
    if (formula) return formula.computedValue

    // Check computed columns
    for (const cc of state.computedColumns) {
      // Computed columns use virtual column index beyond real columns
      const ccColIndex = state.columnNames.length + state.computedColumns.indexOf(cc)
      if (col === ccColIndex) {
        return evaluateComputedColumn(cc, row, state)
      }
    }

    // Raw value from rows
    const colName = col < state.columnNames.length ? state.columnNames[col] : null
    if (colName !== null && row < state.rows.length) {
      return state.rows[row]?.[colName]
    }
    return undefined
  },

  getCellFormula: (col, row) => {
    const key = toKey(col, row)
    const formula = get().cellFormulas[key]
    if (formula) return formula.expression

    // Check computed columns
    const state = get()
    const ccIndex = col - state.columnNames.length
    if (ccIndex >= 0 && ccIndex < state.computedColumns.length) {
      return state.computedColumns[ccIndex].expression
    }

    return ''
  },

  hasFormula: (col, row) => {
    const key = toKey(col, row)
    if (get().cellFormulas[key]) return true

    const state = get()
    const ccIndex = col - state.columnNames.length
    return ccIndex >= 0 && ccIndex < state.computedColumns.length
  },

  recalcAll: () => {
    const state = get()
    const formulas = { ...state.cellFormulas }
    let changed = false

    for (const [key, formula] of Object.entries(formulas)) {
      try {
        const parsed = parseFormula(formula.expression)
        const getter = buildCellGetter(state)
        const value = parsed.evaluate(getter)
        if (formula.computedValue !== value) {
          formulas[key] = { ...formula, computedValue: value, error: undefined }
          changed = true
        }
      } catch (err) {
        formulas[key] = {
          ...formula,
          computedValue: '#ERROR!',
          error: err instanceof Error ? err.message : String(err),
        }
        changed = true
      }
    }

    if (changed) set({ cellFormulas: formulas })
  },

  addComputedColumn: (def) => {
    const id = `cc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const col: ComputedColumnDef = { ...def, id }

    // Parse to validate and get dependencies
    try {
      const parsed = parseFormula(def.expression)
      col.dependencies = parsed.dependencies
    } catch {
      col.dependencies = []
    }

    set((state) => ({
      computedColumns: [...state.computedColumns, col],
    }))
    return id
  },

  removeComputedColumn: (id) => {
    set((state) => ({
      computedColumns: state.computedColumns.filter((c) => c.id !== id),
    }))
  },

  getComputedColumns: () => {
    return get().computedColumns
  },

  getSelectionAggregate: () => {
    const state = get()
    const { anchor, focus } = state.selection
    if (!anchor || !focus) return { count: 0, sum: null, avg: null }

    const minCol = Math.min(anchor.col, focus.col)
    const maxCol = Math.max(anchor.col, focus.col)
    const minRow = Math.min(anchor.row, focus.row)
    const maxRow = Math.max(anchor.row, focus.row)

    let count = 0
    let sum = 0
    let hasNumeric = false

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const val = state.getCellValue(c, r)
        if (val !== null && val !== undefined && val !== '') {
          count++
          const num = Number(val)
          if (!isNaN(num)) {
            sum += num
            hasNumeric = true
          }
        }
      }
    }

    return {
      count,
      sum: hasNumeric ? sum : null,
      avg: hasNumeric && count > 0 ? sum / count : null,
    }
  },
}))

// ── Helpers ────────────────────────────────────────────────────

function buildCellGetter(state: FormulaState): CellGetter {
  const getCellValue = (col: number, row: number): unknown => {
    // Check cell formulas first (may override raw data)
    const key = toKey(col, row)
    const formula = state.cellFormulas[key]
    if (formula) return formula.computedValue

    // Check computed columns
    const ccIndex = col - state.columnNames.length
    if (ccIndex >= 0 && ccIndex < state.computedColumns.length) {
      return evaluateComputedColumn(state.computedColumns[ccIndex], row, state)
    }

    // Raw value
    if (col < state.columnNames.length && row < state.rows.length) {
      return state.rows[row]?.[state.columnNames[col]]
    }
    return undefined
  }

  return {
    currentRow: 0,
    cell: (key: string) => {
      const addr = fromKeyWrapper(key)
      if (!addr) return undefined
      return getCellValue(addr.col, addr.row)
    },
    colRef: (colName: string, rowIndex: number) => {
      const colIdx = state.columnIndexMap[colName]
      if (colIdx === undefined) return undefined
      return getCellValue(colIdx, rowIndex)
    },
    allRows: () => state.rows,
  }
}

function fromKeyWrapper(key: string): { col: number; row: number } | null {
  const m = key.match(/^([A-Z]+)(\d+)$/)
  if (!m) return null
  let col = 0
  for (let i = 0; i < m[1].length; i++) {
    col = col * 26 + (m[1].charCodeAt(i) - 64)
  }
  return { col: col - 1, row: parseInt(m[2], 10) - 1 }
}

function evaluateComputedColumn(
  cc: ComputedColumnDef,
  row: number,
  state: FormulaState,
): unknown {
  try {
    const parsed = parseFormula(cc.expression)
    const getter = buildCellGetter(state)
    getter.currentRow = row
    return parsed.evaluate(getter)
  } catch {
    return '#ERROR!'
  }
}

function recalcDependents(changedKey: string, get: () => FormulaState): void {
  const order = depGraph.getRecalcOrder([changedKey])
  if (order.length === 0) return

  const state = get()
  const formulas = { ...state.cellFormulas }

  for (const key of order) {
    const formula = formulas[key]
    if (!formula) continue
    try {
      const parsed = parseFormula(formula.expression)
      const getter = buildCellGetter(state)
      const value = parsed.evaluate(getter)
      formulas[key] = { ...formula, computedValue: value, error: undefined }
    } catch (err) {
      formulas[key] = {
        ...formula,
        computedValue: '#ERROR!',
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  // Build a new state getter with updated formulas
  const newState = { ...state, cellFormulas: formulas }
  get().rows = newState.rows
  get().cellFormulas = formulas
  // Re-evaluate with updated context
  const finalFormulas = { ...formulas }
  for (const key of order) {
    const formula = finalFormulas[key]
    if (!formula) continue
    try {
      const parsed = parseFormula(formula.expression)
      const getter = buildCellGetter({ ...state, cellFormulas: finalFormulas })
      const value = parsed.evaluate(getter)
      finalFormulas[key] = { ...formula, computedValue: value, error: undefined }
    } catch (err) {
      finalFormulas[key] = {
        ...formula,
        computedValue: '#ERROR!',
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  // Set once
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(useFormulaStore as any).setState({ cellFormulas: finalFormulas })
}
