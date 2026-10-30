# macOS backend source

Repository: https://github.com/OrderG-X/dsh-mac-computer-use
Revision: 0c38a4dd3635f785e6d04429bd8a4f7cf09195d6
License: MIT; see LICENSE.

Mira vendors plugin/index.js, tools/dsh-cu.swift and cursor/cursor-overlay.swift. The adapter replaces DSH settings and binary discovery with bundled Mira paths, returns image blocks from memory, uses a private per-run FIFO and temporary directory, and tracks native children for teardown. Native Swift input uses the same engine and overlay; visual screenshot/OCR/coordinates are preferred, with optional AX observe/index tools preserved. DSH host UI, traces, user config and global process searches are omitted.

Build both native helpers on macOS with Xcode Command Line Tools using npm run tools:build. Packaging builds the requested arm64 or x64 architecture and includes the binaries outside ASAR via resources/plugins. No runtime compiler is required. Native macOS permissions and behavior require acceptance on a Mac; Windows protocol tests do not establish native Mac correctness.

Mira's plugin detail now probes screen-recording and accessibility permissions through the bundled Swift executable, and opens the matching macOS settings pane only on user action. The cursor switch is persisted at ~/.mira/config/computer-use.json and passed to the backend through MIRA_CU_CONFIG; active sessions observe it without reconnecting. The native overlay also handles show-current so first-use typing, keys and launch operations display the Mira cursor before any coordinate action.
