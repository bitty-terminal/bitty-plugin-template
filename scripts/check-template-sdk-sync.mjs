#!/usr/bin/env bun
/**
 * Template/SDK drift check for the frozen generation pipeline (CTX-0036).
 *
 * The template derives from accepted host and SDK contracts and must never
 * invent capabilities. This script is the executable half of that rule for
 * the R-SDK-2 lint path: generated repositories validate their manifest with
 * the authoritative `bitty-plugin-lint` from a pinned SDK commit, so this
 * check fails closed (exit 1) whenever the template scaffold drifts from the
 * frozen pipeline it claims to track:
 *
 *   - the `PLUGIN_SDK_REF` pin in `scripts/generate-plugin.mjs`,
 *   - the resolved `template/bun.lock` tuple for that pin,
 *   - the pending-host flags in the scaffold (`keymaps`/`tasks`/`services`
 *     WIRED, `env` DEFERRED with typed `E_NOT_IMPLEMENTED`,
 *     `process.spawn` v1-OUT, from bitty #1303 as re-wired by bitty #1391),
 *   - the least-privilege defaults (no install-time execution, no ambient
 *     authority, no allow-all capabilities, read-only CI).
 *
 * Pins below mirror the frozen SDK pipeline (bitty-plugin-sdk #109,
 * `HOST_PARITY_SOURCE` in its `src/host-surface.ts`); bump them only in the
 * same change that regenerates the scaffold, then re-run
 * `just clean-generation`. Every gate stays offline: a missing or unreadable
 * file is a problem, never a skip.
 *
 * Usage:
 *   bun scripts/check-template-sdk-sync.mjs   # or: just template-sdk-sync
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PLUGIN_SDK_REF } from "./generate-plugin.mjs";
import { lockfileTupleMatches } from "./refresh-sdk-pin.mjs";

/** Frozen SDK pipeline commit (bitty-plugin-sdk #109, re-wired by #118). */
export const FROZEN_SDK_REF = "5a64d3c1b922fbf6fd067f3d567a7ab159db4a4b";

/** Host revision the frozen parity verdicts are pinned against. */
export const HOST_PARITY_SOURCE = {
  repository: "bitty",
  commit: "b8673937b6825ae4e7f1c35f4adc152ffd171f87",
  pr: 1391,
};

/** Namespaces the frozen host has not wired yet (fail closed). */
export const DEFERRED_NAMESPACES = ["env"];

/** Accepted v1 functions that stay present but fail closed on the host. */
export const DEFERRED_FUNCTIONS = ["env.get", "env.has"];

/** Namespaces the frozen host wires as bridge captures (usable examples). */
export const WIRED_NAMESPACES = ["keymaps", "services", "tasks"];

/** Entry point excluded from v1 (no spelling in the scaffold). */
export const V1_OUT_EXCLUSION = "process.spawn";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = join(SCRIPT_DIR, "..");

const INIT_LUA = join("template", "lua", "@@PLUGIN_MODULE@@", "init.lua");
const MANIFEST = join("template", "bitty-plugin.toml");
const TEMPLATE_README = join("template", "README.md");
const TEMPLATE_PACKAGE = join("template", "package.json");
const TEMPLATE_LOCKFILE = join("template", "bun.lock");
const TEMPLATE_JUSTFILE = join("template", "justfile");
const TEMPLATE_CI = join("template", ".github", "workflows", "ci.yml");
const GENERATOR = join("scripts", "generate-plugin.mjs");

/** Entry points with no v1 spelling; live scaffold code must not use them. */
const FORBIDDEN_LIVE_APIS = [
  "bitty.fs",
  "bitty.process",
  "bitty.network",
  "bitty.clipboard",
  "bitty.ipc",
  "bitty.renderer",
  "bitty.protocol",
  "bitty.decorations",
  "bitty.annotations",
  "bitty.highlighting",
  'scope = "raw"',
  "scope='raw'",
];

/** True when a Lua line is a comment (stubs stay commented out). */
function isLuaComment(line) {
  return line.trimStart().startsWith("--");
}

/** Non-comment Lua lines; only live code can break host parity. */
function liveLuaLines(source) {
  return source.split("\n").filter((line) => !isLuaComment(line));
}

/** Require `marker` in `content`; record a problem when absent. */
function requireMarker(problems, file, content, marker) {
  if (!content.includes(marker)) {
    problems.push(`${file} misses marker '${marker}'`);
  }
}

/** Forbid `marker` in `content`; record a problem when present. */
function forbidMarker(problems, file, content, marker) {
  if (content.includes(marker)) {
    problems.push(`${file} must not contain '${marker}'`);
  }
}

/** Read `relative` below `root`; a missing file is a problem, never a skip. */
function readTreeFile(problems, root, relative) {
  const path = join(root, relative);
  if (!existsSync(path)) {
    problems.push(`missing ${relative}`);
    return undefined;
  }
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    problems.push(
      `cannot read ${relative}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

/**
 * Check the template tree below `root` against the frozen pipeline pins.
 * Returns the problem list (empty when the tree agrees).
 */
export function checkTree(root) {
  const problems = [];

  if (!/^[0-9a-f]{40}$/.test(PLUGIN_SDK_REF)) {
    problems.push("PLUGIN_SDK_REF is not a full 40-character commit SHA");
  }
  if (PLUGIN_SDK_REF !== FROZEN_SDK_REF) {
    problems.push(
      `PLUGIN_SDK_REF ${PLUGIN_SDK_REF} drifts from the frozen pipeline ${FROZEN_SDK_REF}`,
    );
  }

  const generator = readTreeFile(problems, root, GENERATOR);
  if (generator !== undefined) {
    requireMarker(
      problems,
      GENERATOR,
      generator,
      "bitty-plugin-sdk/src/manifest.ts",
    );
    requireMarker(problems, GENERATOR, generator, "SEMVER_2");
  }

  const lockfile = readTreeFile(problems, root, TEMPLATE_LOCKFILE);
  if (lockfile !== undefined) {
    requireMarker(
      problems,
      TEMPLATE_LOCKFILE,
      lockfile,
      "bitty-plugin-sdk#@@PLUGIN_SDK_REF@@",
    );
    if (!lockfileTupleMatches(lockfile, FROZEN_SDK_REF)) {
      problems.push(
        `${TEMPLATE_LOCKFILE} resolved SDK tuple does not match the frozen ${FROZEN_SDK_REF.slice(0, 7)}; run just refresh-sdk-pin`,
      );
    }
  }

  const packageJson = readTreeFile(problems, root, TEMPLATE_PACKAGE);
  if (packageJson !== undefined) {
    requireMarker(
      problems,
      TEMPLATE_PACKAGE,
      packageJson,
      "github:bitty-terminal/bitty-plugin-sdk#@@PLUGIN_SDK_REF@@",
    );
    forbidMarker(problems, TEMPLATE_PACKAGE, packageJson, "postinstall");
    forbidMarker(problems, TEMPLATE_PACKAGE, packageJson, "preinstall");
  }

  const initLua = readTreeFile(problems, root, INIT_LUA);
  if (initLua !== undefined) {
    requireMarker(problems, INIT_LUA, initLua, "bitty #1303");
    requireMarker(problems, INIT_LUA, initLua, "bitty-plugin-sdk #109");
    requireMarker(problems, INIT_LUA, initLua, "E_NOT_IMPLEMENTED");
    requireMarker(problems, INIT_LUA, initLua, "DEFERRED");
    requireMarker(problems, INIT_LUA, initLua, "WIRED");
    requireMarker(problems, INIT_LUA, initLua, "v1-OUT");
    requireMarker(problems, INIT_LUA, initLua, "bitty.d.lua");
    for (const fn of DEFERRED_FUNCTIONS) {
      requireMarker(problems, INIT_LUA, initLua, fn);
    }
    for (const namespace of WIRED_NAMESPACES) {
      requireMarker(problems, INIT_LUA, initLua, namespace);
    }
    requireMarker(problems, INIT_LUA, initLua, V1_OUT_EXCLUSION);
    const live = liveLuaLines(initLua).join("\n");
    for (const namespace of DEFERRED_NAMESPACES) {
      if (live.includes(`bitty.${namespace}`)) {
        problems.push(
          `${INIT_LUA} calls DEFERRED bitty.${namespace} in live code; keep deferred stubs commented out`,
        );
      }
    }
    for (const api of FORBIDDEN_LIVE_APIS) {
      if (live.includes(api)) {
        problems.push(`${INIT_LUA} uses v1-excluded '${api}' in live code`);
      }
    }
  }

  const manifest = readTreeFile(problems, root, MANIFEST);
  if (manifest !== undefined) {
    requireMarker(problems, MANIFEST, manifest, "#109");
    requireMarker(problems, MANIFEST, manifest, "#1303");
    requireMarker(problems, MANIFEST, manifest, "E_NOT_IMPLEMENTED");
    requireMarker(problems, MANIFEST, manifest, "platform.notify");
    forbidMarker(problems, MANIFEST, manifest, '"*"');
    forbidMarker(problems, MANIFEST, manifest, "allow_all");
    forbidMarker(problems, MANIFEST, manifest, "allowAll");
    forbidMarker(problems, MANIFEST, manifest, "[scripts]");
    forbidMarker(problems, MANIFEST, manifest, "postinstall");
  }

  const readme = readTreeFile(problems, root, TEMPLATE_README);
  if (readme !== undefined) {
    requireMarker(problems, TEMPLATE_README, readme, "#109");
    requireMarker(problems, TEMPLATE_README, readme, "#1303");
    requireMarker(problems, TEMPLATE_README, readme, "E_NOT_IMPLEMENTED");
    requireMarker(problems, TEMPLATE_README, readme, "v1-OUT");
    requireMarker(problems, TEMPLATE_README, readme, "bitty.d.lua");
    requireMarker(problems, TEMPLATE_README, readme, "WIRED");
    requireMarker(problems, TEMPLATE_README, readme, "DEFERRED");
  }

  const ci = readTreeFile(problems, root, TEMPLATE_CI);
  if (ci !== undefined) {
    requireMarker(problems, TEMPLATE_CI, ci, "contents: read");
    forbidMarker(problems, TEMPLATE_CI, ci, "pull_request_target");
    forbidMarker(problems, TEMPLATE_CI, ci, "contents: write");
    forbidMarker(problems, TEMPLATE_CI, ci, "publish");
    for (const line of ci.split("\n")) {
      const trimmed = line.trimStart();
      if (!trimmed.startsWith("uses:")) {
        continue;
      }
      if (!/@[0-9a-f]{40}\b/.test(trimmed)) {
        problems.push(`${TEMPLATE_CI} action is not SHA-pinned: '${trimmed}'`);
      }
    }
  }

  const justfile = readTreeFile(problems, root, TEMPLATE_JUSTFILE);
  if (justfile !== undefined) {
    requireMarker(problems, TEMPLATE_JUSTFILE, justfile, "bitty-plugin-lint");
    requireMarker(problems, TEMPLATE_JUSTFILE, justfile, "frozen-lockfile");
    requireMarker(problems, TEMPLATE_JUSTFILE, justfile, "lua-control");
  }

  return problems;
}

function main() {
  const problems = checkTree(DEFAULT_REPO_ROOT);
  if (problems.length > 0) {
    console.error(
      `error: template/SDK sync has ${problems.length} problem(s):`,
    );
    for (const problem of problems) {
      console.error(`  - ${problem}`);
    }
    process.exit(1);
  }
  console.log(
    `template agrees with SDK ${FROZEN_SDK_REF.slice(0, 7)} ` +
      `(${HOST_PARITY_SOURCE.repository}#${HOST_PARITY_SOURCE.pr}, ` +
      `${DEFERRED_FUNCTIONS.length} deferred stubs, ` +
      `${WIRED_NAMESPACES.length} wired namespaces)`,
  );
}

if (import.meta.main) {
  main();
}
