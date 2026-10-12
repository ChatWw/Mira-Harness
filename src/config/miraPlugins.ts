import type { MiraHookConfig } from './miraHooks'

/** Plugin identity is independent of a translated label or an individual Skill. */
export interface MiraPluginSkill { name: string; description: string; path: string }
export interface MiraPluginCommand { name: string; description: string; argumentHint?: string; path: string; unavailableReason?: string }
export interface MiraPluginAgent { name: string; description: string; path: string; tools?: string[]; disallowedTools?: string[]; mcpServers?: string[]; unavailableReason?: string }
export interface MiraPluginMcpServer {
  id: string; key: string; name: string; revision: string
  type?: import('./miraMcp').MiraMcpTransport
  enabled: boolean; unavailableReason?: string
}
export interface MiraPluginHook extends MiraHookConfig {
  id: string; revision: string; sourcePath: string
  enabled: boolean; args: string[]; timeout: number; async: boolean
  unavailableReason?: string
}
/** Host-resolved declaration only; availability does not grant Hook execution trust. */
export interface MiraPluginHookInput extends MiraPluginHook { pluginId: string; pluginName: string; sourceRoot: string }
/** Host-resolved child instructions and capability limits; references never grant permissions. */
export interface MiraPluginAgentInput {
  pluginId: string; name: string; sourceRoot: string; path: string; body: string
  tools?: string[]; disallowedTools?: string[]
  mcpServers?: string[]
}
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
  agents?: MiraPluginAgent[]
  mcpServers?: MiraPluginMcpServer[]
  hooks?: MiraPluginHook[]
  hookDiagnostics?: string[]
  unsupported: string[]
}
export interface MiraPluginItem extends Omit<MiraPluginSnapshot, 'root' | 'skills' | 'commands' | 'agents'> {
  skills: Array<Pick<MiraPluginSkill, 'name' | 'description'>>
  commands?: Array<Omit<MiraPluginCommand, 'path'>>
  agents?: Array<Omit<MiraPluginAgent, 'path'>>
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
  return plugins.map(({ root: _root, skills, commands, agents, ...plugin }) => ({ ...plugin,
    skills: skills.map(({ name, description }) => ({ name, description })),
    ...(commands ? { commands: commands.map(({ path: _path, ...command }) => command) } : {}),
    ...(agents ? { agents: agents.map(({ path: _path, ...agent }) => agent) } : {}),
    conflicts: plugin.enabled ? plugins.filter(other => other.enabled && other.name === plugin.name && other.id !== plugin.id).map(other => other.id) : [],
  }))
}

/** Only a leading, unquoted, namespaced slash invocation is a plugin command. */
export function parseMiraPluginInvocation(text: string) {
  const match = /^\/([a-z0-9][a-z0-9._-]*(?::[a-z0-9][a-z0-9._-]*)+)(?:\s+([\s\S]*))?$/i.exec(text.trim())
  return match && match[1].length <= 256 ? { name: match[1].toLowerCase(), args: match[2]?.trim() || '' } : undefined
}
