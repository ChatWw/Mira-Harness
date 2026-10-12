# Bundled search executable

Mira distributes the unmodified native search executable from Microsoft's
`@vscode/ripgrep` 1.18.0 platform packages (ripgrep 15.0.0). The executable is
copied outside ASAR to `resources/tools/ripgrep` during desktop packaging.

- Wrapper/platform package: https://github.com/microsoft/vscode-ripgrep
  (MIT; the package's original LICENSE is copied as VSCODE-RIPGREP-LICENSE).
- ripgrep: https://github.com/BurntSushi/ripgrep/tree/15.0.0
  (MIT or Unlicense; Mira uses the MIT option, reproduced in RIPGREP-LICENSE-MIT).
- Bundled PCRE2 10.45: https://github.com/PCRE2Project/pcre2/tree/pcre2-10.45
  (BSD-3-Clause WITH PCRE2-exception, reproduced in PCRE2-LICENCE.md).

No ZCode runtime executable or search worker is redistributed by this change.
