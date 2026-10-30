import type { HarnessFileChange } from '../../../../src/config/harness'

export function miraDeliverableLabel(path: string) {
  const extension = path.split('.').pop()!.toLowerCase()
  const labels: Record<string, string> = { md: 'Markdown', html: '网页', htm: '网页', docx: '文档', xlsx: '电子表格', pptx: '演示文稿', pdf: 'PDF 文档', mp4: '视频', mov: '视频', webm: '视频', m4v: '视频', mp3: '音频', wav: '音频', m4a: '音频', ogg: '音频', opus: '音频', flac: '音频', weba: '音频' }
  return labels[extension] ? `${labels[extension]} · ${extension.toUpperCase()}` : undefined
}

export function miraDeliverablePaths(content: string, changes: HarnessFileChange[], directory: string) {
  const latest = new Map(changes.map(change => [change.path.replace(/\\/g, '/').replace(/^(\.\/)+/, ''), change]))
  const changed = [...latest.values()].filter(change => change.tool !== 'delete' && !change.summary?.unchanged)
  const candidates: string[] = []
  const plain = content.replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[^\n]*$/gm, '').replace(/\[[^\]\n]*\]\(([^)\n]+)\)|`([^`\n]+)`/g, (_match, link: string, code: string) => { candidates.push(link || code); return ' ' })
  for (const match of plain.matchAll(/(?:^|[\s，。；;：:（(])([^\s`<>"'\[\]()，。；;）]+\.(?:md|html?|docx|xlsx|pptx|pdf|mp4|mov|webm|m4v|mp3|wav|m4a|ogg|opus|flac|weba))(?=$|[\s，。；;）)])/gim)) candidates.push(match[1])
  candidates.push(...changed.map(change => change.path))
  const root = directory.replace(/\\/g, '/').replace(/\/$/, '')
  const deleted = new Set([...latest.values()].filter(change => change.tool === 'delete').map(change => change.path.replace(/\\/g, '/').replace(/^(\.\/)+/, '')))
  const normalize = (candidate: string): string[] => {
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
    if (deleted.has(path) || !miraDeliverableLabel(path) || path.split('/').some(segment => !segment || segment === '..') || /[\u0000-\u001f]/.test(path)) return []
    return [path]
  }
  const changedPaths = new Set(changed.flatMap(change => normalize(change.path)))
  // Result cards require an actual change in this reply; mentioning an existing file is not an output.
  return [...new Set(candidates.flatMap(normalize))]
    .filter(path => changedPaths.has(path))
    .slice(0, 12)
}
