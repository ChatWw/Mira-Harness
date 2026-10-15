// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import * as Tooltip from '@radix-ui/react-tooltip'
import { expect, it, vi } from 'vitest'
import { SidebarActionHint } from '../apps/harness-react/src/components/session/SidebarCollectionSection'

it('keeps restored panel-toggle focus without opening its hint, while other hints still open on focus', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div'); container.id = 'root'; document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(<Tooltip.Provider delayDuration={0}>
      <SidebarActionHint hoverOnly title="切换面板"><button>面板</button></SidebarActionHint>
      <SidebarActionHint title="其他提示"><button>其他</button></SidebarActionHint>
    </Tooltip.Provider>))
    const buttons = container.querySelectorAll('button')
    await act(async () => buttons[0].focus())
    expect(document.activeElement).toBe(buttons[0])
    expect(container.querySelector('[role="tooltip"]')).toBeNull()
    await act(async () => {
      buttons[0].blur()
      buttons[0].dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }))
      await new Promise(resolve => setTimeout(resolve, 20))
    })
    expect(container.querySelector('[role="tooltip"]')?.textContent).toBe('切换面板')
    await act(async () => buttons[0].dispatchEvent(new PointerEvent('pointerleave', { bubbles: false, pointerType: 'mouse' })))
    await act(async () => buttons[1].focus())
    expect(container.querySelector('[role="tooltip"]')?.textContent).toBe('其他提示')
  } finally { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals() }
})
