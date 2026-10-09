import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, lstat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { parse } from 'postcss'
import { pruneHarnessChunks } from '../scripts/build-harness-react.mjs'

describe('Harness generated chunks', () => {
  let fixture: string
  beforeEach(async () => { fixture = await mkdtemp(resolve(tmpdir(), 'mira-harness-chunks-')) })
  afterEach(async () => { await rm(fixture, { recursive: true, force: true }) })

  it('keeps file drawer and preview layout in the final Tailwind stylesheet', async () => {
    const output = resolve(fixture, 'app.css')
    execFileSync(resolve('node_modules/.bin/tailwindcss'), ['-i', resolve('apps/harness-react/src/styles/app.css'), '-o', output, '--minify'], { stdio: 'pipe' })
    const css = await readFile(output, 'utf8')
    expect(css).toMatch(/\.mira-file-drawer__row\{[^}]*display:flex/)
    expect(css).toMatch(/\.mira-file-preview__toolbar\{[^}]*height:40px/)
    expect(css).toMatch(/\.mira-file-source__row\{[^}]*position:absolute/)
    const sheet = parse(css)
    function declaration(selector: string, property: string) {
      let value: string | undefined
      sheet.walkRules(rule => {
        if (rule.selectors.includes(selector)) rule.walkDecls(property, item => { value = item.value })
      })
      return value
    }
    expect(declaration('.pilot-side-tab__close', 'position')).toBe('absolute')
    expect(declaration('.pilot-side-tab__close', 'pointer-events')).toBe('none')
    expect(declaration('.pilot-side-tab.is-active', 'min-width')).toBe('128px')
    expect(declaration('.pilot-side-tab', 'min-width')).toBe('60px')
    expect(declaration('.pilot-side-tab.is-active .pilot-side-tab__select', 'padding-right')).toBe('27px')
    expect(declaration('.pilot-side-tab:hover .pilot-side-tab__select', 'padding-right')).toBe('27px')
    expect(declaration('.pilot-side-tab:focus-within .pilot-side-tab__select', 'padding-right')).toBe('27px')
    expect(declaration('.pilot-side-tab__select span', 'mask-image')).toContain('linear-gradient')
    expect(declaration('.pilot-inspector .mira-file-preview', 'padding')).toBe('0')
    expect(declaration('.pilot-inspector .mira-file-preview', 'border-bottom')).toBe('0')
    expect(declaration('.mira-file-preview__notice[role=alert] p', 'color')).toBe('inherit')
    expect(declaration('.mira-file-preview__notice[role=alert] p', 'font-size')).toBe('inherit')
  })

  it('removes obsolete chunks after a second real build and preserves the entire current graph', async () => {
    const output = resolve(fixture, 'dist')
    await mkdir(resolve(fixture, 'src'))
    await writeFile(resolve(fixture, 'src/main.js'), 'export const load = () => import("./feature.js")')
    const options = {
      entryPoints: { app: resolve(fixture, 'src/main.js') }, bundle: true,
      format: 'esm' as const, splitting: true, chunkNames: 'chunks/[name]-[hash]',
      platform: 'browser' as const, target: ['chrome110'], outdir: output,
      minify: true, metafile: true, logLevel: 'silent' as const,
    }
    await writeFile(resolve(fixture, 'src/feature.js'), 'export const version = 1')
    const first = await build(options)
    expect(await pruneHarnessChunks(output, first.metafile!.outputs)).toBe(0)
    const [oldChunk] = await readdir(resolve(output, 'chunks'))
    await writeFile(resolve(fixture, 'src/feature.js'), 'export const version = 2')
    const second = await build(options)
    expect(await readdir(resolve(output, 'chunks'))).toHaveLength(2)
    expect(await pruneHarnessChunks(output, second.metafile!.outputs)).toBe(1)
    expect(await readdir(resolve(output, 'chunks'))).not.toContain(oldChunk)
    for (const path of Object.keys(second.metafile!.outputs)) {
      expect((await readFile(resolve(path))).length).toBeGreaterThan(0)
    }
    for (const file of Object.values(second.metafile!.outputs)) {
      for (const edge of file.imports.filter(edge => !edge.external)) {
        expect((await readFile(resolve(edge.path))).length).toBeGreaterThan(0)
      }
    }
    expect(await pruneHarnessChunks(output, second.metafile!.outputs)).toBe(0)
  })

  it('only removes generated hash JS files in chunks and keeps user files, licenses and symlinks', async () => {
    const output = resolve(fixture, 'dist')
    const chunks = resolve(output, 'chunks')
    await mkdir(chunks, { recursive: true })
    await mkdir(resolve(output, 'third-party-licenses'))
    const kept = ['custom.js', 'feature-ABCDEFGH.js.map', 'feature-12345678.js', 'feature-abcdefgh.js', 'NOTICE.md']
    for (const name of kept) await writeFile(resolve(chunks, name), name)
    await writeFile(resolve(output, 'third-party-licenses/NOTICE.md'), 'license')
    await writeFile(resolve(output, 'app-ABCDEFGH.js'), 'outside chunks')
    await writeFile(resolve(chunks, 'active-ABCDEFGH.js'), 'current')
    await writeFile(resolve(chunks, 'obsolete-ABCDEFGH.js'), 'old')
    await mkdir(resolve(chunks, 'folder-ABCDEFGH.js'))
    await symlink(resolve(output, 'app-ABCDEFGH.js'), resolve(chunks, 'link-ABCDEFGH.js'))
    expect(await pruneHarnessChunks(output, { [resolve(chunks, 'active-ABCDEFGH.js')]: {} })).toBe(1)
    for (const name of kept) expect(await readFile(resolve(chunks, name), 'utf8')).toBe(name)
    expect(await readFile(resolve(chunks, 'active-ABCDEFGH.js'), 'utf8')).toBe('current')
    expect(await readFile(resolve(output, 'third-party-licenses/NOTICE.md'), 'utf8')).toBe('license')
    expect(await readFile(resolve(output, 'app-ABCDEFGH.js'), 'utf8')).toBe('outside chunks')
    expect((await lstat(resolve(chunks, 'folder-ABCDEFGH.js'))).isDirectory()).toBe(true)
    expect((await lstat(resolve(chunks, 'link-ABCDEFGH.js'))).isSymbolicLink()).toBe(true)
  })

  it('does nothing when no chunks directory was generated', async () => {
    expect(await pruneHarnessChunks(resolve(fixture, 'dist'), {})).toBe(0)
  })
})
