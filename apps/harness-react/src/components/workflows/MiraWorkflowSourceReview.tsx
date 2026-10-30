import { Save, Workflow } from 'lucide-react'
import type { MiraFlowReview } from '../../../../../src/config/miraFlowReview'
import { MiraWorkflowTimeline } from './MiraWorkflowTimeline'

export function MiraWorkflowSourceReview({ review }: { review: MiraFlowReview }) {
  return <div className="mira-flow-review" data-workflow-source-hash={review.sourceHash}>
    <header className="mira-flow-review__title">{review.action === 'save' ? <Save size={16} /> : <Workflow size={16} />}<strong>{review.action === 'save' ? '保存这个工作流？' : '运行此工作流？'}</strong><span>{review.name}</span>{review.action === 'run' && <small>{review.graph.phases.length} 个阶段</small>}{review.scope && <small>{review.scope === 'project' ? '项目' : '全局'}{review.overwrite ? ' · 覆盖已有版本' : ''}</small>}</header>
    {review.action === 'run' && <div className="mira-flow-review__facts">{review.model && <span>子代理运行在 <strong>{review.model}</strong></span>}{review.maxConcurrency !== undefined && <span>最多 <strong>{review.maxConcurrency}</strong> 个子代理同时运行</span>}</div>}
    {review.meta && <><div className="mira-flow-review__metadata"><div><span>说明</span><p>{review.meta.description}</p></div>{review.meta.whenToUse && <div><span>何时使用</span><p>{review.meta.whenToUse}</p></div>}</div>{Object.keys(review.meta.args ?? {}).length > 0 && <section className="mira-flow-review__args"><h4>参数</h4><table><thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>默认值</th></tr></thead><tbody>{Object.entries(review.meta.args ?? {}).map(([name, arg]) => <tr key={name}><td><code>{name}</code>{arg.description && <small>{arg.description}</small>}</td><td>{arg.type}</td><td>{arg.required ? '必填' : '可选'}</td><td>{arg.default === undefined ? '—' : JSON.stringify(arg.default)}</td></tr>)}</tbody></table></section>}</>}
    {review.shadowing && <p role="note">{review.shadowing === 'hides_global' ? '这个项目定义会优先于同名全局定义。' : '当前项目存在同名定义，本次全局定义不会在此项目优先使用。'}</p>}
    {review.action === 'run' && <section className="mira-flow-review__structure" aria-label="工作流执行结构"><MiraWorkflowTimeline key={review.sourceHash} graph={review.graph} /></section>}
    {review.commands.length > 0 && <details className="mira-flow-review__commands"><summary>命令能力</summary><span>{review.commands.join('、')}</span></details>}
    {review.args && Object.keys(review.args).length > 0 && <details><summary>本次参数</summary><pre tabIndex={0} aria-label="工作流运行参数">{JSON.stringify(review.args, null, 2)}</pre></details>}
    <details><summary>显示完整脚本</summary><pre tabIndex={0} aria-label="已编译的工作流源码">{review.source}</pre><small className="mira-flow-review__hash">SHA-256：{review.sourceHash}</small></details>
  </div>
}
