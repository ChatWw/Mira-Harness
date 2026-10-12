import type { ModelSelection } from './harness'

export type MiraUserAgentScope = 'global' | 'project'
export type MiraUserAgentColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange' | 'pink' | 'cyan'

/** Public identity and capability metadata; host instructions and paths are never catalog fields. */
export interface MiraUserAgentItem {
  id: string
  scope: MiraUserAgentScope
  name: string
  description: string
  enabled: boolean
  revision: string
  tools?: string[]
  disallowedTools?: string[]
  mcpServers?: string[]
  modelSelection?: ModelSelection
  injectAgentsMd?: boolean
  color?: MiraUserAgentColor
  shadowed?: boolean
  unavailableReason?: string
}
export interface MiraUserAgentDocument { agent: MiraUserAgentItem; source: string }
export interface MiraUserAgentWrite {
  scope: MiraUserAgentScope; name: string; source: string; expectedRevision?: string
}
export interface MiraUserAgentDelete { scope: MiraUserAgentScope; name: string; expectedRevision: string }
export interface MiraUserAgentEnabled extends MiraUserAgentDelete { enabled: boolean }

/** Host-frozen instructions; a user @reference itself does not execute or authorize tools. */
export interface MiraUserAgentInput {
  id: string; scope: MiraUserAgentScope; name: string; revision: string
  sourceRoot: string; path: string; body: string
  tools?: string[]; disallowedTools?: string[]
  mcpServers?: string[]
  modelSelection?: ModelSelection; injectAgentsMd?: boolean; color?: MiraUserAgentColor
}

export const MIRA_RESERVED_USER_AGENTS = ['explorer', 'reviewer', 'tester', 'implementer'] as const
export const isMiraUserAgentName = (name: string) => /^[a-z0-9][a-z0-9-]{2,49}$/.test(name)
