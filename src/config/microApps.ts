import type { MicroApp } from '@/types'

// The local manifest is the single source of truth for embedded applications.
export const microApps: MicroApp[] = []

export function findMicroApp(code: string) {
  return microApps.find(app => app.code === code)
}
