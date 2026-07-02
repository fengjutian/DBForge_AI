// @dbforge/plugin-sdk — Plugin Development Kit
// ============================================================
// Provides types and helpers for building external plugins
// that communicate with DBForge AI via JSON-RPC 2.0 over stdio.

import type { ConnectionConfig, QueryResult, DatabaseSchema, TestResult } from '@dbforge/shared'

// ── Plugin Manifest ──────────────────────────────────────────

export type PluginType = 'driver' | 'ai-provider' | 'exporter' | 'tool' | 'theme'

export type PluginCapability =
  | 'database:connect'
  | 'database:query'
  | 'database:schema'
  | 'database:backup'
  | 'ai:text-to-sql'
  | 'ai:explain'
  | 'export:csv'
  | 'export:json'
  | 'export:excel'
  | 'ui:theme'

export interface PluginManifest {
  name: string
  version: string
  description: string
  author: string
  main: string
  type: PluginType
  engines: { dbforge: string }
  capabilities: PluginCapability[]
}

// ── JSON-RPC 2.0 ─────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number | string
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number | string
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: Record<string, unknown>
}

// ── Driver Plugin Interface ──────────────────────────────────

export interface DriverCapabilities {
  supportsSSL: boolean
  supportsSchema: boolean
  supportsBackup: boolean
  supportsRestore: boolean
  supportsExplain: boolean
}

export interface DriverPluginMethods {
  'driver.createPool': (config: ConnectionConfig) => Promise<{ poolId: string }>
  'driver.closePool': (params: { poolId: string }) => Promise<void>
  'driver.executeQuery': (params: { poolId: string; sql: string; timeout?: number }) => Promise<QueryResult>
  'driver.fetchSchema': (params: { poolId: string }) => Promise<DatabaseSchema>
  'driver.testConnection': (config: ConnectionConfig) => Promise<TestResult>
  'driver.getCapabilities': () => Promise<DriverCapabilities>
}

// ── Plugin Registry Entry ────────────────────────────────────

export interface PluginRegistryEntry {
  name: string
  version: string
  description: string
  type: PluginType
  download: string
  checksum: string
  homepage?: string
}

export interface PluginRegistry {
  plugins: PluginRegistryEntry[]
}
