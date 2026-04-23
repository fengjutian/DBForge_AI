import { create } from 'zustand'
import type { AIConfig, AppConfig } from '../../shared/types'
import type { ElectronAPI } from '../../main/preload'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

type Theme = 'system' | 'light' | 'dark'
type Language = 'zh' | 'en'

interface SettingsState {
  config: AppConfig | null
  loading: boolean
  error: string | null

  // Actions
  loadSettings: () => Promise<void>
  updateAIConfig: (ai: Partial<AIConfig>) => Promise<void>
  setTheme: (theme: Theme) => Promise<void>
  setLanguage: (language: Language) => Promise<void>
  updateShortcut: (action: string, shortcut: string) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  config: null,
  loading: false,
  error: null,

  loadSettings: async () => {
    set({ loading: true, error: null })
    try {
      const config = await window.electronAPI.settings.get()
      set({ config, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  updateAIConfig: async (ai) => {
    const current = get().config
    if (!current) return

    const merged = { ...current.ai, ...ai }
    // Route through ai.saveConfig so API key gets encrypted properly
    await window.electronAPI.ai.saveConfig(merged as AIConfig)
    // Also persist non-sensitive fields via settings
    const toStore = { ...merged }
    delete (toStore as AIConfig & { apiKey?: string }).apiKey
    set({ config: { ...current, ai: toStore } })
  },

  setTheme: async (theme) => {
    const current = get().config
    if (!current) return

    await window.electronAPI.settings.set({ theme })
    set({ config: { ...current, theme } })
  },

  setLanguage: async (language) => {
    const current = get().config
    if (!current) return

    await window.electronAPI.settings.set({ language })
    set({ config: { ...current, language } })
  },

  updateShortcut: async (action, shortcut) => {
    const current = get().config
    if (!current) return

    const shortcuts = { ...current.shortcuts, [action]: shortcut }
    await window.electronAPI.settings.set({ shortcuts })
    set({ config: { ...current, shortcuts } })
  }
}))
