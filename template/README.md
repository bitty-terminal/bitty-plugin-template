# @@PLUGIN_NAME@@

@@PLUGIN_DESCRIPTION@@

This repository was generated from
[bitty-plugin-template](https://github.com/bitty-terminal/bitty-plugin-template).
It is a minimal, Lua-only Bitty plugin package: a static manifest, one Lua
entry point, and a small quality gate. The host loads only `bitty-plugin.toml`
and the `lua/` module root; there is no JavaScript or TypeScript code and no
package manifest to install.

> Status: pre-implementation. The Bitty plugin host is still landing, and the
> entry point below follows the frozen Plugin API v1 generation pipeline
> (bitty-plugin-sdk #109, re-wired by SDK #118, host parity from bitty #1303
> as re-wired by bitty #1391: `keymaps`/`tasks`/`services`
> WIRED, `env` DEFERRED with typed `E_NOT_IMPLEMENTED`,
> `process.spawn` v1-OUT). `just check` validates the manifest with the
> authoritative `bitty-plugin-lint` from
> [bitty-plugin-sdk](https://github.com/bitty-terminal/bitty-plugin-sdk)
> (pinned by commit in the `justfile`) and parses the Lua sources, with a
> fail-closed parser control so the parse cannot silently pass.
> Entry layout: the package root holds `bitty-plugin.toml` (the discovery
> unit) and the `lua/` module root (the `require` root). The host resolves the
> fixed `init.lua` entry as `lua/<module>/init.lua` (or `lua/init.lua`) and
> executes it once per activation; finding the manifest (discovery) alone does
> not prove the entry runs (activation), and no package-root forwarder is
> needed. The template's host-integration gate checks both phases separately.

## Layout

| Path                             | Purpose                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `bitty-plugin.toml`              | Static manifest: identity, compatibility, capability requests, and lazy triggers.                      |
| `lua/@@PLUGIN_MODULE@@/init.lua` | Entry point evaluated once per activation; every resource it creates belongs to the plugin generation. |
| `justfile`                       | Quality gates; the only place tool pins live (`sdk_ref`).                                              |
| `.github/workflows/ci.yml`       | CI gate with a read-only token and SHA-pinned actions.                                                 |

## Prerequisites

- [`just`](https://github.com/casey/just) to run the gates.
- [`bun`](https://bun.sh), only so `bunx` can run the commit-pinned
  `bitty-plugin-lint`. Nothing is installed into this repository.
- Lua 5.4 (`lua5.4` package, providing `luac5.4`). The host VM targets the
  Lua 5.4 language, so the Lua gate parses with the 5.4 compiler. Set
  `LUAC=<path>` when your platform names the binary differently.

## Development

Run the same gate CI runs:

```sh
just check
```

`just manifest` validates `bitty-plugin.toml` with the authoritative SDK
linter, fetched by `bunx` from the bitty-plugin-sdk commit pinned in the
`sdk_ref` variable of the `justfile`, against the accepted contract in
bitty-docs `docs/specifications/plugin-platform-rfc.md` (file name, identity,
compatibility, capability closed set, lazy triggers, hard limits). The first
run needs network access to fill the bunx cache; later runs reuse it.
`just lua` parses every `.lua` file under `lua/` with `luac5.4 -p` and fails
when none is found; `just lua-control` feeds the same checker an invalid
snippet and requires rejection, so a missing or no-op checker cannot pass
silently. `just check` runs all three.

Formatters, Markdown lint, commit hooks, a Lua language server, and dependency
bots are optional. Add whichever you prefer; the plugin does not need them.

## Capabilities

Capabilities are deny by default: a request absent from `[capabilities]` is
denied, identifiers come from a closed set, and there is no allow-all entry.
Request the narrowest identifier the plugin actually uses, one at a time.
High-risk identifiers (`terminal.raw-read`, `terminal.input.all`,
`ui.protocol-register`, `debug.control`, `runtime.plugin-manage`, and similar)
trigger distinct consent and should not be added without a reviewed need.

Filesystem access is declared as structured requests with explicit patterns:

```toml
[[capabilities.filesystem]]
access = "read"
paths = ["~/Documents/**/*.md"]
```

## API contract

The `bitty` namespace used by `init.lua` is the accepted Plugin API v1 surface
as frozen by the SDK generation pipeline (bitty-plugin-sdk #109, re-wired by
SDK #118, host parity from bitty #1303 as re-wired by bitty #1391). The
authoritative Lua bindings and type definitions are the
SDK `bitty.d.lua` (R-SDK-1); do not use surface that contract does not define.
`keymaps`, `tasks`, and `services` are WIRED on the current host (the example
provides and resolves `greeter` live); `env` is a DEFERRED typed stub that
fails closed with `E_NOT_IMPLEMENTED` (runtime), so its example call in
`init.lua` stays commented out. `process.spawn` is
v1-OUT and has no entry point.

## Before publishing

1. Add a `LICENSE` file and set `plugin.license` in `bitty-plugin.toml`.
2. Confirm `compat.bitty` and `compat.plugin-api` match the host releases you
   support.
3. Replace this README's status note once the plugin is functional and tested
   against a released host.
4. Keep the repository free of secrets, install scripts, and ambient
   authority.

## Security

Report vulnerabilities through the process in the umbrella project's security
policy rather than a public issue. This scaffold contains no credentials and no
install-time execution.
