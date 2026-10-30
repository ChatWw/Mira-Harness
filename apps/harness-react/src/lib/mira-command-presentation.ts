import type { HarnessSession, ToolCallRecord } from '../../../../src/config/harness'

export type MiraExplorationKind = 'read' | 'list' | 'search'

/** The public input has a truncation flag; target provides a display label when input is truncated. */
export function miraCompleteCommand(tool: ToolCallRecord): string | undefined {
  if (tool.tool !== 'bash' || !tool.input || tool.input.truncated) return undefined
  try {
    const input = JSON.parse(tool.input.text)
    return typeof input?.command === 'string' && input.command.trim() ? input.command : undefined
  } catch { return undefined }
}

export function miraRecordedCommand(tool: ToolCallRecord) { return miraCompleteCommand(tool) ?? tool.target }

/** Presentation only: a successful launch can still own a running or failed process. */
export function miraCommandExecutionStatus(tool: ToolCallRecord): ToolCallRecord['status'] {
  const job = tool.tool === 'bash' && !tool.inherited ? tool.commandJob : undefined
  return !job ? tool.status : job.status === 'running' ? 'running' : job.status === 'completed' ? 'ok' : job.status === 'failed' ? 'failed' : 'cancelled'
}

/** Never replace a missing execution with a newer command or a provider call ID. */
export function miraSessionCommand(session: HarnessSession | undefined, sessionId: string, runId: string, toolId: string) {
  if (session?.id !== sessionId) return undefined
  const matches = session.toolCalls.filter(tool => tool.tool === 'bash' && tool.runId === runId && tool.id === toolId)
  return matches.length === 1 ? matches[0] : undefined
}

/** Display semantics only, never an authorization or shell execution policy. */
function staticCommandSegments(command: string): string[][] | undefined {
  const source = command.trim()
  const segments: string[][] = [], words: string[] = []
  let word = '', quote = '', hasWord = false
  const finishWord = () => { if (hasWord) { words.push(word); word = ''; hasWord = false } }
  for (let index = 0; index < source.length; index++) {
    const char = source[index]!
    if (quote === "'") { if (char === quote) quote = ''; else word += char; continue }
    if (char === '\\') return undefined
    if (char === '$' || char === '`' || char === '\0') return undefined
    if (quote) { if (char === quote) quote = ''; else word += char; continue }
    if (char === "'" || char === '"') { quote = char; hasWord = true; continue }
    if ('><(){}#!'.includes(char)) return undefined
    if (char === '&' || char === '|' || char === ';' || char === '\n') {
      if (char === '&' && source[index + 1] !== '&') return undefined
      if ((char === '&' || char === '|') && source[index + 1] === char) index++
      finishWord()
      if (!words.length) return undefined
      segments.push(words.splice(0)); continue
    }
    if (/\s/.test(char)) finishWord()
    else { word += char; hasWord = true }
  }
  if (quote) return undefined
  finishWord()
  return words.length ? [...segments, words] : undefined
}

function segmentKind([name, ...args]: string[]): MiraExplorationKind | undefined {
  if (name === 'ls' || name === 'pwd') return 'list'
  if (['cat', 'head', 'tail', 'wc'].includes(name!)) return 'read'
  if (name === 'rg') {
    if (args.some(arg => /^--(?:pre|pre-glob|hostname-bin)(?:=|$)/.test(arg))) return undefined
    return args.includes('--files') ? 'list' : 'search'
  }
  if (name === 'grep') return 'search'
  if (name === 'sed') {
    // Only the common line-print form is recognized; scripts and in-place flags remain execution.
    let index = args[0] === '-n' ? 1 : 0
    if (args[index] === '-e') index++
    if (!/^\d+(?:,\d+|,\$)?p$/.test(args[index] ?? '')) return undefined
    return args.slice(index + 1).every(arg => !arg.startsWith('-')) ? 'read' : undefined
  }
  if (name === 'git') {
    const subcommand = args[0] === '--no-pager' ? args[1] : args[0]
    if (subcommand === 'status' || subcommand === 'ls-files') return 'list'
  }
  return undefined
}

export function miraCommandExplorationKind(tool: ToolCallRecord): MiraExplorationKind | undefined {
  const command = miraCompleteCommand(tool)
  const segments = command && staticCommandSegments(command)
  if (!segments) return undefined
  const kinds = segments.map(segmentKind)
  if (kinds.some(kind => kind === undefined)) return undefined
  // Like the upstream explorer, count one bucket per public tool call, not per shell segment.
  return kinds.includes('search') ? 'search' : kinds.includes('list') ? 'list' : 'read'
}
