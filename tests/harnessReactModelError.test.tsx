// @vitest-environment happy-dom
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraModelErrorBanner } from '../apps/harness-react/src/components/composer/MiraModelErrorBanner'

const diagnostic = { code: 'MODEL_REQUEST_FAILED' as const, message: '模型请求失败，请查看详情或检查模型设置', detail: '401 invalid_api_key\n[REDACTED]' }
let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); container.id = 'root'; document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await React.act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const button = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find(value => value.getAttribute('aria-label') === label || value.textContent === label)!
async function render(overrides: Partial<React.ComponentProps<typeof MiraModelErrorBanner>> = {}) {
  const actions = { onDismiss: vi.fn(), onOpenSettings: vi.fn(async () => undefined), ...overrides }
  await React.act(async () => root.render(<MiraModelErrorBanner error={diagnostic} {...actions} />))
  return actions
}

describe('model error recovery', () => {
  it('keeps details out of the compact banner and opens a dismissible, labelled Radix dialog', async () => {
    await render()
    expect(container.querySelector('[role="alert"]')?.textContent).not.toContain('invalid_api_key')
    await React.act(async () => button('查看详情').click())
    const dialog = container.querySelector('[role="dialog"]')!
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('错误详情')
    expect(dialog.querySelector('pre')?.textContent).toBe(diagnostic.detail)
    await React.act(async () => button('关闭错误详情').click())
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('copies summary, code and detail and reports clipboard rejection without losing the error', async () => {
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('unavailable'))
    vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(writeText)
    await render(); await React.act(async () => button('复制错误').click())
    expect(writeText).toHaveBeenCalledWith(`${diagnostic.message}\n错误代码：MODEL_REQUEST_FAILED\n\n${diagnostic.detail}`)
    expect(button('复制错误').textContent).toBe('已复制')
    await React.act(async () => button('复制错误').click())
    expect(container.querySelector('[role="status"]')?.textContent).toContain('复制失败')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(diagnostic.message)
  })

  it('opens settings once while pending and retains the banner after failed navigation', async () => {
    let reject!: (error: Error) => void
    const onOpenSettings = vi.fn(() => new Promise<void>((_, fail) => { reject = fail }))
    await render({ onOpenSettings }); await React.act(async () => button('模型设置').click())
    expect(button('正在打开').disabled).toBe(true)
    await React.act(async () => reject(new Error('draft failed')))
    expect(container.querySelector('[role="status"]')?.textContent).toContain('当前输入已保留')
    expect(button('模型设置').disabled).toBe(false)
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })

  it('closes the details portal when its owner is unmounted and exposes explicit dismissal', async () => {
    const actions = await render(); await React.act(async () => button('关闭错误提示').click())
    expect(actions.onDismiss).toHaveBeenCalledOnce()
    await React.act(async () => button('查看详情').click())
    await React.act(async () => root.render(<div>另一任务</div>))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
})
