import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { build } from 'esbuild'
import { expect, it } from 'vitest'

const run = promisify(execFile)
const electron = createRequire(import.meta.url)('electron') as string

it('keeps tables local to the real assistant reply during streaming, completion and history reopening', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'mira-markdown-layout-'))
  try {
    await build({ stdin: { contents: fixture, resolveDir: process.cwd(), loader: 'tsx' }, outfile: resolve(directory, 'fixture.js'), bundle: true, jsx: 'automatic', loader: { '.png': 'dataurl', '.svg': 'dataurl' }, define: { MIRA_HIGHLIGHT_WORKER_PATH: '""' } })
    await run(resolve('node_modules/.bin/tailwindcss'), ['-i', resolve('apps/harness-react/src/styles/app.css'), '-o', resolve(directory, 'fixture.css'), '--minify'])
    await writeFile(resolve(directory, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>')
    await writeFile(resolve(directory, 'main.cjs'), main)
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS
    const { stdout } = await run(electron, [resolve(directory, 'main.cjs')], { env, timeout: 20000, maxBuffer: 1024 * 1024 })
    const result = JSON.parse(stdout.split('\n').find(line => line.startsWith('MARKDOWN_LAYOUT='))!.slice('MARKDOWN_LAYOUT='.length))
    expect(result.errors).toEqual([])
    expect(result.measurements).toHaveLength(12)
    for (const item of result.measurements) {
      expect(item.contentWidth, JSON.stringify(item)).toBeLessThanOrEqual(item.availableWidth + 1)
      expect(item.paragraphWidth, JSON.stringify(item)).toBeLessThanOrEqual(item.availableWidth + 1)
      expect(item.paragraphHeight).toBeGreaterThan(40)
      expect(item.paragraphCount).toBe(2)
      expect(item.conversationOverflow, JSON.stringify(item)).toBe(false)
      expect(item.tableOverflow, JSON.stringify(item)).toBe(true)
      expect(item.tableScrolled, JSON.stringify(item)).toBe(true)
      expect(item.codeScrolled, JSON.stringify(item)).toBe(true)
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 30000)

const fixture = `
import React from 'react'
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
import {AssistantMessage} from './apps/harness-react/src/components/conversation/MiraConversationMessages'
import {applyHostTheme} from './apps/harness-react/src/platform/theme'
import {miraCodeHighlighter} from './apps/harness-react/src/lib/code-highlighter'
// Keep source text intact; this fixture tests geometry without a Worker runtime.
miraCodeHighlighter.highlight=async ({code})=>({tokens:code.split('\\n').map(content=>[{content,offset:0}])})
const paragraph='这里是需要正常换行的正文，长表格不应该把正文和整个对话撑到屏幕外。'.repeat(10)
const content=paragraph+'\\n\\n| 运营商 | 最低档 | 套餐内容 | 说明 |\\n| --- | --- | --- | --- |\\n| 中国移动 | 8元/月 | '+ '包含语音流量和其他套餐说明'.repeat(60)+' | 全国统一在售 |\\n| 中国联通 | 5元/月 | '+ 'x'.repeat(400)+' | 各地政策不同 |\\n\\n'+paragraph+'\\n\\n'+ '\\x60\\x60\\x60text\\n'+ 'code'.repeat(100)+'\\n\\x60\\x60\\x60'
const root=createRoot(document.getElementById('root'))
const startedAt=Date.now()-68000
window.renderMode=mode=>{
  const streaming=mode==='streaming'
  const original={id:'reply',role:'assistant',content,createdAt:startedAt,run:{startedAt,durationMs:68000,status:streaming?'running':'completed'},parts:[
    {id:'reasoning',type:'reasoning',text:'查询运营商资费信息。',state:'complete',startedAt,completedAt:startedAt+1000},
    {id:'text',type:'text',text:content,state:streaming?'streaming':'complete',startedAt}
  ]}
  flushSync(()=>root.render(<div className="mira-message-column mx-auto flex w-full flex-col gap-5 px-5 pt-16"><AssistantMessage key={mode==='history'?'reopened':'live'} original={original} rendererId="reply" streaming={streaming}/></div>))
}
window.renderMode('streaming')
window.theme=dark=>applyHostTheme(document.getElementById('root'),{theme:dark?'dark':'light'})
window.measure=()=>{const row=document.querySelector('.message-row'),markdown=row.querySelector('.message-markdown'),paragraphs=[...markdown.querySelectorAll('p')],table=markdown.querySelector('table'),scroll=row.querySelector('.markdown-table-scroll')||table.parentElement,code=markdown.querySelector('[data-streamdown="code-block-body"]')||markdown.querySelector('pre');scroll.scrollLeft=100;code.scrollLeft=100;return {availableWidth:document.querySelector('.mira-message-column').clientWidth-40,contentWidth:markdown.getBoundingClientRect().width,paragraphCount:paragraphs.length,paragraphWidth:Math.max(...paragraphs.map(p=>p.getBoundingClientRect().width)),paragraphHeight:Math.min(...paragraphs.map(p=>p.getBoundingClientRect().height)),conversationOverflow:row.scrollWidth>row.clientWidth+1,tableOverflow:scroll.scrollWidth>scroll.clientWidth,tableScrolled:scroll.scrollLeft>0,codeScrolled:code.scrollLeft>0}}
`

const main = `
const {app,BrowserWindow}=require('electron')
const path=require('node:path'),fs=require('node:fs')
app.setPath('userData',path.join(__dirname,'profile'))
app.whenReady().then(async()=>{
  const window=new BrowserWindow({width:1360,height:1000,show:false})
  const errors=[]
  window.webContents.on('console-message',(_event,level,message)=>{if(level===3)errors.push(message)})
  try{
    await window.loadFile(path.join(__dirname,'index.html'))
    await new Promise(resolve=>setTimeout(resolve,500))
    const measurements=[]
    for(const dark of [false,true])for(const width of [840,560])for(const mode of ['streaming','completed','history']){
      await window.webContents.executeJavaScript('window.renderMode('+JSON.stringify(mode)+');window.theme('+dark+');document.querySelector(".mira-message-column").style.width="'+width+'px"')
      await new Promise(resolve=>setTimeout(resolve,60))
      measurements.push({dark,width,mode,...await window.webContents.executeJavaScript('window.measure()')})
      if(process.env.MIRA_MARKDOWN_CAPTURE_DIR && mode==='completed'){
        fs.mkdirSync(process.env.MIRA_MARKDOWN_CAPTURE_DIR,{recursive:true})
        fs.writeFileSync(path.join(process.env.MIRA_MARKDOWN_CAPTURE_DIR,(dark?'dark':'light')+'-'+width+'.png'),(await window.webContents.capturePage()).toPNG())
      }
    }
    console.log('MARKDOWN_LAYOUT='+JSON.stringify({errors,measurements}))
    app.quit()
  }catch(error){console.error(error.stack);app.exit(1)}
})
`
