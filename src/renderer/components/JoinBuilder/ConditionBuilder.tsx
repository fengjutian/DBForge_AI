// ============================================================
// ConditionBuilder — WHERE/HAVING/ORDER/LIMIT query builder
// ============================================================
// Standalone component for building SQL clauses visually.
// Can be embedded in JoinBuilder or used independently.

import React, { useState } from 'react'
import { Plus, X, ArrowUp, ArrowDown } from 'lucide-react'

interface ColumnDef {
  table: string
  name: string
  type: string
}

interface Condition {
  id: string
  column: string
  operator: string
  value: string
  logic: 'AND' | 'OR'
}

interface SortRule {
  column: string
  direction: 'ASC' | 'DESC'
}

interface ConditionBuilderProps {
  columns: ColumnDef[]
  conditions: Condition[]
  onChangeConditions: (conds: Condition[]) => void
  groupBy: string[]
  onChangeGroupBy: (cols: string[]) => void
  having: Condition[]
  onChangeHaving: (conds: Condition[]) => void
  orderBy: SortRule[]
  onChangeOrderBy: (rules: SortRule[]) => void
  limit: number
  onChangeLimit: (n: number) => void
}

const OPERATORS = ['=', '<>', '>', '<', '>=', '<=', 'LIKE', 'IN', 'IS NULL', 'IS NOT NULL']
const LOGICS: ('AND' | 'OR')[] = ['AND', 'OR']

function newCondition(): Condition {
  return { id: `c-${Date.now()}`, column: '', operator: '=', value: '', logic: 'AND' }
}

export default function ConditionBuilder({
  columns,
  conditions,
  onChangeConditions,
  groupBy,
  onChangeGroupBy,
  having,
  onChangeHaving,
  orderBy,
  onChangeOrderBy,
  limit,
  onChangeLimit,
}: ConditionBuilderProps) {
  const addCondition = () => onChangeConditions([...conditions, newCondition()])
  const updateCondition = (id: string, patch: Partial<Condition>) => {
    onChangeConditions(conditions.map(c => c.id === id ? { ...c, ...patch } : c))
  }
  const removeCondition = (id: string) => onChangeConditions(conditions.filter(c => c.id !== id))

  const addHaving = () => onChangeHaving([...having, newCondition()])
  const updateHaving = (id: string, patch: Partial<Condition>) => {
    onChangeHaving(having.map(c => c.id === id ? { ...c, ...patch } : c))
  }
  const removeHaving = (id: string) => onChangeHaving(having.filter(c => c.id !== id))

  const addSort = () => onChangeOrderBy([...orderBy, { column: columns[0]?.name ?? '', direction: 'ASC' }])
  const updateSort = (i: number, patch: Partial<SortRule>) => {
    onChangeOrderBy(orderBy.map((s, j) => j === i ? { ...s, ...patch } : s))
  }
  const removeSort = (i: number) => onChangeOrderBy(orderBy.filter((_, j) => j !== i))

  const colOptions = columns.map(c => ({
    value: `${c.table}.${c.name}`,
    label: `${c.table}.${c.name}`
  }))

  const renderConditionRow = (
    cond: Condition,
    onUpdate: (id: string, patch: Partial<Condition>) => void,
    onRemove: (id: string) => void,
    showLogic: boolean
  ) => (
    <div key={cond.id} className="flex items-center gap-1.5">
      {showLogic && (
        <select
          value={cond.logic}
          onChange={e => onUpdate(cond.id, { logic: e.target.value as 'AND' | 'OR' })}
          className="text-[10px] font-bold px-1 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 uppercase"
        >
          {LOGICS.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      )}

      <select
        value={cond.column}
        onChange={e => onUpdate(cond.id, { column: e.target.value })}
        className="text-xs px-1 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 min-w-[100px]"
      >
        <option value="">选择列...</option>
        {colOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      <select
        value={cond.operator}
        onChange={e => onUpdate(cond.id, { operator: e.target.value })}
        className="text-xs px-1 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 font-mono"
      >
        {OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
      </select>

      {!['IS NULL', 'IS NOT NULL'].includes(cond.operator) && (
        <input
          type="text"
          value={cond.value}
          onChange={e => onUpdate(cond.id, { value: e.target.value })}
          placeholder="值"
          className="flex-1 text-xs px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 min-w-[60px] font-mono"
        />
      )}

      <button onClick={() => onRemove(cond.id)} className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20">
        <X className="w-3 h-3 text-red-400" />
      </button>
    </div>
  )

  return (
    <div className="space-y-3 text-xs">
      {/* WHERE */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="font-semibold text-amber-600 dark:text-amber-400 text-xs">WHERE</span>
          <button onClick={addCondition} className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <Plus className="w-3 h-3" /> 添加条件
          </button>
        </div>
        <div className="space-y-1 pl-2 border-l-2 border-amber-200 dark:border-amber-800">
          {conditions.map((c, i) => renderConditionRow(c, updateCondition, removeCondition, i > 0))}
          {conditions.length === 0 && (
            <p className="text-[11px] text-gray-400 italic">无 WHERE 条件</p>
          )}
        </div>
      </div>

      {/* GROUP BY */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="font-semibold text-blue-600 dark:text-blue-400 text-xs">GROUP BY</span>
        </div>
        <div className="flex flex-wrap gap-1 pl-2 border-l-2 border-blue-200 dark:border-blue-800">
          {groupBy.map(col => (
            <span key={col} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-mono text-[10px]">
              {col}
              <button onClick={() => onChangeGroupBy(groupBy.filter(g => g !== col))}>
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
          <select
            value=""
            onChange={e => { if (e.target.value) onChangeGroupBy([...groupBy, e.target.value]) }}
            className="text-[10px] px-1 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
          >
            <option value="">+ 添加分组...</option>
            {columns.filter(c => !groupBy.includes(`${c.table}.${c.name}`)).map(c => (
              <option key={`${c.table}.${c.name}`} value={`${c.table}.${c.name}`}>{c.table}.{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* HAVING */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="font-semibold text-purple-600 dark:text-purple-400 text-xs">HAVING</span>
          <button onClick={addHaving} className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <Plus className="w-3 h-3" /> 添加条件
          </button>
        </div>
        <div className="space-y-1 pl-2 border-l-2 border-purple-200 dark:border-purple-800">
          {having.map((c, i) => renderConditionRow(c, updateHaving, removeHaving, i > 0))}
          {having.length === 0 && (
            <p className="text-[11px] text-gray-400 italic">无 HAVING 条件</p>
          )}
        </div>
      </div>

      {/* ORDER BY */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="font-semibold text-green-600 dark:text-green-400 text-xs">ORDER BY</span>
          <button onClick={addSort} className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <Plus className="w-3 h-3" /> 添加排序
          </button>
        </div>
        <div className="space-y-1 pl-2 border-l-2 border-green-200 dark:border-green-800">
          {orderBy.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <select
                value={s.column}
                onChange={e => updateSort(i, { column: e.target.value })}
                className="text-xs px-1 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
              >
                {colOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button
                onClick={() => updateSort(i, { direction: s.direction === 'ASC' ? 'DESC' : 'ASC' })}
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 text-[10px] hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {s.direction === 'ASC' ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                {s.direction}
              </button>
              <button onClick={() => removeSort(i)} className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20">
                <X className="w-3 h-3 text-red-400" />
              </button>
            </div>
          ))}
          {orderBy.length === 0 && (
            <p className="text-[11px] text-gray-400 italic">无排序</p>
          )}
        </div>
      </div>

      {/* LIMIT */}
      <div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-600 dark:text-gray-400 text-xs">LIMIT</span>
          <input
            type="number"
            value={limit || ''}
            onChange={e => onChangeLimit(parseInt(e.target.value) || 0)}
            placeholder="无限制"
            min={0}
            className="w-20 text-xs px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 font-mono"
          />
        </div>
      </div>
    </div>
  )
}
