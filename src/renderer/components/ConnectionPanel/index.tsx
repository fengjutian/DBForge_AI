import React, { useEffect, useState } from 'react'
import { Database, FileText } from 'lucide-react'
import { useConnectionStore } from '../../store/connectionStore'
import { useSessionStore } from '../../store/sessionStore'
import type { ConnectionConfig, SSHTunnelConfig } from '../../../shared/types'

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

export default function ConnectionPanel(): React.ReactElement {
  const { connections, statuses, activeConnectionId, loadConnections, createConnection,
    updateConnection, deleteConnection } = useConnectionStore()
  const { activate, deactivate, activatingId, errors } = useSessionStore()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState<string | null>(null)
  useEffect(() => { loadConnections() }, [loadConnections])

  const openNew = () => { setEditingId(null); setForm(emptyForm()); setTestMsg(null); setShowForm(true) }
  const openEdit = (c: ConnectionConfig) => {
    setEditingId(c.id)
    setForm({ name: c.name, databaseType: c.databaseType || 'mysql', host: c.host, port: c.port,
      username: c.username, password: c.password, database: c.database ?? '', ssh: c.ssh ?? { ...emptySSH } })
    setTestMsg(null); setShowForm(true)
  }

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
      name: form.name, databaseType: form.databaseType || 'mysql', host: form.host, port: form.port,
      username: form.username, password: form.password, database: form.database, ssh: form.ssh
    } as ConnectionConfig)
    setTestMsg(result.success ? 'OK (' + result.latency + 'ms)' : 'FAIL: ' + result.error)
    setTesting(false)
  }

  const isSQLite = form.databaseType === 'sqlite'
  const input = 'w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'

  function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{label}{children}</label>
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <span className="font-semibold text-sm">连接管理</span>
        <button onClick={openNew} className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700">新建</button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {connections.length === 0 && <div className="text-center text-gray-400 text-sm mt-8">暂无连接</div>}
        {connections.map(c => {
          const status = (statuses as any)[c.id]?.state ?? 'disconnected'
          const isActive = activeConnectionId === c.id
          return (
            <div key={c.id}
              className={'flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-100 ' + (isActive ? 'bg-green-50 dark:bg-green-900/30' : '')}
              onClick={() => isActive ? deactivate(c.id) : activate(c.id)}>
              <span className={'w-2 h-2 rounded-full ' + STATUS_COLORS[status]} title={status} />
              <span className="text-xs">{c.databaseType === 'postgresql' ? <Database className="w-3 h-3 inline" /> : c.databaseType === 'sqlite' ? <FileText className="w-3 h-3 inline" /> : <Database className="w-3 h-3 inline" />}</span>
              <span className="flex-1 text-sm truncate">{c.name}</span>
              <span className="text-xs text-gray-400">{c.host}:{c.port}</span>
            </div>
          )
        })}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[600px] max-h-[90vh] overflow-y-auto p-5">
            <h2 className="font-semibold text-base mb-4">{editingId ? '编辑连接' : '新建连接'}</h2>
            <div className="space-y-3">
              <Field label="名称"><input className={input} value={form.name} onChange={e => f('name', e.target.value)} /></Field>
              <Field label="数据库类型">
                <select className={input} value={form.databaseType || 'mysql'}
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
                  <div className="col-span-2"><Field label="主机"><input className={input} value={form.host} onChange={e => f('host', e.target.value)} /></Field></div>
                  <Field label="端口"><input className={input} type="number" value={form.port} onChange={e => f('port', +e.target.value)} /></Field>
                </div>
                <Field label="用户名"><input className={input} value={form.username} onChange={e => f('username', e.target.value)} /></Field>
                <Field label="密码"><input className={input} type="password" value={form.password} onChange={e => f('password', e.target.value)} /></Field>
              </>}

              {isSQLite && <p className="text-xs text-gray-400">SQLite 是本地文件数据库，无需填写主机/端口/用户名/密码</p>}

              <Field label={isSQLite ? '数据库文件路径' : form.databaseType === 'postgresql' ? '数据库' : '数据库（可选）'}>
                <input className={input} value={form.database}
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
                      <div className="col-span-2"><Field label="SSH 主机"><input className={input} value={form.ssh.host} onChange={e => fSSH('host', e.target.value)} /></Field></div>
                      <Field label="端口"><input className={input} type="number" value={form.ssh.port} onChange={e => fSSH('port', +e.target.value)} /></Field>
                    </div>
                    <Field label="SSH 用户名"><input className={input} value={form.ssh.username} onChange={e => fSSH('username', e.target.value)} /></Field>
                    <Field label="SSH 密码"><input className={input} type="password" value={form.ssh.password} onChange={e => fSSH('password', e.target.value)} /></Field>
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
    </div>
  )
}
