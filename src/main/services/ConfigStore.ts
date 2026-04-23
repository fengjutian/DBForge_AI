import { safeStorage, app } from 'electron'
import path from 'path'
import type { AppConfig, ConnectionConfig, ConnectionGroup } from '../../shared/types'

// Valid models per provider — kept in sync with the renderer Settings UI
const VALID_MODELS: Record<string, string[]> = {
  openai:   ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  groq:     ['llama3-70b-8192', 'llama3-8b-8192', 'mixtral-8x7b-32768'],
  claude:   ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  ollama:   [] // ollama accepts any model name
}

const DEFAULT_MODEL: Record<string, string> = {
  openai:   'gpt-4o-mini',
  groq:     'llama3-70b-8192',
  claude:   'claude-3-5-sonnet-20241022',
  deepseek: 'deepseek-chat',
  ollama:   'llama3'
}
const DEFAULT_CONFIG: AppConfig = {
  ai: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    temperature: 0.2,
    apiKeyEncrypted: undefined,
    baseUrl: undefined,
    mode: 'readonly'
  },
  connections: [],
  connectionGroups: [],
  theme: 'system',
  language: 'zh',
  shortcuts: {
    executeQuery: 'Ctrl+Enter',
    formatSQL: 'Ctrl+K',
    newTab: 'Ctrl+T',
    closeTab: 'Ctrl+W'
  },
  mysqldumpPath: undefined,
  autoBackup: false,
  autoBackupInterval: 60,
  sessionTimeout: 0,
  historyLimit: 1000,
  auditRetentionDays: 90,
  crashReportEnabled: false,
  onboardingCompleted: false,
  version: '1.0.0'
}

// ============================================================
// Encryption utilities (require main process / safeStorage)
// ============================================================

/**
 * Encrypt a plaintext string using Electron's safeStorage API.
 * Returns a base64-encoded string of the encrypted buffer.
 * Falls back to base64 encoding if safeStorage is not available.
 */
export function encryptString(plaintext: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(plaintext)
    return encrypted.toString('base64')
  }
  // Fallback: base64 encode (not secure, but allows app to function)
  return Buffer.from(plaintext, 'utf8').toString('base64')
}

/**
 * Decrypt a base64-encoded encrypted string using Electron's safeStorage API.
 * Falls back to base64 decoding if safeStorage is not available.
 */
export function decryptString(encrypted: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    const buffer = Buffer.from(encrypted, 'base64')
    return safeStorage.decryptString(buffer)
  }
  // Fallback: base64 decode
  return Buffer.from(encrypted, 'base64').toString('utf8')
}

// ============================================================
// ConfigStore — singleton
// ============================================================

type StoredConnection = ConnectionConfig & { passwordEncrypted: string }

class ConfigStore {
  private static instance: ConfigStore | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private store: any = null
  private config: AppConfig = { ...DEFAULT_CONFIG }

  private constructor() {}

  static getInstance(): ConfigStore {
    if (!ConfigStore.instance) {
      ConfigStore.instance = new ConfigStore()
    }
    return ConfigStore.instance
  }

  /**
   * Initialize the store. Must be called after app is ready.
   * Uses dynamic import to handle electron-store v8 ESM module.
   */
  async init(): Promise<void> {
    // Dynamic import required because electron-store v8 is ESM-only
    const { default: Store } = await import('electron-store')

    this.store = new Store<AppConfig>({
      name: 'app-config',
      cwd: path.join(app.getPath('userData')),
      defaults: DEFAULT_CONFIG
    })

    // Load persisted config, merging with defaults for any missing keys
    this.config = this.store.store as AppConfig

    // Migrate: ensure the saved AI model is valid for the saved provider.
    // This handles cases where a model was renamed/deprecated between versions.
    this.migrateAIModel()
  }

  /**
   * If the persisted AI model is not in the valid list for its provider,
   * reset it to the provider's default and persist the fix.
   */
  private migrateAIModel(): void {
    const ai = this.get('ai')
    const validModels = VALID_MODELS[ai.provider]
    // ollama has an open model list — skip validation
    if (!validModels || validModels.length === 0) return
    if (!validModels.includes(ai.model)) {
      const fixed = DEFAULT_MODEL[ai.provider] ?? validModels[0]
      console.log(`[ConfigStore] Migrating AI model "${ai.model}" → "${fixed}" for provider "${ai.provider}"`)
      this.set('ai', { ...ai, model: fixed })
    }
  }

  // ============================================================
  // Generic get/set
  // ============================================================

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    if (this.store) {
      return this.store.get(key) as AppConfig[K]
    }
    return this.config[key]
  }

  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    this.config[key] = value
    if (this.store) {
      this.store.set(key, value)
    }
  }

  getAll(): AppConfig {
    if (this.store) {
      return this.store.store as AppConfig
    }
    return { ...this.config }
  }

  // ============================================================
  // Connection config read/write (password auto-encrypted)
  // ============================================================

  /**
   * Return all connections with passwords decrypted.
   */
  getConnections(): ConnectionConfig[] {
    const stored: StoredConnection[] = this.get('connections') ?? []
    return stored.map((conn) => this.decryptConnectionPassword(conn))
  }

  /**
   * Save a connection config. The password field is encrypted before storage.
   */
  saveConnection(config: ConnectionConfig): void {
    const stored = this.encryptConnectionPassword(config)
    const connections: StoredConnection[] = this.get('connections') ?? []
    const idx = connections.findIndex((c) => c.id === config.id)
    if (idx >= 0) {
      connections[idx] = stored
    } else {
      connections.push(stored)
    }
    this.set('connections', connections)
  }

  /**
   * Delete a connection by id.
   */
  deleteConnection(id: string): void {
    const connections: StoredConnection[] = this.get('connections') ?? []
    this.set(
      'connections',
      connections.filter((c) => c.id !== id)
    )
  }

  /**
   * Return a single connection with password decrypted, or undefined.
   */
  getConnection(id: string): ConnectionConfig | undefined {
    const connections: StoredConnection[] = this.get('connections') ?? []
    const stored = connections.find((c) => c.id === id)
    if (!stored) return undefined
    return this.decryptConnectionPassword(stored)
  }

  // ============================================================
  // Connection groups
  // ============================================================

  getConnectionGroups(): ConnectionGroup[] {
    return this.get('connectionGroups') ?? []
  }

  saveConnectionGroups(groups: ConnectionGroup[]): void {
    this.set('connectionGroups', groups)
  }

  // ============================================================
  // AI config (apiKey auto-encrypted)
  // ============================================================

  getAIConfig(): AppConfig['ai'] {
    return this.get('ai')
  }

  saveAIConfig(aiConfig: AppConfig['ai'] & { apiKey?: string }): void {
    const toStore: AppConfig['ai'] = { ...aiConfig }
    // If a plaintext apiKey is provided, encrypt it
    if (aiConfig.apiKey) {
      toStore.apiKeyEncrypted = encryptString(aiConfig.apiKey)
      // Remove plaintext key from stored object
      delete (toStore as AppConfig['ai'] & { apiKey?: string }).apiKey
    }
    this.set('ai', toStore)
  }

  /**
   * Retrieve the decrypted AI API key, or undefined if not set.
   */
  getDecryptedAPIKey(): string | undefined {
    const ai = this.get('ai')
    if (!ai.apiKeyEncrypted) return undefined
    return decryptString(ai.apiKeyEncrypted)
  }

  // ============================================================
  // Private helpers
  // ============================================================

  private encryptConnectionPassword(config: ConnectionConfig): StoredConnection {
    const { password, ssh, ...rest } = config
    const stored: StoredConnection = {
      ...rest,
      password: '', // clear plaintext
      passwordEncrypted: encryptString(password)
    }
    // Encrypt SSH password if present
    if (ssh) {
      stored.ssh = { ...ssh }
      if (ssh.password) {
        stored.ssh = {
          ...ssh,
          password: encryptString(ssh.password)
        }
      }
    }
    return stored
  }

  private decryptConnectionPassword(stored: StoredConnection): ConnectionConfig {
    const { passwordEncrypted, ...rest } = stored
    const config: ConnectionConfig = {
      ...rest,
      password: decryptString(passwordEncrypted)
    }
    // Decrypt SSH password if present
    if (config.ssh?.password) {
      config.ssh = {
        ...config.ssh,
        password: decryptString(config.ssh.password)
      }
    }
    return config
  }
}

// Export singleton accessor
export const configStore = ConfigStore.getInstance()
export default configStore
