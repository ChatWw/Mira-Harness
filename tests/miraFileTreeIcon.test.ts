import { describe, expect, it } from 'vitest'
import { miraFileTreeIcon, miraFileTreeIconName } from '../apps/harness-react/src/lib/mira-file-tree-icon'

describe('file tree icon matching', () => {
  it.each([
    ['src/main.PY', 'python'], ['src/main.java', 'java'], ['slides.pptx', 'powerpoint'],
    ['table.csv', 'table'], ['table.xlsx', 'table'], ['old.doc', 'word'], ['old.docx', 'word'],
    ['App.tsx', 'react_ts'], ['index.cjs', 'javascript'], ['.gitignore', 'git'],
    ['package-lock.json', 'lock'], ['pnpm-lock.yaml', 'lock'], ['README.md', 'readme'],
    ['tsconfig.node.json', 'tsconfig'], ['vitest.config.ts', 'vitest'], ['.env.local', 'settings'],
    ['C:\\work\\main.ts', 'typescript'], ['noextension', 'document'],
  ])('matches %s as %s', (path, icon) => {
    expect(miraFileTreeIconName(path)).toBe(icon)
    expect(miraFileTreeIcon(path)).toMatch(/(?:\.svg|^data:image\/svg)/)
  })
  it('falls back locally for arbitrary unsupported names and keeps SVG colors', () => {
    expect(miraFileTreeIcon('unknown.constructor')).toBe(miraFileTreeIcon('file.txt'))
    expect(miraFileTreeIcon('unknown.mira-unknown')).toBe(miraFileTreeIcon('file.txt'))
    expect(miraFileTreeIcon('file.py')).not.toBe(miraFileTreeIcon('file.txt'))
    expect(miraFileTreeIcon('file.java')).not.toBe(miraFileTreeIcon('file.py'))
  })
})
