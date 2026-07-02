# DBForge AI v2.0 — 对标 Tabularis 增强方案

> 基于与 [Tabularis](https://github.com/TabularisDB/tabularis) 的对比分析产出  
> 生成时间：2026-07-02

---

## 目录

1. [Phase 1: Monorepo 改造](#phase-1-monorepo-改造)
2. [Phase 2: 插件系统](#phase-2-插件系统)
3. [Phase 3: MCP Server](#phase-3-mcp-server)
4. [Phase 4: SQL Notebooks](#phase-4-sql-notebooks)
5. [Phase 5: Visual EXPLAIN](#phase-5-visual-explain)
6. [Phase 6: Visual Query Builder 增强](#phase-6-visual-query-builder-增强)
7. [Phase 7: JSON/JSONB 单元格编辑器](#phase-7-jsonjsonb-单元格编辑器)
8. [Phase 8: GEOMETRY 支持](#phase-8-geometry-支持)
9. [Phase 9: AI 结果洞察增强](#phase-9-ai-结果洞察增强)

---

## Phase 1: Monorepo 改造

### 目标
将单 package 项目改为 pnpm workspace monorepo，为插件系统提供架构基础。

### 现状
```
DBForge_AI/
├── package.json          # 单一包，混合 main/renderer 依赖
├── src/main/             # 主进程
├── src/renderer/         # 渲染进程
├── src/shared/           # 共享类型
└── electron-vite.config.ts
```

### 目标结构
```
DBForge_AI/
├── pnpm-workspace.yaml
├── package.json                    # root: scripts + devDependencies
├── packages/
│   ├── shared/                     # @dbforge/shared
│   │   ├── package.json
│   │   └── src/
│   │       ├── types.ts            # 共享类型
│   │       ├── ipc-channels.ts     # IPC 通道定义
│   │       └── index.ts
│   ├── main/                       # @dbforge/main
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── ipc/
│   │       └── services/
│   ├── renderer/                   # @dbforge/renderer
│   │   ├── package.json
│   │   └── src/
│   │       ├── App.tsx
│   │       ├── components/
│   │       └── store/
│   └── plugin-sdk/                 # @dbforge/plugin-sdk (新增)
│       ├── package.json
│       └── src/
│           ├── types.ts            # 插件接口定义
│           ├── rpc-client.ts       # JSON-RPC 2.0 客户端
│           └── registry.ts         # 插件注册表
├── plugins/                        # 官方插件（独立包）
│   └── driver-sqlite/              # 示例：SQLite 驱动插件
│       ├── package.json
│       └── src/
│           └── index.ts
└── electron-vite.config.ts         # 适配 monorepo 路径
```

### 实施步骤

1. **初始化 pnpm workspace**
   - 创建 `pnpm-workspace.yaml`：`packages: ['packages/*', 'plugins/*']`
   - 根 `package.json` 保留 scripts 和 devDependencies

2. **拆分 shared 包**
   - 迁移 `src/shared/` → `packages/shared/src/`
   - 设置 `@dbforge/shared` 包名
   - 更新所有 import 路径（`../../shared/types` → `@dbforge/shared`）

3. **拆分 main 包**
   - 迁移 `src/main/` → `packages/main/src/`
   - 依赖声明从 root 迁移
   - 保留 `better-sqlite3`、`mysql2`、`pg`、`ssh2` 等原生绑定

4. **拆分 renderer 包**
   - 迁移 `src/renderer/` → `packages/renderer/src/`
   - React/Monaco Editor 等前端依赖
   - 保留 `@tanstack/react-virtual`、`zustand` 等

5. **调整 electron-vite 配置**
   - 更新入口路径指向新位置
   - 确认 HMR 和构建正常

6. **验证**
   - `pnpm typecheck` 全量通过
   - `pnpm dev` 正常启动
   - `pnpm build` 正常构建
   - 所有测试通过

### 依赖新增
- `pnpm` (packageManager)

### 风险
- import 路径迁移量大，需批量替换
- electron-vite 对 monorepo 的兼容性需验证
- better-sqlite3 等原生模块重编译路径

---

## Phase 2: 插件系统

### 目标
实现语言无关的外部插件系统，允许社区贡献数据库驱动、AI 提供商、导出器等扩展。

### 架构设计

```
┌─────────────────────────────────────────────────┐
│                  DBForge AI                      │
│                                                  │
│  ┌──────────┐   JSON-RPC 2.0   ┌─────────────┐ │
│  │  Plugin   │ ◄─── stdin ────► │   Plugin     │ │
│  │  Host     │     stdout       │  Executable  │ │
│  │  (Main)   │                  │  (any lang)  │ │
│  └──────────┘                   └─────────────┘ │
└─────────────────────────────────────────────────┘
```

### 插件接口定义

```typescript
// packages/plugin-sdk/src/types.ts

/** 插件 manifest，通过 plugin.json 或 package.json 声明 */
interface PluginManifest {
  name: string                    // 唯一标识，如 "driver-duckdb"
  version: string                 // semver
  description: string
  author: string
  main: string                    // 可执行文件路径（相对插件目录）
  type: 'driver' | 'ai-provider' | 'exporter' | 'tool' | 'theme'
  engines: {
    dbforge: string               // 兼容的 DBForge AI 版本
  }
  capabilities: PluginCapability[]
}

type PluginCapability =
  | 'database:connect'
  | 'database:query'
  | 'database:schema'
  | 'database:backup'
  | 'ai:text-to-sql'
  | 'ai:explain'
  | 'export:csv'
  | 'export:json'
  | 'export:excel'
  | 'ui:theme'

/** JSON-RPC 2.0 消息格式 */
interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number | string
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number | string
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

/** 数据库驱动插件必须实现的方法 */
interface DriverPluginMethods {
  'driver.createPool': (config: ConnectionConfig) => { poolId: string }
  'driver.executeQuery': (params: { poolId: string; sql: string; timeout?: number }) => QueryResult
  'driver.fetchSchema': (params: { poolId: string }) => DatabaseSchema
  'driver.closePool': (params: { poolId: string }) => void
  'driver.testConnection': (config: ConnectionConfig) => TestResult
  'driver.getCapabilities': () => DriverCapabilities
}
```

### 插件主机实现

```typescript
// packages/main/src/services/PluginHost.ts

class PluginHost {
  private plugins = new Map<string, PluginInstance>()

  async loadPlugin(pluginPath: string): Promise<void> {
    // 1. 读取 plugin.json / package.json
    // 2. 验证 manifest
    // 3. spawn 子进程 (stdin/stdout 管道)
    // 4. 握手（发送 initialize 请求）
    // 5. 注册到对应 registry
  }

  async callPlugin<T>(
    pluginName: string,
    method: string,
    params: Record<string, unknown>
  ): Promise<T> {
    // JSON-RPC 2.0 调用
  }

  sendNotification(pluginName: string, method: string, params: Record<string, unknown>): void {
    // 无 id 的通知
  }

  unloadPlugin(pluginName: string): void {
    // 发送 shutdown 通知，关闭子进程
  }
}
```

### 与现有 DialectInterface 的关系

```
现有:  registerDialect(MySQLDialect)   → 硬编码注册
       getDialect('mysql')

改造后:
  registerDialect(MySQLDialect)         → 内置驱动（保持不变）
  pluginHost.loadPlugin('driver-duckdb') → 通过插件主机加载外部驱动
                                          → 自动注册到 dialectRegistry
```

**向后兼容**：现有 5 个内置驱动保持不变，插件驱动作为扩展注册到同一个 `dialectRegistry`。

### 插件安装

```
Settings → 插件管理 → 可用插件列表（从官方 registry 获取）
                    → 一键安装（下载 + 解压 + 注册）
                    → 已安装列表（启用/禁用/卸载）
```

### 插件注册表

```json
// plugins/registry.json（官方维护）
{
  "plugins": [
    {
      "name": "driver-duckdb",
      "version": "1.0.0",
      "download": "https://plugins.dbforge.ai/driver-duckdb-1.0.0.tar.gz",
      "checksum": "sha256:..."
    }
  ]
}
```

### 依赖新增
- 无额外 npm 依赖（基于 Node.js 内置 `child_process`）

### 风险
- 子进程管理与稳定性
- 插件安全沙箱（限制文件系统/网络访问）
- 跨平台可执行文件差异

---

## Phase 3: MCP Server

### 目标
实现内置 MCP (Model Context Protocol) Server，让 Claude/Cursor/Devin 等 AI Agent 直接操作数据库。

### 架构

```
┌──────────────┐   MCP协议(stdio)   ┌──────────────────┐
│  AI Agent    │ ◄───────────────► │  DBForge AI       │
│  (Claude等)  │                    │  MCP Server       │
└──────────────┘                    │  ┌──────────────┐ │
                                    │  │ Tools:       │ │
                                    │  │ list_conn    │ │
                                    │  │ list_tables  │ │
                                    │  │ describe_tbl │ │
                                    │  │ run_query    │ │
                                    │  └──────────────┘ │
                                    └──────────────────┘
```

### 两种运行模式

```
模式 1: 独立模式
  $ dbforge --mcp
  → 启动纯 MCP Server（无 GUI），stdio 通信

模式 2: 内嵌模式
  Settings → MCP Server → 开启
  → 在 GUI 运行同时暴露 MCP 端口
  → 支持 HTTP/SSE 传输（用于远程 Agent）
```

### MCP Tools 定义

```typescript
// packages/main/src/services/MCPServer.ts

const tools = [
  {
    name: 'list_connections',
    description: '列出所有已保存的数据库连接',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_tables',
    description: '列出指定连接中的所有表',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: { type: 'string', description: '连接 ID' },
        schema: { type: 'string', description: '可选：按 schema 过滤' },
      },
      required: ['connectionId'],
    },
  },
  {
    name: 'describe_table',
    description: '获取表的完整结构：列、索引、外键',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: { type: 'string' },
        tableName: { type: 'string' },
      },
      required: ['connectionId', 'tableName'],
    },
  },
  {
    name: 'run_query',
    description: '执行 SQL 查询并返回结果',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: { type: 'string' },
        sql: { type: 'string', description: '要执行的 SQL 语句' },
        maxRows: { type: 'number', description: '最大返回行数，默认 100' },
      },
      required: ['connectionId', 'sql'],
    },
  },
]
```

### 一键配置安装

```
Settings → MCP Server Integration
├── Claude Desktop:  [安装配置] → 写入 ~/Library/.../claude_desktop_config.json
├── Cursor:          [安装配置] → 写入 .cursor/mcp.json
└── 手动配置:        复制命令行
```

### 安全考量
- MCP 模式下默认**只读**（仅 SELECT）
- 需在设置中手动开启写操作权限
- 连接密码不通过 MCP 暴露（仅返回连接 ID 列表）

### 依赖新增
- `@modelcontextprotocol/sdk`（MCP 官方 SDK）

### CLI 入口
- 修改 `package.json` 添加 `bin` 字段
- 新增 `packages/main/src/cli.ts` 处理 `--mcp` 参数

---

## Phase 4: SQL Notebooks

### 目标
实现 SQL + Markdown 混排的交互式文档，支持跨 cell 变量引用和图表。

### 文件格式

```
.notebook/my-analysis.dbforge-nb
```

```json
{
  "version": "1.0",
  "connectionId": "conn-xxx",
  "cells": [
    {
      "id": "cell-1",
      "type": "markdown",
      "content": "# 销售分析\n\n查询 {{startDate}} 到 {{endDate}} 的数据"
    },
    {
      "id": "cell-2",
      "type": "sql",
      "name": "top_products",
      "content": "SELECT product_name, SUM(amount) AS total\nFROM orders\nWHERE date >= '{{$startDate}}'\nGROUP BY product_name\nORDER BY total DESC\nLIMIT 10",
      "result": null
    },
    {
      "id": "cell-3",
      "type": "markdown",
      "content": "## 结果\n\n销售额最高的产品是 **{{top_products.product_name[0]}}**\n\n```chart:bar\n{{top_products}}\n```"
    },
    {
      "id": "cell-4",
      "type": "sql",
      "name": "monthly_trend",
      "content": "SELECT date_trunc('month', date) AS month, SUM(amount) AS total\nFROM orders\nWHERE product_name = '{{top_products.product_name[0]}}'\nGROUP BY 1\nORDER BY 1",
      "result": null
    }
  ],
  "parameters": {
    "startDate": "2026-01-01",
    "endDate": "2026-06-30"
  }
}
```

### Cell 类型

| 类型 | 描述 |
|------|------|
| `markdown` | Markdown 文本，支持变量 `{{cellName.col}}`、图表语法 |
| `sql` | SQL 查询，执行结果存储在 cell 上，支持命名 |

### 变量系统

```
{{cellName}}               → 上一个 cell 的完整结果（JSON 数组）
{{cellName.columnName}}    → 指定列的所有值（逗号分隔）
{{cellName.columnName[0]}} → 指定列的第一个值
{{$paramName}}            → 全局参数（在顶部面板定义）
```

### 图表语法

在 Markdown cell 中使用：
```
```chart:bar
data: {{top_products}}
x: product_name
y: total
```
```

```
```chart:line
data: {{monthly_trend}}
x: month
y: total
```
```

```
```chart:pie
data: {{top_products}}
label: product_name
value: total
```
```

### UI 布局

```
┌─────────────────────────────────────────┐
│  Notebook: 销售分析.dbforge-nb    [×]   │
│  Parameters: startDate [2026-01-01] ... │
├─────────────────────────────────────────┤
│  ┌─ Outline ─┐ ┌─ Cells ──────────────┐ │
│  │ 销售分析    │ │ # 销售分析           │ │
│  │ top_products│ │                     │ │
│  │ 结果        │ │ 查询 ... 的数据      │ │
│  │ monthly.   │ │                     │ │
│  └────────────┘ ├─────────────────────┤ │
│                 │ SELECT product_...  │ │
│                 │ [▶ Run] [📊]        │ │
│                 ├─────────────────────┤ │
│                 │ ┌─────────────────┐ │ │
│                 │ │ product │ total │ │ │
│                 │ │ A       │ 1000  │ │ │
│                 │ │ B       │ 800   │ │ │
│                 │ └─────────────────┘ │ │
│                 │                     │ │
│                 │ [+ Markdown] [+ SQL]│ │
│                 └─────────────────────┘ │
└─────────────────────────────────────────┘
```

### 实施步骤

1. **数据模型**：`NotebookDocument` 类型定义
2. **存储**：`.dbforge-nb` 文件序列化/反序列化（JSON 格式）
3. **渲染器**：新的 `NotebookEditor` 组件
   - 复用 `MarkdownRenderer` 渲染 Markdown cells
   - 复用 `SQLEditor` (Monaco) 渲染 SQL cells
   - 复用 `DataTable` 渲染 SQL 执行结果
4. **变量解析**：`notebookVariableResolver.ts`
   - 解析 `{{...}}` 语法
   - 跨 cell 值提取
5. **图表渲染**：`NotebookChart` 组件
   - 使用 `recharts` 或纯 SVG
6. **导出**：HTML / CSV / JSON
7. **IPC 通道**：notebook 文件的打开/保存/导出

### 依赖新增
- `recharts`（图表，~150KB gzipped）或手动 SVG

---

## Phase 5: Visual EXPLAIN

### 目标
将 SQL EXPLAIN 输出从纯文本转化为交互式节点图。

### 数据流

```
SQL 执行
  ↓
EXPLAIN (FORMAT JSON)  ← 各数据库方言适配
  ↓
PlanNode 树解析         ← packages/main/src/services/ExplainParser.ts
  ↓
IPC → Renderer
  ↓
ReactFlow 节点图        ← packages/renderer/src/components/VisualExplain/
```

### 统一中间表示 (IR)

```typescript
interface ExplainPlanNode {
  id: string
  operation: string          // 'Seq Scan', 'Index Scan', 'Hash Join', ...
  relation?: string          // 表名
  alias?: string
  startupCost: number
  totalCost: number
  planRows: number
  planWidth: number
  actualRows?: number
  actualTime?: number
  loops?: number
  filter?: string            // WHERE 条件
  indexName?: string
  joinType?: string
  children: ExplainPlanNode[]
  warnings: string[]         // 优化建议
}
```

### 三种视图

| 视图 | 内容 |
|------|------|
| **Graph** | ReactFlow 交互节点图，节点大小反映 cost，颜色反映热点 |
| **Table** | 传统树形表格，类似 `EXPLAIN ANALYZE` 原始输出 |
| **AI Analysis** | 点击触发 AI 分析，给出优化建议（复用现有 `AI_OPTIMIZE_QUERY`） |

### Graph 节点设计

```
┌──────────────────────┐
│ 🔴 Hash Join         │  ← 颜色基于 cost 比例 (绿→黄→红)
│ cost: 15423.50       │
│ rows: 10000          │
│ time: 245.3 ms       │  ← 实际时间（ANALYZE 模式）
└──┬────────────┬──────┘
   │            │
   ▼            ▼
┌──────────┐ ┌──────────┐
│ Seq Scan │ │ Idx Scan │
│ orders   │ │ idx_date │
│ cost:... │ │ cost:... │
└──────────┘ └──────────┘
```

### 实施步骤

1. **ExplainParser**（main process）
   - MySQL: 解析 `EXPLAIN FORMAT=JSON` 输出
   - PostgreSQL: 解析 `EXPLAIN (FORMAT JSON, ANALYZE)` 输出
   - SQLite: 解析 `EXPLAIN QUERY PLAN` 输出（格式不同）
   - 统一转为 `ExplainPlanNode[]`

2. **VisualExplain 组件**（renderer）
   - 基于 `ReactFlow`（项目中已有依赖基础）
   - 节点自动布局（dagre 布局算法）
   - 缩放/平移/节点折叠
   - 节点 tooltip 显示详细信息

3. **SQLEditor 集成**
   - 在编辑器工具栏添加 `[▶ Explain]` 按钮
   - 点击后切换到 Explain 视图

4. **AI 分析集成**
   - 复用现有 `AI_OPTIMIZE_QUERY` IPC 通道
   - 在 Explain 面板显示 AI 建议

### 依赖新增
- `@dagrejs/dagre`（DAG 布局算法，~15KB）
- `@dagrejs/graphlib`（dagre 依赖）

### 现有基础
- `ReactFlow` 已在 `JoinBuilder` 中使用（32KB 组件）
- 可复用 ReactFlow 的安装和配置

---

## Phase 6: Visual Query Builder 增强

### 目标
在现有 JoinBuilder 基础上增强，对标 Tabularis 的 Visual Query Builder。

### 现有状态
- `JoinBuilder/index.tsx` (32KB) — 已有表拖拽、JOIN 连接基础
- 使用 ReactFlow

### 增强功能

| 功能 | 现有 | 目标 |
|------|------|------|
| 拖拽表到画布 | ✅ | ✅ |
| 可视化 JOIN 连接 | ✅ | ✅ |
| WHERE 条件构建器 | ❌ | 🔥 新增 |
| HAVING 条件构建器 | ❌ | 🔥 新增 |
| 聚合函数选择 (COUNT/SUM/AVG) | ❌ | 🔥 新增 |
| ORDER BY 配置 | ❌ | 新增 |
| LIMIT 配置 | ❌ | 新增 |
| 列选择器（勾选需要的列） | 部分 | 增强 |
| 实时 SQL 预览 | 部分 | 增强（实时更新） |
| 子查询支持 | ❌ | P2 |

### WHERE 条件构建器 UI

```
┌─────────────────────────────────────────┐
│ WHERE Conditions                        │
│ ┌──────────┬──────┬──────────┬─────┐   │
│ │ orders   │ >    │ 100      │ AND │   │
│ │ .amount  │      │          │ [×] │   │
│ └──────────┴──────┴──────────┴─────┘   │
│ [+ Add Condition]  [+ Add Group]       │
│                                         │
│ GROUP BY: [date] [category] [+ Add]    │
│ HAVING:   [COUNT(*) > 5]      [+ Add]  │
│ ORDER BY: [amount DESC]       [+ Add]  │
│ LIMIT:    [100]                         │
└─────────────────────────────────────────┘
```

### 实施步骤

1. **重构 JoinBuilder → QueryBuilder**
   - 拆分为多个子组件：
     - `CanvasArea` — ReactFlow 画布
     - `ColumnSelector` — 列选择侧栏
     - `ConditionBuilder` — WHERE/HAVING 条件构建
     - `SQLPreview` — 实时 SQL 预览面板
     - `OrderLimitPanel` — ORDER BY + LIMIT 配置

2. **SQL 生成引擎**
   - 从 ReactFlow 节点和边重构完整 SQL
   - 新增 `QueryBuilderSQLGenerator` 工具函数

3. **与 SQLEditor 集成**
   - 生成的 SQL 自动填入编辑器
   - 编辑器修改可同步回 Visual Builder（可选）

---

## Phase 7: JSON/JSONB 单元格编辑器

### 目标
DataGrid 中的 JSON/JSONB 列不再用 `JSON.stringify` 纯文本展示，提供专用的交互式编辑器。

### 检测逻辑

```typescript
function isJSONColumn(col: ColumnMeta): boolean {
  const t = col.type.toLowerCase()
  return t.includes('json') || t.includes('jsonb')
}

function tryParseJSON(v: unknown): { parsed: unknown; isJSON: boolean } {
  if (typeof v !== 'string') return { parsed: v, isJSON: false }
  try {
    return { parsed: JSON.parse(v), isJSON: true }
  } catch {
    return { parsed: v, isJSON: false }
  }
}
```

### 三种显示模式

| 模式 | 适用场景 | 描述 |
|------|----------|------|
| **Tree** | 嵌套较深的 JSON | 可折叠的树形视图，语法高亮 |
| **Monaco** | 编辑大型 JSON | 弹出 Monaco Editor 窗口，带 JSON Schema 校验 |
| **Raw** | 快速浏览 | 单行截断显示，hover 展开全文 |

### Tree 模式 UI

```
┌──────────────────────────┐
│ ▼ user                   │
│   ├─ name: "John"        │
│   ├─ age: 30             │
│   ├─ ▼ address           │
│   │   ├─ city: "NYC"     │
│   │   └─ zip: "10001"    │
│   └─ ▼ tags              │
│       ├─ [0]: "admin"    │
│       └─ [1]: "vip"      │
└──────────────────────────┘
```

### 交互流程

```
单元格默认显示: "{ "user": { "name": "Jo..."  (截断 40 字符)
     │
     ├── 双击 → 弹出 Monaco 编辑器 (格式化 JSON，语法高亮)
     │          [保存] → 验证 JSON 合法性 → 更新单元格
     │
     └── 右键 → "展开 JSON" → 弹出 Tree 视图 Modal
                "复制 JSON" → 复制格式化后的 JSON
```

### 实施步骤

1. **新增 `JSONCellViewer` 组件**
   - 截断显示 + 语法高亮色
   - Hover tooltip 显示格式化预览

2. **新增 `JSONTreeModal` 组件**
   - 可折叠树形视图
   - 基于递归 React 组件

3. **增强 DataTable 编辑模式**
   - 检测 JSON 列 → 使用 Monaco Editor 编辑
   - 保存时验证 JSON 合法性

### 依赖新增
- 无需新增依赖（复用 Monaco Editor）

---

## Phase 8: GEOMETRY 支持

### 目标
MySQL/PostgreSQL 的 GEOMETRY/GEOGRAPHY 列支持基础可视化。

### 检测逻辑

```typescript
function isGeometryColumn(col: ColumnMeta): boolean {
  const t = col.type.toLowerCase()
  return /geometry|geography|point|linestring|polygon|multipoint|multilinestring|multipolygon/i.test(t)
}
```

### 支持范围

| 格式 | 来源 | 支持 |
|------|------|------|
| WKT | `POINT(1 2)`, `LINESTRING(...)`, `POLYGON(...)` | ✅ 解析 + 渲染 |
| WKB (hex) | MySQL `ST_AsWKB()` 的 hex 输出 | ✅ 解析 + 渲染 |
| GeoJSON | PostgreSQL `ST_AsGeoJSON()` | ✅ 解析 + 渲染 |

### 实现

```typescript
// packages/main/src/services/GeometryParser.ts

function parseWKT(wkt: string): GeoJSON.Geometry | null {
  // 简单正则解析 WKT → GeoJSON
}

function parseWKB(hex: string): GeoJSON.Geometry | null {
  // 解析 WKB binary → GeoJSON
  // 或使用现有库如 @turf/helpers
}
```

### 显示

```
单元格中:  "📍 POINT(116.4 39.9)"  (带图标 + 类型标识)
点击:     弹出 Mini Map 预览（Leaflet 或简单 Canvas）
```

### Mini Map 组件

```
┌─────────────────────────┐
│   Beijing               │  ← 简单 Canvas 渲染
│      ●                  │     基于 GeoJSON coordinates
│                         │
│                         │
│   type: Point           │
│   lat: 39.9             │
│   lon: 116.4            │
└─────────────────────────┘
```

### 实施步骤

1. **GeometryParser**（main process 或 renderer）
   - WKT/WKB/GeoJSON 统一解析为 GeoJSON 格式
   - 简单正则解析 + 字节解析

2. **GeoCellView 组件**
   - 单元格内显示类型图标 + 坐标摘要
   - 点击展开 SimpleMap 弹窗（纯 Canvas，无需地图服务）

3. **DataTable 集成**
   - 检测 GEOMETRY 列 → 使用专用渲染器

### 依赖新增
- 可选 `@turf/turf`（如果需要完整的 Geo 操作库，~120KB）
- 或自行实现轻量 WKT/WKB parser（推荐，~200 行代码）

---

## Phase 9: AI 结果洞察增强

### 现有状态
`ResultPanel` 已有 AI 错误诊断功能（`diagnoseError`），但缺少对**成功查询结果**的主动洞察。

### 增强功能

| 功能 | 描述 |
|------|------|
| **自动摘要** | 可配置：查询完成自动触发 AI 摘要（默认关闭，避免 API 费用） |
| **智能图表推荐** | AI 分析结果列，推荐最佳图表类型（柱状图/折线图/饼图） |
| **异常检测** | AI 扫描数值列，标记异常值和分布问题 |
| **一键图表生成** | 从 AI 推荐中一键生成图表 |
| **洞察面板** | 结果区域下方可折叠的 AI 洞察面板 |

### 洞察面板 UI

```
┌─────────────────────────────────────────┐
│ 📊 AI 洞察                      [展开]  │
├─────────────────────────────────────────┤
│ 💡 摘要                               │
│   查询返回 1,234 行，销售额总计 ¥5.2M  │
│   同比增长 12.3%，最高为"电子产品"类别  │
│                                         │
│ 📈 建议图表                            │
│   [柱状图] 按类别汇总            [生成] │
│   [折线图] 按月趋势              [生成] │
│                                         │
│ ⚠️ 数据质量                           │
│   · "discount" 列有 23 个空值 (1.9%)  │
│   · "price" 列存在 5 个异常高值(>3σ)  │
└─────────────────────────────────────────┘
```

### 实施步骤

1. **增强 AI IPC**
   - 新增 `AI_RESULT_INSIGHT: 'ai:result-insight'`
   - 输入：columns + 前 100 行 sample + 用户问题
   - 输出：摘要、图表建议、质量警告

2. **InsightPanel 组件**
   - 可折叠面板
   - 摘要区（Markdown 渲染）
   - 图表建议区（一键生成按钮）
   - 质量警告区

3. **自动洞察模式**
   - 在 Settings 中可配置：`autoInsight: 'off' | 'on' | 'on-large'`
   - `on-large`: 仅结果 > 100 行时自动触发

### 依赖新增
- 无新增依赖（复用现有 AI 通道）

---

## 总结：工作量估算

| Phase | 功能 | 复杂度 | 预估人天 | 优先级 |
|-------|------|--------|----------|--------|
| 1 | Monorepo | 中 | 3-5 | P0 |
| 2 | 插件系统 | 高 | 10-15 | P0 |
| 3 | MCP Server | 中 | 5-7 | P0 |
| 4 | SQL Notebooks | 高 | 10-15 | P1 |
| 5 | Visual EXPLAIN | 中 | 5-8 | P1 |
| 6 | Query Builder 增强 | 中 | 5-8 | P1 |
| 7 | JSON/JSONB 编辑器 | 低 | 2-3 | P2 |
| 8 | GEOMETRY 支持 | 低 | 2-3 | P2 |
| 9 | AI 洞察增强 | 低 | 2-3 | P2 |

**总计**：约 44-67 人天

### 建议执行顺序

```
Phase 1 (Monorepo)  ← 必须先做，后续都依赖它
    ↓
Phase 2 (插件系统)   ← 基础设施
    ↓
Phase 3 (MCP)       ← 高价值、实现较快
    ↓
Phase 4/5/6         ← 可并行
    ↓
Phase 7/8/9         ← 锦上添花
```
