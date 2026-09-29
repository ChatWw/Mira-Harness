import { describe, expect, it } from 'vitest'
import { HOSTED_BROWSER_PARTITION, isAllowedHostedBrowserUrl } from '../electron/security/hostedBrowser'

describe('hosted browser guest boundary', () => {
  it('uses a dedicated partition and accepts only unauthenticated web URLs', () => {
    expect(HOSTED_BROWSER_PARTITION).toBe('persist:mira-harness-browser')
    expect(isAllowedHostedBrowserUrl('https://example.com/path')).toBe(true)
    expect(isAllowedHostedBrowserUrl('http://localhost:3000/')).toBe(true)
    expect(isAllowedHostedBrowserUrl('https://user:secret@example.com')).toBe(false)
    expect(isAllowedHostedBrowserUrl('file:///tmp/secret')).toBe(false)
    expect(isAllowedHostedBrowserUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedHostedBrowserUrl('about:blank')).toBe(false)
    expect(isAllowedHostedBrowserUrl('not a URL')).toBe(false)
  })
})
