// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraWorkflowArtifactPreview } from '../apps/harness-react/src/components/workflows/MiraWorkflowArtifactPreview'
import { MiraWorkflowArtifactPane } from '../apps/harness-react/src/components/workflows/MiraWorkflowArtifactPane'
import { MiraWorkflowRunPane } from '../apps/harness-react/src/components/workflows/MiraWorkflowRunPane'
import type { MiraWorkflowHost } from '../apps/harness-react/src/components/workflows/workflow-model'
import type { MiraFlowWorkbenchRequest } from '../src/config/miraFlowWorkbench'
const identity = { sessionId: 'session', runId: 'run' }
const artifact = { id: 'draft', kind: 'markdown' as const, version: 1, title: '已发布草稿', contentType: 'text/markdown', bytes: 128 }
const encoded = (text: string, contentType = 'text/markdown') => ({ dataBase64: Buffer.from(text).toString('base64'), contentType, bytes: Buffer.byteLength(text), title: artifact.title })
let root: Root | undefined
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.unstubAllGlobals() })
async function mount(element: React.ReactNode) {
  const container = document.createElement('div'); container.id = 'root'; document.body.append(container)
  root = createRoot(container); await act(async () => root!.render(element))
  return async (next: React.ReactNode) => { await act(async () => root!.render(next)) }
}
const button = (label: string) => { const value = [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.getAttribute('aria-label') === label || item.textContent?.trim() === label); if (!value) throw new Error(`Missing ${label}`); return value }
async function click(label: string) { await act(async () => button(label).click()) }
function fixture(handler: (request: MiraFlowWorkbenchRequest) => unknown) {
  const request = vi.fn(async (value: MiraFlowWorkbenchRequest) => handler(value))
  return { request, host: { requestWorkflow: request as MiraWorkflowHost['requestWorkflow'], onWorkflowEvent: () => () => undefined } }
}
describe('workflow published-version preview and native-save UI', () => {
  it('opens a pinned historical version and copies its published content', async () => {
    const copy = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText: copy } })
    const view = fixture(request => request.action === 'artifacts.read' ? encoded('# First published version') : { run: { ...identity, status: 'completed', spentTokens: 0 }, events: [], actors: [], nodes: [1, 2].map(version => ({ kind: 'artifact', status: 'completed', result: { ...artifact, version } })) })
    await mount(<MiraWorkflowArtifactPane host={view.host} identity={identity} artifactId="draft" version={1} active />)
    expect(document.querySelector('h1')?.textContent).toBe('First published version')
    expect(view.request).toHaveBeenLastCalledWith({ action: 'artifacts.read', ...identity, artifactId: 'draft', version: 1 })
    await click('复制')
    expect(copy).toHaveBeenCalledWith('# First published version')
  })
  it('previews published Markdown without inherited links/images or renderer-provided paths', async () => {
    const view = fixture(() => encoded('# Immutable draft\n[remote](https://example.com)\n![remote image](https://example.com/pixel.png)\n<script>alert(1)</script>'))
    await mount(<MiraWorkflowArtifactPreview host={view.host} identity={identity} artifact={artifact} active />)
    await click('预览产物 draft 版本 1')
    expect(document.querySelector('h1')?.textContent).toBe('Immutable draft')
    expect(document.querySelector('.mira-workflow-artifact__markdown a, .mira-workflow-artifact__markdown img, .mira-workflow-artifact__markdown script')).toBeNull()
    expect(document.body.textContent).toContain('<script>alert(1)</script>')
    expect(view.request).toHaveBeenCalledWith({ action: 'artifacts.read', ...identity, artifactId: 'draft', version: 1 })
  })
  it('loads a newly selected version while the previous automatic preview is still pending', async () => {
    let finish!: (value: ReturnType<typeof encoded>) => void
    const pending = new Promise<ReturnType<typeof encoded>>(resolve => { finish = resolve })
    const view = fixture(request => 'version' in request && request.version === 1 ? pending : encoded('# Current version'))
    const rerender = await mount(<MiraWorkflowArtifactPreview host={view.host} identity={identity} artifact={artifact} active mode="detail" />)
    await rerender(<MiraWorkflowArtifactPreview host={view.host} identity={identity} artifact={{ ...artifact, version: 2 }} active mode="detail" />)
    expect(document.querySelector('h1')?.textContent).toBe('Current version')
    await rerender(<MiraWorkflowArtifactPreview host={view.host} identity={identity} artifact={{ ...artifact, version: 3 }} active mode="detail" />)
    expect(view.request).toHaveBeenLastCalledWith({ action: 'artifacts.read', ...identity, artifactId: 'draft', version: 3 })
    await act(async () => finish(encoded('# Old version')))
    expect(document.querySelector('h1')?.textContent).toBe('Current version')
  })
  it('keeps HTML as escaped source, without iframe or executable DOM', async () => {
    const view = fixture(() => encoded('<h1>HTML</h1><script>bad()</script>', 'text/html'))
    await mount(<MiraWorkflowArtifactPreview host={view.host} identity={identity} artifact={{ ...artifact, kind: 'file', contentType: 'text/html' }} active />)
    await click('预览产物 draft 版本 1')
    expect(document.querySelector('pre')?.textContent).toBe('<h1>HTML</h1><script>bad()</script>')
    expect(document.querySelector('iframe, h1, script')).toBeNull()
  })
  it('late bytes from another run cannot appear after owner changes', async () => {
    let deliver!: (value: ReturnType<typeof encoded>) => void
    const pending = new Promise<ReturnType<typeof encoded>>(resolve => { deliver = resolve })
    const view = fixture(() => pending)
    const rerender = await mount(<MiraWorkflowArtifactPreview host={view.host} identity={identity} artifact={artifact} active />)
    await click('预览产物 draft 版本 1')
    await rerender(<MiraWorkflowArtifactPreview host={view.host} identity={{ sessionId: 'other', runId: 'other-run' }} artifact={artifact} active />)
    await act(async () => deliver(encoded('OLD-RUN-BYTES')))
    expect(document.body.textContent).not.toContain('OLD-RUN-BYTES')
    expect(document.querySelector('.mira-workflow-artifact__preview')).toBeNull()
  })
  it('native save cancel does not claim success, then successful retry does', async () => {
    let saved = false
    const view = fixture(() => ({ saved }))
    await mount(<MiraWorkflowArtifactPreview host={view.host} identity={identity} artifact={artifact} active />)
    await click('保存产物 draft 版本 1')
    expect(document.body.textContent).not.toContain('已保存这份发布版本')
    expect(view.request).toHaveBeenLastCalledWith({ action: 'artifacts.save', ...identity, artifactId: 'draft', version: 1 })
    saved = true; await click('保存产物 draft 版本 1')
    expect(document.body.textContent).toContain('已保存这份发布版本')
  })
  it('retries the exact version after read rejection and does not read oversized text', async () => {
    let failing = true
    const view = fixture(() => { if (failing) throw new Error('产物不可读取'); return encoded('Recovered') })
    const rerender = await mount(<MiraWorkflowArtifactPreview host={view.host} identity={identity} artifact={artifact} active />)
    await click('预览产物 draft 版本 1'); expect(document.querySelector('[role=alert]')?.textContent).toContain('产物不可读取')
    failing = false; await click('重试读取'); expect(document.body.textContent).toContain('Recovered')
    await rerender(<MiraWorkflowArtifactPreview host={view.host} identity={identity} artifact={{ ...artifact, version: 2, bytes: 2 * 1024 * 1024 }} active />)
    expect(document.querySelector('[aria-label="预览产物 draft 版本 2"]')).toBeNull()
    expect(document.body.textContent).toContain('文件较大')
  })
  it('renders bitmap decode errors and preserves native save', async () => {
    const view = fixture(() => encoded('not valid image bytes', 'image/png'))
    await mount(<MiraWorkflowArtifactPreview host={view.host} identity={identity} artifact={{ ...artifact, kind: 'file', contentType: 'image/png' }} active />)
    await click('预览产物 draft 版本 1')
    expect(document.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/png;base64,/)
    await act(async () => document.querySelector('img')!.dispatchEvent(new Event('error')))
    expect(document.body.textContent).toContain('图片无法解码')
    expect(button('保存产物 draft 版本 1').disabled).toBe(false)
  })
  it('does not invent byte preview/save actions for preset report projections', async () => {
    const view = fixture(() => ({ run: { ...identity, parentSessionId: identity.sessionId, status: 'completed', caps: { maxConcurrency: 2 }, spentTokens: 0 }, nodes: [{ runId: 'run', siteId: 'preset', ordinal: 0, kind: 'artifact', inputHash: 'hash', status: 'completed', artifactId: 'metrics', result: { id: 'metrics', kind: 'metrics', version: 1, spec: {} } }], events: [], actors: [] }))
    await mount(<MiraWorkflowRunPane host={view.host} identity={identity} providers={[]} />)
    expect(document.body.textContent).toContain('预置看板数据，没有发布的文件内容')
    expect(document.querySelector('[aria-label^="预览产物"], [aria-label^="保存产物"]')).toBeNull()
    expect(view.request.mock.calls).toHaveLength(1)
  })
})
