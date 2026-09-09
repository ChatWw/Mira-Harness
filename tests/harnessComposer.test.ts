import { describe, expect, it } from 'vitest'
import { DEFAULT_ASSISTANT_TONE, DEFAULT_MIRA_NAME, DEFAULT_MIRA_USER_NAME, normalizeAssistantTone, normalizeMiraIdentityName, resolveMiraIdentity, shouldAutoCompactContext, shouldSendWithShortcut } from '../src/config/harness'
import { clearSlashCommand, createHarnessSendAction, mergeHarnessAttachments, slashCommandQuery } from '../src/pages/frontend/harness/harnessComposerActions'

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

describe('harness composer actions', () => {
  it('recognizes and clears only a trailing slash command', () => {
    expect(slashCommandQuery('请分析 /mod')).toBe('mod')
    expect(slashCommandQuery('路径 /tmp/file 后继续输入')).toBeUndefined()
    expect(clearSlashCommand('请分析 /model')).toBe('请分析 ')
    expect(clearSlashCommand('保留 /path 后的正文')).toBe('保留 /path 后的正文')
  })

  it('deduplicates attachments and copies all IPC-bound payload data', () => {
    const first = { path: 'src/a.ts', name: 'a.ts' }
    const merged = mergeHarnessAttachments([first], [first, { path: 'src/b.ts', name: 'b.ts' }])
    const source = {
      text: '检查修改',
      attachments: merged,
      activeSkillIds: ['skill-a'],
      activeMcpServerIds: ['mcp-a'],
      projectId: 'project-a',
      permissionMode: 'auto-approve' as const,
      modelSelection: { providerId: 'openai', modelId: 'gpt', thinkingLevel: 'high' as const },
      planning: true,
    }
    const payload = createHarnessSendAction(source)

    expect(payload.attachments).toEqual([first, { path: 'src/b.ts', name: 'b.ts' }])
    expect(payload).toEqual(source)
    expect(payload).not.toBe(source)
    expect(payload.attachments).not.toBe(source.attachments)
    expect(payload.attachments[0]).not.toBe(source.attachments[0])
    expect(payload.activeSkillIds).not.toBe(source.activeSkillIds)
    expect(payload.activeMcpServerIds).not.toBe(source.activeMcpServerIds)
    expect(payload.modelSelection).not.toBe(source.modelSelection)
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
