export type MiraWorkflowScope = 'global' | 'project'
export type MiraWorkflowArgType = 'string' | 'number' | 'boolean' | 'json'
export interface MiraWorkflowArg { type: MiraWorkflowArgType; description?: string; required?: boolean; default?: unknown }
export interface MiraWorkflowMeta { description: string; whenToUse?: string; args?: Record<string, MiraWorkflowArg> }
export type MiraWorkflowParseReason = 'missing_frontmatter' | 'unterminated_frontmatter' | 'invalid_yaml' | 'invalid_metadata'
export type MiraWorkflowParsed = { ok: true; meta: MiraWorkflowMeta; script: string; bodyLineOffset: number; marker: 'mira' | 'zcode' } | { ok: false; reason: MiraWorkflowParseReason; detail: string }
export interface MiraWorkflowEntry {
  name: string; scope: MiraWorkflowScope; path: string; revision?: string; meta?: MiraWorkflowMeta
  diagnostic?: { reason: MiraWorkflowParseReason | 'read_error'; detail: string }
  shadowed?: boolean
}
/** Host source snapshot, not evidence that compilation or execution is available. */
export interface MiraWorkflowDocument extends MiraWorkflowEntry {
  revision: string; sourceHash: string; meta: MiraWorkflowMeta; source: string; script: string; bodyLineOffset: number; marker: 'mira' | 'zcode'
}
export interface MiraWorkflowWrite { scope: MiraWorkflowScope; name: string; meta: MiraWorkflowMeta; script: string; expectedRevision?: string }
export interface MiraWorkflowPreview { previous?: MiraWorkflowDocument; next: MiraWorkflowDocument; shadowing?: 'hides_global' | 'hidden_by_project' }

const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)))
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key)
function json(value: unknown, seen = new Set<object>(), depth = 0): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return true
  if (depth > 64 || typeof value !== 'object' || !value || seen.has(value) || !Array.isArray(value) && !object(value)) return false
  seen.add(value)
  const valid = (Array.isArray(value) ? value : Object.values(value)).every(child => json(child, seen, depth + 1))
  seen.delete(value); return valid
}
function matches(type: MiraWorkflowArgType, value: unknown) { return type === 'json' ? json(value) : typeof value === type && (type !== 'number' || Number.isFinite(value)) }
function fields(value: Record<string, unknown>, allowed: string[], label: string) {
  const extra = Object.keys(value).filter(key => !allowed.includes(key))
  if (extra.length) throw new Error(`${label}未知字段：${extra.join('、')}`)
}
/** Validate defaults when storing definitions, before any run or approval can exist. */
export function validateMiraWorkflowMeta(value: unknown): asserts value is MiraWorkflowMeta {
  if (!object(value)) throw new Error('工作流元数据需要对象')
  fields(value, ['description', 'whenToUse', 'args'], '工作流元数据')
  if (typeof value.description !== 'string' || !value.description.trim()) throw new Error('description 需要非空文本')
  if (value.whenToUse !== undefined && (typeof value.whenToUse !== 'string' || !value.whenToUse.trim())) throw new Error('whenToUse 需要非空文本')
  if (value.args === undefined) return
  if (!object(value.args)) throw new Error('args 需要参数声明对象')
  for (const [name, spec] of Object.entries(value.args)) {
    if (!name || ['__proto__', 'constructor', 'prototype'].includes(name)) throw new Error(`参数名称无效：${name}`)
    if (!object(spec)) throw new Error(`参数 ${name} 需要声明对象`)
    fields(spec, ['type', 'description', 'required', 'default'], `参数 ${name}`)
    if (!['string', 'number', 'boolean', 'json'].includes(spec.type as string)) throw new Error(`参数 ${name} 类型无效`)
    if (spec.description !== undefined && typeof spec.description !== 'string' || spec.required !== undefined && typeof spec.required !== 'boolean') throw new Error(`参数 ${name} 说明或必填状态无效`)
    if (own(spec, 'default') && !matches(spec.type as MiraWorkflowArgType, spec.default)) throw new Error(`参数 ${name} 默认值需要 ${spec.type}`)
  }
}
export function validateMiraWorkflowArgs(declaration: MiraWorkflowMeta['args'], provided?: Record<string, unknown>): { ok: true; args: Record<string, unknown> } | { ok: false; errors: string[] } {
  validateMiraWorkflowMeta({ description: '参数校验', ...(declaration === undefined ? {} : { args: declaration }) })
  if (provided !== undefined && !object(provided)) return { ok: false, errors: ['工作流参数需要对象'] }
  const specs = declaration ?? {}, given = provided ?? {}, args: Record<string, unknown> = {}, errors: string[] = []
  for (const key of Object.keys(given)) if (!own(specs, key)) errors.push(`未知参数：${key}`)
  for (const [name, spec] of Object.entries(specs)) {
    const value = own(given, name) ? given[name] : undefined
    if (value === undefined && !own(spec, 'default')) { if (spec.required) errors.push(`缺少必填参数：${name}`); continue }
    const accepted = value === undefined ? spec.default : value
    if (!matches(spec.type, accepted)) errors.push(`参数 ${name} 需要 ${spec.type}`)
    else args[name] = spec.type === 'json' ? JSON.parse(JSON.stringify(accepted)) : accepted
  }
  return errors.length ? { ok: false, errors } : { ok: true, args }
}
