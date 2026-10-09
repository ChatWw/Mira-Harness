/* Local editor selection adapted from ZCode packages/desktop/src/main/editors.ts / openInEditor.ts.
 * Copyright 2026 Z.AI Co., Ltd. Licensed under Apache-2.0.
 * Mira changes: asynchronous bounded detection, Mira IDs, canonical workspace paths and no shell commands.
 * See third-party-licenses/zcode/{LICENSE,NOTICE.md,ADAPTATIONS.md}. */
import { execFile, spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, realpath, rmdir, stat, unlink } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { isAbsolute, join, relative, sep, win32 } from 'node:path'
import { app, shell } from 'electron'
import { resolveHarnessWorkspacePath, workspaceFileError } from './harnessWorkspaceFiles'

export type HarnessInstalledEditor = { id: string; name: string; icon?: string; fileOnly?: boolean }
type EditorDefinition = { id: string; name: string; paths: string[] }
const CACHE_MS = 30_000
const MAX_ICON_BYTES = 128_000
const FILE_ONLY_EDITORS = new Set(['mira-textedit', 'mira-notepad'])
let cached: { platform: string; expires: number; editors: HarnessInstalledEditor[] } | undefined
let pending: { platform: string; result: Promise<HarnessInstalledEditor[]> } | undefined

function runIconTool(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => execFile(file, args, { shell: false, encoding: 'utf8', timeout: 3000, maxBuffer: MAX_ICON_BYTES }, (error, output) => error ? reject(error) : resolve(output)))
}

async function macBundleIcon(bundle: string): Promise<string> {
  const info = JSON.parse(await runIconTool('/usr/bin/plutil', ['-convert', 'json', '-o', '-', join(bundle, 'Contents', 'Info.plist')])) as { CFBundleIconFile?: unknown }
  const name = info.CFBundleIconFile
  if (typeof name !== 'string' || !name || name.length > 256 || name === '..' || /[\\/\u0000-\u001f]/.test(name)) throw new Error('应用图标资源名称无效')
  const resources = await realpath(join(bundle, 'Contents', 'Resources'))
  const icon = await realpath(join(resources, name.endsWith('.icns') || name.endsWith('.png') ? name : `${name}.icns`))
  const within = relative(resources, icon)
  if (within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within)) throw new Error('应用图标不能离开资源目录')
  const source = await stat(icon)
  if (!source.isFile() || source.size > 8_000_000) throw new Error('应用图标资源无效')
  const directory = await mkdtemp(join(tmpdir(), 'mira-editor-icon-'))
  const output = join(directory, 'icon.png')
  try {
    await runIconTool('/usr/bin/sips', ['-s', 'format', 'png', '-z', '32', '32', icon, '--out', output])
    const converted = await stat(output)
    if (!converted.isFile() || converted.size > 90_000) throw new Error('应用图标过大')
    const png = await readFile(output)
    if (png.length < 24 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || png.readUInt32BE(16) !== 32 || png.readUInt32BE(20) !== 32) throw new Error('应用图标格式无效')
    const data = `data:image/png;base64,${png.toString('base64')}`
    if (data.length > MAX_ICON_BYTES) throw new Error('应用图标过大')
    return data
  } finally {
    await unlink(output).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error })
    await rmdir(directory)
  }
}

async function editorDefinitions(): Promise<EditorDefinition[]> {
  const define = (id: string, name: string, paths: string[]): EditorDefinition => ({ id: `mira-${id}`, name, paths })
  if (process.platform === 'darwin') {
    const bundle = (id: string, name: string, file = name) => define(id, name, [join('/Applications', `${file}.app`), join(homedir(), 'Applications', `${file}.app`)])
    return [
      define('finder', 'Finder', ['/System/Library/CoreServices/Finder.app']),
      bundle('qspace', 'QSpace'), bundle('qspace-pro', 'QSpace Pro'),
      bundle('vscode', 'VS Code', 'Visual Studio Code'), bundle('vscode-insiders', 'VS Code Insiders', 'Visual Studio Code - Insiders'),
      bundle('cursor', 'Cursor'), bundle('trae', 'Trae'), bundle('zed', 'Zed'), bundle('sublime', 'Sublime Text'),
      bundle('codebuddy', 'CodeBuddy'), bundle('qoder', 'Qoder'), bundle('idea', 'IntelliJ IDEA'), bundle('idea-ce', 'IntelliJ IDEA CE'),
      ...['WebStorm', 'PyCharm', 'GoLand', 'PhpStorm', 'Rider'].map(name => bundle(name.toLowerCase(), name)),
      define('textedit', 'TextEdit', ['/System/Applications/TextEdit.app', '/Applications/TextEdit.app']),
    ]
  }
  if (process.platform !== 'win32') return []
  const system = process.env.WINDIR || 'C:\\Windows'
  const roots = [...new Set([process.env.ProgramFiles || 'C:\\Program Files', process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', win32.join(process.env.LOCALAPPDATA || win32.join(homedir(), 'AppData', 'Local'), 'Programs')])]
  const executable = (id: string, name: string, folder: string, file: string) => define(id, name, roots.map(root => win32.join(root, folder, file)))
  const jetbrainsRoots = roots.map(root => win32.join(root, 'JetBrains'))
  const jetbrainsFolders = await Promise.all(jetbrainsRoots.map(async root => {
    try { return (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 128).map(entry => ({ root, name: entry.name })) }
    catch { return [] }
  }))
  return [
    define('explorer', '资源管理器', [win32.join(system, 'explorer.exe')]),
    executable('vscode', 'VS Code', 'Microsoft VS Code', 'Code.exe'), executable('vscode-insiders', 'VS Code Insiders', 'Microsoft VS Code Insiders', 'Code - Insiders.exe'),
    executable('cursor', 'Cursor', 'Cursor', 'Cursor.exe'),
    define('trae', 'Trae', roots.flatMap(root => [win32.join(root, 'Trae', 'Trae.exe'), win32.join(root, 'Trae CN', 'Trae.exe'), win32.join(root, 'Trae CN', 'Trae CN.exe')])),
    ...[['idea', 'IntelliJ IDEA', 'idea64.exe'], ['webstorm', 'WebStorm', 'webstorm64.exe'], ['pycharm', 'PyCharm', 'pycharm64.exe'], ['goland', 'GoLand', 'goland64.exe'], ['clion', 'CLion', 'clion64.exe']].map(([id, name, file]) => define(id, name, jetbrainsFolders.flat().filter(folder => folder.name === name || folder.name.startsWith(`${name} `) || folder.name.startsWith(`${name}-`)).map(folder => win32.join(folder.root, folder.name, 'bin', file)))),
    define('notepad', '记事本', [win32.join(system, 'System32', 'notepad.exe')]),
  ]
}

async function installedPath(editor: EditorDefinition): Promise<string | undefined> {
  for (const path of editor.paths) {
    try {
      const info = await stat(path)
      if (process.platform === 'darwin' ? info.isDirectory() : info.isFile()) return path
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code || '')) throw new Error(`无法检测 ${editor.name} 的安装状态`)
    }
  }
}

export async function getInstalledHarnessEditors(refresh = false): Promise<HarnessInstalledEditor[]> {
  const platform = process.platform
  if (!refresh && cached?.platform === platform && cached.expires > Date.now()) return cached.editors.map(editor => ({ ...editor }))
  if (!pending || pending.platform !== platform) {
    const result = (async () => {
      const definitions = await editorDefinitions()
      const installed = new Array<HarnessInstalledEditor | undefined>(definitions.length)
      let nextIndex = 0
      let failure: Error | undefined
      await Promise.allSettled(Array.from({ length: Math.min(4, definitions.length) }, async () => {
        while (!failure && nextIndex < definitions.length) {
          const index = nextIndex++
          const editor = definitions[index]
          let path: string | undefined
          try { path = await installedPath(editor) }
          catch (error) { failure ??= error as Error; throw error }
          if (!path) continue
          let icon: string | undefined
          try {
            if (platform === 'darwin') icon = await macBundleIcon(path)
            else {
              const image = await app.getFileIcon(path, { size: 'normal' })
              if (!image.isEmpty()) {
                const data = image.resize({ width: 32, height: 32 }).toDataURL()
                if (data.startsWith('data:image/png;base64,') && data.length <= MAX_ICON_BYTES) icon = data
              }
            }
          } catch { /* 图标读取失败不影响已安装应用的打开能力。 */ }
          installed[index] = { id: editor.id, name: editor.name, ...(icon ? { icon } : {}), ...(FILE_ONLY_EDITORS.has(editor.id) ? { fileOnly: true } : {}) }
        }
      }))
      if (failure) throw failure
      const editors = installed.filter((editor): editor is HarnessInstalledEditor => Boolean(editor))
      cached = { platform, expires: Date.now() + CACHE_MS, editors }
      return editors
    })()
    pending = { platform, result }
    void result.finally(() => { if (pending?.result === result) pending = undefined }).catch(() => {})
  }
  return (await pending.result).map(editor => ({ ...editor }))
}

export async function openHarnessWorkspaceInEditor(workspacePath: string, path: string, editorId: string): Promise<void> {
  if (typeof editorId !== 'string' || !/^mira-[a-z-]+$/.test(editorId)) throw new Error('打开方式无效')
  const editor = (await editorDefinitions()).find(candidate => candidate.id === editorId)
  if (!editor) throw new Error('打开方式无效或当前系统不支持')
  const executable = await installedPath(editor)
  if (!executable) throw new Error(`${editor.name} 未安装或已卸载，请选择其他打开方式`)
  let target: string
  let isFile: boolean
  try {
    const root = await resolveHarnessWorkspacePath(workspacePath, '')
    if (!(await stat(root.target)).isDirectory()) throw new Error('工作目录不是文件夹')
    target = path ? (await resolveHarnessWorkspacePath(workspacePath, path)).target : root.target
    const info = await stat(target)
    if (!info.isFile() && !info.isDirectory()) throw new Error('只能打开工作目录中的文件或文件夹')
    isFile = info.isFile()
  } catch (error) { throw workspaceFileError(error) }
  if (!isFile && FILE_ONLY_EDITORS.has(editor.id)) throw new Error(`${editor.name} 只支持打开文件，请从文件菜单选择打开方式`)
  try {
    if (isFile && (editor.id === 'mira-finder' || editor.id === 'mira-explorer')) { shell.showItemInFolder(target); return }
    await new Promise<void>((resolve, reject) => {
      if (process.platform === 'darwin') {
        execFile('/usr/bin/open', ['-a', executable, '--', target], { shell: false, timeout: 15_000, maxBuffer: 64_000 }, error => error ? reject(error) : resolve())
      } else {
        // GUI 进程会持续运行，不能等待退出或用超时杀掉用户刚打开的应用。
        const child = spawn(executable, [target], { shell: false, windowsHide: true, detached: true, stdio: 'ignore' })
        child.once('error', reject)
        child.once('spawn', () => { child.unref(); resolve() })
      }
    })
  } catch { throw new Error(`无法用 ${editor.name} 打开，请检查应用或选择其他打开方式`) }
}
