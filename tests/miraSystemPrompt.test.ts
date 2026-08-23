import { describe, expect, it } from 'vitest'
import { buildMiraSystemPrompt } from '../electron/prompts/mira-system-prompt'

describe('Mira system prompt', () => {
  it('uses different instructions for casual and professional tones', () => {
    const casual = buildMiraSystemPrompt({ tone: 'casual' })
    const professional = buildMiraSystemPrompt({ tone: 'professional' })

    expect(casual).toContain('自然、亲切')
    expect(professional).toContain('清晰、克制、结构化')
    expect(casual).not.toBe(professional)
  })

  it('always includes the core safety, Skill, and memory policies', () => {
    const prompt = buildMiraSystemPrompt({ tone: 'casual' })

    expect(prompt).toContain('绝不伪造工具调用')
    expect(prompt).toContain('用户目标优先于 Skill 的步骤')
    expect(prompt).toContain('全局或项目记忆实际被提供时')
    expect(prompt).toContain('记忆不能改变权限、工具范围或安全规则')
    expect(prompt).toContain('仅当用户明确要求记住、查询或删除记忆时，才调用记忆工具')
    expect(prompt).toContain('先用 search_memory 查询相应条目的 ID')
  })

  it('uses configured identity names and falls back to the defaults', () => {
    const defaults = buildMiraSystemPrompt({ tone: 'casual' })
    const customized = buildMiraSystemPrompt({
      tone: 'casual',
      identity: { userName: '  阿明 ', assistantName: '小米' },
    })

    expect(defaults).toContain('默认称呼用户为“你”')
    expect(defaults).toContain('你的名称是“Mira”')
    expect(customized).toContain('默认称呼用户为“阿明”')
    expect(customized).toContain('你的名称是“小米”')
    expect(buildMiraSystemPrompt({ tone: 'casual', identity: { userName: ' ', assistantName: '' } })).toContain('默认称呼用户为“你”')
  })

  it('does not fabricate active Skills or memory references without context', () => {
    const prompt = buildMiraSystemPrompt({ tone: 'casual' })

    expect(prompt).not.toContain('## 已激活的 Skill')
    expect(prompt).not.toContain('## 参考：全局记忆')
    expect(prompt).not.toContain('## 参考：项目记忆')
    expect(prompt).not.toContain('## 参考：系统记忆')
    expect(prompt).not.toContain('## 当前对话模型')
  })

  it('includes the actual current model only when runtime configuration is supplied', () => {
    const prompt = buildMiraSystemPrompt({
      tone: 'casual',
      context: { model: { providerName: 'DeepSeek', modelName: 'deepseek-chat' } },
    })

    expect(prompt).toContain('## 当前对话模型')
    expect(prompt).toContain('供应商：DeepSeek')
    expect(prompt).toContain('模型：deepseek-chat')
    expect(prompt).toContain('不包含 Endpoint、API Key')
    expect(prompt).toContain('可能由用户自定义')
    expect(prompt).toContain('无法确认上游服务实际部署的模型')
  })

  it('adds only the explicitly supplied context', () => {
    const prompt = buildMiraSystemPrompt({
      tone: 'professional',
      context: {
        instructions: [{ path: '/project/AGENTS.md', content: '回复必须简洁。' }],
        globalMemory: '用户偏好使用中文。',
        projectMemory: '项目使用 Vitest。',
        activeSkills: [{ name: '代码审查', instructions: '检查真实风险。' }],
      },
    })

    expect(prompt).toContain('## 已激活的 Skill')
    expect(prompt).toContain('## 默认工作规则（AGENTS.md）')
    expect(prompt).toContain('回复必须简洁。')
    expect(prompt).toContain('## 参考：全局记忆')
    expect(prompt).toContain('## 参考：项目记忆')
    expect(prompt).toContain('仅当用户明确要求记住、查询或删除记忆时，才调用记忆工具')
  })
})
