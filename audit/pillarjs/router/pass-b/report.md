# Node.js patch audit: router (pass B, blind)

- Verdict: **confirmed patching** — 1 transient shared-global mutation (transitive, via depd@2.0.0, fires at `require('router')` time) and 1 transient instance-level override of core-backed request state (direct: `req.url` rewrite with restoration machinery). No permanent mutation of any shared core prototype, global, or module loader.
- Status: complete
- Input: issue sheplu/express-analysis#30 — `router` (simple middleware-style router, pillarjs/router)
- Library: router@2.2.0, default branch `master` @ `098ea782ee6dadbedda778470a177ccd813c95a0`, git clone + `npm install --ignore-scripts --omit=dev`. Runtime tree at this head includes `lib/param.js`, `lib/symbols.js`, `lib/tracing.js` in addition to `lib/layer.js`/`lib/route.js`. No local changes.
- Node.js baseline: $NODEJS_SOURCE main @ `d44625a4b80c672215b469906ce583ce7eeeebaf`, read-only, targeted files only.
- Reproduction runtime: Node v24.19.0 (`node repro/repro.js "$PACKAGE_ROOT"`).
- Scope: production/runtime code only — `index.js`, `lib/{layer,param,route,symbols,tracing}.js`, and the resolved runtime dependency entrypoints debug@4.4.3, depd@2.0.0, is-promise@4.0.0, ms@2.1.3, parseurl@1.3.3, path-to-regexp@8.4.2. Tests, scripts/, eslint config, type files, devDependencies out of scope.
- Coverage: source — complete for the scope above (every dependency entrypoint read before exclusion, including path-to-regexp's shipped dist); upstream — bounded issue search done (depd#32, depd#36); runtime — repro complete with before/after snapshots and diffs.

## Patching verdict

Patching was demonstrated. Counts:

- **Shared core mutations: 1** (F-001) — transient, swap-and-restore, **transitive** (router → depd@2.0.0): `Error.prepareStackTrace` and `Error.stackTraceLimit` on the shared global `Error` constructor are replaced for the synchronous duration of depd's `getStack()`. It fires unconditionally **twice during `require('router')`** and again whenever a deprecation actually logs. On the audited Node runtime the swapped-out value is Node's own bootstrap-installed default (`ErrorPrepareStackTrace`), making this a replacement of a core-installed hook, not just of an empty slot.
- **Instance/application overrides: 1** (F-002) — transient, **direct**: router rewrites `req.url`, a core-defined and core-populated own property of `http.IncomingMessage` instances it does not own, during mount-prefix trimming, and restores it via its `removed`/`slashAdded`/`restore()` machinery. All other req writes (`baseUrl`, `params`, `next`, `originalUrl`, `route`, two tracing symbols, parseurl's `_parsedUrl`) add library-owned metadata and are classified as supporting context per the skill, not as patches.
- Unresolved candidates: none. Excluded branches limiting the verdict: browser-only files of debug/depd (never loaded on Node), depd's `wrapfunction`/`wrapproperty` (present but unreachable from router), and the `--enable-source-maps` interaction of F-001 (not re-reproduced here; documented upstream).

Runtime reproduction confirms the negative space: across before-require → after-require → after-exercise snapshots there were **zero** changes to `http.IncomingMessage/ServerResponse/OutgoingMessage.prototype`, `EventEmitter.prototype`, `Object/Array/String/Function.prototype`, `Object.assign`/`setPrototypeOf`/`defineProperty`, `Module._load`/`_resolveFilename`, `require.extensions`, `require.cache` builtin entries, `process.binding`, and `globalThis` own keys.

## Confirmed Node.js patches

### F-001: `Error.prepareStackTrace` / `Error.stackTraceLimit` transient swap by depd `getStack()`

- Category: shared core mutation (global `Error` constructor), transient swap-and-restore
- Library site(s): depd/index.js:381-399 (`getStack`: save at 382/384, swap at 386-387, restore at 395-396; custom hook `prepareObjectStackTrace` at 405-407); reached from $PACKAGE_ROOT via lib/param.js:9 and lib/layer.js:18 `require('depd')('router')` → depd/index.js:108. Upstream: https://github.com/dougwilson/nodejs-depd/blob/v2.0.0/index.js
- Origin: transitive — router@2.2.0 → depd@2.0.0 (direct dependency of router; two module-level call sites)
- Core baseline: `Error.prepareStackTrace`/`Error.stackTraceLimit` are the documented V8 stack-trace API on the shared global Error. On the audited Node baseline, core itself installs the default — $NODEJS_SOURCE lib/internal/bootstrap/realm.js:503-505 defines `Error.prepareStackTrace = ErrorPrepareStackTrace` (lib/internal/errors.js:168), and lib/internal/errors.js:149-150 routes every stack serialization through whatever function sits on `Error.prepareStackTrace`.
- Exact mutation: `Error.prepareStackTrace = prepareObjectStackTrace` (returns the raw CallSite array) and `Error.stackTraceLimit = Math.max(10, limit)`; both restored to the saved values after `Error.captureStackTrace(obj)` + one `obj.stack` read.
- Execution chain (require-time): `require('router')` → index.js:15 `require('./lib/param')` → lib/param.js:9 `require('depd')('router')` → depd/index.js:108 `getStack()` [swap #1]; then index.js:16 `require('./lib/layer')` → lib/layer.js:18 `require('depd')('router')` → depd/index.js:108 [swap #2]. Runtime re-fires: depd/index.js:199 `getStack()` inside `log()` whenever `deprecate()` actually logs — in this scope only when a handler or param callback returns a Promise-like that is not a native Promise (lib/layer.js:246-253, lib/param.js:18-22).
- Activation: unconditional at import; no guards. The deprecation-time path is conditional on deprecated usage (and on `process.noDeprecation`/listeners for output, though `log()` still runs `getStack()` when reached).
- Scope and restoration: process-wide (the global Error constructor shared by every module and by Node core) for a synchronous window; restored exactly (repro: final values identical to baseline, `function:ErrorPrepareStackTrace` / 10). No async interleaving is possible within the window, but any synchronous stack serialization triggered inside it (e.g. from another prepareStackTrace consumer, or Node's source-map decoration) sees depd's hook instead of the installed one.
- Resulting behavior: during the window, `error.stack` evaluation process-wide yields a raw CallSite array instead of the formatted string; `stackTraceLimit` is raised to at least 10. Historically interfered with `--enable-source-maps` (depd#36: `callSite.getFileName is not a function`).
- Evidence: static — depd/index.js:381-399 read in full; runtime — `repro/results.json` `trapEvents`: exactly 2 swap/restore cycles, all in phase `require(router)`, `from: function:ErrorPrepareStackTrace → to: function:prepareObjectStackTrace` and back, with the harness `captureStackTrace` probe observing `prepareObjectStackTrace` active mid-swap; zero trap events in any later phase. Corroborating side-proof: a first repro variant that defined `Error.stackTraceLimit` as an accessor crashed inside depd/index.js:393 during `require(router)` (V8 only honors a data-property stackTraceLimit), demonstrating at runtime that `getStack()` executes at require time.
- Upstream: dougwilson/nodejs-depd#32 "Why is this library overwriting Error type?" (closed — technique acknowledged, by design); dougwilson/nodejs-depd#36 (closed — `--enable-source-maps` breakage caused by the swap window). Node core uses the same save/raise/restore pattern internally ($NODEJS_SOURCE lib/internal/errors.js:181-188), which contextualizes the technique but does not change its classification: depd mutates the shared global from library code.

### F-002: `req.url` rewrite (mount-prefix trimming) on core `http.IncomingMessage` instances, with restoration machinery

- Category: instance override — mutation of core-populated state on core-backed instances the library does not own; transient (restore-on-dispatch-exit)
- Library site(s): $PACKAGE_ROOT index.js:337 (`req.url = protohost + req.url.slice(protohost.length + removed.length)` — trim), index.js:341-342 (`req.url = '/' + req.url`, `slashAdded = true` — forced leading slash), index.js:200-201 (slash removal), index.js:206-208 (`req.url = protohost + removed + req.url.slice(protohost.length)` — restore on re-entry to `next()`). https://github.com/pillarjs/router/blob/098ea782ee6dadbedda778470a177ccd813c95a0/index.js
- Origin: direct (router@2.2.0)
- Core baseline: $NODEJS_SOURCE lib/internal/http/incoming.js:95 — the IncomingMessage constructor defines `this.url = ''`; lib/internal/http/common.js:105 — the HTTP parser assigns the wire request-target to `incoming.url`. `url` is therefore a core-defined, core-populated, documented own data property, not a library expando.
- Exact mutation: the own data property `url` on each dispatched IncomingMessage is overwritten with the suffix remaining after the matched mount prefix (protohost preserved), optionally re-prefixed with `/`; the original value is reconstructed (not snapshotted) when control re-enters `next()` with `removed`/`slashAdded` pending.
- Execution chain: `router(req,res,next)` → `Router.prototype.handle` (index.js:150) → `next()` → `trimPrefix()` (index.js:318) for every matched `.use()` layer, including mounted sub-routers; restoration at the top of `next()` (index.js:198-209) before the next layer or the final callback.
- Activation: every dispatch through a path-mounted middleware/sub-router layer; production path, no guards.
- Scope and restoration: per-request instance only; shared prototypes untouched (repro diff empty). Fully restored when dispatch exits through the final callback (repro: `GET /nope` → `urlEqualsEntry: true`; error path `GET /boom` → url `/boom` in the error handler). Deliberately left trimmed while a handler that terminates the response runs (repro: in-handler url `/users/42`, baseUrl `/api`, wire url `/api/users/42`; still trimmed after `res.end()` in the same tick since `next()` is never re-entered).
- Resulting behavior: any consumer reading `req.url` during nested dispatch — including other middleware, loggers, APMs, or core-API users holding the same request object — observes a value different from what Node's parser produced. This is the documented Express/router mounting contract, but it is achieved by mutating core-owned instance state rather than a library-owned field (`req.baseUrl`/`req.originalUrl` exist precisely to compensate).
- Evidence: static — index.js:318-349 and 198-209 read in full; runtime — `repro/results.json` `exercise.paramRoute` and `exercise.unmatched404`.
- Upstream: behavior documented in $PACKAGE_ROOT README (mounting semantics); long-standing pillarjs/express design, no contrary upstream issue found in the bounded search.

## Candidate ledger and unresolved questions

Full ledger in `candidates.md` (C-001..C-018). Summary: 2 confirmed (C-001→F-001, C-002→F-002), 16 rejected, 0 unresolved.

| ID | Site and core target | Status | Reason (abridged) |
| --- | --- | --- | --- |
| C-001 | depd getStack — Error.prepareStackTrace/stackTraceLimit | confirmed -> F-001 | swap/restore at require time + on deprecation log |
| C-002 | index.js trimPrefix/next — req.url | confirmed -> F-002 | core-populated own property rewritten + restored |
| C-003 | Router/Route/Layer prototype definitions | rejected | library-owned constructors |
| C-004 | index.js:65 Object.setPrototypeOf(router, this) | rejected | call on library-owned function; API not replaced |
| C-005 | Array.prototype.slice/flat aliases | rejected | reads only |
| C-006 | req.baseUrl/next/params/originalUrl/route + 2 symbols | rejected | added metadata (expandos), restored by restore() |
| C-007 | OPTIONS res.setHeader x4 + res.end | rejected | documented API calls; router never writes res.statusCode |
| C-008 | depd wrapfunction/wrapproperty | rejected | unreachable — router uses plain deprecate(message) only |
| C-009 | depd DeprecationError defineProperty | rejected | library-owned fresh error |
| C-010 | debug save() writes process.env.DEBUG | rejected | load-time round trip of documented mutable API |
| C-011 | debug defineProperty(debug,'enabled'); util.deprecate stub | rejected | library-owned objects |
| C-012 | parseurl req._parsedUrl cache | rejected | expando cache; _parsedOriginalUrl path not even called |
| C-013 | path-to-regexp@8.4.2 dist | rejected | zero core interaction in shipped dist |
| C-014 | ms / is-promise | rejected | pure |
| C-015 | diagnostics_channel tracingChannel + Symbol.for | rejected | documented publish-side API; no interception |
| C-016 | node:http METHODS | rejected | read-only |
| C-017 | wrap(done, …) OPTIONS responder | rejected | wraps router's own callback |
| C-018 | depd process reads/emit/stderr | rejected | documented API usage |

## Supporting context

- **Request-metadata expandos (C-006, C-012)**: after a dispatch, core-backed `req` instances carry `baseUrl`, `next`, `originalUrl`, `params`, `route`, `Symbol(router.tracing.matchedRoute)`, `Symbol.for('router.tracing.publishedErrors')` (error paths only) and parseurl's `_parsedUrl`. Repro (`exercise.*.reqOwnPropsAdded*`) matches exactly this set; `res` gained nothing. `restore()` (index.js:712-729) reverts `baseUrl`/`next`/`params`/`matchedRoute` to their pre-dispatch values when dispatch exits via the final callback (repro: `next` back to `undefined`, `params`/`baseUrl` back to `undefined` after the 404 path); the own properties themselves remain on the instance with the restored values. Classified as supported extension/metadata, not patching.
- **Classification of the restoration machinery**: two distinct mechanisms. (1) `restore()` snapshot/revert of library expandos — pure metadata hygiene so nested routers compose. (2) `removed`/`slashAdded` reconstruction of `req.url` — the transient core-state override counted as F-002. Both are per-request, synchronous-dispatch-scoped, and leave no shared state behind.
- **depd require-time cost**: `depd('router')` runs `getStack()` purely to record the requiring file (`deprecate._file`); the swap is not needed for any router feature at steady state unless a deprecated Promise-like handler is used.
- **debug env round-trip (C-010)**: at `require('debug')`, `enable(load())` writes `process.env.DEBUG` back to its existing value (or deletes an absent key) — observable only as an env churn, not a core patch; later mutations require an explicit application call.
- **Legacy core API use**: parseurl uses `url.parse`/`new url.Url()` (documented legacy API) on library-owned objects. router reads `http.METHODS` and creates a `diagnostics_channel` tracing channel (publish-only — no subscription, no interception of core behavior).
- **Prototype construction**: `Router.prototype = function () {}` plus `Object.setPrototypeOf(router, this)` makes router instances callable functions inheriting from a library-owned prototype; no `Function.prototype` or core prototype is modified (repro diff empty).

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| $PACKAGE_ROOT runtime files | read in full: index.js, lib/layer.js, lib/param.js, lib/route.js, lib/symbols.js, lib/tracing.js | all candidate writes traced; sha256 (first 16): index.js 3c6e4d0d36c845ec, lib/layer.js 6cc029530299a8e7, lib/param.js a7725adb215ff4db, lib/route.js ba49c6655c7d51f6, lib/symbols.js 735f3ca7c4094050, lib/tracing.js be34eda9c5349377 |
| Resolved deps | read entrypoints in full: depd/index.js (4d587a5662e20a7b), parseurl/index.js (811223d4a19492cc), debug src/index.js (aa127ff1752b7d9c) / node.js (d7b26d7c92f8ea77) / common.js (dbe83d2bb5837f3c), is-promise/index.js (c4718cc487af9887), ms/index.js (e5f0b6a946a9b2b3), path-to-regexp/dist/index.js (f8e7946ca3a4dcc2) | every dependency checked before exclusion; only depd confirmed patching |
| Six candidate pattern groups | `rg -n --no-ignore <group> <scoped files>` (see searches.md) | G1-G4 hits all traced; G5 (module hooks) and G6 (bindings/internals) zero hits |
| $NODEJS_SOURCE @ d44625a4b80 | lib/internal/http/incoming.js:95, lib/internal/http/common.js:105, lib/internal/http/outgoing.js:813, lib/internal/errors.js:136-188, lib/internal/bootstrap/realm.js:503-505 (re-exports followed from lib/_http_incoming.js) | core baselines for req.url, setHeader, prepareStackTrace default installation; confirms router/parseurl expando names absent from core |
| Runtime reproduction | `node repro/repro.js "$PACKAGE_ROOT"` on Node v24.19.0 → repro/results.json | 2 require-time prepareStackTrace swap/restore cycles; empty diffs on all shared surfaces; req.url trim/restore and expando set captured; OPTIONS auto-response `Allow: GET, HEAD, PUT`; thrown route handled by error middleware |
| Upstream | https://github.com/dougwilson/nodejs-depd/issues/32 (closed), https://github.com/dougwilson/nodejs-depd/issues/36 (closed) | maintainer-acknowledged swap technique; real-world `--enable-source-maps` interference |

## Coverage and limitations

- Entry points covered: `index.js` (package main) and everything reachable from it; `module.exports.Route`; all five lib files. The resolved tree contains exactly the six listed dependencies (ms is transitive via debug); each entrypoint was read before exclusion. Browser-only files (debug/src/browser.js, depd/lib/browser/index.js) are not loaded on Node and were scanned but not exercised.
- Node baseline is `main @ d44625a4b80`, newer than the package's `engines: >=18` floor; on older Node lines the http implementation lives in `lib/_http_incoming.js` directly and `Error.prepareStackTrace` may be undefined by default rather than Node-installed — this changes the swapped-out value of F-001 (undefined vs `ErrorPrepareStackTrace`), not the finding.
- Repro tested one representative path per behavior on Node v24.19.0; a tested branch cannot prove universal absence (e.g., regexp-path layers, `mergeParams`, `listRoutes`, HEAD fallthrough were statically read but not runtime-exercised; none contain additional writes beyond C-002/C-006).
- `Error.stackTraceLimit` writes could not be accessor-trapped (V8 requires a data property; the attempt crashed depd at require time — itself evidence); its swap is proven statically (depd/index.js:387,396) and by before/after value snapshots.
- The `--enable-source-maps` interaction of F-001 was not re-reproduced locally; relied on upstream depd#36.
- Blind-pass constraint honored: nothing outside `audit/pillarjs/router/pass-b/` was read under the audit root.

## Changes since the previous audit

First audit (pass B, blind; no prior pass-b report existed).
