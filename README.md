# Bitty Plugin Template

Reproducible starting point for Bitty plugin repositories. This repository owns
the template source, the deterministic generator, and clean-generation
evidence. It does not define the Bitty host, plugin API, SDK, capability model,
package format, compatibility policy, or release process.

Canonical product and plugin contracts belong to the
[bitty-docs repository](https://github.com/bitty-terminal/bitty-docs).
SDK-specific implementation evidence belongs to the
[bitty-plugin-sdk repository](https://github.com/bitty-terminal/bitty-plugin-sdk).

## See the project workflow (CarryCtx)

CarryCtx is the local-first tool that records this project's tasks, decisions,
and checkpoints. Install it globally for local development (recommended):

```sh
cargo install carryctx      # Rust toolchain, or: npm i -g carryctx
```

CarryCtx engineering state (tasks, sessions, checkpoints) is not cloned. A
fresh clone restores it from the in-repo `refs/heads/carryctx-snapshots`
branch:

```sh
just workflow-import-dry   # fetch + validate the snapshot; no DB writes
just workflow-import       # initialize CarryCtx state if needed, then import
```

Then `carryctx stats` reports the restored tasks, sessions, and checkpoints.

## What this repository provides

- `template/` — the generated plugin tree: `bitty-plugin.toml`,
  `lua/<module>/init.lua`, `package.json` and `bun.lock` (the commit-pinned
  authoritative `bitty-plugin-lint`), `justfile`, README, and a CI workflow.
- `scripts/generate-plugin.mjs` — deterministic generator with validated
  inputs that refuses to overwrite an existing target.
- `scripts/verify-host-integration.mjs` — host integration gate for a
  generated package: checks manifest discovery and `init.lua` activation
  separately (discovery is not activation evidence; PLUG-SDK-001, issue #67).
- `just clean-generation` — generates an example plugin into an ignored
  scratch directory, runs the generated repository's own `just check`, and
  verifies the tree against the host discovery and activation contract.
- `just check` — repository formatting and Markdown lint gates.

## Generating a plugin

```sh
bun scripts/generate-plugin.mjs \
  --id example.hello \
  --name "Hello Plugin" \
  --description "Minimal runnable Bitty plugin example." \
  --dir /path/to/new-plugin
```

The generator validates the plugin id, display name, description, and SemVer
version, substitutes every placeholder deterministically, re-aligns generated
Markdown tables so the output stays Markdownlint-clean, and fails if a
placeholder remains.

## Clean-generation evidence

`just clean-generation` is the repeatable evidence gate: it generates a fresh
tree from template source, installs its pinned dependencies
(`bun install --frozen-lockfile`), runs that tree's documented checks
(authoritative SDK manifest lint plus a Lua parse), verifies the tree against
the host discovery and activation contract
(`bun scripts/verify-host-integration.mjs`, discovery and activation checked
separately), and lints the generated README with this repository's Markdown
rules, all without hidden local state.
The generator
re-aligns Markdown tables after substitution so the generated README stays
valid for Markdownlint's table rule (MD060) at any placeholder length; fenced
and indented code blocks are left byte-identical. CI runs it after `just check`.

## Contract dependencies

- Manifest file name, schema, hard limits, and capability identifiers come
  from the accepted plugin-platform RFC in `bitty-docs`. The template never
  redefines them.
- `bitty-plugin-lint` (bitty-plugin-sdk, R-SDK-2) is the authoritative manifest
  validator (CTX-0017 resolved). Generated repositories install it from a
  pinned `bitty-plugin-sdk` commit declared in `package.json` and locked in
  `bun.lock`; `just manifest` runs it and no longer vendors a transitional
  re-implementation. The pin is a single named constant, `PLUGIN_SDK_REF` in
  `scripts/generate-plugin.mjs`, substituted into the generated tree as
  `@@PLUGIN_SDK_REF@@`. It tracks the frozen generation pipeline
  (bitty-plugin-sdk #108, re-wired by SDK #118, host parity from bitty #1303
  as re-wired by bitty #1391: `keymaps`/`tasks`/`services`
  WIRED, `env` DEFERRED with typed `E_NOT_IMPLEMENTED`,
  `process.spawn` v1-OUT).
  - **Maintenance:** when the SDK manifest contract moves, bump
    `PLUGIN_SDK_REF`, run `just refresh-sdk-pin` (or
    `bun scripts/refresh-sdk-pin.mjs`), then re-run `just clean-generation` in
    the same change. The helper swaps the concrete SHA into
    `template/package.json` and `template/bun.lock`, re-resolves the git
    dependency with `bun update bitty-plugin-sdk` (a plain `bun install` reuses
    the stale lockfile entry and would leave the resolved short SHA, cache key,
    and integrity hash unchanged), restores the `@@PLUGIN_SDK_REF@@`
    placeholder, and verifies the tuple. `bun test` guards the same invariant
    offline, so a constant bump without lockfile regeneration fails
    `just check`; `just verify-sdk-pin` is the network-only end-to-end
    re-resolution check. Do not bump the pin in unrelated tasks.
- `just template-sdk-sync` is the R-SDK-2 drift rule for the template itself
  (`scripts/check-template-sdk-sync.mjs`, part of `just check`): it fails
  closed whenever the scaffold drifts from the frozen pipeline — the SDK pin,
  the resolved lockfile tuple, the pending-host flags in `init.lua`, the
  least-privilege defaults, and the read-only SHA-pinned CI. It runs offline.
- Plugin API bindings in `init.lua` follow the frozen v1 surface; the
  authoritative Lua bindings are the SDK `bitty.d.lua` (R-SDK-1). The
  `services` namespace is WIRED (bitty #1391: the example provides and
  resolves `greeter` live against a `[services.provided]` declaration); `env`
  stays a commented-out typed stub that fails closed with `E_NOT_IMPLEMENTED`
  on the current host.

## Safety boundary

Generation is deterministic and validated from a clean scratch location.
Generated plugins use explicit least privilege, no embedded secrets, no
install-time execution, no ambient OS authority, and no native in-process
escape. Generated workflows use a read-only token, SHA-pinned actions, and
never publish from pull-request code.

## Repository checks

```sh
just check            # markdownlint + prettier + generator tests
just clean-generation # generate a plugin, run its gates, verify host integration
just host-integration # verify a generated tree against the host contract only
```

Any scaffold, manifest, example, workflow, package, or remote-repository
action requires a separately scoped task and independent review.
