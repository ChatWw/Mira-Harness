import { ShortcutKeys } from '../shared/ShortcutKeys'
import * as Tooltip from '@radix-ui/react-tooltip'
import type { ReactElement } from 'react'

export function ComposerControlHint({ title, shortcut, children }: { title: string; shortcut?: string; children: ReactElement }) {
  return <Tooltip.Root><Tooltip.Trigger asChild>{children}</Tooltip.Trigger><Tooltip.Portal container={document.getElementById('root')}><Tooltip.Content className="mira-composer-hint" side="top" sideOffset={6}>{title}{shortcut && <ShortcutKeys shortcut={shortcut} />}</Tooltip.Content></Tooltip.Portal></Tooltip.Root>
}
