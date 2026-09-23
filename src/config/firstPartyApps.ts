import { version as shellVersion } from '../../package.json'
import type { MicroApp } from '@/types'

export type FirstPartyAppSource =
  | { type: 'builtin'; packagePath: string }
  | { type: 'github-release'; repository: string; releaseTag: string; sha256: string }

export const FIRST_PARTY_CAPABILITIES = ['models:text.generate', 'storage:novel-projects'] as const
export type FirstPartyCapability = typeof FIRST_PARTY_CAPABILITIES[number]
export const PLATFORM_API_VERSION = { major: 1, minor: 0 } as const

export interface FirstPartyAppManifest {
  appId: string
  legacyIds: string[]
  enabled: boolean
  trustedSource: FirstPartyAppSource
  entry: { path: string }
  shellCompatibility: { minVersion: string; maxVersion?: string }
  apiCompatibility: { major: number; minor?: number }
  capabilities: FirstPartyCapability[]
  developmentOverride?: { enabled: boolean; entry: string }
}

const APP_ID_PATTERN = /^[a-z][a-z0-9-]*$/
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/
const CAPABILITY_SET = new Set<string>(FIRST_PARTY_CAPABILITIES)

export const firstPartyAppManifests: readonly FirstPartyAppManifest[] = []

function assertNonEmpty(value: string, field: string) {
  if (!value.trim()) throw new Error(`${field} 不能为空`)
}

function assertVersion(value: string, field: string) {
  if (!VERSION_PATTERN.test(value)) throw new Error(`${field} 必须是三段式版本号`)
}

function compareVersions(left: string, right: string) {
  const leftParts = left.split('.').map(Number)
  const rightParts = right.split('.').map(Number)
  for (let index = 0; index < 3; index++) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index]
  }
  return 0
}

export function validateFirstPartyAppManifest(manifest: FirstPartyAppManifest) {
  if (!manifest || !APP_ID_PATTERN.test(manifest.appId)) throw new Error('第一方应用 ID 无效')
  if (!Array.isArray(manifest.legacyIds) || manifest.legacyIds.some(id => !APP_ID_PATTERN.test(id))) throw new Error('第一方应用历史 ID 无效')
  if (new Set(manifest.legacyIds).size !== manifest.legacyIds.length || manifest.legacyIds.includes(manifest.appId)) throw new Error('第一方应用历史 ID 必须唯一且不能等于当前 ID')
  if (typeof manifest.enabled !== 'boolean') throw new Error('第一方应用启用状态无效')
  const entryPath = manifest.entry?.path
  if (typeof entryPath !== 'string' || !/^[a-zA-Z0-9._/-]+$/.test(entryPath)
    || entryPath.startsWith('/') || entryPath.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error('第一方应用入口必须是包内相对路径')
  }
  assertVersion(manifest.shellCompatibility.minVersion, 'Shell 最低版本')
  if (manifest.shellCompatibility.maxVersion) assertVersion(manifest.shellCompatibility.maxVersion, 'Shell 最高版本')
  if (manifest.shellCompatibility.maxVersion && compareVersions(manifest.shellCompatibility.minVersion, manifest.shellCompatibility.maxVersion) > 0) throw new Error('Shell 兼容版本范围无效')
  if (!Number.isInteger(manifest.apiCompatibility.major) || manifest.apiCompatibility.major < 1) throw new Error('API 主版本无效')
  if (manifest.apiCompatibility.minor !== undefined && (!Number.isInteger(manifest.apiCompatibility.minor) || manifest.apiCompatibility.minor < 0)) throw new Error('API 次版本无效')
  if (!Array.isArray(manifest.capabilities) || manifest.capabilities.some(capability => !CAPABILITY_SET.has(capability)) || new Set(manifest.capabilities).size !== manifest.capabilities.length) throw new Error('能力白名单无效')

  if (manifest.trustedSource.type === 'builtin') {
    assertNonEmpty(manifest.trustedSource.packagePath, '内置应用资源包')
  } else {
    assertNonEmpty(manifest.trustedSource.repository, '应用发布仓库')
    assertNonEmpty(manifest.trustedSource.releaseTag, '应用发布版本')
    if (!/^[a-f0-9]{64}$/i.test(manifest.trustedSource.sha256)) throw new Error('应用包摘要无效')
  }

  if (manifest.developmentOverride) {
    if (typeof manifest.developmentOverride.enabled !== 'boolean') throw new Error('开发覆盖入口状态无效')
    assertNonEmpty(manifest.developmentOverride.entry, '开发覆盖入口')
  }
  return manifest
}

export function resolveFirstPartyAppManifest(app: MicroApp, manifests: readonly FirstPartyAppManifest[] = firstPartyAppManifests, currentShellVersion = shellVersion) {
  const manifest = manifests.find(item => item.enabled && (item.appId === app.code || item.legacyIds.includes(app.code)))
  if (!manifest || app.id !== `micro-${app.code}` || app.entry.type !== 'builtin' || manifest.trustedSource.type !== 'builtin') return undefined
  if (app.entry.package !== manifest.trustedSource.packagePath) return undefined
  validateFirstPartyAppManifest(manifest)
  if (compareVersions(currentShellVersion, manifest.shellCompatibility.minVersion) < 0) return undefined
  if (manifest.shellCompatibility.maxVersion && compareVersions(currentShellVersion, manifest.shellCompatibility.maxVersion) > 0) return undefined
  if (manifest.apiCompatibility.major !== PLATFORM_API_VERSION.major || (manifest.apiCompatibility.minor ?? 0) > PLATFORM_API_VERSION.minor) return undefined
  return manifest
}
