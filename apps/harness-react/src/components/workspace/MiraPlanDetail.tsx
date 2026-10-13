/* Plan directory/detail interaction adapted from ZCode ConversationStatusPanel / PlanDetailSidePane.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode.
 * Mira resolves the immutable public tool input in the owning session. */
import type { MiraSessionPlan } from '../../../../../src/config/miraSessionPlans'
import { MessageMarkdown } from '../conversation/markdown'

export function MiraPlanDetail({ plan }: { plan?: MiraSessionPlan }) {
  if (!plan) return <div className="mira-plan-detail" role="status"><h2>方案已不可用</h2><p>当前任务未保留这次方案的记录。请从会话计划中选择其他方案。</p></div>
  return <article className="mira-plan-detail" data-plan-detail-id={plan.id}>
    {plan.incomplete && <p className="mira-plan-detail-warning" role="status">这次方案未保留完整内容，无法还原全部细节。</p>}
    <MessageMarkdown content={plan.markdown} />
  </article>
}
