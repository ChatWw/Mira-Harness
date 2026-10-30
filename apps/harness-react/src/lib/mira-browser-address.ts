export function normalizeMiraBrowserAddress(input: string): string | undefined {
  let value = input.trim()
  if (!value || value.length > 4096 || /\s/.test(value)) return
  if (/^::1(?=[:/?#]|$)/.test(value)) value = `[::1]${value.slice(3)}`
  const explicit = /^[a-z][a-z\d+.-]*:/i.exec(value)?.[0]
  if (explicit && /^(javascript|data|file|ftp|blob|about|chrome|mailto|tel|ws|wss):$/i.test(explicit)) return
  if (explicit && !/^https?:$/i.test(explicit) && !/^\d{1,5}(?:$|[/?#])/.test(value.slice(explicit.length))) return
  try {
    const parsed = new URL(/^https?:/i.test(value) ? value : value.startsWith('//') ? `https:${value}` : `https://${value}`)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return
    if (!/^https?:/i.test(value)) {
      const host = parsed.hostname.toLowerCase(), parts = host.split('.').map(Number)
      const privateV4 = parts.length === 4 && parts.every(n => Number.isInteger(n) && n >= 0 && n <= 255)
        && (parts[0] === 127 || parts[0] === 10 || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31 || parts[0] === 192 && parts[1] === 168 || parts[0] === 169 && parts[1] === 254 || host === '0.0.0.0')
      const local = ['localhost', 'localhost.localdomain', '[::1]', '[0:0:0:0:0:0:0:1]'].includes(host) || /\.(localhost|local|test)$/.test(host)
      if (privateV4 || local || parsed.port) return new URL(value.startsWith('//') ? `http:${value}` : `http://${value}`).href
    }
    return parsed.href
  } catch { return }
}
