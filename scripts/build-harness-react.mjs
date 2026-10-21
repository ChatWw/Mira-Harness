import { copyFile, cp, mkdir, readdir, readFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'

// Pinned react-xlsx has no worker/link factory props. Adapt only these two
// integration seams during bundling; never mutate the installed dependency.
export function miraSheetIntegration() {
  return { name: 'mira-sheet-integration', setup(builder) {
    builder.onLoad({ filter: /@extend-ai\/react-xlsx\/dist\/index\.js$/ }, async ({ path }) => {
      let contents = await readFile(path, 'utf8')
      const worker = 'new Worker(new URL("./xlsx-worker.js", import.meta.url), { type: "module" })'
      const link = 'window.open(externalTarget, "_blank", "noopener,noreferrer");'
      for (const seam of [worker, link]) if (contents.split(seam).length !== 2) throw new Error('react-xlsx integration changed; review the pinned worker/link adapters before building.')
      contents = `import { createMiraSheetWorker } from ${JSON.stringify(resolve('apps/harness-react/src/lib/mira-sheet-worker.ts'))};\n` + contents
        .replace(worker, 'createMiraSheetWorker()')
        .replace(link, 'scrollRef.current?.dispatchEvent(new CustomEvent("mira-document-open-link", {bubbles:true,detail:{url:externalTarget}}));')
      return { contents, loader: 'js', resolveDir: resolve(path, '..') }
    })
  } }
}

// The pinned Word library otherwise falls back to main-thread parsing when its
// module worker cannot be constructed inside the sandbox. Fail explicitly instead.
export function miraWordIntegration() {
  return { name: 'mira-word-integration', setup(builder) {
    builder.onLoad({ filter: /@extend-ai\/react-docx\/dist\/index\.js$/ }, async ({ path }) => {
      let contents = await readFile(path, 'utf8')
      const worker = 'new Worker(new URL("./docx-import-worker.js", import.meta.url), {\n    type: "module",\n    name: "react-docx-import"\n  })'
      const fallback = '  } catch {\n    return importDocxOnMainThread(buffer, options.signal);\n  }'
      for (const seam of [worker, fallback]) if (contents.split(seam).length !== 2) throw new Error('react-docx integration changed; review the pinned worker adapter before building.')
      contents = `import { createMiraWordWorker } from ${JSON.stringify(resolve('apps/harness-react/src/lib/mira-word-worker.ts'))};\n` + contents
        .replace(worker, 'createMiraWordWorker()')
        .replace(fallback, '  } catch {\n    throw new Error("Word reader worker could not start");\n  }')
      return { contents, loader: 'js', resolveDir: resolve(path, '..') }
    })
  } }
}

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
  // PDF.js stays lazy; ship the worker and fonts locally for offline desktop reading.
  const pdfAssets = resolve(output, 'pdfjs')
  await mkdir(pdfAssets, { recursive: true })
  await copyFile(resolve('node_modules/pdfjs-dist/build/pdf.worker.min.mjs'), resolve(pdfAssets, 'pdf.worker.min.mjs'))
  for (const directory of ['cmaps', 'standard_fonts', 'wasm']) await cp(resolve('node_modules/pdfjs-dist', directory), resolve(pdfAssets, directory), { recursive: true })
  for (const name of ['react-pdf', 'pdfjs-dist']) {
    const licenseDirectory = resolve(output, 'third-party-licenses', name)
    await mkdir(licenseDirectory, { recursive: true })
    await copyFile(resolve('node_modules', name, 'LICENSE'), resolve(licenseDirectory, 'LICENSE'))
  }
  const officeAssets = resolve(output, 'office')
  await mkdir(officeAssets, { recursive: true })
  await copyFile(resolve('node_modules/@extend-ai/react-xlsx/dist/duke_sheets_wasm_bg.wasm'), resolve(officeAssets, 'duke_sheets_wasm_bg.wasm'))
  await build({ entryPoints: [resolve('node_modules/@extend-ai/react-xlsx/dist/xlsx-worker.js')], outfile: resolve(officeAssets, 'mira-sheet-worker.js'), bundle: true, format: 'esm', platform: 'browser', target: ['chrome110'], minify: true })
  await copyFile(resolve('node_modules/@extend-ai/react-docx/dist/docx_wasm_bg.wasm'), resolve(officeAssets, 'docx_wasm_bg.wasm'))
  await build({ entryPoints: [resolve('node_modules/@extend-ai/react-docx/dist/docx-import-worker.js')], outfile: resolve(officeAssets, 'mira-word-worker.js'), bundle: true, format: 'esm', platform: 'browser', target: ['chrome110'], minify: true })
  for (const [name, license] of [['docx-preview', 'LICENSE'], ['@extend-ai/react-xlsx', 'LICENSE'], ['@extend-ai/react-docx', 'LICENSE'], ['@aiden0z/pptx-renderer', 'LICENSE'], ['echarts', 'LICENSE'], ['echarts', 'NOTICE'], ['echarts', 'licenses/LICENSE-d3'], ['zrender', 'LICENSE'], ['zrender/node_modules/tslib', 'LICENSE.txt'], ['@chenglou/pretext', 'LICENSE'], ['fast-png', 'LICENSE'], ['iobuffer', 'LICENSE'], ['utif', 'LICENSE'], ['pako', 'LICENSE'], ['jszip', 'LICENSE.markdown'], ['fflate', 'LICENSE']]) {
    const directory = resolve(output, 'third-party-licenses', name)
    await mkdir(directory, { recursive: true })
    await mkdir(resolve(directory, license, '..'), { recursive: true })
    await copyFile(resolve('node_modules', name, license), resolve(directory, license))
  }
  const result = await build({
    entryPoints: {
      app: resolve('apps/harness-react/src/app/app-main.tsx'),
      mobile: resolve('apps/harness-react/src/app/mobile-main.tsx'),
      'mira-code-highlight.worker': resolve('apps/harness-react/src/workers/mira-code-highlight.worker.ts'),
    },
    define: { MIRA_HIGHLIGHT_WORKER_PATH: JSON.stringify('./mira-code-highlight.worker.js') },
    bundle: true,
    plugins: [miraSheetIntegration(), miraWordIntegration()],
    // ESM 分包保留 Shiki 的语言/主题按需导入，避免首屏解析全部语法包。
    format: 'esm',
    splitting: true,
    chunkNames: 'chunks/[name]-[hash]',
    platform: 'browser',
    target: ['chrome110'],
    loader: { '.svg': 'dataurl', '.png': 'dataurl' },
    jsx: 'automatic',
    outdir: output,
    minify: true,
    metafile: true,
    logLevel: 'info',
  })
  await copyFile(resolve('apps/harness-react/app.html'), resolve(output, 'index.html'))
  await copyFile(resolve('apps/harness-react/mobile.html'), resolve(output, 'mobile.html'))
  await copyFile(resolve('apps/harness-react/NOTICE.md'), resolve(output, 'NOTICE.md'))
  await cp(resolve('third-party-licenses'), resolve(output, 'third-party-licenses'), { recursive: true })
  // Tailwind v4（CSS-first）：令牌与组件类统一由 CLI 编译，扫描 harness-react 源码与 streamdown 运行时类名。
  execFileSync(process.execPath, [
    resolve('node_modules/@tailwindcss/cli/dist/index.mjs'),
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
