# Search log — parseurl pass B

Scope key:
- `$PACKAGE_ROOT` = pillarjs/parseurl @ `97cab2ffdba7bdab88061bd2f415b9dfa193b9d5` (v1.3.3)
- `$NODEJS_SOURCE` = nodejs/node main @ `d44625a4b80c672215b469906ce583ce7eeeebaf`
- Runtime scope = `index.js` only (package.json `files` ships only LICENSE, HISTORY.md, README.md, index.js; no `dependencies` field).

## Skill candidate pattern groups (scoped to runtime file `index.js`)

| # | Pattern | Scope | Result |
| --- | --- | --- | --- |
| G1 | `require\s*\(\|\bfrom\s*['"]\|\bimport\s*\(\|\bnode:` | index.js | 1 hit: index.js:15 `var url = require('url')` (sole core import; reads `url.parse`, `url.Url` at index.js:16-17) |
| G2 | `\bBuffer\b\|\bprocess\b\|\bglobalThis\b\|\bglobal\b\|\bextends\b\|\binherits\s*\(` | index.js | 0 hits |
| G3 | `\.prototype\b\|__proto__\|setPrototypeOf\|definePropert(y\|ies)\|Reflect\.(set\|defineProperty\|setPrototypeOf)\|Object\.assign` | index.js | 0 hits |
| G4 | `monkey.?patch\|\bpatch\b\|\bwrap\b\|\bshim\b\|\bpolyfill\b\|\boverride\b` | index.js | 0 hits |
| G5 | `require\.cache\|require\.extensions\|Module\._(load\|resolveFilename\|extensions\|compile)\|syncBuiltinESMExports\|registerHooks` | index.js | 0 hits |
| G6 | `process\.(binding\|_linkedBinding)\|internalBinding\|['"]_http_\|['"]internal/` | index.js | 0 hits |

## Supplementary searches

| Pattern | Scope | Result |
| --- | --- | --- |
| Combined G3+G4+G5+G6 (`\.prototype\b\|__proto__\|setPrototypeOf\|definePropert(y\|ies)\|Object\.assign\|monkey.?patch\|\bshim\b\|\bpolyfill\b\|require\.cache\|require\.extensions\|Module\._\|process\.(binding\|_linkedBinding)\|internalBinding`) | whole package (`--glob '!node_modules'`, incl. test/ and benchmark/, which are out of runtime scope) | 0 hits |
| Manual read of all assignment sites | index.js (full 158-line read) | Writes found: `module.exports` (:24-25, library's own exports), `parsed._raw` (:52, :82), `req._parsedUrl` (:54), `req._parsedOriginalUrl` (:84), `url.path/href/pathname/query/search` on a freshly constructed `new Url()` or `{}` (:128-139, local variable `url` inside `fastparse`, not the `url` module). No deletes, no descriptor ops, no prototype writes. |

## Core-baseline verification searches ($NODEJS_SOURCE, targeted files only)

| Query | Scope | Result |
| --- | --- | --- |
| `^function Url\|^Url\.prototype\.\|module\.exports\|_raw` | lib/url.js | `Url` constructor at lib/url.js:77 initializes own props protocol, slashes, auth, host, port, hostname, hash, search, query, pathname, path, href (all null). `Url.prototype` members: parse (:177), format (:634), resolve (:724), resolveObject (:733), parseHost (:1003). Exports (lib/url.js:1025) include `Url` and `parse`. **No `_raw` anywhere in lib/url.js.** |
| `_parsedUrl\|_parsedOriginalUrl\|originalUrl` | lib/_http_incoming.js, lib/url.js, lib/http.js | 0 hits |
| `_parsedUrl\|_parsedOriginalUrl\|originalUrl\|_raw\b` | lib/internal/http/incoming.js | 0 hits |
| `this\.[A-Za-z_$]+ =\|IncomingMessage\.prototype\|defineProperty\(IncomingMessage` | lib/internal/http/incoming.js | IncomingMessage own props (constructor): socket, httpVersionMajor/Minor, httpVersion, complete, rawHeaders, rawTrailers, joinDuplicateHeaders, aborted, upgrade, url, method, statusCode, statusMessage, client, _consuming, _dumped (+ private Symbols). Prototype: connection, headers, headersDistinct, trailers, trailersDistinct, signal (accessors); setTimeout, _read, _destroy, _addHeaderLines, _addHeaderLine, _addHeaderLineDistinct, _dumpAndCloseReadable, _dump (+ symbol methods). None collide with `_parsedUrl`/`_parsedOriginalUrl`. |
| `IncomingMessage` | lib/http.js | lib/http.js:33 imports from `internal/http/incoming` (implementation moved there on main; lib/_http_incoming.js is now a deprecated re-export shim, DEP0199). |
| `simplePathPattern` | lib/url.js | lib/url.js:101 and :258 — core's own fast path for simple paths (same technique parseurl's index.js:104 comment cites from joyent/node#7878; merged into core long ago). Supporting context, not a patch. |

## History / upstream corroboration

| Query | Result |
| --- | --- |
| `git log --oneline -n 8 -- index.js` ($PACKAGE_ROOT) | Lint/perf/docs commits only (e.g. "perf: unroll the fast-path RegExp", "Fix Node.js 0.8 return value inconsistencies"). No patching-related history. |
| HISTORY.md (head) | v1.3.3 2019-04-15 "Fix Node.js 0.8 return value inconsistencies"; perf items. Nothing patch-related. |
| Code comment index.js:104 | References https://github.com/joyent/node/pull/7878 — parseurl copies that merged core regexp technique locally; it does not modify core. |

## Runtime reproduction

See `repro/repro.js` and `repro/results.json`. Command:
`node repro/repro.js "$PACKAGE_ROOT"` on Node v24.19.0. Zero identity/key diffs on all monitored core surfaces (details in report).
