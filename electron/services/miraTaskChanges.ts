/* Task file snapshots and net diffs adapted from ZCode taskChangeSummary.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode. */
import type { ExecutionEnv } from '@earendil-works/pi-agent-core'
import { createTwoFilesPatch, OMIT_HEADERS } from 'diff'
import { miraTaskLineChanges, type MiraTaskChangedFile } from '../../src/config/miraTaskChanges'
import { publicHarnessText } from './agentTools'

export interface MiraTaskFileSnapshot {
  path: string
  before: string | null | undefined
  after: string | null | undefined
}

const SNAPSHOT_BYTES = 1024 * 1024

/** Missing files are known empty baselines; unreadable/binary/large files are unknown. */
export async function readMiraTaskFile(env: ExecutionEnv, path: string): Promise<string | null | undefined> {
  const info = await env.fileInfo(path)
  if (!info.ok) return info.error.code === 'not_found' ? null : undefined
  if (info.value.kind !== 'file' || info.value.size > SNAPSHOT_BYTES) return undefined
  const result = await env.readTextFile(path)
  return result.ok && Buffer.byteLength(result.value) <= SNAPSHOT_BYTES && !result.value.includes('\0') ? result.value : undefined
}

export function buildMiraTaskFileChange(key: string, path: string, tool: MiraTaskChangedFile['tool'], writes: number, before: string | null | undefined, after: string | null | undefined, secrets: string[]): MiraTaskChangedFile {
  const file: MiraTaskChangedFile = { key, path: publicHarnessText(path, secrets).text, tool, writes }
  if (before === undefined || after === undefined) return { ...file, unavailable: true }
  if (before === after) return { ...file, added: 0, removed: 0, unchanged: true, diff: '' }
  const stats = miraTaskLineChanges(before, after)
  const raw = createTwoFilesPatch('', '', before || '', after || '', undefined, undefined, { timeout: 25, context: 3, headerOptions: OMIT_HEADERS })
  if (raw === undefined) return { ...file, ...stats, diffTruncated: true }
  const diff = publicHarnessText(raw.trimEnd(), secrets)
  return { ...file, ...stats, diff: diff.text, ...(diff.truncated ? { diffTruncated: true } : {}) }
}
