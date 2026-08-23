import { describe, expect, it } from 'vitest'
import { DEFAULT_ASSISTANT_TONE, DEFAULT_MIRA_NAME, DEFAULT_MIRA_USER_NAME, normalizeAssistantTone, normalizeMiraIdentityName, resolveMiraIdentity, shouldAutoCompactContext, shouldSendWithShortcut } from '../src/config/harness'

function key(overrides: Partial<KeyboardEvent> = {}) {
  return { key: 'Enter', keyCode: 13, isComposing: false, metaKey: false, ctrlKey: false, shiftKey: false, ...overrides } as KeyboardEvent
}

describe('harness composer shortcuts', () => {
  it('sends with Cmd or Ctrl + Enter in modifier mode', () => {
    expect(shouldSendWithShortcut('mod-enter', key({ metaKey: true }))).toBe(true)
    expect(shouldSendWithShortcut('mod-enter', key({ ctrlKey: true }))).toBe(true)
    expect(shouldSendWithShortcut('mod-enter', key())).toBe(false)
  })

  it('sends with Enter and leaves Shift + Enter for a new line in enter mode', () => {
    expect(shouldSendWithShortcut('enter', key())).toBe(true)
    expect(shouldSendWithShortcut('enter', key({ shiftKey: true }))).toBe(false)
  })

  it('never sends while the input method is composing', () => {
    expect(shouldSendWithShortcut('enter', key({ isComposing: true }))).toBe(false)
    expect(shouldSendWithShortcut('mod-enter', key({ metaKey: true, keyCode: 229 }))).toBe(false)
  })
})

describe('harness context compaction threshold', () => {
  it('starts compaction only after 80% of the configured window is used', () => {
    expect(shouldAutoCompactContext(102399, 128000)).toBe(false)
    expect(shouldAutoCompactContext(102400, 128000)).toBe(true)
  })
})

describe('assistant tone preference', () => {
  it('defaults invalid or missing values to casual', () => {
    expect(normalizeAssistantTone(undefined)).toBe(DEFAULT_ASSISTANT_TONE)
    expect(normalizeAssistantTone('invalid')).toBe(DEFAULT_ASSISTANT_TONE)
    expect(normalizeAssistantTone('professional')).toBe('professional')
  })
})

describe('Mira identity preference', () => {
  it('trims configured names and falls back to the default names', () => {
    expect(normalizeMiraIdentityName('  阿明  ')).toBe('阿明')
    expect(normalizeMiraIdentityName(undefined)).toBe('')
    expect(resolveMiraIdentity()).toEqual({ userName: DEFAULT_MIRA_USER_NAME, assistantName: DEFAULT_MIRA_NAME })
    expect(resolveMiraIdentity({ userName: '  阿明 ', assistantName: '  小米 ' })).toEqual({ userName: '阿明', assistantName: '小米' })
    expect(resolveMiraIdentity({ userName: ' ', assistantName: '' })).toEqual({ userName: DEFAULT_MIRA_USER_NAME, assistantName: DEFAULT_MIRA_NAME })
  })
})
