import type { MiraFlowReview } from '../../../../../src/config/miraFlowReview'
import { MiraWorkflowTimeline } from './MiraWorkflowTimeline'

export function MiraWorkflowSourceReview({ review }: { review: MiraFlowReview }) {
  return <div className="mira-flow-review" data-workflow-source-hash={review.sourceHash}>
    <div className="mira-flow-review__facts">
      {review.scope && <span>{review.scope === 'project' ? '项目流程' : '全局流程'}{review.overwrite ? ' · 覆盖已有版本' : ''}</span>}
      {review.model && <span>模型：{review.model}</span>}
      {review.maxConcurrency !== undefined && <span>最多 {review.maxConcurrency} 个智能体同时执行</span>}
    </div>
    {review.meta && <div className="mira-flow-review__metadata"><p>{review.meta.description}</p>{review.meta.whenToUse && <p>适用场景：{review.meta.whenToUse}</p>}{review.meta.args && Object.entries(review.meta.args).map(([name, arg]) => <p key={name}><code>{name}</code> · {arg.type}{arg.required ? ' · 必填' : ''}{arg.description ? ` · ${arg.description}` : ''}{arg.default !== undefined ? ` · 默认 ${JSON.stringify(arg.default)}` : ''}</p>)}</div>}
    {review.shadowing && <p role="note">{review.shadowing === 'hides_global' ? '这个项目定义会优先于同名全局定义。' : '当前项目存在同名定义，本次全局定义不会在此项目优先使用。'}</p>}
    <section className="mira-flow-review__structure" aria-label="工作流执行结构">
      <MiraWorkflowTimeline key={review.sourceHash} graph={review.graph} />
    </section>
    {review.commands.length > 0 && <div className="mira-flow-review__commands"><strong>命令能力</strong><span>{review.commands.join('、')}</span></div>}
    {review.args && Object.keys(review.args).length > 0 && <details><summary>本次参数</summary><pre tabIndex={0} aria-label="工作流运行参数">{JSON.stringify(review.args, null, 2)}</pre></details>}
    <details><summary>查看完整 TypeScript 源码</summary><pre tabIndex={0} aria-label="已编译的工作流源码">{review.source}</pre><small className="mira-flow-review__hash">SHA-256：{review.sourceHash}</small></details>
  </div>
}
