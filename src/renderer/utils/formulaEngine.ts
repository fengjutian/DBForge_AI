// ============================================================
// Formula Engine — self-contained parser / evaluator / dependency tracker
// ============================================================
import type { FormulaEngine as IFormulaEngine, CellAddress, RangeRef } from '@dbforge/shared'

// ── Coordinate helpers ────────────────────────────────────────
export function colToLetter(col: number): string {
  let result = ''
  while (col >= 0) {
    result = String.fromCharCode(65 + (col % 26)) + result
    col = Math.floor(col / 26) - 1
  }
  return result
}

export function letterToCol(letter: string): number {
  let col = 0
  for (let i = 0; i < letter.length; i++) {
    col = col * 26 + (letter.charCodeAt(i) - 64)
  }
  return col - 1
}

const keyRe = /^([A-Z]+)(\d+)$/

export function toKey(col: number, row: number): string {
  return `${colToLetter(col)}${row + 1}`
}

export function fromKey(key: string): CellAddress | null {
  const m = key.match(keyRe)
  if (!m) return null
  return { col: letterToCol(m[1]), row: parseInt(m[2], 10) - 1 }
}

export function parseRange(range: string): RangeRef | null {
  const parts = range.split(':')
  if (parts.length !== 2) return null

  // Full range: A2:A10
  const a = fromKey(parts[0])
  const b = fromKey(parts[1])
  if (a && b) {
    return {
      startCol: Math.min(a.col, b.col),
      startRow: Math.min(a.row, b.row),
      endCol: Math.max(a.col, b.col),
      endRow: Math.max(a.row, b.row),
    }
  }

  // Column-only range: A:B
  const colRe = /^[A-Z]+$/
  if (colRe.test(parts[0]) && colRe.test(parts[1])) {
    const c1 = letterToCol(parts[0])
    const c2 = letterToCol(parts[1])
    return {
      startCol: Math.min(c1, c2),
      startRow: -1, // unlimited
      endCol: Math.max(c1, c2),
      endRow: -1,
    }
  }

  return null
}

export function isFormula(text: string): boolean {
  return typeof text === 'string' && text.trimStart().startsWith('=')
}

// ── Token types ───────────────────────────────────────────────
type TokenKind =
  | 'NUMBER' | 'STRING' | 'IDENT'   // literals
  | 'CELL' | 'RANGE' | 'COLREF'     // references
  | 'EQ' | 'NE' | 'LT' | 'LE' | 'GT' | 'GE'
  | 'PLUS' | 'MINUS' | 'STAR' | 'SLASH' | 'CARET' | 'AMP'
  | 'LPAREN' | 'RPAREN' | 'COMMA'
  | 'PCT'                            // %

interface Token {
  kind: TokenKind
  value: string
  pos: number
}

// ── AST node types ────────────────────────────────────────────
type AstNode =
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'cell'; col: number; row: number; key: string }
  | { type: 'range'; ref: RangeRef }
  | { type: 'colref'; name: string }
  | { type: 'binary'; op: string; left: AstNode; right: AstNode }
  | { type: 'unary'; op: string; operand: AstNode }
  | { type: 'call'; name: string; args: AstNode[] }
  | { type: 'pct'; operand: AstNode }  // percentage: A1%

// ── Lexer ─────────────────────────────────────────────────────
function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  const peek = (): string => i < input.length ? input[i] : ''
  const advance = (): string => input[i++]
  const skip = () => { i++ }

  while (i < input.length) {
    const ch = input[i]

    // Whitespace
    if (/\s/.test(ch)) { skip(); continue }

    // Numbers (including decimals)
    if (/\d/.test(ch) || (ch === '.' && i + 1 < input.length && /\d/.test(input[i + 1]))) {
      let num = ''
      while (i < input.length && /[\d.]/.test(input[i])) num += input[i++]
      tokens.push({ kind: 'NUMBER', value: num, pos: i - num.length })
      continue
    }

    // Strings (single or double quoted)
    if (ch === '"' || ch === "'") {
      const quote = ch; skip()
      let str = ''
      while (i < input.length && input[i] !== quote) {
        if (input[i] === '\\') { skip(); if (i < input.length) str += input[i++] }
        else { str += input[i++] }
      }
      if (i < input.length) skip() // closing quote
      tokens.push({ kind: 'STRING', value: str, pos: i - str.length - 2 })
      continue
    }

    // Operators
    if (ch === '=') {
      if (input[i + 1] === '=') { tokens.push({ kind: 'EQ', value: '==', pos: i }); i += 2; continue }
      else { tokens.push({ kind: 'EQ', value: '=', pos: i }); skip(); continue }
    }
    if (ch === '!' && input[i + 1] === '=')  { tokens.push({ kind: 'NE', value: '<>', pos: i }); i += 2; continue }
    if (ch === '<') {
      if (input[i + 1] === '=') { tokens.push({ kind: 'LE', value: '<=', pos: i }); i += 2; continue }
      if (input[i + 1] === '>') { tokens.push({ kind: 'NE', value: '<>', pos: i }); i += 2; continue }
      tokens.push({ kind: 'LT', value: '<', pos: i }); skip(); continue
    }
    if (ch === '>') {
      if (input[i + 1] === '=') { tokens.push({ kind: 'GE', value: '>=', pos: i }); i += 2; continue }
      tokens.push({ kind: 'GT', value: '>', pos: i }); skip(); continue
    }
    if (ch === '+') { tokens.push({ kind: 'PLUS', value: '+', pos: i }); skip(); continue }
    if (ch === '-') { tokens.push({ kind: 'MINUS', value: '-', pos: i }); skip(); continue }
    if (ch === '*') { tokens.push({ kind: 'STAR', value: '*', pos: i }); skip(); continue }
    if (ch === '/') { tokens.push({ kind: 'SLASH', value: '/', pos: i }); skip(); continue }
    if (ch === '^') { tokens.push({ kind: 'CARET', value: '^', pos: i }); skip(); continue }
    if (ch === '&') { tokens.push({ kind: 'AMP', value: '&', pos: i }); skip(); continue }
    if (ch === '%') { tokens.push({ kind: 'PCT', value: '%', pos: i }); skip(); continue }
    if (ch === '(') { tokens.push({ kind: 'LPAREN', value: '(', pos: i }); skip(); continue }
    if (ch === ')') { tokens.push({ kind: 'RPAREN', value: ')', pos: i }); skip(); continue }
    if (ch === ',') { tokens.push({ kind: 'COMMA', value: ',', pos: i }); skip(); continue }

    // Column name reference: [column_name]
    if (ch === '[') {
      skip()
      let name = ''
      while (i < input.length && input[i] !== ']' && input[i] !== '\n') name += input[i++]
      if (i < input.length && input[i] === ']') skip()
      tokens.push({ kind: 'COLREF', value: name.trim(), pos: i - name.length - 2 })
      continue
    }

    // Identifiers (function names) or cell references
    if (/[A-Za-z\u4e00-\u9fff_]/.test(ch)) {
      let ident = ''
      while (i < input.length && /[A-Za-z0-9_.\u4e00-\u9fff]/.test(input[i])) ident += input[i++]

      // Check if it's a cell reference: letters followed by digits
      const cellRe = /^([A-Z]+)(\d+)$/i
      const cellM = ident.match(cellRe)
      if (cellM) {
        tokens.push({
          kind: 'CELL',
          value: ident.toUpperCase(),
          pos: i - ident.length,
        })
        // Peek for range
        const colRe2 = /^[A-Z]+$/i
        if (i < input.length && input[i] === ':') {
          skip()
          let next = ''
          while (i < input.length && /[A-Za-z0-9]/.test(input[i])) next += input[i++]
          const nextM = next.match(/^([A-Z]+)(\d+)$/i)
          const colRe2 = /^[A-Z]+$/i
          if (nextM) {
            // Previous token was a CELL, replace it with a RANGE
            tokens.pop()
            const start = fromKey(ident.toUpperCase())
            const end = fromKey(next.toUpperCase())
            if (start && end) {
              tokens.push({ kind: 'RANGE', value: `${ident.toUpperCase()}:${next.toUpperCase()}`, pos: 0 })
            }
          } else if (colRe2.test(next)) {
            // Column range A:B
            tokens.pop()
            tokens.push({ kind: 'RANGE', value: `${ident.toUpperCase()}:${next.toUpperCase()}`, pos: 0 })
          } else {
            // Invalid range, push as separate tokens
            tokens.push({ kind: 'CELL', value: next.toUpperCase(), pos: i - next.length })
          }
        }
        // Peek for column-only range A:
        else if (colRe2.test(ident) && i < input.length && input[i] === ':') {
          // Convert CELL to RANGE
          tokens.pop()
          skip() // skip :
          let next = ''
          while (i < input.length && /[A-Za-z0-9]/.test(input[i])) next += input[i++]
          if (colRe2.test(next)) {
            tokens.push({
              kind: 'RANGE',
              value: `${ident.toUpperCase()}:${next.toUpperCase()}`,
              pos: 0,
            })
          } else if (/^\d+$/.test(next)) {
            tokens.push({
              kind: 'RANGE',
              value: `${ident.toUpperCase()}1:${ident.toUpperCase()}${next}`,
              pos: 0,
            })
          } else {
            // fallback
            tokens.push({ kind: 'IDENT', value: ident, pos: 0 })
          }
        }
        continue
      }

      // Peek for function call
      if (i < input.length && input[i] === '(') {
        tokens.push({ kind: 'IDENT', value: ident.toUpperCase(), pos: i - ident.length })
        continue
      }

      tokens.push({ kind: 'IDENT', value: ident, pos: i - ident.length })
      continue
    }

    // Unknown character, skip
    skip()
  }

  return tokens
}

// ── Parser (recursive descent) ────────────────────────────────
class FormulaParser {
  private tokens: Token[]
  private pos: number
  public dependencies: string[] = []

  constructor(tokens: Token[]) {
    this.tokens = tokens
    this.pos = 0
  }

  private peek(): Token | null { return this.pos < this.tokens.length ? this.tokens[this.pos] : null }
  private advance(): Token | null { return this.pos < this.tokens.length ? this.tokens[this.pos++] : null }
  private expect(kind: TokenKind): Token {
    const t = this.advance()
    if (!t || t.kind !== kind) throw new Error(`Expected ${kind} but got ${t?.kind ?? 'EOF'}`)
    return t
  }

  // expression = comparison (("="|"<>"|">"|"<"|">="|"<=") comparison)*
  parseExpression(): AstNode {
    let left = this.parseComparison()
    while (this.peek() && ['EQ', 'NE', 'LT', 'LE', 'GT', 'GE'].includes(this.peek()!.kind)) {
      const op = this.advance()!.value
      const right = this.parseComparison()
      left = { type: 'binary', op, left, right }
    }
    return left
  }

  // comparison = term (("+"|"-"|"&") term)*
  parseComparison(): AstNode {
    let left = this.parseTerm()
    while (this.peek() && ['PLUS', 'MINUS', 'AMP'].includes(this.peek()!.kind)) {
      const op = this.advance()!.value
      const right = this.parseTerm()
      left = { type: 'binary', op, left, right }
    }
    return left
  }

  // term = factor (("*"|"/") factor)*
  parseTerm(): AstNode {
    let left = this.parsePower()
    while (this.peek() && ['STAR', 'SLASH'].includes(this.peek()!.kind)) {
      const op = this.advance()!.value
      const right = this.parsePower()
      left = { type: 'binary', op, left, right }
    }
    return left
  }

  // power = unary ("^" factor)?
  parsePower(): AstNode {
    let left = this.parseUnary()
    if (this.peek()?.kind === 'CARET') {
      this.advance()
      const right = this.parseUnary()
      left = { type: 'binary', op: '^', left, right }
    }
    return left
  }

  // unary = ("+"|"-") unary | percent
  parseUnary(): AstNode {
    if (this.peek() && (this.peek()!.kind === 'MINUS' || this.peek()!.kind === 'PLUS')) {
      const op = this.advance()!.value
      const operand = this.parseUnary()
      return { type: 'unary', op, operand }
    }
    return this.parsePercent()
  }

  // percent = atom ("%")*
  parsePercent(): AstNode {
    let node = this.parseAtom()
    while (this.peek()?.kind === 'PCT') {
      this.advance()
      node = { type: 'pct', operand: node }
    }
    return node
  }

  // atom = NUMBER | STRING | CELL | RANGE | COLREF | functionCall | "(" expression ")"
  parseAtom(): AstNode {
    const t = this.peek()
    if (!t) throw new Error('Unexpected end of formula')

    switch (t.kind) {
      case 'NUMBER': {
        this.advance()
        return { type: 'number', value: parseFloat(t.value) }
      }
      case 'STRING': {
        this.advance()
        return { type: 'string', value: t.value }
      }
      case 'CELL': {
        this.advance()
        const addr = fromKey(t.value)
        if (!addr) throw new Error(`Invalid cell reference: ${t.value}`)
        const key = toKey(addr.col, addr.row)
        this.dependencies.push(key)
        return { type: 'cell', col: addr.col, row: addr.row, key }
      }
      case 'RANGE': {
        this.advance()
        const ref = parseRange(t.value)
        if (!ref) throw new Error(`Invalid range: ${t.value}`)
        return { type: 'range', ref }
      }
      case 'COLREF': {
        this.advance()
        this.dependencies.push(`[${t.value}]`)
        return { type: 'colref', name: t.value }
      }
      case 'IDENT': {
        this.advance()
        // Function call
        if (this.peek()?.kind === 'LPAREN') {
          this.advance() // '('
          const args: AstNode[] = []
          if (this.peek()?.kind !== 'RPAREN') {
            args.push(this.parseExpression())
            while (this.peek()?.kind === 'COMMA') {
              this.advance()
              args.push(this.parseExpression())
            }
          }
          this.expect('RPAREN')
          // Collect dependencies from args
          for (const arg of args) {
            this.collectDepsFromNode(arg)
          }
          return { type: 'call', name: t.value, args }
        }
        throw new Error(`Unexpected identifier: ${t.value}`)
      }
      case 'LPAREN': {
        this.advance()
        const node = this.parseExpression()
        this.expect('RPAREN')
        return node
      }
      default:
        throw new Error(`Unexpected token: ${t.kind} (${t.value})`)
    }
  }

  private collectDepsFromNode(node: AstNode): void {
    switch (node.type) {
      case 'cell':
        this.dependencies.push(node.key)
        break
      case 'colref':
        this.dependencies.push(`[${node.name}]`)
        break
      case 'call':
        for (const arg of node.args) this.collectDepsFromNode(arg)
        break
      case 'binary':
        this.collectDepsFromNode(node.left)
        this.collectDepsFromNode(node.right)
        break
      case 'unary':
        this.collectDepsFromNode(node.operand)
        break
      case 'pct':
        this.collectDepsFromNode(node.operand)
        break
    }
  }
}

// ── Evaluator ─────────────────────────────────────────────────

export interface CellGetter {
  /** Get a single cell value by key "A1" */
  cell(key: string): unknown
  /** Get a column value for a given row index (for colref like [amount]) */
  colRef(colName: string, rowIndex: number): unknown
  /** Get all rows data (for range aggregation) */
  allRows(): Record<string, unknown>[]
  /** Current row index (for colref evaluation) */
  currentRow: number
}

function isNumeric(v: unknown): v is number {
  if (typeof v === 'number') return true
  if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return true
  if (typeof v === 'bigint') return true
  return false
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'string') { const n = Number(v); return isNaN(n) ? 0 : n }
  if (typeof v === 'boolean') return v ? 1 : 0
  return 0
}

function toString(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function compare(a: unknown, b: unknown): number {
  // Try numeric comparison first
  if (isNumeric(a) && isNumeric(b)) return toNumber(a) - toNumber(b)
  return toString(a).localeCompare(toString(b))
}

function isTruthy(v: unknown): boolean {
  if (v === null || v === undefined || v === false) return false
  if (v === 0 || v === '') return false
  if (typeof v === 'string' && v.toUpperCase() === 'FALSE') return false
  return true
}

export function evaluateAst(node: AstNode, getter: CellGetter): unknown {
  switch (node.type) {
    case 'number':
      return node.value
    case 'string':
      return node.value
    case 'cell':
      return getter.cell(node.key)
    case 'colref':
      return getter.colRef(node.name, getter.currentRow)
    case 'range': {
      // Ranges are only valid inside function calls (e.g. SUM(A1:A10))
      // If encountered standalone, return an error
      return '#VALUE!'
    }
    case 'unary': {
      const v = evaluateAst(node.operand, getter)
      if (node.op === '-') return -toNumber(v)
      return toNumber(v)
    }
    case 'pct': {
      const v = evaluateAst(node.operand, getter)
      return toNumber(v) / 100
    }
    case 'binary': {
      const left = evaluateAst(node.left, getter)
      const right = evaluateAst(node.right, getter)
      switch (node.op) {
        case '+': return toNumber(left) + toNumber(right)
        case '-': return toNumber(left) - toNumber(right)
        case '*': return toNumber(left) * toNumber(right)
        case '/': {
          const r = toNumber(right)
          if (r === 0) return '#DIV/0!'
          return toNumber(left) / r
        }
        case '^': return Math.pow(toNumber(left), toNumber(right))
        case '&': return toString(left) + toString(right)
        case '=':
        case '==': return compare(left, right) === 0
        case '<>': return compare(left, right) !== 0
        case '<': return compare(left, right) < 0
        case '<=': return compare(left, right) <= 0
        case '>': return compare(left, right) > 0
        case '>=': return compare(left, right) >= 0
        default: return '#VALUE!'
      }
    }
    case 'call': {
      const args = node.args.map(a => evaluateAst(a, getter))
      // The last arg might be a range node — handle specially for aggregation functions
      return evaluateFunction(node.name, args, node.args, getter)
    }
    default:
      return '#VALUE!'
  }
}

function evaluateFunction(
  name: string,
  args: unknown[],
  rawNodes: AstNode[],
  getter: CellGetter,
): unknown {
  // Check if any argument is a range node — expand it
  const resolveArgs = (): unknown[] => {
    return rawNodes.map((n, i) => {
      if (n.type === 'range') {
        return resolveRange(n.ref, getter)
      }
      return args[i]
    })
  }

  switch (name) {
    // ── Math ──
    case 'SUM': {
      const values = resolveArgs().flat()
      return values.reduce((acc: number, v) => acc + toNumber(v), 0)
    }
    case 'AVG':
    case 'AVERAGE': {
      const values = resolveArgs().flat().filter(v => isNumeric(v))
      if (values.length === 0) return '#DIV/0!'
      return values.reduce((acc: number, v) => acc + toNumber(v), 0) / values.length
    }
    case 'COUNT': {
      const values = resolveArgs().flat()
      return values.filter(v => v !== null && v !== undefined && v !== '').length
    }
    case 'COUNTA': {
      const values = resolveArgs().flat()
      return values.filter(v => v !== null && v !== undefined).length
    }
    case 'MAX': {
      const values = resolveArgs().flat().filter(v => isNumeric(v))
      if (values.length === 0) return 0
      return Math.max(...values.map(toNumber))
    }
    case 'MIN': {
      const values = resolveArgs().flat().filter(v => isNumeric(v))
      if (values.length === 0) return 0
      return Math.min(...values.map(toNumber))
    }
    case 'ABS':
      return Math.abs(toNumber(args[0]))
    case 'ROUND': {
      const decimals = args.length > 1 ? toNumber(args[1]) : 0
      const factor = Math.pow(10, decimals)
      return Math.round(toNumber(args[0]) * factor) / factor
    }
    case 'ROUNDUP':
      return Math.ceil(toNumber(args[0]))
    case 'ROUNDDOWN':
      return Math.floor(toNumber(args[0]))
    case 'CEIL':
    case 'CEILING':
      return Math.ceil(toNumber(args[0]))
    case 'FLOOR':
      return Math.floor(toNumber(args[0]))
    case 'POWER':
      return Math.pow(toNumber(args[0]), toNumber(args[1]))
    case 'SQRT':
      return Math.sqrt(toNumber(args[0]))
    case 'MOD':
      return toNumber(args[0]) % toNumber(args[1])

    // ── Logic ──
    case 'IF': {
      if (args.length < 2) return '#VALUE!'
      const cond = args[0]
      return isTruthy(cond) ? args[1] : (args.length > 2 ? args[2] : false)
    }
    case 'AND': {
      if (args.length === 0) return true
      return args.every(isTruthy)
    }
    case 'OR': {
      if (args.length === 0) return false
      return args.some(isTruthy)
    }
    case 'NOT':
      return !isTruthy(args[0])
    case 'IFERROR': {
      if (args.length < 2) return '#VALUE!'
      const v = args[0]
      if (typeof v === 'string' && v.startsWith('#')) return args[1]
      return v
    }
    case 'IFNULL':
    case 'IFNA': {
      if (args.length < 2) return '#VALUE!'
      const v = args[0]
      if (v === null || v === undefined || (typeof v === 'string' && v === '#N/A'))
        return args[1]
      return v
    }

    // ── Text ──
    case 'CONCAT':
    case 'CONCATENATE':
      return resolveArgs().flat().map(toString).join('')
    case 'LEFT': {
      const count = args.length > 1 ? toNumber(args[1]) : 1
      return toString(args[0]).slice(0, Math.max(0, count))
    }
    case 'RIGHT': {
      const count = args.length > 1 ? toNumber(args[1]) : 1
      const s = toString(args[0])
      return s.slice(Math.max(0, s.length - count))
    }
    case 'MID': {
      const s = toString(args[0])
      const start = Math.max(1, toNumber(args[1])) - 1
      const len = args.length > 2 ? toNumber(args[2]) : s.length
      return s.slice(start, start + len)
    }
    case 'LEN':
      return toString(args[0]).length
    case 'TRIM':
      return toString(args[0]).trim()
    case 'UPPER':
      return toString(args[0]).toUpperCase()
    case 'LOWER':
      return toString(args[0]).toLowerCase()
    case 'REPLACE': {
      const s = toString(args[0])
      const start = Math.max(1, toNumber(args[1])) - 1
      const len = toNumber(args[2])
      const replacement = toString(args[3])
      return s.slice(0, start) + replacement + s.slice(start + len)
    }
    case 'TEXT': {
      const val = args[0]
      // Simple number formatting: just convert to string
      return toString(val)
    }

    // ── Info ──
    case 'ISNULL':
    case 'ISBLANK':
      return args[0] === null || args[0] === undefined || args[0] === ''
    case 'ISNUMBER':
      return isNumeric(args[0])
    case 'ISTEXT':
      return typeof args[0] === 'string'
    case 'TYPE': {
      const v = args[0]
      if (v === null || v === undefined) return 1  // empty
      if (typeof v === 'number') return 1
      if (typeof v === 'string') return 2
      return 64  // array/other
    }

    default:
      return `#NAME?`
  }
}

function resolveRange(ref: RangeRef, getter: CellGetter): unknown[] {
  const rows = getter.allRows()
  const results: unknown[] = []
  const endRow = ref.endRow >= 0 ? Math.min(ref.endRow + 1, rows.length) : rows.length
  for (let r = Math.max(0, ref.startRow); r < endRow; r++) {
    for (let c = ref.startCol; c <= ref.endCol; c++) {
      const key = toKey(c, r)
      results.push(getter.cell(key))
    }
  }
  return results
}

// ── Public API ────────────────────────────────────────────────

interface ParseResult {
  ast: AstNode
  dependencies: string[]
  evaluate: (getter: CellGetter) => unknown
}

/**
 * Parse a formula expression (with or without leading =).
 * Returns an AST, a list of cell/column dependencies, and an evaluate function.
 */
export function parseFormula(expression: string): ParseResult {
  let expr = expression.trimStart()
  if (expr.startsWith('=')) expr = expr.slice(1)

  const tokens = tokenize(expr)
  const parser = new FormulaParser(tokens)
  const ast = parser.parseExpression()

  // Check for leftover tokens
  if (parser['pos'] < tokens.length) {
    throw new Error(`Unexpected token at position ${parser['pos']}: ${tokens[parser['pos']]?.value}`)
  }

  return {
    ast,
    dependencies: [...new Set(parser.dependencies)],
    evaluate: (getter: CellGetter) => evaluateAst(ast, getter),
  }
}

// ── Dependency Graph ───────────────────────────────────────────

/**
 * A directed graph tracking "who depends on whom".
 * Keys are cell keys (e.g. "A2"). If A2 is in dependents["B3"], then B3 depends on A2.
 */
export class DependencyGraph {
  // cellKey -> set of cellKeys that depend on it
  private dependents = new Map<string, Set<string>>()
  // cellKey -> set of cellKeys it depends on
  private dependencies = new Map<string, Set<string>>()

  /** Register that `cell` depends on `deps` */
  set(cell: string, deps: string[]): void {
    // Clear old dependencies for this cell
    const oldDeps = this.dependencies.get(cell)
    if (oldDeps) {
      for (const d of oldDeps) {
        this.dependents.get(d)?.delete(cell)
      }
    }

    this.dependencies.set(cell, new Set(deps))
    for (const d of deps) {
      let set = this.dependents.get(d)
      if (!set) { set = new Set(); this.dependents.set(d, set) }
      set.add(cell)
    }
  }

  /** Remove a cell from the graph */
  remove(cell: string): void {
    const deps = this.dependencies.get(cell)
    if (deps) {
      for (const d of deps) {
        this.dependents.get(d)?.delete(cell)
      }
      this.dependencies.delete(cell)
    }
    // Also remove from dependents of others
    for (const [k, set] of this.dependents) {
      set.delete(cell)
      if (set.size === 0) this.dependents.delete(k)
    }
  }

  /** Get all cells that directly depend on `cell` */
  getDependents(cell: string): string[] {
    return [...(this.dependents.get(cell) ?? [])]
  }

  /** Get all cells that `cell` depends on */
  getDependencies(cell: string): string[] {
    return [...(this.dependencies.get(cell) ?? [])]
  }

  /**
   * Get the full transitive closure of cells that need recalculation
   * when `changed` cells are modified. Returns cells in topological order.
   */
  getRecalcOrder(changed: string[]): string[] {
    const visited = new Set<string>()
    const result: string[] = []

    const visit = (cell: string) => {
      if (visited.has(cell)) return
      visited.add(cell)
      for (const dep of this.getDependents(cell)) {
        visit(dep)
      }
      if (!changed.includes(cell)) {
        result.push(cell)
      }
    }

    for (const c of changed) visit(c)
    return result
  }

  /** Clear all data */
  clear(): void {
    this.dependents.clear()
    this.dependencies.clear()
  }

  /** Number of cells tracked */
  get size(): number {
    return this.dependencies.size
  }
}

// ── Singleton engine for convenience ───────────────────────────
export const formulaEngine: IFormulaEngine = {
  parse(expr: string) {
    const parsed = parseFormula(expr)
    return {
      dependencies: parsed.dependencies,
      evaluate: (cellGetter) => parsed.evaluate(cellGetter as unknown as CellGetter),
    }
  },
  colToLetter,
  letterToCol,
  toKey,
  fromKey,
  parseRange,
  isFormula,
}
