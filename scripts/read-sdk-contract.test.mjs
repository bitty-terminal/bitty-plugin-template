#!/usr/bin/env bun
/**
 * Test SDK contract consumption (TPL-001).
 *
 * Issue #100: contract must fail closed when missing.
 */

import { test, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Determine if SDK contract exists using same logic as read-sdk-contract.mjs
function contractExists() {
  if (process.env.SDK_CONTRACT_PATH) {
    return existsSync(process.env.SDK_CONTRACT_PATH);
  }
  if (process.env.BITTY_WORKSPACE) {
    const path = join(
      process.env.BITTY_WORKSPACE,
      "bitty-plugins/sdk/bitty-plugin-sdk/dist/host-contract.json",
    );
    return existsSync(path);
  }
  const relativePath = resolve(
    __dirname,
    "../../../../sdk/bitty-plugin-sdk/dist/host-contract.json",
  );
  return existsSync(relativePath);
}

// Only run tests that require the contract when it exists
const contractAvailable = contractExists();

if (contractAvailable) {
  const {
    readSdkContract,
    getContractHash,
    getCapabilityExample,
    getDeferredNamespaces,
  } = await import("./read-sdk-contract.mjs");

  test("readSdkContract reads and validates artifact", () => {
    const contract = readSdkContract();
    expect(contract.format).toBe("bitty-host-contract/v1");
    expect(contract.plugin_api_version).toBe("1.0.0");
    expect(contract.capabilities).toBeDefined();
  });

  test("getContractHash returns stable hash", () => {
    const hash1 = getContractHash();
    const hash2 = getContractHash();
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  test("getCapabilityExample uses contract grammar", () => {
    const contract = readSdkContract();
    const example = getCapabilityExample(contract);
    expect(example).toMatch(/^env\.read:/);
  });

  test("getDeferredNamespaces returns deferred list", () => {
    const contract = readSdkContract();
    const deferred = getDeferredNamespaces(contract);
    expect(deferred).toContain("env");
    expect(deferred).toContain("services");
  });

  test("contract artifact change detection", () => {
    const hash = getContractHash();
    // This hash will change when SDK contract updates
    // Template sync check must detect the drift
    expect(hash).toBeTruthy();
  });
} else {
  // When contract doesn't exist, verify fail-closed behavior (Issue #100)
  test("readSdkContract throws when contract missing", async () => {
    const { readSdkContract } = await import("./read-sdk-contract.mjs");
    expect(() => readSdkContract()).toThrow(/SDK contract artifact not found/);
  });

  test("getContractHash throws when contract missing", async () => {
    const { getContractHash } = await import("./read-sdk-contract.mjs");
    expect(() => getContractHash()).toThrow(/SDK contract artifact not found/);
  });
}
