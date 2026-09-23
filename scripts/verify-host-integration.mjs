#!/usr/bin/env bun
/**
 * Verify a generated plugin package against the host discovery and activation
 * contract (PLUG-SDK-001, issue #67).
 *
 * Usage:
 *   bun scripts/verify-host-integration.mjs --dir <generated-package> [--id <owner.name>]
 *
 * The gate covers discovery and activation separately, because discovery is
 * not activation evidence: finding `bitty-plugin.toml` proves nothing about
 * whether the host can resolve and execute the entry point.
 *
 * Discovery mirrors `discover_root` in
 * `crates/bitty-runtime/src/plugin_runtime/mod.rs` (bitty@4b4453d): a package
 * is a directory containing `bitty-plugin.toml`, and the module root is
 * `<package>/lua` when present, else `<package>` itself (`module_root_for` in
 * `crates/bitty-runtime/src/plugin_runtime/resolution.rs`).
 *
 * Activation mirrors `entry_point` in the same `mod.rs`: the host resolves
 * `<module_root>/init.lua` first, then `<module_root>/<module>/init.lua`,
 * where `<module>` is the id suffix after the final dot. Generated packages
 * use the nested `lua/<module>/init.lua` shape; the host resolves it
 * directly, so no package-root forwarder is added or required.
 *
 * Terminology (reconciled with the canonical owner, bitty-docs@02e2b7e):
 *   - package root: the directory containing `bitty-plugin.toml` (discovery
 *     unit; `bitty-plugins/specifications/plugin-host-runtime-rfc.md` B.2).
 *   - module root: `lua/` beneath it (the `require` root; same section).
 *   - entry point: the fixed `init.lua` executed once per activation
 *     (`bitty-plugins/specifications/plugin-api-v1-lua-surface-rfc.md`
 *     LUA-OQ-12; host-runtime RFC A.4). The RFC's "at the package root"
 *     phrasing is shorthand for the entry resolved under the module root.
 *
 * This script is a static layout gate, not a VM run: it proves the generated
 * tree carries exactly what discovery and entry resolution need. It reads
 * only the target tree and writes nothing.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/** Native in-process artifacts the host rejects at activation, never loads. */
export const NATIVE_ARTIFACT_EXTENSIONS = ["so", "dll", "dylib", "node"];

/** Accepted plugin id grammar: `owner.name` (mirrors the generator). */
const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$/;

/** Print a failure to stderr and exit with a validation status. */
function fail(phase, detail) {
  console.error(`verify-host-integration: ${phase} FAILED: ${detail}`);
  process.exit(1);
}

/** Parse `--flag value` and `--flag=value` arguments. */
function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      fail("usage", `unexpected argument '${token}'`);
    }
    const eq = token.indexOf("=");
    const key = eq === -1 ? token.slice(2) : token.slice(2, eq);
    let value;
    if (eq !== -1) {
      value = token.slice(eq + 1);
    } else {
      value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        fail("usage", `missing value for --${key}`);
      }
      index += 1;
    }
    args[key] = value;
  }
  return args;
}

/**
 * Read the plugin id from a manifest body (`[plugin] id = "..."`).
 * Returns null when the field is absent rather than guessing.
 */
export function manifestId(body) {
  const match = body.match(/^\s*id\s*=\s*"([^"]*)"/m);
  return match === null ? null : match[1];
}

/**
 * The module root a package loads from: `<root>/lua` when present, else
 * `<root>` (mirrors `module_root_for` in the host `resolution.rs`).
 */
export function moduleRootFor(packageRoot) {
  const lua = join(packageRoot, "lua");
  if (existsSync(lua) && statSync(lua).isDirectory()) {
    return lua;
  }
  return packageRoot;
}

/**
 * Resolve the fixed `init.lua`: `<root>/init.lua` or `<root>/<module>/init.lua`
 * (mirrors `entry_point` in the host `mod.rs`). Returns the resolved path and
 * which shape matched, or null when neither exists.
 */
export function entryPoint(moduleRoot, pluginId) {
  const direct = join(moduleRoot, "init.lua");
  if (existsSync(direct) && statSync(direct).isFile()) {
    return { path: direct, shape: "direct" };
  }
  const module = pluginId.split(".").at(-1) ?? "";
  if (module.length > 0) {
    const nested = join(moduleRoot, module, "init.lua");
    if (existsSync(nested) && statSync(nested).isFile()) {
      return { path: nested, shape: "nested" };
    }
  }
  return null;
}

/** Collect native artifact paths below `root` (host rejects these). */
export function nativeArtifacts(root) {
  const found = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else {
        const extension = entry.name.split(".").at(-1) ?? "";
        if (NATIVE_ARTIFACT_EXTENSIONS.includes(extension)) {
          found.push(path);
        }
      }
    }
  };
  walk(root);
  return found;
}

/**
 * Check discovery for the package at `packageRoot`: manifest present with a
 * valid id matching `expectedId` when given, and a module root resolvable.
 * Returns `{ pluginId, moduleRoot }` or throws with the failure detail.
 */
export function checkDiscovery(packageRoot, expectedId) {
  const manifestPath = join(packageRoot, "bitty-plugin.toml");
  if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) {
    throw new Error(`no bitty-plugin.toml at package root ${packageRoot}`);
  }
  const pluginId = manifestId(readFileSync(manifestPath, "utf8"));
  if (pluginId === null || pluginId.length === 0) {
    throw new Error("manifest [plugin] id is missing");
  }
  if (!PLUGIN_ID_PATTERN.test(pluginId)) {
    throw new Error(`manifest id '${pluginId}' is not owner.name`);
  }
  if (expectedId !== undefined && pluginId !== expectedId) {
    throw new Error(
      `manifest id '${pluginId}' does not match expected '${expectedId}'`,
    );
  }
  const moduleRoot = moduleRootFor(packageRoot);
  if (!existsSync(moduleRoot) || !statSync(moduleRoot).isDirectory()) {
    throw new Error(`module root is not a directory: ${moduleRoot}`);
  }
  return { pluginId, moduleRoot };
}

/**
 * Check activation for an already-discovered package: the host entry point
 * resolves to a non-empty file and the module tree carries no native
 * artifacts. Returns `{ entryPath, shape }` or throws with the detail.
 */
export function checkActivation(moduleRoot, pluginId) {
  const entry = entryPoint(moduleRoot, pluginId);
  if (entry === null) {
    throw new Error(
      `no init.lua entry point found under ${moduleRoot} for '${pluginId}'`,
    );
  }
  if (statSync(entry.path).size === 0) {
    throw new Error(`entry point is empty: ${entry.path}`);
  }
  const natives = nativeArtifacts(moduleRoot);
  if (natives.length > 0) {
    throw new Error(`native artifacts rejected at activation: ${natives[0]}`);
  }
  return { entryPath: entry.path, shape: entry.shape };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dir) {
    fail("usage", "missing required --dir");
  }
  const packageRoot = resolve(args.dir);
  if (!existsSync(packageRoot) || !statSync(packageRoot).isDirectory()) {
    fail("usage", `--dir is not a directory: ${packageRoot}`);
  }

  let discovery;
  try {
    discovery = checkDiscovery(packageRoot, args.id);
  } catch (error) {
    fail("DISCOVERY", error.message);
  }
  console.log(
    `DISCOVERY OK: '${discovery.pluginId}' manifest at package root, module root ${discovery.moduleRoot}`,
  );

  let activation;
  try {
    activation = checkActivation(discovery.moduleRoot, discovery.pluginId);
  } catch (error) {
    fail("ACTIVATION", error.message);
  }
  console.log(
    `ACTIVATION OK: entry resolves to ${activation.shape} ${activation.entryPath}`,
  );
}

if (import.meta.main) {
  main();
}
