#!/usr/bin/env bun
/**
 * End-to-end check that a changed SDK pin flows through the Lua-only scaffold.
 *
 * Generated plugins carry no lockfile: the generated `justfile` declares
 * `sdk_ref` and `just manifest` resolves that commit through `bunx`. This
 * check runs the real `scripts/refresh-sdk-pin.mjs` with an alternate SDK
 * commit and asserts that:
 *
 *   - the alternate commit resolves and lints the template manifest;
 *   - the tracked `template/justfile` still declares the
 *     `@@PLUGIN_SDK_REF@@` placeholder and is byte-identical afterwards.
 *
 * It replaces the PX-0103 lockfile re-resolution guard: with no lockfile in
 * the generated tree there is no stale resolved tuple to detect, so what
 * remains is proving a bumped ref is actually fetchable and lint-clean.
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
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PLUGIN_SDK_REF } from "./generate-plugin.mjs";
import { justfileDeclaresSdkRef } from "./refresh-sdk-pin.mjs";

/** Pushed ancestor of SDK `main`; used as the simulated "new" pin. */
const ALTERNATE_PLUGIN_SDK_REF = "77b2c57b0aa62c43e87af14b84ce8098f5e906db";
const SDK_REMOTE = "https://github.com/bitty-terminal/bitty-plugin-sdk";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REFRESH_SCRIPT = join(SCRIPT_DIR, "refresh-sdk-pin.mjs");
const TEMPLATE_JUSTFILE = join(SCRIPT_DIR, "..", "template", "justfile");

/** True when the SDK git remote can be reached (git resolves HEAD). */
function sdkRemoteReachable() {
  const probe = spawnSync("git", ["ls-remote", SDK_REMOTE, "HEAD"], {
    stdio: "ignore",
  });
  return probe.status === 0;
}

/** Run the check; returns `{ status, message }` (`ok`, `skip`, or `fail`). */
function check() {
  if (ALTERNATE_PLUGIN_SDK_REF === PLUGIN_SDK_REF) {
    return {
      status: "fail",
      message: "alternate SDK ref equals the current pin; pick another commit",
    };
  }
  const before = readFileSync(TEMPLATE_JUSTFILE, "utf8");
  const refresh = spawnSync(
    "bun",
    [REFRESH_SCRIPT, "--ref", ALTERNATE_PLUGIN_SDK_REF],
    { stdio: "inherit" },
  );
  const after = readFileSync(TEMPLATE_JUSTFILE, "utf8");
  if (after !== before) {
    return { status: "fail", message: "template/justfile was modified" };
  }
  if (!justfileDeclaresSdkRef(after)) {
    return {
      status: "fail",
      message: "template/justfile lost the sdk_ref placeholder",
    };
  }
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
  return {
    status: "ok",
    message: `pin ${PLUGIN_SDK_REF.slice(0, 7)} -> ${ALTERNATE_PLUGIN_SDK_REF.slice(0, 7)} resolves and lints; template unchanged`,
  };
}

function main() {
  const result = check();
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
