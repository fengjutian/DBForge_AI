import { describe, it, expect } from 'vitest'
import { IPC } from './ipc-channels'

describe('IPC channels', () => {
  it('should have all channel values starting with a category prefix', () => {
    const entries = Object.entries(IPC) as [string, string][]
    for (const [key, value] of entries) {
      expect(value, `Channel "${key}" value "${value}" should contain ":"`).toMatch(/:.+$/)
    }
  })

  it('should have unique values (no duplicate channel names)', () => {
    const values = Object.values(IPC) as string[]
    const uniqueValues = new Set(values)
    expect(uniqueValues.size).toBe(values.length)
  })

  it('should have at least one channel per expected category', () => {
    const values = Object.values(IPC) as string[]
    const categories = [
      'connection',
      'schema',
      'query',
      'export',
      'ai',
      'backup',
      'history',
      'audit',
      'snippet',
      'settings',
      'session',
      'updater'
    ]
    for (const cat of categories) {
      const found = values.some((v) => v.startsWith(`${cat}:`))
      expect(found, `Expected at least one channel under "${cat}:" prefix`).toBe(true)
    }
  })

  it('should use kebab-case for channel action names', () => {
    const values = Object.values(IPC) as string[]
    for (const value of values) {
      const action = value.split(':')[1]
      if (action) {
        // Allow single word or kebab-case
        expect(action, `Action "${action}" in channel "${value}" should be kebab-case`).toMatch(/^[a-z][a-z0-9-]*$/)
      }
    }
  })

  it('should have main->renderer push channels for real-time events', () => {
    const pushChannels = [
      IPC.CONNECTION_STATUS_CHANGED,
      IPC.AI_STREAM_CHUNK,
      IPC.AI_STREAM_END,
      IPC.AI_STREAM_ERROR,
      IPC.AI_STREAM_THINKING,
      IPC.BACKUP_PROGRESS,
      IPC.SESSION_LOCK,
      IPC.SESSION_WARNING,
      IPC.UPDATER_STATUS
    ]
    for (const ch of pushChannels) {
      expect(ch, `Push channel should be defined`).toBeDefined()
      expect(typeof ch).toBe('string')
    }
  })

  it('should have all AI stream channels consistent', () => {
    expect(IPC.AI_STREAM_CHUNK).toBe('ai:stream-chunk')
    expect(IPC.AI_STREAM_END).toBe('ai:stream-end')
    expect(IPC.AI_STREAM_ERROR).toBe('ai:stream-error')
    expect(IPC.AI_STREAM_THINKING).toBe('ai:stream-thinking')
  })

  it('should have connection CRUD channels', () => {
    expect(IPC.CONNECTION_LIST).toBe('connection:list')
    expect(IPC.CONNECTION_CREATE).toBe('connection:create')
    expect(IPC.CONNECTION_UPDATE).toBe('connection:update')
    expect(IPC.CONNECTION_DELETE).toBe('connection:delete')
    expect(IPC.CONNECTION_TEST).toBe('connection:test')
  })

  it('should have export channels', () => {
    expect(IPC.EXPORT_CSV).toBe('export:csv')
    expect(IPC.EXPORT_JSON).toBe('export:json')
    expect(IPC.EXPORT_EXCEL).toBe('export:excel')
  })
})
