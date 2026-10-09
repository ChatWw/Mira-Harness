import type { HarnessWorkspaceImagePreview } from '../../../../src/config/harness'

const bitmapExtensions = new Set(['apng', 'avif', 'bmp', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'webp'])
const bitmapMediaTypes = new Set(['image/apng', 'image/avif', 'image/bmp', 'image/gif', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/jpeg', 'image/png', 'image/webp'])

export function filePreviewKind(path: string): 'text' | 'bitmap' | 'svg' {
  const name = path.split('/').pop()!
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
  return extension === 'svg' ? 'svg' : bitmapExtensions.has(extension) ? 'bitmap' : 'text'
}

export function filePreviewImageSource(image: HarnessWorkspaceImagePreview) {
  if (!bitmapMediaTypes.has(image.mediaType)) throw new Error('图片格式不受支持，请在外部编辑器中打开。')
  return `data:${image.mediaType};base64,${image.dataBase64}`
}

const fileLanguages: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', mjs: 'javascript', cjs: 'javascript',
  vue: 'vue', md: 'markdown', markdown: 'markdown', json: 'json', jsonc: 'jsonc',
  sh: 'shell', bash: 'shell', zsh: 'shell', py: 'python', css: 'css', scss: 'scss',
  html: 'html', htm: 'html', xml: 'xml', svg: 'xml', yaml: 'yaml', yml: 'yaml', sql: 'sql',
}

export function filePreviewLanguage(path: string) {
  const name = path.split('/').pop()!.toLowerCase()
  if (name === 'dockerfile') return 'dockerfile'
  if (name === 'makefile') return 'makefile'
  return fileLanguages[name.slice(name.lastIndexOf('.') + 1)] || 'text'
}

export function filePreviewAbsolutePath(directory: string | undefined, path: string) {
  if (!directory) return undefined
  const separator = directory.includes('\\') ? '\\' : '/'
  return directory.replace(/[\\/]+$/, '') + separator + path.replace(/\//g, separator)
}

export function filePreviewBreadcrumbs(directory: string | undefined, path: string) {
  const root = directory?.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop()
  return [...(root ? [root] : []), ...path.split('/')]
}

export type FilePreviewIdentity = { sessionId: string; path: string; directory?: string }

export function filePreviewKey({ sessionId, path, directory }: FilePreviewIdentity) {
  return JSON.stringify([sessionId, path, directory ?? null])
}

export type FilePreviewSnapshot = FilePreviewIdentity & (
  { status: 'loading' } | { status: 'ready'; content: string } | { status: 'image'; image: HarnessWorkspaceImagePreview } | { status: 'error'; error: string }
)

type PreviewFileReader = (sessionId: string, path: string) => Promise<{ path: string; content: string }>
type PreviewImageReader = (sessionId: string, path: string) => Promise<HarnessWorkspaceImagePreview>

function startPreviewRead<T extends { path: string }>(readFile: (sessionId: string, path: string) => Promise<T>, toSnapshot: (result: T) => { status: 'ready'; content: string } | { status: 'image'; image: HarnessWorkspaceImagePreview }, identity: FilePreviewIdentity, onChange: (snapshot: FilePreviewSnapshot) => void) {
  let disposed = false
  onChange({ ...identity, status: 'loading' })
  const failed = (error: unknown) => {
    if (!disposed) onChange({ ...identity, status: 'error', error: error instanceof Error ? error.message : '读取文件失败，请重试。' })
  }
  void readFile(identity.sessionId, identity.path).then(result => {
    if (disposed) return
    try {
      onChange(result.path === identity.path
        ? { ...identity, ...toSnapshot(result) }
        : { ...identity, status: 'error', error: '文件预览响应路径不匹配，请重试。' })
    } catch (error) { failed(error) }
  }, failed)
  return () => { disposed = true }
}

export function startFilePreviewRead(readFile: PreviewFileReader, sessionId: string, path: string, onChange: (snapshot: FilePreviewSnapshot) => void, directory?: string) {
  return startPreviewRead(readFile, result => ({ status: 'ready', content: result.content }), { sessionId, path, ...(directory !== undefined ? { directory } : {}) }, onChange)
}

function createPreviewReader(startRead: (onChange: (snapshot: FilePreviewSnapshot) => void) => () => void, onChange: (snapshot: FilePreviewSnapshot) => void) {
  let refreshVersion: number | undefined
  let disposeRead: (() => void) | undefined
  let pending = false
  return {
    read(active: boolean, refresh: number) {
      if (!active) {
        if (pending) { disposeRead?.(); refreshVersion = undefined; pending = false }
        return
      }
      if (refreshVersion === refresh) return
      disposeRead?.()
      refreshVersion = refresh
      disposeRead = startRead(snapshot => { pending = snapshot.status === 'loading'; onChange(snapshot) })
    },
    dispose() {
      disposeRead?.()
      refreshVersion = undefined
      pending = false
    },
  }
}

export function createFilePreviewReader(readFile: PreviewFileReader, identity: FilePreviewIdentity, onChange: (snapshot: FilePreviewSnapshot) => void) {
  return createPreviewReader(callback => startFilePreviewRead(readFile, identity.sessionId, identity.path, callback, identity.directory), onChange)
}

export function createFileImagePreviewReader(readImage: PreviewImageReader, identity: FilePreviewIdentity, onChange: (snapshot: FilePreviewSnapshot) => void) {
  return createPreviewReader(callback => startPreviewRead(readImage, image => {
    if (!bitmapMediaTypes.has(image.mediaType)) throw new Error('图片格式不受支持，请在外部编辑器中打开。')
    return { status: 'image', image }
  }, identity, callback), onChange)
}
