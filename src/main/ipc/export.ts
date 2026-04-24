import { ipcMain, shell } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type { ColumnMeta, QueryResult } from '../../shared/types'
import { queryExecutor } from '../services/QueryExecutor'
import connectionManager from '../services/ConnectionManager'
import configStore from '../services/ConfigStore'
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
 * @param limit - Optional limit for full export (0 = no limit)
 * @returns Path to exported CSV file
 */
async function exportToCSV(connectionId: string, sql: string, limit?: number): Promise<string> {
  const pool = connectionManager.getPool(connectionId)
  const connection = await pool.getConnection()
  try {
    const filePath = join(getExportTempDir(), `export_${Date.now()}.csv`)
    const stream = createWriteStream(filePath)
    
    // Write header
    const [rows, fields] = await connection.query(`LIMIT 1 ${sql.replace(/;\s*$/, '')}`)
    const columns: ColumnMeta[] = (fields as any[]).map((f) => ({
      name: f.name,
      type: String(f.type),
      nullable: true
    }))
    
    stream.write(columns.map(c => `"${c.name.replace(/"/g, '""')}"`).join(',') + '\n')
    
    // Write data with optional limit
    const limitSql = limit && limit > 0 
      ? `${sql.replace(/;\s*$/, '')} LIMIT ${limit}`
      : sql
    const [dataRows] = await connection.query(limitSql)
    
    for (const row of dataRows as any[]) {
      const values = columns.map(c => {
        const val = row[c.name]
        if (val === null || val === undefined) return ''
        return `"${String(val).replace(/"/g, '""')}"`
      }).join(',')
      stream.write(values + '\n')
    }
    
    stream.end()
    await new Promise(resolve => stream.on('close', resolve))
    
    return filePath
  } finally {
    connection.release()
  }
}

/**
 * Export query results to JSON
 * @param connectionId - Connection ID
 * @param sql - SQL query
 * @param limit - Optional limit for full export (0 = no limit)
 * @returns Path to exported JSON file
 */
async function exportToJSON(connectionId: string, sql: string, limit?: number): Promise<string> {
  const pool = connectionManager.getPool(connectionId)
  const connection = await pool.getConnection()
  try {
    const filePath = join(getExportTempDir(), `export_${Date.now()}.json`)
    
    // Get columns from LIMIT 1 query
    const [rows, fields] = await connection.query(`LIMIT 1 ${sql.replace(/;\s*$/, '')}`)
    const columns: ColumnMeta[] = (fields as any[]).map((f) => ({
      name: f.name,
      type: String(f.type),
      nullable: true
    }))
    
    // Get data with optional limit
    const limitSql = limit && limit > 0 
      ? `${sql.replace(/;\s*$/, '')} LIMIT ${limit}`
      : sql
    const [dataRows] = await connection.query(limitSql)
    
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
 * @param limit - Optional limit for full export (0 = no limit)
 * @returns Path to exported Excel file
 */
async function exportToExcel(connectionId: string, sql: string, limit?: number): Promise<string> {
  const ExcelJS = require('exceljs')
  const pool = connectionManager.getPool(connectionId)
  const connection = await pool.getConnection()
  try {
    const filePath = join(getExportTempDir(), `export_${Date.now()}.xlsx`)
    
    // Get columns from LIMIT 1 query
    const [rows, fields] = await connection.query(`LIMIT 1 ${sql.replace(/;\s*$/, '')}`)
    const columns: ColumnMeta[] = (fields as any[]).map((f) => ({
      name: f.name,
      type: String(f.type),
      nullable: true
    }))
    
    // Create workbook
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Result')
    
    // Add header row
    worksheet.addRow(columns.map(c => c.name))
    
    // Get data with optional limit
    const limitSql = limit && limit > 0 
      ? `${sql.replace(/;\s*$/, '')} LIMIT ${limit}`
      : sql
    const [dataRows] = await connection.query(limitSql)
    
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
  ipcMain.handle(IPC.EXPORT_CSV, async (_event, { connectionId, sql, fullExport, limit }: { 
    connectionId: string 
    sql: string 
    fullExport?: boolean 
    limit?: number 
  }) => {
    try {
      const filePath = await exportToCSV(connectionId, sql, fullExport ? limit : undefined)
      return { success: true, filePath }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw { code: 'EXPORT_ERROR', message, userMessage: `导出失败: ${message}` }
    }
  })

  // Export to JSON
  ipcMain.handle(IPC.EXPORT_JSON, async (_event, { connectionId, sql, fullExport, limit }: { 
    connectionId: string 
    sql: string 
    fullExport?: boolean 
    limit?: number 
  }) => {
    try {
      const filePath = await exportToJSON(connectionId, sql, fullExport ? limit : undefined)
      return { success: true, filePath }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw { code: 'EXPORT_ERROR', message, userMessage: `导出失败: ${message}` }
    }
  })

  // Export to Excel
  ipcMain.handle(IPC.EXPORT_EXCEL, async (_event, { connectionId, sql, fullExport, limit }: { 
    connectionId: string 
    sql: string 
    fullExport?: boolean 
    limit?: number 
  }) => {
    try {
      const filePath = await exportToExcel(connectionId, sql, fullExport ? limit : undefined)
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
