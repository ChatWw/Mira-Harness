import { spawn } from 'node:child_process'

const processes = [
  spawn('npm', ['run', 'desktop:dev'], { stdio: 'inherit' }),
  spawn(process.execPath, ['prototypes/harness-react/dev.mjs'], { stdio: 'inherit' }),
]

let closing = false
function closeAll(signal = 'SIGTERM') {
  if (closing) return
  closing = true
  for (const child of processes) if (child.exitCode === null) child.kill(signal)
}

process.on('SIGINT', () => closeAll('SIGINT'))
process.on('SIGTERM', () => closeAll('SIGTERM'))
for (const child of processes) {
  child.on('exit', (code) => {
    if (!closing) {
      process.exitCode = code || 0
      closeAll()
    }
  })
}
