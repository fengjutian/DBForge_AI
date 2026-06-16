import React, { useState, useEffect } from 'react'
import { FolderOpen, AlertTriangle, Folder } from 'lucide-react'
import { useConnectionStore } from '../../store/connectionStore'
import Modal from '../ui/Modal'
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

  const [validationError, setValidationError] = useState('')

  const handleBackup = async () => {
    setValidationError('')
    if (!connectionId) { setValidationError('请先选择数据库连接'); return }
    if (databases.length === 0) { setValidationError('请添加至少一个数据库'); return }
    if (!outputPath) { setValidationError('请选择备份输出路径'); return }
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
    setValidationError('')
    if (!connectionId) { setValidationError('请先选择数据库连接'); return }
    if (!restoreFile) { setValidationError('请选择备份文件路径'); return }
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

  const header = (
    <>
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <h2 className="font-semibold">备份与恢复</h2>
        <button onClick={onClose} className="btn-icon text-xl leading-none">×</button>
      </div>
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {(['backup', 'restore'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 tab-btn ${tab === t ? 'tab-active' : 'tab-inactive'}`}>
            {t === 'backup' ? '备份' : '恢复'}
          </button>
        ))}
      </div>
    </>
  )

  const footer = (
    <>
      <button onClick={onClose} className="btn-secondary">关闭</button>
      <button
        onClick={tab === 'backup' ? handleBackup : handleRestore}
        disabled={running || !connectionId}
        className="btn-primary">
        {running ? '执行中...' : tab === 'backup' ? '开始备份' : '开始恢复'}
      </button>
    </>
  )

  return (
    <Modal open onClose={onClose} width="w-[480px]" header={header} footer={footer}>
      <div className="space-y-4">
        <div>
          <label className="field-label">连接</label>
          <select className="select-field" value={connectionId} onChange={e => setConnectionId(e.target.value)}>
            <option value="">选择连接...</option>
            {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {tab === 'backup' && (
          <>
            <div>
              <label className="field-label">数据库（回车添加）</label>
              <div className="flex gap-2">
                <input className="input-field" value={dbInput} onChange={e => setDbInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addDb()} placeholder="数据库名" />
                <button onClick={addDb} className="btn-primary whitespace-nowrap">添加</button>
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {databases.map(d => (
                  <span key={d} className="tag">
                    {d}
                    <button onClick={() => setDatabases(prev => prev.filter(x => x !== d))} className="tag-close">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="field-label">输出路径</label>
              <div className="flex gap-2">
                <input className="input-field" value={outputPath} onChange={e => setOutputPath(e.target.value)} placeholder="/path/to/backup" />
                <button
                  onClick={async () => {
                    const path = await window.electronAPI.backup.selectSavePath()
                    if (path) setOutputPath(path)
                  }}
                  className="btn-secondary"
                >
                  <FolderOpen className="w-3.5 h-3.5 inline mr-1" />选择
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="checkbox-label">
                <input type="checkbox" checked={compress} onChange={e => setCompress(e.target.checked)} />
                压缩输出 (.gz)
              </label>
              <label className="checkbox-label">
                <input type="checkbox" checked={singleTransaction} onChange={e => setSingleTransaction(e.target.checked)} />
                单事务备份 (InnoDB)
              </label>
              <label className="checkbox-label">
                <input type="checkbox" checked={routines} onChange={e => setRoutines(e.target.checked)} />
                包含存储过程/函数
              </label>
              <label className="checkbox-label">
                <input type="checkbox" checked={triggers} onChange={e => setTriggers(e.target.checked)} />
                包含触发器
              </label>
            </div>
          </>
        )}

        {tab === 'restore' && (
          <div>
            <label className="field-label">备份文件路径</label>
            <div className="flex gap-2">
              <input className="input-field" value={restoreFile} onChange={e => setRestoreFile(e.target.value)} placeholder="/path/to/backup.sql" />
              <button
                onClick={async () => {
                  const path = await window.electronAPI.backup.selectFile()
                  if (path) setRestoreFile(path)
                }}
                className="btn-secondary"
              >
                <FolderOpen className="w-3.5 h-3.5 inline mr-1" />选择
              </button>
            </div>
          </div>
        )}

        {/* Validation Error */}
        {validationError && (
          <div className="msg-error">
            <AlertTriangle className="w-3 h-3 inline mr-1 align-middle" />{validationError}
          </div>
        )}

        {/* Progress */}
        {progress && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>{progress.message}</span>
              <span>{progress.percent}%</span>
            </div>
            <div className="progress-bar">
              <div className={progress.phase === 'error' ? 'progress-fill-red' : 'progress-fill-green'}
                style={{ width: `${progress.percent}%` }} />
            </div>
            {progress.phase === 'done' && progress.filePath && (
              <button onClick={handleOpenFolder} className="link">
                <Folder className="w-3 h-3 inline mr-1" />打开备份文件夹
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
