import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraImagePreview } from '../apps/harness-react/src/components/workspace/MiraImagePreview'

const hooks = vi.hoisted(() => ({ decoded: undefined as unknown }))
vi.mock('react', async importActual => {
  const actual = await importActual<typeof React>()
  return { ...actual, useState: () => [hooks.decoded, (value: unknown) => { hooks.decoded = value }] }
})

function element(node: React.ReactNode, type: string): React.ReactElement<Record<string, any>> | undefined {
  if (!React.isValidElement<Record<string, any>>(node)) return undefined
  if (node.type === type) return node
  for (const child of React.Children.toArray(node.props.children)) {
    const match = element(child, type)
    if (match) return match
  }
}

function textContent(node: React.ReactNode): string {
  if (typeof node === 'string') return node
  return React.isValidElement<Record<string, any>>(node) ? React.Children.toArray(node.props.children).map(textContent).join('') : ''
}

describe('Mira image native decode lifecycle', () => {
  beforeEach(() => { hooks.decoded = undefined; vi.stubGlobal('React', React) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('uses actual img load dimensions, then presents decode failure with a functional retry', () => {
    const props = { title: 'logo@2x.png', sourcePath: 'logo@2x.png', source: 'data:image/png;base64,fixture', active: true, onRetry: vi.fn(), onDecodeChange: vi.fn() }
    let tree = MiraImagePreview(props)
    expect(tree.props['aria-busy']).toBe(true)
    expect(textContent(tree)).toContain('正在加载图片')
    element(tree, 'img')!.props.onLoad({ currentTarget: { naturalWidth: 240, naturalHeight: 120 } })
    tree = MiraImagePreview(props)
    expect(tree.props['aria-busy']).toBe(false)
    expect(element(tree, 'img')!.props.style).toEqual({ width: 120, height: 60 })
    expect(props.onDecodeChange).toHaveBeenLastCalledWith(false)
    element(tree, 'img')!.props.onError()
    tree = MiraImagePreview(props)
    expect(element(tree, 'img')).toBeUndefined()
    expect(textContent(tree)).toContain('图片无法解码')
    expect(props.onDecodeChange).toHaveBeenLastCalledWith(true)
    element(tree, 'button')!.props.onClick()
    expect(props.onRetry).toHaveBeenCalledOnce()
  })

  it('does not reuse a failed source or old dimensions for a newly loaded image', () => {
    const props = { title: 'logo.png', sourcePath: 'logo.png', source: 'data:image/png;base64,broken', active: true, onRetry: vi.fn() }
    element(MiraImagePreview(props), 'img')!.props.onError()
    const fresh = { ...props, source: 'data:image/png;base64,recovered' }
    let tree = MiraImagePreview(fresh)
    expect(element(tree, 'img')).toBeDefined()
    expect(tree.props['aria-busy']).toBe(true)
    expect(textContent(tree)).not.toContain('图片无法解码')
    element(tree, 'img')!.props.onLoad({ currentTarget: { naturalWidth: 64, naturalHeight: 32 } })
    tree = MiraImagePreview(fresh)
    expect(tree.props['aria-busy']).toBe(false)
    expect(textContent(tree)).not.toContain('正在加载图片')
  })

  it('preserves the fitted SVG canvas and disables retry on an inactive tab', () => {
    const props = { title: 'drawing.svg', sourcePath: 'drawing@2x.svg', source: 'data:image/svg+xml,fixture', fit: true, active: false, onRetry: vi.fn() }
    let tree = MiraImagePreview(props)
    expect(tree.props.className).toContain('is-fitted')
    element(tree, 'img')!.props.onLoad({ currentTarget: { naturalWidth: 240, naturalHeight: 120 } })
    tree = MiraImagePreview(props)
    expect(element(tree, 'img')!.props.style).toBeUndefined()
    element(tree, 'img')!.props.onError()
    expect(element(MiraImagePreview(props), 'button')!.props.disabled).toBe(true)
  })
})
