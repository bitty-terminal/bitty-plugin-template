#!/usr/bin/env bun
/**
 * Read and validate SDK host contract artifact (TPL-001, Issue #83).
 * Template derives capability spellings, manifest forms, and wiring verdicts
 * from this artifact instead of local markers.
 */

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Determine the SDK contract path using the following precedence:
 * 1. SDK_CONTRACT_PATH environment variable (explicit path)
 * 2. BITTY_WORKSPACE environment variable with standard relative path
 * 3. Relative path from script location (assuming standard workspace layout)
 */
function resolveSdkContractPath() {
  // 1. Explicit environment variable
  if (process.env.SDK_CONTRACT_PATH) {
    return process.env.SDK_CONTRACT_PATH;
  }

  // 2. BITTY_WORKSPACE with standard path
  if (process.env.BITTY_WORKSPACE) {
    return join(
      process.env.BITTY_WORKSPACE,
      "bitty-plugins/sdk/bitty-plugin-sdk/dist/host-contract.json",
    );
  }

  // 3. Try relative path from script location (assuming workspace layout)
  // Script is in <workspace>/bitty-plugins/template/bitty-plugin-template/scripts/
  // SDK is in <workspace>/bitty-plugins/sdk/bitty-plugin-sdk/dist/
  const relativePath = resolve(
    __dirname,
    "../../../../sdk/bitty-plugin-sdk/dist/host-contract.json",
  );
  return relativePath;
}

const SDK_CONTRACT_PATH = resolveSdkContractPath();

// Check if contract exists
const CONTRACT_EXISTS = existsSync(SDK_CONTRACT_PATH);

export function readSdkContract() {
  if (!CONTRACT_EXISTS) {
    throw new Error(
      `SDK contract artifact not found at ${SDK_CONTRACT_PATH}. ` +
        `Set SDK_CONTRACT_PATH or BITTY_WORKSPACE environment variable, ` +
        `or ensure the SDK artifact is built.`,
    );
  }

  let content;
  try {
    content = readFileSync(SDK_CONTRACT_PATH, "utf-8");
  } catch (error) {
    throw new Error(
      `Failed to read SDK contract at ${SDK_CONTRACT_PATH}: ${error.message}`,
    );
  }

  let contract;
  try {
    contract = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Failed to parse SDK contract at ${SDK_CONTRACT_PATH}: ${error.message}`,
    );
  }

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
  if (!CONTRACT_EXISTS) {
    throw new Error(
      `SDK contract artifact not found at ${SDK_CONTRACT_PATH}. ` +
        `Cannot compute hash for missing contract.`,
    );
  }

  let content;
  try {
    content = readFileSync(SDK_CONTRACT_PATH, "utf-8");
  } catch (error) {
    throw new Error(
      `Failed to read SDK contract for hash at ${SDK_CONTRACT_PATH}: ${error.message}`,
    );
  }

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
