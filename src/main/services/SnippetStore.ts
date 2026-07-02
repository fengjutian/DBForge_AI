import path from 'path'
import { app } from 'electron'
import type { SqlSnippet } from '@dbforge/shared'

// ============================================================
// SnippetStore — singleton, backed by better-sqlite3
// ============================================================

class SnippetStore {
  private static instance: SnippetStore | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any = null

  private constructor() {}

  static getInstance(): SnippetStore {
    if (!SnippetStore.instance) {
      SnippetStore.instance = new SnippetStore()
    }
    return SnippetStore.instance
  }

  /**
   * Initialize the SQLite database. Must be called after app is ready.
   */
  init(): void {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3')
    const dbPath = path.join(app.getPath('userData'), 'snippets.db')
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.createSchema()
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sql_snippets (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        title       TEXT NOT NULL,
        sql         TEXT NOT NULL,
        tags        TEXT,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );
    `)
  }

  // ============================================================
  // Create
  // ============================================================

  /**
   * Insert a new snippet and return it with the generated id.
   */
  create(data: { title: string; sql: string; tags?: string[] }): SqlSnippet {
    const now = Date.now()
    const tagsJson = JSON.stringify(data.tags ?? [])
    const result = this.db
      .prepare(
        `INSERT INTO sql_snippets (title, sql, tags, created_at, updated_at)
         VALUES (@title, @sql, @tags, @createdAt, @updatedAt)`
      )
      .run({ title: data.title, sql: data.sql, tags: tagsJson, createdAt: now, updatedAt: now })
    return this.getById(result.lastInsertRowid as number)!
  }

  // ============================================================
  // Read
  // ============================================================

  /**
   * Return all snippets, newest first.
   */
  list(): SqlSnippet[] {
    const rows = this.db
      .prepare(`SELECT * FROM sql_snippets ORDER BY updated_at DESC`)
      .all()
    return rows.map(this.rowToSnippet)
  }

  /**
   * Return a single snippet by id, or undefined if not found.
   */
  getById(id: number): SqlSnippet | undefined {
    const row = this.db
      .prepare(`SELECT * FROM sql_snippets WHERE id = ?`)
      .get(id)
    return row ? this.rowToSnippet(row) : undefined
  }

  /**
   * Search snippets by title or SQL content.
   */
  search(keyword: string): SqlSnippet[] {
    const like = `%${keyword}%`
    const rows = this.db
      .prepare(
        `SELECT * FROM sql_snippets
         WHERE title LIKE ? OR sql LIKE ?
         ORDER BY updated_at DESC`
      )
      .all(like, like)
    return rows.map(this.rowToSnippet)
  }

  /**
   * Return snippets that contain the given tag.
   */
  listByTag(tag: string): SqlSnippet[] {
    // Tags are stored as JSON arrays; use LIKE for a simple substring match
    const rows = this.db
      .prepare(
        `SELECT * FROM sql_snippets
         WHERE tags LIKE ?
         ORDER BY updated_at DESC`
      )
      .all(`%${tag}%`)
    // Filter precisely in JS to avoid false positives from LIKE
    return rows
      .map(this.rowToSnippet)
      .filter((s: SqlSnippet) => s.tags.includes(tag))
  }

  // ============================================================
  // Update
  // ============================================================

  /**
   * Update an existing snippet. Returns the updated snippet, or undefined if not found.
   */
  update(
    id: number,
    data: Partial<{ title: string; sql: string; tags: string[] }>
  ): SqlSnippet | undefined {
    const existing = this.getById(id)
    if (!existing) return undefined

    const title = data.title ?? existing.title
    const sql = data.sql ?? existing.sql
    const tags = data.tags ?? existing.tags
    const updatedAt = Date.now()

    this.db
      .prepare(
        `UPDATE sql_snippets
         SET title = @title, sql = @sql, tags = @tags, updated_at = @updatedAt
         WHERE id = @id`
      )
      .run({ id, title, sql, tags: JSON.stringify(tags), updatedAt })

    return this.getById(id)
  }

  // ============================================================
  // Delete
  // ============================================================

  /**
   * Delete a snippet by id. Returns true if a row was deleted.
   */
  delete(id: number): boolean {
    const result = this.db
      .prepare(`DELETE FROM sql_snippets WHERE id = ?`)
      .run(id)
    return result.changes > 0
  }

  // ============================================================
  // Private helpers
  // ============================================================

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private rowToSnippet(row: any): SqlSnippet {
    return {
      id: row.id,
      title: row.title,
      sql: row.sql,
      tags: row.tags ? (JSON.parse(row.tags) as string[]) : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}

export const snippetStore = SnippetStore.getInstance()
export default snippetStore
