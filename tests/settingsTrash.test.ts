import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { createVueNodeRenderer } from './helpers/vueNodeRenderer'
import { useTrashManagement } from '../src/pages/backend/fileTrash/useTrashManagement'
import type { HarnessTrashEntry } from '../src/config/harness'
const host = vi.hoisted(() => ({ api: undefined as any }))
vi.mock('@/platform', () => ({ getPlatformApi: () => host.api }))
const apps: Array<{ unmount(): void }> = []
async function drain() { for (let i = 0; i < 30; i++) { await Promise.resolve(); await nextTick() } }
function mount() {
  let state!: ReturnType<typeof useTrashManagement>
  const renderer = createVueNodeRenderer()
  const { app } = renderer.mount(defineComponent({ setup() { state = useTrashManagement(); return () => h('div') } }))
  apps.push(app); return state
}
const row = (token: string, projectId: string, deletedAt: number, paths = [`${token}.txt`]): HarnessTrashEntry => ({ token, projectId, projectName: '同名项目', deletedAt, paths })
beforeEach(() => {
  let rows = [row('a', 'one', 1), row('b', 'one', 3, ['folder/b.txt', 'folder/说明.md']), row('c', 'two', 2)]
  host.api = {
    listHarnessTrash: vi.fn(async () => rows),
    restoreHarnessTrash: vi.fn(async (projectId: string, token: string) => { rows = rows.filter(row => row.projectId !== projectId || row.token !== token) }),
  }
})
afterEach(() => apps.splice(0).forEach(app => app.unmount()))
it('groups by project identity and combines file search, project filter and deletion time sorting', async () => {
  const state = mount(); await drain()
  expect(state.groups.value.map(group => group.key)).toEqual(['one', 'two'])
  expect(state.groups.value[0].rows.map(row => row.token)).toEqual(['b', 'a'])
  state.sort.value = 'oldest'; expect(state.groups.value[0].rows.map(row => row.token)).toEqual(['a', 'b'])
  state.query.value = '说明'; expect(state.groups.value[0].rows.map(row => row.token)).toEqual(['b'])
  state.project.value = 'two'; expect(state.groups.value).toEqual([])
  state.query.value = ''; expect(state.groups.value[0].rows.map(row => row.token)).toEqual(['c'])
})
it('restores only selected identities and resets a filter after its last entry is restored', async () => {
  const state = mount(); await drain(); state.project.value = 'two'
  await state.restore(state.groups.value[0].rows)
  expect(host.api.restoreHarnessTrash).toHaveBeenCalledExactlyOnceWith('two', 'c')
  expect(state.project.value).toBe('all')
  expect(state.rows.value.map(row => row.token)).toEqual(['a', 'b'])
  expect(state.result.value).toBe('已还原 1 项')
})
it('keeps failed entries available for retry and reports the actual restore conflict', async () => {
  const state = mount(); await drain()
  host.api.restoreHarnessTrash.mockRejectedValueOnce(Error('目标路径已存在'))
  await state.restore(state.groups.value[0].rows)
  expect(state.result.value).toContain('已还原 1 项，失败 1 项')
  expect(state.result.value).toContain('目标路径已存在')
  expect(state.rows.value.map(row => row.token)).toEqual(['b', 'c'])
  await state.restore([state.rows.value[0]])
  expect(state.rows.value.map(row => row.token)).toEqual(['c'])
})
it('shows read failures, blocks stale restores and allows a refresh retry', async () => {
  host.api.listHarnessTrash.mockRejectedValueOnce(Error('read failed'))
  const state = mount(); await drain(); expect(state.error.value).toBe('read failed')
  await state.restore([row('a', 'one', 1)])
  expect(host.api.restoreHarnessTrash).not.toHaveBeenCalled()
  await state.refresh(); expect(state.error.value).toBe(''); expect(state.rows.value).toHaveLength(3)
})
it('locks an in-flight batch against repeated clicks and changing filters', async () => {
  const state = mount(); await drain()
  let complete!: () => void
  host.api.restoreHarnessTrash.mockImplementationOnce(() => new Promise<void>(done => { complete = done }))
  const pending = state.restore(state.groups.value[0].rows)
  state.project.value = 'two'; await state.restore(state.groups.value[0].rows)
  complete(); await pending
  expect(host.api.restoreHarnessTrash.mock.calls).toEqual([['one', 'b'], ['one', 'a']])
})
