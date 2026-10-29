# Windows Computer Use for DeepSeek Harness

This wiki describes dsh-computer-use-win and its MCP bridge into DSH. The runtime has no npm dependencies and supports Windows PowerShell 5.1.

- [Architecture](architecture.md): native capture, UIA, OCR, worker lifecycle and action verification.
- [MCP tools](mcp-tools.md): schemas, parameters and examples; tools/list is authoritative.
- [App technology matrix](app-technology-matrix.md): provider differences and practical fallback choices.
- [Safety](safety.md): scoped actions and input guards.
- [Historical macOS notes](mac-codex-computer-use.md): upstream design background, not a description of DSH internals.

Prefer a scoped UIA query. If it is sparse or truncated, find can supplement it with OCR. Inspect actual visible text when a literal query misses. Use screenshot for visual controls and preserve focus after coordinate clicks. Confirm effects using wait_for or another observation.

DSH MCP bridges that register resources can expose this wiki; consult the active bridge/profile rather than assuming that every host reads resource content automatically.
