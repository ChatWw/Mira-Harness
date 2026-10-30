import { isMiraPluginId, parseMiraPluginInvocation } from '../../../../src/config/miraPlugins'
import type { MiraPromptDocument, MiraPromptPart, MiraPromptReference } from './prompt-editor-document'

/** Command chips insert invocation text; only the host expands their instructions. */
export function miraPluginCommandReference(name: string): MiraPromptReference {
  const invocation = parseMiraPluginInvocation(`/${name}`)
  if (!invocation || invocation.args) throw new Error('插件命令名称无效')
  return { id: crypto.randomUUID(), kind: 'command', label: `/${invocation.name}`, value: invocation.name, text: `/${invocation.name}` }
}

export function restoreMiraPluginCommand(document: MiraPromptDocument): MiraPromptDocument {
  const first = document.parts[0]
  if (first?.type !== 'text') return document
  const builtin = /^(\s*)\/(goal|workflow)(?=\s|$)/.exec(first.text)
  if (builtin) {
    const reference: MiraPromptReference = { id: `mira-command-${builtin[1].length}`, kind: 'command', label: builtin[2] === 'goal' ? '持续目标' : '工作流', value: `builtin:${builtin[2]}`, text: `/${builtin[2]}` }
    return { version: 1, parts: [...(builtin[1] ? [{ type: 'text' as const, text: builtin[1] }] : []), { type: 'reference', reference }, ...(first.text.length > builtin[0].length ? [{ type: 'text' as const, text: first.text.slice(builtin[0].length) }] : []), ...document.parts.slice(1)] }
  }
  const match = /^(\s*)(\/[a-z0-9][a-z0-9._-]*(?::[a-z0-9][a-z0-9._-]*)+)(?=\s|$)/i.exec(first.text)
  if (!match || !parseMiraPluginInvocation(match[2])) return document
  const reference = miraPluginCommandReference(match[2].slice(1))
  reference.text = match[2] // Preserve user casing and exact canonical text through withdrawal/reload.
  return { version: 1, parts: [...(match[1] ? [{ type: 'text' as const, text: match[1] }] : []), { type: 'reference', reference }, ...(first.text.length > match[0].length ? [{ type: 'text' as const, text: first.text.slice(match[0].length) }] : []), ...document.parts.slice(1)] }
}

export function miraPluginReference(id: string, label: string, pluginIcon?: string): MiraPromptReference {
  if (!isMiraPluginId(id)) throw new Error('插件身份无效')
  const escaped = label.replace(/([\\\[\]])/g, '\\$1').replace(/[\r\n]/g, ' ')
  return { id: crypto.randomUUID(), kind: 'plugin', label, ...(pluginIcon ? { pluginIcon } : {}), value: id, text: `[@${escaped}](plugin://${id})` }
}

export function restoreMiraPluginReferences(document: MiraPromptDocument, ids?: string[]): MiraPromptDocument {
  return { version: 1, parts: document.parts.flatMap((part): MiraPromptPart[] => {
    if (part.type !== 'text') return [part]
    const parts: MiraPromptPart[] = []
    let offset = 0
    for (const match of part.text.matchAll(/\[@((?:\\.|[^\\\]\r\n])+)\]\(plugin:\/\/([A-Za-z0-9._-]+@[A-Za-z0-9._-]+)\)/g)) {
      if (!isMiraPluginId(match[2]) || ids && !ids.includes(match[2])) continue
      if (match.index! > offset) parts.push({ type: 'text', text: part.text.slice(offset, match.index) })
      parts.push({ type: 'reference', reference: { id: `mira-plugin-${match.index}`, kind: 'plugin', label: match[1].replace(/\\(.)/g, '$1'), value: match[2], text: match[0] } })
      offset = match.index! + match[0].length
    }
    if (offset < part.text.length) parts.push({ type: 'text', text: part.text.slice(offset) })
    return parts
  }) }
}
