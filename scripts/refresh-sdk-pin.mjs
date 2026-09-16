#!/usr/bin/env bun
/**
 * Regenerate `template/bun.lock` for the pinned `bitty-plugin-lint`
 * (bitty-plugin-sdk) commit.
 *
 * `template/package.json` and `template/bun.lock` carry the
 * `@@PLUGIN_SDK_REF@@` placeholder so the template tree never embeds a concrete
 * commit; the generator substitutes `PLUGIN_SDK_REF` at generation time. Bun
 * cannot resolve a placeholder, so this script swaps the concrete
 * `PLUGIN_SDK_REF` in, runs `bun install` to resolve the git dependency (full
 * and short SHA, cache key, integrity hash), swaps the placeholder back, and
 * then verifies the lockfile's resolved SDK tuple matches the pin. Run it after
 * every `PLUGIN_SDK_REF` bump; `bun test` fails on the same drift.
 *
 * Usage:
 *   bun scripts/refresh-sdk-pin.mjs   # or: just refresh-sdk-pin
 *
 * Network: required (resolves the pinned commit from GitHub). Every other gate
 * stays offline.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PLUGIN_SDK_REF } from "./generate-plugin.mjs";

export const PLACEHOLDER = "@@PLUGIN_SDK_REF@@";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(SCRIPT_DIR, "..", "template");
const PACKAGE_JSON = join(TEMPLATE_DIR, "package.json");
const BUN_LOCK = join(TEMPLATE_DIR, "bun.lock");
const NODE_MODULES = join(TEMPLATE_DIR, "node_modules");

/** Replace the placeholder with the concrete pin in `text`. */
export function applyPin(text, sha = PLUGIN_SDK_REF) {
  return text.split(PLACEHOLDER).join(sha);
}

/** Replace the concrete pin with the placeholder in `text`. */
export function restorePlaceholder(text, sha = PLUGIN_SDK_REF) {
  return text.split(sha).join(PLACEHOLDER);
}

/**
 * True when a lockfile's resolved SDK tuple matches `sha`: the resolved spec
 * carries the full pin's short SHA and the extracted package directory carries
 * the matching cache-key suffix. This is the invariant that `bun test` guards;
 * it fails when the constant is bumped without regenerating the lockfile.
 */
export function lockfileTupleMatches(lockfile, sha = PLUGIN_SDK_REF) {
  const short = sha.slice(0, 7);
  return (
    lockfile.includes(
      `bitty-plugin-sdk@github:bitty-terminal/bitty-plugin-sdk#${short}`,
    ) && lockfile.includes(`bitty-terminal-bitty-plugin-sdk-${short}`)
  );
}

function fail(message) {
  console.error(`refresh-sdk-pin: ${message}`);
  process.exit(1);
}

/** Read a file as UTF-8. */
function read(file) {
  return readFileSync(file, "utf8");
}

function main() {
  for (const file of [PACKAGE_JSON, BUN_LOCK]) {
    if (!existsSync(file)) {
      fail(`missing ${file}`);
    }
  }
  if (!read(PACKAGE_JSON).includes(PLACEHOLDER)) {
    fail(`template/package.json does not carry the ${PLACEHOLDER} placeholder`);
  }

  writeFileSync(PACKAGE_JSON, applyPin(read(PACKAGE_JSON)));
  writeFileSync(BUN_LOCK, applyPin(read(BUN_LOCK)));

  let status = 0;
  try {
    const result = spawnSync("bun", ["install"], {
      cwd: TEMPLATE_DIR,
      stdio: "inherit",
    });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`bun install exited ${result.status}`);
    }
  } catch (error) {
    status = 1;
    console.error(
      `refresh-sdk-pin: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    writeFileSync(PACKAGE_JSON, restorePlaceholder(read(PACKAGE_JSON)));
    writeFileSync(BUN_LOCK, restorePlaceholder(read(BUN_LOCK)));
    if (existsSync(NODE_MODULES)) {
      rmSync(NODE_MODULES, { recursive: true, force: true });
    }
  }

  if (status !== 0) {
    fail("bun install failed; template files were restored, re-run when fixed");
  }
  const lockfile = read(BUN_LOCK);
  if (!lockfileTupleMatches(lockfile)) {
    fail(
      "template/bun.lock resolved SDK tuple does not match PLUGIN_SDK_REF " +
        `${PLUGIN_SDK_REF.slice(0, 7)}; inspect the lockfile and re-run`,
    );
  }
  if (!read(PACKAGE_JSON).includes(PLACEHOLDER)) {
    fail(`template/package.json lost the ${PLACEHOLDER} placeholder`);
  }
  console.log(
    `refresh-sdk-pin: template/bun.lock resolves ${PLUGIN_SDK_REF.slice(0, 7)}; placeholder restored`,
  );
}

if (import.meta.main) {
  main();
}
