// ============================================================
// Dialect registry — bootstrap all supported dialects
// ============================================================

export { DatabaseDialect, registerDialect, getDialect, listDialects } from './DialectInterface'
export type { BackupParams, RestoreParams } from './DialectInterface'
export { MySQLDialect } from './MySQLDialect'
export { PostgreSQLDialect } from './PostgreSQLDialect'

import { registerDialect } from './DialectInterface'
import { MySQLDialect } from './MySQLDialect'
import { PostgreSQLDialect } from './PostgreSQLDialect'

export function bootstrapDialects(): void {
  registerDialect(new MySQLDialect())
  registerDialect(new PostgreSQLDialect())
}
