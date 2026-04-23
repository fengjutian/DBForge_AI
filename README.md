# DBForge AI

跨平台桌面数据库管理工具，集成 AI Text-to-SQL，帮助开发者、DBA 和数据分析师高效操作 MySQL 数据库。

## 功能特性

- **AI Text-to-SQL** — 自然语言生成 SQL，支持 OpenAI / Groq / Claude / DeepSeek / Ollama
- **专业 SQL 编辑器** — 基于 Monaco Editor，支持语法高亮、智能补全、格式化
- **Schema 浏览器** — 树形展示数据库结构，右键快速预览表数据
- **查询结果导出** — 支持 CSV / JSON / Excel 格式
- **数据库备份恢复** — 基于 mysqldump，支持压缩备份
- **查询历史记录** — 本地保存，支持搜索与重放
- **安全机制** — 危险操作（DROP / TRUNCATE 等）高亮警告 + 二次确认
- **完全本地化** — 无需服务器，数据不离开本机

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Electron + Vite + React + TypeScript |
| UI | Tailwind CSS |
| 编辑器 | Monaco Editor |
| 数据库 | mysql2 |
| AI | LangChain.js |
| 本地存储 | electron-store + better-sqlite3 |
| 打包 | electron-builder |

## 快速开始

### 环境要求

- Node.js 18+
- MySQL 客户端（需要 `mysqldump` 用于备份功能）

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建

```bash
# 当前平台
npm run package

# 指定平台
npm run package:win
npm run package:mac
npm run package:linux
```

## 配置

首次启动后，在「设置」中配置：

1. **AI 提供商** — 填入 API Key，选择模型（或配置本地 Ollama 地址）
2. **mysqldump 路径** — 应用会自动探测，探测失败时手动指定
3. **AI 模式** — 只读模式（仅 SELECT）或完整模式（允许写操作）

## 开发

```bash
# 运行测试
npm test

# 类型检查
npm run typecheck

# 测试覆盖率
npm run test:coverage
```

## 支持平台

- Windows 10+
- macOS 11+
- Linux（Ubuntu / Fedora）

## License

MIT
