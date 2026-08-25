# Bitty Plugin Template

This repository is the future home of a reproducible starting point for Bitty
plugin projects. It is currently unborn and pre-implementation: governance
files exist, but there is no initial commit or usable template.

## Ownership boundary

This repository will own template source, clean-generation evidence, and
template-specific contributor guidance after separately reviewed tasks
authorize them. It does not define the Bitty host, plugin API, SDK, capability
model, package format, compatibility policy, or release process.

Canonical product and plugin contracts belong to the
[bitty-docs repository](https://github.com/bitty-terminal/bitty-docs). The
[plugin-system specification](https://github.com/bitty-terminal/bitty-docs/blob/main/docs/extensibility/plugin-system.md)
and the
[security overview](https://github.com/bitty-terminal/bitty-docs/blob/main/docs/security/overview.md)
govern future scaffold work. SDK-specific implementation evidence will belong
to the
[bitty-plugin-sdk repository](https://github.com/bitty-terminal/bitty-plugin-sdk).

A future template must derive from accepted host and SDK contracts; generated
files cannot create or redefine those contracts.

## Current status

This repository does not currently provide:

- a usable plugin scaffold or generated project tree;
- a plugin manifest, package definition, or placeholder contract;
- source examples, tests, fixtures, or generated documentation;
- installation, initialization, or repository-generation commands;
- a public API or SDK compatibility promise;
- CI, publishing, update, migration, release, or distribution behavior.

Repository existence and a planned template boundary are not implementation,
compatibility, or release evidence.

## Safe-generation boundary

Future generation must be deterministic, validated from a clean durable
scratch location, and reviewed across both template source and generated output.
Generated plugins must use explicit least privilege, safe examples, bounded
inputs, and no embedded secrets, install-time execution, native in-process
escape, or ambient operating-system authority.

Any scaffold, manifest, example, workflow, package, or remote-repository action
requires a separately scoped task and independent review. This README creates
no local or remote project, publishes nothing, and authorizes no generation.
