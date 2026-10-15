// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SkillMarketView, type SkillMarketHost } from '../apps/harness-react/src/components/extensions/SkillMarketView'
import { MiraPublicPlugins } from '../apps/harness-react/src/components/extensions/MiraPublicPlugins'
import type { MiraPluginItem } from '../src/config/miraPlugins'
import type { MiraPluginMarketItem } from '../src/config/miraPlugins'
import type { HarnessSkillMarketCatalog, HarnessSkillMarketDetail } from '../src/config/harness'

let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals() })
const plugin: MiraPluginItem = { id: 'mira-review@local', name: 'mira-review', description: 'Review', enabled: true, skills: [{ name: 'review', description: 'Review changes' }], unsupported: [], conflicts: [] }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}
function hostFixture() {
  return {
    browseSkillMarket: vi.fn(async () => { throw new Error('公开市场离线') }),
    getSkillMarketDetail: vi.fn(), installMarketSkill: vi.fn(), listInstalledMarketSkills: vi.fn(async () => []),
    listPlugins: vi.fn(async () => [plugin]), importLocalPlugin: vi.fn(async () => [plugin]),
    setPluginEnabled: vi.fn(async () => [{ ...plugin, enabled: false }]), removePlugin: vi.fn(async () => []),
  } satisfies SkillMarketHost
}
function button(label: string) {
  const match = [...container.querySelectorAll<HTMLButtonElement>('button')].find(item => item.getAttribute('aria-label') === label || item.textContent === label)
  if (!match) throw new Error(`Missing button: ${label}`)
  return match
}
async function click(label: string) {
  await act(async () => {
    const target = button(label)
    if (target.getAttribute('role') === 'tab') target.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))
    target.click()
  })
}
async function mount(host: SkillMarketHost) { await act(async () => root.render(<SkillMarketView host={host} onManageSkills={() => undefined} />)) }

describe('plugin inventory in an offline marketplace', () => {
  it('opens installed-plugin trials through task navigation and retries navigation failures without installing', async () => {
    const item: MiraPluginMarketItem = { id: 'mira-public@anthropic-agent-skills', name: 'mira-public', description: '', marketplace: 'anthropic-agent-skills', sourceName: 'Anthropic Agent Skills', repositoryUrl: 'https://github.com/anthropics/skills', commit: 'a'.repeat(40), skills: [{ name: 'review', description: 'Review' }], unsupported: [], installed: true, enabled: true }
    const host = { browsePluginMarket: vi.fn(async () => ({ sourceName: item.sourceName, items: [item] })), getPluginMarketDetail: vi.fn(async () => ({ ...item, files: [], totalBytes: 0, licenses: [] })), installMarketPlugin: vi.fn() }
    const onTryPlugin = vi.fn(async (_id: string) => undefined).mockRejectedValueOnce(new Error('草稿尚未保存'))
    const onInstalled = vi.fn()
    await act(async () => root.render(<MiraPublicPlugins host={host} selectedId={item.id} onOpen={() => undefined} onInstalled={onInstalled} onBusyChange={() => undefined} onTryPlugin={onTryPlugin} />))
    await click('试用插件 mira-public')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('草稿尚未保存')
    await click('重试试用 mira-public')
    expect(onTryPlugin.mock.calls).toEqual([[item.id, undefined], [item.id, undefined]])
    expect(host.installMarketPlugin).not.toHaveBeenCalled(); expect(onInstalled).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]')).toBeNull()
    item.enabled = false
    await act(async () => root.render(<MiraPublicPlugins host={host} selectedId={item.id} inventoryRevision={1} onOpen={() => undefined} onInstalled={onInstalled} onBusyChange={() => undefined} onTryPlugin={onTryPlugin} />))
    expect(button('试用插件 mira-public').disabled).toBe(true)
  })

  it('retries a failed public-plugin installation rather than refreshing the catalog', async () => {
    const item: MiraPluginMarketItem = { id: 'mira-public@anthropic-agent-skills', name: 'mira-public', description: 'Public skill', marketplace: 'anthropic-agent-skills', sourceName: 'Anthropic Agent Skills', repositoryUrl: 'https://github.com/anthropics/skills', commit: 'a'.repeat(40), skills: [{ name: 'review', description: 'Review' }], unsupported: [], installed: false, enabled: false }
    const host = { browsePluginMarket: vi.fn(async () => ({ sourceName: item.sourceName, items: [item] })), getPluginMarketDetail: vi.fn(), installMarketPlugin: vi.fn(async () => ({ ...item, installed: true, enabled: true })) }
    host.installMarketPlugin.mockRejectedValueOnce(new Error('下载超时'))
    const onInstalled = vi.fn()
    await act(async () => root.render(<MiraPublicPlugins host={host} onOpen={() => undefined} onInstalled={onInstalled} onBusyChange={() => undefined} />))
    await click('安装插件 mira-public')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('下载超时')
    await click('重试安装 mira-public')
    expect(host.installMarketPlugin).toHaveBeenCalledTimes(2)
    expect(host.browsePluginMarket).toHaveBeenCalledTimes(1)
    expect(onInstalled).toHaveBeenCalledOnce()
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.textContent).toContain('已启用')
  })

  it('offers installed plugin management in detail and retries the failed toggle without false success', async () => {
    const item: MiraPluginMarketItem = { id: 'mira-public@anthropic-agent-skills', name: 'mira-public', description: 'Public skill', marketplace: 'anthropic-agent-skills', sourceName: 'Anthropic Agent Skills', repositoryUrl: 'https://github.com/anthropics/skills', commit: 'a'.repeat(40), skills: [{ name: 'review', description: 'Review' }], unsupported: [], installed: true, enabled: true }
    const host = { ...hostFixture(), browsePluginMarket: vi.fn(async () => ({ sourceName: item.sourceName, items: [item] })), getPluginMarketDetail: vi.fn(async () => ({ ...item, files: [], totalBytes: 0, licenses: [] })), installMarketPlugin: vi.fn() }
    host.setPluginEnabled.mockRejectedValueOnce(new Error('配置保存失败'))
    const onInstalled = vi.fn()
    await act(async () => root.render(<MiraPublicPlugins host={host} selectedId={item.id} onOpen={() => undefined} onInstalled={onInstalled} onBusyChange={() => undefined} />))
    await act(async () => button('管理插件 mira-public').dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true })))
    const disable = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(element => element.textContent?.includes('停用插件'))!
    expect(disable).toBeTruthy()
    await act(async () => disable.click())
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('配置保存失败')
    expect(onInstalled).not.toHaveBeenCalled()
    expect(container.textContent).toContain('已启用')
    host.setPluginEnabled.mockResolvedValueOnce([{ ...plugin, id: item.id, name: item.name, enabled: false }])
    await click('重试停用 mira-public')
    expect(host.setPluginEnabled).toHaveBeenNthCalledWith(1, item.id, false)
    expect(host.setPluginEnabled).toHaveBeenNthCalledWith(2, item.id, false)
    expect(onInstalled).toHaveBeenCalledOnce()
    expect(container.textContent).toContain('已停用')
    expect(host.getPluginMarketDetail).toHaveBeenCalledTimes(1)
    expect(host.browsePluginMarket).not.toHaveBeenCalled()
  })

  it('uses refresh only for the selected catalog retry and returns through the cached catalog', async () => {
    const item: MiraPluginMarketItem = { id: 'mira-public@anthropic-agent-skills', name: 'mira-public', description: 'Public skill', marketplace: 'anthropic-agent-skills', sourceName: 'Anthropic Agent Skills', repositoryUrl: 'https://github.com/anthropics/skills', commit: 'a'.repeat(40), skills: [{ name: 'review', description: 'Review' }], unsupported: [], installed: false, enabled: false }
    const host = { browsePluginMarket: vi.fn(async () => ({ sourceName: item.sourceName, items: [item] })), getPluginMarketDetail: vi.fn(async () => ({ ...item, files: [], totalBytes: 0, licenses: [] })), installMarketPlugin: vi.fn() }
    host.browsePluginMarket.mockRejectedValueOnce(new Error('目录离线'))
    const render = async (selectedId?: string) => act(async () => root.render(<MiraPublicPlugins host={host} selectedId={selectedId} onOpen={() => undefined} onInstalled={() => undefined} onBusyChange={() => undefined} />))
    await render(); await click('重试')
    await render(item.id); await render()
    expect(host.browsePluginMarket.mock.calls).toEqual([[false], [true], [false]])
  })

  it('removes only the registration from the installed public card and offers installation again', async () => {
    const item: MiraPluginMarketItem = { id: 'mira-public@anthropic-agent-skills', name: 'mira-public', description: 'Public skill', marketplace: 'anthropic-agent-skills', sourceName: 'Anthropic Agent Skills', repositoryUrl: 'https://github.com/anthropics/skills', commit: 'a'.repeat(40), skills: [{ name: 'review', description: 'Review' }], unsupported: [], installed: true, enabled: true }
    const host = { ...hostFixture(), browsePluginMarket: vi.fn(async () => ({ sourceName: item.sourceName, items: [item] })), getPluginMarketDetail: vi.fn(), installMarketPlugin: vi.fn() }
    const onInstalled = vi.fn()
    await act(async () => root.render(<MiraPublicPlugins host={host} onOpen={() => undefined} onInstalled={onInstalled} onBusyChange={() => undefined} />))
    await act(async () => button('管理插件 mira-public').dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true })))
    const remove = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(element => element.textContent?.includes('移除登记'))!
    expect(remove.textContent).toContain('保留已下载文件')
    await act(async () => remove.click())
    expect(host.removePlugin).toHaveBeenCalledExactlyOnceWith(item.id)
    expect(host.installMarketPlugin).not.toHaveBeenCalled()
    expect(button('安装插件 mira-public').disabled).toBe(false)
    expect(container.textContent).toContain('已下载文件保留')
    expect(onInstalled).toHaveBeenCalledOnce()
  })

  it('shows plugin Hook event, matcher, command, source and diagnostics and opens the existing Hook settings', async () => {
    const item: MiraPluginItem = { ...plugin, hooks: [{ id: 'hook-a', revision: 'hook-revision', name: '检查写入', event: 'PreToolUse', matcher: 'write|edit', type: 'process', command: 'node', args: ['scripts/check.mjs', '--strict'], sourcePath: 'hooks/hooks.json', enabled: true, timeout: 60, async: false }], hookDiagnostics: ['Hook 执行类型尚未支持：prompt'] }
    const host = { ...hostFixture(), navigate: vi.fn(async () => undefined) }
    host.listPlugins.mockResolvedValue([item])
    await mount(host); await click('本地')
    for (const text of ['1 个 Hook', 'PreToolUse', 'write|edit', '直接启动进程', 'node', 'scripts/check.mjs', 'hooks/hooks.json', 'Hook 执行类型尚未支持：prompt']) expect(container.textContent).toContain(text)
    await click('审阅 mira-review 的 Hooks')
    expect(host.navigate).toHaveBeenCalledExactlyOnceWith('/settings/hooks?plugin=mira-review%40local')
    expect(host.setPluginEnabled).not.toHaveBeenCalled()
  })

  it('keeps disabled plugin Hook details searchable and reports settings navigation failure without mutating the plugin', async () => {
    const host = { ...hostFixture(), navigate: vi.fn(async () => { throw new Error('设置暂不可用') }) }
    host.listPlugins.mockResolvedValue([{ ...plugin, enabled: false, hooks: [{ id: 'hook-a', revision: 'one', name: '停止检查', event: 'Stop', type: 'command', command: './check.sh', args: [], sourcePath: 'hooks/hooks.json', enabled: true, timeout: 60, async: false, unavailableReason: '插件已停用' }] }])
    await mount(host); await click('本地')
    expect(container.textContent).toContain('插件已停用')
    await click('审阅 mira-review 的 Hooks'); expect(container.textContent).toContain('设置暂不可用')
    expect(host.setPluginEnabled).not.toHaveBeenCalled()
    const search = container.querySelector<HTMLInputElement>('input')!
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'check.sh'); search.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(container.textContent).toContain('mira-review')
  })

  it.each([false, true])('waits for the returning plugin card without stealing newer focus (%s)', async moveFocus => {
    const callbacks: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callbacks.push(callback); return callbacks.length })
    const item: MiraPluginMarketItem = { id: 'mira-public@anthropic-agent-skills', name: 'mira-public', description: 'Public skill', marketplace: 'anthropic-agent-skills', sourceName: 'Anthropic Agent Skills', repositoryUrl: 'https://github.com/anthropics/skills', commit: 'a'.repeat(40), skills: [{ name: 'review', description: 'Review' }], unsupported: [], installed: false, enabled: false }
    const catalog = { sourceName: item.sourceName, items: [item] }, pending = deferred<typeof catalog>()
    const host = { ...hostFixture(), browsePluginMarket: vi.fn(async () => catalog), getPluginMarketDetail: vi.fn(async () => ({ ...item, files: [], totalBytes: 0, licenses: [] })), installMarketPlugin: vi.fn() }
    await mount(host)
    const scroll = container.querySelector<HTMLElement>('.mira-market-scroll')!
    scroll.scrollTop = 120
    await click('查看插件 mira-public')
    expect(document.activeElement).toBe(button('返回插件市场'))
    host.browsePluginMarket.mockReturnValueOnce(pending.promise)
    await click('返回插件市场')
    await act(async () => callbacks.splice(0).forEach(callback => callback(0)))
    expect(container.querySelector('[data-market-entry="plugin-card:mira-public@anthropic-agent-skills"]')).toBeNull()
    expect(scroll.scrollTop).toBe(0)
    const search = container.querySelector<HTMLInputElement>('input[aria-label="搜索插件"]')!
    if (moveFocus) await act(async () => search.focus())
    await act(async () => pending.resolve(catalog))
    expect(document.activeElement).toBe(moveFocus ? search : button('查看插件 mira-public'))
    expect(scroll.scrollTop).toBe(moveFocus ? 0 : 120)
    expect(host.installMarketPlugin).not.toHaveBeenCalled()
  })

  it('uses one keyboard tab stop with arrow/Home/End selection and a labelled active panel', async () => {
    await mount(hostFixture())
    const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    const tablist = container.querySelector<HTMLElement>('[role="tablist"]')!
    expect([tablist, ...tabs].filter(target => target.tabIndex === 0)).toHaveLength(1)
    await act(async () => tablist.focus())
    expect(document.activeElement).toBe(tabs[0])
    async function key(value: string) {
      await act(async () => {
        document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }))
        await new Promise(done => setTimeout(done, 0))
      })
    }
    await key('ArrowRight')
    expect(document.activeElement).toBe(tabs[1])
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
    const panel = container.querySelector('[role="tabpanel"]')!
    expect(panel.id).toBe(tabs[1].getAttribute('aria-controls'))
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[1].id)
    expect(container.textContent).toContain('mira-review')
    await key('Home'); expect(document.activeElement).toBe(tabs[0])
    await key('End'); expect(document.activeElement).toBe(tabs[1])
    await key('ArrowRight'); expect(document.activeElement).toBe(tabs[0])
  })

  it.each(['strip', 'card'])('focuses Skill detail and restores the exact %s entry and list scroll on return', async source => {
    const callbacks: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callbacks.push(callback); return callbacks.length })
    const item: HarnessSkillMarketDetail = { id: 'mira-writing', name: 'Mira Writing', description: 'Writing', sourceId: 'anthropic', sourceName: 'Anthropic Skills', repositoryUrl: 'https://github.com/anthropics/skills', commit: 'a'.repeat(40), license: 'Apache-2.0', installed: true, enabled: true, skillId: 'writing', instructions: 'Write clearly.', files: [], totalBytes: 0, licenseText: 'Apache License Version 2.0' }
    const host = { ...hostFixture(), listInstalledMarketSkills: vi.fn(async () => [item]), getSkillMarketDetail: vi.fn(async () => item), browseSkillMarket: vi.fn(async () => ({ sourceId: 'anthropic', sourceName: 'Anthropic Skills', repositoryUrl: item.repositoryUrl, commit: item.commit, refreshedAt: 1, excludedCount: 0, items: [item] })) }
    await mount(host)
    const scroll = container.querySelector<HTMLElement>('.mira-market-scroll')!
    scroll.scrollTop = 120
    const selector = source === 'strip' ? 'nav[aria-label="已安装插件"] button:last-child' : '.mira-market-catalog .mira-market-item-main'
    await act(async () => container.querySelector<HTMLButtonElement>(selector)!.click())
    expect(document.activeElement).toBe(button('返回插件市场'))
    expect(scroll.scrollTop).toBe(0)
    await click('返回插件市场')
    await act(async () => callbacks.splice(0).forEach(callback => callback(0)))
    expect(document.activeElement).toBe(container.querySelector(selector))
    expect(scroll.scrollTop).toBe(120)
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('公共')
    expect(host.installMarketSkill).not.toHaveBeenCalled()
  })

  it('places identical offline failures under their source and retries only the chosen catalog once', async () => {
    const pending = deferred<HarnessSkillMarketCatalog>()
    const host = { ...hostFixture(), browsePluginMarket: vi.fn(async () => { throw new Error('公开市场离线') }), getPluginMarketDetail: vi.fn(), installMarketPlugin: vi.fn() }
    await mount(host)
    const skills = container.querySelector<HTMLElement>('section[aria-label="公开技能"]')
    const plugins = container.querySelector<HTMLElement>('section[aria-label="公开插件包"]')
    expect(skills).not.toBeNull(); expect(plugins).not.toBeNull()
    expect(skills!.querySelector('[role="alert"]')?.textContent).toContain('公开技能：公开市场离线')
    expect(plugins!.querySelector('[role="alert"]')?.textContent).toContain('公开插件包：公开市场离线')
    expect(skills!.querySelector('.mira-market-empty')).toBeNull()
    expect(plugins!.querySelector('.mira-market-empty')).toBeNull()
    host.browseSkillMarket.mockReturnValueOnce(pending.promise)
    const retry = skills!.querySelector<HTMLButtonElement>('[role="alert"] button')!
    await act(async () => retry.click())
    await act(async () => retry.click())
    expect(host.browseSkillMarket).toHaveBeenCalledTimes(2)
    expect(host.browsePluginMarket).toHaveBeenCalledTimes(1)
    await act(async () => pending.resolve({ sourceId: 'anthropic', sourceName: 'Anthropic Skills', repositoryUrl: 'https://github.com/anthropics/skills', commit: 'a'.repeat(40), refreshedAt: 1, excludedCount: 0, items: [] }))
    await click('本地')
    expect(container.textContent).not.toContain('公开市场离线')
    expect(container.textContent).toContain('mira-review')
  })

  it('does not show a failed catalog or inventory request over an available Skill detail', async () => {
    const item: HarnessSkillMarketDetail = { id: 'mira-writing', name: 'Mira Writing', description: 'Writing', sourceId: 'anthropic', sourceName: 'Anthropic Skills', repositoryUrl: 'https://github.com/anthropics/skills', commit: 'a'.repeat(40), license: 'Apache-2.0', installed: true, enabled: true, skillId: 'writing', instructions: 'Write clearly.', files: [], totalBytes: 0, licenseText: 'Apache License Version 2.0' }
    const host = { ...hostFixture(), listInstalledMarketSkills: vi.fn(async () => [item]), getSkillMarketDetail: vi.fn(async () => item) }
    await mount(host)
    await act(async () => container.querySelector<HTMLButtonElement>('nav[aria-label="已安装插件"] button:last-child')!.click())
    expect(container.textContent).toContain('Write clearly.')
    expect(container.textContent).not.toContain('公开市场离线')
    await click('返回插件市场')
    expect(container.querySelector('section[aria-label="公开技能"] [role="alert"]')?.textContent).toContain('公开市场离线')
  })

  it('shows command-only inventory, argument hints and unavailable metadata and searches command descriptions', async () => {
    const host = hostFixture()
    host.listPlugins.mockResolvedValue([{ ...plugin, skills: [], commands: [{ name: 'check', description: '检查回归', argumentHint: '[target]' }, { name: 'shell', description: 'Shell', unavailableReason: 'Shell 动态展开尚未接入' }] }])
    await mount(host); await click('本地')
    expect(container.textContent).toContain('0 个 Skill · 2 个命令')
    expect(container.textContent).toContain('/mira-review:check [target]')
    expect(container.textContent).toContain('Shell 动态展开尚未接入')
    const search = container.querySelector<HTMLInputElement>('input')!
    await act(async () => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!; setter.call(search, '检查回归'); search.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(container.textContent).toContain('mira-review')
  })
  it('shows and searches actual plugin MCP inventory with transport and unavailable reasons', async () => {
    const host = hostFixture()
    host.listPlugins.mockResolvedValue([{ ...plugin, skills: [], mcpServers: [
      { id: 'plugin-documents', key: 'documents', name: '文档检索', revision: 'one', type: 'stdio', enabled: true },
      { id: 'plugin-remote', key: 'remote', name: '远程知识', revision: 'two', type: 'streamableHttp', enabled: false, unavailableReason: '插件服务已停用' },
      { id: 'plugin-unsupported', key: 'other', name: '待支持协议', revision: 'three', enabled: false, unavailableReason: '不支持此传输类型' },
    ] }])
    await mount(host); await click('本地')
    expect(container.textContent).toContain('0 个 Agent · 3 个 MCP')
    expect(container.textContent).toContain('文档检索'); expect(container.textContent).toContain('stdio')
    expect(container.textContent).toContain('Streamable HTTP'); expect(container.textContent).toContain('插件服务已停用')
    expect(container.textContent).toContain('不支持此传输类型')
    const search = container.querySelector<HTMLInputElement>('input')!
    await act(async () => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!; setter.call(search, '远程知识'); search.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(container.textContent).toContain('mira-review')
  })
  it.each(['detail', 'installed'])('settles a public installation after navigating to %s without leaving a stuck busy state or stale inventory', async destination => {
    const item: MiraPluginMarketItem = { id: 'mira-public@anthropic-agent-skills', name: 'mira-public', description: 'Public skill', marketplace: 'anthropic-agent-skills', sourceName: 'Anthropic Agent Skills', repositoryUrl: 'https://github.com/anthropics/skills', commit: 'a'.repeat(40), skills: [{ name: 'review', description: 'Review' }], unsupported: [], installed: false, enabled: false }
    const pending = deferred<MiraPluginMarketItem>()
    let current = item
    const host = { ...hostFixture(), browsePluginMarket: vi.fn(async () => ({ sourceName: item.sourceName, items: [current] })), getPluginMarketDetail: vi.fn(async () => ({ ...current, files: [], totalBytes: 0, licenses: [] })), installMarketPlugin: vi.fn(() => pending.promise) }
    await mount(host); await click('安装插件 mira-public')
    await click(destination === 'detail' ? '查看插件 mira-public' : '本地')
    current = { ...item, installed: true, enabled: true }
    host.listPlugins.mockResolvedValue([{ ...plugin, ...current, conflicts: [] }])
    await act(async () => pending.resolve(current))
    if (destination === 'detail') { expect(container.textContent).toContain('已启用'); expect(button('管理插件 mira-public').disabled).toBe(false); await click('返回插件市场') }
    expect(button('刷新市场').disabled).toBe(false)
    expect(host.listPlugins).toHaveBeenCalledTimes(2)
    expect(container.querySelector('nav[aria-label="已安装插件"]')?.textContent).toContain('mira-public')
    expect(host.browsePluginMarket.mock.calls.some(call => call[0] === true)).toBe(false)
  })

  it('browses a complete public plugin, installs once from detail, and reflects its real inventory without touching standalone Skills', async () => {
    const item: MiraPluginMarketItem = { id: 'mira-public@anthropic-agent-skills', name: 'mira-public', description: 'Two bundled skills', marketplace: 'anthropic-agent-skills', sourceName: 'Anthropic Agent Skills', repositoryUrl: 'https://github.com/anthropics/skills', commit: 'a'.repeat(40), skills: [{ name: 'review', description: 'Review regressions' }, { name: 'write', description: 'Write reports' }], unsupported: [], installed: false, enabled: false }
    const installedItem = { ...item, installed: true, enabled: true }, pending = deferred<MiraPluginMarketItem>()
    const host = { ...hostFixture(),
      browsePluginMarket: vi.fn(async () => ({ sourceName: item.sourceName, items: [item, { ...item, id: 'restricted@anthropic-agent-skills', name: 'restricted', unavailableReason: '缺少许可' }] })),
      getPluginMarketDetail: vi.fn(async () => ({ ...item, files: [{ path: 'skills/review/references/guide.md', size: 30 }], totalBytes: 30, licenses: [{ path: 'skills/review/LICENSE', text: 'Apache License Version 2.0' }] })),
      installMarketPlugin: vi.fn(() => pending.promise),
    }
    await mount(host)
    expect(button('安装插件 restricted').disabled).toBe(true)
    await click('查看插件 mira-public')
    expect(container.textContent).toContain('Review regressions'); expect(container.textContent).toContain('guide.md')
    expect(host.getPluginMarketDetail).toHaveBeenCalledWith(item.id)
    await click('安装插件 mira-public'); await click('安装插件 mira-public')
    expect(host.installMarketPlugin).toHaveBeenCalledTimes(1); expect(button('安装插件 mira-public').disabled).toBe(true)
    host.listPlugins.mockResolvedValueOnce([{ ...plugin, ...installedItem, conflicts: [] }])
    host.getPluginMarketDetail.mockResolvedValueOnce({ ...installedItem, files: [{ path: 'skills/review/references/guide.md', size: 30 }], totalBytes: 30, licenses: [{ path: 'skills/review/LICENSE', text: 'Apache License Version 2.0' }] })
    await act(async () => pending.resolve(installedItem))
    expect(container.textContent).toContain('已启用')
    await click('返回插件市场')
    expect(container.querySelector('nav[aria-label="已安装插件"]')?.textContent).toContain('mira-public')
    await click('本地')
    expect(container.textContent).toContain('anthropic-agent-skills')
    expect(host.installMarketSkill).not.toHaveBeenCalled()
    expect(host.browsePluginMarket.mock.calls.filter(call => call[0] === true)).toHaveLength(0)
  })

  it('keeps public-plugin errors and retries scoped to that catalog while installed inventory remains usable offline', async () => {
    const host = { ...hostFixture(), browsePluginMarket: vi.fn(async () => { throw new Error('插件目录离线') }), getPluginMarketDetail: vi.fn(), installMarketPlugin: vi.fn() }
    await mount(host); expect(container.textContent).toContain('插件目录离线')
    await click('本地'); expect(container.textContent).not.toContain('插件目录离线')
    await click('刷新市场'); expect(host.browsePluginMarket).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('mira-review')
  })

  it('keeps the public error in its own tab and refreshes both local inventories without a network request', async () => {
    const host = hostFixture(); await mount(host)
    expect(container.textContent).toContain('公开市场离线')
    await click('本地')
    expect(container.textContent).toContain('mira-review')
    expect(container.textContent).not.toContain('公开市场离线')
    host.listPlugins.mockResolvedValueOnce([{ ...plugin, name: 'mira-new', id: 'mira-new@local' }])
    await click('刷新市场')
    expect(container.textContent).toContain('mira-new')
    expect(container.textContent).not.toContain('mira-review')
    expect(host.listPlugins).toHaveBeenCalledTimes(2)
    expect(host.listInstalledMarketSkills).toHaveBeenCalledTimes(2)
    expect(host.browseSkillMarket).toHaveBeenCalledTimes(1)
    await click('公共')
    expect(container.textContent).toContain('公开市场离线')
  })

  it('shows an installed-skill failure separately and lets a refresh recover an unreadable local plugin inventory', async () => {
    const host = hostFixture()
    host.listInstalledMarketSkills.mockRejectedValueOnce(new Error('技能目录不可读'))
    host.listPlugins.mockRejectedValueOnce(new Error('插件目录不可读'))
    await mount(host); await click('本地')
    expect(container.textContent).toContain('技能目录不可读')
    expect(container.textContent).toContain('插件目录不可读')
    expect(container.textContent).not.toContain('公开市场离线')
    await click('刷新市场')
    expect(container.textContent).not.toContain('目录不可读')
    expect(container.textContent).toContain('mira-review')
    expect(host.browseSkillMarket).toHaveBeenCalledTimes(1)
  })

  it('prevents refresh from discarding an in-flight enable operation and keeps the final state visible', async () => {
    const host = hostFixture(), pending = deferred<MiraPluginItem[]>()
    host.setPluginEnabled.mockReturnValueOnce(pending.promise)
    await mount(host); await click('本地'); await click('停用')
    expect(button('刷新市场').disabled).toBe(true)
    await click('刷新市场')
    expect(host.listPlugins).toHaveBeenCalledTimes(1)
    await act(async () => pending.resolve([{ ...plugin, enabled: false }]))
    expect(container.textContent).toContain('已停用')
    expect(button('刷新市场').disabled).toBe(false)
    expect(host.setPluginEnabled).toHaveBeenCalledExactlyOnceWith(plugin.id, false)
  })
})
