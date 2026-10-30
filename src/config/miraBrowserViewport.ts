export interface MiraBrowserSize { width: number; height: number }
export const MIRA_BROWSER_LIMITS = { width: [320, 3840], height: [320, 2160] } as const
export const MIRA_BROWSER_ZOOMS = ['fit', '50', '75', '100', '125', '150', '200'] as const
export type MiraBrowserZoom = typeof MIRA_BROWSER_ZOOMS[number]
export interface MiraBrowserPreference { mode: 'normal' | 'free'; size: MiraBrowserSize; zoom: MiraBrowserZoom }
export const MIRA_BROWSER_DEFAULT: MiraBrowserPreference = { mode: 'normal', size: { width: 393, height: 852 }, zoom: 'fit' }
export function isMiraBrowserDimension(key: keyof MiraBrowserSize, value: unknown): value is number {
  const [min, max] = MIRA_BROWSER_LIMITS[key]
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}
export function readMiraBrowserPreference(value: unknown): MiraBrowserPreference {
  const input = value as Partial<MiraBrowserPreference> | null
  if (!input || !['normal', 'free'].includes(String(input.mode)) || !input.size || !isMiraBrowserDimension('width', input.size.width) || !isMiraBrowserDimension('height', input.size.height) || !MIRA_BROWSER_ZOOMS.includes(input.zoom!)) return { ...MIRA_BROWSER_DEFAULT, size: { ...MIRA_BROWSER_DEFAULT.size } }
  return { mode: input.mode!, size: { ...input.size }, zoom: input.zoom! }
}
export function miraBrowserScale(canvas: MiraBrowserSize, size: MiraBrowserSize, zoom: MiraBrowserZoom, desktopZoom = 1) {
  if (zoom !== 'fit') return Number(zoom) / 100
  if (canvas.width <= 32 || canvas.height <= 32) return 1
  return Math.min(1, (canvas.width - 32) * desktopZoom / size.width, (canvas.height - 32) * desktopZoom / size.height)
}
