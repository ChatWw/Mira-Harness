export interface KeyboardInput {
  type: string
  key: string
  control: boolean
  meta: boolean
}

export function shouldBlockReloadShortcut(input: KeyboardInput, isPackaged: boolean): boolean {
  if (!isPackaged || input.type !== 'keyDown') return false

  const key = input.key.toLowerCase()
  return key === 'f5' || (key === 'r' && (input.control || input.meta))
}
