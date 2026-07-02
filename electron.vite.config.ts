import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@dbforge/shared'] })],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@main': resolve('src/main'),
        '@dbforge/shared': resolve('packages/shared/src')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        },
        // Optional LangChain provider packages — not installed by default.
        // AIModule uses dynamic import() with try/catch and falls back to
        // a plain HTTP client when these packages are absent at runtime.
        external: [
          '@langchain/openai',
          '@langchain/groq',
          '@langchain/anthropic',
          '@langchain/ollama',
          '@langchain/core',
          '@langchain/core/messages'
        ]
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@dbforge/shared'] })],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@dbforge/shared': resolve('packages/shared/src')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/preload.ts')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
        '@': resolve('src/renderer'),
        '@dbforge/shared': resolve('packages/shared/src')
      }
    },
    plugins: [react()],
    worker: {
      format: 'es'
    },
    optimizeDeps: {
      include: ['monaco-editor/esm/vs/editor/editor.worker']
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    }
  }
})
