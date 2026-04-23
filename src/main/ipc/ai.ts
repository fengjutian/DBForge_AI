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
  DataQualityRequest
} from '../../shared/types'
import aiModule from '../services/AIModule'
import configStore from '../services/ConfigStore'

function wrapError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err)
  const error = new Error(message)
  ;(error as Error & { code: string; userMessage: string }).code = 'IPC_ERROR'
  ;(error as Error & { code: string; userMessage: string }).userMessage = message
  return error
}

export function register(): void {
  ipcMain.handle(IPC.AI_TEXT_TO_SQL, async (_event, request: TextToSQLRequest) => {
    try {
      return await aiModule.textToSQL(request)
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.AI_EXPLAIN_RESULT, async (_event, result: QueryResult, question?: string) => {
    try {
      return await aiModule.explainResult(result, question)
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.AI_EXPLAIN_SQL, async (_event, sql: string) => {
    try {
      return await aiModule.explainSQL(sql)
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.AI_OPTIMIZE_QUERY, async (_event, request: OptimizeQueryRequest) => {
    try {
      return await aiModule.optimizeQuery(request)
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.AI_DIAGNOSE_ERROR, async (_event, request: DiagnoseErrorRequest) => {
    try {
      return await aiModule.diagnoseError(request)
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.AI_SCHEMA_DOC, async (_event, request: SchemaDocRequest) => {
    try {
      return await aiModule.generateSchemaDoc(request)
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.AI_SECURITY_AUDIT, async (_event, request: SecurityAuditRequest) => {
    try {
      return await aiModule.securityAudit(request)
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.AI_MIGRATION, async (_event, request: MigrationRequest) => {
    try {
      return await aiModule.generateMigration(request)
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.AI_DATA_QUALITY, async (_event, request: DataQualityRequest) => {
    try {
      return await aiModule.analyzeDataQuality(request)
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.AI_CONFIG_SAVE, async (_event, config: AIConfig) => {
    try {
      await aiModule.switchProvider(config)
      return { success: true }
    } catch (err) {
      throw wrapError(err)
    }
  })

  ipcMain.handle(IPC.AI_CONFIG_GET, () => {
    try {
      const stored = configStore.getAIConfig()
      const apiKey = configStore.getDecryptedAPIKey()
      return { ...stored, apiKey }
    } catch (err) {
      throw wrapError(err)
    }
  })
}
