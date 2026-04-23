import { contextBridge, ipcRenderer } from 'electron'
import type {
  ConnectionConfig,
  ConnectionGroup,
  QueryOptions,
  QueryResult,
  DangerousCheckResult,
  AIConfig,
  TextToSQLRequest,
  TextToSQLResponse,
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
  DataQualityResponse,
  BackupOptions,
  BackupProgress,
  QueryHistory,
  AuditEntry,
  SqlSnippet,
  AppConfig,
  TestResult,
  DatabaseSchema,
  UpdateStatusEvent
} from '../shared/types'
import { IPC } from '../shared/ipc-channels'

// Expose a safe, typed API to the renderer process via contextBridge
// contextIsolation: true, nodeIntegration: false, sandbox: true
const electronAPI = {
  // ── Connection Management ──────────────────────────────────
  connection: {
    list: () => ipcRenderer.invoke(IPC.CONNECTION_LIST),
    create: (config: ConnectionConfig) => ipcRenderer.invoke(IPC.CONNECTION_CREATE, config),
    update: (config: ConnectionConfig) => ipcRenderer.invoke(IPC.CONNECTION_UPDATE, config),
    delete: (id: string) => ipcRenderer.invoke(IPC.CONNECTION_DELETE, id),
    test: (config: ConnectionConfig): Promise<TestResult> =>
      ipcRenderer.invoke(IPC.CONNECTION_TEST, config),
    activate: (id: string) => ipcRenderer.invoke(IPC.CONNECTION_ACTIVATE, id),
    deactivate: (id: string) => ipcRenderer.invoke(IPC.CONNECTION_DEACTIVATE, id),
    getStatus: (id: string) => ipcRenderer.invoke(IPC.CONNECTION_STATUS, id),
    export: (ids: string[]) => ipcRenderer.invoke(IPC.CONNECTION_EXPORT, ids),
    import: (json: string) => ipcRenderer.invoke(IPC.CONNECTION_IMPORT, json),
    onStatusChanged: (callback: (status: unknown) => void) => {
      ipcRenderer.on(IPC.CONNECTION_STATUS_CHANGED, (_event, status) => callback(status))
      return () => ipcRenderer.removeAllListeners(IPC.CONNECTION_STATUS_CHANGED)
    },
    groups: {
      list: (): Promise<ConnectionGroup[]> => ipcRenderer.invoke(IPC.CONNECTION_GROUP_LIST),
      create: (group: Omit<ConnectionGroup, 'id'>) =>
        ipcRenderer.invoke(IPC.CONNECTION_GROUP_CREATE, group),
      update: (group: ConnectionGroup) => ipcRenderer.invoke(IPC.CONNECTION_GROUP_UPDATE, group),
      delete: (id: string) => ipcRenderer.invoke(IPC.CONNECTION_GROUP_DELETE, id)
    }
  },

  // ── Schema ─────────────────────────────────────────────────
  schema: {
    fetch: (connectionId: string): Promise<DatabaseSchema> =>
      ipcRenderer.invoke(IPC.SCHEMA_FETCH, connectionId),
    refresh: (connectionId: string): Promise<DatabaseSchema> =>
      ipcRenderer.invoke(IPC.SCHEMA_REFRESH, connectionId)
  },

  // ── Query ──────────────────────────────────────────────────
  query: {
    execute: (options: Omit<QueryOptions, 'abortSignal'> & { queryId?: string }): Promise<QueryResult> =>
      ipcRenderer.invoke(IPC.QUERY_EXECUTE, options),
    cancel: (queryId: string) => ipcRenderer.invoke(IPC.QUERY_CANCEL, queryId),
    dangerousCheck: (sql: string): Promise<DangerousCheckResult> =>
      ipcRenderer.invoke(IPC.QUERY_DANGEROUS_CHECK, sql)
  },

  // ── AI ─────────────────────────────────────────────────────
  ai: {
    textToSQL: (request: TextToSQLRequest & { streamId?: string }): Promise<TextToSQLResponse> =>
      ipcRenderer.invoke(IPC.AI_TEXT_TO_SQL, request),
    explainResult: (result: QueryResult, question?: string, streamId?: string): Promise<string> =>
      ipcRenderer.invoke(IPC.AI_EXPLAIN_RESULT, result, question, streamId),
    explainSQL: (sql: string, streamId?: string): Promise<string> =>
      ipcRenderer.invoke(IPC.AI_EXPLAIN_SQL, sql, streamId),
    optimizeQuery: (request: OptimizeQueryRequest & { streamId?: string }): Promise<OptimizeQueryResponse> =>
      ipcRenderer.invoke(IPC.AI_OPTIMIZE_QUERY, request),
    diagnoseError: (request: DiagnoseErrorRequest & { streamId?: string }): Promise<DiagnoseErrorResponse> =>
      ipcRenderer.invoke(IPC.AI_DIAGNOSE_ERROR, request),
    generateSchemaDoc: (request: SchemaDocRequest & { streamId?: string }): Promise<SchemaDocResponse> =>
      ipcRenderer.invoke(IPC.AI_SCHEMA_DOC, request),
    securityAudit: (request: SecurityAuditRequest & { streamId?: string }): Promise<SecurityAuditResponse> =>
      ipcRenderer.invoke(IPC.AI_SECURITY_AUDIT, request),
    generateMigration: (request: MigrationRequest): Promise<MigrationResponse> =>
      ipcRenderer.invoke(IPC.AI_MIGRATION, request),
    analyzeDataQuality: (request: DataQualityRequest & { streamId?: string }): Promise<DataQualityResponse> =>
      ipcRenderer.invoke(IPC.AI_DATA_QUALITY, request),
    saveConfig: (config: AIConfig) => ipcRenderer.invoke(IPC.AI_CONFIG_SAVE, config),
    getConfig: (): Promise<AIConfig> => ipcRenderer.invoke(IPC.AI_CONFIG_GET),
    // Table analysis
    analyzeTableDependencies: (req: { connectionId: string; dbName: string; tableName: string; streamId?: string }) =>
      ipcRenderer.invoke(IPC.AI_TABLE_DEPENDENCIES, req),
    generateTableDataDict: (req: { connectionId: string; dbName: string; tableName: string; streamId?: string }) =>
      ipcRenderer.invoke(IPC.AI_TABLE_DATA_DICT, req),
    analyzeTableIndexes: (req: { connectionId: string; dbName: string; tableName: string; streamId?: string }) =>
      ipcRenderer.invoke(IPC.AI_TABLE_INDEX_ANALYSIS, req),
    analyzeTableQueryPerf: (req: { connectionId: string; dbName: string; tableName: string; streamId?: string; history: Array<{ sql: string; duration: number; executedAt: number; success: boolean }> }) =>
      ipcRenderer.invoke(IPC.AI_TABLE_QUERY_PERF, req),
    onStreamChunk: (callback: (data: { streamId: string; chunk: string }) => void) => {
      ipcRenderer.on(IPC.AI_STREAM_CHUNK, (_event, data) => callback(data))
      return () => ipcRenderer.removeAllListeners(IPC.AI_STREAM_CHUNK)
    },
    onStreamEnd: (callback: (data: { streamId: string }) => void) => {
      ipcRenderer.on(IPC.AI_STREAM_END, (_event, data) => callback(data))
      return () => ipcRenderer.removeAllListeners(IPC.AI_STREAM_END)
    },
    onStreamError: (callback: (data: { streamId: string; error: string }) => void) => {
      ipcRenderer.on(IPC.AI_STREAM_ERROR, (_event, data) => callback(data))
      return () => ipcRenderer.removeAllListeners(IPC.AI_STREAM_ERROR)
    },
    onStreamThinking: (callback: (data: { streamId: string; chunk: string }) => void) => {
      ipcRenderer.on(IPC.AI_STREAM_THINKING, (_event, data) => callback(data))
      return () => ipcRenderer.removeAllListeners(IPC.AI_STREAM_THINKING)
    }
  },

  // ── Backup ─────────────────────────────────────────────────
  backup: {
    detectTool: (): Promise<string | null> => ipcRenderer.invoke(IPC.BACKUP_DETECT_TOOL),
    validatePath: (path: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.BACKUP_VALIDATE_PATH, path),
    start: (options: BackupOptions) => ipcRenderer.invoke(IPC.BACKUP_START, options),
    restore: (connectionId: string, filePath: string) =>
      ipcRenderer.invoke(IPC.BACKUP_RESTORE, connectionId, filePath),
    openFolder: (filePath: string) => ipcRenderer.invoke(IPC.BACKUP_OPEN_FOLDER, filePath),
    onProgress: (callback: (progress: BackupProgress) => void) => {
      ipcRenderer.on(IPC.BACKUP_PROGRESS, (_event, progress) => callback(progress))
      return () => ipcRenderer.removeAllListeners(IPC.BACKUP_PROGRESS)
    }
  },

  // ── History ────────────────────────────────────────────────
  history: {
    list: (limit?: number): Promise<QueryHistory[]> =>
      ipcRenderer.invoke(IPC.HISTORY_LIST, limit),
    search: (keyword: string, connectionId?: string): Promise<QueryHistory[]> =>
      ipcRenderer.invoke(IPC.HISTORY_SEARCH, keyword, connectionId),
    clear: () => ipcRenderer.invoke(IPC.HISTORY_CLEAR),
    delete: (id: number) => ipcRenderer.invoke(IPC.HISTORY_DELETE, id)
  },

  // ── Audit ──────────────────────────────────────────────────
  audit: {
    list: (options?: {
      startTime?: number
      endTime?: number
      connectionId?: string
    }): Promise<AuditEntry[]> => ipcRenderer.invoke(IPC.AUDIT_LIST, options),
    export: (options?: {
      startTime?: number
      endTime?: number
      connectionId?: string
    }): Promise<string> => ipcRenderer.invoke(IPC.AUDIT_EXPORT, options),
    clearOld: () => ipcRenderer.invoke(IPC.AUDIT_CLEAR_OLD)
  },

  // ── Snippets ───────────────────────────────────────────────
  snippets: {
    list: (): Promise<SqlSnippet[]> => ipcRenderer.invoke(IPC.SNIPPET_LIST),
    create: (snippet: Omit<SqlSnippet, 'id' | 'createdAt' | 'updatedAt'>) =>
      ipcRenderer.invoke(IPC.SNIPPET_CREATE, snippet),
    update: (snippet: SqlSnippet) => ipcRenderer.invoke(IPC.SNIPPET_UPDATE, snippet),
    delete: (id: number) => ipcRenderer.invoke(IPC.SNIPPET_DELETE, id)
  },

  // ── Settings ───────────────────────────────────────────────
  settings: {
    get: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.SETTINGS_GET),
    set: (config: Partial<AppConfig>) => ipcRenderer.invoke(IPC.SETTINGS_SET, config)
  },

  // ── Session ────────────────────────────────────────────────
  session: {
    extend: () => ipcRenderer.invoke(IPC.SESSION_EXTEND),
    onLock: (callback: () => void) => {
      ipcRenderer.on(IPC.SESSION_LOCK, () => callback())
      return () => ipcRenderer.removeAllListeners(IPC.SESSION_LOCK)
    },
    onWarning: (callback: (minutesRemaining: number) => void) => {
      ipcRenderer.on(IPC.SESSION_WARNING, (_event, minutes) => callback(minutes))
      return () => ipcRenderer.removeAllListeners(IPC.SESSION_WARNING)
    }
  },

  // ── Auto-updater ───────────────────────────────────────────
  updater: {
    check: () => ipcRenderer.invoke(IPC.UPDATER_CHECK),
    download: () => ipcRenderer.invoke(IPC.UPDATER_DOWNLOAD),
    install: () => ipcRenderer.invoke(IPC.UPDATER_INSTALL),
    onStatus: (callback: (event: UpdateStatusEvent) => void) => {
      ipcRenderer.on(IPC.UPDATER_STATUS, (_event, status) => callback(status))
      return () => ipcRenderer.removeAllListeners(IPC.UPDATER_STATUS)
    }
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
