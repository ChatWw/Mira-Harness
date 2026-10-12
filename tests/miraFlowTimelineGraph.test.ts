import { describe, expect, it } from 'vitest'
import { compileMiraFlow } from '../electron/services/flows/miraFlowCompile'
import { analyzeMiraFlowProgram, createMiraFlowProgram } from '../packages/mira-flow-kit/src/mira-index'
import { projectMiraFlowReview } from '../electron/services/flows/miraFlowReviewGraph'

describe('compiler-derived timeline join keys', () => {
  it('projects exact actor sites and author line locations without parsing display names', () => {
    const source = 'const writer = agent("作者");\nphase("资料整理");\nconst text = await files.read("notes.md");\nreturn await writer.ask(text);'
    const analysis = analyzeMiraFlowProgram(createMiraFlowProgram(source))
    const graph = projectMiraFlowReview(analysis)
    expect(graph.steps.map(step => step.line)).toEqual([3, 4])
    expect(graph.phases[0]?.line).toBe(2)
    const actor = graph.participants.find(participant => participant.lane !== 'workspace')!
    expect(actor.actorSiteId).toBe(analysis.causality!.lanes.find(lane => lane.name === '作者')?.id)
    expect(graph.participants.find(participant => participant.lane === 'workspace')).not.toHaveProperty('actorSiteId')
    expect(compileMiraFlow(source).executable?.reviewGraph).toEqual(graph)
  })
  it('preserves specialized source IDs, optional execution and repetition from the analysis', () => {
    const analysis = analyzeMiraFlowProgram(createMiraFlowProgram('const a=agent("研究员");return await a.ask("查资料");'))
    const step = analysis.causality!.steps[0]!
    step.source = 'ask#1/2'; step.certainty = 'maybe'; step.repeat = 'stack'
    expect(projectMiraFlowReview(analysis).steps[0]).toMatchObject({ source: 'ask#1/2', certainty: 'maybe', repeat: 'stack', kind: 'ask', line: step.loc.line })
  })
})
