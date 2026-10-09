import { describe, expect, it, vi } from 'vitest'
import { firstPartyAppManifests } from '../src/config/firstPartyApps'
import { handleFirstPartyRequest } from '../src/platform/firstPartyBridge'
import { parseFirstPartyHarnessCall } from '../src/platform/firstPartyHarness'
import type { PlatformApi } from '../src/types'

function bridge() {
  const invoke = vi.fn(async (_grantId: string, _method: string, _params: unknown): Promise<unknown> => undefined)
  const options = {
    manifest: firstPartyAppManifests.find(manifest => manifest.appId === 'mira-harness')!, grantId: 'grant',
    api: { invokeFirstPartyHarness: invoke } as unknown as PlatformApi,
    context: { version: 1 as const, theme: 'light' as const, language: 'zh-CN', user: { id: 'user', name: 'Mira' } },
    route: '/workspace/harness-react', navigate: vi.fn(),
  }
  const request = (method: string, params?: unknown) => handleFirstPartyRequest(options, { type: 'mira:request', id: 'request', method: `harness.${method}`, params })
  return { invoke, request }
}

describe('workspace editor and watch bridge boundaries', () => {
  it('passes only session and relative path to image preview, ignoring renderer MIME, size and root overrides', async () => {
    const { request, invoke } = bridge()
    await request('files.read-image', { sessionId: 's', path: 'images/a.png', mediaType: 'text/html', maxBytes: 999999999, workspacePath: '/private/injected' })
    expect(invoke).toHaveBeenCalledExactlyOnceWith('grant', 'files.read-image', { sessionId: 's', path: 'images/a.png' })
  })
  it('rejects image URLs, absolute paths, traversal and NUL before host invocation', async () => {
    const { request, invoke } = bridge()
    for (const path of ['', 'https://example.com/a.png', '/tmp/a.png', 'C:/a.png', '../a.png', 'a/../b.png', 'a\\b.png', 'a\0.png']) {
      await expect(request('files.read-image', { sessionId: 's', path })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    }
    expect(invoke).not.toHaveBeenCalled()
  })
  it.each([
    ['图片格式暂不支持预览', '该图片格式暂不支持预览，请使用外部应用打开。'],
    ['图片文件超过 4 MiB 预览限制', '图片超过 4 MiB 预览限制，请使用外部应用打开。'],
    ['文件在读取期间发生变化，请重试', '文件在读取期间发生变化，请重试。'],
    ['目标不是文件', '该路径不是可预览的图片文件，请刷新文件列表后重试。'],
  ])('keeps recoverable image errors: %s', async (failure, message) => {
    const { request, invoke } = bridge()
    invoke.mockRejectedValue(new Error(`Error invoking remote method 'platform:first-party-harness': Error: ${failure}`))
    await expect(request('files.read-image', { sessionId: 's', path: 'a.png' })).rejects.toMatchObject({ code: 'WORKSPACE_FILE_FAILED', message })
  })
  it('accepts directory roots and only Mira editor identifiers', () => {
    expect(parseFirstPartyHarnessCall('files.open-editor', { sessionId: 's', path: '', editorId: 'mira-finder' })).toEqual({ method: 'files.open-editor', sessionId: 's', path: '', editorId: 'mira-finder' })
    for (const editorId of ['code', '/bin/sh', 'mira-vscode --wait', 'mira-$(x)']) expect(() => parseFirstPartyHarnessCall('files.open-editor', { sessionId: 's', path: 'a.md', editorId })).toThrow('打开方式')
    for (const path of ['/tmp/a', '../a', 'C:/a', 'a/../b']) expect(() => parseFirstPartyHarnessCall('files.open-editor', { sessionId: 's', path, editorId: 'mira-vscode' })).toThrow('路径')
  })
  it('explicitly requests editor redetection without accepting arbitrary refresh data', () => {
    expect(parseFirstPartyHarnessCall('editors.list', undefined)).toEqual({ method: 'editors.list', refresh: false })
    expect(parseFirstPartyHarnessCall('editors.list', { refresh: true })).toEqual({ method: 'editors.list', refresh: true })
    expect(() => parseFirstPartyHarnessCall('editors.list', { refresh: 'yes' })).toThrow('刷新状态')
  })
  it('delegates editor opening with the host grant and relative path', async () => {
    const { request, invoke } = bridge()
    await request('files.open-editor', { sessionId: 's', path: 'notes/a.md', editorId: 'mira-textedit', executable: '/bin/sh' })
    expect(invoke).toHaveBeenCalledExactlyOnceWith('grant', 'files.open-editor', { sessionId: 's', path: 'notes/a.md', editorId: 'mira-textedit' })
  })
  it.each([
    ['files.watch', { sessionId: 's', paths: [''] }],
    ['files.unwatch', { sessionId: 's', watchId: 'w' }],
    ['files.open-editor', { sessionId: 's', path: 'a.md', editorId: 'mira-textedit' }],
    ['editors.list', undefined],
    ['files.read-image', { sessionId: 's', path: 'a.png' }],
  ])('redacts unexpected host details for %s', async (method, params) => {
    const { request, invoke } = bridge()
    invoke.mockRejectedValue(new Error("Error invoking remote method 'platform:first-party-harness': Error: private /Users/secret token=unsafe"))
    const error = await request(method as string, params).catch(cause => cause)
    expect(error.message).not.toMatch(/secret|unsafe|token|remote method/)
    expect(error.code).toBe('WORKSPACE_FILE_FAILED')
  })
  it('keeps a recoverable watch permission error', async () => {
    const { request, invoke } = bridge()
    invoke.mockRejectedValue(new Error("Error invoking remote method 'platform:first-party-harness': Error: 没有权限监听文件或目录，请检查系统访问权限后重试。"))
    await expect(request('files.watch', { sessionId: 's', paths: [''] })).rejects.toMatchObject({ code: 'WORKSPACE_FILE_FAILED', message: '没有权限监听文件或目录，请检查系统访问权限后重试。' })
  })
  it.each([
    'Trae 未安装或已卸载，请选择其他打开方式',
    'TextEdit 只支持打开文件，请从文件菜单选择打开方式',
    '无法用 Finder 打开，请检查应用或选择其他打开方式',
  ])('keeps only fixed installed-editor failures: %s', async failure => {
    const { request, invoke } = bridge()
    invoke.mockRejectedValue(new Error(`Error invoking remote method 'platform:first-party-harness': Error: ${failure}`))
    await expect(request('files.open-editor', { sessionId: 's', path: '', editorId: 'mira-finder' })).rejects.toMatchObject({ code: 'WORKSPACE_FILE_FAILED', message: `${failure}。` })
  })
  it('does not treat an arbitrary application name as a safe editor failure', async () => {
    const { request, invoke } = bridge()
    invoke.mockRejectedValue(new Error('无法用 /Users/private/token=unsafe 打开，请检查应用或选择其他打开方式'))
    await expect(request('files.open-editor', { sessionId: 's', path: '', editorId: 'mira-finder' })).rejects.toMatchObject({ code: 'WORKSPACE_FILE_FAILED', message: '编辑器打开失败，请检查应用或选择其他打开方式。' })
  })
})
