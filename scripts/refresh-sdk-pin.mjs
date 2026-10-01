#!/usr/bin/env bun
/**
 * Resolve-and-lint check for the pinned `bitty-plugin-lint`
 * (bitty-plugin-sdk) commit (CTX-0017, reworked for Lua-only scaffolds in
 * CTX-0047).
 *
 * Generated plugins are Lua only: they carry no `package.json` or `bun.lock`.
 * The template `justfile` declares `sdk_ref := "@@PLUGIN_SDK_REF@@"` and its
 * `manifest` recipe runs `bunx --bun --package
 * github:bitty-terminal/bitty-plugin-sdk#{{ sdk_ref }} bitty-plugin-lint`.
 * The generator substitutes `PLUGIN_SDK_REF` (scripts/generate-plugin.mjs,
 * the single source of truth) for the placeholder, so there is no lockfile to
 * regenerate when the pin moves. This script proves the pin is usable:
 *
 *   1. copies `template/justfile` and `template/bitty-plugin.toml` into a
 *      task-owned temporary directory;
 *   2. substitutes the SDK ref and fixed sample identity tokens into the
 *      copies and checks the copied justfile now declares that ref;
 *   3. runs the copied justfile's real `manifest` recipe, which resolves the
 *      pinned SDK through `bunx` and lints the sample manifest;
 *   4. removes the temporary directory on success and on failure.
 *
 * Tracked files are only read, never written, so a failure cannot leave the
 * template partially modified.
 *
 * Usage:
 *   bun scripts/refresh-sdk-pin.mjs   # or: just refresh-sdk-pin
 *   bun scripts/refresh-sdk-pin.mjs [--ref <40-char-sha>] [--template <dir>]
 *
 * `--ref`/`--template` exist for the end-to-end check
 * (`scripts/verify-sdk-pin-refresh.mjs`) and the failure-injection tests; the
 * production path uses the `PLUGIN_SDK_REF` constant and the repository
 * `template/` directory.
 *
 * Network: required on the first run for a ref (fills the bunx cache). Every
 * `just check` gate stays offline.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PLUGIN_SDK_REF } from "./generate-plugin.mjs";

export const PLACEHOLDER = "@@PLUGIN_SDK_REF@@";

/** The template justfile line that carries the SDK pin placeholder. */
export const SDK_REF_DECLARATION = `sdk_ref := "${PLACEHOLDER}"`;

/** Sample identity substituted into the copied manifest for the lint run. */
const SAMPLE_TOKENS = {
  "@@PLUGIN_ID@@": "example.hello",
  "@@PLUGIN_NAME@@": "Hello Plugin",
  "@@PLUGIN_VERSION@@": "0.1.0",
  "@@PLUGIN_DESCRIPTION@@": "Minimal runnable Bitty plugin example.",
  "@@PLUGIN_MODULE@@": "hello",
};

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TEMPLATE_DIR = join(SCRIPT_DIR, "..", "template");

/** Replace the placeholder with the concrete pin in `text`. */
export function applyPin(text, sha = PLUGIN_SDK_REF) {
  return text.split(PLACEHOLDER).join(sha);
}

/** Replace the concrete pin with the placeholder in `text`. */
export function restorePlaceholder(text, sha = PLUGIN_SDK_REF) {
  return text.split(sha).join(PLACEHOLDER);
}

/** True when a justfile declares `sdk_ref` with exactly `value`. */
export function justfileDeclaresSdkRef(justfile, value = PLACEHOLDER) {
  return justfile.split("\n").some((line) => {
    const match = /^sdk_ref\s*:=\s*"([^"]*)"\s*$/.exec(line);
    return match !== null && match[1] === value;
  });
}

/** Parse `--ref <sha>` / `--template <dir>` flags. */
function parseArgs(argv) {
  const options = { ref: PLUGIN_SDK_REF, template: DEFAULT_TEMPLATE_DIR };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const eq = token.indexOf("=");
    const key = eq === -1 ? token : token.slice(0, eq);
    const value = eq === -1 ? argv[index + 1] : token.slice(eq + 1);
    if (value === undefined) {
      console.error(`refresh-sdk-pin: missing value for ${key}`);
      process.exit(2);
    }
    if (key === "--ref") {
      options.ref = value;
    } else if (key === "--template") {
      options.template = resolve(value);
    } else {
      console.error(`refresh-sdk-pin: unknown option '${token}'`);
      process.exit(2);
    }
    if (eq === -1) {
      index += 1;
    }
  }
  return options;
}

/** Read a file as UTF-8. */
function read(file) {
  return readFileSync(file, "utf8");
}

/**
 * Temporary directory base for the check. Derives from the GEN_TMPDIR
 * environment variable or the OS tmpdir, never hardcoded.
 */
function genTmpDir() {
  return process.env.GEN_TMPDIR || tmpdir();
}

/**
 * Run the check; returns an error message, or `undefined` on success. The
 * caller owns process exit so the temporary directory is always removed.
 */
function run({ ref, template }) {
  if (!SHA_PATTERN.test(ref)) {
    return `--ref must be a full 40-character commit SHA, got '${ref}'`;
  }
  const justfile = join(template, "justfile");
  const manifest = join(template, "bitty-plugin.toml");
  for (const file of [justfile, manifest]) {
    if (!existsSync(file)) {
      return `missing ${file}`;
    }
  }
  if (!justfileDeclaresSdkRef(read(justfile))) {
    return `${justfile} does not declare ${SDK_REF_DECLARATION}`;
  }

  const tmpBase = join(genTmpDir(), "bitty-plugin-sdk-refresh");
  mkdirSync(tmpBase, { recursive: true });
  const tempDir = mkdtempSync(join(tmpBase, "template-"));
  try {
    let pinnedJustfile = applyPin(read(justfile), ref);
    let sampleManifest = read(manifest);
    for (const [token, value] of Object.entries(SAMPLE_TOKENS)) {
      pinnedJustfile = pinnedJustfile.split(token).join(value);
      sampleManifest = sampleManifest.split(token).join(value);
    }
    if (!justfileDeclaresSdkRef(pinnedJustfile, ref)) {
      return `pinned justfile copy does not declare sdk_ref ${ref}`;
    }
    writeFileSync(join(tempDir, "justfile"), pinnedJustfile);
    writeFileSync(join(tempDir, "bitty-plugin.toml"), sampleManifest);

    const result = spawnSync(
      "just",
      ["--justfile", join(tempDir, "justfile"), "manifest"],
      { cwd: tempDir, stdio: "inherit" },
    );
    if (result.error) {
      return `cannot run just: ${result.error.message}`;
    }
    if (result.status !== 0) {
      return `just manifest exited ${result.status} for SDK ${ref.slice(0, 7)}`;
    }
    return undefined;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const problem = run(options);
  if (problem !== undefined) {
    console.error(`refresh-sdk-pin: ${problem}`);
    process.exit(1);
  }
  console.log(
    `refresh-sdk-pin: SDK ${options.ref.slice(0, 7)} resolves and lints the template manifest`,
  );
}

if (import.meta.main) {
  main();
}
