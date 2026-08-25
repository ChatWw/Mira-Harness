import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MiraPaths } from '../electron/miraPaths'
import { redactLogValue, RunLogStore } from '../electron/runLogStore'

const directories: string[] = []
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })))

describe('RunLogStore', () => {
  it('redacts secret fields and writes inspectable JSONL records', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mira-logs-')); directories.push(directory)
    const paths = new MiraPaths(directory).ensure()
    new RunLogStore(paths).write({ event: 'tool', sessionId: 's1', tool: 'web_fetch', target: 'token=secret-value', result: 'Bearer sk-123456789012345', status: 'completed', timestamp: Date.UTC(2026, 0, 2) })
    const output = readFileSync(join(paths.logs, 'harness-2026-01-02.jsonl'), 'utf8')
    expect(output).toContain('"event":"tool"')
    expect(output).toContain('token=***')
    expect(output).not.toContain('secret-value')
    expect(output).not.toContain('sk-123456789012345')
    expect(redactLogValue('anything', 'apiKey')).toBe('***')
  })
})
