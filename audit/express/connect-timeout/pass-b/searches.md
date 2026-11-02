# Search log: connect-timeout monkeypatch audit (pass-b)

All commands were run from `$PACKAGE_ROOT` (connect-timeout 1.9.1, commit
7377defb5b7b5a9c3d50fabd42c4dd46ad175d13) unless marked `$NODEJS_SOURCE`
(Node.js main, commit d44625a4b80c672215b469906ce583ce7eeeebaf). `rg` was run
with `--no-ignore` because the target tree lives under `node_modules`.

## Scope establishment

| # | Command | Result |
| --- | --- | --- |
| S-01 | `cat package.json` | version 1.9.1; runtime deps: http-errors ~1.6.1, ms 2.0.0, on-finished ~2.3.0, on-headers ~1.1.0; `files`: only index.js ships; engines `node >= 0.8` |
| S-02 | `for d in node_modules/*/; do node -e 'require(.../package.json)'` (version + main) | depd@1.1.2, ee-first@1.1.1, http-errors@1.6.3, ms@2.0.0, on-finished@2.3.0, on-headers@1.1.0, setprototypeof@1.1.0, statuses@1.5.0; all `main: index.js` |
| S-03 | `ls node_modules/*/` + `find node_modules/depd/lib -type f` + `ls node_modules/http-errors/node_modules` | depd has lib/compat/* and lib/browser/*; http-errors has nested inherits@2.0.3; no other nested deps |
| S-04 | `node -e "...depd/package.json browser"` | depd `browser: lib/browser/index.js` -> browser entry not loaded in Node runtime; excluded from runtime scope |
| S-05 | file list used for all pattern scans | `index.js` + all `*.js` under node_modules/{depd,ee-first,http-errors,ms,on-finished,on-headers,setprototypeof,statuses} incl. nested inherits (16 files) |

## Skill candidate pattern set (bounded `rg -n --no-ignore` over the 16 runtime files)

| # | Pattern | Result |
| --- | --- | --- |
| P-1 | `require\s*\(\|\bfrom\s*['"]\|\bimport\s*\(\|\bnode:` | 19 hits, all plain CommonJS requires of the declared deps plus core `http` (on-headers:16), `path` (depd:13), `events` (depd compat:14), `util` (inherits:2). No dynamic/computed loading. |
| P-2 | `\bBuffer\b\|\bprocess\b\|\bglobalThis\b\|\bglobal\b\|\bextends\b\|\binherits\s*\(` | process reads only (env, cwd, stderr.write, noDeprecation, nextTick) + `process.emit('deprecation')` (depd:235, custom event, no mutation); `inherits()` calls in http-errors:121/164/211 on library-owned ctors. No global/globalThis/Buffer writes. |
| P-3 | `\.prototype\b\|__proto__\|setPrototypeOf\|definePropert(y\|ies)\|Reflect\.(set\|defineProperty\|setPrototypeOf)\|Object\.assign` | on-headers:19 read-only feature detect of `http.ServerResponse.prototype.appendHeader`; setprototypeof:1-15 (helper only); http-errors:143/190 setPrototypeOf on library-created errors, :146-207 defineProperty on same, :166-168/213-215 writes on library ctor prototypes; depd defineProperty on own exports (compat:57/66), caller-supplied obj (index:64/469, not activated here), library-created error (index:480-505); inherits_browser (not loaded in Node). No core prototype writes. |
| P-4 | `monkey.?patch\|\bpatch\b\|\bwrap\b\|\bshim\b\|\bpolyfill\b\|\boverride\b` (case-insensitive) | on-finished:127 `// node.js 0.8 patch` and :179 `Patch ServerResponse.prototype.assignSocket for node.js 0.8` -> C-010; depd wrap comments (wrapproperty, library-directed); inherits_browser "old school shim" (browser-only). |
| P-5 | `require\.cache\|require\.extensions\|Module\._(load\|resolveFilename\|extensions\|compile)\|syncBuiltinESMExports\|registerHooks` | **No hits** (exit 1). No module-loading interception anywhere in scope. |
| P-6 | `process\.(binding\|_linkedBinding)\|internalBinding\|['"]_http_\|['"]internal/` | **No hits** (exit 1). No native-binding or Node-internal module access. |

## Supplemental targeted searches

| # | Pattern | Result |
| --- | --- | --- |
| P-7 | `(req\|res\|msg)\.[A-Za-z_$][\w$]*\s*=[^=]` | index.js:48/60 `req.timedout`, :56 `req.clearTimeout` (C-001/C-002); on-headers:71 `res.writeHead =` (C-007 -> F-001); on-finished:145/162 `msg.__onFinished` (C-009), :192 `res.assignSocket =` (C-010 -> F-003). Complete write inventory on req/res/msg. |
| P-8 | `prepareStackTrace\|stackTraceLimit\|captureStackTrace` | depd/index.js:366-380 and depd/lib/compat/index.js:22-40 temporary swap of `Error.prepareStackTrace` + `Error.stackTraceLimit` with save/restore (C-012/C-013 -> F-002); http-errors:93/140/187 `Error.captureStackTrace` calls (read-only capture, C-022). |
| P-9 | `writeHead\|assignSocket\|setTimeout\|clearTimeout\|\.emit\s*\(\|\beval\s*\(` | connect-timeout uses global timers (index.js:47/57/63/67) and `req.emit('timeout', delay)` (index.js:49, C-003); depd:410 `eval` builds a wrapper for a *passed-in* function (C-014, used on http-errors' own export at http-errors:247); all writeHead/assignSocket hits already covered by P-7. |

## Node.js core verification ($NODEJS_SOURCE, targeted files only)

| # | Command | Result |
| --- | --- | --- |
| N-01 | `rg -n "writeHead\|assignSocket" lib/_http_server.js` | no definitions — implementation moved; `lib/_http_server.js` is a deprecated re-export shim (emits DEP0199) of `lib/internal/http/server.js` |
| N-02 | `head lib/http.js` (follow re-exports) | http.js re-exports from `lib/internal/http/{server,incoming,outgoing,client,agent,common}.js` |
| N-03 | `rg -n "prototype\.writeHead\|prototype\.assignSocket" lib/internal/http/server.js` | `ServerResponse.prototype.assignSocket` at server.js:312; `ServerResponse.prototype.writeHead = writeHead` at server.js:423 (data property -> instance assignment shadows it) |
| N-04 | `rg -n "timedout\|clearTimeout\|setTimeout\|'timeout'" lib/internal/http/incoming.js` | only `IncomingMessage.prototype.setTimeout` at incoming.js:257 (registers `'timeout'` listeners on the message, delegates to socket). **No `timedout` or `clearTimeout` members** -> connect-timeout's req keys are new, library-owned. |
| N-05 | `rg -n "this\.socket =\|this\.finished\|kSocket" lib/internal/http/outgoing.js` + context reads | ctor sets `this.finished = false` (outgoing.js:180) and `this[kSocket] = null` (outgoing.js:187); `socket` is a prototype accessor (outgoing.js:304). `res.socket` is therefore never `undefined` on this baseline -> on-finished's `patchAssignSocket` guard (`msg.socket === undefined`) cannot pass. |
| N-06 | `rg -n "'timeout'" lib/internal/http/server.js` | core itself emits `'timeout'` on req/res in `socketOnTimeout` (server.js:929-934) -> connect-timeout's `req.emit('timeout', delay)` reuses a core event name (supporting context, not a write). |
| N-07 | `sed -n '423,480p' lib/internal/http/server.js` (writeHead body) | core writeHead parses `(statusCode[, reason][, headers])`, sets statusMessage/statusCode, merges headers into `[kOutHeaders]` / header string. Baseline for the on-headers wrapper's re-implementation of argument handling. |
| N-08 | `rg -n "prepareStackTrace" lib/internal/errors.js` + `ls lib/internal/source_map/prepare_stack_trace.js` | Node core maintains its own `Error.prepareStackTrace` machinery (per-realm callback, source-map formatting) -> userland reassignment of this hook touches an API Node core itself coordinates on. |

## Upstream corroboration (read-only)

| # | Query | Result |
| --- | --- | --- |
| U-01 | `gh api '/advisories?affects=on-headers'` | GHSA-76c9-3jph-rj3q / CVE-2025-7339: on-headers < 1.1.0 "http response header manipulation" — a bug in this exact writeHead wrapper altered response headers; installed 1.1.0 is the first patched version (wrapper copies leading args, uses setHeader/appendHeader). Corroborates the wrapper replaces core argument handling. |
| U-02 | `gh api 'repos/jshttp/on-finished/commits?path=index.js'` filtered for assignSocket/0.8 | e5f64aa8d7 (2014-05-25) "build: restore compatiblity with node 0.8" and 87eff30f33 (2015-12-19) "build: ignore 0.8 code since istanbul does not run" — `patchAssignSocket` is acknowledged legacy Node 0.8 code excluded from modern coverage. |

## Reproduction

| # | Command | Result |
| --- | --- | --- |
| R-01 | `node repro.js "$PACKAGE_ROOT"` (Node v24.19.0) | 1a: 6 writes to `Error.prepareStackTrace` during `require()` (3 swap/restore pairs); 1b: restored to original afterwards. 2a-d: `res.writeHead` own property appears only after middleware, differs from prototype method, prototype unchanged. 3a-d: `req.timedout`/`req.clearTimeout` own keys; neither exists on `IncomingMessage.prototype`. 4a-d: `res.__onFinished` metadata added; `assignSocket` NOT overridden; prototype unchanged; guard `res.socket === undefined` is false. |

## Negative results summary

- No module-loading interception (P-5: zero hits).
- No native bindings / Node-internal module access (P-6: zero hits).
- No writes to any core prototype or constructor from any file in scope (P-3 inventory fully triaged).
- No `global`/`globalThis`/`Buffer`/`process` property writes (P-2; `process.emit` is an event emission, not a mutation).
- ms, statuses, ee-first, setprototypeof, inherits: no core-object writes at all.
