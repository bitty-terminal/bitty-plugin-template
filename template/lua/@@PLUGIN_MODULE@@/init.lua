-- Entry point for @@PLUGIN_NAME@@ (@@PLUGIN_ID@@).
--
-- The host evaluates this file once per plugin activation and owns every
-- resource created here for the lifetime of that generation.
--
-- The `bitty` namespace below is the accepted Plugin API v1 surface, frozen
-- on the SDK generation pipeline (bitty-plugin-sdk #108): per-namespace host
-- parity from bitty #1303, where `keymaps` and `tasks` are WIRED bridge
-- captures while `services` and `env` are DEFERRED and fail closed with typed
-- `E_NOT_IMPLEMENTED` (runtime); `process.spawn` is v1-OUT and has no entry
-- point. The authoritative Lua bindings are the SDK `bitty.d.lua` (R-SDK-1);
-- do not use surface that contract does not define.
--
-- Capabilities used here must match `bitty-plugin.toml`: the notification
-- below is covered by the single `platform.notify` request. No other ambient
-- authority (filesystem, process, network, clipboard, terminal input) is
-- granted or assumed.

local M = {}

-- Command `id` is a plugin-local short segment; the host assembles the
-- qualified `<plugin-id>:<resource>` name from the `[lazy].commands`
-- reservation in `bitty-plugin.toml`. Pass the short `id` here, never the
-- qualified name; duplicate qualified names are rejected at graph
-- construction time instead of shadowing another plugin.
bitty.commands.register({
  id = "hello",
  title = "@@PLUGIN_NAME@@: hello",
  description = "Print a greeting from @@PLUGIN_NAME@@.",
  run = function()
    bitty.notify.show({
      title = "@@PLUGIN_NAME@@",
      body = "Hello from @@PLUGIN_ID@@.",
    })
  end,
})

-- WIRED follow-ups (safe to enable; no extra capability needed):
-- `keymaps.suggest` never overrides user or workspace mappings, and
-- `tasks.spawn`/`timers.create` are generation-owned on the host scheduler.
-- bitty.keymaps.suggest({
--   chord = "ctrl+shift+h",
--   command = "@@PLUGIN_ID@@:hello",
--   when = "global",
-- })
-- bitty.tasks.spawn(function() end)

-- DEFERRED namespaces (typed stubs; every call fails closed with
-- `E_NOT_IMPLEMENTED` (runtime) until the host backends land, so these stay
-- commented out in the runnable example):
-- bitty.services.provide("@@PLUGIN_ID@@.greeter", {
--   hello = function()
--     return "hi"
--   end,
-- })
-- local service = bitty.services.get("example.greeter", { version = ">=1.0.0", optional = true })
-- if service ~= nil then
--   print(service.hello)
-- end
-- if bitty.env then
--   print(bitty.env.has("EDITOR"), bitty.env.get("EDITOR"))
-- end

return M
