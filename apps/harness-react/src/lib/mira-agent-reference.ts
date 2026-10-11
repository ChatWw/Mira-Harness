import { MIRA_SUBTASK_AGENTS } from '../../../../src/config/miraAgents'
import type { HarnessSubtaskRole } from '../../../../src/config/harness'
import type { MiraPromptDocument, MiraPromptPart, MiraPromptReference } from './prompt-editor-document'

/** An @role is an ordinary user request, never an execution or permission grant. */
export function miraAgentReference(role: HarnessSubtaskRole): MiraPromptReference {
  return { id: crypto.randomUUID(), kind: 'agent', label: MIRA_SUBTASK_AGENTS[role].label, value: role, text: `@${role}` }
}

/** Rebuild the same hint after queue withdrawal/message editing without changing text or config. */
export function restoreMiraAgentReferences(document: MiraPromptDocument): MiraPromptDocument {
  return { version: 1, parts: document.parts.flatMap((part): MiraPromptPart[] => {
    if (part.type !== 'text') return [part]
    const parts: MiraPromptPart[] = []
    let offset = 0
    for (const match of part.text.matchAll(/(^|[\s，。！？、])@(explorer|reviewer|tester|implementer)(?=$|[\s，。！？、])/g)) {
      const start = match.index! + match[1].length, role = match[2] as HarnessSubtaskRole
      if (start > offset) parts.push({ type: 'text', text: part.text.slice(offset, start) })
      parts.push({ type: 'reference', reference: { ...miraAgentReference(role), id: `mira-agent-${start}` } })
      offset = start + role.length + 1
    }
    if (offset < part.text.length) parts.push({ type: 'text', text: part.text.slice(offset) })
    return parts
  }) }
}
