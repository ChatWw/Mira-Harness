import { FileError, err, ok, type ExecutionEnv, type Result } from '@earendil-works/pi-agent-core'
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node'
import { existsSync, realpathSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { diffLines } from 'diff'

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

  const assertInside = (value: string): Result<string, FileError> => {
    const target = resolve(root, value)
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
    // 以下方法不做沙箱（路径无关或由调用方保证），直接委托 base。
    // 注意：class 的实例方法在原型上，`...base` 不会复制它们，必须显式委托。
    joinPath: (parts: string[], signal?: AbortSignal) => base.joinPath(parts, signal),
    exec: (command: string, options?: any) => base.exec(command, options),
    createTempDir: (prefix?: string, signal?: AbortSignal) => base.createTempDir(prefix, signal),
    createTempFile: (options?: { prefix?: string, suffix?: string }) => base.createTempFile(options),
    cleanup: () => base.cleanup(),
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
