import { execFileSync } from 'node:child_process'
import { chmodSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
const child='/tmp/mira-ui-project.xsM04t/mira-watch-native-BuPTxi/nested'
const probe='/tmp/mira-ui-project.xsM04t/mira-watch-native-BuPTxi/mira-permission-final-probe.txt'
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
function read(expression){const d=JSON.parse(execFileSync(process.execPath,['/tmp/mira-cdp.mjs','iframe','evaluate',expression],{encoding:'utf8'}));if(d.result.exceptionDetails)throw Error(JSON.stringify(d.result.exceptionDetails));return d.result.result.value}
async function until(expression){const end=Date.now()+12000;while(Date.now()<end){if(read(expression))return;await pause(100)}throw Error(expression)}
function log(phase,details={}){console.log(JSON.stringify({phase,at:new Date().toISOString(),...details}))}
try {
  chmodSync(child,0);writeFileSync(probe,'Mira final permission event\n')
  await until('document.querySelector(".mira-file-drawer__error[role=alert]")?.innerText.includes("没有权限")')
  const w=JSON.parse(execFileSync('/tmp/mira-zcode-cu',['windows','Electron'],{encoding:'utf8'})).find(w=>w.kCGWindowName?.includes('Mira')&&w.kCGWindowBounds.Width>500)
  const b=w.kCGWindowBounds
  execFileSync('/tmp/mira-zcode-cu',['focus',String(w.kCGWindowOwnerPID)])
  execFileSync('/tmp/mira-zcode-cu',['move','700','30'])
  const theme=read('document.documentElement.classList.contains("dark")?"dark":"light"')
  execFileSync('screencapture',['-x','-R',`${b.X},${b.Y},${b.Width},${b.Height}`,`/tmp/mira-watch-permission-${theme}-final-native.png`])
  log('native-permission-error-region-capture',{theme,bounds:b,message:read('document.querySelector(".mira-file-drawer__error[role=alert]").innerText'),style:read('(()=>{const e=document.querySelector(".mira-file-drawer__error[role=alert]");return {foreground:getComputedStyle(e).color,background:getComputedStyle(document.querySelector(".mira-file-drawer")).backgroundColor}})()')})
} finally {chmodSync(child,0o755);if(existsSync(probe))unlinkSync(probe)}
execFileSync(process.execPath,['/tmp/mira-act.mjs','.mira-file-drawer button[aria-label="重试文件自动刷新"]'])
await until('!document.querySelector(".mira-file-drawer__error[role=alert]")')
log('permission-retry-restored',{passed:true})
