# Contributing to bitty-plugin-template

This guide is for contributors maintaining this template repository. The
repository is documentation-first and pre-implementation: everything here is
proposed governance scaffolding, not implemented product behavior. Guidance
aimed at plugin authors consuming generated output is out of scope until the
scaffold itself is accepted.

## Repository ground rules

- Read [AGENTS.md](AGENTS.md) before making any change. It defines authority,
  scope boundaries, CarryCtx workflow, toolchain policy, and the security
  constraints that override scaffolding convenience.
- The binding rules under [.carryctx/rules/](.carryctx/rules/) (delivery,
  documentation, security) apply to every agent and contributor.
- Canonical plugin architecture, API, packaging, compatibility, and security
  contracts live in `bitty-docs`. This repository must not invent capabilities,
  lifecycle semantics, or release policy independently.
- Never commit, push, publish packages, or mutate remote state without
  explicit authorization from the owning task.

## Prerequisites

Proposed toolchain expectations (wiring lands in a separately authorized
follow-up task):

- `just` — command runner. Quality gates are expected to be owned exclusively
  by this repository's justfile once it exists; do not invoke formatters or
  linters by name.
- `bun` / `bunx --bun` — JavaScript execution and package management. Never
  use `npm`, `npx`, or `yarn` in any Bitty repository.
- `markdownlint-cli2` — Markdown linting, configured by
  [.markdownlint-cli2.jsonc](.markdownlint-cli2.jsonc).
- `commitlint` — Conventional Commit message linting, configured by
  [commitlint.config.ts](commitlint.config.ts).

No build, test, or generation steps exist in this repository yet.

## Development setup

Until hook and justfile wiring is authorized and merged, validation is local
and manual:

1. Enter this repository before running Git, CarryCtx, or toolchain commands.
2. Lint changed Markdown with the committed configuration above.
3. Record scoped work in CarryCtx (task, session, progress, checkpoint) and
   stop at review; independent review is required for acceptance.

## Delivery lifecycle

Changes follow Issue -> Branch -> Commit -> Pull Request -> Review -> Merge.
Before this repository's first commit, branch/worktree/commit/pull-request
stages are unavailable: initialization happens in a shared checkout with
explicit disjoint scopes, preserved unrelated changes, and CI-equivalent
local checks, as described in [AGENTS.md](AGENTS.md).

Every pull request states its Issue and CarryCtx task links, impact areas
(generated tree, SDK/API, security, DX, CI/release, documentation,
compatibility), validation evidence, dependencies, and cross-repository
ordering. Documentation synchronization with canonical `bitty-docs` is part
of definition of done.

## Committing

Use Conventional Commits:

```text
feat(scaffold): add manifest example
docs(readme): clarify audience boundaries
chore(governance): wire lefthook hooks
```

Commit messages are expected to pass commitlint once Git hook wiring lands.

## Changelog

User-visible changes are recorded in [CHANGELOG.md](CHANGELOG.md) under
`[Unreleased]`, following the Keep a Changelog format.

## Reporting vulnerabilities

Do not open public issues for security vulnerabilities. Follow
[SECURITY.md](SECURITY.md) instead.
