import { createHash, randomUUID } from 'node:crypto'
import { chmod, copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync } from 'fflate'

const root = fileURLToPath(new URL('../', import.meta.url))
const pinned = JSON.parse(await readFile(new URL('./cua-driver-artifacts.json', import.meta.url), 'utf8'))

/** Build-time only: verify the pinned wheel, extract its standalone native CLI, never run pip. */
export async function buildCuaDriver({ platform = process.platform, arch = process.arch, output = join(root, 'dist/mira-tools') } = {}) {
  const artifact = pinned.artifacts[platform === 'darwin' && ['x64', 'arm64'].includes(arch) ? 'darwin' : `${platform}-${arch}`]
  if (!artifact) throw new Error(`Cua Driver ${pinned.version} has no bundled runtime for ${platform}-${arch}.`)
  const binary = platform === 'win32' ? 'cua-driver.exe' : 'cua-driver'
  const destination = join(output, 'cua-driver')
  const cache = join(root, 'node_modules/.cache/mira-cua-driver', `${artifact.sha256}.whl`)
  await mkdir(dirname(cache), { recursive: true })
  let bytes = await readFile(cache).catch(error => { if (error.code !== 'ENOENT') throw error })
  if (!bytes || createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) {
    console.log(`[cua-driver] Downloading ${pinned.version} for ${platform}-${arch} (timeout: 120s): ${artifact.url}`)
    const response = await fetch(artifact.url, { signal: AbortSignal.timeout(120_000), redirect: 'error' })
    if (!response.ok) throw new Error(`Cua Driver download failed: HTTP ${response.status}`)
    const total = Number(response.headers.get('content-length'))
    const chunks = []
    let received = 0, lastProgress = Date.now()
    for await (const chunk of response.body) {
      chunks.push(chunk)
      received += chunk.length
      if (Date.now() - lastProgress >= 5000) {
        console.log(`[cua-driver] Downloaded ${(received / 1024 / 1024).toFixed(1)} MB${total ? ` / ${(total / 1024 / 1024).toFixed(1)} MB` : ''}`)
        lastProgress = Date.now()
      }
    }
    bytes = Buffer.concat(chunks)
    if (createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) throw new Error('Cua Driver SHA-256 mismatch.')
    const temporary = `${cache}.${randomUUID()}.tmp`
    try { await writeFile(temporary, bytes); await rename(temporary, cache) }
    finally { await rm(temporary, { force: true }) }
  }
  console.log(`[cua-driver] Extracting verified runtime for ${platform}-${arch}`)
  const binaries = platform === 'win32' ? [binary, 'cua-driver-uia.exe'] : [binary]
  const files = unzipSync(bytes, { filter: file => binaries.some(name => file.name === `cua_driver/bin/${name}`) && file.originalSize <= 160 * 1024 * 1024 })
  for (const name of binaries) if (!files[`cua_driver/bin/${name}`]?.length) throw new Error(`Cua Driver wheel is missing ${name}.`)
  await mkdir(destination, { recursive: true })
  for (const name of ['cua-driver', 'cua-driver.exe', 'cua-driver-uia.exe']) {
    if (!binaries.includes(name)) await rm(join(destination, name), { force: true })
  }
  for (const name of binaries) {
    await writeFile(join(destination, name), files[`cua_driver/bin/${name}`])
    if (platform !== 'win32') await chmod(join(destination, name), 0o755)
  }
  await copyFile(join(root, 'resources/plugins/computer-use/LICENSE-UPSTREAM'), join(destination, 'LICENSE'))
  await writeFile(join(destination, 'version.json'), `${JSON.stringify({ version: pinned.version, platform, arch, sha256: artifact.sha256 })}\n`)
  console.log(`[cua-driver] Ready: ${join(destination, binary)}`)
  return join(destination, binary)
}
