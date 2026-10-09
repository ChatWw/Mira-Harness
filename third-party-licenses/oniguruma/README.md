# Mira code highlight WASM attribution

Verified 2026-10-09. Shiki and `@shikijs/engine-oniguruma` 3.23.0 use the
466,610-byte WASM from `vscode-oniguruma` 1.7.0. The installed `shiki/wasm`
`wasmBinary` and `package/release/onig.wasm` from the npm 1.7.0 tarball both have
SHA-256 `fd885c2d12e5951e59d761ebd4a006e06254b1491fd6f530c92b69fb4d8d77d9`.

Shiki's MIT license is preserved in `../shiki/LICENSE-MIT`. These original
Microsoft MIT and Oniguruma notices are also distributed with the app:

- https://raw.githubusercontent.com/microsoft/vscode-oniguruma/v1.7.0/LICENSE.txt
- https://raw.githubusercontent.com/microsoft/vscode-oniguruma/v1.7.0/NOTICES.txt
- https://registry.npmjs.org/vscode-oniguruma/-/vscode-oniguruma-1.7.0.tgz

No ZCode tokenizer implementation was copied. Mira uses Shiki's public APIs in
a separate Worker. This attribution does not claim release or UI acceptance.
