# Search log: cookie-parser 1.4.7 audit (pass A)

All library searches run from `$PACKAGE_ROOT` over the three runtime files
(`index.js`, `node_modules/cookie/index.js`, `node_modules/cookie-signature/index.js`;
abbreviated `<runtime files>` below). `--no-ignore` used because node_modules is
git-ignored. Node.js searches run from `$NODEJS_SOURCE`
(d44625a4b80c672215b469906ce583ce7eeeebaf) against targeted files only.

## Scope establishment

| # | Command | Result |
| --- | --- | --- |
| E1 | `ls -la $PACKAGE_ROOT` ; `cat package.json` | Runtime surface = index.js only (npm `files`: LICENSE, HISTORY.md, index.js). deps: cookie 0.7.2, cookie-signature 1.0.6. No main/exports/bin/browser. engines >= 0.8. |
| E2 | `git log -1` in `$PACKAGE_ROOT` | Commit 1f2a3a2037c4efe01605e064e7cc326008be7287 confirmed (matches tasking). |
| E3 | `ls node_modules` ; `cat node_modules/*/package.json` ; `ls -la node_modules/cookie node_modules/cookie-signature` | Exactly two installed runtime deps, each a single index.js entrypoint, both dependency-free. |
| E4 | Full reads of all three runtime files (182 + 336 + 52 lines) | Complete source coverage of runtime scope. |

## Candidate searches over runtime files

| # | Pattern (rg -n --no-ignore) | Result |
| --- | --- | --- |
| S1 | `require\s*\(\|\bfrom\s*['"]\|\bimport\s*\(\|\bnode:` | 3 hits: `index.js:15-16` require('cookie'), require('cookie-signature'); `cookie-signature/index.js:5` require('crypto'). Only core import in scope is `crypto`. No node: specifiers, no dynamic import. |
| S2 | `\bBuffer\b\|\bprocess\b\|\bglobalThis\b\|\bglobal\b\|\bextends\b\|\binherits\s*\(` | 0 hits (exit 1). No core globals, no inheritance from core classes. |
| S3 | `\.prototype\b\|__proto__\|setPrototypeOf\|definePropert(y\|ies)\|Reflect\.(set\|defineProperty\|setPrototypeOf)\|Object\.assign` | 2 hits: `cookie/index.js:23,24` — reads of `Object.prototype.toString` / `.hasOwnProperty` into local vars (ledger C-005). No writes. |
| S4 | `monkey.?patch\|\bpatch\b\|\bwrap\b\|\bshim\b\|\bpolyfill\b\|\boverride\b` (case-insensitive) | 0 hits (exit 1). |
| S5 | `require\.cache\|require\.extensions\|Module\._(load\|resolveFilename\|extensions\|compile)\|syncBuiltinESMExports\|registerHooks` | 0 hits (exit 1). No module-loading interception. |
| S6 | `process\.(binding\|_linkedBinding)\|internalBinding\|['"]_http_\|['"]internal/` | 0 hits (exit 1). No bindings or internal-module access. |
| S7 | `req\.[A-Za-z_$]+\s*=\|res\.[A-Za-z_$]+\s*=\|\bdelete\b` | 8 hits, all in `index.js`: req.secret (51), req.cookies (52,60,69), req.signedCookies (53,64,65), `delete obj[key]` (177). Ledger C-001..C-003, C-008. No `res.*` writes. |
| S8 | `cookie\.[A-Za-z_$]+\s*=\|signature\.[A-Za-z_$]+\s*=\|crypto\.[A-Za-z_$]+\s*=\|exports\.[A-Za-z_$]+\s*=` | Hits are each module's own exports assignments only (`index.js:24-27`, `cookie/index.js:15-16`, `cookie-signature/index.js:16,36`). No mutation of an imported module (cookie/signature/crypto). Ledger C-009. |
| S9 | `req\.headers` | 1 hit: `index.js:49`, a read (`var cookies = req.headers.cookie`). No write to headers. Ledger C-004. |
| S10 | `(JSON\|Math\|Date\|String\|Array\|Object\|RegExp\|encodeURIComponent\|decodeURIComponent)\s*(\.[A-Za-z_$]+)?\s*=[^=]` | 5 hits, all in `cookie/index.js`: lines 23 (C-005 read) and 38,50,76,86 (regex literals assigned to local `var`s). No writes to built-in globals. |
| S11 | `node -e` dump of `scripts` from all three package.json files | cookie-parser: lint/test/test-ci/test-cov; cookie: bench/lint/test/test-ci/test-cov/update-bench; cookie-signature: test. No preinstall/install/postinstall/prepare — no lifecycle patch vector. |
| S12 | `node -e` dump of `main`/`exports`/`browser`/`bin` from all three package.json files | cookie-parser: all undefined (default ./index.js); cookie: main=index.js; cookie-signature: main=index. No conditional/alternative entrypoints. |

## Node.js baseline verification (targeted files only)

| # | Command | Result |
| --- | --- | --- |
| N1 | `rg -n "IncomingMessage" lib/http.js` | `lib/http.js:33` — IncomingMessage required from `internal/http/incoming`; exported at line 268. (Legacy `lib/_http_incoming.js` absent at this ref; follow-the-re-export per skill table.) |
| N2 | `rg -n -i "cookies\|\bsecret" lib/internal/http/incoming.js` | 0 hits (exit 1). Core defines no `cookies`, `signedCookies`, or `secret` member — key negative result for C-001..C-003. |
| N3 | `rg -n "this\.[A-Za-z_]+ =" lib/internal/http/incoming.js` | Constructor own properties (lines 77-106): socket, httpVersion*, complete, rawHeaders, rawTrailers, joinDuplicateHeaders, aborted, upgrade, url, method, statusCode, statusMessage, client, _consuming, _dumped. No collision with cookie-parser's writes. |
| N4 | `rg -n "IncomingMessage\.prototype\.[A-Za-z_]+\|defineProperty\(IncomingMessage" lib/internal/http/incoming.js` and `rg -n "ObjectDefinePropert" ...` | Prototype methods: setTimeout, _read, _destroy, _addHeaderLines, _addHeaderLine, _addHeaderLineDistinct, _dumpAndCloseReadable, _dump. Defined accessors: connection (115), headers (125), headersDistinct (145), trailers (165), trailersDistinct (185), signal (205). No collision. |
| N5 | Read `lib/internal/http/incoming.js:115-163` | `headers` is a lazy getter materializing a null-prototype object from rawHeaders into `kHeaders`; setter stores to `kHeaders`. cookie-parser only invokes the getter (read). |
| N6 | `rg -n "createHmac\|createHash" lib/crypto.js` | Public factories at lib/crypto.js:149 (createHash), 173 (createHmac); exported at 200-201. cookie-signature's usage is plain public-API calls. |

No recursive scan of `$NODEJS_SOURCE/lib`, `src`, or `test` was performed.

## Upstream corroboration (read-only)

| # | Command | Result |
| --- | --- | --- |
| U1 | `gh search issues --repo expressjs/cookie-parser "monkeypatch OR monkey-patch OR prototype pollution"` | `[]` — no patch-related issues. |
| U2 | `gh search issues --repo jshttp/cookie "prototype"` | 4 closed issues, none about patching core; #176 ("Change obj.hasOwnProperty to ... Object.prototype.hasOwnProperty.call") corroborates the defensive read-only built-in usage at cookie/index.js:23-24 (C-005). |

## Reproduction

| # | Command | Result |
| --- | --- | --- |
| R1 | `PACKAGE_ROOT=<cookie-parser-checkout> node repro-no-core-mutation.js` | `OK: no core mutation observed (node v24.19.0)` — IncomingMessage.prototype (own keys, [[Prototype]], setTimeout and headers-descriptor identities), crypto.createHmac/createHash identities, Object.prototype own keys, Module._load/_resolveFilename, require.extensions['.js'] all identical before require, after require, and after a middleware run with plain, signed, and JSON cookies; req.cookies/signedCookies/secret land as instance own properties; signedCookies is null-prototype; cookie.parse output is a plain object. |

## Provenance

- `$PACKAGE_ROOT/index.js` sha256 d0689887ae03828781b75ff5578c6957aab0d827d8b9b33dc5304589411b8950
- `$PACKAGE_ROOT/node_modules/cookie/index.js` sha256 a88f6d7257e3403b727b90a2f3f5c03591e14eaa0b217c501b7071074f080e42
- `$PACKAGE_ROOT/node_modules/cookie-signature/index.js` sha256 8d762862020064468b4af17e561ee1ee29d9d55311a1c19d958c4ff2be912963
