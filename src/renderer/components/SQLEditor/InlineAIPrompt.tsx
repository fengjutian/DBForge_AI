/**
 * Inline AI Prompt — slash-command ContentWidget for Monaco Editor.
 *
 * Flow:
 *   idle → user types "/" at line start → "prompting" widget appears
 *   → user types description → Enter → "loading" (streaming feedback)
 *   → AI returns SQL → replaces "/..." with generated SQL + preview decoration
 *   → Tab accepts (clears decoration)  /  Esc reverts to original text.
 *
 * Exported as a plain function `setupInlineAIPrompt` to be called inside
 * SQLEditor's onMount callback.
 */

import type { editor as MonacoEditor, IDisposable, IRange } from 'monaco-editor'
import type * as Monaco from 'monaco-editor'
import type { DatabaseSchema } from '../../../shared/types'

// ── State machine ─────────────────────────────────────────────
type Phase =
  | 'idle'        // waiting for "/" trigger
  | 'prompting'   // widget visible, user typing description
  | 'loading'     // AI call in-flight, streaming feedback shown
  | 'preview'     // SQL inserted with decoration; waiting for Tab/Esc

// ── Configuration ─────────────────────────────────────────────
const WIDGET_ID_PREFIX = 'inline-ai-prompt-widget'
const DECORATION_CLASS = 'inline-ai-preview-sql'
const DANGER_DECORATION_CLASS = 'inline-ai-preview-sql-danger'

// ── CSS injection (once) ──────────────────────────────────────
let cssInjected = false
function injectStyles(): void {
  if (cssInjected) return
  cssInjected = true
  const style = document.createElement('style')
  style.textContent = `
    /* ── Slash Prompt Widget ─────────────────────────────── */
    .slash-prompt-widget {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
                   'Microsoft YaHei', 'PingFang SC', sans-serif;
      z-index: 1000;
      animation: slash-fade-in 0.15s ease-out;
    }
    @keyframes slash-fade-in {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* ── Prompt container ────────────────────────────────── */
    .slash-prompt-container {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 8px 12px;
      min-width: 340px;
      max-width: 540px;
      border-radius: 10px;
      border: 1px solid hsl(152, 30%, 85%);
      background: hsl(0, 0%, 100%);
      box-shadow:
        0 4px 16px rgba(0,0,0,0.08),
        0 0 0 1px rgba(0,0,0,0.03);
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .slash-prompt-container:focus-within {
      border-color: hsl(152, 55%, 45%);
      box-shadow:
        0 4px 20px rgba(0,0,0,0.10),
        0 0 0 3px hsla(152, 55%, 45%, 0.12);
    }

    .dark .slash-prompt-container {
      border-color: hsl(155, 20%, 20%);
      background: hsl(155, 20%, 10%);
      box-shadow:
        0 4px 24px rgba(0,0,0,0.5),
        0 0 0 1px rgba(255,255,255,0.04);
    }
    .dark .slash-prompt-container:focus-within {
      border-color: hsl(152, 55%, 50%);
      box-shadow:
        0 4px 28px rgba(0,0,0,0.6),
        0 0 0 3px hsla(152, 55%, 50%, 0.15);
    }

    /* ── Slash icon badge ────────────────────────────────── */
    .slash-prompt-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border-radius: 5px;
      background: hsl(152, 55%, 40%);
      color: #fff;
      font-weight: 700;
      font-size: 13px;
      line-height: 1;
      flex-shrink: 0;
      margin-top: 1px;
      user-select: none;
    }
    .dark .slash-prompt-icon {
      background: hsl(152, 55%, 50%);
      color: hsl(152, 50%, 5%);
    }

    /* ── Textarea input ──────────────────────────────────── */
    .slash-prompt-input {
      flex: 1;
      border: none;
      outline: none;
      background: transparent;
      color: hsl(152, 50%, 10%);
      font-size: 13px;
      line-height: 22px;
      resize: none;
      min-height: 22px;
      max-height: 88px;
      font-family: inherit;
      caret-color: hsl(152, 55%, 40%);
    }
    .slash-prompt-input::placeholder {
      color: hsl(152, 5%, 55%);
    }
    .dark .slash-prompt-input {
      color: hsl(150, 20%, 90%);
      caret-color: hsl(152, 55%, 50%);
    }
    .dark .slash-prompt-input::placeholder {
      color: hsl(152, 8%, 45%);
    }

    /* ── Hint (keycap style) ─────────────────────────────── */
    .slash-prompt-hint {
      display: flex;
      align-items: center;
      gap: 3px;
      padding: 1px 6px;
      border-radius: 4px;
      background: hsl(152, 20%, 94%);
      color: hsl(152, 5%, 45%);
      font-size: 10px;
      font-weight: 500;
      line-height: 18px;
      white-space: nowrap;
      user-select: none;
      margin-top: 2px;
      font-family: inherit;
      letter-spacing: 0.02em;
    }
    .dark .slash-prompt-hint {
      background: hsl(155, 20%, 18%);
      color: hsl(152, 8%, 55%);
    }

    /* ── Loading state ───────────────────────────────────── */
    .slash-prompt-loading {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 14px;
      border-radius: 10px;
      border: 1px solid hsl(152, 30%, 85%);
      background: hsl(0, 0%, 100%);
      color: hsl(152, 5%, 50%);
      font-size: 13px;
      box-shadow:
        0 4px 16px rgba(0,0,0,0.08),
        0 0 0 1px rgba(0,0,0,0.03);
      animation: slash-fade-in 0.15s ease-out;
    }
    .dark .slash-prompt-loading {
      border-color: hsl(155, 20%, 20%);
      background: hsl(155, 20%, 10%);
      color: hsl(152, 8%, 55%);
      box-shadow:
        0 4px 24px rgba(0,0,0,0.5),
        0 0 0 1px rgba(255,255,255,0.04);
    }

    .slash-prompt-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid hsl(152, 15%, 85%);
      border-top-color: hsl(152, 55%, 40%);
      border-radius: 50%;
      animation: slash-spin 0.7s linear infinite;
      flex-shrink: 0;
    }
    .dark .slash-prompt-spinner {
      border-color: hsl(155, 15%, 25%);
      border-top-color: hsl(152, 55%, 50%);
    }
    @keyframes slash-spin {
      to { transform: rotate(360deg); }
    }

    /* ── Error state ─────────────────────────────────────── */
    .slash-prompt-loading.slash-prompt-error-box {
      border-color: hsl(0, 70%, 88%);
      background: hsl(0, 40%, 98%);
    }
    .dark .slash-prompt-loading.slash-prompt-error-box {
      border-color: hsl(0, 40%, 25%);
      background: hsl(0, 30%, 10%);
    }
    .slash-prompt-error {
      color: hsl(0, 75%, 50%);
      font-size: 12px;
      line-height: 1.4;
    }
    .dark .slash-prompt-error {
      color: hsl(0, 70%, 65%);
    }

    /* ── Preview decorations ─────────────────────────────── */
    .${DECORATION_CLASS} {
      background: hsla(152, 55%, 45%, 0.10) !important;
      border-left: 3px solid hsl(152, 55%, 45%) !important;
    }
    .${DANGER_DECORATION_CLASS} {
      background: hsla(0, 75%, 55%, 0.12) !important;
      border-left: 3px solid hsl(0, 75%, 50%) !important;
    }
  `
  document.head.appendChild(style)
}

// ── Helpers ───────────────────────────────────────────────────

/** Detect whether "/" was typed at line-start (or after whitespace) */
function isSlashTrigger(
  editor: MonacoEditor.IStandaloneCodeEditor,
  event: MonacoEditor.IModelContentChangedEvent
): boolean {
  if (event.changes.length !== 1) return false
  const change = event.changes[0]
  // Must be a single-character insertion of "/"
  if (change.text !== '/') return false
  if (change.rangeLength !== 0) return false

  const line = editor.getModel()!.getLineContent(change.range.startLineNumber)
  const beforeCursor = line.slice(0, change.range.startColumn - 1)
  // "/" is the first non-whitespace character on the line
  if (!/^\s*$/.test(beforeCursor)) return false

  return true
}

/** Build a simple DOM element for the prompting phase */
function buildPromptDom(
  onSubmit: (description: string) => void,
  onCancel: () => void
): HTMLElement {
  const root = document.createElement('div')
  root.className = 'slash-prompt-widget'

  const container = document.createElement('div')
  container.className = 'slash-prompt-container'

  const icon = document.createElement('span')
  icon.className = 'slash-prompt-icon'
  icon.textContent = '/'

  const input = document.createElement('textarea')
  input.className = 'slash-prompt-input'
  input.placeholder = '描述查询需求…'
  input.rows = 1

  const hint = document.createElement('span')
  hint.className = 'slash-prompt-hint'
  hint.textContent = 'Enter ↵'

  container.append(icon, input, hint)
  root.appendChild(container)

  // Auto-focus after a tick (widget may not be in DOM yet)
  setTimeout(() => input.focus(), 20)

  // Enter → submit
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const desc = input.value.trim()
      if (desc) onSubmit(desc)
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  })

  // Click outside → cancel (listener added by caller)

  return root
}

/** Build the loading DOM element */
function buildLoadingDom(): HTMLElement {
  const root = document.createElement('div')
  root.className = 'slash-prompt-widget'
  const container = document.createElement('div')
  container.className = 'slash-prompt-loading'
  const spinner = document.createElement('div')
  spinner.className = 'slash-prompt-spinner'
  const text = document.createElement('span')
  text.textContent = 'AI 正在生成 SQL…'
  container.append(spinner, text)
  root.appendChild(container)
  return root
}

/** Build the streaming feedback DOM element (shows partial SQL) */
function buildStreamingDom(partial: string): HTMLElement {
  const root = document.createElement('div')
  root.className = 'slash-prompt-widget'
  const container = document.createElement('div')
  container.className = 'slash-prompt-loading'
  const spinner = document.createElement('div')
  spinner.className = 'slash-prompt-spinner'
  const text = document.createElement('span')
  text.textContent = partial ? `生成中: ${partial.slice(0, 60)}…` : 'AI 正在生成 SQL…'
  container.append(spinner, text)
  root.appendChild(container)
  return root
}

// ── Main setup function ───────────────────────────────────────

interface InlineAIPromptOptions {
  editor: MonacoEditor.IStandaloneCodeEditor
  monaco: typeof Monaco
  activeConnectionIdRef: { current: string | null }
  databaseTypeRef: { current: string | undefined }
  fetchSchema: () => DatabaseSchema | undefined
  /** Call AI text-to-sql (should be the preload API call) */
  callTextToSQL: (params: {
    naturalLanguage: string
    schema: DatabaseSchema
    connectionId: string
    databaseType?: string
  }) => Promise<{ sql: string; explanation: string; isDangerous: boolean }>
}

/**
 * Set up inline AI slash command in a Monaco editor.
 * Call this once inside the editor's onMount callback.
 * Returns a cleanup function (call on unmount).
 */
export function setupInlineAIPrompt(opts: InlineAIPromptOptions): () => void {
  const { editor, monaco, activeConnectionIdRef, databaseTypeRef, fetchSchema, callTextToSQL } = opts

  injectStyles()

  let phase: Phase = 'idle'
  let widget: MonacoEditor.IContentWidget | null = null
  let currentWidgetId = ''
  let promptLine: number | null = null
  let originalText = ''             // the "/description" text the user typed
  let generatedSQL = ''
  let previewRange: IRange | null = null  // saved for explicit revert
  let previewDecorations: string[] = []
  let errorTimeoutId: ReturnType<typeof setTimeout> | null = null
  let cancelInProgress = false  // guard against cancelPrompt's own edit re-triggering
  const disposables: IDisposable[] = []

  // ── Content change listener: trigger on "/", dismiss on "/" removal ──
  const changeDisposable = editor.onDidChangeModelContent((event) => {
    // Guard: don't react to our own cleanup edits
    if (cancelInProgress) return

    if (phase === 'idle') {
      // Detect "/" typed at line start → show the AI prompt widget
      if (!activeConnectionIdRef.current) return
      if (isSlashTrigger(editor, event)) {
        const change = event.changes[0]
        promptLine = change.range.startLineNumber
        originalText = '/'
        showPromptWidget(change.range.startLineNumber, change.range.startColumn + 1)
      }
      return
    }

    if (phase === 'prompting' && promptLine !== null) {
      // Detect if the "/" trigger was deleted → auto-dismiss the widget
      const lineContent = editor.getModel()!.getLineContent(promptLine)
      const trimmed = lineContent.trimStart()
      if (!trimmed.startsWith('/')) {
        // "/" is gone — silently dismiss without trying to clean up again
        dismissWidgetOnly()
      }
    }
  })

  disposables.push(changeDisposable)

  // ── Helper: generate unique widget ID to avoid race conditions ──
  function newWidgetId(): string {
    currentWidgetId = `${WIDGET_ID_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    return currentWidgetId
  }

  // ── Helper: show the prompting widget ──
  function showPromptWidget(line: number, afterColumn: number): void {
    phase = 'prompting'

    const domNode = buildPromptDom(
      // onSubmit
      (description) => {
        originalText = `/${description}`
        showLoadingWidget(line)
        executeAIQuery(description, line)
      },
      // onCancel
      () => {
        cancelPrompt()
      }
    )

    const widgetId = newWidgetId()
    widget = {
      getId: () => widgetId,
      getDomNode: () => domNode,
      getPosition: () => ({
        position: { lineNumber: line, column: afterColumn },
        preference: [monaco.editor.ContentWidgetPositionPreference.BELOW, monaco.editor.ContentWidgetPositionPreference.EXACT]
      })
    }

    editor.addContentWidget(widget)
  }

  // ── Helper: show loading widget ──
  function showLoadingWidget(line: number): void {
    phase = 'loading'
    // Remove old widget, add loading one
    if (widget) {
      editor.removeContentWidget(widget)
      widget = null
    }

    const domNode = buildLoadingDom()
    const widgetId = newWidgetId()
    widget = {
      getId: () => widgetId,
      getDomNode: () => domNode,
      getPosition: () => ({
        position: { lineNumber: line, column: 1 },
        preference: [monaco.editor.ContentWidgetPositionPreference.BELOW, monaco.editor.ContentWidgetPositionPreference.EXACT]
      })
    }
    editor.addContentWidget(widget)
  }

  // ── Helper: update loading widget with streaming text ──
  // TODO: wire up streaming when the textToSQL API supports per-chunk callbacks
  function updateStreamingWidget(line: number, partialSQL: string): void {
    if (phase !== 'loading') return
    if (widget) {
      editor.removeContentWidget(widget)
      widget = null
    }
    const domNode = buildStreamingDom(partialSQL)
    const widgetId = newWidgetId()
    widget = {
      getId: () => widgetId,
      getDomNode: () => domNode,
      getPosition: () => ({
        position: { lineNumber: line, column: 1 },
        preference: [monaco.editor.ContentWidgetPositionPreference.BELOW, monaco.editor.ContentWidgetPositionPreference.EXACT]
      })
    }
    editor.addContentWidget(widget)
  }

  // ── Helper: execute AI query ──
  async function executeAIQuery(description: string, line: number): Promise<void> {
    const schema = fetchSchema()
    if (!schema) {
      showError(line, '无法获取数据库 Schema，请先连接数据库')
      return
    }
    if (!activeConnectionIdRef.current) {
      showError(line, '请先选择一个数据库连接')
      return
    }

    try {
      const result = await callTextToSQL({
        naturalLanguage: description,
        schema,
        connectionId: activeConnectionIdRef.current,
        databaseType: databaseTypeRef.current
      })

      generatedSQL = result.sql
      applyPreview(line, result.sql, result.isDangerous)
    } catch (err) {
      showError(line, `AI 调用失败: ${(err as Error).message}`)
    }
  }

  // ── Helper: show error ──
  function showError(line: number, message: string): void {
    // Clean up the prompt UI and "/" character via cancelPrompt
    cancelPrompt()

    // Clear stale error timeout
    if (errorTimeoutId) { clearTimeout(errorTimeoutId); errorTimeoutId = null }

    const domNode = document.createElement('div')
    domNode.className = 'slash-prompt-widget'
    const container = document.createElement('div')
    container.className = 'slash-prompt-loading slash-prompt-error-box'
    const text = document.createElement('span')
    text.className = 'slash-prompt-error'
    text.textContent = message
    container.appendChild(text)
    domNode.appendChild(container)

    const widgetId = newWidgetId()
    widget = {
      getId: () => widgetId,
      getDomNode: () => domNode,
      getPosition: () => ({
        position: { lineNumber: line, column: 1 },
        preference: [monaco.editor.ContentWidgetPositionPreference.BELOW, monaco.editor.ContentWidgetPositionPreference.EXACT]
      })
    }
    editor.addContentWidget(widget)

    const oldWidgetId = currentWidgetId

    // Auto-dismiss error after 4 seconds — guard against removing a newer widget
    errorTimeoutId = setTimeout(() => {
      errorTimeoutId = null
      if (widget && (widget as { getId: () => string }).getId() === oldWidgetId) {
        editor.removeContentWidget(widget)
        widget = null
      }
    }, 4000)
  }

  // ── Helper: apply preview (replace "/..." with SQL + decoration) ──
  function applyPreview(line: number, sql: string, isDangerous: boolean): void {
    // Remove widget
    if (widget) {
      editor.removeContentWidget(widget)
      widget = null
    }

    const model = editor.getModel()!
    // Replace the "/description" line with the generated SQL
    // We need to clear the entire line and insert the SQL
    const lineContent = model.getLineContent(line)
    const lineStart = lineContent.length - lineContent.trimStart().length // preserve indent
    const indent = lineContent.slice(0, lineStart)

    // Format SQL with indentation
    const indentedSQL = sql
      .split('\n')
      .map((s, i) => i === 0 ? indent + s : indent + '  ' + s)
      .join('\n')

    // Replace the line range
    const range = new monaco.Range(line, 1, line, lineContent.length + 1)
    model.pushEditOperations([], [
      { range, text: indentedSQL }
    ], () => null)

    // Add preview decoration and save the range for explicit revert
    const newEndLine = line + indentedSQL.split('\n').length - 1
    previewRange = new monaco.Range(line, 1, newEndLine, model.getLineMaxColumn(newEndLine))
    const className = isDangerous ? DANGER_DECORATION_CLASS : DECORATION_CLASS
    previewDecorations = editor.deltaDecorations([], [
      {
        range: new monaco.Range(line, 1, newEndLine, model.getLineMaxColumn(newEndLine)),
        options: {
          isWholeLine: true,
          className,
          glyphMarginClassName: isDangerous ? 'inline-ai-danger-glyph' : undefined
        }
      }
    ])

    phase = 'preview'
    promptLine = null
  }

  // ── Helper: cancel prompt ──
  function cancelPrompt(): void {
    cancelInProgress = true

    // 1. Close the input widget
    if (widget) {
      editor.removeContentWidget(widget)
      widget = null
    }

    // 2. Remove the "/..." text from the editor (if promptLine is known)
    if (promptLine !== null) {
      const model = editor.getModel()!
      const lineContent = model.getLineContent(promptLine)
      const trimmedStart = lineContent.length - lineContent.trimStart().length
      // Delete the entire line content, keep only leading whitespace
      const range = new monaco.Range(
        promptLine,
        trimmedStart + 1,
        promptLine,
        lineContent.length + 1
      )
      model.pushEditOperations([], [{ range, text: '' }], () => null)
    }

    // 3. Reset all state
    phase = 'idle'
    promptLine = null
    originalText = ''
    generatedSQL = ''
    previewRange = null
    clearPreviewDecorations()

    cancelInProgress = false
  }

  // ── Helper: silently dismiss widget only (user already deleted "/" manually) ──
  function dismissWidgetOnly(): void {
    if (widget) {
      editor.removeContentWidget(widget)
      widget = null
    }
    if (errorTimeoutId) { clearTimeout(errorTimeoutId); errorTimeoutId = null }
    phase = 'idle'
    promptLine = null
    originalText = ''
    generatedSQL = ''
    previewRange = null
    clearPreviewDecorations()
  }

  // ── Helper: accept preview ──
  function acceptPreview(): void {
    clearPreviewDecorations()
    phase = 'idle'
    originalText = ''
    generatedSQL = ''
  }

  // ── Helper: revert preview ──
  function revertPreview(): void {
    if (phase === 'preview' && previewRange) {
      const model = editor.getModel()!
      model.pushEditOperations([], [
        { range: previewRange, text: originalText }
      ], () => null)
    }
    clearPreviewDecorations()
    phase = 'idle'
    originalText = ''
    generatedSQL = ''
    promptLine = null
    previewRange = null
  }

  function clearPreviewDecorations(): void {
    if (previewDecorations.length > 0) {
      editor.deltaDecorations(previewDecorations, [])
      previewDecorations = []
    }
  }

  // ── Keydown: Tab to accept, Esc to revert ──
  const keyDisposable = editor.onKeyDown((e) => {
    if (phase === 'preview') {
      if (e.keyCode === monaco.KeyCode.Tab) {
        e.preventDefault()
        e.stopPropagation()
        acceptPreview()
      } else if (e.keyCode === monaco.KeyCode.Escape) {
        e.preventDefault()
        e.stopPropagation()
        revertPreview()
      }
    }

    // In prompting phase, Esc should cancel
    if (phase === 'prompting') {
      if (e.keyCode === monaco.KeyCode.Escape) {
        e.preventDefault()
        e.stopPropagation()
        cancelPrompt()
      }
    }
  })
  disposables.push(keyDisposable)

  // ── Click outside to cancel during prompting ──
  // Use onDidBlurEditorWidget (fires when the whole editor loses focus, including ContentWidgets)
  const blurDisposable = editor.onDidBlurEditorWidget(() => {
    setTimeout(() => {
      if (phase !== 'prompting') return
      const widgetDom = widget?.getDomNode()
      const activeEl = document.activeElement
      if (widgetDom && !widgetDom.contains(activeEl)) {
        cancelPrompt()
      }
    }, 100)
  })
  disposables.push(blurDisposable)

  // Document click as fallback (catches clicks on non-focusable elements)
  const docClickHandler = (e: MouseEvent) => {
    if (phase !== 'prompting') return
    const widgetDom = widget?.getDomNode()
    if (!widgetDom) return
    const target = e.target as Node
    // If click is outside the widget AND outside the editor DOM, cancel
    const editorDom = editor.getDomNode()
    if (
      !widgetDom.contains(target) &&
      editorDom &&
      !editorDom.contains(target)
    ) {
      cancelPrompt()
    }
  }
  document.addEventListener('mousedown', docClickHandler, true)
  const docClickDisposable: IDisposable = {
    dispose: () => document.removeEventListener('mousedown', docClickHandler, true)
  }
  disposables.push(docClickDisposable)

  // ── Cleanup ──
  return () => {
    if (widget) {
      editor.removeContentWidget(widget)
      widget = null
    }
    if (errorTimeoutId) {
      clearTimeout(errorTimeoutId)
      errorTimeoutId = null
    }
    clearPreviewDecorations()
    disposables.forEach(d => d.dispose())
    disposables.length = 0
  }
}

export default setupInlineAIPrompt
