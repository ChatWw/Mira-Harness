import { MIRA_SUBTASK_AGENTS } from '../../../../src/config/miraAgents'
import type { HarnessSubtaskRole } from '../../../../src/config/harness'
import { isMiraUserAgentName, MIRA_RESERVED_USER_AGENTS } from '../../../../src/config/miraUserAgents'
import type { MiraPromptDocument, MiraPromptPart, MiraPromptReference } from './prompt-editor-document'

/** An @role is an ordinary user request, never an execution or permission grant. */
export function miraAgentReference(role: HarnessSubtaskRole): MiraPromptReference {
  return { id: crypto.randomUUID(), kind: 'agent', label: MIRA_SUBTASK_AGENTS[role].label, value: role, text: `@${role}` }
}

export function miraPluginAgentReference(name: string): MiraPromptReference {
  if (name.length > 256 || !/^[a-z0-9][a-z0-9._-]*(?::[a-z0-9][a-z0-9._-]*)+$/i.test(name)) throw new Error('插件智能体名称无效')
  return { id: crypto.randomUUID(), kind: 'agent', label: name, value: name.toLowerCase(), text: `@${name}` }
}

export function miraUserAgentReference(name: string): MiraPromptReference {
  if (!isMiraUserAgentName(name) || MIRA_RESERVED_USER_AGENTS.some(role => role === name)) throw new Error('自定义智能体名称无效')
  return { id: crypto.randomUUID(), kind: 'agent', label: name, value: name, text: `@${name}` }
}

/** Rebuild the same hint after queue withdrawal/message editing without changing text or config. */
export function restoreMiraAgentReferences(document: MiraPromptDocument, userAgentNames: readonly string[] = []): MiraPromptDocument {
  return { version: 1, parts: document.parts.flatMap((part): MiraPromptPart[] => {
    if (part.type !== 'text') return [part]
    const parts: MiraPromptPart[] = []
    let offset = 0
    for (const match of part.text.matchAll(/(^|[\s，。！？、])@([a-zA-Z0-9][a-zA-Z0-9._-]*(?::[a-zA-Z0-9][a-zA-Z0-9._-]*)*)(?=$|[\s，。！？、])/g)) {
      const start = match.index! + match[1].length, name = match[2]
      if (name.length > 256) continue
      const builtin = Object.prototype.hasOwnProperty.call(MIRA_SUBTASK_AGENTS, name)
      if (!builtin && !name.includes(':') && (!isMiraUserAgentName(name) || !userAgentNames.includes(name))) continue
      if (start > offset) parts.push({ type: 'text', text: part.text.slice(offset, start) })
      const reference = name.includes(':') ? miraPluginAgentReference(name) : builtin ? miraAgentReference(name as HarnessSubtaskRole) : miraUserAgentReference(name)
      parts.push({ type: 'reference', reference: { ...reference, id: `mira-agent-${start}` } })
      offset = start + name.length + 1
    }
    if (offset < part.text.length) parts.push({ type: 'text', text: part.text.slice(offset) })
    return parts
  }) }
}
