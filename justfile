# Quality gates for bitty-plugin-template.
# Tool version pins live here (one place) and mirror package.json devDependencies;
# keep both identical when bumping. All tool invocations go through bun/bunx.

markdownlint_pin := "0.23.2"
prettier_pin := "3.9.6"
commitlint_pin := "21.2.2"
lefthook_pin := "2.1.14"

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

# Run the generator's unit tests with the Bun test runner.
test:
    bun test

# Fail when the template scaffold drifts from the frozen SDK generation
# pipeline (CTX-0036, R-SDK-2 drift rule): the SDK pin and its `sdk_ref`
# placeholder in template/justfile, the Lua-only generated tree (CTX-0047),
# the pending-host flags (WIRED keymaps/tasks, DEFERRED services/env,
# spawn v1-OUT), and the least-privilege defaults. Offline; part of
# `just check`.
template-sdk-sync:
    bun scripts/check-template-sdk-sync.mjs

# Aggregate gate run locally and in CI.
check: lint fmt-check test template-sdk-sync

# Re-vendor the SDK host contract snapshot from the pinned SDK commit
# (Issue #100). Regenerates scripts/vendor/host-contract.json and its recorded
# SHA-256 digest in one atomic step, so contract validation stays
# deterministic and offline. Run after every PLUGIN_SDK_REF bump. Requires the
# pinned SDK checkout: set SDK_HOST_SURFACE to its src/host-surface.ts or
# BITTY_WORKSPACE to the workspace root.
vendor-sdk-contract:
    bun scripts/vendor-sdk-contract.mjs

# Prove the pinned bitty-plugin-lint commit (PLUGIN_SDK_REF in
# scripts/generate-plugin.mjs, the single SDK pin source of truth) resolves
# and lints the template manifest. Generated plugins are Lua only and carry no
# lockfile (CTX-0047): the generator substitutes the pin into the generated
# justfile's `sdk_ref`, and `just manifest` there runs it through `bunx`. The
# script copies template/justfile and template/bitty-plugin.toml into a temp
# dir, applies the pin, and runs the copy's real `manifest` recipe; tracked
# files are never written. Run after every PLUGIN_SDK_REF bump. Network
# required on the first run per ref (bunx cache).
refresh-sdk-pin:
    bun scripts/refresh-sdk-pin.mjs

# End-to-end pin-bump check: run `refresh-sdk-pin` with a different SDK
# commit and prove it resolves and lints while template/justfile keeps its
# placeholder byte-for-byte. Network required; prints SKIP and exits 0 when
# the SDK remote is unreachable. Not part of `just check`.
verify-sdk-pin:
    bun scripts/verify-sdk-pin-refresh.mjs

# Verify a generated package against the host discovery and activation
# contract (PLUG-SDK-001, issue #67): discovery finds `bitty-plugin.toml` at
# the package root and resolves the `lua/` module root, activation resolves
# the fixed `init.lua` entry point. The two phases are checked separately
# because discovery is not activation evidence. The host resolves the nested
# `lua/<module>/init.lua` shape directly, so no package-root forwarder is
# needed. Expects the clean-generation example tree by default.
host-integration dir="tmp/clean-generation/hello-plugin" id="example.hello":
    bun scripts/verify-host-integration.mjs --dir {{dir}} --id {{id}}

# Generate a fresh example plugin into an ignored scratch dir and run the
# generated repository's own Lua-only gates (`just check`: SDK manifest lint
# through bunx, luac5.4 parse, fail-closed parser control) plus this
# repository's Markdown rules over the generated README (clean-generation
# evidence). Nothing is installed into the generated tree, matching the
# generated CI workflow. The `:` prefix marks the README as a literal path so
# markdownlint still checks it even though `tmp` is in the shared ignore list.
clean-generation:
    @rm -rf tmp/clean-generation
    @mkdir -p tmp/clean-generation
    bun scripts/generate-plugin.mjs --id example.hello --name "Hello Plugin" --description "Minimal runnable Bitty plugin example." --version 0.1.0 --dir tmp/clean-generation/hello-plugin
    cd tmp/clean-generation/hello-plugin && just check
    bunx --bun markdownlint-cli2@{{markdownlint_pin}} --no-globs ':tmp/clean-generation/hello-plugin/README.md'
    bun scripts/verify-host-integration.mjs --dir tmp/clean-generation/hello-plugin --id example.hello

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
