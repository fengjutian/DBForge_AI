import React, { useState, useEffect, useCallback } from 'react'
import { Database, RefreshCw, Loader2, X, AlertTriangle, BookOpen, Lightbulb, Bot, Rocket, FileText, Search, Shield, CheckCircle, Clipboard, BarChart3, Microscope, ChevronUp, ChevronDown, MessageSquare, Circle } from 'lucide-react'
import { useConnectionStore } from '../../store/connectionStore'
import { useSessionStore } from '../../store/sessionStore'
import { useEditorStore } from '../../store/editorStore'
import { useResultStore } from '../../store/resultStore'
import { useAIStream, newStreamId } from '../../hooks/useAIStream'
import type {
  TextToSQLResponse,
  DatabaseSchema,
  QueryHistory,
  OptimizeQueryResponse,
  DiagnoseErrorResponse,
  SchemaDocResponse,
  SecurityAuditResponse,
  DataQualityResponse
} from '../../../shared/types'
import MarkdownRenderer from '../MarkdownRenderer'

type Tab = 'generate' | 'optimize' | 'diagnose' | 'security' | 'schema-doc' | 'data-quality' | 'history'

const TAB_LABELS: Record<Tab, string> = {
  generate: '生成 SQL',
  optimize: '查询优化',
  diagnose: '错误诊断',
  security: '安全审计',
  'schema-doc': 'Schema 文档',
  'data-quality': '数据质量',
  history: '历史记录'
}

export default function AIPanel({ onClose }: { onClose?: () => void }): React.ReactElement {
  const { activeConnectionId, activeDatabase, switchDatabase } = useConnectionStore()
  const { tabs, activeTabId, updateContent, pendingExplainSQL, setPendingExplainSQL } = useEditorStore()
  const { result, error: queryError } = useResultStore()
  const { startStream, clearStream, isStreaming, getText, getThinking } = useAIStream()

  const [tab, setTab] = useState<Tab>('generate')
  const [globalError, setGlobalError] = useState<string | null>(null)

  // ── Database selector state ──
  const [databases, setDatabases] = useState<string[]>([])
  const [selectedDb, setSelectedDb] = useState<string | null>(activeDatabase)
  const [dbLoading, setDbLoading] = useState(false)

  // ── Stream IDs (stable per session, reset on new call) ──
  const [genStreamId, setGenStreamId] = useState('')
  const [explainSqlStreamId, setExplainSqlStreamId] = useState('')
  const [explainResultStreamId, setExplainResultStreamId] = useState('')
  const [optimizeStreamId, setOptimizeStreamId] = useState('')
  const [diagnoseStreamId, setDiagnoseStreamId] = useState('')
  const [schemaDocStreamId, setSchemaDocStreamId] = useState('')
  const [securityStreamId, setSecurityStreamId] = useState('')
  const [dataQualityStreamId, setDataQualityStreamId] = useState('')

  // ── Generate SQL state ──
  const [genInput, setGenInput] = useState('')
  const [genLoading, setGenLoading] = useState(false)
  const [genResponse, setGenResponse] = useState<TextToSQLResponse | null>(null)

  // ── Optimize state ──
  const [optimizeLoading, setOptimizeLoading] = useState(false)
  const [optimizeResponse, setOptimizeResponse] = useState<OptimizeQueryResponse | null>(null)

  // ── Diagnose state ──
  const [diagnoseLoading, setDiagnoseLoading] = useState(false)
  const [diagnoseResponse, setDiagnoseResponse] = useState<DiagnoseErrorResponse | null>(null)
  const [diagnoseError, setDiagnoseError] = useState('')

  // ── Security state ──
  const [securityLoading, setSecurityLoading] = useState(false)
  const [securityResponse, setSecurityResponse] = useState<SecurityAuditResponse | null>(null)

  // ── Schema doc state ──
  const [schemaDocLoading, setSchemaDocLoading] = useState(false)
  const [schemaDocResponse, setSchemaDocResponse] = useState<SchemaDocResponse | null>(null)

  // ── Data quality state ──
  const [dataQualityLoading, setDataQualityLoading] = useState(false)
  const [dataQualityResponse, setDataQualityResponse] = useState<DataQualityResponse | null>(null)

  // ── History state ──
  const [history, setHistory] = useState<QueryHistory[]>([])
  const [historySearch, setHistorySearch] = useState('')
  const [historyLoading, setHistoryLoading] = useState(false)

  const activeTab = tabs.find(t => t.id === activeTabId)
  const currentSQL = activeTab?.content?.trim() ?? ''

  // Load database list from the session's schema when connection changes
  const loadDatabases = useCallback(async () => {
    if (!activeConnectionId) { setDatabases([]); setSelectedDb(null); return }
    setDbLoading(true)
    try {
      const schema = useSessionStore.getState().getSchema(activeConnectionId)
      if (!schema) { setDatabases([]); return }
      const names = schema.databases.map(d => d.name)
      setDatabases(names)
      // Keep selectedDb if still valid, else default to activeDatabase or first
      setSelectedDb(prev => {
        if (prev && names.includes(prev)) return prev
        if (activeDatabase && names.includes(activeDatabase)) return activeDatabase
        return names[0] ?? null
      })
    } catch { /* ignore */ } finally {
      setDbLoading(false)
    }
  }, [activeConnectionId, activeDatabase])

  useEffect(() => { loadDatabases() }, [loadDatabases])

  // Sync selectedDb when activeDatabase changes externally
  useEffect(() => {
    if (activeDatabase) setSelectedDb(activeDatabase)
  }, [activeDatabase])

  const handleSwitchDb = async (db: string) => {
    if (!activeConnectionId || db === selectedDb) return
    setSelectedDb(db)
    try {
      await switchDatabase(activeConnectionId, db)
    } catch (e) {
      setGlobalError(extractErrorMessage(e))
    }
  }

  /** Get schema from the session, filtered to the selected database */
  const fetchSchema = (): DatabaseSchema | undefined => {
    if (!activeConnectionId) return undefined
    const schema = useSessionStore.getState().getSchema(activeConnectionId)
    if (!schema) return undefined
    if (!selectedDb) return schema
    return {
      ...schema,
      databases: schema.databases.filter(d => d.name === selectedDb)
    }
  }

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

  // Handle pending explain SQL from editor context menu
  useEffect(() => {
    if (!pendingExplainSQL) return
    setPendingExplainSQL(null)
    setTab('generate')
    handleExplainSQL(pendingExplainSQL)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingExplainSQL])

  // Auto-populate diagnose error from result store
  useEffect(() => {
    if (queryError && tab === 'diagnose') {
      setDiagnoseError(queryError)
    }
  }, [queryError, tab])

  const handleUseSQL = (sql: string) => {
    const current = activeTab?.content ?? ''
    const newContent = current.trim() ? `${current.trimEnd()}\n\n${sql}` : sql
    updateContent(activeTabId, newContent)
  }

  // ── Generate SQL ──
  const handleGenerate = async () => {
    if (!genInput.trim() || !activeConnectionId) return
    const sid = newStreamId('gen')
    setGenStreamId(sid); clearStream(sid); startStream(sid)
    setGenLoading(true); setGlobalError(null); setGenResponse(null)
    try {
      const schema = fetchSchema()
      if (!schema) { setGlobalError('无法获取数据库结构'); return }
      const res = await window.electronAPI.ai.textToSQL({ naturalLanguage: genInput, schema, connectionId: activeConnectionId, streamId: sid })
      setGenResponse(res)
    } catch (e) {
      setGlobalError(extractErrorMessage(e))
    } finally {
      setGenLoading(false)
    }
  }

  const handleExplainSQL = async (sql: string) => {
    if (!sql.trim()) return
    const sid = newStreamId('explain')
    setExplainSqlStreamId(sid); clearStream(sid); startStream(sid)
    try {
      await window.electronAPI.ai.explainSQL(sql, sid)
    } catch (e) {
      setGlobalError(extractErrorMessage(e))
    }
  }

  const handleExplainResult = async () => {
    if (!result) return
    const sid = newStreamId('explainResult')
    setExplainResultStreamId(sid); clearStream(sid); startStream(sid)
    try {
      await window.electronAPI.ai.explainResult(result, genInput || undefined, sid)
    } catch (e) {
      setGlobalError(extractErrorMessage(e))
    }
  }

  // ── Optimize ──
  const handleOptimize = async () => {
    if (!currentSQL) return
    const sid = newStreamId('optimize')
    setOptimizeStreamId(sid); clearStream(sid); startStream(sid)
    setOptimizeLoading(true); setGlobalError(null); setOptimizeResponse(null)
    try {
      const schema = fetchSchema()
      const res = await window.electronAPI.ai.optimizeQuery({ sql: currentSQL, schema, streamId: sid })
      setOptimizeResponse(res)
    } catch (e) {
      setGlobalError(extractErrorMessage(e))
    } finally {
      setOptimizeLoading(false)
    }
  }

  // ── Diagnose ──
  const handleDiagnose = async () => {
    if (!currentSQL || !diagnoseError.trim()) return
    const sid = newStreamId('diagnose')
    setDiagnoseStreamId(sid); clearStream(sid); startStream(sid)
    setDiagnoseLoading(true); setGlobalError(null); setDiagnoseResponse(null)
    try {
      const schema = fetchSchema()
      const res = await window.electronAPI.ai.diagnoseError({ sql: currentSQL, errorMessage: diagnoseError, schema, streamId: sid })
      setDiagnoseResponse(res)
    } catch (e) {
      setGlobalError(extractErrorMessage(e))
    } finally {
      setDiagnoseLoading(false)
    }
  }

  // ── Security ──
  const handleSecurityAudit = async () => {
    if (!currentSQL) return
    const sid = newStreamId('security')
    setSecurityStreamId(sid); clearStream(sid); startStream(sid)
    setSecurityLoading(true); setGlobalError(null); setSecurityResponse(null)
    try {
      const res = await window.electronAPI.ai.securityAudit({ sql: currentSQL, streamId: sid })
      setSecurityResponse(res)
    } catch (e) {
      setGlobalError(extractErrorMessage(e))
    } finally {
      setSecurityLoading(false)
    }
  }

  // ── Schema Doc ──
  const handleSchemaDoc = async () => {
    if (!activeConnectionId) return
    const sid = newStreamId('schemaDoc')
    setSchemaDocStreamId(sid); clearStream(sid); startStream(sid)
    setSchemaDocLoading(true); setGlobalError(null); setSchemaDocResponse(null)
    try {
      const schema = fetchSchema()
      if (!schema) { setGlobalError('无法获取数据库结构'); return }
      const res = await window.electronAPI.ai.generateSchemaDoc({ schema, targetDb: selectedDb ?? undefined, streamId: sid })
      setSchemaDocResponse(res)
    } catch (e) {
      setGlobalError(extractErrorMessage(e))
    } finally {
      setSchemaDocLoading(false)
    }
  }

  // ── Data Quality ──
  const handleDataQuality = async () => {
    if (!result) return
    const sid = newStreamId('dataQuality')
    setDataQualityStreamId(sid); clearStream(sid); startStream(sid)
    setDataQualityLoading(true); setGlobalError(null); setDataQualityResponse(null)
    try {
      const res = await window.electronAPI.ai.analyzeDataQuality({ result, streamId: sid })
      setDataQualityResponse(res)
    } catch (e) {
      setGlobalError(extractErrorMessage(e))
    } finally {
      setDataQualityLoading(false)
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

  const tabs_list: Tab[] = ['generate', 'optimize', 'diagnose', 'security', 'schema-doc', 'data-quality', 'history']

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <div className="px-3 pt-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold text-sm">AI 助手</div>
          {onClose && (
            <button onClick={onClose} title="关闭"
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md p-1 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Database selector */}
        {activeConnectionId && (
          <div className="flex items-center gap-2 mb-2 px-0.5">
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Database className="w-3.5 h-3.5 text-green-500" />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">数据库</span>
              {databases.length > 0 && !dbLoading && (
                <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full leading-none font-medium">{databases.length}</span>
              )}
            </div>
            <div className="relative flex-1 min-w-0">
              {dbLoading ? (
                <div className="flex items-center gap-1.5 text-xs text-gray-400 px-2 py-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>加载中...</span>
                </div>
              ) : databases.length > 0 ? (
                <>
                  <select
                    value={selectedDb ?? ''}
                    onChange={e => { handleSwitchDb(e.target.value); setTimeout(() => e.target.blur(), 0) }}
                    className="w-full text-xs appearance-none pl-2.5 pr-7 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600 focus:outline-none focus:border-green-400 dark:focus:border-green-500 focus:ring-1 focus:ring-green-500/30 focus:bg-white dark:focus:bg-gray-750 transition-colors cursor-pointer truncate"
                  >
                    {databases.map(db => (
                      <option key={db} value={db}>{db}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-gray-400 px-2 py-1.5">
                  <Database className="w-3 h-3 opacity-50" />
                  <span>无可用数据库</span>
                </div>
              )}
            </div>
            <button
              onClick={loadDatabases}
              title="刷新数据库列表"
              disabled={dbLoading}
              className="flex-shrink-0 p-1 rounded-md text-gray-400 hover:text-green-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${dbLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        )}

        <div className="flex gap-0.5 flex-wrap">
          {tabs_list.map(t => (
            <button key={t} onClick={() => { setTab(t); setGlobalError(null) }}
              className={`text-xs px-2 py-1 rounded-t border-b-2 transition-colors whitespace-nowrap ${tab === t ? 'border-green-500 text-green-600 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
              {TAB_LABELS[t]}{t === 'history' && history.length ? ` (${history.length})` : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Global error */}
      {globalError && (
        <div className="mx-3 mt-2 text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded p-2 flex items-start justify-between gap-2 flex-shrink-0">
          <span><AlertTriangle className="w-3 h-3 inline mr-1 align-middle" />{globalError}</span>
          <button onClick={() => setGlobalError(null)} className="text-gray-400 hover:text-gray-600 flex-shrink-0"><X className="w-3 h-3" /></button>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'generate' && (
          <GenerateTab
            activeConnectionId={activeConnectionId}
            genInput={genInput}
            setGenInput={setGenInput}
            genLoading={genLoading}
            genResponse={genResponse}
            genStreamText={getText(genStreamId)}
            genThinking={getThinking(genStreamId)}
            sqlExplanation={getText(explainSqlStreamId)}
            explainingSql={isStreaming(explainSqlStreamId)}
            explainSqlThinking={getThinking(explainSqlStreamId)}
            resultExplanation={getText(explainResultStreamId)}
            explainingResult={isStreaming(explainResultStreamId)}
            hasResult={!!result}
            currentSQL={currentSQL}
            onGenerate={handleGenerate}
            onUseSQL={handleUseSQL}
            onExplainSQL={handleExplainSQL}
            onExplainResult={handleExplainResult}
          />
        )}

        {tab === 'optimize' && (
          <OptimizeTab
            currentSQL={currentSQL}
            loading={optimizeLoading}
            response={optimizeResponse}
            streamText={getText(optimizeStreamId)}
            thinking={getThinking(optimizeStreamId)}
            onOptimize={handleOptimize}
            onUseSQL={handleUseSQL}
          />
        )}

        {tab === 'diagnose' && (
          <DiagnoseTab
            currentSQL={currentSQL}
            errorMessage={diagnoseError}
            setErrorMessage={setDiagnoseError}
            loading={diagnoseLoading}
            response={diagnoseResponse}
            streamText={getText(diagnoseStreamId)}
            thinking={getThinking(diagnoseStreamId)}
            onDiagnose={handleDiagnose}
            onUseSQL={handleUseSQL}
          />
        )}

        {tab === 'security' && (
          <SecurityTab
            currentSQL={currentSQL}
            loading={securityLoading}
            response={securityResponse}
            streamText={getText(securityStreamId)}
            thinking={getThinking(securityStreamId)}
            onAudit={handleSecurityAudit}
          />
        )}

        {tab === 'schema-doc' && (
          <SchemaDocTab
            activeConnectionId={activeConnectionId}
            loading={schemaDocLoading}
            response={schemaDocResponse}
            streamText={getText(schemaDocStreamId)}
            thinking={getThinking(schemaDocStreamId)}
            onGenerate={handleSchemaDoc}
          />
        )}

        {tab === 'data-quality' && (
          <DataQualityTab
            hasResult={!!result}
            loading={dataQualityLoading}
            response={dataQualityResponse}
            streamText={getText(dataQualityStreamId)}
            thinking={getThinking(dataQualityStreamId)}
            onAnalyze={handleDataQuality}
          />
        )}

        {tab === 'history' && (
          <HistoryTab
            history={filteredHistory}
            historySearch={historySearch}
            setHistorySearch={setHistorySearch}
            historyLoading={historyLoading}
            onLoadHistory={loadHistory}
            onUseSQL={handleUseSQL}
            onDeleteHistory={handleDeleteHistory}
            onClearHistory={handleClearHistory}
          />
        )}
      </div>

      {/* Footer */}
      {activeTab && tab !== 'history' && (
        <div className="px-3 py-1.5 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400 flex-shrink-0 truncate">
          当前标签：{activeTab.title}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────

function NoConnectionWarning() {
  return <div className="text-xs text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 rounded p-2"><AlertTriangle className="w-3 h-3 inline mr-1 align-middle" />请先选择一个数据库连接</div>
}

function NoSQLWarning() {
  return <div className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-800 rounded p-2">请先在编辑器中输入 SQL 语句</div>
}

function NoResultWarning() {
  return <div className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-800 rounded p-2">请先执行一条查询获取结果</div>
}

// ── Generate Tab ─────────────────────────────────────────────

interface GenerateTabProps {
  activeConnectionId: string | null
  genInput: string
  setGenInput: (v: string) => void
  genLoading: boolean
  genResponse: TextToSQLResponse | null
  genStreamText: string
  genThinking: string
  sqlExplanation: string
  explainingSql: boolean
  explainSqlThinking: string
  resultExplanation: string
  explainingResult: boolean
  hasResult: boolean
  currentSQL: string
  onGenerate: () => void
  onUseSQL: (sql: string) => void
  onExplainSQL: (sql: string) => void
  onExplainResult: () => void
}

function GenerateTab(p: GenerateTabProps): React.ReactElement {
  return (
    <div className="p-3 space-y-3">
      {!p.activeConnectionId && <NoConnectionWarning />}

      <div>
        <label className="text-xs text-gray-500 mb-1 block">用自然语言描述查询需求</label>
        <textarea
          className="w-full text-sm px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-green-500 resize-none"
          rows={3}
          placeholder="例如：查询最近7天注册的用户数量，按天分组..."
          value={p.genInput}
          onChange={e => p.setGenInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) p.onGenerate() }}
        />
        <button onClick={p.onGenerate}
          disabled={p.genLoading || !p.genInput.trim() || !p.activeConnectionId}
          className="mt-2 w-full text-sm py-1.5 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 font-medium">
          {p.genLoading ? '生成中...' : '生成 SQL  Ctrl+Enter'}
        </button>
      </div>

      {p.genLoading && p.genThinking && <ThinkingBox text={p.genThinking} />}
      {p.genLoading && p.genStreamText && <StreamingBox text={p.genStreamText} />}

      {p.genResponse && (
        <div className="space-y-2">
          {p.genResponse.isDangerous && (
            <div className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2">
              <AlertTriangle className="w-3 h-3 inline mr-1 align-middle" />危险操作警告：此 SQL 可能修改或删除数据，请谨慎执行！
            </div>
          )}
          <SQLBlock
            label="生成的 SQL"
            sql={p.genResponse.sql}
            meta={`${p.genResponse.provider} · ${p.genResponse.latency}ms`}
            onUse={() => p.onUseSQL(p.genResponse!.sql)}
            onExplain={() => p.onExplainSQL(p.genResponse!.sql)}
            explainLoading={p.explainingSql}
          />
          {(p.explainingSql || p.sqlExplanation) && (
            <InfoBox color="amber" title={<><BookOpen className="w-3 h-3 inline mr-1 align-middle" />SQL 解释</>}>
              {p.explainSqlThinking && <ThinkingBox text={p.explainSqlThinking} />}
              {p.explainingSql && !p.sqlExplanation
                ? <StreamingDots />
                : <MarkdownRenderer content={p.sqlExplanation} />}
            </InfoBox>
          )}
          {p.genResponse.explanation && (
            <InfoBox color="gray" title={<><Lightbulb className="w-3 h-3 inline mr-1 align-middle" />说明</>}>
              <MarkdownRenderer content={p.genResponse.explanation} />
            </InfoBox>
          )}
        </div>
      )}

      {p.hasResult && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
          <button onClick={p.onExplainResult} disabled={p.explainingResult}
            className="w-full text-sm py-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
            {p.explainingResult ? '分析中...' : <><Bot className="w-3 h-3 inline mr-1 align-middle" />AI 解释查询结果</>}
          </button>
          {(p.explainingResult || p.resultExplanation) && (
            <div className="mt-2">
              <InfoBox color="blue" title={<><Bot className="w-3 h-3 inline mr-1 align-middle" />结果分析</>}>
                {p.explainingResult && !p.resultExplanation
                  ? <StreamingDots />
                  : <MarkdownRenderer content={p.resultExplanation} />}
              </InfoBox>
            </div>
          )}
        </div>
      )}

      {p.currentSQL && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
          <button onClick={() => p.onExplainSQL(p.currentSQL)} disabled={p.explainingSql}
            className="w-full text-sm py-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
            {p.explainingSql ? '解释中...' : <><BookOpen className="w-3 h-3 inline mr-1 align-middle" />解释编辑器中的 SQL</>}
          </button>
          {(p.explainingSql || p.sqlExplanation) && !p.genResponse && (
            <div className="mt-2">
              <InfoBox color="amber" title={<><BookOpen className="w-3 h-3 inline mr-1 align-middle" />SQL 解释</>}>
                {p.explainSqlThinking && <ThinkingBox text={p.explainSqlThinking} />}
                {p.explainingSql && !p.sqlExplanation
                  ? <StreamingDots />
                  : <MarkdownRenderer content={p.sqlExplanation} />}
              </InfoBox>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Optimize Tab ─────────────────────────────────────────────

interface OptimizeTabProps {
  currentSQL: string
  loading: boolean
  response: OptimizeQueryResponse | null
  streamText: string
  thinking: string
  onOptimize: () => void
  onUseSQL: (sql: string) => void
}

function OptimizeTab(p: OptimizeTabProps): React.ReactElement {
  return (
    <div className="p-3 space-y-3">
      {!p.currentSQL ? <NoSQLWarning /> : (
        <>
          <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-800 rounded p-2">
            <div className="font-medium mb-1">当前 SQL：</div>
            <pre className="font-mono whitespace-pre-wrap break-all line-clamp-4">{p.currentSQL}</pre>
          </div>
          <button onClick={p.onOptimize} disabled={p.loading}
            className="w-full text-sm py-1.5 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 font-medium">
            {p.loading ? '分析中...' : <><Rocket className="w-3 h-3 inline mr-1 align-middle" />AI 优化查询</>}
          </button>
        </>
      )}

      {p.loading && p.thinking && <ThinkingBox text={p.thinking} />}
      {p.loading && p.streamText && <StreamingBox text={p.streamText} />}

      {p.response && (
        <div className="space-y-2">
          <SQLBlock
            label="优化后的 SQL"
            sql={p.response.optimizedSql}
            meta={`${p.response.latency}ms`}
            onUse={() => p.onUseSQL(p.response!.optimizedSql)}
          />
          {p.response.suggestions.length > 0 && (
            <InfoBox color="blue" title={<><Lightbulb className="w-3 h-3 inline mr-1 align-middle" />优化建议</>}>
              <ul className="space-y-1">
                {p.response.suggestions.map((s, i) => (
                  <li key={i} className="flex gap-1.5"><span className="text-green-400 flex-shrink-0"><Circle className="w-1.5 h-1.5 inline fill-current" /></span><span>{s}</span></li>
                ))}
              </ul>
            </InfoBox>
          )}
          {p.response.explanation && (
            <InfoBox color="gray" title={<><FileText className="w-3 h-3 inline mr-1 align-middle" />说明</>}>
              <MarkdownRenderer content={p.response.explanation} />
            </InfoBox>
          )}
        </div>
      )}
    </div>
  )
}

// ── Diagnose Tab ─────────────────────────────────────────────

interface DiagnoseTabProps {
  currentSQL: string
  errorMessage: string
  setErrorMessage: (v: string) => void
  loading: boolean
  response: DiagnoseErrorResponse | null
  streamText: string
  thinking: string
  onDiagnose: () => void
  onUseSQL: (sql: string) => void
}

function DiagnoseTab(p: DiagnoseTabProps): React.ReactElement {
  return (
    <div className="p-3 space-y-3">
      {!p.currentSQL && <NoSQLWarning />}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">错误信息</label>
        <textarea
          className="w-full text-sm px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-green-500 resize-none"
          rows={3}
          placeholder="粘贴 MySQL 错误信息，例如：ERROR 1064 (42000): You have an error..."
          value={p.errorMessage}
          onChange={e => p.setErrorMessage(e.target.value)}
        />
        <button onClick={p.onDiagnose} disabled={p.loading || !p.currentSQL || !p.errorMessage.trim()}
          className="mt-2 w-full text-sm py-1.5 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 font-medium">
          {p.loading ? '诊断中...' : <><Search className="w-3 h-3 inline mr-1 align-middle" />AI 诊断错误</>}
        </button>
      </div>

      {p.loading && p.thinking && <ThinkingBox text={p.thinking} />}
      {p.loading && p.streamText && <StreamingBox text={p.streamText} />}

      {p.response && (
        <div className="space-y-2">
          <InfoBox color="red" title={<><Search className="w-3 h-3 inline mr-1 align-middle" />错误诊断</>}>
            <MarkdownRenderer content={p.response.diagnosis} />
          </InfoBox>
          {p.response.fixedSql && (
            <SQLBlock label="修复后的 SQL" sql={p.response.fixedSql} meta=""
              onUse={() => p.onUseSQL(p.response!.fixedSql!)} />
          )}
          {p.response.suggestions.length > 0 && (
            <InfoBox color="amber" title={<><Lightbulb className="w-3 h-3 inline mr-1 align-middle" />修复建议</>}>
              <ul className="space-y-1">
                {p.response.suggestions.map((s, i) => (
                  <li key={i} className="flex gap-1.5"><span className="text-amber-400 flex-shrink-0"><Circle className="w-1.5 h-1.5 inline fill-current" /></span><span>{s}</span></li>
                ))}
              </ul>
            </InfoBox>
          )}
        </div>
      )}
    </div>
  )
}

// ── Security Tab ─────────────────────────────────────────────

const SEVERITY_COLORS = {
  high: 'text-red-600 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  medium: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
  low: 'text-green-600 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
}

const SEVERITY_LABELS = { high: '高危', medium: '中危', low: '低危' }

interface SecurityTabProps {
  currentSQL: string
  loading: boolean
  response: SecurityAuditResponse | null
  streamText: string
  thinking: string
  onAudit: () => void
}

function SecurityTab(p: SecurityTabProps): React.ReactElement {
  return (
    <div className="p-3 space-y-3">
      {!p.currentSQL ? <NoSQLWarning /> : (
        <>
          <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-800 rounded p-2">
            <div className="font-medium mb-1">待审计 SQL：</div>
            <pre className="font-mono whitespace-pre-wrap break-all line-clamp-4">{p.currentSQL}</pre>
          </div>
          <button onClick={p.onAudit} disabled={p.loading}
            className="w-full text-sm py-1.5 rounded bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 font-medium">
            {p.loading ? '审计中...' : <><Shield className="w-3 h-3 inline mr-1 align-middle" />AI 安全审计</>}
          </button>
        </>
      )}

      {p.loading && p.thinking && <ThinkingBox text={p.thinking} />}
      {p.loading && p.streamText && <StreamingBox text={p.streamText} />}

      {p.response && (
        <div className="space-y-2">
          <div className={`text-xs rounded p-2 font-medium ${p.response.safe ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
            {p.response.safe ? <><CheckCircle className="w-3 h-3 inline mr-1 align-middle" />未发现安全问题</> : <><AlertTriangle className="w-3 h-3 inline mr-1 align-middle" />发现 {p.response.issues.length} 个安全问题</>}
          </div>
          {p.response.summary && (
            <InfoBox color="gray" title={<><Clipboard className="w-3 h-3 inline mr-1 align-middle" />总体评估</>}>
              <MarkdownRenderer content={p.response.summary} />
            </InfoBox>
          )}
          {p.response.issues.map((issue, i) => (
            <div key={i} className={`text-xs rounded border p-2 space-y-1 ${SEVERITY_COLORS[issue.severity]}`}>
              <div className="flex items-center gap-2 font-medium">
                <span className="px-1.5 py-0.5 rounded text-xs bg-white/50 dark:bg-black/20">{SEVERITY_LABELS[issue.severity]}</span>
                <span>{issue.type}</span>
              </div>
              <div>{issue.description}</div>
              <div className="opacity-80">建议：{issue.suggestion}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Schema Doc Tab ────────────────────────────────────────────

interface SchemaDocTabProps {
  activeConnectionId: string | null
  loading: boolean
  response: SchemaDocResponse | null
  streamText: string
  thinking: string
  onGenerate: () => void
}

function SchemaDocTab(p: SchemaDocTabProps): React.ReactElement {
  return (
    <div className="p-3 space-y-3">
      {!p.activeConnectionId ? <NoConnectionWarning /> : (
        <button onClick={p.onGenerate} disabled={p.loading}
          className="w-full text-sm py-1.5 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 font-medium">
          {p.loading ? '生成中...' : <><BookOpen className="w-3 h-3 inline mr-1 align-middle" />生成 Schema 文档</>}
        </button>
      )}
      {p.loading && p.thinking && <ThinkingBox text={p.thinking} />}
      {p.loading && p.streamText && <StreamingBox text={p.streamText} />}
      {p.response && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 font-medium">Schema 文档</span>
            <span className="text-xs text-gray-400">{p.response.latency}ms</span>
          </div>
          <MarkdownRenderer content={p.response.documentation} />
        </div>
      )}
    </div>
  )
}

// ── Data Quality Tab ──────────────────────────────────────────

interface DataQualityTabProps {
  hasResult: boolean
  loading: boolean
  response: DataQualityResponse | null
  streamText: string
  thinking: string
  onAnalyze: () => void
}

const QUALITY_TYPE_LABELS: Record<string, string> = {
  null: '空值',
  duplicate: '重复值',
  outlier: '异常值',
  format: '格式问题'
}

function DataQualityTab(p: DataQualityTabProps): React.ReactElement {
  return (
    <div className="p-3 space-y-3">
      {!p.hasResult ? <NoResultWarning /> : (
        <button onClick={p.onAnalyze} disabled={p.loading}
          className="w-full text-sm py-1.5 rounded bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 font-medium">
          {p.loading ? '分析中...' : <><Microscope className="w-3 h-3 inline mr-1 align-middle" />AI 数据质量分析</>}
        </button>
      )}

      {p.loading && p.thinking && <ThinkingBox text={p.thinking} />}
      {p.loading && p.streamText && <StreamingBox text={p.streamText} />}

      {p.response && (
        <div className="space-y-2">
          {p.response.summary && (
            <InfoBox color="blue" title={<><BarChart3 className="w-3 h-3 inline mr-1 align-middle" />质量总结</>}>
              <MarkdownRenderer content={p.response.summary} />
            </InfoBox>
          )}
          {p.response.issues.length === 0 ? (
            <div className="text-xs text-green-600 bg-green-50 dark:bg-green-900/20 rounded p-2"><CheckCircle className="w-3 h-3 inline mr-1 align-middle" />未发现明显数据质量问题</div>
          ) : (
            p.response.issues.map((issue, i) => (
              <div key={i} className="text-xs bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-2 space-y-0.5">
                <div className="flex items-center gap-2 font-medium text-yellow-700 dark:text-yellow-400">
                  <span className="px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/40">{QUALITY_TYPE_LABELS[issue.type] ?? issue.type}</span>
                  <span className="font-mono">{issue.column}</span>
                  <span className="ml-auto text-yellow-500">~{issue.count} 行</span>
                </div>
                <div className="text-yellow-600 dark:text-yellow-300">{issue.description}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── History Tab ───────────────────────────────────────────────

interface HistoryTabProps {
  history: QueryHistory[]
  historySearch: string
  setHistorySearch: (v: string) => void
  historyLoading: boolean
  onLoadHistory: () => void
  onUseSQL: (sql: string) => void
  onDeleteHistory: (id: number) => void
  onClearHistory: () => void
}

function HistoryTab(p: HistoryTabProps): React.ReactElement {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <input
          className="flex-1 text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none"
          placeholder="搜索 SQL..."
          value={p.historySearch}
          onChange={e => p.setHistorySearch(e.target.value)}
        />
        <button onClick={p.onLoadHistory} className="text-xs text-gray-400 hover:text-green-500" title="刷新"><RefreshCw className="w-3 h-3 inline" /></button>
        {p.history.length > 0 && (
          <button onClick={p.onClearHistory} className="text-xs text-red-400 hover:text-red-600">清空</button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {p.historyLoading && <div className="text-center text-xs text-gray-400 py-8">加载中...</div>}
        {!p.historyLoading && p.history.length === 0 && (
          <div className="text-center text-xs text-gray-400 py-8">暂无历史记录</div>
        )}
        {p.history.map(h => (
          <div key={h.id} className="group px-3 py-2 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
            <div className="flex items-start justify-between gap-2">
              <pre className="text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-all flex-1 leading-relaxed line-clamp-3">{h.sql}</pre>
              <div className="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => p.onUseSQL(h.sql)}
                  className="text-xs px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 hover:bg-green-200">使用</button>
                <button onClick={() => p.onDeleteHistory(h.id)}
                  className="text-xs px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-500 hover:bg-red-200"><X className="w-3 h-3" /></button>
              </div>
            </div>
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
  )
}

// ── Shared UI components ──────────────────────────────────────

interface SQLBlockProps {
  label: string
  sql: string
  meta: string
  onUse: () => void
  onExplain?: () => void
  explainLoading?: boolean
}

function SQLBlock(p: SQLBlockProps): React.ReactElement {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs text-gray-500">{p.label}</span>
        <div className="flex items-center gap-2">
          {p.meta && <span className="text-xs text-gray-400">{p.meta}</span>}
          {p.onExplain && (
            <button onClick={p.onExplain} disabled={p.explainLoading}
              className="text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50">
              {p.explainLoading ? '解释中...' : '解释'}
            </button>
          )}
          <button onClick={p.onUse}
            className="text-xs px-2 py-0.5 rounded bg-green-600 text-white hover:bg-green-700">使用</button>
        </div>
      </div>
      <pre className="text-xs font-mono p-3 overflow-x-auto whitespace-pre-wrap">{p.sql}</pre>
    </div>
  )
}

type InfoBoxColor = 'gray' | 'blue' | 'amber' | 'red' | 'green'

const INFO_BOX_STYLES: Record<InfoBoxColor, { wrapper: string; title: string }> = {
  gray: { wrapper: 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700', title: 'text-gray-600 dark:text-gray-400' },
  blue: { wrapper: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800', title: 'text-green-700 dark:text-green-400' },
  amber: { wrapper: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800', title: 'text-amber-700 dark:text-amber-400' },
  red: { wrapper: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800', title: 'text-red-700 dark:text-red-400' },
  green: { wrapper: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800', title: 'text-green-700 dark:text-green-400' }
}

function InfoBox({ color, title, children }: { color: InfoBoxColor; title: React.ReactNode; children: React.ReactNode }): React.ReactElement {
  const s = INFO_BOX_STYLES[color]
  return (
    <div className={`rounded border p-2 ${s.wrapper}`}>
      <div className={`text-xs font-medium mb-1 ${s.title}`}>{title}</div>
      <div className="text-xs">{children}</div>
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

/** Collapsible thinking process box */
function ThinkingBox({ text }: { text: string }): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false)
  return (
    <div className="rounded border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 text-xs">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded transition-colors"
      >
        <span className="inline-block w-3 h-3 border-2 border-purple-400 rounded-full animate-pulse flex-shrink-0" />
        <span className="font-medium flex-1 text-left">思考过程</span>
        <span className="opacity-60">{expanded ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />}</span>
      </button>
      {expanded && (
        <div className="px-2 pb-2 text-purple-700 dark:text-purple-300 font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto leading-relaxed border-t border-purple-200 dark:border-purple-800 pt-1.5">
          {text}
        </div>
      )}
    </div>
  )
}

/** Inline streaming text preview box */
function StreamingBox({ text }: { text: string }): React.ReactElement {
  return (
    <div className="text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-2 font-mono whitespace-pre-wrap break-all max-h-40 overflow-y-auto text-gray-600 dark:text-gray-300">
      {text}<span className="inline-block w-1.5 h-3 bg-green-500 animate-pulse ml-0.5 align-middle" />
    </div>
  )
}

/** Animated dots for "waiting for first token" */
function StreamingDots(): React.ReactElement {
  return (
    <span className="inline-flex gap-1 items-center text-gray-400">
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
    </span>
  )
}
