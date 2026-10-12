// Mira host adaptation: workflow transport children need OS paths, not model credentials.
const STARTUP_KEYS = new Set([
  'PATH', 'HOME', 'USERPROFILE', 'TMPDIR', 'TEMP', 'TMP',
  'SYSTEMROOT', 'WINDIR', 'LANG', 'LC_ALL',
])

export function miraFlowChildEnvironment(host: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(host)) {
    if (STARTUP_KEYS.has(key.toUpperCase()) && value !== undefined) environment[key] = value
  }
  environment.ELECTRON_RUN_AS_NODE = '1'
  return environment
}
