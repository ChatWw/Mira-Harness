import { join } from 'node:path'

/** App-owned executable only. A missing resource must fail rather than run a user's PATH program. */
export function resolveMiraRipgrepPath(options: { appPath: string; isPackaged?: boolean; resourcesPath?: string; platform?: NodeJS.Platform }) {
  if (options.isPackaged && !options.resourcesPath) throw new Error('Mira packaged resources path is unavailable.')
  const root = options.isPackaged ? join(options.resourcesPath!, 'tools') : join(options.appPath, 'dist/mira-tools')
  return join(root, 'ripgrep', (options.platform ?? process.platform) === 'win32' ? 'rg.exe' : 'rg')
}
