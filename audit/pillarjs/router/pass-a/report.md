# Node.js patch audit: router

- Verdict: confirmed patching (two transient findings: one shared-global mutation via depd, one per-request instance override of `req.url`; both fully restored; no permanent mutation of any core API, prototype, loader, or binding)
- Status: complete
- Input: issue sheplu/express-analysis#30 — `router` (simple middleware-style router, https://github.com/pillarjs/router)
- Library: router 2.2.0 (package.json), `$PACKAGE_ROOT` = clone of pillarjs/router default branch `master` @ `098ea782ee6dadbedda778470a177ccd813c95a0` (21 commits ahead of tag v2.2.0; includes unreleased `lib/tracing.js`, `lib/param.js`, `lib/symbols.js`, `listRoutes` — PRs #174/#197/#207/#215). Git working tree, unmodified. Runtime deps installed with `npm install --ignore-scripts --omit=dev`: debug@4.4.3, depd@2.0.0, is-promise@4.0.0, ms@2.1.3, parseurl@1.3.3, path-to-regexp@8.4.2.
- Node.js baseline: `$NODEJS_SOURCE` = nodejs/node main @ `d44625a4b80c672215b469906ce583ce7eeeebaf`, read-only, targeted files only.
- Reproduction runtime: Node v24.19.0 (`node repro-require-and-dispatch.js "$PACKAGE_ROOT"`, script beside this report).
- Scope: production/runtime code only — `index.js` + `lib/` and everything reachable from them, plus each resolved runtime dependency's entrypoint/initialization (including conditional browser entrypoints, inspected and ruled out). Tests, `scripts/`, eslint config, and `*.d.ts` out of scope per instructions.
- Coverage: source — complete for the scope above (all 15 runtime files read in full); upstream — commit history of the audited clone plus pinned public repos; runtime — require-time and dispatch behavior reproduced on Node v24.19.0.

## Patching verdict

Patching was demonstrated, with important qualifications. Counts:

- Shared core/global mutations: **1** (F-001, transitive via depd@2.0.0, transient — `Error.prepareStackTrace` and `Error.stackTraceLimit` are swapped and restored within one synchronous frame; fires unconditionally at `require('router')` time).
- Instance/application overrides: **1** (F-002, direct, transient — router rewrites `req.url`, a core-assigned property of `http.IncomingMessage` instances it does not own, and restores it through its `restore()`/`next()` machinery).

There are **no permanent patches**: no core prototype is modified, no core method is replaced or wrapped, no module-loading interception exists (zero hits for require.cache/Module._*/registerHooks), no bindings/internals access (zero hits for internalBinding/process.binding/`_http_`/`internal/`), and reproduction confirms the own-key sets of `http.IncomingMessage.prototype`, `http.ServerResponse.prototype`, `http.OutgoingMessage.prototype`, `Function.prototype`, `Object.prototype`, `Array.prototype`, and `process` are identical before require and after dispatching requests. All 22 ledger candidates were resolved (2 confirmed, 20 rejected, 0 unresolved). The absent optional `supports-color` branch in debug (dead in this install) is the only excluded conditional branch.

## Confirmed Node.js patches

### F-001: `Error.prepareStackTrace` / `Error.stackTraceLimit` — transient swap by depd getStack

- Category: shared core mutation (global `Error` constructor hooks), transient with synchronous save/restore
- Library site(s): depd@2.0.0 `index.js:384-396` (`getStack`: save at :382/:384, swap at :386-387, restore at :395-396) — https://github.com/dougwilson/nodejs-depd/blob/v2.0.0/index.js#L381-L399 ; call sites `index.js:108` (`depd()`) and `index.js:199` (`log()`)
- Origin: transitive — router -> depd@2.0.0 (required at `$PACKAGE_ROOT/lib/param.js:9` and `$PACKAGE_ROOT/lib/layer.js:18`)
- Core baseline: `Error.prepareStackTrace` is the V8 stack-trace-API hook consulted by Node core's error formatting ($NODEJS_SOURCE `lib/internal/errors.js:145-150`, which reads `globalThis.Error.prepareStackTrace`; on the reproduction runtime core itself pre-installs a default `ErrorPrepareStackTrace` function there). `Error.stackTraceLimit` is the engine-global frame-count limit.
- Exact mutation: `Error.prepareStackTrace = prepareObjectStackTrace` (a depd function returning raw CallSite arrays) and `Error.stackTraceLimit = Math.max(10, limit)`; after `Error.captureStackTrace(obj)` and one `obj.stack` read, both are assigned back to their saved values.
- Execution chain (require time): `require('router')` -> `$PACKAGE_ROOT/index.js:15` `require('./lib/param')` -> `lib/param.js:9` `require('depd')('router')` -> depd `index.js:108` `getStack()`; repeated via `index.js:16` -> `lib/layer.js:18`. Runtime re-fire: deprecated Promise-like handler/param -> `lib/layer.js:249` or `lib/param.js:20` `deprecate(...)` -> depd `log()` `index.js:199` -> `getStack()`.
- Activation: unconditional at import; no guard prevents the require-time swaps (depd `_ignored`/NO_DEPRECATION only short-circuits `log()` output, and even then only when no 'deprecation' listener exists — `depd/index.js:186-191`).
- Scope and restoration: process-global during the swap window; restored in the same synchronous frame — no other JS can run in between in a single-threaded program, but any `error.stack` materialized inside the window (including by core, which consults this hook) would be formatted by depd's hook. Reproduction counted exactly 4 assignments during `require('router')` (2 getStack calls x swap+restore) and 2 per runtime deprecation, with identity-exact restoration of both globals each time.
- Resulting behavior: before/after any observation point outside the window, behavior is unchanged; inside the window, stack preparation yields raw CallSite objects and a floor of 10 frames.
- Evidence: static — depd `index.js:381-399` with call sites above; dynamic — `repro-require-and-dispatch.js` output: `prepareStackTrace assignments during require: 4`, `restored to initial value: true`, `stackTraceLimit restored: true` (Node v24.19.0).
- Upstream: depd v2.0.0 as published (https://github.com/dougwilson/nodejs-depd/tree/v2.0.0); the save/restore pattern is depd's documented approach to the V8 stack-trace API (https://v8.dev/docs/stack-trace-api). No router issue/PR disputes it; router has required depd since the Express 4 era.

### F-002: `req.url` of `http.IncomingMessage` instances — per-request rewrite with restoration machinery

- Category: instance override (mutation of a core-assigned own data property on core-backed instances the library does not own), transient per request
- Library site(s): `$PACKAGE_ROOT/index.js:337` and `:341` (prefix trim / leading-slash add in `trimPrefix`), `:199-209` (undo in `next()`), `:172` + `:712-729` (`restore()` wrapper saving/restoring `baseUrl`, `next`, `params`, and the `matchedRoute` symbol around the final callback) — https://github.com/pillarjs/router/blob/098ea782ee6dadbedda778470a177ccd813c95a0/index.js#L318-L349
- Origin: direct
- Core baseline: `req.url` is created by core (`this.url = ''`, $NODEJS_SOURCE `lib/internal/http/incoming.js:95`) and assigned by the HTTP parser (`incoming.url = url`, $NODEJS_SOURCE `lib/internal/http/common.js:105`). It is a plain writable data property that core does not re-read after emitting 'request', but every downstream consumer of the request object relies on it.
- Exact mutation: when a mounted layer (`.use('/api', ...)`) matches, `req.url = protohost + req.url.slice(protohost.length + removed.length)` strips the mount prefix; if the remainder lacks a leading `/` one is prepended (`req.url = '/' + req.url`, `slashAdded`). On the following `next()` the original is reassembled (`req.url = protohost + removed + req.url.slice(protohost.length)`; added slash removed). `req.baseUrl` is set/reset in tandem.
- Execution chain: `require('router')` -> application mounts middleware -> `Router.prototype.handle` (`index.js:150`) -> `next()` -> `trimPrefix()` -> write; undo in the next `next()` invocation; `restore()`-wrapped `done` resets `baseUrl`/`next`/`params`/`matchedRoute` when the router hands control back.
- Activation: production code path on every request that traverses a path-mounted layer; no guards.
- Scope and restoration: confined to the individual request object during its dispatch window; handlers running under a trimmed prefix intentionally observe the rewritten URL (that is the mounting contract). Fully restored on exit: reproduction shows `/api/users/42?x=1` -> `/users/42?x=1` inside the mounted middleware -> restored to `/api/users/42?x=1` in the route handler and after dispatch; `baseUrl`/`params`/`next` restored to their pre-dispatch values when the final callback runs. If a handler ends the response without calling `next()`, the final restore never runs, but `req.url` itself has already been restored by that point (only expandos remain — see supporting context).
- Resulting behavior: downstream middleware see a prefix-relative URL while inside a mount, the original afterwards; cooperating copies of router/Express rely on exactly this machinery.
- Evidence: static — sites above; dynamic — `repro-require-and-dispatch.js` `[dispatch]`/`[restore]` output (Node v24.19.0).
- Upstream: long-standing pillarjs/router & Express design (mounting contract documented in the README's "middleware" semantics); restoration via `restore()` present since router 1.x.

## Candidate ledger and unresolved questions

Full ledger with evidence in `candidates.md` (same directory). Summary:

| ID | Site and core target | Status |
| --- | --- | --- |
| C-001 | index.js:65 setPrototypeOf on library function | rejected as patch |
| C-002 | index.js:81 Router.prototype reassignment (library-owned) | rejected as patch |
| C-003 | Array.prototype.slice/flat aliases (reads) | rejected as patch |
| C-004 | req expandos: next/baseUrl/originalUrl/params/route/symbols | rejected as patch (metadata) |
| C-005 | req.url rewrite + restore machinery | confirmed -> F-002 |
| C-006 | OPTIONS res.setHeader/res.end calls | rejected as patch (public API calls) |
| C-007 | internal wrap() of router's own done callback | rejected as patch |
| C-008 | Symbol.for registry + req[seenErrors] expando | rejected as patch |
| C-009 | diagnostics_channel tracingChannel('express.router.request') | rejected as patch (supported extension point) |
| C-010 | decodeParam mutating its own thrown URIError | rejected as patch |
| C-011 | depd deprecate function own-property setup | rejected as patch |
| C-012 | depd getStack Error.prepareStackTrace/stackTraceLimit swap | confirmed -> F-001 |
| C-013 | depd wrapfunction/wrapproperty (new Function/defineProperty) | rejected as patch (dormant — never called on this chain) |
| C-014 | depd DeprecationError defineProperty on own object | rejected as patch |
| C-015 | debug save(): process.env.DEBUG write at require time | rejected as patch (idempotent env round-trip, documented interface; verified unchanged) |
| C-016 | debug util.deprecate on own stub | rejected as patch |
| C-017 | debug optional supports-color require | rejected as patch (absent, dead branch) |
| C-018 | debug/depd browser entrypoints | rejected as patch (non-Node, inspected) |
| C-019 | parseurl req._parsedUrl expando + url.Url use | rejected as patch (memoization metadata) |
| C-020 | path-to-regexp dist: exports defineProperty, TypeError subclass, local `process` fn | rejected as patch |
| C-021 | is-promise | rejected as patch (pure) |
| C-022 | ms | rejected as patch (pure) |

Unresolved: none.

## Supporting context

- Request expandos (C-004, C-019): router sets `req.next`, `req.baseUrl`, `req.originalUrl`, `req.params`, `req.route`, `req[Symbol(router.tracing.matchedRoute)]`, `req[Symbol.for('router.tracing.publishedErrors')]`; parseurl adds `req._parsedUrl`. None exist on core's IncomingMessage ($NODEJS_SOURCE lib/internal/http/incoming.js) — this is request metadata, request-scoped, not a core patch. The `restore()` wrapper (index.js:712-729) resets `baseUrl`/`next`/`params`/`matchedRoute` when the router returns control; expandos persist for the request's lifetime when a handler terminates the response (observed: `_parsedUrl`, `baseUrl`, `next`, `originalUrl`, `params`, `route`, matchedRoute symbol).
- depd timing (orchestrator question): `getStack` IS reached at `require('router')` time, twice, on the chains `index.js:15 -> lib/param.js:9 -> depd() -> getStack()` and `index.js:16 -> lib/layer.js:18 -> depd() -> getStack()` (module caching dedupes the depd module, not the `depd('router')` calls). Note this master tree moved the former depd usage into lib/param.js and lib/layer.js; published router@2.2.0 reaches it from lib/layer.js on the same require.
- debug init (C-015): `require('debug')` runs `createDebug.enable(createDebug.load())` (src/common.js:287) which calls node save() writing `process.env.DEBUG` back to the value just read (or deleting the absent key) — an idempotent write through the documented env interface, verified unchanged across require.
- Automatic OPTIONS handling (C-006): router calls public `res.setHeader('Allow'|'Content-Length'|'Content-Type'|'X-Content-Type-Options')` and `res.end(allow)` only when no handler responded to OPTIONS; errors are forwarded to `next`, nothing on `res` is replaced; no `res.statusCode` writes exist in the package.
- Tracing (C-009): the unreleased tracing feature publishes to `diagnostics_channel.tracingChannel('express.router.request')` — the public publisher API, subscriber-gated via `shouldTrace()`, with a fallback for Node < 20.13 where `hasSubscribers` is undefined.
- depd's `deprecate.function`/`deprecate.property` could patch objects (new Function wrapper / defineProperty), but router never invokes them — dormant capability only.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| $PACKAGE_ROOT runtime tree (15 files) | full reads + six skill search groups (`searches.md`) | Complete inventory; G5 (loader interception) and G6 (bindings/internals) zero hits |
| $PACKAGE_ROOT provenance | `git log -1` -> 098ea782ee6dadbedda778470a177ccd813c95a0; `git describe` -> v2.2.0-21-g098ea78 | Audited ref pinned; tracing files added post-v2.2.0 (PR #215, also #207/#174) |
| depd@2.0.0 | https://github.com/dougwilson/nodejs-depd/blob/v2.0.0/index.js | getStack swap/restore confirmed at published version (F-001) |
| debug@4.4.3 | https://github.com/debug-js/debug/tree/4.4.3/src | init chain enable(load())->save() confirmed (C-015) |
| parseurl@1.3.3 / path-to-regexp@8.4.2 / is-promise@4.0.0 / ms@2.1.3 | pinned npm artifacts in $PACKAGE_ROOT/node_modules | Entry files read in full; no core writes |
| $NODEJS_SOURCE lib/internal/http/incoming.js | rg targeted (see searches.md) | :95 `this.url=''`; no router expando names in core (F-002 baseline, C-004/C-019 rejection) |
| $NODEJS_SOURCE lib/internal/http/common.js, outgoing.js, http.js | targeted rg (see searches.md) | common.js:105 parser assigns req.url; setHeader :813 / end :1289 public; METHODS http.js:264 |
| $NODEJS_SOURCE lib/diagnostics_channel.js | `rg -n "tracingChannel"` | :697/:715 public API (C-009) |
| $NODEJS_SOURCE lib/internal/errors.js | `rg -n "prepareStackTrace"` | :145-150 core consults/installs the global hook depd swaps (F-001 relevance) |
| Reproduction | `node repro-require-and-dispatch.js "$PACKAGE_ROOT"` on Node v24.19.0 | 4 transient prepareStackTrace sets at require, exact restore; env.DEBUG unchanged; url trim/restore; core prototype own-key sets unchanged |
| Runtime file hashes (sha256, relative) | index.js 3c6e4d0d…44b1; lib/layer.js 6cc02953…f9ee; lib/param.js a7725adb…0e8c; lib/route.js ba49c665…e4d2; lib/symbols.js 735f3ca7…142d; lib/tracing.js be34eda9…166f; depd/index.js 4d587a56…ee91; debug/src/node.js d7b26d7c…aac6; debug/src/common.js dbe83d2b…214a; debug/src/index.js aa127ff1…3bf3; parseurl/index.js 811223d4…0f17; path-to-regexp/dist/index.js f8e7946c…f62f; is-promise/index.js c4718cc4…b913; ms/index.js e5f0b6a9…b0e9 | Provenance of audited artifacts |

## Coverage and limitations

- Entry points covered: `index.js` (main), `lib/layer.js`, `lib/param.js`, `lib/route.js`, `lib/symbols.js`, `lib/tracing.js`; dependency entrypoints: debug `src/index.js`->`src/node.js`+`src/common.js` (and browser.js inspected), depd `index.js` (and lib/browser inspected), is-promise `index.js`+`index.mjs`, ms `index.js`, parseurl `index.js`, path-to-regexp `dist/index.js`. No install scripts run (`--ignore-scripts`); none of the packages declare runtime-relevant install hooks in this tree.
- Audited ref is master (v2.2.0 + 21 commits), not the published 2.2.0 tarball; findings F-001/F-002 exist in both (published 2.2.0 reaches depd via lib/layer.js), but lib/tracing.js / lib/param.js / listRoutes are unreleased at audit time.
- debug's `supports-color` optional branch is dead in this install and was not audited beyond confirming absence; a tree that installs it would need that package checked.
- Node core baseline read at main d44625a4b80 where HTTP lives under lib/internal/http/; the audited package targets Node >= 18, whose files differ in layout but not in the relevant contracts (req.url parser-assigned data property; setHeader/end public). Reproduction ran on Node v24.19.0 only; the transient-restore proof is static (synchronous frame) and version-independent.
- Blind pass: no other pass's artifacts were read.
- What would change the verdict: evidence of a reachable call to depd's `wrapfunction`/`wrapproperty` against a core object, any write to a core prototype (none found), or loader/binding interception (zero hits).

## Changes since the previous audit

First audit (pass A, blind) — no previous report in this folder.
