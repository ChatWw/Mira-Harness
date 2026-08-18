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
    expect(prompt).toContain('项目记忆、全局记忆、系统记忆')
    expect(prompt).toContain('绝不自动保存密码、API Key、令牌')
    expect(prompt).toContain('用户可见的“记忆”工具活动')
  })

  it('does not fabricate active Skills or memory references without context', () => {
    const prompt = buildMiraSystemPrompt({ tone: 'casual' })

    expect(prompt).not.toContain('## 已激活的 Skill')
    expect(prompt).not.toContain('## 参考：项目记忆')
    expect(prompt).not.toContain('## 参考：全局记忆')
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

  it('adds only the explicitly supplied future context', () => {
    const prompt = buildMiraSystemPrompt({
      tone: 'professional',
      context: { projectMemory: '项目使用 TypeScript。', activeSkills: [{ name: '代码审查', instructions: '检查真实风险。' }] },
    })

    expect(prompt).toContain('## 已激活的 Skill')
    expect(prompt).toContain('项目使用 TypeScript。')
    expect(prompt).not.toContain('## 参考：全局记忆')
  })
})
