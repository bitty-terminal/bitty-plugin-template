import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

import {
  PLUGIN_SDK_REF,
  alignMarkdownTables,
  displayWidth,
} from "./generate-plugin.mjs";
import {
  PLACEHOLDER,
  applyPin,
  lockfileTupleMatches,
  restorePlaceholder,
} from "./refresh-sdk-pin.mjs";

/** Read a template file relative to this test. */
function templateFile(relativePath) {
  return readFileSync(new URL(`../template/${relativePath}`, import.meta.url), {
    encoding: "utf8",
  });
}

/** Join table rows into a document with a trailing newline. */
function lines(...rows) {
  return `${rows.join("\n")}\n`;
}

/** A layout table whose module cell exercises short/long substitutions. */
function moduleTable(module) {
  return lines(
    "| Path | Purpose |",
    "| --- | --- |",
    "| `bitty-plugin.toml` | manifest |",
    `| \`lua/${module}/init.lua\` | entry point |`,
    "| `justfile` | gates |",
  );
}

const ZWJ_FAMILY = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}";

describe("alignMarkdownTables", () => {
  test("leaves backtick-fenced code blocks untouched", () => {
    const input = lines(
      "```markdown",
      "| A | B |",
      "| --- | --- |",
      "| long | x |",
      "```",
    );
    expect(alignMarkdownTables(input)).toBe(input);
  });

  test("leaves tilde-fenced code blocks untouched", () => {
    const input = lines(
      "~~~markdown",
      "| A | B |",
      "| --- | --- |",
      "| long | x |",
      "~~~",
    );
    expect(alignMarkdownTables(input)).toBe(input);
  });

  test("closes a fence only on a matching fence of at least the same length", () => {
    const input = lines(
      "````markdown",
      "```",
      "| A | B |",
      "| --- | --- |",
      "````",
    );
    expect(alignMarkdownTables(input)).toBe(input);
  });

  test("leaves four-space-indented code blocks untouched", () => {
    const input = lines(
      "    | A | B |",
      "    | --- | --- |",
      "    | longer | x |",
    );
    expect(alignMarkdownTables(input)).toBe(input);
  });

  test("does not treat a paragraph followed by a thematic break as a table", () => {
    const input = lines("title | subtitle", "---");
    expect(alignMarkdownTables(input)).toBe(input);
  });

  test("aligns a table after a fenced code block but not the fence", () => {
    const input = lines(
      "```",
      "| A | B |",
      "| --- | --- |",
      "```",
      "",
      "| A | B |",
      "| --- | --- |",
      "| longer | x |",
    );
    expect(alignMarkdownTables(input)).toBe(
      lines(
        "```",
        "| A | B |",
        "| --- | --- |",
        "```",
        "",
        "| A      | B   |",
        "| ------ | --- |",
        "| longer | x   |",
      ),
    );
  });

  test("keeps list indentation when aligning a nested table", () => {
    const input = lines(
      "- item",
      "",
      "  | A | B |",
      "  | --- | --- |",
      "  | x | y |",
    );
    expect(alignMarkdownTables(input)).toBe(
      lines(
        "- item",
        "",
        "  | A   | B   |",
        "  | --- | --- |",
        "  | x   | y   |",
      ),
    );
  });

  test("aligns short and long module substitutions", () => {
    expect(alignMarkdownTables(moduleTable("a"))).toBe(
      lines(
        "| Path                | Purpose     |",
        "| ------------------- | ----------- |",
        "| `bitty-plugin.toml` | manifest    |",
        "| `lua/a/init.lua`    | entry point |",
        "| `justfile`          | gates       |",
      ),
    );
    expect(
      alignMarkdownTables(moduleTable("moderation_tools_and_automation")),
    ).toBe(
      lines(
        "| Path                                           | Purpose     |",
        "| ---------------------------------------------- | ----------- |",
        "| `bitty-plugin.toml`                            | manifest    |",
        "| `lua/moderation_tools_and_automation/init.lua` | entry point |",
        "| `justfile`                                     | gates       |",
      ),
    );
  });

  test("aligns a ZWJ emoji cell using double-width graphemes", () => {
    const input = lines(
      "| Name | Note |",
      "| ---- | ---- |",
      `| ${ZWJ_FAMILY} | family |`,
      "| ordinary | plain |",
    );
    expect(alignMarkdownTables(input)).toBe(
      lines(
        "| Name     | Note   |",
        "| -------- | ------ |",
        `| ${ZWJ_FAMILY}${" ".repeat(6)} | family |`,
        "| ordinary | plain  |",
      ),
    );
  });

  test("keeps escaped pipes and delimiter alignment colons", () => {
    const input = lines("| A \\| B | C |", "| :--- | ---: |", "| x | y |");
    expect(alignMarkdownTables(input)).toBe(
      lines("| A \\| B | C   |", "| :----- | --: |", "| x      | y   |"),
    );
  });

  test("is idempotent", () => {
    const once = alignMarkdownTables(moduleTable("a"));
    expect(alignMarkdownTables(once)).toBe(once);
  });
});

describe("displayWidth", () => {
  test("counts ASCII as one column", () => {
    expect(displayWidth("justfile")).toBe(8);
  });

  test("counts CJK as two columns", () => {
    expect(displayWidth("漢字")).toBe(4);
  });

  test("counts an emoji ZWJ sequence as one double-width cluster", () => {
    expect(displayWidth(ZWJ_FAMILY)).toBe(2);
  });

  test("counts a mixed string by cluster", () => {
    expect(displayWidth(`a漢${ZWJ_FAMILY}b`)).toBe(1 + 2 + 2 + 1);
  });
});

describe("SDK lint pin (CTX-0017)", () => {
  test("PLUGIN_SDK_REF is a full 40-character commit SHA", () => {
    expect(PLUGIN_SDK_REF).toMatch(/^[0-9a-f]{40}$/);
  });

  test("template package.json and lockfile carry the SDK ref placeholder", () => {
    const manifest = templateFile("package.json");
    const lockfile = templateFile("bun.lock");
    expect(manifest).toContain(
      '"bitty-plugin-sdk": "github:bitty-terminal/bitty-plugin-sdk#@@PLUGIN_SDK_REF@@"',
    );
    expect(lockfile).toContain("#@@PLUGIN_SDK_REF@@");
    expect(manifest).toContain('"luaparse": "0.3.1"');
  });

  test("template lockfile resolves the pinned SDK commit", () => {
    expect(lockfileTupleMatches(templateFile("bun.lock"))).toBe(true);
  });

  test("lockfile guard rejects a stale resolved commit", () => {
    const short = PLUGIN_SDK_REF.slice(0, 7);
    const resolved =
      `bitty-plugin-sdk@github:bitty-terminal/bitty-plugin-sdk#${short}` +
      ` bitty-terminal-bitty-plugin-sdk-${short}`;
    expect(lockfileTupleMatches(resolved)).toBe(true);
    expect(lockfileTupleMatches(resolved.replaceAll(short, "deadbee"))).toBe(
      false,
    );
  });

  test("refresh-sdk-pin round-trips the placeholder", () => {
    const manifest = templateFile("package.json");
    const lockfile = templateFile("bun.lock");
    expect(applyPin(manifest)).toContain(PLUGIN_SDK_REF);
    expect(applyPin(manifest)).not.toContain(PLACEHOLDER);
    expect(restorePlaceholder(applyPin(manifest))).toBe(manifest);
    expect(restorePlaceholder(applyPin(lockfile))).toBe(lockfile);
  });

  test("the transitional manifest validator is gone", () => {
    expect(
      existsSync(
        new URL("../template/scripts/validate-manifest.mjs", import.meta.url),
      ),
    ).toBe(false);
  });
});
