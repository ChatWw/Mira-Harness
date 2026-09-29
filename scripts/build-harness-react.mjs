import { copyFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'

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
// Tailwind v4（CSS-first）：令牌与组件类统一由 CLI 编译，扫描 harness-react 源码与 streamdown 运行时类名。
execFileSync(resolve('node_modules/.bin/tailwindcss'), [
  '-i', resolve('apps/harness-react/src/app.css'),
  '-o', resolve(output, 'app.css'),
  '--minify',
], { stdio: 'inherit' })
