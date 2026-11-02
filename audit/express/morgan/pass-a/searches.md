# Search log — morgan monkeypatch audit (pass A)

All commands were run from `$PACKAGE_ROOT` (morgan 1.12.1, commit
`b1272e70812dbc504321eeb5a43d14b0822c150d`) or `$NODEJS_SOURCE` (commit
`d44625a4b80c672215b469906ce583ce7eeeebaf`) as noted. `$FILES` is the fixed
runtime file set below; nested dependencies and test/doc files were excluded.

```
FILES =
  index.js
  node_modules/basic-auth/index.js
  node_modules/debug/src/index.js
  node_modules/debug/src/debug.js
  node_modules/debug/src/node.js
  node_modules/debug/node.js
  node_modules/depd/index.js
  node_modules/ee-first/index.js
  node_modules/ms/index.js
  node_modules/on-finished/index.js
  node_modules/on-headers/index.js
  node_modules/safe-buffer/index.js
```

## Scope establishment

| # | Command | Result |
| --- | --- | --- |
| S1 | `cat package.json`; `git log -1` | morgan 1.12.1 at commit b1272e7; runtime deps: basic-auth ~2.0.1, debug 2.6.9, depd ~2.0.0, on-finished ~2.4.1, on-headers ~1.1.0; `files` ships only index.js. |
| S2 | `node -e` reading each `node_modules/<dep>/package.json` | Resolved: basic-auth 2.0.1 (dep: safe-buffer 5.1.2), debug 2.6.9 (dep: ms 2.0.0), depd 2.0.0, ee-first 1.1.1, ms 2.0.0, on-finished 2.4.2 (dep: ee-first 1.1.1), on-headers 1.1.0, safe-buffer 5.1.2. Entrypoints: all `index.js` except debug (`./src/index.js`; root `node.js` shim re-exports `./src/node`). |
| S3 | `find <dep> -name '*.js' -not -path '*/node_modules/*'` per dep | Full runtime JS inventory per dep (see FILES). Extra files found: `debug/karma.conf.js` (browser test config, out of scope), `debug/src/browser.js` (loaded only when `process.type === 'renderer'`, i.e. Electron renderer — not the Node path), `debug/src/inspector-log.js` (checked for reachability, see S13), `depd/lib/browser/index.js` (browser field only, not loaded in Node). |
| S4 | `cat` of every file in FILES | Full-content read of all 12 runtime files. |

## Candidate pattern searches (ripgrep, `--no-ignore`, over $FILES)

| # | Pattern | Result |
| --- | --- | --- |
| P1 | `require\s*\(|\bfrom\s*['"]|\bimport\s*\(|\bnode:` | Core imports: depd→path; debug→tty, util, fs (lazy), net (lazy); on-headers→http; safe-buffer→buffer; on-finished→async_hooks (try/catch), ee-first; morgan→only its 5 deps. No `node:` specifiers, no dynamic import. |
| P2 | `\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(` | morgan: process.env.NO_COLOR:50, process.stdout:117, process.hrtime:292/575, process.pid:361. depd: process.cwd:23, process.noDeprecation:154, env reads:159/175, process as emitter:186/251, process.stderr:256/260. debug: env reads, process.stdout/stderr:67-68, process.binding:169. safe-buffer/basic-auth: Buffer reads only. No `extends`, no `inherits(`, no globalThis/global writes. |
| P3 | `\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(...)|Object\.assign` | on-headers:19 reads `http.ServerResponse.prototype.appendHeader` (feature detect only). on-finished:181 comment only. depd: defineProperty at 62/485 (passed-in object) and 496-521 (own Error instance). No prototype writes, no setPrototypeOf, no __proto__, no Object.assign in any file. |
| P4 | `monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b` (case-insensitive) | Hits: on-finished patchAssignSocket (129, 181, 188), on-finished wrap() AsyncResource helper (53, 215-236), depd wrapproperty/wrapfunction comments (436, 469, 477), morgan token-wrapper comment (589), debug DEBUG_FD deprecation message (56, 64). Each traced; see ledger. |
| P5 | `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks` | **No hits** in any runtime file. No module-loading interception. |
| P6 | `process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/` | Single hit: `debug/src/node.js:169` `process.binding('tty_wrap')` inside `createWritableStdioStream` (reachable only when `DEBUG_FD` is set to an fd other than 1/2). Read-only binding use. |
| P7 | `(res|req|msg|socket|stream|this)\.[A-Za-z_$][\w$]*\s*=[^=]` | Writes found: on-headers:71 `res.writeHead = ...`; on-headers:129 `this.statusCode = statusCode` (inside wrapper); on-finished:147/164 `msg.__onFinished`; on-finished:195 `res.assignSocket = ...` (guarded); morgan index.js:134-136, 139-140, 575-576 (`_startAt`, `_startTime`, `_remoteAddress`); debug src/node.js:176-223 property sets on streams it creates; basic-auth:131-132 own Credentials instance. |
| P8 | `Error\.(prepareStackTrace|stackTraceLimit|captureStackTrace)|console\._|\bconsole\.[a-z]+\s*=` (incl. inspector-log.js) | depd/index.js:382-396 getStack saves/replaces/restores `Error.prepareStackTrace` and `Error.stackTraceLimit`. debug/src/inspector-log.js:11-14 swaps `console._stdout` — reachability checked in S13 (dead code). No other console or Error-static writes. |
| P9 | `process\.env\.[A-Z_]+\s*=|delete process\.env|process\.(stdout|stderr)\.[a-zA-Z]+\s*=[^=]` | debug/src/node.js:143/145 `delete process.env.DEBUG` / `process.env.DEBUG = namespaces` (in `save()`, called by `enable()` incl. once at load with the current value). No writes to properties of process.stdout/stderr. |
| P10 | `new Function|\beval\s*\(` | morgan index.js:458 (format compiler) and depd index.js:425 (wrapfunction). Both generate library-owned functions; no core object receives them (morgan never calls `deprecate.function` on core). |

## Node.js baseline verification (targeted reads only)

| # | Command | Result |
| --- | --- | --- |
| N1 | `git log -1 --format=%H` in $NODEJS_SOURCE | `d44625a4b80c672215b469906ce583ce7eeeebaf`. |
| N2 | `wc -l lib/_http_server.js lib/_http_outgoing.js lib/_http_incoming.js`; `tail` of each | 50/47/45 lines — at this ref the `_http_*` modules are deprecated re-export shims (DEP0199) over `lib/internal/http/{server,outgoing,incoming}.js`. Followed the re-exports. |
| N3 | `grep -n "writeHead\|assignSocket\|_implicitHeader" lib/internal/http/server.js` | `ServerResponse.prototype.assignSocket`:312 (emits `'socket'`:319); `_implicitHeader`:419-421 (calls `this.writeHead(this.statusCode)`); `ServerResponse.prototype.writeHead = writeHead`:423-424. |
| N4 | `sed -n '415,500p' lib/internal/http/server.js` | Read core `writeHead` implementation (status line handling, kOutHeaders merge, array/object header paths) — the behavior the on-headers wrapper front-runs. |
| N5 | `grep -n "this\.socket\|this\._header\|headersSent\|writableEnded\|this\.finished" lib/internal/http/outgoing.js`; `sed -n '160,215p'`, `sed -n '280,330p'` | OutgoingMessage constructor sets `this[kSocket] = null`:187, `this._header = null`:188; `socket` is a prototype accessor over kSocket:304-316; `headersSent` getter `!!this._header`:1007-1012; `writableEnded` getter over `this.finished`:1014-1016. |
| N6 | `grep -rn "_startAt\|_startTime\|_remoteAddress\|__onFinished" lib/internal/http/ lib/_http_*.js` | **No hits** — morgan/on-finished instance keys do not collide with any core member. (Negative result.) |
| N7 | `grep -n "prepareStackTrace" lib/internal/errors.js`; `sed -n '160,175p'`; `grep -rn "ErrorPrepareStackTrace" lib/internal/bootstrap/` | Node installs a default `Error.prepareStackTrace` (`ErrorPrepareStackTrace`, lib/internal/errors.js:168) at bootstrap (lib/internal/bootstrap/realm.js:509), and `prepareStackTraceCallback` (lib/internal/errors.js:136-150) dispatches to any user-assigned `globalThis.Error.prepareStackTrace`. Confirms depd's assignment genuinely redirects core stack preparation while set. |

## Reachability and corroboration

| # | Command | Result |
| --- | --- | --- |
| S13 | `rg -n "inspector-log|browser\.js" index.js node_modules/debug/src/ node_modules/debug/node.js node_modules/debug/package.json` | `inspector-log.js` is **not required by any file** — only package.json `browser` map and `src/index.js`→`browser.js` (Electron renderer branch). Dead code in the Node path. |
| S14 | `head -30 HISTORY.md` | morgan 1.10.1 bumped on-headers to ~1.1.0 citing CVE-2025-7339 / GHSA-76c9-3jph-rj3q (on-headers writeHead wrapper header manipulation). |
| S15 | `gh api /repos/expressjs/on-headers/security-advisories/GHSA-76c9-3jph-rj3q` | Published advisory, CVE-2025-7339, "on-headers vulnerable to http response header manipulation", vulnerable `<1.1.0`, patched `1.1.0`. Audited copy is 1.1.0 (patched). |
| S16 | `node repro.js "$PACKAGE_ROOT"` (script beside this log; Node v24.19.0) | See `repro.js`. Results: 2 write/restore pairs on `Error.prepareStackTrace` during `require('morgan')` (depd factory + `deprecate.property`), `stackTraceLimit` restored; `ServerResponse.prototype.writeHead` identical before/after require and during a live request; per-request `res.writeHead` own property differing from prototype, wrapper fires on the implicit-header path (`res.end()` only, no explicit `writeHead` call); `req._startAt`/`req._remoteAddress`/`res.__onFinished` own properties present; bare `new http.ServerResponse(req).socket === null` (not `undefined`); no `assignSocket` own property after `onFinished(res, ...)`. |
