// ============================================================
// Dialect registry — bootstrap all supported dialects
// ============================================================

export type { DatabaseDialect } from './DialectInterface'
export { registerDialect, getDialect, listDialects } from './DialectInterface'
export type { BackupParams, RestoreParams } from './DialectInterface'
export { MySQLDialect } from './MySQLDialect'
export { PostgreSQLDialect } from './PostgreSQLDialect'
export { SQLiteDialect } from './SQLiteDialect'

import { registerDialect } from './DialectInterface'
import { MySQLDialect } from './MySQLDialect'
import { PostgreSQLDialect } from './PostgreSQLDialect'
import { SQLiteDialect } from './SQLiteDialect'

export function bootstrapDialects(): void {
  registerDialect(new MySQLDialect())
  registerDialect(new PostgreSQLDialect())
  registerDialect(new SQLiteDialect())
}
