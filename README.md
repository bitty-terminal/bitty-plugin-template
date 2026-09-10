# Bitty Plugin Template

Reproducible starting point for Bitty plugin repositories. This repository owns
the template source, the deterministic generator, and clean-generation
evidence. It does not define the Bitty host, plugin API, SDK, capability model,
package format, compatibility policy, or release process.

Canonical product and plugin contracts belong to the
[bitty-docs repository](https://github.com/bitty-terminal/bitty-docs).
SDK-specific implementation evidence belongs to the
[bitty-plugin-sdk repository](https://github.com/bitty-terminal/bitty-plugin-sdk).

## What this repository provides

- `template/` — the generated plugin tree: `bitty-plugin.toml`,
  `lua/<module>/init.lua`, `scripts/validate-manifest.mjs`, `justfile`,
  README, and a CI workflow.
- `scripts/generate-plugin.mjs` — deterministic generator with validated
  inputs that refuses to overwrite an existing target.
- `just clean-generation` — generates an example plugin into an ignored
  scratch directory and runs the generated repository's own `just check`.
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
version, copies `template/` verbatim, substitutes every placeholder
deterministically, and fails if a placeholder remains.

## Clean-generation evidence

`just clean-generation` is the repeatable evidence gate: it generates a fresh
tree from template source and runs that tree's documented checks (manifest
validation plus a Lua parse) without hidden local state. CI runs it after
`just check`.

## Contract dependencies

- Manifest file name, schema, hard limits, and capability identifiers come
  from the accepted plugin-platform RFC in `bitty-docs`. The template never
  redefines them.
- `bitty-plugin-lint` (bitty-plugin-sdk, R-SDK-2) is not yet published. Until
  it is, generated repositories use `scripts/validate-manifest.mjs`, a
  fail-closed transitional check that mirrors implemented host and package
  validation; it is replaced when the SDK CLI lands.
- Plugin API bindings in `init.lua` follow the accepted v1 surface sketch;
  `bitty.d.lua` (R-SDK-1) becomes authoritative.

## Safety boundary

Generation is deterministic and validated from a clean scratch location.
Generated plugins use explicit least privilege, no embedded secrets, no
install-time execution, no ambient OS authority, and no native in-process
escape. Generated workflows use a read-only token, SHA-pinned actions, and
never publish from pull-request code.

## Repository checks

```sh
just check            # markdownlint + prettier
just clean-generation # generate a plugin and run its gates
```

Any scaffold, manifest, example, workflow, package, or remote-repository
action requires a separately scoped task and independent review.
