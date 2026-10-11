// Browser icons are presentation metadata, never navigation or executable content.
export function miraBrowserFavicon(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 4096) return
  try {
    const url = new URL(value)
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return url.href
  } catch { /* malformed page metadata has no icon */ }
}
