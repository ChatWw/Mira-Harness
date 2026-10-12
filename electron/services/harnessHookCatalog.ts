import type { MiraHookItem } from '../../src/config/miraHooks'
import { miraPluginItems, type MiraPluginSnapshot } from '../../src/config/miraPlugins'
import type { MiraHookStore } from '../storage/miraHookStore'
import type { MiraPluginStore } from '../storage/miraPluginStore'

/** Freeze declarations for this run, and recheck host approval and live provenance on use. */
export class HarnessHookCatalog {
  constructor(private readonly hooks: MiraHookStore, private readonly plugins: MiraPluginStore, private readonly frozen: MiraPluginSnapshot[] = plugins.snapshots()) {}
  list(directory?: string): MiraHookItem[] {
    const items = miraPluginItems(this.frozen)
    return [...this.hooks.list(directory), ...this.frozen.flatMap(plugin => (plugin.hooks || []).map(hook => {
      const conflict = items.find(item => item.id === plugin.id)?.conflicts.length
      return this.hooks.pluginItem({ ...hook, pluginId: plugin.id, pluginName: plugin.name, sourceRoot: plugin.root,
        enabled: plugin.enabled && hook.enabled && !conflict,
        ...(!plugin.enabled ? { unavailableReason: 'Hook 插件已停用，请先启用插件' } : conflict ? { unavailableReason: 'Hook 插件名称冲突，请停用重名插件' } : {}),
      })
    }))]
  }
  assert(hook: MiraHookItem, directory?: string): void {
    if (hook.scope === 'plugin') this.hooks.assertPlugin(hook, this.plugins.assertHook(this.frozen, hook.id))
    else this.hooks.assert(hook, directory)
  }
}
