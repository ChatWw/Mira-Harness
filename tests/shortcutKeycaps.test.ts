import { expect, it } from 'vitest'
import { miraShortcutKeys, miraShortcutLabel } from '../src/platform/workbenchShortcuts'
it.each(['MacIntel', 'Win32'])('splits each shortcut key into a separate keycap on %s', platform => {
  expect(miraShortcutKeys(miraShortcutLabel('Shift+M', platform))).toEqual([platform === 'MacIntel' ? '⌘' : 'Ctrl', 'Shift', 'M'])
  expect(miraShortcutKeys(miraShortcutLabel('Alt+B', platform))).toEqual([platform === 'MacIntel' ? '⌘' : 'Ctrl', platform === 'MacIntel' ? '⌥' : 'Alt', 'B'])
  expect(miraShortcutKeys(miraShortcutLabel('[', platform))).toEqual([platform === 'MacIntel' ? '⌘' : 'Ctrl', '['])
  expect(miraShortcutKeys('Enter')).toEqual(['Enter'])
})
