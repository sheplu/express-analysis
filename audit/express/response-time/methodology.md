# response-time — audit methodology & reconciliation

## Protocol

1. Confirmed repo from issue #9; cloned `master` @ `3bd2651ea7fcf409ea780954e3113b3aaa0feb84` (v2.3.4) into `response-time/upstream/response-time`; installed runtime deps with `npm install --ignore-scripts --omit=dev` (depd@2.0.0, on-headers@1.1.0).
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`) following `.agent/skill/audit-nodejs-dependency/SKILL.md`; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`.
3. Orchestrator reconciliation: compared verdicts/findings; re-verified `index.js:16` (depd require-time activation) and `index.js:55` (per-request onHeaders) plus dep versions; merged into final report.

## Scope

- In scope: `index.js` (98 lines) + both runtime dependencies read in full.
- Out of scope: tests, docs, depd's browser entry.

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

Skill's six candidate groups over all three packages. Positive hits resolved to the two findings; loader-interception/bindings/prototype sweeps zero-hit.

## Node.js core files consulted (targeted)

- `$NODEJS_SOURCE/lib/internal/http/server.js:419-520` (`_implicitHeader` dispatch via `this.writeHead`; `writeHead` implementation and fast path)
- `$NODEJS_SOURCE/lib/internal/errors.js:136-163` (userland `Error.prepareStackTrace` contract)

## Runtime reproduction

- Node v24.19.0. Scripts: `pass-a/repro-onheaders.js`, `pass-a/repro-depd.js`, `pass-b/repro/repro.js` (+ output).
- Methods: instrumented `Error.prepareStackTrace`/`stackTraceLimit` accessors during require (write sequence + restoration captured); prototype-integrity snapshots across middleware exercise (prototypes unchanged; wrapper observed as instance own-property only).

## Key activation facts established

- depd's global write fires **at require time, every load, regardless of options** — deprecation logging is conditional, the write is not.
- on-headers' wrapper installs for **every** response through the middleware, no guards.

## Reconciliation outcome

- Verdicts identical: confirmed patching — 2 transitive findings, same sites/lines.
- Ledgers: A 14 / B 17 entries (B itemized negative sweeps); 0 unresolved. Disagreements: **none**.
- Cross-series consistency: F-001 identical in kind to compression's on-headers finding; F-002 identical to express/body-parser's depd finding.

## Limitations

- Node baseline is main; core line numbers commit-pinned (contracts stable across release lines).
- on-headers' pre-appendHeader fallback and depd's deprecation-fired re-entry statically traced only.
- Reproduction on a single Node version (v24.19.0).
