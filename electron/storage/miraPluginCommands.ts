import { parse as parseYaml } from 'yaml'
import type { MiraPluginCommandInput } from '../../src/config/miraPlugins'

export function parseMiraPluginCommand(source: string) {
  let body = source.trim(), metadata: Record<string, unknown> = {}, unavailableReason: string | undefined
  const header = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/.exec(body)
  try {
    if (header) {
      const value = parseYaml(header[1], { maxAliasCount: 0 })
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
      metadata = value; body = body.slice(header[0].length).trim()
    } else if (body.startsWith('---')) throw new Error()
    for (const key of ['description', 'argument-hint', 'model']) if (metadata[key] !== undefined && typeof metadata[key] !== 'string') throw new Error()
    if (metadata['disable-noninteractive'] !== undefined && typeof metadata['disable-noninteractive'] !== 'boolean') throw new Error()
    const unknown = Object.keys(metadata).filter(key => !['description', 'argument-hint', 'skills', 'model', 'allowed-tools', 'disable-noninteractive'].includes(key))
    if (unknown.length) unavailableReason = `命令元数据 ${unknown.join('、')} 尚未支持`
    if (metadata.model) unavailableReason = '此命令要求覆盖模型，Mira 尚未接入'
    if (metadata['allowed-tools']) unavailableReason = '此命令要求限定工具，Mira 尚未接入'
    if (/\$\{(?:CLAUDE|ZCODE|MIRA)_(?!PLUGIN_ROOT\})[A-Z_]+\}/.test(body)) unavailableReason = '此命令使用尚未支持的上下文变量'
  } catch { unavailableReason = '命令 YAML 元数据无效，请修正后重试' }
  const skills = Array.isArray(metadata.skills) ? metadata.skills : typeof metadata.skills === 'string' ? metadata.skills.split(',').map(name => name.trim()).filter(Boolean) : []
  if (skills.length > 64 || skills.some(name => typeof name !== 'string' || !/^[a-z0-9][a-z0-9._:-]*$/i.test(name))) unavailableReason = '命令 skills 元数据无效'
  if (metadata.skills !== undefined && !Array.isArray(metadata.skills) && typeof metadata.skills !== 'string') unavailableReason = '命令 skills 元数据无效'
  if (!body) unavailableReason = '命令正文为空'
  return { body, description: typeof metadata.description === 'string' ? metadata.description.trim().slice(0, 1024) : body.replace(/\s+/g, ' ').slice(0, 240), argumentHint: typeof metadata['argument-hint'] === 'string' ? metadata['argument-hint'].trim().slice(0, 256) : undefined, skills: skills as string[], disableNonInteractive: metadata['disable-noninteractive'] === true, unavailableReason }
}

function commandArguments(value: string) {
  const result: string[] = []
  let word = '', quote = '', escaped = false, started = false
  for (const char of value) {
    if (escaped) { word += char; escaped = false; started = true }
    else if (char === '\\') { escaped = true; started = true }
    else if (quote) { if (char === quote) quote = ''; else word += char }
    else if (char === '"' || char === "'") { quote = char; started = true }
    else if (/\s/.test(char)) { if (started) result.push(word); word = ''; started = false }
    else { word += char; started = true }
  }
  if (escaped) word += '\\'
  if (quote) throw new Error('命令参数的引号未闭合，请修正后重新发送')
  if (started) result.push(word)
  return result
}

export function prepareMiraPluginCommand(name: string, body: string, args: string, root: string, skills: string[]): Pick<MiraPluginCommandInput, 'prompt' | 'shellParts'> {
  const positional = commandArguments(args)
  // One pass over the template: argument text containing $1 or $ARGUMENTS is literal.
  const substitute = (template: string) => template.replace(/\$(ARGUMENTS|\d+)|\$\{(?:MIRA|CLAUDE|ZCODE)_PLUGIN_ROOT\}/g, (_token, index: string | undefined) => {
    if (!index) return root
    return index === 'ARGUMENTS' ? args : positional[Number(index) - 1] || ''
  })
  const suffix = args && !/\$(ARGUMENTS|\d+)/.test(body) ? `\n\nUser arguments:\n${args}` : ''
  const prefix = [`Run custom command /${name}.`, 'Command source: user/plugin.', ...(skills.length ? [`Required skills: ${skills.join(', ')}. Load them with load_plugin_skill before following the command.`] : []), 'Normal tool permissions and approvals still apply.', '', ''].join('\n')
  const prompt = prefix + substitute(body) + suffix
  if (prompt.length > 100_000) throw new Error('命令展开后超过 100000 字符，请缩短参数或命令正文')
  // Identify executable syntax before substitution. Arguments cannot create additional segments.
  const shellParts: NonNullable<MiraPluginCommandInput['shellParts']> = []
  let cursor = 0
  for (const match of body.matchAll(/```!\s*\r?\n?([\s\S]*?)```|!`([^`]*)`/g)) {
    shellParts.push({ text: (cursor === 0 ? prefix : '') + substitute(body.slice(cursor, match.index)) })
    shellParts.push({ command: substitute((match[1] ?? match[2] ?? '').trim()) })
    cursor = match.index + match[0].length
  }
  if (!shellParts.length) return { prompt }
  shellParts.push({ text: substitute(body.slice(cursor)) + suffix })
  return { prompt, shellParts }
}

export function expandMiraPluginCommand(name: string, body: string, args: string, root: string, skills: string[]) {
  return prepareMiraPluginCommand(name, body, args, root, skills).prompt
}
