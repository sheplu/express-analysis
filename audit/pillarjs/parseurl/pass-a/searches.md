# Search log — parseurl pass A

Scope searched: `$PACKAGE_ROOT/index.js` (sole runtime file; `package.json` `files`
ships only `LICENSE`, `HISTORY.md`, `README.md`, `index.js`; no `main` override, so
the entrypoint resolves to `index.js`; **zero runtime dependencies** — no
`dependencies`/`optionalDependencies`/`peerDependencies` keys, no install scripts).
Tests (`test/`), benchmarks (`benchmark/`), and devDependencies are out of scope per
the audit brief; they are not shipped in the npm artifact.

Tool: `rg -n`, run from `$PACKAGE_ROOT`.

## Skill candidate pattern groups (mandatory six)

| # | Pattern | Scope | Result |
| --- | --- | --- | --- |
| G1 | `require\s*\(\|\bfrom\s*['"]\|\bimport\s*\(\|\bnode:` | index.js | 1 hit: index.js:15 `var url = require('url')` |
| G2 | `\bBuffer\b\|\bprocess\b\|\bglobalThis\b\|\bglobal\b\|\bextends\b\|\binherits\s*\(` | index.js | zero hits |
| G3 | `\.prototype\b\|__proto__\|setPrototypeOf\|definePropert(y\|ies)\|Reflect\.(set\|defineProperty\|setPrototypeOf)\|Object\.assign` | index.js | zero hits |
| G4 | `monkey.?patch\|\bpatch\b\|\bwrap\b\|\bshim\b\|\bpolyfill\b\|\boverride\b` | index.js | zero hits |
| G5 | `require\.cache\|require\.extensions\|Module\._(load\|resolveFilename\|extensions\|compile)\|syncBuiltinESMExports\|registerHooks` | index.js | zero hits |
| G6 | `process\.(binding\|_linkedBinding)\|internalBinding\|['"]_http_\|['"]internal/` | index.js | zero hits |

## Supplementary targeted searches

| Pattern | Scope | Purpose | Result |
| --- | --- | --- | --- |
| `url\.(parse\|Url\|format)\s*=\|Url\.prototype\|Url\[` | index.js | mutation of `url` module exports or `Url.prototype` | zero hits |
| `req\.[A-Za-z_$]+\s*=` | index.js | all writes to the request object | 2 hits: index.js:54 `req._parsedUrl = parsed`; index.js:84 `req._parsedOriginalUrl = parsed` |
| `"main"\|"exports"\|"browser"\|"module"\|"bin"\|"scripts"` | package.json | hidden entrypoints / lifecycle scripts | only `scripts` (dev-only: bench/lint/test); no install hooks |
| `ls *.js` | $PACKAGE_ROOT | other root-level runtime files | index.js only |

## Node.js core baseline searches ($NODEJS_SOURCE @ d44625a4b80, read-only)

Per the skill table: HTTP request → lib/http.js then follow re-exports;
legacy url → lib/url.js. No recursive scan of the Node tree was performed.

| Pattern / command | Scope | Result |
| --- | --- | --- |
| `IncomingMessage` in lib/http.js | lib/http.js | re-exports from `internal/http/incoming` (lib/http.js:33) |
| shim check | lib/_http_incoming.js | re-export shim of `internal/http/incoming` (lib/_http_incoming.js:32) |
| `this\.[A-Za-z_$]+ =` | lib/internal/http/incoming.js | constructor own props: socket, httpVersionMajor/Minor, httpVersion, complete, rawHeaders, rawTrailers, joinDuplicateHeaders, aborted, upgrade, url (line 95 `this.url = ''`), method, statusCode, statusMessage, client, _consuming, _dumped |
| `IncomingMessage\.prototype\.\|ObjectDefineProperty\(IncomingMessage` | lib/internal/http/incoming.js | prototype members: connection, headers, headersDistinct, trailers, trailersDistinct, signal, setTimeout, _read, _destroy, _addHeaderLines, _addHeaderLine, _addHeaderLineDistinct, _dumpAndCloseReadable, _dump |
| `_parsedUrl\|_parsedOriginalUrl\|originalUrl\|\b_raw\b\|\burl\b` | lib/internal/http/incoming.js | only `this.url = ''` (line 95); none of the expando names exist in core |
| `_parsedUrl\|_parsedOriginalUrl\|\b_raw\b` | lib/internal/streams/readable.js, lib/stream.js, lib/events.js, lib/_http_incoming.js (prototype chain of IncomingMessage) | zero hits |
| `^function Url\|this\.[a-zA-Z_]+ =\|^Url\b\|module.exports` | lib/url.js | `Url` constructor (lib/url.js:77-89) own props: protocol, slashes, auth, host, port, hostname, hash, search, query, pathname, path, href; prototype: parse (177), format (634), resolve (724), resolveObject (733), parseHost (1003); `Url` and `parse` publicly exported (lib/url.js:1025+) |
| `\b_raw\b` | lib/url.js | zero hits — `_raw` is not a core-defined Url member |

## Upstream corroboration

| Query | Result |
| --- | --- |
| `gh pr view 7878 --repo nodejs/node-v0.x-archive` | "Add fast path for simple URL parsing" — state CLOSED (never merged into core); parseurl copied the regex approach into its own code (index.js:104 comment), not into core |
| `git log -n 5 --oneline -- index.js` in $PACKAGE_ROOT | recent history is lint/perf/docs; 78806ed "perf: unroll the fast-path RegExp" matches the copied-approach provenance |
