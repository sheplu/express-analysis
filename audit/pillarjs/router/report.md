# Node.js patch audit: router

- Verdict: **confirmed patching**
- Status: complete
- Input: issue sheplu/express-analysis#30 (`router`, https://github.com/pillarjs/router)
- Library: router 2.2.0 (master @ `098ea782ee6dadbedda778470a177ccd813c95a0` — 21 commits ahead of the v2.2.0 tag; both findings also exist in published 2.2.0), cloned repository with runtime dependencies installed (`--ignore-scripts --omit=dev`): debug@4.4.3, depd@2.0.0, is-promise@4.0.0, ms@2.1.3, parseurl@1.3.3, path-to-regexp@8.4.2
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (both passes; real http server with mounted sub-router, :id param, 404 final handler, OPTIONS auto-response, throwing route + error middleware)
- Scope: production/runtime code — `index.js` + `lib/` (layer.js, route.js, param.js, symbols.js, tracing.js) plus all 6 resolved runtime dependencies' runtime files. Tests, scripts/, types, eslint config, devDependencies excluded.
- Coverage: source complete; runtime reproduction done (both passes); upstream corroboration (dougwilson/nodejs-depd#32, #36)
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; **both passes reached the identical verdict and identical finding classifications**; 0 disagreements; key sites re-verified directly during reconciliation.

## Patching verdict

router — the Express 5 routing core — **patches Node.js core on two axes**, both transient:

1. **F-001 (shared core mutation, direct dependency, transient):** depd@2.0.0's `getStack()` swap of `Error.prepareStackTrace`/`stackTraceLimit`. Unlike the http-errors-mediated packages in this series, **router consumes depd directly** — `lib/param.js:9` and `lib/layer.js:18` each call `require('depd')('router')`, so the swap fires **twice** at `require('router')` and re-fires on every runtime deprecation (Promise-like handler/param deprecations).
2. **F-002 (instance-level override of core-backed state, direct, transient):** during mount-prefix dispatch, router **rewrites `req.url`** — the own data property that core's HTTP parser assigns on every IncomingMessage — trimming the mount prefix, then reconstructs it on re-entry to `next()`. Per-request, fully restored on the continuation path; left trimmed if a handler ends the response without calling `next()`.

No permanent mutation of any shared prototype, global, module loader, or binding anywhere in scope; groups 5/6 zero-hit; 0 unresolved candidates.

## Confirmed Node.js patches

### F-001: transient swap of `Error.prepareStackTrace`/`stackTraceLimit` (depd `getStack()`) — fires 2x at require

- Category: shared core mutation (process-global `Error` constructor properties), transient
- Library site(s): `node_modules/depd/index.js:386-387` (writes), `:395-396` (restores)
- Origin: **direct dependency** — router -> depd@2.0.0 (router's own package.json dep; required at `lib/param.js:9` and `lib/layer.js:18`)
- Core baseline: bootstrap-installed default (`$NODEJS_SOURCE/lib/internal/bootstrap/realm.js:503-511`, impl `lib/internal/errors.js:168`) — the swap displaces a core-installed function on modern Node
- Execution chain: `require('router')` -> `index.js:15` (`./lib/param`) -> `param.js:9` depd factory -> `depd/index.js:108` `getStack()`; and `index.js:16` (`./lib/layer`) -> `layer.js:18` — exactly 2 swap/restore cycles at import (4 property assignments, trap-verified); re-fires per deprecation log (`depd/index.js:199`)
- Activation: unconditional at import; runtime re-fire only on deprecated usage (Promise-returning handlers, old param API)
- Scope and restoration: process-wide while held; synchronous identity-exact restore (Node's own `ErrorPrepareStackTrace` restored verbatim); not exception-guarded
- Evidence: static + dynamic (both passes; accessor trap recorded exactly 2 require-phase cycles, none during dispatch; the infeasibility of trapping `stackTraceLimit` — which crashed depd at require — is itself runtime proof the swap executes at import)
- Upstream: dougwilson/nodejs-depd#32, #36 (`--enable-source-maps` breakage). depd `wrapfunction`/`wrapproperty` (the heavier object-patchers) are present but **unreachable** on this chain — router only calls plain `deprecate(message)`.

### F-002: transient rewrite of core-assigned `req.url` during mount-prefix dispatch

- Category: instance/application override (core-backed IncomingMessage instance state), transient with conditional restoration
- Library site(s): `index.js:337` (`removed = layerPath`), `:338` (`req.url = protohost + req.url.slice(protohost.length + removed.length)`), `:341-342` (leading-slash re-add, `slashAdded`); restoration at `:199-209` (`req.url = protohost + removed + req.url.slice(protohost.length)`, slash removal, `req.baseUrl = parentUrl`)
- Origin: direct (router's own dispatch logic)
- Core baseline: `req.url` is initialized by the IncomingMessage constructor (`$NODEJS_SOURCE/lib/internal/http/incoming.js:95`, `this.url = ''`) and assigned by the HTTP parser for every request (`lib/internal/http/common.js:105`, `incoming.url = url`) — router overwrites that core-populated value
- Execution chain: dispatch -> `trimPrefix` on any mounted/prefixed layer match -> rewrite; `next()` re-entry -> reconstruction
- Activation: every request routed through a mounted path prefix (the standard Express `app.use('/api', router)` pattern); production hot path
- Scope and restoration: single request instance; fully restored on the `next()` continuation (repro: wire `/api/users/42?x=1` seen as `/users/42?x=1` in-handler, `urlEqualsEntry: true` after 404 fallthrough); **left trimmed** if a handler terminates the response without calling `next()`
- Resulting behavior: downstream consumers of `req.url` (logging, other middleware, core-agnostic code) observe a value differing from what core's parser assigned — the defining behavior of mounted routing
- Evidence: static + dynamic (both passes, identical classification — counted under the skill's "core-backed instances" clause)
- Related library state that is *not* a patch: `restore()` (`index.js:712-729`) snapshots/reverts `req.baseUrl`/`next`/`params`/matchedRoute-symbol — library expandos (see ledger)

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (22 entries), `pass-b/candidates.md` (18 entries) — same substantive sites, 0 unresolved in both. Key entries:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-01 | depd getStack swap | confirmed -> F-001 | 2 cycles at require (param.js:9, layer.js:18) |
| C-02 | `index.js:337-342,199-209` req.url rewrite | confirmed -> F-002 | transient core-state override, both passes independently |
| C-03 | `req.baseUrl/next/params/originalUrl/route` + 2 tracing symbols + parseurl `req._parsedUrl` | rejected | library expandos; none exist on core IncomingMessage (verified against `incoming.js`) — metadata, with `restore()` hygiene |
| C-04 | `index.js:65` `Object.setPrototypeOf(router, this)` / `:81` `Router.prototype = function () {}` | rejected | library-owned function objects |
| C-05 | OPTIONS auto-responder `index.js:749-753` | rejected | `setHeader` x4 + `end` — invocation-only; **no `res.statusCode` write anywhere in router** |
| C-06 | debug@4.4.3 import-time `enable(load())` env round-trip | rejected | writes `process.env.DEBUG` back to its existing value (documented mutable interface; dynamically verified unchanged) |
| C-07 | path-to-regexp@8.4.2 shipped dist | rejected | zero core interaction (local `function process()` shadows lexically; no imports of core) |
| C-08 | depd `wrapfunction`/`wrapproperty` (`new Function` + defineProperty machinery) | rejected | present but never called on this chain — dormant |
| C-09 | ms / is-promise | rejected | pure computation |
| C-10 | `lib/tracing.js` diagnostics_channel usage | rejected | publish-only channels; no interception |

## Supporting context

- F-002 is the **defining mechanism of mounted routing** — Express has rewritten `req.url` since v1. It is nonetheless a real override of core-assigned instance state (the skill's instance clause), and its restoration is conditional on the continuation path. Consumers that read `req.url` after a terminated mounted response see the trimmed value.
- router's ledger classification matches the expressjs-org audit of express itself (instance/application overrides only + transitive depd) — consistent cross-run treatment.
- `lib/tracing.js` (unreleased, ahead of the 2.2.0 tag) publishes to `diagnostics_channel` — observation-only, no hook interception.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` runtime tree (7 packages, incl. lib/param.js, symbols.js, tracing.js beyond the brief) | skill's six candidate pattern groups + supplemental sweeps (logs: `pass-a/searches.md`, `pass-b/searches.md`) | groups 5/6 zero hits; all other hits ledgered |
| `$NODEJS_SOURCE/lib/internal/http/incoming.js:95`, `lib/internal/http/common.js:105` | direct reads | core assigns `req.url` (ctor init + parser write) — F-002 baseline |
| `$NODEJS_SOURCE/lib/internal/bootstrap/realm.js:503-511`, `lib/internal/errors.js:168` | direct reads | F-001 baseline |
| Reproduction | `node pass-a/repro-require-and-dispatch.js "$PACKAGE_ROOT"`; `node pass-b/repro/repro.js "$PACKAGE_ROOT"` (Node v24.19.0) | exactly 2 Error-hook cycles at require, 0 during dispatch; in-handler url `/users/42` vs wire `/api/users/42`, full restoration on 404 fallthrough; OPTIONS `Allow: GET, HEAD, PUT`; zero prototype/global/loader/binding diffs across all phases |
| Upstream | dougwilson/nodejs-depd#32, #36 | F-001 corroboration |

## Coverage and limitations

- Audited ref is master (21 commits past v2.2.0; adds lib/param.js split, tracing, listRoutes) — both findings exist in published 2.2.0 as well.
- regexp-path layers/mergeParams/listRoutes read statically, not runtime-exercised (no additional writes).
- `--enable-source-maps` interaction taken from upstream, not re-reproduced; `supports-color` absent from the install.
- Node baseline is main; on pre-bootstrap-default lines the F-001 swap displaces `undefined` instead of a core function (finding unchanged).
- Verdict pinned to resolved dep versions (`^` ranges may drift).

## Changes since the previous audit

First audit of router in this workspace.
