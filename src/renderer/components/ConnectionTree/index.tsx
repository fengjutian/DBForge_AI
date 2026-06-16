import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  ChevronRight, Database, Table2, Key, Circle, Link2, RefreshCw,
  FileText, GitFork, Clipboard, BookOpen, Zap, BarChart3,
  Plus, Pencil, Trash2, Plug, Unplug
} from 'lucide-react'
import type {
  ConnectionConfig, SSHTunnelConfig,
  DatabaseSchema, DatabaseInfo, TableInfo
} from '../../../shared/types'
import { useConnectionStore } from '../../store/connectionStore'
import { useSessionStore } from '../../store/sessionStore'
import { useEditorStore } from '../../store/editorStore'
import ERDiagram from '../ERDiagram'
import TableAnalysisModal, { type AnalysisType } from '../TableAnalysisModal'
import JoinBuilder from '../JoinBuilder'

// ── Types ─────────────────────────────────────────────────────
interface TableContextMenu {
  x: number; y: number
  connectionId: string; dbName: string; tableName: string
}
interface DbContextMenu {
  x: number; y: number
  connectionId: string; dbName: string
}
interface ConnContextMenu {
  x: number; y: number
  connection: ConnectionConfig
}
interface Tooltip {
  x: number; y: number; text: string
}

const STATUS_COLORS: Record<string, string> = {
  connected: 'bg-green-500', error: 'bg-red-500',
  connecting: 'bg-yellow-400', disconnected: 'bg-gray-400'
}

const emptySSH: SSHTunnelConfig = {
  enabled: false, host: '', port: 22, username: '', authType: 'password', password: ''
}

const emptyForm = (): Omit<ConnectionConfig, 'id' | 'createdAt' | 'updatedAt'> => ({
  name: '', databaseType: 'mysql' as const, host: 'localhost', port: 3306,
  username: 'root', password: '', database: '', ssh: { ...emptySSH }
})

// ── Component ─────────────────────────────────────────────────
export default function ConnectionTree(): React.ReactElement {
  const {
    connections, statuses, activeConnectionId,
    loadConnections, createConnection, updateConnection, deleteConnection
  } = useConnectionStore()
  const {
    activate, deactivate, refreshSchema, getSchema,
    hasSession, activatingId, errors
  } = useSessionStore()
  const { openPreviewTab, updatePreviewTab, addTab, updateContent } = useEditorStore()

  // ── Expansion state ──────────────────────────────────────
  const [expandedConns, setExpandedConns] = useState<Set<string>>(new Set())
  const [expandedDbs, setExpandedDbs] = useState<Set<string>>(new Set())
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set())

  // ── Connection form state ────────────────────────────────
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState<string | null>(null)

  // ── Context menus ────────────────────────────────────────
  const [tableMenu, setTableMenu] = useState<TableContextMenu | null>(null)
  const [dbMenu, setDbMenu] = useState<DbContextMenu | null>(null)
  const [connMenu, setConnMenu] = useState<ConnContextMenu | null>(null)
  const [tooltip, setTooltip] = useState<Tooltip | null>(null)

  // ── Modals ───────────────────────────────────────────────
  const [erDiagram, setErDiagram] = useState<{ dbName: string; tableName: string } | null>(null)
  const [erDiagramAll, setErDiagramAll] = useState<{ dbName: string } | null>(null)
  const [analysis, setAnalysis] = useState<{ dbName: string; tableName: string; type: AnalysisType } | null>(null)
  const [joinBuilder, setJoinBuilder] = useState<{ dbName: string } | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const [loadingRef, setLoadingRef] = useState<Set<string>>(new Set())

  useEffect(() => { loadConnections() }, [loadConnections])

  // ── Helpers ──────────────────────────────────────────────
  const dbKey = (connId: string, dbName: string) => `${connId}/${dbName}`
  const tblKey = (connId: string, dbName: string, tblName: string) => `${connId}/${dbName}/${tblName}`

  const isConnExpanded = (id: string) => expandedConns.has(id)
  const isDbExpanded = (connId: string, dbName: string) => expandedDbs.has(dbKey(connId, dbName))
  const isTblExpanded = (connId: string, dbName: string, tblName: string) => expandedTables.has(tblKey(connId, dbName, tblName))

  const closeAllMenus = () => { setTableMenu(null); setDbMenu(null); setConnMenu(null) }

  // ── Connection expand/collapse ───────────────────────────
  const handleConnectionToggle = async (conn: ConnectionConfig) => {
    closeAllMenus()
    if (isConnExpanded(conn.id)) {
      // Collapse
      setExpandedConns(prev => { const s = new Set(prev); s.delete(conn.id); return s })
    } else {
      // Expand — activate if not already
      if (!hasSession(conn.id)) {
        try {
          await activate(conn.id)
        } catch { /* error shown in store */ }
      }
      setExpandedConns(prev => new Set(prev).add(conn.id))
    }
  }

  // ── Connection right-click ───────────────────────────────
  const handleConnContext = (e: React.MouseEvent, conn: ConnectionConfig) => {
    e.preventDefault()
    closeAllMenus()
    setConnMenu({ x: e.clientX, y: e.clientY, connection: conn })
  }

  const handleEditConn = () => {
    if (!connMenu) return
    const c = connMenu.connection
    setEditingId(c.id)
    setForm({
      name: c.name, databaseType: c.databaseType || 'mysql', host: c.host,
      port: c.port, username: c.username, password: c.password,
      database: c.database ?? '', ssh: c.ssh ?? { ...emptySSH }
    })
    setTestMsg(null)
    setShowForm(true)
    setConnMenu(null)
  }

  const handleDeleteConn = async () => {
    if (!connMenu) return
    const c = connMenu.connection
    // Deactivate first if active
    if (hasSession(c.id)) {
      try { await deactivate(c.id) } catch { /* ignore */ }
    }
    await deleteConnection(c.id)
    setExpandedConns(prev => { const s = new Set(prev); s.delete(c.id); return s })
    setConnMenu(null)
  }

  const handleDisconnect = async () => {
    if (!connMenu) return
    if (hasSession(connMenu.connection.id)) {
      try { await deactivate(connMenu.connection.id) } catch { /* ignore */ }
    }
    setExpandedConns(prev => { const s = new Set(prev); s.delete(connMenu.connection.id); return s })
    setConnMenu(null)
  }

  // ── Database context menu ────────────────────────────────
  const handleDbContextMenu = (e: React.MouseEvent, connId: string, db: DatabaseInfo) => {
    e.preventDefault()
    e.stopPropagation()
    closeAllMenus()
    setDbMenu({ x: e.clientX, y: e.clientY, connectionId: connId, dbName: db.name })
  }

  // ── Table context menu ───────────────────────────────────
  const handleTableContextMenu = (e: React.MouseEvent, connId: string, db: DatabaseInfo, table: TableInfo) => {
    e.preventDefault()
    e.stopPropagation()
    closeAllMenus()
    setTableMenu({ x: e.clientX, y: e.clientY, connectionId: connId, dbName: db.name, tableName: table.name })
  }

  // ── Tooltip ──────────────────────────────────────────────
  const showTooltip = (e: React.MouseEvent, text: string) => {
    const el = e.currentTarget as HTMLElement
    if (el.scrollWidth > el.clientWidth) {
      setTooltip({ x: e.clientX, y: e.clientY, text })
    }
  }
  const closeTooltip = () => setTooltip(null)

  // ── Schema actions ───────────────────────────────────────
  const handleRefresh = async (connId: string) => {
    setLoadingRef(prev => new Set(prev).add(connId))
    try { await refreshSchema(connId) } finally {
      setLoadingRef(prev => { const s = new Set(prev); s.delete(connId); return s })
    }
  }

  const handlePreview = async () => {
    if (!tableMenu) return
    const { connectionId, dbName, tableName } = tableMenu
    closeAllMenus()
    const previewKey = `${dbName}.${tableName}`
    const tabId = openPreviewTab(previewKey, `⊞ ${tableName}`, connectionId)
    updatePreviewTab(tabId, { previewStatus: 'running', previewError: null })
    try {
      const [countResult, dataResult] = await Promise.all([
        window.electronAPI.query.execute({
          connectionId, queryId: `preview_count_${tabId}`,
          sql: `SELECT COUNT(*) AS __total FROM \`${dbName}\`.\`${tableName}\``
        }),
        window.electronAPI.query.execute({
          connectionId, queryId: `preview_${tabId}`,
          sql: `SELECT * FROM \`${dbName}\`.\`${tableName}\` LIMIT 100 OFFSET 0`
        })
      ])
      const total = Number(countResult.rows[0]?.['__total'] ?? 0)
      updatePreviewTab(tabId, { previewResult: dataResult, previewStatus: 'idle', previewTotal: total })
    } catch (e) {
      updatePreviewTab(tabId, { previewStatus: 'error', previewError: (e as Error).message })
    }
  }

  const handleShowER = () => {
    if (!tableMenu) return
    setErDiagram({ dbName: tableMenu.dbName, tableName: tableMenu.tableName })
    closeAllMenus()
  }

  const handleShowAllER = () => {
    if (!dbMenu) return
    setErDiagramAll({ dbName: dbMenu.dbName })
    closeAllMenus()
  }

  const handleShowJoinBuilder = (connId: string, dbName: string) => {
    setJoinBuilder({ dbName })
    closeAllMenus()
  }

  const handleCopyStructure = () => {
    if (!tableMenu) return
    const schema = getSchema(tableMenu.connectionId)
    if (!schema) return
    const db = schema.databases.find(d => d.name === tableMenu.dbName)
    const table = db?.tables.find(t => t.name === tableMenu.tableName)
    if (!table) return
    const header = '列名\t类型\t允许NULL\t默认值\t注释'
    const rows = table.columns.map(c =>
      `${c.name}\t${c.type}\t${c.nullable ? 'YES' : 'NO'}\t${c.defaultValue ?? ''}\t${c.comment ?? ''}`
    )
    navigator.clipboard.writeText([header, ...rows].join('\n')).catch(() => {})
    closeAllMenus()
  }

  const handleAnalysis = (type: AnalysisType) => {
    if (!tableMenu) return
    setAnalysis({ dbName: tableMenu.dbName, tableName: tableMenu.tableName, type })
    closeAllMenus()
  }

  // ── Connection form ──────────────────────────────────────
  const openNew = () => { setEditingId(null); setForm(emptyForm()); setTestMsg(null); setShowForm(true) }
  const f = (k: string, v: unknown) => setForm(p => ({ ...p, [k]: v }))
  const fSSH = (k: string, v: unknown) => setForm(p => ({ ...p, ssh: { ...p.ssh!, [k]: v } }))

  const handleSave = async () => {
    const now = Date.now()
    const config: ConnectionConfig = {
      id: editingId ?? 'conn-' + now, name: form.name, databaseType: form.databaseType || 'mysql',
      host: form.host, port: form.port, username: form.username, password: form.password,
      database: form.database, ssh: form.ssh, createdAt: now, updatedAt: now
    }
    if (editingId) await updateConnection(config); else await createConnection(config)
    setShowForm(false)
  }

  const handleTest = async () => {
    setTesting(true); setTestMsg('测试中...')
    const result = await window.electronAPI.connection.test({
      name: form.name, databaseType: form.databaseType || 'mysql', host: form.host,
      port: form.port, username: form.username, password: form.password,
      database: form.database, ssh: form.ssh
    } as ConnectionConfig)
    setTestMsg(result.success ? 'OK (' + result.latency + 'ms)' : 'FAIL: ' + result.error)
    setTesting(false)
  }

  const isSQLite = form.databaseType === 'sqlite'
  const inputCls = 'w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{label}{children}</label>
  )

  // ── Render one connection's schema tree ──────────────────
  const renderSchemaTree = (connId: string) => {
    const schema = getSchema(connId)
    const isLoading = loadingRef.has(connId)
    const isActivating = activatingId === connId

    if (isActivating || isLoading) {
      return (
        <div className="pl-8 py-2 text-xs text-gray-400">
          {isActivating ? '连接中...' : '加载中...'}
        </div>
      )
    }

    if (!schema || !schema.databases || schema.databases.length === 0) {
      return <div className="pl-8 py-2 text-xs text-gray-400">暂无数据库</div>
    }

    return schema.databases.map(db => (
      <div key={dbKey(connId, db.name)}>
        {/* ── Database row ── */}
        <div
          className="flex items-center gap-1 pl-6 pr-2 py-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 font-medium"
          onClick={(e) => {
            e.stopPropagation()
            setExpandedDbs(prev => {
              const s = new Set(prev)
              const k = dbKey(connId, db.name)
              s.has(k) ? s.delete(k) : s.add(k)
              return s
            })
          }}
          onContextMenu={e => handleDbContextMenu(e, connId, db)}
          onMouseEnter={e => showTooltip(e, db.name)}
          onMouseLeave={closeTooltip}
        >
          <ChevronRight size={14} className={`text-gray-400 transition-transform shrink-0 ${isDbExpanded(connId, db.name) ? 'rotate-90' : ''}`} />
          <Database size={16} className="text-green-600 dark:text-green-400 shrink-0" />
          <span className="text-green-600 dark:text-green-400 truncate max-w-[120px]" title={db.name}>{db.name}</span>
          <span className="ml-auto text-xs text-gray-400">{db.tables.length}</span>
          <button
            onClick={e => { e.stopPropagation(); handleShowJoinBuilder(connId, db.name) }}
            title="可视化 JOIN 构建器"
            className="ml-1 text-gray-400 hover:text-green-500 p-0.5"
          ><Link2 size={12} /></button>
        </div>

        {/* ── Tables ── */}
        {isDbExpanded(connId, db.name) && db.tables.map(table => (
          <div key={tblKey(connId, db.name, table.name)}>
            <div
              className="flex items-center gap-1 pl-10 pr-2 py-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={(e) => {
                e.stopPropagation()
                setExpandedTables(prev => {
                  const s = new Set(prev)
                  const k = tblKey(connId, db.name, table.name)
                  s.has(k) ? s.delete(k) : s.add(k)
                  return s
                })
              }}
              onContextMenu={e => handleTableContextMenu(e, connId, db, table)}
            >
              <ChevronRight size={14} className={`text-gray-400 transition-transform shrink-0 ${isTblExpanded(connId, db.name, table.name) ? 'rotate-90' : ''}`} />
              <Table2 size={14} className="text-blue-500 shrink-0" />
              <span className="truncate max-w-[170px]" title={table.name}
                onMouseEnter={e => showTooltip(e, table.name)}
                onMouseLeave={closeTooltip}
              >{table.name}</span>
              {table.rowCount !== undefined && (
                <span className="ml-auto text-xs text-gray-400">{table.rowCount.toLocaleString()} 行</span>
              )}
            </div>

            {/* ── Columns ── */}
            {isTblExpanded(connId, db.name, table.name) && (
              <div className="pl-14">
                {table.columns.map(col => (
                  <div key={col.name}
                    className="flex items-center gap-2 py-0.5 px-2 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    {table.primaryKeys.includes(col.name)
                      ? <Key size={11} className="text-amber-500 shrink-0" />
                      : <Circle size={11} className="text-gray-400 shrink-0" />}
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
    ))
  }

  // ── Main render ──────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 select-none"
      onClick={closeAllMenus} ref={containerRef}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <span className="font-semibold text-sm">数据库浏览器</span>
        <button onClick={openNew}
          className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 flex items-center gap-1"
        >
          <Plus size={12} />新建
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto text-sm" onClick={closeAllMenus} onContextMenu={closeAllMenus}>
        {connections.length === 0 && (
          <div className="text-center text-gray-400 text-xs mt-8">暂无连接，点击"新建"创建</div>
        )}

        {connections.map(conn => {
          const status = (statuses as any)[conn.id]?.state ?? 'disconnected'
          const isExpanded = isConnExpanded(conn.id)
          const hasActive = hasSession(conn.id)
          const isActive = activeConnectionId === conn.id

          return (
            <div key={conn.id}>
              {/* ── Connection row ── */}
              <div
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800/50 ${isActive ? 'bg-green-50 dark:bg-green-900/20' : ''}`}
                onClick={() => handleConnectionToggle(conn)}
                onContextMenu={e => handleConnContext(e, conn)}
              >
                <ChevronRight size={14}
                  className={`text-gray-400 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
                <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[status]}`} title={status} />
                <span className="text-xs shrink-0">
                  {conn.databaseType === 'postgresql' ? <Database className="w-3 h-3 inline" /> :
                   conn.databaseType === 'sqlite' ? <FileText className="w-3 h-3 inline" /> :
                   <Database className="w-3 h-3 inline" />}
                </span>
                <span className="flex-1 text-sm truncate font-medium">{conn.name}</span>
                <span className="text-xs text-gray-400">{conn.host}:{conn.port}</span>
              </div>

              {/* ── Expanded: schema tree ── */}
              {isExpanded && renderSchemaTree(conn.id)}
            </div>
          )
        })}
      </div>

      {/* ── Connection context menu ── */}
      {connMenu && (
        <div className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg py-1 text-sm min-w-[160px]"
          style={{ left: connMenu.x, top: connMenu.y }}
          onClick={e => e.stopPropagation()}>
          <button onClick={handleEditConn}
            className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            <Pencil size={14} className="inline mr-1.5" />编辑
          </button>
          {hasSession(connMenu.connection.id) && (
            <button onClick={handleDisconnect}
              className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
              <Unplug size={14} className="inline mr-1.5" />断开
            </button>
          )}
          <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
          <button onClick={handleDeleteConn}
            className="block w-full text-left px-4 py-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600">
            <Trash2 size={14} className="inline mr-1.5" />删除
          </button>
        </div>
      )}

      {/* ── Table context menu ── */}
      {tableMenu && (() => {
        const schema = getSchema(tableMenu.connectionId)
        return (
          <div className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg py-1 text-sm min-w-[180px]"
            style={{ left: tableMenu.x, top: tableMenu.y }}
            onClick={e => e.stopPropagation()}>
            <button onClick={handlePreview} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
              <FileText size={14} className="inline mr-1.5" />预览数据
            </button>
            <button onClick={handleShowER} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
              <GitFork size={14} className="inline mr-1.5" />查看 ER 图
            </button>
            <button onClick={() => handleShowJoinBuilder(tableMenu.connectionId, tableMenu.dbName)}
              className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
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
            <button onClick={() => { closeAllMenus(); handleRefresh(tableMenu.connectionId) }}
              className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
              <RefreshCw size={14} className="inline mr-1.5" />刷新 Schema
            </button>
          </div>
        )
      })()}

      {/* ── Database context menu ── */}
      {dbMenu && (
        <div className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg py-1 text-sm min-w-[180px]"
          style={{ left: dbMenu.x, top: dbMenu.y }}
          onClick={e => e.stopPropagation()}>
          <button onClick={() => handleShowJoinBuilder(dbMenu.connectionId, dbMenu.dbName)}
            className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            <Link2 size={14} className="inline mr-1.5" />可视化 JOIN 构建器
          </button>
          <button onClick={handleShowAllER} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            <GitFork size={14} className="inline mr-1.5" />查看所有表 ER 图
          </button>
          <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
          <button onClick={() => { closeAllMenus(); handleRefresh(dbMenu.connectionId) }}
            className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
            <RefreshCw size={14} className="inline mr-1.5" />刷新 Schema
          </button>
        </div>
      )}

      {/* ── Tooltip ── */}
      {tooltip && (
        <div className="fixed z-50 px-2 py-1 text-xs bg-gray-800 text-white rounded shadow-lg pointer-events-none max-w-[300px] break-all"
          style={{ left: tooltip.x + 10, top: tooltip.y + 10 }}>
          {tooltip.text}
        </div>
      )}

      {/* ── Connection form modal ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[480px] max-h-[90vh] overflow-y-auto p-5">
            <h2 className="font-semibold text-base mb-4">{editingId ? '编辑连接' : '新建连接'}</h2>
            <div className="space-y-3">
              <Field label="名称"><input className={inputCls} value={form.name} onChange={e => f('name', e.target.value)} /></Field>
              <Field label="数据库类型">
                <select className={inputCls} value={form.databaseType || 'mysql'}
                  onChange={e => {
                    const t = e.target.value as any
                    f('databaseType', t)
                    if (t === 'postgresql') f('port', 5432)
                    else if (t !== 'sqlite') f('port', 3306)
                  }}>
                  <option value="mysql">MySQL / MariaDB</option>
                  <option value="postgresql">PostgreSQL</option>
                  <option value="sqlite">SQLite</option>
                </select>
              </Field>

              {!isSQLite && <>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2"><Field label="主机"><input className={inputCls} value={form.host} onChange={e => f('host', e.target.value)} /></Field></div>
                  <Field label="端口"><input className={inputCls} type="number" value={form.port} onChange={e => f('port', +e.target.value)} /></Field>
                </div>
                <Field label="用户名"><input className={inputCls} value={form.username} onChange={e => f('username', e.target.value)} /></Field>
                <Field label="密码"><input className={inputCls} type="password" value={form.password} onChange={e => f('password', e.target.value)} /></Field>
              </>}

              {isSQLite && <p className="text-xs text-gray-400">SQLite 是本地文件数据库，无需填写主机/端口/用户名/密码</p>}

              <Field label={isSQLite ? '数据库文件路径' : form.databaseType === 'postgresql' ? '数据库' : '数据库（可选）'}>
                <input className={inputCls} value={form.database}
                  required={form.databaseType === 'postgresql'}
                  placeholder={isSQLite ? '选择 .db/.sqlite 文件路径' : form.databaseType === 'postgresql' ? '必填（默认: postgres）' : ''}
                  onChange={e => f('database', e.target.value)} />
              </Field>

              <div className="border-t border-gray-200 dark:border-gray-600 pt-3">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input type="checkbox" checked={form.ssh?.enabled ?? false} onChange={e => fSSH('enabled', e.target.checked)} />
                  启用 SSH 隧道
                </label>
                {form.ssh?.enabled && (
                  <div className="space-y-2 mt-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2"><Field label="SSH 主机"><input className={inputCls} value={form.ssh.host} onChange={e => fSSH('host', e.target.value)} /></Field></div>
                      <Field label="端口"><input className={inputCls} type="number" value={form.ssh.port} onChange={e => fSSH('port', +e.target.value)} /></Field>
                    </div>
                    <Field label="SSH 用户名"><input className={inputCls} value={form.ssh.username} onChange={e => fSSH('username', e.target.value)} /></Field>
                    <Field label="SSH 密码"><input className={inputCls} type="password" value={form.ssh.password} onChange={e => fSSH('password', e.target.value)} /></Field>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={handleSave} className="flex-1 px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700">保存</button>
                <button onClick={handleTest} disabled={testing} className="px-3 py-2 border text-sm rounded hover:bg-gray-50">{testing ? '测试中...' : '测试连接'}</button>
                <button onClick={() => setShowForm(false)} className="px-3 py-2 border text-sm rounded hover:bg-gray-50">取消</button>
              </div>
              {testMsg && <p className="text-xs text-gray-500 mt-1">{testMsg}</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── ER Diagram modal ── */}
      {erDiagram && (() => {
        const schema = getSchema(activeConnectionId!)
        const db = schema?.databases.find(d => d.name === erDiagram.dbName)
        return db ? (
          <ERDiagram db={db} focusTable={erDiagram.tableName} onClose={() => setErDiagram(null)} />
        ) : null
      })()}

      {/* ── All Tables ER Diagram modal ── */}
      {erDiagramAll && (() => {
        const schema = getSchema(activeConnectionId!)
        const db = schema?.databases.find(d => d.name === erDiagramAll.dbName)
        return db ? (
          <ERDiagram db={db} onClose={() => setErDiagramAll(null)} />
        ) : null
      })()}

      {/* ── Table Analysis modal ── */}
      {analysis && activeConnectionId && (
        <TableAnalysisModal
          connectionId={activeConnectionId}
          dbName={analysis.dbName}
          tableName={analysis.tableName}
          type={analysis.type}
          onClose={() => setAnalysis(null)}
        />
      )}

      {/* ── JOIN Builder modal ── */}
      {joinBuilder && (() => {
        const schema = getSchema(activeConnectionId!)
        const db = schema?.databases.find(d => d.name === joinBuilder.dbName)
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
