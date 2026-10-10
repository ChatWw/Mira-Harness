// Adapted from ZCode ToolCallBlocks/ToolLayout.tsx (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd. Mira scopes in-memory open state to its own sessions.
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export class MiraConversationDetailMemory {
  private sessions = new Map<string, Set<string>>()

  isOpen(scope: string, key: string) { return this.sessions.get(scope)?.has(key) ?? false }

  setOpen(scope: string, key: string, open: boolean) {
    const entries = this.sessions.get(scope) ?? new Set<string>()
    if (open) entries.add(key)
    else entries.delete(key)
    this.sessions.delete(scope)
    if (entries.size) this.sessions.set(scope, entries)
    // Match the conversation scroll memory's recent-session bound.
    while (this.sessions.size > 200) this.sessions.delete(this.sessions.keys().next().value!)
  }
}

const DetailContext = createContext<{ memory: MiraConversationDetailMemory; scope: string; directory?: string } | null>(null)

export function MiraConversationDetails({ memory, scope, directory, children }: { memory: MiraConversationDetailMemory; scope: string; directory?: string; children: ReactNode }) {
  const value = useMemo(() => ({ memory, scope, directory }), [memory, scope, directory])
  return <DetailContext.Provider value={value}>{children}</DetailContext.Provider>
}

/** Display conversion only; the host still resolves symlinks and authorizes the read. */
export function miraToolRelativePath(target: string | undefined, directory?: string) {
  if (!target || target.includes('\0')) return undefined
  const windows = Boolean(directory && (/^[a-z]:[\\/]/i.test(directory) || directory.startsWith('\\\\')))
  if (!windows && target.includes('\\')) return undefined
  let path = windows ? target.replace(/\\/g, '/') : target
  const absolute = path.startsWith('/') || /^[a-z]:/i.test(path)
  if (absolute) {
    if (!directory) return undefined
    const root = (windows ? directory.replace(/\\/g, '/') : directory).replace(/\/+$/, '') + '/'
    const matches = windows ? path.toLowerCase().startsWith(root.toLowerCase()) : path.startsWith(root)
    if (!matches) return undefined
    path = path.slice(root.length)
  }
  const segments: string[] = []
  for (const segment of path.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') { if (!segments.length) return undefined; segments.pop() }
    else if (segment.includes(':')) return undefined
    else segments.push(segment)
  }
  return segments.length ? segments.join('/') : undefined
}

export function useMiraToolFilePath(target: string | undefined) {
  return miraToolRelativePath(target, useContext(DetailContext)?.directory)
}

export function useMiraConversationDetail(key: string) {
  const context = useContext(DetailContext)
  const identity = JSON.stringify([context?.scope, key])
  const saved = () => context?.memory.isOpen(context.scope, key) ?? false
  const [state, setState] = useState(() => ({ identity, open: saved() }))
  const open = state.identity === identity ? state.open : saved()
  return [open, (next: boolean) => {
    context?.memory.setOpen(context.scope, key, next)
    setState(previous => previous.identity === identity && previous.open === next ? previous : { identity, open: next })
  }] as const
}
