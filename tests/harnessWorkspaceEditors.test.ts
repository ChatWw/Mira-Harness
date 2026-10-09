import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { access, mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { EventEmitter } from 'node:events'

const mocks = vi.hoisted(() => ({ installed: new Set<string>(), icon: vi.fn(), reveal: vi.fn(), launch: vi.fn(), spawn: vi.fn(), folders: [] as string[], plist: new Map<string, string>(), canonical: new Map<string, string>(), sourceSize: 128, png: Buffer.alloc(24), converted: [] as string[], installFailure: undefined as { path: string; result: Promise<never> } | undefined }))
vi.mock('electron', () => ({ app: { getFileIcon: mocks.icon }, shell: { showItemInFolder: mocks.reveal } }))
vi.mock('node:child_process', async importOriginal => ({ ...await importOriginal<typeof import('node:child_process')>(), execFile: mocks.launch, spawn: mocks.spawn }))
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    stat: vi.fn(async (path: string) => {
      if (path === mocks.installFailure?.path) return mocks.installFailure.result
      if (!/(\/Applications\/|^\/System\/|^C:\\)/.test(path)) return actual.stat(path)
      if (/\.(icns|png)$/.test(path)) return { isFile: () => true, isDirectory: () => false, size: mocks.sourceSize }
      if (!mocks.installed.has(path)) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      return { isFile: () => path.endsWith('.exe'), isDirectory: () => path.endsWith('.app') }
    }),
    readdir: vi.fn(async (path: string, options: unknown) => path.endsWith('\\JetBrains') ? mocks.folders.map(name => ({ name, isDirectory: () => true })) : actual.readdir(path, options as never)),
    realpath: vi.fn(async (path: string) => mocks.canonical.get(path) || (path.includes('/Contents/Resources') ? path : actual.realpath(path))),
  }
})

const roots: string[] = []
const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!
function platform(value: string) { Object.defineProperty(process, 'platform', { configurable: true, value }) }
async function workspace() { const root = await mkdtemp(join(tmpdir(), 'mira-editor-test-')); roots.push(root); return root }
async function service() { return import('../electron/services/harnessWorkspaceEditors') }

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.installed.clear()
  mocks.folders = []
  mocks.plist.clear()
  mocks.canonical.clear()
  mocks.sourceSize = 128
  mocks.converted = []
  mocks.installFailure = undefined
  mocks.png = Buffer.alloc(24)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(mocks.png)
  mocks.png.writeUInt32BE(32, 16); mocks.png.writeUInt32BE(32, 20)
  platform('darwin')
  mocks.icon.mockResolvedValue({ isEmpty: () => false, resize: () => ({ toDataURL: () => 'data:image/png;base64,YQ==' }) })
  mocks.launch.mockImplementation((file, args, _options, callback) => {
    if (file === '/usr/bin/plutil') callback(null, mocks.plist.get(args[4]) || JSON.stringify({ CFBundleIconFile: 'Mira' }))
    else if (file === '/usr/bin/sips') {
      const output = args.at(-1)
      mocks.converted.push(output)
      void writeFile(output, mocks.png).then(() => callback(null, 'converted'), callback)
    } else callback(null)
    return {}
  })
  mocks.spawn.mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() })
    queueMicrotask(() => child.emit('spawn'))
    return child
  })
})
afterEach(async () => {
  Object.defineProperty(process, 'platform', originalPlatform)
  vi.unstubAllEnvs()
  vi.useRealTimers()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
  for (const output of mocks.converted) {
    await expect(access(output)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(dirname(output))).rejects.toMatchObject({ code: 'ENOENT' })
  }
})

describe('Harness installed editors', () => {
  it('returns only installed products with Mira IDs and bounded icons, without exposing paths', async () => {
    mocks.installed.add('/Applications/Cursor.app')
    mocks.installed.add('/System/Applications/TextEdit.app')
    mocks.installed.add('/System/Library/CoreServices/Finder.app')
    const { getInstalledHarnessEditors } = await service()
    expect(await getInstalledHarnessEditors()).toEqual([
      { id: 'mira-finder', name: 'Finder', icon: `data:image/png;base64,${mocks.png.toString('base64')}` },
      { id: 'mira-cursor', name: 'Cursor', icon: `data:image/png;base64,${mocks.png.toString('base64')}` },
      { id: 'mira-textedit', name: 'TextEdit', icon: `data:image/png;base64,${mocks.png.toString('base64')}`, fileOnly: true },
    ])
    expect(mocks.launch.mock.calls.filter(([file]) => file === '/usr/bin/open')).toHaveLength(0)
    expect(mocks.icon).not.toHaveBeenCalled()
  })

  it('keeps installed editors when icon retrieval fails or exceeds the metadata bound', async () => {
    platform('win32')
    vi.stubEnv('WINDIR', 'C:\\Windows')
    mocks.installed.add('C:\\Windows\\explorer.exe')
    mocks.installed.add('C:\\Windows\\System32\\notepad.exe')
    mocks.icon.mockRejectedValueOnce(new Error('icon unavailable')).mockResolvedValueOnce({ isEmpty: () => false, resize: () => ({ toDataURL: () => `data:image/png;base64,${'x'.repeat(128_000)}` }) })
    expect(await (await service()).getInstalledHarnessEditors()).toEqual([{ id: 'mira-explorer', name: '资源管理器' }, { id: 'mira-notepad', name: '记事本', fileOnly: true }])
  })

  it('reads native application icon names with and without extensions through fixed bounded tools', async () => {
    const finder = '/System/Library/CoreServices/Finder.app'
    const trae = '/Applications/Trae.app'
    mocks.installed.add(finder)
    mocks.installed.add(trae)
    mocks.plist.set(join(finder, 'Contents', 'Info.plist'), JSON.stringify({ CFBundleIconFile: 'Finder', CFBundleName: 'Finder' }))
    mocks.plist.set(join(trae, 'Contents', 'Info.plist'), JSON.stringify({ CFBundleIconFile: 'Trae.icns' }))
    expect((await (await service()).getInstalledHarnessEditors()).every(editor => Boolean(editor.icon))).toBe(true)
    for (const [bundle, icon] of [[finder, 'Finder.icns'], [trae, 'Trae.icns']]) {
      expect(mocks.launch).toHaveBeenCalledWith('/usr/bin/plutil', ['-convert', 'json', '-o', '-', join(bundle, 'Contents', 'Info.plist')], { shell: false, encoding: 'utf8', timeout: 3000, maxBuffer: 128_000 }, expect.any(Function))
      expect(mocks.launch).toHaveBeenCalledWith('/usr/bin/sips', ['-s', 'format', 'png', '-z', '32', '32', join(bundle, 'Contents', 'Resources', icon), '--out', expect.stringContaining('/mira-editor-icon-')], { shell: false, encoding: 'utf8', timeout: 3000, maxBuffer: 128_000 }, expect.any(Function))
    }
  })

  it.each(['invalid JSON', '{}', 'null', '{"CFBundleIconFile":1}', '{"CFBundleIconFile":""}', JSON.stringify({ CFBundleIconFile: '../escape' }), JSON.stringify({ CFBundleIconFile: '..' }), JSON.stringify({ CFBundleIconFile: 'folder\\\\escape' }), JSON.stringify({ CFBundleIconFile: 'icon\u0000' }), JSON.stringify({ CFBundleIconFile: 'x'.repeat(257) })])('keeps the editor but rejects invalid icon metadata: %s', async metadata => {
    mocks.installed.add('/Applications/Cursor.app')
    mocks.plist.set('/Applications/Cursor.app/Contents/Info.plist', metadata)
    expect(await (await service()).getInstalledHarnessEditors()).toEqual([{ id: 'mira-cursor', name: 'Cursor' }])
    expect(mocks.launch.mock.calls.filter(([file]) => file === '/usr/bin/sips')).toHaveLength(0)
  })

  it('rejects icon symlinks outside the canonical resources directory', async () => {
    mocks.installed.add('/Applications/Cursor.app')
    mocks.canonical.set('/Applications/Cursor.app/Contents/Resources/Mira.icns', '/System/private.icns')
    expect(await (await service()).getInstalledHarnessEditors()).toEqual([{ id: 'mira-cursor', name: 'Cursor' }])
    expect(mocks.launch.mock.calls.filter(([file]) => file === '/usr/bin/sips')).toHaveLength(0)
  })

  it('does not convert an oversized icon resource', async () => {
    mocks.installed.add('/Applications/Cursor.app')
    mocks.sourceSize = 8_000_001
    expect(await (await service()).getInstalledHarnessEditors()).toEqual([{ id: 'mira-cursor', name: 'Cursor' }])
    expect(mocks.launch.mock.calls.filter(([file]) => file === '/usr/bin/sips')).toHaveLength(0)
  })

  it.each(['/usr/bin/plutil', '/usr/bin/sips'])('preserves opening metadata and cleans temporary files if %s fails', async executable => {
    mocks.installed.add('/Applications/Cursor.app')
    const convert = mocks.launch.getMockImplementation()!
    mocks.launch.mockImplementation((file, args, options, callback) => {
      if (file !== executable) return convert(file, args, options, callback)
      if (file === '/usr/bin/sips') mocks.converted.push(args.at(-1))
      callback(Object.assign(new Error('process timed out'), { killed: true }))
      return {}
    })
    expect(await (await service()).getInstalledHarnessEditors()).toEqual([{ id: 'mira-cursor', name: 'Cursor' }])
  })

  it.each(['signature', 'dimensions', 'oversized'])('rejects %s PNG output without retaining temporary files', async failure => {
    mocks.installed.add('/Applications/Cursor.app')
    if (failure === 'signature') mocks.png[0] = 0
    if (failure === 'dimensions') mocks.png.writeUInt32BE(1024, 16)
    if (failure === 'oversized') mocks.png = Buffer.alloc(90_001)
    expect(await (await service()).getInstalledHarnessEditors()).toEqual([{ id: 'mira-cursor', name: 'Cursor' }])
  })

  it('bounds asynchronous icon detection to four installed editors at a time', async () => {
    for (const name of ['Cursor', 'Trae', 'Zed', 'Sublime Text', 'WebStorm', 'PyCharm']) mocks.installed.add(`/Applications/${name}.app`)
    const icon = mocks.launch.getMockImplementation()!
    let active = 0
    let maximum = 0
    mocks.launch.mockImplementation((file, args, options, callback) => {
      active += 1
      maximum = Math.max(maximum, active)
      return icon(file, args, options, (...result: unknown[]) => {
        active -= 1
        callback(...result)
      })
    })
    expect(await (await service()).getInstalledHarnessEditors()).toHaveLength(6)
    expect(maximum).toBeGreaterThan(1)
    expect(maximum).toBeLessThanOrEqual(4)
  })

  it('drains icons before rejecting a failed detection so retry cannot exceed the shared budget', async () => {
    for (const path of ['/System/Library/CoreServices/Finder.app', '/Applications/QSpace.app', '/Applications/QSpace Pro.app', '/Applications/Visual Studio Code.app', '/Applications/Cursor.app']) mocks.installed.add(path)
    let rejectInstallation!: (error: Error) => void
    mocks.installFailure = { path: '/Applications/Visual Studio Code.app', result: new Promise<never>((_resolve, reject) => { rejectInstallation = reject }) }
    const icon = mocks.launch.getMockImplementation()!
    const release: (() => void)[] = []
    let hold = true
    let active = 0
    let maximum = 0
    mocks.launch.mockImplementation((file, args, options, callback) => {
      if (file !== '/usr/bin/sips') return icon(file, args, options, callback)
      active += 1
      maximum = Math.max(maximum, active)
      const finish = () => icon(file, args, options, (...result: unknown[]) => { active -= 1; callback(...result) })
      if (hold) release.push(finish)
      else finish()
      return {}
    })
    const { getInstalledHarnessEditors } = await service()
    let settled = false
    const first = getInstalledHarnessEditors(true).then(() => undefined, error => { settled = true; return error as Error })
    await vi.waitFor(() => expect(active).toBe(3))
    rejectInstallation(Object.assign(new Error('EPERM /Applications/private-installation-path'), { code: 'EPERM' }))
    await new Promise(resolve => setImmediate(resolve))
    mocks.installFailure = undefined
    const retry = getInstalledHarnessEditors(true).then(() => undefined, error => error as Error)
    await new Promise(resolve => setTimeout(resolve, 30))
    const settledBeforeDrain = settled
    hold = false
    release.splice(0).forEach(finish => finish())
    const [firstError, retryError] = await Promise.all([first, retry])
    expect(maximum).toBeLessThanOrEqual(4)
    expect(settledBeforeDrain).toBe(false)
    expect(firstError?.message).toBe('无法检测 VS Code 的安装状态')
    expect(firstError?.message).not.toContain('/Applications/')
    expect(retryError).toBe(firstError)
    expect(mocks.launch.mock.calls.filter(([file, args]) => file === '/usr/bin/plutil' && args[4].includes('Cursor.app'))).toHaveLength(0)
    expect(await getInstalledHarnessEditors(true)).toHaveLength(5)
    expect(maximum).toBeLessThanOrEqual(4)
  })

  it('coalesces detection and refreshes after a short cache without sharing mutable metadata', async () => {
    vi.useFakeTimers()
    mocks.installed.add('/Applications/Cursor.app')
    const { getInstalledHarnessEditors } = await service()
    const [first, second] = await Promise.all([getInstalledHarnessEditors(), getInstalledHarnessEditors()])
    first[0].name = 'changed'
    expect(second[0].name).toBe('Cursor')
    expect((await getInstalledHarnessEditors())[0].name).toBe('Cursor')
    expect(mocks.launch.mock.calls.filter(([file]) => file === '/usr/bin/plutil')).toHaveLength(1)
    mocks.installed.delete('/Applications/Cursor.app')
    vi.advanceTimersByTime(30_001)
    expect(await getInstalledHarnessEditors()).toEqual([])
  })

  it('explicitly redetects newly installed applications while sharing the in-flight refresh', async () => {
    const { getInstalledHarnessEditors } = await service()
    expect(await getInstalledHarnessEditors()).toEqual([])
    mocks.installed.add('/Applications/Cursor.app')
    expect(await getInstalledHarnessEditors()).toEqual([])
    const [first, second] = await Promise.all([getInstalledHarnessEditors(true), getInstalledHarnessEditors(true)])
    expect(first.map(editor => editor.id)).toEqual(['mira-cursor'])
    expect(second).toEqual(first)
    expect(mocks.launch.mock.calls.filter(([file]) => file === '/usr/bin/plutil')).toHaveLength(1)
    expect(await getInstalledHarnessEditors()).toEqual(first)
  })

  it('detects Windows IDEs, versioned JetBrains installations and system editors', async () => {
    platform('win32')
    vi.stubEnv('WINDIR', 'C:\\Windows')
    vi.stubEnv('ProgramFiles', 'C:\\Program Files')
    vi.stubEnv('ProgramFiles(x86)', 'C:\\Program Files (x86)')
    vi.stubEnv('LOCALAPPDATA', 'C:\\Users\\Mira\\AppData\\Local')
    mocks.folders = ['WebStorm 2026.1', 'WebStorm-2026.2', 'Unknown']
    for (const path of ['C:\\Windows\\explorer.exe', 'C:\\Windows\\System32\\notepad.exe', 'C:\\Users\\Mira\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe', 'C:\\Program Files\\JetBrains\\WebStorm 2026.1\\bin\\webstorm64.exe']) mocks.installed.add(path)
    expect((await (await service()).getInstalledHarnessEditors()).map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'mira-explorer', name: '资源管理器' }, { id: 'mira-vscode', name: 'VS Code' }, { id: 'mira-webstorm', name: 'WebStorm' }, { id: 'mira-notepad', name: '记事本' },
    ])
  })

  it('has no unsupported-platform editor candidates', async () => {
    platform('linux')
    expect(await (await service()).getInstalledHarnessEditors()).toEqual([])
  })
})

describe('Harness controlled editor opening', () => {
  it('passes spaces and shell metacharacters as one absolute argument after the macOS separator', async () => {
    const root = await workspace()
    const path = 'Mira $(touch forbidden); `whoami` & notes.txt'
    await writeFile(join(root, path), 'Mira')
    mocks.installed.add('/Applications/Cursor.app')
    await (await service()).openHarnessWorkspaceInEditor(root, path, 'mira-cursor')
    expect(mocks.launch).toHaveBeenCalledWith('/usr/bin/open', ['-a', '/Applications/Cursor.app', '--', expect.stringContaining(path)], { shell: false, timeout: 15_000, maxBuffer: 64_000 }, expect.any(Function))
    expect(mocks.reveal).not.toHaveBeenCalled()
  })

  it('opens the root directory and reveals files through Finder without command text', async () => {
    const root = await workspace()
    await writeFile(join(root, 'notes.txt'), 'Mira')
    mocks.installed.add('/System/Library/CoreServices/Finder.app')
    const { openHarnessWorkspaceInEditor } = await service()
    await openHarnessWorkspaceInEditor(root, '', 'mira-finder')
    expect(mocks.launch).toHaveBeenCalledWith('/usr/bin/open', ['-a', '/System/Library/CoreServices/Finder.app', '--', expect.stringContaining('mira-editor-test-')], expect.any(Object), expect.any(Function))
    await openHarnessWorkspaceInEditor(root, 'notes.txt', 'mira-finder')
    expect(mocks.reveal).toHaveBeenCalledWith(expect.stringContaining('/notes.txt'))
    expect(mocks.launch).toHaveBeenCalledOnce()
  })

  it('reports native file-manager failures instead of implying the file was opened', async () => {
    const root = await workspace()
    await writeFile(join(root, 'notes.txt'), 'Mira')
    mocks.installed.add('/System/Library/CoreServices/Finder.app')
    mocks.reveal.mockImplementationOnce(() => { throw new Error('native failure') })
    await expect((await service()).openHarnessWorkspaceInEditor(root, 'notes.txt', 'mira-finder')).rejects.toThrow('无法用 Finder 打开')
    expect(mocks.launch).not.toHaveBeenCalled()
  })

  it('rejects unknown application IDs and unavailable installations without launching', async () => {
    const root = await workspace()
    const { openHarnessWorkspaceInEditor } = await service()
    for (const id of ['cursor', 'mira-malicious', '/tmp/executable', 'mira-cursor;whoami']) await expect(openHarnessWorkspaceInEditor(root, '', id)).rejects.toThrow('打开方式')
    await expect(openHarnessWorkspaceInEditor(root, '', 'mira-cursor')).rejects.toThrow('未安装或已卸载')
    expect(mocks.launch).not.toHaveBeenCalled()
  })

  it('checks installations again even while the detected metadata remains cached', async () => {
    const root = await workspace()
    mocks.installed.add('/Applications/Cursor.app')
    const { getInstalledHarnessEditors, openHarnessWorkspaceInEditor } = await service()
    expect(await getInstalledHarnessEditors()).toHaveLength(1)
    mocks.installed.clear()
    await expect(openHarnessWorkspaceInEditor(root, '', 'mira-cursor')).rejects.toThrow('已卸载')
    expect(mocks.launch.mock.calls.filter(([file]) => file === '/usr/bin/open')).toHaveLength(0)
  })

  it('rejects traversal, absolute paths and symbolic links outside the canonical workspace', async () => {
    const root = await workspace()
    const outside = await workspace()
    await writeFile(join(outside, 'secret.txt'), 'private')
    await symlink(outside, join(root, 'escape'))
    mocks.installed.add('/Applications/Cursor.app')
    const { openHarnessWorkspaceInEditor } = await service()
    for (const path of ['../', '/etc/passwd', 'escape/secret.txt']) await expect(openHarnessWorkspaceInEditor(root, path, 'mira-cursor')).rejects.toThrow(/路径/)
    expect(mocks.launch).not.toHaveBeenCalled()
  })

  it('revalidates a symlink that changes between opens', async () => {
    const root = await workspace()
    const outside = await workspace()
    await mkdir(join(root, 'inside'))
    await symlink(join(root, 'inside'), join(root, 'link'))
    mocks.installed.add('/Applications/Cursor.app')
    const { openHarnessWorkspaceInEditor } = await service()
    await openHarnessWorkspaceInEditor(root, 'link', 'mira-cursor')
    await rm(join(root, 'link'))
    await symlink(outside, join(root, 'link'))
    await expect(openHarnessWorkspaceInEditor(root, 'link', 'mira-cursor')).rejects.toThrow('工作目录')
    expect(mocks.launch).toHaveBeenCalledOnce()
  })

  it('reports missing paths and bounded application launch failures', async () => {
    const root = await workspace()
    mocks.installed.add('/Applications/Cursor.app')
    const { openHarnessWorkspaceInEditor } = await service()
    await expect(openHarnessWorkspaceInEditor(root, 'missing', 'mira-cursor')).rejects.toThrow('文件或目录不存在')
    mocks.launch.mockImplementationOnce((_file, _args, _options, callback) => callback(new Error('private executable output')))
    await expect(openHarnessWorkspaceInEditor(root, '', 'mira-cursor')).rejects.toThrow('无法用 Cursor 打开')
  })

  it('does not accept a regular file as the workspace root', async () => {
    const root = await workspace()
    await writeFile(join(root, 'not-a-root.txt'), 'Mira')
    mocks.installed.add('/Applications/Cursor.app')
    await expect((await service()).openHarnessWorkspaceInEditor(join(root, 'not-a-root.txt'), '', 'mira-cursor')).rejects.toThrow('工作目录不是文件夹')
    expect(mocks.launch).not.toHaveBeenCalled()
  })

  it('limits TextEdit to file targets and advertises that restriction in metadata', async () => {
    const root = await workspace()
    await writeFile(join(root, 'notes.txt'), 'Mira')
    mocks.installed.add('/System/Applications/TextEdit.app')
    const { getInstalledHarnessEditors, openHarnessWorkspaceInEditor } = await service()
    expect((await getInstalledHarnessEditors())[0].fileOnly).toBe(true)
    await expect(openHarnessWorkspaceInEditor(root, '', 'mira-textedit')).rejects.toThrow('TextEdit 只支持打开文件，请从文件菜单选择打开方式')
    expect(mocks.launch.mock.calls.filter(([file]) => file === '/usr/bin/open')).toHaveLength(0)
    await openHarnessWorkspaceInEditor(root, 'notes.txt', 'mira-textedit')
    expect(mocks.launch.mock.calls.filter(([file]) => file === '/usr/bin/open')).toHaveLength(1)
  })

  it('limits Notepad to file targets and advertises that restriction in metadata', async () => {
    const root = await workspace()
    await mkdir(join(root, 'notes'))
    platform('win32')
    vi.stubEnv('WINDIR', 'C:\\Windows')
    mocks.installed.add('C:\\Windows\\System32\\notepad.exe')
    const { getInstalledHarnessEditors, openHarnessWorkspaceInEditor } = await service()
    expect((await getInstalledHarnessEditors())[0].fileOnly).toBe(true)
    await expect(openHarnessWorkspaceInEditor(root, 'notes', 'mira-notepad')).rejects.toThrow('记事本 只支持打开文件，请从文件菜单选择打开方式')
    expect(mocks.spawn).not.toHaveBeenCalled()
    expect(mocks.launch).not.toHaveBeenCalled()
  })

  it('uses a Windows executable directly with a single path argument and no cmd shim', async () => {
    const root = await workspace()
    const path = 'Mira & %PATH% notes.txt'
    await writeFile(join(root, path), 'Mira')
    platform('win32')
    vi.stubEnv('WINDIR', 'C:\\Windows')
    mocks.installed.add('C:\\Windows\\System32\\notepad.exe')
    await (await service()).openHarnessWorkspaceInEditor(root, path, 'mira-notepad')
    expect(mocks.spawn).toHaveBeenCalledWith('C:\\Windows\\System32\\notepad.exe', [expect.stringContaining(path)], { shell: false, windowsHide: true, detached: true, stdio: 'ignore' })
    expect(mocks.spawn.mock.results[0].value.unref).toHaveBeenCalledOnce()
    expect(mocks.launch).not.toHaveBeenCalled()
  })

  it('reports Windows process start failures without waiting for a GUI exit', async () => {
    const root = await workspace()
    await writeFile(join(root, 'notes.txt'), 'Mira')
    platform('win32')
    vi.stubEnv('WINDIR', 'C:\\Windows')
    mocks.installed.add('C:\\Windows\\System32\\notepad.exe')
    mocks.spawn.mockImplementationOnce(() => {
      const child = Object.assign(new EventEmitter(), { unref: vi.fn() })
      queueMicrotask(() => child.emit('error', new Error('cannot start')))
      return child
    })
    await expect((await service()).openHarnessWorkspaceInEditor(root, 'notes.txt', 'mira-notepad')).rejects.toThrow('无法用 记事本 打开')
  })

  it('uses Windows file-manager reveal for files and launches directory targets once', async () => {
    const root = await workspace()
    await writeFile(join(root, 'notes.txt'), 'Mira')
    platform('win32')
    vi.stubEnv('WINDIR', 'C:\\Windows')
    mocks.installed.add('C:\\Windows\\explorer.exe')
    const { openHarnessWorkspaceInEditor } = await service()
    await openHarnessWorkspaceInEditor(root, 'notes.txt', 'mira-explorer')
    expect(mocks.reveal).toHaveBeenCalledOnce()
    expect(mocks.spawn).not.toHaveBeenCalled()
    await openHarnessWorkspaceInEditor(root, '', 'mira-explorer')
    expect(mocks.spawn).toHaveBeenCalledWith('C:\\Windows\\explorer.exe', [expect.stringContaining('mira-editor-test-')], expect.objectContaining({ shell: false }))
    expect(mocks.spawn).toHaveBeenCalledOnce()
  })
})
