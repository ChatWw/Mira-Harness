import { copyFile, cp, mkdir, readdir, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'

// 只清理 esbuild 在 chunks/ 下生成的旧散列 JS，不触碰许可证或用户文件。
export async function pruneHarnessChunks(output, outputs) {
  const chunks = resolve(output, 'chunks')
  const current = new Set(Object.keys(outputs).map(path => resolve(path)))
  const entries = await readdir(chunks, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  let removed = 0
  for (const entry of entries) {
    const path = resolve(chunks, entry.name)
    if (!entry.isFile() || !/^[A-Za-z0-9_-]+-[A-Z2-7]{8}\.js$/.test(entry.name) || current.has(path)) continue
    await unlink(path)
    removed += 1
  }
  return removed
}

async function buildHarnessReact() {
  const output = resolve('dist/harness-react-app')
  await mkdir(output, { recursive: true })
  const result = await build({
    entryPoints: {
      app: resolve('apps/harness-react/src/app/app-main.tsx'),
      'mira-code-highlight.worker': resolve('apps/harness-react/src/workers/mira-code-highlight.worker.ts'),
    },
    define: { MIRA_HIGHLIGHT_WORKER_PATH: JSON.stringify('./mira-code-highlight.worker.js') },
    bundle: true,
    // ESM 分包保留 Shiki 的语言/主题按需导入，避免首屏解析全部语法包。
    format: 'esm',
    splitting: true,
    chunkNames: 'chunks/[name]-[hash]',
    platform: 'browser',
    target: ['chrome110'],
    loader: { '.svg': 'dataurl' },
    jsx: 'automatic',
    outdir: output,
    minify: true,
    metafile: true,
    logLevel: 'info',
  })
  await copyFile(resolve('apps/harness-react/app.html'), resolve(output, 'index.html'))
  await copyFile(resolve('apps/harness-react/NOTICE.md'), resolve(output, 'NOTICE.md'))
  await cp(resolve('third-party-licenses'), resolve(output, 'third-party-licenses'), { recursive: true })
  // Tailwind v4（CSS-first）：令牌与组件类统一由 CLI 编译，扫描 harness-react 源码与 streamdown 运行时类名。
  execFileSync(resolve('node_modules/.bin/tailwindcss'), [
    '-i', resolve('apps/harness-react/src/styles/app.css'),
    '-o', resolve(output, 'app.css'),
    '--minify',
  ], { stdio: 'inherit' })
  const removed = await pruneHarnessChunks(output, result.metafile.outputs)
  if (removed) console.info(`Removed ${removed} stale Harness chunks.`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await buildHarnessReact()
}
