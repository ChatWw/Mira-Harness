/**
 * dsh-mac-computer-use —— 给 DSH 一组 Mac 桌面操作工具（视觉优先）
 *
 * 为什么不用 dsh-computer-use / cua-driver：那套依赖 macOS 无障碍树（AX），
 * 而这台机器上第三方二进制拿不到 AXWindow（锁屏时尤其明显）。这里改走**视觉路线**：
 *
 *   看窗口  → CGWindowList（不需要任何权限）
 *   看内容  → screencapture（DSH 已有屏幕录制权限）
 *   操作    → CGEvent 投递给目标进程（不移动真实鼠标、不抢前台）
 *
 * 这正是 Codex 那种 computer use 的做法，也是目前这台机器上唯一确定能走通的路。
 *
 * 底层引擎是 dsh-cu（Swift 单文件命令行，源码在仓库 tools/）。发版时编好放进安装包的 bin/，装上就能用；
 * 也可以用 install.sh 自己编到 ~/.dsh/bin/。
 * 本机环境（命令行在哪、权限、用户设置）在 setup.js；DSH 设置页的后端在 panel.js、前端在 client.js。
 */

import { spawn, execFile, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { findBin, INSTALL_CMD, INSTALL_HINT, OVERLAY, readConfig } from './setup.js'

export const name = 'dsh-mac-computer-use'
export const inject = ['tools']

const trace = () => {}

function cuBin() {
  const bin = findBin()
  if (!bin) throw new Error(INSTALL_HINT)
  return bin.path
}

// ── 系统级光标浮层 ─────────────────────────────────────────────────────────
// 用户想看得见操作时，屏幕上得有个光标在动。浮层是独立的 NSPanel 进程：
// 不抢前台、点击穿透、永远置顶。这里按需拉起 —— 第一次要动桌面时才起，
// 不需要开机常驻，用户零操作。DSH 设置页里关掉「显示光标」就不起、也不让命令行去起。
// 浮层闲 60 秒会自己退出，所以每次都探一下：FIFO 能以非阻塞方式打开 = 有读者 = 浮层活着。

// 本用户私有临时目录（0700）下，别的账号占不了也读不到；dsh-cu 和浮层用同一个算法（confstr DARWIN_USER_TEMP_DIR）
const sessionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mira-cu-'))
const FIFO = path.join(sessionRoot, 'cursor.fifo')
process.env.MIRA_CU_FIFO = FIFO
const children = new Set()
const scratch = new Set()
let closed = false
const track = child => { children.add(child); child.once('exit', () => children.delete(child)); return child }
export function dispose() {
  closed = true
  clearInterval(configTimer)
  for (const child of children) child.kill('SIGKILL')
  children.clear()
  for (const dir of scratch) removeDir(dir)
  fs.rmSync(sessionRoot, { recursive: true, force: true })
}
let closing
export function close() {
  return closing ??= (async () => {
    closed = true
    fs.writeFileSync(path.join(sessionRoot, 'stopped'), '')
    const deadline = Date.now() + 600
    while ([...children].some(child => child.spawnfile !== OVERLAY) && Date.now() < deadline) await sleep(15)
    dispose()
  })()
}

// 正在拉起浮层的那一次：并发的工具调用一起等它，别起两个
let cursorStarting = null

const cursorOn = () => readConfig().showCursor !== false
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
// Existing MCP sessions also follow the persisted switch; only their own overlay is stopped.
const configTimer = setInterval(() => {
  try { if (!cursorOn()) for (const child of children) if (child.spawnfile === OVERLAY) child.kill('SIGTERM') } catch {}
}, 500)
configTimer.unref()

function fifoOpen() {
  try {
    if (!fs.statSync(FIFO).isFIFO()) return -1          // 残留的普通文件别往里写
    return fs.openSync(FIFO, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK)
  } catch { return -1 }                                  // 没文件 / 没读者（ENXIO）
}

/** 只认当前账号的浮层：别的账号开着浮层不算（否则每次操作都白等它的 FIFO） */
function overlayRunning() { return Promise.resolve([...children].some(child => child.spawnfile === OVERLAY && child.exitCode === null)) }

/** 异步等浮层就绪：DSH 宿主是单线程，绝不能同步睡（以前用 Atomics.wait，会把整个 DSH 卡住最多 2 秒） */
function ensureCursor() {
  if (!cursorOn()) return Promise.resolve()
  if (!cursorStarting) cursorStarting = startCursor().finally(() => { cursorStarting = null })
  return cursorStarting
}

async function startCursor() {
  if (closed) throw new Error('电脑控制已停止')
  const fd = fifoOpen()
  if (fd >= 0) { fs.closeSync(fd); return }
  fs.accessSync(OVERLAY, fs.constants.X_OK)
  if (!(await overlayRunning())) track(spawn(OVERLAY, ['--fifo', FIFO], { stdio: 'ignore' })).on('error', () => {})
  for (let i = 0; i < 40; i++) {
    await sleep(50)
    if (closed) throw new Error('电脑控制已停止')
    const f = fifoOpen()
    if (f >= 0) { fs.closeSync(f); return }
  }
  throw new Error('Mira 光标提示组件启动失败，本次未操作电脑')
}
export async function prepareFeedback(name) {
  await ensureCursor()
  const labels = { desktop_click: '点击', desktop_type: '输入文字', desktop_launch: '打开应用', desktop_scroll: '滚动', desktop_drag: '拖拽', desktop_key: '按键' }
  cursorSay('show-current', 'label ' + (labels[name] ?? '操作电脑'))
}

/** 给浮层发几行指令（move / label / click …）。浮层没在跑就算了，绝不拖慢操作。 */
function cursorSay(...cmds) {
  if (!cursorOn()) return
  const fd = fifoOpen()
  if (fd < 0) return
  try { fs.writeSync(fd, cmds.map((c) => String(c).replace(/[\r\n]+/g, ' ') + '\n').join('')) } catch {}
  finally { try { fs.closeSync(fd) } catch {} }
}

/** 名牌上的短文字 */
const short = (s, n = 14) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

/** 输入的内容像不像密码：没有空格、没有中日韩文字的一串就不往屏幕上写 */
const typedLabel = (text) => {
  const t = String(text ?? '')
  return /\s|[\u3000-\u9fff\uac00-\ud7af]/.test(t) ? `输入「${short(t, 12)}」` : `输入 ${t.length} 个字符`
}

/**
 * 跟引擎约定的协议版本（tools/dsh-cu.swift 的 ENGINE_PROTOCOL）。插件自带的引擎总是对得上；用 DSH_CU_BIN、开发目录里的引擎时
 * 两边可能对不上：旧引擎会把新参数当成输出路径、按旧单位滚动。所以第一次用引擎先核对，对不上就什么都不跑。
 */
const ENGINE_PROTOCOL = '2'
let engineOk = ''                                         // 核对通过的引擎（路径 + 修改时间 + 大小），重装后自动重新核对

function engineKey(bin) {
  try { const st = fs.statSync(bin); return `${bin}:${st.mtimeMs}:${st.size}` } catch { return bin }
}

async function checkEngine(bin) {
  const key = engineKey(bin)
  if (key === engineOk) return
  const got = await exec(bin, ['version'], 10000).catch(() => '')
  if (got !== ENGINE_PROTOCOL) {
    throw new Error(
      `命令行引擎版本不对（插件要 ${ENGINE_PROTOCOL}，引擎${got ? `是 ${got.slice(0, 20)}` : '太旧、没有 version 命令'}），这次什么都没做。` +
      `请修复 Mira 安装；开发环境运行 ${INSTALL_CMD} 后重试`)
  }
  engineOk = key
}

/** 协议号不变的引擎增强（dsh-cu features）；旧引擎没这个命令就是空集合。按引擎文件缓存，重装后重新问 */
let featureCache = { key: '', set: new Set() }
async function engineFeatures() {
  const bin = cuBin()
  const key = engineKey(bin)
  if (key !== featureCache.key) {
    const out = await exec(bin, ['features'], 10000).catch(() => '')
    featureCache = { key, set: new Set(out.split('\n').map((l) => l.trim()).filter(Boolean)) }
  }
  return featureCache.set
}

/** 跑系统自带的小工具（screencapture / sips），不卡住 DSH */
function execFileP(cmd, args, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    track(execFile(cmd, args, { timeout: timeoutMs }, (err, out) => (err ? reject(err) : resolve(String(out)))))
  })
}

/**
 * 旧引擎（没重跑 install.sh，没有 shot --window）时插件自己截窗口本身：screencapture -l 窗口号，缩到「点」尺寸，
 * 坐标换算跟引擎一样「1 像素 = 1 点」。截不到、或出图比例对不上（同引擎的 fits）回 null，调用方退回按屏幕区域截
 */
async function shootWindow(w, file) {
  try {
    await execFileP('/usr/sbin/screencapture', ['-x', '-o', '-l', String(w.windowId), file])
    const dims = await execFileP('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file])
    const pw = Number((/pixelWidth:\s*(\d+)/.exec(dims) || [])[1])
    const ph = Number((/pixelHeight:\s*(\d+)/.exec(dims) || [])[1])
    const sx = pw / w.width, sy = ph / w.height
    if (!(sx >= 0.5 && Math.abs(sx - sy) < 0.05)) return null
    if (pw !== w.width || ph !== w.height) {
      await execFileP('/usr/bin/sips', ['-z', String(w.height), String(w.width), file, '--out', file])
    }
    return { x: w.x, y: w.y, width: w.width, height: w.height }
  } catch {
    return null
  }
}

async function run(args, timeoutMs = 30000) {
  if (closed) throw new Error('电脑控制已停止')
  const bin = cuBin()
  await checkEngine(bin)
  if (closed) throw new Error('电脑控制已停止')
  return exec(bin, args, timeoutMs)
}

function exec(bin, args, timeoutMs) {
  if (closed) return Promise.reject(new Error('电脑控制已停止'))
  return new Promise((resolve, reject) => {
    const child = track(spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, MIRA_CU_FIFO: FIFO, MIRA_CU_MANAGED: '1', MIRA_CU_STOP_FILE: path.join(sessionRoot, 'stopped'), TMPDIR: sessionRoot + path.sep } }))
    let out = '', err = ''
    const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch {} ; reject(new Error(`dsh-cu 超时（${timeoutMs}ms）`)) }, timeoutMs)
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { err += d })
    child.on('error', (e) => { clearTimeout(timer); reject(new Error(`起不来 dsh-cu: ${e.message}`)) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) return resolve(out.trim())
      const e = new Error(err.trim() || out.trim() || `dsh-cu 退出码 ${code}`)
      e.exitCode = code                                   // 调用方按退出码区分（find 的 2 = 没找到）
      reject(e)
    })
  })
}

// ── 工具外壳（不 import 任何 @deepseek-ai/*，形状按 dsh-tools 的产出手搓）──────

function specToJsonSchema(spec) {
  const properties = {}
  const required = []
  for (const [key, node] of Object.entries(spec)) {
    const { required: isRequired, ...rest } = node
    properties[key] = rest
    if (isRequired) required.push(key)
  }
  return { type: 'object', properties, ...(required.length ? { required } : {}) }
}

function defineTool(options) {
  return {
    name: options.name,
    description: options.description,
    parameters: specToJsonSchema(options.parameters),
    output: { schema: options.output.schema, render: options.output.render },
    ...(options.presentCall ? { presentCall: options.presentCall } : {}),
    execute: options.execute,
  }
}

const textOutput = {
  schema: {
    type: 'object', additionalProperties: false,
    properties: { text: { type: 'string' } }, required: ['text'],
  },
  render: (_args, value) => [{ type: 'text', text: value.text }],
}

const present = (title) => (args) => ({ card: 'generic', title, kind: 'other', rawInput: args })

/** render 是同步的，execute 里把附件引用存在这里，render 用 token 取回 */
const shotRefs = new Map()

/** OCR 找文字 → 屏幕坐标（dsh-cu find 的输出是 "序号\tx,y\t置信度\t文字"） */
async function findText(text, pid) {
  const a = ['find', text]
  if (pid) a.push('--pid', String(pid))
  let out
  try {
    out = await run(a, 60000)
  } catch (e) {
    // 只有退出码 2 才是「没找到」；没装、超时、没权限、截图失败都原样报，别都说成没找到
    if (e.exitCode === 2) {
      throw new Error(`没在屏幕上找到「${text}」${pid ? `（窗口 pid=${pid}）` : ''}。先 desktop_screenshot 看一眼现在是什么界面`)
    }
    throw new Error(`OCR 找字没做成：${e.message}`)
  }
  const line = out.split('\n')[0]
  const [idx, xy, conf, ...rest] = line.split('\t')
  const [x, y] = (xy || '').split(',').map(Number)
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`OCR 结果解析不了: ${line}`)
  return { x, y, conf: conf || '?', text: rest.join('\t') || text }
}

// 「x,y w×h」：副屏在主屏左边 / 上边时 x、y 是负数
const RECT_RE = /(-?\d+),(-?\d+) (\d+)×(\d+)/

/** dsh-cu shot 输出的第二行「rect\tx,y w×h」：截图覆盖的屏幕范围（点） */
function parseRect(raw) {
  const m = RECT_RE.exec(raw.split('\n').find((l) => l.startsWith('rect\t')) || '')
  return m ? { x: Number(m[1]), y: Number(m[2]), width: Number(m[3]), height: Number(m[4]) } : null
}

/** 告诉模型图上坐标怎么换成点击坐标。图按「点」出，k = 被 maxWidth 缩小的倍数 */
function mapping(rect, k = 1) {
  if (k === 1 && rect.x === 0 && rect.y === 0) return '图上坐标就是屏幕坐标，可以直接给 desktop_click。'
  const f = (o, v) => (k === 1 ? `${o} + ${v}` : `${o} + ${v}×${Number(k.toFixed(3))}`)
  return `图上 (u, v) 对应屏幕坐标 (${f(rect.x, 'u')}, ${f(rect.y, 'v')})，换算好再给 desktop_click。`
}

/** 截图临时文件放这里：用户自己的临时目录下新建的 0700 子目录（别的账号读不到），用完整个删掉 */
const privateDir = () => { const dir = fs.mkdtempSync(path.join(sessionRoot, 'shot-')); scratch.add(dir); return dir }
const removeDir = (dir) => { scratch.delete(dir); try { fs.rmSync(dir, { recursive: true, force: true }) } catch {} }

/** 正整数参数（插件手搓的 defineTool 不做入参校验，这里自己把关）；没给回 undefined */
function positiveInt(value, name) {
  if (value === undefined || value === null) return undefined
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} 要是正整数，收到的是 ${JSON.stringify(value)}`)
  return n
}

function parseWindows(raw) {
  return raw.split('\n').filter(Boolean).map((line) => {
    const [pid, wid, app, title, bounds] = line.split('\t')
    const m = RECT_RE.exec(bounds || '')
    return {
      pid: Number(pid), windowId: Number(wid), app, title,
      x: m ? Number(m[1]) : 0, y: m ? Number(m[2]) : 0,
      width: m ? Number(m[3]) : 0, height: m ? Number(m[4]) : 0,
    }
  })
}

const q = (t) => `「${String(t || '').slice(0, 40)}」`

/**
 * 动作前后两份窗口清单 → 一句话说这一下让窗口变了什么（新开、不见、标题变了、别的应用弹出窗口）。
 * 只看窗口，不看窗口里的内容；内容要看就用 desktop_observe。
 */
export function windowChanges(before, after, pid) {
  const old = new Map(before.map((w) => [w.windowId, w]))
  const now = new Map(after.map((w) => [w.windowId, w]))
  const name = (w) => (w.title ? q(w.title) : `（${w.app}）`)
  // 没标题的小条（Chrome 左下角的网址条、提示气泡）一闪就没，不算窗口变化
  const blip = (w) => !w.title && w.height > 0 && w.height < 60
  const out = []
  for (const w of after) {
    const o = old.get(w.windowId)
    if (!o && blip(w)) continue
    if (!o) out.push(w.pid === pid ? `新开了窗口${name(w)}` : `${w.app} 弹出了窗口${name(w)}`)
    else if (o.title !== w.title && w.pid === pid) out.push(`标题${q(o.title)}→${q(w.title)}`)
  }
  for (const w of before) if (w.pid === pid && !now.has(w.windowId) && !blip(w)) out.push(`窗口${name(w)}不见了（关了或最小化）`)
  if (!out.length) return '之后：窗口没变化'
  return `之后：${out.slice(0, 5).join('；')}${out.length > 5 ? ` 等 ${out.length} 处` : ''}`
}

export function apply(ctx, config) {
  trace('apply 被调用')

  const snapWindows = () => run(['winlist'], 5000).then(parseWindows, () => null)
  /** 做一个动作，顺带回报窗口变化：模型不用每次再截图确认「点上没有、弹没弹窗」 */
  async function report(pid, act) {
    const before = await snapWindows()
    const text = await act()
    if (!before) return text
    await sleep(400) // 等界面反应过来
    const after = await snapWindows()
    return after ? `${text}\n${windowChanges(before, after, Number(pid))}` : text
  }

  const tools = [
    defineTool({
      name: 'desktop_windows',
      description:
        '列出当前屏幕上所有可见窗口，含 pid、窗口 id、应用名、标题和**屏幕坐标**（左上角 x,y 和宽高）。' +
        '桌面操作前先用它拿到目标和坐标。不依赖无障碍权限，始终可用。',
      parameters: {
        filter: { type: 'string', description: '可选：按应用名或标题过滤（不区分大小写）' },
      },
      output: textOutput,
      presentCall: present('Desktop windows'),
      async execute(args) {
        const wins = parseWindows(await run(['winlist']))
        const f = (args.filter || '').toLowerCase()
        const list = f ? wins.filter((w) => w.app.toLowerCase().includes(f) || w.title.toLowerCase().includes(f)) : wins
        if (!list.length) return { text: '(没有匹配的窗口)' }
        return {
          text: list.map((w) =>
            `pid=${w.pid} win=${w.windowId} ${w.app}${w.title ? ` «${w.title.slice(0, 40)}»` : ''} @(${w.x},${w.y}) ${w.width}×${w.height}`
          ).join('\n'),
        }
      },
    }),

    defineTool({
      name: 'desktop_screenshot',
      description:
        '给屏幕或某个窗口截图，图片直接返回给你看。给了 pid 就只截那个应用最前面的窗口（在哪块屏都行，被别的窗口挡住也截得到它本身），' +
        '否则截主显示器。图按「点」出（1 像素 = 1 点）：全屏图上的坐标就是屏幕坐标；窗口图的换算方式写在返回文字里。' +
        '**先截图、看清按钮位置，再用 desktop_click 按坐标点** —— 这是推荐的工作方式。',
      parameters: {
        pid: { type: 'integer', description: '可选：只截这个进程的窗口' },
        maxWidth: { type: 'integer', description: '可选：缩小到多少像素宽（默认不缩；缩了以后坐标要按返回文字里的倍数换算）' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: { text: { type: 'string' }, token: { type: 'string' } },
          required: ['text', 'token'],
        },
        render: (_args, value) => {
          const blocks = [{ type: 'text', text: value.text }]
          const ref = shotRefs.get(value.token)
          if (ref) { shotRefs.delete(value.token); blocks.push({ type: 'image', attachment: ref }) }
          return blocks
        },
      },
      presentCall: present('Desktop screenshot'),
      async execute(args) {
        const maxWidth = positiveInt(args.maxWidth, 'maxWidth')
        const dir = privateDir()
        const file = path.join(dir, 'shot.png')
        try {
          const a = ['shot']
          let target = '主显示器'
          let rect = null
          if (args.pid) {
            const wins = parseWindows(await run(['winlist'])).filter((w) => w.pid === Number(args.pid))
            if (!wins.length) throw new Error(`pid ${args.pid} 没有可见窗口（应用没开窗口、窗口最小化了，或在别的桌面空间）`)
            const w = wins[0]
            target = `${w.app} «${w.title}»`
            if ((await engineFeatures()).has('window-shot')) {
              // 引擎按窗口号截窗口本身（被别的窗口挡住也行），截不到自己退回按屏幕区域截
              a.push('--window', String(w.windowId))
            } else {
              // 旧引擎：插件自己按窗口号截；不行再让引擎按窗口所在那块屏的原点和缩放比裁（Retina / 副屏 / 负坐标都对）
              rect = await shootWindow(w, file)
              if (!rect) a.push('--rect', `${w.x},${w.y},${w.width},${w.height}`)
            }
          }
          if (!rect) {
            a.push('--out', file)                       // 放最后：万一碰上旧引擎（拿最后一个参数当输出路径）也只会写进私有目录
            rect = parseRect(await run(a, 60000))
            if (!rect) throw new Error('电脑控制引擎没有返回截图范围，请修复 Mira 安装')
          }
          let buf = fs.readFileSync(file)
          let k = 1
          if (maxWidth && maxWidth < rect.width && buf.length > 200_000) {
            execFileSync('/usr/bin/sips', ['--resampleWidth', String(maxWidth), file, '--out', file], { stdio: 'ignore' })
            buf = fs.readFileSync(file)
            k = rect.width / maxWidth
          }
          const note = `截图（${target} @(${rect.x},${rect.y}) ${rect.width}×${rect.height}，${Math.round(buf.length / 1024)}KB）\n${mapping(rect, k)}`
          const [ref] = await ctx.get('attachments').saveImages([{ data: buf, mediaType: 'image/png' }])
          const token = crypto.randomUUID()
          shotRefs.set(token, ref)
          return { text: note, token }
        } finally {
          removeDir(dir)
        }
      },
    }),

    defineTool({
      name: 'desktop_click',
      description:
        '点击。**优先用 text**（OCR 找屏幕上的文字再点，最稳、不怕界面挪位置）；' +
        '找不到文字再用 x/y 坐标（来自 desktop_screenshot 或 desktop_windows）。' +
        '默认**投递给目标进程**（不移动你的真实鼠标、不抢前台）；某些应用不响应时加 global=true 走系统事件。' +
        '点完会附一句窗口变化（新开 / 不见 / 标题变了 / 没变化）；输入、按键、拖拽也一样。',
      parameters: {
        pid: { type: 'integer', required: true, description: '目标进程 pid（来自 desktop_windows）' },
        index: { type: 'integer', description: '可选：desktop_observe 给的编号' },
        text: { type: 'string', description: '要点的文字（OCR 找它，例如「登录」「Continue」）' },
        x: { type: 'integer', description: '屏幕坐标 X（左上原点），没给 text 时必填' },
        y: { type: 'integer', description: '屏幕坐标 Y（左上原点），没给 text 时必填' },
        global: { type: 'boolean', description: 'true = 走系统事件并移动真实鼠标（默认 false）' },
      },
      output: textOutput,
      presentCall: present('Desktop click'),
      async execute(args) {
        if (args.index) {
          await ensureCursor()
          const a = ['click-index', String(args.pid), String(args.index)]
          if (!cursorOn()) a.push('--no-cursor')
          return { text: await report(args.pid, () => run(a)) }
        }
        let x = args.x, y = args.y, how = '坐标'
        if (args.text) {
          const hit = await findText(args.text, args.pid)
          x = hit.x; y = hit.y; how = `文字「${hit.text}」`
        }
        if (x === undefined || y === undefined) throw new Error('要么给 text，要么给 x 和 y')
        await ensureCursor()
        cursorSay(args.text ? `label 点击 ${short(args.text)}` : 'label 点击')
        const a = ['clickat', String(args.pid), String(Math.round(x)), String(Math.round(y))]
        if (args.global) a.push('--global')
        if (!cursorOn()) a.push('--no-cursor')
        // 用引擎的真实结果：进程退出了、没辅助功能权限，引擎会报错，不能一律说点上了
        return { text: await report(args.pid, async () => { const out = await run(a); return args.text ? `${out}（${how}）` : out }) }
      },
    }),

    defineTool({
      name: 'desktop_observe',
      description:
        '可选的无障碍辅助观察：截取目标窗口，并把所有可点元素（按钮/输入框/链接/勾选框…）在图上用蓝色编号标出来，' +
        '同时返回编号清单（编号 / 类型 / 文字 / 坐标）。' +
        '看完直接 `desktop_click(pid, index=N)` 点第 N 个 —— 比猜坐标可靠得多。' +
        '（原理：走 macOS 无障碍树枚举元素；锁屏时拿不到，那种情况请改用 desktop_screenshot + desktop_find_text。）',
      parameters: {
        pid: { type: 'integer', required: true, description: '目标进程 pid（来自 desktop_windows）' },
        limit: { type: 'integer', description: '最多标多少个元素，默认 60' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: { text: { type: 'string' }, token: { type: 'string' } },
          required: ['text', 'token'],
        },
        render: (_args, value) => {
          const blocks = [{ type: 'text', text: value.text }]
          const ref = shotRefs.get(value.token)
          if (ref) { shotRefs.delete(value.token); blocks.push({ type: 'image', attachment: ref }) }
          return blocks
        },
      },
      presentCall: present('Desktop observe'),
      async execute(args) {
        const limit = positiveInt(args.limit, 'limit')
        const dir = privateDir()
        const out = path.join(dir, `observe-${args.pid}.png`)
        try {
          const a = ['observe', String(args.pid)]
          if (limit) a.push('--limit', String(limit))
          if (!cursorOn()) a.push('--no-cursor')
          a.push('--out', out)                          // 放最后，理由同 desktop_screenshot
          await ensureCursor()
          cursorSay('label 查看窗口')
          let raw
          try {
            raw = await run(a, 60000)
          } catch (e) {
            throw new Error(`${e.message}\n（如果应用没有窗口，或屏幕锁着，就用 desktop_screenshot + desktop_find_text）`)
          }
          const lines = raw.split('\n')
          const file = lines[0]
          const win = (lines.find((l) => l.startsWith('window\t')) || '').split('\t')[1] || ''
          const items = lines.filter((l) => /^\d+\t/.test(l))
          const text = `窗口 ${win}，共 ${items.length} 个可点元素：\n` +
            items.map((l) => { const [i, role, label, xy] = l.split('\t'); return `  [${i}] ${role.replace('AX', '')} «${label}» @${xy}` }).join('\n')

          const buf = fs.readFileSync(file)
          const [ref] = await ctx.get('attachments').saveImages([{ data: buf, mediaType: 'image/png' }])
          const token = crypto.randomUUID()
          shotRefs.set(token, ref)
          return { text, token }
        } finally {
          removeDir(dir)
        }
      },
    }),

    defineTool({
      name: 'desktop_find_text',
      description:
        'OCR 找屏幕上的文字，返回它的屏幕坐标（可以直接喂给 desktop_click）。' +
        '界面里找不到元素、又不想靠猜坐标时用它。可以指定 pid 只在那个窗口里找。',
      parameters: {
        text: { type: 'string', required: true, description: '要找的文字（支持中英文）' },
        pid: { type: 'integer', description: '可选：只在这个进程的窗口里找' },
      },
      output: textOutput,
      presentCall: present('Desktop find text'),
      async execute(args) {
        const hit = await findText(args.text, args.pid)
        return { text: `找到「${hit.text}」@ (${Math.round(hit.x)}, ${Math.round(hit.y)})  置信度 ${hit.conf}` }
      },
    }),

    defineTool({
      name: 'desktop_type',
      description: '往目标进程输入文字（支持中文）。输入前通常要先用 desktop_click 点一下输入框。',
      parameters: {
        pid: { type: 'integer', required: true, description: '目标进程 pid' },
        text: { type: 'string', required: true, description: '要输入的文字' },
      },
      output: textOutput,
      presentCall: present('Desktop type'),
      async execute(args) {
        cursorSay(`label ${typedLabel(args.text)}`)
        return { text: await report(args.pid, () => run(['type', String(args.pid), args.text])) }
      },
    }),

    defineTool({
      name: 'desktop_apps',
      description: '列出正在运行的应用（pid + 名字 + bundleId，* = 当前前台）。想操作某个应用先用它拿 pid。',
      parameters: {},
      output: textOutput,
      presentCall: present('Desktop apps'),
      async execute() {
        const out = await run(['apps'])
        const list = out.split('\n').filter(Boolean)
        return { text: list.length ? list.join('\n') : '(没有运行中的应用)' }
      },
    }),

    defineTool({
      name: 'desktop_launch',
      description: '在**后台**启动一个应用（不会抢前台、不打断用户）。参数可以是应用名（如 "TextEdit"、"计算器"）或 bundleId（如 "com.apple.TextEdit"）。',
      parameters: {
        target: { type: 'string', required: true, description: '应用名或 bundleId' },
      },
      output: textOutput,
      presentCall: present('Desktop launch'),
      async execute(args) {
        return { text: await run(['launch', args.target], 30000) }
      },
    }),

    defineTool({
      name: 'desktop_scroll',
      description: '在目标窗口的 (x, y) 处滚动，单位是「行」（一般 3~10）。dy 为正向下滚、为负向上滚；dx 为正向右、为负向左（默认 0）。',
      parameters: {
        pid: { type: 'integer', required: true, description: '目标进程 pid' },
        x: { type: 'integer', required: true, description: '滚轮所在屏幕坐标 X' },
        y: { type: 'integer', required: true, description: '滚轮所在屏幕坐标 Y' },
        dy: { type: 'integer', required: true, description: '纵向滚几行（正=向下，负=向上）' },
        dx: { type: 'integer', description: '横向滚几行（正=向右，负=向左），默认 0' },
      },
      output: textOutput,
      presentCall: present('Desktop scroll'),
      async execute(args) {
        await ensureCursor()
        cursorSay(`label ${args.dy < 0 ? '向上滚动' : '向下滚动'}`)
        // scroll-lines：单位是行、正=向下。旧引擎不认这个名字会直接报错，不会按像素反着滚
        const a = ['scroll-lines', String(args.pid), String(args.x), String(args.y), String(args.dy)]
        if (args.dx) a.push(String(args.dx))
        if (!cursorOn()) a.push('--no-cursor')
        return { text: await run(a) }
      },
    }),

    defineTool({
      name: 'desktop_drag',
      description: '从 (x1,y1) 拖到 (x2,y2)。用于拖文件、拖滑块、选中文本。',
      parameters: {
        pid: { type: 'integer', required: true, description: '目标进程 pid' },
        x1: { type: 'integer', required: true, description: '起点 X' },
        y1: { type: 'integer', required: true, description: '起点 Y' },
        x2: { type: 'integer', required: true, description: '终点 X' },
        y2: { type: 'integer', required: true, description: '终点 Y' },
      },
      output: textOutput,
      presentCall: present('Desktop drag'),
      async execute(args) {
        await ensureCursor()
        cursorSay('label 拖拽')
        const a = ['drag', String(args.pid), String(args.x1), String(args.y1), String(args.x2), String(args.y2)]
        if (!cursorOn()) a.push('--no-cursor')
        return { text: await report(args.pid, () => run(a)) }
      },
    }),

    defineTool({
      name: 'desktop_key',
      description:
        '给目标进程发按键。keycode 用 macOS 虚拟键码（回车 36、Tab 48、Esc 53、空格 49、' +
        '方向键 123-126、删除 51）。可加修饰键：cmd / shift / alt / ctrl，例如 cmd+shift 就是 ["cmd","shift"]。' +
        '目标在后台时，带 cmd 的全选 / 复制 / 粘贴这类系统快捷键多半不生效。',
      parameters: {
        pid: { type: 'integer', required: true, description: '目标进程 pid' },
        keycode: { type: 'integer', required: true, description: 'macOS 虚拟键码，例如回车 36' },
        flags: { type: 'array', items: { type: 'string' }, description: '修饰键：cmd / shift / alt / ctrl' },
      },
      output: textOutput,
      presentCall: present('Desktop key'),
      async execute(args) {
        const a = ['key', String(args.pid), String(args.keycode), ...(args.flags || [])]
        return { text: await report(args.pid, () => run(a)) }
      },
    }),
  ]

  for (const tool of tools) ctx.tools.register(tool)
}
