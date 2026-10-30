import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const run = (script, args = []) => execFileSync(process.execPath, [resolve(script), ...args], { stdio: 'inherit' })

run('node_modules/vue-tsc/bin/vue-tsc.js', ['--noEmit'])
run('node_modules/typescript/bin/tsc', ['--noEmit', '-p', 'apps/harness-react/tsconfig.json'])
run('scripts/build-harness-react.mjs')
run('scripts/build-mira-flow.mjs')
// Packaging prepares native tools for its target architecture in beforePack.
if (!process.argv.includes('--skip-tools')) run('scripts/build-mira-tools.mjs')
run('node_modules/electron-vite/bin/electron-vite.js', ['build'])
