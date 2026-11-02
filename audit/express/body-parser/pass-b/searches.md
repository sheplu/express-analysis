# Search log: body-parser 2.4.0 patch audit (pass B)

All commands run from `$PACKAGE_ROOT` unless noted. Node source greps run against
`$NODEJS_SOURCE` (commit d44625a4b80c672215b469906ce583ce7eeeebaf). `rg` used with
`--no-ignore` so files inside node_modules are not skipped; test/dist directories
filtered where noted. Negative results are recorded explicitly.

## Scope establishment

1. `ls -la && cat package.json && git log -1 --format='%H %ci' && ls lib lib/types`
   -> body-parser@2.4.0 at 151a0d9e72682662fd32b439da4693b4459a70b3; runtime files: index.js, lib/read.js, lib/utils.js, lib/types/{json,raw,text,urlencoded}.js (806 lines total, all read in full). exports map covers ./json ./raw ./text ./urlencoded + lib/* subpaths.
2. `ls node_modules` + per-package `node -e "...package.json version/main"`
   -> 37 top-level runtime packages with versions and entrypoints (listed in report coverage section).
3. `find node_modules -mindepth 2 -maxdepth 4 -name package.json -path '*node_modules*'`
   -> nested: node_modules/type-is/node_modules/{mime-types@3.0.2, mime-db@1.54.0}. No other nesting.
4. `grep -l '"\(pre\|post\)install"' node_modules/*/package.json node_modules/type-is/node_modules/*/package.json`
   -> NEGATIVE: no install scripts in any runtime dependency.

## Skill candidate pattern set over body-parser own code (index.js, lib/)

5. `rg -n "require\s*\(|\bfrom\s*['\"]|\bimport\s*\(|\bnode:" index.js lib/`
   -> only require() lines (deps: http-errors, raw-body, iconv-lite, on-finished, node:zlib, type-is, content-type, debug, qs, bytes). No dynamic import, no node: beyond zlib.
6. `rg -n "\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(" index.js lib/`
   -> NEGATIVE: zero hits.
7. `rg -n "\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign" index.js lib/`
   -> NEGATIVE: zero hits.
8. `rg -n "monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b" index.js lib/`
   -> NEGATIVE: zero hits.
9. `rg -n "require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks" index.js lib/`
   -> NEGATIVE: zero hits.
10. `rg -n "process\.(binding|_linkedBinding)|internalBinding|['\"]_http_|['\"]internal/" index.js lib/`
    -> NEGATIVE: zero hits.
    (Manual full read of all 7 files additionally surfaced C-001..C-004: req.body writes, stream API calls, SyntaxError instance normalization, zlib feature check.)

## Dependency tree sweeps (node_modules/, recursive, includes nested type-is deps)

11. `rg -n --no-ignore -g '*.js' -g '!*/test/*' -g '!*/tests/*' "\.prototype\s*=[^=]|\.prototype\.[A-Za-z_$]+\s*=[^=]|__proto__\s*[\]=]|setPrototypeOf|Reflect\.(set|defineProperty|setPrototypeOf)" node_modules/`
    -> hits: setprototypeof/index.js:3,6; dunder-proto/{get.js:9,set.js:10,32}; http-errors/index.js:139,163-165,208,232-234; content-type/dist/index.js:29; inherits/inherits_browser.js; function-bind/implementation.js:78-80; iconv-lite codecs/streams/bom-handling (own prototypes); qs/dist/qs.js (bundled copies of dunder-proto/function-bind/object-inspect/get-intrinsic); safer-buffer/safer.js:25; object-inspect/index.js:39 (read). All triaged -> C-006(no, that is on-finished)/C-009..C-014, C-017..C-021. No core prototype written.
12. `rg -n --no-ignore -g '*.js' -g '!*/test/*' "Object\.definePropert|definePropert(y|ies)\s*\(" node_modules/`
    -> hits: get-intrinsic/index.js:141 (map entry); debug/src/common.js:122; qs/lib/utils.js:89; es-define-property/index.js:4-7 (alias + feature test); http-errors/index.js:142,150,211,219,249; depd/index.js:62,485,496-521; content-type/dist/index.js:7 (__esModule marker); qs/dist/qs.js (bundle). All targets are library-owned objects/instances -> C-011, C-017, C-020, C-022, C-023.
13. `rg -n --no-ignore -g '*.js' "require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks|require-in-the-middle|shimmer" node_modules/` (tests filtered)
    -> NEGATIVE: zero hits. No module-loading interception anywhere in the tree.
14. `rg -n --no-ignore -g '*.js' "process\.(binding|_linkedBinding)|internalBinding|['\"]_http_|['\"]internal/" node_modules/` (tests filtered)
    -> single hit: safer-buffer/safer.js:61 `process.binding('buffer')` READ in try/catch -> C-012.
15. `rg -ni --no-ignore -g '*.js' "monkey.?patch|\bpolyfill\b|\bshim\b" node_modules/` (tests/dist filtered)
    -> only a comment in inherits/inherits_browser.js:17 ("old school shim for old browsers"). NEGATIVE for actual patch code.
16. `rg -n --no-ignore "extend-node|extendNode|Buffer\.prototype" node_modules/iconv-lite/`
    -> NEGATIVE: the historical iconv-lite Buffer.prototype patching (extend-node.js, <=0.4.x) does not exist in 0.7.3.
17. `rg -n --no-ignore -g '*.js' "globalThis\.[A-Za-z_$]+\s*=[^=]|global\.[A-Za-z_$]+\s*=[^=]|process\.[A-Za-z_$]+\s*=[^=]" node_modules/` (tests filtered)
    -> NEGATIVE: zero hits (no writes to globalThis/global/process top-level properties).
18. `rg -n --no-ignore -g '*.js' "prepareStackTrace|stackTraceLimit|captureStackTrace" node_modules/` (tests/dist filtered)
    -> depd/index.js:382-396 (WRITES at 386,387; restores at 395,396) -> C-005/F-001; http-errors/index.js:89,136,205 Error.captureStackTrace (documented static API call, no write). No other package touches Error hooks.
19. `rg -n --no-ignore -g '*.js' "process\.env\.[A-Za-z_]+\s*=[^=]|delete process\.env" node_modules/` (tests filtered)
    -> debug/src/node.js:205,209 only -> C-008.
20. `rg -n --no-ignore -g '*.js' "Object\.assign\s*\(" node_modules/` (tests/dist filtered)
    -> NEGATIVE: zero hits in runtime files.
21. `rg -n --no-ignore -g '*.js' "\b(zlib|http|https|stream|util|buffer|fs|net|tls|tty|crypto|events|path|querystring|async_hooks|asyncHooks|Stream|Transform|EventEmitter|IncomingMessage|ServerResponse)\.[A-Za-z_$]+\s*=[^=]" node_modules/ index.js lib/` (tests/dist filtered)
    -> NEGATIVE: zero hits — no assignment onto any core module object or core constructor identifier.

## Full-file reads of dependency entry/init paths

22. Read in full: setprototypeof/index.js; dunder-proto/{get,set}.js; unpipe/index.js; safer-buffer/safer.js; http-errors/index.js; depd/index.js; raw-body/index.js; on-finished/index.js; ee-first/index.js; iconv-lite/lib/index.js + lib/streams.js (head); debug/src/{index,node(grep),common}.js; qs/lib/index.js + utils.js (setProperty region); call-bind-apply-helpers/index.js; function-bind/index.js; get-proto/index.js; object-inspect/util.inspect.js; side-channel/index.js; side-channel-weakmap/index.js (head); es-errors/index.js; es-object-atoms/index.js; gopd/index.js; has-symbols/index.js; call-bound/index.js; statuses/index.js (head); toidentifier/index.js; inherits/inherits.js; mime-types/index.js (head).
    Spot greps (NEGATIVE for prototype/Object./global/process writes): bytes/index.js, ms/index.js, media-typer/index.js, type-is/index.js, mime-db/index.js, content-type/dist/index.js.
23. `grep -n "deprecate" node_modules/http-errors/index.js`
    -> only `require('depd')('http-errors')` (:15) and `deprecate('non-error status code...')` (:73). `.function`/`.property` never used -> C-022 not activated.
24. `tail node_modules/debug/src/common.js`
    -> `createDebug.enable(createDebug.load())` at src/common.js:287 confirms load-time env write path (C-008).

## Node.js baseline verification (targeted; no recursive scans)

25. `grep -n "assignSocket" $NODEJS_SOURCE/lib/_http_server.js` -> no definition (re-export only; `require('internal/http/server')` at :34). Followed to:
26. `grep -n "assignSocket" $NODEJS_SOURCE/lib/internal/http/server.js` + `sed -n 305,330p`
    -> ServerResponse.prototype.assignSocket defined at :312 (baseline for C-006).
27. `grep -n "this.complete|this.socket|body" $NODEJS_SOURCE/lib/internal/http/incoming.js`
    -> `socket` (:77), `complete` (:82); NEGATIVE for any core `body` property (baseline for C-001; also confirms isFinished guard analysis for C-006).
28. `grep -n "^Readable.prototype.(pipe|unpipe|resume)" $NODEJS_SOURCE/lib/internal/streams/readable.js`
    -> pipe :978, unpipe :1180, resume :1327 (public API baselines for C-002/C-015); `this._readableState = new ReadableState(...)` at :363 (C-016).
29. `grep -rn "prepareStackTrace" $NODEJS_SOURCE/lib/internal/errors.js` + `sed -n 85,175p`
    -> defaultPrepareStackTrace :95-111; prepareStackTraceCallback :136-161 explicitly invokes a user-assigned `Error.prepareStackTrace` ("Polyfill of V8's Error.prepareStackTrace API") — baseline/contract for F-001.
30. `grep -n "_transform|_flush" $NODEJS_SOURCE/lib/internal/streams/transform.js`
    -> default `Transform.prototype._transform` throws ERR_METHOD_NOT_IMPLEMENTED (:162): subclass implementation is the documented contract (C-013).
31. `grep -n "createInflate|createGunzip|createBrotliDecompress|createZstdDecompress" $NODEJS_SOURCE/lib/zlib.js`
    -> all public factory exports (:1345-1354) (C-004/C-002).

## Upstream corroboration (read-only)

32. `gh search issues --repo dougwilson/nodejs-depd "prepareStackTrace" --limit 5`
    -> #32 closed "Why is this library overwriting Error type?"; #36 closed "Incompatible with --enable-source-maps node 12 option"; #50 open "callSite.getFileName is not a function". Cited in F-001.

## Reproduction

33. `node repro-error-hook-write.js "$PACKAGE_ROOT"` (script beside this log; Node v24.19.0)
    -> Output:
       write 1: prepareStackTrace <- function prepareObjectStackTrace | Error.stackTraceLimit at that moment: 3
       write 2: prepareStackTrace <- undefined | Error.stackTraceLimit at that moment: 10
       Error.prepareStackTrace after require: undefined
       Error.stackTraceLimit after require: 3 (was set to 3 before require)
    Confirms F-001 write + restore at require time. (First attempt trapped Error.stackTraceLimit with an accessor and broke V8 stack capture — V8 reads it via a data-property fast path — so the final script observes it via snapshots inside the prepareStackTrace trap.)
