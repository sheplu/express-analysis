# Search log: errorhandler 1.5.2 patch audit (pass B)

All package searches run from `$PACKAGE_ROOT`; Node.js searches from `$NODEJS_SOURCE`
(commit `d44625a4b80c672215b469906ce583ce7eeeebaf`). `$RUNTIME_FILES` denotes the full
runtime set: `index.js`, `node_modules/accepts/index.js`, `node_modules/escape-html/index.js`,
`node_modules/mime-db/index.js`, `node_modules/mime-types/index.js`,
`node_modules/negotiator/index.js`, `node_modules/negotiator/lib/{charset,encoding,language,mediaType}.js`.
`--no-ignore` used because the target set includes files under `node_modules/`.

## Scope establishment

1. `ls -la && cat package.json && git log -1 --format='%H %s'`
   -> package errorhandler 1.5.2 at commit 1922d04b78ed575ace5499b3d6f5591f2325f70b; shipped files = `index.js`, `public/`, `LICENSE`; runtime deps accepts ~1.3.8, escape-html ~1.0.3; no install scripts.
2. `node -e '...'` metadata dump per dependency package.json (accepts, escape-html, mime-db, mime-types, negotiator)
   -> resolved versions 1.3.8 / 1.0.3 / 1.52.0 / 2.1.35 / 0.6.3; all `main: index.js`; no `exports` maps; **no preinstall/install/postinstall scripts anywhere** (negative).
3. `find node_modules/<pkg> -name '*.js' -o -name '*.json'` per dependency (excluding nested node_modules)
   -> 9 dependency runtime files total (listed above) + `mime-db/db.json`; no hidden/bundled/dist entrypoints.
4. Full reads: `index.js` (198 lines), `accepts/index.js` (238), `negotiator/index.js` (82), `escape-html/index.js` (78), `mime-db/index.js` (12), `mime-types/index.js` (188). Negotiator lib files covered by structural scan (see S5/S6) plus all pattern sweeps.

## Skill candidate pattern set (P1-P6) over $RUNTIME_FILES

P1 `rg -n --no-ignore -e 'require\s*\(|\bfrom\s*['"'"']|\bimport\s*\(|\bnode:' $RUNTIME_FILES`
   -> 14 hits, all static `require(...)` of: accepts, escape-html, fs, path, util (errorhandler); negotiator, mime-types (accepts); ./lib/* (negotiator); mime-db, path (mime-types); ./db.json (mime-db). No dynamic import, no `node:` specifiers, no computed module names. All imports inventoried; none reassigned.

P2 `rg -n --no-ignore -e '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(' $RUNTIME_FILES`
   -> 2 hits, both index.js: line 38 `process.nextTick` call inside `defer` fallback (C-001); line 67 `process.env.NODE_ENV` read (C-002). **No Buffer, globalThis, global, extends, or inherits anywhere** (negative for core subclassing).

P3 `rg -n --no-ignore -e '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign' $RUNTIME_FILES`
   -> index.js:33 `Object.prototype.toString` read (C-003); accepts/index.js:82-195 `Accepts.prototype.*` (C-012); negotiator/index.js:38-82 `Negotiator.prototype.*` (C-014). **Zero hits for __proto__, setPrototypeOf, defineProperty/ies, Reflect.*, Object.assign** (negative).

P4 `rg -n --no-ignore -e 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b' $RUNTIME_FILES`
   -> 1 hit: index.js:156 comment "framework authors may override this value" (refers to library-owned `exports.title`, C-010). No patching vocabulary in code (negative).

P5 `rg -n --no-ignore -e 'require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks' $RUNTIME_FILES`
   -> **0 hits** (negative: no module-loading interception).

P6 `rg -n --no-ignore -e 'process\.(binding|_linkedBinding)|internalBinding|['"'"']_http_|['"'"']internal/' $RUNTIME_FILES`
   -> **0 hits** (negative: no bindings/core-internal requires).

## Supplementary write-pattern sweeps (S1-S6) over $RUNTIME_FILES

S1 `rg -n --no-ignore -e '\b(req|res|request|response|socket|err)\s*(\.|\[)[^=]*=[^=]' $RUNTIME_FILES`
   -> 6 hits, all index.js: statusCode assignments (89, 94, 99 -> C-004) and setHeader calls matched by the pattern (118, 138, 145, 149 -> C-007). **No dependency writes to req/res/request/response/socket/err** (negative for accepts/negotiator/mime-*/escape-html).

S2 `rg -n --no-ignore -e '\bdelete\s' $RUNTIME_FILES`
   -> **0 hits** (negative).

S3 `rg -n --no-ignore -e '(JSON|Math|Date|RegExp|String|Number|Array|Object|Function|Error|console|setImmediate|setTimeout|setInterval|queueMicrotask)\s*(\.|\[)...=[^=]' $RUNTIME_FILES`
   -> **0 hits** (negative: no builtin-global property writes).

S4 `rg -n --no-ignore -e 'headers\s*(\.|\[)[^=]*=[^=]|writeHead|setHeader|_header' $RUNTIME_FILES`
   -> index.js only: `res._header` read (109 -> C-005) and setHeader calls (118, 138, 145, 149). No header-object writes in any dependency (negative).

S5 `rg -n --no-ignore -e 'require|process|global|prototype' negotiator/lib/{charset,encoding,language,mediaType}.js`
   -> **0 hits** — the four parser files are fully self-contained (negative).

S6 structural scan `rg -n -e '^function|^module\.exports|=[^=]'` over negotiator lib files
   -> only local-variable/array writes inside parsers (e.g. charset.js:38 `accepts[j++] = charset`, charset.js:43 `accepts.length = j`) and own `module.exports` (C-020).

## Node.js baseline verification (targeted, per skill table)

N1 `rg -n 'require|ServerResponse' lib/http.js` (head) -> HTTP internals re-exported from `lib/internal/http/*` at this ref (`lib/_http_server.js`/`lib/_http_outgoing.js` are legacy-shim files).
N2 `rg -n 'statusCode' lib/internal/http/server.js` -> line 285 `ServerResponse.prototype.statusCode = 200;` (prototype default; instance assignment is the documented contract). Used for C-004.
N3 `rg -n '_header' lib/internal/http/outgoing.js` -> line 188 `this._header = null;` (instance init); line 1011 `get: function() { return !!this._header; }` (`headersSent` getter). Used for C-005.
N4 `rg -n '^### \x60response.statusCode\x60' doc/api/http.md` -> documented at line 2446.
N5 `rg -n '_header' doc/api/deprecations.md` -> DEP0066 covers `_headers`/`_headerNames` only; the `_header` string read by errorhandler is undocumented-internal but not that deprecation. 
No recursive scan of the Node tree was performed; only the five files above were read.

## Upstream corroboration (read-only)

U1 `gh search issues --repo expressjs/errorhandler "headersSent OR _header"` -> [] (no results).
U2 `gh search prs --repo expressjs/errorhandler "headersSent"` -> [] (no results).
U3 `git log -n 10 -S '_header' --oneline -- index.js` (in $PACKAGE_ROOT) -> single commit `8c95711` "Do not respond after headers sent".
U4 `git show 8c95711` -> 2014 change adding `if (res._header) return;` + tests; confirms read-only private-API usage since introduction.

## Runtime reproduction

R1 `node repro-check.js "$PACKAGE_ROOT"` (script beside the report; Node v24.19.0, exit 0)
   -> "after require(errorhandler): no core surface changed"
   -> "error object own keys unchanged after middleware: true"
   -> "after invoking middleware (html/json/text): no core surface changed"
   Surfaces compared by identity/own-key set: http.ServerResponse.prototype.{setHeader,end,writeHead,statusCode default}, http.IncomingMessage.prototype keys, Object.prototype keys, Error.prototype keys, global.setImmediate, process.nextTick, fs.readFileSync, util.inspect, Module._load, Module._resolveFilename, require.extensions keys, JSON.stringify, console.error.

## Provenance hashes

`shasum -a 256` over all runtime files + public assets + db.json — recorded in report.md.
