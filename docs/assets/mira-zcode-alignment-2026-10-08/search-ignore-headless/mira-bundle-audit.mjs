import { readFile, readdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { resolve, relative, basename } from 'node:path'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { build } from '/Volumes/VrenDisk/project/Mira/Mira-Harness/node_modules/esbuild/lib/main.js'
import { bundledLanguages, bundledLanguagesInfo } from '/Volumes/VrenDisk/project/Mira/Mira-Harness/node_modules/shiki/dist/langs.mjs'
import { bundledThemes } from '/Volumes/VrenDisk/project/Mira/Mira-Harness/node_modules/shiki/dist/themes.mjs'

const root = '/Volumes/VrenDisk/project/Mira/Mira-Harness'
process.chdir(root)
const output = resolve('dist/harness-react-app')
const evidence = resolve('docs/assets/mira-zcode-alignment-2026-10-08/search-ignore-headless')
// Identical JavaScript build options to scripts/build-harness-react.mjs.
// write:false and metafile:true only collect evidence; no output is written.
const result = await build({
  entryPoints: { app: resolve('apps/harness-react/src/app/app-main.tsx') },
  bundle: true, format: 'esm', splitting: true, chunkNames: 'chunks/[name]-[hash]',
  platform: 'browser', target: ['chrome110'], jsx: 'automatic', outdir: output,
  minify: true, logLevel: 'info', write: false, metafile: true,
})
const hash = buffer => createHash('sha256').update(buffer).digest('hex')
const gzip = buffer => gzipSync(buffer, { level: 9 }).length
const walk = async directory => {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(path))
    else files.push(path)
  }
  return files
}
const allDisk = await walk(output)
const diskJS = allDisk.filter(path => path.endsWith('.js'))
const jsOutputs = Object.fromEntries(Object.entries(result.metafile.outputs).filter(([path]) => path.endsWith('.js')))
const contentByPath = new Map(result.outputFiles.map(file => [file.path, file.contents]))
const diskByPath = new Map(await Promise.all(diskJS.map(async path => [path, await readFile(path)])))
const outputPath = path => resolve(root, path)
const expected = new Set(Object.keys(jsOutputs).map(outputPath))
const equal = [], mismatched = [], missing = []
for (const path of expected) {
  const actual = diskByPath.get(path)
  if (!actual) missing.push(relative(output, path))
  else if (hash(actual) !== hash(contentByPath.get(path))) mismatched.push(relative(output, path))
  else equal.push(relative(output, path))
}
const stale = [...diskByPath.keys()].filter(path => !expected.has(path))
const app = Object.keys(jsOutputs).find(path => outputPath(path) === resolve(output, 'app.js'))
const staticClosure = new Set()
const collect = path => {
  if (staticClosure.has(path)) return
  staticClosure.add(path)
  for (const edge of jsOutputs[path].imports) {
    if (edge.external || edge.kind === 'dynamic-import' || !jsOutputs[edge.path]) continue
    collect(edge.path)
  }
}
collect(app)
const reachable = new Set()
const collectAll = path => {
  if (reachable.has(path)) return
  reachable.add(path)
  for (const edge of jsOutputs[path].imports) {
    if (!edge.external && jsOutputs[edge.path]) collectAll(edge.path)
  }
}
collectAll(app)
const metrics = paths => {
  const buffers = [...paths].map(path => diskByPath.get(outputPath(path)))
  return { fileCount: buffers.length, bytes: buffers.reduce((sum, value) => sum + value.length, 0), gzipLevel9SumBytes: buffers.reduce((sum, value) => sum + gzip(value), 0) }
}
const dynamic = Object.entries(jsOutputs).flatMap(([from, file]) => file.imports.filter(edge => !edge.external && edge.kind === 'dynamic-import').map(edge => ({ from, to: edge.path })))
const dynamicTargets = [...new Set(dynamic.map(edge => edge.to))]
const inputs = Object.keys(result.metafile.inputs)
const grammarInputs = inputs.filter(path => /(?:^|\/)@shikijs\/langs\/dist\/[^/]+\.mjs$/.test(path))
const themeInputs = inputs.filter(path => /(?:^|\/)@shikijs\/themes\/dist\/[^/]+\.mjs$/.test(path))
const forbidden = inputs.filter(path => /(?:@streamdown\/code|vscode-oniguruma|@shikijs\/engine-oniguruma|engine-oniguruma\.|onig\.wasm|\.wasm$)/i.test(path))
const regexConverter = inputs.filter(path => /(?:oniguruma-parser|oniguruma-to-es)/.test(path))
const contributing = input => Object.values(jsOutputs).some(file => file.inputs[input]?.bytesInOutput > 0)
const grammarContribution = grammarInputs.filter(contributing)
const publicIds = bundledLanguagesInfo.map(language => language.id)
const aliases = bundledLanguagesInfo.flatMap(language => language.aliases || [])
const languageKeys = Object.keys(bundledLanguages)
const publicMappedToInput = bundledLanguagesInfo.filter(language => grammarInputs.some(path => basename(path) === `${language.id}.mjs`))
const contribution = Object.entries(jsOutputs).flatMap(([path, file]) => Object.entries(file.inputs).map(([input, value]) => ({ input, bytes: value.bytesInOutput, output: path })))
const shikiStaticBytes = contribution.filter(row => staticClosure.has(row.output) && /shiki|oniguruma/i.test(row.input)).reduce((sum, row) => sum + row.bytes, 0)
const generatedCSS = result.outputFiles.filter(file => file.path.endsWith('.css')).map(file => ({ name: relative(output, file.path), bytes: file.contents.length, note: 'Build script subsequently overwrites app.css with Tailwind; not counted in JS comparison.' }))
const staticPackageBytes = {}
for (const row of contribution.filter(row => staticClosure.has(row.output))) {
  const match = row.input.match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/)
  const owner = match?.[1] || (row.input.startsWith('apps/harness-react/') ? 'mira-harness-react' : 'mira-other')
  staticPackageBytes[owner] = (staticPackageBytes[owner] || 0) + row.bytes
}
const otherDynamicEntries = dynamicTargets.map(path => ({ path: relative(output, outputPath(path)), entryPoint: jsOutputs[path].entryPoint })).filter(row => !/(?:@shikijs\/langs|@shikijs\/themes)/.test(row.entryPoint || ''))
const report = {
  auditTime: new Date().toISOString(),
  buildOptionsSource: 'scripts/build-harness-react.mjs',
  html: (await readFile(resolve(output, 'index.html'), 'utf8')).match(/<script[^>]+src="([^"]+)"/g),
  staticEntryClosure: metrics(staticClosure),
  staticClosureFiles: [...staticClosure].map(path => relative(output, outputPath(path))),
  expectedReachableJS: metrics(Object.keys(jsOutputs)),
  actualGraphClosure: { fileCount: reachable.size, orphanMetafileOutputs: Object.keys(jsOutputs).filter(path => !reachable.has(path)) },
  allDiskJS: metrics([...diskByPath.keys()].map(path => relative(root, path))),
  memoryDiskComparison: { equalCount: equal.length, missing, mismatched, staleCount: stale.length, staleBytes: stale.reduce((sum, path) => sum + diskByPath.get(path).length, 0), staleGzipLevel9SumBytes: stale.reduce((sum, path) => sum + gzip(diskByPath.get(path)), 0), staleExamples: stale.slice(0, 20).map(path => relative(output, path)) },
  dynamicImports: { edges: dynamic.length, uniqueTargets: dynamicTargets.length, missingOnDisk: dynamicTargets.filter(path => !diskByPath.has(outputPath(path))), missingInMetafile: dynamicTargets.filter(path => !jsOutputs[path]), otherDynamicEntries },
  shiki: { physicalGrammarModules: grammarInputs.length, physicalGrammarContributingModules: grammarContribution.length, publicLanguageIDs: publicIds.length, aliases: aliases.length, aliasUniqueCount: new Set(aliases).size, totalLanguageKeys: languageKeys.length, unmappedKeys: [...publicIds, ...aliases].filter(key => !languageKeys.includes(key)), publicIDsWithGrammarInput: publicMappedToInput.length, themeInputs, themeContributingInputs: themeInputs.filter(contributing), forbiddenRuntimeInputs: forbidden, javaScriptRegexConverterInputs: regexConverter, staticAttributedBytes: shikiStaticBytes, staleThemeArtifacts: stale.filter(path => Object.keys(bundledThemes).some(theme => basename(path).startsWith(`${theme}-`))).map(path => relative(output, path)) },
  outputCounts: { metafileAllOutputs: Object.keys(result.metafile.outputs).length, allDiskFiles: allDisk.length, allDiskWASM: allDisk.filter(path => path.endsWith('.wasm')).map(path => relative(output, path)) },
  generatedCSS,
  staticSourceAttribution: Object.entries(staticPackageBytes).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([owner, bytesInOutput]) => ({ owner, bytesInOutput })),
}
assert.deepEqual(missing, [])
assert.deepEqual(mismatched, [])
assert.deepEqual(stale, [])
assert.equal(equal.length, expected.size)
assert.equal(reachable.size, expected.size)
assert.deepEqual(report.dynamicImports.missingOnDisk, [])
assert.deepEqual(report.dynamicImports.missingInMetafile, [])
const licensePaths = await walk(resolve('third-party-licenses'))
for (const path of licensePaths) {
  const packaged = resolve(output, 'third-party-licenses', relative(resolve('third-party-licenses'), path))
  assert.equal(hash(await readFile(path)), hash(await readFile(packaged)), `License drift: ${path}`)
}
for (const [source, packaged] of [['apps/harness-react/NOTICE.md', 'NOTICE.md'], ['apps/harness-react/app.html', 'index.html']]) {
  assert.equal(hash(await readFile(source)), hash(await readFile(resolve(output, packaged))))
}
const css = await readFile(resolve(output, 'app.css'))
assert.match(css.toString(), /\.mira-file-drawer__icon\[aria-pressed=(?:"true"|true)\]/)
report.css = { bytes: css.length, gzip9: gzip(css), sha256: hash(css), changedOnlyActiveRule: true }
report.licenses = { files: licensePaths.length, allMatch: true, noticeAndHtmlMatch: true }
report.passed = true
report.boundaries = 'Production React artifacts only; no native Electron, desktop, packaging, Windows or whole-goal release'
await writeFile(resolve(evidence, 'bundle-audit.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify({ at: report.auditTime, passed: report.passed, js: report.memoryDiskComparison, static: report.staticEntryClosure, dynamicTargets: report.dynamicImports.uniqueTargets, css: report.css, licenses: report.licenses }, null, 2))
