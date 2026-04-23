import { useState, useEffect, useRef, useCallback } from 'react'

export function useAIStream() {
  const [streams, setStreams] = useState<Record<string, string>>({})
  const [thinking, setThinking] = useState<Record<string, string>>({})
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set())
  const cleanupRef = useRef<(() => void)[]>([])

  useEffect(() => {
    const offChunk = window.electronAPI.ai.onStreamChunk(({ streamId, chunk }) => {
      setStreams(prev => ({ ...prev, [streamId]: (prev[streamId] ?? '') + chunk }))
    })
    const offThinking = window.electronAPI.ai.onStreamThinking(({ streamId, chunk }) => {
      setThinking(prev => ({ ...prev, [streamId]: (prev[streamId] ?? '') + chunk }))
    })
    const offEnd = window.electronAPI.ai.onStreamEnd(({ streamId }) => {
      setActiveIds(prev => { const s = new Set(prev); s.delete(streamId); return s })
    })
    const offError = window.electronAPI.ai.onStreamError(({ streamId }) => {
      setActiveIds(prev => { const s = new Set(prev); s.delete(streamId); return s })
    })
    cleanupRef.current = [offChunk, offThinking, offEnd, offError]
    return () => cleanupRef.current.forEach(fn => fn())
  }, [])

  const startStream = useCallback((id: string) => {
    setStreams(prev => ({ ...prev, [id]: '' }))
    setThinking(prev => ({ ...prev, [id]: '' }))
    setActiveIds(prev => new Set(prev).add(id))
  }, [])

  const clearStream = useCallback((id: string) => {
    setStreams(prev => { const n = { ...prev }; delete n[id]; return n })
    setThinking(prev => { const n = { ...prev }; delete n[id]; return n })
    setActiveIds(prev => { const s = new Set(prev); s.delete(id); return s })
  }, [])

  const isStreaming = useCallback((id: string) => activeIds.has(id), [activeIds])
  const getText = useCallback((id: string) => streams[id] ?? '', [streams])
  const getThinking = useCallback((id: string) => thinking[id] ?? '', [thinking])

  return { startStream, clearStream, isStreaming, getText, getThinking }
}

export function newStreamId(prefix = 'stream'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}
