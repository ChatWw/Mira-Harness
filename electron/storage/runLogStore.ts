import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { MiraPaths } from './miraPaths'

const SENSITIVE_KEY = /(?:api[_-]?key|authorization|token|secret|password|cookie)/i
const SENSITIVE_VALUE = /\b(?:sk|rk|pk)-[a-z0-9_-]{12,}|bearer\s+[a-z0-9._-]+/ig
const SENSITIVE_PAIR = /((?:api[_-]?key|authorization|token|secret|password|cookie)\s*[=:]\s*)[^\s,;&]+/ig
const MAX_VALUE_LENGTH = 480

export interface RuntimeLogRecord {
  event: 'run' | 'tool'
  sessionId: string
  status: 'running' | 'completed' | 'failed' | 'aborted'
  timestamp: number
  durationMs?: number
  projectId?: string
  providerId?: string
  modelId?: string
  tool?: string
  target?: string
  result?: string
  error?: string
}

export function redactLogValue(value: unknown, key = ''): string {
  if (SENSITIVE_KEY.test(key)) return '***'
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (!text) return ''
  return text.replace(SENSITIVE_PAIR, '$1***').replace(SENSITIVE_VALUE, '***').slice(0, MAX_VALUE_LENGTH)
}

export class RunLogStore {
  constructor(private readonly paths: MiraPaths) {}

  write(record: RuntimeLogRecord) {
    mkdirSync(this.paths.logs, { recursive: true })
    const day = new Date(record.timestamp).toISOString().slice(0, 10)
    const value: RuntimeLogRecord = {
      ...record,
      ...(record.target ? { target: redactLogValue(record.target, 'target') } : {}),
      ...(record.result ? { result: redactLogValue(record.result, 'result') } : {}),
      ...(record.error ? { error: redactLogValue(record.error, 'error') } : {}),
    }
    appendFileSync(join(this.paths.logs, `harness-${day}.jsonl`), `${JSON.stringify(value)}\n`, 'utf8')
  }
}
