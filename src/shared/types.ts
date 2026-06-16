// ============================================================
// Database Type
// ============================================================

export type DatabaseType = 'mysql' | 'postgresql' | 'sqlite' | 'mssql' | 'oracle'

export interface DatabaseDialectConfig {
  type: DatabaseType
  defaultPort: number
  defaultDatabase?: string
  supportsSSL: boolean
  supportsSchema: boolean // PostgreSQL has schemas, MySQL does not
  driverName: string
  requiresDatabaseForConnect: boolean // pg requires a database to connect
}

// ============================================================
// Connection Types
// ============================================================

export interface SSLConfig {
  enabled: boolean
  ca?: string
  cert?: string
  key?: string
  rejectUnauthorized?: boolean
}

export interface SSHTunnelConfig {
  enabled: boolean
  host: string
  port: number
  username: string
  authType: 'password' | 'privateKey'
  password?: string // stored encrypted
  privateKeyPath?: string
  localPort?: number // auto-assigned
}

export interface ConnectionConfig {
  id: string
  name: string
  groupId?: string
  databaseType: DatabaseType
  host: string
  port: number
  username: string
  password: string // stored encrypted
  database?: string
  ssl?: SSLConfig
  ssh?: SSHTunnelConfig
  createdAt: number
  updatedAt: number
}

export interface ConnectionGroup {
  id: string
  name: string
  order: number
}

export interface ConnectionStatus {
  id: string
  state: 'connected' | 'disconnected' | 'connecting' | 'error'
  error?: string
  latency?: number
}

export interface TestResult {
  success: boolean
  latency?: number
  error?: string
  errorCode?: string
  suggestions?: string[]
}

// ============================================================
// Schema Types
// ============================================================

export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  defaultValue?: string
  comment?: string
}

export interface ForeignKeyInfo {
  columnName: string
  referencedTable: string
  referencedColumn: string
}

export interface TableInfo {
  name: string
  columns: ColumnInfo[]
  primaryKeys: string[]
  foreignKeys: ForeignKeyInfo[]
  rowCount?: number
}

export interface DatabaseInfo {
  name: string
  tables: TableInfo[]
}

export interface DatabaseSchema {
  connectionId: string
  databases: DatabaseInfo[]
  fetchedAt: number
}

// ============================================================
// Query Types
// ============================================================

export interface QueryOptions {
  connectionId: string
  sql: string
  timeout?: number // default 30000ms
  abortSignal?: AbortSignal
}

export interface ColumnMeta {
  name: string
  type: string
  nullable: boolean
}

export interface QueryResult {
  columns: ColumnMeta[]
  rows: Record<string, unknown>[]
  affectedRows?: number
  executionTime: number // ms
  sql: string
}

export interface DangerousCheckResult {
  isDangerous: boolean
  reasons: string[]
}

// ============================================================
// AI Types
// ============================================================

export type AIProvider = 'openai' | 'groq' | 'claude' | 'deepseek' | 'ollama'

export interface AIConfig {
  provider: AIProvider
  apiKey?: string // encrypted storage
  model: string
  temperature: number // 0-1
  baseUrl?: string // Ollama local address
  mode: 'readonly' | 'full'
}

export interface TextToSQLRequest {
  naturalLanguage: string
  schema: DatabaseSchema
  connectionId: string
  databaseType?: DatabaseType
}

export interface TextToSQLResponse {
  sql: string
  explanation: string
  isDangerous: boolean
  provider: string
  model: string
  latency: number
}

export interface OptimizeQueryRequest {
  sql: string
  schema?: DatabaseSchema
  databaseType?: DatabaseType
}

export interface OptimizeQueryResponse {
  optimizedSql: string
  suggestions: string[]
  explanation: string
  latency: number
}

export interface DiagnoseErrorRequest {
  sql: string
  errorMessage: string
  schema?: DatabaseSchema
  databaseType?: DatabaseType
}

export interface DiagnoseErrorResponse {
  diagnosis: string
  fixedSql?: string
  suggestions: string[]
  latency: number
}

export interface SchemaDocRequest {
  schema: DatabaseSchema
  targetDb?: string
  targetTable?: string
  databaseType?: DatabaseType
}

export interface SchemaDocResponse {
  documentation: string
  latency: number
}

export interface SecurityAuditRequest {
  sql: string
  databaseType?: DatabaseType
}

export interface SecurityAuditResponse {
  issues: Array<{
    severity: 'high' | 'medium' | 'low'
    type: string
    description: string
    suggestion: string
  }>
  safe: boolean
  summary: string
  latency: number
}

export interface MigrationRequest {
  sourceSchema: DatabaseSchema
  targetSchema: DatabaseSchema
  databaseType?: DatabaseType
}

export interface MigrationResponse {
  migrationSql: string
  changes: string[]
  warnings: string[]
  latency: number
}

export interface DataQualityRequest {
  result: QueryResult
  databaseType?: DatabaseType
}

export interface DataQualityResponse {
  issues: Array<{
    column: string
    type: 'null' | 'duplicate' | 'outlier' | 'format'
    description: string
    count: number
  }>
  summary: string
  latency: number
}

// ============================================================
// Table Analysis Types
// ============================================================

export interface TableAnalysisRequest {
  connectionId: string
  dbName: string
  tableName: string
  streamId?: string
}

export interface TableQueryPerfRequest extends TableAnalysisRequest {
  history: Array<{ sql: string; duration: number; executedAt: number; success: boolean }>
}

export interface TableAnalysisResponse {
  content: string  // Markdown
  latency: number
}

// ============================================================
// Backup Types
// ============================================================

export interface BackupOptions {
  connectionId: string
  databases: string[]
  outputPath: string
  compress: boolean
  options: {
    singleTransaction: boolean
    routines: boolean
    triggers: boolean
  }
}

export type BackupPhase = 'preparing' | 'dumping' | 'compressing' | 'done' | 'error'

export interface BackupProgress {
  phase: BackupPhase
  percent: number
  message: string
  filePath?: string
  fileSize?: number
  duration?: number
}

// ============================================================
// History & Audit Types
// ============================================================

export interface QueryHistory {
  id: number
  connectionId: string
  connectionName: string
  sql: string
  executedAt: number
  duration: number // ms
  rowCount: number
  success: boolean
}

export interface AuditEntry {
  id: number
  connectionId: string
  connectionName: string
  sql: string
  executedAt: number
  result: 'success' | 'failure'
  affectedRows: number
  errorMessage?: string
}

// ============================================================
// Snippet Types
// ============================================================

export interface SqlSnippet {
  id: number
  title: string
  sql: string
  tags: string[]
  createdAt: number
  updatedAt: number
}

// ============================================================
// App Config Types
// ============================================================

export interface AppConfig {
  ai: {
    provider: AIProvider
    model: string
    temperature: number
    apiKeyEncrypted?: string
    baseUrl?: string
    mode: 'readonly' | 'full'
  }
  connections: Array<ConnectionConfig & { passwordEncrypted: string }>
  connectionGroups: ConnectionGroup[]
  theme: 'system' | 'light' | 'dark'
  language: 'zh' | 'en'
  shortcuts: Record<string, string>
  mysqldumpPath?: string
  autoBackup: boolean
  autoBackupInterval: number // minutes
  sessionTimeout: number // minutes, 0 = never
  historyLimit: number // default 1000
  auditRetentionDays: number // default 90
  crashReportEnabled: boolean
  onboardingCompleted: boolean
  version: string
}

// ============================================================
// IPC Error Type
// ============================================================

export interface IPCError {
  code: string
  message: string
  userMessage: string
  suggestions?: string[]
  details?: unknown
}

// ============================================================
// Session Types (timeout / lock)
// ============================================================

export interface SessionConfig {
  timeoutMinutes: number // 0 = never
}

export interface SessionWarning {
  minutesRemaining: number
}

// ============================================================
// Unified DB Session (Connection + Schema)
// ============================================================

/** A fully activated DB session — connection + schema + status in one context */
export interface SessionContext {
  connection: ConnectionConfig
  schema: DatabaseSchema
  status: ConnectionStatus
  activatedAt: number
}

export type SessionEventType = 'activated' | 'deactivated' | 'schema-refreshed' | 'error'

export interface SessionEventPayload {
  connectionId: string
  event: SessionEventType
  session?: SessionContext
  error?: string
}

// ============================================================
// Update Types
// ============================================================

export interface UpdateInfo {
  version: string
  releaseNotes?: string
  releaseDate?: string
}

export type UpdateStatus =
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateStatusEvent {
  status: UpdateStatus
  info?: UpdateInfo
  progress?: number
  error?: string
}

// Export result types
export interface ExportResult {
  success: boolean
  filePath?: string
  error?: string
}
