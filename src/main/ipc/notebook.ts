// ============================================================
// Notebook IPC Handlers
// ============================================================

import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { IPC } from '@dbforge/shared'
import type { NotebookDocument, ColumnMeta, QueryResult } from '@dbforge/shared'
import queryExecutor from '../services/QueryExecutor'

export function registerNotebookHandlers(): void {
  // Open a .dbforge-nb file
  ipcMain.handle(IPC.NOTEBOOK_OPEN, async (): Promise<NotebookDocument | null> => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
      title: '打开 Notebook',
      filters: [
        { name: 'DBForge Notebook', extensions: ['dbforge-nb', 'json'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })

    if (result.canceled || !result.filePaths[0]) return null

    try {
      const content = readFileSync(result.filePaths[0], 'utf-8')
      const doc: NotebookDocument = JSON.parse(content)

      // Basic validation
      if (!doc.version || !Array.isArray(doc.cells)) {
        throw new Error('Invalid notebook format')
      }

      // Ensure all cells have ids
      doc.cells = doc.cells.map((c, i) => ({
        ...c,
        id: c.id || `cell-${i}`,
      }))

      return doc
    } catch (err) {
      console.error('[Notebook] Failed to open notebook:', err)
      return null
    }
  })

  // Save a .dbforge-nb file
  ipcMain.handle(IPC.NOTEBOOK_SAVE, async (_event, doc: NotebookDocument): Promise<{ success: boolean; filePath?: string }> => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { success: false }

    const result = await dialog.showSaveDialog(win, {
      title: '保存 Notebook',
      defaultPath: 'untitled.dbforge-nb',
      filters: [
        { name: 'DBForge Notebook', extensions: ['dbforge-nb'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || !result.filePath) return { success: false }

    try {
      // Strip large result data before saving
      const slimDoc: NotebookDocument = {
        ...doc,
        cells: doc.cells.map(c => ({
          ...c,
          result: undefined // Don't persist results
        }))
      }
      writeFileSync(result.filePath, JSON.stringify(slimDoc, null, 2))
      return { success: true, filePath: result.filePath }
    } catch (err) {
      console.error('[Notebook] Failed to save notebook:', err)
      return { success: false }
    }
  })

  // Execute a notebook cell
  ipcMain.handle(IPC.NOTEBOOK_EXECUTE_CELL, async (
    _event,
    params: { connectionId: string; sql: string }
  ): Promise<{ columns: ColumnMeta[]; rows: Record<string, unknown>[]; duration: number }> => {
    const start = Date.now()
    const result: QueryResult = await queryExecutor.execute({
      connectionId: params.connectionId,
      sql: params.sql,
      timeout: 30000
    })

    return {
      columns: result.columns,
      rows: result.rows as Record<string, unknown>[],
      duration: Date.now() - start
    }
  })
}
