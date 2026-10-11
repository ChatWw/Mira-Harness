// Adapted from ZCode ExecuteToolCallBlock/ExecuteOutput (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd. Mira consumes only its public tool snapshots.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ToolCallRecord } from '../../../../../src/config/harness'
import { miraRecordedCommand } from '../../lib/mira-command-presentation'

export function MiraCommandOutput({ text, running }: { text: string; running: boolean }) {
  const viewport = useRef<HTMLDivElement>(null)
  const previousTop = useRef(0)
  const hasStreamed = useRef(running)
  const [frozen, setFrozen] = useState<string>()
  const [mask, setMask] = useState('none')
  const displayed = frozen ?? text
  const updateMask = useCallback(() => {
    const node = viewport.current
    if (!node) return
    const maxTop = node.scrollHeight - node.clientHeight
    const top = node.scrollTop > 1, bottom = node.scrollTop < maxTop - 1
    setMask(maxTop <= 1 ? 'none' : top && bottom ? 'both' : top ? 'top' : bottom ? 'bottom' : 'none')
  }, [])
  useLayoutEffect(() => {
    if (running) hasStreamed.current = true
    if (hasStreamed.current && frozen === undefined && viewport.current) {
      viewport.current.scrollTop = viewport.current.scrollHeight
      previousTop.current = viewport.current.scrollTop
    }
    updateMask()
  }, [displayed, frozen, running, updateMask])
  useEffect(() => {
    const node = viewport.current
    if (!node) return
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(updateMask)
    observer?.observe(node)
    if (node.firstElementChild) observer?.observe(node.firstElementChild)
    window.addEventListener('resize', updateMask)
    return () => { observer?.disconnect(); window.removeEventListener('resize', updateMask) }
  }, [updateMask])
  return <div ref={viewport} className="mira-command-output" role="region" aria-label="命令输出" tabIndex={0} data-following={frozen === undefined} data-scroll-mask={mask} onScroll={event => {
    const node = event.currentTarget
    const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight <= 8
    if (hasStreamed.current && frozen === undefined && node.scrollTop < previousTop.current && !atBottom) setFrozen(displayed)
    else if (frozen !== undefined && atBottom) setFrozen(undefined)
    previousTop.current = node.scrollTop
    updateMask()
  }}><pre>{displayed}</pre></div>
}

export function MiraToolCommand({ tool }: { tool: ToolCallRecord }) {
  const command = miraRecordedCommand(tool)
  const output = tool.output?.text
  const result = tool.error ? output && !tool.error.startsWith(output) ? `${output}\n\n${tool.error}` : tool.error : output
  return <section className="mira-command-box" aria-label="终端工具详情">
    {command !== undefined && <div className="mira-command-line"><span aria-hidden="true">$</span><pre aria-label="执行命令">{command}</pre></div>}
    {result !== undefined && <div data-tool-payload={tool.output ? 'output' : undefined} role={tool.error ? 'alert' : undefined}><div data-mira-selectable="tool" data-mira-selection-region={`${tool.id}:output`}><MiraCommandOutput text={result} running={tool.status === 'running'} /></div>{tool.output?.truncated && <p className="mira-payload-truncated" role="note">输出已被截断，仅显示已记录部分。</p>}</div>}
    {!tool.output && !tool.error && tool.status !== 'running' && <p role="status">{tool.status === 'waiting-confirm' ? '等待权限确认。' : tool.status === 'cancelled' ? '命令已取消，未记录执行结果。' : tool.status === 'failed' ? '命令执行失败，当前记录未提供错误详情。' : '命令已完成，没有记录输出。'}</p>}
    {tool.input && <details className="mira-command-parameters"><summary>查看调用参数</summary><div data-tool-payload="input"><pre data-mira-selectable="tool" data-mira-selection-region={`${tool.id}:input`}>{tool.input.text}</pre>{tool.input.truncated && <p className="mira-payload-truncated" role="note">输入超过记录上限，仅显示已记录部分。</p>}</div></details>}
  </section>
}
