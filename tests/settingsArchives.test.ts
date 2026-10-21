import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { createVueNodeRenderer } from './helpers/vueNodeRenderer'
import { useArchiveManagement } from '../src/pages/backend/archives/useArchiveManagement'
const host = vi.hoisted(() => ({ api: undefined as any, confirm: vi.fn() }))
vi.mock('@/platform', () => ({ getPlatformApi: () => host.api }))
vi.mock('element-plus', () => ({ ElMessageBox: { confirm: host.confirm } }))
const apps: Array<{ unmount(): void }> = []
async function drain() { for (let i = 0; i < 30; i++) { await Promise.resolve(); await nextTick() } }
function mount() {
  let state!: ReturnType<typeof useArchiveManagement>
  const renderer = createVueNodeRenderer()
  const { app } = renderer.mount(defineComponent({ setup() { state = useArchiveManagement(); return () => h('div') } }))
  apps.push(app)
  return state
}
const row = (id: string, projectId?: string, updatedAt = 1) => ({ id, title: `任务 ${id}`, projectId, createdAt: 10 - updatedAt, updatedAt, archivedAt: 1 })
beforeEach(() => {
  host.confirm.mockReset(); host.confirm.mockResolvedValue(undefined)
  let rows = [row('a', 'one'), row('b', 'two', 3), row('c', undefined, 2)]
  host.api = {
    listHarnessProjects: vi.fn(async () => [{ id: 'one', name: '项目一', directory: '/same' }, { id: 'two', name: '项目二', directory: '/same' }]),
    queryHarnessHistory: vi.fn(async () => ({ rows, page: 1, pageSize: 100, total: rows.length })),
    getHarnessSession: vi.fn(async (id: string) => rows.find(row => row.id === id)),
    restoreHarnessSessions: vi.fn(async ([id]: string[]) => { rows = rows.filter(row => row.id !== id) }),
    deleteHarnessSession: vi.fn(async (id: string) => { rows = rows.filter(row => row.id !== id) }),
  }
})
afterEach(() => apps.splice(0).forEach(app => app.unmount()))
it('groups by project identity rather than shared directory and combines title search, project and date sorting', async () => {
  const state = mount(); await drain()
  expect(state.groups.value.map(g => g.name)).toEqual(['项目一', '项目二', '未分类'])
  state.query.value = '任务 b'; expect(state.visibleRows.value.map(r => r.id)).toEqual(['b'])
  state.project.value = JSON.stringify('one'); expect(state.visibleRows.value).toEqual([])
  state.query.value = ''; expect(state.visibleRows.value.map(r => r.id)).toEqual(['a'])
  expect(state.options.value).toHaveLength(3)
})
it('loads every archive page before offering batch actions', async () => {
  host.api.queryHarnessHistory.mockImplementation(async ({page}: any) => ({ rows: [row(String(page))], page, pageSize: 1, total: 3 }))
  const state = mount(); await drain()
  expect(state.rows.value.map(r => r.id)).toEqual(['1', '2', '3'])
  expect(host.api.queryHarnessHistory).toHaveBeenCalledTimes(3)
})
it('refreshes the list after restoring and preserves project options when its last archive disappears', async () => {
  const state = mount(); await drain(); await state.run([state.rows.value[0]], 'restore')
  expect(host.api.restoreHarnessSessions).toHaveBeenCalledWith(['a'])
  expect(state.rows.value.map(r => r.id)).toEqual(['b','c'])
  expect(state.options.value.some(o => o.key === JSON.stringify('one'))).toBe(true)
})
it('cancels deletion without writing and locks the confirmed filtered identities against search changes', async () => {
  const state = mount(); await drain()
  host.confirm.mockRejectedValueOnce('cancel'); await state.run(state.rows.value, 'delete')
  expect(host.api.deleteHarnessSession).not.toHaveBeenCalled()
  let confirm!: () => void; host.confirm.mockImplementationOnce(() => new Promise<void>(done => { confirm = done }))
  state.query.value = '任务 a'
  const pending = state.run(state.visibleRows.value, 'delete'); state.query.value = ''
  await state.run(state.visibleRows.value, 'delete')
  confirm(); await pending
  expect(host.api.deleteHarnessSession).toHaveBeenCalledExactlyOnceWith('a')
})
it('skips restored sessions, reports partial failures and refreshes remaining archives', async () => {
  const state = mount(); await drain()
  host.api.getHarnessSession.mockImplementation(async (id: string) => ({ ...row(id), archivedAt: id === 'a' ? undefined : 1 }))
  host.api.deleteHarnessSession.mockRejectedValueOnce(Error('disk'))
  await state.run(state.rows.value, 'delete')
  expect(host.api.deleteHarnessSession.mock.calls).toEqual([['b'],['c']])
  expect(state.result.value).toContain('删除 1 个会话，失败 1 个，跳过 1 个')
})
it('shows load failures and allows retry without enabling actions against stale data', async () => {
  host.api.queryHarnessHistory.mockRejectedValueOnce(Error('read failed'))
  const state = mount(); await drain(); expect(state.error.value).toBe('read failed')
  await state.run([row('a') as any], 'delete'); expect(host.confirm).not.toHaveBeenCalled()
  await state.refresh(); expect(state.error.value).toBe(''); expect(state.rows.value).toHaveLength(3)
})
