// dsh-cu —— 最小可用的 macOS computer use 命令行
//
// 为什么有这个东西：cua-driver（dsh-computer-use 插件依赖的原生驱动）在 macOS 26 上
// 有个未修的上游 bug —— 它的 daemon 走 AX 时永远返回 0 个 AXWindow
// （trycua/cua#4039，环境与我们完全一致）。但同一台机器上，**由 DSH 派生的进程**
// 走 AX 完全正常（本文件就是证明）。所以这里直接用系统 AX API 实现一份。
//
// 设计要点（**视觉优先**，因为这台机器上第三方二进制的 AX 是坏的）：
//   * 找窗口：CGWindowListCopyWindowInfo —— 不需要任何权限，拿到 pid + 精确 bounds
//   * 看：screencapture 截图（DSH 已有屏幕录制权限）
//   * 点：CGEvent 用 postToPid 投递给目标进程 —— **不移动真实鼠标、不抢前台**
//   * 打：CGEvent + keyboardSetUnicodeString，同样投递给目标进程（支持中文）
//   * AX 命令保留，但在本机不可靠（kAXWindowsAttribute 返回的元素角色是 AXApplication，
//     永远拿不到 AXWindow；同环境下 AppleScript 反而正常，说明是第三方二进制的 AX 被限制）
//
// 用法：
//   dsh-cu windows                     列出有窗口的应用
//   dsh-cu tree <pid> [--limit N]      打印 AX 树（带 [i] 索引）
//   dsh-cu click <pid> <i>             点第 i 个元素（AXPress，最稳）
//   dsh-cu clickat <pid> <x> <y> [--global] [--no-cursor]  按屏幕坐标点（默认不动真实鼠标；会联动浮层光标）
//   dsh-cu type <pid> <文字>           往目标进程打字（支持中文）
//   dsh-cu key <pid> <keycode> [flags] 按键（flags: cmd/shift/alt/ctrl，可组合）
//   dsh-cu find <文字> [--pid N]       OCR 找屏幕上的文字 → 输出可点的坐标（没给 pid 就找所有显示器）
//   dsh-cu observe <pid> [--out 路径] [--limit N]  **set-of-mark**：截图上给可点元素编号
//   dsh-cu click-index <pid> <编号> [--no-cursor]  点编号对应的元素（会联动浮层光标）
//   dsh-cu scroll-lines <pid> <x> <y> <dy> [dx] [--no-cursor]   滚轮，单位「行」，dy 正=向下、dx 正=向右（会联动浮层光标；
//                                      旧名 scroll 仍可用。插件用新名字，旧引擎不认就直接失败，不会按像素反着滚）
//   dsh-cu drag <pid> <x1> <y1> <x2> <y2> [--no-cursor]   拖拽（会联动浮层光标）
//   dsh-cu apps                             列出运行中的应用（* = 前台）
//   dsh-cu launch <bundleId|应用名>          后台启动应用（不抢前台；应用名可以是本地化名，如「计算器」）
//   dsh-cu shot [--out 路径] [--rect x,y,w,h | --pid N | --window 窗口号]  截屏（默认主屏）。按「点」出图：
//                                      图上 (u,v) = 屏幕 (rect.x+u, rect.y+v)，第二行输出 rect。
//                                      --pid / --window 按窗口号截窗口本身（被别的窗口挡住也行），截不到再按屏幕区域截
//   dsh-cu version                     协议版本号（插件先核对它，对不上就要重跑 install.sh）
//   dsh-cu features                    协议号不变的增强（一行一个）。插件据此提示「引擎可以更新」，不拦着用
//
// 点击 / 输入 / 按键 / 滚动 / 拖拽 / observe 要辅助功能权限（没有它系统会静默丢掉合成事件），没有就直接报错。

import ApplicationServices
import AppKit
import Foundation
import ImageIO
import Vision

// Mira cancels between input events so every dispatched down still receives its up.
func inputCancelled() -> Bool {
    guard let file = ProcessInfo.processInfo.environment["MIRA_CU_STOP_FILE"] else { return false }
    return FileManager.default.fileExists(atPath: file)
}

// ── 工具函数 ────────────────────────────────────────────────────────────────

func fail(_ msg: String) -> Never {
    FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
    exit(1)
}

func attr(_ el: AXUIElement, _ name: String) -> CFTypeRef? {
    var out: CFTypeRef?
    guard AXUIElementCopyAttributeValue(el, name as CFString, &out) == .success else { return nil }
    return out
}

func str(_ el: AXUIElement, _ name: String) -> String? {
    attr(el, name) as? String
}

func children(_ el: AXUIElement) -> [AXUIElement] {
    (attr(el, kAXChildrenAttribute as String) as? [AXUIElement]) ?? []
}

func frame(_ el: AXUIElement) -> CGRect? {
    guard let pv = attr(el, kAXPositionAttribute as String),
          let sv = attr(el, kAXSizeAttribute as String) else { return nil }
    var p = CGPoint.zero
    var s = CGSize.zero
    AXValueGetValue(pv as! AXValue, .cgPoint, &p)
    AXValueGetValue(sv as! AXValue, .cgSize, &s)
    return CGRect(origin: p, size: s)
}

/// 元素在树里的可读标签：优先 title / description / value
func label(_ el: AXUIElement) -> String {
    for k in [kAXTitleAttribute, kAXDescriptionAttribute, kAXValueAttribute, kAXRoleDescriptionAttribute] {
        if let v = str(el, k as String), !v.isEmpty { return v }
    }
    return ""
}

func appsWithWindows() -> [(pid_t, String, Int)] {
    NSWorkspace.shared.runningApplications
        .filter { $0.activationPolicy == .regular }
        .compactMap { app in
            let pid = app.processIdentifier
            let ax = AXUIElementCreateApplication(pid)
            let wins = (attr(ax, kAXWindowsAttribute as String) as? [AXUIElement]) ?? []
            guard !wins.isEmpty else { return nil }
            return (pid, app.localizedName ?? "?", wins.count)
        }
}

/// 目标进程还在不在（kill 0 只探测、不发信号；EPERM = 在，只是不归我们管）。
/// 进程没了还往它投事件，系统不报错，工具就会谎报成功
func requireAlive(_ pid: pid_t) {
    guard pid > 0, kill(pid, 0) == 0 || errno == EPERM else {
        fail("进程 \(pid) 已经不在了（应用退出了？）。用 desktop_apps / desktop_windows 重新拿 pid")
    }
}

/// 没有辅助功能权限时，系统会把投递的点击 / 键盘 / 滚轮事件静默丢掉，AX 也读不到元素 —— 直接报错，别谎报成功
func requireAX() {
    guard AXIsProcessTrusted() else {
        fail("没有辅助功能权限：点击、输入、按键、滚动会被系统直接丢掉。去「系统设置 → 隐私与安全性 → 辅助功能」打开 Mira 的开关，再重试")
    }
}

/// 跟插件约定的协议版本（plugin/index.js 的 ENGINE_PROTOCOL）。参数或输出格式变了就两边一起加 1：
/// 插件跟着 DSH 自动更新，引擎得手动重跑 install.sh，对不上时插件靠它拦住、不往下跑
let ENGINE_PROTOCOL = 2

/// 光标浮层的 FIFO：本用户私有临时目录（DARWIN_USER_TEMP_DIR，0700）下，别的账号占不了也读不到。
/// 插件（getconf DARWIN_USER_TEMP_DIR）和浮层用同一个算法
func cursorFifoPath() -> String {
    if let fifo = ProcessInfo.processInfo.environment["MIRA_CU_FIFO"] { return fifo }
    var buf = [CChar](repeating: 0, count: Int(PATH_MAX))
    let dir = confstr(_CS_DARWIN_USER_TEMP_DIR, &buf, buf.count) > 0 ? String(cString: buf) : NSTemporaryDirectory()
    return (dir as NSString).appendingPathComponent("dsh-cursor.fifo")
}
let cursorFifo = cursorFifoPath()

/// 截图中间文件放这里：用户自己的临时目录（NSTemporaryDirectory）下的 0700 子目录，进程退出时整个删掉
var scratchDir: String?

func privateTemp(_ name: String) -> String {
    if scratchDir == nil {
        let d = (NSTemporaryDirectory() as NSString).appendingPathComponent("dsh-cu-\(getpid())-\(UUID().uuidString.prefix(8))")
        do {
            try FileManager.default.createDirectory(atPath: d, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        } catch { fail("建不了临时目录 \(d)：\(error.localizedDescription)") }
        scratchDir = d
        atexit { if let d = scratchDir { try? FileManager.default.removeItem(atPath: d) } }
    }
    return (scratchDir! as NSString).appendingPathComponent(name)
}

/// observe 编号和 click-index 点击共用的可点元素枚举：同一套规则、同一个顺序，编号才对得上
let INTERACTIVE: Set<String> = ["AXButton", "AXTextField", "AXTextArea", "AXLink", "AXCheckBox",
                                "AXRadioButton", "AXPopUpButton", "AXMenuItem", "AXTab", "AXSlider",
                                "AXSearchField", "AXComboBox", "AXDisclosureTriangle", "AXIncrementor"]

func interactiveElements(in win: AXUIElement, limit: Int) -> [(role: String, label: String, rect: CGRect, el: AXUIElement)] {
    let wf = frame(win) ?? .zero
    var marks: [(role: String, label: String, rect: CGRect, el: AXUIElement)] = []
    var seen = Set<CFHashCode>()
    func collect(_ el: AXUIElement, _ depth: Int) {
        guard depth <= 20, marks.count < limit else { return }
        let h = CFHash(el); if seen.contains(h) { return }; seen.insert(h)
        let role = str(el, kAXRoleAttribute as String) ?? "?"
        if INTERACTIVE.contains(role), let f = frame(el), f.width >= 4, f.height >= 4,
           f.midX >= wf.minX - 2, f.midX <= wf.maxX + 2, f.midY >= wf.minY - 2, f.midY <= wf.maxY + 2 {
            marks.append((role, label(el), f, el))
        }
        for c in children(el) { collect(c, depth + 1) }
    }
    collect(win, 0)
    return marks
}

// ── 子命令 ──────────────────────────────────────────────────────────────────

let args = Array(CommandLine.arguments.dropFirst())
guard let cmd = args.first else { fail("用法见文件头注释") }

/// 按参数名取值（--out 路径、--limit N …）。不能拿「最后一个参数」当值：后面再追加 --no-cursor 之类就全乱了
func argValue(_ name: String) -> String? {
    guard let i = args.firstIndex(of: name), i + 1 < args.count else { return nil }
    return args[i + 1]
}

/// --limit 只收正整数；没给用默认值
func limitArg(_ def: Int) -> Int {
    guard let v = argValue("--limit") else { return def }
    guard let n = Int(v), n > 0 else { fail("--limit 要是正整数，收到的是「\(v)」") }
    return n
}

switch cmd {

case "version":
    print(ENGINE_PROTOCOL)

case "permissions":
    let status: [String: Bool] = ["screenRecording": CGPreflightScreenCaptureAccess(), "accessibility": AXIsProcessTrusted()]
    let data = try! JSONSerialization.data(withJSONObject: status, options: [.sortedKeys])
    print(String(data: data, encoding: .utf8)!)

case "request-permission":
    guard args.count == 2 else { fail("缺少权限类型") }
    switch args[1] {
    case "screen-recording":
        _ = CGRequestScreenCaptureAccess()
    case "accessibility":
        _ = AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary)
    default:
        fail("系统权限类型无效")
    }

case "features":
    // window-shot：observe / find --pid / shot --pid 按窗口号截窗口本身
    print("window-shot")

case "winlist":
    // CGWindowList：不依赖 AX，拿得到 pid / 标题 / 精确 bounds / 层级
    let info = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
    for w in info {
        let layer = w[kCGWindowLayer as String] as? Int ?? -1
        guard layer == 0 else { continue }                      // 只看普通窗口
        let pid = w[kCGWindowOwnerPID as String] as? Int ?? 0
        let name = w[kCGWindowOwnerName as String] as? String ?? "?"
        let title = w[kCGWindowName as String] as? String ?? ""
        guard let b = w[kCGWindowBounds as String] as? [String: CGFloat] else { continue }
        let wid = w[kCGWindowNumber as String] as? Int ?? 0
        print("\(pid)\t\(wid)\t\(name)\t\(title)\t\(Int(b["X"] ?? 0)),\(Int(b["Y"] ?? 0)) \(Int(b["Width"] ?? 0))×\(Int(b["Height"] ?? 0))")
    }

case "windows":
    for (pid, name, _) in appsWithWindows() {
        let ax = AXUIElementCreateApplication(pid)
        let wins = (attr(ax, kAXWindowsAttribute as String) as? [AXUIElement]) ?? []
        for w in wins {
            let f = frame(w)
            let t = str(w, kAXTitleAttribute as String) ?? ""
            let box = f.map { "(\(Int($0.origin.x)),\(Int($0.origin.y)) \(Int($0.width))×\(Int($0.height)))" } ?? ""
            print("\(pid)\t\(name)\t\(t)\t\(box)")
        }
    }

case "tree":
    guard args.count >= 2, let pid = pid_t(args[1]) else { fail("用法: dsh-cu tree <pid>") }
    let limit = limitArg(200)
    var index = 0
    var seen = Set<CFHashCode>()
    let ax = AXUIElementCreateApplication(pid)
    func walk(_ el: AXUIElement, _ depth: Int) {
        guard index < limit, depth <= 20 else { return }
        let h = CFHash(el)
        if seen.contains(h) { return }          // 环检测：AX 树里有自引用
        seen.insert(h)
        let role = str(el, kAXRoleAttribute as String) ?? "?"
        let lab = label(el)
        let f = frame(el)
        let pos = f.map { "@\(Int($0.midX)),\(Int($0.midY))" } ?? ""
        let pad = String(repeating: "  ", count: depth)
        print("[\(index)]\(pad) \(role) \(lab.isEmpty ? "" : "«\(lab.prefix(60))»") \(pos)")
        index += 1
        for c in children(el) { walk(c, depth + 1) }
    }
    // 从窗口开始 —— 从 application 走会先撞上菜单栏和自引用
    for w in (attr(ax, kAXWindowsAttribute as String) as? [AXUIElement]) ?? [] { walk(w, 0) }

case "click":
    guard args.count >= 3, let pid = pid_t(args[1]), let want = Int(args[2]) else { fail("用法: dsh-cu click <pid> <索引>") }
    requireAlive(pid)
    requireAX()
    let ax = AXUIElementCreateApplication(pid)
    var index = 0
    var target: AXUIElement?
    var seen2 = Set<CFHashCode>()
    func find(_ el: AXUIElement, _ depth: Int) {
        guard target == nil, depth <= 20 else { return }
        let h = CFHash(el)
        if seen2.contains(h) { return }
        seen2.insert(h)
        if index == want { target = el; return }
        index += 1
        for c in children(el) { find(c, depth + 1) }
    }
    for w in (attr(ax, kAXWindowsAttribute as String) as? [AXUIElement]) ?? [] { find(w, 0) }
    guard let el = target else { fail("没有第 \(want) 个元素") }
    if inputCancelled() { fail("电脑控制已停止") }
    var err = AXUIElementPerformAction(el, kAXPressAction as CFString)
    if err != .success {
        // 没有 AXPress 就退回坐标点击
        guard let f = frame(el) else { fail("元素既不能按也没有坐标") }
        err = postClick(pid: pid, at: CGPoint(x: f.midX, y: f.midY)) ? .success : .failure
    }
    guard err == .success else { fail("点击失败 (\(err.rawValue))") }
    print("已点击 [\(want)] \(label(el).prefix(40))")

case "clickat":
    guard args.count >= 4, let pid = pid_t(args[1]), let x = Double(args[2]), let y = Double(args[3]) else {
        fail("用法: dsh-cu clickat <pid> <x> <y> [--global]")
    }
    requireAlive(pid)
    requireAX()
    let global = args.contains("--global")
    cursorOverlayOff = args.contains("--no-cursor")
    if !cursorOverlayOff { ensureOverlay() }
    // 光标自己滑过去（弹簧 + 沿运动方向拉伸 + 点击回弹），这就是 Codex 光标的全部特效。
    // 压暗/旋转球是 Codex 别处的东西，不是光标，所以默认不出；要就设 DSH_CU_FX=full
    let fx = ProcessInfo.processInfo.environment["DSH_CU_FX"] ?? ""
    overlayPing("move \(Int(x)) \(Int(y))")
    if fx == "full" {
        overlayPing("fog on")
        overlayPing("lens \(Int(x)) \(Int(y))")
    }
    usleep(300_000)                                    // 等它滑到位再点
    overlayPing("click")
    guard postClick(pid: pid, at: CGPoint(x: x, y: y), global: global) else { fail("点击失败（造不出鼠标事件，或目标进程中途退出了）") }
    print("已点击 (\(Int(x)), \(Int(y)))\(global ? " [真实鼠标]" : " [投递给 pid，不动鼠标]")")

case "type":
    guard args.count >= 3, let pid = pid_t(args[1]) else { fail("用法: dsh-cu type <pid> <文字>") }
    requireAlive(pid)
    requireAX()
    let text = args.dropFirst(2).joined(separator: " ")
    makeMainWindow(pid: pid)
    guard postText(pid: pid, text) else { fail("输入失败（造不出键盘事件，或目标进程中途退出了）") }
    print("已输入 \(text.count) 个字符")

case "key":
    guard args.count >= 3, let pid = pid_t(args[1]), let code = UInt16(args[2]) else { fail("用法: dsh-cu key <pid> <keycode> [cmd|shift|alt|ctrl]") }
    requireAlive(pid)
    requireAX()
    var flags: CGEventFlags = []
    for f in args.dropFirst(3) {
        switch f {
        case "cmd": flags.insert(.maskCommand)
        case "shift": flags.insert(.maskShift)
        case "alt": flags.insert(.maskAlternate)
        case "ctrl": flags.insert(.maskControl)
        default: break
        }
    }
    makeMainWindow(pid: pid)
    let src = CGEventSource(stateID: .hidSystemState)
    for down in [true, false] {
        guard let e = CGEvent(keyboardEventSource: src, virtualKey: code, keyDown: down) else { fail("按键失败（造不出键盘事件）") }
        if down && inputCancelled() { break }
        e.flags = flags
        e.postToPid(pid)
        usleep(20_000)                                 // 投递是异步的：发完立刻退出，松键偶尔会被丢掉
    }
    if flags.contains(.maskCommand), NSRunningApplication(processIdentifier: pid)?.isActive == false {
        // 后台应用收得到这一下（网页自己的快捷键能用），但全选 / 复制 / 粘贴这类走菜单的不执行。照实说，别谎报成功
        print("已按键 \(code)（带 ⌘，目标在后台：全选、复制、粘贴这类系统快捷键多半没生效，请截图确认）")
    } else {
        print("已按键 \(code)")
    }

case "find":
    // OCR 找文字 → 返回屏幕坐标。这是视觉路线真正好用的关键：
    // agent 说「点『登录』」，而不是猜坐标。
    guard args.count >= 2 else { fail("用法: dsh-cu find <文字> [--pid N] [--all]") }
    let needle = args[1]
    let showAll = args.contains("--all")
    // 每张图配上它覆盖的矩形：截屏模式是全局屏幕点（各屏自己的原点和缩放比已在 capture 里换算好），
    // --file 模式是图片像素
    var shots: [(image: CGImage, covered: CGRect)] = []
    if let file = argValue("--file") {
        // 直接对图片文件 OCR（不截屏）
        guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: file) as CFURL, nil),
              let cg = CGImageSourceCreateImageAtIndex(src, 0, nil) else { fail("图片读不出来：\(file)") }
        shots = [(cg, CGRect(x: 0, y: 0, width: cg.width, height: cg.height))]
    } else if let p = argValue("--pid") {
        guard let pid = pid_t(p) else { fail("--pid 要是数字") }
        guard let w = windowInfosOf(pid).first else { fail(noWindow(pid)) }
        shots = [captureWindow(w)]              // 只截这个窗口（被挡住也是它自己）、只认窗口里的字
    } else {
        shots = displays().map { capture($0) }          // 每块屏都找
        if shots.isEmpty { fail("找不到显示器") }
    }

    let want = needle.lowercased()
    var hits: [(String, CGPoint, Float)] = []
    var seenText = 0
    for (cg, covered) in shots {
        let req = VNRecognizeTextRequest()
        req.recognitionLevel = .accurate
        req.recognitionLanguages = ["zh-Hans", "en-US"]
        req.usesLanguageCorrection = true
        let handler = VNImageRequestHandler(cgImage: cg, options: [:])
        do { try handler.perform([req]) } catch { fail("OCR 失败：\(error.localizedDescription)") }
        seenText += (req.results ?? []).count
        for obs in (req.results ?? []) {
            guard let top = obs.topCandidates(1).first else { continue }
            let matchAll = want.isEmpty || want == "*"      // Swift 的 contains("") 是 false，得单独处理
            guard matchAll || top.string.lowercased().contains(want) else { continue }
            let bb = obs.boundingBox                        // 归一化，左下原点
            let sx = covered.minX + bb.midX * covered.width
            let sy = covered.minY + (1 - bb.midY) * covered.height   // 换成左上原点
            hits.append((top.string, CGPoint(x: sx, y: sy), top.confidence))
        }
    }
    if hits.isEmpty {
        print("没找到「\(needle)」（OCR 共识别 \(seenText) 段文字）")
        exit(2)
    }
    hits.sort { $0.2 > $1.2 }
    for (i, h) in (showAll ? hits : [hits[0]]).enumerated() {
        print("\(i)\t\(Int(h.1.x)),\(Int(h.1.y))\t\(String(format: "%.2f", h.2))\t\(h.0)")
    }

case "observe":
    // set-of-mark：把可点元素在截图上编号，模型就能说「点第 7 个」而不是猜坐标
    guard args.count >= 2, let pid = pid_t(args[1]) else { fail("用法: dsh-cu observe <pid> [--out 路径] [--limit N]") }
    let outPath = argValue("--out") ?? (NSTemporaryDirectory() as NSString).appendingPathComponent("dsh-cu-mark-\(pid).png")
    let maxMark = limitArg(60)
    requireAlive(pid)
    requireAX()

    guard let win = windowsOfAX(pid).first else { fail("pid \(pid) 没有 AX 窗口（应用可能没在跑或没有窗口）") }
    let winFrame = frame(win) ?? .zero
    guard winFrame.width > 1, winFrame.height > 1 else { fail("拿不到窗口尺寸") }

    let marks = interactiveElements(in: win, limit: maxMark)
    if marks.isEmpty { fail("这个窗口里没找到可交互元素") }

    // 截窗口本身（被别的窗口挡住也行）：AX 窗口按位置大小对上 CGWindowList 里的窗口号；对不上就按屏幕区域截
    // （按窗口所在那块屏的原点和缩放比裁，Retina / 副屏 / 负坐标都对）。出图按「点」尺寸
    let near = { (a: CGFloat, b: CGFloat) in abs(a - b) < 2 }
    let cgWin = windowInfosOf(pid).first {
        near($0.rect.minX, winFrame.minX) && near($0.rect.minY, winFrame.minY) &&
        near($0.rect.width, winFrame.width) && near($0.rect.height, winFrame.height)
    }
    let (shot, covered) = cgWin.map { captureWindow($0) } ?? capture(winFrame)
    let W = max(1, Int(covered.width.rounded())), H = max(1, Int(covered.height.rounded()))
    let scale = CGFloat(W) / covered.width
    guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: W, pixelsHigh: H, bitsPerSample: 8, samplesPerPixel: 4,
                                     hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0),
          let gc = NSGraphicsContext(bitmapImageRep: rep) else { fail("标注图画不出来") }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = gc
    let ctx = gc.cgContext
    ctx.interpolationQuality = .high
    ctx.draw(shot, in: CGRect(x: 0, y: 0, width: W, height: H))
    ctx.setLineWidth(2)
    for (i, m) in marks.enumerated() {
        // 屏幕坐标 → 图片坐标（原点在左下，要翻转 y）
        let x = (m.rect.minX - covered.minX) * scale
        let y = CGFloat(H) - (m.rect.maxY - covered.minY) * scale
        let w = m.rect.width * scale, hh = m.rect.height * scale
        ctx.setStrokeColor(NSColor.systemBlue.withAlphaComponent(0.9).cgColor)
        ctx.stroke(CGRect(x: x, y: y, width: w, height: hh))
        let tag = "\(i + 1)"
        let attrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.boldSystemFont(ofSize: 13),
            .foregroundColor: NSColor.white,
        ]
        let ts = NSAttributedString(string: tag, attributes: attrs)
        let sz = ts.size()
        let bx = x, by = y + hh - sz.height - 2
        ctx.setFillColor(NSColor.systemBlue.cgColor)
        ctx.fill(CGRect(x: bx, y: by, width: sz.width + 6, height: sz.height + 2))
        ts.draw(at: NSPoint(x: bx + 3, y: by + 1))
    }
    NSGraphicsContext.restoreGraphicsState()
    guard let png = rep.representation(using: .png, properties: [:]) else { fail("标注图写不出来") }
    do { try png.write(to: URL(fileURLWithPath: outPath)) } catch { fail("标注图写不进 \(outPath)：\(error.localizedDescription)") }

    // 观察时把光标滑到窗口中心，表示"我在看这个"
    if !args.contains("--no-cursor") {
        ensureOverlay()
        overlayPing("move \(Int(winFrame.midX)) \(Int(winFrame.midY))")
        if ProcessInfo.processInfo.environment["DSH_CU_FX"] == "full" {
            overlayPing("fog on")
            overlayPing("lens \(Int(winFrame.midX)) \(Int(winFrame.midY))")
        }
    }
    print(outPath)
    print("window\t\(Int(winFrame.minX)),\(Int(winFrame.minY)) \(Int(winFrame.width))×\(Int(winFrame.height))")
    for (i, m) in marks.enumerated() {
        print("\(i + 1)\t\(m.role)\t\(m.label.prefix(50))\t\(Int(m.rect.midX)),\(Int(m.rect.midY))")
    }

case "click-index":
    guard args.count >= 3, let pid = pid_t(args[1]), let want = Int(args[2]) else { fail("用法: dsh-cu click-index <pid> <编号> [--no-cursor]") }
    requireAlive(pid)
    requireAX()
    guard let win = windowsOfAX(pid).first else { fail("没有 AX 窗口") }
    guard want >= 1 else { fail("编号从 1 开始") }
    // 跟 observe 同一套枚举、同一个顺序；数到第 want 个就停 —— observe 标多少个都对得上
    let marks = interactiveElements(in: win, limit: want)
    guard want <= marks.count else { fail("编号越界（1...\(marks.count)）") }
    let el = marks[want - 1].el
    // 光标先滑到元素中心、名牌写上要点什么，再按（跟 clickat 一个节奏）
    cursorOverlayOff = args.contains("--no-cursor")
    if !cursorOverlayOff, let f = frame(el) {
        ensureOverlay()
        let name = label(el).replacingOccurrences(of: "\n", with: " ").trimmingCharacters(in: .whitespaces)
        overlayPing(name.isEmpty ? "label 点击" : "label 点击 \(name.count > 14 ? String(name.prefix(13)) + "…" : name)")
        overlayPing("move \(Int(f.midX)) \(Int(f.midY))")
        usleep(300_000)
        overlayPing("click")
    }
    var err = AXUIElementPerformAction(el, kAXPressAction as CFString)
    if err != .success, let f = frame(el) {
        err = postClick(pid: pid, at: CGPoint(x: f.midX, y: f.midY)) ? .success : .failure
    }
    guard err == .success else { fail("点击失败 (\(err.rawValue))") }
    print("已点击 [\(want)] \(label(el).prefix(40))")

case "scroll", "scroll-lines":
    guard args.count >= 5, let pid = pid_t(args[1]), let x = Double(args[2]), let y = Double(args[3]), let rawDy = Int32(args[4]) else {
        fail("用法: dsh-cu scroll <pid> <x> <y> <dy> [dx] [--no-cursor]")
    }
    requireAlive(pid)
    requireAX()
    // 单位是「行」；约定 dy 正 = 向下滚、dx 正 = 向右。夹到 ±1000，后面取反不会溢出
    let dy = max(-1000, min(1000, rawDy))
    let dx = max(-1000, min(1000, args.count >= 6 ? Int32(args[5]) ?? 0 : 0))
    // 光标先滑到滚动的位置，右上角亮一下滚动方向
    cursorOverlayOff = args.contains("--no-cursor")
    if !cursorOverlayOff {
        ensureOverlay()
        overlayPing("move \(Int(x)) \(Int(y))")
        usleep(300_000)
        overlayPing("scroll \(dy < 0 ? -1 : 1)")
    }
    // CGEvent 的滚轮值方向跟约定相反（wheel1 正 = 向上、wheel2 正 = 向左），所以取反
    guard let e = CGEvent(scrollWheelEvent2Source: CGEventSource(stateID: .hidSystemState),
                          units: .line, wheelCount: 2, wheel1: -dy, wheel2: -dx, wheel3: 0) else { fail("造不出滚动事件") }
    e.location = CGPoint(x: x, y: y)
    tagWindow(e, window: targetWindow(pid: pid, at: e.location), at: e.location)
    if inputCancelled() { fail("电脑控制已停止") }
    e.postToPid(pid)
    usleep(50_000)                                     // 投递是异步的：发完立刻退出，事件偶尔会被丢掉
    print("已滚动 dy=\(dy) dx=\(dx) 行 @(\(Int(x)),\(Int(y)))")

case "drag":
    guard args.count >= 6, let pid = pid_t(args[1]),
          let x1 = Double(args[2]), let y1 = Double(args[3]),
          let x2 = Double(args[4]), let y2 = Double(args[5]) else {
        fail("用法: dsh-cu drag <pid> <x1> <y1> <x2> <y2> [--no-cursor]")
    }
    requireAlive(pid)
    requireAX()
    // 光标：先滑到起点、按住（尖端一圈光晕），跟着每一步走到终点，再松开 —— 跟浏览器拖拽一个样
    cursorOverlayOff = args.contains("--no-cursor")
    if !cursorOverlayOff {
        ensureOverlay()
        overlayPing("move \(Int(x1)) \(Int(y1))")
        usleep(300_000)
        overlayPing("down")
    }
    let src = CGEventSource(stateID: .hidSystemState)
    let from = CGPoint(x: x1, y: y1), to = CGPoint(x: x2, y: y2)
    // 整个拖拽都记在按下时的那个窗口上（AppKit 也是把拖动和松开交给按下的窗口）
    let win = targetWindow(pid: pid, at: from)
    let commandPress = needsCommandPress(pid: pid)       // 同 postClick：后台 Chromium 窗口按下要带 ⌘
    func post(_ type: CGEventType, _ pt: CGPoint) {
        guard let e = CGEvent(mouseEventSource: src, mouseType: type, mouseCursorPosition: pt, mouseButton: .left) else { return }
        e.setIntegerValueField(.mouseEventClickState, value: 1)
        tagWindow(e, window: win, at: pt)
        e.flags = commandPress && type == .leftMouseDown ? .maskCommand : []
        e.postToPid(pid)
    }
    if inputCancelled() { fail("电脑控制已停止") }
    post(.leftMouseDown, from)
    var releasePoint = from
    let steps = 12
    for i in 1...steps {
        if inputCancelled() { break }
        let t = Double(i) / Double(steps)
        let pt = CGPoint(x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t)
        releasePoint = pt
        post(.leftMouseDragged, pt)
        overlayPing("show \(Int(pt.x)) \(Int(pt.y))")
        usleep(15_000)
    }
    post(.leftMouseUp, releasePoint)
    usleep(50_000)                                     // 等松开送到再退出，不然偶尔丢，目标会以为还按着
    overlayPing("up")
    print("已拖拽 (\(Int(x1)),\(Int(y1))) → (\(Int(x2)),\(Int(y2)))")

case "apps":
    for app in NSWorkspace.shared.runningApplications where app.activationPolicy == .regular {
        let front = app.isActive ? "*" : " "
        print("\(front)\(app.processIdentifier)\t\(app.localizedName ?? "?")\t\(app.bundleIdentifier ?? "")")
    }

case "launch":
    guard args.count >= 2 else { fail("用法: dsh-cu launch <bundleId 或 应用名>") }
    let target = args[1]
    let cfg = NSWorkspace.OpenConfiguration()
    cfg.activates = false                       // 不抢前台
    let sem = DispatchSemaphore(value: 0)
    var launched: NSRunningApplication?
    // bundleId 优先；查不到（或名字里本来就带点，如 Node.js）再按名字找，名字认各语言的本地化名
    var found = target.contains(".") ? NSWorkspace.shared.urlForApplication(withBundleIdentifier: target) : nil
    if found == nil { found = findApp(named: target) }
    if let url = found {
        NSWorkspace.shared.openApplication(at: url, configuration: cfg) { app, _ in launched = app; sem.signal() }
        _ = sem.wait(timeout: .now() + 10)
        if let a = launched { print("已后台启动 \(a.localizedName ?? target) pid=\(a.processIdentifier)") }
        else { fail("启动超时") }
    } else {
        // 兜底：交给 LaunchServices 按名字找（-g = 不抢前台）
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        p.arguments = ["-g", "-a", target]
        p.standardOutput = FileHandle.nullDevice
        p.standardError = FileHandle.nullDevice
        do { try p.run() } catch { fail("找不到应用 \(target)") }
        p.waitUntilExit()
        guard p.terminationStatus == 0 else {
            fail("找不到应用 \(target)（应用目录里的文件名、各语言名字都对不上，open -a 也找不到；可以改用 bundleId）")
        }
        // open 不回 pid：在运行中的应用里按名字找一下（要转 RunLoop，列表才会刷新）
        let want = target.lowercased()
        var app: NSRunningApplication?
        for _ in 0..<20 where app == nil {
            app = NSWorkspace.shared.runningApplications.first {
                ($0.localizedName ?? "").lowercased() == want
                    || ($0.bundleURL?.deletingPathExtension().lastPathComponent ?? "").lowercased() == want
            }
            if app == nil { RunLoop.current.run(until: Date().addingTimeInterval(0.25)) }
        }
        if let a = app { print("已后台启动 \(a.localizedName ?? target) pid=\(a.processIdentifier)") }
        else { print("已后台启动 \(target)（pid 用 desktop_apps 查）") }
    }

case "shot":
    let out = argValue("--out") ?? (NSTemporaryDirectory() as NSString).appendingPathComponent("dsh-cu-shot.png")
    var rect: CGRect? = nil                     // nil = 整个主屏
    var win: (id: CGWindowID, rect: CGRect)? = nil   // 给了 --pid / --window 就截这个窗口本身
    if let r = argValue("--rect") {
        let n = r.split(separator: ",").compactMap { Double($0) }
        guard n.count == 4, n[2] > 0, n[3] > 0 else { fail("--rect 要写成 x,y,宽,高（屏幕点），收到的是「\(r)」") }
        rect = CGRect(x: n[0], y: n[1], width: n[2], height: n[3])
    } else if let p = argValue("--pid") {
        guard let pid = pid_t(p) else { fail("--pid 要是数字") }
        guard let w = windowInfosOf(pid).first else { fail(noWindow(pid)) }
        win = w
    } else if let v = argValue("--window") {
        guard let id = CGWindowID(v), let w = windowInfo(id) else { fail("窗口 \(v) 不在屏幕上（关掉了、最小化了，或在别的桌面空间）") }
        win = w
    }
    let (img, covered) = win.map { captureWindow($0) } ?? capture(rect)
    // 缩回「点」尺寸：图上 1 像素 = 屏幕 1 点，图上坐标加上 rect 原点就是点击坐标
    writePNG(img, to: out, size: covered.size)
    print(out)
    print("rect\t\(Int(covered.minX.rounded())),\(Int(covered.minY.rounded())) \(Int(covered.width.rounded()))×\(Int(covered.height.rounded()))")

default:
    fail("不认识的命令: \(cmd)")
}

/// 某个 pid 的 AX 窗口（解锁后可用；锁屏时拿不到）
func windowsOfAX(_ pid: pid_t) -> [AXUIElement] {
    let ax = AXUIElementCreateApplication(pid)
    return (attr(ax, kAXWindowsAttribute as String) as? [AXUIElement]) ?? []
}

/// 某个 pid 的普通窗口，前面的在前：窗口号 + 屏幕矩形（CGWindowList，不需要 AX）。
/// 只有当前屏幕上看得到的：最小化的、在别的桌面空间的不在里面
func windowInfosOf(_ pid: pid_t) -> [(id: CGWindowID, rect: CGRect)] {
    let info = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
    return info.compactMap { w in
        guard (w[kCGWindowLayer as String] as? Int ?? -1) == 0,
              (w[kCGWindowOwnerPID as String] as? Int) == Int(pid) else { return nil }
        return cgWindow(w)
    }
}

/// 按窗口号找一个在屏幕上的普通窗口
func windowInfo(_ id: CGWindowID) -> (id: CGWindowID, rect: CGRect)? {
    let info = CGWindowListCopyWindowInfo([.optionIncludingWindow], id) as? [[String: Any]] ?? []
    guard let w = info.first, (w[kCGWindowIsOnscreen as String] as? Bool) == true else { return nil }
    return cgWindow(w)
}

func cgWindow(_ w: [String: Any]) -> (id: CGWindowID, rect: CGRect)? {
    guard let n = w[kCGWindowNumber as String] as? Int,
          let b = w[kCGWindowBounds as String] as? [String: CGFloat] else { return nil }
    return (CGWindowID(n), CGRect(x: b["X"] ?? 0, y: b["Y"] ?? 0, width: b["Width"] ?? 0, height: b["Height"] ?? 0))
}

func noWindow(_ pid: pid_t) -> String {
    "pid \(pid) 没有可见窗口（应用没开窗口、窗口最小化了，或在别的桌面空间）"
}

/// 按名字找应用：先认文件名，再认各语言的本地化名（「计算器」→ Calculator.app）
func findApp(named target: String) -> URL? {
    let fm = FileManager.default
    let dirs = ["/System/Applications", "/Applications", "/System/Applications/Utilities", "/Applications/Utilities",
                (NSHomeDirectory() as NSString).appendingPathComponent("Applications")]
    for d in dirs {
        let u = URL(fileURLWithPath: d).appendingPathComponent("\(target).app")
        if fm.fileExists(atPath: u.path) { return u }
    }
    let want = target.lowercased()
    for d in dirs {
        for name in (try? fm.contentsOfDirectory(atPath: d)) ?? [] where name.hasSuffix(".app") {
            let u = URL(fileURLWithPath: d).appendingPathComponent(name)
            if appNames(u).contains(want) { return u }
        }
    }
    return nil
}

/// 一个应用的所有名字（小写）：文件名、当前语言的显示名、各语言的 CFBundleDisplayName / CFBundleName
func appNames(_ url: URL) -> Set<String> {
    let keys = ["CFBundleDisplayName", "CFBundleName"]
    let res = url.appendingPathComponent("Contents/Resources")
    var names = [url.deletingPathExtension().lastPathComponent, FileManager.default.displayName(atPath: url.path)]
    // 系统应用：所有语言的名字在一个 InfoPlist.loctable 里
    if let table = NSDictionary(contentsOf: res.appendingPathComponent("InfoPlist.loctable")) as? [String: Any] {
        for case let d as [String: Any] in table.values { names += keys.compactMap { d[$0] as? String } }
    }
    // 第三方应用：每种语言一个 xx.lproj/InfoPlist.strings
    for lproj in (try? FileManager.default.contentsOfDirectory(atPath: res.path)) ?? [] where lproj.hasSuffix(".lproj") {
        let f = res.appendingPathComponent(lproj).appendingPathComponent("InfoPlist.strings")
        if let d = NSDictionary(contentsOf: f) as? [String: Any] { names += keys.compactMap { d[$0] as? String } }
    }
    return Set(names.map { $0.lowercased() })
}

// ── 截图：按显示器算原点和缩放比 ─────────────────────────────────────────────
// CGWindowList / AX / CGEvent 用的都是全局「点」坐标（主屏左上为原点，副屏可以是负数）；
// screencapture 出的是「像素」图（Retina 是 2 倍）。缩放比按实际出图算，不靠猜。
// 截法：screencapture -R x,y,w,h 直接吃全局点坐标（它内部走 ScreenCaptureKit 的按矩形截图），
// 不用猜 -D 的屏幕序号跟 CGGetActiveDisplayList 是不是一个顺序。矩形先裁到一块屏以内，缩放比才统一。

/// 在用的显示器（全局点坐标）
func displays() -> [CGRect] {
    var n: UInt32 = 0
    guard CGGetActiveDisplayList(0, nil, &n) == .success, n > 0 else { return [] }
    var ids = [CGDirectDisplayID](repeating: 0, count: Int(n))
    guard CGGetActiveDisplayList(n, &ids, &n) == .success else { return [] }
    return ids.prefix(Int(n)).map { CGDisplayBounds($0) }
}

/// 要截的范围：rect 落在哪块屏（交集最大）就裁到那块屏以内、取整；rect 为 nil = 整个主屏。
/// 返回（要截的全局矩形，它所在的那块屏）；不在任何屏上回 nil
func captureTarget(_ rect: CGRect?, displays all: [CGRect], main: CGRect) -> (want: CGRect, screen: CGRect)? {
    guard let r = rect else { return (main, main) }
    let area = { (x: CGRect) -> CGFloat in x.isNull ? 0 : x.width * x.height }
    guard let b = all.filter({ area($0.intersection(r)) > 0 })
                     .max(by: { area($0.intersection(r)) < area($1.intersection(r)) }) else { return nil }
    let want = r.intersection(b).integral.intersection(b)
    guard !want.isNull, want.width >= 1, want.height >= 1 else { return nil }
    return (want, b)
}

/// screencapture 的 -R 参数（全局点，整数）。贴着 -R 写，负坐标才不会被当成另一个选项
func rectArg(_ r: CGRect) -> String {
    "-R\(Int(r.minX)),\(Int(r.minY)),\(Int(r.width)),\(Int(r.height))"
}

/// 出图跟要截的范围同比例才算截对了（缩放比 = 像素 / 点）
func fits(_ img: CGImage, _ r: CGRect) -> Bool {
    let sx = CGFloat(img.width) / r.width, sy = CGFloat(img.height) / r.height
    return sx >= 0.5 && abs(sx - sy) < 0.05
}

/// 跑一次 screencapture（-x 不出声），把图读进内存；失败回 nil 和原因
func screencapture(_ opts: String...) -> (image: CGImage?, error: String) {
    let tmp = privateTemp("shot-\(UUID().uuidString.prefix(8)).png")
    defer { try? FileManager.default.removeItem(atPath: tmp) }
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
    p.arguments = ["-x"] + opts + [tmp]
    p.standardOutput = FileHandle.nullDevice
    let errPipe = Pipe()
    p.standardError = errPipe
    do { try p.run() } catch { return (nil, "起不来 screencapture：\(error.localizedDescription)") }
    let errText = String(data: errPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?
        .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    p.waitUntilExit()
    // 先整个读进内存再删文件：CGImageSource 可能按需回头读文件
    guard p.terminationStatus == 0, let data = FileManager.default.contents(atPath: tmp),
          let src = CGImageSourceCreateWithData(data as CFData, nil),
          let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
        return (nil, "screencapture \(opts.joined(separator: " ")) 退出码 \(p.terminationStatus)\(errText.isEmpty ? "" : "：\(errText)")")
    }
    return (img, "")
}

/// 截 rect（全局点）；rect 为 nil 就是整个主屏。返回像素图，和它实际覆盖的全局矩形（伸出屏幕的部分会被裁掉）
func capture(_ rect: CGRect?) -> (image: CGImage, covered: CGRect) {
    let main = CGDisplayBounds(CGMainDisplayID())
    guard let t = captureTarget(rect, displays: displays(), main: main) else {
        fail(rect == nil ? "找不到显示器" : "窗口不在任何一块屏幕的可见范围里")
    }
    let shot = screencapture(rectArg(t.want))
    if let img = shot.image {
        guard fits(img, t.want) else {
            fail("截到的图（\(img.width)×\(img.height) 像素）跟要截的范围（\(Int(t.want.width))×\(Int(t.want.height)) 点）对不上，坐标没法换算")
        }
        return (img, t.want)
    }
    // -R 不行时：目标在主屏就退回整屏截再裁（-D1 文档写明是主屏，序号不会错）；副屏没有可靠的退路，直接报错
    if t.screen == main, let full = screencapture("-D1").image, fits(full, main),
       let cropped = full.cropping(to: pixelRect(t.want, screen: main, imageWidth: full.width, imageHeight: full.height)) {
        return (cropped, t.want)
    }
    fail("截图失败（\(shot.error)）。多半是 Mira 没有屏幕录制权限，或屏幕锁着")
}

/// 截窗口本身（-l 窗口号，-o 不带阴影）：被别的窗口挡住、在后台都截得到它自己，出图覆盖的就是窗口矩形。
/// 截不到（窗口刚关、特殊窗口）或尺寸对不上，就退回按屏幕区域截
func captureWindow(_ w: (id: CGWindowID, rect: CGRect)) -> (image: CGImage, covered: CGRect) {
    if w.rect.width >= 1, w.rect.height >= 1, let img = screencapture("-o", "-l\(w.id)").image, fits(img, w.rect) {
        return (img, w.rect)
    }
    return capture(w.rect)
}

/// 全局点矩形 → 那块屏截图里的像素矩形：先减屏幕原点，再乘这块屏的缩放比
func pixelRect(_ r: CGRect, screen b: CGRect, imageWidth: Int, imageHeight: Int) -> CGRect {
    let sx = CGFloat(imageWidth) / b.width, sy = CGFloat(imageHeight) / b.height
    return CGRect(x: (r.minX - b.minX) * sx, y: (r.minY - b.minY) * sy, width: r.width * sx, height: r.height * sy).integral
}

/// 写 PNG；给了 size 就先缩放到那个像素尺寸（传「点」尺寸 = 图上 1 像素对应屏幕 1 点）
func writePNG(_ img: CGImage, to path: String, size: CGSize? = nil) {
    var out = img
    if let s = size {
        let w = max(1, Int(s.width.rounded())), h = max(1, Int(s.height.rounded()))
        if w != img.width || h != img.height {
            guard let space = CGColorSpace(name: CGColorSpace.sRGB),
                  let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { fail("缩放截图失败") }
            ctx.interpolationQuality = .high
            ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
            guard let scaled = ctx.makeImage() else { fail("缩放截图失败") }
            out = scaled
        }
    }
    guard let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, "public.png" as CFString, 1, nil) else {
        fail("写不了 \(path)")
    }
    CGImageDestinationAddImage(dest, out, nil)
    guard CGImageDestinationFinalize(dest) else { fail("写不了 \(path)") }
}

// ── 系统级光标浮层联动 ──────────────────────────────────────────────────────
// 用 ~/.dsh/bin/dsh-cursor 那个常驻 NSPanel 浮层：操作时把光标飘过去，
// 用户想看就看得见；它不抢前台、点击穿透，所以不影响任何东西。
// 浮层没在跑就静默跳过。

var cursorOverlayOff = false

/// FIFO 能以非阻塞方式打开 = 有读者 = 浮层活着、收得到指令
func overlayReady() -> Bool {
    let fd = open(cursorFifo, O_WRONLY | O_NONBLOCK)
    guard fd >= 0 else { return false }
    close(fd)
    return true
}

func overlayRunning() -> Bool {
    let probe = Process()
    probe.executableURL = URL(fileURLWithPath: "/usr/bin/pgrep")
    probe.arguments = ["-U", String(getuid()), "-f", "dsh-cursor-overlay"]   // 只认自己账号的，别的账号开着浮层不算
    probe.standardOutput = FileHandle.nullDevice
    probe.standardError = FileHandle.nullDevice
    try? probe.run(); probe.waitUntilExit()
    return probe.terminationStatus == 0
}

/// 浮层没在跑就拉起来（跟插件里的 ensureCursor 一个意思，让命令行单独用也有特效）
func ensureOverlay() {
    if ProcessInfo.processInfo.environment["MIRA_CU_MANAGED"] == "1" { return }
    if overlayReady() { return }
    // 进程在、FIFO 还没好 = 刚起（刚装好的二进制第一次启动 macOS 要验一下，会慢一点）：等它，别再起第二个
    if !overlayRunning() {
        let bin = NSString(string: "~/.dsh/bin/dsh-cursor-overlay").expandingTildeInPath
        guard FileManager.default.isExecutableFile(atPath: bin) else { return }
        try? FileManager.default.removeItem(atPath: cursorFifo)   // 进程被 kill 后残留的，清掉
        let p = Process()
        p.executableURL = URL(fileURLWithPath: bin)
        p.arguments = ["--fifo", cursorFifo]                      // 明着传：旧版浮层默认还是 /tmp 下那个公用路径
        p.standardOutput = FileHandle.nullDevice
        p.standardError = FileHandle.nullDevice
        try? p.run()
    }
    for _ in 0..<40 {                                     // 最多等 2 秒
        if overlayReady() { return }
        usleep(50_000)
    }
}

func overlayPing(_ cmd: String) {
    guard !cursorOverlayOff else { return }
    let fifo = cursorFifo
    // 关键：O_NONBLOCK。FIFO 没读者时普通 open 会**永久阻塞**，
    // 之前就是这样把整个点击卡超时的。没读者就直接跳过，绝不能拖慢操作。
    let fd = open(fifo, O_WRONLY | O_NONBLOCK)
    guard fd >= 0 else { return }
    var bytes = Array((cmd + "\n").utf8)
    _ = write(fd, &bytes, bytes.count)
    close(fd)
}

// ── CGEvent 投递（不移动真实鼠标）────────────────────────────────────────────

/// 目标进程在这个点上最靠前的窗口：窗口号 + 窗口左上角（屏幕坐标，左上原点）。没有就 nil
func targetWindow(pid: pid_t, at p: CGPoint) -> (number: Int64, origin: CGPoint)? {
    guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return nil }
    for w in list {                                      // 列表是从前往后排的
        guard (w[kCGWindowOwnerPID as String] as? Int).map({ pid_t($0) }) == pid,
              let b = w[kCGWindowBounds as String] as? NSDictionary,
              let r = CGRect(dictionaryRepresentation: b as CFDictionary), r.contains(p),
              let n = w[kCGWindowNumber as String] as? Int else { continue }
        if let a = w[kCGWindowAlpha as String] as? Double, a == 0 { continue }
        return (Int64(n), r.origin)
    }
    return nil
}

/// 事件里没公开的两样东西。放在 enum 的静态成员里（用到时才初始化）：这个文件是脚本式顶层代码，
/// 写在 switch 后面的全局 let 在 switch 跑的时候还没赋值，读到的是 0 / nil
enum WindowEventFields {
    typealias SetWindowLocation = @convention(c) (CGEvent, CGPoint) -> Void
    /// 系统私有的 CGEventSetWindowLocation（窗口内坐标）。按名字现找，找不到就只填窗口号
    static let setWindowLocation: SetWindowLocation? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "CGEventSetWindowLocation")
        .map { unsafeBitCast($0, to: SetWindowLocation.self) }
    /// 窗口号字段：没写进公开头文件，AppKit 的 NSEvent.windowNumber 读的就是它
    static let windowNumber = CGEventField(rawValue: 51)!
}

/// 目标是不是 Chromium 内核（Electron 应用、Chrome 系浏览器）：看应用包里有没有这类框架
func isChromium(pid: pid_t) -> Bool {
    guard let url = NSRunningApplication(processIdentifier: pid)?.bundleURL else { return false }
    let fw = url.appendingPathComponent("Contents/Frameworks")
    let names = (try? FileManager.default.contentsOfDirectory(atPath: fw.path)) ?? []
    return names.contains { name in
        name == "Electron Framework.framework" || name.hasSuffix("Helper (Renderer).app")
            || (name.hasSuffix(" Framework.framework")
                && FileManager.default.fileExists(atPath: fw.appendingPathComponent(name).appendingPathComponent("Versions/Current/Helpers").path))
    }
}

/// 后台的 Chromium / Electron 窗口不收「激活窗口的那一下」点击（DSH 自己就是），按下也就被丢了。
/// 按下那一下带上 ⌘：AppKit 会把它直接交给页面、不激活窗口。松开和 click 不带 ⌘，页面看到的就是普通点击
func needsCommandPress(pid: pid_t) -> Bool {
    guard let app = NSRunningApplication(processIdentifier: pid), !app.isActive else { return false }
    return isChromium(pid: pid)
}

/// postToPid 造出来的鼠标事件不带窗口号（0）、也没有窗口内坐标。AppKit / Electron 找不到窗口，
/// 就把点击、拖拽、滚轮丢了（DSH 自己的窗口、普通 AppKit 窗口都这样）。
/// 填上窗口号和窗口内坐标，事件才会送进那个窗口，而且照样不抢前台、不动真实鼠标
func tagWindow(_ e: CGEvent, window: (number: Int64, origin: CGPoint)?, at p: CGPoint) {
    guard let w = window else { return }
    e.setIntegerValueField(WindowEventFields.windowNumber, value: w.number)
    WindowEventFields.setWindowLocation?(e, CGPoint(x: p.x - w.origin.x, y: p.y - w.origin.y))
}

/// global=false：投递给目标进程（不移动真实鼠标）；true：走系统事件（会移动真实鼠标，兼容性最好）
func postClick(pid: pid_t, at point: CGPoint, global: Bool = false) -> Bool {
    let src = CGEventSource(stateID: .hidSystemState)
    let win = global ? nil : targetWindow(pid: pid, at: point)
    let commandPress = !global && needsCommandPress(pid: pid)
    for (type, button) in [(CGEventType.leftMouseDown, CGMouseButton.left), (CGEventType.leftMouseUp, CGMouseButton.left)] {
        if type == .leftMouseDown && inputCancelled() { return false }
        guard let e = CGEvent(mouseEventSource: src, mouseType: type, mouseCursorPosition: point, mouseButton: button) else { return false }
        e.setIntegerValueField(.mouseEventClickState, value: 1)
        if global {
            if type == .leftMouseDown { CGWarpMouseCursorPosition(point) }   // 让光标也过去
            e.post(tap: .cghidEventTap)
        } else {
            tagWindow(e, window: win, at: point)
            e.flags = commandPress && type == .leftMouseDown ? .maskCommand : []
            e.postToPid(pid)
        }
        usleep(30_000)
    }
    if !global { makeMainWindow(pid: pid, at: point) }   // 跟真点一样：点了哪个窗口，接下来的输入就进哪个
    return true
}

/// 后台应用没有「当前窗口」时，发给它的按键没人接，打的字全丢（Chromium / Electron 必然这样，DSH 自己就是）。
/// 用辅助功能把窗口设成它自己的主窗口：应用不会被激活、不抢前台，按键就有了去处。
/// 给了坐标就设那个点上的窗口（点哪个窗口，之后的输入就进哪个），没给就设它现在的主窗口
func makeMainWindow(pid: pid_t, at p: CGPoint? = nil) {
    guard let app = NSRunningApplication(processIdentifier: pid), !app.isActive else { return }
    let ax = AXUIElementCreateApplication(pid)
    let wins = (attr(ax, kAXWindowsAttribute as String) as? [AXUIElement]) ?? []
    var target: AXUIElement?
    if let p = p {
        target = wins.first { frame($0)?.contains(p) == true }
    } else if let m = attr(ax, kAXMainWindowAttribute as String), CFGetTypeID(m) == AXUIElementGetTypeID() {
        target = (m as! AXUIElement)
    } else {
        target = wins.first
    }
    guard let w = target else { return }
    AXUIElementSetAttributeValue(w, kAXMainAttribute as CFString, kCFBooleanTrue)
}

func postText(pid: pid_t, _ text: String) -> Bool {
    let src = CGEventSource(stateID: .hidSystemState)
    let units = Array(text.utf16)
    // AppKit 应用一个按键事件就能收下整段字。Chromium / Electron 在后台只认一个字符的按键，
    // 一次塞多个字（中文、表情、"ab"）整段丢，所以拆成一个 UTF-16 单元一发（表情的两半它自己会拼上）
    let chunks = isChromium(pid: pid) ? units.map { [$0] } : [units]
    for chunk in chunks {
        if inputCancelled() { return false }
        guard let down = CGEvent(keyboardEventSource: src, virtualKey: 0, keyDown: true),
              let up = CGEvent(keyboardEventSource: src, virtualKey: 0, keyDown: false) else { return false }
        down.keyboardSetUnicodeString(stringLength: chunk.count, unicodeString: chunk)
        up.keyboardSetUnicodeString(stringLength: chunk.count, unicodeString: chunk)
        down.postToPid(pid)
        usleep(chunks.count > 1 ? 5_000 : 20_000)
        up.postToPid(pid)
        if chunks.count > 1 { usleep(5_000) }
    }
    usleep(20_000)                                     // 同上：等松键送到再退出
    return true
}
