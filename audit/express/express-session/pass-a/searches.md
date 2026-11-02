# Search log: express-session pass A

All commands run from `$PACKAGE_ROOT` unless noted; Node.js commands from `$NODEJS_SOURCE`.
Patterns follow the audit skill's candidate-search table. Negative results recorded explicitly.

## Scope establishment

| # | Command | Result |
| --- | --- | --- |
| 1 | `ls $PACKAGE_ROOT` ; `cat package.json` | Runtime surface: `index.js` + `session/` (package.json `files`); deps cookie, cookie-signature, debug, depd, on-headers, parseurl, safe-buffer, uid-safe; scripts = lint/test/version only (no preinstall/postinstall) |
| 2 | `git log -1 --format='%H %ci'` | 8947e169ae838b22cc1af198e50e370e6fc09f96 (2026-10-08) |
| 3 | `ls node_modules session/` | Installed deps incl. transitive ms, random-bytes; session/ has cookie.js, memory.js, session.js, store.js |
| 4 | `node -p` over each dep package.json | cookie@0.7.2, cookie-signature@1.0.7, debug@2.6.9 (main src/index.js), depd@2.0.0, ms@2.0.0, on-headers@1.1.0, parseurl@1.3.3, random-bytes@1.0.0, safe-buffer@5.2.1, uid-safe@2.1.5 |
| 5 | Full reads: `index.js` (741 lines), `session/cookie.js`, `session/memory.js`, `session/session.js`, `session/store.js` | Complete runtime source reviewed line by line |

## Candidate sweeps over package runtime files (`index.js`, `session/`)

| # | Pattern (`rg -n`) | Result |
| --- | --- | --- |
| 6 | `require\s*\(\|\bfrom\s*['"]\|\bimport\s*\(\|\bnode:` | Only the 9 dep requires + crypto + 4 local modules (index.js:16-29; session/*.js headers). No dynamic/computed requires, no `node:` specifiers |
| 7 | `\bBuffer\b\|\bprocess\b\|\bglobalThis\b\|\bglobal\b\|\bextends\b\|\binherits\s*\(` | safe-buffer Buffer use (index.js:16,307-308); `process.env.NODE_ENV` read (:33); `process.nextTick` fallback (:67, memory.js:27); `util.inherits` (store.js:40, memory.js:49). No global writes |
| 8 | `\.prototype\b\|__proto__\|setPrototypeOf\|definepropert(y\|ies)\|Reflect\.(set\|defineProperty\|setPrototypeOf)\|Object\.assign` (case-insensitive defineProperty) | Hits: index.js:428,435 (sess reload/save); library prototypes in session/*.js; session.js:25-26,137. All library-owned -> C-008..C-012. No `__proto__`/`setPrototypeOf`/`Object.assign`/`Reflect` anywhere |
| 9 | `monkey.?patch\|\bpatch\b\|\bwrap\b\|\bshim\b\|\bpolyfill\b\|\boverride\b` | Single hit: index.js:412 comment "wrap session methods" (library Session wrapping) |
| 10 | `require\.cache\|require\.extensions\|Module\._(load\|resolveFilename\|extensions\|compile)\|syncBuiltinESMExports\|registerHooks` | NEGATIVE — no module-loading interception |
| 11 | `process\.(binding\|_linkedBinding)\|internalBinding\|['"]_http_\|['"]internal/` | NEGATIVE in package files (debug dep hit found separately, see #15) |
| 12 | `res\.[A-Za-z_]+\s*=\|req\.[A-Za-z_]+\s*=` | index.js:159,160,229,232 (req.session*, C-006); index.js:269 (`res.end =`, C-001); store.js:100 (req.session, C-006). No other res/req writes |
| 13 | `rg -n "deprecate" index.js session/` | depd instantiation at index.js:20, session/cookie.js:15; log-style `deprecate(msg)` calls only (index.js:122,127,147,614,627; cookie.js:89). `rg -n "deprecate\.(function\|property)"` -> NEGATIVE (C-019) |

## Dependency entrypoint inspection

| # | Command | Result |
| --- | --- | --- |
| 14 | `cat node_modules/on-headers/index.js` (full, 1.1.0) | `res.writeHead = createWriteHead(res.writeHead, listener)` at :71 (C-002/F-002); require-time read-only feature detection at :19 (C-018); delegation `prevWriteHead.apply` :50 |
| 15 | `cat node_modules/depd/index.js` (full, 2.0.0) | `getStack()` writes `Error.prepareStackTrace`/`stackTraceLimit` at :386-387, restores :395-396 (C-003/F-003); dormant `wrapfunction`/`wrapproperty` (C-019); no require-time core writes besides getStack via `depd()` |
| 16 | `rg -n "require|prototype|definePropert|global|process|Object\.assign|__proto__" node_modules/cookie/index.js` | Only read-only `Object.prototype.toString`/`hasOwnProperty` captures at :23-24 (C-020) |
| 17 | `cat node_modules/cookie-signature/index.js` | Pure crypto HMAC/hash (C-022). NEGATIVE for writes |
| 18 | `rg -n "require|prototype|definePropert|global|process" node_modules/ms/index.js` | NEGATIVE — zero hits (C-023) |
| 19 | `rg -n "require\s*\(|\.prototype\b|__proto__|setPrototypeOf|definePropert|Object\.assign|process\.|global|\bwrap|patch|shim" node_modules/debug/src/{index,node,debug}.js` + reads of node.js:120-260, debug.js enable/save | Require-time `exports.enable(load())` -> `save()` writes/deletes `process.env.DEBUG` (node.js:139-147,248) (C-015); `process.binding('tty_wrap')` at node.js:169 only when DEBUG_FD set to non-1/2 fd (C-016). No prototype/global function writes |
| 20 | `head -70 node_modules/safe-buffer/index.js` | Modern branch `module.exports = buffer` (re-export, no mutation); legacy copies into own exports (C-017) |
| 21 | `cat node_modules/uid-safe/index.js` ; `sed -n '1,60p' node_modules/random-bytes/index.js` | crypto.randomBytes use, `global.Promise` reads only (C-021) |
| 22 | `rg -n "=|definePropert" node_modules/parseurl/index.js` (filtered) | `req._parsedUrl = parsed` :54, `req._parsedOriginalUrl = parsed` :84 (C-014); url.parse/Url read-only :15-17 |

## Node.js baseline verification (targeted, at d44625a4b80c672215b469906ce583ce7eeeebaf)

| # | Command | Result |
| --- | --- | --- |
| 23 | `rg -n "ServerResponse|IncomingMessage" lib/http.js` ; `sed -n '25,60p' lib/http.js` ; `ls lib/internal/http/` | HTTP classes live in lib/internal/http/{server,incoming,outgoing}.js at this commit; legacy lib/_http_*.js are re-export shims |
| 24 | `rg -n "OutgoingMessage.prototype.(end|write|appendHeader)\s*=" lib/internal/http/outgoing.js` | `appendHeader` :877, `_implicitHeader` :1003, `write` :1027, `end` :1289 (baselines F-001/F-002) |
| 25 | `sed -n '1289,1310p' lib/internal/http/outgoing.js` | Core `end(chunk, encoding, callback)` contract: callback support, ERR_STREAM_WRITE_AFTER_END, returns `this` |
| 26 | `rg -n "ServerResponse.prototype.(writeHead|_implicitHeader|appendHeader)\s*=|function writeHead" lib/internal/http/server.js` ; `sed -n '419,470p'` | `_implicitHeader` :419, `writeHead` :423-424 + body (status validation, header storage) (baseline F-002, C-005) |
| 27 | `rg -n "_header\b" lib/internal/http/outgoing.js` | `this._header = null` :188 (own data property), set :636; confirms C-005 private-field read |
| 28 | `rg -n "session|sessionID|sessionStore|_parsedUrl|_parsedOriginalUrl" lib/internal/http/incoming.js` (run as two greps) | NEGATIVE — IncomingMessage defines none of the names express-session/parseurl add (C-006, C-014) |
| 29 | `rg -n "prepareStackTrace" lib/internal/errors.js` | :136-150 `prepareStackTraceCallback` consults `globalThis.Error.prepareStackTrace` — realm-wide effect baseline for F-003 |

## Upstream corroboration (read-only)

| # | Command / link | Result |
| --- | --- | --- |
| 30 | `rg -n "on-headers|writeHead|res.end" HISTORY.md` | 1.18.2 bumps on-headers ~1.1.0 citing CVE-2025-7339/GHSA-76c9-3jph-rj3q; 1.17.2 "Fix `res.end` patch to always commit headers"; historical "Fix `res.end` patch ..." and "Fix `res.writeHead` patch missing return value" entries — maintainers call the wrappers patches |
| 31 | `gh api /advisories/GHSA-76c9-3jph-rj3q` | "on-headers is vulnerable to http response header manipulation", < 1.1.0, first patched 1.1.0 (published 2025-07-17) — corroborates F-002 |
| 32 | `rg -n "\"(pre|post)?install\"" package.json` ; `ls scripts/` | NEGATIVE — no install hooks; scripts/ is lint-readme.js + version-history.js (dev-only) |

## Reproduction

| # | Command | Result |
| --- | --- | --- |
| 33 | `node repro.js "$PACKAGE_ROOT"` (Node v24.19.0; script beside report) | depd: 4 `Error.prepareStackTrace` writes during require (set prepareObjectStackTrace / restore undefined, twice), both globals restored; middleware: `res` gains own `end` and `writeHead` differing from prototype methods, no own `write`; `ServerResponse.prototype.{end,write,writeHead}` identities unchanged; `req.session`/`sessionID`/`sessionStore` are own enumerable data properties; `IncomingMessage.prototype` unpolluted |

## Not searched / out of scope

- `test/`, docs, `scripts/` contents beyond listing (dev-only, excluded by task scope).
- No recursive scan of the Node.js tree (targeted files only, per skill).
- No blanket scan of nested dependency trees beyond each runtime dependency's resolved entrypoint and the modules it loads at runtime (debug->ms, uid-safe->random-bytes followed).
- debug `src/browser.js` (Electron renderer branch) noted but not audited — not reachable in the Node runtime.
