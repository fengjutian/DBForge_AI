import type { DatabaseSchema } from '../../shared/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerSchemaCompletion(monaco: any, schema: DatabaseSchema): void {
  monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ['.', ' '],
    provideCompletionItems: (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      model: any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      position: any
    ) => {
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      }

      const suggestions: unknown[] = []

      for (const db of schema.databases) {
        // Database name suggestions
        suggestions.push({
          label: db.name,
          kind: monaco.languages.CompletionItemKind.Module,
          insertText: db.name,
          range,
          detail: 'Database'
        })

        for (const table of db.tables) {
          // Table name suggestions
          suggestions.push({
            label: table.name,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: table.name,
            range,
            detail: `Table in ${db.name}`
          })

          // Column name suggestions
          for (const col of table.columns) {
            suggestions.push({
              label: col.name,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: col.name,
              range,
              detail: `${col.type} — ${table.name}.${col.name}`
            })
          }
        }
      }

      return { suggestions }
    }
  })
}
