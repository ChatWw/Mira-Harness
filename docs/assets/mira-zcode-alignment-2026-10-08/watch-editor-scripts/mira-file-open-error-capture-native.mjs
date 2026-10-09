import {execFileSync} from 'node:child_process'
import {renameSync,existsSync} from 'node:fs'
const file='/tmp/mira-ui-project.xsM04t/mira-watch-native-BuPTxi/nested/live.txt',backup=`${file}.mira-editor-error-capture`
const pause=ms=>new Promise(r=>setTimeout(r,ms))
function read(e){const d=JSON.parse(execFileSync(process.execPath,['/tmp/mira-cdp.mjs','iframe','evaluate',e],{encoding:'utf8'}));if(d.result.exceptionDetails)throw Error(JSON.stringify(d.result.exceptionDetails));return d.result.result.value}
async function until(e){const end=Date.now()+12000;while(Date.now()<end){if(read(e))return;await pause(100)}throw Error(e)}
if(existsSync(backup))throw Error('backup already exists')
try {
  renameSync(file,backup)
  await until('document.querySelector(".pilot-panel-view.is-active .mira-file-preview__notice[role=alert]")?.innerText.includes("已不存在")')
  execFileSync(process.execPath,['/tmp/mira-act.mjs','.pilot-panel-view.is-active button[aria-label="在 Finder 中打开"]'])
  await until('!!document.querySelector(".pilot-panel-view.is-active .mira-file-preview__feedback.is-error")')
  const w=JSON.parse(execFileSync('/tmp/mira-zcode-cu',['windows','Electron'],{encoding:'utf8'})).find(w=>w.kCGWindowName?.includes('Mira')&&w.kCGWindowBounds.Width>500),b=w.kCGWindowBounds
  execFileSync('/tmp/mira-zcode-cu',['move','700','30'])
  const theme=read('document.documentElement.classList.contains("dark")?"dark":"light"')
  execFileSync('screencapture',['-x','-R',`${b.X},${b.Y},${b.Width},${b.Height}`,`/tmp/mira-editor-open-error-${theme}-final-native.png`])
  console.log(JSON.stringify({phase:'native-file-open-error-confirmation',theme,at:new Date().toISOString(),bounds:b,style:read('(()=>{const e=document.querySelector(".pilot-panel-view.is-active .mira-file-preview__notice[role=alert]");return {foreground:getComputedStyle(e).color,background:getComputedStyle(document.querySelector(".pilot-panel-view.is-active .mira-file-preview")).backgroundColor}})()')}))
} finally {if(existsSync(backup))renameSync(backup,file)}
await until('document.querySelector(".pilot-panel-view.is-active .mira-file-preview")?.innerText.includes("Mira reload 10 notification")')
execFileSync(process.execPath,['/tmp/mira-act.mjs','.pilot-panel-view.is-active button[aria-label="关闭提示"]'])
execFileSync(process.execPath,['/tmp/mira-act.mjs','.pilot-panel-view.is-active button[aria-label="在 Finder 中打开"]'])
console.log(JSON.stringify({phase:'native-file-open-error-confirmation-restored',at:new Date().toISOString()}))
