# Contributing to bitty-plugin-template

This guide is for contributors to the `bitty-plugin-template` repository. The
repository is documentation-first and pre-implementation: everything here is
proposed governance scaffolding and a candidate scaffold, not implemented
product behavior. Guidance aimed at plugin authors consuming generated output
is out of scope until the scaffold itself is accepted.

## Repository ground rules

- Read [AGENTS.md](AGENTS.md) before making any change. It defines authority,
  scope boundaries, CarryCtx workflow, toolchain policy, and the security
  constraints that override scaffolding convenience.
- The binding rules under [.carryctx/rules/](.carryctx/rules/) (delivery,
  documentation, security) apply to every agent and contributor.
- Canonical plugin architecture, API, packaging, compatibility, and security
  contracts live in `bitty-docs` and `bitty-plugins-docs`. This repository must
  not invent capabilities, lifecycle semantics, or release policy
  independently.
- Never commit, push, publish packages, generate remote repositories, or
  mutate remote state without explicit authorization from the owning task.

## Prerequisites

Toolchain expectations (dependency versions are pinned in
[package.json](package.json) and locked in `bun.lock`; the justfile pins the
gate tool versions it invokes; never invoke formatters or linters by name):

- `just` — command runner owning all quality-gate invocations.
- `bun` / `bun run <bin>` — JavaScript execution and package management. Never
  use `npm`, `npx`, or `yarn` in any Bitty repository.
- `markdownlint-cli2`, `prettier`, `commitlint`, `lefthook` — invoked through
  the justfile at its pinned versions; install the locked dependencies with
  `bun install`.

## Development setup

1. Enter this repository before running Git, CarryCtx, or toolchain commands.
2. Install pinned development dependencies: `bun install`.
3. Enable Git hooks (optional): `just hooks-install`.
4. Run all quality gates: `just check` (Markdown lint, Prettier format check,
   and the generator test suite). CI runs the same aggregate target.
5. Record scoped work in CarryCtx (task, session, progress, checkpoint) and
   stop at review; independent review is required for acceptance.

## Delivery lifecycle

Changes follow Issue -> Branch -> Commit -> Pull Request -> Review -> Merge,
where independent review plus required CI must pass before merge. Commit
messages follow Conventional Commits and are validated by
[commitlint.config.ts](commitlint.config.ts).

Every pull request states its Issue and CarryCtx task links, impact areas
(generated tree, SDK/API, security, DX, CI/release, documentation,
compatibility), security and privacy impact, reproducible gate evidence, and
documentation-synchronization status. Labels (`feat`/`fix`/`docs`/`chore`,
`P0`/`P1`/`P2`, `area:*`) and milestone `v0.1.0` are kept in sync.

## Contributor branches

The project is managed with CarryCtx. Official branches follow the CarryCtx
task convention `ctx-XXXX/<type>-<slug>`, where `XXXX` is the owning task id,
`<type>` is one of `feat|fix|chore|docs`, and the slug is short kebab-case.
Commander housekeeping branches use `cmd/<slug>`.

External contributors must use a distinguishable prefix such as
`<github-handle>/<type>-<slug>` (for example `octocat/fix-scaffold-readme`) so
their branches are never confused with maintainer task branches.

## Capabilities and privacy

Generated plugins must request deny-by-default minimal manifest capabilities.
The template, the generator, and generated output must never include
install-time code execution, secrets, ambient OS authority, native in-process
escape hatches, or permissive allow-all defaults; any wider capability request
requires an explicitly scoped task plus a reviewed privacy and security note.

## Workflow snapshots

The engineering workflow snapshot lives in this repository on the branch
`refs/heads/carryctx-snapshots`. Merges run `just workflow-publish` (dry run:
`just workflow-publish-dry`) as part of the commander closeout; snapshots are
redacted publication artifacts and are never merged back. Fresh clones restore
with `just workflow-import` (`just workflow-import-dry`).

## Reporting

Report bugs and feature requests through the GitHub issue templates. Report
security issues privately per [SECURITY.md](SECURITY.md).
