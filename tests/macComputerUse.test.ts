import { afterAll, describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

const native = vi.hoisted(() => ({ paths: [] as string[], fail: false }))
vi.mock('../resources/plugins/computer-use/macos/plugin/setup.js', () => ({
  findBin: () => ({ path: '/owned/dsh-cu' }), INSTALL_CMD: 'fixture', INSTALL_HINT: 'fixture', OVERLAY: '/owned/overlay', readConfig: () => ({ showCursor: true }),
}))
vi.mock('node:child_process', async () => {
  const { EventEmitter } = await import('node:events')
  const { PassThrough } = await import('node:stream')
  const { writeFileSync } = await import('node:fs')
  return { execFile: vi.fn(), execFileSync: vi.fn(), spawn: vi.fn((_binary: string, args: string[]) => {
    const child: any = new EventEmitter()
    child.stdout = new PassThrough(); child.stderr = new PassThrough()
    child.kill = vi.fn(); child.exitCode = null
    queueMicrotask(() => {
      if (args[0] === 'version') child.stdout.write('2\n')
      else if (args[0] === 'shot') {
        const path = args[args.indexOf('--out') + 1]; native.paths.push(path)
        writeFileSync(path, Buffer.from('fixture image'))
        if (native.fail) child.stderr.write('capture failed')
        else child.stdout.write(path + '\nrect\t0,0 600×400\n')
      }
      const code = native.fail && args[0] === 'shot' ? 1 : 0
      child.exitCode = code; child.emit('exit', code); child.emit('close', code)
    })
    return child
  }) }
})
const { apply, close } = await import('../resources/plugins/computer-use/macos/plugin/index.js')
const tools = new Map<string, any>()
apply({ tools: { register: (tool: any) => tools.set(tool.name, tool) }, get: () => ({ saveImages: async (images: any[]) => images.map(image => ({ data: image.data.toString('base64'), mimeType: image.mediaType })) }) }, {})
afterAll(async () => { await close() })

describe('Mac screenshot adaptation', () => {
  it('returns image bytes through attachments and deletes intermediate files immediately', async () => {
    const tool = tools.get('desktop_screenshot'), value = await tool.execute({})
    const blocks = tool.output.render({}, value)
    expect(blocks[0].text).toContain('图上坐标就是屏幕坐标')
    expect(blocks[1].attachment).toEqual({ data: Buffer.from('fixture image').toString('base64'), mimeType: 'image/png' })
    const path = native.paths.at(-1)!
    expect(isAbsolute(path)).toBe(true)
    const fromWorkspace = relative(resolve('.'), path)
    expect(isAbsolute(fromWorkspace) || fromWorkspace.startsWith('..')).toBe(true)
    expect(existsSync(path)).toBe(false)
    expect(existsSync(dirname(path))).toBe(false)
    expect(tool.output.render({}, value)).toHaveLength(1)
  })
  it('also deletes screenshot intermediates when native capture fails', async () => {
    native.fail = true
    await expect(tools.get('desktop_screenshot').execute({})).rejects.toThrow('capture failed')
    expect(existsSync(dirname(native.paths.at(-1)!))).toBe(false)
  })
})
