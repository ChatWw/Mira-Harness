import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const evidence = dirname(fileURLToPath(import.meta.url))
const repository = resolve(evidence, '../../../..')
const cdp = resolve(repository, 'docs/assets/mira-zcode-alignment-2026-10-08/watch-editor-scripts/mira-cdp.mjs')
const reply = JSON.parse(execFileSync(process.execPath, [cdp, 'page', 'evaluate', String.raw`(async () => {
  const project = (await window.platform.listHarnessProjects()).find(item => item.name === 'Mira native rules');
  if (!project || !/^\/private\/tmp\/mira-native-ignore-[A-Za-z0-9]+\/project$/.test(project.directory)) throw Error('Isolated project unavailable');
  const target = { kind: 'project', id: project.id };
  let proxy;
  try { await window.platform.readHarnessWorkspaceSearchIgnore(new Proxy(target, {})); proxy = { rejected: false }; }
  catch (error) { proxy = { rejected: true, error: error.message }; }
  const plain = await window.platform.readHarnessWorkspaceSearchIgnore(target);
  const textarea = document.querySelector('.search-ignore__editor textarea');
  return { url: location.href, timeOrigin: performance.timeOrigin, projectDirectory: project.directory,
    proxy, plain: { source: plain.source, bytes: new TextEncoder().encode(plain.content).byteLength },
    renderedEditor: { exists: !!textarea, disabled: textarea?.disabled, matchesPlainDocument: textarea?.value === plain.content },
    alerts: [...document.querySelectorAll('[role=alert]')].map(element => element.innerText) };
})()`], { encoding: 'utf8', timeout: 8000 }))
if (reply.result.exceptionDetails) throw new Error(reply.result.exceptionDetails.exception?.description)
const result = reply.result.result.value
assert.ok(result.url.startsWith('file://' + resolve(repository, 'out/renderer/index.html')))
assert.deepEqual(result.proxy, { rejected: true, error: 'An object could not be cloned.' })
assert.equal(result.plain.source, 'template')
assert.deepEqual(result.renderedEditor, { exists: true, disabled: false, matchesPlainDocument: true })
assert.deepEqual(result.alerts, [])
result.at = new Date().toISOString()
result.frontmost = JSON.parse(execFileSync('/private/tmp/mira-zcode-cu', ['frontmost'], { encoding: 'utf8' }))
result.artifacts = await Promise.all(['out/main/main.js', 'out/preload/preload.mjs', 'out/renderer/index.html'].map(async path => ({ path, sha256: createHash('sha256').update(await readFile(resolve(repository, path))).digest('hex') })))
result.passed = true
result.scope = 'Actual isolated Electron renderer, contextBridge/preload and read IPC; CDP read/probe and fixture setup, no native mouse/keyboard or screenshot acceptance. Foreground loginwindow prevents native UI testing.'
await writeFile(resolve(evidence, 'bridge-transport-results.json'), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
