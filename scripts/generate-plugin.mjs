#!/usr/bin/env bun
/**
 * Generate a Bitty plugin repository from `template/`.
 *
 * Usage:
 *   bun scripts/generate-plugin.mjs \
 *     --id <owner.name> --name "<display name>" --dir <target> \
 *     [--description "<text>"] [--version <semver>]
 *
 * The generator is deterministic: `template/` is copied verbatim, every
 * placeholder token is substituted with a validated input, and nothing is
 * written outside `--dir`. A target that already exists is refused, so an
 * existing tree can never be partially overwritten. Invalid or unbounded
 * inputs fail before the first write.
 *
 * Placeholder tokens use the `@@PLUGIN_*@@` form because Markdown formatters
 * rewrite underscore emphasis (`__NAME__`), which would corrupt substitutions.
 *
 * Contract references (read-only, owned by bitty-docs):
 *   - plugin id grammar and manifest limits: plugin-platform RFC (OQ-012) and
 *     `bitty-plugin-host` / `bitty-package` manifest validation.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_PLUGIN_ID_LEN = 128;
const MAX_ID_SEGMENT_LEN = 64;
const MAX_NAME_LEN = 128;
const MAX_DESCRIPTION_LEN = 1024;
const MAX_VERSION_LEN = 64;
const RESERVED_PLACEHOLDER_PREFIX = "@@PLUGIN_";
const DEFAULT_DESCRIPTION =
  "Minimal Bitty plugin generated from bitty-plugin-template.";
const DEFAULT_VERSION = "0.1.0";

const USAGE =
  "usage: bun scripts/generate-plugin.mjs --id <owner.name> " +
  '--name "<display name>" --dir <target> ' +
  ' [--description "<text>"] [--version <semver>]';

/** Print a failure to stderr and exit with a validation status. */
function fail(message, exitCode = 1) {
  console.error(`generate-plugin: ${message}`);
  process.exit(exitCode);
}

/** Parse `--flag value` and `--flag=value` arguments. */
function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      fail(`unexpected argument '${token}'\n${USAGE}`, 2);
    }
    const eq = token.indexOf("=");
    const key = eq === -1 ? token.slice(2) : token.slice(2, eq);
    let value;
    if (eq !== -1) {
      value = token.slice(eq + 1);
    } else {
      value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        fail(`missing value for --${key}\n${USAGE}`, 2);
      }
      index += 1;
    }
    args[key] = value;
  }
  return args;
}

/** Reject control characters and characters that would break TOML/Lua strings. */
function validateDisplayText(value, flag, maxBytes) {
  if (Buffer.byteLength(value, "utf8") > maxBytes) {
    fail(`${flag} exceeds ${maxBytes} bytes`);
  }
  if (value.includes(RESERVED_PLACEHOLDER_PREFIX)) {
    fail(
      `${flag} must not contain the reserved prefix ${RESERVED_PLACEHOLDER_PREFIX}`,
    );
  }
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code < 0x20 || code === 0x7f) {
      fail(`${flag} must not contain control characters`);
    }
    if (character === '"' || character === "\\") {
      fail(`${flag} must not contain double quotes or backslashes`);
    }
  }
}

/** Validate the accepted plugin id grammar: `owner.name`. */
function validatePluginId(id) {
  if (id.length === 0) {
    fail("--id must not be empty");
  }
  if (id.length > MAX_PLUGIN_ID_LEN) {
    fail(`--id exceeds ${MAX_PLUGIN_ID_LEN} characters`);
  }
  const segments = id.split(".");
  if (segments.length !== 2) {
    fail("--id must be exactly owner.name (one dot)");
  }
  for (const segment of segments) {
    if (segment.length === 0) {
      fail("--id segments must not be empty");
    }
    if (segment.length > MAX_ID_SEGMENT_LEN) {
      fail(`--id segments must be at most ${MAX_ID_SEGMENT_LEN} characters`);
    }
    if (!/^[a-z][a-z0-9_-]*$/.test(segment)) {
      fail("--id segments must match [a-z][a-z0-9_-]*");
    }
  }
}

/** Validate SemVer 2 with the host's pre-release/build character set. */
function validateVersion(version) {
  if (version.length > MAX_VERSION_LEN) {
    fail(`--version exceeds ${MAX_VERSION_LEN} characters`);
  }
  const core = version.split(/[-+]/)[0];
  const parts = core.split(".");
  if (parts.length !== 3) {
    fail("--version must be SemVer X.Y.Z");
  }
  for (const part of parts) {
    if (!/^(0|[1-9][0-9]*)$/.test(part)) {
      fail("--version numeric components must be digits without leading zeros");
    }
  }
  if (!/^[0-9A-Za-z.+\-_]+$/.test(version)) {
    fail("--version contains characters outside [0-9A-Za-z.+-_]");
  }
}

/** Replace every placeholder token in one text file. */
function replacePlaceholders(file, tokens) {
  const original = readFileSync(file, "utf8");
  let updated = original;
  for (const [token, value] of Object.entries(tokens)) {
    updated = updated.split(token).join(value);
  }
  if (updated !== original) {
    writeFileSync(file, updated);
  }
}

/** Visit every file below `root`. */
function walkFiles(root, visit) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      walkFiles(path, visit);
    } else {
      visit(path);
    }
  }
}

const args = parseArgs(process.argv.slice(2));
for (const flag of ["id", "name", "dir"]) {
  if (!args[flag]) {
    fail(`missing required --${flag}\n${USAGE}`, 2);
  }
}

const id = args.id;
const name = args.name;
const description = args.description ?? DEFAULT_DESCRIPTION;
const version = args.version ?? DEFAULT_VERSION;

validatePluginId(id);
if (name.trim().length === 0) {
  fail("--name must not be empty");
}
validateDisplayText(name, "--name", MAX_NAME_LEN);
if (description.length === 0) {
  fail("--description must not be empty");
}
validateDisplayText(description, "--description", MAX_DESCRIPTION_LEN);
validateVersion(version);

const moduleName = id.split(".")[1];
const scriptDir = dirname(fileURLToPath(import.meta.url));
const templateDir = resolve(scriptDir, "..", "template");
const target = resolve(args.dir);
if (!existsSync(templateDir)) {
  fail(`template source not found at ${templateDir}`);
}
if (target === templateDir || target.startsWith(templateDir + sep)) {
  fail("--dir must not point inside the template source");
}

if (existsSync(target)) {
  fail(`target already exists: ${target} (refusing to overwrite)`);
}
mkdirSync(dirname(target), { recursive: true });
cpSync(templateDir, target, {
  recursive: true,
  errorOnExist: true,
  force: false,
});

const moduleDir = join(target, "lua", "@@PLUGIN_MODULE@@");
if (!existsSync(moduleDir)) {
  fail("template is missing lua/@@PLUGIN_MODULE@@");
}
renameSync(moduleDir, join(target, "lua", moduleName));

const tokens = {
  "@@PLUGIN_ID@@": id,
  "@@PLUGIN_NAME@@": name,
  "@@PLUGIN_VERSION@@": version,
  "@@PLUGIN_DESCRIPTION@@": description,
  "@@PLUGIN_MODULE@@": moduleName,
};
walkFiles(target, (file) => replacePlaceholders(file, tokens));

let unresolved = false;
walkFiles(target, (file) => {
  if (readFileSync(file, "utf8").includes(RESERVED_PLACEHOLDER_PREFIX)) {
    console.error(`generate-plugin: unresolved placeholder in ${file}`);
    unresolved = true;
  }
});
if (unresolved) {
  fail(`generated tree contains unresolved placeholders: ${target}`);
}

console.log(`Generated ${id} ${version} at ${target}`);
console.log(`Next: cd ${target} && just check`);
