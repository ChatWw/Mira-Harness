import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { miraComputerLaunch } from '../electron/services/miraComputerUse'

const roots: string[] = []
afterEach(() => { roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })) })

describe('computer backend distribution', () => {
  it.skipIf(process.platform !== 'win32')('compiles the OCR helper cold using the actual reduced MCP environment', () => {
    const root = mkdtempSync(join(tmpdir(), 'mira-ocr-cold-test-')); roots.push(root)
    const source = readFileSync('resources/plugins/computer-use/windows/scripts/windows-uia.ps1', 'utf8').replace(/^\uFEFF/, '')
    const script = join(root, 'compile.ps1')
    writeFileSync(script, '\uFEFF' + source.slice(0, source.lastIndexOf('if ($Persistent) {')) + '\nGet-OcrHelper\nWrite-Output "OCR loaded"\n')
    const launch = miraComputerLaunch({ resourceRoot: resolve('resources/plugins/computer-use'), platform: 'win32' })
    const result = execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { env: { ...launch.env, TEMP: root }, windowsHide: true, encoding: 'utf8' })
    expect(result).toContain('OCR loaded')
  }, 15000)
  it.each(['arm64', 'x64'])('builds both Mac native programs for %s and signs each', async arch => {
    const { buildComputerUse } = await import('../scripts/build-computer-use.mjs')
    const root = mkdtempSync(join(tmpdir(), 'mira-mac-build-')); roots.push(root)
    const run = vi.fn((command: string, args: string[]) => {
      if (command.endsWith('xcrun')) writeFileSync(args[args.indexOf('-o') + 1], 'native fixture')
    })
    await buildComputerUse({ platform: 'darwin', arch, root, run })
    expect(run).toHaveBeenCalledTimes(4)
    const builds = run.mock.calls.filter(([command]) => command.endsWith('xcrun'))
    expect(builds.every(([, args]) => args.includes(`${arch === 'x64' ? 'x86_64' : 'arm64'}-apple-macos11.0`))).toBe(true)
    expect(builds[0][1]).toContain('Vision')
    expect(builds[1][1]).toContain('QuartzCore')
    expect(existsSync(join(root, 'macos/plugin/bin/dsh-cu'))).toBe(true)
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(manifest.build.extraResources.some((item: any) => item.from === 'resources/plugins' && item.to === 'plugins')).toBe(true)
    const plugin = JSON.parse(readFileSync('resources/plugins/computer-use/.mira-plugin/plugin.json', 'utf8'))
    expect(plugin.mcpServers.desktop).toEqual({ command: 'mira:computer-use', args: [] })
  })
  it('needs no compiler or download on Windows and rejects unsupported Mac architectures', async () => {
    const { buildComputerUse } = await import('../scripts/build-computer-use.mjs')
    const run = vi.fn()
    await buildComputerUse({ platform: 'win32', run })
    expect(run).not.toHaveBeenCalled()
    await expect(buildComputerUse({ platform: 'darwin', arch: 'ia32', run })).rejects.toThrow('architecture')
  })
  it.each(['windows/mcp/server.mjs', 'macos/server.mjs'])('speaks MCP without the DSH host: %s', async script => {
    const client = new Client({ name: 'mira-backend-protocol-test', version: '1' })
    const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('resources/plugins/computer-use', script)], stderr: 'ignore' })
    try {
      await client.connect(transport)
      const tools = (await client.listTools()).tools
      expect(tools.length).toBeGreaterThanOrEqual(11)
      expect(tools.find(tool => tool.name.endsWith('_click'))?.inputSchema.properties).toHaveProperty('x')
      if (script.startsWith('macos')) {
        expect(tools.map(tool => tool.name)).toContain('desktop_screenshot')
        const result = await client.callTool({ name: 'missing', arguments: {} })
        expect(result.isError).toBe(true)
      } else expect(tools.map(tool => tool.name)).toContain('windows_computer_use_screenshot')
      await transport.send({ jsonrpc: '2.0', method: 'mira/shutdown' })
    } finally { await client.close() }
  }, 15000)
})
