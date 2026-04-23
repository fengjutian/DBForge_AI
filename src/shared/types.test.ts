import { describe, it, expect } from 'vitest'
import type {
  ConnectionConfig,
  QueryResult,
  DangerousCheckResult,
  AIConfig,
  AppConfig
} from './types'

describe('Shared Types', () => {
  it('ConnectionConfig should have required fields', () => {
    const config: ConnectionConfig = {
      id: 'test-id',
      name: 'Test Connection',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: 'secret',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    expect(config.id).toBe('test-id')
    expect(config.port).toBe(3306)
  })

  it('QueryResult should have required fields', () => {
    const result: QueryResult = {
      columns: [{ name: 'id', type: 'int', nullable: false }],
      rows: [{ id: 1 }],
      executionTime: 42,
      sql: 'SELECT 1'
    }
    expect(result.columns).toHaveLength(1)
    expect(result.rows).toHaveLength(1)
    expect(result.executionTime).toBe(42)
  })

  it('DangerousCheckResult should have isDangerous and reasons', () => {
    const safe: DangerousCheckResult = { isDangerous: false, reasons: [] }
    const dangerous: DangerousCheckResult = {
      isDangerous: true,
      reasons: ['包含 DROP TABLE']
    }
    expect(safe.isDangerous).toBe(false)
    expect(dangerous.isDangerous).toBe(true)
    expect(dangerous.reasons).toHaveLength(1)
  })

  it('AIConfig should support all providers', () => {
    const config: AIConfig = {
      provider: 'openai',
      model: 'gpt-4',
      temperature: 0.7,
      mode: 'readonly'
    }
    expect(config.provider).toBe('openai')
    expect(config.mode).toBe('readonly')
  })

  it('AppConfig should have default-compatible structure', () => {
    const config: AppConfig = {
      ai: {
        provider: 'openai',
        model: 'gpt-4',
        temperature: 0.7,
        mode: 'readonly'
      },
      connections: [],
      connectionGroups: [],
      theme: 'system',
      language: 'zh',
      shortcuts: {},
      autoBackup: false,
      autoBackupInterval: 60,
      sessionTimeout: 30,
      historyLimit: 1000,
      auditRetentionDays: 90,
      crashReportEnabled: false,
      onboardingCompleted: false,
      version: '1.0.0'
    }
    expect(config.historyLimit).toBe(1000)
    expect(config.auditRetentionDays).toBe(90)
    expect(config.sessionTimeout).toBe(30)
  })
})
