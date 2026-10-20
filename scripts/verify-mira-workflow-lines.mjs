// Isolated desktop visual check for the compiled workflow edge projection. No model or user data.
import { build } from 'esbuild'
import electronPath from 'electron'
import { execFileSync } from 'node:child_process'
import { mkdtemp, writeFile, realpath, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
const { _electron } = await import(process.env.MIRA_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.MIRA_PLAYWRIGHT_MODULE).href : 'playwright')
const output = await realpath(await mkdtemp(join(tmpdir(), 'mira-workflow-lines-')))
const bundleRoot = resolve('node_modules/.cache/mira-workflow-lines')
await mkdir(bundleRoot, { recursive: true })
const renderer = `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {MiraWorkflowTimeline} from './apps/harness-react/src/components/workflows/MiraWorkflowTimeline';
const edge=(from,to,kind='next')=>({from,to,kind});
const base={participants:[],steps:[],handoffs:[],truncated:false};
const fixtures=[
 ['顺序步骤：自环与重复边不占空间',['准备资料','检查内容','生成报告'].map(id=>({id,name:id})),[edge('准备资料','准备资料','loop'),edge('准备资料','检查内容'),edge('准备资料','检查内容','branch'),edge('检查内容','生成报告')]],
 ['并行阶段：共用分叉与汇合',[{id:'start',name:'准备资料'},{id:'a',name:'检查语法'},{id:'b',name:'核对规范',alongside:['a']},{id:'end',name:'生成报告'}],[edge('start','a','fork'),edge('start','b','fork'),edge('a','end','join'),edge('b','end','join'),edge('a','b','fork')]],
 ['真实跳转：保留两条弧线，去除自环和重复关系',['start','check','review','report'].map((id,i)=>({id,name:['未分阶段','准备建议','解析器检查','生成报告'][i]})),[edge('start','start','loop'),edge('start','check'),edge('check','review'),edge('review','report'),edge('start','report','jump'),edge('start','review','branch'),edge('start','review','jump')]],
 ['并行返回：整组只保留一条回边',[{id:'start',name:'准备资料'},{id:'a',name:'检查语法'},{id:'b',name:'核对规范',alongside:['a']},{id:'end',name:'生成报告'}],[edge('start','a','fork'),edge('start','b','fork'),edge('a','end','join'),edge('b','end','join'),edge('a','start','loop'),edge('b','start','loop')]],
];
createRoot(document.getElementById('root')).render(<main>{fixtures.map(([name,phases,phaseEdges],i)=><section key={name} data-case={i}><h2>{name}</h2><MiraWorkflowTimeline graph={{...base,phases,phaseEdges}} /></section>)}</main>);
`
await build({ stdin: { contents: renderer, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, format: 'esm', outfile: join(output, 'fixture.js') })
execFileSync(process.execPath, ['node_modules/@tailwindcss/cli/dist/index.mjs', '-i', 'apps/harness-react/src/styles/app.css', '-o', join(output, 'fixture.css'), '--minify'], { stdio: 'pipe' })
await writeFile(join(output, 'index.html'), '<html><head><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><style>body{margin:0;background:var(--mira-background);color:var(--mira-foreground);font-family:system-ui}main{padding:24px;max-width:1000px;margin:auto}section[data-case]{background:var(--mira-panel);border:1px solid var(--mira-border);border-radius:12px;padding:16px;margin-bottom:16px}h2{font-size:14px;margin:0 0 12px}.mira-flow-line__relations{display:none}</style></head><body><div id="root"></div><script type="module" src="fixture.js"></script></body></html>')
await writeFile(join(bundleRoot, 'main.cjs'), `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(output, 'profile'))});app.whenReady().then(()=>{const win=new BrowserWindow({width:1100,height:1100,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false}});win.loadFile(${JSON.stringify(join(output, 'index.html'))})});`)
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ executablePath: electronPath, args: [join(bundleRoot, 'main.cjs')], env })
const report = { output, checks: [], errors: [] }
try {
  const page = await app.firstWindow()
  page.on('pageerror', error => report.errors.push(String(error)))
  await page.locator('[data-case="3"] .mira-flow-line__canvas').waitFor()
  for (const [index, expected] of [[0, 2], [1, 4], [2, 5], [3, 5]]) {
    const count = await page.locator('[data-case="' + index + '"] [data-line-edge]').count()
    if (count !== expected) throw new Error('Case ' + index + ': expected ' + expected + ' paths, got ' + count)
    report.checks.push('case ' + index + ': ' + count + ' folded paths')
  }
  const returns = await page.locator('[data-case="3"] [data-line-back=true]').count()
  if (returns !== 1) throw new Error('Parallel returns were not folded')
  report.checks.push('parallel returns collapse to one arc')
  await page.screenshot({ path: join(output, 'lines-light.png'), fullPage: true })
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.screenshot({ path: join(output, 'lines-dark.png'), fullPage: true })
  await page.locator('[data-case="0"]').getByRole('button', { name: '收起', exact: true }).click()
  if (await page.locator('[data-case="0"] .mira-flow-line__canvas').count()) throw new Error('Collapse failed')
  await page.locator('[data-case="0"]').getByRole('button', { name: '展开', exact: true }).click()
  await page.locator('[data-case="0"] .mira-flow-line__canvas').waitFor()
  report.checks.push('collapse and expand preserve timeline')
  if (report.errors.length) throw new Error(report.errors.join('\n'))
  console.log(JSON.stringify(report, null, 2))
} finally {
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2))
  await app.close()
}
