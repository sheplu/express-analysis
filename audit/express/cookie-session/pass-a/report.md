# Node.js patch audit: cookie-session

- Verdict: confirmed patching
- Status: complete
- Input: npm package `cookie-session` (Express cookie-based session middleware), local clone at `$PACKAGE_ROOT`
- Library: cookie-session 2.1.1, git commit 75f53bb8f9118067955b344fb4ba550ed0e39318 (github.com/expressjs/cookie-session, branch master), source checkout with installed runtime node_modules; no local modifications observed
- Node.js baseline: $NODEJS_SOURCE at commit d44625a4b80c672215b469906ce583ce7eeeebaf (main)
- Reproduction runtime: Node.js v24.19.0 (`node repro-writehead-override.js "$PACKAGE_ROOT"`, `node repro-depd-preparestacktrace.js "$PACKAGE_ROOT"` beside this report)
- Scope: production/runtime only — `index.js` (sole shipped runtime file per package.json `files`) plus resolved runtime dependencies: cookies@0.9.1, debug@3.2.7, on-headers@1.1.0, safe-buffer@5.2.1 and their transitive runtime deps depd@2.0.0, keygrip@1.1.0, ms@2.1.3, tsscmp@1.0.6. Tests, docs, and `scripts/version-history.js` (unshipped release script) out of scope
- Coverage: source — full read of every runtime file in scope plus pattern sweeps (see searches.md); upstream — corroborated via shipped changelogs and GitHub advisory GHSA-76c9-3jph-rj3q; runtime — both findings reproduced on Node v24.19.0. debug's optional `supports-color` require is not installed here (branch untested, read as dead in this install)

## Patching verdict

Patching is demonstrated. Two findings:

- 1 core-backed instance override (F-001): every request handled by the
  middleware gets its `res.writeHead` replaced with a wrapper on the
  `http.ServerResponse` instance. Origin: cookie-session -> on-headers@1.1.0
  (direct dependency, activated unconditionally by the middleware).
- 1 shared global mutation, transient (F-002): `Error.prepareStackTrace` and
  `Error.stackTraceLimit` are reassigned and synchronously restored. Origin:
  cookie-session -> cookies@0.9.1 -> depd@2.0.0; runs unconditionally at module
  load (twice) and again whenever a cookies deprecation message is logged.

No shared core prototype is durably mutated, no core module loading is
intercepted, and no core source is rewritten. All other candidates were
rejected (see ledger). No unresolved candidates remain; the only untested
branch is debug's optional `supports-color` integration, which is absent from
this install and contains no writes to core.

## Confirmed Node.js patches

### F-001: `res.writeHead` replaced on each http.ServerResponse instance (via on-headers)

- Category: instance or application override (core-backed instance; the shared
  `ServerResponse.prototype` is not modified)
- Library site(s): `$PACKAGE_ROOT/index.js:114` (activation:
  `onHeaders(res, setHeaders)`), write at
  `$PACKAGE_ROOT/node_modules/on-headers/index.js:71`
  (`res.writeHead = createWriteHead(res.writeHead, listener)`); wrapper body
  `node_modules/on-headers/index.js:30-52,119-146`.
  Pinned: https://github.com/expressjs/cookie-session/blob/75f53bb8f9118067955b344fb4ba550ed0e39318/index.js#L114 ;
  https://github.com/expressjs/on-headers/blob/v1.1.0/index.js#L71
- Origin: cookie-session -> on-headers@1.1.0 (declared `~1.1.0`)
- Core baseline: `$NODEJS_SOURCE/lib/internal/http/server.js:423-505`
  (`ServerResponse.prototype.writeHead`, re-exported through
  `lib/_http_server.js:34-37` and `lib/http.js`) at d44625a4b80: validates
  status code, sets statusMessage/statusCode, merges any headers argument into
  the response, builds and stores the status line
- Exact mutation: assignment of an own data property `writeHead` on the
  response instance, shadowing the core prototype method; the original method
  is captured in a closure and invoked by the wrapper
- Execution chain: `require('cookie-session')(opts)` returns `_cookieSession`
  -> per request `_cookieSession(req, res, next)` -> `onHeaders(res, setHeaders)`
  -> `res.writeHead = createWriteHead(res.writeHead, setHeaders)`
- Activation: unconditional in production for every request passing through the
  middleware; no guards; applied before `next()`
- Scope and restoration: per-response instance; never restored for that
  response (the wrapper remains; core prototype untouched for all other
  responses). Repeated middleware use stacks wrappers
- Resulting behavior: before — `writeHead(status[, reason][, headers])` merges
  headers and emits the status line directly. After — the wrapper first
  assigns `this.statusCode` and replays the headers argument through
  `setHeader`/`appendHeader` (array form: `removeHeader` then `appendHeader`;
  object form: `setHeader`) so they land in the header store, then fires the
  listener exactly once (letting cookie-session append `Set-Cookie` via
  `cookies.set`), propagates a listener-updated `this.statusCode` into the
  arguments, and finally calls the saved original with trimmed arguments.
  Practical effect: headers passed to `writeHead` become visible/mutable to
  middleware before transmission, and header-merge semantics for the array
  form differ from core's one-shot path
- Evidence: static — sites above; reproduction —
  `repro-writehead-override.js` on Node v24.19.0: res gains own `writeHead`
  distinct from the prototype method, `ServerResponse.prototype.writeHead`
  identity unchanged
- Upstream: mechanism is on-headers' documented purpose; on-headers 1.0.2
  changelog: "Fix `res.writeHead` patch missing return value"; 1.1.0 fixes
  CVE-2025-7339 / GHSA-76c9-3jph-rj3q ("http response header manipulation" in
  the wrapper's array replay; patched 1.1.0 — verified via GitHub API).
  cookie-session 1.1.0 (2014-11-09) changelog: "Use `on-headers` instead of
  `writeHead` patching" — the override predates on-headers and was delegated
  to it; cookie-session 2.1.1 bumped to ~1.1.0 for the CVE

### F-002: `Error.prepareStackTrace` / `Error.stackTraceLimit` transiently reassigned (via depd)

- Category: shared core mutation (global `Error` constructor properties
  consumed by Node.js error machinery), transient with synchronous restoration
- Library site(s): `$PACKAGE_ROOT/node_modules/depd/index.js:381-399`
  (`getStack()`: set at :386-:387, restore at :395-:396). Activations in scope:
  `node_modules/cookies/index.js:10` (`require('depd')('cookies')` ->
  depd/index.js:108), `node_modules/cookies/index.js:232`
  (`deprecate.property` -> wrapproperty -> getStack, depd/index.js:455), and
  every deprecation log (depd/index.js:199).
  Pinned: https://github.com/dougwilson/nodejs-depd/blob/v2.0.0/index.js#L381-L399
- Origin: cookie-session -> cookies@0.9.1 -> depd@2.0.0 (transitive)
- Core baseline: default `Error.prepareStackTrace` is undefined;
  `$NODEJS_SOURCE/lib/internal/errors.js:136-166` (`prepareStackTraceCallback`)
  consults user-set `globalThis.Error.prepareStackTrace` (:149-:150) for every
  stack materialization and otherwise applies Node's default formatting.
  `Error.stackTraceLimit` is the V8/Node global frame-count control
- Exact mutation: `Error.prepareStackTrace = prepareObjectStackTrace`
  (returns the raw CallSite array) and
  `Error.stackTraceLimit = Math.max(10, limit)`; both restored to the saved
  prior values after `Error.captureStackTrace(obj)` within the same
  synchronous call
- Execution chain: `require('cookie-session')` -> `require('cookies')` ->
  `require('depd')('cookies')` -> `getStack()` -> global writes; same path via
  `deprecate.property(Cookie.prototype, 'maxage', ...)` at cookies load; later
  via `log()` when a cookies deprecation fires (e.g. deprecated `secureProxy`
  option or `maxage` property use)
- Activation: unconditional at first `require` of cookie-session (two
  set/restore cycles observed); additional cycles only on deprecated-feature
  use. No environment guard prevents the load-time cycles
  (`NO_DEPRECATION`/`process.noDeprecation` only suppress logging)
- Scope and restoration: process-global while held; restored synchronously
  before `getStack()` returns, so no user JavaScript runs during the window in
  a single-threaded process. Any previously user-assigned
  `prepareStackTrace`/`stackTraceLimit` values are preserved by the
  save/restore
- Resulting behavior: during the window, stack formatting for any
  materialized stack returns raw CallSite arrays and at least 10 frames are
  captured; after restore, prior behavior resumes. Practical effect is
  negligible in normal operation but it is a genuine write to shared global
  API surface on every load of the package
- Evidence: static — sites above; reproduction —
  `repro-depd-preparestacktrace.js` on Node v24.19.0: accessor instrumentation
  observed writes `['function','undefined','function','undefined']` on
  `Error.prepareStackTrace` during `require`, final value restored to
  undefined, `Error.stackTraceLimit` value unchanged after load
- Upstream: standard V8 stack-trace API usage pattern
  (https://v8.dev/docs/stack-trace-api); depd@2.0.0 is the latest 2.x line
  used across jshttp/pillarjs. No upstream issue claims a durable mutation

## Candidate ledger and unresolved questions

Full ledger with reasons in `candidates.md` (same directory). Summary:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | index.js:70 `defineProperty(req,'session',accessor)` | rejected as patch | New library-owned accessor on IncomingMessage instance; `session` absent from core (lib/internal/http/incoming.js); supported metadata extension |
| C-002 | index.js:67 `req.sessionOptions =` | rejected as patch | New library-owned instance data property; no core member shadowed |
| C-003 | index.js:114 -> on-headers/index.js:71, `res.writeHead` | confirmed -> F-001 | Instance override of core `ServerResponse.prototype.writeHead` |
| C-004 | cookies/index.js:147 `http.OutgoingMessage.prototype.setHeader.call(res,...)` | rejected as patch | Read + direct invocation of core method; no write (bypasses framework overrides — supporting context) |
| C-005 | cookies/index.js:260 `socket.encrypted`/`connection.encrypted`, `req.protocol` | rejected as patch | Reads only |
| C-006 | cookies/index.js:280 `req.cookies = res.cookies =` | rejected as patch | Cookies.connect/express helper not activated by cookie-session; library-owned additions regardless |
| C-007 | cookies/index.js:226-232 `Cookie.prototype.maxage` wrap | rejected as patch | Library-owned prototype, not core |
| C-008 | depd/index.js:386-396 `Error.prepareStackTrace`/`stackTraceLimit` | confirmed -> F-002 | Transient global mutation, load-time activation proven |
| C-009 | depd/index.js:62/:485 defineProperty on caller object | rejected as patch | Only invoked on library-owned Cookie.prototype in this graph |
| C-010 | debug/src/node.js:118-126 `process.env.DEBUG` write/delete at load | rejected as patch | Environment data write-back (idempotent at load), not an API/behavior override |
| C-011 | safe-buffer/index.js re-export/copyProps | rejected as patch | Writes only to its own exports/function; core buffer module and Buffer.prototype read-only |
| C-012 | on-headers/index.js:19 appendHeader feature detect | rejected as patch | Read only |
| C-013 | on-headers wrapper statusCode/setHeader calls | folded into F-001 | Documented writable property and core method calls; part of the replacement's behavior |
| C-014 | depd/debug `process.stderr.write`, `process.emit('deprecation')` | rejected as patch | Method calls, no assignment |
| C-015 | keygrip / tsscmp / ms | rejected (no candidates) | Pure crypto/computation; sweeps produced no write candidates |
| C-016 | index.js:15 safe-buffer Buffer binding | rejected as patch | Module-local shadowing; underlying core Buffer unmodified |

No unresolved candidates.

## Supporting context

- cookies@0.9.1 `Cookies.prototype.set` (cookies/index.js:147-148) selects
  `http.OutgoingMessage.prototype.setHeader` and `.call(res, ...)`s it whenever
  the response has an Express-style `res.set`, deliberately bypassing framework
  or instance `setHeader` overrides when writing `Set-Cookie`. A read/call of
  core internals, not a mutation — but it interacts with anything else that
  overrides `res.setHeader`.
- debug@3.2.7 writes `process.env.DEBUG` back (or deletes the absent key) at
  load via `enable(load())` (common.js:244 -> node.js:118-126): process state
  data, not behavior (C-010).
- safe-buffer@5.2.1 on modern Node re-exports the core `buffer` module object
  unmodified; its legacy shim writes only to its own exports (C-011).
- Historical: cookie-session itself patched `res.writeHead` before 1.1.0
  (2014); the changelog entry "Use `on-headers` instead of `writeHead`
  patching" moved the same instance-override technique into on-headers, where
  it remains (F-001).
- cookie-session's own `req.session`/`req.sessionOptions` definitions (C-001,
  C-002) are new, configurable, library-owned properties on the request
  instance — the standard Express middleware extension pattern, not core
  overrides.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| $PACKAGE_ROOT runtime scope | `rg -n --no-ignore` sweeps S1-S8 (searches.md) | All candidate writes found: on-headers:71, depd:386-396, debug node.js:120/124, instance metadata writes; module-interception and binding searches negative |
| $PACKAGE_ROOT full reads | index.js + all 9 dependency runtime files | Confirms traces entry -> helper -> write for every candidate |
| $NODEJS_SOURCE lib/internal/http/server.js | `rg -n "writeHead" lib/_http_server.js lib/internal/http/server.js` | `ServerResponse.prototype.writeHead` at :423 (re-exported via lib/_http_server.js); baseline for F-001 |
| $NODEJS_SOURCE lib/internal/http/outgoing.js | `rg -n "OutgoingMessage.prototype.(set\|append\|remove\|get)Header"` | setHeader :813, appendHeader :877, getHeader :914, removeHeader :973 — documented methods the wrapper and cookies call |
| $NODEJS_SOURCE lib/internal/http/incoming.js | `rg -n "session"`; `sed -n '110,125p'` | No core `session`/`sessionOptions` member (rejects C-001/C-002 as overrides); `connection` is a core accessor alias for `socket` (C-005 reads) |
| $NODEJS_SOURCE lib/internal/errors.js | `rg -n "prepareStackTrace"` | :136-:166 — Node consults user-set `Error.prepareStackTrace` on stack materialization; baseline for F-002 |
| on-headers upstream | https://github.com/expressjs/on-headers/security/advisories/GHSA-76c9-3jph-rj3q (verified via `gh api`, published 2025-07-17, patched 1.1.0, severity low) | Confirms wrapper semantics are security-relevant and that 1.1.0 (the installed version) carries the remove+append array replay |
| cookie-session changelog | $PACKAGE_ROOT/HISTORY.md (2.1.1, 1.1.0 entries) | 2.1.1 bumps on-headers ~1.1.0 for the CVE; 1.1.0 (2014) "Use `on-headers` instead of `writeHead` patching" |
| Reproductions | `node repro-writehead-override.js "$PACKAGE_ROOT"`; `node repro-depd-preparestacktrace.js "$PACKAGE_ROOT"` (Node v24.19.0) | F-001: own-property override, prototype untouched; F-002: two load-time set/restore cycles on `Error.prepareStackTrace`, values restored |

File hashes (sha256, $PACKAGE_ROOT-relative):

| File | sha256 |
| --- | --- |
| index.js | 9f2b1fa8d2773e938396bc562e07f3f02611aa8554d42d32f708bad392a23108 |
| node_modules/on-headers/index.js | 76682a9fc3bbe62975176e2541f39a8168877d828d5cad8b56461fc36ac2b856 |
| node_modules/depd/index.js | 4d587a5662e20a7bb9bfe6555afe5987e1b80303a819b447394f37a93297ee91 |
| node_modules/cookies/index.js | aa8241d213ab306f2d7c65175e175658155ba19c596bb2174cdb4ce2944a180f |
| node_modules/debug/src/node.js | 6c360c37e9dc1d14f41e35efdc66b707a56f069e24414307c76e74c7bd505702 |
| node_modules/debug/src/common.js | 631983c237a5cf407a98526330f4cdc92b88fc557c34f86a9b8ee63285b346ba |
| node_modules/debug/src/index.js | 49c2426f5032902827c51781dbbedfa5d77c0934d785e3125efde53b5238eaaa |
| node_modules/safe-buffer/index.js | 184d5c4a83512e3f49d4d5b52f7073f601f933bad11f1fbb3ad364ca5e6478e1 |
| node_modules/keygrip/index.js | 4a38fe59a5424e779823bd749d4dd790e0d58faca993886a43bb1f68161fc382 |
| node_modules/tsscmp/lib/index.js | 8a48bb471b338cccf04fd9538ff405534c24a3e57ae508f29b5a6ed0bb5536f7 |
| node_modules/ms/index.js | e5f0b6a946a9b2b356a28557728410717df54ea2f599edb619f9839df6b7b0e9 |

## Coverage and limitations

- Entry points: single export `index.js` (`module.exports = cookieSession`);
  no install scripts, no conditional exports, no shipped dist bundles.
- Dependencies resolved and read in full at installed versions: cookies@0.9.1,
  debug@3.2.7 (node path; browser.js is browser-only), on-headers@1.1.0,
  safe-buffer@5.2.1, depd@2.0.0 (index.js; lib/browser is browser-only),
  keygrip@1.1.0, ms@2.1.3, tsscmp@1.0.6.
- Node.js files read (targeted, at d44625a4b80): lib/_http_server.js (header),
  lib/internal/http/server.js:410-505, lib/internal/http/outgoing.js
  (method-definition lines), lib/internal/http/incoming.js:110-125 plus
  negative session search, lib/internal/errors.js prepareStackTrace region.
  Note this Node ref hosts the HTTP implementation under lib/internal/http/
  with lib/_http_*.js as re-export shims; on older releases the same
  `writeHead` lives in lib/_http_server.js.
- Branches untested: debug's optional `supports-color` require (package not
  installed; its code only adjusts a color table); safe-buffer's legacy
  (pre-Buffer.from) branch (dead on supported Node; writes only to own
  exports); depd behavior under `process.noDeprecation` (suppresses logging
  only — the load-time getStack cycles still run, as reproduced).
- Reproduction used Node v24.19.0; a tested branch cannot prove universal
  absence on other runtimes, but both findings are version-independent
  unconditional code paths.
- What would change the verdict: nothing identified; downgrading F-002 to
  supporting context would be defensible if transient, synchronously-restored
  global writes are excluded from the patch definition — it is reported as a
  confirmed (transient) shared global mutation because the write is real,
  unconditional at load, and on shared core-consumed API surface.

## Changes since the previous audit

First audit (pass A of a double-blind protocol); no previous report existed in
this output directory.
