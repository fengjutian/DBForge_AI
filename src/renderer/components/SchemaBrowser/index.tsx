import React, { useEffect, useState, useCallback, useRef } from 'react'
import type { DatabaseSchema, DatabaseInfo, TableInfo } from '../../../shared/types'
import { useConnectionStore } from '../../store/connectionStore'
import { useEditorStore } from '../../store/editorStore'
import ERDiagram from '../ERDiagram'
import TableAnalysisModal, { type AnalysisType } from '../TableAnalysisModal'
import JoinBuilder from '../JoinBuilder'

interface ContextMenu { x: number; y: number; type: 'table'; tableId: string; dbName: string; tableName: string }
interface DbContextMenu { x: number; y: number; dbName: string }
interface Tooltip { x: number; y: number; text: string }

export default function SchemaBrowser(): React.ReactElement {
  const { activeConnectionId } = useConnectionStore()
  const { openPreviewTab, updatePreviewTab, addTab, updateContent } = useEditorStore()
  const [schema, setSchema] = useState<DatabaseSchema | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<ContextMenu | null>(null)
  const [dbMenu, setDbMenu] = useState<DbContextMenu | null>(null)
  const [tooltip, setTooltip] = useState<Tooltip | null>(null)
  const [erDiagram, setErDiagram] = useState<{ dbName: string; tableName: string } | null>(null)
  const [erDiagramAll, setErDiagramAll] = useState<{ dbName: string } | null>(null)
  const [analysis, setAnalysis] = useState<{ dbName: string; tableName: string; type: AnalysisType } | null>(null)
  const [joinBuilder, setJoinBuilder] = useState<{ dbName: string } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const fetchSchema = useCallback(async (id: string) => {
    setLoading(true)
    try {
      const s = await window.electronAPI.schema.fetch(id)
      setSchema(s)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeConnectionId) fetchSchema(activeConnectionId)
    else setSchema(null)
  }, [activeConnectionId, fetchSchema])

  const toggle = (key: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })

  const handleContextMenu = (e: React.MouseEvent, db: DatabaseInfo, table: TableInfo) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, type: 'table', tableId: `${db.name}.${table.name}`, dbName: db.name, tableName: table.name })
  }

  const handleDbContextMenu = (e: React.MouseEvent, db: DatabaseInfo) => {
    e.preventDefault()
    e.stopPropagation()
    setDbMenu({ x: e.clientX, y: e.clientY, dbName: db.name })
  }

  const closeDbMenu = () => setDbMenu(null)

  const closeMenu = () => setMenu(null)

  const showTooltip = (e: React.MouseEvent, text: string) => {
    const el = e.currentTarget as HTMLElement
    if (el.scrollWidth > el.clientWidth) {
      setTooltip({ x: e.clientX, y: e.clientY, text })
    }
  }

  const closeTooltip = () => setTooltip(null)

  const handlePreview = async () => {
    if (!menu || !activeConnectionId) return
    closeMenu()
    const { dbName, tableName } = menu
    const previewKey = `${dbName}.${tableName}`
    const tabId = openPreviewTab(previewKey, `⊞ ${tableName}`, activeConnectionId)
    updatePreviewTab(tabId, { previewStatus: 'running', previewError: null })
    try {
      const [countResult, dataResult] = await Promise.all([
        window.electronAPI.query.execute({
          connectionId: activeConnectionId,
          sql: `SELECT COUNT(*) AS __total FROM \`${dbName}\`.\`${tableName}\``,
          queryId: `preview_count_${tabId}`
        }),
        window.electronAPI.query.execute({
          connectionId: activeConnectionId,
          sql: `SELECT * FROM \`${dbName}\`.\`${tableName}\` LIMIT 100 OFFSET 0`,
          queryId: `preview_${tabId}`
        })
      ])
      const total = Number(countResult.rows[0]?.['__total'] ?? 0)
      updatePreviewTab(tabId, { previewResult: dataResult, previewStatus: 'idle', previewTotal: total })
    } catch (e) {
      updatePreviewTab(tabId, { previewStatus: 'error', previewError: (e as Error).message })
    }
  }

  const handleShowER = () => {
    if (!menu) return
    setErDiagram({ dbName: menu.dbName, tableName: menu.tableName })
    closeMenu()
  }

  const handleShowAllER = () => {
    if (!dbMenu) return
    setErDiagramAll({ dbName: dbMenu.dbName })
    closeDbMenu()
  }

  const handleShowJoinBuilder = (dbName: string) => {
    setJoinBuilder({ dbName })
    closeMenu()
  }

  const handleAnalysis = (type: AnalysisType) => {
    if (!menu) return
    setAnalysis({ dbName: menu.dbName, tableName: menu.tableName, type })
    closeMenu()
  }

  const handleRefresh = async () => {
    if (!activeConnectionId) return
    closeMenu()
    setLoading(true)
    try {
      const s = await window.electronAPI.schema.refresh(activeConnectionId)
      setSchema(s)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 select-none"
      onClick={closeMenu} ref={containerRef}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <span className="font-semibold text-sm">Schema 浏览器</span>
        {activeConnectionId && (
          <button onClick={handleRefresh} className="text-xs text-gray-400 hover:text-blue-500">刷新</button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto text-sm" onClick={closeMenu} onContextMenu={closeMenu}>
        {!activeConnectionId && (
          <div className="text-center text-gray-400 text-xs mt-8">请先选择一个连接</div>
        )}
        {loading && <div className="text-center text-gray-400 text-xs mt-8">加载中...</div>}
        {schema && !loading && schema.databases.map(db => (
          <div key={db.name}>
            <div
              className="flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 font-medium"
              onClick={() => toggle(db.name)}
              onContextMenu={e => handleDbContextMenu(e, db)}
              onMouseEnter={e => showTooltip(e, db.name)}
              onMouseLeave={closeTooltip}
            >
              <span className="text-gray-400">{expanded.has(db.name) ? '▾' : '▸'}</span>
              <span className="text-blue-600 dark:text-blue-400">🗄 </span>
              <span className="text-blue-600 dark:text-blue-400 truncate max-w-[150px]" title={db.name}>{db.name}</span>
              <span className="ml-auto text-xs text-gray-400">{db.tables.length}</span>
              <button
                onClick={e => { e.stopPropagation(); handleShowJoinBuilder(db.name) }}
                title="可视化 JOIN 构建器"
                className="ml-1 text-gray-400 hover:text-blue-500 text-xs px-0.5"
              >🔗</button>
            </div>
            {expanded.has(db.name) && db.tables.map(table => (
              <div key={table.name}>
                <div className="flex items-center gap-1 pl-5 pr-2 py-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => toggle(`${db.name}.${table.name}`)}
                  onContextMenu={e => { e.stopPropagation(); handleContextMenu(e, db, table) }}>
                  <span className="text-gray-400">{expanded.has(`${db.name}.${table.name}`) ? '▾' : '▸'}</span>
                  <span>📋 {table.name}</span>
                  {table.rowCount !== undefined && (
                    <span className="ml-auto text-xs text-gray-400">{table.rowCount.toLocaleString()} 行</span>
                  )}
                </div>
                {expanded.has(`${db.name}.${table.name}`) && (
                  <div className="pl-10">
                    {table.columns.map(col => (
                      <div key={col.name} className="flex items-center gap-2 py-0.5 px-2 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">
                        {table.primaryKeys.includes(col.name) ? '🔑' : '○'}
                        <span className="font-mono">{col.name}</span>
                        <span className="text-gray-400">{col.type}</span>
                        {!col.nullable && <span className="text-red-400 text-xs">NOT NULL</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Context menu */}
      {menu && (
        <div className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg py-1 text-sm min-w-[180px]"
          style={{ left: menu.x, top: menu.y }}
          onClick={e => e.stopPropagation()}>
          <button onClick={handlePreview} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            ⊞ 预览数据
          </button>
          <button onClick={handleShowER} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            🔀 查看 ER 图
          </button>
          <button onClick={() => menu && handleShowJoinBuilder(menu.dbName)} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            🔗 可视化 JOIN 构建器
          </button>
          <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
          <div className="px-4 py-1 text-xs text-gray-400 font-medium">AI 分析</div>
          <button onClick={() => handleAnalysis('dependencies')} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            🔗 依赖关系图
          </button>
          <button onClick={() => handleAnalysis('data-dict')} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            📖 数据字典
          </button>
          <button onClick={() => handleAnalysis('indexes')} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            ⚡ 索引分析
          </button>
          <button onClick={() => handleAnalysis('query-perf')} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            📊 查询性能分析
          </button>
          <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
          <button onClick={handleRefresh} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            ↻ 刷新 Schema
          </button>
        </div>
      )}

      {/* Database context menu */}
      {dbMenu && (
        <div className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg py-1 text-sm min-w-[180px]"
          style={{ left: dbMenu.x, top: dbMenu.y }}
          onClick={e => e.stopPropagation()}>
          <button onClick={() => dbMenu && handleShowJoinBuilder(dbMenu.dbName)} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            🔗 可视化 JOIN 构建器
          </button>
          <button onClick={handleShowAllER} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            🔀 查看所有表 ER 图
          </button>
          <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
          <button onClick={() => { closeDbMenu(); handleRefresh() }} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            ↻ 刷新 Schema
          </button>
        </div>
      )}

      {tooltip && (
        <div className="fixed z-50 px-2 py-1 text-xs bg-gray-800 text-white rounded shadow-lg pointer-events-none max-w-[300px] break-all"
          style={{ left: tooltip.x + 10, top: tooltip.y + 10 }}>
          {tooltip.text}
        </div>
      )}

      {/* ER Diagram modal */}
      {erDiagram && schema && (() => {
        const db = schema.databases.find(d => d.name === erDiagram.dbName)
        return db ? (
          <ERDiagram
            db={db}
            focusTable={erDiagram.tableName}
            onClose={() => setErDiagram(null)}
          />
        ) : null
      })()}

      {/* All Tables ER Diagram modal */}
      {erDiagramAll && schema && (() => {
        const db = schema.databases.find(d => d.name === erDiagramAll.dbName)
        return db ? (
          <ERDiagram
            db={db}
            onClose={() => setErDiagramAll(null)}
          />
        ) : null
      })()}

      {/* Table Analysis modal */}
      {analysis && activeConnectionId && (
        <TableAnalysisModal
          connectionId={activeConnectionId}
          dbName={analysis.dbName}
          tableName={analysis.tableName}
          type={analysis.type}
          onClose={() => setAnalysis(null)}
        />
      )}

      {/* JOIN Builder modal */}
      {joinBuilder && schema && (() => {
        const db = schema.databases.find(d => d.name === joinBuilder.dbName)
        return db ? (
          <JoinBuilder
            db={db}
            onClose={() => setJoinBuilder(null)}
            onInsertSQL={sql => {
              addTab({ connectionId: activeConnectionId, title: 'JOIN 查询', content: sql, isDirty: true })
              setJoinBuilder(null)
            }}
          />
        ) : null
      })()}
    </div>
  )
}
