import { describe, expect, it } from 'vitest'
import { miraFlowChildEnvironment } from '../packages/mira-flow-runtime/src/mira-environment'

describe('workflow child environment', () => {
  it('preserves OS startup paths while excluding host provider and loader secrets', () => {
    const result = miraFlowChildEnvironment({
      PATH: '/usr/bin', HOME: '/home/user', TMPDIR: '/tmp', SystemRoot: 'C:\\Windows',
      OPENAI_API_KEY: 'host-key', MIRA_PROVIDER_TOKEN: 'host-token', NODE_OPTIONS: '--require /host-loader',
      ELECTRON_RUN_AS_NODE: '0',
    })
    expect(result).toEqual({ PATH: '/usr/bin', HOME: '/home/user', TMPDIR: '/tmp', SystemRoot: 'C:\\Windows', ELECTRON_RUN_AS_NODE: '1' })
  })
  it('does not mutate the supplied host environment', () => {
    const supplied = { PATH: '/usr/bin', API_KEY: 'secret' }
    expect(miraFlowChildEnvironment(supplied)).not.toBe(supplied)
    expect(supplied).toEqual({ PATH: '/usr/bin', API_KEY: 'secret' })
  })
  it('sets the Electron child mode with no unnecessary default values', () => {
    expect(miraFlowChildEnvironment({})).toEqual({ ELECTRON_RUN_AS_NODE: '1' })
  })
})
