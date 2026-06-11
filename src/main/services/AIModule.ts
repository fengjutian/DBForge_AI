import { BrowserWindow } from 'electron'
import type {
  AIConfig,
  AIProvider,
  TextToSQLRequest,
  TextToSQLResponse,
  QueryResult,
  DatabaseSchema,
  OptimizeQueryRequest,
  OptimizeQueryResponse,
  DiagnoseErrorRequest,
  DiagnoseErrorResponse,
  SchemaDocRequest,
  SchemaDocResponse,
  SecurityAuditRequest,
  SecurityAuditResponse,
  MigrationRequest,
  MigrationResponse,
  DataQualityRequest,
  DataQualityResponse
} from '../../shared/types'
import { IPC } from '../../shared/ipc-channels'
import configStore from './ConfigStore'

// ============================================================
// LangChain provider factory helpers
// ============================================================

// We use dynamic imports so that missing optional packages don't crash startup.
// Each provider is loaded on demand when first used.

interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface LLMClient {
  invoke(messages: LLMMessage[], jsonMode?: boolean): Promise<string>
  stream(
    messages: LLMMessage[],
    onChunk: (chunk: string) => void,
    onThinking?: (chunk: string) => void
  ): Promise<string>
}

// ============================================================
// Few-shot examples for Text-to-SQL
// ============================================================

const FEW_SHOT_EXAMPLES = `
Example 1:
User: "查询所有用户的姓名和邮箱"
Response: {"sql":"SELECT name, email FROM users","explanation":"从 users 表中查询所有用户的姓名和邮箱字段","isDangerous":false}

Example 2:
User: "统计每个部门的员工数量，按数量降序排列"
Response: {"sql":"SELECT department, COUNT(*) AS employee_count FROM employees GROUP BY department ORDER BY employee_count DESC","explanation":"按部门分组统计员工数量，并按数量从高到低排序","isDangerous":false}

Example 3:
User: "查找最近7天内注册的用户"
Response: {"sql":"SELECT * FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)","explanation":"查询 created_at 字段在最近7天内的用户记录","isDangerous":false}
`

// ============================================================
// SQL readonly filter
// ============================================================

const WRITE_STATEMENT_PATTERN =
  /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|REPLACE|RENAME|GRANT|REVOKE|LOCK|UNLOCK)\b/i

/**
 * Parse the SQL from an AI response and filter out non-SELECT statements
 * when in readonly mode.
 */
export function filterReadonlySQL(sql: string): string | null {
  const trimmed = sql.trim()
  if (WRITE_STATEMENT_PATTERN.test(trimmed)) {
    return null
  }
  return trimmed
}

/**
 * Build a schema description string for injection into the AI prompt.
 */
export function buildSchemaDescription(schema: DatabaseSchema): string {
  const lines: string[] = []
  for (const db of schema.databases) {
    lines.push(`Database: ${db.name}`)
    for (const table of db.tables) {
      const cols = table.columns
        .map((c) => {
          let desc = `${c.name} ${c.type}`
          if (!c.nullable) desc += ' NOT NULL'
          if (c.comment) desc += ` -- ${c.comment}`
          return desc
        })
        .join(', ')
      const pks = table.primaryKeys.length > 0 ? ` PK(${table.primaryKeys.join(',')})` : ''
      lines.push(`  Table: ${table.name}${pks} (${cols})`)
      if (table.foreignKeys.length > 0) {
        for (const fk of table.foreignKeys) {
          lines.push(
            `    FK: ${fk.columnName} -> ${fk.referencedTable}.${fk.referencedColumn}`
          )
        }
      }
    }
  }
  return lines.join('\n')
}

// ============================================================
// AIModule — singleton
// ============================================================

class AIModule {
  private static instance: AIModule | null = null
  private currentConfig: AIConfig | null = null
  private llmClient: LLMClient | null = null

  private constructor() {}

  static getInstance(): AIModule {
    if (!AIModule.instance) {
      AIModule.instance = new AIModule()
    }
    return AIModule.instance
  }

  // ============================================================
  // Provider management
  // ============================================================

  async switchProvider(config: AIConfig): Promise<void> {
    this.currentConfig = config
    this.llmClient = null // reset; will be lazily re-created
    configStore.saveAIConfig(config)
  }

  private getConfig(): AIConfig {
    if (this.currentConfig) return this.currentConfig
    const stored = configStore.getAIConfig()
    this.currentConfig = stored
    return stored
  }

  private async getLLMClient(): Promise<LLMClient> {
    if (this.llmClient) return this.llmClient

    const config = this.getConfig()
    const apiKey = configStore.getDecryptedAPIKey() ?? config.apiKey ?? ''

    this.llmClient = await this.createClient(config.provider, apiKey, config)
    return this.llmClient
  }

  private async createClient(
    provider: AIProvider,
    apiKey: string,
    config: AIConfig
  ): Promise<LLMClient> {
    switch (provider) {
      case 'openai':
        return this.createOpenAIClient(apiKey, config)
      case 'groq':
        return this.createGroqClient(apiKey, config)
      case 'claude':
        return this.createClaudeClient(apiKey, config)
      case 'deepseek':
        return this.createDeepSeekClient(apiKey, config)
      case 'ollama':
        return this.createOllamaClient(config)
      default:
        throw new Error(`不支持的 AI 提供商: ${provider}`)
    }
  }

  private async createOpenAIClient(apiKey: string, config: AIConfig): Promise<LLMClient> {
    try {
      const { ChatOpenAI } = await import('@langchain/openai')
      const model = new ChatOpenAI({
        openAIApiKey: apiKey,
        modelName: config.model || 'gpt-4o-mini',
        temperature: config.temperature ?? 0.2,
        streaming: true
      })
      return {
        invoke: async (messages) => {
          const { HumanMessage, SystemMessage } = await import('@langchain/core/messages')
          const lc = messages.map(m => m.role === 'system' ? new SystemMessage(m.content) : new HumanMessage(m.content))
          const response = await model.invoke(lc)
          return typeof response.content === 'string' ? response.content : JSON.stringify(response.content)
        },
        stream: async (messages, onChunk, onThinking) => {
          const { HumanMessage, SystemMessage } = await import('@langchain/core/messages')
          const lc = messages.map(m => m.role === 'system' ? new SystemMessage(m.content) : new HumanMessage(m.content))
          let full = ''
          const stream = await model.stream(lc)
          for await (const chunk of stream) {
            // o1/o3 reasoning via additional_kwargs
            const reasoning = (chunk.additional_kwargs as Record<string, unknown>)?.reasoning as string | undefined
            if (reasoning) onThinking?.(reasoning)
            const text = typeof chunk.content === 'string' ? chunk.content : ''
            if (text) { full += text; onChunk(text) }
          }
          return full
        }
      }
    } catch {
      return this.createFallbackHTTPClient(
        'https://api.openai.com/v1/chat/completions',
        apiKey, config.model || 'gpt-4o-mini', config.temperature ?? 0.2
      )
    }
  }

  private async createGroqClient(apiKey: string, config: AIConfig): Promise<LLMClient> {
    try {
      const { ChatGroq } = await import('@langchain/groq')
      const model = new ChatGroq({
        apiKey, model: config.model || 'llama3-8b-8192',
        temperature: config.temperature ?? 0.2, streaming: true
      })
      return {
        invoke: async (messages) => {
          const { HumanMessage, SystemMessage } = await import('@langchain/core/messages')
          const lc = messages.map(m => m.role === 'system' ? new SystemMessage(m.content) : new HumanMessage(m.content))
          const response = await model.invoke(lc)
          return typeof response.content === 'string' ? response.content : JSON.stringify(response.content)
        },
        stream: async (messages, onChunk, _onThinking) => {
          const { HumanMessage, SystemMessage } = await import('@langchain/core/messages')
          const lc = messages.map(m => m.role === 'system' ? new SystemMessage(m.content) : new HumanMessage(m.content))
          let full = ''
          const stream = await model.stream(lc)
          for await (const chunk of stream) {
            const text = typeof chunk.content === 'string' ? chunk.content : ''
            if (text) { full += text; onChunk(text) }
          }
          return full
        }
      }
    } catch {
      return this.createFallbackHTTPClient(
        'https://api.groq.com/openai/v1/chat/completions',
        apiKey, config.model || 'llama3-8b-8192', config.temperature ?? 0.2
      )
    }
  }

  private async createClaudeClient(apiKey: string, config: AIConfig): Promise<LLMClient> {
    try {
      const { ChatAnthropic } = await import('@langchain/anthropic')
      const model = new ChatAnthropic({
        anthropicApiKey: apiKey,
        model: config.model || 'claude-3-haiku-20240307',
        temperature: config.temperature ?? 0.2, streaming: true
      })
      return {
        invoke: async (messages) => {
          const { HumanMessage, SystemMessage } = await import('@langchain/core/messages')
          const lc = messages.map(m => m.role === 'system' ? new SystemMessage(m.content) : new HumanMessage(m.content))
          const response = await model.invoke(lc)
          return typeof response.content === 'string' ? response.content : JSON.stringify(response.content)
        },
        stream: async (messages, onChunk, onThinking) => {
          const { HumanMessage, SystemMessage } = await import('@langchain/core/messages')
          const lc = messages.map(m => m.role === 'system' ? new SystemMessage(m.content) : new HumanMessage(m.content))
          let full = ''
          const stream = await model.stream(lc)
          for await (const chunk of stream) {
            // Claude extended thinking: content is array with type='thinking'
            if (Array.isArray(chunk.content)) {
              for (const block of chunk.content as Array<{ type: string; thinking?: string; text?: string }>) {
                if (block.type === 'thinking' && block.thinking) onThinking?.(block.thinking)
                else if (block.type === 'text' && block.text) { full += block.text; onChunk(block.text) }
              }
            } else {
              const text = typeof chunk.content === 'string' ? chunk.content : ''
              if (text) { full += text; onChunk(text) }
            }
          }
          return full
        }
      }
    } catch {
      return this.createFallbackHTTPClient(
        'https://api.anthropic.com/v1/messages',
        apiKey, config.model || 'claude-3-haiku-20240307', config.temperature ?? 0.2
      )
    }
  }

  private async createDeepSeekClient(apiKey: string, config: AIConfig): Promise<LLMClient> {
    return this.createFallbackHTTPClient(
      'https://api.deepseek.com/v1/chat/completions',
      apiKey, config.model || 'deepseek-chat', config.temperature ?? 0.2
    )
  }

  private async createOllamaClient(config: AIConfig): Promise<LLMClient> {
    try {
      const { ChatOllama } = await import('@langchain/ollama')
      const model = new ChatOllama({
        baseUrl: config.baseUrl || 'http://localhost:11434',
        model: config.model || 'llama3',
        temperature: config.temperature ?? 0.2
      })
      return {
        invoke: async (messages) => {
          const { HumanMessage, SystemMessage } = await import('@langchain/core/messages')
          const lc = messages.map(m => m.role === 'system' ? new SystemMessage(m.content) : new HumanMessage(m.content))
          const response = await model.invoke(lc)
          return typeof response.content === 'string' ? response.content : JSON.stringify(response.content)
        },
        stream: async (messages, onChunk, _onThinking) => {
          const { HumanMessage, SystemMessage } = await import('@langchain/core/messages')
          const lc = messages.map(m => m.role === 'system' ? new SystemMessage(m.content) : new HumanMessage(m.content))
          let full = ''
          const stream = await model.stream(lc)
          for await (const chunk of stream) {
            const text = typeof chunk.content === 'string' ? chunk.content : ''
            if (text) { full += text; onChunk(text) }
          }
          return full
        }
      }
    } catch {
      return this.createFallbackHTTPClient(
        `${config.baseUrl || 'http://localhost:11434'}/api/chat`,
        '', config.model || 'llama3', config.temperature ?? 0.2
      )
    }
  }

  /**
   * HTTP fallback client — supports both regular and SSE streaming.
   */
  private createFallbackHTTPClient(
    endpoint: string,
    apiKey: string,
    model: string,
    temperature: number
  ): LLMClient {
    const buildHeaders = (): Record<string, string> => {
      const h: Record<string, string> = { 'Content-Type': 'application/json' }
      if (apiKey) h['Authorization'] = `Bearer ${apiKey}`
      return h
    }

    return {
      invoke: async (messages: LLMMessage[], jsonMode = false): Promise<string> => {
        const body: Record<string, unknown> = { model, temperature, messages }
        if (jsonMode) body.response_format = { type: 'json_object' }
        const response = await fetch(endpoint, {
          method: 'POST', headers: buildHeaders(), body: JSON.stringify(body)
        })
        if (!response.ok) throw new Error(`LLM API 错误 ${response.status}: ${await response.text()}`)
        const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
        return data.choices?.[0]?.message?.content ?? ''
      },

      stream: async (messages: LLMMessage[], onChunk: (chunk: string) => void, onThinking?: (chunk: string) => void): Promise<string> => {
        const body: Record<string, unknown> = { model, temperature, messages, stream: true }
        const response = await fetch(endpoint, {
          method: 'POST', headers: buildHeaders(), body: JSON.stringify(body)
        })
        if (!response.ok) throw new Error(`LLM API 错误 ${response.status}: ${await response.text()}`)
        if (!response.body) throw new Error('流式响应不可用')

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let full = ''
        let buffer = ''
        // Track inline <think>...</think> tag state
        let inThinkTag = false
        let thinkBuffer = ''

        const flushThink = () => {
          if (thinkBuffer) { onThinking?.(thinkBuffer); thinkBuffer = '' }
        }

        const processText = (text: string) => {
          let i = 0
          while (i < text.length) {
            if (!inThinkTag) {
              const openIdx = text.indexOf('<think>', i)
              if (openIdx === -1) {
                // No more think tags — rest is content
                const rest = text.slice(i)
                if (rest) { full += rest; onChunk(rest) }
                break
              }
              // Content before <think>
              const before = text.slice(i, openIdx)
              if (before) { full += before; onChunk(before) }
              inThinkTag = true
              i = openIdx + 7 // skip '<think>'
            } else {
              const closeIdx = text.indexOf('</think>', i)
              if (closeIdx === -1) {
                // Still inside think block
                thinkBuffer += text.slice(i)
                onThinking?.(text.slice(i))
                break
              }
              // End of think block
              const thinking = text.slice(i, closeIdx)
              if (thinking) { thinkBuffer += thinking; onThinking?.(thinking) }
              flushThink()
              inThinkTag = false
              i = closeIdx + 8 // skip '</think>'
            }
          }
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || trimmed === 'data: [DONE]') continue
            const data = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed
            try {
              const parsed = JSON.parse(data) as {
                choices?: Array<{
                  delta?: {
                    content?: string
                    reasoning_content?: string  // DeepSeek R1
                  }
                }>
              }
              const delta = parsed.choices?.[0]?.delta
              // reasoning_content (DeepSeek R1, o1-style)
              const thinking = delta?.reasoning_content ?? ''
              if (thinking) onThinking?.(thinking)
              // regular content — also parse inline <think> tags
              const text = delta?.content ?? ''
              if (text) processText(text)
            } catch { /* skip malformed lines */ }
          }
        }
        return full
      }
    }
  }

  // ============================================================
  // Text-to-SQL
  // ============================================================

  async textToSQL(request: TextToSQLRequest & { streamId?: string }): Promise<TextToSQLResponse> {
    const startTime = Date.now()
    const config = this.getConfig()
    const schemaDesc = buildSchemaDescription(request.schema)

    const dbLabel = request.databaseType === 'postgresql' ? 'PostgreSQL' : 'MySQL'
    const systemPrompt = `你是一个专业的 ${dbLabel} SQL 生成助手。根据用户的自然语言描述和提供的数据库 Schema，生成准确的 SQL 查询语句。

数据库 Schema:
${schemaDesc}

规则：
1. 只生成 ${dbLabel} 兼容的 SQL 语句
2. 返回 JSON 格式，包含 sql、explanation、isDangerous 三个字段
3. sql 字段为生成的 SQL 语句
4. explanation 字段为对 SQL 的中文自然语言解释
5. isDangerous 字段为布尔值，表示该 SQL 是否包含危险操作（DROP、TRUNCATE、无 WHERE 的 DELETE 等）${request.databaseType === 'postgresql' ? '\n6. PostgreSQL 不使用反引号，使用双引号或不用引号包裹标识符' : ''}
${config.mode === 'readonly' ? `${request.databaseType === 'postgresql' ? '\n7' : '\n7'}. 只生成 SELECT 查询语句，不生成任何写操作或 DDL 语句` : ''}

Few-shot 示例：
${request.databaseType === 'postgresql' ? FEW_SHOT_EXAMPLES.split('DATE_SUB(NOW(), INTERVAL 7 DAY)').join("NOW() - INTERVAL '7 days'") : FEW_SHOT_EXAMPLES}`

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: request.naturalLanguage }
    ]

    const rawResponse = request.streamId
      ? await this.streamCall(request.streamId, messages)
      : await (await this.getLLMClient()).invoke(messages, true)
    const latency = Date.now() - startTime

    let parsed: { sql?: string; explanation?: string; isDangerous?: boolean }
    try {
      const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/)
      const jsonStr = jsonMatch ? jsonMatch[1] : rawResponse
      parsed = JSON.parse(jsonStr.trim())
    } catch {
      parsed = { sql: rawResponse.trim(), explanation: '无法解析 AI 响应格式', isDangerous: false }
    }

    let sql = parsed.sql?.trim() ?? ''
    const explanation = parsed.explanation?.trim() ?? ''
    const isDangerous = parsed.isDangerous ?? false

    if (config.mode === 'readonly') {
      const filtered = filterReadonlySQL(sql)
      sql = filtered === null ? '-- 只读模式：已拒绝生成写操作 SQL' : filtered
    }

    return { sql, explanation, isDangerous, provider: config.provider, model: config.model, latency }
  }

  // ============================================================
  // Explain SQL statement
  // ============================================================

  async explainSQL(sql: string, streamId?: string): Promise<string> {
    const prompt = `请用简洁的中文解释以下 SQL 语句的含义和作用：

\`\`\`sql
${sql}
\`\`\`

请从以下几个角度解释：
1. 这条 SQL 的整体目的是什么
2. 涉及哪些表和字段
3. 有哪些过滤、排序、分组条件
4. 可能的性能注意事项（如有）`

    const messages: LLMMessage[] = [
      { role: 'system', content: '你是一个资深数据库专家，擅长用通俗易懂的中文解释 SQL 语句。' },
      { role: 'user', content: prompt }
    ]

    return streamId
      ? this.streamCall(streamId, messages)
      : (await this.getLLMClient()).invoke(messages)
  }

  // ============================================================
  // Explain result
  // ============================================================

  async explainResult(result: QueryResult, question?: string, streamId?: string): Promise<string> {
    const rowSample = result.rows.slice(0, 20)
    const colNames = result.columns.map(c => c.name).join(', ')
    const rowsText = rowSample
      .map(row => result.columns.map(c => String(row[c.name] ?? '')).join(' | '))
      .join('\n')

    const prompt = `以下是一个 SQL 查询的结果集（共 ${result.rows.length} 行）：

SQL: ${result.sql}
列名: ${colNames}
数据样本（前 ${rowSample.length} 行）:
${rowsText}

${question ? `用户问题: ${question}\n` : ''}请用简洁的中文对这个查询结果进行自然语言总结和洞察分析，包括：
1. 数据概况（行数、关键指标）
2. 主要发现或规律
3. 如有异常值或值得关注的数据，请指出`

    const messages: LLMMessage[] = [
      { role: 'system', content: '你是一个数据分析助手，擅长对 SQL 查询结果进行自然语言总结和洞察分析。' },
      { role: 'user', content: prompt }
    ]

    return streamId
      ? this.streamCall(streamId, messages)
      : (await this.getLLMClient()).invoke(messages)
  }

  // ============================================================
  // Optimize Query
  // ============================================================

  async optimizeQuery(request: OptimizeQueryRequest & { streamId?: string }): Promise<OptimizeQueryResponse> {
    const startTime = Date.now()
    const schemaDesc = request.schema ? buildSchemaDescription(request.schema) : ''

    const prompt = `请分析以下 SQL 查询并提供优化建议：

\`\`\`sql
${request.sql}
\`\`\`

${schemaDesc ? `数据库 Schema:\n${schemaDesc}\n` : ''}
请返回 JSON 格式，包含以下字段：
- optimizedSql: 优化后的 SQL（如无需修改则返回原 SQL）
- suggestions: 优化建议数组（字符串列表）
- explanation: 优化说明（中文）

重点关注：索引使用、JOIN 优化、子查询改写、避免全表扫描、减少数据传输量等。`

    const messages: LLMMessage[] = [
      { role: 'system', content: '你是一个资深 MySQL 数据库性能优化专家，擅长 SQL 查询优化和索引设计。' },
      { role: 'user', content: prompt }
    ]

    const raw = request.streamId
      ? await this.streamCall(request.streamId, messages)
      : await (await this.getLLMClient()).invoke(messages, true)
    const latency = Date.now() - startTime

    let parsed: { optimizedSql?: string; suggestions?: string[]; explanation?: string }
    try {
      const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
      parsed = JSON.parse(jsonMatch ? jsonMatch[1] : raw.trim())
    } catch {
      parsed = { optimizedSql: request.sql, suggestions: [raw], explanation: raw }
    }

    return {
      optimizedSql: parsed.optimizedSql?.trim() ?? request.sql,
      suggestions: parsed.suggestions ?? [],
      explanation: parsed.explanation ?? '',
      latency
    }
  }

  // ============================================================
  // Diagnose Error
  // ============================================================

  async diagnoseError(request: DiagnoseErrorRequest & { streamId?: string }): Promise<DiagnoseErrorResponse> {
    const startTime = Date.now()
    const schemaDesc = request.schema ? buildSchemaDescription(request.schema) : ''

    const prompt = `以下 SQL 执行时报错，请诊断原因并给出修复方案：

SQL:
\`\`\`sql
${request.sql}
\`\`\`

错误信息: ${request.errorMessage}

${schemaDesc ? `数据库 Schema:\n${schemaDesc}\n` : ''}
请返回 JSON 格式，包含以下字段：
- diagnosis: 错误原因分析（中文）
- fixedSql: 修复后的 SQL（如果可以修复）
- suggestions: 修复建议数组（字符串列表）`

    const messages: LLMMessage[] = [
      { role: 'system', content: '你是一个 MySQL 数据库专家，擅长诊断 SQL 错误并提供修复方案。' },
      { role: 'user', content: prompt }
    ]

    const raw = request.streamId
      ? await this.streamCall(request.streamId, messages)
      : await (await this.getLLMClient()).invoke(messages, true)
    const latency = Date.now() - startTime

    let parsed: { diagnosis?: string; fixedSql?: string; suggestions?: string[] }
    try {
      const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
      parsed = JSON.parse(jsonMatch ? jsonMatch[1] : raw.trim())
    } catch {
      parsed = { diagnosis: raw, suggestions: [] }
    }

    return {
      diagnosis: parsed.diagnosis ?? raw,
      fixedSql: parsed.fixedSql?.trim(),
      suggestions: parsed.suggestions ?? [],
      latency
    }
  }

  // ============================================================
  // Schema Documentation
  // ============================================================

  async generateSchemaDoc(request: SchemaDocRequest & { streamId?: string }): Promise<SchemaDocResponse> {
    const startTime = Date.now()
    const schemaDesc = buildSchemaDescription(request.schema)
    const scope = request.targetTable
      ? `表 ${request.targetDb}.${request.targetTable}`
      : request.targetDb ? `数据库 ${request.targetDb}` : '整个数据库 Schema'

    const prompt = `请为以下数据库 Schema 生成详细的中文技术文档，范围：${scope}

${schemaDesc}

文档应包含：
1. 整体架构说明
2. 每张表的用途和业务含义
3. 重要字段的说明
4. 表之间的关联关系
5. 使用注意事项

请用 Markdown 格式输出。`

    const messages: LLMMessage[] = [
      { role: 'system', content: '你是一个技术文档专家，擅长为数据库设计生成清晰易懂的技术文档。' },
      { role: 'user', content: prompt }
    ]

    const documentation = request.streamId
      ? await this.streamCall(request.streamId, messages)
      : await (await this.getLLMClient()).invoke(messages)
    const latency = Date.now() - startTime

    return { documentation, latency }
  }

  // ============================================================
  // Security Audit
  // ============================================================

  async securityAudit(request: SecurityAuditRequest & { streamId?: string }): Promise<SecurityAuditResponse> {
    const startTime = Date.now()

    const prompt = `请对以下 SQL 进行安全审计：

\`\`\`sql
${request.sql}
\`\`\`

请返回 JSON 格式，包含以下字段：
- issues: 安全问题数组，每项包含 severity（high/medium/low）、type（问题类型）、description（描述）、suggestion（建议）
- safe: 布尔值，是否安全
- summary: 总体安全评估（中文）

重点检查：SQL 注入风险、权限越界、敏感数据暴露、危险操作（无 WHERE 的 DELETE/UPDATE）、DDL 风险等。`

    const messages: LLMMessage[] = [
      { role: 'system', content: '你是一个数据库安全专家，擅长识别 SQL 安全漏洞和风险。' },
      { role: 'user', content: prompt }
    ]

    const raw = request.streamId
      ? await this.streamCall(request.streamId, messages)
      : await (await this.getLLMClient()).invoke(messages, true)
    const latency = Date.now() - startTime

    let parsed: { issues?: Array<{ severity: 'high' | 'medium' | 'low'; type: string; description: string; suggestion: string }>; safe?: boolean; summary?: string }
    try {
      const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
      parsed = JSON.parse(jsonMatch ? jsonMatch[1] : raw.trim())
    } catch {
      parsed = { issues: [], safe: true, summary: raw }
    }

    return {
      issues: parsed.issues ?? [],
      safe: parsed.safe ?? true,
      summary: parsed.summary ?? '',
      latency
    }
  }

  // ============================================================
  // Migration Script
  // ============================================================

  async generateMigration(request: MigrationRequest): Promise<MigrationResponse> {
    const startTime = Date.now()
    const client = await this.getLLMClient()

    const sourceDesc = buildSchemaDescription(request.sourceSchema)
    const targetDesc = buildSchemaDescription(request.targetSchema)

    const prompt = `请分析以下两个数据库 Schema 的差异，生成迁移脚本：

源 Schema:
${sourceDesc}

目标 Schema:
${targetDesc}

请返回 JSON 格式，包含以下字段：
- migrationSql: 完整的迁移 SQL 脚本（从源迁移到目标）
- changes: 变更列表（字符串数组，描述每个变更）
- warnings: 警告信息（字符串数组，如数据丢失风险等）`

    const messages: LLMMessage[] = [
      { role: 'system', content: '你是一个数据库迁移专家，擅长生成安全可靠的 MySQL 迁移脚本。' },
      { role: 'user', content: prompt }
    ]

    const raw = await client.invoke(messages, true)
    const latency = Date.now() - startTime

    let parsed: { migrationSql?: string; changes?: string[]; warnings?: string[] }
    try {
      const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
      parsed = JSON.parse(jsonMatch ? jsonMatch[1] : raw.trim())
    } catch {
      parsed = { migrationSql: raw, changes: [], warnings: [] }
    }

    return {
      migrationSql: parsed.migrationSql ?? '',
      changes: parsed.changes ?? [],
      warnings: parsed.warnings ?? [],
      latency
    }
  }

  // ============================================================
  // Data Quality Analysis
  // ============================================================

  async analyzeDataQuality(request: DataQualityRequest & { streamId?: string }): Promise<DataQualityResponse> {
    const startTime = Date.now()
    const { result } = request
    const rowSample = result.rows.slice(0, 50)
    const colNames = result.columns.map(c => c.name).join(', ')
    const rowsText = rowSample
      .map(row => result.columns.map(c => String(row[c.name] ?? 'NULL')).join(' | '))
      .join('\n')

    const prompt = `请对以下查询结果进行数据质量分析：

SQL: ${result.sql}
列名: ${colNames}
数据样本（共 ${result.rows.length} 行，展示前 ${rowSample.length} 行）:
${rowsText}

请返回 JSON 格式，包含以下字段：
- issues: 数据质量问题数组，每项包含 column（列名）、type（null/duplicate/outlier/format）、description（描述）、count（影响行数估计）
- summary: 数据质量总结（中文）

重点检查：空值率、重复值、异常值、格式不一致等问题。`

    const messages: LLMMessage[] = [
      { role: 'system', content: '你是一个数据质量分析专家，擅长识别数据集中的质量问题。' },
      { role: 'user', content: prompt }
    ]

    const raw = request.streamId
      ? await this.streamCall(request.streamId, messages)
      : await (await this.getLLMClient()).invoke(messages, true)
    const latency = Date.now() - startTime

    let parsed: { issues?: Array<{ column: string; type: 'null' | 'duplicate' | 'outlier' | 'format'; description: string; count: number }>; summary?: string }
    try {
      const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
      parsed = JSON.parse(jsonMatch ? jsonMatch[1] : raw.trim())
    } catch {
      parsed = { issues: [], summary: raw }
    }

    return {
      issues: parsed.issues ?? [],
      summary: parsed.summary ?? '',
      latency
    }
  }

  // ============================================================
  // Streaming helpers
  // ============================================================

  /**
   * Run an AI call with streaming, pushing chunks to the renderer via IPC.
   * Returns the full accumulated text.
   */
  async streamCall(
    streamId: string,
    messages: LLMMessage[]
  ): Promise<string> {
    const client = await this.getLLMClient()
    try {
      const full = await client.stream(
        messages,
        (chunk) => { this.notifyRenderer(IPC.AI_STREAM_CHUNK, { streamId, chunk }) },
        (chunk) => { this.notifyRenderer(IPC.AI_STREAM_THINKING, { streamId, chunk }) }
      )
      this.notifyRenderer(IPC.AI_STREAM_END, { streamId })
      return full
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.notifyRenderer(IPC.AI_STREAM_ERROR, { streamId, error: msg })
      throw err
    }
  }

  // ============================================================
  // Broadcast to renderer
  // ============================================================

  private notifyRenderer(channel: string, data: unknown): void {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) win.webContents.send(channel, data)
    }
  }

  broadcastError(error: string): void {
    this.notifyRenderer(IPC.AI_TEXT_TO_SQL, { error })
  }

  // ============================================================
  // Table Analysis — Dependencies
  // ============================================================

  async analyzeTableDependencies(
    schema: import('../../shared/types').DatabaseSchema,
    dbName: string,
    tableName: string,
    streamId?: string
  ): Promise<import('../../shared/types').TableAnalysisResponse> {
    const startTime = Date.now()
    const db = schema.databases.find(d => d.name === dbName)
    const table = db?.tables.find(t => t.name === tableName)
    if (!db || !table) throw new Error(`表 ${dbName}.${tableName} 不存在`)

    const allTables = db.tables.map(t => {
      const fks = t.foreignKeys.map(fk => `  FK: ${t.name}.${fk.columnName} → ${fk.referencedTable}.${fk.referencedColumn}`).join('\n')
      return `表: ${t.name}${fks ? '\n' + fks : ''}`
    }).join('\n')

    const targetFKs = table.foreignKeys
    const referencedBy = db.tables.filter(t => t.foreignKeys.some(fk => fk.referencedTable === tableName))

    const prompt = `请分析 MySQL 数据库 \`${dbName}\` 中表 \`${tableName}\` 的依赖关系。

## 目标表结构
表名: ${tableName}
字段: ${table.columns.map(c => `${c.name}(${c.type})`).join(', ')}
主键: ${table.primaryKeys.join(', ') || '无'}
外键(引用其他表): ${targetFKs.length ? targetFKs.map(fk => `${fk.columnName} → ${fk.referencedTable}.${fk.referencedColumn}`).join(', ') : '无'}
被引用(其他表的外键指向本表): ${referencedBy.length ? referencedBy.map(t => t.name).join(', ') : '无'}

## 数据库所有表的关系
${allTables}

请用 Markdown 格式输出以下内容：
1. **直接依赖**：本表引用了哪些表，说明业务含义
2. **被依赖**：哪些表依赖本表，删除/修改本表数据的影响
3. **间接依赖链**：通过多跳关联的重要表
4. **操作建议**：查询、删除、更新时需要注意的关联关系
5. **Mermaid 关系图**（用 \`\`\`mermaid 代码块）：展示直接关联的表`

    const messages: LLMMessage[] = [
      { role: 'system', content: '你是一个数据库架构专家，擅长分析表之间的依赖关系和业务含义。' },
      { role: 'user', content: prompt }
    ]

    const content = streamId
      ? await this.streamCall(streamId, messages)
      : await (await this.getLLMClient()).invoke(messages)

    return { content, latency: Date.now() - startTime }
  }

  // ============================================================
  // Table Analysis — Data Dictionary
  // ============================================================

  async generateTableDataDict(
    schema: import('../../shared/types').DatabaseSchema,
    dbName: string,
    tableName: string,
    streamId?: string
  ): Promise<import('../../shared/types').TableAnalysisResponse> {
    const startTime = Date.now()
    const db = schema.databases.find(d => d.name === dbName)
    const table = db?.tables.find(t => t.name === tableName)
    if (!db || !table) throw new Error(`表 ${dbName}.${tableName} 不存在`)

    const colsDesc = table.columns.map(c =>
      `- ${c.name}: 类型=${c.type}, 可空=${c.nullable ? '是' : '否'}${c.defaultValue ? ', 默认=' + c.defaultValue : ''}${c.comment ? ', 注释=' + c.comment : ''}`
    ).join('\n')

    const prompt = `请为 MySQL 表 \`${dbName}.${tableName}\` 生成详细的数据字典文档。

## 表结构
${colsDesc}
主键: ${table.primaryKeys.join(', ') || '无'}
外键: ${table.foreignKeys.map(fk => `${fk.columnName} → ${fk.referencedTable}.${fk.referencedColumn}`).join(', ') || '无'}
${table.rowCount !== undefined ? `估计行数: ${table.rowCount.toLocaleString()}` : ''}

请用 Markdown 格式输出：
1. **表概述**：推断该表的业务用途和存储的数据类型
2. **字段说明表格**（Markdown 表格）：字段名 | 数据类型 | 是否必填 | 业务含义 | 取值说明
3. **主键与索引说明**
4. **关联关系说明**
5. **使用注意事项**：常见查询模式、数据维护建议`

    const messages: LLMMessage[] = [
      { role: 'system', content: '你是一个技术文档专家，擅长为数据库表生成清晰易懂的数据字典。' },
      { role: 'user', content: prompt }
    ]

    const content = streamId
      ? await this.streamCall(streamId, messages)
      : await (await this.getLLMClient()).invoke(messages)

    return { content, latency: Date.now() - startTime }
  }

  // ============================================================
  // Table Analysis — Index Analysis
  // ============================================================

  async analyzeTableIndexes(
    schema: import('../../shared/types').DatabaseSchema,
    dbName: string,
    tableName: string,
    streamId?: string
  ): Promise<import('../../shared/types').TableAnalysisResponse> {
    const startTime = Date.now()
    const db = schema.databases.find(d => d.name === dbName)
    const table = db?.tables.find(t => t.name === tableName)
    if (!db || !table) throw new Error(`表 ${dbName}.${tableName} 不存在`)

    const colsDesc = table.columns.map(c => `${c.name}(${c.type}, ${c.nullable ? 'NULL' : 'NOT NULL'})`).join(', ')

    const prompt = `请对 MySQL 表 \`${dbName}.${tableName}\` 进行索引分析和优化建议。

## 表结构
字段: ${colsDesc}
主键: ${table.primaryKeys.join(', ') || '无'}
外键字段: ${table.foreignKeys.map(fk => fk.columnName).join(', ') || '无'}
${table.rowCount !== undefined ? `估计行数: ${table.rowCount.toLocaleString()}` : ''}

请用 Markdown 格式输出：
1. **现有索引分析**：主键索引、外键索引的覆盖情况
2. **缺失索引建议**：根据字段类型和外键关系，推荐应该添加的索引
3. **复合索引建议**：哪些字段组合适合建立复合索引，给出具体 SQL
4. **索引优化 SQL**：直接可执行的 CREATE INDEX 语句
5. **注意事项**：索引对写入性能的影响、维护建议`

    const messages: LLMMessage[] = [
      { role: 'system', content: '你是一个 MySQL 性能优化专家，擅长索引设计和查询优化。' },
      { role: 'user', content: prompt }
    ]

    const content = streamId
      ? await this.streamCall(streamId, messages)
      : await (await this.getLLMClient()).invoke(messages)

    return { content, latency: Date.now() - startTime }
  }

  // ============================================================
  // Table Analysis — Query Performance
  // ============================================================

  async analyzeTableQueryPerf(
    dbName: string,
    tableName: string,
    history: Array<{ sql: string; duration: number; executedAt: number; success: boolean }>,
    streamId?: string
  ): Promise<import('../../shared/types').TableAnalysisResponse> {
    const startTime = Date.now()

    const relevant = history
      .filter(h => h.sql.toLowerCase().includes(tableName.toLowerCase()))
      .slice(0, 50)

    const historyDesc = relevant.length
      ? relevant.map((h, i) =>
          `${i + 1}. [${h.success ? '成功' : '失败'}] 耗时${h.duration}ms\n   ${h.sql.slice(0, 200)}`
        ).join('\n')
      : '暂无该表的历史查询记录'

    const slowQueries = relevant.filter(h => h.duration > 1000)

    const prompt = `请分析 MySQL 表 \`${dbName}.${tableName}\` 的查询性能情况。

## 历史查询记录（共 ${relevant.length} 条，慢查询 ${slowQueries.length} 条）
${historyDesc}

请用 Markdown 格式输出：
1. **查询模式分析**：归纳常见的查询类型（SELECT/INSERT/UPDATE/DELETE 比例）
2. **慢查询分析**：列出耗时超过 1 秒的查询，分析原因
3. **性能问题诊断**：识别 N+1 查询、全表扫描、缺少 WHERE 条件等问题
4. **优化建议**：针对每个慢查询给出具体的优化方案
5. **优化后的 SQL 示例**：给出改写后的高效 SQL`

    const messages: LLMMessage[] = [
      { role: 'system', content: '你是一个 MySQL 查询性能优化专家，擅长分析慢查询和提供优化方案。' },
      { role: 'user', content: prompt }
    ]

    const content = streamId
      ? await this.streamCall(streamId, messages)
      : await (await this.getLLMClient()).invoke(messages)

    return { content, latency: Date.now() - startTime }
  }
}

export const aiModule = AIModule.getInstance()
export default aiModule
