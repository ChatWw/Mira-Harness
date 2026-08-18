// PoC：验证「用 pi-agent-core 现成能力替换自造部分」是否可行。
//
// 验证目标（对应路线图阶段零）：
//   1. 内置工具可用：createEditTool 返回 diff、createBashTool 能执行命令、NodeExecutionEnv 可用
//   2. 内置工具（AgentHarnessTool）可通过薄适配器接进低层 Agent（AgentTool）
//   3. 低层 Agent 的 beforeToolCall 能作为 Electron 权限弹窗的挂点（放行 + 拒绝）
//   4. 框架 Session（InMemorySessionStorage）能记录消息并统计
//
// 运行：node scripts/poc-harness.mjs   （需要 node >= 22.19）

import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  Agent,
  Session,
  InMemorySessionStorage,
  createEditTool,
  createReadTool,
  createBashTool,
} from '@earendil-works/pi-agent-core'
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node'
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai'

const results = []
function check(name, ok, extra = '') {
  results.push({ name, ok })
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? '  → ' + extra : ''}`)
}

// ---- 准备临时工作目录与测试文件 ----
const dir = mkdtempSync(join(tmpdir(), 'mira-poc-'))
const targetPath = join(dir, 'sample.txt')
writeFileSync(targetPath, 'hello old world', 'utf8')

// ---- 执行环境 + 内置工具 ----
const env = new NodeExecutionEnv({ cwd: dir })
const toolContext = { env }

// 薄适配器：把框架的 AgentHarnessTool（execute 带 context）包成低层 Agent 的 AgentTool（execute 无 context）
function adapt(tool) {
  return {
    name: tool.name,
    label: tool.label,
    description: tool.description,
    parameters: tool.parameters,
    executionMode: tool.executionMode,
    execute: (id, params, signal, onUpdate) => tool.execute(id, params, signal, onUpdate, toolContext),
  }
}

const editTool = createEditTool()
const bashTool = createBashTool()

// ---- 验证 1：edit 工具直接 execute 返回 diff，并真实写入文件 ----
{
  const result = await editTool.execute(
    'call-1',
    { path: 'sample.txt', edits: [{ oldText: 'old', newText: 'new' }] },
    undefined,
    undefined,
    toolContext,
  )
  const diff = result?.details?.diff
  check('createEditTool 返回 diff', typeof diff === 'string' && diff.length > 0, (diff || '').split('\n')[0])
  check('edit 工具真实写入文件', readFileSync(targetPath, 'utf8') === 'hello new world', readFileSync(targetPath, 'utf8'))
}

// ---- 验证 2：bash 工具执行命令 ----
{
  const result = await bashTool.execute('call-2', { command: 'echo pong' }, undefined, undefined, toolContext)
  const text = result?.content?.[0]?.text || ''
  check('createBashTool 执行命令', text.includes('pong'), text.trim())
}

// ---- 验证 3：框架 Session 记录消息并统计 ----
{
  const session = new Session(new InMemorySessionStorage({ id: 'poc-session', createdAt: Date.now() }))
  await session.appendMessage({ role: 'user', content: 'hi', timestamp: Date.now() })
  const stats = await session.getStats()
  check('Session 记录消息并统计', stats.messageCount === 1, `messageCount=${stats.messageCount}`)
}

// ---- 验证 4：低层 Agent + beforeToolCall + 适配后的内置工具 ----
const usage = {
  input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
}
const model = {
  id: 'mock', name: 'mock', api: 'openai-completions', provider: 'mock',
  input: ['text'], cost: usage.cost, contextWindow: 128000, maxTokens: 4096,
}

// mock streamFn：第 1 次调用返回「edit 工具调用」，第 2 次返回最终文本（不真实调 LLM）
function makeMockStreamFn() {
  let call = 0
  return async () => {
    const stream = createAssistantMessageEventStream()
    call += 1
    const message = call === 1
      ? {
          role: 'assistant',
          content: [{ type: 'toolCall', id: 'call-a', name: 'edit', arguments: { path: 'sample.txt', edits: [{ oldText: 'new', newText: 'edited' }] } }],
          api: 'openai-completions', provider: 'mock', model: 'mock',
          usage, stopReason: 'toolUse', timestamp: Date.now(),
        }
      : {
          role: 'assistant',
          content: [{ type: 'text', text: '已修改完成。' }],
          api: 'openai-completions', provider: 'mock', model: 'mock',
          usage, stopReason: 'stop', timestamp: Date.now(),
        }
    stream.end(message)
    return stream
  }
}

{
  let beforeToolCalls = []
  const agent = new Agent({
    initialState: { systemPrompt: 'test', model, tools: [adapt(editTool), adapt(createReadTool())], messages: [] },
    streamFn: makeMockStreamFn(),
    beforeToolCall: async ({ toolCall, args }) => {
      beforeToolCalls.push({ name: toolCall.name, path: args.path })
      return undefined // 放行（模拟用户在权限弹窗点“允许”）
    },
  })
  await agent.prompt('帮我修改 sample.txt')
  check('beforeToolCall 被触发', beforeToolCalls.length === 1 && beforeToolCalls[0].name === 'edit', JSON.stringify(beforeToolCalls))
  check('Agent 通过内置 edit 工具完成修改', readFileSync(targetPath, 'utf8') === 'hello edited world', readFileSync(targetPath, 'utf8'))
}

// ---- 验证 5：beforeToolCall 能拒绝（模拟权限弹窗点“取消”） ----
{
  const before = readFileSync(targetPath, 'utf8')
  const agent = new Agent({
    initialState: { systemPrompt: 'test', model, tools: [adapt(editTool)], messages: [] },
    streamFn: makeMockStreamFn(),
    beforeToolCall: async () => ({ block: true, reason: '模拟用户拒绝' }),
  })
  await agent.prompt('修改文件')
  check('beforeToolCall 可 block（权限拒绝）', readFileSync(targetPath, 'utf8') === before, '文件未被修改（已拒绝）')
}

// ---- 验证 6：低层 Agent 已有的控制能力存在 ----
{
  const agent = new Agent({ initialState: { model, messages: [] }, streamFn: makeMockStreamFn() })
  check('agent.abort 可用', typeof agent.abort === 'function')
  check('agent.steer 可用', typeof agent.steer === 'function')
  check('agent.continue 可用', typeof agent.continue === 'function')
}

// ---- 清理 ----
rmSync(dir, { recursive: true, force: true })

const failed = results.filter((r) => !r.ok)
console.log(`\n${failed.length === 0 ? '全部通过' : `${failed.length} 项失败`}（共 ${results.length} 项）`)
process.exit(failed.length === 0 ? 0 : 1)
