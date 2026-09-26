#!/usr/bin/env bun
/**
 * Generate a Bitty plugin repository from `template/`.
 *
 * Usage:
 *   bun scripts/generate-plugin.mjs \
 *     --id <owner.name> --name "<display name>" --dir <target> \
 *     [--description "<text>"] [--version <semver>]
 *
 * The generator is deterministic: `template/` is copied, every placeholder
 * token is substituted with a validated input, and nothing is written outside
 * `--dir`. A target that already exists is refused, so an existing tree can
 * never be partially overwritten. Invalid or unbounded inputs fail before the
 * first write.
 *
 * Placeholder tokens use the `@@PLUGIN_*@@` form because Markdown formatters
 * rewrite underscore emphasis (`__NAME__`), which would corrupt substitutions.
 * `@@PLUGIN_SDK_REF@@` carries the pinned `bitty-plugin-lint` (bitty-plugin-sdk)
 * commit from `PLUGIN_SDK_REF` into the generated `package.json` and `bun.lock`,
 * so generated repositories lint their manifest with the authoritative SDK
 * instead of a vendored validator (CTX-0017).
 *
 * Generated Markdown tables are re-aligned after substitution (see
 * `alignMarkdownTables`): a shorter or longer placeholder value would otherwise
 * leave the template's hand-aligned pipes out of line and fail Markdownlint
 * MD060 (`table-column-style`, aligned) in the generated repository. Table
 * alignment skips fenced and four-space-indented code blocks and pads by a
 * grapheme/East-Asian width model that mirrors the linter for the ASCII, CJK,
 * and emoji content generated repositories contain (some exotic spacing-mark
 * clusters may still differ), keeping code examples intact and CJK or emoji
 * cells aligned. `scripts/generate-plugin.test.mjs` pins this.
 *
 * Contract references (read-only, owned by bitty-docs):
 *   - plugin id grammar and manifest limits: plugin-platform RFC (OQ-012) and
 *     `bitty-plugin-host` / `bitty-package` manifest validation.
 *   - entry layout: the `lua/` module root holds `<module>/init.lua`, resolved
 *     by the host `entry_point` (`<module_root>/init.lua` or
 *     `<module_root>/<module>/init.lua`); manifest discovery alone is not
 *     activation evidence (PLUG-SDK-001, issue #67). No package-root
 *     forwarder is generated because the host resolves the nested shape.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const MAX_PLUGIN_ID_LEN = 128;
const MAX_ID_SEGMENT_LEN = 64;
const MAX_NAME_LEN = 128;
const MAX_DESCRIPTION_LEN = 1024;
const MAX_VERSION_LEN = 64;
const RESERVED_PLACEHOLDER_PREFIX = "@@PLUGIN_";
const DEFAULT_DESCRIPTION =
  "Minimal Bitty plugin generated from bitty-plugin-template.";
const DEFAULT_VERSION = "0.1.0";

/**
 * Pinned `bitty-plugin-lint` (bitty-plugin-sdk) commit, substituted for the
 * `@@PLUGIN_SDK_REF@@` token in the generated `package.json` and `bun.lock`.
 * Generated repositories install the authoritative manifest linter from this
 * commit rather than vendoring a re-implementation (CTX-0017). The pin tracks
 * the frozen generation pipeline (CTX-0053 / SDK #109, re-wired by SDK #118
 * for issue #80): per-namespace host parity from bitty #1303 as re-wired by
 * bitty #1391 (WIRED `keymaps`/`tasks`/`services`, DEFERRED `env` with typed
 * `E_NOT_IMPLEMENTED`, `process.spawn` v1-OUT). Maintenance: when
 * the SDK manifest contract moves, bump this SHA and regenerate
 * `template/bun.lock` in the same change (the lockfile embeds the short SHA and
 * cache key derived from it), then run `just clean-generation` and
 * `just template-sdk-sync`.
 */
export const PLUGIN_SDK_REF = "e1723b60cc94d3abc18821c9e6b14c6c88f33add";

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

/**
 * SemVer 2 pattern, mirrored from `versionProblem`/`SEMVER_2` in
 * `bitty-plugin-sdk/src/manifest.ts`, the lint contract the generated manifest
 * must satisfy. The SDK linter is installed into generated repositories (not
 * into this generator), so input validation keeps a synchronized copy of the
 * pattern. Stay fail-closed: boundary versions the SDK rejects (empty
 * pre-release/build identifiers, underscores, missing segments, leading zeros)
 * are rejected here before anything is written; the generated repository then
 * re-validates the manifest with the pinned SDK lint. Keep this identical to
 * the SDK pattern.
 */
const SEMVER_2 =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/** Validate a concrete SemVer 2 version against the SDK lint contract. */
function validateVersion(version) {
  if (version.length > MAX_VERSION_LEN) {
    fail(`--version exceeds ${MAX_VERSION_LEN} characters`);
  }
  if (!SEMVER_2.test(version)) {
    fail(
      "--version must be SemVer 2 (MAJOR.MINOR.PATCH with optional -prerelease/+build)",
    );
  }
}

const MD_TABLE_DELIMITER = /^:?-+:?$/;

/**
 * East-Asian wide and fullwidth code-point ranges, copied from the pinned
 * `get-east-asian-width` data that `string-width` (and therefore Markdownlint
 * MD060's aligned style) uses. Kept as a synchronized copy, like `SEMVER_2`
 * below, so the generator stays dependency-free while its width model mirrors
 * the lint for the content generated repositories contain (ASCII ids, CJK, and
 * emoji); exotic spacing marks are outside that scope. Re-copy when the
 * toolchain pin moves.
 */
const WIDE_RANGES = [
  4352, 4447, 8986, 8987, 9001, 9002, 9193, 9196, 9200, 9200, 9203, 9203, 9725,
  9726, 9748, 9749, 9776, 9783, 9800, 9811, 9855, 9855, 9866, 9871, 9875, 9875,
  9889, 9889, 9898, 9899, 9917, 9918, 9924, 9925, 9934, 9934, 9940, 9940, 9962,
  9962, 9970, 9971, 9973, 9973, 9978, 9978, 9981, 9981, 9989, 9989, 9994, 9995,
  10024, 10024, 10060, 10060, 10062, 10062, 10067, 10069, 10071, 10071, 10133,
  10135, 10160, 10160, 10175, 10175, 11035, 11036, 11088, 11088, 11093, 11093,
  11904, 11929, 11931, 12019, 12032, 12245, 12272, 12287, 12288, 12288, 12289,
  12350, 12353, 12438, 12441, 12543, 12549, 12591, 12593, 12686, 12688, 12773,
  12783, 12830, 12832, 12871, 12880, 42124, 42128, 42182, 43360, 43388, 44032,
  55203, 63744, 64255, 65040, 65049, 65072, 65106, 65108, 65126, 65128, 65131,
  65281, 65376, 65504, 65510, 94176, 94180, 94192, 94198, 94208, 101589, 101631,
  101662, 101760, 101874, 110576, 110579, 110581, 110587, 110589, 110590,
  110592, 110882, 110898, 110898, 110928, 110930, 110933, 110933, 110948,
  110951, 110960, 111355, 119552, 119638, 119648, 119670, 126980, 126980,
  127183, 127183, 127374, 127374, 127377, 127386, 127488, 127490, 127504,
  127547, 127552, 127560, 127568, 127569, 127584, 127589, 127744, 127776,
  127789, 127797, 127799, 127868, 127870, 127891, 127904, 127946, 127951,
  127955, 127968, 127984, 127988, 127988, 127992, 128062, 128064, 128064,
  128066, 128252, 128255, 128317, 128331, 128334, 128336, 128359, 128378,
  128378, 128405, 128406, 128420, 128420, 128507, 128591, 128640, 128709,
  128716, 128716, 128720, 128722, 128725, 128728, 128732, 128735, 128747,
  128748, 128756, 128764, 128992, 129003, 129008, 129008, 129292, 129338,
  129340, 129349, 129351, 129535, 129648, 129660, 129664, 129674, 129678,
  129734, 129736, 129736, 129741, 129756, 129759, 129770, 129775, 129784,
  131072, 196605, 196608, 262141,
];

const graphemeSegmenter = new Intl.Segmenter();
const ZERO_WIDTH_CLUSTER =
  /^(?:\p{Default_Ignorable_Code_Point}|\p{Control}|\p{Format}|\p{Nonspacing_Mark}|\p{Enclosing_Mark}|\p{Surrogate})+$/v;
const LEADING_NON_PRINTING =
  /^[\p{Default_Ignorable_Code_Point}\p{Control}\p{Format}\p{Nonspacing_Mark}\p{Enclosing_Mark}\p{Surrogate}]+/v;
const SPACING_MARK = /\p{Spacing_Mark}/v;
const RGI_EMOJI = /^\p{RGI_Emoji}$/v;
const UNQUALIFIED_KEYCAP = /^[\d#*]\u20e3$/;
const EXTENDED_PICTOGRAPHIC = /\p{Extended_Pictographic}/gu;

/** True when `codePoint` is East-Asian wide or fullwidth (two columns). */
function isWideCodePoint(codePoint) {
  let low = 0;
  let high = WIDE_RANGES.length / 2 - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const start = WIDE_RANGES[mid * 2];
    const end = WIDE_RANGES[mid * 2 + 1];
    if (codePoint < start) {
      high = mid - 1;
    } else if (codePoint > end) {
      low = mid + 1;
    } else {
      return true;
    }
  }
  return false;
}

/** East-Asian width, with ambiguous code points treated as narrow. */
function eastAsianWidth(codePoint) {
  return isWideCodePoint(codePoint) ? 2 : 1;
}

function isHangulLeadingJamo(codePoint) {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0xa960 && codePoint <= 0xa97c)
  );
}

function isHangulVowelJamo(codePoint) {
  return (
    (codePoint >= 0x1160 && codePoint <= 0x11a7) ||
    (codePoint >= 0xd7b0 && codePoint <= 0xd7c6)
  );
}

function isHangulTrailingJamo(codePoint) {
  return (
    (codePoint >= 0x11a8 && codePoint <= 0x11ff) ||
    (codePoint >= 0xd7cb && codePoint <= 0xd7fb)
  );
}

function isHangulJamo(codePoint) {
  return (
    isHangulLeadingJamo(codePoint) ||
    isHangulVowelJamo(codePoint) ||
    isHangulTrailingJamo(codePoint)
  );
}

/**
 * Collapse modern Hangul L+V(+T) jamo shapes to their rendered syllable width,
 * mirroring `string-width`. Returns `undefined` when the cluster does not start
 * with a Hangul jamo, so normal East-Asian Width handling applies.
 */
function hangulClusterWidth(visible) {
  const codePoints = [];
  for (const character of visible) {
    if (ZERO_WIDTH_CLUSTER.test(character)) {
      continue;
    }
    codePoints.push(character.codePointAt(0));
  }
  if (codePoints.length === 0) {
    return undefined;
  }
  let width = 0;
  for (let index = 0; index < codePoints.length; index += 1) {
    const codePoint = codePoints[index];
    if (!isHangulJamo(codePoint)) {
      if (width === 0) {
        return undefined;
      }
      for (
        let remaining = index;
        remaining < codePoints.length;
        remaining += 1
      ) {
        width += eastAsianWidth(codePoints[remaining]);
      }
      return width;
    }
    if (
      isHangulLeadingJamo(codePoint) &&
      isHangulVowelJamo(codePoints[index + 1])
    ) {
      width += 2;
      index += isHangulTrailingJamo(codePoints[index + 2]) ? 2 : 1;
      continue;
    }
    width += eastAsianWidth(codePoint);
  }
  return width;
}

/** Minimally-qualified/unqualified emoji sequences that still render double. */
function isDoubleWidthNonRgiEmoji(segment) {
  if (segment.length > 50) {
    return false;
  }
  if (UNQUALIFIED_KEYCAP.test(segment)) {
    return true;
  }
  if (segment.includes("\u200d")) {
    const pictographics = segment.match(EXTENDED_PICTOGRAPHIC);
    return pictographics !== null && pictographics.length >= 2;
  }
  return false;
}

/** Visual width of one grapheme cluster; mirrors `string-width` for common content. */
function graphemeWidth(segment) {
  if (ZERO_WIDTH_CLUSTER.test(segment)) {
    return 0;
  }
  if (RGI_EMOJI.test(segment) || isDoubleWidthNonRgiEmoji(segment)) {
    return 2;
  }
  const visible = segment.replace(LEADING_NON_PRINTING, "");
  if (visible.length === 0) {
    return 0;
  }
  const hangulWidth = hangulClusterWidth(visible);
  if (hangulWidth !== undefined) {
    return hangulWidth;
  }
  let width = eastAsianWidth(visible.codePointAt(0));
  let first = true;
  for (const character of visible) {
    if (first) {
      first = false;
      continue;
    }
    if (
      SPACING_MARK.test(character) ||
      (character >= "\uff00" && character <= "\uffef")
    ) {
      width += eastAsianWidth(character.codePointAt(0));
    }
  }
  return width;
}

/** Visual width of a Markdown table cell; matches Markdownlint MD060 for ASCII, CJK, and emoji. */
export function displayWidth(text) {
  let width = 0;
  for (const { segment } of graphemeSegmenter.segment(text)) {
    width += graphemeWidth(segment);
  }
  return width;
}

/** True when a line contains a pipe that is not backslash-escaped. */
function hasUnescapedPipe(line) {
  let escaped = false;
  for (const character of line) {
    if (escaped) {
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === "|") {
      return true;
    }
  }
  return false;
}

/** Split one Markdown table row into trimmed cells, honoring `\|` escapes. */
function splitTableRow(line) {
  let body = line.trim();
  if (body.startsWith("|")) {
    body = body.slice(1);
  }
  if (/(^|[^\\])\|\s*$/.test(body)) {
    body = body.replace(/\|\s*$/, "");
  }
  const cells = [];
  let current = "";
  let escaped = false;
  for (const character of body) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === "\\") {
      current += character;
      escaped = true;
    } else if (character === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current.trim());
  return cells;
}

/** True when every cell of a row is a GFM delimiter (`---`, `:--`, `--:`). */
function isDelimiterRow(cells) {
  return (
    cells.length > 0 && cells.every((cell) => MD_TABLE_DELIMITER.test(cell))
  );
}

/** Right-pad a cell with spaces to `width` (wide glyphs count double). */
function padCell(text, width) {
  return text + " ".repeat(Math.max(0, width - displayWidth(text)));
}

/**
 * Re-render a table block (header, delimiter, body rows) in the aligned style:
 * every column padded to its widest cell so the pipes line up. The block's
 * leading indentation is preserved so a table nested in a list stays nested.
 * Placeholder substitution changes cell width, so a template aligned for the
 * placeholder text comes out misaligned and fails MD060 without this pass.
 */
function renderTable(block) {
  const indent = /^ */.exec(block[0])[0];
  const rows = block.map(splitTableRow);
  const columnCount = Math.max(...rows.map((row) => row.length));
  const widths = new Array(columnCount).fill(3);
  rows.forEach((row, index) => {
    if (index === 1) {
      return;
    }
    for (let column = 0; column < columnCount; column += 1) {
      widths[column] = Math.max(
        widths[column],
        displayWidth(row[column] ?? ""),
      );
    }
  });

  return rows.map((row, index) => {
    const cells = [];
    for (let column = 0; column < columnCount; column += 1) {
      const text = row[column] ?? "";
      if (index === 1) {
        const leading = text.startsWith(":");
        const trailing = text.endsWith(":");
        const dashes = Math.max(
          1,
          widths[column] - (leading ? 1 : 0) - (trailing ? 1 : 0),
        );
        cells.push(
          `${leading ? ":" : ""}${"-".repeat(dashes)}${trailing ? ":" : ""}`,
        );
      } else {
        cells.push(padCell(text, widths[column]));
      }
    }
    return `${indent}| ${cells.join(" | ")} |`;
  });
}

const MD_TABLE_FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const MD_TABLE_FENCE_CLOSE = /^( {0,3})(`{3,}|~{3,})\s*$/;
const MD_TABLE_BLOCK_START =
  /^ {0,3}(?:#{1,6}\s|>|`{3,}|~{3,}|[-+*](?:\s|$)|\d{1,9}[.)](?:\s|$)|<)/;

/** Leading-space count of a line. */
function indentation(line) {
  return /^ */.exec(line)[0].length;
}

/**
 * True when `lines[index]` starts a table: a header row with a pipe, a
 * delimiter row of exactly the same cell count, and at most three spaces of
 * indentation (four spaces or more is an indented code block).
 */
function isTableStart(lines, index) {
  const header = lines[index];
  const delimiter = lines[index + 1];
  if (delimiter === undefined || indentation(header) > 3) {
    return false;
  }
  if (!hasUnescapedPipe(header)) {
    return false;
  }
  const headerCells = splitTableRow(header);
  const delimiterCells = splitTableRow(delimiter);
  return (
    isDelimiterRow(delimiterCells) &&
    delimiterCells.length === headerCells.length
  );
}

/**
 * Index just past the table that starts at `index`. Body rows follow GFM: any
 * non-blank line at the same indentation that contains a pipe, unless it opens
 * another block (fence, heading, list, quote, HTML). Un-piped rows are kept so
 * a table is never rendered only in part.
 */
function tableEnd(lines, index) {
  let end = index + 2;
  while (end < lines.length) {
    const row = lines[end];
    if (row.trim() === "" || indentation(row) > 3) {
      break;
    }
    if (!hasUnescapedPipe(row) || MD_TABLE_BLOCK_START.test(row)) {
      break;
    }
    end += 1;
  }
  return end;
}

/**
 * Re-align every GitHub-Flavored-Markdown table in a document. Fenced code
 * blocks, indented code blocks, and all non-table lines are left untouched.
 * The result is deterministic and idempotent.
 */
export function alignMarkdownTables(content) {
  const lines = content.split("\n");
  const output = [];
  let index = 0;
  let fence = null;
  while (index < lines.length) {
    const line = lines[index];
    if (fence !== null) {
      output.push(line);
      const closing = MD_TABLE_FENCE_CLOSE.exec(line);
      if (
        closing !== null &&
        closing[2][0] === fence.character &&
        closing[2].length >= fence.length
      ) {
        fence = null;
      }
      index += 1;
      continue;
    }
    const opening = MD_TABLE_FENCE.exec(line);
    if (opening !== null) {
      const character = opening[2][0];
      const info = opening[3];
      if (!(character === "`" && info.includes("`"))) {
        fence = { character, length: opening[2].length };
        output.push(line);
        index += 1;
        continue;
      }
    }
    if (isTableStart(lines, index)) {
      const end = tableEnd(lines, index);
      output.push(...renderTable(lines.slice(index, end)));
      index = end;
      continue;
    }
    output.push(line);
    index += 1;
  }
  return output.join("\n");
}

/** Replace every placeholder token in one text file. */
function replacePlaceholders(file, tokens) {
  const original = readFileSync(file, "utf8");
  let updated = original;
  for (const [token, value] of Object.entries(tokens)) {
    updated = updated.split(token).join(value);
  }
  if (file.endsWith(".md")) {
    updated = alignMarkdownTables(updated);
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

/**
 * Temporary directory base for atomic generation. Derives from GEN_TMPDIR
 * environment variable or OS tmpdir, never hardcoded.
 */
function genTmpDir() {
  return process.env.GEN_TMPDIR || tmpdir();
}

function main() {
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

  // Atomic generation: create unique sibling temp, validate completely, then
  // atomically publish via rename. Clean only task-owned temp on failure.
  const targetParent = dirname(target);
  const targetName = target.split(sep).at(-1);
  mkdirSync(targetParent, { recursive: true });

  const tmpBase = join(genTmpDir(), "bitty-plugin-gen");
  mkdirSync(tmpBase, { recursive: true });
  const tempTarget = mkdtempSync(join(tmpBase, `${targetName}-`));

  try {
    // Copy template contents into temp directory
    for (const entry of readdirSync(templateDir, { withFileTypes: true })) {
      const src = join(templateDir, entry.name);
      const dest = join(tempTarget, entry.name);
      cpSync(src, dest, {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
    }

    const moduleDir = join(tempTarget, "lua", "@@PLUGIN_MODULE@@");
    if (!existsSync(moduleDir)) {
      fail("template is missing lua/@@PLUGIN_MODULE@@");
    }
    renameSync(moduleDir, join(tempTarget, "lua", moduleName));

    const tokens = {
      "@@PLUGIN_ID@@": id,
      "@@PLUGIN_NAME@@": name,
      "@@PLUGIN_VERSION@@": version,
      "@@PLUGIN_DESCRIPTION@@": description,
      "@@PLUGIN_MODULE@@": moduleName,
      "@@PLUGIN_SDK_REF@@": PLUGIN_SDK_REF,
    };
    walkFiles(tempTarget, (file) => replacePlaceholders(file, tokens));

    let unresolved = false;
    walkFiles(tempTarget, (file) => {
      if (readFileSync(file, "utf8").includes(RESERVED_PLACEHOLDER_PREFIX)) {
        console.error(`generate-plugin: unresolved placeholder in ${file}`);
        unresolved = true;
      }
    });
    if (unresolved) {
      fail(`generated tree contains unresolved placeholders: ${tempTarget}`);
    }

    // Atomic publish: rename temp to final target
    renameSync(tempTarget, target);

    console.log(`Generated ${id} ${version} at ${target}`);
    console.log(`Next: cd ${target} && just check`);
  } catch (error) {
    // Clean only task-owned temp on failure
    if (existsSync(tempTarget)) {
      rmSync(tempTarget, { recursive: true, force: true });
    }
    throw error;
  }
}

if (import.meta.main) {
  main();
}
