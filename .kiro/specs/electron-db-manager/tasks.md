# 实现计划：DBForge AI

## 概述

基于 Electron + Vite + React + TypeScript 技术栈，按照主进程/渲染进程分离架构逐步实现 DBForge AI 桌面数据库管理工具。实现顺序：项目脚手架 → 共享类型与 IPC 定义 → 主进程核心服务 → 渲染进程 UI → 集成联调。

## 任务

- [x] 1. 初始化项目结构与基础配置
  - 使用 `electron-vite` 脚手架创建项目，配置 `electron.vite.config.ts`
  - 配置 `electron-builder.yml`，支持 Windows / macOS / Linux 打包
  - 安装核心依赖：`mysql2`、`better-sqlite3`、`electron-store`、`ssh2`、`langchain`、`fast-check`、`vitest`、`react`、`zustand`、`monaco-editor`
  - 配置 TypeScript 严格模式，设置主进程与渲染进程各自的 `tsconfig.json`
  - 配置 Vitest 测试框架，设置测试脚本
  - _需求：13.2_

- [x] 2. 定义共享类型与 IPC 通道
  - [x] 2.1 创建 `src/shared/types.ts`，定义所有核心接口
    - 定义 `ConnectionConfig`、`SSHTunnelConfig`、`ConnectionGroup`、`ConnectionStatus`
    - 定义 `QueryOptions`、`QueryResult`、`ColumnMeta`、`DangerousCheckResult`
    - 定义 `AIConfig`、`TextToSQLRequest`、`TextToSQLResponse`
    - 定义 `BackupOptions`、`BackupProgress`、`QueryHistory`、`AuditEntry`
    - 定义 `AppConfig`、`IPCError`
    - _需求：1.1, 3.1, 5.1, 6.1, 7.1, 8.1, 19.1_
  - [x] 2.2 创建 `src/shared/ipc-channels.ts`，集中定义所有 IPC 通道常量
    - 定义连接、Schema、查询、AI、备份、历史、审计、设置、会话、更新等所有通道名
    - _需求：10.1, 10.2_

- [x] 3. 实现 ConfigStore 与加密工具
  - [x] 3.1 创建 `src/main/services/ConfigStore.ts`
    - 使用 `electron-store` 初始化配置存储，定义 `AppConfig` schema 与默认值
    - 实现密码与 API Key 的 `safeStorage.encryptString` / `decryptString` 加解密方法
    - 实现连接配置的读写（密码字段自动加解密）
    - _需求：1.3, 9.3, 10.5_
  - [ ]* 3.2 为 ConfigStore 编写属性测试
    - **属性 1：连接配置序列化往返**
    - **验证需求：1.1**
  - [ ]* 3.3 为加密工具编写属性测试
    - **属性 2：密码加密往返**
    - **验证需求：1.3, 9.3, 10.5**

- [x] 4. 实现 ConnectionManager
  - [x] 4.1 创建 `src/main/services/ConnectionManager.ts`
    - 实现连接配置的 CRUD（依赖 ConfigStore）
    - 使用 `mysql2` 创建和管理连接池，实现 `activateConnection` / `deactivateConnection`
    - 实现 `testConnection`，3 秒内返回结果
    - 实现连接状态实时追踪（`connected` / `disconnected` / `connecting` / `error`）
    - _需求：1.1, 1.2, 1.4, 1.5, 1.6, 1.9_
  - [x] 4.2 实现连接导入导出功能
    - 实现 `exportConnections`：序列化为 JSON，密码字段自动脱敏
    - 实现 `importConnections`：解析 JSON，加载到连接列表
    - _需求：1.7, 1.8_
  - [ ]* 4.3 为连接导出编写属性测试
    - **属性 3：连接导出时密码脱敏**
    - **验证需求：1.7**
  - [ ]* 4.4 为连接导入导出编写属性测试
    - **属性 4：连接导入导出往返**
    - **验证需求：1.7, 1.8**

- [x] 5. 实现 SSHTunnel
  - [x] 5.1 创建 `src/main/services/SSHTunnel.ts`
    - 使用 `ssh2` 建立 SSH 隧道，支持密码和私钥两种认证方式
    - 实现本地端口自动分配，隧道建立后返回本地转发地址
    - 实现隧道关闭与端口释放
    - _需求：17.1, 17.2, 17.3, 17.4_
  - [ ]* 5.2 为 SSHTunnel 编写单元测试
    - 测试认证方式选择逻辑、端口分配、错误处理
    - _需求：17.3_

- [x] 6. 实现 QueryExecutor
  - [x] 6.1 创建 `src/main/services/QueryExecutor.ts`
    - 实现 `execute` 方法：通过连接池执行 SQL，支持超时（默认 30s）和 AbortSignal 取消
    - 实现 `isDangerous` 纯函数：检测 DROP、TRUNCATE、无 WHERE 子句的 DELETE（含大小写/空白/注释变体）
    - 实现只读模式拦截：拒绝执行非 SELECT 语句
    - _需求：5.1, 5.6, 5.7, 10.3, 10.4, 15.1, 15.2_
  - [ ]* 6.2 为危险 SQL 检测编写属性测试
    - **属性 11：危险 SQL 检测覆盖所有变体**
    - **验证需求：5.7, 10.3**
  - [ ]* 6.3 为只读模式拦截编写属性测试
    - **属性 10：只读模式拒绝执行非 SELECT SQL**
    - **验证需求：10.4**

- [x] 7. 实现 HistoryStore 与 AuditLog
  - [x] 7.1 创建 `src/main/services/HistoryStore.ts`
    - 使用 `better-sqlite3` 初始化 `query_history` 表（含索引）
    - 实现查询历史的写入（含完整元数据）、按关键词/连接名搜索、按上限自动清理
    - _需求：6.1, 6.2, 6.4, 6.5_
  - [x] 7.2 创建 `src/main/services/AuditLog.ts`
    - 使用 `better-sqlite3` 初始化 `audit_log` 表（与历史记录分开存储）
    - 实现审计条目写入（含成功/失败状态）、按时间范围/连接名过滤、CSV 导出、按保留天数清理
    - _需求：19.1, 19.2, 19.3, 19.4, 19.5_
  - [ ]* 7.3 为 HistoryStore 编写属性测试
    - **属性 14：查询历史记录完整性**
    - **验证需求：6.1, 19.1**
  - [ ]* 7.4 为历史记录搜索编写属性测试
    - **属性 16：历史记录搜索结果一致性**
    - **验证需求：6.2**
  - [ ]* 7.5 为历史记录上限编写属性测试
    - **属性 17：历史记录数量上限不变量**
    - **验证需求：6.4**
  - [ ]* 7.6 为 AuditLog 编写属性测试
    - **属性 15：审计日志记录完整性**
    - **验证需求：19.1, 19.2**
  - [ ]* 7.7 为审计日志保留策略编写属性测试
    - **属性 18：审计日志保留策略不变量**
    - **验证需求：19.5**

- [x] 8. 实现 SnippetStore
  - [x] 8.1 创建 `src/main/services/SnippetStore.ts`
    - 使用 `better-sqlite3` 初始化 `sql_snippets` 表
    - 实现片段的增删改查（含标签支持）
    - _需求：4.6_
  - [ ]* 8.2 为 SnippetStore 编写属性测试
    - **属性 20：SQL 片段保存往返**
    - **验证需求：4.6**

- [x] 9. 实现 BackupManager
  - [x] 9.1 创建 `src/main/services/BackupManager.ts`
    - 实现 `detectMysqldump`：探测常见安装路径列表，返回第一个有效路径
    - 实现 `validateMysqldumpPath`：验证指定路径的可执行文件有效性
    - 实现 `backup`：在独立子进程中调用 mysqldump，支持进度回调和压缩选项
    - 实现 `restore`：调用 mysql 命令导入备份文件，支持进度回调
    - 实现 `openBackupFolder`：打开备份文件所在目录
    - _需求：7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 8.1, 8.2, 8.3, 11.3_
  - [ ]* 9.2 为路径探测编写属性测试
    - **属性 19：mysqldump 路径探测正确性**
    - **验证需求：8.1**

- [x] 10. 实现 AIModule
  - [x] 10.1 创建 `src/main/services/AIModule.ts`
    - 使用 LangChain.js 封装 OpenAI / Groq / Claude / DeepSeek / Ollama 多提供商
    - 实现 `textToSQL`：构建包含完整 Schema 的 Prompt，使用 Few-shot + JSON Mode 调用 LLM
    - 实现只读模式过滤：解析生成的 SQL，确保只读模式下仅返回 SELECT 语句
    - 实现 `explainResult`：对查询结果进行自然语言总结
    - 实现 `switchProvider`：切换 LLM 提供商配置
    - _需求：3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 9.1, 9.2_
  - [ ]* 10.2 为 Prompt 构建编写属性测试
    - **属性 5：AI Prompt 包含完整 Schema**
    - **验证需求：3.1**
  - [ ]* 10.3 为只读模式过滤编写属性测试
    - **属性 6：只读模式仅生成 SELECT**
    - **验证需求：3.3, 10.4**
  - [ ]* 10.4 为 AI 响应结构编写属性测试
    - **属性 7：AI 响应结构完整性**
    - **验证需求：3.5**

- [x] 11. 实现 SessionManager 与 AutoUpdater
  - [x] 11.1 创建 `src/main/services/SessionManager.ts`
    - 实现无操作超时计时，超时后断开所有活跃连接并推送锁定事件到渲染进程
    - 实现超时前 5 分钟预警推送
    - 实现会话延长接口
    - _需求：18.1, 18.2, 18.3, 18.4_
  - [x] 11.2 创建 `src/main/services/AutoUpdater.ts`
    - 使用 `electron-updater` 实现启动时静默检测更新
    - 实现更新通知推送（含版本号和更新摘要）、后台下载、重启安装
    - 错误时静默忽略，不影响主流程
    - _需求：23.1, 23.2, 23.3, 23.4, 23.5_

- [x] 12. 注册 IPC 处理器与 Preload 脚本
  - [x] 12.1 创建各 IPC 处理器文件
    - `src/main/ipc/connection.ts`：注册连接管理相关 IPC 处理器
    - `src/main/ipc/query.ts`：注册查询执行、取消、危险检测处理器
    - `src/main/ipc/ai.ts`：注册 AI Text-to-SQL、解释结果、配置保存处理器
    - `src/main/ipc/backup.ts`：注册备份、恢复、进度推送处理器
    - `src/main/ipc/settings.ts`：注册设置读写、历史、审计处理器
    - _需求：10.1, 10.2_
  - [x] 12.2 创建 `src/main/preload.ts`
    - 通过 `contextBridge` 暴露 `window.electronAPI`，封装所有 IPC 调用
    - 确保 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`
    - _需求：10.1_
  - [x] 12.3 创建 `src/main/index.ts` 主进程入口
    - 初始化所有服务，注册所有 IPC 处理器
    - 配置全局未捕获异常处理（`process.on('uncaughtException')`）
    - _需求：12.5_

- [x] 13. 检查点 - 主进程核心服务
  - 确保所有主进程服务单元测试通过，IPC 处理器注册无误，询问用户是否有问题。

- [x] 14. 实现渲染进程状态管理
  - [x] 14.1 创建 `src/renderer/store/connectionStore.ts`
    - 管理连接列表、活跃连接、连接状态的 Zustand store
    - _需求：1.4, 1.5, 16.1, 16.2_
  - [x] 14.2 创建 `src/renderer/store/editorStore.ts`
    - 管理多标签页状态（标签列表、当前活跃标签、内容、未保存标记）
    - _需求：14.1, 14.2, 14.3, 14.4_
  - [x] 14.3 创建 `src/renderer/store/resultStore.ts`
    - 管理查询结果、执行状态、分页、排序、搜索状态
    - _需求：5.2, 5.4, 22.1_
  - [x] 14.4 创建 `src/renderer/store/settingsStore.ts`
    - 管理 AI 配置、主题、语言、快捷键等设置状态
    - _需求：9.1, 9.4, 21.1_

- [x] 15. 实现 SQL 格式化与自动补全工具
  - [x] 15.1 创建 SQL 格式化工具函数
    - 集成 SQL 格式化库，实现 `formatSQL` 纯函数
    - _需求：4.3_
  - [ ]* 15.2 为 SQL 格式化编写属性测试
    - **属性 8：SQL 格式化幂等性**
    - **验证需求：4.3**
  - [x] 15.3 实现 Schema 自动补全提供者
    - 基于当前 Schema 生成 Monaco Editor 自动补全建议（表名、字段名）
    - _需求：4.2_
  - [ ]* 15.4 为自动补全编写属性测试
    - **属性 9：自动补全包含 Schema 中所有标识符**
    - **验证需求：4.2_

- [x] 16. 实现核心 UI 组件
  - [x] 16.1 创建 `src/renderer/components/ConnectionPanel/`
    - 实现连接列表（含分组折叠/展开、状态图标、拖拽排序）
    - 实现连接配置表单（含 SSH 隧道配置项）
    - 实现连接导入/导出按钮
    - _需求：1.1, 1.5, 1.7, 1.8, 16.1, 16.2, 16.3, 16.4, 17.1_
  - [x] 16.2 创建 `src/renderer/components/SchemaBrowser/`
    - 实现数据库/表/字段树形结构展示
    - 实现右键菜单（预览数据、刷新 Schema）
    - _需求：2.1, 2.2, 2.3, 2.4_
  - [x] 16.3 创建 `src/renderer/components/SQLEditor/`
    - 集成 Monaco Editor，配置 MySQL 语法高亮
    - 绑定 Ctrl+Enter（执行）、Ctrl+K（格式化）快捷键
    - 集成自动补全提供者
    - 实现暗黑模式主题跟随
    - _需求：4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 13.3_
  - [x] 16.4 创建 `src/renderer/components/TabManager/`
    - 实现多标签页 UI（新建、关闭确认、重命名、拖拽排序）
    - 确保关闭所有标签时自动创建空白标签
    - _需求：14.1, 14.2, 14.3, 14.4_

- [x] 17. 实现结果面板
  - [x] 17.1 创建 `src/renderer/components/ResultPanel/`
    - 实现虚拟列表表格渲染（支持 10 万行不卡顿）
    - 实现列排序、内容筛选
    - 实现分页加载
    - 实现 CSV / JSON / Excel 导出
    - 实现 Ctrl+F 行内搜索（含高亮、上下导航、大小写/精确匹配选项）
    - 实现查询取消按钮与 30 秒超时警告
    - _需求：5.2, 5.3, 5.4, 5.6, 11.2, 15.1, 15.2, 15.3, 15.4, 22.1, 22.2, 22.3, 22.4, 22.5_
  - [ ]* 17.2 为结果集排序编写属性测试
    - **属性 12：结果集排序不变量**
    - **验证需求：5.2**
  - [ ]* 17.3 为结果集导出编写属性测试
    - **属性 13：结果集导出往返**
    - **验证需求：5.3**

- [x] 18. 实现 AI 面板
  - [x] 18.1 创建 `src/renderer/components/AIPanel/`
    - 实现自然语言输入框与提交按钮
    - 实现 AI 生成 SQL 的展示（含解释文本、危险警告高亮）
    - 实现"AI 解释结果"按钮与结果展示
    - 实现 LLM 调用失败时的错误提示、重试按钮、切换模型选项
    - _需求：3.1, 3.5, 3.7, 3.8, 5.5, 12.2_

- [x] 19. 实现备份对话框与设置页面
  - [x] 19.1 创建 `src/renderer/components/BackupDialog/`
    - 实现备份配置表单（数据库选择、压缩选项、参数选项）
    - 实现进度条展示（备份阶段、百分比、文件大小）
    - 实现恢复文件选择与进度展示
    - 实现"打开备份文件夹"按钮
    - _需求：7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9_
  - [x] 19.2 创建 `src/renderer/components/Settings/`
    - 实现 AI 配置面板（提供商、API Key、模型、温度、只读/完整模式切换）
    - 实现主题与语言切换
    - 实现 mysqldump 路径配置与检测按钮
    - 实现自动备份开关与间隔配置
    - 实现会话超时配置
    - 实现快捷键管理界面（展示、修改、冲突检测、恢复默认）
    - 实现审计日志查看界面（过滤、导出 CSV）
    - 实现日志查看页面
    - 实现崩溃报告开关
    - _需求：9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 18.1, 19.3, 19.4, 21.1, 21.2, 21.3, 21.4, 21.5, 23.4, 24.3_

- [x] 20. 实现首次启动引导流程
  - [x] 20.1 创建引导组件
    - 实现欢迎界面与步骤导航
    - 实现 AI API Key 配置步骤（可跳过）
    - 实现添加第一个连接步骤（含连接验证）
    - 实现完成后自动激活连接并进入主界面
    - 实现跳过引导后的空状态提示
    - _需求：20.1, 20.2, 20.3, 20.4, 20.5_

- [x] 21. 实现 App 根组件与全局错误边界
  - [x] 21.1 创建 `src/renderer/App.tsx`
    - 组装所有顶层组件（ConnectionPanel、TabManager、SQLEditor、ResultPanel、AIPanel）
    - 实现 React Error Boundary，防止白屏
    - 实现主题切换（CSS 变量 / Tailwind dark mode）
    - 实现会话锁定界面（接收主进程推送的锁定事件）
    - _需求：12.5, 18.2, 18.3, 9.4_
  - [x] 21.2 创建 `src/renderer/main.tsx` 渲染进程入口
    - 初始化 React 应用，挂载 App 组件
    - 监听自动更新通知并展示更新提示
    - _需求：23.2, 23.3_

- [x] 22. 检查点 - 渲染进程 UI
  - 确保所有 UI 组件渲染正常，状态管理流转正确，询问用户是否有问题。

- [x] 23. 集成联调：连接管理与 Schema 浏览
  - [x] 23.1 联通 ConnectionPanel ↔ ConnectionManager IPC
    - 验证连接创建、测试、激活、状态更新的完整流程
    - 验证 SSH 隧道连接流程
    - _需求：1.1, 1.2, 1.4, 1.5, 1.6, 17.2_
  - [x] 23.2 联通 SchemaBrowser ↔ Schema 获取 IPC
    - 验证激活连接后自动加载 Schema 树
    - 验证右键预览数据功能
    - _需求：2.1, 2.2, 2.3, 2.4_

- [x] 24. 集成联调：SQL 执行完整流程
  - [x] 24.1 联通 SQLEditor → QueryExecutor → ResultPanel
    - 验证 Ctrl+Enter 触发执行、结果展示、错误高亮
    - 验证危险 SQL 二次确认弹窗
    - 验证查询取消与超时警告
    - 验证历史记录与审计日志自动写入
    - _需求：5.1, 5.6, 5.7, 6.1, 15.1, 15.2, 15.3, 15.4, 19.1_

- [x] 25. 集成联调：AI Text-to-SQL 完整流程
  - [x] 25.1 联通 AIPanel → AIModule → SQLEditor
    - 验证自然语言输入 → Schema 注入 → LLM 调用 → SQL 写入编辑器的完整流程
    - 验证只读模式限制
    - 验证 AI 解释结果功能
    - _需求：3.1, 3.2, 3.3, 3.5, 5.5_

- [x] 26. 最终检查点 - 确保所有测试通过
  - 运行全部单元测试与属性测试，确保通过，询问用户是否有问题。

## 备注

- 标有 `*` 的子任务为可选任务，可在 MVP 阶段跳过以加快交付
- 每个任务均引用具体需求条款，确保可追溯性
- 属性测试使用 `fast-check`，每个属性最少 100 次迭代
- 检查点任务确保增量验证，避免集成阶段大量返工
- 主进程服务（任务 3-12）应优先实现，渲染进程 UI（任务 14-21）依赖 IPC 接口稳定后再开发
