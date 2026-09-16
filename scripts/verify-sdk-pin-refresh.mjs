#!/usr/bin/env bun
/**
 * End-to-end check that `refresh-sdk-pin` re-resolves a changed SDK pin.
 *
 * Copies `template/package.json` and `template/bun.lock` into a scratch
 * directory, runs the real `scripts/refresh-sdk-pin.mjs` against it with an
 * alternate SDK commit, and asserts the lockfile's resolved tuple moved to the
 * new short SHA (and away from the current pin) with the
 * `@@PLUGIN_SDK_REF@@` placeholder restored and `node_modules` removed. This
 * is the regression guard for PX-0103: a plain `bun install` would leave the
 * resolved tuple stale even though the requested spec changed.
 *
 * Network: required (resolves the alternate commit from GitHub). When the SDK
 * remote is unreachable the check prints `SKIP` and exits 0, so it is safe to
 * run in an offline checkout; run it explicitly (it is not part of
 * `just check`).
 *
 * Usage:
 *   bun scripts/verify-sdk-pin-refresh.mjs   # or: just verify-sdk-pin
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PLUGIN_SDK_REF } from "./generate-plugin.mjs";
import { PLACEHOLDER, lockfileTupleMatches } from "./refresh-sdk-pin.mjs";

/** Pushed ancestor of SDK `main`; used as the simulated "new" pin. */
const ALTERNATE_PLUGIN_SDK_REF = "77b2c57b0aa62c43e87af14b84ce8098f5e906db";
const SDK_REMOTE = "https://github.com/bitty-terminal/bitty-plugin-sdk";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REFRESH_SCRIPT = join(SCRIPT_DIR, "refresh-sdk-pin.mjs");
const TEMPLATE_DIR = join(SCRIPT_DIR, "..", "template");

/** True when the SDK git remote can be reached (git resolves HEAD). */
function sdkRemoteReachable() {
  const probe = spawnSync("git", ["ls-remote", SDK_REMOTE, "HEAD"], {
    stdio: "ignore",
  });
  return probe.status === 0;
}

/**
 * Run the check in `dir`; returns `{ status, message }` where status is one of
 * `ok`, `skip`, or `fail`.
 */
function check(dir) {
  cpSync(join(TEMPLATE_DIR, "package.json"), join(dir, "package.json"));
  cpSync(join(TEMPLATE_DIR, "bun.lock"), join(dir, "bun.lock"));

  const refresh = spawnSync(
    "bun",
    [REFRESH_SCRIPT, "--ref", ALTERNATE_PLUGIN_SDK_REF, "--template", dir],
    { stdio: "inherit" },
  );
  if (refresh.error || refresh.status !== 0) {
    const detail = refresh.error
      ? refresh.error.message
      : `refresh-sdk-pin exited ${refresh.status}`;
    if (!sdkRemoteReachable()) {
      return { status: "skip", message: `${detail}; SDK remote unreachable` };
    }
    return {
      status: "fail",
      message: `${detail} with the SDK remote reachable`,
    };
  }

  const lockfile = readFileSync(join(dir, "bun.lock"), "utf8");
  if (!lockfileTupleMatches(lockfile, ALTERNATE_PLUGIN_SDK_REF)) {
    return {
      status: "fail",
      message: `lockfile did not re-resolve to ${ALTERNATE_PLUGIN_SDK_REF.slice(0, 7)}`,
    };
  }
  if (lockfileTupleMatches(lockfile, PLUGIN_SDK_REF)) {
    return {
      status: "fail",
      message: `lockfile still matches the old pin ${PLUGIN_SDK_REF.slice(0, 7)}`,
    };
  }
  for (const file of ["package.json", "bun.lock"]) {
    if (!readFileSync(join(dir, file), "utf8").includes(PLACEHOLDER)) {
      return {
        status: "fail",
        message: `${file} did not restore the placeholder`,
      };
    }
  }
  if (existsSync(join(dir, "node_modules"))) {
    return {
      status: "fail",
      message: "node_modules was not removed from the scratch template",
    };
  }
  return {
    status: "ok",
    message: `re-resolved ${PLUGIN_SDK_REF.slice(0, 7)} -> ${ALTERNATE_PLUGIN_SDK_REF.slice(0, 7)}`,
  };
}

function main() {
  const dir = mkdtempSync(join(tmpdir(), "bitty-sdk-pin-"));
  let result;
  try {
    result = check(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  if (result.status === "ok") {
    console.log(`verify-sdk-pin-refresh: OK ${result.message}`);
    return;
  }
  if (result.status === "skip") {
    console.log(`verify-sdk-pin-refresh: SKIP ${result.message}`);
    return;
  }
  console.error(`verify-sdk-pin-refresh: FAIL ${result.message}`);
  process.exit(1);
}

if (import.meta.main) {
  main();
}
