import { createHash } from 'node:crypto'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { MIRA_HOOK_DEFAULT_TIMEOUT, MIRA_HOOK_EVENTS, type MiraHookEvent } from '../../src/config/miraHooks'
import type { MiraPluginHook } from '../../src/config/miraPlugins'

const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const text = (value: unknown, empty = false, limit = 8192): value is string => typeof value === 'string' && (empty || Boolean(value.trim())) && !value.includes('\0') && value.length <= limit

/** readFile enforces package containment, symlink prohibition and the 256KB bound. */
export function loadMiraPluginHooks(context: { id: string; name: string; root: string; manifestPath: string }, manifest: Record<string, unknown>, readFile: (path: string) => string | undefined): { hooks: MiraPluginHook[]; diagnostics: string[] } {
  const hooks: MiraPluginHook[] = [], diagnostics: string[] = [], seen = new Set<string>()
  function parse(raw: unknown, sourcePath: string, sourceIdentity: unknown) {
    if (!object(raw)) { diagnostics.push(`Hook 来源 ${sourcePath} 需要事件对象`); return }
    for (const [event, groups] of Object.entries(raw)) {
      if (!(MIRA_HOOK_EVENTS as readonly string[]).includes(event)) { diagnostics.push(`Hook 事件尚未支持：${event}（${sourcePath}）`); continue }
      if (!Array.isArray(groups)) { diagnostics.push(`Hook 事件 ${event} 需要匹配组数组（${sourcePath}）`); continue }
      groups.forEach((group, groupIndex) => {
        if (!object(group) || group.matcher !== undefined && !text(group.matcher, true, 1024) || !Array.isArray(group.hooks)) { diagnostics.push(`Hook 匹配组无效：${event}（${sourcePath}）`); return }
        group.hooks.forEach((value, hookIndex) => {
          if (!object(value) || !['command', 'process'].includes(value.type as string)) { diagnostics.push(`Hook 执行类型尚未支持：${String(object(value) ? value.type : '')}（${event} · ${sourcePath}）`); return }
          if (value.type === 'process' && (value.async === true || value.shell !== undefined) || value.type === 'command' && value.args !== undefined) { diagnostics.push(`Hook 执行方式与参数不匹配：${event}（${sourcePath}）`); return }
          const timeout = value.timeout ?? (typeof value.timeoutMs === 'number' ? value.timeoutMs / 1000 : MIRA_HOOK_DEFAULT_TIMEOUT)
          if (!text(value.command) || !Number.isFinite(timeout) || (timeout as number) < 0.001 || (timeout as number) > 600
            || value.timeout !== undefined && !Number.isInteger(value.timeout)
            || value.timeoutMs !== undefined && (!Number.isInteger(value.timeoutMs) || (value.timeoutMs as number) < 1)
            || value.args !== undefined && (!Array.isArray(value.args) || value.args.length > 128 || value.args.some(arg => !text(arg, true)))
            || value.enabled !== undefined && typeof value.enabled !== 'boolean' || value.async !== undefined && typeof value.async !== 'boolean'
            || value.shell !== undefined && value.shell !== true && !text(value.shell, false, 1024)
            || value.statusMessage !== undefined && !text(value.statusMessage, true, 256)
            || value.custom !== undefined && (!object(value.custom) || Buffer.byteLength(JSON.stringify(value.custom)) > 8192)) { diagnostics.push(`Hook 声明无效：${event}（${sourcePath}）`); return }
          if (hooks.length >= 128) { if (!diagnostics.includes('插件最多支持 128 个 Hook')) diagnostics.push('插件最多支持 128 个 Hook'); return }
          const id = `plugin-hook:${hash([context.id, sourcePath, event, groupIndex, hookIndex]).slice(0, 40)}`
          hooks.push({ id, name: `${context.name} · ${event}`, event: event as MiraHookEvent, type: value.type as 'command' | 'process', command: value.command,
            args: value.args as string[] ?? [], timeout: timeout as number, async: value.type === 'command' && value.async === true, enabled: value.enabled !== false,
            ...(group.matcher !== undefined ? { matcher: group.matcher as string } : {}), ...(value.shell !== undefined ? { shell: value.shell as true | string } : {}),
            ...(value.statusMessage !== undefined ? { statusMessage: value.statusMessage as string } : {}), ...(value.custom ? { custom: value.custom as Record<string, unknown> } : {}),
            sourcePath, revision: hash([sourceIdentity, event, groupIndex, hookIndex, value, group.matcher]) })
        })
      })
    }
  }
  function file(path: string, optional = false) {
    const target = resolve(context.root, path), child = relative(context.root, target)
    if (isAbsolute(path) || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) { diagnostics.push(`Hook 配置路径超出插件目录：${path}`); return }
    const sourcePath = child.split(sep).join('/')
    if (seen.has(sourcePath)) return
    seen.add(sourcePath)
    try {
      const source = readFile(sourcePath)
      if (source === undefined) { if (!optional) diagnostics.push(`Hook 配置不存在：${sourcePath}`); return }
      const wrapper: unknown = JSON.parse(source)
      parse(object(wrapper) ? wrapper.hooks : undefined, sourcePath, source)
    } catch { diagnostics.push(`Hook 配置不可读取或无效：${sourcePath}`) }
  }
  file('hooks/hooks.json', true)
  const declared = manifest.hooks === undefined ? [] : Array.isArray(manifest.hooks) ? manifest.hooks : [manifest.hooks]
  declared.forEach((value, index) => {
    if (typeof value === 'string') file(value)
    else parse(value, `${context.manifestPath}#hooks${declared.length > 1 ? `/${index}` : ''}`, value)
  })
  return { hooks, diagnostics }
}
