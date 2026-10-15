import type { ReactElement } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'

export function MarketIconHint({ label, children }: { label?: string; children: ReactElement }) {
  if (!label) return children
  return <Tooltip.Provider delayDuration={350}><Tooltip.Root><Tooltip.Trigger asChild>{children}</Tooltip.Trigger><Tooltip.Portal container={typeof document === 'undefined' ? undefined : document.getElementById('root')}><Tooltip.Content className="mira-sidebar-tooltip" side="top" sideOffset={6}>{label}</Tooltip.Content></Tooltip.Portal></Tooltip.Root></Tooltip.Provider>
}
