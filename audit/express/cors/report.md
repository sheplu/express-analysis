# Node.js patch audit: cors

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: issue sheplu/express-analysis#2 (`cors`, https://github.com/expressjs/cors)
- Library: cors 2.8.6, git master @ `5317ebe670db2aaebc1d496eb5d33493deefb3ed`, cloned repository with runtime dependencies installed (`--ignore-scripts --omit=dev`)
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (pass B before/after identity+descriptor snapshots)
- Scope: production/runtime code (`lib/index.js`, 238 lines) plus both resolved runtime dependencies (`object-assign@4.1.1`, `vary@1.1.2`) — all three files read in full by both passes. Tests, examples, docs excluded.
- Coverage: source complete; runtime reproduction done (pass B); upstream issue search returned no relevant patching discussion
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; **both passes reached the identical verdict**; key sites re-verified directly during reconciliation.

## Patching verdict

cors does **not** patch or monkeypatch Node.js core, directly or through its runtime dependencies. It imports **no Node.js core module at all** — its only requires are `object-assign` and `vary` (`lib/index.js:5-6`). All interaction with core objects is documented consumer API usage on instances passed in by the host framework:

- `res.setHeader(...)` / `res.getHeader(...)` / `res.end()` — calls only, never assignments (core baselines `$NODEJS_SOURCE/lib/internal/http/outgoing.js:813/914/1289` never reassigned).
- `res.statusCode = options.optionsSuccessStatus` (`lib/index.js:178`) — the only write to a core-backed object in the whole scope; a documented settable per-instance data property (shadows the prototype default set at `$NODEJS_SOURCE/lib/internal/http/server.js:285`, consumed by `writeHead(this.statusCode)`). In-contract instance state, not an override.

0 confirmed patches; 0 unresolved candidates; zero hits for module-loading interception, internals/bindings access, global mutation, prototype writes, or inheritance from core classes anywhere in scope.

## Confirmed Node.js patches

None. No candidate survived verification; nothing is promoted from documented API usage.

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (13 entries), `pass-b/candidates.md` (12 entries) — same sites, slightly different granularity, all rejected, none unresolved. Key entries:

| ID | Site and core target | Status | Reason |
| --- | --- | --- | --- |
| R-01 | `lib/index.js:5-6` imports | rejected | only `object-assign` + `vary`; no core module imported |
| R-02 | `lib/index.js:153,179` `res.setHeader` | rejected | API call on passed instance; `OutgoingMessage.prototype.setHeader` never reassigned |
| R-03 | `lib/index.js:178` `res.statusCode = 204` | rejected | documented settable instance property, within contract |
| R-04 | `lib/index.js:180` `res.end()` | rejected | call only |
| R-05 | `lib/index.js:208,223` option writes | rejected | fresh library-owned options object |
| R-06 | `object-assign/index.js:9-11` prototype method refs | rejected | read-only aliases (`Object.prototype.hasOwnProperty` etc.) |
| R-07 | `object-assign/index.js:65` export | rejected | **ponyfill**, not polyfill: re-exports native `Object.assign` or own fallback; never assigns `Object.assign`/`Object.prototype` |
| R-08 | `object-assign` fallback branch | rejected | mutates only caller-provided target (always a fresh `{}` in cors); dead on modern Node anyway |
| R-09 | `vary/index.js:134-148` | rejected | duck-typed `getHeader`/`setHeader('Vary')` calls on the passed response; own-export writes only |
| R-10 | loader interception / internals / globals sweeps | negative | zero hits across the whole scope |

## Supporting context

- `vary` validates the response by duck-typing (`res.getHeader`/`res.setHeader` presence) — consumption, not modification.
- `object-assign`'s load-time `shouldUseNative()` feature detection operates on local throwaway objects only.
- Pass B runtime corroboration: after `require('cors')` and exercising both preflight (OPTIONS) and simple paths, no identity/descriptor change to HTTP prototypes, `Object.assign`, `Object`/`String` prototypes, `Module._load`, `require.extensions`, or `process.binding`; a real `ServerResponse` instance gained only `statusCode`/`statusMessage` own data properties.

Reconciliation note: passes A and B fully blind, identical verdict, consistent ledgers (13 vs 12 entries covering the same sites), zero disagreements. Orchestrator re-read `lib/index.js` (imports + preflight path), `object-assign/index.js` export logic, and `vary()` before finalizing.

Limitations: verdict pinned to cors 2.8.6 @ `5317ebe` with resolved deps `object-assign@4.1.1`/`vary@1.1.2` (semver ranges `^4`/`^1` could resolve differently elsewhere); `object-assign` pre-ES2015 fallback verified statically only (dead on supported Node; mutates nothing global either way).
