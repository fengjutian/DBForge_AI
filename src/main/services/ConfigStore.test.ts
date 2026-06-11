import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Electron's safeStorage for encryption testing
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from(`encrypted:${s}`)),
    decryptString: vi.fn((b: Buffer) => b.toString().replace('encrypted:', ''))
  },
  app: {
    getPath: vi.fn(() => '/tmp/test-app')
  }
}))

import { encryptString, decryptString } from './ConfigStore'

describe('ConfigStore encryption', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('encryptString', () => {
    it('encrypts a plaintext string using safeStorage', () => {
      const result = encryptString('my-secret-password')
      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
      // With the mock, result should be base64 of "encrypted:my-secret-password"
      const expectedBase64 = Buffer.from('encrypted:my-secret-password').toString('base64')
      expect(result).toBe(expectedBase64)
    })

    it('falls back to base64 when safeStorage is unavailable', () => {
      const { safeStorage } = require('electron')
      safeStorage.isEncryptionAvailable.mockReturnValueOnce(false)

      const result = encryptString('plaintext')
      // Fallback: simple base64 encode
      const expected = Buffer.from('plaintext', 'utf8').toString('base64')
      expect(result).toBe(expected)
    })

    it('handles empty string', () => {
      const result = encryptString('')
      expect(result).toBeDefined()
    })

    it('handles unicode characters', () => {
      const result = encryptString('密码测试🔑')
      const expectedBase64 = Buffer.from('encrypted:密码测试🔑').toString('base64')
      expect(result).toBe(expectedBase64)
    })
  })

  describe('decryptString', () => {
    it('decrypts a string encrypted with encryptString', () => {
      const encrypted = Buffer.from('encrypted:my-secret').toString('base64')
      const result = decryptString(encrypted)
      expect(result).toBe('my-secret')
    })

    it('falls back to base64 decode when safeStorage is unavailable', () => {
      const { safeStorage } = require('electron')
      safeStorage.isEncryptionAvailable.mockReturnValueOnce(false)

      const encoded = Buffer.from('base64-fallback', 'utf8').toString('base64')
      const result = decryptString(encoded)
      expect(result).toBe('base64-fallback')
    })

    it('round-trips encryption and decryption', () => {
      const original = 'SuperSecret@123!'
      const encrypted = encryptString(original)
      const decrypted = decryptString(encrypted)
      expect(decrypted).toBe(original)
    })

    it('round-trips unicode', () => {
      const original = 'API密钥_secure!'
      const encrypted = encryptString(original)
      const decrypted = decryptString(encrypted)
      expect(decrypted).toBe(original)
    })
  })
})
