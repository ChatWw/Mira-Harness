import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { MiraPaths } from './miraPaths'

export interface MiraInstructionLayer {
  path: string
  content: string
}

function readText(path: string) {
  try {
    return existsSync(path) ? readFileSync(path, 'utf8') : ''
  } catch (error) {
    console.warn(`[Mira] 无法读取指令文件：${path}`, error)
    return ''
  }
}

function parentDirectories(directory: string) {
  const result: string[] = []
  let current = resolve(directory)
  while (true) {
    result.push(current)
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return result.reverse()
}

export class InstructionStore {
  constructor(private readonly paths: MiraPaths) {}

  readGlobal() {
    this.paths.ensure()
    return readText(this.paths.globalAgents())
  }

  saveGlobal(content: string) {
    this.paths.ensure()
    const target = this.paths.globalAgents()
    const temporary = `${target}.${randomUUID()}.tmp`
    writeFileSync(temporary, content, 'utf8')
    renameSync(temporary, target)
    return content
  }

  resolve(directory?: string): MiraInstructionLayer[] {
    const layers: MiraInstructionLayer[] = []
    const seen = new Set<string>()
    const add = (path: string) => {
      if (seen.has(path)) return
      const content = readText(path)
      seen.add(path)
      if (content.trim()) layers.push({ path, content })
    }

    add(this.paths.globalAgents())
    if (directory) {
      for (const current of parentDirectories(directory)) {
        add(this.paths.agentsFile(current))
        add(this.paths.agentsOverrideFile(current))
      }
    }
    return layers
  }
}
