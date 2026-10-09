// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Z.AI Co., Ltd.
// Rule templates and partitioned edits adapted from ZCode workspaceFileIgnore.ts.
// Modified for Mira: bounded reads, non-following file access, revision checks and safe initialization.
// See third-party-licenses/zcode/{LICENSE,NOTICE.md,ADAPTATIONS.md}.
import { constants, type BigIntStats } from 'node:fs'
import { lstat, open, realpath, link, rename, unlink } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { TextDecoder } from 'node:util'
import ignore, { type Ignore } from 'ignore'
import { HARNESS_SEARCH_IGNORE_ERRORS, type HarnessWorkspaceSearchIgnoreDocument, type HarnessWorkspaceSearchIgnoreTransform } from '../../src/config/harness'

const RULE_FILE = '.miraignore'
const BYTE_LIMIT = 256 * 1024
const SEED_MARKER = '# === Mira: end of .gitignore seed ==='
const DEFAULT_MARKER = '# === Mira: end of default search exclusions ==='
const DEFAULT_RULES = [
  '.git/', '.hg/', '.svn/', 'node_modules/', 'bower_components/', 'jspm_packages/',
  '__pycache__/', 'site-packages/', 'venv/', 'coverage/', 'htmlcov/', 'lcov-report/',
  'cmakefiles/', 'cmake-build-*/', 'bazel-*/', 'pods/', 'deriveddata/', 'storybook-static/',
  'playwright-report/', 'test-results/', 'allure-results/', 'allure-report/', 'cdk.out/',
  '*.egg-info/', '*.dist-info/', 'eggs/', 'pip-wheel-metadata/', 'wheels/',
]
const HEADER = '# Mira 文件搜索忽略规则（.miraignore）\n# 使用 .gitignore 语法；只影响文件搜索，不限制文件浏览或 Agent 访问。\n# .gitignore 后续变更不会自动同步。\n'
const writes = new Map<string, Promise<unknown>>()

interface WorkspaceRoot { path: string; requestedPath: string; identity: string }
interface RuleFile { content: string; stat: BigIntStats }

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (HARNESS_SEARCH_IGNORE_ERRORS.some(value => value === message)) return error as Error
  if (isPermissionError(error)) return new Error('没有权限读取或保存忽略规则')
  return new Error('忽略规则操作失败，请重试')
}

function isPermissionError(error: unknown) {
  return ['EACCES', 'EPERM', 'EROFS'].includes((error as NodeJS.ErrnoException)?.code || '')
}

function identity(stat: BigIntStats) { return `${stat.dev}:${stat.ino}` }
function hash(content: string) { return createHash('sha256').update(content).digest('hex') }
function version(stat: BigIntStats) { return `${identity(stat)}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}` }

async function getRoot(requestedPath: string): Promise<WorkspaceRoot> {
  try {
    if (typeof requestedPath !== 'string' || !requestedPath || requestedPath.includes('\0')) throw new Error('工作目录无效')
    const path = await realpath(requestedPath)
    const stat = await lstat(path, { bigint: true })
    if (!stat.isDirectory()) throw new Error('工作目录无效')
    return { path, requestedPath, identity: identity(stat) }
  } catch { throw new Error('工作目录无效') }
}

async function assertRoot(root: WorkspaceRoot) {
  try {
    const current = await realpath(root.requestedPath)
    const canonical = await realpath(root.path)
    const stat = await lstat(root.path, { bigint: true })
    if (current !== root.path || canonical !== root.path || !stat.isDirectory() || identity(stat) !== root.identity) throw new Error()
  } catch { throw new Error('工作目录在操作期间发生变化，请重试') }
}

function decode(content: Buffer) {
  if (content.includes(0)) throw new Error('忽略规则必须是 UTF-8 文本')
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(content) }
  catch { throw new Error('忽略规则必须是 UTF-8 文本') }
}

function validateContent(content: string) {
  if (typeof content !== 'string') throw new Error('忽略规则必须是 UTF-8 文本')
  const bytes = Buffer.from(content, 'utf8')
  if (bytes.byteLength > BYTE_LIMIT) throw new Error('忽略规则文件超过 256 KiB')
  if (decode(bytes) !== content) throw new Error('忽略规则必须是 UTF-8 文本')
  return bytes
}

async function readRule(root: WorkspaceRoot, name: '.miraignore' | '.gitignore'): Promise<RuleFile | null> {
  await assertRoot(root)
  const path = resolve(root.path, name)
  let initial: BigIntStats
  try { initial = await lstat(path, { bigint: true }) }
  catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error
    await assertRoot(root)
    return null
  }
  if (!initial.isFile() || initial.isSymbolicLink()) throw new Error('忽略规则文件不能是链接或特殊文件')
  if (initial.size > BigInt(BYTE_LIMIT)) throw new Error('忽略规则文件超过 256 KiB')
  let handle: Awaited<ReturnType<typeof open>>
  try { handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)) }
  catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ELOOP') throw new Error('忽略规则文件不能是链接或特殊文件')
    throw error
  }
  try {
    const opened = await handle.stat({ bigint: true })
    if (!opened.isFile() || version(initial) !== version(opened)) throw new Error('忽略规则在操作期间发生变化，请重试')
    const bytes = Buffer.alloc(Number(initial.size) + 1)
    let length = 0
    while (length < bytes.byteLength) {
      const result = await handle.read(bytes, length, bytes.byteLength - length, length)
      if (!result.bytesRead) break
      length += result.bytesRead
    }
    if (BigInt(length) !== initial.size || version(initial) !== version(await handle.stat({ bigint: true }))) throw new Error('忽略规则在操作期间发生变化，请重试')
    await assertRoot(root)
    if (version(initial) !== version(await lstat(path, { bigint: true }))) throw new Error('忽略规则在操作期间发生变化，请重试')
    return { content: decode(bytes.subarray(0, length)), stat: initial }
  } finally { await handle.close() }
}

function seedSection(content: string | null) {
  return content?.trim() ? content + (content.endsWith('\n') ? '' : '\n') : HEADER
}

function defaultSection(seed: string) {
  const declared = new Set(seed.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#') && !line.startsWith('!')).map(line => line.replace(/\/$/, '')))
  return DEFAULT_RULES.filter(line => !declared.has(line.replace(/\/$/, ''))).join('\n') + '\n'
}

function template(seed: string | null) {
  const head = seedSection(seed)
  return head + SEED_MARKER + '\n' + defaultSection(head) + DEFAULT_MARKER + '\n# 自定义规则写在下方\n'
}

async function document(root: WorkspaceRoot): Promise<HarnessWorkspaceSearchIgnoreDocument> {
  const file = await readRule(root, RULE_FILE)
  if (file) return { content: file.content, source: 'file', revision: `${root.identity}|file|${version(file.stat)}|${hash(file.content)}` }
  const content = template((await readRule(root, '.gitignore'))?.content ?? null)
  validateContent(content)
  return { content, source: 'template', revision: `${root.identity}|template|${hash(content)}` }
}

async function serialized<T>(root: WorkspaceRoot, action: () => Promise<T>): Promise<T> {
  const previous = writes.get(root.path)
  const pending = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(action)
  writes.set(root.path, pending)
  try { return await pending }
  finally { if (writes.get(root.path) === pending) writes.delete(root.path) }
}

async function atomicWrite(root: WorkspaceRoot, content: string, initialize: boolean, beforeCommit: () => Promise<void>, assertAuthorized?: () => void) {
  const bytes = validateContent(content)
  await assertRoot(root)
  const existing = initialize ? null : await lstat(resolve(root.path, RULE_FILE), { bigint: true })
  if (existing && !existing.isFile()) throw new Error('忽略规则文件不能是链接或特殊文件')
  const temporary = resolve(root.path, `.miraignore.${randomUUID()}.tmp`)
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o644)
    await assertRoot(root)
    if (existing) await handle.chmod(Number(existing.mode & 0o777n))
    await handle.writeFile(bytes)
    await handle.sync()
    await handle.close()
    handle = undefined
    await beforeCommit()
    await assertRoot(root)
    // Recheck synchronously: the awaited filesystem checks may have outlived the grant.
    assertAuthorized?.()
    // Hard-link initialization is atomic and cannot replace a concurrently created rules file.
    if (initialize) await link(temporary, resolve(root.path, RULE_FILE))
    else await rename(temporary, resolve(root.path, RULE_FILE))
    await assertRoot(root)
  } finally {
    await handle?.close().catch(() => undefined)
    await unlink(temporary).catch(() => undefined)
  }
}

export async function readHarnessWorkspaceSearchIgnore(workspacePath: string): Promise<HarnessWorkspaceSearchIgnoreDocument> {
  try { return await document(await getRoot(workspacePath)) }
  catch (error) { throw safeError(error) }
}

export async function transformHarnessWorkspaceSearchIgnore(workspacePath: string, draft: string, transform: HarnessWorkspaceSearchIgnoreTransform): Promise<{ content: string }> {
  try {
    validateContent(draft)
    if (transform !== 'sync-gitignore' && transform !== 'reset-defaults') throw new Error('忽略规则变换无效')
    const root = await getRoot(workspacePath)
    const markers: Array<{ value: string; start: number; end: number }> = []
    let offset = 0
    for (const line of draft.split('\n')) {
      if (line.trim() === SEED_MARKER || line.trim() === DEFAULT_MARKER) markers.push({ value: line.trim(), start: offset, end: Math.min(draft.length, offset + line.length + 1) })
      offset += line.length + 1
    }
    if (markers.length !== 2 || markers[0].value !== SEED_MARKER || markers[1].value !== DEFAULT_MARKER) throw new Error('忽略规则分区标记缺失或重复，请手动保留规则')
    const [seed, defaults] = markers
    const content = transform === 'sync-gitignore'
      ? seedSection((await readRule(root, '.gitignore'))?.content ?? null) + draft.slice(seed.start)
      : draft.slice(0, seed.end) + defaultSection(draft.slice(0, seed.start)) + draft.slice(defaults.start)
    await assertRoot(root)
    validateContent(content)
    return { content }
  } catch (error) { throw safeError(error) }
}

export async function writeHarnessWorkspaceSearchIgnore(workspacePath: string, content: string, expectedRevision: string, assertAuthorized?: () => void): Promise<HarnessWorkspaceSearchIgnoreDocument> {
  try {
    validateContent(content)
    if (typeof expectedRevision !== 'string' || !expectedRevision) throw new Error('忽略规则已被修改，请重新载入')
    const root = await getRoot(workspacePath)
    return await serialized(root, async () => {
      assertAuthorized?.()
      const current = await document(root)
      if (current.revision !== expectedRevision) throw new Error('忽略规则已被修改，请重新载入')
      try {
        await atomicWrite(root, content, current.source === 'template', async () => {
          assertAuthorized?.()
          if ((await document(root)).revision !== expectedRevision) throw new Error('忽略规则已被修改，请重新载入')
        }, assertAuthorized)
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') throw new Error('忽略规则已被修改，请重新载入')
        throw error
      }
      return document(root)
    })
  } catch (error) { throw safeError(error) }
}

export async function loadHarnessWorkspaceSearchIgnore(workspacePath: string, assertAuthorized?: () => void): Promise<{ matcher: Ignore; fingerprint: string }> {
  try {
    const root = await getRoot(workspacePath)
    const load = async () => {
      assertAuthorized?.()
      const current = await document(root)
      if (current.source === 'file') return current
      try { await atomicWrite(root, current.content, true, async () => { assertAuthorized?.(); await assertRoot(root) }, assertAuthorized) }
      catch (error) { if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') throw error }
      return document(root)
    }
    let rules: HarnessWorkspaceSearchIgnoreDocument
    try { rules = await serialized(root, load) }
    catch (error) {
      if (!isPermissionError(error)) throw error
      let seed: RuleFile | null = null
      try { seed = await readRule(root, '.gitignore') }
      catch (seedError) { if (!isPermissionError(seedError)) throw seedError }
      const content = template(seed?.content ?? null)
      validateContent(content)
      await assertRoot(root)
      rules = { content, source: 'template', revision: `${root.identity}|memory|${hash(content)}` }
    }
    assertAuthorized?.()
    return { matcher: ignore().add(rules.content), fingerprint: rules.revision }
  } catch (error) { throw safeError(error) }
}
