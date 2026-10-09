import assert from 'node:assert/strict'
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { resolve } from 'node:path'

const root = '/Volumes/VrenDisk/project/Mira/Mira-Harness'
const evidence = resolve(root, 'docs/assets/mira-zcode-alignment-2026-10-08/git-overlay-headless')
const sha = buffer => createHash('sha256').update(buffer).digest('hex')
const walk = async directory => {
  const paths = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) paths.push(...await walk(path)); else paths.push(path)
  }
  return paths
}
const bundle = JSON.parse(await readFile(resolve(evidence, 'bundle-audit.json'), 'utf8'))
assert.equal(bundle.memoryDiskComparison.equalCount, 287)
for (const key of ['missing', 'mismatched']) assert.deepEqual(bundle.memoryDiskComparison[key], [])
assert.equal(bundle.memoryDiskComparison.staleCount, 0)
assert.deepEqual(bundle.dynamicImports.missingOnDisk, [])
assert.deepEqual(bundle.actualGraphClosure.orphanMetafileOutputs, [])
const licensePaths = (await walk(resolve(root, 'third-party-licenses'))).filter(path => /\/(?:LICENSE|NOTICE\.md|ADAPTATIONS\.md|README\.md)$/.test(path))
for (const path of licensePaths) {
  const packaged = resolve(root, 'dist/harness-react-app/third-party-licenses', path.slice(resolve(root, 'third-party-licenses').length + 1))
  assert.equal(sha(await readFile(path)), sha(await readFile(packaged)), `License drift: ${path}`)
}
assert.equal(sha(await readFile(resolve(root, 'apps/harness-react/NOTICE.md'))), sha(await readFile(resolve(root, 'dist/harness-react-app/NOTICE.md'))))
assert.equal(sha(await readFile(resolve(root, 'apps/harness-react/app.html'))), sha(await readFile(resolve(root, 'dist/harness-react-app/index.html'))))
const results = JSON.parse(await readFile(resolve(evidence, 'results.json'), 'utf8'))
assert.equal(results.checks.at(-1).passed, true)
assert.deepEqual(results.pageErrors, [])
const screenshots = ['mira-git-light.png', 'mira-git-dark.png', 'mira-git-light-error.png', 'mira-git-dark-error.png', 'mira-git-nonrepo.png', 'mira-git-desktop-1710.png', 'mira-git-desktop-1280.png']
const manifest = []
for (const name of [...screenshots, 'results.json', 'mira-file-git-headless.mjs', 'mira-evidence-audit.mjs']) {
  const path = resolve(evidence, name), content = await readFile(path), metadata = await stat(path)
  manifest.push({ name, bytes: content.length, mtime: metadata.mtime.toISOString(), sha256: sha(content) })
}
await writeFile(resolve(evidence, 'sha256-manifest.json'), JSON.stringify(manifest, null, 2))
const css = await readFile(resolve(root, 'dist/harness-react-app/app.css'))
console.log(JSON.stringify({ at: new Date().toISOString(), passed: true, licenseFiles: licensePaths.length, noticeAndHtmlMatch: true, jsShaMatches: 287, dynamicTargets: bundle.dynamicImports.uniqueTargets, css: { bytes: css.length, gzip9: gzipSync(css, { level: 9 }).length, sha256: sha(css) }, manifestFiles: manifest.length, boundaries: 'headless React and unit tests, not native Electron or release' }, null, 2))
