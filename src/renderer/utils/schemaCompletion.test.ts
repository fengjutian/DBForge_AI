import { describe, it, expect, vi } from 'vitest'
import type { DatabaseSchema } from '../../shared/types'

// Monaco mock
const createMonacoMock = () => ({
  languages: {
    registerCompletionItemProvider: vi.fn()
  }
})

// We need to test the logic inside registerSchemaCompletion without Monaco.
// Since registerSchemaCompletion directly mutates monaco.languages,
// we test the side-effect: that registerCompletionItemProvider is called
// with a provider that returns the right suggestions based on schema.

describe('registerSchemaCompletion', () => {
  it('registers a completion item provider for SQL', async () => {
    const monaco = createMonacoMock()
    const schema: DatabaseSchema = {
      connectionId: 'c1',
      databases: [
        {
          name: 'mydb',
          tables: [
            {
              name: 'users',
              columns: [
                { name: 'id', type: 'INT', nullable: false },
                { name: 'email', type: 'VARCHAR(255)', nullable: true }
              ],
              primaryKeys: ['id'],
              foreignKeys: []
            },
            {
              name: 'orders',
              columns: [
                { name: 'order_id', type: 'INT', nullable: false },
                { name: 'amount', type: 'DECIMAL(10,2)', nullable: true }
              ],
              primaryKeys: ['order_id'],
              foreignKeys: [
                { columnName: 'order_id', referencedTable: 'users', referencedColumn: 'id' }
              ]
            }
          ]
        }
      ],
      fetchedAt: 1000
    }

    // Dynamic import to avoid top-level Monaco dependency
    const { registerSchemaCompletion } = await import('./schemaCompletion')
    registerSchemaCompletion(monaco, schema)

    // Verify the provider was registered
    expect(monaco.languages.registerCompletionItemProvider).toHaveBeenCalledTimes(1)
    expect(monaco.languages.registerCompletionItemProvider).toHaveBeenCalledWith(
      'sql',
      expect.objectContaining({
        triggerCharacters: ['.', ' ']
      })
    )

    // Extract the provider and test its provideCompletionItems
    const provider = monaco.languages.registerCompletionItemProvider.mock.calls[0][1]
    const result = provider.provideCompletionItems(
      { getWordUntilPosition: () => ({ startColumn: 1, endColumn: 1 }) },
      { lineNumber: 1 }
    )

    // Should return suggestions for db name, tables, and columns
    expect(result.suggestions).toBeDefined()
    const labels = result.suggestions.map((s: { label: string }) => s.label)

    // Database name
    expect(labels).toContain('mydb')

    // Table names
    expect(labels).toContain('users')
    expect(labels).toContain('orders')

    // Column names
    expect(labels).toContain('id')
    expect(labels).toContain('email')
    expect(labels).toContain('order_id')
    expect(labels).toContain('amount')
  })

  it('returns no suggestions for empty schema', async () => {
    const monaco = createMonacoMock()
    const schema: DatabaseSchema = {
      connectionId: 'c1',
      databases: [],
      fetchedAt: 1000
    }

    const { registerSchemaCompletion } = await import('./schemaCompletion')
    registerSchemaCompletion(monaco, schema)

    const provider = monaco.languages.registerCompletionItemProvider.mock.calls[0][1]
    const result = provider.provideCompletionItems(
      { getWordUntilPosition: () => ({ startColumn: 1, endColumn: 1 }) },
      { lineNumber: 1 }
    )

    expect(result.suggestions).toHaveLength(0)
  })

  it('sets correct CompletionItemKind for each suggestion type', async () => {
    const monaco = createMonacoMock()
    monaco.languages.CompletionItemKind = {
      Module: 8,
      Class: 5,
      Field: 3
    }

    const schema: DatabaseSchema = {
      connectionId: 'c1',
      databases: [
        {
          name: 'mydb',
          tables: [
            {
              name: 'users',
              columns: [{ name: 'name', type: 'VARCHAR(100)', nullable: true }],
              primaryKeys: [],
              foreignKeys: []
            }
          ]
        }
      ],
      fetchedAt: 1000
    }

    const { registerSchemaCompletion } = await import('./schemaCompletion')
    registerSchemaCompletion(monaco, schema)

    const provider = monaco.languages.registerCompletionItemProvider.mock.calls[0][1]
    const result = provider.provideCompletionItems(
      { getWordUntilPosition: () => ({ startColumn: 1, endColumn: 1 }) },
      { lineNumber: 1 }
    )

    const dbSuggestion = result.suggestions.find((s: { label: string }) => s.label === 'mydb')
    const tableSuggestion = result.suggestions.find((s: { label: string }) => s.label === 'users')
    const colSuggestion = result.suggestions.find((s: { label: string }) => s.label === 'name')

    expect(dbSuggestion.kind).toBe(8)  // Module
    expect(tableSuggestion.kind).toBe(5)  // Class
    expect(colSuggestion.kind).toBe(3)   // Field
  })

  it('handles multiple databases and tables correctly', async () => {
    const monaco = createMonacoMock()
    const schema: DatabaseSchema = {
      connectionId: 'c1',
      databases: [
        {
          name: 'db_a',
          tables: [{ name: 't1', columns: [{ name: 'c1', type: 'INT', nullable: false }], primaryKeys: [], foreignKeys: [] }]
        },
        {
          name: 'db_b',
          tables: [{ name: 't2', columns: [{ name: 'c2', type: 'TEXT', nullable: true }], primaryKeys: [], foreignKeys: [] }]
        }
      ],
      fetchedAt: 1000
    }

    const { registerSchemaCompletion } = await import('./schemaCompletion')
    registerSchemaCompletion(monaco, schema)

    const provider = monaco.languages.registerCompletionItemProvider.mock.calls[0][1]
    const result = provider.provideCompletionItems(
      { getWordUntilPosition: () => ({ startColumn: 1, endColumn: 1 }) },
      { lineNumber: 1 }
    )

    expect(result.suggestions).toHaveLength(4) // 2 databases + 2 tables + 2 columns
    const labels = result.suggestions.map((s: { label: string }) => s.label)
    expect(labels).toContain('db_a')
    expect(labels).toContain('db_b')
    expect(labels).toContain('t1')
    expect(labels).toContain('t2')
    expect(labels).toContain('c1')
    expect(labels).toContain('c2')
  })
})
