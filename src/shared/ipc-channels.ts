// Centralized IPC channel name definitions
// All IPC communication between main and renderer processes uses these constants

export const IPC = {
  // Connection management
  CONNECTION_LIST: 'connection:list',
  CONNECTION_CREATE: 'connection:create',
  CONNECTION_UPDATE: 'connection:update',
  CONNECTION_DELETE: 'connection:delete',
  CONNECTION_TEST: 'connection:test',
  CONNECTION_ACTIVATE: 'connection:activate',
  CONNECTION_DEACTIVATE: 'connection:deactivate',
  CONNECTION_STATUS: 'connection:status',
  CONNECTION_STATUS_CHANGED: 'connection:status-changed', // main -> renderer push
  CONNECTION_EXPORT: 'connection:export',
  CONNECTION_IMPORT: 'connection:import',
  CONNECTION_GROUP_LIST: 'connection:group-list',
  CONNECTION_GROUP_CREATE: 'connection:group-create',
  CONNECTION_GROUP_UPDATE: 'connection:group-update',
  CONNECTION_GROUP_DELETE: 'connection:group-delete',

  // Query
  QUERY_EXECUTE: 'query:execute',
  QUERY_CANCEL: 'query:cancel',
  QUERY_DANGEROUS_CHECK: 'query:dangerous-check',

  // Export
  EXPORT_CSV: 'export:csv',
  EXPORT_JSON: 'export:json',
  EXPORT_EXCEL: 'export:excel',
  EXPORT_GET_FILE: 'export:get-file',

  // AI
  AI_TEXT_TO_SQL: 'ai:text-to-sql',
  AI_EXPLAIN_RESULT: 'ai:explain-result',
  AI_EXPLAIN_SQL: 'ai:explain-sql',
  AI_OPTIMIZE_QUERY: 'ai:optimize-query',
  AI_DIAGNOSE_ERROR: 'ai:diagnose-error',
  AI_SCHEMA_DOC: 'ai:schema-doc',
  AI_SECURITY_AUDIT: 'ai:security-audit',
  AI_MIGRATION: 'ai:migration',
  AI_DATA_QUALITY: 'ai:data-quality',
  AI_CONFIG_SAVE: 'ai:config-save',
  AI_CONFIG_GET: 'ai:config-get',
  // Table analysis
  AI_TABLE_DEPENDENCIES: 'ai:table-dependencies',
  AI_TABLE_DATA_DICT: 'ai:table-data-dict',
  AI_TABLE_INDEX_ANALYSIS: 'ai:table-index-analysis',
  AI_TABLE_QUERY_PERF: 'ai:table-query-perf',
  // AI streaming (main -> renderer push)
  AI_STREAM_CHUNK: 'ai:stream-chunk',
  AI_STREAM_END: 'ai:stream-end',
  AI_STREAM_ERROR: 'ai:stream-error',
  AI_STREAM_THINKING: 'ai:stream-thinking',

  // DB Session (unified connection + schema lifecycle)
  SESSION_ACTIVATE: 'session:activate',
  SESSION_DEACTIVATE: 'session:deactivate',
  SESSION_REFRESH_SCHEMA: 'session:refresh-schema',
  SESSION_GET: 'session:get',
  SESSION_GET_SCHEMA: 'session:get-schema',
  SESSION_ACTIVATED: 'session:activated',               // main -> renderer push
  SESSION_DEACTIVATED: 'session:deactivated',            // main -> renderer push
  SESSION_SCHEMA_REFRESHED: 'session:schema-refreshed', // main -> renderer push
  SESSION_ERROR: 'session:error',                        // main -> renderer push

  // Backup
  BACKUP_DETECT_TOOL: 'backup:detect-tool',
  BACKUP_VALIDATE_PATH: 'backup:validate-path',
  BACKUP_START: 'backup:start',
  BACKUP_RESTORE: 'backup:restore',
  BACKUP_PROGRESS: 'backup:progress', // main -> renderer push
  BACKUP_OPEN_FOLDER: 'backup:open-folder',

  // History
  HISTORY_LIST: 'history:list',
  HISTORY_SEARCH: 'history:search',
  HISTORY_CLEAR: 'history:clear',
  HISTORY_DELETE: 'history:delete',

  // Audit
  AUDIT_LIST: 'audit:list',
  AUDIT_EXPORT: 'audit:export',
  AUDIT_CLEAR_OLD: 'audit:clear-old',

  // Snippets
  SNIPPET_LIST: 'snippet:list',
  SNIPPET_CREATE: 'snippet:create',
  SNIPPET_UPDATE: 'snippet:update',
  SNIPPET_DELETE: 'snippet:delete',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // Session
  SESSION_EXTEND: 'session:extend',
  SESSION_LOCK: 'session:lock', // main -> renderer push
  SESSION_WARNING: 'session:warning', // main -> renderer push

  // Window controls (frameless title bar)
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_UNMAXIMIZE: 'window:unmaximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:is-maximized',
  WINDOW_MAXIMIZED_CHANGED: 'window:maximized-changed', // main -> renderer push

  // Auto-updater
  UPDATER_CHECK: 'updater:check',
  UPDATER_DOWNLOAD: 'updater:download',
  UPDATER_INSTALL: 'updater:install',
  UPDATER_STATUS: 'updater:status', // main -> renderer push
} as const

export type IPCChannel = (typeof IPC)[keyof typeof IPC]

// Export options types
export interface ExportOptions {
  connectionId: string
  sql: string
  fullExport?: boolean
}
