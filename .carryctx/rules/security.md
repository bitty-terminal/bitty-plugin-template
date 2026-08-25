# Security rules

1. Review template source and clean generated output; a safe source file does
   not excuse unsafe generated defaults.
2. Generated plugins use explicit least-privilege capabilities. Do not include
   ambient filesystem, process, network, clipboard, terminal-input, or host-
   management authority.
3. Plugins may alter presentation but not Terminal Truth. Do not scaffold parser,
   render, or input hot-path access, native in-process escapes, or unrestricted
   runtime libraries.
4. Installation executes no package code. Generated setup must not require
   install scripts, allow-all switches, or silent privilege expansion.
5. Validate and bound names, placeholders, paths, manifests, configuration,
   structured content, and other attacker-controlled generation inputs.
6. Generated CI minimizes permissions, isolates untrusted pull requests, protects
   secrets, validates release identity, and follows dependency pinning policy.
7. Examples, logs, fixtures, and generated files contain no credentials or
   sensitive local data.
8. Security-sensitive changes require canonical threat/risk synchronization,
   adversarial clean-generation tests, and independent security review.
9. Exact mechanisms and thresholds may remain open only when the normative
   control itself remains mandatory.
