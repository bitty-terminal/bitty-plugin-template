#!/usr/bin/env bun
/**
 * Test SDK contract consumption (TPL-001).
 */

import { test, expect } from "bun:test";
import {
  readSdkContract,
  getContractHash,
  getCapabilityExample,
  getDeferredNamespaces,
} from "./read-sdk-contract.mjs";

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
