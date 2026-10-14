import { miraShortcutKeys } from '../../../../../src/platform/workbenchShortcuts'

export function ShortcutKeys({ shortcut }: { shortcut: string }) {
  return <span className="mira-shortcut-keys">{miraShortcutKeys(shortcut).map((key, index) => <kbd key={index}>{key}</kbd>)}</span>
}
