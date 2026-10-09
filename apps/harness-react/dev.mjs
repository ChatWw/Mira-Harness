import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { context } from 'esbuild'
import { spawn } from 'node:child_process'

const directory = dirname(fileURLToPath(import.meta.url))
const output = resolve(directory, '../../dist/harness-react-dev')
const bundler = await context({
  entryPoints: {
    main: resolve(directory, 'src/app/main.tsx'), pilot: resolve(directory, 'src/app/pilot-main.tsx'),
    'mira-code-highlight.worker': resolve(directory, 'src/workers/mira-code-highlight.worker.ts'),
  },
  bundle: true,
  format: 'esm',
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  define: { MIRA_HIGHLIGHT_WORKER_PATH: JSON.stringify('/harness-react-dev/mira-code-highlight.worker.js') },
  platform: 'browser',
  target: ['chrome110'],
  jsx: 'automatic',
  outdir: output,
  sourcemap: 'inline',
  logLevel: 'info',
})
await bundler.rebuild()
await bundler.watch()

// Tailwind v4 watch：与 esbuild 并行编译 app.css（令牌 + 手写层 + 组件类）。
const tailwind = spawn(resolve(directory, '../../node_modules/.bin/tailwindcss'), [
  '-i', resolve(directory, 'src/styles/app.css'),
  '-o', resolve(output, 'app.css'),
  '--watch',
], { stdio: 'inherit' })

const paths = {
  '/harness-react-dev/': { file: resolve(directory, 'index.html'), type: 'text/html; charset=utf-8' },
  '/harness-react-dev/main.js': { file: resolve(output, 'main.js'), type: 'text/javascript; charset=utf-8' },
  '/harness-react-dev/app.css': { file: resolve(output, 'app.css'), type: 'text/css; charset=utf-8' },
  '/harness-react-dev/pilot/': { file: resolve(directory, 'pilot.html'), type: 'text/html; charset=utf-8' },
  '/harness-react-dev/pilot.js': { file: resolve(output, 'pilot.js'), type: 'text/javascript; charset=utf-8' },
}
const server = createServer(async (request, response) => {
  const path = new URL(request.url || '/', 'http://127.0.0.1').pathname
  const dynamic = path.match(/^\/harness-react-dev\/(mira-code-highlight\.worker\.js|chunks\/[A-Za-z0-9_.-]+\.js)$/)
  const asset = paths[path] || (dynamic ? { file: resolve(output, dynamic[1]), type: 'text/javascript; charset=utf-8' } : undefined)
  if (!asset) { response.writeHead(404); response.end('Not found'); return }
  try {
    response.writeHead(200, { 'Content-Type': asset.type, 'Cache-Control': 'no-store', ...(request.headers.origin === 'null' ? { 'Access-Control-Allow-Origin': 'null' } : {}) })
    response.end(await readFile(asset.file))
  } catch { response.writeHead(503); response.end('Harness React dev bundle is rebuilding') }
})
server.listen(9001, '127.0.0.1', () => console.log('Harness React dev server: http://127.0.0.1:9001/harness-react-dev/'))
async function close() {
  tailwind.kill()
  server.close()
  await bundler.dispose()
}
process.once('SIGINT', () => { void close() })
process.once('SIGTERM', () => { void close() })
