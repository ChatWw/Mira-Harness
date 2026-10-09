import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FilePreviewPanel, FilePreviewSource } from '../apps/harness-react/src/components/workspace/FilePreviewPanel'
import { createFilePreviewReader, filePreviewAbsolutePath, filePreviewBreadcrumbs, filePreviewKey, filePreviewLanguage, startFilePreviewRead, type FilePreviewSnapshot } from '../apps/harness-react/src/lib/file-preview'
import { miraCodeHighlighter, miraCodeThemes } from '../apps/harness-react/src/lib/code-highlighter'
import { highlightFilePreview } from '../apps/harness-react/src/lib/file-preview-highlighter'
import { renderCompletedMarkdown } from '../apps/harness-react/src/components/conversation/markdown'
import type { PilotController } from '../apps/harness-react/src/state/pilot-state'
import { createMiraHighlightCore } from '../apps/harness-react/src/lib/code-highlight-core'

vi.mock('../apps/harness-react/src/lib/code-highlight-worker-client', async () => {
  const { createMiraHighlightCore } = await import('../apps/harness-react/src/lib/code-highlight-core')
  return { miraCodeHighlightWorker: { highlight: createMiraHighlightCore() } }
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('React Harness independent file preview', () => {
  it.each([
    ['src/index.ts', 'typescript'], ['App.TSX', 'tsx'], ['script.js', 'javascript'], ['script.mjs', 'javascript'],
    ['src/hello.jsx', 'jsx'], ['App.vue', 'vue'], ['README.md', 'markdown'], ['notes.markdown', 'markdown'],
    ['package.json', 'json'], ['tsconfig.jsonc', 'jsonc'], ['run.sh', 'shell'], ['setup.bash', 'shell'],
    ['main.py', 'python'], ['app.css', 'css'], ['main.scss', 'scss'], ['index.HTML', 'html'],
    ['picture.svg', 'xml'], ['workflow.yml', 'yaml'], ['query.sql', 'sql'], ['Dockerfile', 'dockerfile'],
    ['Makefile', 'makefile'], ['README', 'text'], ['archive.unknown', 'text'],
  ])('infers %s using the existing highlighter language %s', (path, language) => {
    expect(filePreviewLanguage(path)).toBe(language)
    if (language !== 'text') expect(miraCodeHighlighter.plugin.supportsLanguage(language)).toBe(true)
  })

  it('builds breadcrumbs and exact platform paths without dropping the relative file path', () => {
    expect(filePreviewBreadcrumbs('/tmp/mira-project/', 'src/index.ts')).toEqual(['mira-project', 'src', 'index.ts'])
    expect(filePreviewBreadcrumbs('C:\\Mira\\Workspace\\', 'src/index.ts')).toEqual(['Workspace', 'src', 'index.ts'])
    expect(filePreviewBreadcrumbs(undefined, 'src/index.ts')).toEqual(['src', 'index.ts'])
    expect(filePreviewAbsolutePath('/tmp/mira-project/', 'src/index.ts')).toBe('/tmp/mira-project/src/index.ts')
    expect(filePreviewAbsolutePath('C:\\Mira\\Workspace\\', 'src/index.ts')).toBe('C:\\Mira\\Workspace\\src\\index.ts')
    expect(filePreviewAbsolutePath('/', 'index.ts')).toBe('/index.ts')
    expect(filePreviewAbsolutePath(undefined, 'index.ts')).toBeUndefined()
  })

  it('captures the owner session and path, then preserves exact content including the tail newline', async () => {
    const file = deferred<{ path: string; content: string }>()
    const read = vi.fn(() => file.promise)
    const snapshots: FilePreviewSnapshot[] = []
    startFilePreviewRead(read, 'alpha', 'src/index.ts', snapshot => snapshots.push(snapshot))
    expect(read).toHaveBeenCalledExactlyOnceWith('alpha', 'src/index.ts')
    expect(snapshots).toEqual([{ sessionId: 'alpha', path: 'src/index.ts', status: 'loading' }])
    file.resolve({ path: 'src/index.ts', content: 'const answer = 42;\n' })
    await file.promise
    expect(snapshots.at(-1)).toEqual({ sessionId: 'alpha', path: 'src/index.ts', status: 'ready', content: 'const answer = 42;\n' })
  })

  it('discards an old session response after switching to another file owner', async () => {
    const alpha = deferred<{ path: string; content: string }>()
    const beta = deferred<{ path: string; content: string }>()
    const read = vi.fn((id: string) => id === 'alpha' ? alpha.promise : beta.promise)
    const snapshots: FilePreviewSnapshot[] = []
    const stopAlpha = startFilePreviewRead(read, 'alpha', 'notes.md', snapshot => snapshots.push(snapshot))
    stopAlpha()
    startFilePreviewRead(read, 'beta', 'notes.md', snapshot => snapshots.push(snapshot))
    beta.resolve({ path: 'notes.md', content: 'Beta' })
    await beta.promise
    alpha.resolve({ path: 'notes.md', content: 'Alpha' })
    await alpha.promise
    expect(snapshots).toEqual([
      { sessionId: 'alpha', path: 'notes.md', status: 'loading' },
      { sessionId: 'beta', path: 'notes.md', status: 'loading' },
      { sessionId: 'beta', path: 'notes.md', status: 'ready', content: 'Beta' },
    ])
  })

  it('discards disposed read errors and prevents an older refresh from replacing its newer result', async () => {
    const old = deferred<{ path: string; content: string }>()
    const fresh = deferred<{ path: string; content: string }>()
    const read = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise)
    const snapshots: FilePreviewSnapshot[] = []
    const dispose = startFilePreviewRead(read, 'alpha', 'notes.md', snapshot => snapshots.push(snapshot))
    dispose()
    startFilePreviewRead(read, 'alpha', 'notes.md', snapshot => snapshots.push(snapshot))
    fresh.resolve({ path: 'notes.md', content: 'Fresh' })
    await fresh.promise
    old.reject(new Error('Old failure'))
    await old.promise.catch(() => undefined)
    expect(snapshots.at(-1)).toEqual({ sessionId: 'alpha', path: 'notes.md', status: 'ready', content: 'Fresh' })
    expect(snapshots).toHaveLength(3)
  })

  it('reports file errors locally and can successfully read the same file on retry', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('文件或目录不存在')).mockResolvedValueOnce({ path: 'notes.md', content: '' })
    const snapshots: FilePreviewSnapshot[] = []
    startFilePreviewRead(read, 'alpha', 'notes.md', snapshot => snapshots.push(snapshot))
    await Promise.resolve()
    expect(snapshots.at(-1)).toEqual({ sessionId: 'alpha', path: 'notes.md', status: 'error', error: '文件或目录不存在' })
    startFilePreviewRead(read, 'alpha', 'notes.md', snapshot => snapshots.push(snapshot))
    await Promise.resolve()
    expect(snapshots.at(-1)).toEqual({ sessionId: 'alpha', path: 'notes.md', status: 'ready', content: '' })
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('rejects a host response belonging to another path instead of displaying it', async () => {
    const snapshots: FilePreviewSnapshot[] = []
    startFilePreviewRead(async () => ({ path: 'other.md', content: 'Wrong file' }), 'alpha', 'notes.md', snapshot => snapshots.push(snapshot))
    await Promise.resolve()
    expect(snapshots.at(-1)).toEqual({ sessionId: 'alpha', path: 'notes.md', status: 'error', error: '文件预览响应路径不匹配，请重试。' })
  })

  it('includes the working root in file, highlight and clipboard-feedback identity', () => {
    const first = { sessionId: 'alpha', path: 'src/index.ts', directory: '/tmp/first' }
    const second = { ...first, directory: '/tmp/second' }
    expect(filePreviewKey(first)).not.toBe(filePreviewKey(second))
    expect(filePreviewKey(first)).toBe(filePreviewKey({ ...first }))
    expect(filePreviewKey({ ...first, directory: undefined })).not.toBe(filePreviewKey(first))
  })

  it('does not display a late old-root response when the same session and path move to a new root', async () => {
    const old = deferred<{ path: string; content: string }>()
    const fresh = deferred<{ path: string; content: string }>()
    const read = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise)
    const snapshots: FilePreviewSnapshot[] = []
    const oldReader = createFilePreviewReader(read, { sessionId: 'alpha', path: 'notes.md', directory: '/tmp/first' }, snapshot => snapshots.push(snapshot))
    oldReader.read(true, 0)
    oldReader.dispose()
    const newReader = createFilePreviewReader(read, { sessionId: 'alpha', path: 'notes.md', directory: '/tmp/second' }, snapshot => snapshots.push(snapshot))
    newReader.read(true, 0)
    fresh.resolve({ path: 'notes.md', content: 'New project' })
    await fresh.promise
    old.resolve({ path: 'notes.md', content: 'Old project' })
    await old.promise
    expect(snapshots).toEqual([
      { sessionId: 'alpha', path: 'notes.md', directory: '/tmp/first', status: 'loading' },
      { sessionId: 'alpha', path: 'notes.md', directory: '/tmp/second', status: 'loading' },
      { sessionId: 'alpha', path: 'notes.md', directory: '/tmp/second', status: 'ready', content: 'New project' },
    ])
    expect(read).toHaveBeenNthCalledWith(2, 'alpha', 'notes.md')
  })

  it('waits for the first active new-root tab and keeps loaded content across subsequent tab switches', async () => {
    const read = vi.fn().mockResolvedValue({ path: 'notes.md', content: 'Ready' })
    const snapshots: FilePreviewSnapshot[] = []
    const oldReader = createFilePreviewReader(read, { sessionId: 'alpha', path: 'notes.md', directory: '/tmp/first' }, snapshot => snapshots.push(snapshot))
    oldReader.read(true, 0)
    await Promise.resolve()
    oldReader.dispose()
    const newReader = createFilePreviewReader(read, { sessionId: 'alpha', path: 'notes.md', directory: '/tmp/second' }, snapshot => snapshots.push(snapshot))
    newReader.read(false, 0)
    expect(read).toHaveBeenCalledTimes(1)
    expect(snapshots.at(-1)?.directory).toBe('/tmp/first')
    newReader.read(true, 0)
    await Promise.resolve()
    expect(read).toHaveBeenCalledTimes(2)
    expect(snapshots.at(-1)).toEqual({ sessionId: 'alpha', path: 'notes.md', directory: '/tmp/second', status: 'ready', content: 'Ready' })
    newReader.read(false, 0)
    newReader.read(true, 0)
    expect(read).toHaveBeenCalledTimes(2)
    newReader.read(true, 1)
    await Promise.resolve()
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('keeps the toolbar and loading surface while server rendering without invoking desktop reads', () => {
    vi.stubGlobal('React', React)
    const readFileFor = vi.fn()
    const html = renderToStaticMarkup(React.createElement(FilePreviewPanel, { controller: { readFileFor } as unknown as PilotController, sessionId: 'alpha', path: 'src/index.ts', directory: '/tmp/Mira', active: true, onAddFile: vi.fn() }))
    expect(html).toContain('mira-file-preview__toolbar')
    expect(html).toContain('aria-label="刷新文件"')
    expect(html).toContain('aria-label="将当前文件加入对话"')
    expect(html).toContain('aria-label="文件预览选项"')
    expect(html).toContain('正在读取文件')
    expect(html).toContain('/tmp/Mira/src/index.ts')
    expect(html).not.toContain('保存文件')
    expect(html).not.toContain('外部编辑器')
    expect(readFileFor).not.toHaveBeenCalled()
  })

  it('marks inactive previews dirty and reads their latest version only when activated', async () => {
    const read = vi.fn().mockResolvedValue({ path: 'notes.md', content: 'First' })
    const snapshots: FilePreviewSnapshot[] = []
    const reader = createFilePreviewReader(read, { sessionId: 'alpha', path: 'notes.md', directory: '/tmp/project' }, snapshot => snapshots.push(snapshot))
    reader.read(true, 0); await Promise.resolve()
    reader.read(false, 1); reader.read(false, 2)
    expect(read).toHaveBeenCalledOnce()
    expect(snapshots.at(-1)).toMatchObject({ status: 'ready', content: 'First' })
    read.mockResolvedValue({ path: 'notes.md', content: 'Newest' })
    reader.read(true, 2); await Promise.resolve()
    expect(read).toHaveBeenCalledTimes(2)
    expect(snapshots.at(-1)).toMatchObject({ status: 'ready', content: 'Newest' })
    reader.read(false, 2); reader.read(true, 2)
    expect(read).toHaveBeenCalledTimes(2)
    reader.dispose()
  })

  it('discards the old pending preview after a change while hidden and recovers a deleted file when restored', async () => {
    const old = deferred<{ path: string; content: string }>()
    const read = vi.fn().mockReturnValueOnce(old.promise).mockRejectedValueOnce(new Error('文件 notes.md 已被删除')).mockResolvedValueOnce({ path: 'notes.md', content: 'Restored' })
    const snapshots: FilePreviewSnapshot[] = []
    const reader = createFilePreviewReader(read, { sessionId: 'alpha', path: 'notes.md' }, snapshot => snapshots.push(snapshot))
    reader.read(true, 0); reader.read(false, 1)
    old.resolve({ path: 'notes.md', content: 'Stale' }); await old.promise
    expect(snapshots.at(-1)).toMatchObject({ status: 'loading' })
    reader.read(true, 1); await Promise.resolve()
    expect(snapshots.at(-1)).toMatchObject({ status: 'error', error: '文件 notes.md 已被删除' })
    reader.read(true, 2); await Promise.resolve()
    expect(snapshots.at(-1)).toMatchObject({ status: 'ready', content: 'Restored' })
    reader.dispose()
  })

  it('renders only visible virtual source rows even for 50,000 lines', () => {
    vi.stubGlobal('React', React)
    const content = Array.from({ length: 50_000 }, (_, line) => `source-${line}`).join('\n')
    const html = renderToStaticMarkup(React.createElement(FilePreviewSource, { content, language: 'text', wrap: false, active: true }))
    const rows = html.match(/class="mira-file-source__row"/g) || []
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThan(60)
    expect(html).toContain('共 50000 行')
    expect(html).toContain('source-0')
    expect(html).not.toContain('source-49999')
    expect(html).toContain('height:1000000px')
    expect(html).not.toContain('is-wrapped')
  })

  it('reuses real Shiki tokens and safely escapes source HTML with variable-height wrapping', async () => {
    vi.stubGlobal('React', React)
    const content = 'const unsafe = "<img src=x onerror=alert(1)>";\n'
    const highlighted = await miraCodeHighlighter.highlight({ code: content, language: 'typescript', themes: miraCodeThemes })
    const html = renderToStaticMarkup(React.createElement(FilePreviewSource, { content, language: 'typescript', highlighted, wrap: true, active: true }))
    expect(html).toContain('is-wrapped')
    expect(html).toContain('data-index="0"')
    expect(html).toContain('--shiki-dark:')
    expect(html).toContain('&lt;img')
    expect(html).not.toContain('<img')
    expect(html.match(/class="mira-file-source__row"/g)).toHaveLength(2)
    expect(renderCompletedMarkdown('<script>bad()</script>\n\n# Safe')).not.toContain('<script>')
  })

  it('does not mount hidden tab source rows', () => {
    vi.stubGlobal('React', React)
    const html = renderToStaticMarkup(React.createElement(FilePreviewSource, { content: 'hidden\ncontent', language: 'text', wrap: false, active: false }))
    expect(html).not.toContain('class="mira-file-source__row"')
  })
})

describe('React Harness shared file highlighting core (Node reference)', () => {
  it.each([
    ['typescript', '/* first\ncontinue\nclose */\nconst msg = `first\nsecond\n`;\n'],
    ['vue', '<template>\n<div>Hello</div>\n</template>\n<script setup lang="ts">\n/* open\nstill\n*/\nconst msg = "Ready"\n</script>\n<style>\n/* css\ncomment */\na { color: red; }\n</style>\n'],
    ['python', 's = """first\nsecond\nlast"""\nprint(s)\n'],
    ['shell', 'cat <<EOF\nhello\nworld\nEOF\nprintf ready\n'],
    ['markdown', '# Mira\n\n```typescript\n/* open\ncomment */\nconst answer = 42;\n```\n'],
    ['json', '{\n  "nested": {\n    "enabled": true,\n    "count": 42\n  }\n}\n'],
  ])('continues %s multiline grammar and retains every token with both themes and absolute offsets', async (language, code) => {
    const cooperative = await highlightFilePreview(code, language)
    const whole = await miraCodeHighlighter.highlight({ code, language, themes: miraCodeThemes })
    expect(cooperative.tokens).toEqual(whole.tokens)
    expect(cooperative.fg).toEqual(whole.fg)
    expect(cooperative.bg).toEqual(whole.bg)
    expect(cooperative.tokens.flat().some(token => token.htmlStyle?.['--shiki-dark'])).toBe(true)
    expect(cooperative).not.toHaveProperty('grammarState')
    expect(cooperative.tokens.map(line => line.map(token => token.content).join('')).join('\n')).toBe(code)
  })

  it('preserves CRLF source offsets, Unicode and the final empty line exactly like Shiki', async () => {
    const code = '/* 设定\r\n角色 */\r\nconst title = "Mira 你好";\r\n'
    const whole = await miraCodeHighlighter.highlight({ code, language: 'typescript', themes: miraCodeThemes })
    const cooperative = await highlightFilePreview(code, 'typescript')
    expect(cooperative.tokens).toEqual(whole.tokens)
    expect(cooperative.tokens).toHaveLength(4)
    expect(cooperative.tokens.at(-1)).toEqual([])
  })

  it('uses the same result cache as message highlighting', async () => {
    const code = 'const shared = 42;'
    const first = await highlightFilePreview(code, 'typescript')
    expect(await highlightFilePreview(code, 'ts')).toBe(first)
    const whole = await miraCodeHighlighter.highlight({ code, language: 'typescript', themes: miraCodeThemes })
    expect(miraCodeHighlighter.getCached({ code, language: 'typescript', themes: miraCodeThemes })).toBe(whole)
  })

  it('highlights all 8,001 lines and yields inside the tokenizer owner', async () => {
    const code = Array.from({ length: 8000 }, (_, index) => `export const row${index}: string = "Mira ${index}";`).join('\n') + '\n'
    const yields = vi.spyOn(globalThis, 'setTimeout')
    const result = await highlightFilePreview(code, 'typescript')
    expect(result.tokens).toHaveLength(8001)
    expect(result.tokens.map(line => line.map(token => token.content).join('')).join('\n')).toBe(code)
    expect(result.tokens[7999].some(token => token.htmlStyle?.color && token.htmlStyle['--shiki-dark'])).toBe(true)
    expect(yields.mock.calls.filter(call => call[1] === 0).length).toBeGreaterThan(2)
  }, 15_000)

  it('cancels before initialization when the file identity is already stale', async () => {
    const cancellation = new AbortController()
    cancellation.abort()
    await expect(highlightFilePreview('const old = 42;', 'typescript', cancellation.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('stops scan work at the next yield after switching the file session or working root', async () => {
    const tokenize = createMiraHighlightCore()
    await tokenize({ code: 'const warm = 1;', language: 'typescript', themes: miraCodeThemes })
    const scheduled: Array<() => void> = []
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void) => { scheduled.push(callback); return 0 }) as unknown as typeof setTimeout)
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => { now += 9; return now })
    const cancellation = new AbortController()
    const pending = tokenize({ code: '/* open\ncomment\n*/\nconst old = 42;\n', language: 'typescript', themes: miraCodeThemes }, cancellation.signal)
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    for (let step = 0; step < 10; step++) await Promise.resolve()
    expect(scheduled).toHaveLength(1)
    cancellation.abort()
    scheduled.shift()!()
    await rejected
    expect(scheduled).toHaveLength(0)
  })
})
