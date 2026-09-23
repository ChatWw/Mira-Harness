import { isTrustedShellNavigation } from './shellNavigation'

export function shouldAuthorizeLegacyNovelApiRequest(details: {
  method: string
  resourceType: string
  webContentsId?: number
  frame?: { url: string; frameTreeNodeId?: number } | null
}, webContentsId: number, mainFrame: { url: string; frameTreeNodeId?: number }, shellUrl: string) {
  const isMainFrame = details.frame?.frameTreeNodeId !== undefined && mainFrame.frameTreeNodeId !== undefined
    ? details.frame.frameTreeNodeId === mainFrame.frameTreeNodeId
    : details.frame === mainFrame
  return details.method === 'POST'
    && details.resourceType === 'xhr'
    && details.webContentsId === webContentsId
    && isMainFrame
    && isTrustedShellNavigation(mainFrame.url, shellUrl)
}
