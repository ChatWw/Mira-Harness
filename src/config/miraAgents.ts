import type { HarnessSubtaskRole } from './harness'

/** The same built-in roles and tool scopes offered by Mira's actual child runtime. */
export const MIRA_SUBTASK_AGENTS = {
  explorer: { label: '探索', description: '只读探索文件、检索网页与收集资料', tools: ['list_files', 'read', 'web_fetch', 'web_search'] },
  reviewer: { label: '审查', description: '只读检查代码、分析问题与审查改动', tools: ['list_files', 'read'] },
  tester: { label: '测试', description: '读取文件并执行测试命令', tools: ['list_files', 'read', 'bash'] },
  implementer: { label: '实现', description: '在指定项目内修改文件与执行命令', tools: ['list_files', 'read', 'edit', 'write', 'delete_file', 'bash'] },
} as const satisfies Record<HarnessSubtaskRole, { label: string; description: string; tools: readonly string[] }>
