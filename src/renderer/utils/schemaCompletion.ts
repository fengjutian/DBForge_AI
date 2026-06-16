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

        // ── Views ──
        if (db.views) {
          for (const v of db.views) {
            const vLabel = isPG ? `${db.name}.${v.name}` : v.name
            suggestions.push({
              label: vLabel, kind: monaco.languages.CompletionItemKind.Class,
              insertText: vLabel, range,
              detail: isPG ? `View (${db.name})` : `View in ${db.name}`
            })
          }
        }

        // ── Stored Procedures ──
        if (db.procedures) {
          for (const proc of db.procedures) {
            const pLabel = isPG ? `${db.name}.${proc.name}` : proc.name
            suggestions.push({
              label: pLabel, kind: monaco.languages.CompletionItemKind.Function,
              insertText: pLabel, range,
              detail: isPG ? `Procedure (${db.name})` : `Procedure in ${db.name}`
            })
          }
        }
      }

      return { suggestions }
    }
  })
}
