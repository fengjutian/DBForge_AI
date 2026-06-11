import type { DatabaseSchema, DatabaseType } from '../../shared/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerSchemaCompletion(monaco: any, schema: DatabaseSchema, databaseType?: DatabaseType): void {
  const isPG = databaseType === 'postgresql'
  const lang = isPG ? 'pgsql' : 'sql'

  monaco.languages.registerCompletionItemProvider(lang, {
    triggerCharacters: ['.', ' '],
    provideCompletionItems: (
      model: any, position: any
    ) => {
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
        startColumn: word.startColumn, endColumn: word.endColumn
      }

      const suggestions: unknown[] = []

      for (const db of schema.databases) {
        suggestions.push({
          label: db.name, kind: monaco.languages.CompletionItemKind.Module,
          insertText: db.name, range, detail: isPG ? 'Schema' : 'Database'
        })

        for (const table of db.tables) {
          const tableLabel = isPG ? `${db.name}.${table.name}` : table.name
          suggestions.push({
            label: tableLabel, kind: monaco.languages.CompletionItemKind.Class,
            insertText: tableLabel, range,
            detail: isPG ? `Table (${db.name})` : `Table in ${db.name}`
          })

          for (const col of table.columns) {
            const colLabel = isPG ? `${table.name}.${col.name}` : col.name
            suggestions.push({
              label: colLabel, kind: monaco.languages.CompletionItemKind.Field,
              insertText: colLabel, range,
              detail: `${col.type} — ${table.name}.${col.name}`
            })
          }
        }
      }

      return { suggestions }
    }
  })
}
