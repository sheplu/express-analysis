# Node.js patch audit: express

- Verdict: confirmed patching (instance/application overrides only; no shared core prototype or core API mutation)
- Status: complete
- Input: npm package `express` (independent verification pass B)
- Library: express 5.3.0, git commit 1c6f1b0fe4000977b9a7b4f34097e4d527dd9824 (expressjs/express, branch master), source checkout with runtime dependencies installed (`--ignore-scripts --omit=dev`); no local changes
- Node.js baseline: main branch, commit d44625a4b80c672215b469906ce583ce7eeeebaf (unchanged checkout)
- Reproduction runtime: Node.js v24.19.0 (`node repro-core-mutation-check.js "$PACKAGE_ROOT"`)
- Scope: production/runtime code only — `$PACKAGE_ROOT/index.js`, `$PACKAGE_ROOT/lib/**`, and all 63 resolved runtime dependencies under `$PACKAGE_ROOT/node_modules` (entrypoint/initialization paths plus full mutation-pattern sweeps). Tests, examples, benchmarks, docs excluded.
- Coverage: source complete; upstream corroboration via public expressjs/express issues; runtime reproduction complete. No unresolved candidates.

## Patching verdict

Express does **not** mutate any shared Node.js core prototype, core module export,
or global API in a lasting way. Verified by static trace of every candidate write
and by before/after snapshots of `http.IncomingMessage.prototype`,
`http.ServerResponse.prototype`, `http.OutgoingMessage.prototype`,
`Stream.prototype`, `Function.prototype`, `Object.prototype`, `Error`, and
`process` across `require('express')` plus a full request/response cycle
(no differences; Node v24.19.0).

Patching is still confirmed in the **instance/application override** category:

- 1 confirmed instance-level override (direct): express rewires the
  `[[Prototype]]` of every live, core-created request/response object that flows
  through an app (`Object.setPrototypeOf(req, this.request)` /
  `Object.setPrototypeOf(res, this.response)`), permanently for the lifetime of
  each message (F-001).
- 1 confirmed transient shared-global write (transitive, express -> depd@2.0.0):
  `Error.prepareStackTrace` and `Error.stackTraceLimit` are swapped and
  synchronously restored during stack capture, reachable at `require('express')`
  time (F-002). No behavior change is observable by any other consumer.

Shared core mutations (permanent): 0. Instance/application overrides: 1 (F-001).
Transient global writes: 1 (F-002). Core module loading interception: none.
Core source rewrites: none. Two notable dormant patch sites were rejected as
unreachable in this scope: `once.proto()` (opt-in `Function.prototype`
extension, never called) and on-finished's legacy `res.assignSocket` instance
wrapper (guard can never be true on the audited Node baseline); see the ledger.

## Confirmed Node.js patches

### F-001: `[[Prototype]]` rewiring of live `http.IncomingMessage` / `http.ServerResponse` instances

- Category: instance/application override (core-backed instance prototype replacement)
- Library site(s):
  - `$PACKAGE_ROOT/lib/application.js:169-170` (`Object.setPrototypeOf(req, this.request)`; `Object.setPrototypeOf(res, this.response)`)
  - `$PACKAGE_ROOT/lib/application.js:233-234` (re-rewire back to the parent app's layers when a mounted sub-app finishes)
  - Layer construction: `$PACKAGE_ROOT/lib/request.js:30` (`Object.create(http.IncomingMessage.prototype)`), `$PACKAGE_ROOT/lib/response.js:43` (`Object.create(http.ServerResponse.prototype)`), `$PACKAGE_ROOT/lib/express.js:45-52` (per-app `app.request`/`app.response` layers)
  - Pinned source: https://github.com/expressjs/express/blob/1c6f1b0fe4000977b9a7b4f34097e4d527dd9824/lib/application.js#L169-L170
- Origin: direct (express)
- Core baseline: `$NODEJS_SOURCE/lib/internal/http/common.js:94-97` creates each
  server request as `new (socket.server[kIncomingMessage] || IncomingMessage)(socket)`;
  `$NODEJS_SOURCE/lib/internal/http/server.js:1375` creates each response as
  `new server[kServerResponse](req, ...)`. Both instances are therefore born with
  `http.IncomingMessage.prototype` / `http.ServerResponse.prototype` as their
  direct prototypes (re-exported via `$NODEJS_SOURCE/lib/http.js:268,271`).
  Original behavior: property lookup on req/res goes straight to the core
  prototypes.
- Exact mutation: the internal `[[Prototype]]` slot of each live core-created
  instance is written via `Object.setPrototypeOf`, replacing the direct core
  prototype with the express layer chain
  `instance -> app.request -> express req layer -> http.IncomingMessage.prototype`
  (response analogous). No property on the core prototypes themselves is
  touched.
- Execution chain: `require('express')` -> `createApplication()`
  (`lib/express.js:36-56`) builds the layers; per request,
  `app(req, res, next)` -> `app.handle` (`lib/application.js:152-178`) ->
  lines 169-170 perform the write. Mounted sub-apps rewire to their own layers
  on entry and `lib/application.js:233-234` restores the parent app's layers on
  exit.
- Activation: unconditional production path for every request handled by an
  express app (and for any req/res passed into `app.handle`). No guards or
  environment conditions.
- Scope and restoration: per-instance; affects every consumer (middleware,
  other libraries) that touches that req/res for the rest of the message's
  lifetime. Never restored to the bare core prototype — only ever switched
  between express app layers. Other server traffic, other `http.Server`s, and
  the shared core prototypes are unaffected.
- Resulting behavior: property lookups on req/res resolve express's additions
  first (`req.get`, `req.query`, `req.ip`, `res.send`, `res.json`,
  `res.redirect`, …, plus the `app` back-reference). Reproduction verified that
  the express layers shadow **zero** property names of the core prototype
  chains (`reqShadows: []`, `resShadows: []` on Node v24.19.0), so no core
  method's behavior is replaced — the override is purely additive, but it is a
  genuine write to core-backed instances that changes their prototype identity
  (`Object.getPrototypeOf(req) !== http.IncomingMessage.prototype`), which can
  surprise prototype-identity-sensitive code.
- Evidence: static trace above; dynamic proof via
  `node repro-core-mutation-check.js "$PACKAGE_ROOT"` — output:
  `reqProtoIsAppRequest: true`, `resProtoIsAppResponse: true`,
  `chainHasCoreProto: true`, no shared prototype/global diffs.
- Upstream: expressjs/express#6039 (open — documents that express req/res
  require extending core `http.IncomingMessage`/`http.ServerResponse`);
  expressjs/express#7427 (open — sub-app mounting and prototype restoration at
  `lib/application.js:233-234`). Node.js offers a documented alternative
  (`http.createServer({ IncomingMessage, ServerResponse })`,
  `$NODEJS_SOURCE/lib/http.js:69-70`, honored at
  `$NODEJS_SOURCE/lib/internal/http/server.js:526`) which express does not use.

### F-002: transient swap of `Error.prepareStackTrace` / `Error.stackTraceLimit` (depd)

- Category: shared global mutation — transient, synchronously saved and restored
- Library site(s): `$PACKAGE_ROOT/node_modules/depd/index.js:386-387` (write),
  `:395-396` (restore), inside `getStack()`.
  Pinned source: https://github.com/dougwilson/nodejs-depd/blob/v2.0.0/index.js#L380-L398
- Origin: transitive — express -> depd@2.0.0 (also reached via router@2.2.0 and
  http-errors@2.0.1, which create depd instances at require time)
- Core baseline: `Error.prepareStackTrace` is the V8/JS global stack-formatting
  hook (absent/`undefined` by default; Node core coordinates with it for
  source-map support); `Error.stackTraceLimit` defaults to 10.
- Exact mutation: `Error.prepareStackTrace = prepareObjectStackTrace` and
  `Error.stackTraceLimit = Math.max(10, limit)`; both restored to the saved
  originals before `getStack()` returns.
- Execution chain: `require('express')` -> `lib/response.js:17`
  `require('depd')('express')` -> `depd()` factory calls `getStack()`
  (`depd/index.js:107` region) -> swap/restore. Also runs on every deprecation
  log (`log()` -> `getStack()`), e.g. deprecated `res.redirect` argument forms.
- Activation: unconditional at module load; thereafter only when deprecated
  usage is logged.
- Scope and restoration: process-global `Error` object; window is confined to
  the synchronous body of `getStack()` (no awaits, no user callbacks inside the
  window), fully restored. Reproduction confirmed both properties are identical
  to their pre-require values after load and a request cycle.
- Resulting behavior: none observable to other consumers; during the window,
  `.stack` formatting semantics would differ, but only depd's own probe object
  is formatted inside the window.
- Evidence: static read of `depd/index.js:380-398`; reproduction output
  `prepareStackTrace restored: true`, `stackTraceLimit restored: true`.
- Upstream: standard depd technique (dougwilson/nodejs-depd v2.0.0); no issue
  needed — behavior is by design.

## Candidate ledger and unresolved questions

Full ledger in `candidates.md` (C-001 … C-040). Summary:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-005/C-006 | `lib/application.js:169-170,233-234` — live req/res `[[Prototype]]` | confirmed -> F-001 | write to core-backed instances; reproduction verified |
| C-026 | `depd/index.js:386-396` — `Error.prepareStackTrace`/`stackTraceLimit` | confirmed -> F-002 | transient save/restore; reachable at require time |
| C-019 | `on-finished/index.js:189-199` — instance wrapper over core `res.assignSocket` | rejected as reachable (dormant) | guard `msg.socket === undefined` never true: `$NODEJS_SOURCE/lib/internal/http/outgoing.js:187` initializes socket to `null`; modern `assignSocket` emits `'socket'` (`$NODEJS_SOURCE/lib/internal/http/server.js:319`); comment marks it a Node 0.8 workaround; express requires node >= 18 |
| C-025 | `once/once.js:5-19` — `Function.prototype.once`/`onceStrict` | rejected as patch (optional, never activated) | only applied by opt-in `once.proto()`; no caller anywhere in runtime scope (only once's README) |
| C-001…C-004, C-007, C-010…C-015, C-022, C-027…C-038 | library-owned objects built from / reading core (Object.create layers, merge-descriptors onto `app`, subclasses of `Stream`/`Transform`, setprototypeof polyfill, safer-buffer copy, intrinsic-capture family) | rejected as patch | object actually modified is library-owned; core objects only read |
| C-008, C-009, C-016…C-018, C-020, C-021, C-023, C-024, C-039 | instance property writes on live req/res (`req.res`, `res.locals`, `req.params`, `req.url` rewrite/restore, `req.body`, `req._parsedUrl`, `msg.__onFinished`, `res.statusCode`, …) | rejected as patch | metadata/state additions or documented API state writes; no core method/accessor replaced; `res.req` rewrite is value-identical to the core-set property (`$NODEJS_SOURCE/lib/internal/http/server.js:224`) |
| C-032 | `debug/src/node.js:205,209` — `process.env.DEBUG` | rejected as patch | env-var persistence inside opt-in `debug.enable()`; not invoked by express; environment state, not an API override |
| C-040 | remaining 35+ pure-function/data packages | rejected (negative sweeps) | all mutation-pattern sweeps negative across every runtime file |

Unresolved candidates: none.

## Supporting context

- Express's extension mechanism is prototype *layering*, not prototype
  *patching*: `lib/request.js:30` / `lib/response.js:43` create new
  library-owned objects inheriting from the core prototypes, and
  `lib/express.js:41` copies `EventEmitter.prototype` descriptors onto the
  library-owned `app` function (merge-descriptors writes only to the
  destination). Core prototypes are read, never written.
- Router rewrites `req.url`/`req.baseUrl` values during mounted routing and
  restores them (`router/index.js:183-202,323-332`) — mutation of core-set own
  data property *values* (request state), a long-standing connect/express
  convention, not an API replacement.
- Private API reads: `safer-buffer/safer.js:61` reads
  `process.binding('buffer').kStringMaxLength` inside try/catch (read-only,
  deprecated API probe). `parseurl` caches `req._parsedUrl` on the instance.
- Dormant patch capability shipped but unreachable in this scope:
  `once.proto()` (C-025) and on-finished's `patchAssignSocket` (C-019), both
  documented in the ledger. depd's `wrapfunction`/`wrapproperty` (descriptor
  rewrites on caller-passed objects) are never invoked by express, router, or
  http-errors — all three use plain `deprecate(message)` logging only.
- `lib/view.js:81` dynamically `require()`s user-configured template engines at
  render time — ordinary module loading of third-party code, not loader
  interception; engines are user-supplied and out of audit scope.
- `app.listen` (`lib/application.js:599`) uses documented
  `http.createServer(this)`; express does not use Node's documented
  `IncomingMessage`/`ServerResponse` constructor options, which would achieve
  F-001's effect without instance writes.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT/index.js`, `lib/**` (7 files, fully read) | skill patterns P1–P6 via `rg -n` (see searches.md) | all core-object writes resolved; only setPrototypeOf-on-instances writes core-backed objects |
| 63 resolved runtime deps (`$PACKAGE_ROOT/node_modules`, nested deps/tests excluded) | mutation sweeps: proto manipulation, defineProperty/assign, core-module/global assignment, module interception, patch keywords, Error stack APIs, deletes, env writes, req/res instance writes | negative except ledger items; `dunder-proto/set` never imported; no assignments onto core module exports or globals |
| `$NODEJS_SOURCE/lib/http.js:33,69-70,268,271` | targeted read | `IncomingMessage`/`ServerResponse` re-exported from `internal/http/*`; documented class-override server options |
| `$NODEJS_SOURCE/lib/internal/http/server.js:224,312-321,526,1375,1410` | targeted read | `res.req` set by core ctor; `assignSocket` emits `'socket'`; req/res instantiation with core prototypes |
| `$NODEJS_SOURCE/lib/internal/http/outgoing.js:130-202,285-316` | targeted read | ctor sets `this[kSocket] = null` (line 187) -> on-finished patch guard unreachable; `socket` is a prototype accessor |
| `$NODEJS_SOURCE/lib/internal/http/incoming.js:61-77`, `internal/http/common.js:94-97` | targeted read | server requests always constructed with a socket -> patch guard unreachable for req |
| Reproduction | `node repro-core-mutation-check.js "$PACKAGE_ROOT"` (Node v24.19.0; script beside this report) | no shared prototype/global diffs; instance rewiring confirmed; zero core-name shadowing; Error hooks restored |
| expressjs/express#6039 | https://github.com/expressjs/express/issues/6039 (open) | corroborates req/res dependence on core prototype inheritance |
| expressjs/express#7427 | https://github.com/expressjs/express/issues/7427 (open) | corroborates mount-time prototype switch/restore semantics |
| Library commit | `gh api repos/expressjs/express/commits/1c6f1b0…` | commit exists upstream: "test: expand coverage for request, response and view behavior (#7112)" |

Runtime file hashes (SHA-256, `$PACKAGE_ROOT`-relative):

```
4d2f5afc192178c5b0dc418d2da5826d52a8b6998771b011aede7fdba9118140  index.js
6d7e08355025786982d17042fc0355b6a5e9339545dc27e2782b3aaa28a7bc04  lib/application.js
4f35e8273a5e78c35e778d14e4a8c80a81ca3e1fc8047dc87d2077b860404572  lib/express.js
a9fda39c4472aeaa4d696f4324f58cc1d036f84ed04145d6d56a12a59578e751  lib/request.js
efe24afe2978d0bf2ad52d5b163a7af0d25d965e5dfc75979c4fcc883c60a510  lib/response.js
4bd3bf9c911e086d1911954708de7a6c384ed924360e3fd1d4a43c98bd68b112  lib/utils.js
74f4171b66263e22481820bc5975708f7dd8a61484f570aac7c5b4ab77ecbd79  lib/view.js
```

## Coverage and limitations

- Entry points: `index.js` -> `lib/express.js` (plus exported `lib/application.js`,
  `lib/request.js`, `lib/response.js`, `lib/utils.js`, `lib/view.js`); all read
  in full. Shipped files per package.json `files` are exactly these.
- Dependencies: all 63 installed runtime packages swept with every mutation
  pattern class across their runtime files (nested node_modules and tests
  excluded); entrypoint/initialization read in detail for router, finalhandler,
  on-finished, parseurl, send, serve-static, body-parser, raw-body, once,
  wrappy, depd, debug, iconv-lite, safer-buffer, setprototypeof, http-errors,
  merge-descriptors, inherits, and the qs/side-channel/get-intrinsic family.
  Pure data/function packages were excluded only after negative sweeps.
- Node.js baseline files: limited to the HTTP implementation files listed above
  at commit d44625a4b80; at this ref the implementation lives in
  `lib/internal/http/*` with `lib/_http_*.js` compatibility shims.
- Branches not exercised: ancient-Node compatibility paths (on-finished
  patchAssignSocket; setprototypeof `__proto__`/mixin fallbacks) cannot
  activate on express's supported engines (node >= 18); conclusions for them
  are static-only. User-supplied template engines, middleware, and view code
  can do anything and are out of audit scope.
- A tested reproduction branch cannot prove universal absence; the static
  sweeps are the primary negative evidence. Nothing material is missing; no
  access gaps.

## Changes since the previous audit

First audit from this pass (independent verification pass B; no prior report
read or reused, per double-blind protocol).
