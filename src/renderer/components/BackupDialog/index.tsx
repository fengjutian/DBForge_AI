import React, { useState, useEffect } from 'react'
import { useConnectionStore } from '../../store/connectionStore'
import type { BackupProgress } from '../../../shared/types'

interface Props {
  onClose: () => void
}

export default function BackupDialog({ onClose }: Props): React.ReactElement {
  const { connections } = useConnectionStore()
  const [tab, setTab] = useState<'backup' | 'restore'>('backup')
  const [connectionId, setConnectionId] = useState('')
  const [databases, setDatabases] = useState<string[]>([])
  const [dbInput, setDbInput] = useState('')
  const [compress, setCompress] = useState(true)
  const [singleTransaction, setSingleTransaction] = useState(true)
  const [routines, setRoutines] = useState(false)
  const [triggers, setTriggers] = useState(false)
  const [outputPath, setOutputPath] = useState('')
  const [progress, setProgress] = useState<BackupProgress | null>(null)
  const [running, setRunning] = useState(false)
  const [restoreFile, setRestoreFile] = useState('')

  useEffect(() => {
    const unsub = window.electronAPI.backup.onProgress((p) => {
      setProgress(p)
      if (p.phase === 'done' || p.phase === 'error') setRunning(false)
    })
    return () => { unsub() }
  }, [])

  const handleBackup = async () => {
    if (!connectionId || databases.length === 0 || !outputPath) return
    setRunning(true); setProgress(null)
    try {
      await window.electronAPI.backup.start({
        connectionId, databases, outputPath, compress,
        options: { singleTransaction, routines, triggers }
      })
    } catch (e) {
      setProgress({ phase: 'error', percent: 0, message: (e as Error).message })
      setRunning(false)
    }
  }

  const handleRestore = async () => {
    if (!connectionId || !restoreFile) return
    setRunning(true); setProgress(null)
    try {
      await window.electronAPI.backup.restore(connectionId, restoreFile)
      setProgress({ phase: 'done', percent: 100, message: '恢复完成' })
    } catch (e) {
      setProgress({ phase: 'error', percent: 0, message: (e as Error).message })
    } finally {
      setRunning(false)
    }
  }

  const handleOpenFolder = () => {
    if (progress?.filePath) window.electronAPI.backup.openFolder(progress.filePath)
  }

  const addDb = () => {
    const d = dbInput.trim()
    if (d && !databases.includes(d)) setDatabases(prev => [...prev, d])
    setDbInput('')
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[480px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold">备份与恢复</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {(['backup', 'restore'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 text-sm font-medium ${tab === t ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
              {t === 'backup' ? '备份' : '恢复'}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">连接</label>
            <select className={sel} value={connectionId} onChange={e => setConnectionId(e.target.value)}>
              <option value="">选择连接...</option>
              {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {tab === 'backup' && (
            <>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">数据库（回车添加）</label>
                <div className="flex gap-2">
                  <input className={inp} value={dbInput} onChange={e => setDbInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addDb()} placeholder="数据库名" />
                  <button onClick={addDb} className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700">添加</button>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {databases.map(d => (
                    <span key={d} className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                      {d}
                      <button onClick={() => setDatabases(prev => prev.filter(x => x !== d))} className="hover:text-red-500">×</button>
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">输出路径</label>
                <div className="flex gap-2">
                  <input className={inp} value={outputPath} onChange={e => setOutputPath(e.target.value)} placeholder="/path/to/backup" />
                  <button
                    onClick={async () => {
                      const path = await window.electronAPI.backup.selectSavePath()
                      if (path) setOutputPath(path)
                    }}
                    className="text-sm px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    📁 选择
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={compress} onChange={e => setCompress(e.target.checked)} />
                  压缩输出 (.gz)
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={singleTransaction} onChange={e => setSingleTransaction(e.target.checked)} />
                  单事务备份 (InnoDB)
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={routines} onChange={e => setRoutines(e.target.checked)} />
                  包含存储过程/函数
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={triggers} onChange={e => setTriggers(e.target.checked)} />
                  包含触发器
                </label>
              </div>
            </>
          )}

          {tab === 'restore' && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">备份文件路径</label>
              <div className="flex gap-2">
                <input className={inp} value={restoreFile} onChange={e => setRestoreFile(e.target.value)} placeholder="/path/to/backup.sql" />
                <button
                  onClick={async () => {
                    const path = await window.electronAPI.backup.selectFile()
                    if (path) setRestoreFile(path)
                  }}
                  className="text-sm px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  📁 选择
                </button>
              </div>
            </div>
          )}

          {/* Progress */}
          {progress && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span>{progress.message}</span>
                <span>{progress.percent}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div className={`h-2 rounded-full transition-all ${progress.phase === 'error' ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{ width: `${progress.percent}%` }} />
              </div>
              {progress.phase === 'done' && progress.filePath && (
                <button onClick={handleOpenFolder} className="text-xs text-blue-500 hover:underline">📂 打开备份文件夹</button>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="text-sm px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">关闭</button>
            <button
              onClick={tab === 'backup' ? handleBackup : handleRestore}
              disabled={running || !connectionId}
              className="text-sm px-4 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {running ? '执行中...' : tab === 'backup' ? '开始备份' : '开始恢复'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const sel = 'w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none'
const inp = 'w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500'
