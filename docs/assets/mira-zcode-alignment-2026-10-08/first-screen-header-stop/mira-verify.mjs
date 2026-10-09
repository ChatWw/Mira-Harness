import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const evidence = dirname(fileURLToPath(import.meta.url)), root = resolve(evidence, '../../../..')
const checks = [
  ['tests', 'node', ['node_modules/vitest/vitest.mjs', 'run', '--maxWorkers=2']],
  ['react-types', 'node', ['node_modules/typescript/bin/tsc', '-p', 'apps/harness-react/tsconfig.json', '--noEmit']],
  ['vue-types', 'node', ['node_modules/vue-tsc/bin/vue-tsc.js', '--noEmit']],
  ['react-build', 'node', ['scripts/build-harness-react.mjs']],
  ['electron-build', 'node', ['node_modules/electron-vite/bin/electron-vite.js', 'build']],
  ['bundle-audit', 'node', ['docs/assets/mira-zcode-alignment-2026-10-08/highlight-worker-production/mira-bundle-audit.mjs']],
  ['diff-check', 'git', ['diff', '--check']],
]
const report = { startedAt: new Date().toISOString(), passed: false, checks: [], boundary: 'Two-worker tests, types, unpackaged React/Electron builds, fresh bundle and license audit. Screen locked: no native input or window captures. Not real model/scheduler, installed release/Windows, same-state ZCode or performance acceptance.' }
try {
  for (const [name, command, args] of checks) {
    const startedAt = new Date().toISOString(), start = Date.now()
    console.log(`Start ${name}: ${startedAt}`)
    const child = spawn(command, args, { cwd: root, env: { ...process.env, MIRA_EVIDENCE_DIR: evidence }, stdio: ['ignore', 'pipe', 'pipe'] })
    let log = ''
    child.stdout.on('data', chunk => { log += chunk })
    child.stderr.on('data', chunk => { log += chunk })
    const exitCode = await new Promise((done, reject) => { child.once('error', reject); child.once('close', done) })
    await writeFile(resolve(evidence, `${name}.log`), log)
    report.checks.push({ name, startedAt, exitCode, elapsedMs: Date.now() - start, command: [command, ...args], log: `${name}.log` })
    if (name === 'tests') report.testSummary = log.match(/Test Files[^\n]+|Tests[^\n]+|Duration[^\n]+/g)
    console.log(`Finish ${name}: exit ${exitCode}`)
  }
  report.artifacts = []
  for (const path of ['dist/harness-react-app/app.js', 'dist/harness-react-app/app.css', 'dist/harness-react-app/mira-code-highlight.worker.js', 'out/main/main.js', 'out/preload/preload.mjs', 'out/renderer/index.html']) report.artifacts.push({ path, sha256: createHash('sha256').update(await readFile(resolve(root, path))).digest('hex') })
  report.passed = report.checks.every(check => check.exitCode === 0)
} catch (cause) { report.error = cause.stack }
finally {
  report.finishedAt = new Date().toISOString()
  await writeFile(resolve(evidence, 'validation-results.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  if (!report.passed) process.exitCode = 1
}
