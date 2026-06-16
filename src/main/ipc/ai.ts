import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type {
  AIConfig,
  QueryResult,
  TextToSQLRequest,
  OptimizeQueryRequest,
  DiagnoseErrorRequest,
  SchemaDocRequest,
  SecurityAuditRequest,
  MigrationRequest,
  DataQualityRequest,
  TableAnalysisRequest,
  TableQueryPerfRequest
} from '../../shared/types'
import aiModule from '../services/AIModule'
import configStore from '../services/ConfigStore'
import historyStore from '../services/HistoryStore'
import dbSessionManager from '../services/DBSessionManager'

function wrapError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err)
  const error = new Error(message)
  ;(error as Error & { code: string; userMessage: string }).code = 'IPC_ERROR'
  ;(error as Error & { code: string; userMessage: string }).userMessage = message
  return error
}

export function register(): void {
  ipcMain.handle(IPC.AI_TEXT_TO_SQL, async (_event, request: TextToSQLRequest & { streamId?: string }) => {
    try {
      return await aiModule.textToSQL(request)
    } catch (err) { throw wrapError(err) }
  })

  ipcMain.handle(IPC.AI_EXPLAIN_RESULT, async (_event, result: QueryResult, question?: string, streamId?: string) => {
    try {
      return await aiModule.explainResult(result, question, streamId)
    } catch (err) { throw wrapError(err) }
  })

  ipcMain.handle(IPC.AI_EXPLAIN_SQL, async (_event, sql: string, streamId?: string) => {
    try {
      return await aiModule.explainSQL(sql, streamId)
    } catch (err) { throw wrapError(err) }
  })

  ipcMain.handle(IPC.AI_OPTIMIZE_QUERY, async (_event, request: OptimizeQueryRequest & { streamId?: string }) => {
    try {
      return await aiModule.optimizeQuery(request)
    } catch (err) { throw wrapError(err) }
  })

  ipcMain.handle(IPC.AI_DIAGNOSE_ERROR, async (_event, request: DiagnoseErrorRequest & { streamId?: string }) => {
    try {
      return await aiModule.diagnoseError(request)
    } catch (err) { throw wrapError(err) }
  })

  ipcMain.handle(IPC.AI_SCHEMA_DOC, async (_event, request: SchemaDocRequest & { streamId?: string }) => {
    try {
      return await aiModule.generateSchemaDoc(request)
    } catch (err) { throw wrapError(err) }
  })

  ipcMain.handle(IPC.AI_SECURITY_AUDIT, async (_event, request: SecurityAuditRequest & { streamId?: string }) => {
    try {
      return await aiModule.securityAudit(request)
    } catch (err) { throw wrapError(err) }
  })

  ipcMain.handle(IPC.AI_MIGRATION, async (_event, request: MigrationRequest) => {
    try {
      return await aiModule.generateMigration(request)
    } catch (err) { throw wrapError(err) }
  })

  ipcMain.handle(IPC.AI_DATA_QUALITY, async (_event, request: DataQualityRequest & { streamId?: string }) => {
    try {
      return await aiModule.analyzeDataQuality(request)
    } catch (err) { throw wrapError(err) }
  })

  ipcMain.handle(IPC.AI_CONFIG_SAVE, async (_event, config: AIConfig) => {
    try {
      await aiModule.switchProvider(config)
      return { success: true }
    } catch (err) { throw wrapError(err) }
  })

  ipcMain.handle(IPC.AI_CONFIG_GET, () => {
    try {
      const stored = configStore.getAIConfig()
      const apiKey = configStore.getDecryptedAPIKey()
      return { ...stored, apiKey }
    } catch (err) { throw wrapError(err) }
  })

  // ── Table Analysis ──────────────────────────────────────────

  ipcMain.handle(IPC.AI_TABLE_DEPENDENCIES, async (_event, req: TableAnalysisRequest) => {
    try {
      const schema = await dbSessionManager.refreshSchema(req.connectionId)
      return await aiModule.analyzeTableDependencies(schema, req.dbName, req.tableName, req.streamId)
    } catch (err) { throw wrapError(err) }
  })

  ipcMain.handle(IPC.AI_TABLE_DATA_DICT, async (_event, req: TableAnalysisRequest) => {
    try {
      const schema = await dbSessionManager.refreshSchema(req.connectionId)
      return await aiModule.generateTableDataDict(schema, req.dbName, req.tableName, req.streamId)
    } catch (err) { throw wrapError(err) }
  })

  ipcMain.handle(IPC.AI_TABLE_INDEX_ANALYSIS, async (_event, req: TableAnalysisRequest) => {
    try {
      const schema = await dbSessionManager.refreshSchema(req.connectionId)
      return await aiModule.analyzeTableIndexes(schema, req.dbName, req.tableName, req.streamId)
    } catch (err) { throw wrapError(err) }
  })

  ipcMain.handle(IPC.AI_TABLE_QUERY_PERF, async (_event, req: TableQueryPerfRequest) => {
    try {
      return await aiModule.analyzeTableQueryPerf(req.dbName, req.tableName, req.history, req.streamId)
    } catch (err) { throw wrapError(err) }
  })
}
