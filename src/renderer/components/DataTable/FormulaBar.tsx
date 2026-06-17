import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Check, X, Calculator } from 'lucide-react'
import { useFormulaStore } from '../../store/formulaStore'
import { colToLetter, isFormula } from '../../utils/formulaEngine'

export default function FormulaBar(): React.ReactElement | null {
  const {
    selection,
    formulaBarVisible,
    editingCell,
    getCellFormula,
    getCellValue,
    setCellFormula,
    removeCellFormula,
    selectCell,
    setEditingCell,
    cellFormulas,
  } = useFormulaStore()

  const [inputValue, setInputValue] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const { anchor, focus } = selection
  const selectedCol = focus?.col ?? anchor?.col ?? -1
  const selectedRow = focus?.row ?? anchor?.row ?? -1

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

  // Sync input with selection
  useEffect(() => {
    if (isEditing) return // don't overwrite while user is typing
    if (selectedCol >= 0 && selectedRow >= 0) {
      const formula = getCellFormula(selectedCol, selectedRow)
      if (formula) {
        setInputValue(formula)
      } else {
        const val = getCellValue(selectedCol, selectedRow)
        setInputValue(val === null || val === undefined ? '' : String(val))
      }
    } else {
      setInputValue('')
    }
  }, [selectedCol, selectedRow, cellFormulas, isEditing, getCellFormula, getCellValue])

  // ── Handlers ────────────────────────────────────────────
  const handleFocus = useCallback(() => {
    setIsEditing(true)
    // If cell has a formula, show it; if it has a raw value, start fresh with =
    if (selectedCol >= 0 && selectedRow >= 0) {
      const formula = getCellFormula(selectedCol, selectedRow)
      if (formula) {
        setInputValue(formula)
      } else {
        const val = getCellValue(selectedCol, selectedRow)
        const str = val === null || val === undefined ? '' : String(val)
        setInputValue(`=${str}`)
      }
      setEditingCell({ col: selectedCol, row: selectedRow })
    }
  }, [selectedCol, selectedRow, getCellFormula, getCellValue, setEditingCell])

  const handleBlur = useCallback(() => {
    setIsEditing(false)
    setEditingCell(null)
  }, [setEditingCell])

  const commitFormula = useCallback(() => {
    if (selectedCol < 0 || selectedRow < 0) return

    const trimmed = inputValue.trim()
    if (isFormula(trimmed)) {
      setCellFormula(selectedCol, selectedRow, trimmed)
    } else if (trimmed === '') {
      removeCellFormula(selectedCol, selectedRow)
    }
    // If it's not a formula and not empty, it's a plain value — treated as raw edit
    // (DataTable's existing cell editing handles this)

    setIsEditing(false)
    setEditingCell(null)
  }, [inputValue, selectedCol, selectedRow, setCellFormula, removeCellFormula, setEditingCell])

  const cancelEdit = useCallback(() => {
    setIsEditing(false)
    setEditingCell(null)
    // Restore original value
    if (selectedCol >= 0 && selectedRow >= 0) {
      const formula = getCellFormula(selectedCol, selectedRow)
      if (formula) setInputValue(formula)
      else {
        const val = getCellValue(selectedCol, selectedRow)
        setInputValue(val === null || val === undefined ? '' : String(val))
      }
    }
  }, [selectedCol, selectedRow, getCellFormula, getCellValue, setEditingCell])

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
          title={hasCellFormula ? '公式单元格' : '点击输入公式'}
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
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="输入值或以 = 开头输入公式，如 =A2*B2"
          disabled={selectedCol < 0 || selectedRow < 0}
          spellCheck={false}
        />
      </div>

      {/* Commit / Cancel buttons (visible while editing) */}
      {isEditing && (
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={commitFormula}
            className="p-0.5 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600"
            title="确认 (Enter)"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={cancelEdit}
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
