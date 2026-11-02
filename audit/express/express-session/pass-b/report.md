# Node.js patch audit: express-session

- Verdict: confirmed patching (per-request core-backed instance overrides and one transient global write; no persistent shared core mutation)
- Status: complete
- Input: npm package `express-session` (Express session middleware), local source at `$PACKAGE_ROOT`
- Library: express-session 1.19.0, git clone of https://github.com/expressjs/session, branch master, commit 8947e169ae838b22cc1af198e50e370e6fc09f96
- Node.js baseline: `$NODEJS_SOURCE`, main branch, commit d44625a4b80c672215b469906ce583ce7eeeebaf
- Reproduction runtime: Node.js v24.19.0 (repro/instance-override-check.js; no executable path recorded)
- Scope: production/runtime files `index.js`, `session/cookie.js`, `session/memory.js`, `session/session.js`, `session/store.js`; resolved runtime dependencies at `$PACKAGE_ROOT/node_modules`: cookie@0.7.2, cookie-signature@1.0.7, debug@2.6.9 (+ ms@2.0.0), depd@2.0.0, on-headers@1.1.0, parseurl@1.3.3, random-bytes@1.0.0, safe-buffer@5.2.1, uid-safe@2.1.5. Tests, docs, scripts, and devDependencies out of scope.
- Coverage: all five runtime files and every dependency entrypoint read in full; full candidate pattern set run over target and dependencies (see searches.md); Node.js comparisons limited to targeted HTTP/events/util/errors files; reproduction executed on one runtime version.

## Patching verdict

express-session patches Node.js core-backed objects at the **instance level, per
request**: it replaces `res.end` on every live `http.ServerResponse` passing
through the middleware (F-001, direct), and its runtime dependency `on-headers`
replaces `res.writeHead` on the same instances (F-002, transitive). Both are own
properties that shadow the core prototype methods; both save and delegate to the
original; neither mutates `OutgoingMessage.prototype` or
`ServerResponse.prototype` (verified statically and by reproduction).

In addition, the runtime dependency `depd` performs a **transient shared global
write**: inside `getStack()` it reassigns `Error.prepareStackTrace` and
`Error.stackTraceLimit` on the global `Error` constructor, captures a stack,
and synchronously restores both saved values (F-003, transitive). This runs at
`require('express-session')` time and again whenever a deprecation message is
logged. Reproduction confirms both values are identical to the originals after
require and after a deprecation fires.

Counts: 0 persistent shared core mutations; 2 per-request core-backed instance
overrides (1 direct, 1 via on-headers@1.1.0); 1 transient, synchronously
restored global write (via depd@2.0.0). No module-loading interception, no
core source rewrites, no prototype mutation. No unresolved candidates.

## Confirmed Node.js patches

### F-001: `res.end` replaced per response instance (shadows `OutgoingMessage.prototype.end`)

- Category: instance/application override (core-backed `http.ServerResponse` instance)
- Library site(s): `$PACKAGE_ROOT/index.js:266-269` (originals saved at 266-267, write at 269; wrapper body 269-379; delegation at 281, 286, 314, 320, 344, 378) — https://github.com/expressjs/session/blob/8947e169ae838b22cc1af198e50e370e6fc09f96/index.js#L266-L379
- Origin: direct
- Core baseline: `$NODEJS_SOURCE/lib/internal/http/outgoing.js:1289` `OutgoingMessage.prototype.end` (re-exported through `lib/_http_outgoing.js` and `node:http`); `OutgoingMessage.prototype.write` at `lib/internal/http/outgoing.js:1027` is captured (`_write`, index.js:267) and invoked but **not** replaced. Original `end(chunk, encoding, callback)` finalizes and flushes the response immediately and returns `this`.
- Exact mutation: `res.end = function end(chunk, encoding) {...}` — new own data property on the response instance, shadowing the inherited prototype method. Originals kept in closure vars `_end`/`_write`.
- Execution chain: app calls `session(options)` -> returned middleware `function session(req, res, next)` -> assignment executed on every request before `next()` (index.js:266-269).
- Activation: per request, unconditional on the production path (after the self-awareness, store-ready, cookie-path, and secret checks at index.js:188-217). No environment guard.
- Scope and restoration: single response instance; never restored (instance is discarded when the request completes). Shared prototype verified unchanged before/during/after a request (repro output).
- Resulting behavior: `res.end` becomes idempotent for the instance (second call returns `false`, index.js:270-272); when the session must be saved/destroyed/touched, headers plus all but the final byte of the body are flushed through the saved `_write` (`writetop`, index.js:289-324, including forcing headers via `res._implicitHeader()`), and the final byte plus stream finalization (`_end`) are deferred until the store callback completes (`writeend`, index.js:279-287). Return value in the deferred path is the `_write` result rather than the `_end` result.
- Evidence: static read of index.js; reproduction `node repro/instance-override-check.js "$PACKAGE_ROOT"` -> `res has own "end": true`, `res.end !== OutgoingMessage.prototype.end: true`, `shared prototype end still unchanged: true` (repro/instance-override-check.out.txt).
- Upstream: present since the repository import (commit e21cc9b, 2014-02-15, found via `git log -S 'res.end = function' -- index.js`); comment at index.js:265 documents intent: "proxy end() to commit the session".

### F-002: `res.writeHead` replaced per response instance by on-headers (shadows `ServerResponse.prototype.writeHead`)

- Category: instance/application override (core-backed `http.ServerResponse` instance)
- Library site(s): activation `$PACKAGE_ROOT/index.js:235` (`onHeaders(res, function(){...})`); write `$PACKAGE_ROOT/node_modules/on-headers/index.js:71` (`res.writeHead = createWriteHead(res.writeHead, listener)`); wrapper `node_modules/on-headers/index.js:30-52` — https://github.com/expressjs/on-headers/blob/v1.1.0/index.js#L71
- Origin: express-session -> on-headers@1.1.0
- Core baseline: `$NODEJS_SOURCE/lib/internal/http/server.js:423-424` `ServerResponse.prototype.writeHead = writeHead`; `ServerResponse.prototype._implicitHeader` at `lib/internal/http/server.js:419-421` calls `this.writeHead(this.statusCode)`, so the instance wrapper also intercepts implicit header writes. Original `writeHead(statusCode, reason, obj)` serializes status and argument headers directly into the header block.
- Exact mutation: `res.writeHead` own property set to a closure `writeHead(statusCode)` that (1) re-implements argument handling — assigns `this.statusCode` and applies argument headers via `res.setHeader`/`res.appendHeader`/`res.removeHeader` (on-headers/index.js:119-180; `appendHeader` feature-detected at load, index.js:19-20) — (2) fires the listener once, (3) delegates to the saved previous `writeHead` with a possibly updated status code.
- Execution chain: middleware per request -> `onHeaders(res, listener)` -> instance write. The listener is express-session's Set-Cookie hook (index.js:235-263): touches the session and appends the signed session cookie via `res.setHeader('Set-Cookie', ...)` (index.js:711-721) just before headers are flushed.
- Activation: per request, unconditional (runs for every request the middleware handles, before any session lookup result).
- Scope and restoration: single response instance; never restored; prototype verified unchanged (repro output). If applied after other instance wrappers, the saved `prevWriteHead` is whatever `res.writeHead` resolved to at call time, preserving delegation.
- Resulting behavior: headers passed as `writeHead` arguments become visible to `getHeader`/`setHeader` (applied before the final write) and the listener can still add or change headers (this is what makes late `Set-Cookie` possible); status code set inside the listener propagates (on-headers/index.js:44-47). Without the patch, argument headers would bypass the header map and no code could run between `writeHead` invocation and header serialization.
- Evidence: static read of on-headers/index.js; reproduction -> `res has own "writeHead": true`, `res.writeHead !== ServerResponse.prototype.writeHead: true`, `shared prototype writeHead still unchanged: true`.
- Upstream: on-headers HISTORY.md describes the mechanism as a patch ("1.0.2 ... Fix `res.writeHead` patch missing return value"); 1.1.0 (2025-07-17) fixes CVE-2025-7339 / GHSA-76c9-3jph-rj3q in the array-header handling of this wrapper. Repository: https://github.com/expressjs/on-headers

### F-003: transient reassignment of global `Error.prepareStackTrace` / `Error.stackTraceLimit` by depd

- Category: shared global mutation — transient, saved and synchronously restored
- Library site(s): `$PACKAGE_ROOT/node_modules/depd/index.js:381-399` (`getStack()`: writes at 386-387, restore at 395-396); activation sites `$PACKAGE_ROOT/index.js:20` and `$PACKAGE_ROOT/session/cookie.js:15` (`require('depd')('express-session')` -> depd/index.js:108), and every deprecation log (depd/index.js:199) — https://github.com/dougwilson/nodejs-depd/blob/v2.0.0/index.js#L381-L399
- Origin: express-session -> depd@2.0.0
- Core baseline: `Error.prepareStackTrace` is the V8 stack-trace API hook honored by Node.js — `$NODEJS_SOURCE/lib/internal/errors.js:145-150` invokes `globalThis.Error.prepareStackTrace(error, trace)` when set; `Error.stackTraceLimit` is the engine-level stack depth control. Default behavior: formatted string stacks.
- Exact mutation: `Error.prepareStackTrace = prepareObjectStackTrace` (returns the raw CallSite array) and `Error.stackTraceLimit = Math.max(10, limit)` on the global `Error` constructor; `Error.captureStackTrace(obj)` and `obj.stack` access occur inside the window; both saved originals are restored before `getStack()` returns.
- Execution chain: `require('express-session')` -> `require('depd')('express-session')` -> `depd()` -> `getStack()`; later `deprecate(msg)` -> `log()` -> `getStack()`.
- Activation: unconditional at module load; again whenever a deprecation fires (production-reachable: omitted `resave`/`saveUninitialized`/`secret` options, legacy cookie-parser data at index.js:614/627, `maxAge` as Date at session/cookie.js:89). Suppression via `process.noDeprecation`/`NO_DEPRECATION` skips the message but not the load-time `depd()` call.
- Scope and restoration: process-global `Error` constructor; the mutation window is synchronous with no interleaved user code, and both properties are restored unconditionally before return. Reproduction confirms identity restored after require and after a fired deprecation.
- Resulting behavior: during the window, any `.stack` materialization would produce a CallSite array instead of a string; outside the window there is no observable change. Practical effect: none persistent; recorded because it is a real, reachable write to a shared global core API.
- Evidence: static read of depd/index.js; reproduction -> `Error.prepareStackTrace restored: true`, `Error.stackTraceLimit restored: true` at both checkpoints.
- Upstream: standard V8 stack-trace API usage pattern (https://v8.dev/docs/stack-trace-api, referenced by `$NODEJS_SOURCE/lib/internal/errors.js:93`). Repository: https://github.com/dougwilson/nodejs-depd

## Candidate ledger and unresolved questions

Full ledger with reasons in candidates.md. Summary:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | index.js:269 `res.end =` (OutgoingMessage.prototype.end) | confirmed -> F-001 | instance override, prototype untouched |
| C-002 | index.js:266-267 `_end`/`_write` saved | rejected as patch | `res.write` captured but never reassigned; part of F-001 delegation |
| C-003 | index.js:235 `onHeaders(res, fn)` | confirmed -> F-002 | activation site of transitive `res.writeHead` instance override |
| C-004 | index.js:294-295 `res._header`, `res._implicitHeader()` | rejected as patch | private core API read/invoke only; no write (baselines internal/http/outgoing.js:188, internal/http/server.js:419) |
| C-005, C-006, C-013 | index.js:159-160, 229, 232; session/store.js:100 `req.session`/`sessionID`/`sessionStore` | rejected as patch | new own properties on req; no `IncomingMessage` member shadowed (negative grep in $NODEJS_SOURCE/lib/_http_incoming.js) |
| C-007, C-008 | index.js:158 `store.generate =`; 428-440 defineProperty `sess.save`/`sess.reload` | rejected | library-owned Store/Session objects |
| C-009, C-010, C-011 | index.js:65-67 defer; crypto/signature use; `res.setHeader('Set-Cookie')` | rejected | documented API consumption; no replacement |
| C-012 | session/store.js:40, session/memory.js:49 `util.inherits(..., EventEmitter/Store)` | rejected | documented inheritance ($NODEJS_SOURCE/lib/events.js:212, lib/util.js:344); EventEmitter.prototype untouched |
| C-014 - C-017 | session/session.js, session/cookie.js:51, session/memory.js prototypes; session.js:110 `delete this.req.session` | rejected | library-owned prototypes/properties only |
| C-030 | on-headers/index.js:71 `res.writeHead =` (ServerResponse.prototype.writeHead) | confirmed -> F-002 | transitive core-backed instance override, applied every handled request |
| C-031 | on-headers/index.js:19 `http.ServerResponse.prototype.appendHeader` typeof | rejected | read-only feature detection at load |
| C-032 | depd/index.js:386-396 `Error.prepareStackTrace`/`stackTraceLimit` | confirmed -> F-003 | transient global write, saved and synchronously restored (repro-verified) |
| C-033 | depd/index.js:413-486 `wrapfunction`/`wrapproperty` | rejected | capable of redefining arbitrary properties, but express-session never calls `deprecate.function`/`deprecate.property` (negative grep) |
| C-034, C-035 | depd/index.js:492-538 `DeprecationError` descriptors; process.emit/stderr.write | rejected | own Error instance; documented process APIs |
| C-036 | debug/src/debug.js:139 + src/node.js:248 `process.env.DEBUG` write at load | rejected | documented mutable `process.env`; value-preserving write-back |
| C-037 | debug/src/node.js:61-69, 167-226 DEBUG_FD path (`process.binding('tty_wrap')`, `fs.SyncWriteStream`, `stream.read = null`) | rejected | env-gated, never activated by express-session; mutates only self-created streams; copied core code does not replace core |
| C-038 | debug/src/inspector-log.js:10-15 `console._stdout` swap | rejected | unreachable: not required by debug's entry chain (negative grep) |
| C-039, C-040 | debug/src/browser.js, depd/lib/browser/index.js; debug own exports wiring | rejected | browser/Electron-renderer entrypoints; library-owned module objects |
| C-041 | safe-buffer/index.js:12-27 | rejected | modern branch (taken on baseline/repro runtimes) re-exports core `buffer` unmodified; legacy branch writes only its own exports; `Object.create(Buffer.prototype)` is a read |
| C-042 | parseurl/index.js:54, 84 `req._parsedUrl`/`req._parsedOriginalUrl` | rejected | new own caching properties on req; not core members |
| C-043 | uid-safe/index.js:50, random-bytes/index.js:21,47 `global.Promise`/crypto identity reads | rejected | reads only; crypto.randomBytes used normally |
| C-044 - C-046 | cookie/index.js:23-24 Object.prototype aliases; cookie-signature crypto use; ms | rejected | pure reads/pure computation; no core writes |
Unresolved: none.

## Supporting context

- Private core API reads (no writes): `res._header` and `res._implicitHeader()`
  (index.js:294-295) are undocumented ServerResponse internals used to force
  header flush before splitting the body in F-001's deferred path. Baselines:
  `$NODEJS_SOURCE/lib/internal/http/outgoing.js:188` (own `_header` state) and
  `$NODEJS_SOURCE/lib/internal/http/server.js:419` (`_implicitHeader`). Breakage
  risk if core renames them, but not a patch.
- Request metadata: `req.session`, `req.sessionID`, `req.sessionStore` (and
  parseurl's `req._parsedUrl`/`req._parsedOriginalUrl`) are new own properties
  on the live `IncomingMessage` — ecosystem-standard request augmentation, not
  shadowing any core member.
- Documented extension points: `Store` inherits `EventEmitter` via
  `util.inherits` (session/store.js:40) — both documented public APIs; debug's
  optional DEBUG_FD stream code is an explicitly labeled copy of old
  `node/src/node.js` code ("Copied from `node/src/node.js`", debug/src/node.js:161)
  that builds its own stream rather than replacing core, and is inactive here.
- safe-buffer branch taken: on the reproduction runtime (and any Node >= 4.5),
  `Buffer.from/alloc/allocUnsafe/allocUnsafeSlow` all exist, so safe-buffer
  resolves to `module.exports = require('buffer')` — express-session's
  `Buffer` (index.js:16) is the unmodified core Buffer.
- uid-safe/random-bytes crypto usage: `uid(24)` (index.js:573-575) ->
  `random-bytes.sync` -> `crypto.randomBytes` with a bounded retry; plain
  consumption of the documented API.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| $PACKAGE_ROOT runtime files | full reads of index.js, session/{cookie,memory,session,store}.js | complete runtime surface; candidates C-001..C-008 |
| $PACKAGE_ROOT + deps | skill pattern set P1-P6 via `rg -n` (see searches.md) | all hits triaged; no module interception or binding writes in target; one `process.binding` read in debug (C-016) |
| res/req writes | `rg -n "\b(res|req)\.[A-Za-z_$]+\s*=[^=]" index.js session/` | only sites listed in ledger; single `res.*` reassignment (`res.end`) |
| depd activation | `rg -n "deprecate\.(function|property)" index.js session/` | negative — wrapfunction/wrapproperty never used (C-013 rejected) |
| Dependency entrypoints | full reads: on-headers, depd, debug (src/index,node,debug,browser,inspector-log), safe-buffer, parseurl, uid-safe, random-bytes, cookie-signature; targeted scan: cookie, ms | F-002/F-003 confirmed; all others rejected |
| Node.js HTTP contracts | $NODEJS_SOURCE/lib/internal/http/outgoing.js:1027,1289,1003,188; lib/internal/http/server.js:419-424,468; lib/_http_outgoing.js (DEP0199 shim) | baselines for F-001/F-002 and C-004 at commit d44625a4b80 |
| Node.js IncomingMessage | `rg -n "session|_parsedUrl" $NODEJS_SOURCE/lib/_http_incoming.js` | negative — no core members shadowed by req augmentation |
| Node.js events/util/errors | lib/events.js:212, lib/util.js:344, lib/internal/errors.js:91-150 | EventEmitter/inherits documented; prepareStackTrace hook honored by core (F-003 baseline) |
| Upstream history | `git log -n 5 -S 'res.end = function' -- index.js` (in $PACKAGE_ROOT) | res.end proxy present since repo import (e21cc9b, 2014-02-15) |
| on-headers upstream | node_modules/on-headers/HISTORY.md; https://github.com/expressjs/on-headers; CVE-2025-7339 / GHSA-76c9-3jph-rj3q | upstream itself names the mechanism "res.writeHead patch"; 1.1.0 fixed array-header handling in the wrapper |
| Reproduction | `node repro/instance-override-check.js "$PACKAGE_ROOT"` (Node v24.19.0) | prototypes and Error globals unchanged after require/deprecation; res.end/writeHead own-property overrides during request (repro/instance-override-check.out.txt) |

## Coverage and limitations

- Entry points: single entrypoint `index.js` (package.json `main` default,
  `files: ["session/", "index.js"]`); all four `session/` modules reached via
  requires. No install scripts, no native code, no conditional exports.
- Dependencies: all ten installed runtime packages inspected at their resolved
  entrypoints (versions listed in header); `ms` is debug's only transitive
  dependency. No further transitive runtime deps.
- Branches not exercised: safe-buffer legacy branch (pre-`Buffer.from` Node,
  engines allow >= 0.8 — on such runtimes safe-buffer still only writes its
  own exports); debug DEBUG_FD!=1/2 stream path (env-gated, C-016); debug
  browser/Electron-renderer entry and depd browser build (non-Node);
  `defer` `process.nextTick` fallback (pre-setImmediate Node). None of these
  can introduce a core patch beyond what is reported.
- Node.js baseline is current main (d44625a4b80), which moved HTTP internals to
  `lib/internal/http/*` with deprecated `_http_*` shims (DEP0199); on release
  lines the same contracts live in `lib/_http_outgoing.js`/`lib/_http_server.js`.
  Line numbers are pinned to the audited commit.
- Reproduction ran on one runtime (v24.19.0); a tested branch cannot prove
  universal absence, but all confirmed findings are proven statically.
- What would change the verdict: evidence of a shipped file mutating
  `http.*` prototypes, globals, or module loading — none exists in this tree;
  or a store implementation supplied by the application (out of scope here)
  performing its own patching.

## Changes since the previous audit

First audit (independent pass; no prior report read or updated, per double-blind protocol).
