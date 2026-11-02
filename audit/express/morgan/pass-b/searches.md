# Search log — morgan 1.12.1 patch audit (pass-b)

All commands run from `$PACKAGE_ROOT` unless marked `$NODEJS_SOURCE`. The runtime
file set (15 files) passed to the pattern searches:

```
index.js
node_modules/basic-auth/index.js
node_modules/debug/src/index.js  node_modules/debug/src/debug.js
node_modules/debug/src/node.js   node_modules/debug/src/browser.js
node_modules/debug/src/inspector-log.js  node_modules/debug/node.js
node_modules/depd/index.js       node_modules/depd/lib/browser/index.js
node_modules/ee-first/index.js   node_modules/ms/index.js
node_modules/on-finished/index.js  node_modules/on-headers/index.js
node_modules/safe-buffer/index.js
```

## Scope establishment

| # | Command | Result |
| --- | --- | --- |
| S-01 | `ls $PACKAGE_ROOT && cat package.json` | Shipped runtime = `index.js` only (`files` field); deps: basic-auth ~2.0.1, debug 2.6.9, depd ~2.0.0, on-finished ~2.4.1, on-headers ~1.1.0; no install scripts |
| S-02 | `ls node_modules` + per-package `package.json` version/main | basic-auth@2.0.1, debug@2.6.9 (main `./src/index.js`), depd@2.0.0, ee-first@1.1.1, ms@2.0.0, on-finished@2.4.2, on-headers@1.1.0, safe-buffer@5.1.2 |
| S-03 | `find node_modules -name "*.js" -not -path "*/node_modules/*"` | 15 runtime JS files (list above); no nested node_modules |
| S-04 | `git log -1 --format="%H %d"` | b1272e70812dbc504321eeb5a43d14b0822c150d (HEAD -> master, tag: 1.12.1, origin/master) |

## Candidate pattern set (skill P1-P6) over the 15 runtime files

`rg -n --no-ignore <pattern> <files>`

| # | Pattern | Hits -> disposition |
| --- | --- | --- |
| S-05 (P1) | `require\s*\(\|\bfrom\s*['"]\|\bimport\s*\(\|\bnode:` | 23 hits — import inventory only: morgan requires its 5 deps; debug -> ms/tty/util/fs/net/stream; basic-auth -> safe-buffer -> buffer; on-finished -> ee-first + async_hooks; on-headers -> http; depd -> path. No dynamic/computed requires. |
| S-06 (P2) | `\bBuffer\b\|\bprocess\b\|\bglobalThis\b\|\bglobal\b\|\bextends\b\|\binherits\s*\(` | 40 hits — all `process.*` reads/calls (env, hrtime, pid, stdout/stderr, cwd, binding C-013, emit C-011, nextTick C-028), safe-buffer Buffer handling (C-016), debug env writes (C-012). No `extends`/`inherits(` of core classes; no `global`/`globalThis` hits. |
| S-07 (P3) | `\.prototype\b\|__proto__\|setPrototypeOf\|definePropert(y\|ies)\|Reflect\.(set\|defineProperty\|setPrototypeOf)\|Object\.assign` | 10 hits — on-headers:19 prototype READ (C-021); on-finished:181 comment; debug/browser:123 `Function.prototype.apply` call; depd defineProperty x7 (C-009/C-010). No prototype assignment anywhere. |
| S-08 (P4) | `monkey.?patch\|\bpatch\b\|\bwrap\b\|\bshim\b\|\bpolyfill\b\|\boverride\b` (case-insensitive) | 12 hits — on-finished patchAssignSocket (:129,:181,:188 -> C-005); on-finished/depd "wrap" helpers (C-006/C-009/C-019b); debug DEBUG_FD "override" doc text (C-029); morgan:589 token wrapper comment (C-024). |
| S-09 (P5) | `require\.cache\|require\.extensions\|Module\._(load\|resolveFilename\|extensions\|compile)\|syncBuiltinESMExports\|registerHooks` | ZERO hits — no module-loading interception in scope. |
| S-10 (P6) | `process\.(binding\|_linkedBinding)\|internalBinding\|['"]_http_\|['"]internal/` | 1 hit — debug/src/node.js:169 `process.binding('tty_wrap')` (C-013, env-gated read). |

## Full-file reads (candidate resolution)

| # | File | Finding |
| --- | --- | --- |
| S-11 | `index.js` (596 lines, full) | C-001..C-003, C-019a, C-020, C-024, C-026, C-027 |
| S-12 | `node_modules/on-finished/index.js` (full) | C-004..C-006, C-028; confirmed morgan only passes the response (index.js:174) |
| S-13 | `node_modules/on-headers/index.js` (full) | C-003/C-025 write site :71; wrapper :30-52; header strategy :19-20,:119-180 |
| S-14 | `node_modules/depd/index.js` (full) | C-008..C-011, C-019b; getStack write :386-387, restore :395-396 |
| S-15 | `node_modules/ee-first/index.js` (full) | C-007 — listener add/remove only |
| S-16 | `node_modules/debug/src/node.js`, `src/debug.js`, `src/index.js`, `node.js` (full) | C-012..C-015, C-029; require-time `exports.enable(load())` at src/node.js:248 |
| S-17 | `node_modules/basic-auth/index.js`, `node_modules/safe-buffer/index.js`, `node_modules/ms/index.js` (full) | C-016..C-018 — no core writes |
| S-18 | `rg -n "inspector-log\|browser" node_modules/debug/src/*.js node_modules/debug/package.json` | `src/browser.js` only loaded when `process.type === 'renderer'` (Electron); `src/inspector-log.js` required by nothing at runtime — both excluded from Node server scope |
| S-19 | `rg -n "browser" node_modules/depd/package.json` | depd `lib/browser/index.js` reachable only via bundler `browser` field — excluded |

## Node.js baseline ($NODEJS_SOURCE, commit d44625a4b80c672215b469906ce583ce7eeeebaf)

| # | Command | Result |
| --- | --- | --- |
| S-20 | `git log -1 --format=%H` | d44625a4b80c672215b469906ce583ce7eeeebaf |
| S-21 | `rg -n "_startAt\|_startTime\|_remoteAddress\|__onFinished" lib/http.js lib/_http_server.js lib/_http_outgoing.js lib/_http_incoming.js lib/_http_common.js lib/_http_client.js lib/_http_agent.js` | ZERO hits (also zero in initial run before locating internal layout) |
| S-22 | `ls lib/_http_*.js lib/internal/http*; head -40 lib/http.js` | Implementation moved to `lib/internal/http/{agent,client,common,incoming,outgoing,server}.js`; `lib/_http_*.js` are re-export shims |
| S-23 | `rg -n "_startAt\|_startTime\|_remoteAddress\|__onFinished" lib/internal/http/server.js lib/internal/http/outgoing.js lib/internal/http/incoming.js lib/internal/http/common.js lib/internal/http/client.js lib/internal/http/agent.js lib/internal/http.js lib/http.js` | ZERO hits — morgan/on-finished keys collide with nothing (C-001/C-002/C-004 rejected) |
| S-24 | `rg -n "writeHead\|appendHeader\|assignSocket\|emit\('socket'" lib/internal/http/server.js` | `ServerResponse.prototype.writeHead = writeHead` :423 (impl :424+, `this.statusCode = statusCode` :446); `assignSocket` :312-321 (sets socket, emits `'socket'`); server calls `res.assignSocket(socket)` :1410/:1275 before user listeners — F-001 baseline, C-005 reachability |
| S-25 | `rg -n "this\.socket\|this\[kSocket\]\|function OutgoingMessage" lib/internal/http/outgoing.js` + `sed -n '180,200p;290,320p'` | Constructor `this[kSocket] = null` :187; `socket` prototype accessor get/set :304-316 (`connection` alias :294-302) — `res.socket` is `null`, never `undefined` -> C-005 guard false |
| S-26 | `rg -n "appendHeader" lib/internal/http/outgoing.js` | `OutgoingMessage.prototype.appendHeader` :877 — on-headers append strategy active (C-021) |
| S-27 | `rg -n "function ServerResponse\|statusCode = " lib/internal/http/server.js` | `ServerResponse.prototype.statusCode = 200` :285 — wrapper's `this.statusCode` write mirrors core behavior (C-022) |
| S-28 | `rg -n "writableEnded" lib/internal/http/outgoing.js` | accessor :1014 — on-finished `isFinished` uses public accessor |
| S-29 | `rg -c "SyncWriteStream" lib/fs.js lib/internal/fs/sync_write_stream.js` | Only `lib/internal/fs/sync_write_stream.js` matches — `fs.SyncWriteStream` not exported (C-014) |

## Upstream corroboration (read-only)

| # | Query | Result |
| --- | --- | --- |
| S-30 | `gh api repos/expressjs/on-headers/releases` (redirects to jshttp/on-headers), release v1.1.0 | Fixes CVE-2025-7339 / GHSA-76c9-3jph-rj3q (header manipulation inside the writeHead wrapper); audited 1.1.0 contains the appendHeader fix — corroborates F-001 wrapper replacing core header processing and its semantic divergence history |

## Reproduction

| # | Command | Result |
| --- | --- | --- |
| S-31 | `node repro-writehead.js "$PACKAGE_ROOT"` (Node v24.19.0, script beside report) | `requireTime`: debugEnvPreserved=true, prepareStackTraceRestored=true, stackTraceLimitRestored=true, prototype writeHead untouched. `afterMiddleware`: resWriteHeadIsOwnProperty=true, resWriteHeadIsCoreFunction=false, prototypeWriteHeadUnchanged=true, req `_startAt/_startTime/_remoteAddress` own=true, res `_startAt/_startTime/__onFinished` own=true, patchAssignSocketApplied=false, res.socket object at attach. Confirms F-001, F-002 restoration, C-005/C-012 rejections. |
