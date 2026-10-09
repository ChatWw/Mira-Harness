import * as React from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FilePreviewPanel, FilePreviewSource } from '../apps/harness-react/src/components/workspace/FilePreviewPanel'
import { MiraImagePreview } from '../apps/harness-react/src/components/workspace/MiraImagePreview'
import type { PilotController } from '../apps/harness-react/src/state/pilot-state'

const hooks = vi.hoisted(() => ({ states: [] as unknown[], index: 0 }))
vi.mock('react', async importActual => {
  const actual = await importActual<typeof React>()
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = hooks.index++
      if (hooks.states.length <= index) hooks.states[index] = initial
      return [hooks.states[index], (value: unknown) => { hooks.states[index] = typeof value === 'function' ? value(hooks.states[index]) : value }]
    },
    useMemo: (compute: () => unknown) => compute(),
    useEffect: () => undefined,
    useRef: (value: unknown) => ({ current: value }),
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  }
})

type Control = React.ReactElement<Record<string, any>>
function findControl(node: React.ReactNode, matches: (element: Control) => boolean): Control | undefined {
  if (!React.isValidElement<Record<string, any>>(node)) return undefined
  if (matches(node)) return node
  for (const child of React.Children.toArray(node.props.children)) {
    const match = findControl(child, matches)
    if (match) return match
  }
}

function panel(path = 'broken.svg') {
  const onAddFile = vi.fn()
  const render = () => {
    hooks.index = 0
    return FilePreviewPanel({ controller: {} as PilotController, sessionId: 'alpha', path, active: true, onAddFile })
  }
  render()
  const addButton = (tree: React.ReactNode) => findControl(tree, node => node.props['aria-label'] === '将当前文件加入对话')
  const setMode = (tree: React.ReactNode, mode: string) => findControl(tree, node => node.type === DropdownMenu.RadioGroup)!.props.onValueChange(mode)
  return { render, onAddFile, addButton, setMode }
}

describe('Mira SVG preview and source conversation actions', () => {
  beforeEach(() => { hooks.states = []; hooks.index = 0; vi.stubGlobal('React', React) })
  afterEach(() => vi.unstubAllGlobals())

  it('blocks a failed SVG image in preview but permits its readable source for model repair', () => {
    const { render, onAddFile, addButton, setMode } = panel()
    hooks.states[0] = { sessionId: 'alpha', path: 'broken.svg', status: 'ready', content: '<svg><broken>' }
    let tree = render()
    findControl(tree, node => node.type === MiraImagePreview)!.props.onDecodeChange(true)
    tree = render()
    expect(addButton(tree)!.props.disabled).toBe(true)
    setMode(tree, 'source')
    tree = render()
    expect(findControl(tree, node => node.type === FilePreviewSource)!.props.content).toBe('<svg><broken>')
    expect(addButton(tree)!.props.disabled).toBe(false)
    addButton(tree)!.props.onClick()
    expect(onAddFile).toHaveBeenCalledExactlyOnceWith('broken.svg')
    setMode(tree, 'preview')
    expect(addButton(render())!.props.disabled).toBe(true)
  })

  it('does not permit unreadable SVG source or expose a bitmap conversation action', () => {
    const svg = panel()
    hooks.states[0] = { sessionId: 'alpha', path: 'broken.svg', status: 'error', error: '文件不存在' }
    svg.setMode(svg.render(), 'source')
    expect(svg.addButton(svg.render())!.props.disabled).toBe(true)
    hooks.states = []
    const bitmap = panel('logo.png')
    hooks.states[0] = { sessionId: 'alpha', path: 'logo.png', status: 'image', image: { path: 'logo.png', mediaType: 'image/png', dataBase64: 'fixture', byteLength: 8 } }
    expect(bitmap.addButton(bitmap.render())).toBeUndefined()
  })
})
