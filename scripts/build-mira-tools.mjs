import { createRequire } from 'node:module'
import { chmod, cp, mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildComputerUse } from './build-computer-use.mjs'

const require = createRequire(import.meta.url)
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Copy the target's pinned native executable outside ASAR; never substitute a host binary. */
export async function buildMiraTools({ platform = process.platform, arch = process.arch, output = join(projectRoot, 'dist/mira-tools') } = {}) {
  const binaryName = platform === 'win32' ? 'rg.exe' : 'rg'
  const packageName = `@vscode/ripgrep-${platform}-${arch}`
  let binary
  try { binary = require.resolve(`${packageName}/bin/${binaryName}`) }
  catch { throw new Error(`Mira search tool missing for ${platform}-${arch}: install the optional ${packageName}@1.18.0 package before building this target.`) }
  const packageRoot = resolve(dirname(binary), '..')
  const metadata = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
  if (metadata.version !== '1.18.0') throw new Error(`Unexpected ${packageName} version: ${metadata.version}; expected 1.18.0.`)
  const destination = join(output, 'ripgrep')
  await mkdir(destination, { recursive: true })
  await rm(join(destination, platform === 'win32' ? 'rg' : 'rg.exe'), { force: true })
  await cp(binary, join(destination, binaryName))
  if (platform !== 'win32') await chmod(join(destination, binaryName), 0o755)
  await cp(join(packageRoot, 'LICENSE'), join(destination, 'VSCODE-RIPGREP-LICENSE'))
  await cp(join(projectRoot, 'third-party-licenses/ripgrep'), join(destination, 'licenses'), { recursive: true })
  return join(destination, binaryName)
}

/** electron-builder supplies the actual target, even when it differs from the development host. */
export default async function beforePack(context) {
  const { Arch } = require('builder-util')
  await buildMiraTools({ platform: context.electronPlatformName, arch: Arch[context.arch] })
  await buildComputerUse({ platform: context.electronPlatformName, arch: Arch[context.arch] })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await buildMiraTools()
  await buildComputerUse()
}
