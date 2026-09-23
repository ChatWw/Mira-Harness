import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)

export class PythonEnvironment {
  private candidates() {
    const executable = process.platform === 'win32' ? 'python.exe' : 'python'
    return [
      process.env.MIRA_PYTHON_PATH,
      join(process.resourcesPath, 'python', process.platform === 'win32' ? executable : 'bin/python'),
      process.platform === 'win32' ? 'python' : 'python3',
    ].filter((value): value is string => Boolean(value))
  }

  async status() {
    for (const candidate of this.candidates()) {
      try {
        const command = existsSync(candidate) ? candidate : candidate
        const { stdout } = await exec(command, ['--version'], { timeout: 5000 })
        return { ready: true, path: command, version: stdout.trim(), bundled: command.includes(`${join('resources', 'python')}`) || command.includes(`${join('Resources', 'python')}`) }
      } catch { /* try the next candidate */ }
    }
    return { ready: false, path: '', version: '', bundled: false }
  }

  async run(script: string, args: string[] = []) {
    const status = await this.status()
    if (!status.ready) throw new Error('未找到 Python 运行时')
    const result = await exec(status.path, [script, ...args], { timeout: 120000, maxBuffer: 1024 * 1024 })
    return { stdout: result.stdout, stderr: result.stderr, code: 0 }
  }

  async install(packageName: string) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(packageName)) throw new Error('包名只能包含字母、数字、点、下划线和连字符')
    const status = await this.status()
    if (!status.ready) throw new Error('未找到 Python 运行时')
    const result = await exec(status.path, ['-m', 'pip', 'install', packageName], { timeout: 300000, maxBuffer: 1024 * 1024 })
    return { stdout: result.stdout, stderr: result.stderr, code: 0 }
  }
}
