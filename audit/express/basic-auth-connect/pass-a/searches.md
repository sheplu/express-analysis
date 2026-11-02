# Search log: basic-auth-connect 1.1.0 patch audit (pass A)

All library searches ran from `$PACKAGE_ROOT` (scoped to the two runtime files; `--no-ignore` because the dependency lives in node_modules). Node.js searches ran from `$NODEJS_SOURCE` (targeted files only, never the whole tree). Negative results are logged.

## Scope establishment

| Command | Result |
| --- | --- |
| `ls -la $PACKAGE_ROOT` | index.js, package.json, node_modules/, test.js, Makefile, README, LICENSE, .github, .npmrc, .npmignore, .gitignore. Runtime surface = index.js only. |
| `cat $PACKAGE_ROOT/package.json` | main defaults to index.js (no `main`/`exports`/`bin` overrides); scripts: only `test`; dependencies: `tsscmp ^1.0.6`; devDependencies out of scope. |
| `git log -1 --format='%H'` (in `$PACKAGE_ROOT`) | 856183e95f7bea8579c4ee07f225b2e3edb8b8b8 (HEAD -> master, origin/master). |
| `ls $PACKAGE_ROOT/node_modules` + `find node_modules/tsscmp -type f` | Only tsscmp@1.0.6 installed; runtime file = lib/index.js (`main`); test/ and CI files out of scope. |
| `cat node_modules/tsscmp/package.json` | main: lib/index.js; no dependencies; scripts: test only; engines >=0.6.x. |
| `cat node_modules/.package-lock.json` | Single entry tsscmp 1.0.6, integrity sha512-LxhtAkPDTkVCMQjt2h6eBVY28KCjikZqZfMcC15YBeNjkgUpdCfBu5HoiOTDu86v6smE8yOjyEktJ8hlbANHQA==. |
| `rg -n --no-ignore '"(pre|post)?install"\|"prepare"' package.json node_modules/tsscmp/package.json` | NEGATIVE — no lifecycle/install scripts in either package. |
| `cat .npmrc` | `package-lock=false` only. |
| Full file reads | `$PACKAGE_ROOT/index.js` (136 lines) and `$PACKAGE_ROOT/node_modules/tsscmp/lib/index.js` (38 lines) read in full. |

## Skill candidate pattern set (over index.js + node_modules/tsscmp/lib/index.js)

Note: the first batch invocation failed because zsh does not word-split an unquoted `$FILES` variable (rg "No such file" on the joined path); rerun immediately with explicit file arguments. Results below are from the corrected run.

| Pattern (`rg -n --no-ignore -e ...`) | Hits |
| --- | --- |
| `require\s*\(\|\bfrom\s*['"]\|\bimport\s*\(\|\bnode:` | index.js:1 `require('tsscmp')`; index.js:2 `require('http')`; tsscmp lib/index.js:9 `require('crypto')`. No ESM/dynamic/node: imports. |
| `\bBuffer\b\|\bprocess\b\|\bglobalThis\b\|\bglobal\b\|\bextends\b\|\binherits\s*\(` | index.js:79 `new Buffer(parts[1], 'base64')` only. No process/global/globalThis/extends/inherits. |
| `\.prototype\b\|__proto__\|setPrototypeOf\|definePropert(y\|ies)\|Reflect\.(set\|defineProperty\|setPrototypeOf)\|Object\.assign` | NEGATIVE — no matches. |
| `monkey.?patch\|\bpatch\b\|\bwrap\b\|\bshim\b\|\bpolyfill\b\|\boverride\b` | NEGATIVE — no matches. |
| `require\.cache\|require\.extensions\|Module\._(load\|resolveFilename\|extensions\|compile)\|syncBuiltinESMExports\|registerHooks` | NEGATIVE — no matches. |
| `process\.(binding\|_linkedBinding)\|internalBinding\|['"]_http_\|['"]internal/` | NEGATIVE — no matches. |

## Supplementary write/mutation sweeps (same two files)

| Command | Result |
| --- | --- |
| `rg -n --no-ignore '\b(req\|res)\.[A-Za-z_$][\w$]*\s*=[^=]'` | index.js:94 and :100 `req.user = req.remoteUser = user`; index.js:118 `res.statusCode = 401`. -> C-001/C-002/C-003. |
| `rg -n --no-ignore '\b(http\|crypto)\s*\.\s*[\w$]+\s*=[^=]' -e '\b(http\|crypto)\s*=\s*[^=]'` (minus the initial `var x = require(...)` bindings) | NEGATIVE — no writes to the http/crypto module objects or their members. |
| `rg -n --no-ignore '\bdelete\b\|getOwnPropertyDescriptor\|freeze\|seal\|preventExtensions'` | NEGATIVE — no deletes or descriptor operations. |
| `rg -n --no-ignore '=' node_modules/tsscmp/lib/index.js` (every assignment audited) | Only local `var` bindings (lines 9, 29-33) and `module.exports =` (line 38). All accounted for in candidates.md. |

## Node.js baseline verification (targeted, at d44625a4b80)

| Command | Result |
| --- | --- |
| `git log -1 --format='%H'` (in `$NODEJS_SOURCE`) | d44625a4b80c672215b469906ce583ce7eeeebaf. |
| `rg -n 'require\(' lib/http.js` (head) | HTTP classes re-exported from lib/internal/http/{incoming,server,outgoing,client,agent,common}.js on main; legacy lib/_http_*.js exist as thin re-export shims (confirmed by reading lib/_http_incoming.js head). |
| `rg -n '\buser\b\|remoteUser' lib/internal/http/incoming.js` | NEGATIVE for core-defined `user`/`remoteUser` (only hits: a comment at :105, `kUserAgent` field table :363, 'User-Agent' string :436). |
| `rg -n 'this\.[A-Za-z_$][\w$]*\s*=' lib/internal/http/incoming.js` | IncomingMessage constructor own props (:77-106): socket, httpVersion*, complete, rawHeaders, rawTrailers, joinDuplicateHeaders, aborted, upgrade, url, method, statusCode, statusMessage, client, _consuming, _dumped. No user/remoteUser. |
| `rg -n 'statusCode' lib/internal/http/server.js` | `ServerResponse.prototype.statusCode = 200` at :285 — documented writable default; baseline for C-003. |
| `rg -n 'statusCode\|setHeader\s*[=(]\|\bend\b' lib/internal/http/outgoing.js` | `OutgoingMessage.prototype.setHeader` :813; `OutgoingMessage.prototype.end` :1289 — baselines for C-004. |
| `rg -n 'STATUS_CODES' lib/http.js` | Exported at :54 and :265 — baseline for C-006. |
| `rg -n 'timingSafeEqual\|pseudoRandomBytes\|createHmac' lib/crypto.js` | timingSafeEqual :47/:239; createHmac :173/:201; pseudoRandomBytes :387 (`getRandomBytesAlias`) — baselines for C-009/C-010. |
| `rg -n 'DEP0005\|function Buffer\(' lib/buffer.js` | Deprecated Buffer constructor :317-320, DEP0005 warning :241 — baseline for C-005. |
| `rg -n 'DEP0115\|getRandomBytesAlias' lib/crypto.js` | DEP0115 alias deprecation :309-319 — context for C-010. |
| Initial misses | First checks of `lib/_http_incoming.js` / `lib/_http_server.js` for `this.*`/`statusCode` returned NEGATIVE because main moved implementations to lib/internal/http/; re-exports followed per the skill table. |

## Upstream corroboration (read-only)

| Command / query | Result |
| --- | --- |
| `git log --oneline -n 15` (in `$PACKAGE_ROOT`) | tsscmp introduced at bac1e6a "feat: add timing safe equal comparison"; released in 45decb3 "1.1.0". |
| `git log -n 5 -S 'tsscmp' --oneline -- index.js package.json` | Single commit bac1e6a. |
| `gh api '/advisories?affects=basic-auth-connect'` | GHSA-7p89-p6hx-q4fw / CVE-2024-47178, "callback uses time unsafe string comparison", vulnerable < 1.1.0, first patched 1.1.0. Context only; not a core patch. |
| Code-comment references (tsscmp lib/index.js:5-7,16) | nodejs/node#3043, nodejs/node#3073 (addition of timingSafeEqual to core), jshttp/basic-auth#39 — explain feature detection; not followed further (no patch target). |

## Reproduction

| Command | Result |
| --- | --- |
| `PACKAGE_ROOT=<path> node --no-deprecation repro-no-mutation.js` (Node v24.19.0; script + repro-output.txt beside the report) | All 17 snapshot checks UNCHANGED (http.STATUS_CODES, IncomingMessage/ServerResponse + prototype key sets, statusCode descriptor, setHeader/end, crypto.timingSafeEqual/createHmac/pseudoRandomBytes, Buffer + prototype keys, Module._load/_compile, require.extensions, globalThis own names) across require + 12 middleware invocations covering all three modes. Only writes observed: `user`,`remoteUser` own props on caller-supplied req. Exit 0. |

## Hashes (SHA-256, relative to $PACKAGE_ROOT)

- index.js 25ace225a976a36216ddc70f0a839909cc3e2f05fd2ff07e5dd4b46c39e93a40
- node_modules/tsscmp/lib/index.js 8a48bb471b338cccf04fd9538ff405534c24a3e57ae508f29b5a6ed0bb5536f7
- package.json dc4c98e466624ca8cdcd58f6029bc1ced8f39c38a7abed9fa4499e267eceee47
- node_modules/tsscmp/package.json 4e31b5c503caec63b2e0e2507b69c778a14dc2b42a5d17a30fd694efcfdfe2c0
