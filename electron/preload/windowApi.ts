import { ipcRenderer, webFrame, webUtils } from 'electron'

export const windowApi = {
  windowChrome: process.platform === 'darwin' ? 'macos-overlay' : (process.platform === 'win32' ? 'windows-overlay' : 'standard'),
  setTitleBarChrome: (chrome: { color: string; symbolColor: string; height?: number }) => ipcRenderer.invoke('window:set-titlebar-chrome', chrome),
  windowCommand: (action: string) => ipcRenderer.invoke('window:command', action),
  getDesktopZoomFactor: () => webFrame.getZoomFactor(),
  onDesktopZoomChanged: (listener: (factor: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, factor: number) => listener(factor)
    ipcRenderer.on('window:zoom-changed', handler)
    return () => ipcRenderer.removeListener('window:zoom-changed', handler)
  },
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  onWindowCloseContext: (listener: () => void) => {
    const handler = () => listener()
    ipcRenderer.on('window:close-context', handler)
    return () => ipcRenderer.removeListener('window:close-context', handler)
  },
  onWindowNavigate: (listener: (path: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, path: string) => listener(path)
    ipcRenderer.on('window:navigate', handler)
    return () => ipcRenderer.removeListener('window:navigate', handler)
  },
}
