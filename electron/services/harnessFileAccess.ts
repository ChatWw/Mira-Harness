import { lstatSync, readlinkSync, realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'

/** Resolve existing ancestors too, so a new file behind a junction is external. */
export function harnessFileIdentity(path: string, depth = 0): string {
  if (depth > 40) throw new Error('文件路径包含循环链接')
  const target = resolve(path)
  let info
  try { info = lstatSync(target) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    const parent = dirname(target)
    if (parent === target) throw error
    return resolve(harnessFileIdentity(parent, depth + 1), basename(target))
  }
  if (info.isSymbolicLink()) return harnessFileIdentity(resolve(dirname(target), readlinkSync(target)), depth + 1)
  return realpathSync(target)
}

export function harnessPathInside(root: string, target: string) {
  const child = relative(root, target)
  return child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child)
}
