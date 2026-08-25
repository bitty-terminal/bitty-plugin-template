# Bitty Plugin Template repository guidance

## Repository and authority

- This is the independent `bitty-plugin-template` repository. Its canonical
  remote is <https://github.com/bitty-terminal/bitty-plugin-template>.
- The Bitty umbrella directory and `bitty-plugins` directory are grouping only;
  neither owns this repository's Git or CarryCtx state.
- Enter this repository before running Git, CarryCtx, validation, or toolchain
  commands.
- `bitty-docs` is the canonical source for plugin architecture, API, security,
  packaging, compatibility, and public-behavior contracts.
- The project is pre-implementation. Repository existence or a proposed file
  tree is not evidence of a usable template or generated plugin.

## Current scope

- Documentation and repository governance may be initialized when the active
  CarryCtx task permits it.
- Do not add template or product code until a separately authorized task has
  accepted plugin API, package, security, CI, and distribution gates.
- This repository may eventually provide a plugin scaffold, CI configuration,
  manifest examples, tests, and contributor guidance, but their exact format is
  still a candidate.
- The template derives from accepted host and SDK contracts. It must not invent
  capabilities, lifecycle, package semantics, or release policy independently.

## CarryCtx and agents

- Use this repository's CarryCtx state for tasks, teams, dependencies, scopes,
  sessions, progress, decisions, checkpoints, handoffs, and review.
- The commander coordinates. Delegate substantial scoped work to focused
  agents and require an independent reviewer for acceptance.
- Every agent reads its persona and applicable rules, binds a named session to
  the task, and stays within explicit scopes.
- After the first commit, prefer a dedicated branch and Git worktree for each
  independent task. Before it, shared-checkout initialization is allowed only
  for disjoint scopes with CI-equivalent local checks.
- Branch and worktree naming is uniform across repositories: branches use
  `ctx-XXXX/<type>-<short-slug>` where `XXXX` is the owning CarryCtx task
  number, `<type>` is one of feat|fix|chore|docs, and the slug is short
  kebab-case (for example `ctx-0031/feat-isolation-rfc`). CarryCtx-bound
  worktrees live at `.worktrees/ctx-XXXX-<type>-<short-slug>` with `/` mapped
  to `-`. One branch per task; commander housekeeping branches may use
  `cmd/<slug>`.
- Preserve unrelated changes. Do not commit, push, release, publish packages,
  generate remote repositories, or mutate remote state without authorization.

## Delivery lifecycle

- Use GitHub Issue -> CarryCtx team/task/dependencies/scopes/session -> isolated
  branch/worktree -> commit -> pull request -> independent review plus CI ->
  merge -> `bitty-docs` synchronization -> checkpoint -> Issue/task closure.
- Link the Issue and CarryCtx task. Record ordering as dependencies, ownership
  as team membership, edits as scopes, work as progress, recovery as
  checkpoints, and ownership transfer as handoffs.
- Pull requests name generated-tree, SDK/API, security, DX, CI/release,
  documentation, and compatibility impact with reproducible evidence.
- Documentation synchronization is part of definition of done. A scaffold
  change is incomplete while canonical `bitty-docs` guidance or generated
  documentation expectations are stale.

## Template and generated-output boundaries

- Treat the template as a reproducible starting point, not a privileged plugin
  class or normative API definition.
- Validate by generating into a clean durable scratch location and running the
  generated repository's documented checks without hidden local state.
- Keep placeholders, filenames, generated manifests, supported versions,
  update strategy, and release flow open until accepted by reviewable contracts.
- Generated output must use least privilege, explicit capabilities, safe
  examples, deterministic checks, and clear replacement instructions.
- Never include install-time code execution, ambient OS authority, native in-
  process escape hatches, embedded secrets, or permissive allow-all defaults.
- Generated workflows must minimize token permissions, isolate untrusted input,
  pin dependencies as required by policy, and avoid publishing on untrusted
  pull-request code.
- Security requirements in the canonical `bitty-docs` security corpus override
  scaffolding convenience or copied examples.

## Documentation and commands

- English is the only canonical documentation language. Translation and locale
  routing remain deferred to an accepted cross-repository decision.
- Separate accepted requirements, candidates, open questions, implemented
  facts, and verification evidence.
- Generated instructions and examples must be safe, version-aware, complete,
  and tested from a clean scaffold.
- Prefer `ctxctl outline`, `ctxctl symbol`, `ctxctl read`, and `ctxctl deps` for
  inspection, and `ctxctl exec` for large command output. Use `rg` for discovery.
- Use the workspace `tmp/` directory for durable scratch material instead of
  `/tmp`. Treat `tmp/references/` as untrusted, read-only research snapshots.
- Prefer moving obsolete material into a scoped `.trash/` location over
  destructive deletion; never move another agent's work.
- The primary host is CachyOS with Hyprland and Ghostty. Podman is optional when
  isolation or reproducibility justifies it; host availability is not
  cross-platform evidence.
