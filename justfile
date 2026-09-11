# Quality gates for bitty-plugin-template.
# Tool version pins live here (one place) and mirror package.json devDependencies;
# keep both identical when bumping. All tool invocations go through bun/bunx.

markdownlint_pin := "0.23.2"
prettier_pin := "3.9.6"
commitlint_pin := "21.2.2"
lefthook_pin := "2.1.12"

# List available recipes.
default:
    @just --list

# Lint all Markdown sources with markdownlint-cli2 (.markdownlint-cli2.jsonc).
lint:
    bunx --bun markdownlint-cli2@{{markdownlint_pin}}

# Lint specific Markdown files (used by the pre-commit hook).
lint-files *files:
    bunx --bun markdownlint-cli2@{{markdownlint_pin}} {{files}}

# Format all files with Prettier.
fmt:
    bunx --bun prettier@{{prettier_pin}} --write . --ignore-unknown

# Format specific files with Prettier.
fmt-files *files:
    bunx --bun prettier@{{prettier_pin}} --write {{files}}

# Check formatting of all files with Prettier.
fmt-check:
    bunx --bun prettier@{{prettier_pin}} --check . --ignore-unknown

# Check formatting of specific files (used by the pre-commit hook).
fmt-check-files *files:
    bunx --bun prettier@{{prettier_pin}} --check {{files}}

# Validate a commit message file with commitlint (conventional commits).
commit-check message=".git/COMMIT_EDITMSG":
    bunx --bun commitlint@{{commitlint_pin}} --edit "{{message}}"

# Install Git hooks managed by lefthook (opt-in per contributor checkout).
hooks-install:
    bunx --bun lefthook@{{lefthook_pin}} install

# Remove lefthook-managed Git hooks.
hooks-uninstall:
    bunx --bun lefthook@{{lefthook_pin}} uninstall

# Aggregate gate run locally and in CI.
check: lint fmt-check

# Generate a fresh example plugin into an ignored scratch dir and run the
# generated repository's own gates (clean-generation evidence).
clean-generation:
    @rm -rf tmp/clean-generation
    @mkdir -p tmp/clean-generation
    bun scripts/generate-plugin.mjs --id example.hello --name "Hello Plugin" --description "Minimal runnable Bitty plugin example." --version 0.1.0 --dir tmp/clean-generation/hello-plugin
    cd tmp/clean-generation/hello-plugin && just check

# Publish a redacted CarryCtx snapshot inside this repo (commander merge
# closeout only; never a git hook). `carryctx export --publication` redacts the
# bundle, stamps manifest.redacted, and commits one snapshot to the fixed ref
# `refs/heads/carryctx-snapshots`; the target pushes that branch only when the
# local ref advanced (native carryctx commits one snapshot per export, so a
# re-run publishes again rather than no-opping). Canonical closeout runs from
# the primary checkout on branch main
# (`cd "$BITTY_WORKSPACE/bitty-plugins/bitty-plugin-template" && just
# workflow-publish`); a detached or feature worktree records that branch as the
# snapshot source. Dry run validates the export and writes neither the ref nor
# the remote.
workflow-publish *args:
    bash scripts/workflow-publish.sh {{args}}

workflow-publish-dry *args:
    bash scripts/workflow-publish.sh --dry-run {{args}}

# Restore the local CarryCtx DB from the in-repo snapshot branch
# `refs/heads/carryctx-snapshots` (fresh-clone recipe). Refuses to replace a
# non-empty local DB without --force, e.g. `just workflow-import --force`.
workflow-import *args:
    bash scripts/workflow-import.sh {{args}}

workflow-import-dry *args:
    bash scripts/workflow-import.sh --dry-run {{args}}
