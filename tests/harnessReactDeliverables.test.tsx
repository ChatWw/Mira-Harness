// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import { miraDeliverablePaths } from '../apps/harness-react/src/lib/mira-deliverable-files'
import { MiraDeliverableFiles } from '../apps/harness-react/src/components/conversation/MiraDeliverableFiles'
import { miraReplyChangedFiles } from '../apps/harness-react/src/lib/mira-reply-changes'
import { FileChangesCard } from '../apps/harness-react/src/components/conversation/message-parts'
import type { HarnessFileChange } from '../src/config/harness'
import type { PilotController } from '../apps/harness-react/src/state/pilot-state'
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })
const written = (...paths: string[]): HarnessFileChange[] => paths.map((path, index) => ({ toolCallId: String(index), tool: 'write', path }))
it('finds actual deliverable references including spaces and absolute project paths', () => {
  expect(miraDeliverablePaths('[成品](<output/极简 演示.pptx>)，`/project/output/极简 演示.pptx`，demo.pptx', written('output/极简 演示.pptx', 'demo.pptx'), '/project')).toEqual(['output/极简 演示.pptx', 'demo.pptx'])
  expect(miraDeliverablePaths('[成品](file:///C:/work/output/%E6%BC%94%E7%A4%BA.pptx)', written('output/演示.pptx'), 'C:\\work')).toEqual(['output/演示.pptx'])
})
it('does not turn external URLs, traversal or other-workspace files into deliverables', () => {
  expect(miraDeliverablePaths('[x](https://example.com/demo.pptx) [x](../demo.pptx) `/other/demo.pptx`', written('https://example.com/demo.pptx', '../demo.pptx', '/other/demo.pptx'), '/project')).toEqual([])
})
it('counts unique paths rather than edit operations', () => {
  const html = renderToStaticMarkup(<FileChangesCard changes={[{toolCallId:'1',tool:'write',path:'a.py'},{toolCallId:'2',tool:'edit',path:'a.py'},{toolCallId:'3',tool:'write',path:'b.py'}]} onOpen={()=>{}} />)
  expect(html).toContain('2 个文件已更改'); expect(html).toContain('aria-expanded="false"'); expect(html).not.toContain('a.py、b.py')
})
it('validates generated binary PPTs through workspace IPC and opens the file, hiding missing references', async () => {
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container)
  const listFilesFor = vi.fn(async () => ({path:'output',entries:[{name:'成品.pptx',path:'output/成品.pptx',type:'file'}]}))
  const onOpen = vi.fn(), controller = {listFilesFor} as unknown as PilotController
  try {
    await act(async () => root.render(<MiraDeliverableFiles content={'[成品](output/成品.pptx) [不存在](output/不存在.pptx)'} changes={written('output/成品.pptx','output/不存在.pptx')} directory="/project" sessionId="a" active controller={controller} onOpen={onOpen} />))
    expect(container.textContent).toContain('成品.pptx'); expect(container.textContent).not.toContain('不存在.pptx')
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click())
    expect(onOpen).toHaveBeenCalledWith('output/成品.pptx');expect(listFilesFor).toHaveBeenCalledTimes(1)
  } finally { await act(async () => root.unmount()) }
})
it('does not publish stale results after switching tasks', async () => {
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container)
  let finish!: (value:any)=>void
  const controller={listFilesFor:vi.fn(()=>new Promise(resolve=>{finish=resolve}))} as unknown as PilotController
  const render=(sessionId:string,content:string)=>root.render(<MiraDeliverableFiles content={content} changes={sessionId === 'a' ? written('demo.pptx') : []} directory="/project" sessionId={sessionId} active controller={controller} onOpen={()=>{}} />)
  try {
    await act(async()=>render('a','[文件](demo.pptx)'))
    await act(async()=>render('b','没有生成文件'))
    await act(async()=>finish({path:'',entries:[{type:'file',path:'demo.pptx'}]}))
    expect(container.textContent).toBe('')
  } finally { await act(async()=>root.unmount()) }
})

it('recognizes ZCode document and media result types without exposing generator scripts as deliverables', () => {
  expect(miraDeliverablePaths('`note.md` [文档](test.docx) [表格](output/data.xlsx) report.pdf demo.html clip.mp4 audio.mp3 `generate.py`', written('note.md','test.docx','output/data.xlsx','report.pdf','demo.html','clip.mp4','audio.mp3','generate.py'), '/project')).toEqual(['note.md', 'test.docx', 'output/data.xlsx', 'report.pdf', 'demo.html', 'clip.mp4', 'audio.mp3'])
})
it('uses the last host net snapshot, excludes restored files, and never sums repeated legacy diffs', () => {
  const changes = [
    {toolCallId:'1',tool:'write' as const,path:'a.py',diff:'@@ -0,0 +1,2 @@\n+one\n+temporary'},
    {toolCallId:'2',tool:'edit' as const,path:'./a.py',diff:'@@ -2 +2 @@\n-temporary\n+final'},
  ]
  expect(miraReplyChangedFiles(changes)).toMatchObject([{path:'a.py',unavailable:true,writes:2}])
  changes[1] = {...changes[1], summary:{key:'a',path:'a.py',tool:'edit',writes:2,added:2,removed:0,diff:'@@ -0,0 +1,2 @@\n+one\n+final'}} as any
  expect(miraReplyChangedFiles(changes)).toMatchObject([{path:'a.py',added:2,removed:0}])
  expect(miraReplyChangedFiles([{...changes[1],summary:{key:'a',path:'a.py',tool:'edit',writes:2,unchanged:true,added:0,removed:0}}])).toEqual([])
})
it('expands a single row per file and reviews the final diff through the actual reply card', async () => {
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container)
  const onOpen=vi.fn(), onOpenFile=vi.fn()
  try {
    await act(async()=>root.render(<FileChangesCard changes={[{toolCallId:'1',tool:'write',path:'out/test.md',diff:'@@ -0,0 +1 @@\n+hello'},{toolCallId:'2',tool:'edit',path:'out/test.md',summary:{key:'a',path:'out/test.md',tool:'edit',writes:2,added:1,removed:0,diff:'@@ -0,0 +1 @@\n+final'}}]} onOpen={onOpen} onOpenFile={onOpenFile} />))
    expect(container.textContent).toContain('1 个文件已更改+1 -0')
    expect(container.querySelectorAll('.mira-reply-change')).toHaveLength(0)
    await act(async()=>container.querySelector<HTMLButtonElement>('button[aria-expanded]')!.click())
    expect(container.querySelectorAll('.mira-reply-change')).toHaveLength(1)
    await act(async()=>container.querySelector<HTMLButtonElement>('button[aria-label="审查 out/test.md"]')!.click())
    expect(container.querySelector('[role="region"]')?.textContent).toContain('+final')
    expect(container.querySelector('[role="region"]')?.textContent).not.toContain('+hello')
    await act(async()=>container.querySelector<HTMLButtonElement>('button[aria-label="打开 test.md"]')!.click())
    expect(onOpenFile).toHaveBeenCalledWith('out/test.md')
  } finally {await act(async()=>root.unmount())}
})

it('ignores fenced examples and deleted files when deriving result cards', () => {
  expect(miraDeliverablePaths('```md\n[example](example.docx)\n```\n\n[real](real.docx)',written('real.docx'), '/project')).toEqual(['real.docx'])
  expect(miraDeliverablePaths('`deleted.md`',[{toolCallId:'a',tool:'write',path:'deleted.md'},{toolCallId:'b',tool:'delete',path:'deleted.md'}],'/project')).toEqual([])
})

it('does not show unchanged Markdown or HTML mentioned in ordinary replies', () => {
  expect(miraDeliverablePaths('重点看 `MiraHarness_bugs.md`、`agent能力对比分析.md`；参考 [说明](docs/readme.md) 和 demo.html。', [], '/project')).toEqual([])
  expect(miraDeliverablePaths('`note.md` [预览](demo.html)', [{toolCallId:'a',tool:'edit',path:'./note.md',summary:{key:'a',path:'note.md',tool:'edit',writes:1,unchanged:true,added:0,removed:0}}], '/project')).toEqual([])
})

it('uses actual reply changes for Markdown and HTML cards, including normalized paths and last snapshots', () => {
  expect(miraDeliverablePaths('`note.md` demo.html', [
    {toolCallId:'a',tool:'write',path:'note.md'},
    {toolCallId:'b',tool:'edit',path:'./note.md',summary:{key:'a',path:'note.md',tool:'edit',writes:2,unchanged:true,added:0,removed:0}},
    {toolCallId:'c',tool:'write',path:'/project/demo.html'},
  ], '/project')).toEqual(['demo.html'])
  expect(miraDeliverablePaths('', [{toolCallId:'a',tool:'write',path:'docs\\new.md'},{toolCallId:'b',tool:'edit',path:'./index.htm'}], '/project')).toEqual(['docs/new.md','index.htm'])
})

it('does not validate or render file cards for a read-only reply mentioning existing notes', async () => {
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container)
  const listFilesFor = vi.fn(async () => ({path:'',entries:[{name:'MiraHarness_bugs.md',path:'MiraHarness_bugs.md',type:'file'}]}))
  try {
    await act(async () => root.render(<MiraDeliverableFiles content="重点看 `MiraHarness_bugs.md`、`agent能力对比分析.md`。" changes={[]} directory="/project" sessionId="a" active controller={{listFilesFor} as unknown as PilotController} onOpen={() => {}} />))
    expect(container.querySelector('.mira-deliverable-files')).toBeNull()
    expect(listFilesFor).not.toHaveBeenCalled()
  } finally { await act(async () => root.unmount()) }
})

it.each(['pptx', 'docx', 'xlsx', 'pdf', 'mp4', 'mp3', 'md', 'html'])('requires actual reply changes for %s cards, excluding unchanged and deleted files', extension => {
  const path = `output/report.${extension}`
  const content = `项目文件：[文件](${path})、\`${path}\`、${path}`
  expect(miraDeliverablePaths(content, [], '/project')).toEqual([])
  expect(miraDeliverablePaths(content, written(path), '/project')).toEqual([path])
  expect(miraDeliverablePaths('', written(path), '/project')).toEqual([path])
  expect(miraDeliverablePaths(content, [...written(path), {toolCallId:'edit',tool:'edit',path,summary:{key:path,path,tool:'edit',writes:2,unchanged:true,added:0,removed:0}}], '/project')).toEqual([])
  expect(miraDeliverablePaths(content, [...written(path), {toolCallId:'delete',tool:'delete',path}], '/project')).toEqual([])
})

it('does not validate or render existing Office files listed in a read-only reply', async () => {
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container)
  const listFilesFor = vi.fn(async () => ({path:'',entries:['Mira_Harness_项目介绍_20261013.pptx','极简演示.pptx','test.docx'].map(path => ({name:path,path,type:'file'}))}))
  try {
    await act(async () => root.render(<MiraDeliverableFiles content="项目文件：`Mira_Harness_项目介绍_20261013.pptx`、`极简演示.pptx`、`test.docx`。" changes={[]} directory="/project" sessionId="a" active controller={{listFilesFor} as unknown as PilotController} onOpen={() => {}} />))
    expect(container.querySelector('.mira-deliverable-files')).toBeNull()
    expect(listFilesFor).not.toHaveBeenCalled()
  } finally { await act(async () => root.unmount()) }
})

it('keeps mobile deliverable actions without requesting desktop resources', async () => {
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container)
  const listFilesFor = vi.fn(), listEditors = vi.fn(), blocked = vi.fn()
  const controller = { listFilesFor, listEditors } as unknown as PilotController
  try {
    await act(async () => root.render(<MiraDeliverableFiles content="[report](report.pdf)" changes={written('report.pdf')} directory="/project" sessionId="a" active controller={controller} onOpen={blocked} onDesktopOnly={blocked} />))
    expect(container.textContent).toContain('report.pdf')
    for (const button of container.querySelectorAll<HTMLButtonElement>('button')) await act(async () => button.click())
    expect(blocked).toHaveBeenCalledTimes(2)
    expect(listFilesFor).not.toHaveBeenCalled(); expect(listEditors).not.toHaveBeenCalled()
  } finally { await act(async () => root.unmount()) }
})
