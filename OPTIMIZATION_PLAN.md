# DBForge AI 优化计划

> 生成时间：2026-06-10  
> 基于项目全面分析得出的优化建议与实施路线图

---

## 📋 目录

- [一、架构层面优化](#一架构层面优化)
- [二、性能优化](#二性能优化)
- [三、用户体验优化](#三用户体验优化)
- [四、安全性增强](#四安全性增强)
- [五、测试与质量保障](#五测试与质量保障)
- [六、功能扩展](#六功能扩展)
- [七、开发体验优化](#七开发体验优化)
- [八、文档与国际化](#八文档与国际化)
- [优化优先级矩阵](#优化优先级矩阵)

---

## 一、架构层面优化

### 1.1 代码组织与模块化

**问题**：`AIModule.ts` (41.9KB) 和 `AIPanel/index.tsx` (43KB) 过于庞大，难以维护和测试。

**实施方案**：

```
src/main/services/AI/
├── index.ts              # 统一导出
├── AIModule.ts           # 主模块（精简至 <5KB）
├── providers/            # AI Provider 实现
│   ├── BaseProvider.ts   # 抽象基类
│   ├── OpenAIProvider.ts
│   ├── GroqProvider.ts
│   ├── ClaudeProvider.ts
│   ├── DeepSeekProvider.ts
│   └── OllamaProvider.ts
├── prompts/              # Prompt 模板
│   ├── textToSql.ts
│   ├── optimizeQuery.ts
│   ├── diagnoseError.ts
│   ├── schemaDoc.ts
│   └── securityAudit.ts
├── utils/                # 工具函数
│   ├── schemaFormatter.ts
│   ├── sqlFilter.ts
│   └── responseParser.ts
└── types.ts              # AI 相关类型扩展
```

**重构步骤**：
1. 提取 Provider 接口定义
2. 迁移各 Provider 实现到独立文件
3. 抽离 Prompt 模板为常量模块
4. 更新导入路径并验证功能

---

### 1.2 错误处理统一化

**现状**：各 IPC handler 错误处理不一致，部分缺少用户友好提示。

**实施方案**：

```typescript
// src/main/middleware/errorHandler.ts

export enum ErrorCategory {
  CONNECTION = 'CONNECTION',
  QUERY = 'QUERY',
  AI = 'AI',
  BACKUP = 'BACKUP',
  CONFIG = 'CONFIG'
}

export interface AppError extends Error {
  category: ErrorCategory
  code: string
  userMessage: string
  suggestions?: string[]
  recoverable: boolean
}

export function handleIPCError(error: unknown, context: string): IPCError {
  const appError = normalizeError(error, context)
  
  // 记录详细日志
  logger.error({
    module: context,
    error: appError,
    stack: appError.stack,
    timestamp: Date.now()
  })
  
  // 返回用户友好错误
  return {
    code: appError.code,
    message: appError.message,
    userMessage: appError.userMessage,
    suggestions: appError.suggestions
  }
}

// 使用示例
ipcMain.handle(IPC.CONNECTION_ACTIVATE, async (_, id) => {
  try {
    await connectionManager.activateConnection(id)
  } catch (error) {
    throw createConnectionError(error, id)
  }
})
```

**影响文件**：
- `src/main/ipc/*.ts`（所有 IPC handler）
- 新增 `src/main/middleware/errorHandler.ts`
- 新增 `src/main/services/Logger.ts`

---

### 1.3 依赖注入改进

**现状**：服务间硬编码依赖，测试时需手动 mock。

**实施方案**：引入轻量级 DI 容器

```typescript
// src/main/di/container.ts

import { ConnectionManager } from '../services/ConnectionManager'
import { QueryExecutor } from '../services/QueryExecutor'
import { AIModule } from '../services/AIModule'

class ServiceContainer {
  private services = new Map<string, any>()
  
  register<T>(name: string, factory: () => T): void {
    this.services.set(name, factory())
  }
  
  resolve<T>(name: string): T {
    const service = this.services.get(name)
    if (!service) throw new Error(`Service not found: ${name}`)
    return service
  }
}

export const container = new ServiceContainer()

// 注册服务
container.register('connectionManager', () => ConnectionManager.getInstance())
container.register('queryExecutor', () => new QueryExecutor(
  container.resolve('connectionManager')
))
container.register('aiModule', () => new AIModule(
  container.resolve('configStore')
))
```

---

## 二、性能优化

### 2.1 数据库连接池优化

**当前实现**：[ConnectionManager.ts](src/main/services/ConnectionManager.ts:87)

**优化方案**：

```typescript
interface PoolConfig {
  maxConnections: number      // 默认 10
  idleTimeout: number         // 默认 30 秒
  healthCheckInterval: number // 默认 60 秒
  acquireTimeout: number      // 默认 5 秒
}

class ConnectionManager {
  private pools: Map<string, mysql2.Pool> = new Map()
  private poolConfigs: Map<string, PoolConfig> = new Map()
  private healthCheckTimers: Map<string, NodeJS.Timeout> = new Map()
  
  async activateConnection(id: string): Promise<void> {
    const config = configStore.getConnection(id)
    
    // 创建连接池时配置健康检查
    const pool = mysql.createPool({
      ...config,
      connectionLimit: 10,
      idleTimeout: 30000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    })
    
    // 定期健康检查
    const timer = setInterval(() => {
      this.performHealthCheck(id, pool)
    }, 60000)
    
    this.pools.set(id, pool)
    this.healthCheckTimers.set(id, timer)
  }
  
  private async performHealthCheck(id: string, pool: mysql2.Pool): Promise<void> {
    try {
      await pool.execute('SELECT 1')
    } catch (error) {
      logger.warn(`Connection ${id} health check failed, reconnecting...`)
      await this.reconnectConnection(id)
    }
  }
  
  async deactivateConnection(id: string): Promise<void> {
    const timer = this.healthCheckTimers.get(id)
    if (timer) {
      clearInterval(timer)
      this.healthCheckTimers.delete(id)
    }
    
    const pool = this.pools.get(id)
    if (pool) {
      await pool.end()
      this.pools.delete(id)
    }
  }
}
```

**预期收益**：
- 减少连接泄漏风险
- 自动恢复失效连接
- 提升长时间运行稳定性

---

### 2.2 Schema 缓存策略

**实施方案**：

```typescript
// src/main/services/SchemaCache.ts

interface CacheEntry {
  data: DatabaseSchema
  timestamp: number
  ttl: number // Time To Live in milliseconds
}

class SchemaCache {
  private cache = new Map<string, CacheEntry>()
  private defaultTTL = 5 * 60 * 1000 // 5 分钟
  
  get(connectionId: string): DatabaseSchema | null {
    const entry = this.cache.get(connectionId)
    if (!entry) return null
    
    // 检查是否过期
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(connectionId)
      return null
    }
    
    return entry.data
  }
  
  set(connectionId: string, schema: DatabaseSchema, ttl?: number): void {
    this.cache.set(connectionId, {
      data: schema,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTTL
    })
  }
  
  invalidate(connectionId: string): void {
    this.cache.delete(connectionId)
  }
  
  invalidateAll(): void {
    this.cache.clear()
  }
}

export const schemaCache = new SchemaCache()
```

**集成到 IPC handler**：

```typescript
// src/main/ipc/connection.ts

ipcMain.handle(IPC.SCHEMA_FETCH, async (_, connectionId) => {
  // 先查缓存
  const cached = schemaCache.get(connectionId)
  if (cached) return cached
  
  // 缓存未命中，查询数据库
  const schema = await connectionManager.fetchSchema(connectionId)
  schemaCache.set(connectionId, schema)
  return schema
})

// Schema 变更时使缓存失效
ipcMain.handle(IPC.QUERY_EXECUTE, async (_, options) => {
  const result = await queryExecutor.execute(options)
  
  // DDL 操作使缓存失效
  if (isDDLStatement(options.sql)) {
    schemaCache.invalidate(options.connectionId)
  }
  
  return result
})
```

---

### 2.3 AI 响应流式传输优化

**当前问题**：
- 缺少断线重连机制
- 用户取消时仍消耗 token
- 无响应缓存

**优化方案**：

```typescript
// src/renderer/hooks/useAIStream.ts

export function useAIStream() {
  const [streams, setStreams] = useState<Map<string, StreamState>>(new Map())
  const abortControllers = useRef<Map<string, AbortController>>(new Map())
  
  const startStream = useCallback(async (
    operation: string,
    params: any,
    streamId: string
  ) => {
    // 取消之前的请求
    const existingController = abortControllers.current.get(streamId)
    if (existingController) {
      existingController.abort()
    }
    
    const controller = new AbortController()
    abortControllers.current.set(streamId, controller)
    
    try {
      // 检查缓存
      const cached = aiCache.get(operation, params)
      if (cached) {
        updateStream(streamId, cached)
        return
      }
      
      // 发起流式请求
      const response = await fetch('/api/ai/stream', {
        method: 'POST',
        body: JSON.stringify({ operation, params, streamId }),
        signal: controller.signal
      })
      
      // 处理流式响应...
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Stream cancelled by user')
      } else {
        // 自动重试（最多 3 次）
        await retryStream(operation, params, streamId)
      }
    } finally {
      abortControllers.current.delete(streamId)
    }
  }, [])
  
  const cancelStream = useCallback((streamId: string) => {
    const controller = abortControllers.current.get(streamId)
    if (controller) {
      controller.abort()
    }
  }, [])
  
  return { startStream, cancelStream, /* ... */ }
}
```

---

### 2.4 Monaco Editor Worker 优化

**当前配置**：[electron.vite.config.ts:61](electron.vite.config.ts:61)

**优化方案**：

```typescript
// electron.vite.config.ts

optimizeDeps: {
  include: [
    'monaco-editor/esm/vs/editor/editor.worker',
    'monaco-editor/esm/vs/language/json/json.worker',
    'monaco-editor/esm/vs/language/css/css.worker',
    'monaco-editor/esm/vs/language/html/html.worker',
    'monaco-editor/esm/vs/language/typescript/ts.worker',
    'monaco-editor/esm/vs/basic-languages/sql/sql.contribution'
  ]
}
```

**预加载策略**：

```typescript
// src/renderer/components/SQLEditor/index.tsx

useEffect(() => {
  // 预加载 SQL 语言支持
  import('monaco-editor/esm/vs/basic-languages/sql/sql.contribution')
  import('monaco-editor/esm/vs/basic-languages/mysql/mysql.contribution')
}, [])
```

---

## 三、用户体验优化

### 3.1 全局 Loading 管理

**实施方案**：

```typescript
// src/renderer/store/loadingStore.ts

import { create } from 'zustand'

interface LoadingTask {
  id: string
  message: string
  progress?: number // 0-100
  estimatedTime?: number // 预估剩余时间（秒）
  createdAt: number
}

interface LoadingState {
  tasks: Map<string, LoadingTask>
  addTask: (task: Omit<LoadingTask, 'id' | 'createdAt'>) => string
  updateTask: (id: string, updates: Partial<LoadingTask>) => void
  removeTask: (id: string) => void
  clearAll: () => void
}

export const useLoadingStore = create<LoadingState>((set, get) => ({
  tasks: new Map(),
  
  addTask: (task) => {
    const id = Math.random().toString(36).substring(7)
    set((state) => {
      const newTasks = new Map(state.tasks)
      newTasks.set(id, { ...task, id, createdAt: Date.now() })
      return { tasks: newTasks }
    })
    return id
  },
  
  updateTask: (id, updates) => {
    set((state) => {
      const newTasks = new Map(state.tasks)
      const task = newTasks.get(id)
      if (task) {
        newTasks.set(id, { ...task, ...updates })
      }
      return { tasks: newTasks }
    })
  },
  
  removeTask: (id) => {
    set((state) => {
      const newTasks = new Map(state.tasks)
      newTasks.delete(id)
      return { tasks: newTasks }
    })
  },
  
  clearAll: () => set({ tasks: new Map() })
}))
```

**UI 组件**：

```tsx
// src/renderer/components/LoadingBar/index.tsx

export default function LoadingBar() {
  const tasks = useLoadingStore((state) => Array.from(state.tasks.values()))
  
  if (tasks.length === 0) return null
  
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-blue-600">
      {tasks.map(task => (
        <div key={task.id} className="px-4 py-2 text-white text-sm">
          <div className="flex items-center justify-between">
            <span>{task.message}</span>
            {task.progress !== undefined && (
              <span>{Math.round(task.progress)}%</span>
            )}
          </div>
          {task.progress !== undefined && (
            <div className="mt-1 h-1 bg-blue-800 rounded overflow-hidden">
              <div 
                className="h-full bg-white transition-all"
                style={{ width: `${task.progress}%` }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
```

---

### 3.2 查询结果虚拟化

**问题**：大数据集渲染卡顿（>1000 行）

**实施方案**：使用 `tanstack-virtual`

```bash
npm install @tanstack/react-virtual
```

```tsx
// src/renderer/components/DataTable/VirtualTable.tsx

import { useVirtualizer } from '@tanstack/react-virtual'

interface VirtualTableProps {
  columns: ColumnMeta[]
  rows: Record<string, unknown>[]
}

export default function VirtualTable({ columns, rows }: VirtualTableProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 35, // 每行高度
    overscan: 10 // 预渲染行数
  })
  
  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative'
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`
            }}
          >
            <TableRow row={rows[virtualRow.index]} columns={columns} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

**预期收益**：
- 万级数据流畅滚动
- 内存占用降低 90%+

---

### 3.3 智能补全增强

**当前实现**：[schemaCompletion.ts](src/renderer/utils/schemaCompletion.ts:1)

**优化方案**：

```typescript
// src/renderer/services/SQLCompletion.ts

import * as monaco from 'monaco-editor'

class SQLCompletionProvider implements monaco.languages.CompletionItemProvider {
  private recentKeywords: Map<string, number> = new Map()
  
  constructor() {
    // 从查询历史加载热词
    this.loadHistoryKeywords()
  }
  
  async provideCompletionItems(
    model: monaco.editor.ITextModel,
    position: monaco.Position
  ): Promise<monaco.languages.CompletionList> {
    const word = model.getWordUntilPosition(position)
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn
    }
    
    const completions: monaco.languages.CompletionItem[] = []
    
    // 1. Schema 补全（表名、字段名）
    completions.push(...this.getSchemaCompletions(word.word, range))
    
    // 2. SQL 关键字补全（按使用频率排序）
    completions.push(...this.getKeywordCompletions(word.word, range))
    
    // 3. JOIN 条件推断
    if (this.isJoinContext(model, position)) {
      completions.push(...this.getJoinConditionCompletions(range))
    }
    
    // 4. 常用函数快捷插入
    completions.push(...this.getFunctionCompletions(word.word, range))
    
    return {
      suggestions: completions.sort((a, b) => (b.sortText || '').localeCompare(a.sortText || ''))
    }
  }
  
  private getSchemaCompletions(prefix: string, range: monaco.IRange): monaco.languages.CompletionItem[] {
    const schema = useConnectionStore.getState().currentSchema
    if (!schema) return []
    
    return schema.databases.flatMap(db =>
      db.tables.flatMap(table => [
        {
          label: table.name,
          kind: monaco.languages.CompletionItemKind.Class,
          insertText: table.name,
          range,
          sortText: this.getKeywordFrequency(table.name).toString(),
          detail: `表 (${table.columns.length} 列)`
        },
        ...table.columns.map(col => ({
          label: col.name,
          kind: monaco.languages.CompletionItemKind.Field,
          insertText: col.name,
          range,
          sortText: this.getKeywordFrequency(col.name).toString(),
          detail: `${col.type}${col.nullable ? ' | NULL' : ' | NOT NULL'}`
        }))
      ])
    ).filter(item => item.label.startsWith(prefix))
  }
  
  private isJoinContext(model: monaco.editor.ITextModel, position: monaco.Position): boolean {
    const lineContent = model.getLineContent(position.lineNumber)
    return /\bJOIN\b/i.test(lineContent.substring(0, position.column))
  }
  
  private getJoinConditionCompletions(range: monaco.IRange): monaco.languages.CompletionItem[] {
    // 基于外键关系推断 JOIN 条件
    const schema = useConnectionStore.getState().currentSchema
    if (!schema) return []
    
    return schema.databases.flatMap(db =>
      db.tables.flatMap(table =>
        table.foreignKeys.map(fk => ({
          label: `${fk.columnName} = ${fk.referencedTable}.${fk.referencedColumn}`,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: `${table.name}.${fk.columnName} = ${fk.referencedTable}.${fk.referencedColumn}`,
          range,
          detail: `外键关联`
        }))
      )
    )
  }
}

monaco.languages.registerCompletionItemProvider('sql', new SQLCompletionProvider())
```

---

### 3.4 快捷键系统

**实施方案**：

```typescript
// src/renderer/hooks/useShortcuts.ts

import { useEffect } from 'react'
import { useEditorStore } from '../store/editorStore'
import { useResultStore } from '../store/resultStore'

interface ShortcutConfig {
  key: string
  modifier?: 'ctrl' | 'cmd' | 'shift' | 'alt'
  action: () => void
  description: string
}

const SHORTCUTS: ShortcutConfig[] = [
  {
    key: 'Enter',
    modifier: 'ctrl',
    action: () => {
      const tab = useEditorStore.getState().activeTab
      if (tab) {
        useResultStore.getState().executeQuery(tab.id)
      }
    },
    description: '执行查询'
  },
  {
    key: '/',
    modifier: 'ctrl',
    action: () => {
      // 切换注释
      const editor = getActiveEditor()
      if (editor) {
        editor.trigger('keyboard', 'editor.action.commentLine', {})
      }
    },
    description: '切换注释'
  },
  {
    key: 'F5',
    action: () => {
      // 刷新 Schema
      window.electronAPI.schema.refresh(activeConnectionId)
    },
    description: '刷新 Schema'
  },
  {
    key: 'k',
    modifier: 'ctrl',
    action: () => {
      // 打开命令面板
      showCommandPalette()
    },
    description: '命令面板'
  },
  {
    key: 'f',
    modifier: 'ctrl',
    action: () => {
      // 格式化 SQL
      formatCurrentSQL()
    },
    description: '格式化 SQL'
  }
]

export function useShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      for (const shortcut of SHORTCUTS) {
        if (matchesShortcut(e, shortcut)) {
          e.preventDefault()
          shortcut.action()
          break
        }
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}

function matchesShortcut(e: KeyboardEvent, shortcut: ShortcutConfig): boolean {
  if (e.key.toLowerCase() !== shortcut.key.toLowerCase()) return false
  
  if (shortcut.modifier === 'ctrl' && !e.ctrlKey && !e.metaKey) return false
  if (shortcut.modifier === 'cmd' && !e.metaKey) return false
  if (shortcut.modifier === 'shift' && !e.shiftKey) return false
  if (shortcut.modifier === 'alt' && !e.altKey) return false
  
  return true
}
```

---

## 四、安全性增强

### 4.1 SQL 注入防护增强

**当前问题**：[AIModule.ts:75](src/main/services/AIModule.ts:75) 的正则匹配可被绕过

**优化方案**：使用 SQL 解析器进行 AST 分析

```bash
npm install node-sql-parser
```

```typescript
// src/main/services/SQLValidator.ts

import { Parser } from 'node-sql-parser'

const ALLOWED_STATEMENTS = ['SELECT', 'WITH', 'SHOW', 'DESCRIBE', 'EXPLAIN']

export interface ValidationResult {
  valid: boolean
  reason?: string
  statementType?: string
}

export function validateSQL(sql: string, mode: 'readonly' | 'full'): ValidationResult {
  const parser = new Parser()
  
  try {
    // 解析 SQL 为 AST
    const ast = parser.parse(sql.trim(), 'MySQL')
    
    // 获取语句类型
    const statementType = ast.type?.toUpperCase()
    
    if (!statementType) {
      return { valid: false, reason: '无法解析 SQL 语句' }
    }
    
    // 只读模式验证
    if (mode === 'readonly') {
      if (!ALLOWED_STATEMENTS.includes(statementType)) {
        return {
          valid: false,
          reason: `只读模式下仅允许 ${ALLOWED_STATEMENTS.join(', ')} 语句`,
          statementType
        }
      }
      
      // 检测子查询中的写操作
      if (hasWriteSubquery(ast)) {
        return {
          valid: false,
          reason: '检测到子查询中包含危险操作',
          statementType
        }
      }
    }
    
    // 检测危险操作（即使是完整模式）
    if (isDangerousOperation(ast)) {
      return {
        valid: false,
        reason: '检测到高危操作（DROP DATABASE / TRUNCATE 等），请谨慎执行',
        statementType,
        dangerous: true
      }
    }
    
    return { valid: true, statementType }
  } catch (error) {
    return {
      valid: false,
      reason: `SQL 语法错误: ${(error as Error).message}`
    }
  }
}

function hasWriteSubquery(ast: any): boolean {
  // 递归检查 AST 中是否存在写操作
  // 实现略...
  return false
}

function isDangerousOperation(ast: any): boolean {
  // 检测 DROP DATABASE, DROP TABLE 等高危操作
  // 实现略...
  return false
}
```

**集成到 AI 模块**：

```typescript
// src/main/services/AIModule.ts

import { validateSQL } from './SQLValidator'

export function filterReadonlySQL(sql: string, mode: 'readonly' | 'full' = 'readonly'): string | null {
  const result = validateSQL(sql, mode)
  
  if (!result.valid) {
    logger.warn(`SQL validation failed: ${result.reason}`)
    return null
  }
  
  return sql.trim()
}
```

---

### 4.2 敏感数据加密升级

**当前问题**：密码使用对称加密存储在本地文件

**优化方案**：使用操作系统密钥链

```bash
npm install keytar
```

```typescript
// src/main/services/SecureStorage.ts

import keytar from 'keytar'

const SERVICE_NAME = 'DBForge AI'
const ACCOUNT_PREFIX = 'connection:'

class SecureStorage {
  /**
   * 保存密码到系统密钥链
   */
  async savePassword(connectionId: string, password: string): Promise<void> {
    await keytar.setPassword(SERVICE_NAME, `${ACCOUNT_PREFIX}${connectionId}`, password)
  }
  
  /**
   * 从系统密钥链读取密码
   */
  async getPassword(connectionId: string): Promise<string | null> {
    return await keytar.getPassword(SERVICE_NAME, `${ACCOUNT_PREFIX}${connectionId}`)
  }
  
  /**
   * 删除密码
   */
  async deletePassword(connectionId: string): Promise<void> {
    await keytar.deletePassword(SERVICE_NAME, `${ACCOUNT_PREFIX}${connectionId}`)
  }
  
  /**
   * 保存 API Key
   */
  async saveApiKey(provider: string, apiKey: string): Promise<void> {
    await keytar.setPassword(SERVICE_NAME, `api-key:${provider}`, apiKey)
  }
  
  /**
   * 读取 API Key
   */
  async getApiKey(provider: string): Promise<string | null> {
    return await keytar.getPassword(SERVICE_NAME, `api-key:${provider}`)
  }
}

export const secureStorage = new SecureStorage()
```

**平台支持**：
- macOS: Keychain
- Windows: Credential Manager
- Linux: libsecret (GNOME Keyring / KWallet)

---

### 4.3 API Key 轮换提醒

**实施方案**：

```typescript
// src/main/services/APIKeyMonitor.ts

interface APIKeyUsage {
  provider: string
  lastUsed: number
  requestCount: number
  quotaLimit?: number
  expiryDate?: number
}

class APIKeyMonitor {
  private usageMap = new Map<string, APIKeyUsage>()
  
  recordUsage(provider: string): void {
    const usage = this.usageMap.get(provider) || {
      provider,
      lastUsed: 0,
      requestCount: 0
    }
    
    usage.lastUsed = Date.now()
    usage.requestCount++
    this.usageMap.set(provider, usage)
    
    // 检查配额
    this.checkQuota(provider, usage)
  }
  
  private checkQuota(provider: string, usage: APIKeyUsage): void {
    if (usage.quotaLimit && usage.requestCount >= usage.quotaLimit * 0.8) {
      // 发送警告通知
      this.sendNotification({
        type: 'warning',
        title: 'API 配额即将用完',
        message: `${provider} 已使用 ${usage.requestCount}/${usage.quotaLimit} 次请求`
      })
    }
    
    if (usage.expiryDate && Date.now() >= usage.expiryDate - 7 * 24 * 60 * 60 * 1000) {
      this.sendNotification({
        type: 'warning',
        title: 'API Key 即将过期',
        message: `${provider} 的 API Key 将在 7 天后过期，请及时更新`
      })
    }
  }
  
  private sendNotification(notification: Notification): void {
    // 通过 IPC 发送到渲染进程
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send(IPC.AI_NOTIFICATION, notification)
    })
  }
}
```

---

## 五、测试与质量保障

### 5.1 测试覆盖率提升

**目标**：核心模块覆盖率 > 80%

**测试计划**：

```
tests/
├── unit/
│   ├── ConnectionManager.test.ts     # P0
│   ├── AIModule.test.ts              # P0
│   ├── QueryExecutor.test.ts         # 已有
│   ├── BackupManager.test.ts         # P1
│   ├── ConfigStore.test.ts
│   └── SQLValidator.test.ts
├── integration/
│   ├── ai-flow.test.ts               # AI 完整流程
│   ├── query-flow.test.ts            # 查询完整流程
│   └── backup-flow.test.ts           # 备份完整流程
└── e2e/
    ├── connection.spec.ts            # Playwright E2E
    ├── query-execution.spec.ts
    └── ai-generation.spec.ts
```

**示例测试**：

```typescript
// tests/unit/ConnectionManager.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ConnectionManager } from '../../src/main/services/ConnectionManager'
import { configStore } from '../../src/main/services/ConfigStore'

vi.mock('../../src/main/services/ConfigStore')

describe('ConnectionManager', () => {
  let manager: ConnectionManager
  
  beforeEach(() => {
    manager = ConnectionManager.getInstance()
    vi.clearAllMocks()
  })
  
  describe('activateConnection', () => {
    it('should activate a valid connection', async () => {
      const mockConfig = {
        id: 'test-1',
        host: 'localhost',
        port: 3306,
        username: 'root',
        password: 'password'
      }
      
      vi.mocked(configStore.getConnection).mockReturnValue(mockConfig)
      
      await manager.activateConnection('test-1')
      
      expect(manager.getStatus('test-1')).toEqual({
        id: 'test-1',
        state: 'connected'
      })
    })
    
    it('should throw error for non-existent connection', async () => {
      vi.mocked(configStore.getConnection).mockReturnValue(undefined)
      
      await expect(manager.activateConnection('invalid'))
        .rejects.toThrow('Connection not found: invalid')
    })
    
    it('should handle connection failure gracefully', async () => {
      const mockConfig = {
        id: 'test-2',
        host: 'invalid-host',
        port: 3306,
        username: 'root',
        password: 'password'
      }
      
      vi.mocked(configStore.getConnection).mockReturnValue(mockConfig)
      
      await expect(manager.activateConnection('test-2'))
        .rejects.toThrow()
      
      expect(manager.getStatus('test-2').state).toBe('error')
    })
  })
  
  describe('health check', () => {
    it('should detect and reconnect stale connections', async () => {
      // 测试健康检查逻辑
    })
  })
})
```

---

### 5.2 E2E 测试

**工具**：Playwright for Electron

```bash
npm install -D @playwright/test electron
```

```typescript
// tests/e2e/query-execution.spec.ts

import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'

test.describe('Query Execution Flow', () => {
  let app: Awaited<ReturnType<typeof electron.launch>>
  let page: Awaited<ReturnType<typeof app.firstWindow>>
  
  test.beforeEach(async () => {
    app = await electron.launch({
      args: ['.'],
      env: { NODE_ENV: 'test' }
    })
    page = await app.firstWindow()
  })
  
  test.afterEach(async () => {
    await app.close()
  })
  
  test('should execute a simple SELECT query', async () => {
    // 1. 创建测试连接
    await page.click('[data-testid="new-connection"]')
    await page.fill('[name="host"]', 'localhost')
    await page.fill('[name="username"]', 'root')
    await page.fill('[name="password"]', 'password')
    await page.click('[data-testid="save-connection"]')
    
    // 2. 激活连接
    await page.click('[data-testid="connection-item"]:first-child')
    
    // 3. 输入 SQL
    await page.fill('.monaco-editor textarea', 'SELECT 1 AS test')
    
    // 4. 执行查询
    await page.click('[data-testid="execute-query"]')
    
    // 5. 验证结果
    await expect(page.locator('[data-testid="result-table"]')).toBeVisible()
    await expect(page.locator('td:has-text("1")')).toBeVisible()
  })
  
  test('should generate SQL via AI', async () => {
    // 测试 AI 生成 SQL 流程
  })
})
```

---

### 5.3 CI/CD 流水线

**配置文件**：`.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node-version: [18, 20]
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Lint
        run: npm run lint
      
      - name: Type check
        run: npm run typecheck
      
      - name: Run tests
        run: npm test -- --coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
  
  build:
    needs: test
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
      
      - name: Package
        run: npm run package
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/
```

---

## 六、功能扩展

### 6.1 多数据库适配器

**接口定义**：

```typescript
// src/main/adapters/DatabaseAdapter.ts

export interface DatabaseAdapter {
  /**
   * 连接到数据库
   */
  connect(config: ConnectionConfig): Promise<void>
  
  /**
   * 断开连接
   */
  disconnect(): Promise<void>
  
  /**
   * 执行 SQL 查询
   */
  execute(sql: string, params?: any[]): Promise<QueryResult>
  
  /**
   * 获取 Schema 信息
   */
  fetchSchema(): Promise<DatabaseSchema>
  
  /**
   * 备份数据库
   */
  backup(options: BackupOptions): AsyncIterable<BackupProgress>
  
  /**
   * 测试连接
   */
  test(config: ConnectionConfig): Promise<TestResult>
  
  /**
   * 获取适配器元信息
   */
  getMetadata(): AdapterMetadata
}

export interface AdapterMetadata {
  name: string
  supportedVersions: string[]
  features: {
    ssl: boolean
    ssh: boolean
    backup: boolean
    streaming: boolean
  }
}
```

**MySQL 适配器实现**：

```typescript
// src/main/adapters/MySQLAdapter.ts

import mysql2 from 'mysql2/promise'
import { DatabaseAdapter } from './DatabaseAdapter'

export class MySQLAdapter implements DatabaseAdapter {
  private pool: mysql2.Pool | null = null
  
  async connect(config: ConnectionConfig): Promise<void> {
    this.pool = mysql2.createPool({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database,
      connectionLimit: 10
    })
  }
  
  async execute(sql: string): Promise<QueryResult> {
    if (!this.pool) throw new Error('Not connected')
    
    const startTime = Date.now()
    const [rows] = await this.pool.execute(sql)
    
    return {
      columns: this.extractColumns(rows),
      rows: rows as Record<string, unknown>[],
      executionTime: Date.now() - startTime,
      sql
    }
  }
  
  async fetchSchema(): Promise<DatabaseSchema> {
    // 实现 MySQL Schema 查询逻辑
    const databases = await this.queryDatabases()
    const tables = await this.queryTables()
    const columns = await this.queryColumns()
    
    return {
      connectionId: '',
      databases: this.buildSchemaHierarchy(databases, tables, columns),
      fetchedAt: Date.now()
    }
  }
  
  getMetadata(): AdapterMetadata {
    return {
      name: 'MySQL',
      supportedVersions: ['5.7', '8.0', '8.1'],
      features: {
        ssl: true,
        ssh: true,
        backup: true,
        streaming: false
      }
    }
  }
  
  // ... 其他方法实现
}
```

**PostgreSQL 适配器（待实现）**：

```typescript
// src/main/adapters/PostgreSQLAdapter.ts

import pg from 'pg'
import { DatabaseAdapter } from './DatabaseAdapter'

export class PostgreSQLAdapter implements DatabaseAdapter {
  private client: pg.Client | null = null
  
  async connect(config: ConnectionConfig): Promise<void> {
    this.client = new pg.Client({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database
    })
    
    await this.client.connect()
  }
  
  // ... 实现其他方法
}
```

**适配器工厂**：

```typescript
// src/main/adapters/AdapterFactory.ts

import { DatabaseAdapter } from './DatabaseAdapter'
import { MySQLAdapter } from './MySQLAdapter'
import { PostgreSQLAdapter } from './PostgreSQLAdapter'

export enum DatabaseType {
  MYSQL = 'mysql',
  POSTGRESQL = 'postgresql',
  SQLITE = 'sqlite'
}

export class AdapterFactory {
  static create(type: DatabaseType): DatabaseAdapter {
    switch (type) {
      case DatabaseType.MYSQL:
        return new MySQLAdapter()
      case DatabaseType.POSTGRESQL:
        return new PostgreSQLAdapter()
      default:
        throw new Error(`Unsupported database type: ${type}`)
    }
  }
}
```

---

### 6.2 ER 图可视化增强

**当前状态**：[ERDiagram](src/renderer/components/ERDiagram/index.tsx:1) 需完善

**优化方案**：集成 `reactflow` 或 `cytoscape`

```bash
npm install reactflow
```

```tsx
// src/renderer/components/ERDiagram/EnhancedERDiagram.tsx

import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap
} from 'reactflow'
import 'reactflow/dist/style.css'

interface ERDiagramProps {
  schema: DatabaseSchema
}

export default function EnhancedERDiagram({ schema }: ERDiagramProps) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = []
    const edges: Edge[] = []
    
    schema.databases.forEach(db => {
      db.tables.forEach(table => {
        // 创建表节点
        nodes.push({
          id: `${db.name}.${table.name}`,
          type: 'tableNode',
          position: calculatePosition(nodes.length),
          data: {
            tableName: table.name,
            columns: table.columns,
            primaryKeys: table.primaryKeys
          }
        })
        
        // 创建外键连线
        table.foreignKeys.forEach(fk => {
          edges.push({
            id: `${table.name}-${fk.columnName}`,
            source: `${db.name}.${table.name}`,
            target: `${db.name}.${fk.referencedTable}`,
            label: `${fk.columnName} → ${fk.referencedColumn}`,
            type: 'smoothstep'
          })
        })
      })
    })
    
    return { nodes, edges }
  }, [schema])
  
  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        attributionPosition="bottom-right"
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  )
}
```

---

### 6.3 查询执行计划可视化

**实施方案**：

```typescript
// src/main/services/QueryPlanAnalyzer.ts

interface QueryPlan {
  id: number
  selectType: string
  table: string
  type: string
  possibleKeys: string[]
  key: string
  keyLen: string
  ref: string
  rows: number
  extra: string
}

export class QueryPlanAnalyzer {
  async analyze(connectionId: string, sql: string): Promise<QueryAnalysis> {
    const result = await queryExecutor.execute({
      connectionId,
      sql: `EXPLAIN ${sql}`
    })
    
    const plan = result.rows as QueryPlan[]
    
    return {
      plan,
      warnings: this.detectIssues(plan),
      suggestions: this.generateSuggestions(plan),
      estimatedCost: this.calculateCost(plan)
    }
  }
  
  private detectIssues(plan: QueryPlan[]): string[] {
    const warnings: string[] = []
    
    plan.forEach(step => {
      // 全表扫描检测
      if (step.type === 'ALL') {
        warnings.push(`表 "${step.table}" 进行全表扫描，建议添加索引`)
      }
      
      // 临时表检测
      if (step.extra?.includes('Using temporary')) {
        warnings.push('查询使用了临时表，可能影响性能')
      }
      
      // 文件排序检测
      if (step.extra?.includes('Using filesort')) {
        warnings.push('查询使用了文件排序，建议优化 ORDER BY')
      }
    })
    
    return warnings
  }
  
  private generateSuggestions(plan: QueryPlan[]): string[] {
    const suggestions: string[] = []
    
    // 基于执行计划生成优化建议
    // 实现略...
    
    return suggestions
  }
}
```

**UI 展示**：

```tsx
// src/renderer/components/QueryPlan/index.tsx

export default function QueryPlanViewer({ plan }: { plan: QueryAnalysis }) {
  return (
    <div className="space-y-4">
      {/* 执行计划表格 */}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th>ID</th>
            <th>表</th>
            <th>类型</th>
            <th>索引</th>
            <th>行数</th>
            <th>额外信息</th>
          </tr>
        </thead>
        <tbody>
          {plan.plan.map(step => (
            <tr key={step.id} className="border-b hover:bg-gray-50">
              <td>{step.id}</td>
              <td>{step.table}</td>
              <td>
                <span className={`badge ${getTypeColor(step.type)}`}>
                  {step.type}
                </span>
              </td>
              <td>{step.key || '-'}</td>
              <td>{step.rows}</td>
              <td>{step.extra}</td>
            </tr>
          ))}
        </tbody>
      </table>
      
      {/* 警告和建议 */}
      {plan.warnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
          <h4 className="font-semibold text-yellow-800 mb-2">⚠️ 警告</h4>
          <ul className="list-disc list-inside space-y-1">
            {plan.warnings.map((w, i) => (
              <li key={i} className="text-sm text-yellow-700">{w}</li>
            ))}
          </ul>
        </div>
      )}
      
      {plan.suggestions.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded p-3">
          <h4 className="font-semibold text-blue-800 mb-2">💡 优化建议</h4>
          <ul className="list-disc list-inside space-y-1">
            {plan.suggestions.map((s, i) => (
              <li key={i} className="text-sm text-blue-700">{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
```

---

## 七、开发体验优化

### 7.1 结构化日志系统

**实施方案**：

```bash
npm install winston winston-daily-rotate-file
```

```typescript
// src/main/services/Logger.ts

import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import { app } from 'electron'
import { join } from 'path'

class Logger {
  private logger: winston.Logger
  
  constructor() {
    const logDir = join(app.getPath('userData'), 'logs')
    
    this.logger = winston.createLogger({
      level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        // 控制台输出（开发环境）
        ...(process.env.NODE_ENV === 'development'
          ? [new winston.transports.Console({
              format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
              )
            })]
          : []),
        
        // 应用日志文件
        new DailyRotateFile({
          filename: join(logDir, 'app-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '10m',
          maxFiles: '30d'
        }),
        
        // 错误日志文件
        new DailyRotateFile({
          filename: join(logDir, 'error-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          level: 'error',
          maxSize: '10m',
          maxFiles: '90d'
        })
      ]
    })
  }
  
  info(message: string, meta?: any): void {
    this.logger.info(message, meta)
  }
  
  warn(message: string, meta?: any): void {
    this.logger.warn(message, meta)
  }
  
  error(message: string, error?: Error | any): void {
    this.logger.error(message, { error, stack: error?.stack })
  }
  
  debug(message: string, meta?: any): void {
    this.logger.debug(message, meta)
  }
}

export const logger = new Logger()
```

**使用示例**：

```typescript
// 替换所有 console.log/error

logger.info({
  module: 'ConnectionManager',
  action: 'activate',
  connectionId: 'conn-123',
  host: 'localhost'
})

logger.error('Failed to execute query', {
  module: 'QueryExecutor',
  sql: 'SELECT * FROM users',
  error: err.message,
  stack: err.stack
})
```

---

### 7.2 配置热重载

**实施方案**：

```typescript
// src/main/services/ConfigStore.ts

import fs from 'fs'
import { watch } from 'chokidar'

class ConfigStore {
  private watcher: ReturnType<typeof watch> | null = null
  
  init(): void {
    // ... 现有初始化逻辑
    
    // 监听配置文件变化
    this.watchConfigFile()
  }
  
  private watchConfigFile(): void {
    const configPath = this.getConfigPath()
    
    this.watcher = watch(configPath, {
      persistent: true,
      ignoreInitial: true
    })
    
    this.watcher.on('change', () => {
      logger.info('Config file changed, reloading...')
      
      // 重新加载配置
      this.reload()
      
      // 通知渲染进程
      BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send(IPC.CONFIG_CHANGED)
      })
    })
  }
  
  private reload(): void {
    // 重新读取配置文件
    const raw = fs.readFileSync(this.getConfigPath(), 'utf-8')
    this.data = JSON.parse(raw)
    
    // 触发热更新
    this.applyHotReload()
  }
  
  private applyHotReload(): void {
    // 动态更新服务配置
    connectionManager.updatePoolConfigs()
    aiModule.updateConfig()
    // ... 其他服务更新
  }
  
  dispose(): void {
    this.watcher?.close()
  }
}
```

---

### 7.3 开发者工具面板

**实施方案**：

```tsx
// src/renderer/components/DevTools/index.tsx

import { useState, useEffect } from 'react'

export default function DevTools() {
  const [activeTab, setActiveTab] = useState<'ipc' | 'performance' | 'memory'>('ipc')
  const [ipcLog, setIpcLog] = useState<any[]>([])
  const [perfMetrics, setPerfMetrics] = useState<any>({})
  
  useEffect(() => {
    // 监听 IPC 通信
    const unsubscribe = window.electronAPI.dev.onIPCMessage((msg) => {
      setIpcLog(prev => [...prev.slice(-99), msg]) // 保留最近 100 条
    })
    
    return () => unsubscribe()
  }, [])
  
  useEffect(() => {
    // 收集性能指标
    const interval = setInterval(() => {
      const metrics = {
        queryLatency: getLastQueryLatency(),
        aiResponseTime: getLastAIResponseTime(),
        memoryUsage: process.getProcessMemoryInfo()
      }
      setPerfMetrics(metrics)
    }, 1000)
    
    return () => clearInterval(interval)
  }, [])
  
  return (
    <div className="h-full flex flex-col bg-gray-900 text-gray-100">
      {/* 标签页 */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setActiveTab('ipc')}
          className={`px-4 py-2 ${activeTab === 'ipc' ? 'bg-gray-800' : ''}`}
        >
          IPC 日志
        </button>
        <button
          onClick={() => setActiveTab('performance')}
          className={`px-4 py-2 ${activeTab === 'performance' ? 'bg-gray-800' : ''}`}
        >
          性能监控
        </button>
        <button
          onClick={() => setActiveTab('memory')}
          className={`px-4 py-2 ${activeTab === 'memory' ? 'bg-gray-800' : ''}`}
        >
          内存使用
        </button>
      </div>
      
      {/* 内容区 */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'ipc' && (
          <div className="space-y-2">
            {ipcLog.map((msg, i) => (
              <div key={i} className="text-xs font-mono">
                <span className="text-gray-500">[{new Date(msg.timestamp).toLocaleTimeString()}]</span>
                <span className="text-blue-400 ml-2">{msg.channel}</span>
                <span className="text-gray-300 ml-2">
                  {JSON.stringify(msg.payload).substring(0, 100)}
                </span>
              </div>
            ))}
          </div>
        )}
        
        {activeTab === 'performance' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-2">查询延迟</h3>
              <div className="text-2xl font-mono text-green-400">
                {perfMetrics.queryLatency?.toFixed(2) || 0} ms
              </div>
            </div>
            
            <div>
              <h3 className="text-sm font-semibold mb-2">AI 响应时间</h3>
              <div className="text-2xl font-mono text-blue-400">
                {perfMetrics.aiResponseTime?.toFixed(2) || 0} ms
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

---

## 八、文档与国际化

### 8.1 用户文档结构

```
docs/
├── getting-started.md          # 快速开始
├── installation.md             # 安装指南
├── features/
│   ├── ai-assistant.md         # AI 助手使用指南
│   ├── query-editor.md         # SQL 编辑器
│   ├── schema-browser.md       # Schema 浏览器
│   └── backup-restore.md       # 备份与恢复
├── advanced/
│   ├── ssh-tunnel.md           # SSH 隧道配置
│   ├── ssl-connection.md       # SSL 连接配置
│   └── custom-prompts.md       # 自定义 AI Prompt
├── troubleshooting.md          # 常见问题
└── faq.md                      # FAQ
```

**快速开始示例**：

```markdown
# 快速开始

## 1. 创建第一个连接

1. 点击左侧边栏的 "➕ 新建连接"
2. 填写连接信息：
   - 主机：localhost
   - 端口：3306
   - 用户名：root
   - 密码：******
3. 点击 "测试连接" 验证配置
4. 点击 "保存"

## 2. 执行第一个查询

1. 在连接列表中点击刚创建的连接
2. 点击顶部工具栏的 "➕ 新建查询"
3. 在编辑器中输入：
   ```sql
   SELECT NOW() AS current_time;
   ```
4. 按 `Ctrl+Enter` 执行查询
5. 在下方结果面板查看输出

## 3. 使用 AI 生成 SQL

1. 点击右侧边栏的 "🤖 AI" 按钮
2. 在 "生成 SQL" 标签页输入自然语言描述：
   ```
   查询最近 7 天注册的用户，按注册时间降序排列
   ```
3. 点击 "生成" 按钮
4. AI 生成的 SQL 会自动填充到编辑器
5. 审查后执行查询
```

---

### 8.2 完整国际化

**工具选型**：i18next

```bash
npm install i18next react-i18next
```

**资源文件**：

```json
// src/renderer/locales/zh-CN.json
{
  "common": {
    "loading": "加载中...",
    "error": "错误",
    "success": "成功",
    "cancel": "取消",
    "confirm": "确认"
  },
  "connection": {
    "title": "数据库连接",
    "new": "新建连接",
    "edit": "编辑连接",
    "delete": "删除连接",
    "test": "测试连接",
    "testSuccess": "连接测试成功（延迟 {{latency}}ms）",
    "testFailed": "连接失败：{{error}}"
  },
  "editor": {
    "execute": "执行查询",
    "format": "格式化 SQL",
    "clear": "清空编辑器",
    "save": "保存查询"
  },
  "ai": {
    "generate": "生成 SQL",
    "optimize": "查询优化",
    "diagnose": "错误诊断",
    "security": "安全审计",
    "generating": "正在生成...",
    "error": "AI 请求失败：{{error}}"
  }
}
```

```json
// src/renderer/locales/en-US.json
{
  "common": {
    "loading": "Loading...",
    "error": "Error",
    "success": "Success",
    "cancel": "Cancel",
    "confirm": "Confirm"
  },
  "connection": {
    "title": "Database Connection",
    "new": "New Connection",
    "edit": "Edit Connection",
    "delete": "Delete Connection",
    "test": "Test Connection",
    "testSuccess": "Connection successful (latency {{latency}}ms)",
    "testFailed": "Connection failed: {{error}}"
  },
  "editor": {
    "execute": "Execute Query",
    "format": "Format SQL",
    "clear": "Clear Editor",
    "save": "Save Query"
  },
  "ai": {
    "generate": "Generate SQL",
    "optimize": "Query Optimization",
    "diagnose": "Error Diagnosis",
    "security": "Security Audit",
    "generating": "Generating...",
    "error": "AI request failed: {{error}}"
  }
}
```

**Hook 封装**：

```typescript
// src/renderer/hooks/useTranslation.ts

import { useTranslation as useI18n } from 'react-i18next'

export function useTranslation() {
  const { t, i18n } = useI18n()
  
  return {
    t,
    changeLanguage: (lang: 'zh-CN' | 'en-US') => {
      i18n.changeLanguage(lang)
      localStorage.setItem('language', lang)
    },
    currentLanguage: i18n.language
  }
}
```

**组件中使用**：

```tsx
// Before
<button>测试连接</button>

// After
const { t } = useTranslation()
<button>{t('connection.test')}</button>
```

---

## 优化优先级矩阵

| 优先级 | 优化项 | 影响范围 | 实施难度 | 预期收益 | 预估工时 |
|--------|--------|----------|----------|----------|----------|
| **P0** | 代码拆分（AIModule/AIPanel） | 高 | 中 | ⭐⭐⭐⭐⭐ | 3-5 天 |
| **P0** | SQL 注入防护增强 | 高 | 低 | ⭐⭐⭐⭐⭐ | 1-2 天 |
| **P0** | 错误处理统一化 | 高 | 中 | ⭐⭐⭐⭐⭐ | 2-3 天 |
| **P1** | 查询结果虚拟化 | 中 | 低 | ⭐⭐⭐⭐ | 1-2 天 |
| **P1** | Schema 缓存策略 | 中 | 低 | ⭐⭐⭐⭐ | 1 天 |
| **P1** | 测试覆盖率提升 | 高 | 中 | ⭐⭐⭐⭐ | 5-7 天 |
| **P1** | 数据库连接池优化 | 中 | 中 | ⭐⭐⭐⭐ | 2-3 天 |
| **P2** | 快捷键系统 | 中 | 低 | ⭐⭐⭐ | 1 天 |
| **P2** | 结构化日志系统 | 中 | 低 | ⭐⭐⭐ | 1-2 天 |
| **P2** | 全局 Loading 管理 | 中 | 低 | ⭐⭐⭐ | 1-2 天 |
| **P2** | 智能补全增强 | 中 | 中 | ⭐⭐⭐ | 2-3 天 |
| **P2** | 多数据库适配器 | 高 | 高 | ⭐⭐⭐⭐⭐ | 10-15 天 |
| **P3** | API Key 轮换提醒 | 低 | 中 | ⭐⭐ | 1-2 天 |
| **P3** | 配置热重载 | 低 | 中 | ⭐⭐ | 1-2 天 |
| **P3** | ER 图可视化增强 | 中 | 中 | ⭐⭐⭐ | 2-3 天 |
| **P3** | 查询执行计划可视化 | 中 | 中 | ⭐⭐⭐ | 2-3 天 |
| **P3** | 完整国际化 | 中 | 中 | ⭐⭐⭐ | 3-5 天 |
| **P3** | 开发者工具面板 | 低 | 中 | ⭐⭐ | 2-3 天 |
| **P3** | 团队协作功能 | 低 | 高 | ⭐⭐⭐ | 7-10 天 |

---

## 实施路线图

### 第一阶段（1-2 周）：基础优化
- [ ] 代码拆分（AIModule → Providers）
- [ ] SQL 注入防护增强
- [ ] 错误处理统一化
- [ ] Schema 缓存策略

### 第二阶段（2-3 周）：性能与体验
- [ ] 查询结果虚拟化
- [ ] 数据库连接池优化
- [ ] 快捷键系统
- [ ] 全局 Loading 管理

### 第三阶段（3-4 周）：质量保障
- [ ] 单元测试覆盖率提升至 80%
- [ ] E2E 测试框架搭建
- [ ] CI/CD 流水线配置

### 第四阶段（4-6 周）：功能扩展
- [ ] 多数据库适配器（PostgreSQL）
- [ ] ER 图可视化增强
- [ ] 查询执行计划可视化

### 第五阶段（持续）：长期优化
- [ ] 完整国际化
- [ ] 团队协作功能
- [ ] 插件系统探索

---

## 附录

### A. 相关文档链接

- [Electron 最佳实践](https://www.electronjs.org/docs/latest/tutorial/security)
- [Monaco Editor 文档](https://microsoft.github.io/monaco-editor/)
- [LangChain.js 文档](https://js.langchain.com/)
- [React Performance 优化](https://react.dev/learn/render-and-commit)

### B. 参考项目

- [DBeaver](https://dbeaver.io/) - 开源数据库管理工具
- [TablePlus](https://tableplus.com/) - 现代化数据库客户端
- [DataGrip](https://www.jetbrains.com/datagrip/) - JetBrains 数据库 IDE

### C. 联系方式

如有优化建议或问题，请提交 Issue 或 Pull Request。

---

*最后更新：2026-06-10*
