import React, { useEffect, useState } from 'react'
import { useConnectionStore } from '../../store/connectionStore'
import type { ConnectionConfig, SSHTunnelConfig } from '../../../shared/types'

const STATUS_COLORS: Record<string, string> = {
  connected: 'bg-green-500',
  error: 'bg-red-500',
  connecting: 'bg-yellow-400',
  disconnected: 'bg-gray-400'
}

const emptySSH: SSHTunnelConfig = {
  enabled: false,
  host: '',
  port: 22,
  username: '',
  authType: 'password',
  password: ''
}

const emptyForm = (): Omit<ConnectionConfig, 'id' | 'createdAt' | 'updatedAt'> => ({
  name: '',
  databaseType: 'mysql' as const,
  host: 'localhost',
  port: 3306,
  username: 'root',
  password: '',
  database: '',
  ssh: { ...emptySSH }
})

export default function ConnectionPanel(): React.ReactElement {
  const { connections, statuses, activeConnectionId, loadConnections, createConnection,
    updateConnection, deleteConnection, activateConnection, deactivateConnection } = useConnectionStore()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState<string | null>(null)

  useEffect(() => { loadConnections() }, [loadConnections])

  const openNew = () => { setEditingId(null); setForm(emptyForm()); setTestMsg(null); setShowForm(true) }
  const openEdit = (c: ConnectionConfig) => {
    setEditingId(c.id)
    setForm({ name: c.name, databaseType: c.databaseType || 'mysql', host: c.host, port: c.port, username: c.username,
      password: c.password, database: c.database ?? '', ssh: c.ssh ?? { ...emptySSH } })
    setTestMsg(null)
    setShowForm(true)
  }

  const handleSave = async () => {
    const now = Date.now()
    const config: ConnectionConfig = {
      id: editingId ?? `conn-${now}`,
      name: form.name,
      databaseType: form.databaseType || 'mysql',
      host: form.host,
      port: form.port,
      username: form.username,
      password: form.password,
      database: form.database,
      ssh: form.ssh,
      createdAt: now,
      updatedAt: now
    }
    if (editingId) {
      await updateConnection(config)
    } else {
      await createConnection(config)
    }
    setShowForm(false)
  }

  const handleTest = async () => {
    setTesting(true); setTestMsg(null)
    try {
      const now = Date.now()
      const config: ConnectionConfig = {
        id: editingId ?? `test-${now}`,
        name: form.name,
        host: form.host,
        port: form.port,
        username: form.username,
        password: form.password,
        database: form.database,
        ssh: form.ssh,
        createdAt: now,
        updatedAt: now
      }
      const result = await window.electronAPI.connection.test(config)
      setTestMsg(result.success ? `✓ 连接成功 (${result.latency}ms)` : `✗ ${result.error}`)
    } catch (e) {
      setTestMsg(`✗ ${(e as Error).message}`)
    } finally {
      setTesting(false)
    }
  }

  const handleExport = async () => {
    const ids = connections.map(c => c.id)
    const json = await window.electronAPI.connection.export(ids)
    const blob = new Blob([json as string], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'connections.json'; a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.json'
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return
      const text = await file.text()
      await window.electronAPI.connection.import(text)
      await loadConnections()
    }
    input.click()
  }

  const f = (key: string, val: string | number) =>
    setForm(prev => ({ ...prev, [key]: val }))
  const fSSH = (key: string, val: string | number | boolean) =>
    setForm(prev => ({ ...prev, ssh: { ...(prev.ssh ?? emptySSH), [key]: val } as SSHTunnelConfig }))

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <span className="font-semibold text-sm">连接管理</span>
        <div className="flex gap-1">
          <button onClick={handleImport} className="text-xs px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">导入</button>
          <button onClick={handleExport} className="text-xs px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">导出</button>
          <button onClick={openNew} className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700">+ 新建</button>
        </div>
      </div>

      {/* Connection list */}
      <div className="flex-1 overflow-y-auto">
        {connections.length === 0 && (
          <div className="text-center text-gray-400 text-sm mt-8">暂无连接，点击"新建"添加</div>
        )}
        {connections.map(c => {
          const status = statuses[c.id]?.state ?? 'disconnected'
          const isActive = activeConnectionId === c.id
          return (
            <div key={c.id}
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 ${isActive ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}
              onClick={() => isActive ? deactivateConnection(c.id) : activateConnection(c.id)}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[status]}`} title={status} />
              <span className="flex-1 text-sm truncate">{c.name}</span>
              <span className="text-xs text-gray-400">{c.host}:{c.port}</span>
              <button onClick={e => { e.stopPropagation(); openEdit(c) }}
                className="text-xs text-gray-400 hover:text-blue-500 px-1">编辑</button>
              <button onClick={e => { e.stopPropagation(); deleteConnection(c.id) }}
                className="text-xs text-gray-400 hover:text-red-500 px-1">删除</button>
            </div>
          )
        })}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[480px] max-h-[90vh] overflow-y-auto p-5">
            <h2 className="font-semibold text-base mb-4">{editingId ? '编辑连接' : '新建连接'}</h2>
            <div className="space-y-3">
              <Field label="名称"><input className={input} value={form.name} onChange={e => f('name', e.target.value)} /></Field>
              <Field label="数据库类型">
                <select className={input} value={form.databaseType || 'mysql'}
                  onChange={e => {
                    const dbType = e.target.value as 'mysql' | 'postgresql'
                    f('databaseType', dbType)
                    // Auto-switch default port
                    f('port', dbType === 'postgresql' ? 5432 : 3306)
                  }}>
                  <option value="mysql">MySQL / MariaDB</option>
                  <option value="postgresql">PostgreSQL</option>
                </select>
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2"><Field label="主机"><input className={input} value={form.host} onChange={e => f('host', e.target.value)} /></Field></div>
                <Field label="端口"><input className={input} type="number" value={form.port} onChange={e => f('port', +e.target.value)} /></Field>
              </div>
              <Field label="用户名"><input className={input} value={form.username} onChange={e => f('username', e.target.value)} /></Field>
              <Field label="密码"><input className={input} type="password" value={form.password} onChange={e => f('password', e.target.value)} /></Field>
              <Field label="数据库（可选）"><input className={input} value={form.database} onChange={e => f('database', e.target.value)} /></Field>

              {/* SSH Tunnel */}
              <div className="border-t border-gray-200 dark:border-gray-600 pt-3">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input type="checkbox" checked={form.ssh?.enabled ?? false}
                    onChange={e => fSSH('enabled', e.target.checked)} />
                  启用 SSH 隧道
                </label>
                {form.ssh?.enabled && (
                  <div className="mt-2 space-y-2 pl-4">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2"><Field label="SSH 主机"><input className={input} value={form.ssh.host} onChange={e => fSSH('host', e.target.value)} /></Field></div>
                      <Field label="端口"><input className={input} type="number" value={form.ssh.port} onChange={e => fSSH('port', +e.target.value)} /></Field>
                    </div>
                    <Field label="SSH 用户名"><input className={input} value={form.ssh.username} onChange={e => fSSH('username', e.target.value)} /></Field>
                    <Field label="认证方式">
                      <select className={input} value={form.ssh.authType} onChange={e => fSSH('authType', e.target.value)}>
                        <option value="password">密码</option>
                        <option value="privateKey">私钥</option>
                      </select>
                    </Field>
                    {form.ssh.authType === 'password'
                      ? <Field label="SSH 密码"><input className={input} type="password" value={form.ssh.password ?? ''} onChange={e => fSSH('password', e.target.value)} /></Field>
                      : <Field label="私钥路径"><input className={input} value={form.ssh.privateKeyPath ?? ''} onChange={e => fSSH('privateKeyPath', e.target.value)} /></Field>
                    }
                  </div>
                )}
              </div>
            </div>

            {testMsg && (
              <p className={`mt-3 text-sm ${testMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>{testMsg}</p>
            )}

            <div className="flex justify-between mt-5">
              <button onClick={handleTest} disabled={testing}
                className="text-sm px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                {testing ? '测试中...' : '测试连接'}
              </button>
              <div className="flex gap-2">
                <button onClick={() => setShowForm(false)}
                  className="text-sm px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">取消</button>
                <button onClick={handleSave}
                  className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700">保存</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const input = 'w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  )
}
