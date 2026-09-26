#!/usr/bin/env bun
/**
 * Failure injection tests for atomic scaffold generation (CTX-0042).
 *
 * Validates:
 *   - Target directory not created on failure
 *   - Temp directories are cleaned up on success and failure
 *   - Retry succeeds after fixing the failure condition
 *   - No partial output left in target location
 *   - Unresolved placeholders are detected before publication
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT_DIR = new URL(".", import.meta.url).pathname;
const REPO_ROOT = join(SCRIPT_DIR, "..");
const TEMPLATE_DIR = join(REPO_ROOT, "template");

describe("atomic scaffold generation", () => {
  let testDir;
  let targetDir;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "scaffold-gen-test-"));
    targetDir = join(testDir, "generated-plugin");
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("target not created on invalid plugin ID", () => {
    // Use invalid ID to trigger failure
    const result = spawnSync(
      "bun",
      [
        join(SCRIPT_DIR, "generate-plugin.mjs"),
        "--id",
        "invalid-id-without-dot",
        "--name",
        "Test Plugin",
        "--dir",
        targetDir,
      ],
      { stdio: "pipe" },
    );

    expect(result.status).not.toBe(0);

    // Target should not exist
    expect(existsSync(targetDir)).toBe(false);
  });

  test("target not created on empty plugin name", () => {
    // Use empty name to trigger validation failure
    const result = spawnSync(
      "bun",
      [
        join(SCRIPT_DIR, "generate-plugin.mjs"),
        "--id",
        "test.plugin",
        "--name",
        "",
        "--dir",
        targetDir,
      ],
      { stdio: "pipe", env: { ...process.env, GEN_TMPDIR: tmpdir() } },
    );

    expect(result.status).not.toBe(0);

    // Target should not exist (failed before atomic publish)
    expect(existsSync(targetDir)).toBe(false);
  });

  test("temp directory cleaned up on success", () => {
    const tmpBase = join(tmpdir(), "bitty-plugin-gen");
    const beforeCount = existsSync(tmpBase) ? readdirSync(tmpBase).length : 0;

    const result = spawnSync(
      "bun",
      [
        join(SCRIPT_DIR, "generate-plugin.mjs"),
        "--id",
        "test.plugin",
        "--name",
        "Test Plugin",
        "--dir",
        targetDir,
      ],
      { stdio: "inherit", env: { ...process.env, GEN_TMPDIR: tmpdir() } },
    );

    expect(result.status).toBe(0);
    expect(existsSync(targetDir)).toBe(true);

    // Temp directories should be cleaned (no increase)
    const afterCount = existsSync(tmpBase) ? readdirSync(tmpBase).length : 0;
    expect(afterCount).toBe(beforeCount);
  });

  test("temp directory cleaned up on failure", () => {
    const tmpBase = join(tmpdir(), "bitty-plugin-gen");
    const beforeCount = existsSync(tmpBase) ? readdirSync(tmpBase).length : 0;

    // Trigger failure with invalid ID
    const result = spawnSync(
      "bun",
      [
        join(SCRIPT_DIR, "generate-plugin.mjs"),
        "--id",
        "invalid",
        "--name",
        "Test Plugin",
        "--dir",
        targetDir,
      ],
      { stdio: "pipe", env: { ...process.env, GEN_TMPDIR: tmpdir() } },
    );

    expect(result.status).not.toBe(0);

    // Temp directories should be cleaned (no increase)
    const afterCount = existsSync(tmpBase) ? readdirSync(tmpBase).length : 0;
    expect(afterCount).toBe(beforeCount);
  });

  test("retry succeeds after fixing failure", () => {
    // First attempt with invalid ID (too long)
    const longId = "a".repeat(200);
    const failResult = spawnSync(
      "bun",
      [
        join(SCRIPT_DIR, "generate-plugin.mjs"),
        "--id",
        longId,
        "--name",
        "Test Plugin",
        "--dir",
        targetDir,
      ],
      { stdio: "pipe" },
    );

    expect(failResult.status).not.toBe(0);
    expect(existsSync(targetDir)).toBe(false);

    // Retry with valid ID should succeed
    const successResult = spawnSync(
      "bun",
      [
        join(SCRIPT_DIR, "generate-plugin.mjs"),
        "--id",
        "test.plugin",
        "--name",
        "Test Plugin",
        "--dir",
        targetDir,
      ],
      { stdio: "inherit" },
    );

    expect(successResult.status).toBe(0);
    expect(existsSync(targetDir)).toBe(true);

    // Verify generated plugin is complete
    expect(existsSync(join(targetDir, "bitty-plugin.toml"))).toBe(true);
    expect(existsSync(join(targetDir, "lua", "plugin"))).toBe(true);
  });

  test("no partial target on existing-target failure", () => {
    // First generation should succeed
    const result1 = spawnSync(
      "bun",
      [
        join(SCRIPT_DIR, "generate-plugin.mjs"),
        "--id",
        "test.plugin",
        "--name",
        "Test Plugin",
        "--dir",
        targetDir,
      ],
      { stdio: "inherit" },
    );

    expect(result1.status).toBe(0);
    expect(existsSync(targetDir)).toBe(true);

    // Record original content
    const originalManifest = readFileSync(
      join(targetDir, "bitty-plugin.toml"),
      "utf8",
    );

    // Second attempt with same target should fail without modifying target
    const result2 = spawnSync(
      "bun",
      [
        join(SCRIPT_DIR, "generate-plugin.mjs"),
        "--id",
        "another-plugin",
        "--name",
        "Another Plugin",
        "--dir",
        targetDir,
      ],
      { stdio: "pipe" },
    );

    expect(result2.status).not.toBe(0);

    // Original target should be unchanged
    const currentManifest = readFileSync(
      join(targetDir, "bitty-plugin.toml"),
      "utf8",
    );
    expect(currentManifest).toBe(originalManifest);
    expect(currentManifest).toContain("test.plugin");
    expect(currentManifest).not.toContain("another-plugin");
  });

  test("all placeholders resolved before publication", () => {
    const result = spawnSync(
      "bun",
      [
        join(SCRIPT_DIR, "generate-plugin.mjs"),
        "--id",
        "test.plugin",
        "--name",
        "Test Plugin",
        "--dir",
        targetDir,
      ],
      { stdio: "inherit" },
    );

    expect(result.status).toBe(0);
    expect(existsSync(targetDir)).toBe(true);

    // Walk all files and verify no unresolved placeholders
    function checkPlaceholders(dir) {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          checkPlaceholders(fullPath);
        } else if (entry.isFile()) {
          const content = readFileSync(fullPath, "utf8");
          expect(content).not.toContain("@@PLUGIN_");
        }
      }
    }

    checkPlaceholders(targetDir);
  });

  test("module directory renamed before placeholder replacement", () => {
    const result = spawnSync(
      "bun",
      [
        join(SCRIPT_DIR, "generate-plugin.mjs"),
        "--id",
        "test.plugin",
        "--name",
        "Test Plugin",
        "--dir",
        targetDir,
      ],
      { stdio: "inherit" },
    );

    expect(result.status).toBe(0);

    // Template placeholder directory should not exist
    expect(existsSync(join(targetDir, "lua", "@@PLUGIN_MODULE@@"))).toBe(false);

    // Generated module directory should exist
    expect(existsSync(join(targetDir, "lua", "plugin"))).toBe(true);
    expect(existsSync(join(targetDir, "lua", "plugin", "init.lua"))).toBe(true);
  });

  test("validation completes before atomic rename", () => {
    // Use invalid description (too long - max is 1024) to trigger validation failure
    const longDescription = "a".repeat(1025);

    const result = spawnSync(
      "bun",
      [
        join(SCRIPT_DIR, "generate-plugin.mjs"),
        "--id",
        "test.plugin",
        "--name",
        "Test Plugin",
        "--description",
        longDescription,
        "--dir",
        targetDir,
      ],
      { stdio: "pipe", env: { ...process.env, GEN_TMPDIR: tmpdir() } },
    );

    expect(result.status).not.toBe(0);

    // Target should not exist (validation failed before rename)
    expect(existsSync(targetDir)).toBe(false);

    // Temp should be cleaned up
    const tmpBase = join(tmpdir(), "bitty-plugin-gen");
    if (existsSync(tmpBase)) {
      const temps = readdirSync(tmpBase).filter((name) =>
        name.startsWith("generated-plugin-"),
      );
      expect(temps.length).toBe(0);
    }
  });
});
