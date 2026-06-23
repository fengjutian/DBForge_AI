import React, { useRef, useCallback, useEffect } from 'react'
import { Play, Bot, AlertTriangle } from 'lucide-react'
import Editor, { OnMount, BeforeMount } from '@monaco-editor/react'
import { useEditorStore } from '../../store/editorStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useResultStore } from '../../store/resultStore'
import { useConnectionStore } from '../../store/connectionStore'
import { useSessionStore } from '../../store/sessionStore'
import { setupInlineAIPrompt } from './InlineAIPrompt'

/** Map database type to Monaco editor language ID */
function dbTypeToLang(dbType?: string): string {
  if (dbType === 'postgresql') return 'pgsql'
  if (dbType === 'sqlite') return 'sql'
  if (dbType === 'mysql') return 'mysql'
  return 'sql'
}
import { formatSQL } from '../../utils/sqlFormatter'
import type { QueryResult } from '../../../shared/types'

interface SQLEditorProps {
  tabId: string
}

/**
 * Split a SQL string into individual statements.
 * 1. Split by semicolons (ignoring those inside strings/comments).
 * 2. If no semicolons found, fall back to splitting by blank lines.
 */
function splitStatements(sql: string): string[] {
  const bySemicolon = splitBySemicolon(sql)
  if (bySemicolon.length > 1) return bySemicolon
  return sql
    .split(/\r?\n(?:\s*\r?\n)+/)
    .map(s => s.trim())
    .filter(Boolean)
}

function splitBySemicolon(sql: string): string[] {
  const stmts: string[] = []
  let current = ''
  let inSingleQuote = false
  let inDoubleQuote = false
  let inLineComment = false
  let inBlockComment = false
  let i = 0

  while (i < sql.length) {
    const ch = sql[i]
    const next = sql[i + 1]
    if (inLineComment) {
      current += ch; if (ch === '\n') inLineComment = false; i++; continue
    }
    if (inBlockComment) {
      current += ch
      if (ch === '*' && next === '/') { current += next; i += 2; inBlockComment = false; continue }
      i++; continue
    }
    if (!inSingleQuote && !inDoubleQuote && ch === '-' && next === '-') {
      inLineComment = true; current += ch; i++; continue
    }
    if (!inSingleQuote && !inDoubleQuote && ch === '/' && next === '*') {
      inBlockComment = true; current += ch; i++; continue
    }
    if (ch === "'" && !inDoubleQuote) { inSingleQuote = !inSingleQuote; current += ch; i++; continue }
    if (ch === '"' && !inSingleQuote) { inDoubleQuote = !inDoubleQuote; current += ch; i++; continue }
    if (ch === ';' && !inSingleQuote && !inDoubleQuote) {
      const t = current.trim(); if (t) stmts.push(t); current = ''; i++; continue
    }
    current += ch; i++
  }
  const t = current.trim(); if (t) stmts.push(t)
  return stmts
}

export default function SQLEditor({ tabId }: SQLEditorProps): React.ReactElement {
  const { tabs, updateContent, setPendingExplainSQL } = useEditorStore()
  const { connections, activeConnectionId } = useConnectionStore()
  const conn = connections.find(c => c.id === activeConnectionId)
  const connLang = dbTypeToLang(conn?.databaseType)
  const { config } = useSettingsStore()
  const { setResult, setStatus, setQueryId, setErrorSql } = useResultStore()
  const { getSchema } = useSessionStore()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null)

  // Always-current refs so Monaco action closures never capture stale values
  const activeConnectionIdRef = useRef(activeConnectionId)
  const databaseTypeRef = useRef(conn?.databaseType)
  const tabIdRef = useRef(tabId)
  const setResultRef = useRef(setResult)
  const setStatusRef = useRef(setStatus)
  const setQueryIdRef = useRef(setQueryId)
  const setErrorSqlRef = useRef(setErrorSql)
  const setPendingExplainSQLRef = useRef(setPendingExplainSQL)
  // Cleanup for inline AI prompt
  const inlineAICleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => { activeConnectionIdRef.current = activeConnectionId }, [activeConnectionId])
  useEffect(() => { databaseTypeRef.current = conn?.databaseType }, [conn?.databaseType])
  useEffect(() => { tabIdRef.current = tabId }, [tabId])
  useEffect(() => { setResultRef.current = setResult }, [setResult])
  useEffect(() => { setStatusRef.current = setStatus }, [setStatus])
  useEffect(() => { setQueryIdRef.current = setQueryId }, [setQueryId])
  useEffect(() => { setErrorSqlRef.current = setErrorSql }, [setErrorSql])
  useEffect(() => { setPendingExplainSQLRef.current = setPendingExplainSQL }, [setPendingExplainSQL])

  // Cleanup inline AI prompt on unmount
  useEffect(() => {
    return () => {
      inlineAICleanupRef.current?.()
      inlineAICleanupRef.current = null
    }
  }, [])

  /** Get schema from the session store (stable ref-safe getter) */
  const fetchSchema = useCallback(() => {
    const connId = activeConnectionIdRef.current
    if (!connId) return undefined
    return getSchema(connId) ?? undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getSchema])

  /** Call AI text-to-sql via preload API */
  const callTextToSQL = useCallback(
    async (params: {
      naturalLanguage: string
      schema: import('../../../shared/types').DatabaseSchema
      connectionId: string
      databaseType?: string
    }) => {
      return window.electronAPI.ai.textToSQL({
        naturalLanguage: params.naturalLanguage,
        schema: params.schema,
        connectionId: params.connectionId,
        databaseType: params.databaseType as import('../../../shared/types').DatabaseType | undefined
      })
    },
    []
  )

  const tab = tabs.find(t => t.id === tabId)
  const isDark = config?.theme === 'dark' ||
    (config?.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  // Core runner —reads from refs so it's safe to call from Monaco closures
  const runSQLRef = useRef(async (sql: string) => {
    const connectionId = activeConnectionIdRef.current
    if (!connectionId || !sql.trim()) return

    try {
      const check = await window.electronAPI.query.dangerousCheck(sql)
      if (check.isDangerous) {
        const reasons = check.reasons.join('\n• ')
        const confirmed = window.confirm(
          `危险操作警告\n\n检测到以下风险：\n• ${reasons}\n\n此操作可能修改或删除数据，是否继续执行？`
        )
        if (!confirmed) return
      }
    } catch { /* proceed */ }

    const statements = splitStatements(sql)
    if (statements.length === 0) return

    const queryId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    setQueryIdRef.current(queryId)
    setStatusRef.current('running')

    try {
      let lastResult: QueryResult | null = null
      let totalAffected = 0

      for (const stmt of statements) {
        const result = await window.electronAPI.query.execute({
          connectionId,
          sql: stmt,
          queryId
        })
        if (result.columns.length > 0) {
          lastResult = result
        } else {
          totalAffected += result.affectedRows ?? 0
          lastResult = result
        }
      }

      if (lastResult) {
        if (lastResult.columns.length === 0 && statements.length > 1) {
          lastResult = { ...lastResult, affectedRows: totalAffected }
        }
        setResultRef.current(lastResult, connectionId)
      }
    } catch (e) {
      setErrorSqlRef.current(stmt)
      setStatusRef.current('error', (e as Error).message)
    } finally {
      setQueryIdRef.current(null)
    }
  })

  // Keep runSQLRef in sync with latest deps (activeConnectionId etc.)
  useEffect(() => {
    runSQLRef.current = async (sql: string) => {
      const connectionId = activeConnectionIdRef.current
      if (!connectionId || !sql.trim()) return

      try {
        const check = await window.electronAPI.query.dangerousCheck(sql)
        if (check.isDangerous) {
          const reasons = check.reasons.join('\n• ')
          const confirmed = window.confirm(
            `危险操作警告\n\n检测到以下风险：\n• ${reasons}\n\n此操作可能修改或删除数据，是否继续执行？`
          )
          if (!confirmed) return
        }
      } catch { /* proceed */ }

      const statements = splitStatements(sql)
      if (statements.length === 0) return

      const queryId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      setQueryIdRef.current(queryId)
      setStatusRef.current('running')

      try {
        let lastResult: QueryResult | null = null
        let totalAffected = 0

        for (const stmt of statements) {
          const result = await window.electronAPI.query.execute({
            connectionId,
            sql: stmt,
            queryId
          })
          if (result.columns.length > 0) {
            lastResult = result
          } else {
            totalAffected += result.affectedRows ?? 0
            lastResult = result
          }
        }

        if (lastResult) {
          if (lastResult.columns.length === 0 && statements.length > 1) {
            lastResult = { ...lastResult, affectedRows: totalAffected }
          }
          setResultRef.current(lastResult)
        }
      } catch (e) {
        setErrorSqlRef.current(stmt)
        setStatusRef.current('error', (e as Error).message)
      } finally {
        setQueryIdRef.current(null)
      }
    }
  }, [activeConnectionId])

  /** Execute all SQL in the editor —used by toolbar button */
  const executeQuery = useCallback(async () => {
    const sql = editorRef.current?.getModel()?.getValue() ?? ''
    await runSQLRef.current(sql)
  }, [])

  /** Execute selected text —used by toolbar button */
  const executeSelected = useCallback(async () => {
    if (!editorRef.current) return
    const selection = editorRef.current.getSelection()
    const selected = editorRef.current.getModel()?.getValueInRange(selection)?.trim()
    if (!selected) return
    await runSQLRef.current(selected)
  }, [])

  const formatQuery = useCallback(() => {
    if (!editorRef.current) return
    const model = editorRef.current.getModel()
    if (!model) return
    model.setValue(formatSQL(model.getValue()))
  }, [])

  // Define custom themes BEFORE editor mounts
  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    monaco.editor.defineTheme('dbforge-light', {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#F1F8E9',
        'editor.foreground': '#1B5E20',
        'editor.lineHighlightBackground': '#E8F5E9',
        'editor.selectionBackground': '#C8E6C9',
        'editorCursor.foreground': '#2E7D32',
        'editorLineNumber.foreground': '#81C784',
        'editorLineNumber.activeForeground': '#2E7D32',
      }
    })

    monaco.editor.defineTheme('dbforge-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#1A0E00',
        'editor.foreground': '#FFECB3',
        'editor.lineHighlightBackground': '#2D1A00',
        'editor.selectionBackground': '#5D4037',
        'editorCursor.foreground': '#FFB74D',
        'editorLineNumber.foreground': '#6D4C41',
        'editorLineNumber.activeForeground': '#FFCC80',
      }
    })
  }, [])

  // Monaco actions are registered once; they call through refs to always get fresh state
  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      runSQLRef.current(editor.getModel()?.getValue() ?? '')
    })
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
      () => {
        const sel = editor.getSelection()
        const selected = editor.getModel()?.getValueInRange(sel!)?.trim()
        if (selected) runSQLRef.current(selected)
      }
    )
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
      const model = editor.getModel()
      if (model) model.setValue(formatSQL(model.getValue()))
    })

    editor.addAction({
      id: 'execute-selected-sql',
      label: '> 执行选中 SQL',
      contextMenuGroupId: '1_modification',
      contextMenuOrder: 1,
      precondition: 'editorHasSelection',
      run: (ed) => {
        const sel = ed.getSelection()
        const selected = ed.getModel()?.getValueInRange(sel!)?.trim()
        if (selected) runSQLRef.current(selected)
      }
    })

    editor.addAction({
      id: 'ai-explain-sql',
      label: '[AI] 使用 AI 解释 SQL',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.5,
      precondition: 'editorHasSelection',
      run: (ed) => {
        const selected = ed.getModel()?.getValueInRange(ed.getSelection()!)?.trim()
        if (selected) setPendingExplainSQLRef.current(selected)
      }
    })

    monaco.languages.setLanguageConfiguration('sql', {
      comments: { lineComment: '--', blockComment: ['/*', '*/'] }
    })

    // ── Inline AI slash command ──
    inlineAICleanupRef.current = setupInlineAIPrompt({
      editor,
      monaco,
      activeConnectionIdRef,
      databaseTypeRef,
      fetchSchema,
      callTextToSQL
    })
  // handleMount only runs once on mount —all state access goes through refs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!tab) return <div />

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-green-200 dark:border-amber-800 bg-green-50 dark:bg-amber-950">
        <button onClick={executeQuery}
          className="text-xs px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700 font-medium">
          <Play className="w-3 h-3 inline mr-1 fill-current" />执行全部 <span className="opacity-60 ml-1">Ctrl+Enter</span>
        </button>
        <button onClick={formatQuery}
          className="text-xs px-3 py-1 rounded border border-green-300 dark:border-amber-700 hover:bg-green-100 dark:hover:bg-amber-900">
          格式化<span className="opacity-60 ml-1">Ctrl+K</span>
        </button>
        {!activeConnectionId && (
          <span className="text-xs text-yellow-500 ml-2"><AlertTriangle className="w-3 h-3 inline mr-1 align-middle" />未选择连接</span>
        )}
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          language={connLang}
          theme={isDark ? 'dbforge-dark' : 'dbforge-light'}
          value={tab.content}
          onChange={val => updateContent(tabId, val ?? '')}
          onMount={handleMount}
          beforeMount={handleBeforeMount}
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
            automaticLayout: true,
            suggestOnTriggerCharacters: true,
            overviewRulerBorder: false
          }}
        />
      </div>
    </div>
  )
}
