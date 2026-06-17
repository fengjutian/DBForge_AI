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
  /** 数据+索引占用字节数，用于存储占用显示 */
  dataSize?: number
}

export interface ViewInfo {
  name: string
  definition?: string // the SELECT statement
}

export interface IndexInfo {
  name: string
  tableName: string
  columns: string[]
  unique: boolean
  type?: string // BTREE, HASH, etc.
}

export interface ProcedureInfo {
  name: string
  definition?: string
  parameters?: string // simplified param signature
}

export interface TriggerInfo {
  name: string
  tableName?: string
  timing: string // BEFORE, AFTER, INSTEAD OF
  event: string // INSERT, UPDATE, DELETE
  definition?: string
}

export interface EventInfo {
  name: string
  schedule?: string
  definition?: string
  status?: string
}

export interface DatabaseInfo {
  name: string
  tables: TableInfo[]
  views?: ViewInfo[]
  indexes?: IndexInfo[]
  procedures?: ProcedureInfo[]
  triggers?: TriggerInfo[]
  events?: EventInfo[]
}

export interface DatabaseSchema {
  connectionId: string
  databases: DatabaseInfo[]
  fetchedAt: number
}

// ============================================================
// Query Types
// ============================================================

export interface FilterRule {
  op: '=' | '<>' | '>' | '<' | 'LIKE'
  value: string
}

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
  /** All SQL query execution records persisted in settings */
  queryHistory: QueryHistory[]
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

// ============================================================
// Formula Engine Types
// ============================================================

/** A cell address in A1 notation, e.g. "A1", "B5", "AA12" */
export interface CellAddress {
  col: number   // 0-based column index
  row: number   // 0-based row index
}

/** Represents a parsed cell reference token */
export interface CellRef {
  col: number
  row: number
}

/** Range reference, e.g. A2:A10 or A:B */
export interface RangeRef {
  startCol: number
  startRow: number
  endCol: number
  endRow: number
}

/** A single cell formula entry */
export interface CellFormula {
  /** The raw formula expression (with leading =), e.g. "=A2*B2" */
  expression: string
  /** Cached computed value */
  computedValue: unknown
  /** Cell keys this formula depends on, e.g. ["A2", "B2"] */
  dependencies: string[]
  /** Error message if evaluation failed */
  error?: string
}

/** Current selection state */
export interface CellSelection {
  /** The anchor cell (where selection started) */
  anchor: CellAddress | null
  /** The current focus cell */
  focus: CellAddress | null
}

/** A virtual computed column defined by a formula applied to every row */
export interface ComputedColumnDef {
  id: string
  name: string
  expression: string              // formula applied to each row, e.g. "=amount * 0.85"
  dependencies: string[]          // column names this formula depends on
}

/** Aggregate info for the selection bar */
export interface SelectionAggregate {
  count: number
  sum: number | null
  avg: number | null
}

/** Formula engine interface — isolates the parser/evaluator */
export interface FormulaEngine {
  /** Parse a formula string, return dependencies and a callable evaluator */
  parse(formula: string): { dependencies: string[]; evaluate: (cellGetter: (ref: string) => unknown) => unknown }
  /** Convert 0-based col index to letter(s), e.g. 0→A, 25→Z, 26→AA */
  colToLetter(col: number): string
  /** Convert letter(s) to 0-based col index, e.g. A→0, Z→25, AA→26 */
  letterToCol(letter: string): number
  /** Convert a CellAddress to a key string "A1", "B5", etc. */
  toKey(col: number, row: number): string
  /** Parse a key string to CellAddress */
  fromKey(key: string): CellAddress | null
  /** Parse a range string "A2:A10" or "A:B" to RangeRef */
  parseRange(range: string): RangeRef | null
  /** Check if a string looks like a formula (starts with =) */
  isFormula(text: string): boolean
}
