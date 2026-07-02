import React, { useMemo, useState } from 'react'
import { X, HardDrive, ArrowUpDown } from 'lucide-react'
import Modal from '../ui/Modal'
import type { DatabaseSchema, TableInfo } from '@dbforge/shared'

interface Props {
  dbName: string
  schema: DatabaseSchema
  onClose: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

type SortKey = 'name' | 'rows' | 'size'

export default function StorageDashboard({ dbName, schema, onClose }: Props): React.ReactElement {
  const [sortKey, setSortKey] = useState<SortKey>('size')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const db = schema.databases.find(d => d.name === dbName)
  const tables = db?.tables ?? []

  // Compute stats
  const { sizedTables, totalSize } = useMemo(() => {
    const withSize = tables
      .map(t => ({ ...t, _size: t.dataSize ?? 0 }))
      .filter(t => t._size > 0)
    const total = withSize.reduce((s, t) => s + t._size, 0)
    return { sizedTables: withSize, totalSize: total }
  }, [tables])

  // Sort
  const sorted = useMemo(() => {
    const arr = [...sizedTables]
    arr.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name)
      else if (sortKey === 'rows') cmp = (a.rowCount ?? 0) - (b.rowCount ?? 0)
      else cmp = a._size - b._size
      return sortDir === 'desc' ? -cmp : cmp
    })
    return arr
  }, [sizedTables, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const maxSize = sorted[0]?._size ?? 1
  const unsizedCount = tables.length - sizedTables.length

  const header = (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
      <HardDrive className="w-5 h-5 text-cyan-500" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">存储分析</div>
        <div className="text-xs text-gray-400 font-mono truncate">{dbName}</div>
      </div>
      <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
        <X className="w-4 h-4" />
      </button>
    </div>
  )

  return (
    <Modal open onClose={onClose} width="w-full max-w-2xl" className="max-h-[85vh]" header={header}>
      <div className="space-y-4">
        {/* ── Summary cards ── */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800 p-3 text-center">
            <div className="text-2xl font-bold text-cyan-700 dark:text-cyan-300">
              {totalSize > 0 ? formatBytes(totalSize) : '—'}
            </div>
            <div className="text-xs text-cyan-500 mt-0.5">总占用</div>
          </div>
          <div className="rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3 text-center">
            <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">{tables.length}</div>
            <div className="text-xs text-gray-400 mt-0.5">数据表</div>
          </div>
          <div className="rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3 text-center">
            <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">
              {sizedTables.length > 0 ? Math.round((sizedTables.length / Math.max(tables.length, 1)) * 100) + '%' : '—'}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">可统计占比</div>
          </div>
        </div>

        {unsizedCount > 0 && (
          <div className="text-xs text-amber-500 bg-amber-50 dark:bg-amber-900/20 rounded px-3 py-1.5">
            {unsizedCount} 张表暂无存储数据（需执行 ANALYZE TABLE 刷新统计信息）
          </div>
        )}

        {/* ── Bar chart ── */}
        {sorted.length > 0 && (
          <div>
            <div className="text-xs font-medium text-gray-500 mb-2">表占用排行</div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {sorted.slice(0, 20).map(t => {
                const pct = maxSize > 0 ? (t._size / maxSize) * 100 : 0
                const share = totalSize > 0 ? ((t._size / totalSize) * 100).toFixed(1) : '0'
                return (
                  <div key={t.name} className="flex items-center gap-2 text-xs">
                    <span className="w-28 truncate text-right text-gray-600 dark:text-gray-400" title={t.name}>
                      {t.name}
                    </span>
                    <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
                      <div
                        className="h-full rounded bg-gradient-to-r from-cyan-400 to-blue-500 transition-all"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                    <span className="w-16 text-right text-gray-500">{formatBytes(t._size)}</span>
                    <span className="w-10 text-right text-gray-400">{share}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Table ── */}
        {sorted.length > 0 && (
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">详细列表</div>
            <div className="max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <Th label="表名" k="name" cur={sortKey} dir={sortDir} onClick={toggleSort} />
                    <Th label="行数" k="rows" cur={sortKey} dir={sortDir} onClick={toggleSort} right />
                    <Th label="占用" k="size" cur={sortKey} dir={sortDir} onClick={toggleSort} right />
                    <th className="py-1.5 px-3 text-right text-gray-400 font-medium">占比</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {sorted.map(t => {
                    const share = totalSize > 0 ? ((t._size / totalSize) * 100).toFixed(1) : '0'
                    return (
                      <tr key={t.name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="py-1.5 px-3 font-mono text-gray-700 dark:text-gray-300 truncate max-w-[200px]" title={t.name}>
                          {t.name}
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-500">
                          {t.rowCount !== undefined ? t.rowCount.toLocaleString() : '—'}
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-700 dark:text-gray-300 font-mono">
                          {formatBytes(t._size)}
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-400">{share}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {sorted.length === 0 && tables.length > 0 && (
          <div className="text-center text-gray-400 text-xs py-8">
            当前连接的数据库暂无存储统计数据
          </div>
        )}
      </div>
    </Modal>
  )
}

function Th({ label, k, cur, dir, onClick, right }: {
  label: string; k: SortKey; cur: SortKey; dir: 'asc' | 'desc'
  onClick: (k: SortKey) => void; right?: boolean
}) {
  const active = cur === k
  return (
    <th
      className={`py-1.5 px-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 select-none ${right ? 'text-right' : 'text-left'} text-gray-400 font-medium`}
      onClick={() => onClick(k)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {active ? (
          <span className="text-cyan-500">{dir === 'desc' ? '↓' : '↑'}</span>
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </span>
    </th>
  )
}
