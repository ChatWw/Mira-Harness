import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import sharp from '/Users/wujinbo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/dist/index.mjs'

const root = '/Volumes/VrenDisk/project/Mira/Mira-Harness'
const evidence = resolve(root, 'docs/assets/mira-zcode-alignment-2026-10-08/git-filter-headless')
const sha = value => createHash('sha256').update(value).digest('hex')
const json = async name => JSON.parse(await readFile(resolve(evidence, name), 'utf8'))
const results = await json('results.json')
assert.equal(results.checks.at(-1).passed, true)
assert.equal(results.checks.at(-1).mode, 'new-production-verification')
assert.deepEqual(results.pageErrors, [])
assert.deepEqual(results.interactionFailures, [])
const required = ['deleted-loaded-parent-overlay', 'deleted-safe-interactions', 'deleted-menu-during-refresh', 'changed-only-tree', 'search-and-changed-only', 'watch-tree-focus', 'refresh-retains-changed-only', 'failure-and-retry', 'session-and-nonrepo', 'same-session-root-change', 'virtualization-retained']
for (const name of required) assert.ok(results.checks.some(check => check.name === name), `Missing check: ${name}`)
const menu = results.checks.find(check => check.name === 'deleted-menu-during-refresh')
for (const key of ['deletedRowPresent', 'menuPresent', 'copiedDuringLoading', 'passed']) assert.equal(menu[key], true)
assert.equal(results.checks.find(check => check.name === 'watch-tree-focus').passed, true)
const baseline = await json('baseline-results.json')
const missing = baseline.checks.find(check => check.name === 'baseline-confirmed-missing-capability')
assert.equal(missing.rootDeletedRowMissing, true)
assert.equal(missing.changedOnlyControlMissing, true)
const before = await json('menu-refresh-before-fix.json')
assert.equal(before.checks.at(-1).passed, false)
assert.equal(before.checks.find(check => check.name === 'deleted-menu-during-refresh').menuPresent, false)
const bundle = await json('bundle-audit.json')
assert.equal(bundle.passed, true)
assert.equal(bundle.memoryDiskComparison.equalCount, bundle.allDiskJS.fileCount)
for (const key of ['missing', 'mismatched']) assert.deepEqual(bundle.memoryDiskComparison[key], [])
assert.equal(bundle.memoryDiskComparison.staleCount, 0)
assert.deepEqual(bundle.actualGraphClosure.orphanMetafileOutputs, [])
assert.deepEqual(bundle.dynamicImports.missingOnDisk, [])
assert.deepEqual(bundle.dynamicImports.missingInMetafile, [])
assert.equal(bundle.licenses.allMatch, true)
assert.equal(sha(await readFile(resolve(root, 'dist/harness-react-app/app.css'))), bundle.css.sha256)
const screenshots = results.checks.filter(check => check.name.endsWith('.png')).map(check => check.name)
assert.equal(screenshots.length, 10)
const dimensions = []
for (const name of [...screenshots, 'baseline-old-production.png', 'mira-menu-refresh-before-fix.png']) {
  const metadata = await sharp(resolve(evidence, name)).metadata()
  assert.equal(metadata.format, 'png')
  assert.ok(metadata.width >= 1280 && metadata.height >= 800)
  dimensions.push({ name, width: metadata.width, height: metadata.height })
}
const sources = [
  'apps/harness-react/src/lib/file-git.ts',
  'apps/harness-react/src/components/workspace/ProjectFileDrawer.tsx',
  'apps/harness-react/src/styles/file-drawer.css',
  'tests/harnessReactFileGit.test.ts', 'tests/harnessReactFileDrawer.test.ts',
  'third-party-licenses/zcode/ADAPTATIONS.md',
]
const files = (await readdir(evidence)).filter(name => /\.(?:png|json|mjs|md)$/.test(name) && !['sha256-manifest.json', 'evidence-audit.json'].includes(name)).map(name => resolve(evidence, name))
const manifest = []
for (const path of [...files, ...sources.map(path => resolve(root, path))]) {
  const content = await readFile(path), metadata = await stat(path)
  manifest.push({ path: relative(root, path), bytes: content.length, mtime: metadata.mtime.toISOString(), sha256: sha(content) })
}
await writeFile(resolve(evidence, 'sha256-manifest.json'), JSON.stringify(manifest, null, 2))
const report = { at: new Date().toISOString(), passed: true, behaviorChecks: required.length, finalScreenshots: screenshots.length, historicalScreenshots: 2, dimensions, requests: results.requests.length, manifestFiles: manifest.length, sourceFiles: sources.length, boundaries: 'Headless production React and isolated helpers; not native Electron, Vue Shell, clipboard, packaging, Windows or overall release' }
await writeFile(resolve(evidence, 'evidence-audit.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
