# Node.js patch audit: body-parser

- Verdict: confirmed patching (one transient shared-global mutation, transitive via depd; no persistent patching)
- Status: complete
- Input: npm package `body-parser` (Node.js request body parsing middleware), pass A of a double-blind protocol
- Library: body-parser 2.4.0, git commit 151a0d9e72682662fd32b439da4693b4459a70b3 (https://github.com/expressjs/body-parser, branch master), source checkout with runtime dependencies installed at `$PACKAGE_ROOT/node_modules` (`--ignore-scripts --omit=dev`)
- Node.js baseline: main branch, commit d44625a4b80c672215b469906ce583ce7eeeebaf (`$NODEJS_SOURCE`)
- Reproduction runtime: Node.js 24 (v24.19.0); commands shown as `node <script> "$PACKAGE_ROOT"`
- Scope: production/runtime code only (`index.js`, `lib/**`) plus all 37 resolved runtime dependencies; tests/examples/docs out of scope
- Coverage: source complete; all 37 dependency entrypoints inspected or pattern-scanned; targeted Node.js baseline reads complete; upstream corroboration via read-only issue search; two local reproductions run

## Patching verdict

**Confirmed patching — exactly one finding, transient and transitive.** The dependency
chain `body-parser -> http-errors@2.0.1 -> depd@2.0.0` executes `depd`'s `getStack()`
unconditionally at `require('body-parser')` time. `getStack()` assigns the shared
globals `Error.prepareStackTrace` and `Error.stackTraceLimit`, captures one stack,
and synchronously restores both (F-001). This is a shared core/global mutation by
the skill's definition (Node core consults `Error.prepareStackTrace` at
`$NODEJS_SOURCE/lib/internal/errors.js:149-150`), but it is save/restore-scoped,
uses a documented assignable V8/Node hook, and leaves no persistent change in the
normal path. Auditors applying a "supported extension point" reading could
reasonably classify it as non-patching; it is reported as confirmed here because it
is a demonstrated, reachable write to a shared global that overrides stack-trace
behavior while in effect.

Counts:
- Shared core/global mutations: 1 (F-001, transient, restored; transitive origin)
- Core-backed instance/application overrides: 0 reachable. One dormant site exists
  in dependency code (`on-finished` `patchAssignSocket`, C-007) but is statically
  unreachable through body-parser's call paths and targets Node 0.8 behavior.
- Core module loading interception: 0
- Core source rewrites: 0
- Unresolved candidates: 0

body-parser's own first-party code performs no patching: its only writes to
core-backed objects are the documented middleware pattern `req.body = ...`
(`$PACKAGE_ROOT/lib/read.js:53,194`), which adds request metadata and replaces no
core behavior.

## Confirmed Node.js patches

### F-001: Transient replacement of `Error.prepareStackTrace` and `Error.stackTraceLimit` (depd `getStack`)

- Category: shared core/global mutation (transient, save/restore)
- Library site(s): `$PACKAGE_ROOT/node_modules/depd/index.js:381-398` — writes at
  lines 386 (`Error.prepareStackTrace = prepareObjectStackTrace`) and 387
  (`Error.stackTraceLimit = Math.max(10, limit)`); restores at lines 395-396.
  Upstream source: https://github.com/dougwilson/nodejs-depd (v2.0.0, `index.js`).
- Origin: transitive — body-parser 2.4.0 -> http-errors@2.0.1
  (`$PACKAGE_ROOT/node_modules/http-errors/index.js:15`,
  `var deprecate = require('depd')('http-errors')`) -> depd@2.0.0
  (`depd/index.js:108` calls `getStack()` inside the `depd()` factory).
- Core baseline: `Error.prepareStackTrace` is the V8 stack-trace API hook that
  Node.js core itself consults when formatting stacks —
  `$NODEJS_SOURCE/lib/internal/errors.js:149-150` (`if (typeof
  globalThis.Error?.prepareStackTrace === 'function') return
  globalThis.Error.prepareStackTrace(error, trace)`), at commit d44625a4b80.
  `Error.stackTraceLimit` is the documented global frame-count limit. Both are
  process-wide singletons; default `prepareStackTrace` is unset (string formatting).
- Exact mutation: data-property assignment on the global `Error` constructor:
  `Error.prepareStackTrace` <- depd's `prepareObjectStackTrace` (returns the raw
  `CallSite[]` instead of a formatted string); `Error.stackTraceLimit` <-
  `Math.max(10, previous)`. Both prior values are saved to locals and written back
  after one `Error.captureStackTrace(obj)` + `obj.stack` materialization.
- Execution chain: `require('body-parser')` (`$PACKAGE_ROOT/index.js:27`) ->
  `lib/types/json.js:16` -> `lib/read.js:14` `require('http-errors')` ->
  `http-errors/index.js:15` `require('depd')('http-errors')` ->
  `depd/index.js:108` `getStack()` -> writes at `depd/index.js:386-387`.
  Also re-executed at every deprecation emission (`depd/index.js:199`, `log()`),
  reachable in this scope only via `createError` with a status outside 4xx/5xx
  (`http-errors/index.js:73`).
- Activation: unconditional at module load; no guards, no environment flags.
- Scope and restoration: process-global while set; restored synchronously two
  statements later. No `await`/IO occurs inside the window, so no other code can
  observe the swap in normal operation. The restore is NOT exception-safe (no
  `try/finally`): if stack materialization throws, the hook stays replaced —
  observed only under artificial instrumentation (see Evidence), not in normal
  operation.
- Resulting behavior: during the window, any `error.stack` materialization would
  produce a `CallSite[]` instead of a string and capture >=10 frames; after
  restore, behavior is unchanged. Known real-world interaction: this pattern
  conflicts with Node's `--enable-source-maps` stack processing
  (dougwilson/nodejs-depd#36).
- Evidence:
  - Static: writes/restore visible at `depd/index.js:382-396`; factory call at
    `depd/index.js:108`; load chain above.
  - Reproduction 1 (`node repro-error-hook-write.js "$PACKAGE_ROOT"`, Node 24):
    accessor instrumentation recorded `Error.prepareStackTrace <- function
    prepareObjectStackTrace` and `Error.stackTraceLimit <- 10` during
    `require($PACKAGE_ROOT)`; the instrumented run also throws inside
    `depd/index.js:393`, independently proving `getStack()` executes at load time
    (and demonstrating the missing `finally`).
  - Reproduction 2 (`node repro-restore-check.js "$PACKAGE_ROOT"`, Node 24,
    un-instrumented control): after require, `prepareStackTraceUnchanged: true`,
    `stackTraceLimitUnchanged: true` — normal-path restoration confirmed.
- Upstream: dougwilson/nodejs-depd#32 "Why is this library overwriting Error
  type?" (closed) discusses exactly this behavior; dougwilson/nodejs-depd#36
  (closed) documents the `--enable-source-maps` incompatibility; depd#50 (open)
  shows breakage when another `prepareStackTrace` interferes. The behavior is
  present and current in the audited depd@2.0.0.

No other confirmed patches. body-parser itself, and its other 36 resolved
dependencies, perform no reachable write or replacement of core APIs, globals,
shared prototypes, core-backed instances, module loading, or core source.

## Candidate ledger and unresolved questions

Full ledger with reasons in `candidates.md` (same directory). Summary:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | `lib/read.js:52-53,194` — `req.body` write on `http.IncomingMessage` | rejected as patch | adds request metadata; documented middleware pattern; no core method/prototype replaced |
| C-002 | `lib/read.js:119,151,165-171,249` — `req.pipe/unpipe/resume` | rejected | public stream API calls, no assignment |
| C-003 | `node_modules/depd/index.js:386-387` — `Error.prepareStackTrace`/`stackTraceLimit` | confirmed -> F-001 | transient shared-global write, load-time activation, reproduced |
| C-004 | `depd/index.js:485` — `wrapproperty` `Object.defineProperty(obj, ...)` | rejected | caller-supplied object; never invoked in scope (http-errors uses only `deprecate(message)`) |
| C-005 | `depd/index.js:62` — `convertDataDescriptorToAccessor` | rejected | only reachable from `wrapproperty`; not activated |
| C-006 | `depd/index.js:496-521` — defineProperty on `DeprecationError` instance | rejected | library-created `new Error()` instance |
| C-007 | `on-finished/index.js:189-198` — `res.assignSocket = _assignSocket` wrapper over `ServerResponse.prototype.assignSocket` (`$NODEJS_SOURCE/lib/internal/http/server.js:312`) | rejected (unreachable in scope) | body-parser calls `onFinished` only on `req` (IncomingMessage): `socket` is set at construction (`$NODEJS_SOURCE/lib/internal/http/incoming.js:77`) and IncomingMessage has no `assignSocket`, so both guards (`msg.socket === undefined`, `typeof assignSocket === 'function'`) block the write; Node 0.8-era branch |
| C-008 | `on-finished/index.js:147,164` — `msg.__onFinished` | rejected | library-owned metadata property on instance |
| C-009 | `http-errors/index.js:139,208` — `setPrototypeOf(err, ...)` | rejected | prototype surgery on freshly created, library-owned `new Error(msg)` before return; `Error.prototype` itself untouched |
| C-010 | `http-errors/index.js:142-157,211-226` — defineProperty `err.message/name` | rejected | own instance properties |
| C-011 | `http-errors/index.js:249` — `nameFunc` defineProperty | rejected | library-owned constructors |
| C-012 | `setprototypeof/index.js:3-17` | rejected | exports native `Object.setPrototypeOf` on Node >= 18; polyfill branches dead; in-scope callers pass library objects only |
| C-013 | `safer-buffer/safer.js:25` — `safer.Buffer.prototype = Buffer.prototype` | rejected | write lands on library-owned `Safer` object; core `Buffer.prototype` only read |
| C-014 | `safer-buffer/safer.js:61` — `process.binding('buffer')` | rejected | read-only deprecated-private-API access in try/catch; no mutation |
| C-015 | `iconv-lite/lib/streams.js:19,66` — prototypes from `Transform.prototype` | rejected | documented stream subclassing (`_transform`/`_flush`); library-owned constructors; no `extendNodeEncodings` in 0.7.3 |
| C-016 | `iconv-lite/lib/index.js:140-172` — auto `enableStreamingAPI(require('stream'))` | rejected | writes only to iconv's own `module.exports` |
| C-017 | `raw-body/index.js:176-177` — `stream._readableState`/`stream._decoder` | rejected | read-only private field access (fields at `$NODEJS_SOURCE/lib/internal/streams/readable.js:333-334`); no write |
| C-018 | `unpipe/index.js:51-67` — legacy close-listener invocation | rejected | invokes existing core cleanup listeners; no method reassignment; dead branch on streams with native `unpipe` |
| C-019 | `debug/src/node.js:205,209` — `process.env.DEBUG = ...` / `delete` | rejected | documented-mutable `process.env` data write; at load (`debug/src/common.js:287`) it round-trips the existing value; no API behavior replaced |
| C-020 | `debug/src/common.js:122` — defineProperty on own `debug` function | rejected | library-owned object |
| C-021 | `content-type/dist/index.js:29` — `C.prototype = Object.create(null)` | rejected | local null-object constructor |
| C-022 | `function-bind/implementation.js:78-80` | rejected | own bound function; `index.js` exports native `Function.prototype.bind` |
| C-023 | `get-intrinsic/index.js` (e.g., :159) — `INTRINSICS[...] = ...` | rejected | reads intrinsics into its own table; `Function(...)` eval used for reads only; whole es-helper family (es-errors, es-object-atoms, es-define-property, math-intrinsics, get-proto, gopd, has-symbols, hasown, call-bind-apply-helpers, call-bound) is read-only |
| C-024 | `dunder-proto/set.js:10,32` — `obj.__proto__ = proto` | rejected | mutator module not required by any module in this tree (only `dunder-proto/get` is); targets would be caller objects anyway |
| C-025 | `inherits/inherits.js` | rejected | exports core `util.inherits`; applied to library constructors |
| C-026 | `lib/types/urlencoded.js:103` — `qs.parse(..., { allowPrototypes: true })` | rejected | affects qs-created parse-result objects only; never mutates shared prototypes; app-level hardening consideration, not a core patch |
| C-027 | `es-define-property/index.js`, `gopd/index.js` feature tests | rejected | operate on fresh literals |
| C-028 | `on-finished/index.js`, `raw-body/index.js` — `AsyncResource.runInAsyncScope.bind` wrap | rejected | supported async_hooks API usage; no core object modified |

Unresolved: none.

## Supporting context

- Private API reads (no mutation): raw-body reads `stream._readableState.encoding`
  / `.decoder` and legacy `stream._decoder` to reject streams with a string
  encoding set (`raw-body/index.js:170-181`); baseline fields exist at
  `$NODEJS_SOURCE/lib/internal/streams/readable.js:333-334` (set via
  `Readable.prototype.setEncoding`, line 631). safer-buffer reads
  `process.binding('buffer').kStringMaxLength` in try/catch
  (`safer-buffer/safer.js:61`), loaded because iconv-lite 0.7.3 still depends on
  safer-buffer. Breakage risk if Node removes these privates, but no patching.
- Core-backed instance metadata: `req.body` (body-parser), `msg.__onFinished`
  (on-finished) — added properties, standard Express/jshttp pattern. Note
  body-parser 2.4.0 no longer uses the historical `req._body` flag (zero
  occurrences in runtime code).
- Dormant 0.8-era override in dependency code: `on-finished`'s
  `patchAssignSocket` (C-007) is a genuine per-instance wrapper of a core
  prototype method when triggered, but is unreachable through body-parser
  (IncomingMessage-only call sites) and targets Node 0.8 `ServerResponse`
  'socket'-event behavior that modern Node does not exhibit.
- `Error.captureStackTrace(err, ...)` uses (http-errors, depd) are documented V8
  API calls writing only to library-owned error instances.
- debug's `process.env.DEBUG` write (C-019) mutates documented-mutable process
  state; at body-parser load it rewrites the pre-existing value (or deletes an
  absent key), an effective no-op.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` runtime files | `rg -n` pattern sweeps per skill (see `searches.md`) | no prototype/defineProperty/loader-hook/global writes in first-party code; only `req.body` writes |
| `$PACKAGE_ROOT/node_modules` (37 packages) | scoped `rg -n --no-ignore` sweeps + per-entrypoint reads (see `searches.md`) | all candidate writes traced; only depd writes a shared global |
| depd@2.0.0 | `$PACKAGE_ROOT/node_modules/depd/index.js` | F-001 write/restore sites and load-time activation |
| Node baseline: errors | `$NODEJS_SOURCE/lib/internal/errors.js:91-150` | core consults user `Error.prepareStackTrace`; confirms shared-hook status |
| Node baseline: http server | `$NODEJS_SOURCE/lib/internal/http/server.js:312` (re-exported via `lib/_http_server.js`) | `ServerResponse.prototype.assignSocket` baseline for C-007 |
| Node baseline: http incoming | `$NODEJS_SOURCE/lib/internal/http/incoming.js:77` | `this.socket = socket` at construction; no `assignSocket` — C-007 unreachable |
| Node baseline: streams | `$NODEJS_SOURCE/lib/internal/streams/readable.js:333-334,631` | `_readableState.encoding/.decoder` are real private fields; raw-body reads only |
| Upstream depd | `gh search issues --repo dougwilson/nodejs-depd "prepareStackTrace"` | #32 (closed, "Why is this library overwriting Error type?"), #36 (closed, source-maps incompatibility), #50 (open) — corroborate F-001 |
| Upstream on-finished | `gh search issues --repo jshttp/on-finished "assignSocket"` | no issue on the 0.8 patch branch; code comment "node.js 0.8 patch" is the primary documentation |
| Reproduction 1 | `node repro-error-hook-write.js "$PACKAGE_ROOT"` (Node 24) | captured both writes during require; crash inside `depd/index.js:393` under instrumentation proves load-time execution and non-exception-safe restore |
| Reproduction 2 | `node repro-restore-check.js "$PACKAGE_ROOT"` (Node 24) | un-instrumented control: both globals identical before/after require |

## Coverage and limitations

- Entry points covered: `index.js` and all `exports` targets (`lib/types/json.js`,
  `raw.js`, `text.js`, `urlencoded.js`, `lib/read.js`, `lib/utils.js`). No install
  scripts (deps installed with `--ignore-scripts`; package defines none).
- All 37 resolved runtime dependencies covered: bytes 3.1.2, call-bind-apply-helpers
  1.0.2, call-bound 1.0.4, content-type 2.1.0, debug 4.4.3, depd 2.0.0,
  dunder-proto 1.0.1, ee-first 1.1.1, es-define-property 1.0.1, es-errors 1.3.0,
  es-object-atoms 1.1.2, function-bind 1.1.2, get-intrinsic 1.3.0, get-proto 1.0.1,
  gopd 1.2.0, has-symbols 1.1.0, hasown 2.0.4, http-errors 2.0.1, iconv-lite 0.7.3,
  inherits 2.0.4, math-intrinsics 1.1.0, media-typer 1.1.1, ms 2.1.3,
  object-inspect 1.13.4, on-finished 2.4.2, qs 6.17.1, raw-body 3.0.2,
  safer-buffer 2.1.2, setprototypeof 1.2.0, side-channel 1.1.1, side-channel-list
  1.0.1, side-channel-map 1.0.1, side-channel-weakmap 1.0.2, statuses 2.0.2,
  toidentifier 1.0.1, type-is 2.1.0, unpipe 1.0.0. High-risk entrypoints
  (iconv-lite, raw-body, on-finished, unpipe, depd, http-errors, debug, qs,
  safer-buffer, setprototypeof, get-intrinsic family, side-channel family) were
  read in full or in their initialization paths; the rest were entry-scanned plus
  covered by tree-wide write-pattern sweeps.
- `qs` ships a bundled `dist/qs.js` (browser bundle, not the `main: lib/index.js`
  entry); its contents are bundled copies of the same audited helpers and are not
  loaded by Node resolution — excluded from the verdict, included in sweeps.
- Node.js baseline reads were targeted (errors, http server/incoming, streams
  readable) at commit d44625a4b80; no whole-tree scans. The Node baseline is the
  main branch, newer than any released line; `assignSocket` now lives under
  `lib/internal/http/server.js` (re-exported through `lib/_http_server.js`), which
  does not change any conclusion.
- Reproductions ran on Node v24.19.0. Untested branches: iconv-lite non-stream
  environments, setprototypeof/function-bind polyfill branches for pre-ES2015
  engines, on-finished Node 0.8 branch — all statically shown dead or unreachable
  on supported Node (>= 18 per `package.json` engines).
- What would change the verdict: removal of depd from http-errors (or http-errors
  from the dependency graph) would downgrade the verdict to "no confirmed patching
  in the inspected scope"; conversely, a caller passing a `ServerResponse` with
  `socket === undefined` into on-finished is outside body-parser's code paths but
  would activate C-007 at the application level.

## Changes since the previous audit

First audit (pass A of the double-blind protocol); no previous report existed in
this output directory.
