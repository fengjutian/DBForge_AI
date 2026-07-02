// @dbforge/plugin-sdk — Plugin Development Kit
// ============================================================
// Provides types and helpers for building external plugins
// that communicate with DBForge AI via JSON-RPC 2.0 over stdio.
//
// Core plugin types are defined in @dbforge/shared and re-exported here.
// This package adds JSON-RPC types and driver interface definitions.

import type { ConnectionConfig, QueryResult, DatabaseSchema, TestResult } from '@dbforge/shared'

// Re-export from shared (single source of truth)
export type {
  PluginType,
  PluginCapability,
  PluginManifest,
  InstalledPlugin,
  PluginRegistryEntry
} from '@dbforge/shared'

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
// (defined in @dbforge/shared, re-exported above)

// ── JSON-RPC 2.0 ─────────────────────────────────────────────

export interface PluginRegistry {
  plugins: PluginRegistryEntry[]
}
