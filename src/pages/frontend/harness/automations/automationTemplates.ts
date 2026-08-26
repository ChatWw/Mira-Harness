import type { AutomationTrigger } from '@/config/harness'

export type AutomationTemplate = {
  id: string
  name: string
  description: string
  icon: string
  prompt: string
  trigger: AutomationTrigger
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  { id: 'daily-progress', name: '每日项目进展总结', description: '汇总当天变更、待办与风险，输出结构化总结。', icon: 'DataAnalysis', prompt: '请总结「{{项目}}」在 {{日期}} 的工作进展，按今日完成、待办与风险、明日建议输出。没有实质变更时请直接说明。', trigger: { type: 'cron', expression: '0 18 * * *', humanLabel: '每天 18:00' } },
  { id: 'weekly-review', name: '每周工作 / 创作周报', description: '回顾本周进展、卡点与下一步规划。', icon: 'Document', prompt: '请回顾「{{项目}}」本周的完成事项、卡点、风险和下周建议，形成一份简洁周报。', trigger: { type: 'cron', expression: '0 9 * * 1', humanLabel: '每周 周一 09:00' } },
  { id: 'daily-news', name: '每日行业 / 灵感新闻收集', description: '收集指定主题的最新资讯并整理要点。', icon: 'Collection', prompt: '请收集与「{{项目}}」相关的行业资讯和创作灵感，列出来源、核心要点与可行动建议。', trigger: { type: 'cron', expression: '0 8 * * *', humanLabel: '每天 08:00' } },
  { id: 'chapter-polish', name: '章节批量优化', description: '人工对话完成后，整理并润色本次章节内容。', icon: 'EditPen', prompt: '请整理本次对话涉及的章节内容，检查语言、节奏和一致性，给出可直接采用的优化稿。', trigger: { type: 'session-completed' } },
  { id: 'book-organization', name: '拆书整理', description: '把对话产出归档为设定、素材或章节细纲。', icon: 'FolderOpened', prompt: '请将本次对话产出的内容整理为可复用的设定、素材和章节细纲，并标明每项的用途。', trigger: { type: 'session-completed' } },
  { id: 'idea-archive', name: '灵感碎片整理归档', description: '把零散灵感按主题归并为可检索素材。', icon: 'MagicStick', prompt: '请整理「{{项目}}」中的近期灵感碎片，按主题归类、去重并提炼为可继续创作的素材。', trigger: { type: 'cron', expression: '0 21 * * *', humanLabel: '每天 21:00' } },
  { id: 'code-health', name: '项目代码健康检查', description: '运行检查并汇总风险、失败项与修复建议。', icon: 'WarningFilled', prompt: '请检查「{{项目}}」的代码健康度，运行适用的测试和静态检查，汇总失败项、风险和修复建议。', trigger: { type: 'cron', expression: '0 17 * * 5', humanLabel: '每周 周五 17:00' } },
  { id: 'usage-report', name: '用量与成本周报', description: '汇总上周模型用量、成本和可优化项。', icon: 'TrendCharts', prompt: '请汇总「{{项目}}」上周的模型调用用量与成本，说明主要来源，并给出可优化建议。', trigger: { type: 'cron', expression: '0 10 * * 1', humanLabel: '每周 周一 10:00' } },
]
