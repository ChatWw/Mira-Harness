import { useEffect, useState } from 'react'
import type { PermissionMode } from '../../../../../src/config/harness'
import { HARNESS_PERMISSION_OPTIONS } from '../../../../../src/config/harnessPermissions'

export function ComposerPermissionLabel({ value }: { value: PermissionMode }) {
  const [display, setDisplay] = useState<{ value: PermissionMode; previous?: PermissionMode; revision: number }>({ value, revision: 0 })
  if (display.value !== value) setDisplay({ value, previous: display.value, revision: display.revision + 1 })
  useEffect(() => {
    if (!display.previous) return
    const timer = window.setTimeout(() => setDisplay(current => ({ ...current, previous: undefined })), 220)
    return () => window.clearTimeout(timer)
  }, [display.revision])

  const label = (mode: PermissionMode) => HARNESS_PERMISSION_OPTIONS.find(item => item.value === mode)?.label
  return <span className="mira-permission-roll" data-rolling={display.previous ? '' : undefined}>
    {display.previous && <span key={`previous-${display.revision}`} className="mira-permission-roll__previous" aria-hidden="true">{label(display.previous)}</span>}
    <span key={display.revision} className="mira-permission-roll__current">{label(value)}</span>
  </span>
}
