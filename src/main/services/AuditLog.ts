import path from 'path'
import { app } from 'electron'
import type { AuditEntry } from '../../shared/types'

// ============================================================
// AuditLog — singleton, backed by a separate better-sqlite3 DB
// ============================================================

export interface AuditFilter {
  connectionId?: string
  connectionName?: string
  /** Unix timestamp ms — inclusive lower bound */
  fromTime?: number
  /** Unix timestamp ms — inclusive upper bound */
  toTime?: number
  limit?: number
}

class AuditLog {
  private static instance: AuditLog | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any = null

  private constructor() {}

  static getInstance(): AuditLog {
    if (!AuditLog.instance) {
      AuditLog.instance = new AuditLog()
    }
    return AuditLog.instance
  }

  /**
   * Initialize the SQLite database. Must be called after app is ready.
   * Uses a separate file from HistoryStore.
   */
  init(): void {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3')
    const dbPath = path.join(app.getPath('userData'), 'audit_log.db')
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.createSchema()
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        connection_id   TEXT NOT NULL,
        connection_name TEXT NOT NULL,
        sql             TEXT NOT NULL,
        executed_at     INTEGER NOT NULL,
        result          TEXT NOT NULL CHECK(result IN ('success', 'failure')),
        affected_rows   INTEGER NOT NULL DEFAULT 0,
        error_message   TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_audit_connection   ON audit_log(connection_id);
      CREATE INDEX IF NOT EXISTS idx_audit_executed_at  ON audit_log(executed_at DESC);
    `)
  }

  // ============================================================
  // Write
  // ============================================================

  /**
   * Append an audit entry.
   */
  add(entry: Omit<AuditEntry, 'id'>): void {
    this.db
      .prepare(
        `INSERT INTO audit_log
           (connection_id, connection_name, sql, executed_at, result, affected_rows, error_message)
         VALUES
           (@connectionId, @connectionName, @sql, @executedAt, @result, @affectedRows, @errorMessage)`
      )
      .run({
        connectionId: entry.connectionId,
        connectionName: entry.connectionName,
        sql: entry.sql,
        executedAt: entry.executedAt,
        result: entry.result,
        affectedRows: entry.affectedRows,
        errorMessage: entry.errorMessage ?? null
      })
  }

  // ============================================================
  // Read / Filter
  // ============================================================

  /**
   * Return audit entries matching the given filter, newest first.
   */
  list(filter: AuditFilter = {}): AuditEntry[] {
    const conditions: string[] = []
    const params: unknown[] = []

    if (filter.connectionId) {
      conditions.push('connection_id = ?')
      params.push(filter.connectionId)
    }
    if (filter.connectionName) {
      conditions.push('connection_name LIKE ?')
      params.push(`%${filter.connectionName}%`)
    }
    if (filter.fromTime !== undefined) {
      conditions.push('executed_at >= ?')
      params.push(filter.fromTime)
    }
    if (filter.toTime !== undefined) {
      conditions.push('executed_at <= ?')
      params.push(filter.toTime)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = filter.limit ?? 500
    params.push(limit)

    const rows = this.db
      .prepare(`SELECT * FROM audit_log ${where} ORDER BY executed_at DESC LIMIT ?`)
      .all(...params)

    return rows.map(this.rowToEntry.bind(this))
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private rowToEntry(row: any): AuditEntry {
    return {
      id: row.id,
      connectionId: row.connection_id,
      connectionName: row.connection_name,
      sql: row.sql,
      executedAt: row.executed_at,
      result: row.result,
      affectedRows: row.affected_rows,
      errorMessage: row.error_message ?? undefined
    }
  }

  // ============================================================
  // Export
  // ============================================================

  /**
   * Export filtered audit entries as a CSV string.
   */
  exportCSV(filter: AuditFilter = {}): string {
    const entries = this.list(filter)
    const header = 'id,connection_id,connection_name,sql,executed_at,result,affected_rows,error_message'
    const escapeCSV = (v: unknown): string => {
      const s = v === null || v === undefined ? '' : String(v)
      // Wrap in quotes if contains comma, newline or quote
      if (s.includes(',') || s.includes('\n') || s.includes('"')) {
        return `"${s.replace(/"/g, '""')}"`
      }
      return s
    }
    const lines = entries.map((e) =>
      [
        e.id,
        e.connectionId,
        e.connectionName,
        e.sql,
        e.executedAt,
        e.result,
        e.affectedRows,
        e.errorMessage ?? ''
      ]
        .map(escapeCSV)
        .join(',')
    )
    return [header, ...lines].join('\n')
  }

  // ============================================================
  // Cleanup
  // ============================================================

  /**
   * Delete entries older than `retentionDays` days.
   */
  purgeOlderThan(retentionDays: number): void {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    this.db
      .prepare(`DELETE FROM audit_log WHERE executed_at < ?`)
      .run(cutoff)
  }

  /**
   * Return total count of stored entries.
   */
  count(): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS cnt FROM audit_log`)
      .get() as { cnt: number }
    return row.cnt
  }
}

export const auditLog = AuditLog.getInstance()
export default auditLog
