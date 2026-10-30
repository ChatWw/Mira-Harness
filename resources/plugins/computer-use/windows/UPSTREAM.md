# Windows backend source

Repository: https://github.com/Yu-tao-Li/dsh-computer-use-win
Revision: 6fb642129595a6357588c70812974951db304662
License: MIT; see LICENSE and THIRD_PARTY.md.

Mira vendors the standalone MCP server, its browser support modules, PowerShell UIA backend, native indicators and MCP wiki resources. No DSH runtime is required. Mira changes visible branding, returns screenshots from memory, cleans temporary OCR files, and adds a shutdown notification to release input and native helpers when a Mira run ends. The host prevents simultaneous desktop owners and blocks further input after Esc for that run.

The vendored package metadata lists only Mira-shipped files and the supported self-test command. Upstream DSH entry points, peer dependencies and test commands for omitted files are removed. The docs/wiki files remain MCP resources served by mcp/server.mjs.
