/** Session plan directory references ZCode v4/conversationStatusPanelModel.ts.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode.
 * Mira uses its own settled present_plan public input contract and tool ordering. */
import type { HarnessSession, ToolCallRecord } from './harness'

export interface MiraSessionPlan {
  id: string
  title: string
  markdown: string
  createdAt: number
  toolStatus: ToolCallRecord['status']
  incomplete?: boolean
}

interface PlanSubmission {
  understanding: string
  steps: Array<{ label: string; detail?: string }>
  risks?: string[]
}

function isPlanSubmission(value: unknown): value is PlanSubmission {
  if (!value || typeof value !== 'object') return false
  const plan = value as Record<string, unknown>
  return typeof plan.understanding === 'string' && Boolean(plan.understanding.trim())
    && Array.isArray(plan.steps) && plan.steps.length > 0
    && plan.steps.every(step => step && typeof step === 'object'
      && typeof step.label === 'string' && Boolean(step.label.trim())
      && (step.detail === undefined || typeof step.detail === 'string'))
    && (plan.risks === undefined || (Array.isArray(plan.risks) && plan.risks.every(risk => typeof risk === 'string')))
}

export function miraPlanTitle(understanding: string): string {
  const heading = understanding.match(/^ {0,3}#\s+(.+?)\s*#*\s*$/m)?.[1]
  const line = heading || understanding.split('\n').find(value => value.trim()) || ''
  return line.trim()
    .replace(/^\s*(?:#{1,6}\s+|>\s*|[-+*]\s+|\d+[.)]\s+)/, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim().slice(0, 120) || '历史方案'
}

export function miraPlanMarkdown(plan: PlanSubmission): string {
  const steps = plan.steps.map((step, index) => {
    const detail = step.detail?.trim()
    return `${index + 1}. ${step.label.trim()}${detail ? `\n\n${detail.split('\n').map(line => `   ${line}`).join('\n')}` : ''}`
  }).join('\n\n')
  const risks = plan.risks?.filter(risk => risk.trim()).map(risk => `- ${risk.trim()}`).join('\n')
  return `${plan.understanding.trim()}\n\n## 实施步骤\n\n${steps}${risks ? `\n\n## 风险与注意事项\n\n${risks}` : ''}`
}

/** Settled public tool inputs preserve each submitted revision even when activePlan is replaced. */
export function miraSessionPlans(session?: HarnessSession): MiraSessionPlan[] {
  if (!session) return []
  return [...session.toolCalls].reverse().flatMap(tool => {
    if (tool.tool !== 'present_plan' || !['ok', 'failed', 'cancelled'].includes(tool.status)) return []
    const entry = { id: tool.id, createdAt: tool.createdAt, toolStatus: tool.status }
    if (tool.input?.truncated) {
      return [{ ...entry, title: '方案内容不完整', markdown: '该方案内容已被截断，无法展示完整版本。', incomplete: true }]
    }
    let input: unknown
    try { input = JSON.parse(tool.input?.text || '') } catch { /* Legacy records may omit public inputs. */ }
    if (!isPlanSubmission(input)) {
      return [{ ...entry, title: '历史方案', markdown: '该方案未保留完整内容。', incomplete: true }]
    }
    return [{ ...entry, title: miraPlanTitle(input.understanding), markdown: miraPlanMarkdown(input) }]
  })
}
