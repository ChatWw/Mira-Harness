import { Bot, Goal, MessagesSquare, ScrollText, SquareSlash, WandSparkles, Workflow, Wrench } from 'lucide-react'
import { MiraPluginAvatar } from '../extensions/MiraPluginAvatar'
import { miraFileTreeIcon } from '../../lib/mira-file-tree-icon'
import type { MiraPromptReference } from '../../lib/prompt-editor-document'

/** Sent messages use actual icon elements; Lexical tokens retain their text-only DOM. */
export function MiraMessageReference({ reference }: { reference: MiraPromptReference }) {
  const command = reference.value.replace(/^builtin:/, '')
  const Icon = reference.kind === 'skill' ? WandSparkles : reference.kind === 'agent' ? Bot : reference.kind === 'session' ? MessagesSquare : reference.kind === 'mcp' ? Wrench : command === 'goal' ? Goal : command === 'workflow' ? Workflow : command === 'compact' ? ScrollText : SquareSlash
  const title = reference.kind === 'agent' ? `${reference.label}智能体（${reference.text}）` : reference.kind === 'command' ? reference.text : reference.label
  return <span className={`mira-prompt-reference mira-prompt-reference-${reference.kind} mira-message-reference`} title={title}>
    {reference.kind === 'plugin' ? <MiraPluginAvatar item={{ name: reference.value.split('@')[0], ...(reference.pluginIcon ? { listing: { icon: reference.pluginIcon } } : {}) }} /> : reference.kind === 'file' ? <img src={miraFileTreeIcon(reference.value)} width={14} height={14} alt="" aria-hidden="true" draggable={false} /> : <Icon size={14} strokeWidth={1.5} aria-hidden="true" />}
    {reference.label}
  </span>
}
