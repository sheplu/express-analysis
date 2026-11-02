# Search log — cookie-session pass A

All searches run from `$PACKAGE_ROOT` unless noted. Runtime scope used for the
candidate sweeps (`SCOPE`):

```
index.js
node_modules/cookies/index.js
node_modules/debug/src
node_modules/depd/index.js
node_modules/keygrip/index.js
node_modules/ms/index.js
node_modules/on-headers/index.js
node_modules/safe-buffer/index.js
node_modules/tsscmp/lib/index.js
```

Tests, docs, `scripts/version-history.js` (release-time dev script, not shipped:
`package.json` `files` ships only `index.js`), and nested `node_modules` excluded.

## Scope establishment

| # | Command | Result |
| --- | --- | --- |
| 0a | `ls -la && cat package.json && git log -1` | package v2.1.1 at commit 75f53bb8f9118067955b344fb4ba550ed0e39318; single runtime file `index.js`; deps: cookies 0.9.1, debug 3.2.7, on-headers ~1.1.0, safe-buffer 5.2.1 |
| 0b | `node -e 'require("./<dep>/package.json")'` for each installed dep | cookies@0.9.1 (deps depd ~2.0.0, keygrip ~1.1.0), debug@3.2.7 (dep ms ^2.1.1), depd@2.0.0, keygrip@1.1.0 (dep tsscmp 1.0.6), ms@2.1.3, on-headers@1.1.0, safe-buffer@5.2.1, tsscmp@1.0.6 |
| 0c | `find <deps> -name '*.js' -not -path '*/node_modules/*'` | Complete runtime file inventory: each dep is 1 file except debug (src/index.js -> node.js/browser.js + common.js; root node.js is a 1-line re-export) and depd (index.js + lib/browser/index.js, browser-only via `"browser"` field). tsscmp test files out of scope |
| 0d | `rg -n "browser" node_modules/depd/package.json` | `"browser": "lib/browser/index.js"` — Node resolves `depd/index.js`; browser shim not active |

## Candidate sweeps (`rg -n --no-ignore` over SCOPE)

| # | Pattern | Result |
| --- | --- | --- |
| S1 | `require\s*\(\|\bfrom\s*['"]\|\bimport\s*\(\|node:` | Core imports: on-headers -> `http`; cookies -> `http`; keygrip/tsscmp -> `crypto`; depd -> `path`; debug/src/node.js -> `tty`, `util`, optional `supports-color` (not installed, try/catch swallowed); safe-buffer -> `buffer`. Target index.js imports only its 4 deps. No `node:`-prefixed or dynamic imports |
| S2 | `\bglobalThis\b\|\bglobal\b\|\bextends\b\|\binherits\s*\(` | Negative (only comments in debug/src/browser.js, a browser-only file) |
| S3 | `\.prototype\b\|__proto__\|setPrototypeOf\|definePropert(y\|ies)\|Reflect\.(set\|defineProperty\|setPrototypeOf)\|Object\.assign` | Hits: index.js:70 (defineProperty on `req`), index.js:148/202/215/228 (library-owned Session objects); cookies Cookie.prototype (library-owned) incl. :226/:232 maxage wrap; on-headers:19 (read-only feature detect of `http.ServerResponse.prototype.appendHeader`); safe-buffer:24 (`SafeBuffer.prototype = Object.create(Buffer.prototype)` — new object, no core write); depd defineProperty sites :62/:485 (caller-supplied obj) and :496-:521 (own DeprecationError); cookies:147 reads `http.OutgoingMessage.prototype.setHeader` (no write). No write whose target is a core prototype |
| S4 | `monkey.?patch\|\bpatch\b\|\bwrap\b\|\bshim\b\|\bpolyfill\b\|\boverrid` (case-insensitive) | Comments only: index.js:66 "for overriding" (req.sessionOptions), depd wrapper comments. No code hits |
| S5 | `require\.cache\|require\.extensions\|Module\._(load\|resolveFilename\|extensions\|compile)\|syncBuiltinESMExports\|registerHooks` | Negative — no module-loading interception |
| S6 | `process\.(binding\|_linkedBinding)\|internalBinding\|['"]_http_\|['"]internal/` | Negative — no internal bindings or core-internal module access |
| S7 | `(req\|res\|request\|response\|this\.request\|this\.response)\.[A-Za-z_$]+\s*=[^=]\|process\.[A-Za-z_.$]+\s*=[^=]\|Error\.[A-Za-z]+\s*=[^=]\|delete\s+process` | Key hits: index.js:67 (`req.sessionOptions =`), cookies:280 (`req.cookies = res.cookies =`, in Cookies.connect/express — NOT activated by cookie-session), on-headers:71 (`res.writeHead =` — C-003/F-001), depd:386-387/395-396 (`Error.prepareStackTrace`/`Error.stackTraceLimit` set+restore — C-008/F-002), debug/src/node.js:120/124 (`process.env.DEBUG` write/delete — C-010) |
| S8 | `rg -n "process\|global\|prototype\|define" node_modules/ms/index.js` | 1 irrelevant hit (`return undefined`) — ms is pure string/number conversion |

## Manual full reads

index.js (290 lines), cookies/index.js (291), on-headers/index.js (181),
depd/index.js (538), debug/src/{index,node,common}.js, keygrip/index.js (51),
safe-buffer/index.js (65), tsscmp/lib/index.js (38), debug/node.js (1-line
re-export), head of depd/lib/browser/index.js (no-op shim).

## Node.js baseline (targeted; $NODEJS_SOURCE at d44625a4b80c672215b469906ce583ce7eeeebaf)

| # | Command | Result |
| --- | --- | --- |
| N1 | `rg -n "writeHead" lib/_http_server.js lib/internal/http/server.js` | Implementation moved to lib/internal/http/server.js at this ref: `ServerResponse.prototype.writeHead = writeHead` at :423, function body :424-:505; `_implicitHeader` calls `this.writeHead` at :419-:421. lib/_http_server.js re-exports from `internal/http/server` (:34-:37) |
| N2 | `rg -n "OutgoingMessage.prototype.(set\|append\|remove\|get)Header" lib/internal/http/outgoing.js` | setHeader :813, appendHeader :877, getHeader :914, removeHeader :973 |
| N3 | `rg -n "session\|sessionOptions" lib/internal/http/incoming.js lib/_http_incoming.js` | Negative — `session`/`sessionOptions` are not core IncomingMessage members |
| N4 | `sed -n '110,125p' lib/internal/http/incoming.js` | `connection` is a core accessor alias for `socket` on IncomingMessage.prototype (:115-:123); cookies only reads it |
| N5 | `rg -n "prepareStackTrace" lib/internal/errors.js` | `prepareStackTraceCallback` (:136) consults user-set `globalThis.Error.prepareStackTrace` (:149-:150, :155-:156); default implementation used when unset (:165) |

## Upstream corroboration

| # | Query | Result |
| --- | --- | --- |
| U1 | `head node_modules/on-headers/HISTORY.md` | 1.1.0 (2025-07-17) fixes CVE-2025-7339 / GHSA-76c9-3jph-rj3q; 1.0.2 "Fix `res.writeHead` patch missing return value" (upstream itself calls the mechanism a patch) |
| U2 | `rg -n "on-headers\|cookies" HISTORY.md` | cookie-session 2.1.1 bumps on-headers ~1.1.0 citing the CVE; cookie-session 1.1.0 (2014-11-09): "Use `on-headers` instead of `writeHead` patching" — the writeHead instance patch predates on-headers and was delegated to it |
| U3 | `gh api /repos/expressjs/on-headers/security-advisories/GHSA-76c9-3jph-rj3q` | Exists; summary "on-headers vulnerable to http response header manipulation", severity low, published 2025-07-17, patched 1.1.0 |

## Reproductions (Node v24.19.0)

| # | Command | Result |
| --- | --- | --- |
| R1 | `node repro-writehead-override.js "$PACKAGE_ROOT"` | res gains own `writeHead` differing from prototype; `ServerResponse.prototype.writeHead` unchanged; `req` gains own `session` accessor (get/set) and own `sessionOptions` data property; core `IncomingMessage.prototype` has no `session` |
| R2 | `node repro-depd-preparestacktrace.js "$PACKAGE_ROOT"` | Loading cookie-session produces writes to `Error.prepareStackTrace`: `['function','undefined','function','undefined']` (two set/restore cycles at module load); restored to `undefined`; `Error.stackTraceLimit` value unchanged after load. (First script revision intercepted `stackTraceLimit` with an accessor, which disables V8 stack capture — rewritten to compare values instead) |
