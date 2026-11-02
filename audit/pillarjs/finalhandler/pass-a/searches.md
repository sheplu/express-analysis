# Search log — finalhandler patch audit (PASS A)

All searches run with `rg -n --no-ignore` from `$PACKAGE_ROOT` over the exact
runtime scope (shipped entrypoints and resolved runtime dependency sources);
nested dev/test/doc files excluded by explicit file listing.

Scope file set (`$SCOPE`):

```
index.js
node_modules/debug/src/            (index.js, node.js, common.js, browser.js)
node_modules/ee-first/index.js
node_modules/encodeurl/index.js
node_modules/escape-html/index.js
node_modules/ms/index.js
node_modules/on-finished/index.js
node_modules/parseurl/index.js
node_modules/statuses/index.js
```

(`statuses/codes.json` is data-only and was read separately; it contains no code.)

## Group 1 — core imports / re-exports

Pattern: `require\s*\(|\bfrom\s*['"]|\bimport\s*\(|\bnode:`

HITS (all accounted for):
- index.js:14-19 — requires of the six declared deps only; no core module imported by finalhandler itself (uses globals `process`, `Buffer`, `setImmediate` only).
- node_modules/on-finished/index.js:24 `require('ee-first')`; :208 `require('async_hooks')` (try/catch, used read-only via `AsyncResource`).
- node_modules/parseurl/index.js:15 `require('url')` (uses `url.parse`, `url.Url` read-only; constructs fresh `Url` instances).
- node_modules/debug/src/index.js:7,9 conditional `./browser.js` / `./node.js`; node.js:5-6 `require('tty')`, `require('util')`; node.js:32 `require('supports-color')` in try/catch (NOT installed in resolved tree — branch inert); common.js:14 `require('ms')`.
- node_modules/statuses/index.js:15 `require('./codes.json')` (own data).
- ee-first, encodeurl, escape-html, ms: no imports at all.

No `node:` specifiers, no dynamic `import()`, no ESM.

## Group 2 — globals / inheritance

Pattern: `\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(`

HITS:
- index.js:73 `process.env.NODE_ENV` (read); :274 `Buffer.byteLength` (read-only static call).
- on-finished/index.js:34 `process.nextTick` fallback (read/call only).
- debug/src/node.js:124,136 `process.env` key scan at import (read); :158 `tty.isatty(process.stderr.fd)` (read); :194 `process.stderr.write` (documented stream write); :205 `process.env.DEBUG = namespaces`; :209 `delete process.env.DEBUG` (see candidate C-005); :221 read.
- debug/src/browser.js:229-230 `process.env.DEBUG` read (browser branch, not loaded in Node).
- debug/src/index.js:6 `process.type` / `process.browser` / `process.__nwjs` reads (environment detection).

No `extends`, no `util.inherits`, no `global`/`globalThis` writes anywhere in scope.

## Group 3 — prototype / descriptor mutation

Pattern: `\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign`

HITS:
- statuses/index.js:96,109 `Object.prototype.hasOwnProperty.call` (read-only safe lookup).
- on-finished/index.js:181 comment "Patch ServerResponse.prototype.assignSocket for node.js 0.8" (lead for C-001; the code mutates an instance, not the prototype).
- debug/src/common.js:122 `Object.defineProperty(debug, 'enabled', ...)` — target is the library-created `debug` function instance, not a core object.

ZERO hits for `__proto__`, `setPrototypeOf`, `defineProperties`, `Reflect.*`, `Object.assign` on core objects.

## Group 4 — patch / wrap / shim vocabulary

Pattern (case-insensitive): `monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b`

HITS (all in on-finished/index.js): :53 `wrap(listener)` (AsyncResource binding of the library's own callback); :129,:188 istanbul comments "node.js 0.8 patch"; :181 jsdoc for patchAssignSocket; :215,:220 `wrap` helper jsdoc/definition. All resolved under C-001/C-011.

ZERO hits in finalhandler index.js, debug, parseurl, statuses, ms, ee-first, encodeurl, escape-html.

## Group 5 — module loading interception

Pattern: `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks`

ZERO hits in the entire scope.

## Group 6 — bindings / internals

Pattern: `process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/`

ZERO hits in the entire scope.

## Supplemental sweep — assignments to members of core-backed objects

Pattern: `(req|res|msg|socket)\.[A-Za-z_$]+\s*=[^=]`

HITS:
- parseurl/index.js:54 `req._parsedUrl = parsed`; :84 `req._parsedOriginalUrl = parsed` → C-002.
- on-finished/index.js:147 `msg.__onFinished = createListener(msg)`; :164 `msg.__onFinished = null` → C-003.
- on-finished/index.js:195 `res.assignSocket = function _assignSocket (socket)` → C-001.
- index.js:250 `res.statusCode = status`; :253 `res.statusMessage = statuses.message[status]` → C-004.

(parseurl/index.js:132-138 assigns `url.path/href/pathname/query/search` on a freshly constructed `new Url()` instance owned by the library — covered under C-012, not a core-backed object mutation.)

## Node.js core verification lookups ($NODEJS_SOURCE, read-only, targeted)

- `rg -n "assignSocket" lib/internal/http/server.js` → definition at lib/internal/http/server.js:312 (`this.emit('socket', socket)` inside it). Classic `lib/_http_server.js` is a deprecated re-export (DEP0199) at this ref.
- `rg -n "this\[kSocket\]|this\.socket\s*=" lib/internal/http/outgoing.js` → ctor init `this[kSocket] = null` (outgoing.js:187) behind a `socket` accessor.
- `git show v18.0.0:lib/_http_outgoing.js | grep "this.socket"` → `this.socket = null;` (line 134). `git show v22.0.0:lib/_http_outgoing.js` → `this[kSocket] = null` (line 150). Confirms `socket === null` (never `undefined`) on fresh OutgoingMessage across the supported range (engines >= 18).
- `rg -n "function IncomingMessage|this\.socket" lib/internal/http/incoming.js` → ctor sets `this.socket = socket` (incoming.js:77); server requests always receive a socket at construction.
- `rg -n "_parsedUrl|_parsedOriginalUrl|__onFinished" lib/internal/http/{incoming,outgoing,server}.js lib/_http_{incoming,outgoing,server}.js` → ZERO hits (expandos collide with nothing in core).
- `rg -n "setHeader = |removeHeader = " lib/internal/http/outgoing.js` → public methods at outgoing.js:813 / :973.
- `rg -n "statusCode|statusMessage" lib/internal/http/server.js` → prototype defaults `ServerResponse.prototype.statusCode = 200` / `statusMessage = undefined` (server.js:285-286); instance assignment is the documented usage.
- `rg -n "Socket\.prototype\.destroy|_destroy" lib/net.js` → net defines `_destroy` hook (net.js:1168); public `destroy()` inherited from streams — documented API.

## Upstream corroboration queries (gh, bounded)

- `gh api repos/jshttp/on-finished/commits?path=index.js` → history list; `patchAssignSocket` introduced by commit 2792e5da141371488dc13191782dfb4986c20b54 "Fix handling of pipelined requests" (fixes jshttp/on-finished#10).
- `gh api search/issues?q=repo:jshttp/on-finished+assignSocket` → issue #10 "onFinished(res) may trigger early" (closed) — Node 0.8 pipelining; motivation for the branch.
- `gh api repos/jshttp/on-finished/releases` → v2.4.2 tag sha 9a73f9c1c0b7a17c84b7d68ac5212b11a272cd6a (matches installed version).
