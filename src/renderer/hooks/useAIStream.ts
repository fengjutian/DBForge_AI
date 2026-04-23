import { useState, useEffect, useRef, useCallback } from 'react'

export interface StreamState {
  streaming: boolean
  text: string
}

/**
 * Hook for consuming AI streaming responses.
 * Returns helpers to start a stream and the current streaming state.
 */
export function useAIStream() {
  const [streams, setStreams] = useState<Record<string, string>>({})
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set())
  const cleanupRef = useRef<(() => void)[]>([])

  useEffect(() => {
    const offChunk = window.electronAPI.ai.onStreamChunk(({ streamId, chunk }) => {
      setStreams(prev => ({ ...prev, [streamId]: (prev[streamId] ?? '') + chunk }))
    })
    const offEnd = window.electronAPI.ai.onStreamEnd(({ streamId }) => {
      setActiveIds(prev => { const s = new Set(prev); s.delete(streamId); return s })
    })
    const offError = window.electronAPI.ai.onStreamError(({ streamId }) => {
      setActiveIds(prev => { const s = new Set(prev); s.delete(streamId); return s })
    })
    cleanupRef.current = [offChunk, offEnd, offError]
    return () => cleanupRef.current.forEach(fn => fn())
  }, [])

  /** Generate a unique stream ID and mark it as active */
  const startStream = useCallback((id: string) => {
    setStreams(prev => ({ ...prev, [id]: '' }))
    setActiveIds(prev => new Set(prev).add(id))
  }, [])

  /** Clear a stream's accumulated text */
  const clearStream = useCallback((id: string) => {
    setStreams(prev => { const n = { ...prev }; delete n[id]; return n })
    setActiveIds(prev => { const s = new Set(prev); s.delete(id); return s })
  }, [])

  const isStreaming = useCallback((id: string) => activeIds.has(id), [activeIds])
  const getText = useCallback((id: string) => streams[id] ?? '', [streams])

  return { startStream, clearStream, isStreaming, getText }
}

/** Generate a unique stream ID */
export function newStreamId(prefix = 'stream'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}
