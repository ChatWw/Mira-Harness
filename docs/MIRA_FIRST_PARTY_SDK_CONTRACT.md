# Mira 第一方子应用 SDK 契约（v1 草案）

> 状态：宿主侧契约草案，供后续独立 `mira-novel-studio` 项目实现。
> 本文不是可安装包，也不代表 Novel Studio 已创建、已发布或已接入。

## 1. 目标和边界

第一方子应用是由 Mira Shell 承载的静态前端资源。子应用拥有自己的页面和业务状态，但不直接依赖 Electron、Vue Shell、Pinia、主仓库内部模块或 SQLite 文件。模型凭据、小说作品存储、任务和应用生命周期由宿主控制。

首个实现对象是 `mira-novel-studio`。它应能在浏览器开发环境使用 mock SDK，也能在 Mira iframe 中使用真实 SDK；两种模式的 API 形状和错误码必须一致。Mira Vision 不属于本契约的当前实现范围。

不在 v1：任意插件市场、子应用原生代码、Node/Python 安装脚本、直接访问宿主文件系统、直接取得供应商 API key、跨应用读取数据、云端账号和自动差分更新。

## 2. 静态包契约

独立项目发布预构建 ZIP，不执行 `npm install` 或包内脚本。建议文件结构：

```text
mira-novel-studio-0.1.0.zip
├── index.html
├── assets/
├── app-manifest.json
└── LICENSES/
```

包内 `app-manifest.json` 描述应用本身；宿主的第一方清单描述是否信任、从哪里获取以及授予哪些能力。两者不混为一个自签名声明。

```json
{
  "manifestVersion": 1,
  "id": "mira-novel-studio",
  "name": "Mira Novel Studio",
  "version": "0.1.0",
  "entry": "index.html",
  "minShellVersion": "0.0.10",
  "platformApi": { "major": 1, "minor": 0 },
  "requiredCapabilities": ["models:text.generate", "storage:novel-projects"]
}
```

约束：

- `entry` 必须是包内相对路径，不能是绝对路径、外部 URL、带路径穿越的路径或符号链接逃逸后的文件。
- `id`、版本和 API 主版本必须与宿主清单匹配；能力只能从宿主支持的白名单中选择。
- ZIP 不能包含可执行安装脚本、原生模块或宿主资源目录之外的写入目标。
- SHA-256、下载 URL、发布仓库、版本和签名信息属于宿主发布元数据，不写入 ZIP 自身作为自引用摘要。
- 生产包由受信任来源提供；摘要只能证明内容完整，不能单独证明发布者身份。

## 3. iframe 握手和生命周期

宿主通过 sandbox iframe 承载入口，目前策略是 `allow-scripts allow-forms`，不授予 `allow-same-origin`。宿主为每次页面加载创建新授权会话和 `MessageChannel`：

```text
Shell main frame -> iframe window.postMessage({ type: "mira:connect", grantId, apiVersion }, "*", [port2])
Shell keeps port1 -> handles requests and calls host PlatformApi
iframe receives port2 -> uses only the port, never window.platform or Electron APIs
```

`"*"` 是 sandbox opaque origin 下的必要目标值；真正的授权来自不可预测的 grant、端口所有权和主进程校验，不来自 URL 或 Origin 字符串。

连接消息：

```ts
type MiraConnectMessage = {
  type: 'mira:connect'
  grantId: string
  apiVersion: { major: number; minor: number }
}
```

子应用收到端口后应保存当前连接，页面卸载或连接失效时清理所有请求和监听。以下任一事件发生，宿主会关闭旧端口并撤销 grant：

- iframe 再次 `load` 或入口 URL 改变；
- 应用 manifest 身份改变；
- Shell 卸载页面或主 frame 被销毁；
- 连接投递失败或宿主显式撤销。

异步 grant 返回时若页面已经切换，宿主不得把这个 grant 交给旧页面；子应用也不得继续使用晚到的连接。

## 4. 请求和响应

所有请求经 `MessagePort` 发送，不使用 loopback HTTP 作为子应用授权通道：

```ts
type MiraRequest = {
  type: 'mira:request'
  id: string
  method: string
  params?: unknown
}

type MiraResponse =
  | { type: 'mira:response'; id: string; ok: true; value: unknown }
  | { type: 'mira:response'; id: string; ok: false; error: { code: string; message: string } }
```

`id` 由子应用生成并在本次连接内保持唯一。宿主只回传同一个 `id`；子应用必须处理响应乱序、连接关闭和请求超时。错误消息可展示给用户，但业务逻辑应依赖稳定 `code`，不依赖中文文本。

当前稳定错误码：

| code | 含义 |
| --- | --- |
| `INVALID_REQUEST` | 参数、路径或作品文档格式无效 |
| `CAPABILITY_DENIED` | manifest 或当前 grant 没有该能力 |
| `UNKNOWN_METHOD` | 宿主不支持该方法 |
| `MODEL_REQUEST_FAILED` | 模型供应商调用失败 |
| `PLATFORM_ERROR` | 未分类的宿主错误 |

## 5. v1 方法

### `context.get`

无参数。返回当前应用身份、Shell 上下文、主题、语言、路由、API 版本和本次 grant 被授予的能力。应用 ID 来自宿主绑定，不由请求参数指定。

### `navigation.open`

```json
{ "path": "/chapters/1" }
```

只允许当前应用内部的绝对路径，不允许 `//host`、外部 URL、反斜杠、编码路径穿越或访问其他 Shell 页面。

### `models.generateText`

```json
{
  "role": "authoring",
  "prompt": "续写这一章",
  "selection": { "providerId": "provider", "modelId": "model" }
}
```

`role` 当前为 `authoring` 或 `automation`。`selection` 只含供应商和模型 ID；API key、Authorization、供应商完整配置和其他应用绑定不得进入子应用请求或响应。模型调用由主进程使用宿主持有的凭据完成。

### `novel.list`

无参数。仅授予 `storage:novel-projects` 且身份为 `mira-novel-studio` 时可用，返回作品摘要列表。

### `novel.get`

```json
{ "id": "project-id" }
```

返回版本化的 `NovelProjectDocument`。应用负责领域编辑规则，宿主负责受控读取和持久化边界。

### `novel.save`

```json
{ "project": { "version": 1, "id": "project-id", "title": "Untitled" } }
```

保存必须是显式调用；应用应在切换或卸载前等待保存结果。宿主只接受经过基本 schema 校验的文档，并保留事务、失败重试和旧入口回退能力。v1 不承诺跨应用双写或自动解决冲突。

## 6. 数据、任务和凭据所有权

| 内容 | 所有者 | 子应用可见范围 |
| --- | --- | --- |
| API key、供应商完整配置 | Mira 主进程 | 不可见 |
| 模型调用 | Mira 平台服务 | 仅得到请求结果和稳定错误 |
| `novel_projects` 兼容存储 | Mira 过渡平台服务 | 只能通过 `novel.*` 访问自己的作品 |
| 编辑器草稿和页面状态 | Novel Studio | 可在应用内恢复，不能写入宿主版本目录 |
| Harness 长任务和审批 | Mira Harness 运行时 | v1 不通过小说 SDK 直接操作 |
| 应用静态资源 | 安装器/应用中心 | 只读版本目录 |

源码迁出和数据迁出是两个独立动作。Novel Studio 没有完成旧作品读取、保存、失败回退和真实桌面验收前，不删除当前 `/novel` 或小说存储实现。

## 7. 浏览器 mock 约定

独立项目可提供 `createMockMiraSdk()`，但必须：

- 使用同样的方法名、参数校验和错误码；
- 明确标记为开发 mock，不模拟真实供应商凭据或持久化成功；
- 能模拟连接关闭、能力拒绝、模型失败和保存失败；
- 不把 `window.platform` 当作浏览器生产接口；
- 生产构建不因 mock 存在而绕过宿主授权。

## 8. 宿主放行条件

真实 `mira-novel-studio` 包接入前必须同时满足：

1. 包内 manifest、宿主清单和 API 版本兼容检查通过。
2. 入口只能从受信任包目录加载，不能通过用户自由录入 URL 绕过清单。
3. 合法 grant 可完成 `context.get`、一次模型请求和一次作品读写；API key 不出现在 renderer/子应用可读数据中。
4. 错误 grant、错误 frame、撤销后调用、缺能力、卸载中的调用均被拒绝。
5. 应用切换、重载和 Electron 重启后无重复订阅、悬挂端口或重复生成。
6. 用隔离旧数据副本验证作品正文、章节、草稿、失败重试和旧 `/novel` 回退。
7. macOS/Windows 打包版和真实模型调用分别记录验收证据；类型检查、单测和构建不能替代这些验收。

## 9. 当前宿主实现映射

- Manifest：[`src/config/firstPartyApps.ts`](../src/config/firstPartyApps.ts)
- Grant：[`electron/security/firstPartyGrant.ts`](../electron/security/firstPartyGrant.ts)
- IPC 校验：[`electron/ipc/platformIpc.ts`](../electron/ipc/platformIpc.ts)
- iframe 生命周期：[`src/pages/frontend/microAppHost/FirstPartyFrame.vue`](../src/pages/frontend/microAppHost/FirstPartyFrame.vue)
- 请求桥：[`src/platform/firstPartyBridge.ts`](../src/platform/firstPartyBridge.ts)
- 会话竞态：[`src/platform/firstPartySession.ts`](../src/platform/firstPartySession.ts)

这些文件证明宿主侧 v1 桥接骨架已经存在，不证明独立 Novel Studio 包已经完成。下一步是在独立仓库实现 SDK 适配层和静态入口，然后用本契约第 8 节逐项验收。
