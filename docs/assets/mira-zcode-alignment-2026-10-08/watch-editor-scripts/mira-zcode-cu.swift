import AppKit
import ApplicationServices
import CoreGraphics

func attribute(_ item: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    AXUIElementCopyAttributeValue(item, name as CFString, &value)
    return value
}
func emit(_ value: Any) {
    let data = try! JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    print(String(data: data, encoding: .utf8)!)
}
let args = Array(CommandLine.arguments.dropFirst())
let source = CGEventSource(stateID: .hidSystemState)
switch args.first ?? "windows" {
case "frontmost":
    if let app = NSWorkspace.shared.frontmostApplication { emit(["pid": app.processIdentifier, "name": app.localizedName ?? "", "bundle": app.bundleIdentifier ?? ""]) }
case "windows":
    let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
    emit(windows.filter { ($0[kCGWindowOwnerName as String] as? String ?? "").contains(args.count > 1 ? args[1] : "ZCode") })
case "focus":
    if let app = NSRunningApplication(processIdentifier: Int32(args[1])!) { app.activate(options: [.activateIgnoringOtherApps]) }
case "click":
    let point = CGPoint(x: Double(args[1])!, y: Double(args[2])!)
    let right = args.count > 3 && args[3] == "right"
    let middle = args.count > 3 && args[3] == "middle"
    for down in [true, false] {
      let event = CGEvent(mouseEventSource: source, mouseType: middle ? (down ? .otherMouseDown : .otherMouseUp) : right ? (down ? .rightMouseDown : .rightMouseUp) : (down ? .leftMouseDown : .leftMouseUp), mouseCursorPosition: point, mouseButton: middle ? .center : right ? .right : .left)
      event?.flags = []; event?.post(tap: .cghidEventTap)
    }
case "move":
    CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: CGPoint(x: Double(args[1])!, y: Double(args[2])!), mouseButton: .left)?.post(tap: .cghidEventTap)
case "drag":
    let start = CGPoint(x: Double(args[1])!, y: Double(args[2])!)
    let end = CGPoint(x: Double(args[3])!, y: Double(args[4])!)
    CGEvent(mouseEventSource: source, mouseType: .leftMouseDown, mouseCursorPosition: start, mouseButton: .left)?.post(tap: .cghidEventTap)
    for i in 1...20 {
        let t = Double(i)/20
        let p = CGPoint(x: start.x + (end.x-start.x)*t, y: start.y + (end.y-start.y)*t)
        CGEvent(mouseEventSource: source, mouseType: .leftMouseDragged, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
        usleep(10000)
    }
    CGEvent(mouseEventSource: source, mouseType: .leftMouseUp, mouseCursorPosition: end, mouseButton: .left)?.post(tap: .cghidEventTap)
case "key":
    let codes: [String: CGKeyCode] = ["escape":53,"enter":36,"tab":48,"up":126,"down":125,"left":123,"right":124,"space":49,"backspace":51,"a":0,"k":40,"n":45,"r":15,"g":5,"m":46,"2":19,"home":115,"end":119,"f10":109]
    let code = codes[args[1]]!
    var flags = CGEventFlags()
    for modifier in args.dropFirst(2) {
        if modifier == "cmd" { flags.insert(.maskCommand) }
        if modifier == "shift" { flags.insert(.maskShift) }
        if modifier == "ctrl" { flags.insert(.maskControl) }
    }
    for down in [true, false] { let event = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: down); event?.flags = flags; event?.post(tap: .cghidEventTap) }
case "type":
    let chars = Array(args[1].utf16)
    for offset in stride(from: 0, to: chars.count, by: 8) {
      let part = Array(chars[offset..<min(offset+8,chars.count)])
      for down in [true, false] { let event = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: down); event?.flags = []; event?.keyboardSetUnicodeString(stringLength: part.count, unicodeString: part); event?.post(tap: .cghidEventTap); usleep(12000) }
    }
case "press":
    let app = AXUIElementCreateApplication(Int32(args[1])!)
    let name = args[2]
    var found: AXUIElement?
    func find(_ item: AXUIElement, _ depth: Int) {
      if depth > 36 || found != nil { return }
      if (attribute(item, kAXRoleAttribute) as? String) == kAXButtonRole {
        let labels = [kAXTitleAttribute, kAXDescriptionAttribute].compactMap { attribute(item, $0) as? String }
        if labels.contains(name) { found = item; return }
      }
      for child in attribute(item, kAXChildrenAttribute) as? [AXUIElement] ?? [] { find(child, depth + 1) }
    }
    find(app, 0)
    if let found { emit(["action": "press", "name": name, "result": AXUIElementPerformAction(found, kAXPressAction as CFString).rawValue]) }
    else { emit(["missing": name]) }
case "scroll":
    CGEvent(scrollWheelEvent2Source: source, units: .pixel, wheelCount: 1, wheel1: Int32(args[1])!, wheel2: 0, wheel3: 0)?.post(tap: .cghidEventTap)
case "ax":
    let app = AXUIElementCreateApplication(Int32(args[1])!)
    var rows: [[String: Any]] = []
    func walk(_ item: AXUIElement, _ depth: Int) {
        if depth > 36 || rows.count > 2500 { return }
        var row: [String: Any] = ["depth":depth]
        for name in [kAXRoleAttribute,kAXTitleAttribute,kAXDescriptionAttribute,kAXValueAttribute] { if let value = attribute(item,name) { row[name] = String(describing:value).prefix(220).description } }
        if let p = attribute(item,kAXPositionAttribute), CFGetTypeID(p) == AXValueGetTypeID() { var point = CGPoint.zero; AXValueGetValue(p as! AXValue,.cgPoint,&point); row["position"] = [point.x,point.y] }
        if let s = attribute(item,kAXSizeAttribute), CFGetTypeID(s) == AXValueGetTypeID() { var size = CGSize.zero; AXValueGetValue(s as! AXValue,.cgSize,&size); row["size"] = [size.width,size.height] }
        rows.append(row)
        for child in attribute(item,kAXChildrenAttribute) as? [AXUIElement] ?? [] { walk(child,depth+1) }
    }
    walk(app,0); emit(rows)
default: fatalError("unknown action")
}
usleep(100000)
