// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Z.AI Co., Ltd.
// Fuzzy scoring and bounded top-K adapted from ZCode packages/shared/src/workspaceFileSearch.ts.
// Modified for Mira: asynchronous host traversal, access checks, bounded caching and relative results.
// See third-party-licenses/zcode/{LICENSE,NOTICE.md,ADAPTATIONS.md}.
import { constants } from 'node:fs'
import { access, lstat, readdir, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { setImmediate as yieldToEventLoop } from 'node:timers/promises'
import type { HarnessWorkspaceFileEntry, HarnessWorkspaceFileSearchResult } from '../../src/config/harness'
import type { Ignore } from 'ignore'
import { loadHarnessWorkspaceSearchIgnore } from './harnessWorkspaceIgnore'

const SEARCH_LIMIT = 1000
const CACHE_TTL_MS = 60_000
const CACHE_ROOT_LIMIT = 4
const CACHE_BYTE_BUDGET = 128 * 1024 * 1024
const SCAN_CONCURRENCY = 8
const WORK_BUDGET_MS = 8

interface SearchCandidate {
  entry: HarnessWorkspaceFileEntry
  name: string
  path: string
}
interface SearchIndex { candidates: SearchCandidate[]; identity: string; bytes: number }
interface CachedIndex { index: SearchIndex; expiresAt: number; timer: ReturnType<typeof setTimeout> }

const cache = new Map<string, CachedIndex>()
const scans = new Map<string, { identity: string; promise: Promise<SearchIndex> }>()
const activeScans = new Set<Promise<SearchIndex>>()

function insideRoot(root: string, target: string) {
  const path = relative(root, target)
  return path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path)
}

function dropCachedIndex(root: string) {
  const cached = cache.get(root)
  if (cached) clearTimeout(cached.timer)
  cache.delete(root)
}

function cacheIndex(root: string, index: SearchIndex) {
  dropCachedIndex(root)
  if (index.bytes > CACHE_BYTE_BUDGET) return
  const value = { index, expiresAt: Date.now() + CACHE_TTL_MS, timer: setTimeout(() => {
    if (cache.get(root) === value) dropCachedIndex(root)
  }, CACHE_TTL_MS) }
  value.timer.unref()
  cache.set(root, value)
  while (cache.size > CACHE_ROOT_LIMIT || [...cache.values()].reduce((bytes, item) => bytes + item.index.bytes, 0) > CACHE_BYTE_BUDGET) dropCachedIndex(cache.keys().next().value!)
}

async function scanWorkspace(root: string, identity: string, rootIdentity: string, matcher: Ignore): Promise<SearchIndex> {
  const candidates: SearchCandidate[] = []
  let bytes = 0
  let deadline = performance.now() + WORK_BUDGET_MS
  const directories = ['']
  const scanDirectory = async (path: string) => {
    if (!(await lstat(resolve(root, path))).isDirectory()) throw new Error('工作目录搜索未完成')
    const target = await realpath(resolve(root, path))
    if (!insideRoot(root, target)) throw new Error('工作目录搜索未完成')
    const children = await readdir(target, { withFileTypes: true })
    for (const child of children) {
      if (performance.now() >= deadline) {
        await yieldToEventLoop()
        deadline = performance.now() + WORK_BUDGET_MS
      }
      const entryPath = path ? path + '/' + child.name : child.name
      if (entryPath === '.miraignore') continue
      let type: HarnessWorkspaceFileEntry['type']
      if (child.isSymbolicLink()) {
        try {
          const linked = await realpath(resolve(root, entryPath))
          if (!insideRoot(root, linked)) continue
          const stat = await lstat(linked)
          if (!stat.isDirectory() && !stat.isFile()) continue
          type = stat.isDirectory() ? 'directory' : 'file'
        } catch (error) {
          if (['ENOENT', 'ENOTDIR', 'ELOOP'].includes((error as NodeJS.ErrnoException)?.code || '')) continue
          throw error
        }
      } else if (child.isDirectory()) {
        type = 'directory'
      } else if (child.isFile()) type = 'file'
      else continue
      if (matcher.ignores(type === 'directory' ? entryPath + '/' : entryPath)) continue
      if (child.isDirectory()) directories.push(entryPath)
      const candidate = { entry: { name: child.name, path: entryPath, type }, name: child.name.trim().toLowerCase(), path: entryPath.trim().toLowerCase() }
      candidates.push(candidate)
      bytes += 128 + 2 * (child.name.length + entryPath.length + candidate.name.length + candidate.path.length)
      if (performance.now() >= deadline) {
        await yieldToEventLoop()
        deadline = performance.now() + WORK_BUDGET_MS
      }
    }
  }
  while (directories.length) {
    const results = await Promise.allSettled(directories.splice(-SCAN_CONCURRENCY).map(scanDirectory))
    const failed = results.find(result => result.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
  }
  const stat = await lstat(root)
  if (`${stat.dev}:${stat.ino}` !== rootIdentity) throw new Error('工作目录搜索未完成')
  return { candidates, identity, bytes }
}

async function getWorkspaceIndex(root: string, identity: string, rootIdentity: string, matcher: Ignore, refresh: boolean) {
  const pending = scans.get(root)
  if (!refresh && pending?.identity === identity) return pending.promise
  const cached = cache.get(root)
  if (!refresh && cached?.index.identity === identity && cached.expiresAt > Date.now()) {
    cache.delete(root)
    cache.set(root, cached)
    return cached.index
  }
  dropCachedIndex(root)
  const promise = (async () => {
    while (activeScans.size >= CACHE_ROOT_LIMIT) await Promise.race([...activeScans].map(scan => scan.catch(() => undefined)))
    const scan = scanWorkspace(root, identity, rootIdentity, matcher)
    activeScans.add(scan)
    try { return await scan } finally { activeScans.delete(scan) }
  })()
  scans.set(root, { identity, promise })
  try {
    const index = await promise
    // A refresh may replace the in-flight scan; only its latest result can populate the cache.
    if (scans.get(root)?.promise === promise) cacheIndex(root, index)
    return index
  } finally {
    if (scans.get(root)?.promise === promise) scans.delete(root)
  }
}

function fuzzyScore(text: string, query: string): number | null {
  if (!text) return null
  if (text.startsWith(query)) return text.length - query.length
  const substring = text.indexOf(query)
  if (substring !== -1) return 100 + substring
  let score = 200
  let start = 0
  for (const character of query) {
    const found = text.indexOf(character, start)
    if (found === -1) return null
    score += found - start
    start = found + 1
  }
  return score + text.length - query.length
}

interface ScoredCandidate { candidate: SearchCandidate; score: number }
function compare(left: ScoredCandidate, right: ScoredCandidate) {
  return left.score - right.score || Number(right.candidate.entry.type === 'directory') - Number(left.candidate.entry.type === 'directory') || left.candidate.entry.path.localeCompare(right.candidate.entry.path)
}

async function rankCandidates(candidates: SearchCandidate[], query: string, root: string): Promise<HarnessWorkspaceFileSearchResult> {
  const best: ScoredCandidate[] = []
  let matches = 0
  const absolutePrefix = root.toLowerCase() + sep
  let deadline = performance.now() + WORK_BUDGET_MS
  await yieldToEventLoop()
  for (const candidate of candidates) {
    const name = fuzzyScore(candidate.name, query)
    const path = fuzzyScore(candidate.path, query)
    const absolute = fuzzyScore(absolutePrefix + (sep === '/' ? candidate.path : candidate.path.replace(/\//g, sep)), query)
    const score = Math.min(name ?? Infinity, path === null ? Infinity : path + 25, absolute === null ? Infinity : absolute + 300)
    if (Number.isFinite(score)) {
      matches++
      const scored = { candidate, score }
      const worst = best[best.length - 1]
      if (best.length < SEARCH_LIMIT || compare(scored, worst) < 0) {
        let low = 0
        let high = best.length
        while (low < high) {
          const middle = (low + high) >>> 1
          if (compare(scored, best[middle]) < 0) high = middle
          else low = middle + 1
        }
        best.splice(low, 0, scored)
        if (best.length > SEARCH_LIMIT) best.pop()
      }
    }
    if (performance.now() >= deadline) {
      await yieldToEventLoop()
      deadline = performance.now() + WORK_BUDGET_MS
    }
  }
  return { entries: best.map(item => ({ ...item.candidate.entry })), truncated: matches > SEARCH_LIMIT }
}

export async function searchHarnessWorkspaceFiles(workspacePath: string, query: string, refresh = false, assertAuthorized?: () => void): Promise<HarnessWorkspaceFileSearchResult> {
  if (typeof query !== 'string' || query.length > 256 || /[\u0000-\u001f\u007f]/.test(query)) throw new Error('搜索关键词无效')
  if (typeof refresh !== 'boolean') throw new Error('刷新状态无效')
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return { entries: [], truncated: false }
  try {
    assertAuthorized?.()
    const root = await realpath(workspacePath)
    const stat = await lstat(root)
    if (!stat.isDirectory()) throw new Error('工作目录搜索未完成')
    await access(root, constants.R_OK)
    const rules = await loadHarnessWorkspaceSearchIgnore(root, assertAuthorized)
    const rootIdentity = `${stat.dev}:${stat.ino}`
    const index = await getWorkspaceIndex(root, rootIdentity + '|' + rules.fingerprint, rootIdentity, rules.matcher, refresh)
    const result = await rankCandidates(index.candidates, normalizedQuery, root)
    // Cached names must still resolve inside the current root before crossing the bridge.
    for (let offset = 0; offset < result.entries.length; offset += SCAN_CONCURRENCY) {
      await Promise.all(result.entries.slice(offset, offset + SCAN_CONCURRENCY).map(async entry => {
        const target = await realpath(resolve(root, entry.path))
        if (!insideRoot(root, target)) throw new Error('工作目录搜索未完成')
        const current = await lstat(target)
        if (entry.type === 'directory' ? !current.isDirectory() : !current.isFile()) throw new Error('工作目录搜索未完成')
      }))
    }
    const finalRoot = await realpath(workspacePath)
    const finalStat = await lstat(finalRoot)
    if (finalRoot !== root || !finalStat.isDirectory() || `${finalStat.dev}:${finalStat.ino}` !== rootIdentity) throw new Error('工作目录搜索未完成')
    assertAuthorized?.()
    return result
  } catch {
    throw new Error('工作目录搜索未完成')
  }
}
