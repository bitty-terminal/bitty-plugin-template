import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  PLUGIN_SDK_REF,
  alignMarkdownTables,
  displayWidth,
} from "./generate-plugin.mjs";
import {
  DEFERRED_FUNCTIONS,
  FROZEN_SDK_REF,
  WIRED_NAMESPACES,
  checkTree,
} from "./check-template-sdk-sync.mjs";
import {
  PLACEHOLDER,
  SDK_REF_DECLARATION,
  applyPin,
  justfileDeclaresSdkRef,
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

  test("template justfile declares the SDK ref placeholder once", () => {
    const justfile = templateFile("justfile");
    expect(justfile).toContain(SDK_REF_DECLARATION);
    expect(justfile.split(PLACEHOLDER).length - 1).toBe(1);
    expect(justfileDeclaresSdkRef(justfile)).toBe(true);
    expect(justfile).toContain(
      "bunx --bun --package github:bitty-terminal/bitty-plugin-sdk#{{ sdk_ref }} bitty-plugin-lint bitty-plugin.toml",
    );
  });

  test("template justfile runs a Lua 5.4 parse gate with a fail-closed control", () => {
    const justfile = templateFile("justfile");
    expect(justfile).toContain('luac := env("LUAC", "luac5.4")');
    expect(justfile).toMatch(/^lua:$/m);
    expect(justfile).toMatch(/^lua-control:$/m);
    expect(justfile).toMatch(/^check: manifest lua lua-control$/m);
    expect(justfile).not.toMatch(/^(install|deps):/m);
    expect(justfile).not.toContain("luaparse");
    expect(justfile).not.toContain("node_modules");
  });

  test("sdk_ref guard rejects a missing or concrete declaration", () => {
    expect(justfileDeclaresSdkRef('sdk_ref := "@@PLUGIN_SDK_REF@@"')).toBe(
      true,
    );
    expect(justfileDeclaresSdkRef(`sdk_ref := "${PLUGIN_SDK_REF}"`)).toBe(
      false,
    );
    expect(
      justfileDeclaresSdkRef(`sdk_ref := "${PLUGIN_SDK_REF}"`, PLUGIN_SDK_REF),
    ).toBe(true);
    expect(justfileDeclaresSdkRef('# sdk_ref := "@@PLUGIN_SDK_REF@@"')).toBe(
      false,
    );
  });

  test("generated tree is Lua only (no JS/TS package files)", () => {
    for (const file of [
      "package.json",
      "bun.lock",
      "bun.lockb",
      "package-lock.json",
      "tsconfig.json",
    ]) {
      expect(existsSync(new URL(`../template/${file}`, import.meta.url))).toBe(
        false,
      );
    }
  });

  test("refresh-sdk-pin round-trips the placeholder", () => {
    const justfile = templateFile("justfile");
    expect(applyPin(justfile)).toContain(PLUGIN_SDK_REF);
    expect(applyPin(justfile)).not.toContain(PLACEHOLDER);
    expect(restorePlaceholder(applyPin(justfile))).toBe(justfile);
  });

  test("the transitional manifest validator is gone", () => {
    expect(
      existsSync(
        new URL("../template/scripts/validate-manifest.mjs", import.meta.url),
      ),
    ).toBe(false);
  });
});

describe("Template/SDK sync (CTX-0036)", () => {
  test("PLUGIN_SDK_REF tracks the frozen generation pipeline", () => {
    expect(FROZEN_SDK_REF).toMatch(/^[0-9a-f]{40}$/);
    expect(PLUGIN_SDK_REF).toBe(FROZEN_SDK_REF);
  });

  test("the frozen pipeline covers 2 deferred stubs and 3 wired namespaces", () => {
    expect([...DEFERRED_FUNCTIONS].sort()).toEqual(["env.get", "env.has"]);
    expect([...WIRED_NAMESPACES].sort()).toEqual([
      "keymaps",
      "services",
      "tasks",
    ]);
  });

  test("checkTree agrees with this repository (offline)", () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    expect(checkTree(root)).toEqual([]);
  });

  test("checkTree fails closed on a missing tree instead of skipping", () => {
    const problems = checkTree(
      fileURLToPath(new URL("../does-not-exist", import.meta.url)),
    );
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join("\n")).toContain("missing");
  });
});
