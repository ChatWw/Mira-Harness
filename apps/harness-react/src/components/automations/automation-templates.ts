import type { AutomationTemplate } from '../../../../../src/pages/frontend/harness/automations/automationTemplates'

// The four scheduled scenes shown by ZCode's automation catalog; local prompts use Mira's project context.
export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  { id: 'standup', name: '晨会动态', icon: 'target', description: '晨会动态', prompt: '汇总上一个工作日以来的提交、模块变化、CI 状态和待跟进事项，最终生成不超过 6 条的晨会口述摘要。只读分析，只使用可核实的项目与仓库信息，附相关提交或文件路径；无法读取的信息请明确说明。', trigger: { type: 'cron', expression: '0 9 * * 1-5', humanLabel: '每工作日 09:00' } },
  { id: 'risk-scan', name: '风险扫描', icon: 'activity', description: '风险扫描', prompt: '检查最近 24 小时的代码变更，识别运行错误、数据丢失、权限绕过、资源泄漏及跨端兼容等高置信风险，并附代码和文件路径。只读分析，按严重程度排列，只报告有证据支持的问题。', trigger: { type: 'cron', expression: '0 10 * * *', humanLabel: '每天 10:00' } },
  { id: 'release-notes', name: '发布简报', icon: 'file', description: '发布简报', prompt: '整理本周合并的 PR 和 commit，按功能、修复、体验及工程改进分类，同时生成团队版和面向用户的精简发布说明。只读分析，只基于实际可访问的仓库记录，附关联提交或 PR。', trigger: { type: 'cron', expression: '0 16 * * 5', humanLabel: '每周五 16:00' } },
  { id: 'docs-sync', name: '文档同步检查', icon: 'list', description: '文档同步检查', prompt: '对照最近 7 天的代码、配置、接口与文档变更，识别已改变公开行为但文档尚未同步的高置信差异，并附文件路径和变更证据。只读分析，列出需要同步的文档及建议更新内容。', trigger: { type: 'cron', expression: '0 15 * * 3', humanLabel: '每周三 15:00' } },
]
