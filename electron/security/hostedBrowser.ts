export const HOSTED_BROWSER_PARTITION = 'persist:mira-harness-browser'

export function isAllowedHostedBrowserUrl(value: string) {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
  } catch {
    return false
  }
}
