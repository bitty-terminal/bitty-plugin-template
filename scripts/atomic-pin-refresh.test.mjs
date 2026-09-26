#!/usr/bin/env bun
/**
 * Failure injection tests for atomic SDK pin refresh (CTX-0042).
 *
 * Validates:
 *   - Tracked files remain unchanged on failure
 *   - Temp directories are cleaned up on success and failure
 *   - Retry succeeds after fixing the failure condition
 *   - Hash/content verification confirms no partial modifications
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

import { PLACEHOLDER, applyPin } from "./refresh-sdk-pin.mjs";

const SCRIPT_DIR = new URL(".", import.meta.url).pathname;
const REPO_ROOT = join(SCRIPT_DIR, "..");
const TEMPLATE_DIR = join(REPO_ROOT, "template");

/** Compute SHA256 hash of file content. */
function hashFile(path) {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(readFileSync(path));
  return hasher.digest("hex");
}

describe("atomic pin refresh", () => {
  let testDir;
  let testTemplate;
  let originalPackageJson;
  let originalBunLock;
  let originalPackageHash;
  let originalLockHash;

  beforeEach(() => {
    // Create isolated test template
    testDir = mkdtempSync(join(tmpdir(), "pin-refresh-test-"));
    testTemplate = join(testDir, "template");
    cpSync(TEMPLATE_DIR, testTemplate, { recursive: true });

    // Record original content and hashes
    originalPackageJson = readFileSync(
      join(testTemplate, "package.json"),
      "utf8",
    );
    originalBunLock = readFileSync(join(testTemplate, "bun.lock"), "utf8");
    originalPackageHash = hashFile(join(testTemplate, "package.json"));
    originalLockHash = hashFile(join(testTemplate, "bun.lock"));
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("tracked files unchanged on network failure", () => {
    // Simulate network failure by using invalid ref
    const invalidRef = "0000000000000000000000000000000000000000";
    const result = spawnSync(
      "bun",
      [
        join(SCRIPT_DIR, "refresh-sdk-pin.mjs"),
        "--ref",
        invalidRef,
        "--template",
        testTemplate,
      ],
      { stdio: "pipe" },
    );

    // Refresh should fail
    expect(result.status).not.toBe(0);

    // Tracked files must be unchanged (same hash)
    const packageHash = hashFile(join(testTemplate, "package.json"));
    const lockHash = hashFile(join(testTemplate, "bun.lock"));
    expect(packageHash).toBe(originalPackageHash);
    expect(lockHash).toBe(originalLockHash);

    // Placeholder must still be present
    const packageContent = readFileSync(
      join(testTemplate, "package.json"),
      "utf8",
    );
    expect(packageContent).toContain(PLACEHOLDER);
    expect(packageContent).not.toContain(invalidRef);
  });

  test("tracked files unchanged on validation failure", () => {
    // Remove placeholder from package.json to trigger validation failure
    const packagePath = join(testTemplate, "package.json");
    const packageWithoutPlaceholder = originalPackageJson.replace(
      PLACEHOLDER,
      "e1723b60cc94d3abc18821c9e6b14c6c88f33add",
    );
    writeFileSync(packagePath, packageWithoutPlaceholder);
    const corruptedHash = hashFile(packagePath);

    const result = spawnSync(
      "bun",
      [join(SCRIPT_DIR, "refresh-sdk-pin.mjs"), "--template", testTemplate],
      { stdio: "pipe" },
    );

    // Refresh should fail on validation (missing placeholder)
    expect(result.status).not.toBe(0);

    // File should remain unchanged (same hash as corrupted state)
    const packageHash = hashFile(packagePath);
    expect(packageHash).toBe(corruptedHash);

    // Corruption should remain (no placeholder)
    const packageContent = readFileSync(packagePath, "utf8");
    expect(packageContent).not.toContain(PLACEHOLDER);
  });

  test("temp directory cleaned up on success", () => {
    const tmpBase = join(tmpdir(), "bitty-plugin-sdk-refresh");
    const beforeCount = existsSync(tmpBase) ? readdirSync(tmpBase).length : 0;

    const result = spawnSync(
      "bun",
      [join(SCRIPT_DIR, "refresh-sdk-pin.mjs"), "--template", testTemplate],
      { stdio: "inherit", env: { ...process.env, GEN_TMPDIR: tmpdir() } },
    );

    // Refresh should succeed
    expect(result.status).toBe(0);

    // Temp directories should be cleaned (no increase)
    const afterCount = existsSync(tmpBase) ? readdirSync(tmpBase).length : 0;
    expect(afterCount).toBe(beforeCount);
  });

  test("temp directory cleaned up on failure", () => {
    const tmpBase = join(tmpdir(), "bitty-plugin-sdk-refresh");
    const beforeCount = existsSync(tmpBase) ? readdirSync(tmpBase).length : 0;

    const invalidRef = "0000000000000000000000000000000000000000";
    const result = spawnSync(
      "bun",
      [
        join(SCRIPT_DIR, "refresh-sdk-pin.mjs"),
        "--ref",
        invalidRef,
        "--template",
        testTemplate,
      ],
      { stdio: "pipe", env: { ...process.env, GEN_TMPDIR: tmpdir() } },
    );

    // Refresh should fail
    expect(result.status).not.toBe(0);

    // Temp directories should be cleaned (no increase)
    const afterCount = existsSync(tmpBase) ? readdirSync(tmpBase).length : 0;
    expect(afterCount).toBe(beforeCount);
  });

  test("retry succeeds after fixing failure", () => {
    const invalidRef = "0000000000000000000000000000000000000000";

    // First attempt with invalid ref should fail
    const failResult = spawnSync(
      "bun",
      [
        join(SCRIPT_DIR, "refresh-sdk-pin.mjs"),
        "--ref",
        invalidRef,
        "--template",
        testTemplate,
      ],
      { stdio: "pipe" },
    );
    expect(failResult.status).not.toBe(0);

    // Files should be unchanged
    const packageHash1 = hashFile(join(testTemplate, "package.json"));
    const lockHash1 = hashFile(join(testTemplate, "bun.lock"));
    expect(packageHash1).toBe(originalPackageHash);
    expect(lockHash1).toBe(originalLockHash);

    // Retry with valid ref should succeed
    const successResult = spawnSync(
      "bun",
      [join(SCRIPT_DIR, "refresh-sdk-pin.mjs"), "--template", testTemplate],
      { stdio: "inherit" },
    );
    expect(successResult.status).toBe(0);

    // Files should have placeholders restored (same hash as original since
    // we're using the same SDK ref and the lockfile was already resolved)
    const packageHash2 = hashFile(join(testTemplate, "package.json"));
    const lockHash2 = hashFile(join(testTemplate, "bun.lock"));

    // Both files should be unchanged (same SDK ref, already resolved)
    expect(packageHash2).toBe(originalPackageHash);
    expect(lockHash2).toBe(originalLockHash);

    // Placeholder must still be present
    const packageContent = readFileSync(
      join(testTemplate, "package.json"),
      "utf8",
    );
    const lockContent = readFileSync(join(testTemplate, "bun.lock"), "utf8");
    expect(packageContent).toContain(PLACEHOLDER);
    expect(lockContent).toContain(PLACEHOLDER);
  });

  test("no partial placeholder application on failure", () => {
    // Start with known state
    const packagePath = join(testTemplate, "package.json");
    const lockPath = join(testTemplate, "bun.lock");

    // Attempt refresh with invalid ref
    const invalidRef = "0000000000000000000000000000000000000000";
    const result = spawnSync(
      "bun",
      [
        join(SCRIPT_DIR, "refresh-sdk-pin.mjs"),
        "--ref",
        invalidRef,
        "--template",
        testTemplate,
      ],
      { stdio: "pipe" },
    );

    expect(result.status).not.toBe(0);

    // Neither file should have the invalid ref applied
    const packageContent = readFileSync(packagePath, "utf8");
    const lockContent = readFileSync(lockPath, "utf8");
    expect(packageContent).not.toContain(invalidRef);
    expect(lockContent).not.toContain(invalidRef);

    // Both should still have placeholder
    expect(packageContent).toContain(PLACEHOLDER);
    expect(lockContent).toContain(PLACEHOLDER);
  });

  test("node_modules cleaned up after successful refresh", () => {
    const result = spawnSync(
      "bun",
      [join(SCRIPT_DIR, "refresh-sdk-pin.mjs"), "--template", testTemplate],
      { stdio: "inherit" },
    );

    expect(result.status).toBe(0);

    // node_modules should not exist in template after refresh
    const nodeModules = join(testTemplate, "node_modules");
    expect(existsSync(nodeModules)).toBe(false);
  });
});
