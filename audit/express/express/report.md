# Node.js patch audit: express

- Verdict: **confirmed patching — instance/application overrides only** (no shared Node.js core prototype, core API, global, or module-loading mutation)
- Status: complete
- Input: issue sheplu/express-analysis#1 (`express`, https://github.com/expressjs/express)
- Library: express 5.3.0, git master @ `1c6f1b0fe4000977b9a7b4f34097e4d527dd9824`, cloned repository with runtime dependencies installed (`--ignore-scripts --omit=dev`)
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (both passes ran before/after prototype-descriptor snapshots)
- Scope: production/runtime code (`index.js`, `lib/**`) plus all 63 resolved runtime dependencies (entrypoint/init checked; ~19 non-trivial ones read in detail). Tests, examples, benchmarks, docs excluded. User-supplied template engines/middleware out of scope.
- Coverage: source complete; upstream corroborated (expressjs/express#6039, #7427); runtime reproduction done on one Node version
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; **both passes reached the identical verdict and identical findings**; finding sites re-verified directly during reconciliation.

## Patching verdict

Express does **not** mutate any shared Node.js core object: no writes to `http.IncomingMessage.prototype`, `http.ServerResponse.prototype`, any other core prototype, core module exports, or lasting globals, and no module-loading interception anywhere in the package or its resolved runtime dependency tree. Reproduction snapshots confirmed core prototype descriptor sets are byte-identical after `require('express')` plus a full request cycle.

What express does do, counted separately per the skill's categories:

- 1 direct **instance/application override** (F-001): per-request `[[Prototype]]` replacement on live core-created `req`/`res` objects.
- 1 transitive **transient shared-global mutation** (F-002, via `depd`): synchronous save/restore swap of `Error.prepareStackTrace` / `Error.stackTraceLimit`.

No unresolved candidates remain in either pass.

## Confirmed Node.js patches

### F-001: `Object.setPrototypeOf(req/res, express layer)` — per-request prototype rewiring of core HTTP instances

- Category: instance/application override (core-backed instances; shared core prototypes untouched)
- Library site(s): `$PACKAGE_ROOT/lib/application.js:169-170` (every request); restore-to-parent-layer for mounted sub-apps at `$PACKAGE_ROOT/lib/application.js:233-234`; layer prototypes built at `$PACKAGE_ROOT/lib/request.js:30`, `$PACKAGE_ROOT/lib/response.js:43`, wired per-app in `$PACKAGE_ROOT/lib/express.js:45-52`
- Origin: direct
- Core baseline: instances created by `$NODEJS_SOURCE/lib/internal/http/common.js:94-97` and `$NODEJS_SOURCE/lib/internal/http/server.js:1375` with `http.IncomingMessage.prototype` / `http.ServerResponse.prototype`
- Exact mutation: `Object.setPrototypeOf(req, this.request)` / `Object.setPrototypeOf(res, this.response)` — each message's `[[Prototype]]` is replaced with an express-owned object that itself inherits from the original core prototype (`Object.create(http.IncomingMessage.prototype)` / `...ServerResponse.prototype`)
- Execution chain: `app.handle` → prototype swap → router dispatch; sub-app mounting swaps again and restores the parent layer on completion
- Activation: unconditional on every request handled by an express app; production code path
- Scope and restoration: per-instance, permanent for each message's lifetime; core prototypes and other servers' messages unaffected
- Resulting behavior: express request/response methods become available on the instances; both passes verified the express layers **shadow zero core prototype property names** (purely additive), so core behavior is unchanged, but any future Node.js change that caches/depends on instance `[[Prototype]]` identity, or adds a core method whose name collides with an express method, would interact with this rewiring
- Evidence: static (sites above, re-verified at reconciliation); reproduction scripts `pass-a/repro-proto-check.js`, `pass-b/repro-core-mutation-check.js` (core descriptor sets identical before/after; instance protos swapped)
- Upstream: Node's documented `createServer({IncomingMessage, ServerResponse})` extension point exists but express does not use it (expressjs/express#6039, #7427 discuss the approach)

### F-002: transient swap of `Error.prepareStackTrace` / `Error.stackTraceLimit` (via depd)

- Category: shared global mutation, transient (save → mutate → synchronous restore)
- Library site(s): `node_modules/depd/index.js:386-387` (write), `:395-396` (restore), inside `getStack()`
- Origin: transitive — express → depd@2.0.0 (also reached via router and http-errors)
- Core baseline: V8/Node `Error.prepareStackTrace` global hook (default undefined), `Error.stackTraceLimit` (default 10)
- Exact mutation: `Error.prepareStackTrace = prepareObjectStackTrace; Error.stackTraceLimit = Math.max(10, limit)`; both restored to saved values after `Error.captureStackTrace`
- Execution chain: `require('express')` → `lib/response.js:17` (`deprecate` creation) → depd `getStack()`; also on each deprecation log
- Activation: fires at import time and on deprecation warnings; production code path
- Scope and restoration: process-global but synchronous; restored before any other code runs (single-threaded); no observable effect on other consumers (verified at runtime by both passes)
- Resulting behavior: momentary replacement of the global stack-trace formatter; a future Node/V8 change making `prepareStackTrace` capture asynchronous or cached could expose the swap
- Evidence: static sites re-verified; pass A additionally proved reachability by instrumented crash inside depd at import
- Upstream: standard depd implementation, widely deployed

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (C-001..C-045), `pass-b/candidates.md` (C-001..C-040). ~40 candidates rejected per pass, 0 unresolved. Key rejections (agreed by both passes):

| ID | Site and core target | Status | Reason |
| --- | --- | --- | --- |
| R-01 | on-finished@2.4.2 `index.js:189-199`, wraps instance `res.assignSocket`/`removeSocket` | rejected as reachable patch | Node ≤0.8 workaround; guard `msg.socket === undefined` unreachable — `OutgoingMessage` initializes `socket` to `null` (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:187`) |
| R-02 | once@1.4.0 `once.js:5-19`, `Function.prototype.once/onceStrict` defineProperty | rejected | only inside opt-in `once.proto()`, never called anywhere in the runtime tree |
| R-03 | safer-buffer `process.binding('buffer')` | rejected | private API read only, no write |
| R-04 | req/res instance property writes (`req.body`, `req.params`, `req._parsedUrl`, `res.locals`, `msg.__onFinished`, `req.url` rewriting in router) | rejected as patches | library/application metadata on instances; no core behavior replaced |
| R-05 | setprototypeof / dunder-proto fallbacks | rejected | fallback shims for ancient engines; `dunder-proto/set` never imported |
| R-06 | module-loading interception (require.cache, Module._load, loader hooks) | negative | zero hits across package + dependency tree |

## Supporting context

- Express layers its own `req`/`res` objects **on top of** core prototypes via ordinary `Object.create` inheritance — the supported pattern — rather than editing core prototypes; the only unsupported-ish aspect is swapping instance `[[Prototype]]` at request time instead of using the documented `createServer` constructor options.
- Ancient-Node compatibility branches (on-finished, setprototypeof) were assessed statically; they cannot activate on any Node version express 5 supports (>= 18).
- `debug.enable` can write an env var when opted in; not a core patch.

Reconciliation note: passes A and B were fully blind and reached identical verdicts, identical findings (same sites/lines), and consistent rejection reasoning. No disagreements required adjudication. Orchestrator independently re-read all finding sites in the cloned source before finalizing.
