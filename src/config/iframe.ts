import type { IframePolicy, IframeProfile } from '@/types'

export const MAX_IFRAME_LOAD_WAIT = 5

const SANDBOX_BY_PROFILE: Record<Exclude<IframeProfile, 'external'>, string> = {
  strict: 'allow-scripts allow-forms allow-popups',
  compatible: 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads',
}

export const DEFAULT_IFRAME_POLICY: Required<IframePolicy> = {
  profile: 'compatible',
  referrerPolicy: 'strict-origin-when-cross-origin',
  timeout: MAX_IFRAME_LOAD_WAIT,
}

export function resolveIframePolicy(policy?: IframePolicy): Required<IframePolicy> {
  const resolved = {
    ...DEFAULT_IFRAME_POLICY,
    ...policy,
  }
  return { ...resolved, timeout: Math.min(resolved.timeout, MAX_IFRAME_LOAD_WAIT) }
}

export function getIframeSandbox(profile: IframeProfile) {
  return profile === 'external' ? undefined : SANDBOX_BY_PROFILE[profile]
}

export function resolveHttpUrl(url: string, base = window.location.origin) {
  const resolved = new URL(url, base)
  if (!['http:', 'https:'].includes(resolved.protocol)) {
    throw new Error('入口必须是 HTTP(S) 网页地址')
  }
  return resolved.href
}
