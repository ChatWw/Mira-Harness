import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { classifyMemoryContent, FileMemoryStore } from '../electron/fileMemoryStore'
import { MiraPaths } from '../electron/miraPaths'

const roots: string[] = []

function createStore() {
  const root = mkdtempSync(join(tmpdir(), 'mira-memory-'))
  roots.push(root)
  return { paths: new MiraPaths(root).ensure(), store: new FileMemoryStore(new MiraPaths(root).ensure()) }
}

afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))

describe('FileMemoryStore', () => {
  it('persists its enabled state and keeps global and project entries separate', () => {
    const { paths, store } = createStore()
    expect(store.enabled()).toBe(false)
    expect(store.setEnabled(true)).toBe(true)
    store.remember('global', '用户偏好使用中文回复')
    store.remember('project', '项目使用 Vitest 编写测试', 'project-1')

    expect(store.context('global', '中文')).toContain('中文')
    expect(store.context('project', 'Vitest', 'project-1')).toContain('Vitest')
    expect(store.context('global', 'Vitest')).toBe('')
    expect(readFileSync(paths.globalMemory(), 'utf8')).toContain('# Mira 全局记忆')
  })

  it('accepts manual Markdown entries and supports precise deletion', () => {
    const { paths, store } = createStore()
    writeFileSync(paths.globalMemory(), '# Mira 全局记忆\n\n- 手动添加的偏好\n', 'utf8')
    const [manual] = store.search('global', '偏好')
    expect(manual.content).toBe('手动添加的偏好')
    store.forget('global', manual.id)
    expect(store.context('global', '偏好')).toBe('')
  })

  it('rejects sensitive content and resets only global memory', () => {
    const { store } = createStore()
    expect(() => store.remember('global', 'apiKey=secret-value')).toThrow('敏感信息')
    store.remember('global', '全局偏好')
    store.remember('project', '项目约定', 'project-1')
    expect(store.resetGlobal()).toBe(1)
    expect(store.context('global', '偏好')).toBe('')
    expect(store.context('project', '约定', 'project-1')).toContain('项目约定')
  })

  it('refuses project memory without an attached project', () => {
    const { store } = createStore()
    expect(() => store.remember('project', '项目约定')).toThrow('关联项目')
  })

  it('stores metadata separately while retaining editable Markdown compatibility', () => {
    const { paths, store } = createStore()
    const saved = store.remember('global', '用户偏好使用 pnpm', undefined, { source: 'explicit', sourceSessionId: 'session-1' })
    const [entry] = store.list('global')
    expect(entry).toMatchObject({ id: saved.entry.id, source: 'explicit', sourceSessionId: 'session-1', sensitivity: 'none' })
    const updated = store.update('global', entry.id, '用户偏好在 Vue 项目中使用 pnpm')
    expect(updated.id).toBe(entry.id)
    expect(updated.updatedAt).toBeGreaterThanOrEqual(entry.updatedAt)
    expect(readFileSync(paths.globalMemoryMeta(), 'utf8')).toContain('session-1')
    store.delete('global', entry.id)
    expect(store.list('global')).toEqual([])
  })

  it('allows technical terminology but blocks real secrets and classifies personal data', () => {
    const { store } = createStore()
    expect(() => store.remember('global', '项目使用 token 作为分页标记')).not.toThrow()
    expect(() => store.remember('global', 'API key 从环境变量读取，不写入代码')).not.toThrow()
    expect(() => store.remember('global', 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz')).toThrow('敏感信息')
    expect(classifyMemoryContent('用户邮箱为 test@example.com')).toMatchObject({ sensitivity: 'personal', redactedContent: '用户邮箱为 [邮箱]' })
  })

  it('persists safe pending candidates for retry', () => {
    const { store } = createStore()
    store.savePending({ id: 'candidate-1', scope: 'global', source: 'explicit', decision: 'save', sensitivity: 'none', content: '用户偏好简洁回复', status: 'failed', error: 'temporary failure', createdAt: 1, updatedAt: 1 })
    expect(store.listPending()).toHaveLength(1)
    store.removePending('candidate-1')
    expect(store.listPending()).toEqual([])
  })
})
