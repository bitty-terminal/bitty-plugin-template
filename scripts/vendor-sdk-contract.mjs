#!/usr/bin/env bun
/**
 * Re-vendor the SDK host contract snapshot (Issue #100).
 *
 * Regenerates `scripts/vendor/host-contract.json` from the pinned SDK
 * `host-surface` module and updates the recorded SHA-256 digest in
 * `scripts/read-sdk-contract.mjs`, so the artifact and its content address
 * move together. Run after bumping `PLUGIN_SDK_REF`.
 *
 * SDK source resolution (first hit wins):
 *   1. `SDK_HOST_SURFACE` — explicit path to `src/host-surface.ts`.
 *   2. `BITTY_WORKSPACE` + `bitty-plugins/sdk/bitty-plugin-sdk/src/host-surface.ts`.
 *
 * Network is never used; a missing SDK checkout is a hard failure.
 *
 * Usage:
 *   just vendor-sdk-contract
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PLUGIN_SDK_REF } from "./generate-plugin.mjs";
import {
  VENDORED_CONTRACT_REL,
  VENDORED_CONTRACT_SHA256,
} from "./read-sdk-contract.mjs";
import {
  DEFERRED_NAMESPACES,
  HOST_PARITY_SOURCE,
  WIRED_NAMESPACES,
} from "./check-template-sdk-sync.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

/** Path to the vendored exporter (regenerates the artifact JSON). */
const EXPORTER = join(SCRIPT_DIR, "vendor", "export-host-contract.ts");

/** Destination artifact path. */
const OUTPUT = join(SCRIPT_DIR, VENDORED_CONTRACT_REL);

/** Path to the resolver whose digest constant must be updated. */
const RESOLVER = join(SCRIPT_DIR, "read-sdk-contract.mjs");

/** Resolve the pinned SDK `host-surface.ts`, failing closed when absent. */
function resolveHostSurface() {
  if (process.env.SDK_HOST_SURFACE) {
    return process.env.SDK_HOST_SURFACE;
  }
  if (process.env.BITTY_WORKSPACE) {
    return join(
      process.env.BITTY_WORKSPACE,
      "bitty-plugins/sdk/bitty-plugin-sdk/src/host-surface.ts",
    );
  }
  return null;
}

/**
 * Check the exported artifact against the frozen pipeline constants.
 * Returns a problem list; empty means the artifact is the pinned surface.
 */
function verifyFrozenParity(artifact) {
  const problems = [];

  if (artifact.format !== "bitty-host-contract/v1") {
    problems.push(`unexpected format '${artifact.format}'`);
  }

  const namespaces = artifact.host_parity?.namespaces ?? [];
  const statusOf = (name) =>
    namespaces.find((entry) => entry.namespace === name)?.status;
  for (const namespace of WIRED_NAMESPACES) {
    if (statusOf(namespace) !== "wired") {
      problems.push(`${namespace} is '${statusOf(namespace)}', expected wired`);
    }
  }
  for (const namespace of DEFERRED_NAMESPACES) {
    if (statusOf(namespace) !== "deferred") {
      problems.push(
        `${namespace} is '${statusOf(namespace)}', expected deferred`,
      );
    }
  }

  const parity = artifact.host_parity ?? {};
  if (parity.repository !== HOST_PARITY_SOURCE.repository) {
    problems.push(
      `host repository '${parity.repository}' != '${HOST_PARITY_SOURCE.repository}'`,
    );
  }

  return problems;
}

function main() {
  if (!/^[0-9a-f]{40}$/.test(PLUGIN_SDK_REF)) {
    console.error(
      "error: PLUGIN_SDK_REF is not a full 40-character commit SHA",
    );
    return 1;
  }

  const hostSurface = resolveHostSurface();
  if (!hostSurface || !existsSync(hostSurface)) {
    console.error(
      "error: SDK host-surface module not found. Set SDK_HOST_SURFACE to " +
        "the pinned SDK src/host-surface.ts, or set BITTY_WORKSPACE.",
    );
    return 1;
  }

  const exportResult = Bun.spawnSync({
    cmd: [process.execPath, EXPORTER],
    env: {
      ...process.env,
      SDK_HOST_SURFACE: hostSurface,
      SDK_REVISION: PLUGIN_SDK_REF,
    },
    stdout: "pipe",
    stderr: "inherit",
  });
  if (exportResult.exitCode !== 0) {
    console.error("error: host contract export failed");
    return 1;
  }

  const json = exportResult.stdout.toString();
  if (json.trim().length === 0) {
    console.error("error: host contract export produced no output");
    return 1;
  }
  // Normalize to exactly one trailing newline for stable bytes.
  const artifact = `${json.trimEnd()}\n`;

  // Fail closed when the source checkout is not the frozen pipeline: a
  // wrong-ref SDK tree would silently vendor the wrong parity verdicts.
  let parsed;
  try {
    parsed = JSON.parse(artifact);
  } catch (error) {
    console.error(
      `error: exported artifact is not valid JSON: ${error.message}`,
    );
    return 1;
  }
  const parityProblems = verifyFrozenParity(parsed);
  if (parityProblems.length > 0) {
    console.error(
      "error: exported artifact does not match the frozen pipeline parity:",
    );
    for (const problem of parityProblems) {
      console.error(`  - ${problem}`);
    }
    console.error(
      "Use the SDK checkout at PLUGIN_SDK_REF (see scripts/generate-plugin.mjs).",
    );
    return 1;
  }
  writeFileSync(OUTPUT, artifact, "utf8");

  const digest = createHash("sha256").update(artifact).digest("hex");

  const resolver = readFileSync(RESOLVER, "utf8");
  const updated = resolver.replace(
    /export const VENDORED_CONTRACT_SHA256 =\s*\n?\s*"[0-9a-f]{64}";/,
    `export const VENDORED_CONTRACT_SHA256 =\n  "${digest}";`,
  );
  if (updated === resolver && digest !== VENDORED_CONTRACT_SHA256) {
    console.error(
      "error: could not update VENDORED_CONTRACT_SHA256 in read-sdk-contract.mjs",
    );
    return 1;
  }
  writeFileSync(RESOLVER, updated, "utf8");

  console.log(
    `vendored ${VENDORED_CONTRACT_REL} from SDK ${PLUGIN_SDK_REF.slice(0, 7)}`,
  );
  console.log(`digest ${digest}`);
  if (digest === VENDORED_CONTRACT_SHA256) {
    console.log("(artifact already current)");
  }
  return 0;
}

process.exit(main());
