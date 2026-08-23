import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { FileMemoryStore } from '../electron/fileMemoryStore'
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
})
