import { spawn } from 'child_process'
import { createWriteStream, createReadStream, statSync } from 'fs'
import { access, constants } from 'fs/promises'
import path from 'path'
import { createGzip } from 'zlib'
import { shell } from 'electron'
import type { BackupOptions, BackupProgress } from '../../shared/types'
import configStore from './ConfigStore'
import connectionManager from './ConnectionManager'

// ============================================================
// Platform-specific mysqldump candidate paths
// ============================================================

const MYSQLDUMP_CANDIDATES: string[] =
  process.platform === 'win32'
    ? [
        'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe',
        'C:\\Program Files\\MySQL\\MySQL Server 5.7\\bin\\mysqldump.exe',
        'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe',
        'C:\\Program Files (x86)\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe',
        'mysqldump.exe'
      ]
    : [
        '/usr/bin/mysqldump',
        '/usr/local/bin/mysqldump',
        '/opt/homebrew/bin/mysqldump',
        '/opt/homebrew/opt/mysql/bin/mysqldump',
        '/usr/local/mysql/bin/mysqldump',
        'mysqldump'
      ]

const MYSQL_CANDIDATES: string[] =
  process.platform === 'win32'
    ? [
        'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe',
        'C:\\Program Files\\MySQL\\MySQL Server 5.7\\bin\\mysql.exe',
        'mysql.exe'
      ]
    : ['/usr/bin/mysql', '/usr/local/bin/mysql', '/opt/homebrew/bin/mysql', 'mysql']

// ============================================================
// BackupManager — singleton
// ============================================================

class BackupManager {
  private static instance: BackupManager | null = null

  private constructor() {}

  static getInstance(): BackupManager {
    if (!BackupManager.instance) {
      BackupManager.instance = new BackupManager()
    }
    return BackupManager.instance
  }

  // ============================================================
  // Path detection & validation
  // ============================================================

  /**
   * Detect mysqldump by probing common installation paths.
   * Returns the first valid executable path, or null if none found.
   * Also checks the user-configured path first.
   */
  async detectMysqldump(): Promise<string | null> {
    // Check user-configured path first
    const configured = configStore.get('mysqldumpPath')
    if (configured) {
      const valid = await this.validateMysqldumpPath(configured)
      if (valid) return configured
    }

    // Probe candidate paths
    for (const candidate of MYSQLDUMP_CANDIDATES) {
      const valid = await this.validateMysqldumpPath(candidate)
      if (valid) return candidate
    }

    return null
  }

  /**
   * Validate that the given path points to a valid mysqldump executable.
   * Resolves within 3 seconds.
   */
  async validateMysqldumpPath(execPath: string): Promise<boolean> {
    try {
      // For absolute paths, check file existence first
      if (path.isAbsolute(execPath)) {
        await access(execPath, constants.X_OK)
      }

      // Run mysqldump --version to confirm it's a real mysqldump binary
      return await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 3000)
        const proc = spawn(execPath, ['--version'], { stdio: 'pipe' })
        proc.on('close', (code) => {
          clearTimeout(timeout)
          resolve(code === 0)
        })
        proc.on('error', () => {
          clearTimeout(timeout)
          resolve(false)
        })
      })
    } catch {
      return false
    }
  }

  // ============================================================
  // Backup
  // ============================================================

  /**
   * Execute a mysqldump backup in a child process.
   * Supports progress callbacks and optional gzip compression.
   * Returns the final output file path.
   */
  async backup(
    options: BackupOptions,
    onProgress: (p: BackupProgress) => void
  ): Promise<string> {
    const startTime = Date.now()

    onProgress({ phase: 'preparing', percent: 0, message: '正在准备备份...' })

    // Resolve mysqldump path
    const mysqldumpPath = await this.detectMysqldump()
    if (!mysqldumpPath) {
      const err: BackupProgress = {
        phase: 'error',
        percent: 0,
        message: '未找到 mysqldump 可执行文件，请在设置中手动指定路径'
      }
      onProgress(err)
      throw new Error(err.message)
    }

    // Resolve connection config
    const conn = connectionManager.getConnection(options.connectionId)
    if (!conn) {
      throw new Error(`连接不存在: ${options.connectionId}`)
    }

    // Build output file path
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const dbNames = options.databases.join('_')
    const ext = options.compress ? '.sql.gz' : '.sql'
    const fileName = `backup_${dbNames}_${timestamp}${ext}`
    const outputPath = path.join(options.outputPath, fileName)

    // Build mysqldump args
    // Note: On Windows use CON for stdout, on Unix use /dev/stdout
    const stdoutTarget = process.platform === 'win32' ? 'CON' : '/dev/stdout'
    const args: string[] = [
      `--host=${conn.host}`,
      `--port=${conn.port}`,
      `--user=${conn.username}`,
      `--password=${conn.password}`,
      `--result-file=${stdoutTarget}`
    ]

    if (options.options.singleTransaction) args.push('--single-transaction')
    if (options.options.routines) args.push('--routines')
    if (options.options.triggers) args.push('--triggers')

    // Add databases
    if (options.databases.length === 1) {
      args.push(options.databases[0])
    } else {
      args.push('--databases', ...options.databases)
    }

    onProgress({ phase: 'dumping', percent: 10, message: '正在导出数据库...' })

    return new Promise<string>((resolve, reject) => {
      const proc = spawn(mysqldumpPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })

      const writeStream = createWriteStream(outputPath)
      const gzip = options.compress ? createGzip() : null

      // Pipe stdout through optional gzip to file
      if (gzip) {
        proc.stdout.pipe(gzip).pipe(writeStream)
      } else {
        proc.stdout.pipe(writeStream)
      }

      let stderrOutput = ''
      let tableCount = 0

      proc.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        stderrOutput += text

        // Parse progress from mysqldump stderr output
        // mysqldump outputs "-- Dumping data for table `xxx`" lines
        const tableMatch = text.match(/Dumping data for table `([^`]+)`/)
        if (tableMatch) {
          tableCount++
          onProgress({
            phase: 'dumping',
            percent: Math.min(10 + tableCount * 5, 85),
            message: `正在导出表: ${tableMatch[1]}`
          })
        }
      })

      proc.on('close', (code) => {
        if (code !== 0) {
          const errMsg = stderrOutput || `mysqldump 退出码: ${code}`
          onProgress({ phase: 'error', percent: 0, message: errMsg })
          reject(new Error(errMsg))
          return
        }

        const finalize = (): void => {
          try {
            const stat = statSync(outputPath)
            const duration = Date.now() - startTime
            onProgress({
              phase: 'done',
              percent: 100,
              message: '备份完成',
              filePath: outputPath,
              fileSize: stat.size,
              duration
            })
            resolve(outputPath)
          } catch (e) {
            reject(e)
          }
        }

        if (options.compress && gzip) {
          onProgress({ phase: 'compressing', percent: 90, message: '正在压缩备份文件...' })
          writeStream.on('finish', finalize)
          writeStream.on('error', reject)
        } else {
          writeStream.on('finish', finalize)
          writeStream.on('error', reject)
        }
      })

      proc.on('error', (err) => {
        onProgress({ phase: 'error', percent: 0, message: err.message })
        reject(err)
      })
    })
  }

  // ============================================================
  // Restore
  // ============================================================

  /**
   * Restore a backup file using the mysql CLI.
   * Supports .sql and .sql.gz files.
   */
  async restore(
    connectionId: string,
    filePath: string,
    onProgress: (p: BackupProgress) => void
  ): Promise<void> {
    onProgress({ phase: 'preparing', percent: 0, message: '正在准备恢复...' })

    // Resolve mysql client path
    const mysqlPath = await this.detectMysqlClient()
    if (!mysqlPath) {
      const err: BackupProgress = {
        phase: 'error',
        percent: 0,
        message: '未找到 mysql 可执行文件，请确认 MySQL 客户端已安装'
      }
      onProgress(err)
      throw new Error(err.message)
    }

    const conn = connectionManager.getConnection(connectionId)
    if (!conn) {
      throw new Error(`连接不存在: ${connectionId}`)
    }

    const isGzip = filePath.endsWith('.gz')

    const args: string[] = [
      `--host=${conn.host}`,
      `--port=${conn.port}`,
      `--user=${conn.username}`,
      `--password=${conn.password}`
    ]

    if (conn.database) {
      args.push(conn.database)
    }

    onProgress({ phase: 'dumping', percent: 20, message: '正在导入备份文件...' })

    return new Promise<void>((resolve, reject) => {
      const proc = spawn(mysqlPath, args, { stdio: ['pipe', 'pipe', 'pipe'] })

      // Pipe file (optionally decompressed) into mysql stdin
      const fileStream = createReadStream(filePath)
      if (isGzip) {
        const { createGunzip } = require('zlib')
        fileStream.pipe(createGunzip()).pipe(proc.stdin)
      } else {
        fileStream.pipe(proc.stdin)
      }

      let stderrOutput = ''

      proc.stderr.on('data', (chunk: Buffer) => {
        stderrOutput += chunk.toString()
      })

      proc.on('close', (code) => {
        if (code !== 0) {
          const errMsg = stderrOutput || `mysql 退出码: ${code}`
          onProgress({ phase: 'error', percent: 0, message: errMsg })
          reject(new Error(errMsg))
          return
        }
        onProgress({ phase: 'done', percent: 100, message: '恢复完成' })
        resolve()
      })

      proc.on('error', (err) => {
        onProgress({ phase: 'error', percent: 0, message: err.message })
        reject(err)
      })

      fileStream.on('error', (err) => {
        onProgress({ phase: 'error', percent: 0, message: err.message })
        reject(err)
      })
    })
  }

  // ============================================================
  // Open backup folder
  // ============================================================

  /**
   * Open the directory containing the given backup file in the OS file manager.
   */
  async openBackupFolder(filePath: string): Promise<void> {
    const dir = path.dirname(filePath)
    await shell.openPath(dir)
  }

  // ============================================================
  // Private helpers
  // ============================================================

  private async detectMysqlClient(): Promise<string | null> {
    for (const candidate of MYSQL_CANDIDATES) {
      try {
        if (path.isAbsolute(candidate)) {
          await access(candidate, constants.X_OK)
        }
        const ok = await new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => resolve(false), 3000)
          const proc = spawn(candidate, ['--version'], { stdio: 'pipe' })
          proc.on('close', (code) => {
            clearTimeout(timeout)
            resolve(code === 0)
          })
          proc.on('error', () => {
            clearTimeout(timeout)
            resolve(false)
          })
        })
        if (ok) return candidate
      } catch {
        // continue
      }
    }
    return null
  }
}

export const backupManager = BackupManager.getInstance()
export default backupManager
