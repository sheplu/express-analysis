# router — findings detail (files, lines, issues)

Library: router 2.2.0 (master @ `098ea782ee6dadbedda778470a177ccd813c95a0`, 21 commits past the v2.2.0 tag; findings present in released 2.2.0 too)
Verdict: **confirmed patching** — 2 findings: depd Error-hook swap (direct dep, fires 2x at require) + transient `req.url` rewrite on core-backed request instances.

## F-001 — depd transient `Error.prepareStackTrace` + `stackTraceLimit` swap (DIRECT dependency)

| Item | Detail |
|---|---|
| Patch site | `node_modules/depd/index.js:386-387` (writes), `:395-396` (restores) |
| Trigger chain | `require('router')` -> `index.js:15` -> `lib/param.js:9` `require('depd')('router')` -> `getStack()`; **and** `index.js:16` -> `lib/layer.js:18` (second factory) — exactly 2 swap/restore cycles at import (trap-verified); re-fires per deprecation log (Promise-like handler / legacy param API) |
| Origin | **direct** — depd is router's own dependency (unlike cookies/send/multiparty where it arrives via http-errors) |
| Core baseline | bootstrap default `$NODEJS_SOURCE/lib/internal/bootstrap/realm.js:503-511`, impl `errors.js:168` |
| Scope / persistence | process-wide while held; identity-exact synchronous restore; not exception-guarded |
| Dormant machinery | depd `wrapfunction` (`new Function`) / `wrapproperty` (defineProperty) never called on this chain |
| Upstream | depd#32, #36 (`--enable-source-maps`) |

## F-002 — transient rewrite of core-assigned `req.url` (mount-prefix dispatch)

| Item | Detail |
|---|---|
| Rewrite sites | `index.js:337` (`removed = layerPath`), `:338` (`req.url = protohost + req.url.slice(protohost.length + removed.length)`), `:341-342` (leading-slash re-add + `slashAdded` flag) |
| Restore sites | `index.js:199-203` (slash removal), `:205-209` (`req.baseUrl = parentUrl; req.url = protohost + removed + req.url.slice(protohost.length)`) on `next()` re-entry |
| Core baseline | `req.url` initialized at `$NODEJS_SOURCE/lib/internal/http/incoming.js:95` (`this.url = ''`), assigned per-request by the parser glue at `lib/internal/http/common.js:105` (`incoming.url = url`) |
| Activation | every request dispatched through a mounted/prefixed layer (`app.use('/api', router)` pattern) — production hot path |
| Restoration caveat | full restore only on the `next()` continuation; if a handler ends the response, `req.url` stays trimmed for any later reader of that instance |
| Runtime proof | wire `/api/users/42?x=1` observed in-handler as `/users/42?x=1`; `urlEqualsEntry: true` after 404 fallthrough (both passes) |
| Classification note | counted under the skill's instance/application-override clause: it overwrites **core-populated** instance state (vs. the library expandos below). Both blind passes classified it identically. |

## Library expandos and hygiene machinery (NOT patches — supporting context)

| Mechanism | Sites | Classification |
|---|---|---|
| `req.baseUrl`, `req.params`, `req.next`, `req.route`, `req.originalUrl` (set if absent), 2 tracing symbols | dispatch path | library-owned expandos; none exist on core IncomingMessage (verified against `incoming.js`) |
| `restore(fn, obj, ...props)` | `index.js:712-729` | snapshots/reverts the expandos above + matchedRoute symbol — metadata hygiene |
| parseurl `req._parsedUrl` | dep behavior | library cache key (see parseurl audit) |

## res interaction (invocation-only)

- OPTIONS auto-responder `index.js:749-753`: `setHeader('Allow'/'Content-Length'/'Content-Type'/'X-Content-Type-Options')` + `res.end(allow)`.
- **No `res.statusCode` write anywhere in router**; no header sweeps.

## Dependency analysis (all 6 resolved)

| Dependency | Key observation | Outcome |
|---|---|---|
| depd@2.0.0 | F-001 (direct consumer, 2 factories); wrapfunction/wrapproperty dormant | patch site |
| debug@4.4.3 | import-time `enable(load())` round-trips `process.env.DEBUG` (value-preserving, verified) | env state, not a patch |
| parseurl@1.3.3 | `req._parsedUrl` cache expando | clean (see parseurl audit) |
| path-to-regexp@8.4.2 | shipped dist has zero core interaction (local `process()` is a lexical shadow) | clean |
| is-promise@4.0.0 / ms@2.1.3 | pure | clean |
| lib/tracing.js (own code, unreleased) | `diagnostics_channel` publish-only | clean |

## Negative sweeps (both passes, zero hits in runtime scope)

- Module-loading interception (group 5) and internals/bindings (group 6): zero hits
- Shared prototype/descriptor writes: zero beyond library-owned objects (`Object.setPrototypeOf(router, this)` at `index.js:65` and `Router.prototype = function(){}` at `:81` target library functions)
- No install scripts, no native code

## Runtime reproduction (both passes, Node v24.19.0)

Real http server: mounted sub-router with `:id` param, 404 final-handler fallthrough, OPTIONS auto-response (`Allow: GET, HEAD, PUT`), throwing route handled by error middleware. Zero diffs across before/afterRequire/afterExercise on http IncomingMessage/ServerResponse/OutgoingMessage/EventEmitter/Object/Array/String/Function prototypes, `Object.assign/setPrototypeOf/defineProperty`, `Module._load/_resolveFilename`, `require.extensions`, builtin `require.cache`, `process.binding`, global keys. Error-hook trap: exactly 2 cycles, all during require.

## Node.js-change risk

1. **`Error.prepareStackTrace`/`stackTraceLimit` writability (F-001)** — standard depd exposure, doubled trigger count; breaks `require('router')` (and with it Express 5 apps) if core froze the hook.
2. **`req.url` as a plain writable own property (F-002)** — mounted routing *depends* on core keeping `IncomingMessage#url` a writable data property that nothing in core re-reads post-dispatch. If Node made `url` an accessor backed by parser state, read-only, or re-derived it from internal buffers, every mounted Express 5 router would break. This is arguably the single most load-bearing core-contract assumption in the pillarjs stack.
3. Deprecation re-fires depend on `process.emitWarning`-era behavior via depd's channels — low risk.
