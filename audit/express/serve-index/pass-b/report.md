# Node.js patch audit: serve-index

- Verdict: confirmed patching (one transitive, temporary shared-global mutation; no permanent patches)
- Status: complete
- Input: npm package `serve-index` (Express directory listing middleware), local source at `$PACKAGE_ROOT`
- Library: serve-index 1.9.2, git clone of https://github.com/expressjs/serve-index, branch master, commit fc0c0abd890e79c3f16b0ea9cf49551b3ee66ecb; runtime dependencies installed at `$PACKAGE_ROOT/node_modules` (accepts@1.3.8, batch@0.6.1, debug@2.6.9, depd@1.1.2, escape-html@1.0.3, http-errors@1.8.1, inherits@2.0.4, mime-db@1.52.0, mime-types@2.1.35, ms@2.0.0, negotiator@0.6.3, parseurl@1.3.3, setprototypeof@1.2.0, statuses@1.5.0, toidentifier@1.0.1); no local modifications observed
- Node.js baseline: v28.0.0-pre, `$NODEJS_SOURCE` at commit d44625a4b80c672215b469906ce583ce7eeeebaf (main branch)
- Reproduction runtime: Node.js v24.19.0 (`node pass-b/repro-error-swap.js "$PACKAGE_ROOT"`)
- Scope: production/runtime code only — `$PACKAGE_ROOT/index.js` (692 lines) plus all 15 installed runtime dependencies' entrypoints/initialization and the code serve-index activates in each; `public/` assets are runtime data (read-only `fs.readFile`/`fs.readFileSync` loads, no executable content); tests/docs out of scope
- Coverage: source — full read of index.js and every dependency runtime file listed below; upstream — depd issues #32 and #36 corroborated via GitHub; runtime — one instrumented require() reproduction (static proof primary)

## Patching verdict

**Confirmed patching: one finding (F-001), transitive, a temporary save-and-restore
mutation of the shared global `Error` constructor.** Requiring `serve-index`
loads `http-errors@1.8.1`, which loads and invokes `depd@1.1.2`. depd's stack
capture temporarily replaces `Error.prepareStackTrace` and raises
`Error.stackTraceLimit` on the global `Error` object, then restores both in the
same synchronous block. This fires three times during
`require('serve-index')` (verified by instrumented reproduction) and again on
every deprecation message depd logs process-wide.

Counts:

- Shared core mutations: 1 (F-001, temporary, restored; transitive via
  http-errors -> depd).
- Instance/application overrides: 0 confirmed. Instance-level writes exist on
  library-created objects only (http-errors re-prototyping its own `Error`
  instances; debug configuring sockets/streams it constructs under a
  non-default `DEBUG_FD`; parseurl caching on `req`). None override a core
  member on a core-provided object; see supporting context.
- Core module loading interception: 0. Core source rewrites: 0.
- Unresolved candidates: 0. All 23 ledger entries resolved (see
  `candidates.md` beside this report for the full ledger).

No permanent, process-visible redefinition of Node.js behavior remains after
any serve-index code path completes. serve-index's own per-request path never
triggers a deprecation, so after module load the swap does not recur from this
package's usage (it can recur from any other in-process depd consumer).

## Confirmed Node.js patches

### F-001: `Error.prepareStackTrace` / `Error.stackTraceLimit` — temporary replacement on the global `Error` constructor (depd stack capture)

- Category: shared core mutation (temporary, synchronous save/restore)
- Library site(s):
  - `$PACKAGE_ROOT/node_modules/depd/index.js:365-383` (`getStack()`: saves both values, sets `Error.prepareStackTrace = prepareObjectStackTrace` and `Error.stackTraceLimit = Math.max(10, limit)`, calls `Error.captureStackTrace(obj)`, reads `obj.stack`, restores both)
  - `$PACKAGE_ROOT/node_modules/depd/lib/compat/index.js:21-43` (lazy `callSiteToString` getter: same swap with `Error.stackTraceLimit = 2`)
  - Pinned source: https://github.com/dougwilson/nodejs-depd/blob/v1.1.2/index.js#L365-L383 and https://github.com/dougwilson/nodejs-depd/blob/v1.1.2/lib/compat/index.js#L21-L43
- Origin: transitive — serve-index -> http-errors@1.8.1 -> depd@1.1.2
- Core baseline: `Error.prepareStackTrace` is undefined by default and, when set, is consulted by Node's per-realm stack preparation callback — `$NODEJS_SOURCE/lib/internal/errors.js:136-162` (`prepareStackTraceCallback` calls `globalThis.Error.prepareStackTrace(error, trace)` when it is a function, otherwise falls back to the internal implementation); `Error.stackTraceLimit` (default 10) bounds V8 frame capture and is read/managed by core, e.g. `$NODEJS_SOURCE/lib/internal/errors.js:181-188,248-254`
- Exact mutation: data-property assignment on the global `Error` constructor: key `prepareStackTrace` set to depd's `prepareObjectStackTrace` (returns the raw CallSite array instead of a formatted string); key `stackTraceLimit` set to `Math.max(10, limit)` (index.js) or `2` (compat). Both keys are restored to the saved originals before `getStack()`/the getter returns.
- Execution chain (require time):
  `require('serve-index')` -> `$PACKAGE_ROOT/index.js:17 require('http-errors')` -> `$PACKAGE_ROOT/node_modules/http-errors/index.js:15 require('depd')('http-errors')` ->
  1. `depd/index.js:11` property read `require('./lib/compat').callSiteToString` fires the lazy getter -> swap #1 (`lib/compat/index.js:21-43`);
  2. `depd/index.js:105-111` `depd('http-errors')` calls `getStack()` -> swap #2;
  3. `http-errors/index.js:31 -> :286` `deprecate.function(exports.ImATeapot, ...)` -> `depd/index.js:397-405 wrapfunction` calls `getStack()` -> swap #3.
  Execution chain (post-load): `depd/index.js:169-245 log()` -> `getStack()` (`:183`) on every deprecation emitted by any in-process depd consumer.
- Activation: unconditional at `require('serve-index')` — no guards, no environment flags; fires before the middleware is ever constructed or a request is served. serve-index's own runtime calls (`createError(400|403|406)` with a leading numeric status) never take http-errors' deprecated branches, so no additional swaps occur per request from this package.
- Scope and restoration: process-wide (the one global `Error` of the main realm) for the duration of each synchronous `getStack()` call; both properties are restored unconditionally in straight-line code before return (no try/finally, but no user callback runs inside the window — the only code executed under the swap is `Error.captureStackTrace` and the `obj.stack` accessor). Reproduction confirms post-require values are fully restored. If `Error.captureStackTrace` or the `stack` accessor threw, restoration would be skipped; not observed.
- Resulting behavior: while held, any stack-trace preparation routed through `Error.prepareStackTrace` (including Node's source-map-aware formatting, `$NODEJS_SOURCE/lib/internal/source_map/prepare_stack_trace.js`) is replaced by depd's structured-array hook, and the frame-capture limit is forced to >= 10 (or 2). It also temporarily clobbers and then restores any third-party `prepareStackTrace` hook installed earlier. After restore, no observable difference remains. Historical interaction proof: under Node 12 `--enable-source-maps`, core wrapped the CallSites handed to user `prepareStackTrace`, breaking depd's swapped hook (upstream issue #36) — demonstrating the swap genuinely intersects core stack-trace behavior.
- Evidence: static — the two write sites above plus the import chain (`$PACKAGE_ROOT/index.js:17`, `http-errors/index.js:15,31,286`, `depd/index.js:11,110,404`); dynamic — `pass-b/repro-error-swap.js` instrumenting `Error.prepareStackTrace` with an accessor records exactly `["set:prepareObjectStackTrace","set:undefined"] x 3` during `require("$PACKAGE_ROOT")`, with `prepareStackTrace` restored to undefined and `stackTraceLimit` 10 -> 10 (Node v24.19.0)
- Upstream: dougwilson/nodejs-depd#32 "Why is this library overwriting Error type?" (closed; maintainer confirms the write pattern, describes it as use of the documented V8/Node stack-trace API with intent to restore); dougwilson/nodejs-depd#36 "Incompatible with --enable-source-maps node 12 option" (closed; concrete breakage caused by the swap window). Pattern present and unchanged in the audited depd@1.1.2.

No other Node.js patches were demonstrated. In particular there is no permanent
mutation of core prototypes, globals, module loading, or core source anywhere
in the inspected runtime tree.

## Candidate ledger and unresolved questions

Full ledger with reasons in `candidates.md` (same directory). Summary:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | depd/index.js:365-383, `Error.prepareStackTrace`/`stackTraceLimit` | confirmed -> F-001 | temporary swap, fires at require and per deprecation log |
| C-002 | depd/lib/compat/index.js:21-43, same target | confirmed -> F-001 (second site) | lazy getter forced at depd/index.js:11 during require |
| C-003 | batch/index.js:51, `Batch.prototype.__proto__ = EventEmitter.prototype` | rejected as patch | writes [[Prototype]] of library-owned Batch.prototype; EventEmitter.prototype only referenced, never mutated |
| C-004 | http-errors/index.js:123,166,235, `inherits(..., Error)` | rejected as patch | util.inherits mutates library constructors only; Error/Error.prototype untouched |
| C-005 | http-errors/index.js:145,214 `setPrototypeOf(err, ...)`; :148-161,217-230 defineProperty | rejected as patch | err is `new Error()` created by http-errors itself (:139,:207); library-owned instance |
| C-006 | http-errors/index.js:95,142,211 `Error.captureStackTrace` | rejected as patch | documented V8/Node API invocation; read/call, no mutation |
| C-007 | http-errors/index.js:98-108 `err.status`/`err.statusCode`/props | rejected as patch | metadata on an error instance; no core member shadowed |
| C-008 | http-errors/index.js:286 `deprecate.function` -> depd wrapfunction `eval` (depd/index.js:410) | rejected as patch | wrapper replaces http-errors' own export key only; dynamic codegen, no core target |
| C-009 | http-errors/index.js:250-257 `nameFunc` defineProperty 'name' | rejected as patch | on library-owned constructors |
| C-010 | setprototypeof/index.js:3-17 | rejected as patch | exports `Object.setPrototypeOf` (modern path); fallbacks mutate only passed (library-owned) objects |
| C-011 | parseurl/index.js:54,84 `req._parsedUrl`/`req._parsedOriginalUrl` | rejected as patch | adds cache metadata to IncomingMessage instance; no such member in `$NODEJS_SOURCE/lib/_http_incoming.js` (negative grep); skill: request metadata is not a patch |
| C-012 | parseurl/index.js:128-141 `new Url()` + property writes | rejected as patch | `Url` is a public legacy export (`$NODEJS_SOURCE/lib/url.js:1025-1027`); own instance; standalone fast-path of url.parse |
| C-013 | debug/src/node.js:248 -> :139-147 `process.env.DEBUG` write/delete at require | rejected as patch | documented writable `process.env`; idempotent at load (rewrites same value or no-op delete) |
| C-014 | debug/src/node.js:167-226 `createWritableStdioStream` (`stream.read = null`, `readable = false`, `_type`, `fd`, `_isStdio`; `process.binding('tty_wrap')`; `fs.SyncWriteStream`) | rejected as patch | only under `DEBUG_FD` set to fd other than 1/2 (non-default); mutates streams debug itself constructs and solely consumes; code copied from legacy node bootstrap; `fs.SyncWriteStream` absent from `$NODEJS_SOURCE/lib/fs.js` (path broken on modern Node); private API reads noted in supporting context |
| C-015 | debug/src/node.js:63-65 `util.deprecate(...)()` | rejected as patch | core API call, only under non-default DEBUG_FD |
| C-016 | $PACKAGE_ROOT/index.js:143 `err.status` on fs callback error | rejected as patch | metadata on an error instance produced by fs; no core member shadowed |
| C-017 | $PACKAGE_ROOT/index.js:103-106,540-547 `res.statusCode`/`setHeader`/`end` | rejected as patch | documented http.ServerResponse API usage |
| C-018 | accepts/index.js:82-212, negotiator/index.js:38-82 prototype methods | rejected as patch | own constructors' prototypes; `req` only read (`headers`), never written |
| C-019 | statuses/index.js:60-77, mime-types/index.js:154-188 map population | rejected as patch | writes to own exports objects |
| C-020 | depd/index.js:51-67,423-470 `wrapproperty`/descriptor conversion; :476-522 DeprecationError | rejected as patch | defineProperty on caller-supplied objects; `deprecate.property` never called in this dependency tree; DeprecationError properties on depd's own error |
| C-021 | inherits/inherits.js:1-9 | rejected as patch | re-exports `util.inherits`; read-only reference |
| C-022 | debug/src/debug.js (exports.names/skips/formatters, debug instance fields) | rejected as patch | writes to own module exports and own function objects |
| C-023 | batch/index.js:16-18 `defer = process.nextTick` | rejected as patch | read-only reference to core function; never reassigned on process |

Unresolved: none.

## Supporting context

- **batch@0.6.1 EventEmitter inheritance (C-003):** legacy
  `Batch.prototype.__proto__ = EventEmitter.prototype` inheritance without ever
  invoking the `EventEmitter` constructor. Safe against the audited core
  contract: `addListener` lazily initializes `_events`
  (`$NODEJS_SOURCE/lib/events.js:552-555`) and `emit` tolerates
  `this._events === undefined`. Batch's own members (`concurrency`, `push`,
  `throws`, `end`, and instance fields `fns`, `n`, `e`) shadow no
  `EventEmitter.prototype` member. serve-index activates it per request in
  `stat()` (`$PACKAGE_ROOT/index.js:559-579`): `new Batch()`,
  `.concurrency(10)`, `.push(...)`, `.end(cb)`; `emit('progress')` fires on the
  Batch instance only.
- **http-errors instance re-prototyping (C-005):** `ClientError`/`ServerError`
  construct a plain `new Error(msg)` and re-prototype it to their own
  prototypes via setprototypeof, then redefine `message`/`name`. All objects
  involved are created and owned by http-errors; serve-index activates this per
  request via `createError(400|403|406)` (`$PACKAGE_ROOT/index.js:114,124,129,166`).
- **parseurl req caching (C-011/C-012):** memoizes parses as `req._parsedUrl`
  / `req._parsedOriginalUrl` (Express-ecosystem convention, absent from core
  IncomingMessage) and contains a standalone fast-path reimplementation of the
  simple `url.parse` case (comment cites the regex from joyent/node PR #7878);
  it populates a `new url.Url()` of the documented legacy class instead of
  replacing any core function. Activated per request
  (`$PACKAGE_ROOT/index.js:111,117` via `getRequestedDir`/`parseUrl.original`).
- **debug@2.6.9 private API use (C-013/C-014):** at require time it
  re-persists `process.env.DEBUG` (documented API). Only when `DEBUG_FD` names
  an fd other than 1/2 does it run `createWritableStdioStream`, code copied
  from legacy `node/src/node.js` bootstrap, which reads the private
  `process.binding('tty_wrap')` and constructs `fs.SyncWriteStream` (removed
  from `$NODEJS_SOURCE/lib/fs.js`; DEP0061) — a private-API read and dead/broken
  optional path on modern Node, with mutations confined to streams debug owns
  (`stream.read = null`, `stream.readable = false` on its own net.Socket).
- **depd `eval` wrapper (C-008):** `wrapfunction` builds the deprecation
  wrapper with `eval` to preserve arity; the wrapper lands on http-errors' own
  `exports["I'mateapot"]` key. Dynamic code generation, not module-loading
  interception.
- **serve-index error metadata (C-016):** `$PACKAGE_ROOT/index.js:143` sets
  `err.status` (414/500) on the error object received from `fs.stat`'s
  callback — annotation of an fs-produced Error instance for downstream
  middleware, shadowing no core member.
- **public/ assets:** `directory.html`, `style.css`, and icon PNGs are loaded
  as data via `fs.readFile`/`fs.readFileSync` only; no executable runtime
  content.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| $PACKAGE_ROOT/index.js | full read + skill pattern set (see searches.md) | no prototype/global/module-loading writes; only fs/path/Buffer reads, res API calls, instance metadata |
| All 15 dependency runtime files | full reads + bounded `rg -n` pattern set over `node_modules` (tests excluded) | candidate hits resolved per ledger; only depd writes a shared global |
| depd@1.1.2 index.js, lib/compat/* | full read | two Error-swap sites (F-001); wrapproperty path unreachable in this tree |
| http-errors@1.8.1 index.js | full read | require-time depd activation chain (:15, :31, :286); own-instance re-prototyping only |
| batch@0.6.1 index.js | full read (692-line target's only per-request EE consumer) | library-owned prototype chain write only |
| $NODEJS_SOURCE/lib/internal/errors.js:136-188,248-254 | targeted read | core consults `Error.prepareStackTrace` and manages `stackTraceLimit` — baseline for F-001 |
| $NODEJS_SOURCE/lib/internal/source_map/prepare_stack_trace.js | targeted listing/grep | source-map stack formatting routed through same hook; interaction surface for F-001 |
| $NODEJS_SOURCE/lib/events.js:489,548-560,615-619 | targeted read | lazy `_events` init validates batch's constructor-less inheritance |
| $NODEJS_SOURCE/lib/_http_incoming.js | `rg -n "_parsedUrl\|_parsedOriginalUrl"` | negative — parseurl shadows no core member |
| $NODEJS_SOURCE/lib/url.js:1025-1027 | targeted read | `Url` publicly exported — parseurl uses documented legacy class |
| $NODEJS_SOURCE/lib/fs.js | `rg -n "SyncWriteStream"` | negative — debug's FILE path dead on modern Node |
| Reproduction | `node pass-b/repro-error-swap.js "$PACKAGE_ROOT"` (Node v24.19.0) | 3 set/restore cycles on `Error.prepareStackTrace` during require; full restoration confirmed |
| Upstream depd | https://github.com/dougwilson/nodejs-depd/issues/32 (closed) | maintainer acknowledges Error-global write pattern and restore intent |
| Upstream depd | https://github.com/dougwilson/nodejs-depd/issues/36 (closed) | real breakage of the swap under Node 12 `--enable-source-maps`; proves core interaction |
| Upstream serve-index | `gh search issues --repo expressjs/serve-index "patch monkeypatch"` | negative — no patch-related issues |

File hashes (SHA-256, relative to $PACKAGE_ROOT):

- `index.js` 92816331d63c4bb31d206f48ce1b1ff720258a10985bdee33b515f86d23588d3
- `node_modules/depd/index.js` 244dbbca14b8aa9c9b6be04912283ab704b92f11dcb9b23beb2ba81402fecc99
- `node_modules/depd/lib/compat/index.js` 76baf83317ac81045cefb9fcc8ec0d8e47dd0cfcbadd592f480349412e161861
- `node_modules/http-errors/index.js` d7452a6c385a67c970b4506317db677facfda0c993e8d8f6360fe906ed8d41d4
- `node_modules/batch/index.js` 1a74a4dbb93c86f96a2f79c88f2c0d3e5300560a1bf9704e731cab747779270c
- `node_modules/parseurl/index.js` 811223d4a19492ccc642384dc84f0af4ad935557dfe8f63750d7ffd673e40f17
- `node_modules/debug/src/node.js` a3e83594a4ce88997e2e4fc66bc942b17b9d736290ad62560c7f09d6d0989ad0
- `node_modules/accepts/index.js` be2decbd50610e8f995c1e312ee4dd6d7c1244cfdf03ee4c4a3da68e572dada1
- `node_modules/negotiator/index.js` 4f9279bcffc74199c671739f2d0e91fe5176a7f7e4683ca59809a50463a842bd

## Coverage and limitations

- Entry points: `$PACKAGE_ROOT/index.js` (sole export per package.json `files`);
  every installed runtime dependency's resolved `main` entry and its transitive
  runtime files were read in full: accepts/index.js; batch/index.js (full
  read); debug/src/{index,node,debug}.js (browser.js and inspector-log.js are
  Electron-renderer/unreferenced paths — scanned, not activated under Node);
  depd/index.js + lib/compat/{index,callsite-tostring,event-listener-count}.js
  (lib/browser is the browser field, not resolved under Node); escape-html;
  http-errors; inherits/inherits.js; mime-db; mime-types; ms; negotiator
  (index + 4 lib parsers, pattern-scanned, no core references); parseurl;
  setprototypeof; statuses; toidentifier.
- Branches excluded: browser-field variants (never resolved by the Node CJS
  loader for this package); test/ directories; `emitter` fallback in batch
  (only reachable when `require('events')` fails, i.e. non-Node environments —
  the package is not even installed, require would throw).
- Node.js baseline is main-branch v28.0.0-pre (commit d44625a4b80c67...); the
  reproduction ran on Node v24.19.0. The F-001 write sites are
  version-independent static facts of depd@1.1.2; core contract citations are
  pinned to the baseline commit. depd's compat polyfills target pre-4.x Node
  branches that were not exercised.
- Reproduction covers require-time activation only; the per-deprecation-log
  swap (depd `log()` -> `getStack()`) was established statically and is not
  triggered by serve-index's own runtime calls.
- What would change the verdict: evidence that `getStack()` can exit without
  restoring (e.g. a throwing `stack` accessor installed by another realm), or a
  different installed dependency tree (e.g. http-errors >= 2.0 dropped the
  `I'mateapot` wrap but still invokes depd at load; depd >= 2 retains the same
  getStack pattern — verdict would be unchanged in kind).

## Changes since the previous audit

First audit (independent pass B of a double-blind protocol; no other audit
output was read).
