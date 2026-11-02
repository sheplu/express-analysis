# Node.js patch audit: cookie-session

- Verdict: confirmed patching
- Status: complete
- Input: npm package `cookie-session` (Express cookie-based session middleware), local source at `$PACKAGE_ROOT`
- Library: cookie-session 2.1.1, git clone of https://github.com/expressjs/cookie-session, branch master, commit 75f53bb8f9118067955b344fb4ba550ed0e39318, no local changes observed
- Node.js baseline: main branch checkout at `$NODEJS_SOURCE`, commit d44625a4b80c672215b469906ce583ce7eeeebaf
- Reproduction runtime: Node.js v24.19.0 (scripts beside this report; no executable path recorded)
- Scope: runtime entrypoint `index.js` plus resolved runtime dependencies installed at `$PACKAGE_ROOT/node_modules`: cookies@0.9.1, debug@3.2.7, on-headers@1.1.0, safe-buffer@5.2.1, and transitive depd@2.0.0, keygrip@1.1.0, ms@2.1.3, tsscmp@1.0.6. Tests, docs, examples, and `scripts/version-history.js` (release tooling) out of scope.
- Coverage: all runtime source files of the target and all eight dependencies read in full; full candidate pattern set run over the scope; targeted Node.js core reads completed; upstream corroboration via GitHub API (read-only); two local reproductions run. No unresolved candidates.

## Patching verdict

Patching was demonstrated. cookie-session itself contains no core mutation, but it unconditionally activates two patch sites in its dependency chain:

- 1 instance/application override (transitive, on-headers@1.1.0): on every request handled by the middleware, the live `http.ServerResponse` instance's `writeHead` method is replaced with a wrapper that re-implements core argument handling before delegating to the saved original (F-001).
- 1 shared global mutation (transitive, depd@2.0.0): `Error.prepareStackTrace` and `Error.stackTraceLimit` are temporarily reassigned and then restored, synchronously, at module load of the `cookies` dependency and on any later deprecation logging (F-002). The window is fully synchronous, so no other code can observe the modified values; it is reported as a confirmed write with restoration, not as a persistent patch.

No shared prototype of a core class is mutated, no core module loading is intercepted, and no core source is rewritten anywhere in the inspected scope. `req.session` / `req.sessionOptions` are library-owned additions to the request instance, not overrides of any core property (see supporting context). No unresolved candidates limit this verdict; browser-only branches of debug and depd are excluded as unreachable under Node.js.

## Confirmed Node.js patches

### F-001: `res.writeHead` replaced on live ServerResponse instances (on-headers wrapper)

- Category: instance or application override (core-backed instance; shared `ServerResponse.prototype` is NOT modified)
- Library site(s):
  - `$PACKAGE_ROOT/index.js:114` — `onHeaders(res, function setHeaders () { ... })` (activation, once per request)
  - `$PACKAGE_ROOT/node_modules/on-headers/index.js:71` — `res.writeHead = createWriteHead(res.writeHead, listener)` (the write)
  - `$PACKAGE_ROOT/node_modules/on-headers/index.js:30-52` — the replacement wrapper
  - Pinned source: https://github.com/expressjs/cookie-session/blob/75f53bb8f9118067955b344fb4ba550ed0e39318/index.js#L114 and https://github.com/jshttp/on-headers/blob/v1.1.0/index.js#L71
- Origin: transitive — cookie-session 2.1.1 -> on-headers@1.1.0 (direct dependency, `~1.1.0`)
- Core baseline: `$NODEJS_SOURCE/lib/internal/http/server.js:423` (`ServerResponse.prototype.writeHead = writeHead`, implementation at lines 424-484), re-exported via `$NODEJS_SOURCE/lib/http.js` and legacy `$NODEJS_SOURCE/lib/_http_server.js`, commit d44625a4b80c672215b469906ce583ce7eeeebaf. Core `writeHead(statusCode[, statusMessage][, headers])` validates the status code, sets `statusMessage`/`statusCode`, and — only when the progressive header API (`kOutHeaders`) is already in use — folds argument headers through `removeHeader`/`appendHeader`/`setHeader`; otherwise it passes the argument headers raw to the status-line/header serialization.
- Exact mutation: own data property `writeHead` is assigned on each live response object (`res.writeHead = ...`), shadowing the inherited `ServerResponse.prototype.writeHead`. The replacement is a closure named `writeHead` (on-headers deliberately keeps "core name and argument list", `index.js:33-34`) holding the previously resolved `writeHead` and the listener.
- Execution chain: `require('cookie-session')(opts)` -> middleware `_cookieSession(req, res, next)` (`index.js:60`) -> `onHeaders(res, setHeaders)` (`index.js:114`) -> `on-headers/index.js:62-72` -> instance write at line 71.
- Activation: unconditional in production for every request that passes through the middleware; no guards, no environment switches. Fires before `next()`, so downstream handlers always see the wrapped method.
- Scope and restoration: per-response instance only; the shared prototype is untouched (verified statically and by reproduction). Never restored — the own property persists for the life of that response object; each new request gets a fresh wrap. Nested `onHeaders` users re-wrap the already-wrapped own property.
- Resulting behavior: before — `writeHead(status, [msg], headers)` executes the core path, including the raw fast path where argument headers bypass the header map when `setHeader` was never used. After — the wrapper first applies arguments itself: sets `this.statusCode = statusCode` (`on-headers/index.js:129`), converts header arguments into `setHeader`/`appendHeader`/`removeHeader` calls on the response (`index.js:82-180`; 1D-array form uses `removeHeader`+`appendHeader` when `appendHeader` exists), then fires the cookie-session `setHeaders` listener exactly once, which may call `cookies.set(...)` and thereby add `Set-Cookie` headers at "headers about to be written" time; if the listener changed `this.statusCode`, the new code replaces the argument (`index.js:44-47`); finally the saved original runs with the trimmed arguments (status [+ reason] only). Practical effects: session cookies can be written after the application calls `writeHead`; headers passed as `writeHead` arguments always go through the progressive header API instead of core's raw pass-through (observable via `getHeader` ordering/merging and the 1D-raw-array path); a malformed odd-length 1D header array throws `TypeError` from the wrapper (`index.js:88-90`) before core validation.
- Evidence: static — sites above read in full against core baseline. Reproduction — `node repro-writehead-override.js "$PACKAGE_ROOT"` (Node v24.19.0) printed `writeHeadOwnBefore:false, writeHeadIsPrototypeBefore:true, writeHeadOwnAfter:true, writeHeadIsPrototypeAfter:false, wrapperName:"writeHead"`, `Set-Cookie` session cookies emitted, and `prototype.writeHead unchanged after request: true`.
- Upstream: on-headers 1.1.0 release (https://github.com/jshttp/on-headers/releases/tag/v1.1.0) fixes CVE-2025-7339 / GHSA-76c9-3jph-rj3q ("http response header manipulation", on-headers < 1.1.0, patched 1.1.0): the vulnerability lived in exactly this wrapper's re-implementation of core's array-header argument handling, corroborating that the wrapper replaces (and had diverged from) core behavior. cookie-session 2.1.1 exists specifically to pick up this fix (`$PACKAGE_ROOT/HISTORY.md`, 2.1.1 entry).

### F-002: transient reassignment of `Error.prepareStackTrace` and `Error.stackTraceLimit` (depd `getStack`)

- Category: shared core/global mutation (transient; save-and-restore within one synchronous sequence)
- Library site(s):
  - `$PACKAGE_ROOT/node_modules/depd/index.js:386-387` — `Error.prepareStackTrace = prepareObjectStackTrace; Error.stackTraceLimit = Math.max(10, limit)` (the writes)
  - `$PACKAGE_ROOT/node_modules/depd/index.js:395-396` — restoration of both saved values
  - `$PACKAGE_ROOT/node_modules/cookies/index.js:10` — `require('depd')('cookies')` (activation at load)
  - Pinned source: https://github.com/dougwilson/nodejs-depd/blob/v2.0.0/index.js#L381-L399 and https://github.com/pillarjs/cookies/blob/0.9.1/index.js#L10
- Origin: transitive — cookie-session 2.1.1 -> cookies@0.9.1 -> depd@2.0.0
- Core baseline: `Error.prepareStackTrace` is the documented V8 stack-trace customization hook on the global `Error`; Node.js core coordinates with it per realm (`$NODEJS_SOURCE/lib/internal/errors.js:91-126`, `prepareStackTraceCallback` handling, commit d44625a4b80c672215b469906ce583ce7eeeebaf). Default: unset (`undefined`), with Node applying its own default formatting and source-map handling; `Error.stackTraceLimit` defaults to 10.
- Exact mutation: global `Error` object, keys `prepareStackTrace` (replaced by depd's `prepareObjectStackTrace`, which returns the structured call-site array) and `stackTraceLimit` (raised to `Math.max(10, current)`); both restored to the saved originals at `index.js:395-396` before `getStack` returns.
- Execution chain: `require('cookie-session')` (`$PACKAGE_ROOT/index.js:17`) -> `require('cookies')` -> `cookies/index.js:10` `depd('cookies')` -> `depd/index.js:108` `getStack()` -> writes at 386-387, restore at 395-396. Also re-executed by `log()` (`depd/index.js:199`) whenever a deprecated cookies feature is used (array `keys` argument, `secureProxy` option, `maxage` property — none used on cookie-session's default path).
- Activation: unconditional at module load of cookie-session in production (no guards); again only on deprecated-usage logging.
- Scope and restoration: process-wide global while held; fully restored within the same synchronous sequence — JavaScript's single-threaded execution means no other code can run, capture a stack, or observe the modified values during the window (no await/IO between write and restore; the only code invoked is depd's own `prepareObjectStackTrace` via the `obj.stack` accessor).
- Resulting behavior: before/after any observable point — identical; during the window, `error.stack` preparation for any Error would return raw call-site arrays instead of formatted strings and bypass Node's source-map formatting, but nothing else executes in that window. Net practical effect: none observable; counted because it is a literal reachable write to a shared core-coordinated global.
- Evidence: static — sites read in full; no `try/finally`, but no throwing/yielding operation sits between write and restore. Reproduction — `node repro-globals-after-require.js "$PACKAGE_ROOT"` (Node v24.19.0) printed `prepareStackTraceUnchanged:true, stackTraceLimitUnchanged:true` after requiring cookie-session.
- Upstream: standard V8 stack-trace API usage (https://v8.dev/docs/stack-trace-api#customizing-stack-traces); depd has used this pattern since 1.x. No issue/PR alleging interference found or needed; the transience is evident in the code.

## Candidate ledger and unresolved questions

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | `$PACKAGE_ROOT/index.js:114` + `node_modules/on-headers/index.js:71`, `res.writeHead` on live ServerResponse | confirmed -> F-001 | Own-property assignment shadows `ServerResponse.prototype.writeHead` (`$NODEJS_SOURCE/lib/internal/http/server.js:423`); reproduction confirms |
| C-002 | `node_modules/depd/index.js:386-387`, global `Error.prepareStackTrace` / `Error.stackTraceLimit` | confirmed -> F-002 | Reachable write at cookie-session load via cookies -> depd; save-and-restore, synchronous window, restoration verified |
| C-003 | `$PACKAGE_ROOT/index.js:70-75`, `Object.defineProperty(req, 'session', {configurable:true, enumerable:true, get/set})` on live IncomingMessage | rejected as patch | `session` is not a core IncomingMessage key (no hit in `$NODEJS_SOURCE/lib/internal/http/incoming.js`); library-owned accessor added to a core-backed instance = request metadata, not an override of core behavior |
| C-004 | `$PACKAGE_ROOT/index.js:67`, `req.sessionOptions = Object.create(opts)` | rejected as patch | New library-owned own data property on the request instance; no core key shadowed |
| C-005 | `$PACKAGE_ROOT/index.js:148,202,215,228`, `defineProperty` on `Session`/`Session.prototype`/`SessionContext` | rejected as patch | Library-owned constructor/prototype, unrelated to core |
| C-006 | `node_modules/cookies/index.js:147-148`, `http.OutgoingMessage.prototype.setHeader` | rejected as patch | Read + `.call(res, 'Set-Cookie', headers)` of the core prototype method; no assignment. Deliberately bypasses framework instance wrappers when `res.set` exists (supporting context) |
| C-007 | `node_modules/cookies/index.js:116`, `res.getHeader('Set-Cookie')` + setHeader write of `Set-Cookie` | rejected as patch | Documented OutgoingMessage header API usage (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:813,914`); mutates header state via the supported contract, not core code |
| C-008 | `node_modules/cookies/index.js:194-232`, `Cookie.prototype.*` writes and `deprecate.property(Cookie.prototype, 'maxage', ...)` | rejected as patch | Library-owned `Cookie.prototype`; depd `wrapproperty` redefines only that owner object (`depd/index.js:485`) |
| C-009 | `node_modules/cookies/index.js:278-286`, `Cookies.connect/express` sets `req.cookies = res.cookies` | rejected as patch | Not activated by cookie-session (it only uses the constructor, `.get`, `.set`); would be instance metadata anyway |
| C-010 | `node_modules/on-headers/index.js:19`, `http.ServerResponse.prototype.appendHeader` | rejected as patch | Read-only feature detection (`typeof ... === 'function'`) at module load; no write |
| C-011 | `node_modules/safe-buffer/index.js:12-18`, core `buffer` module exports | rejected as patch | On Node with `Buffer.from/alloc/allocUnsafe/allocUnsafeSlow` (`$NODEJS_SOURCE/lib/buffer.js:351,454,473,496`) it executes `module.exports = buffer` — a pure re-export, zero mutation (reproduction: `bufferModuleIsCoreReExport:true`, `BufferFromUnchanged:true`). Legacy branch copies FROM `buffer` onto its own `exports`; `SafeBuffer.prototype = Object.create(Buffer.prototype)` creates a new object and `copyProps(Buffer, SafeBuffer)` writes onto SafeBuffer, never onto core |
| C-012 | `node_modules/debug/src/common.js:244` -> `node_modules/debug/src/node.js:118-126`, `process.env.DEBUG` write/delete at require time | rejected as patch | Documented mutable `process.env` API used for its intended purpose; at load it rewrites the identical value or deletes an absent key (reproduction: `debugEnvUnchanged:true`). Data write, not a core behavior override |
| C-013 | `node_modules/debug/src/node.js:43-65,146-153,161-176`, `exports.inspectOpts`, `formatters.o/O`, `init` | rejected as patch | Reads `process.env`; writes only to debug's own exports and debug-instance objects |
| C-014 | `node_modules/depd/index.js:23`, `process.cwd()` at require time | rejected as patch | Read-only; no require-time global write exists in depd 2.0.0 |
| C-015 | `node_modules/depd/index.js:413-433`, `wrapfunction` via `new Function` | rejected as patch | Returns a new wrapper for a caller-supplied function; never applied to a core function in this scope; not invoked on cookie-session's path |
| C-016 | `node_modules/depd/index.js:49-65,485`, `convertDataDescriptorToAccessor`/`wrapproperty` `Object.defineProperty(obj, prop)` | rejected as patch | Redefines only the caller-supplied owner object; in this scope only `Cookie.prototype` (C-008) |
| C-017 | `node_modules/depd/index.js:251`, `process.emit('deprecation', err)` | rejected as patch | Emits a custom event on the core `process` emitter via the documented EventEmitter API; only when a deprecated feature is used and listeners exist; no replacement of anything |
| C-018 | `node_modules/depd/index.js:492-538`, `defineProperty` on new Error instance | rejected as patch | Customizes depd's own freshly created Error instance; not shared state |
| C-019 | `node_modules/keygrip/index.js`, `node_modules/tsscmp/lib/index.js`, `node_modules/ms/index.js` | rejected as patch | crypto API calls (`createHmac`, `pseudoRandomBytes`, feature-detected `timingSafeEqual`) and pure computation only; writes limited to own instances/exports |
| C-020 | Module-interception pattern set (`require.cache`, `require.extensions`, `Module._*`, `syncBuiltinESMExports`, `registerHooks`) and internals set (`process.binding`, `internalBinding`, `_http_`, `internal/`) over the full scope | rejected (negative) | Zero hits in all runtime files |

No unresolved candidates.

## Supporting context

- `req.session` (enumerable, configurable accessor; `$PACKAGE_ROOT/index.js:70-75`) and `req.sessionOptions` (`index.js:67`) are added to the live core `IncomingMessage` on every request. Because they are enumerable own keys, they show up in `Object.keys(req)`/spreads — visible metadata, but no core key is shadowed (C-003/C-004).
- cookies@0.9.1 deliberately calls `http.OutgoingMessage.prototype.setHeader.call(res, ...)` when `res.set` exists (`node_modules/cookies/index.js:147-148`), bypassing any framework/instance-level `setHeader` override (such as ones installed by other middleware) while writing `Set-Cookie`. This is a read-and-call of the core prototype — an intentional sidestep of instance overrides, not a mutation (C-006).
- on-headers' wrapper intentionally mimics the core method (`function writeHead`, preserved name and leading arguments, `node_modules/on-headers/index.js:33-34`), making the override hard to detect via `res.writeHead.name`.
- debug@3.2.7 writes `process.env.DEBUG` through the documented env API at load and on `enable()`/`disable()` (no-op in this activation); depd emits a custom `deprecation` event on `process` when listeners exist (C-012, C-017).
- safe-buffer@5.2.1 is a pure re-export of the core `buffer` module on every Node version this package supports in practice (C-011).
- Browser-only variants (`node_modules/debug/src/browser.js`, `node_modules/depd/lib/browser/index.js`) are not loaded under Node.js (`debug/src/index.js:7-11` selects `node.js`; depd's browser file is reached only via the package `browser` field) and contain no Node-core writes.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT/index.js` + all 8 dependency runtime files | full reads; `rg -n` candidate pattern sets P1-P6 from the skill (see searches.md) | All candidate sites enumerated; P5 (module interception) and P6 (bindings/internals) returned zero hits |
| `$PACKAGE_ROOT/package.json`, dep package.json files | entrypoint/`browser`/`exports` extraction; install-hook check | No preinstall/install/postinstall hooks anywhere in scope; entrypoints resolved as listed in Scope |
| `$NODEJS_SOURCE/lib/http.js`, `lib/internal/http/server.js`, `lib/internal/http/outgoing.js`, `lib/internal/http/incoming.js` | targeted `rg -n "writeHead"` / `rg -n "OutgoingMessage\.prototype\.(setHeader|appendHeader|removeHeader|getHeader)"` / `rg -n "session"` + reads of server.js:400-510, outgoing.js:813-835 | `ServerResponse.prototype.writeHead` at server.js:423 (impl 424-484) = F-001 baseline; setHeader/appendHeader/getHeader/removeHeader at outgoing.js:813/877/914/973; no `session`/`sessionOptions` key in incoming.js |
| `$NODEJS_SOURCE/lib/buffer.js` | `rg -n "^Buffer\.(from|alloc|allocUnsafe|allocUnsafeSlow)\s*="` | Lines 351/454/473/496 — safe-buffer takes its re-export branch |
| `$NODEJS_SOURCE/lib/internal/errors.js` | `rg -n "prepareStackTrace"` | Lines 91-126 document Node's per-realm coordination with `Error.prepareStackTrace` = F-002 baseline |
| on-headers upstream | `gh api repos/expressjs/on-headers/releases` (v1.1.0), `gh api /advisories/GHSA-76c9-3jph-rj3q` | v1.1.0 fixes CVE-2025-7339 (severity low, "http response header manipulation", < 1.1.0, patched 1.1.0) in the writeHead wrapper's array handling; installed version is the patched one |
| cookie-session changelog | `$PACKAGE_ROOT/HISTORY.md` (2.1.1 entry) | 2.1.1 = dependency bump to on-headers ~1.1.0 for CVE-2025-7339 |
| Reproduction 1 | `node repro-writehead-override.js "$PACKAGE_ROOT"` (Node v24.19.0) | Confirms instance-only writeHead override, enumerable+configurable `req.session` accessor, `req.sessionOptions` own property, Set-Cookie emission, prototype untouched |
| Reproduction 2 | `node repro-globals-after-require.js "$PACKAGE_ROOT"` (Node v24.19.0) | Confirms `Error.prepareStackTrace`/`stackTraceLimit` restored after load, safe-buffer === core buffer module, HTTP prototypes and `process.env.DEBUG` unchanged |

Runtime file hashes (SHA-256, relative to `$PACKAGE_ROOT`):

```
9f2b1fa8d2773e938396bc562e07f3f02611aa8554d42d32f708bad392a23108  index.js
76682a9fc3bbe62975176e2541f39a8168877d828d5cad8b56461fc36ac2b856  node_modules/on-headers/index.js
aa8241d213ab306f2d7c65175e175658155ba19c596bb2174cdb4ce2944a180f  node_modules/cookies/index.js
4d587a5662e20a7bb9bfe6555afe5987e1b80303a819b447394f37a93297ee91  node_modules/depd/index.js
184d5c4a83512e3f49d4d5b52f7073f601f933bad11f1fbb3ad364ca5e6478e1  node_modules/safe-buffer/index.js
49c2426f5032902827c51781dbbedfa5d77c0934d785e3125efde53b5238eaaa  node_modules/debug/src/index.js
6c360c37e9dc1d14f41e35efdc66b707a56f069e24414307c76e74c7bd505702  node_modules/debug/src/node.js
631983c237a5cf407a98526330f4cdc92b88fc557c34f86a9b8ee63285b346ba  node_modules/debug/src/common.js
4a38fe59a5424e779823bd749d4dd790e0d58faca993886a43bb1f68161fc382  node_modules/keygrip/index.js
8a48bb471b338cccf04fd9538ff405534c24a3e57ae508f29b5a6ed0bb5536f7  node_modules/tsscmp/lib/index.js
e5f0b6a946a9b2b356a28557728410717df54ea2f599edb619f9839df6b7b0e9  node_modules/ms/index.js
```

## Coverage and limitations

- Entry points: single runtime entrypoint `$PACKAGE_ROOT/index.js` (package `files` ships only index.js + docs); no install scripts, no conditional exports, no native addons anywhere in scope.
- Dependencies: all eight resolved runtime packages inspected at their installed versions; every Node-reachable runtime file read in full. `supports-color` (optional require inside debug) is not installed; its absence is swallowed by try/catch (`debug/src/node.js:26-34`) — its code was therefore not audited (it cannot load in this tree).
- Node.js baseline: main-branch checkout d44625a4b80c672215b469906ce583ce7eeeebaf, where the HTTP implementation lives in `lib/internal/http/*` with `lib/_http_*.js` as legacy re-export shims; on older release lines the same `writeHead`/`setHeader` contracts live in `lib/_http_server.js`/`lib/_http_outgoing.js`. The main-branch baseline is ahead of any released Node; contracts used here (prototype-held `writeHead`, progressive header API, documented env/EventEmitter APIs, V8 stack-trace hook) are stable across supported release lines, so the baseline choice does not affect the verdict.
- Branches excluded: browser-only files of debug and depd (unreachable under Node); legacy pre-`Buffer.from` branch of safe-buffer (unreachable on any Node version near the audited baseline — would still only write to its own exports); the `appendHeader`-absent fallback in on-headers (`set1dArrayWithSet`) applies on Node < 18.3 and changes only which core header API the wrapper calls, not the override itself.
- Reproductions run on Node v24.19.0; tested the default middleware path (new session, save). Untested branches (session delete, deprecated cookies options) were verified statically; a tested branch cannot prove universal absence, but all writes in those branches were traced statically to the same ledger entries.
- What would change the verdict: nothing identified; both findings are unconditional on the production path. If on-headers were replaced by a ServerResponse-event-based mechanism upstream, F-001 would disappear.

## Changes since the previous audit

First audit (pass-b, independent double-blind pass; no prior report read or updated per protocol).
