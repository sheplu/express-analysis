# Search log: method-override 3.0.0 audit (pass-b)

All library commands run from `$PACKAGE_ROOT` unless noted. `$FILES` denotes the
nine runtime files in scope:

```
index.js
node_modules/debug/src/index.js
node_modules/debug/src/node.js
node_modules/debug/src/debug.js
node_modules/debug/src/browser.js
node_modules/methods/index.js
node_modules/ms/index.js
node_modules/parseurl/index.js
node_modules/vary/index.js
```

## Scope establishment

| # | Command | Result |
| --- | --- | --- |
| 1 | `ls -la && cat package.json && git log -1 --format='%H %s'` | v3.0.0 @ 4df570e14dddc88b9464808f4cab3b2a73fc6dc8; `files` ships only index.js (+LICENSE/HISTORY); deps: debug 3.1.0, methods ~1.1.2, parseurl ~1.3.2, vary ~1.1.2; no install/postinstall scripts |
| 2 | read `index.js` in full (144 lines) | two instance writes found (lines 61, 75); uses debug/methods/parseurl/querystring/vary |
| 3 | `ls node_modules` + read each dep `package.json` (name/version/main/browser) | debug@3.1.0 (main src/index.js), methods@1.1.2, ms@2.0.0, parseurl@1.3.3, vary@1.1.2; supports-color NOT installed |
| 4 | `find node_modules -name '*.js' -not -path '*/node_modules/*'` + `wc -l` | 10 files (incl. debug/karma.conf.js, test-only); 9 runtime files, 1,247 runtime lines total — all read in full |
| 5 | per-dep `package.json` scripts check (`node -e` loop) | only lint/test/bench scripts; no install hooks anywhere |

## Skill candidate pattern sets (all 9 runtime files)

| # | Pattern (rg -n) | Result |
| --- | --- | --- |
| P1 | `require\s*\(\|\bfrom\s*['"]\|\bimport\s*\(\|\bnode:` | Hits: core modules http (methods:15), url (parseurl:15), tty+util (debug/node.js:5-6), querystring (index.js:19); internal requires (debug browser/node/debug/ms, supports-color in try/catch). No `node:` specifiers, no dynamic import |
| P2 | `\bBuffer\b\|\bprocess\b\|\bglobalThis\b\|\bglobal\b\|\bextends\b\|\binherits\s*\(` | Hits only in debug: process.type detection (index.js:6, browser.js:48), process.env reads (node.js:49,59,163; browser.js:167-168), tty.isatty(process.stderr.fd) (node.js:76), process.stderr.write (node.js:135), process.env.DEBUG write/delete (node.js:149,151 -> C-007). No Buffer/globalThis/global/extends/inherits |
| P3 | `\.prototype\b\|__proto__\|setPrototypeOf\|definePropert(y\|ies)\|Reflect\.(set\|defineProperty\|setPrototypeOf)\|Object\.assign` | ONE hit: debug/src/browser.js:133 `Function.prototype.apply.call(console.log, ...)` — invocation, not assignment; browser-only file (C-009). No defineProperty/setPrototypeOf/__proto__/Object.assign anywhere |
| P4 | `monkey.?patch\|\bpatch\b\|\bwrap\b\|\bshim\b\|\bpolyfill\b\|\boverride\b` | Hits are naming/comments only: "method-override"/"override" strings in index.js:2,16,28,76 and 'patch' as HTTP verb in methods/index.js:65. No patching helper or shimmer-style code |
| P5 | `require\.cache\|require\.extensions\|Module\._(load\|resolveFilename\|extensions\|compile)\|syncBuiltinESMExports\|registerHooks` | ZERO hits (exit 1) — no module-loading interception |
| P6 | `process\.(binding\|_linkedBinding)\|internalBinding\|['"]_http_\|['"]internal/` | ZERO hits (exit 1) — no bindings or core-internal requires |

## Targeted write sweeps

| # | Command | Result |
| --- | --- | --- |
| W1 | `rg -n "req\.[A-Za-z_$]+\s*=[^=]\|res\.[A-Za-z_$]+\s*=[^=]" index.js node_modules/parseurl/index.js node_modules/vary/index.js` | index.js:61 (req.originalMethod -> C-002), index.js:75 (req.method -> C-001), parseurl:54 (req._parsedUrl -> C-003), parseurl:84 (req._parsedOriginalUrl -> C-004). No res.* assignments |
| W2 | `rg -n "setHeader\|getHeader\|process\.env\.[A-Z_]+\s*=\|delete process\.env" index.js node_modules/vary/index.js node_modules/debug/src/node.js` | vary:134,140,147 (documented header APIs -> C-005); debug node.js:149,151 (env write -> C-007) |
| W3 | `rg -n "METHODS\s*=\|http\.[A-Za-z]+\s*=" node_modules/methods/index.js` | ZERO hits — methods never assigns to http (C-006 rejected) |
| W4 | `ls node_modules \| grep -i supports` | ZERO hits — supports-color absent (C-008) |
| W5 | full reads of methods/parseurl/vary/debug(all src)/ms heads | ms is pure string/number math, no core module use at all; vary operates only via res.getHeader/setHeader; debug mutates only its own exports (C-010) |

## Node.js core baseline (targeted; no tree-wide scans)

| # | Command (in `$NODEJS_SOURCE`) | Result |
| --- | --- | --- |
| N1 | `git log -1 --format='%H'` | d44625a4b80c672215b469906ce583ce7eeeebaf |
| N2 | `rg -n "this\.method\|\.method =" lib/_http_incoming.js` | ZERO hits — legacy file is a header/shim at this ref; implementation moved to lib/internal/http/ |
| N3 | `ls lib/_http_*.js lib/internal/http/ lib/http.js` | internal/http contains agent/client/common/incoming/outgoing/server.js |
| N4 | `rg -n "method" lib/internal/http/incoming.js` + read lines 60-110 | constructor line 96: `this.method = null` — plain assignment => own writable/enumerable/configurable data property |
| N5 | `rg -n "\.method\s*=" lib/internal/http/{common,server}.js lib/_http_{common,server}.js` | lib/internal/http/common.js:118 `incoming.method = allMethods[method]` (the parser write); server.js hits are reads only (:222,:1145,:1199,:1352) |
| N6 | read lib/internal/http/common.js:55-135 + `rg "allMethods\|methods"` | `parserOnHeadersComplete` server branch assigns method; `allMethods` from `internalBinding('http_parser')` (common.js:31) |
| N7 | `rg -n "incoming\|IncomingMessage" lib/http.js` | http.js:33 requires internal/http/incoming; :268 exports IncomingMessage |
| N8 | `rg -n "defineProperty\|get method\|set method" lib/internal/http/incoming.js` | ZERO hits — no accessor for `method`; read-only is documentation convention only |
| N9 | `rg -n "message\.method\|Read only\|read-only" doc/api/http.md` + read :2975-2990 | doc/api/http.md:2977-2987: "`message.method` ... Read only. Examples: 'GET', 'DELETE'." |
| N10 | read doc/api/http.md:3677-3690 + `rg -n "METHODS" lib/http.js` | http.METHODS documented as parser-supported list; lib/http.js:264 `METHODS: methods.toSorted()` — exported as a copy |
| N11 | `rg -n "_parsedUrl\|originalMethod" lib/internal/http/{incoming,server}.js` | ZERO hits — confirms C-002/C-003/C-004 names are library-owned, not core state |

## Upstream corroboration (read-only)

| # | Command | Result |
| --- | --- | --- |
| U1 | `git log -n 10 --oneline -S 'req.method =' -- index.js` (in `$PACKAGE_ROOT`) | single hit: e6d87e8 "init" — the write has existed since the first commit |
| U2 | `rg -n "req.method\|originalMethod" README.md` | README:28-36 documents overriding `req.method` and preserving `req.originalMethod` — library-documented contract |
| U3 | `gh search issues --repo expressjs/method-override "req.method"` | #8 (closed, "Why make the way to override method exclusive?"), #7 (closed, recognition bug) — design discussion, no core-patch implications |
| U4 | `gh search issues --repo nodejs/node "IncomingMessage method read only"` | ZERO results — no Node-side sanction or accommodation found for rewriting message.method |

## Reproduction

| # | Command | Result |
| --- | --- | --- |
| R1 | `node repro-method-override.js "$PACKAGE_ROOT"` (Node v24.19.0; script beside report) | shared-state diffs after require(): none; `IncomingMessage.prototype` has no own `method` property; live request: own descriptor `{"value":"POST","writable":true,"enumerable":true,"configurable":true}` -> `{"value":"DELETE",...}` after middleware; `req.originalMethod === 'POST'`; shared-state diffs after request handling: none. Raw output in `repro-output.txt` (verified free of machine paths) |
| R2 | `shasum -a 256` over the 9 runtime files | hashes recorded in report.md provenance table |

## Negative-result summary

- No `Object.defineProperty`/`defineProperties`, no `setPrototypeOf`/`__proto__`,
  no prototype property assignment anywhere in runtime scope.
- No `require.cache`/`require.extensions`/`Module._*`/`syncBuiltinESMExports`/
  `registerHooks` — no module-loading interception.
- No `process.binding`/`internalBinding`/`'internal/...'`/`'_http_...'` requires.
- No assignment to any core module export (`http.*`, `url.*`, `querystring.*`,
  `tty.*`, `util.*`) in any runtime file.
- No install/postinstall scripts in the target or any dependency.
- No globals created or reassigned (`global`/`globalThis` never written).
