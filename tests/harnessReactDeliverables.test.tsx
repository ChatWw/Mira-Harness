// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import { miraDeliverablePaths } from '../apps/harness-react/src/lib/mira-deliverable-files'
import { MiraDeliverableFiles } from '../apps/harness-react/src/components/conversation/MiraDeliverableFiles'
import { FileChangesCard } from '../apps/harness-react/src/components/conversation/message-parts'
import type { PilotController } from '../apps/harness-react/src/state/pilot-state'
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })
it('finds actual deliverable references including spaces and absolute project paths', () => {
  expect(miraDeliverablePaths('[成品](<output/极简 演示.pptx>)，`/project/output/极简 演示.pptx`，demo.pptx', [], '/project')).toEqual(['output/极简 演示.pptx', 'demo.pptx'])
  expect(miraDeliverablePaths('[成品](file:///C:/work/output/%E6%BC%94%E7%A4%BA.pptx)', [], 'C:\\work')).toEqual(['output/演示.pptx'])
})
it('does not turn external URLs, traversal or other-workspace files into deliverables', () => {
  expect(miraDeliverablePaths('[x](https://example.com/demo.pptx) [x](../demo.pptx) `/other/demo.pptx`', [], '/project')).toEqual([])
})
it('counts unique paths rather than edit operations', () => {
  const html = renderToStaticMarkup(<FileChangesCard changes={[{toolCallId:'1',tool:'write',path:'a.py'},{toolCallId:'2',tool:'edit',path:'a.py'},{toolCallId:'3',tool:'write',path:'b.py'}]} onOpen={()=>{}} />)
  expect(html).toContain('本轮修改 2 个文件'); expect(html).toContain('a.py、b.py')
})
it('validates generated binary PPTs through workspace IPC and opens the file, hiding missing references', async () => {
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container)
  const listFilesFor = vi.fn(async () => ({path:'output',entries:[{name:'成品.pptx',path:'output/成品.pptx',type:'file'}]}))
  const onOpen = vi.fn(), controller = {listFilesFor} as unknown as PilotController
  try {
    await act(async () => root.render(<MiraDeliverableFiles content={'[成品](output/成品.pptx) [不存在](output/不存在.pptx)'} changes={[]} directory="/project" sessionId="a" active controller={controller} onOpen={onOpen} />))
    expect(container.textContent).toContain('成品.pptx'); expect(container.textContent).not.toContain('不存在.pptx')
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click())
    expect(onOpen).toHaveBeenCalledWith('output/成品.pptx');expect(listFilesFor).toHaveBeenCalledTimes(1)
  } finally { await act(async () => root.unmount()) }
})
it('does not publish stale results after switching tasks', async () => {
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container)
  let finish!: (value:any)=>void
  const controller={listFilesFor:vi.fn(()=>new Promise(resolve=>{finish=resolve}))} as unknown as PilotController
  const render=(sessionId:string,content:string)=>root.render(<MiraDeliverableFiles content={content} changes={[]} directory="/project" sessionId={sessionId} active controller={controller} onOpen={()=>{}} />)
  try {
    await act(async()=>render('a','[文件](demo.pptx)'))
    await act(async()=>render('b','没有生成文件'))
    await act(async()=>finish({path:'',entries:[{type:'file',path:'demo.pptx'}]}))
    expect(container.textContent).toBe('')
  } finally { await act(async()=>root.unmount()) }
})
