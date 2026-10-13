// Display zoom semantics adapted from ZCode desktopZoom (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd.; see third-party-licenses/zcode.
import type { BrowserWindow } from 'electron'

export function miraZoomLevel(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(5, Math.max(-3, Math.round(value))) : 0
}

export function applyMiraZoom(window: BrowserWindow | null | undefined, action: 'in' | 'out' | 'reset', save?: (level: number) => void) {
  if (!window || window.isDestroyed()) return
  const factor = window.webContents.getZoomFactor()
  const current = miraZoomLevel(Math.log(factor) / Math.log(1.1))
  const next = action === 'reset' ? 0 : miraZoomLevel(current + (action === 'in' ? 1 : -1))
  window.webContents.setZoomFactor(1.1 ** next)
  window.webContents.send('window:zoom-changed', 1.1 ** next)
  save?.(next)
}
