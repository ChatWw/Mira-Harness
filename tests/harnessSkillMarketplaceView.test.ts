import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HarnessSkillMarketCatalog, HarnessSkillMarketDetail, HarnessSkillMarketItem } from '../src/config/harness'
import { SkillMarketView, type SkillMarketHost } from '../apps/harness-react/src/components/extensions/SkillMarketView'

const hooks = vi.hoisted(() => ({ cursor: 0, dirty: false, slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>, effects: [] as Array<() => void> }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const slot = hooks.slots[hooks.cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }
    return [slot.value, (value: unknown) => { const next = typeof value === 'function' ? value(slot.value) : value; if (!Object.is(next, slot.value)) { slot.value = next; hooks.dirty = true } }]
  },
  useRef: (initial: unknown) => (hooks.slots[hooks.cursor++] ??= { value: { current: initial } }).value,
  useEffect: (callback: () => (() => void) | undefined, deps: readonly unknown[]) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (slot.deps && deps.length === slot.deps.length && deps.every((value, index) => Object.is(value, slot.deps![index]))) return
    slot.deps = deps; hooks.effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() })
  },
}))

const item: HarnessSkillMarketItem = { id: 'anthropic-skills:review', name: 'Review', description: 'Review project regressions', sourceId: 'anthropic-skills', sourceName: 'Anthropic Skills', repositoryUrl: 'https://github.com/anthropics/skills', commit: 'a'.repeat(40), license: 'Apache-2.0', installed: false, enabled: false }
const other = { ...item, id: 'anthropic-skills:writer', name: 'Writer' }
const catalog: HarnessSkillMarketCatalog = { sourceId: item.sourceId, sourceName: item.sourceName, repositoryUrl: item.repositoryUrl, commit: item.commit, refreshedAt: 1, excludedCount: 2, items: [item, other] }
const detail: HarnessSkillMarketDetail = { ...item, instructions: '# Skill\nActual instructions', licenseText: 'Apache License', files: [{ path: 'SKILL.md', size: 25 }, { path: 'LICENSE.txt', size: 14 }], totalBytes: 39 }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (cause: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function fixture() {
  return {
    browseSkillMarket: vi.fn(async () => catalog), getSkillMarketDetail: vi.fn(async id => ({ ...detail, id })),
    installMarketSkill: vi.fn(async id => ({ ...item, id, installed: true, enabled: true, skillId: 'skill-1' })), listInstalledMarketSkills: vi.fn(async () => [] as HarnessSkillMarketItem[]),
  } satisfies SkillMarketHost
}
function mount(host: SkillMarketHost) {
  let tree: React.ReactElement; let active = true
  const onManageSkills = vi.fn()
  const render = () => { hooks.cursor = 0; hooks.dirty = false; tree = SkillMarketView({ host, onManageSkills }); hooks.effects.splice(0).forEach(effect => effect()) }
  const drain = async () => { for (let i = 0; i < 30; i++) { await Promise.resolve(); if (hooks.dirty && active) render() } }
  const matches = (predicate: (props: Record<string, any>) => boolean) => {
    const found: Record<string, any>[] = []
    const visit = (node: React.ReactNode) => { if (Array.isArray(node)) return node.forEach(visit); if (!React.isValidElement<Record<string, any>>(node)) return; if (predicate(node.props)) found.push(node.props); visit(node.props.children) }
    visit(tree); return found
  }
  const find = (predicate: (props: Record<string, any>) => boolean) => { const result = matches(predicate)[0]; if (!result) throw new Error('Market control not found'); return result }
  const text = () => { const values: string[] = []; const visit = (node: React.ReactNode) => { if (typeof node === 'string' || typeof node === 'number') values.push(String(node)); else if (Array.isArray(node)) node.forEach(visit); else if (React.isValidElement<Record<string, any>>(node)) visit(node.props.children) }; visit(tree); return values.join(' ') }
  const unmount = () => { active = false; hooks.slots.forEach(slot => { slot.cleanup?.(); slot.cleanup = undefined }) }
  render(); return { drain, find, matches, text, unmount, onManageSkills }
}
beforeEach(() => { hooks.cursor = 0; hooks.dirty = false; hooks.slots = []; hooks.effects = []; vi.stubGlobal('React', React); vi.stubGlobal('requestAnimationFrame', (callback: () => void) => callback()) })
afterEach(() => { hooks.slots.forEach(slot => slot.cleanup?.()); vi.unstubAllGlobals() })

describe('Skill marketplace workbench view', () => {
  it('loads actual catalog entries, filters them, and opens the existing skills manager', async () => {
    const host = fixture(); const view = mount(host); await view.drain()
    expect(host.browseSkillMarket).toHaveBeenCalledWith(false)
    expect(view.matches(props => props.className === 'mira-market-item-main')).toHaveLength(2)
    view.find(props => props['aria-label'] === '搜索插件').onChange({ target: { value: 'Writer' } }); await view.drain()
    expect(view.matches(props => props.className === 'mira-market-item-main')).toHaveLength(1)
    view.find(props => props['aria-label'] === '管理技能').onClick()
    expect(view.onManageSkills).toHaveBeenCalledOnce()
    view.unmount()
  })

  it('installs once and updates the actual enabled inventory and detail', async () => {
    const host = fixture(); const installing = deferred<HarnessSkillMarketItem>(); host.installMarketSkill.mockReturnValueOnce(installing.promise)
    const view = mount(host); await view.drain()
    const button = view.find(props => props.className === 'mira-market-install')
    button.onClick(); button.onClick(); await view.drain()
    expect(host.installMarketSkill).toHaveBeenCalledOnce()
    expect(view.text()).toContain('安装中')
    installing.resolve({ ...item, installed: true, enabled: true, skillId: 'skill-1' }); await view.drain()
    expect(view.text()).toContain('已启用')
    expect(view.text()).toContain('已安装 Review')
    view.find(props => props.className === 'mira-market-item-main').onClick(); await view.drain()
    expect(host.getSkillMarketDetail).toHaveBeenCalledWith(item.id)
    expect(view.text()).toContain('Actual instructions')
    expect(view.text()).toContain('LICENSE.txt')
    view.unmount()
  })

  it('ignores a late detail result after opening a different item', async () => {
    const host = fixture(); const pending = deferred<HarnessSkillMarketDetail>(); host.getSkillMarketDetail.mockReturnValueOnce(pending.promise)
    const view = mount(host); await view.drain()
    view.find(props => props.className === 'mira-market-item-main').onClick(); await view.drain()
    view.find(props => props['aria-label'] === '返回插件市场').onClick(); await view.drain()
    view.matches(props => props.className === 'mira-market-item-main')[1].onClick(); await view.drain()
    pending.resolve({ ...detail, name: 'Stale response' }); await view.drain()
    expect(view.text()).not.toContain('Stale response')
    expect(host.getSkillMarketDetail).toHaveBeenLastCalledWith(other.id)
    view.unmount()
  })

  it('keeps current entries visible when refresh fails and provides a real retry', async () => {
    const host = fixture(); const view = mount(host); await view.drain()
    host.browseSkillMarket.mockRejectedValueOnce(new Error('GitHub 额度用完'))
    view.find(props => props['aria-label'] === '刷新市场').onClick(); await view.drain()
    expect(view.text()).toContain('GitHub 额度用完')
    expect(view.matches(props => props.className === 'mira-market-item-main')).toHaveLength(2)
    view.find(props => typeof props.onClick === 'function' && props.children === '重试').onClick(); await view.drain()
    expect(host.browseSkillMarket).toHaveBeenLastCalledWith(true)
    expect(view.text()).not.toContain('GitHub 额度用完')
    view.unmount()
  })

  it('does not show an installation as successful when the host fails', async () => {
    const host = fixture(); host.installMarketSkill.mockRejectedValueOnce(new Error('安装目录已存在，不会覆盖'))
    const view = mount(host); await view.drain()
    view.find(props => props.className === 'mira-market-install').onClick(); await view.drain()
    expect(view.text()).toContain('不会覆盖')
    expect(view.text()).not.toContain('已启用')
    expect(view.matches(props => props.className === 'mira-market-install')).toHaveLength(2)
    view.unmount()
  })

  it('does not let a delayed inventory refresh hide a newly installed skill', async () => {
    const host = fixture(); const view = mount(host); await view.drain()
    const pendingCatalog = deferred<HarnessSkillMarketCatalog>(); const pendingInventory = deferred<HarnessSkillMarketItem[]>()
    host.browseSkillMarket.mockReturnValueOnce(pendingCatalog.promise)
    host.listInstalledMarketSkills.mockReturnValueOnce(pendingInventory.promise)
    view.find(props => props['aria-label'] === '刷新市场').onClick(); await view.drain()
    view.find(props => props.className === 'mira-market-install').onClick(); await view.drain()
    expect(view.text()).toContain('已启用')
    pendingInventory.resolve([]); pendingCatalog.resolve(catalog); await view.drain()
    expect(view.text()).toContain('已启用')
    view.unmount()
  })
})
