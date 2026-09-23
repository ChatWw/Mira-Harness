import { describe, expect, it } from 'vitest'
import { shouldAuthorizeLegacyNovelApiRequest } from '../electron/security/legacyNovelApiAuth'

describe('legacy novel request authorization', () => {
  it('matches only POST/XHR requests from the current Shell main frame', () => {
    const shellUrl = 'file:///C:/Mira/out/renderer/index.html'
    const mainFrame = { url: `${shellUrl}#/novel`, frameTreeNodeId: 11 }
    const details = { method: 'POST', resourceType: 'xhr', webContentsId: 7, frame: mainFrame }
    expect(shouldAuthorizeLegacyNovelApiRequest(details, 7, mainFrame, shellUrl)).toBe(true)
    expect(shouldAuthorizeLegacyNovelApiRequest({ ...details, frame: { url: mainFrame.url, frameTreeNodeId: 12 } }, 7, mainFrame, shellUrl)).toBe(false)
    expect(shouldAuthorizeLegacyNovelApiRequest({ ...details, webContentsId: 8 }, 7, mainFrame, shellUrl)).toBe(false)
    expect(shouldAuthorizeLegacyNovelApiRequest({ ...details, method: 'OPTIONS' }, 7, mainFrame, shellUrl)).toBe(false)
    expect(shouldAuthorizeLegacyNovelApiRequest({ ...details, resourceType: 'subFrame' }, 7, mainFrame, shellUrl)).toBe(false)
  })

  it('rejects a main frame that navigated away from the Shell', () => {
    const mainFrame = { url: 'https://example.com/' }
    expect(shouldAuthorizeLegacyNovelApiRequest({ method: 'POST', resourceType: 'xhr', webContentsId: 7, frame: mainFrame }, 7, mainFrame, 'file:///C:/Mira/out/renderer/index.html')).toBe(false)
  })
})
