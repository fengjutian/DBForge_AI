/**
 * Preprocess streaming markdown content to handle incomplete blocks gracefully.
 *
 * Problem: During streaming, markdown tables arrive chunk-by-chunk. remark-gfm
 * only renders a table when it sees a complete structure (header + separator +
 * data rows). Until then, raw `|` and `---` characters pollute the output.
 *
 * Solution: Detect incomplete table blocks at the end of the stream and
 * temporarily convert them to plain text. Once the table is complete, it
 * renders normally.
 */

/**
 * Check if a line looks like part of a markdown table.
 */
function isTableLine(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed === '') return false
  // Header or data row: starts with | (may be incomplete at end during streaming)
  if (trimmed.startsWith('|')) return true
  // Separator line: contains only |, -, :, and spaces
  if (/^\|?[\s\-:|]+\|?$/.test(trimmed) && trimmed.includes('---')) return true
  return false
}

/**
 * Check if a line is a table separator (|---|...).
 */
function isSeparatorLine(line: string): boolean {
  const trimmed = line.trim()
  return /^\|?[\s\-:|]+\|?$/.test(trimmed) && trimmed.includes('---')
}

/**
 * Determine whether a group of table-like lines forms a complete GFM table.
 * A complete table needs: header row + separator row + at least one data row.
 * The last row must also be complete (ends with |) — during streaming the
 * final row may be cut off mid-cell.
 */
function isCompleteTable(lines: string[]): boolean {
  const nonEmpty = lines.filter(l => l.trim() !== '')
  if (nonEmpty.length < 3) return false

  const sepIndex = nonEmpty.findIndex(isSeparatorLine)
  // Separator must exist, not be first, and not be last
  if (sepIndex <= 0 || sepIndex >= nonEmpty.length - 1) return false

  // Last row must be complete (ends with |)
  const lastLine = nonEmpty[nonEmpty.length - 1].trim()
  if (!lastLine.endsWith('|')) return false

  return true
}

/**
 * Convert an incomplete table block to plain text by stripping `|` and `---`.
 */
function softenIncompleteTable(lines: string[]): string[] {
  return lines
    .map(line => {
      const trimmed = line.trim()
      if (trimmed === '') return ''
      // Drop pure separator lines
      if (isSeparatorLine(trimmed)) return ''
      // Split by |, trim cells, filter empties
      const cells = trimmed
        .split('|')
        .map(c => c.trim())
        .filter(c => c !== '')
      // Skip lines that don't have meaningful cells
      if (cells.length < 2) return ''
      return cells.join('  ')
    })
    .filter(l => l !== '')
}

/**
 * Clean up duplicate consecutive lines in content.
 * AI sometimes outputs duplicate lines during streaming.
 */
function removeDuplicateLines(content: string): string {
  const lines = content.split('\n')
  const seen = new Set<string>()
  const result: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    // For empty lines or table separators, always include them
    if (trimmed === '' || isSeparatorLine(trimmed)) {
      result.push(line)
      continue
    }
    // For non-empty lines, skip if we've seen a very similar line recently
    if (!seen.has(trimmed)) {
      seen.add(trimmed)
      result.push(line)
    }
  }

  return result.join('\n')
}

/**
 * Process streaming markdown content.
 * Returns content with incomplete trailing tables softened to plain text.
 *
 * Strategy:
 * 1. Identify the contiguous block of table-like lines at the end.
 * 2. If the entire block is a complete table, leave it alone.
 * 3. Otherwise, find the longest complete prefix (if any) and only soften
 *    the incomplete suffix. This prevents a nearly-finished table from
 *    being entirely flattened just because the last row is still arriving.
 * 4. Also clean up duplicate consecutive lines.
 */
export function processStreamingMarkdown(content: string): string {
  // First, clean up duplicate lines
  const cleaned = removeDuplicateLines(content)
  const lines = cleaned.split('\n')

  // Find the start of a potential table block at the end.
  let tableStart = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (isTableLine(lines[i])) {
      tableStart = i
    } else {
      break
    }
  }

  if (tableStart === -1) return cleaned

  const tableLines = lines.slice(tableStart)
  if (isCompleteTable(tableLines)) return cleaned

  // Find the longest complete prefix so we don't flatten already-complete rows.
  let completePrefixEnd = -1
  for (let i = 3; i <= tableLines.length; i++) {
    if (isCompleteTable(tableLines.slice(0, i))) {
      completePrefixEnd = i
    }
  }

  if (completePrefixEnd === -1) {
    // No complete prefix at all — soften the whole block.
    const softened = softenIncompleteTable(tableLines)
    return [...lines.slice(0, tableStart), ...softened].join('\n')
  }

  if (completePrefixEnd === tableLines.length) {
    // Entire block is complete (shouldn't happen given earlier check, but guard anyway).
    return cleaned
  }

  // Keep the complete prefix as a real table, soften only the trailing incomplete rows.
  const prefix = tableLines.slice(0, completePrefixEnd)
  const suffix = tableLines.slice(completePrefixEnd)
  const softened = softenIncompleteTable(suffix)
  return [...lines.slice(0, tableStart), ...prefix, ...softened].join('\n')
}
