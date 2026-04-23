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
}

export interface TextToSQLResponse {
  sql: string
  explanation: string
  isDangerous: boolean
  provider: string
  model: string
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
// Session Types
// ============================================================

export interface SessionConfig {
  timeoutMinutes: number // 0 = never
}

export interface SessionWarning {
  minutesRemaining: number
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
