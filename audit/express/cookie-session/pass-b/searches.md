# Search log: cookie-session 2.1.1 patch audit (pass-b)

All library commands run from `$PACKAGE_ROOT`; Node.js commands from `$NODEJS_SOURCE`.
Scope globs for dependency scans excluded nested node_modules, tests, markdown, and `.d.ts`:
`-g '!**/node_modules/*/node_modules/**' -g '!**/test/**' -g '!**/*.md' -g '!**/*.d.ts'`
Scanned paths: `index.js node_modules/cookies node_modules/debug node_modules/depd node_modules/keygrip node_modules/ms node_modules/on-headers node_modules/safe-buffer node_modules/tsscmp`.
(`--no-ignore` used since the installed tree sits under node_modules.)

## Scope establishment

| # | Command | Result |
| --- | --- | --- |
| S-01 | `ls -la` + `cat package.json` + `git log -1 --format='%H %s'` | Confirmed v2.1.1 @ 75f53bb8f9118067955b344fb4ba550ed0e39318; runtime deps cookies 0.9.1, debug 3.2.7, on-headers ~1.1.0, safe-buffer 5.2.1; `files` ships only index.js (+docs); scripts = lint/test/version only (no install hooks) |
| S-02 | `ls node_modules/` + node one-liners over each dep's package.json (`main`, `browser`, `exports`) | 8 packages installed; entrypoints: cookies/index.js, debug/src/index.js (browser: src/browser.js), depd/index.js (browser: lib/browser/index.js), keygrip/index.js, ms/index.js, on-headers/index.js, safe-buffer/index.js, tsscmp/lib/index.js; no `exports` maps |
| S-03 | `find node_modules/<dep> -type f \( -name '*.js' -o -name '*.json' -o -name '*.node' \)` per dep | Full runtime file inventory (13 JS files total); no native `.node` addons; tsscmp ships test/ (out of scope) |
| S-04 | node one-liner checking `preinstall/install/postinstall` in every dep package.json | All: none |
| S-05 | `find node_modules -name ".*" -maxdepth 2` | Only `tsscmp/.travis.yml` (inert CI config) |

## Candidate pattern set (skill P1-P6) over index.js + all 8 deps

| # | Pattern | Result |
| --- | --- | --- |
| P1 | `require\s*\(|\bfrom\s*['"]|\bimport\s*\(|\bnode:` | Core imports found: `http` (on-headers:16, cookies:12), `buffer` (safe-buffer:3), `crypto` (keygrip:10, tsscmp:9), `tty`+`util` (debug/src/node.js:6,8), `path` (depd:11). Inter-package: index.js:15-18 (safe-buffer, debug, cookies, on-headers); cookies:10-11 (depd, keygrip); keygrip:9 (tsscmp); debug/src/common.js:14 (ms); debug/src/node.js:29 (supports-color, optional, not installed); debug/src/index.js:8,10 runtime browser/node switch. No `node:` specifiers, no dynamic `import()` |
| P2 | `\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(` | Hits: safe-buffer Buffer handling (index.js:4,12-27,33-64 -> C-011); debug process.env reads/writes (node.js:43,51,71,108,118-126,136 -> C-012/C-013) and renderer detection (index.js:7); depd `process.cwd()` (23), noDeprecation/traceDeprecation/env reads (154-179), `process.emit` (251), stderr (256-260) -> C-002/C-014/C-017; index.js Buffer.from calls (254,268). No `globalThis`/`global` writes, no `extends`, no `inherits(` anywhere |
| P3 | `\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign` | Hits: index.js:70 (req 'session' accessor -> C-003), 148/202/215/228 (library Session -> C-005); safe-buffer:24 (`SafeBuffer.prototype = Object.create(Buffer.prototype)` -> C-011c); on-headers:19 (prototype READ -> C-010); cookies:83,113 (own Cookies.prototype methods), 147 (core prototype READ -> C-006), 194-232 (Cookie.prototype + maxage defineProperty/deprecate.property -> C-008); depd:62,485 (defineProperty on caller-supplied obj -> C-016), 496-521 (own Error instance -> C-018); debug/src/browser.js:3 (babel `_typeof` helper, Symbol.prototype comparison only — unreachable in Node anyway). No `__proto__` writes, no `setPrototypeOf`, no `Reflect.*`, no `Object.assign` in runtime scope |
| P4 | `monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b` (`-i`) | Only depd doc comments "Wrap property..." (depd/index.js:436,469,477; depd/lib/browser/index.js:57) -> traced to C-016 (library-owned targets). No other hits |
| P5 | `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks` | 0 hits (negative) |
| P6 | `process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/` | 0 hits (negative) |

## Full-file reads (runtime scope)

| # | File | Outcome |
| --- | --- | --- |
| R-01 | `$PACKAGE_ROOT/index.js` (290 lines) | Candidates C-001a, C-003, C-004, C-005; no other writes to non-library objects |
| R-02 | `node_modules/on-headers/index.js` (180 lines) | C-001b (res.writeHead instance assignment, line 71), C-010 feature detection; wrapper internals mapped (lines 30-52, 82-180) |
| R-03 | `node_modules/cookies/index.js` (290 lines) | C-006 (prototype setHeader read/call, 147-148), C-007 (getHeader/setHeader Set-Cookie), C-008 (Cookie.prototype), C-009 (connect/express not activated), C-009c (depd activation at line 10) |
| R-04 | `node_modules/depd/index.js` (538 lines) | C-002 (getStack Error.prepareStackTrace/stackTraceLimit write+restore, 381-399), C-014-C-018; confirmed NO require-time global writes in depd 2.0.0 (module top level: only `process.cwd()` read at line 23) |
| R-05 | `node_modules/safe-buffer/index.js` (65 lines) | C-011; modern branch = pure re-export of core buffer module |
| R-06 | `node_modules/debug/src/index.js`, `src/node.js`, `src/common.js` | C-012 (require-time `enable(load())` -> `save()` -> process.env.DEBUG write/delete), C-013 (own-exports writes only); browser.js excluded as unreachable (process.type check) |
| R-07 | `node_modules/keygrip/index.js`, `node_modules/tsscmp/lib/index.js`, `node_modules/ms/index.js` | C-019; crypto calls / pure computation only. ms assignment sweep (`rg -n "=" ... | filters`): only module.exports/local vars |
| R-08 | `node_modules/depd/lib/browser/index.js` | No-op deprecate; unreachable in Node (browser field); no core writes |
| R-09 | `$PACKAGE_ROOT/HISTORY.md` head | 2.1.1 entry = on-headers ~1.1.0 bump for CVE-2025-7339 |

## Node.js baseline verification (targeted; no tree-wide scans)

| # | Command (from `$NODEJS_SOURCE`) | Result |
| --- | --- | --- |
| N-01 | `git log -1 --format='%H'` | d44625a4b80c672215b469906ce583ce7eeeebaf |
| N-02 | `rg -n "writeHead|ServerResponse.prototype" lib/_http_server.js` | 0 hits — implementation moved on main; `_http_server.js` is a re-export shim (verified by reading its header/requires) |
| N-03 | `rg -n "require\(" lib/http.js` + `ls lib/_http* lib/internal/http` | http.js re-exports from `internal/http/{server,outgoing,incoming,client,agent,common}` |
| N-04 | `rg -n "writeHead" lib/internal/http/server.js` + read lines 400-510 | `ServerResponse.prototype.writeHead = writeHead` at line 423; implementation 424-484 (status validation, statusMessage, kOutHeaders slow path with removeHeader/appendHeader/setHeader, raw-headers fast path `headers = obj`) — F-001 baseline |
| N-05 | `rg -n "OutgoingMessage\.prototype\.(setHeader|appendHeader|removeHeader|getHeader)\s*=" lib/internal/http/outgoing.js` + read 813-835 | setHeader:813, appendHeader:877, getHeader:914, removeHeader:973; setHeader contract (ERR_HTTP_HEADERS_SENT guard, kOutHeaders map) — C-006/C-007 baseline |
| N-06 | `rg -n "session|sessionOptions" lib/internal/http/incoming.js` | 0 hits — `req.session`/`req.sessionOptions` are not core keys (C-003/C-004 rejection basis) |
| N-07 | `rg -n "^Buffer\.(from|alloc|allocUnsafe|allocUnsafeSlow)\s*=" lib/buffer.js` | Lines 351/454/473/496 — safe-buffer re-export branch active (C-011) |
| N-08 | `rg -n "prepareStackTrace" lib/internal/errors.js` | Lines 91-126: Node documents/coordinates per-realm `Error.prepareStackTrace` handling — F-002 baseline |

## Upstream corroboration (read-only)

| # | Query | Result |
| --- | --- | --- |
| U-01 | `gh api repos/expressjs/on-headers/releases` filtered to v1.1.0 | Release notes: "Fix CVE-2025-7339 (GHSA-76c9-3jph-rj3q)"; changelog v1.0.2...v1.1.0 |
| U-02 | `gh api /advisories/GHSA-76c9-3jph-rj3q` | Severity low; "on-headers is vulnerable to http response header manipulation"; vulnerable < 1.1.0; first patched 1.1.0 (installed version is patched). Corroborates that the writeHead wrapper re-implements core argument handling (and had diverged) |

## Reproductions (Node v24.19.0; scripts beside report, package root passed as argv)

| # | Command | Result |
| --- | --- | --- |
| X-01 | `node repro-writehead-override.js "$PACKAGE_ROOT"` | `{"writeHeadOwnBefore":false,"writeHeadIsPrototypeBefore":true,"writeHeadOwnAfter":true,"writeHeadIsPrototypeAfter":false,"wrapperName":"writeHead","reqSessionDesc":{"enumerable":true,"configurable":true,"hasGetSet":true},"reqSessionOptionsOwn":true}`; Set-Cookie: `session=...; path=/; httponly` + `session.sig=...`; `prototype.writeHead unchanged after request: true` |
| X-02 | `node repro-globals-after-require.js "$PACKAGE_ROOT"` | All true: prepareStackTraceUnchanged, stackTraceLimitUnchanged, bufferModuleIsCoreReExport, BufferFromUnchanged, protoWriteHeadUnchanged, protoSetHeaderUnchanged, debugEnvUnchanged |

## Provenance hashes

`shasum -a 256` over the 11 runtime files — values recorded in report.md (Sources and verification).
