import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

import {
  checkActivation,
  checkDiscovery,
  entryPoint,
  manifestId,
  moduleRootFor,
} from "./verify-host-integration.mjs";

/** Manifest body for `id` with one lazy command reservation. */
function manifest(id) {
  return `[plugin]\nid = "${id}"\nname = "Fixture"\nversion = "0.1.0"\ndescription = "Host integration fixture."\n\n[lazy]\ncommands = ["${id}:hello"]\n`;
}

/** Create a scratch package tree; the caller removes it. */
function fixture({
  id = "example.hello",
  entry = "nested",
  extraFiles = [],
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "bitty-verify-host-"));
  writeFileSync(join(root, "bitty-plugin.toml"), manifest(id));
  if (entry === "nested") {
    const module = id.split(".").at(-1);
    mkdirSync(join(root, "lua", module), { recursive: true });
    writeFileSync(join(root, "lua", module, "init.lua"), "return {}\n");
  } else if (entry === "direct") {
    mkdirSync(join(root, "lua"), { recursive: true });
    writeFileSync(join(root, "lua", "init.lua"), "return {}\n");
  } else if (entry === "none") {
    mkdirSync(join(root, "lua"), { recursive: true });
  }
  for (const relative of extraFiles) {
    const path = join(root, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "binary");
  }
  return root;
}

describe("manifestId", () => {
  test("reads the [plugin] id", () => {
    expect(manifestId(manifest("example.hello"))).toBe("example.hello");
  });

  test("returns null when the id field is absent", () => {
    expect(manifestId('[plugin]\nname = "No id"\n')).toBeNull();
  });

  test("returns null when id is in another section (TPL-002)", () => {
    const body = '[plugin]\nname = "Test"\n\n[dependencies]\nid = "wrong.id"\n';
    expect(manifestId(body)).toBeNull();
  });

  test("reads quoted plugin id correctly", () => {
    const body = '[plugin]\nid = "owner.plugin-name"\nname = "Test"\n';
    expect(manifestId(body)).toBe("owner.plugin-name");
  });

  test("returns null on malformed TOML", () => {
    expect(manifestId('[plugin\nid = "broken')).toBeNull();
  });
});

describe("moduleRootFor (mirrors the host)", () => {
  test("prefers lua/ when present", () => {
    const root = fixture();
    try {
      expect(moduleRootFor(root)).toBe(join(root, "lua"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("falls back to the package root without lua/", () => {
    const root = mkdtempSync(join(tmpdir(), "bitty-verify-host-"));
    try {
      writeFileSync(join(root, "bitty-plugin.toml"), manifest("example.hello"));
      writeFileSync(join(root, "init.lua"), "return {}\n");
      expect(moduleRootFor(root)).toBe(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("entryPoint (mirrors the host)", () => {
  test("resolves the generated nested lua/<module>/init.lua shape", () => {
    const root = fixture({ entry: "nested" });
    try {
      const entry = entryPoint(join(root, "lua"), "example.hello");
      expect(entry?.shape).toBe("nested");
      expect(entry?.path).toBe(join(root, "lua", "hello", "init.lua"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("resolves the direct <module_root>/init.lua shape", () => {
    const root = fixture({ entry: "direct" });
    try {
      const entry = entryPoint(join(root, "lua"), "example.hello");
      expect(entry?.shape).toBe("direct");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("returns null when no entry exists", () => {
    const root = fixture({ entry: "none" });
    try {
      expect(entryPoint(join(root, "lua"), "example.hello")).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("generated-package host integration gate (issue #67)", () => {
  test("discovery and activation both pass on the generated layout", () => {
    const root = fixture();
    try {
      const discovery = checkDiscovery(root, "example.hello");
      expect(discovery.pluginId).toBe("example.hello");
      const activation = checkActivation(
        discovery.moduleRoot,
        discovery.pluginId,
      );
      expect(activation.shape).toBe("nested");
      expect(readFileSync(activation.entryPath, "utf8").length).toBeGreaterThan(
        0,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("discovery passes while activation fails without an entry", () => {
    const root = fixture({ entry: "none" });
    try {
      const discovery = checkDiscovery(root, "example.hello");
      expect(discovery.pluginId).toBe("example.hello");
      expect(() =>
        checkActivation(discovery.moduleRoot, discovery.pluginId),
      ).toThrow(/no init\.lua entry point/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("discovery fails without a manifest", () => {
    const root = mkdtempSync(join(tmpdir(), "bitty-verify-host-"));
    try {
      expect(() => checkDiscovery(root)).toThrow(/no bitty-plugin\.toml/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("discovery fails on an id mismatch", () => {
    const root = fixture({ id: "example.other" });
    try {
      expect(() => checkDiscovery(root, "example.hello")).toThrow(
        /does not match expected/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("activation fails on native artifacts the host never loads", () => {
    const root = fixture({ extraFiles: ["lua/hello/native.so"] });
    try {
      const discovery = checkDiscovery(root, "example.hello");
      expect(existsSync(join(root, "lua", "hello", "native.so"))).toBe(true);
      expect(statSync(join(root, "lua", "hello", "native.so")).isFile()).toBe(
        true,
      );
      expect(() =>
        checkActivation(discovery.moduleRoot, discovery.pluginId),
      ).toThrow(/native artifacts/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
