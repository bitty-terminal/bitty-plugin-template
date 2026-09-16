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

### Fixed

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
