#!/usr/bin/env bun
/**
 * Test SDK contract consumption (TPL-001, Issue #100).
 *
 * The resolver reads a vendored, content-addressed snapshot by default so
 * both CI and fresh clones are deterministic and offline. Overriding the
 * path to a missing artifact must fail closed (hard error), which the
 * subprocess regression below pins.
 */

import { test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  VENDORED_CONTRACT_REL,
  VENDORED_CONTRACT_SHA256,
  readSdkContract,
  getContractHash,
  getCapabilityExample,
  getDeferredNamespaces,
} from "./read-sdk-contract.mjs";

const SCRIPT = fileURLToPath(
  new URL("./read-sdk-contract.mjs", import.meta.url),
);

test("readSdkContract reads and validates the vendored artifact", () => {
  const contract = readSdkContract();
  expect(contract.format).toBe("bitty-host-contract/v1");
  expect(contract.plugin_api_version).toBe("1.0.0");
  expect(contract.capabilities).toBeDefined();
  expect(contract.sdk_revision).toMatch(/^[0-9a-f]{40}$/);
});

test("getContractHash returns the recorded vendored digest", () => {
  const hash1 = getContractHash();
  const hash2 = getContractHash();
  expect(hash1).toBe(hash2);
  expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  expect(hash1).toBe(VENDORED_CONTRACT_SHA256);
});

test("the vendored snapshot path is committed under scripts/", () => {
  expect(VENDORED_CONTRACT_REL).toBe("vendor/host-contract.json");
});

test("getCapabilityExample uses contract grammar", () => {
  const contract = readSdkContract();
  const example = getCapabilityExample(contract);
  expect(example).toMatch(/^env(\.read)?:/);
});

test("getDeferredNamespaces returns the frozen deferred list", () => {
  const contract = readSdkContract();
  const deferred = getDeferredNamespaces(contract);
  expect(deferred).toContain("env");
});

test("contract artifact change detection", () => {
  const hash = getContractHash();
  // This hash will change when SDK contract updates
  // Template sync check must detect the drift
  expect(hash).toBeTruthy();
});

test("missing artifact fails closed (Issue #100 regression)", () => {
  // The module resolves SDK_CONTRACT_PATH at import time, so drive the
  // missing-artifact path in a subprocess with the override set.
  const probe = [
    "import { readSdkContract, getContractHash } from " +
      JSON.stringify(SCRIPT) +
      ";",
    "try {",
    "  readSdkContract();",
    "  getContractHash();",
    "  console.log('NO-ERROR');",
    "} catch (e) {",
    "  console.log('THREW:' + e.message);",
    "}",
  ].join("\n");

  const result = spawnSync(process.execPath, ["-e", probe], {
    encoding: "utf8",
    env: {
      ...process.env,
      SDK_CONTRACT_PATH: "/nonexistent/host-contract.json",
    },
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toContain("THREW:");
  expect(result.stdout).toContain("not found");
  expect(result.stdout).not.toContain("NO-ERROR");
});
