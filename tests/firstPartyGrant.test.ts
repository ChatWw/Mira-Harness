import { describe, expect, it } from 'vitest'
import { FirstPartyGrantStore } from '../electron/security/firstPartyGrant'

describe('first-party grant store', () => {
  it('binds a grant to its owning webContents and capability snapshot', () => {
    const store = new FirstPartyGrantStore()
    const grantId = store.issue('mira-novel-studio', 11, ['models:text.generate'])
    expect(store.resolve(grantId, 11)?.appId).toBe('mira-novel-studio')
    expect(store.resolve(grantId, 11)?.capabilities.has('models:text.generate')).toBe(true)
    expect(store.resolve(grantId, 12)).toBeUndefined()
    expect(store.revoke(grantId, 12)).toBe(false)
    expect(store.resolve(grantId, 11)).toBeDefined()
    expect(store.revoke(grantId, 11)).toBe(true)
    expect(store.resolve(grantId, 11)).toBeUndefined()
  })

  it('revokes every grant owned by a destroyed webContents', () => {
    const store = new FirstPartyGrantStore()
    const first = store.issue('mira-novel-studio', 11, [])
    const second = store.issue('other-app', 11, [])
    const unrelated = store.issue('mira-novel-studio', 12, [])
    store.revokeForWebContents(11)
    expect(store.resolve(first, 11)).toBeUndefined()
    expect(store.resolve(second, 11)).toBeUndefined()
    expect(store.resolve(unrelated, 12)).toBeDefined()
  })
})
