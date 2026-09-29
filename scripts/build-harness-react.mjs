import { copyFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const output = resolve('dist/harness-react-app')
await mkdir(output, { recursive: true })
await build({
  entryPoints: { app: resolve('apps/harness-react/src/app-main.tsx') },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome110'],
  jsx: 'automatic',
  outdir: output,
  minify: true,
  logLevel: 'info',
})
await copyFile(resolve('apps/harness-react/app.html'), resolve(output, 'index.html'))
