/** Plugin identity is independent of a translated label or an individual Skill. */
export interface MiraPluginSkill { name: string; description: string; path: string }
export interface MiraPluginCommand { name: string; description: string; argumentHint?: string; path: string; unavailableReason?: string }
/** Host-resolved input; never accepted as a renderer-supplied prompt or permission grant. */
export interface MiraPluginCommandInput {
  pluginId: string; name: string; sourceRoot: string; prompt: string
  shellParts?: Array<{ text: string } | { command: string }>
  expandedPrompt?: string
  expansionStatus?: 'running' | 'complete' | 'failed'
}
export interface MiraPluginSnapshot {
  id: string
  name: string
  description: string
  version?: string
  root: string
  enabled: boolean
  skills: MiraPluginSkill[]
  commands?: MiraPluginCommand[]
  unsupported: string[]
}
export interface MiraPluginItem extends Omit<MiraPluginSnapshot, 'root' | 'skills' | 'commands'> {
  skills: Array<Pick<MiraPluginSkill, 'name' | 'description'>>
  commands?: Array<Omit<MiraPluginCommand, 'path'>>
  conflicts: string[]
  error?: string
}
export interface MiraPluginMarketItem {
  id: string
  name: string
  description: string
  marketplace: string
  sourceName: string
  repositoryUrl: string
  commit: string
  skills: Array<Pick<MiraPluginSkill, 'name' | 'description'>>
  unsupported: string[]
  installed: boolean
  enabled: boolean
  unavailableReason?: string
}
export interface MiraPluginMarketDetail extends MiraPluginMarketItem {
  files: Array<{ path: string; size: number }>
  totalBytes: number
  licenses: Array<{ path: string; text: string }>
}
export interface MiraPluginMarketCatalog {
  sourceName: string
  items: MiraPluginMarketItem[]
}
export const isMiraPluginId = (id: string) => id.length <= 256 && /^[A-Za-z0-9][A-Za-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)

export function miraPluginItems(plugins: MiraPluginSnapshot[]): MiraPluginItem[] {
  return plugins.map(({ root: _root, skills, commands, ...plugin }) => ({ ...plugin,
    skills: skills.map(({ name, description }) => ({ name, description })),
    ...(commands ? { commands: commands.map(({ path: _path, ...command }) => command) } : {}),
    conflicts: plugin.enabled ? plugins.filter(other => other.enabled && other.name === plugin.name && other.id !== plugin.id).map(other => other.id) : [],
  }))
}

/** Only a leading, unquoted, namespaced slash invocation is a plugin command. */
export function parseMiraPluginInvocation(text: string) {
  const match = /^\/([a-z0-9][a-z0-9._-]*(?::[a-z0-9][a-z0-9._-]*)+)(?:\s+([\s\S]*))?$/i.exec(text.trim())
  return match && match[1].length <= 256 ? { name: match[1].toLowerCase(), args: match[2]?.trim() || '' } : undefined
}
