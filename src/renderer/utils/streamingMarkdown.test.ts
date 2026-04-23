import { describe, it, expect } from 'vitest'
import { processStreamingMarkdown } from './streamingMarkdown'

describe('processStreamingMarkdown', () => {
  it('returns non-table content unchanged', () => {
    const content = '# Heading\n\nSome paragraph with | pipe chars | inline.'
    expect(processStreamingMarkdown(content)).toBe(content)
  })

  it('softens an incomplete table with only header row', () => {
    const content = 'Analysis results:\n\n| Column | Type |'
    const result = processStreamingMarkdown(content)
    expect(result).not.toContain('|')
    expect(result).toBe('Analysis results:\n\nColumn  Type')
  })

  it('softens an incomplete table with header + separator but no data', () => {
    const content = '## Table\n\n| Name | Value |\n| --- | --- |'
    const result = processStreamingMarkdown(content)
    expect(result).not.toContain('|---')
    expect(result).toBe('## Table\n\nName  Value')
  })

  it('leaves a complete table untouched', () => {
    const content = '| Name | Value |\n| --- | --- |\n| foo | bar |'
    expect(processStreamingMarkdown(content)).toBe(content)
  })

  it('softens only the trailing incomplete table, leaving earlier complete tables intact', () => {
    const content =
      '| A | B |\n| --- | --- |\n| 1 | 2 |\n\nNext table:\n\n| X | Y |\n| --- |'
    const result = processStreamingMarkdown(content)
    // First table should stay intact
    expect(result).toContain('| A | B |')
    expect(result).toContain('| 1 | 2 |')
    // Second incomplete table should be softened
    expect(result).not.toContain('| X | Y |')
    expect(result).toContain('X  Y')
  })

  it('handles streaming chunks where table rows are still arriving', () => {
    const content = '| Field | Type | Meaning |\n| :--- | :--- | :--- |\n| id | INT | primary key |\n| name'
    const result = processStreamingMarkdown(content)
    // Complete prefix stays as a real table, only the trailing incomplete row is softened
    expect(result).toContain('| Field | Type | Meaning |')
    expect(result).toContain('| id | INT | primary key |')
    expect(result).toContain('name')
    expect(result).not.toContain('| name')
  })

  it('ignores plain text lines that happen to contain |', () => {
    const content = 'The cost is $5 | $10 depending on region.'
    expect(processStreamingMarkdown(content)).toBe(content)
  })
})
