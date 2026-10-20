#!/usr/bin/env bun
/**
 * Check generated-template README user documentation against the contract.
 *
 * `template/` carries placeholders, so it is not itself a valid plugin
 * package. This wrapper generates a real tree with the repository generator
 * (the same deterministic path `just clean-generation` uses), then runs
 * `bitty-plugin-docs-check` from the SDK commit pinned as `PLUGIN_SDK_REF` in
 * `scripts/generate-plugin.mjs` against that tree. The generated tree is
 * scratch only and is removed afterwards; no tracked file is written and no
 * dependency is installed into it. `bunx` reuses its package cache after the
 * first run per ref.
 *
 * Usage:
 *   bun scripts/check-template-docs.mjs   # or: just docs-check
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PLUGIN_SDK_REF } from "./generate-plugin.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");
const GENERATOR = join(SCRIPT_DIR, "generate-plugin.mjs");
const SDK_PACKAGE = `github:bitty-terminal/bitty-plugin-sdk#${PLUGIN_SDK_REF}`;

const scratch = mkdtempSync(join(tmpdir(), "bitty-template-docs-"));
const target = join(scratch, "hello-plugin");

function fail(message, status = 1) {
  console.error(`docs-check: ${message}`);
  rmSync(scratch, { recursive: true, force: true });
  process.exit(status);
}

const generated = spawnSync(
  "bun",
  [
    GENERATOR,
    "--id",
    "example.hello",
    "--name",
    "Hello Plugin",
    "--description",
    "Minimal runnable Bitty plugin example.",
    "--version",
    "0.1.0",
    "--dir",
    target,
  ],
  { cwd: REPO_ROOT, stdio: "inherit" },
);
if (generated.error) fail(generated.error.message);
if (generated.status !== 0) {
  fail(
    "generator failed; cannot check the generated README",
    generated.status ?? 1,
  );
}

const checked = spawnSync(
  "bunx",
  ["--bun", "--package", SDK_PACKAGE, "bitty-plugin-docs-check", target],
  { cwd: REPO_ROOT, stdio: "inherit" },
);

rmSync(scratch, { recursive: true, force: true });

if (checked.error) fail(checked.error.message);
if (checked.status !== 0) {
  fail(
    "the generated README does not match the plugin README contract; " +
      "fix the six required H2 sections or the Configuration table",
    checked.status ?? 1,
  );
}
