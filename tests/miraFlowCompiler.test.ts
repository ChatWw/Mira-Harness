import { describe, expect, it } from 'vitest'
import { compileMiraFlow } from '../electron/services/flows/miraFlowCompile'

describe('Mira workflow authoritative compilation', () => {
  it('produces graph, typed and untyped specs, fixed commands and hash from the same source', () => {
    const source = `interface Review { ok: boolean; notes: string[] }
const reviewer = agent("reviewer");
phase("review");
const review = await reviewer.ask<Review>("Review the files");
const summary = await reviewer.ask("Summarize");
await world.run("git", ["status"]);
report(review);
return { review, summary };`
    const result = compileMiraFlow(source)
    expect(result.ok).toBe(true)
    expect(result.sourceHash).toMatch(/^[a-f0-9]{64}$/)
    const specs = new Map(result.executable!.askSpecs)
    expect([...specs.values()].map(spec => spec.typed)).toEqual([true, false])
    expect(result.executable!.commands).toEqual(['git'])
    expect(result.executable!.graph.actors).toHaveLength(1)
    expect(result.executable!.code).toContain('__host.ask')
    expect(structuredClone(result)).toEqual(result)
    expect(compileMiraFlow(source)).toEqual(result)
    expect(compileMiraFlow(`${source}\n`).sourceHash).not.toBe(result.sourceHash)
  })

  it.each([
    ['Node globals', 'return process.env;', 2591],
    ['browser globals', 'return await fetch("https://example.com");', 2304],
    ['dynamic commands', 'const cmd = "git"; return await world.run(cmd, []);', 9003],
    ['duplicate actors', 'agent("same"); agent("same");', 9005],
    ['facade escape', 'const create = agent; return create("test");', 9001],
  ])('rejects %s before any executable is exposed', (_label, source, code) => {
    const result = compileMiraFlow(source)
    expect(result.ok).toBe(false)
    expect(result.executable).toBeUndefined()
    expect(result.diagnostics.some(item => item.code === code)).toBe(true)
    expect(result.diagnostics.every(item => item.line >= 1 && item.column >= 1)).toBe(true)
  })

  it('rejects non-serializable typed results rather than degrading to final text', () => {
    const result = compileMiraFlow('interface Result { run: () => void }; return await agent("worker").ask<Result>("Work");')
    expect(result.ok).toBe(false)
    expect(result.diagnostics.some(item => item.code === 9002)).toBe(true)
    expect(result.executable).toBeUndefined()
  })

  it('keeps model diagnostics in original script lines', () => {
    const result = compileMiraFlow('\n\nreturn unknownName;')
    expect(result.diagnostics.find(item => item.code === 2304)?.line).toBe(3)
  })

  it('bounds the input before constructing TypeScript analysis', () => {
    expect(() => compileMiraFlow('字'.repeat(90_000))).toThrow('256 KiB')
  })
})
