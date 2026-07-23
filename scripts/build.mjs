import { execFileSync } from 'node:child_process'
import { writeBuildLog } from './write-build-log.mjs'

const startedAt = new Date()
const startedAtNanoseconds = process.hrtime.bigint()

execFileSync('vue-tsc', { stdio: 'inherit' })
execFileSync('vite', ['build'], { stdio: 'inherit' })

writeBuildLog({
  startedAt,
  durationMilliseconds: Number(process.hrtime.bigint() - startedAtNanoseconds) / 1e6,
})
