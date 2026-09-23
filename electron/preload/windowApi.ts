import { ipcRenderer, webUtils } from 'electron'

export const windowApi = {
  windowChrome: process.platform === 'darwin' ? 'macos-overlay' : (process.platform === 'win32' ? 'windows-overlay' : 'standard'),
  setTitleBarChrome: (chrome: { color: string; symbolColor: string; height?: number }) => ipcRenderer.invoke('window:set-titlebar-chrome', chrome),
  windowCommand: (action: string) => ipcRenderer.invoke('window:command', action),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  onWindowNavigate: (listener: (path: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, path: string) => listener(path)
    ipcRenderer.on('window:navigate', handler)
    return () => ipcRenderer.removeListener('window:navigate', handler)
  },
}
