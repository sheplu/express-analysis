# body-parser — audit methodology & reconciliation

## Protocol

1. Confirmed repo from issue #5; cloned `master` @ `151a0d9e72682662fd32b439da4693b4459a70b3` (v2.4.0) into `body-parser/upstream/body-parser`; installed runtime deps with `npm install --ignore-scripts --omit=dev` (37 top-level packages, 39 incl. nested).
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`) following `.agent/skill/audit-nodejs-dependency/SKILL.md`; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`.
3. Orchestrator reconciliation: compared verdicts/ledgers; re-verified the activation chain (`lib/read.js:14` → `http-errors/index.js:15` → `depd/index.js:382-396`) and `req.body` sites directly; merged into final report.

## Scope

- In scope: `index.js`, `lib/**` (read in full), every resolved runtime dependency's entry/init path; high-risk deps read in full (iconv-lite, raw-body, unpipe, on-finished, qs + side-channel family, http-errors, setprototypeof, get-intrinsic/es-* family, safer-buffer, debug, depd).
- Out of scope: tests/examples/docs; browser bundles (qs dist, debug browser entry) — swept anyway, not loaded by Node resolution.

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

Skill's six candidate groups over package + tree-wide write-pattern sweeps. The patch-vocabulary sweep surfaced on-finished's `patchAssignSocket`; the global sweep surfaced depd's `Error.*` writes; loader-interception sweep: zero hits tree-wide.

## Node.js core files consulted (targeted)

- `$NODEJS_SOURCE/lib/internal/errors.js:136-161` (core's consultation of `Error.prepareStackTrace` — documented hook semantics)
- `$NODEJS_SOURCE/lib/internal/http/server.js:312` (`assignSocket` baseline for the on-finished latent pattern)
- HTTP IncomingMessage construction (socket set at construction — rules out the on-finished guard)

## Runtime reproduction

- Node v24.19.0; scripts beside pass reports (`pass-a/` 2 scripts, `pass-b/repro-error-hook-write.js`).
- Method: instrumented `Error.prepareStackTrace`/`stackTraceLimit` accessors during `require('body-parser')` → exactly two writes captured; un-instrumented control confirmed both values restored on the normal path.

## Reconciliation outcome

- Verdicts identical: confirmed patching — 1 transitive transient shared-global mutation (depd), same sites/lines/chain.
- Both passes **independently** recorded the same calibration nuance (documented assignable hook + save/restore could read as supported extension use) and both still counted it confirmed — consistent with the express audit's treatment of the identical mechanism.
- Both passes independently rejected on-finished's `patchAssignSocket` as unreachable through body-parser with the same reasoning.
- Ledgers: A 28 / B 24 entries, same substance; 0 unresolved. Disagreements: **none**.
- Orchestrator spot-check matched all claims (chain, depd sites, req.body lines, dep versions: depd 2.0.0, http-errors 2.0.1).

## Limitations

- Reproduction on Node v24.19.0 only.
- Legacy/browser fallbacks excluded by guard analysis, not execution.
- Node baseline is main; release-line layout differs (`lib/_http_server.js` vs `lib/internal/http/server.js`) without affecting conclusions.
