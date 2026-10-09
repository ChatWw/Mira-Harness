import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { KeyboardCode, KeyboardSensor, type KeyboardSensorOptions, type SensorDescriptor, type SensorOptions } from '@dnd-kit/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceTabs } from '../apps/harness-react/src/components/workspace/WorkspaceTabs'

const captured = vi.hoisted(() => ({ keyboard: undefined as KeyboardSensorOptions | undefined }))

vi.mock('@dnd-kit/core', async importOriginal => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>()
  return {
    ...actual,
    DndContext: ({ sensors }: { sensors?: SensorDescriptor<SensorOptions>[] }) => {
      captured.keyboard = sensors?.find(item => item.sensor === actual.KeyboardSensor)?.options as KeyboardSensorOptions | undefined
      return null
    },
  }
})

afterEach(() => { vi.unstubAllGlobals(); captured.keyboard = undefined })

describe('React Harness workspace tab keyboard interaction', () => {
  it('preserves Enter activation while Space still begins dragging', () => {
    vi.stubGlobal('React', React)
    vi.stubGlobal('document', { getElementById: () => null })
    const action = vi.fn()
    renderToStaticMarkup(React.createElement(WorkspaceTabs, {
      tabs: [], active: 'overview', changes: 0, recentClosedTabs: [],
      onOpen: action, onActivate: action, onClose: action, onCloseOthers: action,
      onCloseAll: action, onReopen: action, onReorder: action, onDismiss: action,
    }))
    expect(captured.keyboard).toBeDefined()
    const activator = { current: null }
    const enter = { nativeEvent: { code: KeyboardCode.Enter }, target: null, preventDefault: vi.fn() }
    const space = { nativeEvent: { code: KeyboardCode.Space }, target: null, preventDefault: vi.fn() }
    const context = { active: { activatorNode: activator } } as Parameters<typeof KeyboardSensor.activators[0]['handler']>[2]
    expect(KeyboardSensor.activators[0].handler(enter, captured.keyboard!, context)).toBe(false)
    expect(enter.preventDefault).not.toHaveBeenCalled()
    expect(KeyboardSensor.activators[0].handler(space, captured.keyboard!, context)).toBe(true)
    expect(space.preventDefault).toHaveBeenCalledOnce()
  })
})
