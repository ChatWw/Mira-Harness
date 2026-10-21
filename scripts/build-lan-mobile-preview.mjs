import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

// Separate review artifact: never add fixture data to the production app entry.
await build({
  entryPoints: { preview: resolve('prototypes/lan-remote/pc-preview.tsx'), 'mira-code-highlight.worker': resolve('apps/harness-react/src/workers/mira-code-highlight.worker.ts') },
  outdir: resolve('prototypes/lan-remote/pc-preview-build'),
  bundle: true, splitting: true, format: 'esm', platform: 'browser', target: ['chrome110'],
  jsx: 'automatic', loader: { '.svg': 'dataurl', '.png': 'dataurl' },
  define: { MIRA_HIGHLIGHT_WORKER_PATH: JSON.stringify('./mira-code-highlight.worker.js') },
  minify: true, logLevel: 'info',
})
execFileSync(process.execPath, [resolve('node_modules/@tailwindcss/cli/dist/index.mjs'), '-i', resolve('apps/harness-react/src/styles/app.css'), '-o', resolve('prototypes/lan-remote/pc-preview-build/app.css'), '--minify'], { stdio: 'inherit' })
