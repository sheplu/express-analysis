# Node.js patch audit: express

- Verdict: **confirmed patching** (instance/application overrides and one transient global write; **no persistent mutation of shared Node.js core prototypes, core APIs, or module loading**)
- Status: complete
- Input: npm package `express` (pass A of double-blind protocol)
- Library: express 5.3.0, git commit 1c6f1b0fe4000977b9a7b4f34097e4d527dd9824 (github.com/expressjs/express, branch master), source checkout with runtime dependencies installed flat at `$PACKAGE_ROOT/node_modules` (`--ignore-scripts --omit=dev`); no local modifications
- Node.js baseline: main branch, commit d44625a4b80c672215b469906ce583ce7eeeebaf, unmodified checkout at `$NODEJS_SOURCE`
- Reproduction runtime: Node.js v24.19.0 (`node repro-proto-check.js "$PACKAGE_ROOT"`, script beside this report)
- Scope: production entrypoint `index.js` -> `lib/**` (all 6 files read in full) plus every resolved runtime dependency (62 installed packages; each entrypoint/init path checked, transitive imports followed at resolved versions). Tests, examples, benchmarks, docs excluded
- Coverage: source 100% of shipped express runtime files + all dependency runtime files swept with the full candidate pattern set; upstream corroborated via express git history and issue tracker; runtime verified by reproduction. No material gaps

## Patching verdict

Express demonstrably patches at the **instance/application override** level and does
**not** patch at the shared-core level:

- **Shared core mutations: 0 persistent, 1 transient.** No write to any Node core
  prototype (`http.IncomingMessage.prototype`, `http.ServerResponse.prototype`,
  `http.OutgoingMessage.prototype`), to any core module's exports, to `process`,
  `global`/`globalThis`, or `Buffer` exists anywhere in the shipped runtime tree
  (searches P-02/P-03, reproduction R-01). The one transient exception is F-002:
  the `depd` dependency saves, replaces, and synchronously restores
  `Error.prepareStackTrace`/`Error.stackTraceLimit` (global V8 stack-trace hooks)
  during `require('express')` and on each deprecation log.
- **Instance/application overrides: 1 (direct).** F-001: on every request, express
  replaces the prototype of the core-created `http.IncomingMessage` and
  `http.ServerResponse` instances with its own prototypes via
  `Object.setPrototypeOf` -- a deliberate, per-instance rewrite of how those
  core-backed objects resolve methods, bypassing Node's documented
  `createServer({IncomingMessage, ServerResponse})` extension point.
- **Core module interception: 0.** No `require.cache`/`require.extensions`/
  `Module._*`/loader-hook usage anywhere in the tree.
- **Core source rewrites: 0.**
- Unresolved candidates: none. Dormant (inactive) candidates that limit nothing on
  the supported baseline: on-finished's node-0.8 `patchAssignSocket` branch and
  `once.proto()` (both proven unreachable/not activated, see ledger C-022/C-024).

## Confirmed Node.js patches

### F-001: Per-request prototype replacement of core `http.IncomingMessage`/`http.ServerResponse` instances

- Category: instance or application override (core-backed instance prototype replacement); **not** a shared core mutation
- Library site(s): `lib/application.js:169-170` (`app.handle`); restore path `lib/application.js:233-234` (`app.use` mounted sub-app) -- https://github.com/expressjs/express/blob/1c6f1b0fe4000977b9a7b4f34097e4d527dd9824/lib/application.js#L169-L170
- Origin: direct (express core)
- Core baseline: `$NODEJS_SOURCE/lib/internal/http/incoming.js:61+` (`IncomingMessage` instances are created with `IncomingMessage.prototype`), `$NODEJS_SOURCE/lib/internal/http/server.js:1375` (`res = new server[kServerResponse](req, ...)`), rev d44625a4b80. Original behavior: req/res resolve all methods through the unmodified core prototype chain; Node's documented way to customize is the server constructor options `IncomingMessage`/`ServerResponse` (`$NODEJS_SOURCE/lib/internal/http/server.js:526-527`, typedef in `lib/http.js:69-70`)
- Exact mutation: `Object.setPrototypeOf(req, this.request)` and `Object.setPrototypeOf(res, this.response)` -- the instance's `[[Prototype]]` slot is overwritten with the app-specific objects created in `lib/express.js:45-52`, which themselves inherit from library objects (`lib/request.js:30`, `lib/response.js:43`) that inherit from the core prototypes
- Execution chain: `require('express')()` -> `app.listen`/user server -> `'request'` event -> `app(req,res)` -> `app.handle(req,res)` (lib/application.js:152) -> setPrototypeOf writes; additionally on sub-app boundaries via `mounted_app` (lib/application.js:230-237)
- Activation: unconditional in production on every request handled by an express app; no guards, no opt-out
- Scope and restoration: per-instance (the two objects of the current request only); permanent for the lifetime of those instances (sub-app mounting re-swaps between express-owned prototypes, never back to the bare core prototypes). Other server consumers sharing the same req/res (e.g. middleware outside express, 'request' listeners) observe the swapped prototype
- Resulting behavior: before -- `Object.getPrototypeOf(req) === http.IncomingMessage.prototype`; after -- `=== app.request`, adding ~20 methods/getters per object (`req.get`, `req.query`, `res.send`, `res.json`, ...) and the `app` property. No core method is shadowed (express's names are disjoint from core's `setHeader`/`getHeader`/`writeHead`/... set), so core behavior continues through the lengthened chain; the practical effects are the express API surface, megamorphic-shape/perf impact, and breakage when req/res are not genuine core-backed objects (upstream #6039)
- Evidence: static (sites above; inventory T-01 shows every other express write targets library objects) and reproduction R-01 (Node v24.19.0): inside a live handler `Object.getPrototypeOf(req) === app.request` is true, chain reaches `IncomingMessage.prototype` two hops up, and the core prototypes' own-descriptor sets are byte-identical before/after a full request cycle
- Upstream: commit 78e50547 (2014-07-14, "Refactor away init middleware") moved the swap from connect-style init middleware into `app.handle`; commit 8cb53ea5 / PR #6081 (2024-10-22) switched to native `Object.setPrototypeOf`; issues expressjs/express#6039 (open -- req/res must extend the core classes) and #7427 (open -- sub-app prototype restoration) document the design and its edges

### F-002: Transient replacement of global `Error.prepareStackTrace` / `Error.stackTraceLimit` by depd

- Category: shared global mutation, transient (save/replace/restore within one synchronous call)
- Library site(s): `node_modules/depd/index.js:386-387` (write), `:395-396` (restore) in `getStack()` -- https://github.com/dougwilson/nodejs-depd/blob/v2.0.0/index.js#L382-L397
- Origin: transitive -- express -> depd@2.0.0 (also express -> router@2.2.0 -> depd, express -> http-errors@2.0.1 -> depd, express -> send -> http-errors -> depd)
- Core baseline: `Error.prepareStackTrace`/`Error.stackTraceLimit` are V8-exposed global hooks on the `Error` constructor (undefined / 10 by default); Node core and user code rely on them process-wide
- Exact mutation: `Error.prepareStackTrace = prepareObjectStackTrace` (returns raw CallSite array) and `Error.stackTraceLimit = Math.max(10, limit)`, then `Error.captureStackTrace(obj)`, then both restored to the saved originals
- Execution chain: `require('express')` -> `lib/response.js:17` `require('depd')('express')` (likewise `router/index.js:21`, `router/lib/layer.js`, `http-errors/index.js:15`) -> `depd(namespace)` -> `getStack()` -> writes; also re-executed by `log()` every time a deprecated express API is used (e.g. `res.redirect` with non-string url, lib/response.js:827-835)
- Activation: unconditional at import time in production; repeated per deprecation emission
- Scope and restoration: process-global `Error` constructor; restored synchronously a few statements later in the same tick -- no persistent change, but any concurrently-installed accessor/instrumentation on `Error.prepareStackTrace` observes (or interferes with) the write
- Resulting behavior: during the window, any stack capture would be formatted by depd's hook; after restore, identical to before. Practical effect is nil in normal single-threaded execution; it is still a genuine reachable write to a shared global API
- Evidence: static (only 4 global-write hits in the entire runtime tree, all these lines -- search P-02); reproduction R-02 (accessor-instrumented `Error.prepareStackTrace` made `require(express)` crash at depd/index.js:393, proving the write executes at import) and R-01 (sentinel values restored exactly after require)
- Upstream: long-standing depd implementation (v2.0.0, 2018); same save/restore pattern Node core itself uses internally; no express-side issue proposes removing it

No other confirmed patches. Everything else in the tree writes only to library-owned
objects or adds instance metadata (see ledger).

## Candidate ledger and unresolved questions

Full ledger with per-candidate evidence: `candidates.md` (same directory). Summary:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001/C-002 | lib/application.js:169-170, 233-234 -- setPrototypeOf on core-backed req/res | confirmed -> F-001 | Static + repro R-01 |
| C-012/C-020 | lib/response.js:17 -> depd/index.js:386-396 -- Error.prepareStackTrace/stackTraceLimit | confirmed -> F-002 | Static + repro R-01/R-02 |
| C-003 | lib/application.js:165-166,174 -- req.res/res.req/res.locals on core instances | rejected as patch | Metadata additions; supporting context |
| C-004/C-005 | lib/request.js:30 / lib/response.js:43 -- Object.create(core prototype) + method defs | rejected | Writes land on library-owned objects; core prototypes unchanged (R-01) |
| C-006 | lib/express.js:41-42 -- merge-descriptors from EventEmitter.prototype | rejected | Source only read; destination is library `app` |
| C-022 | on-finished@2.4.2 index.js:189-199 -- instance wrap of core `assignSocket` | rejected (dormant) | node-0.8-only guard `msg.socket === undefined` unreachable: OutgoingMessage sets `kSocket = null` (outgoing.js:187,304-314); IncomingMessage gets a socket (incoming.js) |
| C-024 | once@1.4.0 once.js:5-19 -- Function.prototype.once/onceStrict | rejected (not activated) | Opt-in `once.proto()` never called in tree (T-03); Function.prototype unchanged (R-01) |
| C-025 | safer-buffer safer.js:12-25,61 -- Buffer copy + process.binding read | rejected | Copies into own object; private API read only |
| C-021 | depd wrapfunction/wrapproperty | rejected | No caller in tree (T-05) |
| C-026-C-045 | parseurl, router, http-errors, finalhandler, send, serve-static, body-parser, raw-body, unpipe, ee-first, iconv-lite, debug, qs, setprototypeof, intrinsics family, header/mime utilities | rejected | Instance metadata, library-owned objects, or public core API calls only -- per-candidate reasons in candidates.md |

Unresolved: none.

## Supporting context

- **Instance metadata on core-backed objects (not patches):** express sets
  `req.res`, `res.req`, `res.locals` (lib/application.js:165-174); router sets
  `req.next/baseUrl/originalUrl/params/route` and rewrites the `req.url` data
  property during prefix routing (router/index.js:174-332 -- `req.url` is a plain
  instance data property core assigns once and does not re-read for its own
  behavior); body-parser sets `req.body`; parseurl caches `req._parsedUrl`/
  `req._parsedOriginalUrl`; on-finished stores `msg.__onFinished`. All additive
  data writes under the standard Node middleware contract.
- **Private core API reads:** raw-body reads `stream._readableState`/`_decoder`
  for an encoding sanity check (index.js:176-178); safer-buffer reads
  `process.binding('buffer').kStringMaxLength` in a try/catch (safer.js:61).
  Reads only; brittle against internals changes but not patches.
- **Dormant legacy branches:** on-finished `patchAssignSocket` (node 0.8),
  unpipe's pre-`stream.unpipe` listener-removal fallback (node 0.8),
  setprototypeof's `__proto__`/copy fallbacks, `once.proto()`. None reachable or
  activated on the supported baseline (express requires Node >= 18).
- **Unused documented extension point:** Node supports
  `http.createServer({ IncomingMessage, ServerResponse })`
  ($NODEJS_SOURCE/lib/internal/http/server.js:526-527) for exactly the kind of
  API extension express achieves with F-001; express predates and does not use it.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| $PACKAGE_ROOT shipped files | full reads of index.js, lib/*.js (6 files) | Complete express runtime inventory; only C-001..C-012 candidates |
| $PACKAGE_ROOT runtime tree | skill pattern sweeps P-01..P-06 + targeted T-01..T-09 (see searches.md) | P-05 (module interception): zero hits; P-02 (global writes): only depd Error.* lines; P-03 (prototype writes): no core target |
| $NODEJS_SOURCE/lib/http.js, _http_incoming.js, internal/http/{incoming,outgoing,server}.js | targeted greps/reads at d44625a4b80 | Core req/res construction, `socket` null-init and accessor, `assignSocket` original, documented ServerResponse/IncomingMessage server options |
| express history | `git log -S 'setPrototypeOf' -- lib/application.js lib/middleware` | 78e50547 (2014) introduced swap in app.handle; 8cb53ea5/#6081 (2024) native setPrototypeOf |
| expressjs/express issues | `gh search issues --repo expressjs/express "setPrototypeOf"` | #6039 (open): req/res must extend core http classes -- confirms F-001 design; #7427 (open): sub-app restoration edge |
| Reproduction | `node repro-proto-check.js "$PACKAGE_ROOT"` (Node v24.19.0) | Core prototypes + Function.prototype/Object.prototype descriptor-identical after request cycle; instance protos swapped; Error hooks restored; variant run proved depd's write fires at import |

## Coverage and limitations

- Entry points covered: `index.js` -> `lib/express.js` and every file it loads;
  all public export paths (`express.json/raw/text/urlencoded` -> body-parser,
  `express.static` -> serve-static, `express.Router/Route` -> router).
- Dependencies: all 62 installed packages enumerated with pinned versions;
  mutation-pattern sweeps covered every runtime JS file in the tree; entrypoint/
  init paths of all 28 direct deps and all transitive runtime deps individually
  accounted for in candidates.md. Browser-only artifacts (`inherits_browser.js`,
  `qs/dist/qs.js`, `ipaddr.min.js`) are not loaded by the Node entrypoints;
  they were swept anyway and contained the same (clean) logic.
- Node baseline is the main branch (d44625a4b80), newer than any released line;
  the relevant contracts (instance construction, socket null-init, assignSocket,
  server class options) were introduced well before Node 18, so conclusions hold
  across express's supported range. Per-release Node lines were not individually
  re-verified (would not change the verdict).
- Reproduction ran on Node v24.19.0 only; static evidence is version-independent.
- Out of scope: express tests/examples/benchmarks; devDependencies; optional
  template engines loaded by `lib/view.js:81` (third-party, app-chosen).
- What would change the verdict: a caller of `once.proto()`, depd
  `deprecate.function/property` applied to a core object, or activation of
  on-finished's legacy branch -- none exist at this revision.

## Changes since the previous audit

First audit (pass A of double-blind protocol); no previous report at this path.
