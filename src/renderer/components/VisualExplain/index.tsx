// ============================================================
// VisualExplain — Interactive EXPLAIN plan viewer
// ============================================================

import React, { useState, useMemo } from 'react'
import {
  ChevronDown, ChevronRight, AlertTriangle, Database, Clock,
  Hash, ArrowRight, Code, Brain, Table2, Zap, Filter
} from 'lucide-react'
import type { ExplainPlanNode } from '@dbforge/shared'

interface VisualExplainProps {
  result: {
    query: string
    rawOutput: string
    plan: ExplainPlanNode | null
    databaseType: string
  }
  onRequestAI?: () => void
}

// ── Cost color ──────────────────────────────────────────────

function costColor(cost: number, maxCost: number): string {
  if (maxCost === 0) return 'text-green-500'
  const ratio = cost / maxCost
  if (ratio < 0.2) return 'text-green-500'
  if (ratio < 0.5) return 'text-yellow-500'
  if (ratio < 0.8) return 'text-orange-500'
  return 'text-red-500'
}

function costBg(cost: number, maxCost: number): string {
  if (maxCost === 0) return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
  const ratio = cost / maxCost
  if (ratio < 0.2) return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
  if (ratio < 0.5) return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
  if (ratio < 0.8) return 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
  return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
}

// ── TreeNode ────────────────────────────────────────────────

function TreeNode({
  node,
  depth,
  maxCost,
}: {
  node: ExplainPlanNode
  depth: number
  maxCost: number
}) {
  const [expanded, setExpanded] = useState(depth < 3)
  const hasChildren = node.children.length > 0

  const icon = () => {
    const op = node.operation.toLowerCase()
    if (op.includes('seq scan')) return <Table2 className="w-3.5 h-3.5" />
    if (op.includes('index')) return <Zap className="w-3.5 h-3.5" />
    if (op.includes('join')) return <ArrowRight className="w-3.5 h-3.5" />
    if (op.includes('sort')) return <Filter className="w-3.5 h-3.5" />
    if (op.includes('aggregate') || op.includes('hash')) return <Hash className="w-3.5 h-3.5" />
    return <Database className="w-3.5 h-3.5" />
  }

  return (
    <div className="select-none">
      <div
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border cursor-pointer
          hover:shadow-sm transition-shadow text-xs ${costBg(node.totalCost, maxCost)}`}
        style={{ marginLeft: depth * 20 }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {/* Expand toggle */}
        <span className="w-3 shrink-0">
          {hasChildren && (expanded
            ? <ChevronDown className="w-3 h-3 text-gray-400" />
            : <ChevronRight className="w-3 h-3 text-gray-400" />
          )}
        </span>

        {/* Icon */}
        <span className={costColor(node.totalCost, maxCost)}>
          {icon()}
        </span>

        {/* Operation */}
        <span className="font-semibold text-gray-800 dark:text-gray-200">
          {node.operation}
        </span>

        {/* Relation */}
        {node.relation && (
          <span className="text-gray-500 dark:text-gray-400 font-mono">
            {node.relation}
          </span>
        )}

        {/* Index */}
        {node.indexName && (
          <span className="text-blue-500 dark:text-blue-400 font-mono text-[10px]">
            ({node.indexName})
          </span>
        )}

        {/* Cost */}
        <span className={`ml-auto font-mono font-semibold ${costColor(node.totalCost, maxCost)}`}>
          {node.totalCost.toFixed(2)}
        </span>

        {/* Rows */}
        {node.planRows > 0 && (
          <span className="text-gray-400 font-mono text-[10px]">
            ×{formatNum(node.planRows)}
          </span>
        )}

        {/* Time */}
        {node.actualTime !== undefined && (
          <span className="text-gray-400 font-mono text-[10px]">
            <Clock className="w-2.5 h-2.5 inline mr-0.5" />
            {node.actualTime.toFixed(1)}ms
          </span>
        )}

        {/* Warnings */}
        {node.warnings.length > 0 && (
          <span className="text-amber-500" title={node.warnings[0]}>
            <AlertTriangle className="w-3 h-3" />
          </span>
        )}
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {node.children.map(child => (
            <TreeNode key={child.id} node={child} depth={depth + 1} maxCost={maxCost} />
          ))}
        </div>
      )}

      {/* Warnings detail */}
      {expanded && node.warnings.length > 0 && (
        <div style={{ marginLeft: (depth + 1) * 20 }}>
          {node.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-1 px-2 py-1 text-[10px] text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-2.5 h-2.5 mt-0.5 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// ── VisualExplain ───────────────────────────────────────────

export default function VisualExplain({ result, onRequestAI }: VisualExplainProps) {
  const [view, setView] = useState<'tree' | 'raw' | 'ai'>('tree')

  const maxCost = useMemo(() => {
    if (!result.plan) return 0
    const collect = (n: ExplainPlanNode): number =>
      Math.max(n.totalCost, ...n.children.map(collect))
    return collect(result.plan)
  }, [result.plan])

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">EXPLAIN</span>
        <span className="text-xs text-gray-400">{result.databaseType}</span>

        <div className="flex-1" />

        {/* View tabs */}
        <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-md p-0.5">
          {(['tree', 'raw', 'ai'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded font-medium transition-colors
                ${view === v
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
            >
              {v === 'tree' && <Table2 className="w-3 h-3" />}
              {v === 'raw' && <Code className="w-3 h-3" />}
              {v === 'ai' && <Brain className="w-3 h-3" />}
              {v === 'tree' ? 'Graph' : v === 'raw' ? 'Raw' : 'AI'}
            </button>
          ))}
        </div>

        {onRequestAI && view !== 'ai' && (
          <button
            onClick={() => { setView('ai'); onRequestAI() }}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors"
          >
            <Brain className="w-3 h-3" />
            AI 分析
          </button>
        )}
      </div>

      {/* Query */}
      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
        <code className="text-xs font-mono text-gray-600 dark:text-gray-400">{result.query}</code>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {view === 'tree' && (
          <div className="p-3 space-y-0.5">
            {result.plan ? (
              <TreeNode node={result.plan} depth={0} maxCost={maxCost} />
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Table2 className="w-8 h-8 mb-2" />
                <p className="text-sm">无法解析执行计划</p>
                <p className="text-xs mt-1">切换到 Raw 视图查看原始输出</p>
              </div>
            )}
          </div>
        )}

        {view === 'raw' && (
          <pre className="p-4 text-xs font-mono text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed overflow-x-auto">
            {result.rawOutput || '(空)'}
          </pre>
        )}

        {view === 'ai' && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 px-4 text-center">
            <Brain className="w-8 h-8 mb-2" />
            <p className="text-sm">AI 分析</p>
            <p className="text-xs mt-1">
              {onRequestAI
                ? '点击上方 "AI 分析" 按钮获取执行计划优化建议'
                : 'AI 分析功能需要在 AI 面板中触发'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
