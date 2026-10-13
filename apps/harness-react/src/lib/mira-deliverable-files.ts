// File-reference deliverables adapted from ZCode assistantFileReferences/PreviewCards.
// Copyright 2026 Z.AI Co., Ltd. Apache-2.0. Mira validates within the task workspace.
import type { HarnessFileChange } from '../../../../src/config/harness'

export function miraDeliverablePaths(content: string, changes: HarnessFileChange[], directory: string) {
  const candidates = changes.filter(change => change.tool !== 'delete').map(change => change.path)
  const plain = content.replace(/\[[^\]\n]*\]\(([^)\n]+)\)|`([^`\n]+)`/g, (_match, link: string, code: string) => { candidates.push(link || code); return ' ' })
  for (const match of plain.matchAll(/(?:^|[\s，。；;：:（(])([^\s`<>"'\[\]()，。；;）]+\.pptx)(?=$|[\s，。；;）)])/gim)) candidates.push(match[1])
  const root = directory.replace(/\\/g, '/').replace(/\/$/, '')
  return [...new Set(candidates.flatMap(candidate => {
    let path = candidate.trim().replace(/^<|>$/g, '')
    if (/^file:\/\//i.test(path)) {
      try { const url = new URL(path); if (url.hostname && url.hostname !== 'localhost') return []; path = decodeURIComponent(url.pathname); if (/^\/[a-z]:\//i.test(path)) path = path.slice(1) } catch { return [] }
    } else { try { path = decodeURIComponent(path) } catch { return [] } }
    path = path.replace(/\\/g, '/')
    if (/^[a-z]+:/i.test(path) && !/^[a-z]:\//i.test(path)) return []
    if (path.startsWith('/') || /^[a-z]:\//i.test(path)) {
      const windows = /^[a-z]:\//i.test(root)
      if (!(windows ? path.toLowerCase() : path).startsWith((windows ? root.toLowerCase() : root) + '/')) return []
      path = path.slice(root.length + 1)
    }
    path = path.replace(/^(\.\/)+/, '')
    if (!path.toLowerCase().endsWith('.pptx') || path.split('/').some(segment => !segment || segment === '..') || /[\u0000-\u001f]/.test(path)) return []
    return [path]
  }))].slice(0, 12)
}
