# @@PLUGIN_NAME@@

@@PLUGIN_DESCRIPTION@@

This repository was generated from
[bitty-plugin-template](https://github.com/bitty-terminal/bitty-plugin-template).
It is a minimal, Lua-only Bitty plugin package: a static manifest, one Lua
entry point, and a small quality gate. The host loads only `bitty-plugin.toml`
and the `lua/` module root; there is no JavaScript or TypeScript code and no
package manifest to install.

## Overview

@@PLUGIN_NAME@@ is a Bitty plugin with id `@@PLUGIN_ID@@`. Its runnable example
registers one command, provides one service, and reads one declared setting.

> Status: pre-implementation. The Bitty plugin host is still landing, and the
> entry point below follows the frozen Plugin API v1 generation pipeline
> (bitty-plugin-sdk #109, re-wired by SDK #118, host parity from bitty #1303
> as re-wired by bitty #1391: `keymaps`/`tasks`/`services`
> WIRED, `env` DEFERRED with typed `E_NOT_IMPLEMENTED`,
> `process.spawn` v1-OUT). `just check` validates the manifest with the
> authoritative `bitty-plugin-lint` from
> [bitty-plugin-sdk](https://github.com/bitty-terminal/bitty-plugin-sdk)
> (pinned by commit in the `justfile`), checks this README, and parses the Lua
> sources with a fail-closed parser control.
> Entry layout: the package root holds `bitty-plugin.toml` (the discovery
> unit) and the `lua/` module root (the `require` root). The host resolves the
> fixed `init.lua` entry as `lua/<module>/init.lua` (or `lua/init.lua`) and
> executes it once per activation; finding the manifest (discovery) alone does
> not prove the entry runs (activation), and no package-root forwarder is
> needed. The template's host-integration gate checks both phases separately.

## Install

Prerequisites:

- [`just`](https://github.com/casey/just) to run the gates.
- [`bun`](https://bun.sh), only so `bunx` can run the commit-pinned
  `bitty-plugin-lint` and `bitty-plugin-docs-check`. Nothing is installed into
  this repository.
- Lua 5.4 (`lua5.4` package, providing `luac5.4`). The host VM targets the Lua
  5.4 language, so the Lua gate parses with the 5.4 compiler. Set
  `LUAC=<path>` when your platform names the binary differently.

Place this repository where the host discovers plugin packages, run
`just check` once to validate it, then enable `@@PLUGIN_ID@@` in the host
configuration. The first `just check` needs network access to fill the `bunx`
cache; later runs reuse it.

## Commands

| Command               | Description                                      |
| --------------------- | ------------------------------------------------ |
| `@@PLUGIN_ID@@:hello` | Print the configured greeting as a notification. |

Commands are plugin-qualified as `<plugin-id>:<resource>`. The reserved
command id lives in `[lazy].commands` in `bitty-plugin.toml`; the
implementation lives in `lua/@@PLUGIN_MODULE@@/init.lua`.

## Configuration

Settings are read through `bitty.settings.get` with keys relative to
`plugins.@@PLUGIN_ID@@.*`. The shipped default comes from
`bitty-plugin.toml` `[settings]`; a valid user configuration file overrides it.
Settings are resolved at activation and pinned to the plugin generation, so a
change takes effect on the next activation.

| Setting    | Type   | Default   | Description                                                   |
| ---------- | ------ | --------- | ------------------------------------------------------------- |
| `greeting` | string | `"Hello"` | Greeting prefix printed by the `@@PLUGIN_ID@@:hello` command. |

The table is checked against `bitty-plugin.toml` `[settings]`: `just docs`
fails when a key is missing or extra, when a type disagrees, or when the rows
do not follow the manifest declaration order. Add a setting by declaring it in
the manifest first, then run
`bunx --bun --package github:bitty-terminal/bitty-plugin-sdk#<sdk_ref> bitty-plugin-docs-check --print-settings-table .`
to render the checked columns.

## Keybindings

This plugin registers no keybindings by default. The commented
`bitty.keymaps.suggest` example in `init.lua` proposes `ctrl+shift+h` for the
`hello` command; suggestions never override user or workspace mappings.

## Troubleshooting

- `just check` stops at `manifest`: the first run needs network access for the
  pinned SDK, and the manifest must match the accepted Plugin API v1 contract.
- `just check` stops at `lua-control`: install Lua 5.4 (or point `LUAC` at a
  Lua 5.4 compiler) so the parser control can run.
- `just docs` reports `readme.settings.missing` or `readme.settings.extra`:
  the Configuration table and `[settings]` disagree. Regenerate the table with
  `--print-settings-table` and keep the authored Description cells.
- The command does not appear: confirm `[lazy].commands` reserves
  `@@PLUGIN_ID@@:hello` and the plugin is enabled and activated by the host.
- A setting keeps its default: confirm the key is declared in `[settings]` and
  the user configuration file resolves to `plugins.@@PLUGIN_ID@@`.

## Layout

| Path                             | Purpose                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `bitty-plugin.toml`              | Static manifest: identity, compatibility, capability requests, settings, and lazy triggers.            |
| `lua/@@PLUGIN_MODULE@@/init.lua` | Entry point evaluated once per activation; every resource it creates belongs to the plugin generation. |
| `justfile`                       | Quality gates; the only place tool pins live (`sdk_ref`).                                              |
| `.github/workflows/ci.yml`       | CI gate with a read-only token and SHA-pinned actions.                                                 |

## Development

Run the same gate CI runs:

```sh
just check
```

`just manifest` validates `bitty-plugin.toml` with the authoritative SDK
linter, fetched by `bunx` from the bitty-plugin-sdk commit pinned in the
`sdk_ref` variable of the `justfile`, against the accepted contract in
bitty-docs `docs/specifications/plugin-platform-rfc.md` (file name, identity,
compatibility, capability closed set, lazy triggers, settings, hard limits).
`just lua` parses every `.lua` file under `lua/` with `luac5.4 -p` and fails
when none is found; `just lua-control` feeds the same checker an invalid
snippet and requires rejection, so a missing or no-op checker cannot pass
silently. `just docs` checks this README against the user-documentation
contract with the same pinned SDK. `just check` runs all four.

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
`keymaps`, `tasks`, `services`, and `settings` are WIRED on the current host
(the example provides and resolves `greeter` live and reads `greeting`); `env`
is a DEFERRED typed stub that fails closed with `E_NOT_IMPLEMENTED` (runtime),
so its example call in `init.lua` stays commented out. `process.spawn` is
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
