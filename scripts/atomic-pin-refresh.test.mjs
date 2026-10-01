#!/usr/bin/env bun
/**
 * Failure injection tests for the SDK pin check (CTX-0042, reworked for the
 * Lua-only scaffold in CTX-0047).
 *
 * `scripts/refresh-sdk-pin.mjs` only reads tracked template files and works in
 * a task-owned temporary directory. These tests validate:
 *   - tracked files stay byte-identical on success and on every failure;
 *   - temporary directories are removed on success and on failure;
 *   - a retry succeeds after the failure condition is fixed;
 *   - the placeholder is never replaced in tracked files.
 *
 * Success cases resolve the pinned SDK through `bunx` (network on the first
 * run, cache afterwards), as the previous lockfile refresh did.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { PLUGIN_SDK_REF } from "./generate-plugin.mjs";
import { PLACEHOLDER } from "./refresh-sdk-pin.mjs";

const SCRIPT_DIR = new URL(".", import.meta.url).pathname;
const REPO_ROOT = join(SCRIPT_DIR, "..");
const TEMPLATE_DIR = join(REPO_ROOT, "template");
const REFRESH_SCRIPT = join(SCRIPT_DIR, "refresh-sdk-pin.mjs");
const INVALID_REF = "0000000000000000000000000000000000000000";
const NETWORK_TIMEOUT_MS = 120_000;

/** Compute SHA256 hash of file content. */
function hashFile(path) {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(readFileSync(path));
  return hasher.digest("hex");
}

/** Run refresh-sdk-pin with `args` and an isolated GEN_TMPDIR. */
function refresh(args, genTmpDir) {
  return spawnSync("bun", [REFRESH_SCRIPT, ...args], {
    stdio: "pipe",
    env: { ...process.env, GEN_TMPDIR: genTmpDir },
  });
}

/** Number of entries in the task-owned temp base below `genTmpDir`. */
function tempCount(genTmpDir) {
  const base = join(genTmpDir, "bitty-plugin-sdk-refresh");
  return existsSync(base) ? readdirSync(base).length : 0;
}

describe("atomic pin check", () => {
  let testDir;
  let testTemplate;
  let genTmpDir;
  let originalJustfileHash;
  let originalManifestHash;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "pin-refresh-test-"));
    testTemplate = join(testDir, "template");
    genTmpDir = join(testDir, "gen-tmp");
    mkdirSync(genTmpDir);
    cpSync(TEMPLATE_DIR, testTemplate, { recursive: true });
    originalJustfileHash = hashFile(join(testTemplate, "justfile"));
    originalManifestHash = hashFile(join(testTemplate, "bitty-plugin.toml"));
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  /** Assert tracked template files are byte-identical to the originals. */
  function expectUnchanged() {
    expect(hashFile(join(testTemplate, "justfile"))).toBe(originalJustfileHash);
    expect(hashFile(join(testTemplate, "bitty-plugin.toml"))).toBe(
      originalManifestHash,
    );
    const justfile = readFileSync(join(testTemplate, "justfile"), "utf8");
    expect(justfile).toContain(PLACEHOLDER);
    expect(justfile).not.toContain(PLUGIN_SDK_REF);
    expect(justfile).not.toContain(INVALID_REF);
  }

  test(
    "tracked files unchanged and temp removed when the ref cannot resolve",
    () => {
      const result = refresh(
        ["--ref", INVALID_REF, "--template", testTemplate],
        genTmpDir,
      );
      expect(result.status).not.toBe(0);
      expectUnchanged();
      expect(tempCount(genTmpDir)).toBe(0);
    },
    NETWORK_TIMEOUT_MS,
  );

  test("rejects a non-SHA ref before any temp work", () => {
    const result = refresh(
      ["--ref", "main", "--template", testTemplate],
      genTmpDir,
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr.toString()).toContain("40-character commit SHA");
    expectUnchanged();
    expect(tempCount(genTmpDir)).toBe(0);
  });

  test("tracked files unchanged when the justfile lost the placeholder", () => {
    const justfilePath = join(testTemplate, "justfile");
    const corrupted = readFileSync(justfilePath, "utf8").replace(
      PLACEHOLDER,
      PLUGIN_SDK_REF,
    );
    writeFileSync(justfilePath, corrupted);
    const corruptedHash = hashFile(justfilePath);

    const result = refresh(["--template", testTemplate], genTmpDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr.toString()).toContain("does not declare");
    expect(hashFile(justfilePath)).toBe(corruptedHash);
    expect(tempCount(genTmpDir)).toBe(0);
  });

  test("fails closed when the template manifest is missing", () => {
    rmSync(join(testTemplate, "bitty-plugin.toml"));
    const result = refresh(["--template", testTemplate], genTmpDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr.toString()).toContain("missing");
    expect(tempCount(genTmpDir)).toBe(0);
  });

  test(
    "success leaves tracked files unchanged and removes temp",
    () => {
      const result = refresh(["--template", testTemplate], genTmpDir);
      expect(result.status).toBe(0);
      expect(result.stdout.toString()).toContain(
        `SDK ${PLUGIN_SDK_REF.slice(0, 7)} resolves`,
      );
      expectUnchanged();
      expect(tempCount(genTmpDir)).toBe(0);
      expect(existsSync(join(testTemplate, "node_modules"))).toBe(false);
    },
    NETWORK_TIMEOUT_MS,
  );

  test(
    "retry succeeds after fixing the failure",
    () => {
      const failResult = refresh(
        ["--ref", INVALID_REF, "--template", testTemplate],
        genTmpDir,
      );
      expect(failResult.status).not.toBe(0);
      expectUnchanged();

      const successResult = refresh(["--template", testTemplate], genTmpDir);
      expect(successResult.status).toBe(0);
      expectUnchanged();
      expect(tempCount(genTmpDir)).toBe(0);
    },
    NETWORK_TIMEOUT_MS,
  );
});
