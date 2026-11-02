# Search log — express 5.3.0 monkeypatch audit (pass A)

All commands were run from `$PACKAGE_ROOT` (express 5.3.0, commit
1c6f1b0fe4000977b9a7b4f34097e4d527dd9824) unless noted. Node.js baseline reads
were run from `$NODEJS_SOURCE` (main, d44625a4b80c672215b469906ce583ce7eeeebaf).
Scope filters used throughout: `--no-ignore -g '*.js'` with exclusions
`!**/test/**`, `!**/tests/**`, `!**/examples/**`, `!**/benchmarks/**`,
`!**/*.min.js` (and `!**/dist/qs.js` where noted — browser bundle duplicating
`qs/lib`, not loaded via the package `main`).

## Scope establishment

| # | Command | Result |
| --- | --- | --- |
| S-01 | `cat package.json; ls; ls lib` | 28 runtime deps; shipped files = `index.js`, `lib/` (6 files, 2765 lines); engines `node >= 18` |
| S-02 | `git log -1` | HEAD = 1c6f1b0fe40 (matches requested provenance) |
| S-03 | `find node_modules -name node_modules -mindepth 2` | no nested node_modules — flat tree, 62 installed packages |
| S-04 | `node -e` loop printing each installed package's `name/version/main` | full entrypoint inventory recorded (see candidates.md); versions pinned |
| S-05 | Full reads: `index.js`, `lib/express.js`, `lib/application.js`, `lib/request.js`, `lib/response.js`, `lib/utils.js`, `lib/view.js` | 100% of shipped express runtime code read line-by-line |

## Candidate pattern sweeps (skill pattern set)

| # | Pattern (rg -n) | Scope | Result |
| --- | --- | --- | --- |
| P-01 | `require\s*\(\|\bfrom\s*['"]\|\bimport\s*\(\|\bnode:` | express lib + dep entrypoints | Core imports inventoried: express uses node:events, node:http, node:net, node:path, node:fs, node:querystring, node:buffer. Deps import http (router, express), crypto (etag, cookie-signature), fs/stream/util (send, iconv-lite streams opt-in), url (parseurl), zlib (body-parser read), async_hooks (on-finished), tty/util (debug), buffer (safer-buffer, iconv-lite). No dynamic computed core loading except `lib/view.js:81` `require(mod)` for template engines (third-party, not core) |
| P-02 | `(^\|[^.\w$])(process\|globalThis\|global\|Buffer\|Error)\.[A-Za-z_$][\w$]*\s*=[^=]` (write form of skill's global pattern) | whole runtime tree | **4 hits, all in `node_modules/depd/index.js:386,387,395,396`** — `Error.prepareStackTrace` / `Error.stackTraceLimit` save/replace/restore. No other writes to process/global/globalThis/Buffer/Error anywhere |
| P-03a | `__proto__\|setPrototypeOf\|Reflect\.(set\|defineProperty\|setPrototypeOf)` | whole runtime tree | Hits: `lib/application.js:118-121,169-170,233-234` (express req/res + settings/engines proto swaps); `router/index.js:64` (own function object); `http-errors/index.js:139,208` (own Error instances); `setprototypeof` (helper export only); `dunder-proto`, `qs`, `object-inspect`, `iconv-lite`, `get-intrinsic` (null-proto object literals / feature detection only — no core writes) |
| P-03b | `definePropert(y\|ies)\|Object\.assign` | whole runtime tree | Hits reviewed one-by-one: express (own `this`/settings), merge-descriptors (destination arg = express app), **once/once.js:6,13 (`Function.prototype` — opt-in `once.proto`, see P-07)**, depd (caller-supplied obj + own Error instances), http-errors (own err objects/ctors), debug (own debug fn), ipaddr.js (own arrays), qs (parse targets), es-define-property (feature detect), content-type/content-disposition (ESM markers), path-to-regexp (ESM marker), router (param objects) |
| P-03c | `\.prototype(\.[A-Za-z_$][\w$]*)?\s*=[^=]` | whole runtime tree | All assignments target library-owned constructors: router Layer/Route/Router, express View, send SendStream, ipaddr IPv4/IPv6, negotiator, accepts, iconv-lite codecs/streams, inherits_browser (browser-only), function-bind (own bound fn), http-errors (own ClientError/ServerError), safer-buffer (`safer.Buffer.prototype = Buffer.prototype` — write to its *own* copy object, reading core). **Zero assignments to core prototypes** |
| P-04 | `monkey.?patch\|\bpatch\b\|\bshim\b\|\bpolyfill\b\|\boverride\b` (case-insensitive) | whole runtime tree | Hits: **on-finished/index.js:129,181,188 "node.js 0.8 patch" (`patchAssignSocket`)** — investigated (C-011); get-intrinsic:357 comment ("override mistake" — read-only intrinsics); iconv-lite dbcs-data comment; inherits_browser comment. No others |
| P-05 | `require\.cache\|require\.extensions\|Module\._(load\|resolveFilename\|extensions\|compile)\|syncBuiltinESMExports\|registerHooks` | whole runtime tree | **No hits** — no module-loading interception anywhere in the tree |
| P-06 | `process\.(binding\|_linkedBinding)\|internalBinding\|['"]_http_\|['"]internal/` | whole runtime tree | 1 hit: `safer-buffer/safer.js:61` `process.binding('buffer').kStringMaxLength` — read-only, try/catch-guarded (C-016). No `internal/` or `_http_` requires |

## Targeted follow-up searches

| # | Command | Result |
| --- | --- | --- |
| T-01 | `rg '\b(req\|res\|msg\|stream\|socket\|sock)\.[A-Za-z_$][\w$]*\s*=[^=]'` (minus `res.statusCode/statusMessage`) | Complete instance-write inventory: express `lib/application.js:165,166,174` (`req.res`, `res.req`, `res.locals`); all `lib/request.js` / `lib/response.js` writes target the module-level library prototype objects, not instances; router `req.next/baseUrl/originalUrl/params/route/url` (index.js:174-332, lib/route.js:115); body-parser `req.body` (lib/read.js:53,194); on-finished `msg.__onFinished` (147,164) and `res.assignSocket` (195, legacy branch); parseurl `req._parsedUrl`/`req._parsedOriginalUrl` (54,84). **No reachable method override of a core-backed instance** |
| T-02 | `rg '_readableState\|_writableState\|_implicitHeader\|\b_header\b\|outputSize\|_httpMessage'` | 1 hit: `raw-body/index.js:176` reads `stream._readableState` (private read, no write) |
| T-03 | `rg 'once\.proto\|\.proto\s*\('` | Only the definition at `once/once.js:5`. `once.proto()` is **never called** in the runtime tree → Function.prototype write not activated |
| T-04 | `rg -l "require\('depd'\)"` | `lib/response.js`, `router/index.js`, `router/lib/layer.js`, `http-errors/index.js` — all load depd at module init (all reached by `require('express')`) |
| T-05 | `rg 'deprecate\.(function\|property)\s*\('` | **No hits** — depd's object-mutating wrappers (`wrapfunction`/`wrapproperty`) are never used; only message-log `deprecate('…')` calls (response.js:827-835, router, http-errors:73) |
| T-06 | `rg '(req\|this)\._body\s*=\|req\.secret\s*='` | No hits (body-parser 2.4.0 sets only `req.body`) |
| T-07 | `rg -l "require\('safer-buffer'"` (runtime files) | iconv-lite only (lib + encodings); qs/object-inspect hits are test/example files (out of scope) |
| T-08 | Read: finalhandler/index.js (full), parseurl, unpipe, ee-first, router/index.js (init + handle), on-finished (full), safer-buffer (full), once+wrappy (full), depd (lines 1-120, 380-540), iconv-lite/lib/index.js, body-parser/index.js, raw-body:160-200, serve-static (write sites), send (header/entry sections), inherits.js, debug src greps | All confirmed public-API usage / library-owned objects / instance metadata only |
| T-09 | Entrypoint side-effect scan loop over the ~44 pure-utility packages (accepts, type-is, media-typer, mime-types, mime-db, fresh, vary, statuses, range-parser, content-type, content-disposition, encodeurl, escape-html, cookie, cookie-signature, bytes, ms, toidentifier, forwarded, proxy-addr, etag, negotiator, merge-descriptors, is-promise, setprototypeof, hasown, gopd, has-symbols, function-bind, es-*, get-proto, dunder-proto, math-intrinsics, call-bind-apply-helpers, call-bound, side-channel*, object-inspect, get-intrinsic, path-to-regexp, qs, ipaddr.js, http-errors) | Only core imports found: cookie-signature→crypto, etag→crypto+fs.Stats, http-errors→depd (see T-04). No top-level core mutations (corroborated by P-02/P-03/P-05/P-06 covering the same files) |

## Node.js baseline reads ($NODEJS_SOURCE, targeted per skill table)

| # | File | Finding |
| --- | --- | --- |
| N-01 | `lib/http.js` | `IncomingMessage` re-exported from `internal/http/incoming`; server options typedef documents `IncomingMessage?`/`ServerResponse?` extension point (lines 33, 56, 69-70, 268-271) |
| N-02 | `lib/_http_incoming.js` | Legacy shim re-exporting `internal/http/incoming` (line 32-34) |
| N-03 | `lib/internal/http/incoming.js:61+` | `IncomingMessage(socket)` ctor: `this.socket = socket`, `this.url = ''` — plain data properties on the instance; prototype is `IncomingMessage.prototype` |
| N-04 | `lib/internal/http/outgoing.js:130+,187,304-314` | `OutgoingMessage` ctor sets `this[kSocket] = null`; `socket` is a prototype accessor returning `this[kSocket]` → a fresh `ServerResponse.socket` is `null`, **never `undefined`** → on-finished's `msg.socket === undefined` guard (index.js:128) cannot fire with real core objects |
| N-05 | `lib/internal/http/server.js:312,526-527,1375,1410` | `ServerResponse.prototype.assignSocket` original behavior recorded; server honors `options.IncomingMessage`/`options.ServerResponse` (documented subclassing extension express does not use); req/res constructed per request then dispatched |

## Upstream corroboration (read-only)

| # | Query | Result |
| --- | --- | --- |
| U-01 | `git log -S 'setPrototypeOf' -- lib/application.js lib/middleware` (in $PACKAGE_ROOT) | 8cb53ea5 2024-10-22 "refactor: Remove Object.setPrototypeOf polyfill (#6081)"; c087a45b 2017 typo fix; 78e50547 2014-07-14 "Refactor away init middleware" (moved proto swap from connect-style init middleware into `app.handle`) |
| U-02 | `gh search issues --repo expressjs/express "setPrototypeOf"` | #6039 (open): "Response built by express is broken if res and req don't extend node's http.IncomingMessage and http.ServerResponse" — confirms the instance proto-swap design; #7427 (open): sub-app prototype restoration edge case (application.js:233-234 path) |

## Reproduction

| # | Command | Result |
| --- | --- | --- |
| R-01 | `node repro-proto-check.js "$PACKAGE_ROOT"` (Node v24.19.0) | After require + full HTTP request cycle: `http.IncomingMessage.prototype`, `http.ServerResponse.prototype`, `http.OutgoingMessage.prototype`, `Function.prototype`, `Object.prototype` all unchanged (own-descriptor diff empty); `Object.getPrototypeOf(req) === app.request` and `=== app.response` for res (instance proto replaced, chain still reaches the core prototypes 2 hops up); `Error.prepareStackTrace`/`stackTraceLimit` equal to pre-require sentinels (restored) |
| R-02 | Variant with accessor-instrumented `Error.prepareStackTrace` | Crashed inside `depd/index.js:393` during `require(express)` — empirically proves depd assigns `Error.prepareStackTrace` at express import time (the accessor hid the assignment from V8, so `obj.stack` stayed raw) |

## Negative-result summary

- No module-loading interception (P-05: zero hits).
- No writes to `process`, `global`, `globalThis`, `Buffer`, or core module exports anywhere in the tree (P-02).
- No assignment to any Node core prototype (`*.prototype.* =`, `defineProperty`, `setPrototypeOf` targeting core objects) in any shipped runtime file (P-03a/b/c).
- No shimmer/require-in-the-middle-style patching dependency present (package inventory S-04).
- Dormant-only: `once.proto` (never called), on-finished `patchAssignSocket` (guard unreachable on baseline), unpipe node-0.8 fallback (public EE APIs only).
