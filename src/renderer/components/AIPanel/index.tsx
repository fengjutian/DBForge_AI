import React, { useState, useEffect } from 'react'
import { useConnectionStore } from '../../store/connectionStore'
import { useEditorStore } from '../../store/editorStore'
import { useResultStore } from '../../store/resultStore'
import type { TextToSQLResponse, DatabaseSchema, QueryHistory } from '../../../shared/types'

type Tab = 'generate' | 'history'

export default function AIPanel(): React.ReactElement {
  const { activeConnectionId } = useConnectionStore()
  const { tabs, activeTabId, updateContent, pendingExplainSQL, setPendingExplainSQL } = useEditorStore()
  const { result } = useResultStore()

  const [tab, setTab] = useState<Tab>('generate')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<TextToSQLResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [explanation, setExplanation] = useState<string | null>(null)
  const [explaining, setExplaining] = useState(false)
  const [sqlExplanation, setSqlExplanation] = useState<string | null>(null)
  const [explainingSql, setExplainingSql] = useState(false)

  // History
  const [history, setHistory] = useState<QueryHistory[]>([])
  const [historySearch, setHistorySearch] = useState('')
  const [historyLoading, setHistoryLoading] = useState(false)

  const loadHistory = async () => {
    setHistoryLoading(true)
    try {
      const list = await window.electronAPI.history.list(200)
      setHistory(list)
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'history') loadHistory()
  }, [tab])

  // Triggered by SQLEditor context menu "AI 解释 SQL"
  useEffect(() => {
    if (!pendingExplainSQL) return
    setPendingExplainSQL(null)
    setTab('generate')
    handleExplainSQL(pendingExplainSQL)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingExplainSQL])

  const handleSubmit = async () => {
    if (!input.trim() || !activeConnectionId) return
    setLoading(true); setError(null); setResponse(null); setExplanation(null)
    try {
      const schema: DatabaseSchema = await window.electronAPI.schema.fetch(activeConnectionId)
      const res = await window.electronAPI.ai.textToSQL({ naturalLanguage: input, schema, connectionId: activeConnectionId })
      setResponse(res)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  const handleUseSQL = (sql: string) => {
    updateContent(activeTabId, sql)
  }

  const handleExplainResult = async () => {
    if (!result) return
    setExplaining(true); setExplanation(null)
    try {
      const text = await window.electronAPI.ai.explainResult(result, input || undefined)
      setExplanation(text)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setExplaining(false)
    }
  }

  const handleExplainSQL = async (sql: string) => {
    if (!sql.trim()) return
    setExplainingSql(true); setSqlExplanation(null)
    try {
      const text = await window.electronAPI.ai.explainSQL(sql)
      setSqlExplanation(text)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setExplainingSql(false)
    }
  }

  const handleDeleteHistory = async (id: number) => {
    await window.electronAPI.history.delete(id)
    setHistory(prev => prev.filter(h => h.id !== id))
  }

  const handleClearHistory = async () => {
    if (!window.confirm('确定清空所有历史记录？')) return
    await window.electronAPI.history.clear()
    setHistory([])
  }

  const filteredHistory = historySearch
    ? history.filter(h => h.sql.toLowerCase().includes(historySearch.toLowerCase()) || h.connectionName.toLowerCase().includes(historySearch.toLowerCase()))
    : history

  const activeTab = tabs.find(t => t.id === activeTabId)

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Header + tabs */}
      <div className="px-3 pt-2 border-b border-gray-200 dark:border-gray-700">
        <div className="font-semibold text-sm mb-2">AI 助手</div>
        <div className="flex gap-1">
          {(['generate', 'history'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-xs px-3 py-1 rounded-t border-b-2 transition-colors ${tab === t ? 'border-blue-500 text-blue-600 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
              {t === 'generate' ? '生成 SQL' : `历史记录${history.length ? ` (${history.length})` : ''}`}
            </button>
          ))}
        </div>
      </div>

      {/* Generate tab */}
      {tab === 'generate' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {!activeConnectionId && (
            <div className="text-xs text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 rounded p-2">⚠ 请先选择一个数据库连接</div>
          )}

          <div>
            <label className="text-xs text-gray-500 mb-1 block">用自然语言描述你的查询需求</label>
            <textarea
              className="w-full text-sm px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              rows={3}
              placeholder="例如：查询最近7天注册的用户数量，按天分组..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit() }}
            />
            <button onClick={handleSubmit}
              disabled={loading || !input.trim() || !activeConnectionId}
              className="mt-2 w-full text-sm py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-medium">
              {loading ? '生成中...' : '生成 SQL  Ctrl+Enter'}
            </button>
          </div>

          {error && (
            <div className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded p-2 flex items-start justify-between gap-2">
              <span>✗ {error}</span>
              <button onClick={() => { setError(null); handleSubmit() }} className="text-blue-500 hover:underline flex-shrink-0">重试</button>
            </div>
          )}

          {response && (
            <div className="space-y-2">
              {response.isDangerous && (
                <div className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2">
                  ⚠ 危险操作警告：此 SQL 可能修改或删除数据，请谨慎执行！
                </div>
              )}
              <div className="bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-xs text-gray-500">生成的 SQL</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{response.provider} · {response.latency}ms</span>
                    <button onClick={() => handleExplainSQL(response.sql)} disabled={explainingSql}
                      className="text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50">
                      {explainingSql ? '解释中...' : '解释'}
                    </button>
                    <button onClick={() => handleUseSQL(response.sql)}
                      className="text-xs px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700">使用</button>
                  </div>
                </div>
                <pre className="text-xs font-mono p-3 overflow-x-auto whitespace-pre-wrap">{response.sql}</pre>
              </div>
              {sqlExplanation && (
                <div className="text-xs text-gray-600 dark:text-gray-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded p-2 whitespace-pre-wrap">
                  📖 {sqlExplanation}
                </div>
              )}
              {response.explanation && (
                <div className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded p-2">
                  💡 {response.explanation}
                </div>
              )}
            </div>
          )}

          {result && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <button onClick={handleExplainResult} disabled={explaining}
                className="w-full text-sm py-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                {explaining ? '分析中...' : '🤖 AI 解释查询结果'}
              </button>
              {explanation && (
                <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 rounded p-2 whitespace-pre-wrap">
                  {explanation}
                </div>
              )}
            </div>
          )}

          {/* Explain current editor SQL */}
          {activeTab && activeTab.content.trim() && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <button
                onClick={() => handleExplainSQL(activeTab.content)}
                disabled={explainingSql}
                className="w-full text-sm py-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                {explainingSql ? '解释中...' : '📖 解释编辑器中的 SQL'}
              </button>
              {sqlExplanation && !response && (
                <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded p-2 whitespace-pre-wrap">
                  {sqlExplanation}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Search + actions */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <input
              className="flex-1 text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none"
              placeholder="搜索 SQL..."
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
            />
            <button onClick={loadHistory} className="text-xs text-gray-400 hover:text-blue-500" title="刷新">↻</button>
            {history.length > 0 && (
              <button onClick={handleClearHistory} className="text-xs text-red-400 hover:text-red-600">清空</button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {historyLoading && (
              <div className="text-center text-xs text-gray-400 py-8">加载中...</div>
            )}
            {!historyLoading && filteredHistory.length === 0 && (
              <div className="text-center text-xs text-gray-400 py-8">暂无历史记录</div>
            )}
            {filteredHistory.map(h => (
              <div key={h.id}
                className="group px-3 py-2 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                {/* SQL preview */}
                <div className="flex items-start justify-between gap-2">
                  <pre className="text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-all flex-1 leading-relaxed line-clamp-3">
                    {h.sql}
                  </pre>
                  <div className="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleUseSQL(h.sql)}
                      title="插入到编辑器"
                      className="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 hover:bg-blue-200">
                      使用
                    </button>
                    <button
                      onClick={() => handleDeleteHistory(h.id)}
                      title="删除"
                      className="text-xs px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-500 hover:bg-red-200">
                      ✕
                    </button>
                  </div>
                </div>
                {/* Meta */}
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                  <span className={`w-1.5 h-1.5 rounded-full ${h.success ? 'bg-green-400' : 'bg-red-400'}`} />
                  <span>{h.connectionName}</span>
                  <span>·</span>
                  <span>{h.rowCount} 行</span>
                  <span>·</span>
                  <span>{h.duration}ms</span>
                  <span>·</span>
                  <span>{new Date(h.executedAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      {activeTab && tab === 'generate' && (
        <div className="px-3 py-1.5 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400 flex-shrink-0">
          当前标签：{activeTab.title}
        </div>
      )}
    </div>
  )
}

function extractErrorMessage(e: unknown): string {
  if (!e) return '未知错误'
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  const obj = e as Record<string, unknown>
  if (typeof obj.userMessage === 'string' && obj.userMessage) return obj.userMessage
  if (typeof obj.message === 'string' && obj.message) return obj.message
  return JSON.stringify(e)
}
