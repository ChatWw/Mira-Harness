/* Model overrides follow ZCode's user-state projection: never rewrite plugin profiles.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode. */
import type Database from 'better-sqlite3'
import { MIRA_SUBTASK_AGENTS } from '../../src/config/miraAgents'
import { isModelProviderAvailable, type ModelSelection } from '../../src/config/harness'
import { isMiraPluginId } from '../../src/config/miraPlugins'
import type { MiraAgentModelSetting, MiraAgentModelTarget } from '../../src/config/miraAgentModels'
import type { ModelConfigStore } from './modelConfigStore'
import type { MiraPluginStore } from './miraPluginStore'

const KEY = 'mira.agentModelOverrides'
const identity = (target: MiraAgentModelTarget) => JSON.stringify(target.kind === 'builtin' ? ['builtin', target.name] : ['plugin', target.pluginId, target.name])
function selection(value: unknown): ModelSelection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Agent 模型选择无效')
  const item = value as Record<string, unknown>
  const text = (value: unknown, max: number) => typeof value === 'string' && Boolean(value.trim()) && value.length <= max && !value.includes('\0')
  if (!text(item.providerId, 128) || !text(item.modelId, 256) || item.thinkingLevel !== undefined && (typeof item.thinkingLevel !== 'string' || !['off', 'low', 'medium', 'high'].includes(item.thinkingLevel)) || Object.keys(item).some(key => !['providerId', 'modelId', 'thinkingLevel'].includes(key))) throw new Error('Agent 模型选择无效')
  return { providerId: item.providerId as string, modelId: item.modelId as string, ...(item.thinkingLevel !== undefined ? { thinkingLevel: item.thinkingLevel as ModelSelection['thinkingLevel'] } : {}) }
}
function target(value: MiraAgentModelTarget): MiraAgentModelTarget {
  if (!value || typeof value !== 'object') throw new Error('Agent 模型目标无效')
  if (value.kind === 'builtin' && Object.keys(value).every(key => ['kind', 'name'].includes(key)) && Object.prototype.hasOwnProperty.call(MIRA_SUBTASK_AGENTS, value.name)) return { kind: 'builtin', name: value.name }
  if (value.kind === 'plugin' && Object.keys(value).every(key => ['kind', 'name', 'pluginId'].includes(key)) && typeof value.pluginId === 'string' && isMiraPluginId(value.pluginId) && typeof value.name === 'string' && value.name.length <= 256 && /^[a-z0-9][a-z0-9._-]*(?::[a-z0-9][a-z0-9._-]*)+$/i.test(value.name)) return { kind: 'plugin', pluginId: value.pluginId, name: value.name }
  throw new Error('Agent 模型目标无效')
}

export class MiraAgentModelStore {
  constructor(private readonly database: Database.Database, private readonly models: ModelConfigStore, private readonly plugins: MiraPluginStore) {}

  private read(): MiraAgentModelSetting[] {
    const row = this.database.prepare('SELECT value FROM preferences WHERE key = ?').get(KEY) as { value: string } | undefined
    if (!row) return []
    try {
      const parsed = JSON.parse(row.value)
      if (!Array.isArray(parsed) || parsed.length > 8196) throw new Error()
      const entries: MiraAgentModelSetting[] = [], seen = new Set<string>()
      for (const entry of parsed) {
        const item = { target: target(entry.target), modelSelection: selection(entry.modelSelection) }, key = identity(item.target)
        if (seen.has(key)) throw new Error()
        seen.add(key); entries.push(item)
      }
      return entries
    } catch { throw new Error('Agent 专属模型设置损坏，请检查 Mira 配置') }
  }
  private modelReason(value: ModelSelection) {
    const provider = this.models.get(value.providerId), configured = provider?.models.find(model => model.id === value.modelId)
    if (!provider || !configured) return '专属模型或供应商已移除，请重新选择或恢复继承'
    if (!isModelProviderAvailable(provider) || !configured.enabled) return '专属模型或供应商不可用，请重新选择或恢复继承'
    if (value.thinkingLevel && value.thinkingLevel !== 'off' && !configured.reasoning) return '专属模型不支持所选推理档位，请重新选择'
  }
  private pluginReason(value: Extract<MiraAgentModelTarget, { kind: 'plugin' }>, cleanup = false) {
    const plugin = this.plugins.list().find(plugin => plugin.id === value.pluginId)
    const agent = plugin?.agents?.find(agent => agent.name === value.name)
    if (!plugin || !agent && !(cleanup && plugin.error && this.read().some(item => identity(item.target) === identity(value)))) throw new Error('插件 Agent 未安装、已移除或身份无效')
    return plugin.error || (plugin.conflicts.length ? '同名插件冲突，请先停用其中一个' : !plugin.enabled ? '插件已停用' : agent?.unavailableReason)
  }
  list(): MiraAgentModelSetting[] {
    const stored = this.read(), settings: MiraAgentModelSetting[] = Object.keys(MIRA_SUBTASK_AGENTS).map(name => ({ target: { kind: 'builtin', name: name as keyof typeof MIRA_SUBTASK_AGENTS } }))
    for (const plugin of this.plugins.list()) {
      const agents = plugin.agents || []
      const targets: MiraAgentModelTarget[] = agents.map(agent => ({ kind: 'plugin', pluginId: plugin.id, name: agent.name }))
      if (plugin.error) for (const setting of stored) if (setting.target.kind === 'plugin' && setting.target.pluginId === plugin.id && !targets.some(value => identity(value) === identity(setting.target))) targets.push(setting.target)
      for (const value of targets) settings.push({ target: value, ...(plugin.error || plugin.conflicts.length || !plugin.enabled || agents.find(agent => agent.name === value.name)?.unavailableReason ? { unavailableReason: plugin.error || (plugin.conflicts.length ? '同名插件冲突，请先停用其中一个' : !plugin.enabled ? '插件已停用' : agents.find(agent => agent.name === value.name)?.unavailableReason) } : {}) })
    }
    return settings.map(item => {
      const modelSelection = stored.find(setting => identity(setting.target) === identity(item.target))?.modelSelection
      const reason = modelSelection && this.modelReason(modelSelection)
      return { ...item, ...(modelSelection ? { modelSelection: { ...modelSelection } } : {}), ...(reason ? { unavailableReason: [item.unavailableReason, reason].filter(Boolean).join('；') } : {}) }
    })
  }
  get(input: MiraAgentModelTarget): ModelSelection | undefined {
    const value = target(input)
    if (value.kind === 'plugin') this.pluginReason(value)
    const stored = this.read().find(item => identity(item.target) === identity(value))?.modelSelection
    return stored && { ...stored }
  }
  set(input: MiraAgentModelTarget, requested?: ModelSelection): MiraAgentModelSetting {
    const value = target(input), modelSelection = requested === undefined ? undefined : selection(requested)
    const unavailableReason = value.kind === 'plugin' ? this.pluginReason(value, requested === undefined) : undefined
    if (modelSelection) {
      const reason = unavailableReason || this.modelReason(modelSelection)
      if (reason) throw new Error(reason)
    }
    this.database.transaction(() => {
      const settings = this.read().filter(item => identity(item.target) !== identity(value))
      if (modelSelection) settings.push({ target: value, modelSelection })
      if (settings.length) this.database.prepare('INSERT OR REPLACE INTO preferences(key, value) VALUES (?, ?)').run(KEY, JSON.stringify(settings))
      else this.database.prepare('DELETE FROM preferences WHERE key = ?').run(KEY)
    })()
    return { target: value, ...(modelSelection ? { modelSelection: { ...modelSelection } } : {}), ...(unavailableReason ? { unavailableReason } : {}) }
  }
}
