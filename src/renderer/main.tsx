import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import App from './App'
import './styles/globals.css'

// Use locally bundled monaco instead of CDN (required for Electron with webSecurity)
loader.config({ monaco })

function Root(): React.ReactElement {
  useEffect(() => {
    // Listen for auto-update notifications
    const unsub = window.electronAPI.updater.onStatus((event) => {
      if (event.status === 'available') {
        const ok = window.confirm(`发现新版本 ${event.info?.version}，是否立即下载？`)
        if (ok) window.electronAPI.updater.download()
      }
      if (event.status === 'downloaded') {
        const ok = window.confirm('新版本已下载完成，是否立即安装并重启？')
        if (ok) window.electronAPI.updater.install()
      }
      if (event.status === 'error') {
        console.warn('[Updater] error:', event.error)
      }
    })
    return () => { unsub() }
  }, [])

  return <App />
}

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
