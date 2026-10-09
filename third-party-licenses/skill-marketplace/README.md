# Public Skill Marketplace Sources

Updated: 2026-10-09.

Mira's public Skill catalog reads `https://github.com/anthropics/skills` at the reviewed commit below. A complete Git tree, including file sizes and blob hashes, is recorded in `electron/services/marketplace/curated-skill-source.json`; files are downloaded from `raw.githubusercontent.com` and validated against that tree. This avoids the anonymous GitHub API rate limit without credentials. The renderer can request only validated catalog IDs, not an arbitrary repository, download URL, commit, or install path.

Live source reviewed: commit `683bc88e56f3e09ba94f7055977f3d3aa499f202`.

## License Policy

- The repository does not have a root `LICENSE` at the reviewed commit. Each package must contain its own `LICENSE`, `LICENSE.txt`, or `LICENSE.md`.
- Only packages whose own license identifies Apache License Version 2.0 and includes the copyright grant and redistribution provisions are listed.
- `docx`, `pdf`, `pptx`, and `xlsx` contain separate, non-open-source licenses and are excluded. `doc-coauthoring` has no package-level license and is excluded.
- The reviewed source contains 19 Skill directories; 14 meet the current package-level license and safety checks. Refresh revalidates files at the same reviewed commit. Updating the source version requires reviewing and replacing the tree in code; the refresh button is not an unreviewed main-branch auto-update.
- Every installation preserves the complete package directory, its unmodified license and copyright notices, a copy of the repository's `THIRD_PARTY_NOTICES.md`, and `MIRA_MARKETPLACE_SOURCE.json` with the exact commit and Git blob IDs. Mira does not rename upstream Skill files or modify their instructions.
- Catalog metadata is not an endorsement or a trademark license. The UI names the upstream source; no ZCode paid accounts, billing, private marketplace, or official ZCode plugin packages are copied.

## UI Structural Reference

The new `SkillMarketView` follows the search / installed strip / catalog / detail structure of ZCode `PluginStoreListView.tsx` and `PluginStoreDetailView.tsx`. Mira uses its own component names, host contract, behavior, and source catalog. ZCode's Apache-2.0 license and notices remain in [`../zcode/`](../zcode/).

## Installation Safety

Packages are downloaded from a fixed repository and commit, with exact Git blob hash and byte-size checks. Symlink, submodule, traversal, case-collision and unsafe cross-platform paths are excluded. Installation bounds are 128 files, 4 MiB per file and 32 MiB per package. Executable files are stored without executable permission, and installation does not run scripts or install dependencies.

Downloads are staged outside SkillStore's scan roots. A complete package is then published into a newly created `marketplace/anthropic-<slug>/package` directory. Existing user directories are never overwritten. Failed download or activation removes only the newly created package and restores the previous Skill directory preferences. Installed packages are enabled through the existing SkillStore so they can be selected by the existing Composer.

## Verification Boundary

The implementation tests use full-byte GitHub response fixtures, real isolated filesystem directories and the real SkillStore. They cover package download, intact licenses and references, hash failures, atomic cleanup, activation rollback, existing directories, symlinks, license exclusion and network-rate-limit feedback. Live public-source browse/detail and an isolated small-package install are verified separately; neither is a UI screenshot comparison or a real model/tool execution acceptance.
