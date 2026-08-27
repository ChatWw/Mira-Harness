import { describe, expect, it } from 'vitest'
import { ProjectTaskLock } from '../electron/projectTaskLock'
import { MAX_SUBTASK_REPORT_CHARS, SUBTASK_ROLE_TOOLS, boundedSubtaskReport, subtaskMayMutate } from '../electron/subtaskRuntime'

describe('subtask runtime policy', () => {
  it('keeps every role inside its fixed tool allowlist', () => {
    expect(SUBTASK_ROLE_TOOLS.explorer).toEqual(['list_files', 'read', 'web_fetch', 'web_search'])
    expect(SUBTASK_ROLE_TOOLS.reviewer).toEqual(['list_files', 'read'])
    expect(SUBTASK_ROLE_TOOLS.tester).toEqual(['list_files', 'read', 'bash'])
    expect(SUBTASK_ROLE_TOOLS.implementer).toEqual(['list_files', 'read', 'edit', 'write', 'delete_file', 'bash'])
    expect(Object.values(SUBTASK_ROLE_TOOLS).flat()).not.toContain('delegate_task')
    expect(Object.values(SUBTASK_ROLE_TOOLS).flat()).not.toContain('mcp_query')
    expect(subtaskMayMutate('explorer')).toBe(false)
    expect(subtaskMayMutate('reviewer')).toBe(false)
    expect(subtaskMayMutate('tester')).toBe(true)
    expect(subtaskMayMutate('implementer')).toBe(true)
  })

  it('bounds a long final report without losing its ending', () => {
    const value = `head-${'x'.repeat(MAX_SUBTASK_REPORT_CHARS * 2)}-tail`
    const report = boundedSubtaskReport(value)
    expect(report.length).toBeLessThanOrEqual(MAX_SUBTASK_REPORT_CHARS)
    expect(report).toContain('[子任务报告已截断]')
    expect(report.startsWith('head-')).toBe(true)
    expect(report.endsWith('-tail')).toBe(true)
  })

  it('allows concurrent readers but keeps a waiting writer ahead of newer readers', async () => {
    const lock = new ProjectTaskLock()
    const order: string[] = []
    const readOne = await lock.acquire('project', 'read')
    const readTwo = await lock.acquire('project', 'read')
    const writer = lock.acquire('project', 'write').then(release => { order.push('writer'); return release })
    const laterReader = lock.acquire('project', 'read').then(release => { order.push('reader'); return release })
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(order).toEqual([])
    readOne(); readTwo()
    const releaseWriter = await writer
    expect(order).toEqual(['writer'])
    releaseWriter()
    const releaseReader = await laterReader
    expect(order).toEqual(['writer', 'reader'])
    releaseReader()
  })
})
