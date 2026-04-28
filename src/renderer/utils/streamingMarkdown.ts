/**
 * Robust streaming markdown processor.
 * Handles broken tables by detecting content truncation and removing incomplete rows.
 */

import { repairTable } from 'markdown-table-repair'

function cleanHtml(content: string): string {
  return content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(div|span|p)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
}

function removeDuplicates(content: string): string {
  const lines = content.split('\n')
  const seen = new Set<string>()
  const result: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '') {
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

function isCompleteTableRow(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|')) return false

  const cells = trimmed.split('|').filter(c => c.trim() !== '')
  if (cells.length < 2) return false

  const text = cells.join('')
  if (text.length < 3) return false

  const pipes = (trimmed.match(/\|/g) || []).length
  if (pipes > cells.length * 5) return false

  return true
}

function hasIncompleteTablePattern(content: string): boolean {
  const lines = content.split('\n')
  let tableLineCount = 0
  let brokenLineCount = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('|')) {
      tableLineCount++
      if (!isCompleteTableRow(trimmed)) {
        brokenLineCount++
      }
    }
  }

  return brokenLineCount > tableLineCount * 0.3
}

function extractCompleteRows(content: string): string {
  const lines = content.split('\n')
  const result: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '') {
      result.push(line)
      continue
    }
    if (trimmed.startsWith('|') && isCompleteTableRow(trimmed)) {
      result.push(trimmed)
    } else if (trimmed.startsWith('#') || trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.startsWith('```')) {
      result.push(line)
    }
  }

  return result.join('\n')
}

function cleanMarkdown(content: string): string {
  return content
    .replace(/\|(\s*\|)+/g, '|')
    .replace(/\[([^\]]*)\n([^\]]*)\]/g, '[$1$2]')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^(#{1,6})\s*$/gm, '')
}

export function processStreamingMarkdown(content: string): string {
  let result = cleanHtml(content)
  result = removeDuplicates(result)

  if (hasIncompleteTablePattern(result)) {
    result = extractCompleteRows(result)
  } else {
    result = repairTable(result)
  }

  result = cleanMarkdown(result)
  return result
}