# 需求文档

## 简介

DBForge AI 是一款跨平台（Windows / macOS / Linux）Electron 桌面数据库管理工具，面向开发者、DBA、数据分析师和学生群体。核心功能包括：MySQL 数据库连接与管理、AI Text-to-SQL（自然语言生成 SQL）、Monaco Editor 专业 SQL 编辑器、查询执行与结果展示，以及数据库逻辑备份（mysqldump）。

应用完全本地化运行，无需服务器部署。AI 生成的 SQL 必须经用户手动确认后方可执行，危险操作须二次确认，保障数据安全。

---

## 词汇表

- **Application（应用）**：DBForge AI Electron 桌面应用程序整体
- **Main_Process（主进程）**：Electron 主进程，负责数据库操作、文件系统访问、子进程管理
- **Renderer_Process（渲染进程）**：Electron 渲染进程，负责 UI 展示与用户交互
- **Connection_Manager（连接管理器）**：负责 MySQL 连接配置的创建、保存、激活与状态管理的模块
- **Connection_Pool（连接池）**：由 mysql2 管理的数据库连接池，运行于主进程
- **Schema_Browser（Schema 浏览器）**：以树形结构展示数据库、表、字段信息的 UI 组件
- **AI_Module（AI 模块）**：接收自然语言输入、调用 LLM、返回 SQL 及解释的模块
- **LLM（大语言模型）**：支持 OpenAI / Groq / Claude / DeepSeek / Ollama 等 AI 服务提供商
- **SQL_Editor（SQL 编辑器）**：基于 Monaco Editor 的专业 SQL 编辑组件
- **Query_Executor（查询执行器）**：在主进程中安全执行 SQL 并返回结果的模块
- **Result_Panel（结果面板）**：以表格形式展示查询结果的 UI 组件
- **History_Store（历史存储）**：基于 better-sqlite3 的本地查询历史记录存储
- **Backup_Manager（备份管理器）**：调用 mysqldump / mysql 命令执行数据库备份与恢复的模块
- **Config_Store（配置存储）**：基于 electron-store 的本地配置持久化存储，密码字段加密
- **IPC（进程间通信）**：Electron 主进程与渲染进程之间的通信机制
- **Dangerous_SQL（危险 SQL）**：包含 DROP、TRUNCATE、无 WHERE 子句的 DELETE 等高风险操作的 SQL 语句
- **Read_Only_Mode（只读模式）**：AI 模块仅生成 SELECT 语句的工作模式（默认）
- **Full_Mode（完整模式）**：AI 模块允许生成 INSERT / UPDATE / DELETE / ALTER 等语句的工作模式
- **Tab_Manager（标签页管理器）**：管理 SQL 编辑器多标签页的生命周期（创建、关闭、重命名、排序）的模块
- **SSH_Tunnel（SSH 隧道）**：通过 SSH 跳板机建立加密隧道以访问内网数据库的连接方式
- **Session_Manager（会话管理器）**：管理用户会话超时与自动锁定的模块
- **Audit_Log（操作审计日志）**：记录所有 SQL 执行操作（含时间、连接名、SQL 内容）的本地日志
- **Auto_Updater（自动更新器）**：基于 electron-updater 检测并安装应用新版本的模块
- **Crash_Reporter（崩溃报告器）**：在用户授权下收集匿名崩溃信息的模块

---

## 需求

### 需求 1：数据库连接管理

**用户故事：** 作为开发者或 DBA，我希望能够创建、保存和管理多个 MySQL 连接配置，以便在不同数据库之间快速切换并保持多个连接同时活跃。

#### 验收标准

1. THE Connection_Manager SHALL 支持用户配置 MySQL 连接参数，包括主机、端口、用户名、密码和数据库名称。
2. WHEN 用户点击"测试连接"按钮时，THE Connection_Manager SHALL 在 3 秒内返回连接成功或失败的结果，失败时显示具体错误码与排查建议。
3. THE Config_Store SHALL 将连接配置持久化存储到本地，密码字段使用加密算法存储，不以明文形式保存。
4. THE Connection_Manager SHALL 支持多个连接同时保持活跃状态，每个活跃连接拥有独立的 SQL_Editor Tab。
5. WHILE 连接处于活跃状态，THE Connection_Manager SHALL 在左侧连接列表中以颜色与图标实时显示连接状态（在线 / 断线 / 连接中）。
6. WHEN 连接意外断开时，THE Connection_Manager SHALL 向用户显示断线提示并提供重连选项。
7. THE Connection_Manager SHALL 支持将连接配置导出为文件，导出时密码字段自动脱敏。
8. WHEN 用户导入连接配置文件时，THE Connection_Manager SHALL 解析配置并将其加载到连接列表中。
9. THE Connection_Pool SHALL 在 Main_Process 中管理数据库连接池，所有数据库操作通过连接池执行。

---

### 需求 2：Schema 浏览器

**用户故事：** 作为开发者或 DBA，我希望能够直观地浏览数据库结构，以便快速了解表和字段信息，辅助 SQL 编写。

#### 验收标准

1. WHEN 用户激活一个数据库连接时，THE Schema_Browser SHALL 自动获取并展示该数据库的表名、字段名、字段类型、主键和外键信息。
2. THE Schema_Browser SHALL 以树形结构展示数据库 → 表 → 字段的层级关系。
3. WHEN 用户点击"刷新 Schema"按钮时，THE Schema_Browser SHALL 重新获取最新的数据库结构并更新展示。
4. WHEN 用户右键点击表名时，THE Schema_Browser SHALL 显示快捷菜单，选择"预览数据"后自动执行查询并展示该表前 100 行数据。

---

### 需求 3：AI Text-to-SQL

**用户故事：** 作为开发者、数据分析师或学生，我希望通过输入自然语言描述来生成 SQL 语句，以便降低 SQL 编写门槛并提高查询效率。

#### 验收标准

1. WHEN 用户在 AI 输入框中提交自然语言描述时，THE AI_Module SHALL 自动获取当前数据库的最新 Schema 并将其注入 Prompt。
2. WHEN AI_Module 获取到 Schema 后，THE AI_Module SHALL 调用已配置的 LLM（OpenAI / Groq / Claude / DeepSeek / Ollama）生成对应的 SQL 语句，云端 LLM 响应时间 ≤ 3 秒，本地 Ollama 响应时间 ≤ 5 秒。
3. WHILE 应用处于 Read_Only_Mode 时，THE AI_Module SHALL 仅生成 SELECT 语句，拒绝生成任何写操作或 DDL 语句。
4. WHERE 用户在设置中手动开启 Full_Mode，THE AI_Module SHALL 允许生成 INSERT / UPDATE / DELETE / ALTER 等语句。
5. WHEN AI_Module 生成 SQL 后，THE AI_Module SHALL 同时返回对该 SQL 的自然语言解释，并将 SQL 渲染到 SQL_Editor 中供用户审阅。
6. THE AI_Module SHALL 使用 Few-shot Prompt 与 JSON Mode 控制 LLM 输出格式，确保返回结构化的 SQL 与解释字段。
7. IF AI_Module 调用 LLM 失败，THEN THE AI_Module SHALL 显示具体错误原因，并提供一键重试和切换备用模型的选项。
8. WHEN AI_Module 生成包含 Dangerous_SQL 的语句时，THE SQL_Editor SHALL 在编辑器中高亮警告相关语句。

---

### 需求 4：SQL 编辑器

**用户故事：** 作为开发者或 DBA，我希望拥有一个专业级 SQL 编辑器，以便高效编写、格式化和管理 SQL 语句。

#### 验收标准

1. THE SQL_Editor SHALL 集成 Monaco Editor，提供 MySQL 语法高亮功能。
2. THE SQL_Editor SHALL 基于当前连接的 Schema 动态提供表名和字段名的自动补全建议。
3. WHEN 用户触发格式化操作（快捷键 Ctrl+K）时，THE SQL_Editor SHALL 对当前 SQL 内容进行标准化格式化。
4. THE SQL_Editor SHALL 跟随系统暗黑模式自动切换编辑器主题。
5. WHEN SQL_Editor 检测到语法错误时，THE SQL_Editor SHALL 实时在对应行显示错误提示。
6. THE SQL_Editor SHALL 支持用户保存常用 SQL 片段（Snippets），并支持快速插入到编辑器中。
7. WHEN AI_Module 将生成的 SQL 写入 SQL_Editor 后，THE SQL_Editor SHALL 允许用户在执行前对 SQL 内容进行编辑修改。

---

### 需求 5：SQL 执行与结果展示

**用户故事：** 作为开发者或数据分析师，我希望能够安全执行 SQL 并以清晰的表格形式查看结果，以便快速分析数据。

#### 验收标准

1. WHEN 用户触发执行操作（快捷键 Ctrl+Enter）时，THE Query_Executor SHALL 通过 IPC 将 SQL 发送至 Main_Process 执行，并将结果返回给 Result_Panel。
2. WHEN SQL 执行成功时，THE Result_Panel SHALL 以表格形式展示结果，支持列排序和内容筛选。
3. THE Result_Panel SHALL 支持将查询结果导出为 CSV、JSON 和 Excel 格式。
4. WHEN 查询结果超过单页显示上限时，THE Result_Panel SHALL 采用分页加载与虚拟列表渲染，确保 10 万行数据加载不卡顿。
5. WHEN 用户点击"AI 解释"按钮时，THE AI_Module SHALL 对当前查询结果进行自然语言总结与洞察分析。
6. WHEN SQL 执行失败时，THE Query_Executor SHALL 高亮错误行，并展示 MySQL 原始错误信息与友好说明。
7. WHEN SQL 执行包含 Dangerous_SQL 时，THE Query_Executor SHALL 在执行前弹出二次确认弹窗，用户明确确认后方可执行。

---

### 需求 6：查询历史记录

**用户故事：** 作为开发者或 DBA，我希望能够查看和重用历史 SQL 查询，以便快速复现之前的操作。

#### 验收标准

1. WHEN SQL 执行完成时，THE History_Store SHALL 自动保存本次查询记录，包含 SQL 内容、执行时间、耗时、返回行数和所属连接名。
2. THE History_Store SHALL 支持按关键词搜索历史记录，以及按连接名过滤历史记录。
3. WHEN 用户点击历史记录中的某条 SQL 时，THE SQL_Editor SHALL 将该 SQL 加载到编辑器中供用户重放。
4. THE History_Store SHALL 按照用户配置的上限（默认 1000 条）自动清理最旧的历史记录，防止本地存储无限增长。
5. WHERE 用户在设置中修改历史记录上限，THE History_Store SHALL 应用新的上限值并在下次写入时生效。

---

### 需求 7：数据库备份与恢复

**用户故事：** 作为 DBA 或运维人员，我希望能够一键备份和恢复 MySQL 数据库，以便保护数据资产并满足日常运维需求。

#### 验收标准

1. WHEN 用户触发备份操作时，THE Backup_Manager SHALL 调用 mysqldump 命令执行逻辑备份，支持 `--single-transaction`、`--routines`、`--triggers` 参数。
2. WHEN 备份开始前，THE Backup_Manager SHALL 展示目标数据库的 Schema 信息与数据量预估，供用户确认。
3. THE Backup_Manager SHALL 弹出保存路径选择对话框，默认路径为系统下载目录，文件名包含时间戳。
4. WHERE 用户选择压缩选项，THE Backup_Manager SHALL 将备份文件以 .sql.gz 格式压缩保存。
5. WHEN 备份完成时，THE Backup_Manager SHALL 显示备份文件大小与耗时，并记录备份文件路径。
6. THE Backup_Manager SHALL 在独立子进程中执行备份，备份过程中主界面保持响应，并显示进度条。
7. WHEN 用户触发恢复操作并选择备份文件时，THE Backup_Manager SHALL 调用 mysql 命令将备份文件导入目标数据库。
8. IF 备份或恢复操作失败，THEN THE Backup_Manager SHALL 保留完整错误日志，并向用户展示失败原因与可能的解决建议。
9. THE Backup_Manager SHALL 支持用户一键打开备份文件所在文件夹。

---

### 需求 8：mysqldump 路径配置

**用户故事：** 作为 DBA 或运维人员，我希望应用能够自动找到 mysqldump 工具，以便无需手动配置即可使用备份功能。

#### 验收标准

1. WHEN 应用启动时，THE Backup_Manager SHALL 自动探测常见安装路径（包括 `/usr/bin/mysqldump`、`/usr/local/bin/mysqldump`、`C:\Program Files\MySQL\...` 等），自动探测成功率 ≥ 90%（主流安装路径）。
2. IF 自动探测 mysqldump 路径失败，THEN THE Application SHALL 引导用户在设置页面手动指定 mysqldump 路径。
3. WHEN 用户在设置页面点击"检测"按钮时，THE Backup_Manager SHALL 验证指定路径的 mysqldump 可执行文件有效性，并在 3 秒内返回验证结果。

---

### 需求 9：系统设置

**用户故事：** 作为所有用户，我希望能够在设置页面统一管理 AI、主题、语言和备份等全局配置，以便个性化定制应用行为。

#### 验收标准

1. THE Application SHALL 提供设置页面，支持配置 AI 提供商 API Key、模型选择和温度参数。
2. THE Application SHALL 在设置页面提供 AI 模式切换开关，允许用户在 Read_Only_Mode 和 Full_Mode 之间切换。
3. THE Config_Store SHALL 将 API Key 加密存储，不以明文形式出现在日志或配置文件中。
4. THE Application SHALL 支持主题切换（跟随系统 / 亮色 / 暗色）和界面语言切换（中文 / 英文）。
5. THE Application SHALL 支持配置自动备份开关与备份间隔。
6. THE Application SHALL 提供日志查看页面，展示应用运行日志，便于排查问题。

---

### 需求 10：安全机制

**用户故事：** 作为所有用户，我希望应用具备完善的安全防护，以防止误操作导致数据丢失或泄露。

#### 验收标准

1. THE Application SHALL 启用 Electron `contextIsolation`、`nodeIntegration: false` 和 Sandbox 安全配置。
2. THE Main_Process SHALL 执行所有数据库操作，渲染进程不直接访问数据库。
3. WHEN Query_Executor 接收到 SQL 时，THE Query_Executor SHALL 在执行前对 SQL 进行危险关键词二次校验（DROP、TRUNCATE、无 WHERE 子句的 DELETE）。
4. WHILE 应用处于 Read_Only_Mode 时，THE Query_Executor SHALL 拒绝执行任何非 SELECT 类型的 SQL 语句。
5. THE Config_Store SHALL 确保 API Key 和数据库密码不以明文形式出现在任何日志输出中。

---

### 需求 11：性能要求

**用户故事：** 作为所有用户，我希望应用具备流畅的响应速度，以便在日常工作中高效使用。

#### 验收标准

1. THE Application SHALL 在配置为 8GB RAM + SSD 的机器上，冷启动时间 ≤ 2 秒。
2. WHEN 查询结果包含 10 万行数据时，THE Result_Panel SHALL 通过分页加载与虚拟列表渲染，保持界面流畅无卡顿。
3. THE Backup_Manager SHALL 在独立子进程中执行备份，确保备份过程不阻塞主界面交互。

---

### 需求 12：错误处理

**用户故事：** 作为所有用户，我希望在遇到错误时能获得清晰的提示和解决建议，以便快速定位和解决问题。

#### 验收标准

1. IF 数据库连接失败，THEN THE Connection_Manager SHALL 显示具体错误码、常见原因说明和排查建议。
2. IF AI_Module 调用 LLM 失败，THEN THE AI_Module SHALL 显示错误原因，并提供一键重试和切换备用模型的选项。
3. IF 备份或恢复操作失败，THEN THE Backup_Manager SHALL 保留完整错误日志，并向用户展示失败原因与可能的解决建议。
4. IF SQL 执行失败，THEN THE Query_Executor SHALL 高亮错误行，展示 MySQL 原始错误信息与友好说明。
5. THE Application SHALL 确保所有错误场景均有明确的用户提示，不出现白屏或无响应情况。

---

### 需求 13：跨平台兼容性

**用户故事：** 作为所有用户，我希望应用能够在 Windows、macOS 和 Linux 上正常运行，以便在不同操作系统环境中使用。

#### 验收标准

1. THE Application SHALL 支持在 Windows 10+、macOS 11+ 和 Linux（Ubuntu / Fedora）上正常运行。
2. THE Application SHALL 使用 electron-builder 打包，生成各平台对应的安装包，跨平台打包后可正常运行。
3. THE Application SHALL 提供丰富的键盘快捷键支持，包括 Ctrl+Enter（执行 SQL）和 Ctrl+K（格式化 SQL）。

---

### 需求 14：多标签页管理

**用户故事：** 作为开发者或 DBA，我希望能够灵活管理多个 SQL 编辑器标签页，以便在不同查询之间高效切换和组织工作。

#### 验收标准

1. THE Tab_Manager SHALL 支持用户关闭单个 SQL_Editor Tab，关闭前若 Tab 内容未保存则弹出确认提示。
2. THE Tab_Manager SHALL 支持用户对 SQL_Editor Tab 进行重命名，以便标识不同查询的用途。
3. THE Tab_Manager SHALL 支持用户通过拖拽方式调整 SQL_Editor Tab 的排列顺序。
4. WHEN 用户关闭所有 Tab 时，THE Tab_Manager SHALL 自动创建一个空白 Tab，确保编辑器区域始终可用。

---

### 需求 15：SQL 执行取消

**用户故事：** 作为开发者或 DBA，我希望能够取消正在执行的 SQL 查询，以便在查询耗时过长时中止操作，避免长时间等待。

#### 验收标准

1. WHEN SQL 开始执行后，THE Query_Executor SHALL 在界面上显示"取消"按钮，允许用户中止当前查询。
2. WHEN 用户点击"取消"按钮时，THE Query_Executor SHALL 通过 IPC 向 Main_Process 发送取消指令，终止对应的数据库查询。
3. WHEN 查询被取消后，THE Result_Panel SHALL 显示"查询已取消"提示，并清除当前执行状态。
4. WHEN 查询执行超过 30 秒时，THE Query_Executor SHALL 向用户显示超时警告，并提供取消选项。

---

### 需求 16：连接分组管理

**用户故事：** 作为开发者或 DBA，我希望能够将连接按项目或环境分组，以便在连接数量较多时快速定位目标连接。

#### 验收标准

1. THE Connection_Manager SHALL 支持用户创建连接分组，并将连接配置归属到指定分组（如 dev / staging / prod）。
2. THE Connection_Manager SHALL 在左侧连接列表中以折叠/展开方式展示连接分组。
3. THE Connection_Manager SHALL 支持用户对分组进行重命名和删除操作，删除分组时提示用户处理组内连接。
4. THE Connection_Manager SHALL 支持用户通过拖拽将连接在不同分组之间移动。

---

### 需求 17：SSH 隧道连接

**用户故事：** 作为 DBA 或运维人员，我希望能够通过 SSH 隧道连接内网数据库，以便在生产环境中安全访问不直接暴露端口的数据库服务器。

#### 验收标准

1. THE Connection_Manager SHALL 支持在连接配置中启用 SSH 隧道选项，配置参数包括 SSH 主机、端口、用户名、认证方式（密码或私钥文件）。
2. WHEN 用户启用 SSH 隧道时，THE Connection_Manager SHALL 先建立 SSH 连接，再通过隧道转发端口连接 MySQL 数据库。
3. WHEN SSH 隧道连接失败时，THE Connection_Manager SHALL 显示具体的 SSH 错误信息与排查建议。
4. WHEN 用户断开连接时，THE Connection_Manager SHALL 同时关闭对应的 SSH 隧道，释放占用的本地端口。
5. THE Config_Store SHALL 将 SSH 私钥路径和密码加密存储，不以明文形式保存。

---

### 需求 18：会话超时与自动锁定

**用户故事：** 作为所有用户，我希望应用在长时间无操作后自动锁定，以防止他人在我离开时误操作数据库。

#### 验收标准

1. THE Session_Manager SHALL 支持用户在设置中配置无操作超时时长（默认 30 分钟，可设置为"从不"）。
2. WHEN 用户无操作时间达到配置的超时时长时，THE Session_Manager SHALL 自动断开所有活跃数据库连接并显示锁定界面。
3. WHEN 应用处于锁定状态时，THE Session_Manager SHALL 要求用户重新输入凭据（或重新建立连接）后方可继续操作。
4. THE Session_Manager SHALL 在超时前 5 分钟向用户显示即将超时的提示，允许用户选择延长会话。

---

### 需求 19：操作审计日志

**用户故事：** 作为 DBA 或运维人员，我希望应用记录所有 SQL 执行操作，以便满足合规需求并在出现问题时追溯操作历史。

#### 验收标准

1. WHEN 任意 SQL 语句被执行时，THE Audit_Log SHALL 记录操作条目，包含执行时间、所属连接名、SQL 内容、执行结果（成功/失败）和影响行数。
2. THE Audit_Log SHALL 将审计日志持久化存储到本地，与查询历史记录分开存储。
3. THE Application SHALL 在设置页面提供审计日志查看界面，支持按时间范围和连接名过滤。
4. THE Audit_Log SHALL 支持将审计日志导出为 CSV 格式，便于外部审查。
5. THE Audit_Log SHALL 按照可配置的保留策略（默认保留 90 天）自动清理过期日志。

---

### 需求 20：首次启动引导

**用户故事：** 作为新用户，我希望首次打开应用时有清晰的引导流程，以便快速完成初始配置并开始使用。

#### 验收标准

1. WHEN 应用首次启动时（无任何已保存配置），THE Application SHALL 显示欢迎引导界面。
2. THE Application 引导流程 SHALL 包含以下步骤：配置 AI 提供商 API Key（可跳过）、添加第一个数据库连接、验证连接可用性。
3. WHEN 用户完成引导流程后，THE Application SHALL 自动激活已配置的连接并进入主界面。
4. THE Application SHALL 在引导流程的每个步骤提供说明文字，帮助用户理解配置项的用途。
5. WHEN 用户选择跳过引导时，THE Application SHALL 直接进入主界面，并在连接列表为空时显示"添加连接"的引导提示。

---

### 需求 21：快捷键自定义

**用户故事：** 作为开发者或 DBA，我希望能够自定义应用快捷键，以便与我的个人习惯或其他工具保持一致。

#### 验收标准

1. THE Application SHALL 在设置页面提供快捷键管理界面，展示所有可自定义的快捷键及其当前绑定。
2. WHEN 用户点击某个快捷键条目并按下新的按键组合时，THE Application SHALL 将该操作绑定到新的快捷键。
3. IF 用户设置的快捷键与系统或应用内其他快捷键冲突，THEN THE Application SHALL 显示冲突提示并要求用户重新选择。
4. THE Application SHALL 提供"恢复默认"按钮，允许用户将所有快捷键重置为默认配置。
5. THE Config_Store SHALL 持久化保存用户自定义的快捷键配置，应用重启后生效。

---

### 需求 22：结果集行内搜索

**用户故事：** 作为开发者或数据分析师，我希望能够在查询结果表格中快速搜索特定值，以便在大量数据中定位目标行。

#### 验收标准

1. THE Result_Panel SHALL 支持用户通过快捷键（Ctrl+F）或工具栏按钮激活结果集行内搜索功能。
2. WHEN 用户在搜索框中输入关键词时，THE Result_Panel SHALL 实时高亮所有匹配的单元格内容。
3. THE Result_Panel SHALL 提供"上一个"和"下一个"导航按钮，允许用户在匹配结果之间跳转。
4. THE Result_Panel SHALL 支持大小写敏感和精确匹配的搜索选项。
5. WHEN 用户关闭搜索框时，THE Result_Panel SHALL 清除所有高亮并恢复正常显示状态。

---

### 需求 23：自动更新

**用户故事：** 作为所有用户，我希望应用能够自动检测并安装新版本，以便始终使用最新功能和安全修复。

#### 验收标准

1. WHEN 应用启动时，THE Auto_Updater SHALL 在后台静默检测是否有新版本可用。
2. WHEN 检测到新版本时，THE Auto_Updater SHALL 向用户显示更新通知，包含版本号和更新内容摘要，并提供"立即更新"和"稍后提醒"选项。
3. WHEN 用户选择"立即更新"时，THE Auto_Updater SHALL 在后台下载更新包，下载完成后提示用户重启应用以完成安装。
4. THE Auto_Updater SHALL 支持用户在设置页面手动触发检查更新。
5. IF 更新检测或下载失败，THEN THE Auto_Updater SHALL 静默忽略错误，不影响应用正常使用。

---

### 需求 24：崩溃报告

**用户故事：** 作为所有用户，我希望应用崩溃时能够收集错误信息（在我授权的前提下），以便帮助开发团队快速修复问题。

#### 验收标准

1. WHEN 应用首次启动时，THE Crash_Reporter SHALL 向用户展示崩溃报告授权说明，用户明确同意后方可启用。
2. WHEN 应用发生崩溃时，THE Crash_Reporter SHALL 收集匿名的崩溃堆栈信息，不包含任何数据库内容、SQL 语句或个人信息。
3. THE Application SHALL 在设置页面提供崩溃报告开关，允许用户随时开启或关闭。
4. WHEN 崩溃报告功能关闭时，THE Crash_Reporter SHALL 不收集、不发送任何崩溃数据。
