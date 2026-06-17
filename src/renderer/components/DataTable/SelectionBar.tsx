import React from 'react'
import { useFormulaStore } from '../../store/formulaStore'
import { Sigma, Hash, Divide } from 'lucide-react'

/**
 * Status bar that shows aggregate info for the current selection,
 * similar to Excel's status bar (SUM/AVG/COUNT).
 */
export default function SelectionBar(): React.ReactElement | null {
  const selection = useFormulaStore(s => s.selection)
  const getSelectionAggregate = useFormulaStore(s => s.getSelectionAggregate)

  const { anchor, focus } = selection
  if (!anchor || !focus) return null

  const agg = getSelectionAggregate()

  // Don't show if no selection range
  if (agg.count === 0) return null

  const formatNum = (n: number): string => {
    if (Number.isInteger(n)) return n.toLocaleString()
    return n.toFixed(2)
  }

  return (
    <div className="flex items-center gap-4 px-3 py-0.5 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 flex-shrink-0 min-h-[22px] select-none">
      {/* Count */}
      <span className="flex items-center gap-1">
        <Hash className="w-3 h-3 text-gray-400" />
        <span className="text-gray-500">计数</span>
        <span className="font-mono font-medium text-gray-700 dark:text-gray-300">{agg.count.toLocaleString()}</span>
      </span>

      {/* Sum */}
      {agg.sum !== null && (
        <span className="flex items-center gap-1">
          <Sigma className="w-3 h-3 text-gray-400" />
          <span className="text-gray-500">求和</span>
          <span className="font-mono font-medium text-gray-700 dark:text-gray-300">{formatNum(agg.sum)}</span>
        </span>
      )}

      {/* Average */}
      {agg.avg !== null && (
        <span className="flex items-center gap-1">
          <Divide className="w-3 h-3 text-gray-400" />
          <span className="text-gray-500">平均</span>
          <span className="font-mono font-medium text-gray-700 dark:text-gray-300">{formatNum(agg.avg)}</span>
        </span>
      )}
    </div>
  )
}
