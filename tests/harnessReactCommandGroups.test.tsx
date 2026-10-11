// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HarnessMessage, HarnessMessagePart, ToolCallRecord } from '../src/config/harness'
import { AssistantMessageParts } from '../apps/harness-react/src/components/conversation/AssistantMessageParts'
import { MiraConversationDetailMemory, MiraConversationDetails } from '../apps/harness-react/src/components/conversation/MiraConversationDetails'
import { miraAssistantWorkItems } from '../apps/harness-react/src/lib/tool-exploration'

let root: Root | undefined
beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); document.body.replaceChildren() })
const bash = (id: string, command: string, patch: Partial<ToolCallRecord> = {}): ToolCallRecord => ({ id, tool: 'bash', runId: 'run', target: command, status: 'ok', createdAt: 1, input: { text: JSON.stringify({ command }), truncated: false }, ...patch })
const part = (tool: ToolCallRecord): HarnessMessagePart => ({ id: `${tool.id}-part`, type: 'tool', toolCallId: tool.id })
const message = (parts: HarnessMessagePart[]): HarnessMessage => ({ id: 'reply', role: 'assistant', runId: 'run', content: '', createdAt: 1, parts })
const work = (tools: ToolCallRecord[], parts = tools.map(part), permissionPartId?: string) => miraAssistantWorkItems(message(parts), new Map(tools.map(tool => [tool.id, tool])), false, permissionPartId)
const html = (tools: ToolCallRecord[], streaming = false) => renderToStaticMarkup(<AssistantMessageParts message={message(tools.map(part))} toolsById={new Map(tools.map(tool => [tool.id, tool]))} streaming={streaming} />)

describe('authoritative command stages', () => {
  it('joins real read tools and complete read-only shell segments into one exploration stage', () => {
    const read: ToolCallRecord = { id: 'read', tool: 'read', runId: 'run', target: 'README.md', status: 'ok', createdAt: 1 }
    const tools = [read, bash('find', 'rg Mira src && ls src'), bash('source', "sed -n '1,80p' src/main.ts"), bash('directory', 'ls src')]
    expect(work(tools).map(item => item.kind)).toEqual(['exploration'])
    expect(html(tools)).toContain('1 次搜索、1 次目录查询、2 次读取')
  })

  it.each(['text', 'reasoning'] as const)('ends a live command or exploration stage at following %s despite a late running child', type => {
    for (const commands of [['npm test', 'npm run build'], ['cat src/a.ts', 'ls src']]) {
      const tools = [bash('a', commands[0]!, { status: 'running' }), bash('b', commands[1]!)]
      const markup = renderToStaticMarkup(<AssistantMessageParts message={message([...tools.map(part), { id: 'boundary', type, text: 'later visible boundary', state: 'streaming', startedAt: 2 }])} toolsById={new Map(tools.map(tool => [tool.id, tool]))} streaming />)
      expect(markup).toContain('data-tool-group-live="false"')
      expect(markup).not.toContain('进行中')
      expect(markup).toContain(type === 'text' ? 'later visible boundary' : '正在思考')
    }
  })

  it('counts a compound shell input once in the same bucket order as the upstream explorer', () => {
    const reads = html([bash('a', 'cat src/a.ts && cat src/b.ts'), bash('b', 'ls src')])
    expect(reads).toContain('1 次目录查询、1 次读取')
    expect(reads).not.toContain('2 次读取')
    const mixed = html([bash('a', 'rg Mira src && ls src'), bash('b', 'cat README.md')])
    expect(mixed).toContain('1 次搜索、1 次读取')
    expect(mixed).not.toContain('次目录查询')
  })

  it('keeps a single read-only shell tool as a terminal disclosure with its full command and actual output', async () => {
    const tool = bash('single', 'cat README.md', { target: 'cat README', output: { text: 'actual source content', truncated: false } })
    const container = document.createElement('div'); document.body.append(container); root = createRoot(container)
    await act(async () => root!.render(<AssistantMessageParts message={message([part(tool)])} toolsById={new Map([[tool.id, tool]])} />))
    expect(container.querySelector('[data-tool-group-id]')).toBeNull()
    expect(container.textContent).toContain('cat README.md')
    await act(async () => container.querySelector<HTMLElement>('[aria-label="展开终端详情"]')!.click())
    expect(container.querySelector('[aria-label="执行命令"]')?.textContent).toBe('cat README.md')
    expect(container.textContent).toContain('actual source content')
  })

  it('keeps an approval outside closed command groups and lets its actual controls respond', async () => {
    const a = bash('a', 'npm test'), b = bash('b', 'npm run build'), waiting = bash('waiting', 'npm install', { status: 'waiting-confirm' })
    const tools = [a, b, waiting, bash('c', 'npm run lint'), bash('d', 'npm test')]
    const container = document.createElement('div'); document.body.append(container); root = createRoot(container)
    const onRespond = vi.fn(async () => undefined)
    await act(async () => root!.render(<AssistantMessageParts message={message(tools.map(part))} toolsById={new Map(tools.map(tool => [tool.id, tool]))} permissionPartId="waiting-part" permission={{ request: { requestId: 'actual-approval', sessionId: 'A', toolCallId: waiting.id, runId: 'run', title: '允许安装', detail: 'npm install' }, responding: false, placement: 'inline', onRespond }} />))
    expect(container.querySelectorAll('[data-tool-group-kind="commands"]')).toHaveLength(2)
    const approval = container.querySelector<HTMLElement>('[data-permission-request-id="actual-approval"]')!
    expect(approval.closest('[data-tool-group-id]')).toBeNull()
    await act(async () => [...approval.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '允许')!.click())
    expect(onRespond).toHaveBeenCalledExactlyOnceWith('actual-approval', true)
  })

  it.each(['echo "ls"', 'rg Mira src && curl example.com', 'rg Mira src | tee found.txt', 'sed -i s/a/b/ src/a.ts', 'rg --pre ./filter Mira src', 'cat "$FILE"', 'cat $(pwd)/a.ts', 'cat `pwd`/a.ts', 'find src -exec rm {} \\;', 'ls > files.txt', 'sh -c "ls"', 'git log --output=log.txt'])('keeps complex or non-read commands in execution, never exploration: %s', command => {
    expect(work([bash('a', command), bash('b', command)]).map(item => item.kind)).toEqual(['commands'])
  })

  it('prefers the complete public command over a shortened display target and keeps incomplete input ungrouped', () => {
    const tools = [bash('a', 'rg source src && curl example.com', { target: 'rg source src' }), bash('b', 'npm test')]
    expect(work(tools).map(item => item.kind)).toEqual(['commands'])
    const markup = html(tools)
    expect(markup).toContain('2 条命令')
    for (const input of [undefined, { text: '{"command":"npm', truncated: true }, { text: '{"command":', truncated: false }]) {
      expect(work([tools[0]!, bash('incomplete', 'ls', { input }), tools[1]!]).map(item => item.kind)).toEqual(['part', 'part', 'part'])
    }
  })

  it.each(['text', 'reasoning', 'missing', 'owner', 'run', 'waiting', 'approval'] as const)('does not merge execution across a %s boundary', boundary => {
    const a = bash('a', 'npm test'), b = bash('b', 'npm run build')
    const middle = bash('middle', 'npm install', { ...(boundary === 'owner' ? { subtaskId: 'child' } : {}), ...(boundary === 'run' ? { runId: 'another-run' } : {}), ...(boundary === 'waiting' ? { status: 'waiting-confirm' } : {}) })
    const between: HarnessMessagePart = boundary === 'text' || boundary === 'reasoning' ? { id: 'boundary', type: boundary, text: 'boundary', state: 'complete', startedAt: 1 } : part(middle)
    const tools = [a, b, ...(boundary === 'missing' ? [] : [middle])]
    expect(work(tools, [part(a), between, part(b)], boundary === 'approval' ? between.id : undefined).map(item => item.kind)).toEqual(['part', 'part', 'part'])
  })

  it('keeps active command ahead of a newer completed sibling and exposes failed/cancelled counts', () => {
    const tools = [bash('running', 'npm test', { status: 'running' }), bash('failed', 'npm run build', { status: 'failed', error: 'build failure' }), bash('cancelled', 'npm install', { status: 'cancelled' })]
    const markup = html(tools, true)
    expect(markup).toContain('data-tool-group-kind="commands"')
    expect(markup).toContain('正在执行')
    expect(markup).toContain('npm test')
    expect(markup).not.toContain('npm install')
    expect(markup).toContain('1 项失败'); expect(markup).toContain('1 项已取消')
  })

  it('isolates group and tool expansion between two child owners within one session', async () => {
    const memory = new MiraConversationDetailMemory(), container = document.createElement('div')
    document.body.append(container); root = createRoot(container)
    const render = async (owner: string) => {
      const tools = [bash('a', 'npm test', { subtaskId: owner }), bash('b', 'npm run build', { subtaskId: owner })]
      await act(async () => root!.render(<MiraConversationDetails memory={memory} scope="session"><AssistantMessageParts message={message(tools.map(part))} toolsById={new Map(tools.map(tool => [tool.id, tool]))} /></MiraConversationDetails>))
    }
    await render('child-A')
    await act(async () => container.querySelector<HTMLElement>('[aria-label="展开执行过程"]')!.click())
    await act(async () => container.querySelector<HTMLElement>('[aria-label="展开终端详情"]')!.click())
    await render('child-B')
    expect(container.querySelector<HTMLElement>('[data-tool-group-kind="commands"]')?.dataset.state).toBe('closed')
    await act(async () => container.querySelector<HTMLElement>('[aria-label="展开执行过程"]')!.click())
    expect(container.querySelector<HTMLElement>('[data-tool-call-id="a"]')?.dataset.state).toBe('closed')
    await render('child-A')
    expect(container.querySelector<HTMLElement>('[data-tool-call-id="a"]')?.dataset.state).toBe('open')
  })

  it('retains execution expansion on append/remount, isolates owners, and mounts output only after both disclosures', async () => {
    const memory = new MiraConversationDetailMemory(), container = document.createElement('div')
    document.body.append(container); root = createRoot(container)
    const tools = [bash('a', 'npm test', { output: { text: 'ACTUAL recorded output', truncated: false } }), bash('b', 'npm run build')]
    const render = async (records = tools, scope = 'A', visible = true) => act(async () => root!.render(<MiraConversationDetails memory={memory} scope={scope}>{visible && <AssistantMessageParts message={message(records.map(part))} toolsById={new Map(records.map(tool => [tool.id, tool]))} />}</MiraConversationDetails>))
    await render()
    const group = container.querySelector<HTMLElement>('[data-tool-group-kind="commands"]')!
    expect(container.querySelector('[data-tool-payload]')).toBeNull()
    await act(async () => group.querySelector<HTMLElement>('[aria-label="展开执行过程"]')!.click())
    expect(group.querySelectorAll('[data-tool-call-id]')).toHaveLength(2)
    expect(container.textContent).not.toContain('ACTUAL recorded output')
    await act(async () => group.querySelector<HTMLElement>('[aria-label="展开终端详情"]')!.click())
    expect(container.textContent).toContain('ACTUAL recorded output')
    const expandedTool = group.querySelector<HTMLElement>('[data-tool-call-id="a"]')!
    expect(expandedTool.querySelector('.mira-tool-summary')?.textContent).not.toContain('npm test')
    expect(expandedTool.querySelectorAll('[aria-label="执行命令"]')).toHaveLength(1)
    await render([...tools, bash('c', 'npm run lint')])
    expect(container.querySelector('[data-tool-group-kind="commands"]')).toBe(group)
    expect(group.dataset.state).toBe('open')
    await render(tools, 'A', false); await render()
    expect(container.textContent).toContain('ACTUAL recorded output')
    await render(tools, 'B')
    expect(container.querySelector<HTMLElement>('[data-tool-group-kind="commands"]')?.dataset.state).toBe('closed')
  })
})
