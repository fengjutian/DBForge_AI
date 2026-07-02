import React, { useEffect, useState, useCallback, useRef } from 'react'
import { ChevronRight, Database, Table2, Key, Circle, Link2, RefreshCw, FileText, GitFork, Clipboard, BookOpen, Zap, BarChart3, HardDrive, Eye, Layers, Code2, Play, Clock, Calculator } from 'lucide-react'
import type { DatabaseSchema, DatabaseInfo, TableInfo } from '@dbforge/shared'
import { useConnectionStore } from '../../store/connectionStore'
import { useSessionStore } from '../../store/sessionStore'
import { useEditorStore } from '../../store/editorStore'
import ERDiagram from '../ERDiagram'
import TableAnalysisModal, { type AnalysisType } from '../TableAnalysisModal'
import JoinBuilder from '../JoinBuilder'
import StorageDashboard from '../StorageDashboard'

interface ContextMenu { x: number; y: number; type: 'table'; tableId: string; dbName: string; tableName: string }
interface DbContextMenu { x: number; y: number; dbName: string }
interface Tooltip { x: number; y: number; text: string }

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export default function SchemaBrowser(): React.ReactElement {
  const { activeConnectionId } = useConnectionStore()
  const { refreshSchema, getSchema } = useSessionStore()
  const { openPreviewTab, updatePreviewTab, addTab, updateContent, openFormulaViewTab } = useEditorStore()
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<ContextMenu | null>(null)
  const [dbMenu, setDbMenu] = useState<DbContextMenu | null>(null)
  const [tooltip, setTooltip] = useState<Tooltip | null>(null)
  const [erDiagram, setErDiagram] = useState<{ dbName: string; tableName: string } | null>(null)
  const [erDiagramAll, setErDiagramAll] = useState<{ dbName: string } | null>(null)
  const [analysis, setAnalysis] = useState<{ dbName: string; tableName: string; type: AnalysisType } | null>(null)
  const [joinBuilder, setJoinBuilder] = useState<{ dbName: string } | null>(null)
  const [storageDashboard, setStorageDashboard] = useState<{ dbName: string } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // ── Row count / storage size toggle ──
  const [showStorage, setShowStorage] = useState(false)

  const toggle = useCallback((key: string) => {
    setExpanded(prev => {
      const s = new Set(prev)
      if (s.has(key)) s.delete(key)
      else s.add(key)
      return s
    })
  }, [])

  // Schema comes from the global session — no local fetch needed
  const schema: DatabaseSchema | null = activeConnectionId ? getSchema(activeConnectionId) : null

  const handleDbToggle = (dbName: string) => {
    setExpanded(prev => {
      const s = new Set(prev)
      if (s.has(dbName)) {
        s.delete(dbName)
      } else {
        s.add(dbName)
        s.add(`${dbName}__tables`) // auto-expand tables section
      }
      return s
    })
  }

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

  // ── Close context menus when clicking outside ────────────
  useEffect(() => {
    if (!menu && !dbMenu) return
    const handler = () => {
      setMenu(null)
      setDbMenu(null)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [menu, dbMenu])

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

  const handleFormulaView = async () => {
    if (!menu || !activeConnectionId) return
    closeMenu()
    const { dbName, tableName } = menu
    const previewKey = `${dbName}.${tableName}`
    const tabId = openFormulaViewTab(previewKey, `📊 ${tableName}`, activeConnectionId)
    updatePreviewTab(tabId, { previewStatus: 'running', previewError: null })
    try {
      const [countResult, dataResult] = await Promise.all([
        window.electronAPI.query.execute({
          connectionId: activeConnectionId,
          sql: `SELECT COUNT(*) AS __total FROM \`${dbName}\`.\`${tableName}\``,
          queryId: `formula_count_${tabId}`
        }),
        window.electronAPI.query.execute({
          connectionId: activeConnectionId,
          sql: `SELECT * FROM \`${dbName}\`.\`${tableName}\` LIMIT 1000 OFFSET 0`,
          queryId: `formula_${tabId}`
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

  const handleCopyStructure = () => {
    if (!menu || !schema) return
    const db = schema.databases.find(d => d.name === menu.dbName)
    const table = db?.tables.find(t => t.name === menu.tableName)
    if (!table) return
    const header = '列名\t类型\t允许NULL\t默认值\t注释'
    const rows = table.columns.map(c =>
      `${c.name}\t${c.type}\t${c.nullable ? 'YES' : 'NO'}\t${c.defaultValue ?? ''}\t${c.comment ?? ''}`
    )
    const text = [header, ...rows].join('\n')
    navigator.clipboard.writeText(text).catch(() => {})
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
      await refreshSchema(activeConnectionId)
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowStorage(s => !s)}
            title={showStorage ? '切换为行数显示' : '切换为存储占用显示'}
            className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${
              showStorage
                ? 'border-amber-400 text-amber-600 bg-amber-50 dark:bg-amber-900/20'
                : 'border-gray-300 text-gray-400 hover:text-gray-600 dark:border-gray-600'
            }`}
          >
            {showStorage ? '📦 占用' : '📊 行数'}
          </button>
          {activeConnectionId && (
            <button onClick={handleRefresh} className="text-xs text-gray-400 hover:text-green-500">刷新</button>
          )}
        </div>
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
              onClick={() => handleDbToggle(db.name)}
              onContextMenu={e => handleDbContextMenu(e, db)}
              onMouseEnter={e => showTooltip(e, db.name)}
              onMouseLeave={closeTooltip}
            >
              <ChevronRight size={14} className={`text-gray-400 transition-transform ${expanded.has(db.name) ? 'rotate-90' : ''}`} />
              <Database size={16} className="text-green-600 dark:text-green-400 shrink-0" />
              <span className="text-green-600 dark:text-green-400 truncate max-w-[150px]" title={db.name}>{db.name}</span>
              <span className="ml-auto text-xs text-gray-400">{db.tables.length + (db.views?.length ?? 0) + (db.indexes?.length ?? 0) + (db.procedures?.length ?? 0) + (db.triggers?.length ?? 0) + (db.events?.length ?? 0)}</span>
              <button
                onClick={e => { e.stopPropagation(); handleShowJoinBuilder(db.name) }}
                title="可视化 JOIN 构建器"
                className="ml-1 text-gray-400 hover:text-green-500 p-0.5"
              ><Link2 size={12} /></button>
            </div>
            {expanded.has(db.name) && (
              <>
                {/* ── Tables ── */}
                {db.tables.length > 0 && (
                  <>
                    <div className="flex items-center gap-1 pl-5 pr-2 py-0.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 text-xs text-gray-400 font-medium"
                      onClick={() => toggle(`${db.name}__tables`)}>
                      <ChevronRight size={12} className={`transition-transform ${expanded.has(`${db.name}__tables`) ? 'rotate-90' : ''}`} />
                      <Table2 size={12} className="text-blue-500 shrink-0" />
                      <span className="text-blue-500">表</span>
                      <span className="ml-auto">{db.tables.length}</span>
                    </div>
                    {expanded.has(`${db.name}__tables`) && db.tables.map(table => (
              <div key={table.name}>
                <div className="flex items-center gap-1 pl-5 pr-2 py-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => toggle(`${db.name}.${table.name}`)}
                  onContextMenu={e => { e.stopPropagation(); handleContextMenu(e, db, table) }}>
                  <ChevronRight size={14} className={`text-gray-400 transition-transform shrink-0 ${expanded.has(`${db.name}.${table.name}`) ? 'rotate-90' : ''}`} />
                  <Table2 size={14} className="text-blue-500 shrink-0" /><span className="truncate max-w-[200px]" title={table.name} onMouseEnter={e => showTooltip(e, table.name)} onMouseLeave={closeTooltip}>{table.name}</span>
                  {showStorage
                    ? (table.dataSize !== undefined && (
                        <span className="ml-auto text-xs text-amber-500">{formatBytes(table.dataSize)}</span>
                      ))
                    : (table.rowCount !== undefined && (
                        <span className="ml-auto text-xs text-gray-400">{table.rowCount.toLocaleString()} 行</span>
                      ))
                  }
                </div>
                {expanded.has(`${db.name}.${table.name}`) && (
                  <div className="pl-10">
                    {table.columns.map(col => (
                      <div key={col.name} className="flex items-center gap-2 py-0.5 px-2 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">
                        {table.primaryKeys.includes(col.name) ? <Key size={11} className="text-amber-500 shrink-0" /> : <Circle size={11} className="text-gray-400 shrink-0" />}
                        <span className="font-mono">{col.name}</span>
                        <span className="text-gray-400">{col.type}</span>
                        {!col.nullable && <span className="text-red-400 text-xs">NOT NULL</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
                ))}
                    </>
                )}

                {/* ── Views ── */}
                {db.views && db.views.length > 0 && (
                  <>
                    <div className="flex items-center gap-1 pl-5 pr-2 py-0.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 text-xs text-gray-400 font-medium"
                      onClick={() => toggle(`${db.name}__views`)}>
                      <ChevronRight size={12} className={`transition-transform ${expanded.has(`${db.name}__views`) ? 'rotate-90' : ''}`} />
                      <Eye size={12} className="text-purple-500 shrink-0" />
                      <span className="text-purple-500">视图</span>
                      <span className="ml-auto">{db.views.length}</span>
                    </div>
                    {expanded.has(`${db.name}__views`) && db.views.map(v => (
                      <div key={`view-${v.name}`} className="flex items-center gap-2 pl-10 py-0.5 px-2 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">
                        <Eye size={11} className="text-purple-400 shrink-0" />
                        <span className="font-mono">{v.name}</span>
                      </div>
                    ))}
                  </>
                )}

                {/* ── Indexes ── */}
                {db.indexes && db.indexes.length > 0 && (
                  <>
                    <div className="flex items-center gap-1 pl-5 pr-2 py-0.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 text-xs text-gray-400 font-medium"
                      onClick={() => toggle(`${db.name}__indexes`)}>
                      <ChevronRight size={12} className={`transition-transform ${expanded.has(`${db.name}__indexes`) ? 'rotate-90' : ''}`} />
                      <Layers size={12} className="text-amber-500 shrink-0" />
                      <span className="text-amber-500">索引</span>
                      <span className="ml-auto">{db.indexes.length}</span>
                    </div>
                    {expanded.has(`${db.name}__indexes`) && db.indexes.map(idx => (
                      <div key={`idx-${idx.name}`} className="flex items-center gap-2 pl-10 py-0.5 px-2 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                        onMouseEnter={e => showTooltip(e, `${idx.name} (${idx.tableName})`)}
                        onMouseLeave={closeTooltip}>
                        <Layers size={11} className={`shrink-0 ${idx.unique ? 'text-amber-500' : 'text-gray-400'}`} />
                        <span className="font-mono truncate max-w-[130px]">{idx.name}</span>
                        <span className="text-gray-400 ml-auto truncate max-w-[80px]">{idx.columns.join(', ')}</span>
                      </div>
                    ))}
                  </>
                )}

                {/* ── Stored Procedures ── */}
                {db.procedures && db.procedures.length > 0 && (
                  <>
                    <div className="flex items-center gap-1 pl-5 pr-2 py-0.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 text-xs text-gray-400 font-medium"
                      onClick={() => toggle(`${db.name}__procedures`)}>
                      <ChevronRight size={12} className={`transition-transform ${expanded.has(`${db.name}__procedures`) ? 'rotate-90' : ''}`} />
                      <Code2 size={12} className="text-blue-500 shrink-0" />
                      <span className="text-blue-500">存储过程</span>
                      <span className="ml-auto">{db.procedures.length}</span>
                    </div>
                    {expanded.has(`${db.name}__procedures`) && db.procedures.map(proc => (
                      <div key={`proc-${proc.name}`} className="flex items-center gap-2 pl-10 py-0.5 px-2 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                        onMouseEnter={e => showTooltip(e, proc.parameters ?? proc.name)}
                        onMouseLeave={closeTooltip}>
                        <Code2 size={11} className="text-blue-400 shrink-0" />
                        <span className="font-mono">{proc.name}</span>
                        {proc.parameters && <span className="text-gray-400">({proc.parameters})</span>}
                      </div>
                    ))}
                  </>
                )}

                {/* ── Triggers ── */}
                {db.triggers && db.triggers.length > 0 && (
                  <>
                    <div className="flex items-center gap-1 pl-5 pr-2 py-0.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 text-xs text-gray-400 font-medium"
                      onClick={() => toggle(`${db.name}__triggers`)}>
                      <ChevronRight size={12} className={`transition-transform ${expanded.has(`${db.name}__triggers`) ? 'rotate-90' : ''}`} />
                      <Play size={12} className="text-green-500 shrink-0" />
                      <span className="text-green-500">触发器</span>
                      <span className="ml-auto">{db.triggers.length}</span>
                    </div>
                    {expanded.has(`${db.name}__triggers`) && db.triggers.map(trig => (
                      <div key={`trig-${trig.name}`} className="flex items-center gap-2 pl-10 py-0.5 px-2 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                        onMouseEnter={e => showTooltip(e, `${trig.timing} ${trig.event}${trig.tableName ? ' ON ' + trig.tableName : ''}`)}
                        onMouseLeave={closeTooltip}>
                        <Play size={11} className="text-green-400 shrink-0" />
                        <span className="font-mono truncate max-w-[120px]">{trig.name}</span>
                        <span className="text-gray-400 ml-auto text-[10px]">{trig.timing} {trig.event}</span>
                      </div>
                    ))}
                  </>
                )}

                {/* ── Events ── */}
                {db.events && db.events.length > 0 && (
                  <>
                    <div className="flex items-center gap-1 pl-5 pr-2 py-0.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 text-xs text-gray-400 font-medium"
                      onClick={() => toggle(`${db.name}__events`)}>
                      <ChevronRight size={12} className={`transition-transform ${expanded.has(`${db.name}__events`) ? 'rotate-90' : ''}`} />
                      <Clock size={12} className="text-cyan-500 shrink-0" />
                      <span className="text-cyan-500">事件</span>
                      <span className="ml-auto">{db.events.length}</span>
                    </div>
                    {expanded.has(`${db.name}__events`) && db.events.map(evt => (
                      <div key={`evt-${evt.name}`} className="flex items-center gap-2 pl-10 py-0.5 px-2 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                        onMouseEnter={e => showTooltip(e, evt.schedule ?? evt.name)}
                        onMouseLeave={closeTooltip}>
                        <Clock size={11} className="text-cyan-400 shrink-0" />
                        <span className="font-mono truncate max-w-[140px]">{evt.name}</span>
                        {evt.status && <span className={`ml-auto text-[10px] ${evt.status === 'ENABLED' ? 'text-green-500' : 'text-gray-400'}`}>{evt.status}</span>}
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Context menu */}
      {menu && (
        <div className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg py-1 text-sm min-w-[180px]"
          style={{ left: menu.x, top: menu.y }}
          onClick={e => e.stopPropagation()}>
          <button onClick={handlePreview} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            <FileText size={14} className="inline mr-1.5" />预览数据
          </button>
          <button onClick={handleFormulaView} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            <Calculator size={14} className="inline mr-1.5" />公式数据视图
          </button>
          <button onClick={handleShowER} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            <GitFork size={14} className="inline mr-1.5" />查看 ER 图
          </button>
          <button onClick={() => menu && handleShowJoinBuilder(menu.dbName)} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            <Link2 size={14} className="inline mr-1.5" />可视化 JOIN 构建器
          </button>
          <button onClick={handleCopyStructure} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            <Clipboard size={14} className="inline mr-1.5" />复制表结构
          </button>
          <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
          <div className="px-4 py-1 text-xs text-gray-400 font-medium">AI 分析</div>
          <button onClick={() => handleAnalysis('dependencies')} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            <Link2 size={14} className="inline mr-1.5" />依赖关系图
          </button>
          <button onClick={() => handleAnalysis('data-dict')} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            <BookOpen size={14} className="inline mr-1.5" />数据字典
          </button>
          <button onClick={() => handleAnalysis('indexes')} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            <Zap size={14} className="inline mr-1.5" />索引分析
          </button>
          <button onClick={() => handleAnalysis('query-perf')} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            <BarChart3 size={14} className="inline mr-1.5" />查询性能分析
          </button>
          <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
          <button onClick={handleRefresh} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            <RefreshCw size={14} className="inline mr-1.5" />刷新 Schema
          </button>
        </div>
      )}

      {/* Database context menu */}
      {dbMenu && (
        <div className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg py-1 text-sm min-w-[180px]"
          style={{ left: dbMenu.x, top: dbMenu.y }}
          onClick={e => e.stopPropagation()}>
          <button onClick={() => dbMenu && handleShowJoinBuilder(dbMenu.dbName)} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            <Link2 size={14} className="inline mr-1.5" />可视化 JOIN 构建器
          </button>
          <button onClick={handleShowAllER} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            <GitFork size={14} className="inline mr-1.5" />查看所有表 ER 图
          </button>
          <button onClick={() => { const d = dbMenu; closeDbMenu(); setStorageDashboard({ dbName: d.dbName }) }}
            className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            <HardDrive size={14} className="inline mr-1.5" />存储分析
          </button>
          <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
          <button onClick={() => { closeDbMenu(); handleRefresh() }} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            <RefreshCw size={14} className="inline mr-1.5" />刷新 Schema
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

      {/* Storage dashboard */}
      {storageDashboard && schema && (() => {
        return (
          <StorageDashboard
            dbName={storageDashboard.dbName}
            schema={schema}
            onClose={() => setStorageDashboard(null)}
          />
        )
      })()}
    </div>
  )
}
