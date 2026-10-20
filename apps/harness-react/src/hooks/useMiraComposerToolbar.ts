// Toolbar fit priority and invisible measurement adapted from ZCode (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd. Projects DOM geometry only; Mira owns all configuration.
import { useLayoutEffect, useRef } from 'react'

function fitToolbar(root: HTMLElement) {
  const leading = root.querySelector<HTMLElement>('[data-mira-toolbar-leading]')
  const content = root.querySelector<HTMLElement>('[data-mira-toolbar-content]')
  const trailing = root.querySelector<HTMLElement>('[data-mira-toolbar-trailing]')
  if (!leading || !content || !trailing) return
  const controls = root.querySelectorAll<HTMLElement>('[data-mira-toolbar-priority]')
  delete root.dataset.miraModelIcon
  controls.forEach(control => { delete control.dataset.miraCompact })
  const gap = Number.parseFloat(getComputedStyle(root).columnGap) || 12
  const overflow = () => Math.max(content.getBoundingClientRect().width - leading.getBoundingClientRect().width, content.getBoundingClientRect().width + trailing.getBoundingClientRect().width + gap - root.getBoundingClientRect().width)
  for (const priority of ['1', '2', '3']) {
    if (overflow() <= 0) return
    controls.forEach(control => { if (control.dataset.miraToolbarPriority === priority) control.dataset.miraCompact = 'true' })
  }
  if (overflow() <= 0) return
  const thought = root.querySelector<HTMLElement>('[data-mira-toolbar-priority="3"]')
  if (thought) thought.dataset.miraCompact = 'icon'
  if (overflow() > 0) root.dataset.miraModelIcon = 'true'
}

export function useMiraComposerToolbar(floating = false) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const root = ref.current
    if (!root || floating) return
    let disposed = false
    const update = () => {
      if (disposed || !root.isConnected || !root.parentElement || root.getBoundingClientRect().width <= 0) return
      // Keep mounted Radix triggers, hover targets and focused controls stable while measuring.
      const probe = root.cloneNode(true) as HTMLElement
      probe.setAttribute('aria-hidden', 'true'); probe.inert = true
      Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', pointerEvents: 'none', width: `${root.getBoundingClientRect().width}px`, left: '0', top: '0' })
      root.parentElement.append(probe)
      try {
        fitToolbar(probe)
        if (probe.dataset.miraModelIcon) root.dataset.miraModelIcon = probe.dataset.miraModelIcon
        else delete root.dataset.miraModelIcon
        const measured = probe.querySelectorAll<HTMLElement>('[data-mira-toolbar-priority]')
        root.querySelectorAll<HTMLElement>('[data-mira-toolbar-priority]').forEach((control, index) => {
          if (measured[index]?.dataset.miraCompact) control.dataset.miraCompact = measured[index].dataset.miraCompact
          else delete control.dataset.miraCompact
        })
      } finally { probe.remove() }
    }
    const resize = new ResizeObserver(update)
    const observe = () => {
      resize.disconnect(); resize.observe(root)
      root.querySelectorAll<HTMLElement>('[data-mira-toolbar-leading], [data-mira-toolbar-content], [data-mira-toolbar-trailing]').forEach(element => resize.observe(element))
      update()
    }
    const mutations = new MutationObserver(observe)
    mutations.observe(root, { childList: true, subtree: true, characterData: true })
    observe()
    void document.fonts?.ready.then(update)
    return () => { disposed = true; resize.disconnect(); mutations.disconnect() }
  }, [floating])
  return ref
}
