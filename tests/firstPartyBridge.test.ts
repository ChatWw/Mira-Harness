import { describe, expect, it, vi } from 'vitest'
import type { FirstPartyAppManifest } from '../src/config/firstPartyApps'
import { FirstPartyBridgeError, handleFirstPartyRequest, isFirstPartyRequest } from '../src/platform/firstPartyBridge'
import { FirstPartyNavigationError } from '../src/platform/firstPartyNavigation'
import type { PlatformApi, PlatformContext } from '../src/types'

const manifest: FirstPartyAppManifest = {
  appId: 'mira-novel-studio',
  legacyIds: ['ai-novel'],
  enabled: true,
  trustedSource: { type: 'builtin', packagePath: 'novel-studio' },
  entry: { path: 'index.html' },
  shellCompatibility: { minVersion: '0.0.10' },
  apiCompatibility: { major: 1 },
  capabilities: ['models:text.generate', 'storage:novel-projects'],
}
const context: PlatformContext = { version: 1, theme: 'light', language: 'zh-CN', user: { id: 'platform', name: 'Mira' } }
const harnessModelCalls = [
  { method: 'message.run', params: { sessionId: 's', text: '任务', planning: false } },
  { method: 'plan.continue', params: { sessionId: 's', planId: 'plan', message: '继续' } },
  { method: 'plan.confirm', params: { sessionId: 's', planId: 'plan' } },
  { method: 'interaction.answer', params: { sessionId: 's', interactionId: 'question', answers: [{ id: 'q', selected: ['选项'] }] } },
  { method: 'memory.save', params: { sessionId: 's' } },
  { method: 'run.rerun', params: { sessionId: 's' } },
  { method: 'run.edit-rerun', params: { sessionId: 's', messageId: 'message', content: '更新内容' } },
]
const selectedFilePaths = ['/private/tmp/mira-ui-project-smoke.md', 'C:\\Users\\Mira\\notes.md', 'D:/工作/笔记.md', '\\\\server\\share\\notes.md']
const fileReferenceCalls = [
  ...harnessModelCalls.slice(0, 2).map(call => ({ ...call, params: { ...call.params, selection: { providerId: 'p', modelId: 'm' }, references: [{ path: '/private/client-contract.md', name: 'client-contract.md' }] } })),
  { method: 'files.select', params: { sessionId: 's' } },
]
// These messages originate in HarnessStore's file resolution, and Electron prefixes IPC failures.
const fileReferenceFailures = [
  { source: '引用文件不存在：', recovery: '引用文件已不可读取，请重新选择文件后发送。' },
  { source: '引用文件过大：', recovery: '引用文件超过大小限制，请选择较小的文本文件。' },
  { source: '不支持引用二进制文件：', recovery: '无法引用二进制文件，请选择文本文件。' },
]
const workspaceFileFailures = [
  { source: '文件或目录不存在', recovery: '文件或目录已不存在，请刷新文件列表后重试。' },
  { source: '目标不是目录', recovery: '该路径不是目录，请刷新文件列表后重试。' },
  { source: '目标不是文件', recovery: '该路径不是可预览的文件，请选择文本文件。' },
  { source: '文件过大，暂不支持预览', recovery: '文件超过预览大小限制，请使用外部应用打开。' },
  { source: '暂不支持预览二进制文件', recovery: '该文件不是可预览的文本文件，请使用外部应用打开。' },
  { source: '路径无效', recovery: '文件路径无效，请刷新文件列表后重试。' },
  { source: '路径不能离开工作目录', recovery: '无法读取工作目录以外的文件，请选择目录内的文件。' },
  { source: '没有权限读取文件或目录', recovery: '没有权限读取该文件或目录，请检查系统访问权限后重试。' },
]

function bridge(overrides: Partial<FirstPartyAppManifest> = {}) {
  const api = {
    generateFirstPartyText: vi.fn(async () => 'generated'),
    listNovelProjects: vi.fn(async () => []),
    saveNovelProject: vi.fn(async project => project),
    listFirstPartyNovelProjects: vi.fn(async () => []),
    getFirstPartyNovelProject: vi.fn(async () => ({ id: 'project-1' })),
    saveFirstPartyNovelProject: vi.fn(async (_grantId, project) => project),
    invokeFirstPartyHarness: vi.fn(async (_grantId, method) => ({ method })),
    getSnapshot: vi.fn(async () => ({ mainMenus: [], microApps: [], preferences: { 'first-party.mira-novel-studio.draft': { text: 'hi' } } })),
    savePreference: vi.fn(async (_key: string, _value: unknown) => undefined),
  } as unknown as PlatformApi
  const navigate = vi.fn()
  const options = { manifest: { ...manifest, ...overrides }, grantId: 'grant-for-novel', api, context, route: '/chapter/1', navigate }
  const request = (method: string, params?: unknown) => handleFirstPartyRequest(options, { type: 'mira:request', id: 'request-1', method, params })
  return { api, navigate, request }
}

describe('first-party capability bridge', () => {
  it('accepts only bounded request envelopes and reports the host API version', async () => {
    expect(isFirstPartyRequest({ type: 'mira:request', id: '1', method: 'context.get' })).toBe(true)
    expect(isFirstPartyRequest({ type: 'mira:request', id: '1', method: '' })).toBe(false)
    expect(isFirstPartyRequest({ type: 'mira:request', id: '1', method: 'x'.repeat(129) })).toBe(false)
    await expect(bridge().request('context.get')).resolves.toMatchObject({ appId: 'mira-novel-studio', apiVersion: { major: 1, minor: 0 }, route: '/chapter/1' })
    await expect(bridge().request('getModelProviderApiKey')).rejects.toMatchObject({ code: 'UNKNOWN_METHOD' })
  })

  it('rejects missing capabilities and access to another app\'s projects', async () => {
    const missing = bridge({ capabilities: [] })
    await expect(missing.request('models.generateText', { role: 'authoring', prompt: 'text', selection: { providerId: 'p', modelId: 'm' } })).rejects.toMatchObject({ code: 'CAPABILITY_DENIED' })
    expect(missing.api.generateFirstPartyText).not.toHaveBeenCalled()

    const other = bridge({ appId: 'other-app' })
    await expect(other.request('novel.list')).rejects.toMatchObject({ code: 'CAPABILITY_DENIED' })
    expect(other.api.listFirstPartyNovelProjects).not.toHaveBeenCalled()
  })

  it('confines navigation to app paths and rejects malformed projects', async () => {
    const entry = bridge()
    for (const path of ['//example.com', '/../../settings', '/%2e%2e/settings', '/%2fsettings', '/a\\b']) {
      await expect(entry.request('navigation.open', { path })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    }
    expect(entry.navigate).not.toHaveBeenCalled()
    await expect(entry.request('navigation.open', { path: '/chapters/1' })).resolves.toBeNull()
    expect(entry.navigate).toHaveBeenCalledWith('/chapters/1')

    await expect(entry.request('novel.save', { project: { version: 1, title: 'Untitled' } })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    expect(entry.api.saveFirstPartyNovelProject).not.toHaveBeenCalled()
  })

  it('allows encoded query paths while retaining pathname confinement', async () => {
    const entry = bridge()
    const path = '/settings/personalization?from=%2Fworkspace%2Fharness-react'
    await expect(entry.request('navigation.open', { path })).resolves.toBeNull()
    expect(entry.navigate).toHaveBeenCalledWith(path)
    for (const invalid of ['/settings/%2fescape', '/settings/%252fescape', '/settings/general\n']) {
      await expect(entry.request('navigation.open', { path: invalid })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    }
    expect(entry.navigate).toHaveBeenCalledTimes(1)
  })

  it('waits for navigation and exposes a blocked route instead of reporting success', async () => {
    const entry = bridge()
    let finish!: (value?: unknown) => void
    entry.navigate.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    let settled = false
    const pending = entry.request('navigation.open', { path: '/settings/general' }).finally(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    finish()
    await expect(pending).resolves.toBeNull()
    entry.navigate.mockImplementationOnce(() => { throw new FirstPartyNavigationError('NAVIGATION_FAILED', '草稿保存失败，已保留当前页面') })
    await expect(entry.request('navigation.open', { path: '/settings/general' })).rejects.toMatchObject({ code: 'NAVIGATION_FAILED', message: '草稿保存失败，已保留当前页面' })
    entry.navigate.mockImplementationOnce(() => Promise.reject(new Error('private host failure')))
    await expect(entry.request('navigation.open', { path: '/settings/general' })).rejects.toMatchObject({ code: 'NAVIGATION_FAILED', message: '页面切换失败，请稍后重试' })
  })

  it('sends only validated model selection fields to the host model channel', async () => {
    const entry = bridge()
    await expect(entry.request('models.generateText', { role: 'authoring', prompt: 'text', selection: { providerId: 'p', modelId: 'm', apiKey: 'injected' } })).resolves.toBe('generated')
    expect(entry.api.generateFirstPartyText).toHaveBeenCalledWith('grant-for-novel', 'authoring', 'text', { providerId: 'p', modelId: 'm' })
    await expect(entry.request('models.generateText', { role: 'authoring', prompt: 'text', selection: { providerId: 'p' } })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  })

  it('routes novel storage through the grant-bound host API', async () => {
    const entry = bridge()
    await expect(entry.request('novel.list')).resolves.toEqual([])
    await expect(entry.request('novel.get', { id: 'project-1' })).resolves.toEqual({ id: 'project-1' })
    await expect(entry.request('novel.save', { project: { version: 1, id: 'project-1', title: 'Untitled' } })).resolves.toMatchObject({ id: 'project-1' })
    expect(entry.api.listFirstPartyNovelProjects).toHaveBeenCalledWith('grant-for-novel')
    expect(entry.api.getFirstPartyNovelProject).toHaveBeenCalledWith('grant-for-novel', 'project-1')
    expect(entry.api.saveFirstPartyNovelProject).toHaveBeenCalledWith('grant-for-novel', expect.objectContaining({ id: 'project-1' }))
  })

  it('namespaces app preferences away from shell preference keys', async () => {
    const entry = bridge()
    await expect(entry.request('preferences.get', { key: 'draft' })).resolves.toEqual({ text: 'hi' })
    await expect(entry.request('preferences.get', { key: 'missing' })).resolves.toBeNull()
    await expect(entry.request('preferences.set', { key: 'draft', value: { text: 'next' } })).resolves.toBeNull()
    expect(entry.api.savePreference).toHaveBeenCalledWith('first-party.mira-novel-studio.draft', { text: 'next' })
    await expect(entry.request('preferences.set', { key: '../escape', value: 1 })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    expect(entry.api.savePreference).toHaveBeenCalledTimes(1)
    await expect(entry.request('preferences.set', { key: 'big', value: 'x'.repeat(262_145) })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  })

  it('covers the session management, configuration and planning surface', async () => {
    const entry = bridge({ appId: 'mira-harness', capabilities: ['harness:workbench'] })
    const expectCall = async (method: string, params: Record<string, unknown>) => {
      await expect(entry.request(`harness.${method}`, params)).resolves.toEqual({ method })
    }
    await expectCall('skills.list', {})
    await expectCall('attachments.save', { sessionId: 's', path: 'mira-attachment:frozen' })
    await expectCall('session.rename', { id: 's', title: '新标题' })
    await expectCall('session.set-pinned', { id: 's', pinned: true })
    await expectCall('session.set-unread', { id: 's', unread: false })
    await expectCall('session.archive', { id: 's' })
    await expectCall('session.delete', { id: 's' })
    await expectCall('session.move', { id: 's', projectId: 'p' })
    await expectCall('session.reorder', { scope: { type: 'project', projectId: 'p' }, ids: ['a', 'b'] })
    await expectCall('session.reorder', { scope: { type: 'pinned' }, ids: ['a'] })
    await expectCall('session.set-permission', { id: 's', mode: 'auto-approve' })
    await expectCall('session.set-skills', { id: 's', skillIds: ['skill-1'] })
    await expectCall('session.set-mcp-servers', { id: 's', serverIds: ['mcp-1'] })
    await expectCall('session.set-delegation', { id: 's', enabled: true })
    await expectCall('projects.reorder', { ids: ['p'] })
    await expectCall('git.branches', { projectId: 'p' })
    await expectCall('git.context', { projectId: 'p' })
    await expectCall('git.create-branch', { projectId: 'p', branch: 'feat/x', snapshotToken: 'a'.repeat(64) })
    await expectCall('memory.respond', { requestId: 'r', approved: true })
    await expectCall('memory.save', { sessionId: 's', selection: { providerId: 'p', modelId: 'm' } })
    await expectCall('subtask.stop', { sessionId: 's', subtaskId: 't' })
    await expectCall('run.rerun', { sessionId: 's', selection: { providerId: 'p', modelId: 'm' } })
    await expectCall('run.edit-rerun', { sessionId: 's', messageId: 'm', content: '改后内容', selection: { providerId: 'p', modelId: 'm' } })
    await expectCall('message.run', { sessionId: 's', text: '任务', references: [{ path: 'docs/a.md', name: 'a.md' }], selection: { providerId: 'p', modelId: 'm' }, planning: false })
    await expectCall('plan.cancel', { sessionId: 's', planId: 'plan' })
    await expectCall('plan.continue', { sessionId: 's', planId: 'plan', message: '继续', selection: { providerId: 'p', modelId: 'm' } })
    await expectCall('project.open', { sessionId: 's', target: 'terminal' })

    await expect(entry.request('harness.session.rename', { id: 's', title: 'x'.repeat(121) })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(entry.request('harness.session.set-pinned', { id: 's', pinned: 'yes' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(entry.request('harness.session.reorder', { scope: { type: 'trash' }, ids: ['a'] })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(entry.request('harness.session.set-permission', { id: 's', mode: 'god' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(entry.request('harness.message.run', { sessionId: 's', text: '任务', references: [{ path: '../etc/passwd', name: 'x' }], selection: { providerId: 'p', modelId: 'm' }, planning: false })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(entry.request('harness.memory.respond', { requestId: 'r', approved: 'ok' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(entry.request('harness.project.open', { sessionId: 's', target: 'dev-tools' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(entry.request('harness.subtask.stop', { sessionId: 's', subtaskId: 42 })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  })

  it('routes only the validated Harness surface through the owning grant', async () => {
    const entry = bridge({ appId: 'mira-harness', capabilities: ['harness:workbench'] })
    await expect(entry.request('harness.sessions.list')).resolves.toEqual({ method: 'sessions.list' })
    expect(entry.api.invokeFirstPartyHarness).toHaveBeenCalledWith('grant-for-novel', 'sessions.list', {})
    await expect(entry.request('harness.message.run', { sessionId: 's', text: 'run', planning: false, selection: { providerId: 'p', modelId: 'm' }, extra: 'ignored' })).resolves.toEqual({ method: 'message.run' })
    await expect(entry.request('harness.message.run', { sessionId: 's', text: 'run', planning: false, selection: { providerId: 'p' } })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(entry.request('harness.files.list', { sessionId: 's', path: 'src' })).resolves.toEqual({ method: 'files.list' })
    expect(entry.api.invokeFirstPartyHarness).toHaveBeenLastCalledWith('grant-for-novel', 'files.list', { sessionId: 's', path: 'src' })
    await expect(entry.request('harness.files.read', { sessionId: 's', path: '../secret' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    const bounds = { x: 10, y: 20, width: 400, height: 300 }
    await expect(entry.request('harness.browser.navigate', { sessionId: 's', url: 'https://example.com', bounds })).resolves.toEqual({ method: 'browser.navigate' })
    await expect(entry.request('harness.browser.navigate', { sessionId: 's', url: 'file:///etc/passwd', bounds })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(entry.request('harness.browser.navigate', { sessionId: 's', url: 'https://example.com', bounds: { ...bounds, x: -1 } })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(entry.request('harness.browser.control', { sessionId: 's', action: 'reload' })).resolves.toEqual({ method: 'browser.control' })
    await expect(entry.request('harness.browser.control', { sessionId: 's', action: 'hide' })).resolves.toEqual({ method: 'browser.control' })
    await expect(entry.request('harness.browser.control', { sessionId: 's', action: 'show' })).resolves.toEqual({ method: 'browser.control' })
    await expect(entry.request('harness.browser.control', { sessionId: 's', action: 'openDevTools' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(entry.request('harness.terminal.resize', { sessionId: 's', terminalId: 't', columns: 100, rows: 30 })).resolves.toEqual({ method: 'terminal.resize' })
    await expect(entry.request('harness.terminal.resize', { sessionId: 's', terminalId: 't', columns: 1, rows: 30 })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  })

  it('validates session-scoped Git status and exact ignored paths without forwarding filesystem or command controls', async () => {
    const entry = bridge({ appId: 'mira-harness', capabilities: ['harness:workbench'] })
    await expect(entry.request('harness.files.git-status', { sessionId: 's', root: '/private/injected', command: 'reset' })).resolves.toEqual({ method: 'files.git-status' })
    expect(entry.api.invokeFirstPartyHarness).toHaveBeenLastCalledWith('grant-for-novel', 'files.git-status', { sessionId: 's' })
    const paths = ['src/中文 file.ts', 'src/line\nbreak.ts', '-file', ':literal*', 'src/中文 file.ts']
    await expect(entry.request('harness.files.git-ignored', { sessionId: 's', paths, root: '/private/injected' })).resolves.toEqual({ method: 'files.git-ignored' })
    expect(entry.api.invokeFirstPartyHarness).toHaveBeenLastCalledWith('grant-for-novel', 'files.git-ignored', { sessionId: 's', paths: paths.slice(0, -1) })
    vi.mocked(entry.api.invokeFirstPartyHarness).mockClear()
    for (const paths of [undefined, null, {}, Array(513).fill('src/a'), [''], ['../secret'], ['/secret'], ['C:\\secret'], ['file:/secret'], ['bad\0path'], ['a'.repeat(2049)]]) {
      await expect(entry.request('harness.files.git-ignored', { sessionId: 's', paths })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    }
    expect(entry.api.invokeFirstPartyHarness).not.toHaveBeenCalled()
    const denied = bridge({ appId: 'other-app', capabilities: ['harness:workbench'] })
    await expect(denied.request('harness.files.git-status', { sessionId: 's' })).rejects.toMatchObject({ code: 'CAPABILITY_DENIED' })
  })

  it.each(['files.git-status', 'files.git-ignored'])('%s removes unknown Git stderr and path details', async method => {
    const entry = bridge({ appId: 'mira-harness', capabilities: ['harness:workbench'] })
    vi.mocked(entry.api.invokeFirstPartyHarness).mockRejectedValueOnce(new Error('fatal: private /Users/example/repo credential detail'))
    await expect(entry.request(`harness.${method}`, { sessionId: 's', paths: ['src/a'] })).rejects.toMatchObject({ code: 'WORKSPACE_FILE_FAILED', message: 'Git 状态读取失败，请检查 Git 是否安装或稍后刷新重试。' })
  })

  it.each([
    ['Git 未安装或不可用', 'Git 未安装或不可用，请安装 Git 后重试。'],
    ['Git 输出超过 8 MiB 限制，请缩小工作目录', 'Git 输出超过 8 MiB 限制，请缩小工作目录后重试。'],
    ['Git 状态读取超时，请重试', 'Git 状态读取超时，请重试。'],
    ['Git 状态读取繁忙，请稍后重试', 'Git 状态读取繁忙，请稍后重试。'],
    ['Git 元数据不能使用符号链接', 'Git 元数据不能使用符号链接，请选择正常的 Git 工作目录。'],
    ['Git 状态读取失败，请重试', 'Git 状态读取失败，请重试。'],
  ])('maps the safe Git recovery message %s for both readers', async (failure, recovery) => {
    const entry = bridge({ appId: 'mira-harness', capabilities: ['harness:workbench'] })
    vi.mocked(entry.api.invokeFirstPartyHarness).mockRejectedValue(new Error(`Error invoking remote method 'platform:first-party-harness': Error: ${failure}`))
    for (const method of ['files.git-status', 'files.git-ignored']) {
      await expect(entry.request(`harness.${method}`, { sessionId: 's', paths: ['src/a'] })).rejects.toMatchObject({ code: 'WORKSPACE_FILE_FAILED', message: recovery })
    }
  })

  it('validates bounded workspace search requests and forwards only session-scoped search fields', async () => {
    const entry = bridge({ appId: 'mira-harness', capabilities: ['harness:workbench'] })
    await expect(entry.request('harness.files.search', { sessionId: 's', query: 'src/hwb', root: '/private/injected', refresh: true })).resolves.toEqual({ method: 'files.search' })
    expect(entry.api.invokeFirstPartyHarness).toHaveBeenLastCalledWith('grant-for-novel', 'files.search', { sessionId: 's', query: 'src/hwb', refresh: true })
    await expect(entry.request('harness.files.search', { sessionId: 's', query: '' })).resolves.toEqual({ method: 'files.search' })
    expect(entry.api.invokeFirstPartyHarness).toHaveBeenLastCalledWith('grant-for-novel', 'files.search', { sessionId: 's', query: '', refresh: false })
    await expect(entry.request('harness.files.search', { sessionId: 's', query: 'x'.repeat(256) })).resolves.toEqual({ method: 'files.search' })
    vi.mocked(entry.api.invokeFirstPartyHarness).mockClear()
    for (const query of [undefined, null, 42, ['src'], 'x'.repeat(257), 'src\0index', 'src\nindex', 'src\tindex']) {
      await expect(entry.request('harness.files.search', { sessionId: 's', query })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    }
    for (const refresh of [null, 'true', 1]) await expect(entry.request('harness.files.search', { sessionId: 's', query: 'src', refresh })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(entry.request('harness.files.search', { sessionId: '', query: 'src' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    expect(entry.api.invokeFirstPartyHarness).not.toHaveBeenCalled()
    for (const overrides of [{ capabilities: [] }, { appId: 'other-app' }]) {
      const denied = bridge(overrides)
      await expect(denied.request('harness.files.search', { sessionId: 's', query: 'src' })).rejects.toMatchObject({ code: 'CAPABILITY_DENIED' })
      expect(denied.api.invokeFirstPartyHarness).not.toHaveBeenCalled()
    }
  })

  it.each(['工作目录搜索未完成', 'private /Users/example/project I/O detail', "Error invoking remote method 'platform:first-party-harness': Error: private /Users/example/project I/O detail"])('sanitizes workspace search failures: %s', async source => {
    const entry = bridge({ appId: 'mira-harness', capabilities: ['harness:workbench'] })
    vi.mocked(entry.api.invokeFirstPartyHarness).mockRejectedValueOnce(new Error(source))
    await expect(entry.request('harness.files.search', { sessionId: 's', query: 'src' })).rejects.toMatchObject({ code: 'WORKSPACE_FILE_FAILED', message: '工作目录搜索未完成，请检查目录访问权限后重试。' })
  })

  it('forwards only validated prepared creation fields through the owner grant', async () => {
    const entry = bridge({ appId: 'mira-harness', capabilities: ['harness:workbench'] })
    await expect(entry.request('harness.session.create', { prepared: true, projectId: 'project', draft: { groupId: 'group' } })).resolves.toEqual({ method: 'session.create' })
    expect(entry.api.invokeFirstPartyHarness).toHaveBeenLastCalledWith('grant-for-novel', 'session.create', { prepared: true, projectId: 'project' })
    vi.mocked(entry.api.invokeFirstPartyHarness).mockClear()
    for (const prepared of ['true', null, 1]) await expect(entry.request('harness.session.create', { prepared })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    expect(entry.api.invokeFirstPartyHarness).not.toHaveBeenCalled()
  })

  it.each(harnessModelCalls)('$method preserves every supported reasoning level and strips untrusted model fields', async ({ method, params }) => {
    const entry = bridge({ appId: 'mira-harness', capabilities: ['harness:workbench'] })
    for (const thinkingLevel of ['off', 'low', 'medium', 'high', undefined]) {
      const selection = { providerId: 'p', modelId: 'm', ...(thinkingLevel === undefined ? {} : { thinkingLevel }) }
      await expect(entry.request(`harness.${method}`, { ...params, selection: { ...selection, apiKey: 'injected', endpoint: 'https://injected.invalid' } })).resolves.toEqual({ method })
      expect(entry.api.invokeFirstPartyHarness).toHaveBeenLastCalledWith('grant-for-novel', method, expect.objectContaining({ selection }))
    }
  })

  it.each(harnessModelCalls)('$method rejects invalid reasoning levels before invoking the host', async ({ method, params }) => {
    const entry = bridge({ appId: 'mira-harness', capabilities: ['harness:workbench'] })
    for (const thinkingLevel of ['minimal', 'xhigh', 'max', 'ultra', 'Medium', '', 'high\0', null, false, 1, ['high']]) {
      await expect(entry.request(`harness.${method}`, { ...params, selection: { providerId: 'p', modelId: 'm', thinkingLevel } })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    }
    for (const selection of [{ providerId: 'p\0', modelId: 'm' }, { providerId: 'p', modelId: 'm\0' }]) {
      await expect(entry.request(`harness.${method}`, { ...params, selection })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    }
    expect(entry.api.invokeFirstPartyHarness).not.toHaveBeenCalled()
  })

  it.each(harnessModelCalls.slice(0, 2))('$method accepts native picker attachments without granting workspace browsing access', async ({ method, params }) => {
    const entry = bridge({ appId: 'mira-harness', capabilities: ['harness:workbench'] })
    for (const path of [...selectedFilePaths, 'docs/a.md', 'docs\\a.md']) {
      const references = [{ path, name: 'notes.md', content: 'injected', extra: 'ignored' }]
      await expect(entry.request(`harness.${method}`, { ...params, references, selection: { providerId: 'p', modelId: 'm' } })).resolves.toEqual({ method })
      expect(entry.api.invokeFirstPartyHarness).toHaveBeenLastCalledWith('grant-for-novel', method, expect.objectContaining({ references: [{ path, name: 'notes.md' }] }))
    }
  })

  it.each(harnessModelCalls.slice(0, 2))('$method rejects malformed, traversing and oversized attachment requests', async ({ method, params }) => {
    const entry = bridge({ appId: 'mira-harness', capabilities: ['harness:workbench'] })
    const request = (references: unknown) => entry.request(`harness.${method}`, { ...params, references, selection: { providerId: 'p', modelId: 'm' } })
    for (const path of ['', ' ', '../secret', 'docs/../secret', 'docs\\..\\secret', 'C:notes.md', '\\notes.md', '\\\\server', '/tmp/note\0.md', 'note\0.md', 'a'.repeat(2049), null, 42]) {
      await expect(request([{ path, name: 'notes.md' }])).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    }
    for (const references of [null, 'notes.md', [null], [{ path: 'note.md', name: 'a'.repeat(513) }], [{ path: 'note.md', name: 'note\0.md' }], ...[13, 33].map(length => Array.from({ length }, (_, index) => ({ path: `note-${index}.md`, name: 'note.md' })))]) {
      await expect(request(references)).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    }
    expect(entry.api.invokeFirstPartyHarness).not.toHaveBeenCalled()
    await expect(request(Array.from({ length: 12 }, (_, index) => ({ path: `note-${index}.md`, name: 'note.md' })))).resolves.toEqual({ method })
  })

  it.each(fileReferenceCalls.flatMap(call => fileReferenceFailures.flatMap(failure => [false, true].map(wrapped => ({ ...call, ...failure, wrapped })))))('$method sanitizes $source (Electron wrapper: $wrapped) into an actionable attachment error', async ({ method, params, source, recovery, wrapped }) => {
    const entry = bridge({ appId: 'mira-harness', capabilities: ['harness:workbench'] })
    const privatePath = '/Users/mira/private-project/client-contract.md'
    const message = `${source}${privatePath}`
    const error = new Error(wrapped ? `Error invoking remote method 'platform:first-party-harness': Error: ${message}` : message)
    vi.mocked(entry.api.invokeFirstPartyHarness).mockRejectedValueOnce(error)

    const result = await entry.request(`harness.${method}`, params).catch(error => error)
    expect(result).toBeInstanceOf(FirstPartyBridgeError)
    expect(result).toMatchObject({ code: 'FILE_REFERENCE_FAILED', message: recovery })
    expect(result.message).not.toContain(privatePath)
    expect(result.message).not.toContain('platform:first-party-harness')
    expect(result.stack).not.toContain(privatePath)
  })

  it.each(fileReferenceCalls)('$method preserves unknown host failures for the frame error boundary', async ({ method, params }) => {
    const entry = bridge({ appId: 'mira-harness', capabilities: ['harness:workbench'] })
    const stackOnly = new Error('文件读取失败')
    stackOnly.stack += '\n引用文件不存在：/private/client-contract.md'
    for (const error of [new Error('模型请求失败：token=private'), 'host unavailable', { message: '引用文件不存在：/private/client-contract.md' }, stackOnly]) {
      vi.mocked(entry.api.invokeFirstPartyHarness).mockRejectedValueOnce(error)
      await expect(entry.request(`harness.${method}`, params)).rejects.toBe(error)
    }
  })

  it.each([
    { method: 'sessions.list', params: {} },
    { method: 'files.list', params: { sessionId: 's', path: 'src' } },
    { method: 'files.read', params: { sessionId: 's', path: 'src/main.ts' } },
    { method: 'terminal.write', params: { sessionId: 's', terminalId: 't', data: '\r' } },
    { method: 'run.rerun', params: { sessionId: 's', selection: { providerId: 'p', modelId: 'm' } } },
  ])('$method does not reinterpret file-like failures from unrelated host operations', async ({ method, params }) => {
    const entry = bridge({ appId: 'mira-harness', capabilities: ['harness:workbench'] })
    for (const { source } of fileReferenceFailures) {
      const error = new Error(`Error invoking remote method 'platform:first-party-harness': Error: ${source}/private/client-contract.md`)
      vi.mocked(entry.api.invokeFirstPartyHarness).mockRejectedValueOnce(error)
      await expect(entry.request(`harness.${method}`, params)).rejects.toBe(error)
    }
  })

  it.each(['files.list', 'files.read'])('%s still rejects absolute paths, traversal and NUL', async method => {
    const entry = bridge({ appId: 'mira-harness', capabilities: ['harness:workbench'] })
    for (const path of [...selectedFilePaths, '../secret', 'docs/../secret', 'docs\\..\\secret', 'note\0.md']) {
      await expect(entry.request(`harness.${method}`, { sessionId: 's', path })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    }
    expect(entry.api.invokeFirstPartyHarness).not.toHaveBeenCalled()
  })

  it.each(['files.list', 'files.read'].flatMap(method => workspaceFileFailures.flatMap(failure => [false, true].map(wrapped => ({ method, ...failure, wrapped })))))('$method maps $source (Electron wrapper: $wrapped) to a safe workspace error', async ({ method, source, recovery, wrapped }) => {
    const entry = bridge({ appId: 'mira-harness', capabilities: ['harness:workbench'] })
    const message = wrapped ? `Error invoking remote method 'platform:first-party-harness': Error: ${source}` : source
    vi.mocked(entry.api.invokeFirstPartyHarness).mockRejectedValueOnce(new Error(message))
    await expect(entry.request(`harness.${method}`, { sessionId: 's', path: 'note.md' })).rejects.toMatchObject({ code: 'WORKSPACE_FILE_FAILED', message: recovery })
  })

  it.each(['files.list', 'files.read'])('%s keeps unknown errors and path-bearing messages for the frame sanitizer', async method => {
    const entry = bridge({ appId: 'mira-harness', capabilities: ['harness:workbench'] })
    const stackOnly = new Error('private I/O failure')
    stackOnly.stack += '\n文件或目录不存在'
    for (const error of [new Error('模型请求失败：token=private'), new Error('文件或目录不存在：/private/note.md'), { message: '文件或目录不存在' }, '文件或目录不存在', stackOnly]) {
      vi.mocked(entry.api.invokeFirstPartyHarness).mockRejectedValueOnce(error)
      await expect(entry.request(`harness.${method}`, { sessionId: 's', path: 'note.md' })).rejects.toBe(error)
    }
  })

  it('forwards raw terminal control and whitespace input while keeping terminal IDs and input bounds validated', async () => {
    const entry = bridge({ appId: 'mira-harness', capabilities: ['harness:workbench'] })
    for (const data of ['\0', '\r', '\n', '\t', ' ', '\u0003', '\u001b[A']) {
      await expect(entry.request('harness.terminal.write', { sessionId: 's', terminalId: 't', data })).resolves.toEqual({ method: 'terminal.write' })
      expect(entry.api.invokeFirstPartyHarness).toHaveBeenLastCalledWith('grant-for-novel', 'terminal.write', { sessionId: 's', terminalId: 't', data })
    }
    vi.mocked(entry.api.invokeFirstPartyHarness).mockClear()
    for (const params of [{ sessionId: 's\0', terminalId: 't', data: '\0' }, { sessionId: 's', terminalId: 't\0', data: '\0' }, { sessionId: 's', terminalId: 't', data: '' }, { sessionId: 's', terminalId: 't', data: 'x'.repeat(100_001) }]) {
      await expect(entry.request('harness.terminal.write', params)).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    }
    for (const data of [null, false, 42, ['raw']]) await expect(entry.request('harness.terminal.write', { sessionId: 's', terminalId: 't', data })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    expect(entry.api.invokeFirstPartyHarness).not.toHaveBeenCalled()
  })
})
