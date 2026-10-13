// Adapted from ZCode ExecuteToolCallBlock/ExecuteOutput (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd. Mira consumes only its public tool snapshots.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import type { ToolCallRecord } from '../../../../../src/config/harness'
import { miraCommandExecutionStatus, miraRecordedCommand } from '../../lib/mira-command-presentation'

export function MiraCommandOutput({ text, running, fullHeight = false, active = true }: { text: string; running: boolean; fullHeight?: boolean; active?: boolean }) {
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
    if (active && (fullHeight || hasStreamed.current) && frozen === undefined && viewport.current) {
      viewport.current.scrollTop = viewport.current.scrollHeight
      previousTop.current = viewport.current.scrollTop
    }
    updateMask()
  }, [displayed, frozen, running, active, fullHeight, updateMask])
  useEffect(() => {
    const node = viewport.current
    if (!node) return
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(updateMask)
    observer?.observe(node)
    if (node.firstElementChild) observer?.observe(node.firstElementChild)
    window.addEventListener('resize', updateMask)
    return () => { observer?.disconnect(); window.removeEventListener('resize', updateMask) }
  }, [updateMask])
  return <div className={fullHeight ? 'mira-command-output-frame is-full-height' : 'mira-command-output-frame'}><div ref={viewport} className="mira-command-output" role="region" aria-label="命令输出" tabIndex={0} data-following={frozen === undefined} data-scroll-mask={mask} onScroll={event => {
    if (!active) return
    const node = event.currentTarget
    const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight <= 8
    if (hasStreamed.current && frozen === undefined && node.scrollTop < previousTop.current && !atBottom) setFrozen(displayed)
    else if (frozen !== undefined && atBottom) setFrozen(undefined)
    previousTop.current = node.scrollTop
    updateMask()
  }}><pre>{displayed}</pre></div>{fullHeight && frozen !== undefined && <button type="button" className="mira-command-resume" aria-label="跟随最新命令输出" title="跟随最新命令输出" onClick={() => setFrozen(undefined)}><ArrowDown size={16} aria-hidden="true" /></button>}</div>
}

export function MiraToolCommand({ tool }: { tool: ToolCallRecord }) {
  const command = miraRecordedCommand(tool)
  const payload = tool.commandJob?.mode === 'background' ? tool.commandJob.output : tool.commandJob?.output ?? tool.output
  const output = payload?.text
  const error = tool.commandJob?.error ?? tool.error
  const status = miraCommandExecutionStatus(tool)
  const result = error ? output && !error.startsWith(output) ? `${output}\n\n${error}` : error : output
  return <section className="mira-command-box" aria-label="终端工具详情">
    {command !== undefined && <div className="mira-command-line"><span aria-hidden="true">$</span><pre aria-label="执行命令">{command}</pre></div>}
    {result !== undefined && <div data-tool-payload={payload ? 'output' : undefined} role={error ? 'alert' : undefined}><div data-mira-selectable="tool" data-mira-selection-region={`${tool.id}:output`}><MiraCommandOutput text={result} running={status === 'running'} /></div>{payload?.truncated && <p className="mira-payload-truncated" role="note">输出已被截断，仅显示已记录部分。</p>}</div>}
    {!payload && !error && <p role="status">{status === 'running' ? '等待命令输出…' : status === 'waiting-confirm' ? '等待权限确认。' : status === 'cancelled' ? '命令已取消，未记录执行结果。' : status === 'failed' ? '命令执行失败，当前记录未提供错误详情。' : '命令已完成，没有记录输出。'}</p>}
    {tool.input && <details className="mira-command-parameters"><summary>查看调用参数</summary><div data-tool-payload="input"><pre data-mira-selectable="tool" data-mira-selection-region={`${tool.id}:input`}>{tool.input.text}</pre>{tool.input.truncated && <p className="mira-payload-truncated" role="note">输入超过记录上限，仅显示已记录部分。</p>}</div></details>}
  </section>
}
