import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))
function fixture(platform: string, corrupt = false, missingHelper = false) {
  const root = mkdtempSync(resolve('node_modules/.cache/mira-cua-pack-test-')); roots.push(root)
  const binary = platform === 'win32' ? 'cua-driver.exe' : 'cua-driver'
  const entries: Record<string, Uint8Array> = { [`cua_driver/bin/${binary}`]: strToU8('native runtime fixture'), 'cua_driver/bin/unexpected.exe': strToU8('must not ship') }
  if (platform === 'win32' && !missingHelper) entries['cua_driver/bin/cua-driver-uia.exe'] = strToU8('UIA helper fixture')
  const bytes = zipSync(entries), sha256 = createHash('sha256').update(bytes).digest('hex')
  const scripts = join(root, 'scripts'), cache = join(root, 'node_modules/.cache/mira-cua-driver'), licenses = join(root, 'resources/plugins/computer-use')
  for (const path of [scripts, cache, licenses]) mkdirSync(path, { recursive: true })
  writeFileSync(join(scripts, 'build-cua-driver.mjs'), readFileSync('scripts/build-cua-driver.mjs'))
  writeFileSync(join(scripts, 'cua-driver-artifacts.json'), JSON.stringify({ version: 'fixture', artifacts: { [platform === 'darwin' ? 'darwin' : `${platform}-x64`]: { sha256, url: 'data:application/zip;base64,AA==' } } }))
  writeFileSync(join(cache, `${sha256}.whl`), corrupt ? 'damaged cache' : bytes)
  writeFileSync(join(licenses, 'LICENSE-UPSTREAM'), 'MIT fixture notice')
  const run = () => execFileSync(process.execPath, ['--input-type=module', '-e', `import {buildCuaDriver} from ${JSON.stringify(join(scripts, 'build-cua-driver.mjs'))}; await buildCuaDriver({platform:${JSON.stringify(platform)},arch:'x64'});`], { stdio: 'pipe' })
  return { root, binary, run, output: join(root, 'dist/mira-tools/cua-driver') }
}

describe('pinned native Cua runtime packaging', () => {
  it.each(['darwin', 'win32', 'linux'])('ships only the required executables, notices and version for %s', platform => {
    const view = fixture(platform); view.run()
    expect(readFileSync(join(view.output, view.binary), 'utf8')).toBe('native runtime fixture')
    expect(existsSync(join(view.output, 'cua-driver-uia.exe'))).toBe(platform === 'win32')
    expect(existsSync(join(view.output, 'unexpected.exe'))).toBe(false)
    expect(readFileSync(join(view.output, 'LICENSE'), 'utf8')).toContain('MIT')
    expect(JSON.parse(readFileSync(join(view.output, 'version.json'), 'utf8'))).toMatchObject({ version: 'fixture', platform, arch: 'x64' })
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(manifest.build.extraResources).toContainEqual({ from: 'dist/mira-tools/cua-driver', to: 'tools/cua-driver', filter: ['**/*'] })
  })
  it('refuses a Windows wheel missing its UIA helper', () => {
    const view = fixture('win32', false, true)
    expect(view.run).toThrow('missing cua-driver-uia.exe')
    expect(existsSync(view.output)).toBe(false)
  })
  it('rejects corrupt cached and downloaded artifacts before writing an executable', () => {
    const view = fixture('darwin', true)
    expect(view.run).toThrow('SHA-256 mismatch')
    expect(existsSync(view.output)).toBe(false)
  })
})
