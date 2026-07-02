// ============================================================
// DatabaseDialect — abstraction over database drivers
// ============================================================
// Each supported database type (MySQL, PostgreSQL) implements
// this interface so the rest of the application interacts with
// databases through a common contract.

import type {
  DatabaseSchema,
  ColumnMeta,
  QueryResult,
  DatabaseDialectConfig,
  ConnectionConfig
} from '@dbforge/shared'

/** Parameters needed for a backup operation */
export interface BackupParams {
  host: string
  port: number
  username: string
  password: string
  database: string
  outputPath: string
  compress: boolean
  dumpPath: string // path to mysqldump / pg_dump
}

/** Parameters needed for a restore operation */
export interface RestoreParams {
  host: string
  port: number
  username: string
  password: string
  database: string
  inputPath: string
  restoreBinPath: string // path to mysql / psql
}

export interface DatabaseDialect {
  /** Unique identifier for this dialect (e.g. 'mysql', 'postgresql') */
  readonly id: string

  /** Static dialect configuration metadata */
  readonly config: DatabaseDialectConfig

  /**
   * Create a connection pool for the given connection config.
   * Return type is 'any' because pool types differ between drivers.
   */
  createPool(config: ConnectionConfig): unknown

  /**
   * Execute a SQL query against a connection pool.
   */
  executeQuery(
    pool: unknown,
    sql: string,
    timeout?: number,
    abortSignal?: AbortSignal
  ): Promise<QueryResult>

  /**
   * Fetch the full database schema for a connection.
   */
  fetchSchema(pool: unknown, connectionId: string): Promise<DatabaseSchema>

  /**
   * Check whether a SQL statement is safe (read-only).
   * Returns true if the statement is only reading data.
   */
  isReadOnlySQL(sql: string): boolean

  /**
   * Format a SQL string using the dialect's formatter.
   */
  formatSQL(sql: string): string

  /**
   * Get the default backup command arguments for this database type.
   * Returns null if not supported.
   */
  getDefaultDumpArgs(params: BackupParams): string[] | null

  /**
   * Get the default restore command arguments for this database type.
   * Returns null if not supported.
   */
  getDefaultRestoreArgs(params: RestoreParams): string[] | null

  /**
   * Map an error into user-friendly suggestions.
   */
  buildErrorSuggestions(errorCode: string): string[]

  /**
   * Get the default port for this database type.
   */
  getDefaultPort(): number
}

/**
 * Registry of available database dialects, keyed by dialect id.
 */
const dialectRegistry = new Map<string, DatabaseDialect>()

export function registerDialect(dialect: DatabaseDialect): void {
  dialectRegistry.set(dialect.id, dialect)
}

export function getDialect(id: string): DatabaseDialect | undefined {
  return dialectRegistry.get(id)
}

export function listDialects(): DatabaseDialect[] {
  return Array.from(dialectRegistry.values())
}
