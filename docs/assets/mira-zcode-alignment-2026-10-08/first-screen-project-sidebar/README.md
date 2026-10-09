# Independent project sidebar browser evidence

Updated: 2026-10-09 18:09 (Asia/Shanghai).

```sh
node docs/assets/mira-zcode-alignment-2026-10-08/first-screen-project-sidebar/mira-project-sidebar-browser.mjs
```

`project-sidebar-browser-results.json` records four passing scenario groups and zero page errors. Real React, assistant-ui, Radix and TanStack virtualized tree components render the current Workbench/Drawer source and current Tailwind CSS through an isolated esbuild test entry. The in-browser PilotHost and localStorage fixtures use a fresh headless browser context and no user data.

Covered:

- Header status badge and file-list shortcut removed.
- Active project A task and unsent draft retained while independently browsing project B or a project without any session.
- Project tree expansion, file search, Git decoration/filter, manual refresh and return, all using explicit project readers; no session creation, switching, session file fallback or right-workspace opening.
- Cross-project preview/add disabled; same active project controls enabled. Project read/image/editor permissions were not expanded.
- Empty task draft preserved; the files command does not prepare/create/open a task.
- Automation remains the main view when project files are shown in the sidebar, and returning to chat restores its draft.

The only `getSession` call initializes the explicit active-A fixture before the regression starts. Later call records contain project file/Git readers only. Four 1440 x 900 screenshots cover light/dark conversation and automation views.

This is not a production entry, MessageChannel, preload/IPC, actual filesystem/Git, Electron-native, same-state ZCode or performance acceptance test. No native desktop input or window focus occurred while the user's screen was locked. Native acceptance remains pending.

The initial runner assertion expected `{}` instead of `{ id: undefined, projectId: undefined }`; it was corrected without changing product code. The final run passed, and the obsolete assertion-failure screenshot and reconstructed JSON have been removed. Future failure JSON/PNG files use unique run identities.
