import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'

const { run } = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('node:child_process', () => ({ execFileSync: run }))

const originalArgv = process.argv
beforeEach(() => {
  vi.resetModules()
  run.mockReset()
  process.argv = [process.execPath, resolve('scripts/build.mjs')]
})
afterEach(() => { process.argv = originalArgv })

describe('production build pipeline', () => {
  it.each([false, true])('keeps type checks and app resources when packaging=%s', async packaging => {
    if (packaging) process.argv.push('--skip-tools')
    await import('../scripts/build.mjs')
    const steps = run.mock.calls.map(([, args]) => args)
    expect(steps.slice(0, 2)).toEqual([
      [resolve('node_modules/vue-tsc/bin/vue-tsc.js'), '--noEmit'],
      [resolve('node_modules/typescript/bin/tsc'), '--noEmit', '-p', 'apps/harness-react/tsconfig.json'],
    ])
    expect(steps).toContainEqual([resolve('scripts/build-harness-react.mjs')])
    expect(steps).toContainEqual([resolve('scripts/build-mira-flow.mjs')])
    expect(steps.filter(args => args[0] === resolve('scripts/build-mira-tools.mjs'))).toHaveLength(packaging ? 0 : 1)
    expect(steps.at(-1)).toEqual([resolve('node_modules/electron-vite/bin/electron-vite.js'), 'build'])
  })

  it.each([1, 2])('stops before building assets if type check %s fails', async check => {
    if (check === 2) run.mockImplementationOnce(() => undefined)
    run.mockImplementationOnce(() => { throw new Error('type check failed') })
    await expect(import('../scripts/build.mjs')).rejects.toThrow('type check failed')
    expect(run).toHaveBeenCalledTimes(check)
  })
})
