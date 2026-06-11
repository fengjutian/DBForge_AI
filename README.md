# DBForge AI

<div align="center">

**跨平台桌面数据库管理工具 · AI 驱动的智能 SQL 助手**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Electron](https://img.shields.io/badge/Electron-30%2B-47848f?logo=electron)](https://electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61dafb?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript)](https://www.typescriptlang.org/)

</div>

---

## 📖 简介

DBForge AI 是一款现代化桌面数据库管理工具，专为 **开发者**、**DBA** 和 **数据分析师** 设计。它将专业级 SQL 编辑体验与 AI 大语言模型深度整合，让您用自然语言即可完成复杂的数据查询与分析工作。

> 💡 核心哲学：**自然语言 → SQL → 人工确认 → 安全执行**，在效率与安全之间取得最优平衡。

### 为什么选择 DBForge AI？

| 对比维度 | DBForge AI | DBeaver | TablePlus | Navicat |
|----------|------------|---------|-----------|---------|
| AI Text-to-SQL | ✅ 多模型支持 | ❌ 需插件 | ❌ 无 | ❌ 无 |
| 完全本地化 | ✅ 数据不出机 | ✅ | ✅ | ✅ |
| 开源免费 | ✅ MIT | ✅ | ❌ 付费 | ❌ 付费 |
| SQL 安全审计 | ✅ AI 驱动 | ❌ | ❌ | ❌ |
| 跨平台 | ✅ Win/Mac/Linux | ✅ | ✅ | ✅ |

---

## 🚀 核心功能

### 🤖 AI 智能助手

DBForge AI 内置 8 大 AI 能力，覆盖 SQL 开发全流程：

| 功能 | 说明 | 典型场景 |
|------|------|----------|
| **Text-to-SQL** | 自然语言 → MySQL 查询 | _"查询上个月销售额前 10 的产品及其分类名称"_ |
| **SQL 解释** | 对任意 SQL 进行中文解读 | 接手他人代码时快速理解业务逻辑 |
| **查询优化** | 分析执行计划，给出索引和改写建议 | 慢查询定位与优化 |
| **错误诊断** | 粘贴报错信息，AI 定位根因 | `ERROR 1064: You have an error in your SQL syntax...` |
| **安全审计** | 检测注入风险、危险操作、权限越界 | 上线前 SQL 审查 |
| **Schema 文档** | 一键生成 Markdown 格式数据库文档 | 新人入职、技术交接、文档沉淀 |
| **数据质量分析** | 识别空值率、重复值、异常值 | 数据清洗前的质量评估 |
| **结果洞察** | 对查询结果集进行自然语言摘要 | 快速提炼数据报告关键结论 |

#### 支持的 AI 提供商

| 提供商 | 类型 | 说明 |
|--------|------|------|
| **OpenAI** | 云端 API | GPT-4o / GPT-4-turbo，综合能力最强 |
| **Groq** | 云端 API | LPU 推理引擎，极速响应（< 1s） |
| **Claude** | 云端 API | Anthropic，擅长长文本与安全性 |
| **DeepSeek** | 云端 API | 国产高性价比，中文理解优秀 |
| **Ollama** | 本地部署 | 完全离线，数据零出机，推荐 deepseek-coder / qwen2.5 |

#### AI 双模式设计

- **🔒 只读模式**（默认） — AI 仅生成 `SELECT` 语句，适合数据分析师和新手，杜绝误操作
- **🔓 完整模式** — 允许 `INSERT` / `UPDATE` / `DELETE` / `ALTER`，需在设置中手动开启，适合开发者

---

### ✍️ 专业 SQL 编辑器

基于 **Monaco Editor**（VS Code 同款内核），提供 IDE 级别的编辑体验：

- **智能补全** — 根据实时 Schema 动态提示表名、字段名、关键字
- **语法高亮** — 完整 MySQL 语法支持，含关键字、函数、类型着色
- **SQL 格式化** — 一键美化（`Ctrl + K`），可配置缩进风格
- **多 Tab 管理** — 每个数据库连接对应一组独立编辑器 Tab
- **代码片段** — 保存常用 SQL 片段，快速插入复用
- **主题跟随** — 自动适配系统暗黑 / 亮色模式

#### 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl + Enter` | 执行当前 SQL（或选中部分） |
| `Ctrl + K` | 格式化 SQL |
| `Ctrl + Shift + F` | 全文查找 |
| `Ctrl + /` | 注释 / 取消注释 |
| `Ctrl + S` | 保存当前编辑内容 |
| `Ctrl + Z` / `Ctrl + Y` | 撤销 / 重做 |

---

### 🗄️ 数据库连接与 Schema 管理

```
📁 我的项目
  ├── 🔵 生产数据库 (在线)
  │   ├── 📊 users
  │   │   ├── 🔑 id (int, PK)
  │   │   ├── 📝 username (varchar)
  │   │   └── 📧 email (varchar)
  │   ├── 📊 orders
  │   └── 📊 products
  ├── 🟢 测试数据库 (在线)
  └── 🔴 开发数据库 (断线)
```

- **多连接支持** — 同时保持多个活跃连接，各自独立的查询上下文
- **连接分组** — 按项目 / 环境对连接进行分组管理
- **SSL / SSH 隧道** — 支持加密连接与跳板机访问
- **连接状态** — 实时标识在线 🔵 / 断线 🔴 / 连接中 🟡
- **断线重连** — 自动检测断线并提示重新连接
- **导入导出** — 连接配置支持导入导出（密码字段脱敏）
- **右键预览** — Schema 树中右键表名一键预览前 100 行数据

---

### 📊 查询执行与结果管理

- **分页加载** — 大数据集（10 万行+）分页加载，不阻塞界面
- **结果排序筛选** — 表格内直接排序与关键词筛选
- **多格式导出** — 支持 CSV / JSON / Excel（xlsx）
- **查询历史** — 本地持久化存储，记录 SQL、耗时、行数、连接名
  - 支持关键词搜索与按连接过滤
  - 一键重放历史 SQL
  - 可配置上限（默认 1000 条）

---

### 🛡️ 安全机制

DBForge AI 采用**纵深防御**策略，多层安全保障：

```
用户输入 → AI 模式校验 → SQL 关键词扫描 → 编辑器高亮 → 二次确认弹窗 → 主进程安全执行
```

1. **AI 模式控制** — 只读模式下 LLM Prompt 层拦截，拒绝生成非 SELECT 语句
2. **危险操作扫描** — 执行前扫描 `DROP` / `TRUNCATE` / `DELETE without WHERE` 等关键词
3. **编辑器高亮警告** — 危险 SQL 在编辑器中红色高亮标记
4. **二次确认弹窗** — 危险操作弹出醒目警告，需手动输入确认
5. **进程隔离** — 所有数据库操作在 Main Process（Node.js 侧）执行，渲染进程仅通过 IPC 通信
6. **Electron 安全配置** — `contextIsolation: true` + `nodeIntegration: false` + Sandbox
7. **密钥加密存储** — 数据库密码与 API Key 使用 `electron-store` 加密存储

---

### 💾 备份与恢复

- **一键备份** — 基于 `mysqldump`，自动探测系统路径
- **备份选项** — 支持 `--single-transaction`、`--routines`、`--triggers`
- **压缩支持** — 可选 `.sql.gz` 压缩备份
- **进度可视化** — 实时进度条，显示文件大小与耗时
- **恢复功能** — 使用 `mysql` 命令导入备份文件
- **备份历史** — 记录备份路径，支持快速打开所在文件夹

---

## 🏗️ 技术架构

### 整体架构

```mermaid
graph TB
    subgraph "Renderer Process"
        REACT[React 18 + TypeScript]
        MONACO[Monaco Editor]
        ZUSTAND[Zustand 状态管理]
        TAILWIND[Tailwind CSS]
    end

    subgraph "Main Process"
        IPC[IPC Handler Layer]
        AI[AIModule - LangChain.js]
        QUERY[QueryExecutor - mysql2]
        BACKUP[BackupManager - mysqldump]
        CONN[ConnectionManager]
        CONFIG[ConfigStore]
    end

    subgraph "External"
        LLM[LLM APIs<br/>OpenAI / Groq / Claude / DeepSeek]
        OLLAMA[Ollama Local]
        MYSQL[(MySQL Database)]
    end

    REACT <-->|IPC Channels| IPC
    IPC --> AI
    IPC --> QUERY
    IPC --> BACKUP
    IPC --> CONN
    IPC --> CONFIG
    AI --> LLM
    AI --> OLLAMA
    QUERY --> MYSQL
    BACKUP --> MYSQL
    CONN --> MYSQL
```

### 技术栈明细

| 层级 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 桌面框架 | Electron | 30+ | 跨平台桌面容器 |
| 构建工具 | electron-vite | 2.x | 开发 / 构建一体化 |
| 前端框架 | React | 18.x | 渲染进程 UI |
| 语言 | TypeScript | 5.x | 全栈类型安全 |
| 样式 | Tailwind CSS + Typography | 3.x | 原子化 CSS |
| 代码编辑器 | Monaco Editor | 0.47 | SQL 编辑核心 |
| 数据库驱动 | mysql2 | 3.x | MySQL 连接池 |
| AI 框架 | LangChain.js | 0.1 | LLM 调用编排 |
| 状态管理 | Zustand | 4.x | 轻量跨组件状态 |
| 配置存储 | electron-store | 8.x | 加密持久化配置 |
| 历史存储 | better-sqlite3 | 9.x | 查询历史 / 审计日志 |
| 表格导出 | ExcelJS | 4.x | Excel 格式导出 |
| Markdown 渲染 | react-markdown + remark-gfm | 10.x | AI 回复渲染 |
| SSH 隧道 | ssh2 | 1.x | SSH 跳板连接 |
| SQL 格式化 | sql-formatter | 15.x | SQL 美化 |
| 测试 | Vitest + fast-check | 1.x | 单元测试 + 属性测试 |
| 打包分发 | electron-builder | 24.x | 跨平台安装包 |

### 项目结构

```
DBForge_AI/
├── src/
│   ├── main/                          # 主进程（Node.js 侧）
│   │   ├── index.ts                   # 应用入口，生命周期管理
│   │   ├── preload.ts                 # 预加载脚本，安全暴露 API
│   │   ├── ipc/                       # IPC 通道处理器
│   │   │   ├── ai.ts                  # AI 相关 IPC 处理
│   │   │   ├── backup.ts             # 备份恢复 IPC
│   │   │   ├── connection.ts         # 连接管理 IPC
│   │   │   ├── export.ts             # 数据导出 IPC
│   │   │   ├── query.ts              # 查询执行 IPC
│   │   │   └── settings.ts           # 设置管理 IPC
│   │   └── services/                  # 核心服务模块
│   │       ├── AIModule.ts           # AI LLM 调用核心（41KB）
│   │       ├── ConnectionManager.ts  # 连接池与生命周期管理
│   │       ├── QueryExecutor.ts      # SQL 执行与安全校验
│   │       ├── BackupManager.ts      # mysqldump 备份恢复
│   │       ├── ConfigStore.ts        # 加密配置持久化
│   │       ├── HistoryStore.ts       # 查询历史管理
│   │       ├── SnippetStore.ts       # 代码片段管理
│   │       ├── SessionManager.ts     # 会话状态管理
│   │       ├── SSHTunnel.ts          # SSH 隧道连接
│   │       ├── AuditLog.ts           # 审计日志
│   │       └── AutoUpdater.ts        # 自动更新
│   ├── renderer/                      # 渲染进程（浏览器侧）
│   │   ├── App.tsx                    # 应用根组件
│   │   ├── main.tsx                   # React 入口
│   │   ├── index.html                # HTML 模板
│   │   ├── components/                # UI 组件
│   │   │   ├── AIPanel/              # AI 助手面板
│   │   │   ├── BackupDialog/         # 备份对话框
│   │   │   ├── ConnectionPanel/      # 连接管理面板
│   │   │   ├── DataTable/            # 数据表格展示
│   │   │   ├── ERDiagram/            # ER 关系图
│   │   │   ├── JoinBuilder/          # JOIN 可视化构建
│   │   │   ├── MarkdownRenderer/     # Markdown 渲染
│   │   │   ├── Onboarding/           # 新手引导
│   │   │   ├── PreviewPanel/         # 数据预览
│   │   │   ├── ResultPanel/          # 查询结果面板
│   │   │   ├── SchemaBrowser/        # Schema 树浏览器
│   │   │   ├── Settings/             # 设置面板
│   │   │   ├── SQLEditor/            # SQL 编辑器
│   │   │   ├── TableAnalysisModal/   # 表分析弹窗
│   │   │   └── TabManager/           # 标签页管理
│   │   ├── hooks/                     # 自定义 Hook
│   │   │   ├── useAIStream.ts        # AI 流式响应
│   │   │   └── useResize.ts          # 面板拖拽大小
│   │   ├── store/                     # Zustand 状态
│   │   │   ├── connectionStore.ts    # 连接状态
│   │   │   ├── editorStore.ts        # 编辑器状态
│   │   │   ├── resultStore.ts        # 查询结果状态
│   │   │   └── settingsStore.ts      # 设置状态
│   │   ├── styles/
│   │   │   └── globals.css           # 全局样式
│   │   ├── types/
│   │   │   └── electron.d.ts         # Electron 类型声明
│   │   └── utils/                     # 工具函数
│   │       ├── schemaCompletion.ts   # Schema 补全引擎
│   │       ├── sqlFormatter.ts       # SQL 格式化工具
│   │       └── streamingMarkdown.ts  # 流式 Markdown 渲染
│   └── shared/                        # 主进程 / 渲染进程共享
│       ├── ipc-channels.ts            # IPC 通道名定义（单一真相源）
│       ├── types.ts                   # 共享 TypeScript 类型
│       ├── ipc-channels.test.ts       # IPC 通道测试
│       └── types.test.ts              # 类型测试
├── electron-builder.yml                # 打包配置
├── electron.vite.config.ts             # Vite 构建配置
├── tsconfig.json                       # TypeScript 根配置
├── tsconfig.main.json                  # 主进程 TS 配置
├── tsconfig.renderer.json              # 渲染进程 TS 配置
├── tailwind.config.js                  # Tailwind 配置
├── postcss.config.js                   # PostCSS 配置
├── vitest.config.ts                    # 测试配置
├── spec.md                            # 需求规格文档（SRS）
├── OPTIMIZATION_PLAN.md               # 优化计划
└── README.md                           # 本文档
```

---

## 📦 快速开始

### 环境要求

| 依赖 | 版本要求 | 说明 |
|------|----------|------|
| **Node.js** | ≥ 18.x | 推荐使用 20 LTS |
| **npm** | ≥ 9.x | 随 Node.js 附带 |
| **MySQL Client** | 任意版本 | 需 `mysqldump` 命令用于备份功能 |
| **操作系统** | Windows 10+ / macOS 11+ / Linux | 64 位 |
| **内存** | ≥ 8 GB | 推荐 16 GB |
| **存储** | SSD 推荐 | 需约 500 MB 可用空间 |

> 💡 **提示**：如果不需要备份功能，无需安装 MySQL Client。核心的数据库连接功能通过 `mysql2` 驱动实现，不依赖外部工具。

### 克隆项目

```bash
git clone <your-repo-url>
cd DBForge_AI
```

### 安装依赖

```bash
npm install
```

> ⚠️ **注意**：`better-sqlite3` 是原生模块，需要 C++ 编译环境。Windows 用户请确保已安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)；macOS 用户需安装 Xcode Command Line Tools (`xcode-select --install`)。

### 开发模式

```bash
npm run dev
```

启动后将打开 Electron 窗口，支持热重载（HMR），修改代码即见即所得。

### 构建与打包

```bash
# 基础构建（仅编译）
npm run build

# 在当前平台打包
npm run package

# 按平台打包
npm run package:win      # Windows (.exe NSIS 安装包)
npm run package:mac      # macOS (.dmg + .zip)
npm run package:linux    # Linux (.AppImage / .deb)
```

构建产物位于 `dist/` 目录。

---

## ⚙️ 配置指南

初次启动后会进入新手引导，或可在「设置」面板中完成以下配置：

### 1. AI 提供商配置

选择一种 AI 提供商并完成配置：

<details>
<summary><b>OpenAI</b> — 云端 API，综合能力最强</summary>

```
API Key：sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
模型：gpt-4o / gpt-4-turbo / gpt-4o-mini
Base URL：（留空使用默认）
```
</details>

<details>
<summary><b>Groq</b> — 极速推理，免费额度</summary>

```
API Key：gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
模型：llama3-70b-8192 / mixtral-8x7b-32768
```
</details>

<details>
<summary><b>Claude</b> — 擅长长文本与安全</summary>

```
API Key：sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
模型：claude-3-5-sonnet / claude-3-opus
```
</details>

<details>
<summary><b>DeepSeek</b> — 国产高性价比</summary>

```
API Key：sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
模型：deepseek-chat / deepseek-coder
```
</details>

<details>
<summary><b>Ollama</b> — 本地部署，完全离线</summary>

```bash
# 先安装并启动 Ollama
ollama pull qwen2.5:7b        # 推荐中文模型
ollama pull deepseek-coder    # 推荐代码模型

# 然后在应用中配置
Base URL：http://localhost:11434
模型：qwen2.5:7b
```
</details>

### 2. mysqldump 路径

应用启动时自动探测以下常见路径：

| 平台 | 探测路径 |
|------|----------|
| Windows | `C:\Program Files\MySQL\MySQL Server *\bin\mysqldump.exe` |
| macOS | `/usr/local/mysql/bin/mysqldump`、`/opt/homebrew/bin/mysqldump` |
| Linux | `/usr/bin/mysqldump`、`/usr/local/bin/mysqldump` |

探测失败时可手动指定，提供「检测」按钮验证路径有效性。

### 3. AI 模式选择

- **只读模式**（默认，推荐） — AI 仅生成 `SELECT` 语句，适合日常查询
- **完整模式** — 允许 DDL / DML 语句，适合开发者与 DBA

---

## 🧪 开发

### 可用脚本

| 脚本 | 说明 |
|------|------|
| `npm run dev` | 启动开发模式（HMR） |
| `npm run build` | 生产构建 |
| `npm run preview` | 预览构建结果 |
| `npm run package` | 构建并打包当前平台 |
| `npm test` | 运行所有测试 |
| `npm run test:watch` | 测试监听模式 |
| `npm run test:coverage` | 测试覆盖率报告 |
| `npm run typecheck` | 全量类型检查 |
| `npm run typecheck:main` | 仅主进程类型检查 |
| `npm run typecheck:renderer` | 仅渲染进程类型检查 |

### 测试

项目使用 **Vitest** 作为测试框架，结合 **fast-check** 进行属性测试：

```bash
# 运行所有测试
npm test

# 监听模式
npm run test:watch

# 生成覆盖率报告
npm run test:coverage
```

测试覆盖的核心模块：
- `AIModule.test.ts` — AI 模块单元测试
- `ConfigStore.test.ts` — 配置持久化测试
- `QueryExecutor.test.ts` — 查询执行与安全检查
- `schemaCompletion.test.ts` — Schema 补全引擎
- `sqlFormatter.test.ts` — SQL 格式化
- `streamingMarkdown.test.ts` — 流式 Markdown 渲染
- `ipc-channels.test.ts` — IPC 通道完整性

### 代码规范

- 所有新代码需通过 `npm run typecheck` 类型检查
- IPC 通道名统一在 `src/shared/ipc-channels.ts` 定义，禁止硬编码
- 共享类型定义在 `src/shared/types.ts`
- 数据库操作仅在 Main Process 中执行

---

## 🔒 安全设计

DBForge AI 从设计上优先考虑安全性：

| 安全措施 | 实现方式 |
|----------|----------|
| 进程隔离 | `contextIsolation: true`, `nodeIntegration: false` |
| 沙箱模式 | Renderer Process 运行在 Sandbox 中 |
| IPC 单向流 | 渲染进程仅可调用 preload 暴露的有限 API |
| SQL 执行 | 全部在主进程完成，渲染进程无法直接访问数据库 |
| 密钥保护 | 密码与 API Key 通过 `electron-store` AES 加密存储 |
| 日志脱敏 | 连接密码、API Key 等不出现在日志输出中 |
| 输入校验 | 所有 IPC 参数经 Zod 校验后处理 |

---

## 🌍 平台支持

| 平台 | 架构 | 安装包格式 |
|------|------|------------|
| Windows 10+ | x64, ia32 | NSIS 安装包 (.exe) |
| macOS 11+ | x64, arm64 (Apple Silicon) | DMG + ZIP |
| Linux | x64 | AppImage / deb |

---

## 🗺️ 路线图

### v1.0（当前版本）
- [x] MySQL 连接管理（含 SSL / SSH 隧道）
- [x] AI Text-to-SQL（5 种 LLM 提供商）
- [x] Monaco SQL 编辑器
- [x] Schema 浏览器
- [x] 数据导出（CSV / JSON / Excel）
- [x] 数据库备份恢复（mysqldump）
- [x] 查询历史记录
- [x] 安全机制（危险操作拦截）
- [x] 代码片段管理
- [x] ER 图
- [x] JOIN 可视化构建
- [x] 审计日志
- [x] 自动更新

### v2.0（规划中）
- [ ] PostgreSQL / SQLite 支持
- [ ] AI Agent 自动执行（需人工审批）
- [ ] 数据库迁移工具
- [ ] 云端同步与团队协作
- [ ] 数据可视化图表（柱状图 / 折线图 / 饼图）
- [ ] 多语言国际化（中文 / 英文）
- [ ] 插件系统

---

## 🤝 贡献

欢迎提交 Issue 与 Pull Request！

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/amazing-feature`
3. 提交变更：`git commit -m 'feat: add amazing feature'`
4. 推送到分支：`git push origin feature/amazing-feature`
5. 提交 Pull Request

---

## 📄 License

本项目基于 [MIT License](./LICENSE) 开源。

---

<div align="center">

**DBForge AI** — 让数据库管理更智能

</div>
