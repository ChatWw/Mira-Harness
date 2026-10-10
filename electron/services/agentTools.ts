import { FileError, err, ok, type ExecutionEnv, type Result } from '@earendil-works/pi-agent-core'
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node'
import { existsSync, lstatSync, realpathSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { diffLines } from 'diff'
import type { HarnessToolText } from '../../src/config/harness'

export const HARNESS_PUBLIC_TEXT_BYTES = 64 * 1024

export function boundHarnessText(text: string): HarnessToolText {
  const prefix = text.slice(0, HARNESS_PUBLIC_TEXT_BYTES + 1)
  const bytes = Buffer.from(prefix, 'utf8')
  if (bytes.length <= HARNESS_PUBLIC_TEXT_BYTES) return { text: prefix, truncated: prefix.length < text.length }
  let end = HARNESS_PUBLIC_TEXT_BYTES
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end--
  return { text: bytes.subarray(0, end).toString('utf8'), truncated: true }
}

export function redactHarnessText(value: string, secrets: string[] = []) {
  let text = value
  for (const secret of secrets) if (secret) text = text.split(secret).join('[已隐藏]')
  text = text.replace(/data:(?:image|audio|video)\/[^;,\s]+;base64,[a-z\d+/=]+/gi, '[媒体数据不记录]')
    .replace(/((?:Bearer|Basic)\s+)[^\s"']+/gi, '$1[已隐藏]')
    .replace(/(["']?(?:[a-z\d_-]*(?:api[_-]?key|token|password|secret|credential|authorization|base64|image[_-]?url)[a-z\d_-]*|data|raw)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*(?:"|$)|'(?:\\.|[^'\\])*(?:'|$)|[^\s,;}\]]+)/gi, '$1"[已隐藏]"')
  return text
}

export function publicHarnessText(value: string, secrets: string[] = []): HarnessToolText {
  // 先保留足够前缀完成秘密替换，再按 UTF-8 边界裁剪，避免泄露被截断的密钥前半段。
  const prefix = value.slice(0, HARNESS_PUBLIC_TEXT_BYTES + Math.max(0, ...secrets.map(secret => secret.length)))
  const bounded = boundHarnessText(redactHarnessText(prefix, secrets))
  return { text: bounded.text, truncated: bounded.truncated || prefix.length < value.length }
}

export function publicHarnessToolInput(value: unknown, secrets: string[] = []): HarnessToolText {
  let remaining = HARNESS_PUBLIC_TEXT_BYTES, nodes = 256, truncated = false
  const seen = new WeakSet<object>()
  const visit = (item: unknown, depth = 0): unknown => {
    if (--nodes < 0 || depth > 8 || remaining <= 0) { truncated = true; return '[已截断]' }
    if (typeof item === 'string') {
      const text = publicHarnessText(item, secrets)
      if (text.truncated || text.text.length > remaining) truncated = true
      const kept = text.text.slice(0, remaining)
      remaining -= kept.length
      return kept
    }
    if (item === null || typeof item === 'boolean' || typeof item === 'number') return item
    if (typeof item !== 'object') return '[不可展示]'
    if (seen.has(item)) return '[循环引用]'
    seen.add(item)
    if (ArrayBuffer.isView(item) || item instanceof ArrayBuffer) return '[二进制内容不记录]'
    if (Array.isArray(item)) { if (item.length > 64) truncated = true; return item.slice(0, 64).map(entry => visit(entry, depth + 1)) }
    const entries = Object.entries(item)
    if (entries.length > 64) truncated = true
    return Object.fromEntries(entries.slice(0, 64).map(([key, entry]) => [key, /authorization|password|secret|token|api[_-]?key|credential|base64|^data$|^raw$|image[_-]?url/i.test(key) ? '[已隐藏]' : visit(entry, depth + 1)]))
  }
  const result = publicHarnessText(JSON.stringify(visit(value), null, 2) || '', secrets)
  return { text: result.text, truncated: truncated || result.truncated }
}

export function publicHarnessToolOutput(result: unknown, secrets: string[] = []): HarnessToolText | undefined {
  const sanitize = (value: string): HarnessToolText | undefined => {
    if (value.length <= HARNESS_PUBLIC_TEXT_BYTES && /^\s*[\[{]/.test(value)) {
      try {
        const parsed = JSON.parse(value)
        if (parsed?.type === 'image' || parsed?.type === 'audio') return undefined
        return publicHarnessToolInput(parsed, secrets)
      } catch { /* 非 JSON 工具文本继续按文本脱敏。 */ }
    }
    return publicHarnessText(value, secrets)
  }
  if (!result || typeof result !== 'object') return typeof result === 'string' ? sanitize(result) : undefined
  const upstreamTruncated = (result as { details?: { truncation?: { truncated?: unknown } } }).details?.truncation?.truncated === true
  const content = (result as { content?: unknown }).content
  if (typeof content === 'string') {
    const output = sanitize(content)
    return output ? { ...output, truncated: output.truncated || upstreamTruncated } : undefined
  }
  if (!Array.isArray(content)) return undefined
  let text = '', truncated = false
  for (const block of content) {
    if (!block || typeof block !== 'object' || block.type !== 'text' || typeof block.text !== 'string') continue
    const next = sanitize(block.text)
    if (!next) continue
    const bounded = publicHarnessText(text + (text ? '\n' : '') + next.text, secrets)
    text = bounded.text
    truncated ||= next.truncated || bounded.truncated
    if (bounded.truncated) break
  }
  return text || truncated ? { text, truncated: truncated || upstreamTruncated } : undefined
}

function displayDiff(previous: string, next: string) {
  let previousLine = 1
  let nextLine = 1
  return diffLines(previous, next).flatMap(part => part.value.split('\n').filter((line, index, lines) => line || index < lines.length - 1).map(line => {
    if (part.added) return `+${nextLine++} ${line}`
    if (part.removed) return `-${previousLine++} ${line}`
    previousLine += 1
    nextLine += 1
    return ` ${nextLine - 1} ${line}`
  })).join('\n')
}

/**
 * 沙箱 FileSystem：包装 NodeExecutionEnv，把路径访问限制在项目目录内。
 * 框架内置工具（read/edit/write）走 FileSystem 接口，不经过 harnessRuntime 的
 * assertProjectPath，因此必须在 FileSystem 层做同样的词法 + 符号链接检查。
 */
export function createSandboxedEnv(root: string): ExecutionEnv {
  const base = new NodeExecutionEnv({ cwd: root })
  const temporaryFiles = new Set<string>()

  const assertInside = (value: string): Result<string, FileError> => {
    const target = resolve(root, value)
    // Shell capture may spill into its own temporary log. This grants one exact
    // canonical file, never its directory, siblings, or a replacement symlink.
    if (temporaryFiles.has(target) && existsSync(target) && lstatSync(target).isFile() && realpathSync(target) === target) return ok(target)
    if (target !== root && !target.startsWith(`${root}${sep}`)) {
      return err(new FileError('permission_denied', '工具只能访问项目目录内的文件', target))
    }
    if (existsSync(target)) {
      const real = realpathSync(target)
      if (real !== root && !real.startsWith(`${root}${sep}`)) {
        return err(new FileError('permission_denied', '路径不能通过符号链接离开项目目录', target))
      }
    }
    return ok(target)
  }

  const guard = <T>(run: () => Promise<Result<T, FileError>>, path: string): Promise<Result<T, FileError>> => {
    const check = assertInside(path)
    return check.ok ? run() : Promise.resolve({ ok: false, error: check.error } as Result<T, FileError>)
  }

  return {
    ...base,
    cwd: root,
    absolutePath: (path: string) => Promise.resolve(assertInside(path)),
    readTextFile: (path: string, signal?: AbortSignal) => guard(() => base.readTextFile(path, signal), path),
    readTextLines: (path: string, options?: { maxLines?: number, abortSignal?: AbortSignal }) => guard(() => base.readTextLines(path, options), path),
    readBinaryFile: (path: string, signal?: AbortSignal) => guard(() => base.readBinaryFile(path, signal), path),
    writeFile: (path: string, content: string | Uint8Array, signal?: AbortSignal) => guard(() => base.writeFile(path, content, signal), path),
    appendFile: (path: string, content: string | Uint8Array) => guard(() => base.appendFile(path, content), path),
    renameFile: (source: string, destination: string, signal?: AbortSignal) => {
      const s = assertInside(source)
      if (!s.ok) return Promise.resolve({ ok: false, error: s.error } as Result<void, FileError>)
      return guard(() => base.renameFile(source, destination, signal), destination)
    },
    fileInfo: (path: string) => guard(() => base.fileInfo(path), path),
    listDir: (path: string, signal?: AbortSignal) => guard(() => base.listDir(path, signal), path),
    canonicalPath: (path: string) => guard(() => base.canonicalPath(path), path),
    exists: (path: string) => guard(() => base.exists(path), path),
    createDir: (path: string, options?: { recursive?: boolean, abortSignal?: AbortSignal }) => guard(() => base.createDir(path, options), path),
    remove: (path: string, options?: { recursive?: boolean, force?: boolean, abortSignal?: AbortSignal }) => guard(() => base.remove(path, options), path),
    // 以下方法委托 base；临时文件只追加本 env 的精确路径授权。
    // 注意：class 的实例方法在原型上，`...base` 不会复制它们，必须显式委托。
    joinPath: (parts: string[], signal?: AbortSignal) => base.joinPath(parts, signal),
    exec: (command: string, options?: any) => base.exec(command, options),
    createTempDir: (prefix?: string, signal?: AbortSignal) => base.createTempDir(prefix, signal),
    createTempFile: async (options?: { prefix?: string, suffix?: string }) => {
      const result = await base.createTempFile(options)
      if (!result.ok) return result
      const path = realpathSync(result.value)
      temporaryFiles.add(path)
      return ok(path)
    },
    cleanup: async () => { await base.cleanup(); temporaryFiles.clear() },
  } as ExecutionEnv
}

/**
 * 薄适配器：把框架的 AgentHarnessTool（execute 带 context）包成低层 Agent 的
 * AgentTool（execute 无 context），并在外层包一层 record/finish，以便把工具调用
 * 写入 ToolCallRecord 并同步到前端展示。
 */
export function wrapHarnessTool(
  tool: any,
  context: { env: ExecutionEnv },
  hooks: {
    record: (tool: string, target: string) => string
    finish: (id: string, status: 'ok' | 'failed', diff?: string) => void
    target: (params: any) => string
  },
  description?: string,
) {
  return {
    name: tool.name,
    label: tool.label,
    description: description ?? tool.description,
    parameters: tool.parameters,
    executionMode: tool.executionMode,
    execute: async (toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: any) => {
      const id = hooks.record(tool.name, hooks.target(params))
      try {
        const previous = tool.name === 'write'
          ? await context.env.readTextFile(params.path, signal).then(result => result.ok ? result.value : '')
          : undefined
        const result = await tool.execute(toolCallId, params, signal, onUpdate, context)
        const diff = result?.details?.diff || (tool.name === 'write'
          ? await context.env.readTextFile(params.path, signal).then(next => next.ok ? displayDiff(previous || '', next.value) : undefined)
          : undefined)
        hooks.finish(id, 'ok', diff)
        return result
      } catch (error) {
        hooks.finish(id, 'failed')
        throw error
      }
    },
  }
}
