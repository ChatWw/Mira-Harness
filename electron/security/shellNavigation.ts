export function isTrustedShellNavigation(targetUrl: string, shellUrl: string) {
  try {
    const target = new URL(targetUrl)
    const shell = new URL(shellUrl)
    if (shell.protocol === 'file:') return target.protocol === 'file:' && target.pathname === shell.pathname && target.search === shell.search
    return ['http:', 'https:'].includes(shell.protocol) && target.origin === shell.origin
  } catch {
    return false
  }
}
