// Display zoom semantics adapted from ZCode desktopZoom (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd.; see third-party-licenses/zcode.
import type { BrowserWindow } from 'electron'

export function miraZoomLevel(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(5, Math.max(-3, Math.round(value))) : 0
}

// The shell header is 48 CSS pixels tall; native traffic lights are 14 points tall.
export function miraTrafficLightPosition(factor: number) {
  return { x: 24, y: Math.round(24 * factor - 7) }
}

export function alignMiraTrafficLights(window: BrowserWindow, factor: number) {
  if (process.platform === 'darwin') window.setWindowButtonPosition(miraTrafficLightPosition(factor))
}

export function applyMiraZoom(window: BrowserWindow | null | undefined, action: 'in' | 'out' | 'reset', save?: (level: number) => void) {
  if (!window || window.isDestroyed()) return
  const factor = window.webContents.getZoomFactor()
  const current = miraZoomLevel(Math.log(factor) / Math.log(1.1))
  const next = action === 'reset' ? 0 : miraZoomLevel(current + (action === 'in' ? 1 : -1))
  window.webContents.setZoomFactor(1.1 ** next)
  alignMiraTrafficLights(window, 1.1 ** next)
  window.webContents.send('window:zoom-changed', 1.1 ** next)
  save?.(next)
}
