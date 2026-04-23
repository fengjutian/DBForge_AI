import path from 'path'
import { app } from 'electron'
import type { QueryHistory } from '../../shared/types'

// ============================================================
// HistoryStore — singleton, backed by better-sqlite3
// ============================================================

class HistoryStore {
  private static instance: HistoryStore | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any = null

  private constructor() {}

  static getInstance(): HistoryStore {
    if (!HistoryStore.instance) {
      HistoryStore.instance = new HistoryStore()
    }
    return HistoryStore.instance
  }

  /**
   * Initialize the SQLite database. Must be called after app is ready.
   */
  init(): void {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3')
    const dbPath = path.join(app.getPath('userData'), 'query_history.db')
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.createSchema()
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS query_history (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        connection_id   TEXT NOT NULL,
        connection_name TEXT NOT NULL,
        sql             TEXT NOT NULL,
        executed_at     INTEGER NOT NULL,
        duration        INTEGER NOT NULL,
        row_count       INTEGER NOT NULL DEFAULT 0,
        success         INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_history_connection   ON query_history(connection_id);
      CREATE INDEX IF NOT EXISTS idx_history_executed_at  ON query_history(executed_at DESC);
    `)
  }

  // ============================================================
  // Write
  // ============================================================

  /**
   * Append a history entry. After writing, enforce the configured limit.
   */
  add(entry: Omit<QueryHistory, 'id'>, limit: number = 1000): void {
    const stmt = this.db.prepare(`
      INSERT INTO query_history
        (connection_id, connection_name, sql, executed_at, duration, row_count, success)
      VALUES
        (@connectionId, @connectionName, @sql, @executedAt, @duration, @rowCount, @success)
    `)
    stmt.run({
      connectionId: entry.connectionId,
      connectionName: entry.connectionName,
      sql: entry.sql,
      executedAt: entry.executedAt,
      duration: entry.duration,
      rowCount: entry.rowCount,
      success: entry.success ? 1 : 0
    })
    this.enforceLimit(limit)
  }

  // ============================================================
  // Read / Search
  // ============================================================

  /**
   * Return the most recent `limit` entries, newest first.
   */
  list(limit: number = 100): QueryHistory[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM query_history ORDER BY executed_at DESC LIMIT ?`
      )
      .all(limit)
    return rows.map(this.rowToHistory)
  }

  /**
   * Full-text search across sql and connection_name columns.
   */
  search(keyword: string, limit: number = 100): QueryHistory[] {
    const like = `%${keyword}%`
    const rows = this.db
      .prepare(
        `SELECT * FROM query_history
         WHERE sql LIKE ? OR connection_name LIKE ?
         ORDER BY executed_at DESC
         LIMIT ?`
      )
      .all(like, like, limit)
    return rows.map(this.rowToHistory)
  }

  /**
   * Return entries for a specific connection, newest first.
   */
  listByConnection(connectionId: string, limit: number = 100): QueryHistory[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM query_history
         WHERE connection_id = ?
         ORDER BY executed_at DESC
         LIMIT ?`
      )
      .all(connectionId, limit)
    return rows.map(this.rowToHistory)
  }

  // ============================================================
  // Cleanup
  // ============================================================

  /**
   * Keep only the most recent `limit` entries, deleting older ones.
   */
  enforceLimit(limit: number): void {
    this.db
      .prepare(
        `DELETE FROM query_history
         WHERE id NOT IN (
           SELECT id FROM query_history ORDER BY executed_at DESC LIMIT ?
         )`
      )
      .run(limit)
  }

  /**
   * Delete a single history entry by id.
   */
  deleteById(id: number): void {
    this.db.prepare(`DELETE FROM query_history WHERE id = ?`).run(id)
  }

  /**
   * Delete all history entries.
   */
  clear(): void {
    this.db.prepare(`DELETE FROM query_history`).run()
  }

  /**
   * Return total count of stored entries.
   */
  count(): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS cnt FROM query_history`)
      .get() as { cnt: number }
    return row.cnt
  }

  // ============================================================
  // Private helpers
  // ============================================================

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private rowToHistory(row: any): QueryHistory {
    return {
      id: row.id,
      connectionId: row.connection_id,
      connectionName: row.connection_name,
      sql: row.sql,
      executedAt: row.executed_at,
      duration: row.duration,
      rowCount: row.row_count,
      success: row.success === 1
    }
  }
}

export const historyStore = HistoryStore.getInstance()
export default historyStore
