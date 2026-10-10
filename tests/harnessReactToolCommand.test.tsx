// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraCommandOutput, MiraToolCommand } from '../apps/harness-react/src/components/conversation/MiraToolCommand'
import type { ToolCallRecord } from '../src/config/harness'

let root: Root | undefined
beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); document.body.replaceChildren() })
const record: ToolCallRecord = { id: 'command', tool: 'bash', target: 'printf "<safe>"', status: 'ok', createdAt: 1, input: { text: '{"command":"printf \\\"<safe>\\\"","timeout":10}', truncated: false }, output: { text: 'result <safe>', truncated: false } }

describe('recorded command tool presentation', () => {
  it('separates the actual command and output, preserving parameter details and escaped public text', () => {
    const html = renderToStaticMarkup(<MiraToolCommand tool={record} />)
    expect(html).toContain('aria-label="执行命令"')
    expect(html).toContain('aria-label="命令输出"')
    expect(html).toContain('查看调用参数')
    expect(html).not.toContain('<safe>')
    expect(html).toContain('result &lt;safe&gt;')
  })

  it('only derives a missing command from complete public JSON and never labels arbitrary truncated input as a command', () => {
    const complete = renderToStaticMarkup(<MiraToolCommand tool={{ ...record, target: undefined, input: { text: '{"command":"npm test"}', truncated: false } }} />)
    expect(complete).toContain('npm test</pre>')
    const truncated = renderToStaticMarkup(<MiraToolCommand tool={{ ...record, target: undefined, input: { text: '{"command":"npm', truncated: true } }} />)
    expect(truncated).not.toContain('aria-label="执行命令"')
    expect(truncated).toContain('仅显示已记录部分')
  })

  it('retains partial output, actual errors and truncation notices together', () => {
    const html = renderToStaticMarkup(<MiraToolCommand tool={{ ...record, status: 'failed', error: 'real failure', output: { text: 'kept partial', truncated: true } }} />)
    expect(html).toContain('kept partial'); expect(html).toContain('real failure'); expect(html).toContain('输出已被截断')
    expect(html).not.toContain('没有记录输出')
  })

  it('keeps failure output in one bounded viewport without repeating the same captured prefix', () => {
    const html = renderToStaticMarkup(<MiraToolCommand tool={{ ...record, status: 'failed', output: { text: 'unique partial\n', truncated: false }, error: 'unique partial\n\nCommand exited with code 7' }} />)
    expect(html.match(/unique partial/g)).toHaveLength(1)
    expect(html).toContain('Command exited with code 7')
    expect(html.match(/aria-label="命令输出"/g)).toHaveLength(1)
    expect(html).toContain('role="alert"')
  })

  it('follows running output, freezes it when reading above the end, keeps it on completion and resumes the latest result at the end', async () => {
    const container = document.createElement('div'); document.body.append(container); root = createRoot(container)
    const render = async (text: string, running: boolean) => { await act(async () => root!.render(<MiraCommandOutput text={text} running={running} />)) }
    await render('first', true)
    const viewport = container.querySelector<HTMLElement>('[aria-label="命令输出"]')!
    let top = 0
    Object.defineProperties(viewport, { scrollHeight: { configurable: true, get: () => 240 }, clientHeight: { configurable: true, get: () => 100 }, scrollTop: { configurable: true, get: () => top, set: value => { top = Math.min(140, Math.max(0, Number(value))) } } })
    await render('first\nsecond', true)
    expect(top).toBe(140)
    expect(viewport.dataset.scrollMask).toBe('top')
    await act(async () => { viewport.scrollTop = 20; viewport.dispatchEvent(new Event('scroll', { bubbles: true })) })
    expect(viewport.dataset.following).toBe('false')
    expect(viewport.dataset.scrollMask).toBe('both')
    await render('first\nsecond\nthird', true)
    expect(viewport.textContent).toBe('first\nsecond'); expect(top).toBe(20)
    await render('first\nsecond\nthird\nfinal', false)
    expect(viewport.textContent).toBe('first\nsecond'); expect(top).toBe(20)
    await act(async () => { viewport.scrollTop = 140; viewport.dispatchEvent(new Event('scroll', { bubbles: true })) })
    expect(viewport.dataset.following).toBe('true')
    expect(viewport.textContent).toBe('first\nsecond\nthird\nfinal')
    expect(top).toBe(140)
    expect(viewport.dataset.scrollMask).toBe('top')
  })

  it('opens completed historical output at its start instead of moving a reader to the bottom', async () => {
    const container = document.createElement('div'); document.body.append(container); root = createRoot(container)
    await act(async () => root!.render(<MiraCommandOutput text={'line\n'.repeat(12)} running={false} />))
    expect(container.querySelector<HTMLElement>('[aria-label="命令输出"]')!.scrollTop).toBe(0)
    expect(container.querySelector('pre')!.textContent).toBe('line\n'.repeat(12))
  })
})
