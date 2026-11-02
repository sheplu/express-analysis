# Search log — cookie-parser 1.4.7 patch audit (pass-b)

All package searches ran from `$PACKAGE_ROOT` over exactly the three runtime files
(`index.js`, `node_modules/cookie/index.js`, `node_modules/cookie-signature/index.js`;
`--no-ignore` because node_modules is gitignored). All three files were also read in
full line-by-line before searching. Node.js searches were targeted single-file scans
at `$NODEJS_SOURCE` (commit d44625a4b80), per skill — no recursive core-tree scan.

Note: an initial attempt passed the file list through an unquoted zsh variable and
failed with "No such file or directory" (zsh does not word-split); it produced no
results and was rerun with explicit file arguments. All results below are from the rerun.

## Scope establishment

| Command | Result |
| --- | --- |
| `cat package.json` (all three packages) | versions 1.4.7 / 0.7.2 / 1.0.6; no preinstall/install/postinstall scripts; no `exports` maps; entrypoints = index.js only; cookie-parser `files` ships only index.js |
| `git log -1` in $PACKAGE_ROOT | HEAD = 1f2a3a2037c4efe01605e064e7cc326008be7287 (master, matches provenance) |
| `ls node_modules/` | exactly `cookie`, `cookie-signature` — no shimmer/require-in-the-middle-style helpers |
| `find . -name '*.js' -not -path './.git/*'` | `./index.js`, `./node_modules/cookie/index.js`, `./node_modules/cookie-signature/index.js`, `./test/cookieParser.js` (test = out of scope). Complete runtime inventory confirmed |
| `shasum -a 256` of the three runtime files | d0689887…411b8950 / a88f6d72…4f080e42 / 8d762862…be912963 (full values in report.md) |

## Skill candidate pattern set (rg -n --no-ignore <pattern> <3 files>)

| ID | Pattern | Result |
| --- | --- | --- |
| P1 | `require\s*\(\|\bfrom\s*['"]\|\bimport\s*\(\|\bnode:` | 3 hits: index.js:15 `require('cookie')`, index.js:16 `require('cookie-signature')`, cookie-signature/index.js:5 `require('crypto')` → C-001, C-010 |
| P2 | `\bBuffer\b\|\bprocess\b\|\bglobalThis\b\|\bglobal\b\|\bextends\b\|\binherits\s*\(` | **no hits** (exit 1) |
| P3 | `\.prototype\b\|__proto__\|setPrototypeOf\|definePropert(y\|ies)\|Reflect\.(set\|defineProperty\|setPrototypeOf)\|Object\.assign` | 2 hits: cookie/index.js:23-24 (read-only captures of Object.prototype.toString/hasOwnProperty) → C-008 |
| P4 | `-i monkey.?patch\|\bpatch\b\|\bwrap\b\|\bshim\b\|\bpolyfill\b\|\boverride\b` | **no hits** (exit 1) |
| P5 | `require\.cache\|require\.extensions\|Module\._(load\|resolveFilename\|extensions\|compile)\|syncBuiltinESMExports\|registerHooks` | **no hits** (exit 1) |
| P6 | `process\.(binding\|_linkedBinding)\|internalBinding\|['"]_http_\|['"]internal/` | **no hits** (exit 1) |

## Write census (same 3 files)

| ID | Pattern | Result |
| --- | --- | --- |
| P7 | `(req\|res\|request\|response)\.[A-Za-z_$]+\s*=[^=]` | 7 hits, all in index.js:51-69 (`req.secret`, `req.cookies` x3, `req.signedCookies` x3) → C-003/C-004/C-005. No writes on `res` |
| P8 | `\bdelete\b` | 1 hit: index.js:177 `delete obj[key]` (plain object) → C-006 |
| P9 | `crypto\.[A-Za-z_$]+\s*=[^=]\|timingSafeEqual` | **no hits** (exit 1) — no crypto member reassignment; no timingSafeEqual in cookie-signature@1.0.6 |
| P10 | dotted-path assignments `X.y =` (general) | 16 hits: module.exports/exports writes (C-002/C-007/C-011) + the 7 req.* writes (C-003..C-005). Nothing else |
| P11 | computed writes `\[[^\]]+\]\s*=[^=]` | 3 hits: cookie/index.js:144, index.js:113, index.js:176 — all into library-created plain objects → C-006/C-009 |

## Node.js baseline verification (targeted, $NODEJS_SOURCE @ d44625a4b80)

| Command | Result |
| --- | --- |
| `git log -1` in $NODEJS_SOURCE | d44625a4b80c672215b469906ce583ce7eeeebaf confirmed; src/node_version.h → 28.0.0-pre |
| `rg -n -i "secret\|cookie" lib/_http_incoming.js` | **no hits** — file is now a DEP0199 deprecation shim re-exporting `internal/http/incoming` (read in full) |
| `rg -n -i "secret\|cookie" lib/internal/http/incoming.js` | hits only at lines 394, 397, 419, 438-439, 505, 527-531 — known-header table entries for the `cookie`/`set-cookie` header *names* in `req.headers`; no instance/prototype member named `secret`, `cookies`, or `signedCookies` |
| `rg -n "this\.\w+ =" lib/internal/http/incoming.js` | constructor members: socket, httpVersion*, complete, rawHeaders, rawTrailers, joinDuplicateHeaders, aborted, upgrade, url, method, statusCode, statusMessage, client, _consuming, _dumped — no collision with cookie-parser's added keys |
| `rg -n "IncomingMessage\.prototype\.\w+" lib/internal/http/incoming.js` | setTimeout, _read, _destroy, _addHeaderLines, _addHeaderLine, _addHeaderLineDistinct, _dumpAndCloseReadable, _dump — no collision |

## Upstream corroboration (read-only)

| Query | Result |
| --- | --- |
| `gh api repos/visionmedia/node-cookie-signature/tags` | tags 1.0.1…1.2.2; audited tree pins 1.0.6 |
| `gh api repos/visionmedia/node-cookie-signature/contents/index.js?ref=1.1.0` | unsign uses a direct `crypto.timingSafeEqual(macBuffer, valBuffer)` **call** (Buffer.from/Buffer.alloc) — introduced after 1.0.6; no polyfill |
| `gh api repos/visionmedia/node-cookie-signature/contents/index.js?ref=1.2.0` | line 45 `crypto.timingSafeEqual(expectedBuffer, inputBuffer)` — still a plain call |

## Reproduction

| Command | Result |
| --- | --- |
| `node repro-check.js "$PACKAGE_ROOT"` (Node 24.19.0; script beside this log) | PASS — 13 core-state checkpoints (Object/String/IncomingMessage prototype key sets, http.IncomingMessage/crypto.createHmac/crypto.createHash/Buffer/Module._load/Module._resolveFilename/JSON.parse identities, Module._extensions keys, globalThis key set) identical before require, after require, and after executing the middleware on a real `http.IncomingMessage`; parsed plain/JSON/signed cookies correctly; `secret`/`cookies`/`signedCookies` are own instance properties; prototype untouched |
