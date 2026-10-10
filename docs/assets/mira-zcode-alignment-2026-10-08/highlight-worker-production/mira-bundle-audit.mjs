import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'
import { bundledLanguages, bundledLanguagesInfo } from 'shiki/langs'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const evidence = process.env.MIRA_EVIDENCE_DIR ? resolve(process.env.MIRA_EVIDENCE_DIR) : scriptDirectory
const root = resolve(scriptDirectory, '../../../..')
process.chdir(root)
const output = resolve('dist/harness-react-app')
const hash = buffer => createHash('sha256').update(buffer).digest('hex')
const gzip = buffer => gzipSync(buffer, { level: 9 }).length
const report = { auditTime: new Date().toISOString(), buildOptionsSource: 'scripts/build-harness-react.mjs', passed: false }
const walk = async directory => {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(path))
    else files.push(path)
  }
  return files
}

try {
  const previous = await readFile(resolve(evidence, 'bundle-audit.json'), 'utf8').catch(error => {
    if (error.code === 'ENOENT') return undefined
    throw error
  })
  if (previous) {
    const prior = JSON.parse(previous)
    if (!prior.passed) report.previousAuditFailure = {
      auditTime: prior.auditTime, finishedAt: prior.finishedAt, error: prior.error,
      css: prior.css, originalReportSHA256: hash(Buffer.from(previous)),
      earlierFailure: prior.previousAuditFailure,
    }
  }
  // Match both production roots and the worker URL define; only write:false differs.
  const options = {
    entryPoints: {
      app: resolve('apps/harness-react/src/app/app-main.tsx'),
      'mira-code-highlight.worker': resolve('apps/harness-react/src/workers/mira-code-highlight.worker.ts'),
    },
    define: { MIRA_HIGHLIGHT_WORKER_PATH: JSON.stringify('./mira-code-highlight.worker.js') },
    bundle: true, format: 'esm', splitting: true, chunkNames: 'chunks/[name]-[hash]',
    platform: 'browser', target: ['chrome110'], jsx: 'automatic', outdir: output,
    loader: { '.svg': 'dataurl' },
    minify: true, metafile: true, logLevel: 'info', write: false,
  }
  const result = await build(options)
  report.buildOptions = options
  const jsOutputs = Object.fromEntries(Object.entries(result.metafile.outputs).filter(([path]) => path.endsWith('.js')))
  const outputPath = path => resolve(root, path)
  const displayPath = path => relative(output, outputPath(path))
  const content = new Map(result.outputFiles.map(file => [file.path, file.contents]))
  const allDisk = await walk(output)
  const diskJS = allDisk.filter(path => path.endsWith('.js'))
  const disk = new Map(await Promise.all(diskJS.map(async path => [path, await readFile(path)])))
  const expected = new Set(Object.keys(jsOutputs).map(outputPath))
  const missing = [], mismatched = [], equal = []
  for (const path of expected) {
    if (!disk.has(path)) missing.push(relative(output, path))
    else if (hash(disk.get(path)) !== hash(content.get(path))) mismatched.push(relative(output, path))
    else equal.push(relative(output, path))
  }
  const stale = [...disk.keys()].filter(path => !expected.has(path))
  const roots = Object.fromEntries(['app.js', 'mira-code-highlight.worker.js'].map(name => {
    const path = Object.keys(jsOutputs).find(path => outputPath(path) === resolve(output, name))
    assert.ok(path, `Missing build root: ${name}`)
    return [name, path]
  }))
  const closure = (starts, includeDynamic) => {
    const visited = new Set()
    const collect = path => {
      if (visited.has(path)) return
      assert.ok(jsOutputs[path], `Unresolved graph node: ${path}`)
      visited.add(path)
      for (const edge of jsOutputs[path].imports) {
        if (edge.external || (!includeDynamic && edge.kind === 'dynamic-import')) continue
        assert.ok(jsOutputs[edge.path], `Missing import target: ${edge.path}`)
        collect(edge.path)
      }
    }
    starts.forEach(collect)
    return visited
  }
  const staticApp = closure([roots['app.js']], false)
  const staticWorker = closure([roots['mira-code-highlight.worker.js']], false)
  const appGraph = closure([roots['app.js']], true)
  const workerGraph = closure([roots['mira-code-highlight.worker.js']], true)
  const graph = closure(Object.values(roots), true)
  const metrics = paths => {
    const buffers = [...paths].map(path => content.get(outputPath(path)))
    return { fileCount: buffers.length, bytes: buffers.reduce((sum, buffer) => sum + buffer.length, 0), gzipLevel9SumBytes: buffers.reduce((sum, buffer) => sum + gzip(buffer), 0) }
  }
  const describeClosure = paths => ({ ...metrics(paths), files: [...paths].map(displayPath).sort() })
  report.entryClosures = {
    app: { static: describeClosure(staticApp), includingDynamic: describeClosure(appGraph) },
    worker: { static: describeClosure(staticWorker), includingDynamic: describeClosure(workerGraph) },
  }
  report.multiRootClosure = { ...metrics(graph), orphanMetafileOutputs: Object.keys(jsOutputs).filter(path => !graph.has(path)).map(displayPath) }
  report.expectedJS = metrics(Object.keys(jsOutputs))
  report.allDiskJS = { fileCount: disk.size, bytes: [...disk.values()].reduce((sum, buffer) => sum + buffer.length, 0), gzipLevel9SumBytes: [...disk.values()].reduce((sum, buffer) => sum + gzip(buffer), 0) }
  report.memoryDiskComparison = {
    equalCount: equal.length, missing, mismatched, staleCount: stale.length,
    staleBytes: stale.reduce((sum, path) => sum + disk.get(path).length, 0),
    staleGzipLevel9SumBytes: stale.reduce((sum, path) => sum + gzip(disk.get(path)), 0),
    staleFiles: stale.map(path => relative(output, path)),
  }
  const dynamic = Object.entries(jsOutputs).flatMap(([from, file]) => file.imports
    .filter(edge => !edge.external && edge.kind === 'dynamic-import')
    .map(edge => ({ from, to: edge.path })))
  const dynamicTargets = [...new Set(dynamic.map(edge => edge.to))]
  report.dynamicImports = {
    edges: dynamic.length, uniqueTargets: dynamicTargets.length,
    missingOnDisk: dynamicTargets.filter(path => !disk.has(outputPath(path))).map(displayPath),
    missingInMetafile: dynamicTargets.filter(path => !jsOutputs[path]).map(displayPath),
    otherDynamicEntries: dynamicTargets.map(path => ({ path: displayPath(path), entryPoint: jsOutputs[path]?.entryPoint }))
      .filter(row => !/(?:@shikijs\/langs|@shikijs\/themes)/.test(row.entryPoint || '')),
  }
  const contribution = Object.entries(jsOutputs).flatMap(([path, file]) => Object.entries(file.inputs)
    .filter(([, value]) => value.bytesInOutput > 0)
    .map(([input, value]) => ({ input, bytes: value.bytesInOutput, output: path })))
  const inputs = Object.keys(result.metafile.inputs)
  const grammarInputs = inputs.filter(path => /(?:^|\/)@shikijs\/langs\/dist\/[^/]+\.mjs$/.test(path))
  const themeInputs = inputs.filter(path => /(?:^|\/)@shikijs\/themes\/dist\/[^/]+\.mjs$/.test(path))
  const contributing = input => contribution.some(row => row.input === input)
  const inputClosure = paths => [...new Set(contribution.filter(row => paths.has(row.output)).map(row => row.input))]
  const appInputs = inputClosure(appGraph)
  const workerInputs = inputClosure(workerGraph)
  const wasmPattern = /(?:@shikijs\/engine-oniguruma|engine-oniguruma\.|wasm-inlined|shiki\/dist\/wasm\.|onig\.wasm|\.wasm$)/i
  const mainTokenizerPattern = /(?:code-highlight-core|@shikijs\/core|@shikijs\/vscode-textmate|@shikijs\/engine-javascript|oniguruma-parser|oniguruma-to-es|@streamdown\/code)/i
  const publicIds = bundledLanguagesInfo.map(language => language.id)
  const aliases = bundledLanguagesInfo.flatMap(language => language.aliases || [])
  const languageKeys = Object.keys(bundledLanguages)
  const grammarContribution = grammarInputs.filter(contributing)
  const publicMapped = publicIds.filter(id => grammarInputs.some(path => basename(path) === `${id}.mjs`))
  report.shiki = {
    physicalGrammarModules: grammarInputs.length, physicalGrammarContributingModules: grammarContribution.length,
    publicLanguageIDs: publicIds.length, aliases: aliases.length, aliasUniqueCount: new Set(aliases).size,
    totalLanguageKeys: languageKeys.length, unmappedKeys: [...publicIds, ...aliases].filter(key => !languageKeys.includes(key)),
    publicIDsWithGrammarInput: publicMapped.length, themeInputs, themeContributingInputs: themeInputs.filter(contributing),
    wasmInputs: inputs.filter(path => wasmPattern.test(path)), workerWasmInputs: workerInputs.filter(path => wasmPattern.test(path)),
    appWasmInputs: appInputs.filter(path => wasmPattern.test(path)), appTokenizerInputs: appInputs.filter(path => mainTokenizerPattern.test(path)),
    workerCoreInputs: workerInputs.filter(path => /code-highlight-core/.test(path)),
    javaScriptRegexConverterInputs: inputs.filter(path => /(?:oniguruma-parser|oniguruma-to-es)/.test(path)),
  }
  report.outputCounts = {
    metafileAllOutputs: Object.keys(result.metafile.outputs).length, allDiskFiles: allDisk.length,
    allDiskWASM: allDisk.filter(path => path.endsWith('.wasm')).map(path => relative(output, path)),
  }
  report.generatedCSS = result.outputFiles.filter(file => file.path.endsWith('.css'))
    .map(file => ({ path: relative(output, file.path), bytes: file.contents.length, note: 'Subsequently replaced by the production Tailwind step; audited separately.' }))
  const html = await readFile(resolve(output, 'index.html'), 'utf8')
  report.html = { moduleAppEntry: /<script\b[^>]*type="module"[^>]*src="\.\/app\.js"/.test(html) }
  const css = await readFile(resolve(output, 'app.css'))
  const stdoutCSS = execFileSync(resolve('node_modules/.bin/tailwindcss'), [
    '-i', resolve('apps/harness-react/src/styles/app.css'), '-o', '-', '--minify',
  ], { cwd: root, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
  // Tailwind's stdout writer appends one LF; its file writer does not.
  assert.equal(stdoutCSS.at(-1), 10)
  const expectedCSS = stdoutCSS.subarray(0, -1)
  report.css = { bytes: css.length, gzip9: gzip(css), sha256: hash(css), expectedTailwindFileSHA256: hash(expectedCSS), stdoutTrailingNewlineRemoved: true, matchesFreshTailwind: hash(css) === hash(expectedCSS), changedOnlyActiveRule: /\.mira-file-drawer__icon\[aria-pressed=(?:"true"|true)\]/.test(css.toString()) }
  const licenseRoot = resolve('third-party-licenses')
  const packagedLicenseRoot = resolve(output, 'third-party-licenses')
  const licenseFiles = await walk(licenseRoot)
  const sourceLicensePaths = licenseFiles.map(path => relative(licenseRoot, path)).sort()
  const packagedLicensePaths = (await walk(packagedLicenseRoot)).map(path => relative(packagedLicenseRoot, path)).sort()
  const licenseMismatches = []
  for (const path of licenseFiles) {
    const packaged = resolve(packagedLicenseRoot, relative(licenseRoot, path))
    if (hash(await readFile(path)) !== hash(await readFile(packaged))) licenseMismatches.push(relative(licenseRoot, path))
  }
  const noticeMatches = hash(await readFile('apps/harness-react/NOTICE.md')) === hash(await readFile(resolve(output, 'NOTICE.md')))
  const htmlMatches = hash(await readFile('apps/harness-react/app.html')) === hash(Buffer.from(html))
  report.licenses = { files: licenseFiles.length, mismatched: licenseMismatches, sourceAndPackagePathsMatch: JSON.stringify(sourceLicensePaths) === JSON.stringify(packagedLicensePaths), noticeMatches, htmlMatches }
  report.artifacts = [...expected].sort().map(path => ({ path: relative(output, path), sha256: hash(content.get(path)) }))
  report.buildSource = { path: 'scripts/build-harness-react.mjs', sha256: hash(await readFile('scripts/build-harness-react.mjs')) }

  assert.deepEqual(missing, [])
  assert.deepEqual(mismatched, [])
  assert.deepEqual(stale, [])
  assert.equal(equal.length, expected.size)
  assert.equal(graph.size, expected.size)
  assert.deepEqual(report.dynamicImports.missingOnDisk, [])
  assert.deepEqual(report.dynamicImports.missingInMetafile, [])
  assert.equal(grammarInputs.length, 253)
  assert.equal(grammarContribution.length, 253)
  assert.equal(publicIds.length, 235)
  assert.equal(aliases.length, 97)
  assert.equal(new Set(aliases).size, 97)
  assert.equal(languageKeys.length, 332)
  assert.equal(publicMapped.length, 235)
  assert.deepEqual(report.shiki.unmappedKeys, [])
  assert.deepEqual(themeInputs.map(path => basename(path)).sort(), ['github-dark.mjs', 'github-light.mjs'])
  assert.equal(report.shiki.themeContributingInputs.length, 2)
  assert.ok(report.shiki.workerWasmInputs.some(path => /wasm-inlined/.test(path)))
  assert.ok(report.shiki.workerCoreInputs.length > 0)
  assert.deepEqual(report.shiki.appWasmInputs, [], 'WASM must not be reachable from the app root')
  assert.deepEqual(report.shiki.appTokenizerInputs, [], 'No main-thread tokenizer fallback may ship')
  assert.deepEqual(report.shiki.javaScriptRegexConverterInputs, [])
  assert.equal(report.html.moduleAppEntry, true)
  assert.equal(report.css.matchesFreshTailwind, true, 'CSS differs from the fresh production Tailwind output')
  assert.equal(report.css.changedOnlyActiveRule, true)
  assert.deepEqual(licenseMismatches, [])
  assert.equal(report.licenses.sourceAndPackagePathsMatch, true)
  assert.equal(noticeMatches, true)
  assert.equal(htmlMatches, true)
  report.passed = true
} catch (error) {
  report.error = error.stack
  process.exitCode = 1
} finally {
  report.boundaries = 'Read-only production artifact/build-equivalence audit; no production outputs modified. Not runtime loader, semantic, cancellation, performance, native Electron, packaging, Windows or whole-goal acceptance.'
  report.finishedAt = new Date().toISOString()
  await writeFile(resolve(evidence, 'bundle-audit.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ at: report.auditTime, passed: report.passed, error: report.error, js: report.memoryDiskComparison, entries: report.entryClosures && Object.fromEntries(Object.entries(report.entryClosures).map(([name, value]) => [name, value.static])), dynamicTargets: report.dynamicImports?.uniqueTargets, shiki: report.shiki, css: report.css, licenses: report.licenses }, null, 2))
}
