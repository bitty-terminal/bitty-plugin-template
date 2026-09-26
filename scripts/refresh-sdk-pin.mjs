#!/usr/bin/env bun
/**
 * Regenerate `template/bun.lock` for the pinned `bitty-plugin-lint`
 * (bitty-plugin-sdk) commit.
 *
 * `template/package.json` requests the SDK by the `@@PLUGIN_SDK_REF@@`
 * placeholder and `template/bun.lock` carries the same placeholder in its
 * requested-spec line, so the concrete ref the generator substitutes is the
 * only committed pin. Bun cannot resolve a placeholder, so this script:
 *
 *   1. swaps `PLUGIN_SDK_REF` into `template/package.json` and
 *      `template/bun.lock`;
 *   2. re-resolves the git dependency with `bun update bitty-plugin-sdk`.
 *      A plain `bun install` is wrong here: Bun reuses an existing
 *      git-dependency lockfile entry and does not re-resolve a changed ref, so
 *      the resolved tuple would stay stale (reviewer finding PX-0103);
 *   3. restores the `@@PLUGIN_SDK_REF@@` placeholder in both files.
 *
 * `template/bun.lock` intentionally embeds the resolved short SHA, cache key,
 * and integrity hash — that is what makes `bun install --frozen-lockfile` work
 * for generated repositories. Only `package.json` and the lockfile's
 * requested-spec line carry the placeholder. The resolved tuple is verified
 * against the pin after the re-resolve, and `bun test` guards the same
 * invariant offline.
 *
 * Usage:
 *   bun scripts/refresh-sdk-pin.mjs   # or: just refresh-sdk-pin
 *   bun scripts/refresh-sdk-pin.mjs [--ref <40-char-sha>] [--template <dir>]
 *
 * `--ref`/`--template` exist for the end-to-end re-resolution check
 * (`scripts/verify-sdk-pin-refresh.mjs`); the production path uses the
 * `PLUGIN_SDK_REF` constant and the repository `template/` directory.
 *
 * Network: required (resolves the pinned commit from GitHub). Every other gate
 * stays offline.
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PLUGIN_SDK_REF } from "./generate-plugin.mjs";

export const PLACEHOLDER = "@@PLUGIN_SDK_REF@@";

/**
 * Re-resolving `bun` invocation. `bun update` refetches the git ref and rewrites
 * the resolved tuple; a bare `bun install` would reuse the stale lockfile
 * entry.
 */
export const RESOLVE_COMMAND = ["update", "bitty-plugin-sdk"];

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TEMPLATE_DIR = join(SCRIPT_DIR, "..", "template");

/** Replace the placeholder with the concrete pin in `text`. */
export function applyPin(text, sha = PLUGIN_SDK_REF) {
  return text.split(PLACEHOLDER).join(sha);
}

/** Replace the concrete pin with the placeholder in `text`. */
export function restorePlaceholder(text, sha = PLUGIN_SDK_REF) {
  return text.split(sha).join(PLACEHOLDER);
}

/**
 * True when a lockfile's resolved SDK tuple matches `sha`: the resolved spec
 * carries the full pin's short SHA and the extracted package directory carries
 * the matching cache-key suffix. This is the invariant that `bun test` guards;
 * it fails when the constant is bumped without regenerating the lockfile.
 */
export function lockfileTupleMatches(lockfile, sha = PLUGIN_SDK_REF) {
  const short = sha.slice(0, 7);
  return (
    lockfile.includes(
      `bitty-plugin-sdk@github:bitty-terminal/bitty-plugin-sdk#${short}`,
    ) && lockfile.includes(`bitty-terminal-bitty-plugin-sdk-${short}`)
  );
}

/** Parse `--ref <sha>` / `--template <dir>` flags. */
function parseArgs(argv) {
  const options = { ref: PLUGIN_SDK_REF, template: DEFAULT_TEMPLATE_DIR };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const eq = token.indexOf("=");
    const key = eq === -1 ? token : token.slice(0, eq);
    const value = eq === -1 ? argv[index + 1] : token.slice(eq + 1);
    if (value === undefined) {
      console.error(`refresh-sdk-pin: missing value for ${key}`);
      process.exit(2);
    }
    if (key === "--ref") {
      options.ref = value;
    } else if (key === "--template") {
      options.template = resolve(value);
    } else {
      console.error(`refresh-sdk-pin: unknown option '${token}'`);
      process.exit(2);
    }
    if (eq === -1) {
      index += 1;
    }
  }
  return options;
}

function fail(message) {
  console.error(`refresh-sdk-pin: ${message}`);
  process.exit(1);
}

/** Read a file as UTF-8. */
function read(file) {
  return readFileSync(file, "utf8");
}

function main() {
  const { ref, template } = parseArgs(process.argv.slice(2));
  const packageJson = join(template, "package.json");
  const bunLock = join(template, "bun.lock");

  for (const file of [packageJson, bunLock]) {
    if (!existsSync(file)) {
      fail(`missing ${file}`);
    }
  }

  const originalPackageJson = read(packageJson);
  const originalBunLock = read(bunLock);

  if (!originalPackageJson.includes(PLACEHOLDER)) {
    fail(`${packageJson} does not carry the ${PLACEHOLDER} placeholder`);
  }

  // Create a temporary scratch directory for the transactional refresh
  const scratchDir = mkdtempSync(join(tmpdir(), "bitty-refresh-sdk-"));
  const scratchPackageJson = join(scratchDir, "package.json");
  const scratchBunLock = join(scratchDir, "bun.lock");
  const scratchNodeModules = join(scratchDir, "node_modules");

  try {
    // Copy template files to scratch directory
    writeFileSync(scratchPackageJson, applyPin(originalPackageJson, ref));
    writeFileSync(scratchBunLock, applyPin(originalBunLock, ref));

    // Run the resolution in the scratch directory
    const result = spawnSync("bun", RESOLVE_COMMAND, {
      cwd: scratchDir,
      stdio: "inherit",
    });

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(
        `bun ${RESOLVE_COMMAND.join(" ")} exited ${result.status}`,
      );
    }

    // Validate the resolved lockfile
    const resolvedLockfile = read(scratchBunLock);
    if (!lockfileTupleMatches(resolvedLockfile, ref)) {
      fail(
        `${scratchBunLock} resolved SDK tuple does not match ${ref.slice(0, 7)}; ` +
          "inspect the lockfile and re-run",
      );
    }

    // Restore placeholders in the scratch directory
    const resolvedPackageJson = read(scratchPackageJson);
    const finalPackageJson = restorePlaceholder(resolvedPackageJson, ref);
    const finalBunLock = restorePlaceholder(resolvedLockfile, ref);

    if (!finalPackageJson.includes(PLACEHOLDER)) {
      fail(`${scratchPackageJson} lost the ${PLACEHOLDER} placeholder`);
    }

    // Atomically replace the original files with backups
    const backupPackageJson = packageJson + ".backup";
    const backupBunLock = bunLock + ".backup";

    try {
      // Create backups
      writeFileSync(backupPackageJson, originalPackageJson);
      writeFileSync(backupBunLock, originalBunLock);

      // Atomically replace both files
      writeFileSync(packageJson, finalPackageJson);
      writeFileSync(bunLock, finalBunLock);

      // Clean up backups on success
      rmSync(backupPackageJson, { force: true });
      rmSync(backupBunLock, { force: true });
    } catch (error) {
      // Restore from backups on any error
      if (existsSync(backupPackageJson)) {
        writeFileSync(packageJson, readFileSync(backupPackageJson, "utf8"));
        rmSync(backupPackageJson, { force: true });
      }
      if (existsSync(backupBunLock)) {
        writeFileSync(bunLock, readFileSync(backupBunLock, "utf8"));
        rmSync(backupBunLock, { force: true });
      }
      throw error;
    }

    console.log(
      `refresh-sdk-pin: ${bunLock} resolves ${ref.slice(0, 7)}; placeholder restored`,
    );
  } catch (error) {
    fail(`${error instanceof Error ? error.message : String(error)}`);
  } finally {
    // Clean up scratch directory
    rmSync(scratchDir, { recursive: true, force: true });

    // Clean up any node_modules in the template directory
    const templateNodeModules = join(template, "node_modules");
    if (existsSync(templateNodeModules)) {
      rmSync(templateNodeModules, { recursive: true, force: true });
    }
  }
}

if (import.meta.main) {
  main();
}
