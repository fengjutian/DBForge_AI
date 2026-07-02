import { ipcMain, shell } from 'electron'
import { IPC } from '@dbforge/shared'
import connectionManager from '../services/ConnectionManager'
import * as fs from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// Helper to get temp directory for export files
function getExportTempDir(): string {
  const dir = join(tmpdir(), 'dbforge-export')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Export query results to CSV
 * @param connectionId - Connection ID
 * @param sql - SQL query
 * @param fullExport - If true, exports all data without limit
 * @returns Path to exported CSV file
 */
async function exportToCSV(connectionId: string, sql: string, fullExport: boolean = false): Promise<string> {
  const pool = connectionManager.getPool(connectionId)
  const connection = await pool.getConnection()
  try {
    const filePath = join(getExportTempDir(), `export_${Date.now()}.csv`)
    const stream = fs.createWriteStream(filePath)
    
    // Get columns
    const [rows, fields] = await connection.query(`LIMIT 1 ${sql.replace(/;\s*$/, '')}`)
    const columns: any[] = (fields as any[]).map((f: any) => ({
      name: f.name,
      type: String(f.type),
      nullable: true
    }))
    
    stream.write(columns.map(c => `"${c.name.replace(/"/g, '""')}"`).join(',') + '\n')
    
    // Get data - no limit for full export
    const querySql = fullExport ? sql : `${sql.replace(/;\s*$/, '')} LIMIT 100000`
    const [dataRows] = await connection.query(querySql)
    
    for (const row of dataRows as any[]) {
      const values = columns.map(c => {
        const val = row[c.name]
        if (val === null || val === undefined) return ''
        const s = typeof val === 'object' ? JSON.stringify(val) : String(val)
        return `"${s.replace(/"/g, '""')}"`;
      }).join(',')
      stream.write(values + '\n')
    }
    
    stream.end()
    await new Promise((resolve) => stream.on('close', resolve as () => void))
    
    return filePath
  } finally {
    connection.release()
  }
}

/**
 * Export query results to JSON
 * @param connectionId - Connection ID
 * @param sql - SQL query
 * @param fullExport - If true, exports all data without limit
 * @returns Path to exported JSON file
 */
async function exportToJSON(connectionId: string, sql: string, fullExport: boolean = false): Promise<string> {
  const pool = connectionManager.getPool(connectionId)
  const connection = await pool.getConnection()
  try {
    const filePath = join(getExportTempDir(), `export_${Date.now()}.json`)
    
    // Get columns
    const [rows, fields] = await connection.query(`LIMIT 1 ${sql.replace(/;\s*$/, '')}`)
    const columns: any[] = (fields as any[]).map((f: any) => ({
      name: f.name,
      type: String(f.type),
      nullable: true
    }))
    
    // Get data - no limit for full export
    const querySql = fullExport ? sql : `${sql.replace(/;\s*$/, '')} LIMIT 100000`
    const [dataRows] = await connection.query(querySql)
    
    const result: Record<string, unknown>[] = (dataRows as any[]).map(row => {
      const obj: Record<string, unknown> = {}
      for (const col of columns) {
        obj[col.name] = row[col.name]
      }
      return obj
    })
    
    const jsonStr = JSON.stringify(result, null, 2)
    fs.writeFileSync(filePath, jsonStr, 'utf8')
    
    return filePath
  } finally {
    connection.release()
  }
}

/**
 * Export query results to Excel (XLSX)
 * @param connectionId - Connection ID
 * @param sql - SQL query
 * @param fullExport - If true, exports all data without limit
 * @returns Path to exported Excel file
 */
async function exportToExcel(connectionId: string, sql: string, fullExport: boolean = false): Promise<string> {
  const ExcelJS = require('exceljs')
  const pool = connectionManager.getPool(connectionId)
  const connection = await pool.getConnection()
  try {
    const filePath = join(getExportTempDir(), `export_${Date.now()}.xlsx`)
    
    // Get columns
    const [rows, fields] = await connection.query(`LIMIT 1 ${sql.replace(/;\s*$/, '')}`)
    const columns: any[] = (fields as any[]).map((f: any) => ({
      name: f.name,
      type: String(f.type),
      nullable: true
    }))
    
    // Create workbook
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Result')
    
    // Add header row
    worksheet.addRow(columns.map(c => c.name))
    
    // Get data - no limit for full export
    const querySql = fullExport ? sql : `${sql.replace(/;\s*$/, '')} LIMIT 100000`
    const [dataRows] = await connection.query(querySql)
    
    // Add data rows
    for (const row of dataRows as any[]) {
      worksheet.addRow(columns.map(c => row[c.name]))
    }
    
    // Auto-size columns
    columns.forEach((_, index) => {
      worksheet.getColumn(index + 1).width = 15
    })
    
    await workbook.xlsx.writeFile(filePath)
    return filePath
  } finally {
    connection.release()
  }
}

export function register(): void {
  // Export to CSV
  ipcMain.handle(IPC.EXPORT_CSV, async (_event, { connectionId, sql, fullExport }: { 
    connectionId: string 
    sql: string 
    fullExport?: boolean 
  }) => {
    try {
      const filePath = await exportToCSV(connectionId, sql, fullExport ?? false)
      return { success: true, filePath }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw { code: 'EXPORT_ERROR', message, userMessage: `导出失败: ${message}` }
    }
  })

  // Export to JSON
  ipcMain.handle(IPC.EXPORT_JSON, async (_event, { connectionId, sql, fullExport }: { 
    connectionId: string 
    sql: string 
    fullExport?: boolean 
  }) => {
    try {
      const filePath = await exportToJSON(connectionId, sql, fullExport ?? false)
      return { success: true, filePath }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw { code: 'EXPORT_ERROR', message, userMessage: `导出失败: ${message}` }
    }
  })

  // Export to Excel
  ipcMain.handle(IPC.EXPORT_EXCEL, async (_event, { connectionId, sql, fullExport }: { 
    connectionId: string 
    sql: string 
    fullExport?: boolean 
  }) => {
    try {
      const filePath = await exportToExcel(connectionId, sql, fullExport ?? false)
      return { success: true, filePath }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw { code: 'EXPORT_ERROR', message, userMessage: `导出失败: ${message}` }
    }
  })

  // Get export file
  ipcMain.handle(IPC.EXPORT_GET_FILE, async (_event, filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error('文件不存在')
      }
      // Open file in default application
      shell.openPath(filePath)
      return { success: true, filePath }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw { code: 'FILE_ERROR', message, userMessage: `文件操作失败: ${message}` }
    }
  })
}
