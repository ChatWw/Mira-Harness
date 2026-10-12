import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cp } from 'node:fs/promises'

export async function buildMiraFlow(output = resolve('dist/mira-flow-host')) {
  execFileSync(process.execPath, [resolve('scripts/generate-mira-flow-libs.mjs')], { stdio: 'inherit' })
  await build({
    entryPoints: {
      'mira-flow-compile.worker': resolve('electron/services/flows/miraFlowCompile.worker.ts'),
      'mira-flow-runtime': resolve('packages/mira-flow-runtime/src/mira-index.ts'),
    },
    outdir: output, outExtension: { '.js': '.cjs' },
    bundle: true, platform: 'node', target: 'node22', format: 'cjs',
    minify: true, keepNames: true, logLevel: 'info',
  })
  await cp(resolve('third-party-licenses/zcode'), resolve(output, 'third-party-licenses/zcode'), { recursive: true })
  await cp(resolve('node_modules/typescript/LICENSE.txt'), resolve(output, 'TYPESCRIPT-LICENSE.txt'))
  await cp(resolve('node_modules/typescript/ThirdPartyNoticeText.txt'), resolve(output, 'TYPESCRIPT-NOTICE.txt'))
  return output
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await buildMiraFlow()
