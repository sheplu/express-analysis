# Search log: basic-auth-connect 1.1.0 patch audit (pass-b)

All commands shown with portable roots: `$PACKAGE_ROOT` (basic-auth-connect
clone @ 856183e95f7bea8579c4ee07f225b2e3edb8b8b8) and `$NODEJS_SOURCE` (Node.js
main @ d44625a4b80c672215b469906ce583ce7eeeebaf). Commands were run from the
respective roots. `rg` used with `--no-ignore` where the target sits inside
`node_modules`.

## 1. Scope establishment

| # | Command | Result |
| --- | --- | --- |
| 1 | `ls -la $PACKAGE_ROOT` | Runtime files: index.js (3495 B), package.json, node_modules/; non-runtime: test.js, Makefile, README.md, LICENSE, .github/, .npmrc, .npmignore, .gitignore. |
| 2 | `cat $PACKAGE_ROOT/package.json` | name basic-auth-connect v1.1.0; deps: `tsscmp ^1.0.6` only; devDeps (connect/mocha/should/supertest) not installed; scripts: only `test` (make test) — no install/prepare hooks. No `main`/`exports` override → entrypoint is `index.js`. |
| 3 | `git log -1 --format='%H %d' && git status --short` (in `$PACKAGE_ROOT`) | HEAD = 856183e95f7bea8579c4ee07f225b2e3edb8b8b8 (master, origin/master), clean tree. |
| 4 | `ls $PACKAGE_ROOT/node_modules; find $PACKAGE_ROOT/node_modules -maxdepth 2 -name package.json` | Single installed dependency: tsscmp. `.package-lock.json` (lockfileVersion 3) pins tsscmp 1.0.6, integrity sha512-LxhtAkPDTkVCMQjt2h6eBVY28KCjikZqZfMcC15YBeNjkgUpdCfBu5HoiOTDu86v6smE8yOjyEktJ8hlbANHQA==, no further deps. |
| 5 | `cat $PACKAGE_ROOT/node_modules/tsscmp/package.json; ls $PACKAGE_ROOT/node_modules/tsscmp` | tsscmp 1.0.6, `main: lib/index.js`, zero dependencies, no lifecycle scripts. Files: lib/index.js (runtime), test/ (out of scope), CI configs, README, LICENSE. |
| 6 | Full read of `$PACKAGE_ROOT/index.js` (136 lines) and `$PACKAGE_ROOT/node_modules/tsscmp/lib/index.js` (39 lines) | Entire runtime surface read line-by-line. |

## 2. Skill candidate pattern set (runtime scope: index.js + tsscmp/lib/index.js)

Run as: `rg -n --no-ignore -e '<pattern>' index.js node_modules/tsscmp/lib/index.js`

| # | Pattern | Hits |
| --- | --- | --- |
| 7 | `require\s*\(\|\bfrom\s*['"]\|\bimport\s*\(\|\bnode:` | index.js:1 `require('tsscmp')`; index.js:2 `require('http')`; tsscmp lib/index.js:9 `require('crypto')`. → C-001, C-002, C-010. |
| 8 | `\bBuffer\b\|\bprocess\b\|\bglobalThis\b\|\bglobal\b\|\bextends\b\|\binherits\s*\(` | index.js:79 `new Buffer(parts[1], 'base64')` only. → C-003. No process/global/globalThis/extends/inherits. |
| 9 | `\.prototype\b\|__proto__\|setPrototypeOf\|definePropert(y\|ies)\|Reflect\.(set\|defineProperty\|setPrototypeOf)\|Object\.assign` | No matches. |
| 10 | `monkey.?patch\|\bpatch\b\|\bwrap\b\|\bshim\b\|\bpolyfill\b\|\boverride\b` | No matches. |
| 11 | `require\.cache\|require\.extensions\|Module\._(load\|resolveFilename\|extensions\|compile)\|syncBuiltinESMExports\|registerHooks` | No matches. |
| 12 | `process\.(binding\|_linkedBinding)\|internalBinding\|['"]_http_\|['"]internal/` | No matches. |

## 3. Write-site and supplemental sweeps

| # | Command | Result |
| --- | --- | --- |
| 13 | `rg -n --no-ignore -e '(req\|res\|http\|crypto\|Buffer)\s*(\.\|\[)[^=]*=[^=]' index.js node_modules/tsscmp/lib/index.js` | index.js:94 and :100 `req.user = req.remoteUser = user` (→ C-004, C-005); index.js:118 `res.statusCode = 401` (→ C-006); index.js:119 `res.setHeader(...)` (call; → C-007). No writes in tsscmp. |
| 14 | `rg -n --no-ignore -e '\bdelete\b\|getOwnPropertyDescriptor\|freeze\|seal' index.js node_modules/tsscmp/lib/index.js` | No matches. |
| 15 | `rg -n --no-ignore -e '\.prototype\b\|definePropert\|require\.cache\|Module\._\|process\.binding\|__proto__\|setPrototypeOf' node_modules/tsscmp/` (whole package incl. out-of-scope tests, safety net) | No matches. |
| 16 | `rg -n '"(pre\|post)?install"\|"prepare"' package.json node_modules/tsscmp/package.json` | No matches — no install-time code paths. |

Manual read additionally confirmed the remaining call sites not caught by the
write regex: index.js:120 `res.end('Unauthorized')` (→ C-008), index.js:134
`http.STATUS_CODES[code]` read (→ C-009), tsscmp lib/index.js:17-18
`crypto.timingSafeEqual` feature detection (→ C-011), :31
`crypto.pseudoRandomBytes(32)` (→ C-012), :32-33 `crypto.createHmac` (→ C-013).

## 4. Node.js baseline verification (targeted reads only; no tree-wide scans)

| # | Command (in `$NODEJS_SOURCE`) | Result |
| --- | --- | --- |
| 17 | `git log -1 --format='%H'`; `grep -E 'NODE_(MAJOR\|MINOR\|PATCH)_VERSION' src/node_version.h` | d44625a4b80c672215b469906ce583ce7eeeebaf; 28.0.0 (pre-release main). |
| 18 | `rg -n 'statusCode' lib/_http_server.js lib/_http_outgoing.js` | No matches — HTTP implementation moved; `lib/_http_*.js` are legacy re-export shims at this commit. |
| 19 | `sed -n '1,60p' lib/http.js` | Followed re-exports: implementation lives in `lib/internal/http/{agent,client,common,incoming,outgoing,server}.js`; `STATUS_CODES`/`ServerResponse` come from `internal/http/server`. |
| 20 | `rg -n 'STATUS_CODES' lib/http.js lib/_http_server.js` | Exported at lib/http.js:54,265 (and legacy re-export lib/_http_server.js:25,38). Confirms C-009 target is a plain exported map. |
| 21 | `rg -n 'statusCode' lib/internal/http/server.js` | `ServerResponse.prototype.statusCode = 200` at :285; core reads `this.statusCode` at :420 (`writeHead(this.statusCode)`). Confirms per-instance assignment is the documented contract (C-006 rejected). |
| 22 | `rg -n 'setHeader\b' lib/internal/http/outgoing.js` | `OutgoingMessage.prototype.setHeader = function setHeader(...)` at :813. Confirms C-007 is a call to a documented method. |
| 23 | `rg -n 'remoteUser\|\.user\b' lib/internal/http/incoming.js` | No matches — `user`/`remoteUser` are not core `IncomingMessage` properties. Confirms C-004/C-005 are additive library metadata. |
| 24 | `rg -n 'DEP0005\|function Buffer\(\|showFlaggedDeprecation' lib/buffer.js` + `sed -n '310,345p' lib/buffer.js` | Deprecated `Buffer()` constructor at :320-330 delegates to `Buffer.from`/`Buffer.alloc`; DEP0005 warning is flag-gated. Confirms C-003 is deprecated usage, not mutation. |
| 25 | `rg -n 'timingSafeEqual\|pseudoRandomBytes\|createHmac' lib/crypto.js` + read of `getRandomBytesAlias` (:309-330) | `timingSafeEqual` exported at :239; `pseudoRandomBytes` = DEP0115 lazy alias of `randomBytes` at :309/:387; `createHmac` at :173/:201. Confirms C-011..C-013 are plain API usage. |

## 5. History and upstream corroboration (read-only)

| # | Command/query | Result |
| --- | --- | --- |
| 26 | `git log -n 5 --oneline -S 'new Buffer' -- index.js` (in `$PACKAGE_ROOT`) | One commit (7a0b814) — `new Buffer` long-standing; never part of any patching construct. |
| 27 | `git log -n 5 --oneline -S 'tsscmp' -- index.js package.json` | bac1e6a "feat: add timing safe equal comparison" — introduction of the dependency. |
| 28 | `gh search issues --repo expressjs/basic-auth-connect 'Buffer'` | No issues. |
| 29 | `gh search prs --repo expressjs/basic-auth-connect 'Buffer'` | One hit: PR #10. |
| 30 | `gh pr view 10 --repo expressjs/basic-auth-connect` | "Release proposal: 2.0.0" — OPEN/unmerged; would rewrite index.js (ES6), drop tsscmp for direct `crypto` use, require Node >= 18. Not in audited 1.1.0 source. https://github.com/expressjs/basic-auth-connect/pull/10 |

## Outcome

13 candidates logged (see candidates.md): 0 confirmed, 13 rejected, 0
unresolved. All interception/prototype/global/loader pattern groups returned
negative over the full runtime scope.
