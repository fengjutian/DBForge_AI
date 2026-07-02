// ============================================================
// MCPServer — Model Context Protocol server (stdio transport)
// ============================================================
// Implements MCP 2024-11-05 specification over stdin/stdout.
// Supports two modes:
//   1. Standalone:  dbforge --mcp  (no GUI, pure stdio)
//   2. Embedded:     started/stopped from Settings UI
//
// Tools exposed to AI agents:
//   - list_connections   — list all saved database connections
//   - list_tables        — list tables in a connection
//   - describe_table     — get full schema for a table
//   - run_query          — execute SQL and return results

import type { ConnectionConfig } from '@dbforge/shared'
import connectionManager from './ConnectionManager'
import queryExecutor from './QueryExecutor'
import { getDialect } from './dialect/DialectInterface'

// ── MCP Protocol Types ──────────────────────────────────────

const PROTOCOL_VERSION = '2024-11-05'
const SERVER_NAME = 'dbforge-mcp'
const SERVER_VERSION = '1.2.2'

interface McpRequest {
  jsonrpc: '2.0'
  id?: number | string
  method: string
  params?: Record<string, unknown>
}

interface McpResponse {
  jsonrpc: '2.0'
  id: number | string
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

// ── Tool Definitions ────────────────────────────────────────

const TOOLS = [
  {
    name: 'list_connections',
    description: 'List all saved database connections (names, types, and IDs only — no passwords)',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'list_tables',
    description: 'List all tables in a database connection, optionally filtered by schema name',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: { type: 'string', description: 'The connection ID from list_connections' },
        schema: { type: 'string', description: 'Optional: filter by schema name (PostgreSQL)' }
      },
      required: ['connectionId']
    }
  },
  {
    name: 'describe_table',
    description: 'Get the full schema of a table: column names, types, nullability, defaults, primary keys, foreign keys, and indexes',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: { type: 'string', description: 'The connection ID from list_connections' },
        table: { type: 'string', description: 'The table name to describe' },
        schema: { type: 'string', description: 'Optional: schema name (PostgreSQL)' }
      },
      required: ['connectionId', 'table']
    }
  },
  {
    name: 'run_query',
    description: 'Execute a read-only SQL query and return results. Only SELECT/SHOW/DESCRIBE/EXPLAIN statements are allowed. Results are limited to 200 rows.',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: { type: 'string', description: 'The connection ID from list_connections' },
        sql: { type: 'string', description: 'The SQL query to execute (read-only only)' },
        maxRows: { type: 'number', description: 'Maximum rows to return (default 200, max 1000)' }
      },
      required: ['connectionId', 'sql']
    }
  }
]

// ── MCPServer ────────────────────────────────────────────────

class MCPServer {
  private running = false
  private initialized = false
  private buffer = ''

  /** Start MCP server on stdio (standalone mode) */
  startStdio(): void {
    if (this.running) return
    this.running = true

    process.stdin.setEncoding('utf-8')
    process.stdin.on('data', (data: string) => {
      this.buffer += data
      this.processBuffer()
    })

    process.stdin.on('end', () => {
      this.running = false
    })

    // Send log messages to stderr so they don't interfere with MCP protocol
    console.error(`[MCPServer] Started (stdio mode)`)
  }

  /** Process accumulated stdin buffer for complete JSON-RPC messages */
  private processBuffer(): void {
    // MCP messages are newline-delimited JSON
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const msg: McpRequest = JSON.parse(line)
        this.handleRequest(msg)
      } catch (err) {
        console.error(`[MCPServer] Invalid JSON:`, line.slice(0, 200))
      }
    }
  }

  /** Handle an incoming MCP request */
  private async handleRequest(msg: McpRequest): Promise<void> {
    // Skip notifications (no id)
    if (msg.id === undefined) {
      if (msg.method === 'notifications/initialized') {
        this.initialized = true
      }
      return
    }

    try {
      const result = await this.dispatch(msg.method, msg.params ?? {})
      this.send({ jsonrpc: '2.0', id: msg.id, result })
    } catch (err) {
      this.send({
        jsonrpc: '2.0',
        id: msg.id,
        error: {
          code: -32000,
          message: err instanceof Error ? err.message : String(err)
        }
      })
    }
  }

  /** Dispatch to the correct handler */
  private async dispatch(method: string, params: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case 'initialize':
        return {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
        }

      case 'tools/list':
        return { tools: TOOLS }

      case 'tools/call':
        return this.callTool(
          params.name as string,
          (params.arguments ?? {}) as Record<string, unknown>
        )

      default:
        throw new Error(`Unknown method: ${method}`)
    }
  }

  /** Execute a tool call */
  private async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'list_connections':
        return this.toolListConnections()

      case 'list_tables':
        return this.toolListTables(args.connectionId as string, args.schema as string | undefined)

      case 'describe_table':
        return this.toolDescribeTable(
          args.connectionId as string,
          args.table as string,
          args.schema as string | undefined
        )

      case 'run_query':
        return this.toolRunQuery(
          args.connectionId as string,
          args.sql as string,
          (args.maxRows as number) ?? 200
        )

      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  }

  // ── Tool Implementations ──────────────────────────────────

  private toolListConnections() {
    const connections = connectionManager.listConnections()
    const safe = connections.map(c => ({
      id: c.id,
      name: c.name,
      databaseType: c.databaseType,
      host: c.host,
      port: c.port,
      database: c.database
    }))
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(safe, null, 2)
      }]
    }
  }

  private async toolListTables(connectionId: string, schema?: string) {
    this.ensureActive(connectionId)
    const conn = connectionManager.getPool(connectionId)
    const dbSchema = await conn.dialect.fetchSchema(conn.pool, connectionId)

    const allTables = dbSchema.databases.flatMap(db => {
      if (schema && db.name !== schema) return []
      return db.tables.map(t => ({
        database: db.name,
        name: t.name,
        columns: t.columns.length,
        rowCount: t.rowCount ?? 0
      }))
    })

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(allTables, null, 2)
      }]
    }
  }

  private async toolDescribeTable(connectionId: string, table: string, schema?: string) {
    this.ensureActive(connectionId)
    const conn = connectionManager.getPool(connectionId)
    const dbSchema = await conn.dialect.fetchSchema(conn.pool, connectionId)

    // Find table across all databases
    let tbl = undefined
    let dbName = ''
    for (const db of dbSchema.databases) {
      if (schema && db.name !== schema) continue
      const found = db.tables.find(t => t.name === table)
      if (found) { tbl = found; dbName = db.name; break }
    }

    if (!tbl) {
      throw new Error(`Table not found: ${table}${schema ? ` in schema ${schema}` : ''}`)
    }

    const indexes = dbSchema.databases
      .find(d => d.name === dbName)?.indexes
      ?.filter(i => i.tableName === table) ?? []

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          database: dbName,
          name: tbl.name,
          columns: tbl.columns.map(c => ({
            name: c.name,
            type: c.type,
            nullable: c.nullable,
            defaultValue: c.defaultValue,
            comment: c.comment
          })),
          primaryKeys: tbl.primaryKeys,
          foreignKeys: tbl.foreignKeys,
          indexes: indexes.map(i => ({
            name: i.name,
            columns: i.columns,
            unique: i.unique,
            type: i.type
          })),
          rowCount: tbl.rowCount
        }, null, 2)
      }]
    }
  }

  private async toolRunQuery(connectionId: string, sql: string, maxRows: number) {
    this.ensureActive(connectionId)
    const conn = connectionManager.getPool(connectionId)

    // Enforce read-only in MCP mode
    if (!conn.dialect.isReadOnlySQL(sql)) {
      throw new Error('MCP mode only allows read-only queries (SELECT/SHOW/DESCRIBE/EXPLAIN)')
    }

    const clamped = Math.min(maxRows, 1000)
    const result = await queryExecutor.execute({
      connectionId,
      sql,
      timeout: 30000
    })

    const rows = (result.rows as Record<string, unknown>[]).slice(0, clamped)
    const text = JSON.stringify({
      columns: result.columns.map(c => c.name),
      rowCount: rows.length,
      totalRows: result.rows.length,
      truncated: result.rows.length > clamped,
      rows
    }, null, 2)

    return {
      content: [{
        type: 'text',
        text
      }]
    }
  }

  // ── Helpers ────────────────────────────────────────────────

  private ensureActive(connectionId: string): void {
    // getPool throws if connection is not activated
    connectionManager.getPool(connectionId)
  }

  /** Send a JSON-RPC response to stdout */
  private send(msg: McpResponse): void {
    process.stdout.write(JSON.stringify(msg) + '\n')
  }

  /** Check if server is running */
  isRunning(): boolean {
    return this.running
  }

  /** Stop the server */
  stop(): void {
    this.running = false
  }
}

export const mcpServer = new MCPServer()
