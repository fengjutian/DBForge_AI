/**
 * Preprocess streaming markdown content to handle incomplete blocks gracefully.
 */

function isSeparatorLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed.includes('---')) return false
  const rest = trimmed.replace(/\|/g, '').trim()
  return /^[\s:-]+$/.test(rest)
}

function isValidTableRow(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|')) return false

  const cells = trimmed.split('|').filter(c => c.trim() !== '')
  if (cells.length < 1) return false

  if (/^\|\s*:?\s*-+\s*\|/.test(trimmed)) return false

  const pipeCount = (trimmed.match(/\|/g) || []).length
  const contentLength = trimmed.replace(/\|/g, '').trim().length
  if (contentLength < pipeCount) return false

  return true
}

function isHeaderRow(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|')) return false

  const cells = trimmed.split('|').filter(c => c.trim() !== '')
  if (cells.length < 2) return false

  for (const cell of cells) {
    const clean = cell.trim()
    if (clean.length < 1) return false
    if (/^:?\s*-+\s*:?$/.test(clean)) return false
  }

  return true
}

function isCompleteTable(lines: string[]): boolean {
  const nonEmpty = lines.filter(l => l.trim() !== '')
  if (nonEmpty.length < 3) return false

  if (!isHeaderRow(nonEmpty[0])) return false

  let sepIndex = -1
  for (let i = 1; i < nonEmpty.length; i++) {
    if (isSeparatorLine(nonEmpty[i])) {
      sepIndex = i
      break
    }
  }

  if (sepIndex <= 0 || sepIndex >= nonEmpty.length - 1) return false

  for (let i = sepIndex + 1; i < nonEmpty.length; i++) {
    if (!isValidTableRow(nonEmpty[i])) return false
  }

  return true
}

function removeDuplicateLines(content: string): string {
  const lines = content.split('\n')
  const seen = new Set<string>()
  const result: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed === '' || isSeparatorLine(trimmed)) {
      result.push(line)
      continue
    }

    if (!seen.has(trimmed)) {
      seen.add(trimmed)
      result.push(line)
    }
  }

  return result.join('\n')
}

function fixIncompleteMarkdown(content: string): string {
  let result = content

  result = result.replace(/^(#{1,6})\s*$/gm, '')

  result = result.replace(/\|(\s*\|)+/g, '|')

  result = result.replace(/<br\s*\/?>/gi, '\n')
  result = result.replace(/<\/?(div|span|p)[^>]*>/gi, '')
  result = result.replace(/<[^>]+>/g, '')

  result = result.replace(/^(\s*)-{3,}(\s*)$/gm, '|---|')

  result = result.replace(/\[([^\]]*)\n([^\]]*)\]/g, '[$1$2]')

  result = result.replace(/`{3}\s*$/gm, '```')

  result = result.replace(/\|(\s*[|:]-+)\s*/g, '| ')

  result = result.replace(/\n{3,}/g, '\n\n')

  return result
}

function extractTextFromCorruptedLine(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|')) return null

  const cells = trimmed.split('|').map(c => c.trim()).filter(c => c !== '')

  if (cells.length === 0) return null

  const text = cells.join(' ')

  if (text.length < 3) return null

  return text
}

export function processStreamingMarkdown(content: string): string {
  let cleaned = fixIncompleteMarkdown(content)
  cleaned = removeDuplicateLines(cleaned)

  const lines = cleaned.split('\n')
  const result: string[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed === '' || isSeparatorLine(trimmed)) {
      result.push(line)
      i++
      continue
    }

    if (trimmed.startsWith('|')) {
      const tableLines: string[] = []
      let j = i

      while (j < lines.length) {
        const l = lines[j]
        const t = l.trim()

        if (t === '' || isSeparatorLine(t) || t.startsWith('|')) {
          tableLines.push(l)
          j++
        } else {
          break
        }
      }

      const nonEmpty = tableLines.filter(l => l.trim() !== '')

      if (nonEmpty.length >= 3 && isCompleteTable(nonEmpty)) {
        for (const tl of tableLines) {
          result.push(tl)
        }
      } else {
        let hasCompletePart = false
        let completeEnd = -1

        for (let k = 2; k <= nonEmpty.length; k++) {
          if (isCompleteTable(nonEmpty.slice(0, k))) {
            hasCompletePart = true
            completeEnd = k
          }
        }

        if (hasCompletePart && completeEnd > 0) {
          for (let k = 0; k < tableLines.length; k++) {
            const tl = tableLines[k]
            const tlt = tl.trim()

            if (tlt === '') {
              result.push(tl)
              continue
            }

            if (k < completeEnd) {
              result.push(tl)
            } else {
              const extracted = extractTextFromCorruptedLine(tlt)
              if (extracted) {
                result.push(extracted)
              }
            }
          }
        } else {
          for (const tl of tableLines) {
            const tlt = tl.trim()
            if (tlt === '' || isSeparatorLine(tlt)) {
              result.push(tl)
            } else {
              const extracted = extractTextFromCorruptedLine(tlt)
              if (extracted) {
                result.push(extracted)
              }
            }
          }
        }
      }

      i = j
      continue
    }

    result.push(line)
    i++
  }

  return result.join('\n')
}