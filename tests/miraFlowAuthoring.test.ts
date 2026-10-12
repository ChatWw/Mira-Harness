import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expandMiraWorkflowPrompt, miraWorkflowAuthoringPrompt, miraWorkflowInvocation } from '../electron/prompts/mira-workflow-authoring'
import { readMiraFlowAuthoringSource, writeMiraFlowDraft } from '../electron/services/flows/miraFlowAuthoring'
import { MIRA_RESERVED_PROMPT_COMMANDS } from '../src/config/miraPromptCommands'

const roots: string[] = []
const root = () => { const value = realpathSync(mkdtempSync(join(tmpdir(), 'mira-flow-authoring-'))); roots.push(value); return value }
afterEach(() => roots.splice(0).forEach(value => rmSync(value, { recursive: true, force: true })))

describe('Mira workflow command and authoring sources', () => {
  it('reserves /workflow and expands actual task semantics without matching quoted/mid-message text', () => {
    expect(MIRA_RESERVED_PROMPT_COMMANDS).toContain('workflow')
    expect(expandMiraWorkflowPrompt('/workflow 用三名评审员检查变更')).toContain('create_workflow')
    expect(expandMiraWorkflowPrompt('/workflow 用三名评审员检查变更')).toContain('用三名评审员检查变更')
    expect(miraWorkflowInvocation('请运行 /workflow 任务')).toBeUndefined()
    expect(miraWorkflowInvocation('`/workflow 任务`')).toBeUndefined()
    expect(miraWorkflowInvocation('/workflow')).toBe('')
    const prompt = miraWorkflowAuthoringPrompt([{ name: 'review', scope: 'project' }])
    expect(prompt).toContain('"name":"review"'); expect(prompt).toContain('declare function agent(')
    expect(prompt).toContain('只在用户明确要求保存'); expect(prompt).toContain('不要调用未注册的')
  })
  it('stores an editable draft and reads its exact bytes without promoting it to a saved definition', async () => {
    const directory = root(), source = 'phase("检查"); return await agent("reviewer").ask("check");'
    const path = await writeMiraFlowDraft(directory, source)
    expect(path).toMatch(/^\.mira\/workflow-drafts\/mira-flow-/)
    expect(await readMiraFlowAuthoringSource(directory, path)).toMatchObject({ source, script: source })
    expect(readFileSync(join(directory, path), 'utf8')).toBe(source)
    expect(existsSync(join(directory, '.mira', 'workflows'))).toBe(false)
  })
  it('reads metadata arguments once and strips metadata only for save body', async () => {
    const directory = root(), source = '/* mira-workflow\ndescription: Reusable\nargs:\n  topic:\n    type: string\n    required: true\n*/\nreturn args.topic;'
    writeFileSync(join(directory, 'draft.ts'), source)
    expect(await readMiraFlowAuthoringSource(directory, 'draft.ts')).toMatchObject({ source, script: 'return args.topic;', meta: { args: { topic: { type: 'string', required: true } } } })
    await expect(readMiraFlowAuthoringSource(directory, '../outside.ts')).rejects.toThrow()
  })
  it('refuses a linked draft parent before creating anything outside the project', async () => {
    const directory = root(), outside = root()
    symlinkSync(outside, join(directory, '.mira'))
    await expect(writeMiraFlowDraft(directory, 'return 1;')).rejects.toThrow('符号链接')
    expect(existsSync(join(outside, 'workflow-drafts'))).toBe(false)
  })
})
