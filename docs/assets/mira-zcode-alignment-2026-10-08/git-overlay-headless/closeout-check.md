# Git 装饰收尾检查

日期：2026-10-09，Asia/Shanghai。此页为 11:25 的补充回归与证据核对，不覆盖原始 `tests.log` 的 909 项结果。

## 本次增量

未修改运行源码、UI、构建产物或截图。`tests/harnessWorkspaceFiles.test.ts` 的既有隐藏文件用例加入 `.git/`；新增普通 gitfile 用例验证只按文本读取，不跟随其 metadata 指针。

对照当前本地 ZCode HEAD `29628c9acdb81b703bbd4080c207a0e7ce5e276e`，浏览启用 includeHidden 并直接转换条目；`.zcodeignore` 搜索排除不适用于浏览。因此保留 `.git` 可见行为，不误将 Git ignored 装饰扩展为隐藏规则。源码指针和下一实际差距见 [后续能力审查](../NEXT_CAPABILITY_AUDIT_2026-10-09.md#文件树浏览与搜索规则核对)。

## 当前检查

| 命令/范围 | 当前执行结果 |
| --- | --- |
| `npm test -- --maxWorkers=2 tests/harnessWorkspaceFiles.test.ts` | 11:25:29 开始；1 文件 / 56 项通过，574ms |
| `npm test -- --maxWorkers=2` | 11:25:55 开始；96 文件 / 910 项通过，12.60s |
| SHA manifest 只读复核 | 11:26:15 后执行；既有 10 项内容 SHA-256 和字节数全部一致 |
| 构建许可只读复核 | 源目录与已构建目录的 7 份许可/来源文件、React NOTICE 与入口 HTML 内容哈希一致 |
| 文档链接与 sidecar | 最终四份证据文档的 31 个本地目标无缺失；design.json 可解析，schemaVersion 2，10 个组件且 Git 描述保留原生待验收边界 |
| 当前阶段入口 | 七份当前入口均保留 2026-10-09 日期、限定 ship、原生待验收与删除虚拟行/changed-only 下一步 |
| `git diff --check` | 测试与文档收尾后 exit 0 |

原独立 reviewer 复核 DESIGN/surface/sidecar 文档 P2 后确认 resolved，无此次文档修正引入的可见回归，限定 ship。完整初次 fix 与追加评分见 [finish-review.md](./finish-review.md)；该评分不扩展到原生或整体目标。

命令结果来自本次终端输出；本页是摘要，不伪造新的原始全量日志。只使用限定两 workers 的结果，不覆盖默认并发高亮超时历史。不因本次测试/文档变更重建不变的运行代码，也不复拍不变的界面。

原始类型/React/Electron 编译、产物审计和七张截图继续按 [Git 证据页](../GIT_OVERLAY_EVIDENCE.md) 的时间与范围引用。该页不证明真实 Electron grant、Vue Shell/设置、电脑操作、ZCode 同态比较、Windows 或安装包验收。没有提交或推送代码。
