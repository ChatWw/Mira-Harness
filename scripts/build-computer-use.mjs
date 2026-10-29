import { execFileSync } from 'node:child_process'
import { mkdirSync, chmodSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Compile the requested Mac architecture on a Mac; Windows runs its bundled PowerShell backend. */
export async function buildComputerUse({ platform = process.platform, arch = process.arch, root = resolve(dirname(fileURLToPath(import.meta.url)), '../resources/plugins/computer-use'), run = execFileSync } = {}) {
  if (platform !== 'darwin') return
  if (!['arm64', 'x64'].includes(arch)) throw new Error(`Unsupported macOS computer-use architecture: ${arch}`)
  if (process.platform !== 'darwin' && run === execFileSync) throw new Error('Build the macOS computer-use helpers on macOS with Xcode Command Line Tools installed.')
  const mac = join(root, 'macos'), out = join(mac, 'plugin/bin')
  mkdirSync(out, { recursive: true })
  for (const [name, source, frameworks] of [
    ['dsh-cu', 'tools/dsh-cu.swift', ['AppKit', 'ApplicationServices', 'Vision']],
    ['dsh-cursor-overlay', 'cursor/cursor-overlay.swift', ['AppKit', 'QuartzCore']],
  ]) {
    const binary = join(out, name)
    run('/usr/bin/xcrun', ['swiftc', '-O', '-target', `${arch === 'x64' ? 'x86_64' : arch}-apple-macos11.0`, '-o', binary, join(mac, source), ...frameworks.flatMap(value => ['-framework', value])], { stdio: 'inherit' })
    run('/usr/bin/codesign', ['--force', '--sign', '-', binary], { stdio: 'inherit' })
    chmodSync(binary, 0o755)
  }
}
