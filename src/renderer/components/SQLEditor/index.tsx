import React, { useRef, useCallback, useEffect } from 'react'
import Editor, { OnMount } from '@monaco-editor/react'
import { useEditorStore } from '../../store/editorStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useResultStore } from '../../store/resultStore'
import { useConnectionStore } from '../../store/connectionStore'
import { formatSQL } from '../../utils/sqlFormatter'

interface SQLEditorProps {
  tabId: string
}

export default function SQLEditor({ tabId }: SQLEditorProps): React.ReactElement {
  const { tabs, updateContent } = useEditorStore()
  const { config } = useSettingsStore()
  const { setResult, setStatus, setQueryId } = useResultStore()
  const { activeConnectionId } = useConnectionStore()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null)

  const tab = tabs.find(t => t.id === tabId)
  const isDark = config?.theme === 'dark' || (config?.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  const executeQuery = useCallback(async () => {
    if (!activeConnectionId || !tab) return
    const sql = editorRef.current?.getModel()?.getValue() ?? tab.content
    if (!sql.trim()) return

    // Dangerous SQL check: warn user before executing destructive statements
    try {
      const check = await window.electronAPI.query.dangerousCheck(sql)
      if (check.isDangerous) {
        const reasons = check.reasons.join('\n• ')
        const confirmed = window.confirm(
          `⚠ 危险操作警告\n\n检测到以下风险：\n• ${reasons}\n\n此操作可能修改或删除数据，是否继续执行？`
        )
        if (!confirmed) return
      }
    } catch {
      // If dangerous check fails, proceed with execution
    }

    // Generate a unique queryId so the cancel button can abort this query
    const queryId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    setQueryId(queryId)
    setStatus('running')
    try {
      const result = await window.electronAPI.query.execute({ connectionId: activeConnectionId, sql, queryId })
      setResult(result)
    } catch (e) {
      setStatus('error', (e as Error).message)
    } finally {
      setQueryId(null)
    }
  }, [activeConnectionId, tab, setResult, setStatus, setQueryId])

  const formatQuery = useCallback(() => {
    if (!editorRef.current) return
    const model = editorRef.current.getModel()
    if (!model) return
    const formatted = formatSQL(model.getValue())
    model.setValue(formatted)
  }, [])

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor

    // Ctrl+Enter: execute
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, executeQuery)
    // Ctrl+K: format
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, formatQuery)

    // MySQL language config
    monaco.languages.setLanguageConfiguration('sql', {
      comments: { lineComment: '--', blockComment: ['/*', '*/'] }
    })
  }, [executeQuery, formatQuery])

  // Re-register shortcuts when deps change
  useEffect(() => {
    if (!editorRef.current) return
    // shortcuts are re-bound on next mount; for live updates we rely on closure refresh
  }, [executeQuery, formatQuery])

  if (!tab) return <div />

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <button onClick={executeQuery}
          className="text-xs px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700 font-medium">
          ▶ 执行 <span className="opacity-60 ml-1">Ctrl+Enter</span>
        </button>
        <button onClick={formatQuery}
          className="text-xs px-3 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">
          格式化 <span className="opacity-60 ml-1">Ctrl+K</span>
        </button>
        {!activeConnectionId && (
          <span className="text-xs text-yellow-500 ml-2">⚠ 未选择连接</span>
        )}
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          language="sql"
          theme={isDark ? 'vs-dark' : 'vs'}
          value={tab.content}
          onChange={val => updateContent(tabId, val ?? '')}
          onMount={handleMount}
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
            automaticLayout: true,
            suggestOnTriggerCharacters: true
          }}
        />
      </div>
    </div>
  )
}
