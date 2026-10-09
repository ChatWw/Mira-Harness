export const HARNESS_COMMAND_CENTER_EVENT = 'mira:open-harness-command-center'

export function openHarnessCommandCenter(path: string, target: Pick<Window, 'dispatchEvent'>): boolean {
  if (path !== '/workspace/harness-react') return false
  target.dispatchEvent(new CustomEvent(HARNESS_COMMAND_CENTER_EVENT))
  return true
}
