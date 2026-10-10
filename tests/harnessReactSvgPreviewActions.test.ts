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

function panel(path = 'broken.svg', active = true) {
  const onAddFile = vi.fn()
  const render = () => {
    hooks.index = 0
    return FilePreviewPanel({ controller: {} as PilotController, sessionId: 'alpha', path, active, onAddFile })
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

  it('does not permit unreadable SVG source', () => {
    const svg = panel()
    hooks.states[0] = { sessionId: 'alpha', path: 'broken.svg', status: 'error', error: '文件不存在' }
    svg.setMode(svg.render(), 'source')
    expect(svg.addButton(svg.render())!.props.disabled).toBe(true)
    svg.addButton(svg.render())!.props.onClick()
    expect(svg.onAddFile).not.toHaveBeenCalled()
  })

  it.each([
    ['assets/logo.png', 'image/png'], ['assets/logo.JPG', 'image/jpeg'], ['assets/logo.jpeg', 'image/jpeg'],
    ['assets/logo.gif', 'image/gif'], ['assets/logo.webp', 'image/webp'],
  ])('adds authorized supported image %s and disables a failed decode until it recovers', (path, mediaType) => {
    const bitmap = panel(path)
    let tree = bitmap.render()
    expect(bitmap.addButton(tree)!.props.disabled).toBe(true)
    bitmap.addButton(tree)!.props.onClick()
    expect(bitmap.onAddFile).not.toHaveBeenCalled()
    hooks.states[0] = { sessionId: 'alpha', path, status: 'image', image: { path, mediaType, dataBase64: 'fixture', byteLength: 8 } }
    tree = bitmap.render()
    expect(bitmap.addButton(tree)!.props.disabled).toBe(false)
    bitmap.addButton(tree)!.props.onClick()
    expect(bitmap.onAddFile).toHaveBeenCalledExactlyOnceWith(path)
    bitmap.onAddFile.mockClear()
    findControl(tree, node => node.type === MiraImagePreview)!.props.onDecodeChange(true)
    tree = bitmap.render()
    expect(bitmap.addButton(tree)!.props.disabled).toBe(true)
    bitmap.addButton(tree)!.props.onClick()
    expect(bitmap.onAddFile).not.toHaveBeenCalled()
    findControl(tree, node => node.type === MiraImagePreview)!.props.onDecodeChange(false)
    tree = bitmap.render()
    expect(bitmap.addButton(tree)!.props.disabled).toBe(false)
    bitmap.addButton(tree)!.props.onClick()
    expect(bitmap.onAddFile).toHaveBeenCalledExactlyOnceWith(path)
  })

  it.each([
    ['logo.avif', 'image/avif'], ['logo.apng', 'image/apng'], ['logo.bmp', 'image/bmp'], ['logo.ico', 'image/x-icon'],
  ])('keeps unsupported image %s previewable but explains why it cannot be attached', (path, mediaType) => {
    const bitmap = panel(path)
    hooks.states[0] = { sessionId: 'alpha', path, status: 'image', image: { path, mediaType, dataBase64: 'fixture', byteLength: 8 } }
    const tree = bitmap.render()
    expect(findControl(tree, node => node.type === MiraImagePreview)).toBeDefined()
    const add = bitmap.addButton(tree)!
    expect(add.props.disabled).toBe(true)
    expect(add.props.title).toContain('PNG、JPEG、GIF 或 WebP')
    add.props.onClick()
    expect(bitmap.onAddFile).not.toHaveBeenCalled()
  })

  it.each(['loading', 'error', 'wrong-owner', 'inactive'])('refuses a supported image attachment during %s', state => {
    const bitmap = panel('logo.png', state !== 'inactive')
    hooks.states[0] = state === 'loading' ? { sessionId: 'alpha', path: 'logo.png', status: 'loading' }
      : state === 'error' ? { sessionId: 'alpha', path: 'logo.png', status: 'error', error: '文件不可读取' }
        : { sessionId: state === 'wrong-owner' ? 'beta' : 'alpha', path: 'logo.png', status: 'image', image: { path: 'logo.png', mediaType: 'image/png', dataBase64: 'fixture', byteLength: 8 } }
    const add = bitmap.addButton(bitmap.render())!
    expect(add.props.disabled).toBe(true)
    add.props.onClick()
    expect(bitmap.onAddFile).not.toHaveBeenCalled()
  })
})
