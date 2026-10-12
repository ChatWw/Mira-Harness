export type MiraPromptCommandScope = 'global' | 'project'

/** Public metadata; source text and absolute host paths stay outside the catalog. */
export interface MiraPromptCommandItem {
  id: string
  scope: MiraPromptCommandScope
  name: string
  description: string
  argumentHint?: string
  revision: string
  shadowed?: boolean
  unavailableReason?: string
}

export interface MiraPromptCommandDocument { command: MiraPromptCommandItem; source: string }
export interface MiraPromptCommandWrite {
  scope: MiraPromptCommandScope
  name: string
  source: string
  /** Missing means create; existing commands require their last read revision. */
  expectedRevision?: string
}
export interface MiraPromptCommandDelete { scope: MiraPromptCommandScope; name: string; expectedRevision: string }

/** Frozen host input; the renderer cannot choose a path, prompt or executable segment. */
export interface MiraPromptCommandInput {
  id: string
  scope: MiraPromptCommandScope
  name: string
  revision: string
  sourceRoot: string
  path: string
  prompt: string
  shellParts?: Array<{ text: string } | { command: string }>
  expandedPrompt?: string
  expansionStatus?: 'running' | 'complete' | 'failed'
}

export const MIRA_RESERVED_PROMPT_COMMANDS = ['files', 'skills', 'mcp', 'model', 'compact', 'thinking', 'plan', 'side', 'delegation', 'memory', 'perm', 'goal', 'target', 'workflow'] as const

/** A custom command must occupy the leading, unquoted user input. */
export function parseMiraPromptCommandInvocation(text: string) {
  const match = /^\/([a-z0-9][a-z0-9._-]*(?:(?::|\/)[a-z0-9][a-z0-9._-]*)*)(?:\s+([\s\S]*))?$/i.exec(text.trim())
  return match && match[1].length <= 256 ? { name: match[1].replace(/\//g, ':').toLowerCase(), args: match[2]?.trim() || '' } : undefined
}
