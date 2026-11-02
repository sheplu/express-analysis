# Node.js patch audit: express-session

- Verdict: confirmed patching
- Status: complete
- Input: npm package `express-session` (Node.js session middleware), local clone under `$PACKAGE_ROOT`
- Library: version 1.19.0 plus unreleased changes, git clone of https://github.com/expressjs/session branch master, commit 8947e169ae838b22cc1af198e50e370e6fc09f96; runtime files `index.js`, `session/cookie.js`, `session/memory.js`, `session/session.js`, `session/store.js`; no install scripts, no bundled/dist output
- Node.js baseline: main branch, commit d44625a4b80c672215b469906ce583ce7eeeebaf (`$NODEJS_SOURCE`)
- Reproduction runtime: Node.js v24.19.0 (`node repro.js "$PACKAGE_ROOT"`, script beside this report)
- Scope: production/runtime code only (`index.js` + `session/` per package.json `files`); resolved runtime dependencies at `$PACKAGE_ROOT/node_modules`: cookie@0.7.2, cookie-signature@1.0.7, debug@2.6.9 (+ms@2.0.0), depd@2.0.0, on-headers@1.1.0, parseurl@1.3.3, safe-buffer@5.2.1, uid-safe@2.1.5 (+random-bytes@1.0.0). Tests, docs, and `scripts/` (release tooling) out of scope
- Coverage: all 5 runtime source files read in full; every runtime dependency entrypoint read/scanned; targeted Node.js reads of `lib/http.js`, `lib/internal/http/outgoing.js`, `lib/internal/http/server.js`, `lib/internal/http/incoming.js`, `lib/internal/errors.js`; upstream HISTORY.md and GHSA-76c9-3jph-rj3q corroborated; runtime reproduction executed. No material gaps

## Patching verdict

Patching is demonstrated. Express-session does not mutate any shared Node.js
prototype, global function, module loading machinery, or core source on disk.
It applies:

- 2 core-backed instance overrides (counted separately from shared mutations):
  - F-001 `res.end` replaced on every live `http.ServerResponse` passing
    through the middleware (direct, `index.js`).
  - F-002 `res.writeHead` replaced on the same responses (transitive,
    via on-headers@1.1.0, activated by `index.js`).
- 1 shared global mutation, transient with synchronous restoration:
  - F-003 `Error.prepareStackTrace` and `Error.stackTraceLimit` written and
    restored by depd@2.0.0 at express-session require time and on every
    deprecation log.

Shared `http.ServerResponse.prototype` / `http.IncomingMessage.prototype`
remain untouched (verified by reproduction). No unresolved candidates remain;
all other candidates were rejected (see ledger).

## Confirmed Node.js patches

### F-001: `res.end` replaced on live `http.ServerResponse` instances (session commit hook)

- Category: instance or application override (core-backed instance; no shared prototype mutation)
- Library site(s): `$PACKAGE_ROOT/index.js:266-267` (saved originals `_end = res.end`, `_write = res.write`), `$PACKAGE_ROOT/index.js:269` (write: `res.end = function end(chunk, encoding) {...}`), wrapper body through `index.js:379`; https://github.com/expressjs/session/blob/8947e169ae838b22cc1af198e50e370e6fc09f96/index.js#L266-L379
- Origin: direct
- Core baseline: `$NODEJS_SOURCE/lib/internal/http/outgoing.js:1289` `OutgoingMessage.prototype.end = function end(chunk, encoding, callback)` (inherited by `ServerResponse`, re-exported through `lib/http.js`); `$NODEJS_SOURCE/lib/internal/http/outgoing.js:1027` `OutgoingMessage.prototype.write`. Core `end` accepts an optional callback, returns `this`, and errors with `ERR_STREAM_WRITE_AFTER_END` when called with a chunk after finish
- Exact mutation: own data property `end` assigned on the response instance, shadowing `OutgoingMessage.prototype.end`. Originals captured in closure (`_end`, `_write`); `res.write` itself is never replaced, only invoked via the saved reference
- Execution chain: `require('express-session')` -> `session(options)` returns middleware -> middleware invocation per request -> `index.js:269` write
- Activation: production path; runs for every request that passes the early guards (no pre-existing `req.session`, store connected, cookie-path match, secret present). No environment/version gate
- Scope and restoration: single response instance; never restored (response objects are per-request, so the override dies with the response). Shared prototype unaffected (repro: `ServerResponse.prototype.end` identity unchanged)
- Resulting behavior: before the response can finish, the wrapper commits session state: destroys (`store.destroy`), saves (`session.save`), or touches (`store.touch`) asynchronously, deferring the real `_end`. To keep client timing, it may force header emission via the private `res._implicitHeader()` when `res._header` is unset (`index.js:294-296`) and split the final body chunk, writing all but the last byte with the saved `_write` (`index.js:303-320`, "split response"). Deviations from the core contract: repeated `end()` calls return `false` instead of `this` (`index.js:270-272`); wrapped paths return the `write()` boolean or `true` rather than `this`; a `res.end(chunk, encoding, callback)` callback argument is dropped on the save/destroy/touch paths (wrapper signature is `end(chunk, encoding)` and delegates without it)
- Evidence: static read of `index.js:266-379`; reproduction (`repro.js` beside this report, Node v24.19.0): after middleware, `res` has own `end` differing from the prototype method, own `write` absent, prototype identities unchanged
- Upstream: maintainers themselves call this "the `res.end` patch" in `$PACKAGE_ROOT/HISTORY.md` (1.17.2 "Fix `res.end` patch to always commit headers"; 1.7.0 era "Fix `res.end` patch to return correct value" / "handle multiple `res.end` calls"; 1.7.4 "Fix `res.end` patch to call correct upstream `res.write`")

### F-002: `res.writeHead` replaced on live `http.ServerResponse` instances (on-headers listener)

- Category: instance or application override (core-backed instance; no shared prototype mutation)
- Library site(s): activation `$PACKAGE_ROOT/index.js:235` (`onHeaders(res, function(){...})`, listener sets the session cookie via `setcookie` -> `res.setHeader('Set-Cookie', ...)` at `index.js:711-721`); write `$PACKAGE_ROOT/node_modules/on-headers/index.js:71` (`res.writeHead = createWriteHead(res.writeHead, listener)`), wrapper `node_modules/on-headers/index.js:30-51`
- Origin: target -> on-headers@1.1.0 (declared `~1.1.0`)
- Core baseline: `$NODEJS_SOURCE/lib/internal/http/server.js:423-424` `ServerResponse.prototype.writeHead = writeHead; function writeHead(statusCode, reason, obj)`; `$NODEJS_SOURCE/lib/internal/http/outgoing.js:877` `OutgoingMessage.prototype.appendHeader` (on-headers feature-detects it read-only at `node_modules/on-headers/index.js:19`). Core `writeHead` validates status, stores headers, and returns `this`
- Exact mutation: own data property `writeHead` assigned on the response instance; previous `writeHead` (normally the prototype method) captured in closure as `prevWriteHead` and delegated to via `prevWriteHead.apply(this, args)`
- Execution chain: middleware invocation -> `index.js:235` `onHeaders(res, listener)` -> `on-headers/index.js:71` write
- Activation: production path, every request passing the middleware early guards (installed just before the `res.end` wrapper). No gates
- Scope and restoration: single response instance; never restored; one-shot listener (`fired` flag). Shared prototype unaffected (repro-verified)
- Resulting behavior: on the first `writeHead` call, the wrapper first applies the status code and any header arguments onto the response via `this.statusCode`/`setHeader`/`appendHeader` (`setWriteHeadHeaders`, `on-headers/index.js:112-139`), then fires express-session's listener (which touches the session and appends the `Set-Cookie` header), re-reads a possibly-updated `this.statusCode`, and finally delegates to the saved core `writeHead` with the header arguments stripped. Net effect: headers passed directly to `writeHead` become mutable response state before flush so the session cookie can be injected; argument-passing semantics of core `writeHead` are rewritten (array/object header forms are routed through `setHeader`/`appendHeader` instead of reaching core `writeHead`)
- Evidence: static read of `node_modules/on-headers/index.js`; reproduction: `res` gains own `writeHead` differing from the prototype method; prototype identity unchanged
- Upstream: on-headers advisory GHSA-76c9-3jph-rj3q / CVE-2025-7339 ("on-headers is vulnerable to http response header manipulation", < 1.1.0, patched 1.1.0) concerns this exact wrapper's 1D-array handling; express-session 1.18.2 shipped the fix (`$PACKAGE_ROOT/HISTORY.md` 1.18.2: "deps: on-headers@~1.1.0"); older entry "Fix `res.writeHead` patch missing return value" (deps: on-headers@~1.0.2)

### F-003: transient write/restore of `Error.prepareStackTrace` and `Error.stackTraceLimit` (depd)

- Category: shared core mutation (global `Error` constructor), transient with synchronous restoration
- Library site(s): activation `$PACKAGE_ROOT/index.js:20` and `$PACKAGE_ROOT/session/cookie.js:15` (`require('depd')('express-session')`); deprecation calls `index.js:122,127,147,614,627`, `session/cookie.js:89`; writes `$PACKAGE_ROOT/node_modules/depd/index.js:386-387` (`Error.prepareStackTrace = prepareObjectStackTrace; Error.stackTraceLimit = Math.max(10, limit)`), restore `node_modules/depd/index.js:395-396`
- Origin: target -> depd@2.0.0 (declared `~2.0.0`)
- Core baseline: `Error.prepareStackTrace` is the V8 stack-trace API honored realm-wide by Node.js — `$NODEJS_SOURCE/lib/internal/errors.js:136-150` (`prepareStackTraceCallback` consults `globalThis.Error.prepareStackTrace` when `error.stack` is materialized); default: property absent/undefined
- Exact mutation: data properties `prepareStackTrace` and `stackTraceLimit` on the global `Error` constructor are overwritten with depd's values, `Error.captureStackTrace(obj)` is invoked to harvest structured call sites, then both properties are restored to the saved originals in the same synchronous frame (`getStack()`, `node_modules/depd/index.js:381-399`)
- Execution chain: `require('express-session')` -> `require('depd')('express-session')` -> `depd()` -> `getStack()` -> writes; additionally every emitted deprecation -> `log()` -> `getStack()` -> writes
- Activation: unconditional at require time of express-session (twice: `index.js:20`, `session/cookie.js:15`); again whenever a deprecation fires (undefined `resave`/`saveUninitialized`, missing `secret`, `maxAge` as Date, legacy cookie-parser data) — the first two fire in common default configurations
- Scope and restoration: realm-wide global while held; restored synchronously before any other JavaScript can run (single-threaded; stacks prepared under it are consumed internally). A pre-existing user `Error.prepareStackTrace` is saved and reinstated
- Resulting behavior: during the window, any stack-trace materialization would be formatted by depd's `prepareObjectStackTrace` (returns raw CallSite array) and the effective stack depth floor becomes 10; after restore, behavior is identical to before. Practical impact in normal operation: none observable outside depd
- Evidence: static read of `node_modules/depd/index.js:381-399`; reproduction (`repro.js`): instrumented accessor on `Error.prepareStackTrace` observed write sequence `set:prepareObjectStackTrace, set:undefined, set:prepareObjectStackTrace, set:undefined` during `require('express-session')`, with both properties restored afterwards
- Upstream: standard depd technique (documented V8 stack-trace API, https://v8.dev/docs/stack-trace-api); depd 2.0.0 changelog notes "Replace internal `eval` usage with `Function` constructor" (the `Function` constructor path is in `wrapfunction`, which express-session never calls)

## Candidate ledger and unresolved questions

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | `index.js:269` `res.end = function end(...)` on `ServerResponse` instance | confirmed -> F-001 | own-property write shadowing `OutgoingMessage.prototype.end`; repro-verified |
| C-002 | `index.js:235` `onHeaders(res, ...)` -> `node_modules/on-headers/index.js:71` `res.writeHead = createWriteHead(...)` | confirmed -> F-002 | instance override of `ServerResponse.prototype.writeHead`; repro-verified |
| C-003 | `index.js:20`, `session/cookie.js:15` depd -> `node_modules/depd/index.js:386-387,395-396` `Error.prepareStackTrace`/`stackTraceLimit` | confirmed -> F-003 | transient global write + synchronous restore; observed via instrumented accessor |
| C-004 | `index.js:266-267` `_end`/`_write` saved references | rejected as patch | reads only; part of F-001 saved-original mechanism |
| C-005 | `index.js:294-296` `res._header` read, `res._implicitHeader()` call | rejected as patch | private core API read/invocation, no write (baselines `lib/internal/http/outgoing.js:188`, `lib/internal/http/server.js:419`); supporting context |
| C-006 | `index.js:159-160,229,232`, `session/store.js:100` `req.sessionID`/`req.session`/`req.sessionStore` assignments | rejected as patch | library-owned metadata added to core-backed `IncomingMessage` instance; no core member shadowed (`lib/internal/http/incoming.js` defines none of these); repro: own enumerable data props, prototype clean |
| C-007 | `index.js:158` `store.generate = function(req){...}` | rejected as patch | write to library/user-owned store object (Store extends EventEmitter); `generate` is library API, no `EventEmitter.prototype` member shadowed |
| C-008 | `index.js:428-440` `Object.defineProperty(sess, 'reload'/'save', ...)` | rejected as patch | defines methods on library-owned `Session` instance |
| C-009 | `session/session.js:25-26,47-143` defineProperty on `Session` instances/prototype | rejected as patch | library-owned constructor and prototype |
| C-010 | `session/store.js:40`, `session/memory.js:49` `util.inherits(...)` from `EventEmitter` | rejected as patch | documented inheritance; writes only to library constructors/prototypes, `EventEmitter.prototype` unmodified |
| C-011 | `session/memory.js:58-157` `MemoryStore.prototype.*` methods; `this.sessions` map | rejected as patch | library-owned prototype and state; no core object touched |
| C-012 | `session/cookie.js:51` `Cookie.prototype = {...}` | rejected as patch | library-owned prototype replacement |
| C-013 | `session/session.js:110` `delete this.req.session` | rejected as patch | deletes the library's own added property from the request instance |
| C-014 | parseurl `node_modules/parseurl/index.js:54,84` `req._parsedUrl`/`req._parsedOriginalUrl` | rejected as patch | cache properties added to core-backed instance; no such members in `lib/internal/http/incoming.js` (negative grep); no core behavior replaced |
| C-015 | debug@2.6.9 `node_modules/debug/src/node.js:248` `exports.enable(load())` -> `save()` (`:139-147`) writes/deletes `process.env.DEBUG` at require time | rejected as patch | process environment data write that round-trips the existing value (write-back when set, delete when unset); no core API/function replaced |
| C-016 | debug `node_modules/debug/src/node.js:169` `process.binding('tty_wrap')` in `createWritableStdioStream` | rejected as patch | read-only private binding access; reachable only when `DEBUG_FD` names an fd other than 1/2; not activated by express-session; supporting context |
| C-017 | safe-buffer@5.2.1 `node_modules/safe-buffer/index.js:12-18` | rejected as patch | modern branch re-exports the core `buffer` module object unmodified; legacy branch copies properties into its own exports; `copyProps(Buffer, SafeBuffer)` reads core, writes library object |
| C-018 | on-headers `node_modules/on-headers/index.js:19` `typeof http.ServerResponse.prototype.appendHeader` | rejected as patch | read-only feature detection at require time |
| C-019 | depd `wrapfunction`/`wrapproperty` (`node_modules/depd/index.js`), incl. `Function` constructor codegen | rejected as patch | dormant capability; express-session only calls `deprecate(message)` (grep over runtime files shows no `deprecate.function`/`deprecate.property`) |
| C-020 | cookie@0.7.2 `node_modules/cookie/index.js:23-24` `Object.prototype.toString`/`hasOwnProperty` captures | rejected as patch | read-only references to builtins; pure parse/serialize otherwise |
| C-021 | uid-safe@2.1.5 / random-bytes@1.0.0 | rejected as patch | `crypto.randomBytes` use and `global.Promise` read only; no writes to core objects |
| C-022 | cookie-signature@1.0.7 | rejected as patch | pure `crypto` HMAC/hash use; exports only |
| C-023 | ms@2.0.0 | rejected as patch | pure string/number conversion; no core interaction |
| C-024 | `index.js:711-721` `setcookie` -> `res.setHeader('Set-Cookie', ...)` | rejected as patch | supported public API call, no override |
| C-025 | on-headers `setWriteHeadHeaders` writes `this.statusCode`/headers (`node_modules/on-headers/index.js:112-139`) | part of F-002 | delegation semantics of the confirmed wrapper, not an additional patch site |

No unresolved candidates.

## Supporting context

- Private core API usage (reads/calls, not writes): `res._header` truthiness and
  `res._implicitHeader()` (`index.js:294-296`) to force header emission before
  the split-write; both are long-standing undocumented `ServerResponse` members
  present at the baseline (`lib/internal/http/outgoing.js:188,1003`,
  `lib/internal/http/server.js:419`). debug@2.6.9's dormant
  `process.binding('tty_wrap')` path (C-016) is legacy private API that modern
  Node deprecates; it is unreachable in express-session's default use.
- Core-backed instance metadata: `req.session`, `req.sessionID`,
  `req.sessionStore` (and parseurl's `req._parsedUrl*` caches) are own
  enumerable data properties added to the `IncomingMessage` instance — supported
  extension of a mutable object, not a patch (skill: adding request metadata
  does not establish a core patch).
- Module/loader/global surface: no `require.cache`/`require.extensions`/
  `Module._*`/`syncBuiltinESMExports`/`registerHooks` usage anywhere in scope;
  no `__proto__`/`setPrototypeOf` on core objects; no install scripts; no
  on-disk modification of core.
- debug@2.6.9 rewrites `process.env.DEBUG` with its current value at require
  time (C-015) — process state churn, not an API patch, but notable in
  hardened/frozen-env environments.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT/index.js`, `session/*.js` | full file reads + `rg -n` candidate sweeps (imports, globals, prototype/defineProperty, patch keywords, loader hooks, internals, `res.`/`req.` assignments) | all writes enumerated; only C-001/C-002/C-003 touch core-backed or global objects |
| `$PACKAGE_ROOT/package.json` | read | runtime deps list; `files: [session/, index.js]`; no install hooks |
| Dependency entrypoints | full reads of on-headers, depd, uid-safe, random-bytes, cookie-signature, safe-buffer (head), parseurl (write sites), debug src/{index,node,debug}.js, scans of cookie, ms | patch sites found only in on-headers (instance) and depd (transient global); all others negative |
| `$NODEJS_SOURCE/lib/http.js` | `rg -n "ServerResponse|IncomingMessage" lib/http.js` | re-exports from `lib/internal/http/{server,incoming,outgoing}.js` at commit d44625a4b80 |
| `$NODEJS_SOURCE/lib/internal/http/outgoing.js` | targeted reads at :877, :1003, :1027, :1289, `_header` greps | baselines for `end`, `write`, `appendHeader`, `_implicitHeader`, `_header` |
| `$NODEJS_SOURCE/lib/internal/http/server.js` | targeted read :419-470 | baseline `writeHead` contract and `_implicitHeader` |
| `$NODEJS_SOURCE/lib/internal/http/incoming.js` | `rg -n "session|sessionID|sessionStore|_parsedUrl"` | no matches — req additions shadow nothing (C-006, C-014) |
| `$NODEJS_SOURCE/lib/internal/errors.js` | `rg -n "prepareStackTrace"` -> :136-150 | Node honors userland `Error.prepareStackTrace` realm-wide; baseline for F-003 |
| `$PACKAGE_ROOT/HISTORY.md` | `rg -n "on-headers|writeHead|res.end"` | maintainers describe `res.end`/`res.writeHead` wrapping as "patch"; 1.18.2 on-headers bump |
| GitHub advisory | `gh api /advisories/GHSA-76c9-3jph-rj3q` (read-only) | CVE-2025-7339, on-headers < 1.1.0, patched 1.1.0 — corroborates F-002 wrapper semantics |
| Reproduction | `node repro.js "$PACKAGE_ROOT"` (Node v24.19.0) | confirms instance-only overrides, clean shared prototypes, transient `Error.prepareStackTrace` writes (4 observed), restored state |

## Coverage and limitations

- Entry points: single entrypoint `index.js` (package.json `main` default) and
  its four `session/` modules — all read in full. `scripts/` is release
  tooling (not shipped per `files`), tests/docs excluded by scope.
- Dependencies: all 8 declared runtime dependencies plus transitive ms and
  random-bytes inspected at their resolved entrypoints in
  `$PACKAGE_ROOT/node_modules`. No optional/conditional entrypoints beyond
  debug's renderer-process branch (`src/browser.js`, not applicable to the Node
  runtime; not further audited — would only matter under an Electron renderer).
- Node.js files: targeted reads only (table above) at commit
  d44625a4b80c672215b469906ce583ce7eeeebaf. Legacy shims `lib/_http_outgoing.js`
  / `lib/_http_server.js` exist at this commit and re-export the internal
  implementations; baselines cited against `lib/internal/http/*`. On older
  Node release lines the same methods live in `lib/_http_outgoing.js` /
  `lib/_http_server.js`; the contracts relied on here (`end`, `write`,
  `writeHead`, `_header`, `_implicitHeader`) exist across supported lines.
- Branches tested: reproduction exercised the no-incoming-cookie path
  (synchronous `generate()`); the store-get/inflate path installs the same
  wrappers earlier in the same function body, so coverage of the writes is
  complete statically. depd deprecation-time `getStack()` calls were not
  separately reproduced (require-time writes were observed; same function).
- The audited tree is 1.19.0 plus unreleased master changes (HISTORY
  "unreleased": RFC 6265 path matching, dynamic cookie options) — findings
  apply to commit 8947e169ae838b22cc1af198e50e370e6fc09f96 as specified.
- What would change the verdict: nothing identified; downgrading would require
  treating instance-level overrides of core-inherited methods as out of scope,
  which the audit definition includes.

## Changes since the previous audit

First audit (pass A of a double-blind protocol); no previous report existed at
this output path.
