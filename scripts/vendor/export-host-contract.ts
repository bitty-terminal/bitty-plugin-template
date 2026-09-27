#!/usr/bin/env bun
/**
 * Export the SDK host contract artifact for template consumption
 * (CTX-0054, TPL-001, Issue #100).
 *
 * This is the vendored copy of the SDK exporter, kept here so the template
 * can regenerate its committed snapshot offline. It loads the pinned SDK's
 * `host-surface` module from `SDK_HOST_SURFACE` (default `../src/host-surface.ts`)
 * so it can run from anywhere against an SDK checkout.
 *
 * The template must derive from SDK/host contracts and cannot invent
 * capabilities or wiring verdicts. This script generates a content-addressed
 * artifact containing capability spellings, manifest forms, wiring verdicts,
 * host revision, and compatibility metadata that the template consumes to
 * regenerate scaffold semantics.
 *
 * Usage:
 *   SDK_HOST_SURFACE=/path/to/sdk/src/host-surface.ts \
 *     bun scripts/vendor/export-host-contract.ts --output scripts/vendor/host-contract.json
 */

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const surfaceModulePath =
  process.env.SDK_HOST_SURFACE ?? "../src/host-surface.ts";
const surface = await import(surfaceModulePath);

const {
  CAPABILITY_GATED_SURFACE,
  COMMAND_ID_PATTERN,
  DEFERRED_NAMESPACES,
  ENV_CAPABILITY_PREFIX,
  ENV_KEY_PATTERN,
  ENV_MAX_VALUE_BYTES,
  EVENT_KIND_SET,
  EVENT_KINDS,
  EVENT_MAX_BYTES,
  EXCLUSIVE_CLAIM_SLOTS,
  HOST_PARITY_SOURCE,
  MOCK_LIMITS,
  NAMESPACE_HOST_PARITY,
  PLUGIN_API_VERSION,
  SNAPSHOT_SCOPE_ONLY,
  STORE_KEY_PATTERN,
  UI_SLOTS,
  UI_V1_EXCLUDED_NODE_KINDS,
  UI_V1_NODE_KINDS,
  V1_SURFACE_FUNCTIONS,
} = surface;

/** Host contract artifact format version. */
const ARTIFACT_FORMAT = "bitty-host-contract/v1";

/** SDK repository commit (filled by CI or export script). */
const SDK_REVISION = process.env.SDK_REVISION || "development";

/**
 * Stable `generated_at` value.
 *
 * A wall-clock timestamp would make the vendored, content-addressed snapshot
 * non-reproducible: every re-vendor would change the digest with no semantic
 * change. The snapshot is pinned to an immutable SDK commit, so the commit
 * identifier carries provenance and the time field stays constant.
 */
const GENERATED_AT = "vendored";

interface HostContractArtifact {
  readonly format: string;
  readonly sdk_revision: string;
  readonly generated_at: string;
  readonly content_hash: string;
  readonly plugin_api_version: string;
  readonly host_parity: {
    readonly repository: string;
    readonly commit: string;
    readonly pr: number;
    readonly namespaces: ReadonlyArray<{
      readonly namespace: string;
      readonly status: "wired" | "deferred";
    }>;
    readonly deferred_namespaces: readonly string[];
  };
  readonly capabilities: {
    readonly gated_surface: ReadonlyArray<{
      readonly surface: string;
      readonly capability: string;
    }>;
    readonly env_prefix: string;
  };
  readonly surface: {
    readonly functions: readonly string[];
    readonly event_kinds: ReadonlyArray<{
      readonly kind: string;
      readonly class: string;
      readonly coalescable: boolean;
    }>;
  };
  readonly patterns: {
    readonly command_id: string;
    readonly store_key: string;
    readonly env_key: string;
  };
  readonly limits: {
    readonly event_max_bytes: number;
    readonly env_max_value_bytes: number;
    readonly mock: typeof MOCK_LIMITS;
  };
  readonly ui: {
    readonly slots: readonly string[];
    readonly exclusive_claim_slots: readonly string[];
    readonly v1_node_kinds: readonly string[];
    readonly v1_excluded_node_kinds: readonly string[];
  };
  readonly snapshot: {
    readonly scope_only: string;
  };
}

function buildArtifact(): Omit<HostContractArtifact, "content_hash"> {
  return {
    format: ARTIFACT_FORMAT,
    sdk_revision: SDK_REVISION,
    generated_at: GENERATED_AT,
    content_hash: "", // filled below
    plugin_api_version: PLUGIN_API_VERSION,
    host_parity: {
      repository: HOST_PARITY_SOURCE.repository,
      commit: HOST_PARITY_SOURCE.commit,
      pr: HOST_PARITY_SOURCE.pr,
      namespaces: NAMESPACE_HOST_PARITY.map((entry) => ({
        namespace: entry.namespace,
        status: entry.status,
      })),
      deferred_namespaces: Array.from(DEFERRED_NAMESPACES).sort(),
    },
    capabilities: {
      gated_surface: CAPABILITY_GATED_SURFACE.map((gate) => ({
        surface: gate.surface,
        capability: gate.capability,
      })),
      env_prefix: ENV_CAPABILITY_PREFIX,
    },
    surface: {
      functions: [...V1_SURFACE_FUNCTIONS],
      event_kinds: EVENT_KINDS.map((event) => ({
        kind: event.kind,
        class: event.class,
        coalescable: event.coalescable,
      })),
    },
    patterns: {
      command_id: COMMAND_ID_PATTERN,
      store_key: STORE_KEY_PATTERN,
      env_key: ENV_KEY_PATTERN,
    },
    limits: {
      event_max_bytes: EVENT_MAX_BYTES,
      env_max_value_bytes: ENV_MAX_VALUE_BYTES,
      mock: { ...MOCK_LIMITS },
    },
    ui: {
      slots: [...UI_SLOTS],
      exclusive_claim_slots: [...EXCLUSIVE_CLAIM_SLOTS],
      v1_node_kinds: [...UI_V1_NODE_KINDS],
      v1_excluded_node_kinds: [...UI_V1_EXCLUDED_NODE_KINDS],
    },
    snapshot: {
      scope_only: SNAPSHOT_SCOPE_ONLY,
    },
  };
}

function computeContentHash(
  artifact: Omit<HostContractArtifact, "content_hash">,
): string {
  const canonical = JSON.stringify(artifact, null, 2);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function main(): number {
  const args = process.argv.slice(2);
  const outputIdx = args.indexOf("--output");
  const outputPath = outputIdx >= 0 ? args[outputIdx + 1] : null;

  const partial = buildArtifact();
  const contentHash = computeContentHash(partial);
  const artifact: HostContractArtifact = {
    ...partial,
    content_hash: contentHash,
  };

  const json = JSON.stringify(artifact, null, 2);

  if (outputPath) {
    writeFileSync(outputPath, json + "\n", "utf8");
    console.error(`Host contract artifact written to ${outputPath}`);
    console.error(`Content hash: ${contentHash}`);
  } else {
    console.log(json);
  }

  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
