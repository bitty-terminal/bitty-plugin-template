# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Minimal runnable plugin template under `template/`: accepted-contract
  `bitty-plugin.toml`, `lua/<module>/init.lua` entry point, generated CI
  workflow, generated README, and a transitional manifest validator.
- Deterministic generator `scripts/generate-plugin.mjs` with validated inputs
  and fail-closed target handling.
- `just clean-generation` evidence gate and `just fmt`/`fmt-files` recipes.
- Adopt the canonical `.editorconfig` baseline (`CTX-0023` slice); the
  repository-metadata baseline guide and ADR-0011 remain Proposed.

### Changed

- Repository-metadata refresh: `packageManager` pins `bun@1.4.2`, the
  `carryctx` devDependency moves to 0.11.5, a conservative `.gitattributes`
  baseline normalizes text files to LF, and CONTRIBUTING/SECURITY document the
  contributor-branch convention and the canonical security baseline
  (`CTX-0033`).
- Switch generated repositories to the authoritative `bitty-plugin-lint`
  (bitty-plugin-sdk, R-SDK-2) for manifest validation (`CTX-0017`). The
  generator substitutes the commit-pinned SDK ref (`PLUGIN_SDK_REF`, exposed as
  the `@@PLUGIN_SDK_REF@@` placeholder) into the generated `package.json` and
  `bun.lock`; the generated `justfile` gains `just install`
  (`bun install --frozen-lockfile`) and `just manifest` runs
  `bun run bitty-plugin-lint bitty-plugin.toml`. Gates run offline after the
  one-time install, and `just check` fails closed when the dependency is
  absent. The template CI workflow installs the pinned dependencies before the
  gates. `just refresh-sdk-pin` / `bun scripts/refresh-sdk-pin.mjs`
  deterministically regenerates `template/bun.lock` when the pin moves.

### Removed

- Remove the vendored transitional `template/scripts/validate-manifest.mjs`.
  The SDK linter is now the single source of manifest validation, closing the
  recorded divergence risk `PX-0061`/`PX-0062` (parameterized filesystem
  capability keys).

### Fixed

- Re-resolve the SDK lockfile on a pin bump (`CTX-0017`, review finding
  `PX-0103`): `scripts/refresh-sdk-pin.mjs` now runs
  `bun update bitty-plugin-sdk` instead of `bun install`. Bun reuses an existing
  git-dependency lockfile entry, so a plain install left the resolved short
  SHA, cache key, and integrity hash stale while exiting 0. Add
  `just verify-sdk-pin` / `scripts/verify-sdk-pin-refresh.mjs`, a network-only
  end-to-end check (skips offline) that bumps a scratch copy to another SDK
  commit and asserts the tuple moves.
- Guard the SDK pin invariant (`CTX-0017`, review finding `PX-0101`): `bun test`
  now asserts that `template/bun.lock` resolves `PLUGIN_SDK_REF` (matching short
  SHA and cache-key suffix), so bumping the constant without regenerating the
  lockfile fails `just check` instead of silently shipping a stale SDK. Add
  `scripts/refresh-sdk-pin.mjs` and `just refresh-sdk-pin` for deterministic
  lockfile regeneration.
- Ignore the gitignored `recording/` scratch directory in Markdown lint, so
  durable generated evidence (which contains its own `node_modules`) cannot
  fail `just check` on files outside the tracked tree.
- Re-align generated Markdown tables after placeholder substitution in
  `scripts/generate-plugin.mjs`, so the generated README stays valid for
  Markdownlint MD060 (`table-column-style`) at any plugin module-name length.
  Re-alignment leaves fenced and indented code blocks byte-identical, requires
  the delimiter cell count to match the header, and uses a grapheme/East-Asian
  width model that mirrors the linter for ASCII, CJK, and emoji content
  (including ZWJ sequences; some exotic spacing-mark clusters may differ).
  `just check` now runs `scripts/generate-plugin.test.mjs`, and
  `just clean-generation` lints the generated README (#53).
- Verified the template `just lua` gate against the pinned `luaparse` 0.3.1
  CLI and added a fail-closed `lua-control` self-check, so a generated
  repository's `just check` proves the parser rejects invalid Lua instead of
  passing silently on empty input (P2-9).
- Aligned `scripts/generate-plugin.mjs` `--version` validation with the SDK
  SemVer 2 pattern (`bitty-plugin-sdk/src/manifest.ts`), rejecting the empty
  and underscore-bearing pre-release/build suffixes the SDK lint rejects
  (P2-10).
