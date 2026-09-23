import { describe, expect, it } from 'vitest'
import { isTrustedShellNavigation } from '../electron/security/shellNavigation'

describe('Shell main-frame navigation', () => {
  it('allows dev routes on the same origin and rejects external destinations', () => {
    const shell = 'http://localhost:5173/'
    expect(isTrustedShellNavigation('http://localhost:5173/workspace', shell)).toBe(true)
    expect(isTrustedShellNavigation('http://localhost:5174/', shell)).toBe(false)
    expect(isTrustedShellNavigation('https://example.com/', shell)).toBe(false)
    expect(isTrustedShellNavigation('file:///C:/other/index.html', shell)).toBe(false)
  })

  it('allows only the packaged Shell file, including hash routes', () => {
    const shell = 'file:///C:/Mira/out/renderer/index.html'
    expect(isTrustedShellNavigation(`${shell}#/novel`, shell)).toBe(true)
    expect(isTrustedShellNavigation('file:///C:/Mira/out/renderer/other.html', shell)).toBe(false)
    expect(isTrustedShellNavigation('file:///C:/Mira/out/renderer/index.html?other=1', shell)).toBe(false)
    expect(isTrustedShellNavigation('javascript:alert(1)', shell)).toBe(false)
  })
})
