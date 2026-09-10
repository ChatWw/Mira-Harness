import { describe, expect, it } from 'vitest'
import { shouldBlockReloadShortcut, type KeyboardInput } from '../electron/windowShortcuts'

function input(overrides: Partial<KeyboardInput>): KeyboardInput {
  return {
    type: 'keyDown',
    key: '',
    control: false,
    meta: false,
    ...overrides,
  }
}

describe('shouldBlockReloadShortcut', () => {
  it.each([
    input({ key: 'r', meta: true }),
    input({ key: 'R', control: true }),
    input({ key: 'F5' }),
  ])('blocks reload shortcuts in a packaged app', keyboardInput => {
    expect(shouldBlockReloadShortcut(keyboardInput, true)).toBe(true)
  })

  it('keeps reload shortcuts available in development', () => {
    expect(shouldBlockReloadShortcut(input({ key: 'r', meta: true }), false)).toBe(false)
    expect(shouldBlockReloadShortcut(input({ key: 'F5' }), false)).toBe(false)
  })

  it('allows unrelated shortcuts and key-up events', () => {
    expect(shouldBlockReloadShortcut(input({ key: 'r' }), true)).toBe(false)
    expect(shouldBlockReloadShortcut(input({ key: 'p', meta: true }), true)).toBe(false)
    expect(shouldBlockReloadShortcut(input({ type: 'keyUp', key: 'F5' }), true)).toBe(false)
  })
})
