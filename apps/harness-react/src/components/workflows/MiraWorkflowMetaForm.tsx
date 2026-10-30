import { useState } from 'react'
import { LoaderCircle, Plus, X } from 'lucide-react'
import type { MiraWorkflowMeta, MiraWorkflowArgType, MiraWorkflowArg } from '../../../../../src/config/miraWorkflows'
import { validateMiraWorkflowMeta } from '../../../../../src/config/miraWorkflows'
import { AutomationSelect } from '../automations/AutomationControls'

type Row = { key: number; name: string; type: MiraWorkflowArgType; required: boolean; value: string; description: string }
const rowsFrom = (meta: MiraWorkflowMeta): Row[] => Object.entries(meta.args ?? {}).map(([name, arg], key) => ({ key, name, type: arg.type, required: Boolean(arg.required), value: arg.default === undefined ? '' : arg.type === 'string' ? String(arg.default) : JSON.stringify(arg.default), description: arg.description || '' }))
export function MiraWorkflowMetaForm({ meta, onSave }: { meta: MiraWorkflowMeta; onSave(meta: MiraWorkflowMeta): Promise<void> }) {
  const [description, setDescription] = useState(meta.description), [when, setWhen] = useState(meta.whenToUse || ''), [rows, setRows] = useState(() => rowsFrom(meta))
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const dirty = description !== meta.description || when !== (meta.whenToUse || '') || JSON.stringify(rows.map(({ key, ...row }) => row)) !== JSON.stringify(rowsFrom(meta).map(({ key, ...row }) => row))
  function update(key: number, patch: Partial<Row>) { setRows(current => current.map(row => row.key === key ? { ...row, ...patch } : row)); setError('') }
  function discard() { setDescription(meta.description); setWhen(meta.whenToUse || ''); setRows(rowsFrom(meta)); setError('') }
  async function save() {
    if (busy) return
    setError('')
    try {
      const args: Record<string, MiraWorkflowArg> = Object.create(null)
      for (const row of rows) {
        const name = row.name.trim()
        if (!name) throw new Error('请填写参数名称')
        if (Object.prototype.hasOwnProperty.call(args, name)) throw new Error(`参数名称重复：${name}`)
        let value: unknown
        if (row.value !== '') {
          try { value = row.type === 'string' ? row.value : JSON.parse(row.value) } catch { throw new Error(`参数 ${name} 默认值需要有效的 ${row.type}`) }
        }
        args[name] = { type: row.type, ...(row.description ? { description: row.description } : {}), ...(row.required ? { required: true } : {}), ...(value !== undefined ? { default: value } : {}) }
      }
      if (!description.trim()) throw new Error('请填写说明')
      const next = { description: description.trim(), ...(when.trim() ? { whenToUse: when.trim() } : {}), ...(rows.length ? { args } : {}) }
      validateMiraWorkflowMeta(next)
      setBusy(true); await onSave(next)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  return <section className="mira-workflow-meta"><h3>基本信息</h3><label>说明<textarea aria-label="工作流说明" rows={2} value={description} disabled={busy} onChange={event => setDescription(event.target.value)} /></label><label>使用时机<textarea aria-label="工作流使用时机" rows={2} value={when} disabled={busy} onChange={event => setWhen(event.target.value)} /><small>给 Mira 的路由提示：什么场景该选这个工作流。</small></label>
    <div><strong>参数</strong><div className="mira-workflow-args-table"><div className="mira-workflow-args-header"><span>名称</span><span>类型</span><span>必填</span><span>默认值</span><span>说明</span><span /></div>{rows.map((row, index) => <div className="mira-workflow-arg-row" key={row.key}><input aria-label={`参数 ${index + 1} 名称`} value={row.name} disabled={busy} onChange={event => update(row.key, { name: event.target.value })} /><AutomationSelect label={`参数 ${index + 1} 类型`} value={row.type} options={['string', 'number', 'boolean', 'json'].map(value => ({ value, label: value }))} disabled={busy} onChange={type => update(row.key, { type: type as MiraWorkflowArgType })} /><span className="mira-automation-switch"><input aria-label={`参数 ${index + 1} 必填`} type="checkbox" checked={row.required} disabled={busy} onChange={event => update(row.key, { required: event.target.checked })} /><span /></span>{row.type === 'boolean' ? <AutomationSelect label={`参数 ${index + 1} 默认值`} value={row.value || 'none'} options={[{ value: 'none', label: '—' }, { value: 'true', label: 'true' }, { value: 'false', label: 'false' }]} disabled={busy} onChange={value => update(row.key, { value: value === 'none' ? '' : value })} /> : <input aria-label={`参数 ${index + 1} 默认值`} value={row.value} disabled={busy} onChange={event => update(row.key, { value: event.target.value })} />}<input aria-label={`参数 ${index + 1} 说明`} value={row.description} disabled={busy} onChange={event => update(row.key, { description: event.target.value })} /><button type="button" className="mira-automation-icon" aria-label={`删除参数 ${index + 1}`} disabled={busy} onClick={() => setRows(current => current.filter(item => item.key !== row.key))}><X size={14} /></button></div>)}<div className="mira-workflow-args-footer"><button type="button" className="mira-workflow-add-arg" disabled={busy} onClick={() => setRows(current => [...current, { key: Math.max(-1, ...current.map(row => row.key)) + 1, name: '', type: 'string', required: false, value: '', description: '' }])}><Plus size={14} />添加参数</button></div></div></div>
    <div className="mira-workflow-meta__footer"><small>只改写文件顶部的元数据，脚本正文保持原样。</small>{dirty && <div><button type="button" className="mira-automation-secondary" disabled={busy} onClick={discard}>放弃更改</button><button type="button" className="mira-automation-primary" disabled={busy} onClick={() => void save()}>{busy && <LoaderCircle size={14} className="pilot-spin" />}保存元数据</button></div>}</div>{error && <p className="mira-automation-error" role="alert">{error}</p>}
  </section>
}
