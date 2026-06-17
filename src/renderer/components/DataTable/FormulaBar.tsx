import React, { useState, useCallback, useRef, useMemo } from 'react'
import { Check, X, Calculator } from 'lucide-react'
import { useFormulaStore } from '../../store/formulaStore'
import { colToLetter, isFormula } from '../../utils/formulaEngine'

export default function FormulaBar(): React.ReactElement | null {
  const selection = useFormulaStore(s => s.selection)
  const formulaBarVisible = useFormulaStore(s => s.formulaBarVisible)
  const getCellFormula = useFormulaStore(s => s.getCellFormula)
  const getCellValue = useFormulaStore(s => s.getCellValue)
  const setCellFormula = useFormulaStore(s => s.setCellFormula)
  const removeCellFormula = useFormulaStore(s => s.removeCellFormula)
  const setEditingCell = useFormulaStore(s => s.setEditingCell)
  const cellFormulas = useFormulaStore(s => s.cellFormulas)

  const [editValue, setEditValue] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const { anchor, focus } = selection
  const selectedCol = focus?.col ?? anchor?.col ?? -1
  const selectedRow = focus?.row ?? anchor?.row ?? -1

  // ── Derive display value from selection (no useEffect needed) ──
  const displayValue = useMemo((): string => {
    if (isEditing) return '' // use editValue while editing
    if (selectedCol < 0 || selectedRow < 0) return ''
    const formula = getCellFormula(selectedCol, selectedRow)
    if (formula && formula.length > 0) return formula
    const val = getCellValue(selectedCol, selectedRow)
    return val === null || val === undefined ? '' : String(val)
  }, [isEditing, selectedCol, selectedRow, cellFormulas, getCellFormula, getCellValue])

  // The actual input value = editValue when editing, displayValue otherwise
  const inputValue = isEditing ? editValue : displayValue

  // Cell reference label (e.g. "A1" or "A1:B5" for ranges)
  const cellLabel =
    selectedCol >= 0 && selectedRow >= 0
      ? `${colToLetter(selectedCol)}${selectedRow + 1}`
      : ''

  // Range label
  const rangeLabel =
    anchor && focus && (anchor.col !== focus.col || anchor.row !== focus.row)
      ? `${colToLetter(Math.min(anchor.col, focus.col))}${Math.min(anchor.row, focus.row) + 1}:${colToLetter(Math.max(anchor.col, focus.col))}${Math.max(anchor.row, focus.row) + 1}`
      : ''

  const displayLabel = rangeLabel || cellLabel

  // ── Handlers ────────────────────────────────────────────
  const startEditing = useCallback(() => {
    if (selectedCol < 0 || selectedRow < 0) return
    const formula = getCellFormula(selectedCol, selectedRow)
    if (formula && formula.length > 0) {
      setEditValue(formula)
    } else {
      const val = getCellValue(selectedCol, selectedRow)
      const str = val === null || val === undefined ? '' : String(val)
      setEditValue(`=${str}`)
    }
    setIsEditing(true)
    setEditingCell({ col: selectedCol, row: selectedRow })
  }, [selectedCol, selectedRow, getCellFormula, getCellValue, setEditingCell])

  const stopEditing = useCallback(() => {
    setIsEditing(false)
    setEditValue('')
    setEditingCell(null)
  }, [setEditingCell])

  const commitFormula = useCallback(() => {
    if (selectedCol < 0 || selectedRow < 0) return
    const trimmed = editValue.trim()
    if (isFormula(trimmed)) {
      setCellFormula(selectedCol, selectedRow, trimmed)
    } else if (trimmed === '') {
      removeCellFormula(selectedCol, selectedRow)
    }
    stopEditing()
  }, [editValue, selectedCol, selectedRow, setCellFormula, removeCellFormula, stopEditing])

  const cancelEdit = useCallback(() => {
    stopEditing()
  }, [stopEditing])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        commitFormula()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancelEdit()
        inputRef.current?.blur()
      }
    },
    [commitFormula, cancelEdit],
  )

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.target.value)
  }, [])

  if (!formulaBarVisible) return null

  const hasCellFormula = selectedCol >= 0 && selectedRow >= 0
    ? !!getCellFormula(selectedCol, selectedRow)
    : false

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 min-h-[28px]">
      {/* Cell reference indicator */}
      <div
        className={`flex items-center justify-center h-6 px-2 rounded text-xs font-mono select-none border
          ${displayLabel
            ? 'bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 min-w-[48px]'
            : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 min-w-[48px]'}`}
      >
        {displayLabel || '—'}
      </div>

      {/* Formula indicator */}
      <div className="flex items-center shrink-0">
        <span
          className={`text-xs font-bold px-1 select-none ${hasCellFormula ? 'text-blue-500' : 'text-gray-400'}`}
          title={hasCellFormula ? '公式单元格' : '选中单元格后在 fx 栏输入公式'}
        >
          <Calculator className="w-3 h-3 inline" /> fx
        </span>
      </div>

      {/* Formula input */}
      <div className="flex-1 relative">
        <input
          ref={inputRef}
          className="w-full h-6 px-2 text-xs font-mono bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded
            focus:outline-none focus:ring-1 focus:ring-green-400 focus:border-green-400
            text-gray-900 dark:text-gray-100 placeholder-gray-400"
          style={{ lineHeight: '22px' }}
          value={inputValue}
          onChange={handleChange}
          onFocus={startEditing}
          onBlur={stopEditing}
          onKeyDown={handleKeyDown}
          placeholder="选中单元格，然后输入公式，如 =A2*B2"
          disabled={selectedCol < 0 || selectedRow < 0}
          spellCheck={false}
        />
      </div>

      {/* Commit / Cancel buttons (visible while editing) */}
      {isEditing && (
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onMouseDown={(e) => { e.preventDefault(); commitFormula() }}
            className="p-0.5 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600"
            title="确认 (Enter)"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); cancelEdit() }}
            className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
            title="取消 (Escape)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
