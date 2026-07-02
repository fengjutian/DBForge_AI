// ============================================================
// InsightPanel — AI-driven result insights
// ============================================================
// Provides auto-summary, chart recommendations, and anomaly
// detection for query results. Triggered manually from ResultPanel.

import React, { useState } from 'react'
import { Brain, BarChart3, TrendingUp, AlertTriangle, ChevronDown, ChevronRight, Lightbulb } from 'lucide-react'
import type { ColumnMeta } from '@dbforge/shared'

interface InsightPanelProps {
  columns: ColumnMeta[]
  rows: Record<string, unknown>[]
  connectionId: string
}

interface InsightResult {
  summary: string
  chartSuggestions: { type: string; title: string; x: string; y: string }[]
  anomalies: { column: string; issue: string; severity: 'low' | 'medium' | 'high' }[]
}

// ── Local analysis (no AI call needed) ──────────────────────

function analyzeLocally(columns: ColumnMeta[], rows: Record<string, unknown>[]): InsightResult {
  const numericCols = columns.filter(c => {
    const sample = rows.slice(0, 10).map(r => r[c.name])
    return sample.some(v => typeof v === 'number')
  })

  const anomalies: InsightResult['anomalies'] = []

  // Check for high null rates
  for (const col of columns) {
    const nullCount = rows.filter(r => r[col.name] === null || r[col.name] === undefined).length
    const nullRate = rows.length > 0 ? nullCount / rows.length : 0
    if (nullRate > 0.2) {
      anomalies.push({
        column: col.name,
        issue: `${(nullRate * 100).toFixed(0)}% 空值率（${nullCount}/${rows.length}）`,
        severity: nullRate > 0.5 ? 'high' : 'medium'
      })
    }
  }

  // Check numeric outliers
  for (const col of numericCols.slice(0, 5)) {
    const values = rows.map(r => Number(r[col.name])).filter(v => !isNaN(v))
    if (values.length < 10) continue
    const sorted = [...values].sort((a, b) => a - b)
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const stdDev = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length)
    const outliers = values.filter(v => Math.abs(v - mean) > 3 * stdDev)
    if (outliers.length > 0 && outliers.length < values.length * 0.05) {
      anomalies.push({
        column: col.name,
        issue: `${outliers.length} 个异常值（>3σ，范围 ${outliers[0]?.toFixed(1)} ~ ${outliers[outliers.length-1]?.toFixed(1)}）`,
        severity: 'low'
      })
    }
  }

  // Chart suggestions
  const chartSuggestions: InsightResult['chartSuggestions'] = []
  if (numericCols.length >= 1) {
    const textCol = columns.find(c => !numericCols.includes(c))
    if (textCol) {
      chartSuggestions.push({
        type: 'bar',
        title: `${numericCols[0].name} 分布`,
        x: textCol.name,
        y: numericCols[0].name
      })
    }
  }

  // Summary
  const totalRows = rows.length
  const sample = rows.slice(0, 3)
  const summary = `共 ${totalRows} 行 · ${columns.length} 列` +
    (numericCols.length > 0 ? ` · ${numericCols.length} 个数值列` : '') +
    (anomalies.length > 0 ? ` · ${anomalies.length} 个数据质量问题` : '')

  return { summary, chartSuggestions, anomalies }
}

// ── InsightPanel Component ──────────────────────────────────

export default function InsightPanel({ columns, rows, connectionId }: InsightPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [aiInsight, setAiInsight] = useState<string | null>(null)

  const insight = analyzeLocally(columns, rows)

  const requestAIInsight = async () => {
    if (aiInsight || loading) return
    setLoading(true)
    try {
      const result = await window.electronAPI.ai.explainResult({
        columns,
        rows: rows.slice(0, 50),
        sql: '',
        executionTime: 0,
        affectedRows: rows.length
      }, '请分析这个查询结果的数据特征和洞察')
      setAiInsight(typeof result === 'string' ? result : JSON.stringify(result))
    } catch {
      setAiInsight('AI 分析暂时不可用')
    } finally {
      setLoading(false)
    }
  }

  if (rows.length === 0) return null

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30">
      {/* Toggle header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        {expanded
          ? <ChevronDown className="w-3 h-3 text-gray-400" />
          : <ChevronRight className="w-3 h-3 text-gray-400" />
        }
        <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
        <span className="font-medium text-gray-700 dark:text-gray-300">数据洞察</span>
        <span className="text-gray-400">{insight.summary}</span>
        {insight.anomalies.length > 0 && (
          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-medium">
            <AlertTriangle className="w-2.5 h-2.5" />
            {insight.anomalies.length}
          </span>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-3 space-y-3">
          {/* Summary */}
          <div className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
            {insight.summary}
          </div>

          {/* Anomalies */}
          {insight.anomalies.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-500" />
                数据质量问题
              </h4>
              <div className="space-y-1">
                {insight.anomalies.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 px-2 py-1 rounded text-[11px] bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                    <span className={`shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${
                      a.severity === 'high' ? 'bg-red-500'
                      : a.severity === 'medium' ? 'bg-amber-500'
                      : 'bg-blue-500'
                    }`} />
                    <div>
                      <span className="font-mono font-medium text-gray-800 dark:text-gray-200">{a.column}</span>
                      <span className="text-gray-500 dark:text-gray-400 ml-2">{a.issue}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chart suggestions */}
          {insight.chartSuggestions.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                <BarChart3 className="w-3 h-3 text-blue-500" />
                建议图表
              </h4>
              <div className="flex gap-2">
                {insight.chartSuggestions.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1 rounded text-[11px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    <span className="text-blue-500 font-medium">{s.type.toUpperCase()}</span>
                    <span className="text-gray-500">{s.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Insight */}
          <div>
            <button
              onClick={requestAIInsight}
              disabled={loading || !!aiInsight}
              className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 disabled:opacity-50 disabled:cursor-default"
            >
              <Brain className="w-3 h-3" />
              {loading ? 'AI 分析中...' : aiInsight ? 'AI 分析结果' : 'AI 深度分析'}
            </button>
            {aiInsight && (
              <div className="mt-2 px-3 py-2 rounded text-xs bg-purple-50 dark:bg-purple-900/20 text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                {aiInsight}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
