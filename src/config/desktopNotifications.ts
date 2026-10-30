export type CompletionNotification = 'never' | 'unfocused' | 'always'
export interface DesktopNotifications {
  completion: CompletionNotification
  permissions: boolean
  questions: boolean
  sound: 'default' | 'silent'
}
export interface DesktopNotificationStatus { supported: boolean; settingsAvailable: boolean; error?: string }
export const DESKTOP_NOTIFICATIONS_KEY = 'desktopNotifications'

export function readDesktopNotifications(value: unknown): DesktopNotifications {
  const input = value && typeof value === 'object' ? value as Partial<DesktopNotifications> : {}
  return {
    completion: input.completion === 'never' || input.completion === 'always' ? input.completion : 'unfocused',
    permissions: input.permissions !== false,
    questions: input.questions !== false,
    sound: input.sound === 'silent' ? 'silent' : 'default',
  }
}
