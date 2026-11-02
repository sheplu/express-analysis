# serve-index — audit methodology & reconciliation

## Protocol

1. Confirmed repo from issue #18; cloned `master` @ `fc0c0abd890e79c3f16b0ea9cf49551b3ee66ecb` (v1.9.2) into `serve-index/upstream/serve-index`; installed runtime deps with `npm install --ignore-scripts --omit=dev` (15 packages; older generation: http-errors@1.8.1, depd@1.1.2, debug@2.6.9).
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`) following `.agent/skill/audit-nodejs-dependency/SKILL.md`; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`.
3. Orchestrator reconciliation: compared verdicts/ledgers; re-verified dep versions, the `index.js:17` http-errors chain, `batch/index.js:49-53`, and `debug/src/node.js:200-208`; adjudicated the one divergence; merged into final report.

## Scope

- In scope: `index.js` (692 lines) + all 15 runtime dependencies' entry/init paths (`batch@0.6.1` read in full).
- Out of scope: tests, docs; `public/` assets (read-only runtime data); browser-field variants.

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

Skill's six candidate groups over the tree. The global-mutation sweep surfaced depd; the prototype sweep surfaced batch's own-prototype wiring (rejected); loader/bindings sweeps otherwise negative (one `process.binding('tty_wrap')` read in debug's env-gated path).

## Node.js core files consulted (targeted)

- `$NODEJS_SOURCE/lib/internal/errors.js:136-170` (`Error.prepareStackTrace` install/honor contract)
- `lib/_http_incoming.js` member inventory (no `_parsedUrl`)
- `lib/events.js` (lazy `_events` init — makes batch's constructor-less inheritance safe)
- `lib/fs.js` (SyncWriteStream removal — kills debug's FILE branch)

## Runtime reproduction

- Node v24.19.0 (pass B `repro-error-swap.js`; pass A `repro/check-core-globals.js`, also run on v26.13.0).
- Observed: exactly 3 depd swap/restore cycles (6 writes) at bare require; full restoration; no permanent core diffs. `Error.stackTraceLimit` verified by before/after value (V8 rejects accessor instrumentation on it).

## Reconciliation outcome

- F-001 (depd): identical in both passes — same sites, same 3-cycle count, same upstream citations (depd#32/#36).
- **Divergence (1):** debug@2.6.9's `DEBUG_FD` stream mutations — pass A proposed as an env-gated instance-override finding (F-002); pass B rejected as writes to debug-created, debug-owned streams. **Adjudication: supporting context, not confirmed.** Rationale: (a) the mutated object is created and owned by the library, not core-handed shared state — matching the series' express/busboy precedent for library-owned instances; (b) identical code in the same debug version was classified rejected in the compression and morgan audits — cross-series consistency; (c) env-gated, inert by default, FILE branch dead on modern Node. The site remains fully documented in findings.md.
- Ledgers: A 22 / B 23 entries; 0 unresolved.
- Cross-series consistency: depd = 8th occurrence (2nd on the 1.x line with compat-layer extra cycles).

## Limitations

- debug `DEBUG_FD` branch static-only (env-gated; partially broken on modern Node).
- depd log-time re-swap unreachable from serve-index's own non-deprecated usage.
- Upstream published line offsets may differ slightly from installed artifacts (pass A pinned by SHA-256).
