#!/usr/bin/env bun
/**
 * Read and validate SDK host contract artifact (TPL-001, Issue #83).
 * Template derives capability spellings, manifest forms, and wiring verdicts
 * from this artifact instead of local markers.
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

// Absolute path from BITTY_WORKSPACE
const BITTY_WORKSPACE =
  process.env.BITTY_WORKSPACE || "/mnt/data/Workspace/Projects/bitty-terminal";
const SDK_CONTRACT_PATH = join(
  BITTY_WORKSPACE,
  "bitty-plugins/sdk/bitty-plugin-sdk/dist/host-contract.json",
);

export function readSdkContract() {
  const content = readFileSync(SDK_CONTRACT_PATH, "utf-8");
  const contract = JSON.parse(content);

  // Validate required fields
  if (contract.format !== "bitty-host-contract/v1") {
    throw new Error(`Unsupported contract format: ${contract.format}`);
  }

  if (!contract.plugin_api_version) {
    throw new Error("Missing plugin_api_version in contract");
  }

  if (!contract.capabilities) {
    throw new Error("Missing capabilities in contract");
  }

  return contract;
}

export function getContractHash() {
  const content = readFileSync(SDK_CONTRACT_PATH, "utf-8");
  return createHash("sha256").update(content).digest("hex");
}

export function getCapabilityExample(contract) {
  // Use env.read:<KEY> form from contract
  const envPrefix = contract.capabilities.env_capability_prefix || "env.read:";
  return `${envPrefix}HOME`;
}

export function getDeferredNamespaces(contract) {
  return contract.host_parity.namespaces
    .filter((ns) => ns.status === "deferred")
    .map((ns) => ns.namespace);
}

export function getWiredNamespaces(contract) {
  return contract.host_parity.namespaces
    .filter((ns) => ns.status === "wired")
    .map((ns) => ns.namespace);
}
