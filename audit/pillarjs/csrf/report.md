# Node.js patch audit: csrf

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: issue sheplu/express-analysis#29 (`csrf`, https://github.com/pillarjs/csrf)
- Library: csrf 3.1.0, git master @ `33536b89609ea7354aeae2c0720087f6ff77eaa4`, cloned repository with runtime dependencies installed (`--ignore-scripts --omit=dev`): rndm@1.2.0, tsscmp@1.0.6, uid-safe@2.1.5, random-bytes@1.0.0 (SHA-256 hashes of all five runtime files recorded in `pass-b/report.md`)
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (both passes; pass A with a no-library control run)
- Scope: production/runtime code — `index.js` plus the sole entrypoints of all four resolved runtime dependencies; all five runtime files read in full by both passes. Tests, docs, devDependencies, tsscmp's shipped test/ dir (unreachable from main) excluded.
- Coverage: source complete; runtime reproduction done (both passes); upstream checked (pillarjs/csrf issue search empty; suryagh/tsscmp#17)
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; **both passes reached the identical verdict**; 0 disagreements; key sites re-verified directly during reconciliation.

## Patching verdict

csrf does **not** patch or monkeypatch Node.js core, directly or through its runtime dependencies. The package is a pure crypto consumer: `Tokens.prototype.*` methods live on a library-owned plain constructor (`index.js:45`, inherits only `Object.prototype`); all crypto interaction is read-only calls (`createHash` at `index.js:151-159`, `createHmac`, `randomBytes`, `timingSafeEqual` feature-detect at `tsscmp/lib/index.js:17`).

The one subtle candidate both passes isolated and rejected with a control experiment: `random-bytes/index.js:21` reads `crypto.randomBytes === crypto.pseudoRandomBytes` at init, and tsscmp later *calls* `crypto.pseudoRandomBytes(32)`. The first **read** flips that property's descriptor from accessor to data — but that is Node core's **own** lazy deprecated-alias materialization (`getRandomBytesAlias`, `$NODEJS_SOURCE/lib/crypto.js:309-340,387`; DEP0115), and the resolved value is reference-identical to pristine `crypto.randomBytes`. Core-owned mechanism triggered by a read; not a library patch.

0 confirmed patches; 0 unresolved candidates; groups 4/5/6 (patch keywords, loader interception, internals/bindings) zero-hit; no install scripts anywhere in the tree.

## Confirmed Node.js patches

None. No candidate survived verification.

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (11 entries), `pass-b/candidates.md` (11 entries) — same sites, all rejected, none unresolved:

| ID | Site and core target | Status | Reason |
| --- | --- | --- | --- |
| R-01 | `index.js:79-124` `Tokens.prototype.{create,secret,secretSync,verify,...}` assignments | rejected | library-owned plain constructor (`index.js:45`); no core class involved |
| R-02 | `index.js:151-159` `crypto.createHash('sha1').update(...).digest(...)` | rejected | read-only call chain |
| R-03 | `tsscmp/lib/index.js:17-18` `if (crypto.timingSafeEqual)` | rejected | feature-detect **read**; byte-loop fallback stays module-local, never installed onto crypto |
| R-04 | `tsscmp/lib/index.js:31` `crypto.pseudoRandomBytes(32)` | rejected | deprecated-API (DEP0115) **call**, not a write; supporting context |
| R-05 | `random-bytes/index.js:21` `crypto.randomBytes === crypto.pseudoRandomBytes` init read | rejected | triggers core's **own** lazy alias getter (`$NODEJS_SOURCE/lib/crypto.js:309,387`) which self-redefines accessor→data; resolved value `===` pristine `randomBytes`; proven core-owned via no-library control run and isolated `lazy-alias-note.js` repro |
| R-06 | rndm `Math.random` usage | rejected | read/call only |
| R-07 | uid-safe/random-bytes promise/callback wrappers, `global.Promise`/`setTimeout` references | rejected | reads/calls; own-export writes only |
| R-08 | `Buffer.byteLength` and remaining dep interactions | rejected | read-only; entrypoints individually checked |

## Supporting context

- **Deprecated API usage to track:** tsscmp's fallback key generation calls `crypto.pseudoRandomBytes` (DEP0115, runtime-deprecated alias of `randomBytes`). If Node ever removes the alias, `tsscmp.timeSafeCompare` — and csrf's `verify()` with it — throws at call time. This is csrf's only realistic Node.js-change exposure (upstream: suryagh/tsscmp#17).
- The lazy-alias descriptor flip observed when anything first touches `crypto.pseudoRandomBytes` is core behavior any auditor will trip over — documented here (with the control-run proof) so future audits don't misattribute it to a library.
- tsscmp's pre-6.6.0 byte-loop compare fallback is module-local and dead on supported Node.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| 5 runtime files (full read) | skill's six candidate pattern groups + core-namespace-assignment/delete-descriptor sweeps (logs: `pass-a/searches.md`, `pass-b/searches.md`) | groups 4/5/6 zero hits; all other hits ledgered and rejected |
| `$NODEJS_SOURCE/lib/crypto.js:304-340,387` | direct read at `d44625a4b80` | lazy deprecated-alias mechanism (`getRandomBytesAlias`) — core-owned; baseline for R-05 |
| Reproduction | `node pass-a/verify-no-mutation.js "$PACKAGE_ROOT"` (with control run); `node pass-b/repro/snapshot-diff.js "$PACKAGE_ROOT"` + `repro/lazy-alias-note.js` (Node v24.19.0) | 15/15 identity checks intact (createHash/createHmac/randomBytes/pseudoRandomBytes/timingSafeEqual, Hash + prototype methods, Math.random, Object.assign, Module._*, process.binding, Promise, setTimeout); 0 descriptor/prototype/global/require.extensions diffs; require.cache grew by exactly the 5 library files; "NO CORE MUTATION OBSERVED" |
| Upstream | pillarjs/csrf issues (empty for patching); suryagh/tsscmp#17 | corroborate the pseudoRandomBytes dependence |

## Coverage and limitations

- Legacy branches not executed on v24.19.0 (tsscmp pre-6.6.0 loop; random-bytes `generateAttempts === 1`/3-attempt retry) — statically verified write-free.
- Node core reading limited to targeted `lib/crypto.js` sections per the skill.
- Repro on one runtime version; static proof suffices for all claims.
- Note: the pillarjs/csrf repo is active (not archived); version pinned to the clone.

## Changes since the previous audit

First audit of csrf in this workspace.
