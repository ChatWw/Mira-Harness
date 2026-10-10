// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MiraHighlightResult } from '../apps/harness-react/src/lib/code-highlight-protocol'
import { parseMiraToolDiff, miraToolDiffStats } from '../apps/harness-react/src/lib/tool-diff'
import { MiraToolDiff } from '../apps/harness-react/src/components/conversation/MiraToolDiff'

const mocks = vi.hoisted(() => ({ highlight: vi.fn() }))
vi.mock('../apps/harness-react/src/lib/code-highlighter', () => ({ miraCodeHighlighter: { highlight: mocks.highlight }, miraCodeThemes: ['github-light', 'github-dark'] }))
type Request = { options: { code: string; language: string }; signal: AbortSignal; resolve: (result: MiraHighlightResult) => void; reject: (error: Error) => void }
let root: Root | undefined, container: HTMLDivElement, requests: Request[]
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  requests = []; mocks.highlight.mockReset().mockImplementation((options, signal) => new Promise((resolve, reject) => requests.push({ options, signal, resolve, reject })))
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); document.body.replaceChildren() })
const numbered = ' 10 const before = 1;\n-11 const old = 2;\n+12 const next = 3;\n    ...'
const unified = '--- a/main.ts\n+++ b/main.ts\n@@ -3,3 +10,3 @@\n context\n-old\n+new\n tail'
const render = async (diff = numbered, identity = 'task-A', path = 'main.ts') => { await act(async () => root!.render(<MiraToolDiff diff={diff} identity={identity} path={path} />)) }
const tokenized = (code: string): MiraHighlightResult => ({ tokens: code.split('\n').map(content => [{ content, offset: 0, htmlStyle: { color: '#663399', '--shiki-dark': '#cc99ff' } }]) })
const complete = async (request: Request) => { await act(async () => request.resolve(tokenized(request.options.code))) }
const source = () => [...container.querySelectorAll<HTMLElement>('[data-diff-source]')].map(line => line.dataset.diffSource).join('\n')
const numbers = () => [...container.querySelectorAll<HTMLElement>('[data-diff-number]')].map(line => line.dataset.diffNumber)

describe('Mira public tool diff projection', () => {
  it('uses each supplied native number without guessing old/new ranges', () => {
    const parsed = parseMiraToolDiff('-90 old\n+12 new\n 13 tail')
    expect(parsed.format).toBe('numbered'); expect(parsed.lines.map(line => line.number)).toEqual([90, 12, 13])
    expect(miraToolDiffStats('-90 old\n+12 new\n 13 tail')).toEqual({ added: 1, removed: 1 })
  })
  it('accepts padded native numbers, empty code and omission metadata', () => {
    const parsed = parseMiraToolDiff('-  9 \n+ 10 +literal\n     ...\n')
    expect(parsed.format).toBe('numbered')
    expect(parsed.lines.map(line => [line.kind, line.number, line.text])).toEqual([['removed', 9, ''], ['added', 10, '+literal'], ['meta', undefined, '     ...'], ['meta', undefined, '']])
  })
  it('derives unified numbers only from the declared complete hunk', () => {
    const parsed = parseMiraToolDiff(unified)
    expect(parsed.format).toBe('unified'); expect(parsed.lines.map(line => line.number)).toEqual([undefined, undefined, undefined, 10, 4, 11, 12])
    expect(miraToolDiffStats(unified)).toEqual({ added: 1, removed: 1 })
  })
  it.each([
    ['@@ -0,0 +1,2 @@\n+first\n+second', [undefined, 1, 2], { added: 2, removed: 0 }],
    ['@@ -1 +0,0 @@\n-old\n\\ No newline at end of file', [undefined, 1, undefined], { added: 0, removed: 1 }],
    ['@@ -10 +20 @@\n--- code\n+++ code', undefined, undefined],
    ['@@ -10 +20 @@\n--- code\n+new', [undefined, 10, 20], { added: 1, removed: 1 }],
    ['@@ -1 +1 @@\n-old\n+new\n@@ -9 +20 @@\n-last\n+next', [undefined, 1, 1, undefined, 9, 20], { added: 2, removed: 2 }],
  ])('projects unified %s without treating metadata as source code', (diff, expectedNumbers, stats) => {
    const parsed = parseMiraToolDiff(diff)
    expect(parsed.format).toBe(expectedNumbers ? 'unified' : 'raw')
    if (expectedNumbers) expect(parsed.lines.map(line => line.number)).toEqual(expectedNumbers)
    expect(miraToolDiffStats(diff)).toEqual(stats)
    expect(parsed.lines.map(line => line.source).join('\n')).toBe(diff)
  })
  it.each(['+unscoped text\n-old', '+12 new\nunrecognized', '@@ -1,2 +1,2 @@\n-old\n+new', '@@ -0 +1 @@\n-old\n+new', '+9007199254740992 unsafe', '--- a/file\n+++ b/file', ''])('preserves unknown/incomplete %s without claimed numbers or totals', diff => {
    const parsed = parseMiraToolDiff(diff)
    expect(parsed.format).toBe('raw'); expect(parsed.lines.every(line => line.number === undefined)).toBe(true)
    expect(parsed.lines.map(line => line.source).join('\n')).toBe(diff); expect(miraToolDiffStats(diff)).toBeUndefined()
  })
  it('retains CRLF, source whitespace and every line', () => {
    const diff = ' 10  leading \r\n-11 old\r\n+12 new\r\n'
    expect(parseMiraToolDiff(diff).lines.map(line => line.source).join('\n')).toBe(diff)
    expect(parseMiraToolDiff(diff).lines[0].text).toBe(' leading ')
  })
})

describe('Mira inline tool diff DOM and worker lifetime', () => {
  it('renders complete plain code first, then asynchronously colors the same text', async () => {
    await render()
    expect(source()).toBe(numbered); expect(numbers()).toEqual(['10', '11', '12'])
    expect(container.querySelector('[data-diff-highlight="plain"]')).not.toBeNull()
    expect(container.querySelector('[data-diff-token]')).toBeNull()
    expect(requests[0].options).toMatchObject({ language: 'typescript', code: 'const before = 1;\nconst old = 2;\nconst next = 3;\n' })
    await complete(requests[0])
    expect(source()).toBe(numbered); expect(container.querySelector('[data-diff-highlight="highlighted"]')).not.toBeNull()
    expect(container.querySelector<HTMLElement>('[data-diff-token]')?.style.getPropertyValue('--shiki-dark')).toBe('#cc99ff')
  })
  it('shows hunk and omission rows without fake gutters or code tokens', async () => {
    await render(unified); await complete(requests[0])
    const metadata = [...container.querySelectorAll('[data-diff-kind="meta"]')]
    expect(metadata).toHaveLength(3); expect(metadata.every(row => !row.querySelector('[data-diff-number]') && !row.querySelector('[data-diff-token]'))).toBe(true)
    expect(numbers()).toEqual(['10', '4', '11', '12'])
    await render(numbered); await complete(requests[1])
    expect(container.querySelector('[data-diff-kind="meta"]')?.textContent).toContain('...')
    expect(container.querySelector('[data-diff-kind="meta"] [data-diff-number]')).toBeNull()
  })
  it('cancels old owner/path work and ignores late results even when source text is identical', async () => {
    await render(); const old = requests[0]
    await render(numbered, 'task-B', 'main.py')
    expect(old.signal.aborted).toBe(true); expect(requests[1].options.language).toBe('python')
    await complete(old)
    expect(container.querySelector('[data-diff-token]')).toBeNull(); expect(source()).toBe(numbered)
    await complete(requests[1]); expect(container.querySelector('[data-diff-token]')).not.toBeNull()
  })
  it('resets highlighted state immediately on changed diff and rejects late errors', async () => {
    await render(); await complete(requests[0])
    await render('+1 new file'); const stale = requests[1]
    expect(container.querySelector('[data-diff-token]')).toBeNull()
    await render('+2 current file')
    await act(async () => stale.reject(new Error('late failure')))
    expect(container.querySelector('[role="alert"]')).toBeNull(); expect(source()).toBe('+2 current file')
  })
  it('keeps full diff after failure and retries through the real DOM control', async () => {
    await render(); await act(async () => requests[0].reject(new Error('worker unavailable')))
    expect(source()).toBe(numbered); expect(container.querySelector('[role="alert"]')?.textContent).toContain('完整保留')
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="重试变更代码高亮"]')!.click())
    expect(requests[0].signal.aborted).toBe(true); expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(source()).toBe(numbered); await complete(requests[1])
    expect(container.querySelector('[data-diff-highlight="highlighted"]')).not.toBeNull()
  })
  it('aborts unmounted work without resurrecting a result', async () => {
    await render(); const pending = requests[0]
    await act(async () => root!.unmount()); root = undefined
    expect(pending.signal.aborted).toBe(true); await complete(pending); expect(container.textContent).toBe('')
  })
  it('never lets missing or shortened worker tokens replace authoritative code', async () => {
    await render()
    await act(async () => requests[0].resolve({ tokens: [[{ content: 'truncated', offset: 0 }]] }))
    expect(source()).toBe(numbered); expect(container.textContent).toContain('const before = 1;')
    expect(container.textContent).toContain('const next = 3;'); expect(container.textContent).not.toContain('truncated')
  })
  it('keeps ambiguous raw source escaped and skips syntactic guesses', async () => {
    const diff = '<script>raw</script>\n+no-range'
    await render(diff)
    expect(container.querySelector('pre')?.textContent).toBe(diff); expect(container.querySelector('script')).toBeNull()
    expect(mocks.highlight).not.toHaveBeenCalled()
  })
  it('keeps all lines beyond upstream preview limits and sends full source to the worker', async () => {
    const diff = Array.from({ length: 2500 }, (_, index) => `+${index + 1} ${'x'.repeat(50)} ${index}`).join('\n')
    await render(diff)
    expect(diff.length).toBeGreaterThan(120_000); expect(container.querySelectorAll('[data-diff-kind="added"]')).toHaveLength(2500)
    expect(source()).toBe(diff); expect(requests[0].options.code.split('\n')).toHaveLength(2500)
    expect(requests[0].options.code.endsWith('2499')).toBe(true)
  })
})
