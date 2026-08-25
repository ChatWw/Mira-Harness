import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export class MiraPaths {
  readonly root: string
  readonly config: string
  readonly sessions: string
  readonly attachments: string
  readonly trash: string
  readonly memories: string
  readonly logs: string
  readonly skills: string

  constructor(home: string) {
    this.root = join(home, '.mira')
    this.config = join(this.root, 'config')
    this.sessions = join(this.root, 'sessions')
    this.attachments = join(this.root, 'attachments')
    this.trash = join(this.root, 'trash')
    this.memories = join(this.root, 'memories')
    this.logs = join(this.root, 'logs')
    this.skills = join(this.root, 'skills')
  }

  stateDatabase() { return join(this.root, 'state.sqlite') }
  globalAgents() { return join(this.root, 'AGENTS.md') }
  memorySettings() { return join(this.memories, 'settings.json') }
  globalMemory() { return join(this.memories, 'MEMORY.md') }
  projectMemory(projectId: string) { return join(this.memories, 'projects', projectId, 'MEMORY.md') }
  agentsFile(directory: string) { return join(directory, 'AGENTS.md') }
  agentsOverrideFile(directory: string) { return join(directory, 'AGENTS.override.md') }
  modelsConfig() { return join(this.config, 'models.json') }
  mcpConfig() { return join(this.config, 'mcp-servers.json') }
  skillSettings() { return join(this.config, 'skills.json') }
  session(id: string) { return join(this.sessions, `${id}.json`) }
  projectTrash(projectId: string) { return join(this.trash, projectId) }

  ensure() {
    [this.root, this.config, this.sessions, this.attachments, this.trash, this.memories, this.logs, this.skills]
      .forEach(path => mkdirSync(path, { recursive: true }))
    if (!existsSync(this.globalAgents())) writeFileSync(this.globalAgents(), '', 'utf8')
    return this
  }
}
