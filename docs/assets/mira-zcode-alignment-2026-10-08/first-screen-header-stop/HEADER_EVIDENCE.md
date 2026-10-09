# Header regression evidence

Updated: 2026-10-09 17:49 (Asia/Shanghai).

Command:

```sh
node docs/assets/mira-zcode-alignment-2026-10-08/first-screen-header-stop/mira-header-browser.mjs
```

`header-browser-results.json` records five passing real-DOM checks and zero page errors. The runner bundles the current Workbench source with esbuild and renders real React, assistant-ui and Radix components with current Tailwind CSS. Its explicit in-browser PilotHost and localStorage fixtures are isolated from user sessions and preferences. This is not the production app entry or an Electron/MessageChannel/Git filesystem test; it is not a ZCode same-state visual or performance comparison.

Covered: Header group changes while sidebar open/closed, retained collapse preferences, reload persistence and ungrouping; lazy Git tooltip/menu requests, loading and duplicate-query suppression, uncommitted count, visible error/retry, and no inferred branch for personal working directories.

Screenshots:

- [Header ungrouped task](header-group-ungroup-light.png)
- [Header Git context](header-project-git-light.png)

Focused source regression: four test files, 57 tests passed at 17:49; React typecheck and `git diff --check` passed. Native desktop input and window screenshots were deliberately not performed while the user's screen was locked. Native Header/group and same-state ZCode acceptance remain pending.
