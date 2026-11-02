# Search log — pass A — router (pillarjs/router)

Scope for all candidate searches (the audited runtime tree, nested deps excluded —
there are none; tests/docs/types excluded):

```
$PACKAGE_ROOT/index.js
$PACKAGE_ROOT/lib/{layer,param,route,symbols,tracing}.js
$PACKAGE_ROOT/node_modules/debug/src/{index,node,common,browser}.js
$PACKAGE_ROOT/node_modules/depd/index.js
$PACKAGE_ROOT/node_modules/depd/lib/browser/index.js
$PACKAGE_ROOT/node_modules/is-promise/index.js, index.mjs
$PACKAGE_ROOT/node_modules/ms/index.js
$PACKAGE_ROOT/node_modules/parseurl/index.js
$PACKAGE_ROOT/node_modules/path-to-regexp/dist/index.js
```

All commands run from `$PACKAGE_ROOT` with `rg -n --no-ignore -g '!*.md' <pattern> <scope>`
(`--no-ignore` so node_modules is scanned).

## Skill group 1 — module imports

Pattern: `require\s*\(|\bfrom\s*['"]|\bimport\s*\(|\bnode:`

Hits (complete core-module import inventory):
- router: `node:http` (METHODS only; index.js:19, lib/route.js:17), `node:diagnostics_channel` (lib/tracing.js:8). Rest are package/local requires.
- depd: `require('path').relative` (index.js:11).
- debug: `tty`, `util` (src/node.js:5-6); optional `require('supports-color')` in try/catch (src/node.js:32) — NOT installed in this tree, branch dead.
- parseurl: `require('url')` → `url.parse`, `url.Url` (index.js:15-17).
- ms, is-promise, path-to-regexp: no core imports.
- No dynamic `import()`, no computed require targets anywhere in scope.

## Skill group 2 — globals / inheritance

Pattern: `\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(`

Hits:
- index.js:750 `Buffer.byteLength(allow)` — read-only use of global Buffer.
- depd/index.js:23,154,159,170,175,186,251,256,260 — process reads (cwd, flags, env) +
  `process.emit('deprecation', err)` (emitting a library event on process, supported
  EventEmitter API) + `process.stderr.write` (public stream API).
- debug/src/node.js:124,136,158,194,205,209,221 — process.env reads, stderr write,
  and the save() write/delete of `process.env.DEBUG` (see candidates C-015).
- debug/src/index.js:6, browser.js:119,229 — environment detection reads only.
- path-to-regexp/dist/index.js:39 `class PathError extends TypeError` — subclassing a
  JS built-in (allowed inheritance, no mutation); :257,260,274 local function named
  `process` (lexical shadowing, not the global).
- No `globalThis`/`global` writes, no `util.inherits`, nothing extends a Node core class.

## Skill group 3 — prototype / descriptor mutation

Pattern: `\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign`

Hits:
- index.js:29-30, lib/route.js:24-25 — reads of `Array.prototype.slice/flat` (aliasing, no write).
- index.js:65 `Object.setPrototypeOf(router, this)` — target is the library-created
  `router` closure function (C-001).
- index.js:81 `Router.prototype = function () {}` — library-owned constructor (C-002).
- index.js:116,150,376,439,473,502; lib/route.js:54,77,104,198,223; lib/layer.js:110,157,265 —
  method definitions on the library's own `Router.prototype` / `Route.prototype` /
  `Layer.prototype`.
- index.js:577,581,607 `Object.assign` — onto fresh `{}` copies (mergeParams).
- depd/index.js:62,485 `Object.defineProperty(obj, prop, ...)` — only inside
  `wrapproperty`/`convertDataDescriptorToAccessor`, never called by router (C-013);
  :496-535 defineProperty on depd's own freshly created DeprecationError (C-014).
- debug/src/common.js:122 `Object.defineProperty(debug, 'enabled', ...)` — on debug's
  own instance function.
- path-to-regexp/dist/index.js:2 `Object.defineProperty(exports, "__esModule", ...)` —
  own exports object (C-020).
- No `__proto__`, no `Reflect.*` mutation, no write to any core prototype.

## Skill group 4 — patch/wrap/shim vocabulary

Pattern: `monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b`

Hits:
- index.js:180,776 — router's internal `wrap(old, fn)` composes the router-owned `done`
  callback for OPTIONS handling; wraps a library callback, not a core function.
- depd/index.js:469,477 — comments in wrapproperty (dormant, see C-013).
- No other hits. Zero monkeypatch/shim/polyfill vocabulary.

## Skill group 5 — module loading interception

Pattern: `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks`

Zero hits in the entire scope (exit 1).

## Skill group 6 — bindings / internals

Pattern: `process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/`

Zero hits in the entire scope (exit 1).

## Supplemental searches

- `prepareStackTrace|stackTraceLimit|captureStackTrace|process\.env\.[A-Z_]+\s*=|delete process\.env`
  → depd/index.js:382-396 (getStack swap/restore → F-001/C-012);
  debug/src/node.js:205,209 (save() env write → C-015). No other hits.
- `\beval\s*\(|new Function` → depd/index.js:425 only (inside `wrapfunction`, never
  called by router — C-013).
- `res\.[A-Za-z_]+` over index.js + lib/*.js → only index.js:749-753
  (`res.setHeader` x4, `res.end`) plus a doc comment. No `res.statusCode`,
  `res.writeHead`, or method reassignment anywhere; res methods are invoked, never
  replaced (C-006).
- `deprecate\.(function|property)` over index.js + lib/*.js → zero hits
  (confirms depd's object-patching helpers are dormant on this chain).
- `localStorage|document\.|window\.` in debug/src/browser.js → browser-only globals;
  file unreachable in Node (loaded only when `process.type === 'renderer'`,
  `process.browser`, or `__nwjs` — debug/src/index.js:6).

## Node.js core baseline lookups ($NODEJS_SOURCE, read-only, targeted files only)

- `rg -n "this\.url|this\.method|baseUrl|originalUrl|_parsedUrl|this\.params|this\.next\b|this\.route\b" lib/internal/http/incoming.js`
  → `this.url = ''` (incoming.js:95), `this.method = null` (:96). **No** baseUrl,
  originalUrl, params, next, route, or _parsedUrl properties exist in core.
- `rg -n "\.url = |incoming\.url" lib/internal/http/server.js lib/internal/http/common.js`
  → common.js:105 `incoming.url = url` (parser assigns request URL). Confirms
  `req.url` is a core-assigned plain data property on each IncomingMessage instance.
- `rg -n "METHODS" lib/http.js` → http.js:264 `METHODS: methods.toSorted()` — public
  export; router only reads it.
- `rg -n "OutgoingMessage.prototype.setHeader|end\s*\(chunk" lib/internal/http/outgoing.js`
  → outgoing.js:813 `setHeader`, :1289 `end` — public documented methods router calls.
- `rg -n "tracingChannel" lib/diagnostics_channel.js` → :697 definition, :715 export —
  public API used by lib/tracing.js:11.
- `rg -n "prepareStackTrace" lib/internal/errors.js` → :145-150 Node core itself reads
  `globalThis.Error.prepareStackTrace` and (on this ref/runtime) installs a default
  `ErrorPrepareStackTrace`; relevant to F-001 scope (the hook depd swaps is consulted
  by core error formatting during the swap window).
- Note: at $NODEJS_SOURCE ref d44625a4b80 the HTTP implementation lives in
  `lib/internal/http/{incoming,outgoing,server,common}.js`; the legacy
  `lib/_http_*.js` files re-export from there.
