#!/usr/bin/env bun
/**
 * Read and validate SDK host contract artifact (TPL-001, Issue #83).
 * Template derives capability spellings, manifest forms, and wiring verdicts
 * from this artifact instead of local markers.
 */

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Vendored SDK contract snapshot (Issue #100).
 *
 * Generated from the frozen SDK pipeline commit with
 * `bun scripts/export-host-contract.ts` and committed with its SHA-256
 * digest. This makes CI deterministic and offline: the artifact is present
 * in the checkout, so a missing or corrupted snapshot is a hard failure
 * rather than an accidental skip.
 */
export const VENDORED_CONTRACT_REL = "vendor/host-contract.json";

/** SHA-256 of the vendored artifact bytes; updated only with the snapshot. */
export const VENDORED_CONTRACT_SHA256 =
  "8de6c80ff977a5d62ed0a91d27e4415ccc2b32b698a40dee14003d9e176baa87";

/**
 * Determine the SDK contract path using the following precedence:
 * 1. `SDK_CONTRACT_PATH` — explicit local override (ad-hoc inspection only).
 * 2. The vendored snapshot committed under `scripts/vendor/` (hermetic
 *    default: CI and fresh clones always have it).
 *
 * Ambient variables such as `BITTY_WORKSPACE` are intentionally ignored so
 * contract validation is deterministic across developer machines and CI.
 */
function resolveSdkContractPath() {
  // 1. Explicit environment variable override.
  if (process.env.SDK_CONTRACT_PATH) {
    return process.env.SDK_CONTRACT_PATH;
  }

  // 2. Vendored snapshot beside this script (offline, deterministic).
  return resolve(__dirname, VENDORED_CONTRACT_REL);
}

const SDK_CONTRACT_PATH = resolveSdkContractPath();

// Check if contract exists
const CONTRACT_EXISTS = existsSync(SDK_CONTRACT_PATH);

/** True when the artifact in use is the vendored snapshot (not an override). */
function usingVendoredSnapshot() {
  return SDK_CONTRACT_PATH === resolve(__dirname, VENDORED_CONTRACT_REL);
}

/** Read the resolved artifact bytes; a missing file is a hard failure. */
function readContractBytes() {
  if (!CONTRACT_EXISTS) {
    throw new Error(
      `SDK contract artifact not found at ${SDK_CONTRACT_PATH}. ` +
        `The vendored snapshot should exist in-repo; ` +
        `set SDK_CONTRACT_PATH or BITTY_WORKSPACE to override locally.`,
    );
  }

  try {
    return readFileSync(SDK_CONTRACT_PATH, "utf-8");
  } catch (error) {
    throw new Error(
      `Failed to read SDK contract at ${SDK_CONTRACT_PATH}: ${error.message}`,
    );
  }
}

export function readSdkContract() {
  const content = readContractBytes();

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
  const content = readContractBytes();
  const hash = createHash("sha256").update(content).digest("hex");

  // The vendored snapshot is content-addressed: verify it against the
  // recorded digest so a silently edited artifact fails closed.
  if (usingVendoredSnapshot() && hash !== VENDORED_CONTRACT_SHA256) {
    throw new Error(
      `Vendored SDK contract digest mismatch at ${SDK_CONTRACT_PATH}: ` +
        `expected ${VENDORED_CONTRACT_SHA256}, got ${hash}. ` +
        `Re-vendor the snapshot and update VENDORED_CONTRACT_SHA256.`,
    );
  }

  return hash;
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
