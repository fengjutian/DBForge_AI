import type { ElectronAPI } from '../../main/preload'

declare global {
  interface Window {
    electronAPI: ElectronAPI & {
      backup: ElectronAPI['backup'] & {
        selectSavePath: (defaultPath?: string) => Promise<string | null>
        selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
      }
    }
  }
}

export {}
