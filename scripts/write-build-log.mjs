import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const getCommandOutput = (command, args) => execFileSync(command, args, {
  encoding: 'utf8',
}).trim()

export function writeBuildLog({ startedAt, durationMilliseconds }) {
  const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
  const recentCommits = getCommandOutput('git', [
    'log',
    '-3',
    '--format=%h | %ci | %s',
  ])
  const gitStatus = getCommandOutput('git', ['status', '--porcelain'])
  const npmVersion = process.env.npm_config_user_agent
    ?.match(/npm\/([^\s]+)/)?.[1] ?? 'unknown'
  const viteVersion = getCommandOutput('vite', ['--version'])

  writeFileSync(
    resolve('dist/build-log.txt'),
    [
      `打包时间：${startedAt.toLocaleString('zh-CN', { hour12: false })}`,
      `构建耗时：${(durationMilliseconds / 1000).toFixed(2)} 秒`,
      `分支：${getCommandOutput('git', ['branch', '--show-current'])}`,
      `提交：${getCommandOutput('git', ['rev-parse', 'HEAD'])}`,
      `工作区状态：${gitStatus ? 'dirty（存在未提交改动）' : 'clean'}`,
      `项目版本：${packageJson.version}`,
      `构建环境：Node.js ${process.version} / npm ${npmVersion} / ${viteVersion}`,
      '',
      '最近三次 Git 提交：',
      recentCommits,
      '',
    ].join('\n'),
  )
}
