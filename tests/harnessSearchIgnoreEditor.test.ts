import { effectScope, isProxy, reactive } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useSearchIgnoreEditor } from '../src/pages/backend/fileSearch/useSearchIgnoreEditor'

const document = (content = 'seed\n', source: 'file' | 'template' = 'file', revision = 'rev') => ({ content, source, revision })
function setup() {
  const api = {
    readHarnessWorkspaceSearchIgnore: vi.fn(async (_target: unknown) => document()),
    transformHarnessWorkspaceSearchIgnore: vi.fn(async (_target: unknown, draft: string) => ({ content: draft + 'custom\n' })),
    writeHarnessWorkspaceSearchIgnore: vi.fn(async (_target: unknown, content: string) => document(content, 'file', 'next')),
  }
  const scope = effectScope()
  const editor = scope.run(() => useSearchIgnoreEditor(api))!
  return { api, scope, editor }
}
const project = { kind: 'project' as const, id: 'a' }

describe('Vue search ignore editor state', () => {
  it('passes plain target snapshots across the Electron bridge for load, reload, transform and save', async () => {
    const { api, scope, editor } = setup()
    const assertCloneable = (target: unknown) => {
      expect(isProxy(target)).toBe(false)
      expect(structuredClone(target)).toEqual(project)
    }
    api.readHarnessWorkspaceSearchIgnore.mockImplementation(async target => {
      assertCloneable(target)
      return document()
    })
    api.transformHarnessWorkspaceSearchIgnore.mockImplementation(async (target, draft) => {
      assertCloneable(target)
      return { content: draft + 'custom\n' }
    })
    api.writeHarnessWorkspaceSearchIgnore.mockImplementation(async (target, content) => {
      assertCloneable(target)
      return document(content, 'file', 'next')
    })
    const selection = reactive({ ...project })
    try {
      await editor.load(selection)
      expect(editor.loaded.value).toEqual(document())
      selection.id = 'changed-selection'
      expect(editor.target.value).toEqual(project)
      await editor.load()
      await editor.transform('sync-gitignore')
      await editor.transform('reset-defaults')
      await editor.save()
      expect(editor.error.value).toBe('')
      expect(api.readHarnessWorkspaceSearchIgnore).toHaveBeenCalledTimes(2)
      expect(api.transformHarnessWorkspaceSearchIgnore).toHaveBeenCalledTimes(2)
      expect(api.writeHarnessWorkspaceSearchIgnore).toHaveBeenCalledOnce()
    } finally { scope.stop() }
  })

  it('does not save until load succeeds, and allows an unedited template to be created', async () => {
    const { api, scope, editor } = setup()
    expect(editor.canSave.value).toBe(false)
    api.readHarnessWorkspaceSearchIgnore.mockResolvedValue(document('seed', 'template'))
    await editor.load(project)
    expect(editor.dirty.value).toBe(false)
    expect(editor.canSave.value).toBe(true)
    await editor.save()
    expect(api.writeHarnessWorkspaceSearchIgnore).toHaveBeenCalledWith(project, 'seed', 'rev')
    expect(editor.loaded.value?.source).toBe('file')
    expect(editor.canSave.value).toBe(false)
    expect(editor.status.value).toBe('已保存')
    scope.stop()
  })

  it('transforms the current unsaved draft without writing, and preserves it on errors', async () => {
    const { api, scope, editor } = setup()
    await editor.load(project)
    editor.draft.value = 'unsaved\n'
    await editor.transform('reset-defaults')
    expect(api.transformHarnessWorkspaceSearchIgnore).toHaveBeenCalledWith(project, 'unsaved\n', 'reset-defaults')
    expect(editor.draft.value).toBe('unsaved\ncustom\n')
    expect(api.writeHarnessWorkspaceSearchIgnore).not.toHaveBeenCalled()
    api.transformHarnessWorkspaceSearchIgnore.mockRejectedValue(new Error('忽略规则分区标记缺失或重复，请手动保留规则'))
    await editor.transform('sync-gitignore')
    expect(editor.error.value).toContain('分区标记')
    expect(editor.draft.value).toBe('unsaved\ncustom\n')
    scope.stop()
  })

  it('retains a failed save draft and expected revision for retry, redacting private errors', async () => {
    const { api, scope, editor } = setup()
    await editor.load(project)
    editor.draft.value = 'custom'
    api.writeHarnessWorkspaceSearchIgnore.mockRejectedValueOnce(new Error('private /Users/secret token=unsafe'))
    await editor.save()
    expect(editor.error.value).not.toMatch(/private|secret|unsafe/)
    expect(editor.draft.value).toBe('custom')
    expect(editor.loaded.value?.revision).toBe('rev')
    await editor.save()
    expect(editor.error.value).toBe('')
    expect(editor.dirty.value).toBe(false)
    scope.stop()
  })

  it('can retry an initial load error and unwraps only allowlisted Electron error text', async () => {
    const { api, scope, editor } = setup()
    api.readHarnessWorkspaceSearchIgnore.mockRejectedValueOnce(new Error("Error invoking remote method 'harness:read-search-ignore': Error: 没有权限读取或保存忽略规则"))
    await editor.load(project)
    expect(editor.loaded.value).toBeUndefined()
    expect(editor.canSave.value).toBe(false)
    expect(editor.error.value).toBe('没有权限读取或保存忽略规则')
    await editor.load()
    expect(editor.error.value).toBe('')
    expect(editor.loaded.value?.content).toBe('seed\n')
    scope.stop()
  })

  it('ignores a previous workspace load that resolves after the current one', async () => {
    const { api, scope, editor } = setup()
    let release!: (value: ReturnType<typeof document>) => void
    api.readHarnessWorkspaceSearchIgnore.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    const old = editor.load(project)
    await editor.load({ kind: 'session', id: 'b' })
    release(document('old private draft'))
    await old
    expect(editor.target.value).toEqual({ kind: 'session', id: 'b' })
    expect(editor.draft.value).toBe('seed\n')
    scope.stop()
  })

  it('blocks duplicate save/transform operations while saving and ignores results after disposal', async () => {
    const { api, scope, editor } = setup()
    await editor.load(project)
    editor.draft.value = 'latest'
    let release!: (value: ReturnType<typeof document>) => void
    api.writeHarnessWorkspaceSearchIgnore.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    const pending = editor.save()
    await editor.save()
    await editor.transform('sync-gitignore')
    expect(api.writeHarnessWorkspaceSearchIgnore).toHaveBeenCalledTimes(1)
    expect(api.transformHarnessWorkspaceSearchIgnore).not.toHaveBeenCalled()
    scope.stop()
    release(document('latest', 'file', 'next'))
    await pending
    expect(editor.loaded.value?.revision).toBe('rev')
  })

  it('bounds UTF-8 bytes, supports empty rules, and reverts to the loaded snapshot', async () => {
    const { scope, editor } = setup()
    await editor.load(project)
    editor.draft.value = '中'.repeat(90_000)
    expect(editor.byteLength.value).toBe(270_000)
    expect(editor.canSave.value).toBe(false)
    editor.draft.value = ''
    expect(editor.canSave.value).toBe(true)
    editor.revert()
    expect(editor.draft.value).toBe('seed\n')
    expect(editor.dirty.value).toBe(false)
    scope.stop()
  })

  it('does not start a late workspace load after its component scope is disposed', async () => {
    const { api, scope, editor } = setup()
    scope.stop()
    await editor.load(project)
    expect(api.readHarnessWorkspaceSearchIgnore).not.toHaveBeenCalled()
  })
})
