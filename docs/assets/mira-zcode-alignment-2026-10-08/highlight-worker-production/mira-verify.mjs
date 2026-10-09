import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const evidence = dirname(fileURLToPath(import.meta.url))
const root = resolve(evidence, '../../../..')
const commands = [
  ['tests', 'node', ['node_modules/vitest/vitest.mjs', 'run', ...process.argv.slice(2)]],
  ['react-types', 'node', ['node_modules/typescript/bin/tsc', '-p', 'apps/harness-react/tsconfig.json', '--noEmit']],
  ['vue-types', 'node', ['node_modules/vue-tsc/bin/vue-tsc.js', '--noEmit']],
  ['react-build', 'node', ['scripts/build-harness-react.mjs']],
  ['electron-build', 'node', ['node_modules/electron-vite/bin/electron-vite.js', 'build']],
  ['bundle-audit', 'node', ['docs/assets/mira-zcode-alignment-2026-10-08/highlight-worker-production/mira-bundle-audit.mjs']],
  ['diff-check', 'git', ['diff', '--check']],
]
const report = { startedAt: new Date().toISOString(), passed: false, checks: [], boundary: 'Unit/core/transport/SSR tests, type checks, unpackaged build and fresh multi-root artifacts. Not Electron native UI, packaged/Windows, model execution or entire ZCode alignment acceptance.' }
try {
  for (const [name, command, args] of commands) {
    console.log(`Start ${name}: ${new Date().toISOString()}`)
    const started = Date.now()
    const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 90_000 })
    const log = (result.stdout || '') + (result.stderr || '')
    await writeFile(resolve(evidence, `${name}.log`), log)
    report.checks.push({ name, command: [command, ...args], exitCode: result.status, error: result.error?.message, elapsedMs: Date.now() - started, log: `${name}.log` })
    console.log(`Finish ${name}: exit ${result.status}`)
    if (name === 'tests') report.testSummary = log.match(/Test Files[^\n]+|Tests[^\n]+|Duration[^\n]+/g)
  }
  report.artifacts = await Promise.all(['dist/harness-react-app/app.js', 'dist/harness-react-app/app.css', 'dist/harness-react-app/mira-code-highlight.worker.js', 'out/main/main.js', 'out/preload/preload.mjs', 'out/renderer/index.html'].map(async path => ({ path, sha256: createHash('sha256').update(await readFile(resolve(root, path))).digest('hex') })))
  report.passed = report.checks.every(check => check.exitCode === 0)
  if (!report.passed) {
    report.failure = report.checks.filter(check => check.exitCode !== 0).map(check => `${check.name} failed; inspect ${check.log}`).join('; ')
    process.exitCode = 1
  }
} catch (error) { report.failure = error.message; process.exitCode = 1 }
finally { report.finishedAt = new Date().toISOString(); await writeFile(resolve(evidence, 'validation-results.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)) }
