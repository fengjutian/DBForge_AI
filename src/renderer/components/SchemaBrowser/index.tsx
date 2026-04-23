import React, { useEffect, useState, useCallback } from 'react'
import type { DatabaseSchema, DatabaseInfo, TableInfo } from '../../../shared/types'
import { useConnectionStore } from '../../store/connectionStore'
import { useEditorStore } from '../../store/editorStore'
import ERDiagram from '../ERDiagram'

interface ContextMenu { x: number; y: number; type: 'table'; tableId: string; dbName: string; tableName: string }

export default function SchemaBrowser(): React.ReactElement {
  const { activeConnectionId } = useConnectionStore()
  const { openPreviewTab, updatePreviewTab } = useEditorStore()
  const [schema, setSchema] = useState<DatabaseSchema | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<ContextMenu | null>(null)
  const [erDiagram, setErDiagram] = useState<{ dbName: string; tableName: string } | null>(null)

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

  const closeMenu = () => setMenu(null)

  const handlePreview = async () => {
    if (!menu || !activeConnectionId) return
    closeMenu()
    const { dbName, tableName } = menu
    const previewKey = `${dbName}.${tableName}`
    const tabId = openPreviewTab(previewKey, `⊞ ${tableName}`, activeConnectionId)
    updatePreviewTab(tabId, { previewStatus: 'running', previewError: null })
    try {
      // Fetch total count and first page in parallel
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

  const handleRefresh = async () => {    if (!activeConnectionId) return
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
      onClick={closeMenu}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <span className="font-semibold text-sm">Schema 浏览器</span>
        {activeConnectionId && (
          <button onClick={handleRefresh} className="text-xs text-gray-400 hover:text-blue-500">刷新</button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto text-sm">
        {!activeConnectionId && (
          <div className="text-center text-gray-400 text-xs mt-8">请先选择一个连接</div>
        )}
        {loading && <div className="text-center text-gray-400 text-xs mt-8">加载中...</div>}
        {schema && !loading && schema.databases.map(db => (
          <div key={db.name}>
            <div className="flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 font-medium"
              onClick={() => toggle(db.name)}>
              <span className="text-gray-400">{expanded.has(db.name) ? '▾' : '▸'}</span>
              <span className="text-blue-600 dark:text-blue-400">🗄 {db.name}</span>
              <span className="ml-auto text-xs text-gray-400">{db.tables.length}</span>
            </div>
            {expanded.has(db.name) && db.tables.map(table => (
              <div key={table.name}>
                <div className="flex items-center gap-1 pl-5 pr-2 py-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => toggle(`${db.name}.${table.name}`)}
                  onContextMenu={e => handleContextMenu(e, db, table)}>
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
        <div className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg py-1 text-sm"
          style={{ left: menu.x, top: menu.y }}
          onClick={e => e.stopPropagation()}>
          <button onClick={handlePreview} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">预览数据</button>
          <button onClick={handleShowER} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">查看 ER 图</button>
          <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
          <button onClick={handleRefresh} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">刷新 Schema</button>
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
    </div>
  )
}
