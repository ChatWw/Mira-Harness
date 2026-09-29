import { chmod, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin') process.exit(0)

const root = new URL('../node_modules/node-pty/prebuilds/', import.meta.url)
let entries
try {
  entries = await readdir(root, { withFileTypes: true })
} catch {
  process.exit(0)
}

for (const entry of entries) {
  if (!entry.isDirectory() || !entry.name.startsWith('darwin-')) continue
  const helper = join(fileURLToPath(root), entry.name, 'spawn-helper')
  try {
    if ((await stat(helper)).isFile()) await chmod(helper, 0o755)
  } catch {
    // A platform-specific prebuild may not include the Unix helper.
  }
}
