# Search log — express 5.3.0 patch audit (pass B)

All commands run from `$PACKAGE_ROOT` (or `$PACKAGE_ROOT/node_modules` /
`$NODEJS_SOURCE` as noted). Dependency sweeps excluded nested
`**/node_modules/**`, tests, and markdown; `--no-ignore` used inside the
installed tree. Node baseline reads were targeted files only (never a recursive
scan of the Node tree).

## Scope establishment

1. `cat package.json` — express 5.3.0; 28 declared runtime deps; `files`: index.js, lib/, LICENSE, Readme.md; engines node >= 18.
2. `find lib -type f` + `git log -1` — 6 lib files + index.js; HEAD = 1c6f1b0fe4000977b9a7b4f34097e4d527dd9824 (matches provenance).
3. `for d in node_modules/*/ … print name@version main exports` — 63 installed runtime packages (resolved versions recorded in report).
4. `shasum -a 256 index.js lib/*.js` — provenance hashes (in report).

## Skill candidate patterns over express runtime files (index.js, lib/**)

5. P1 `rg -n "require\s*\(|\bfrom\s*['\"]|\bimport\s*\(|\bnode:" index.js lib/` — core imports: node:http (application/request/response/utils), node:net (request), node:path, node:fs (view), node:events (express), node:querystring, node:buffer (utils/response). Dynamic engine require at lib/view.js:81. No ESM, no import().
6. P2 `rg -n "\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(" index.js lib/` — read-only: process.env.NODE_ENV, process.nextTick, Buffer.isBuffer/from/byteLength. No writes to globals.
7. P3 `rg -n "\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign" index.js lib/` — hits: application.js:33-34 (intrinsic method aliases, read), :69,:102,:374 (defineProperty on own app/settings), :118-121 (setPrototypeOf on sub-app layer objects), :169-170 (**setPrototypeOf on live req/res -> C-005**), :233-234 (**restore -> C-006**); express.js:41 (mixin app <- EE.prototype read); request.js:30 / response.js:43 (Object.create over core prototypes); request.js:522 (defineGetter on library layer). No `Object.assign`, no `__proto__`, no Reflect mutators.
8. P4 `rg -n "monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b" index.js lib/` — zero hits.
9. P5 `rg -n "require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks" index.js lib/` — zero hits (no module-loading interception).
10. P6 `rg -n "process\.(binding|_linkedBinding)|internalBinding|['\"]_http_|['\"]internal/" index.js lib/` — zero hits.

## Dependency sweeps (all 63 packages, runtime files)

11. Module interception + internals (P5+P6 patterns) over node_modules — ONLY hit: safer-buffer/safer.js:61 `process.binding('buffer')` read inside try/catch (C-030). Negative for require.cache/extensions/Module._*/internalBinding/_http_/internal/ everywhere else.
12. Prototype manipulation `rg "__proto__\s*[=:]|setPrototypeOf\s*\(|Reflect\.(set|defineProperty|setPrototypeOf)"` — hits: setprototypeof polyfill (C-028), router/index.js:64 (C-015), object-inspect:39 (read), dunder-proto get/set (C-033), http-errors:139,208 (C-029), qs/dist bundle (reads, C-036). No core-prototype targets.
13. Patch keywords `rg "monkey.?patch|\bshim\b|\bpolyfill\b|\boverride\b"` — only package.json descriptions, comments (get-intrinsic "override mistake"), inherits browser shim comment. No patch code.
14. `rg -l "dunder-proto/set"` — only dunder-proto's own README; the mutating helper is never imported (C-033).
15. Core-module/global assignment `rg "(^|[^.\w])(http|https|net|fs|stream|events|util|tls|zlib|crypto|buffer|process|global|globalThis)\.[A-Za-z_$][\w$]*\s*=[^=]"` (filtered process.env/platform reads) — ZERO hits: nothing assigns onto core module exports or globals.
16. `rg "Object\.definePropert(y|ies)\s*\(|Object\.assign\s*\("` — hits reviewed: router (own objects), http-errors (own errors/constructors), ipaddr.js:537,611 (own arrays), debug/src/common.js:122 (own debug fn), path-to-regexp/content-type/content-disposition (esModule markers), merge-descriptors:20 (caller destination, C-034), depd:62,485+ (caller obj / own error, C-027), **once/once.js:6,13 (Function.prototype -> C-025)**.
17. Core-class prototype member writes `rg "(IncomingMessage|ServerResponse|OutgoingMessage|EventEmitter|Readable|Writable|Transform|Duplex|Stream|Socket|Buffer|Error|Array|String|Object|Function|Number|RegExp|Date|Promise)\.prototype(\.[\w$]+\s*=|\[)"` — hits: send SendStream.prototype.* (library subclass, C-022), iconv-lite stream classes (C-031), http-errors ClientError/ServerError.prototype (C-029). No core class prototype written.
18. `cat once/once.js` + `rg "\.proto\s*\(" index.js lib node_modules` — once.proto is opt-in; no caller in runtime scope (README only) -> C-025 rejected.
19. Instance writes on req/res/socket over middleware deps `rg "(req|res|msg|stream|socket|sock)\.[\w$]+\s*=[^=]|delete (req|res|msg)\." router finalhandler on-finished parseurl send serve-static body-parser raw-body unpipe ee-first` — hits catalogued as C-016…C-024, C-018; **on-finished/index.js:195 res.assignSocket wrapper -> C-019**; raw-body/unpipe/ee-first: none.
20. `rg "Error\.(prepareStackTrace|stackTraceLimit)\s*="` — ONLY depd/index.js:386-387,395-396 (**C-026 -> F-002**). Full depd read: factory depd() calls getStack() at require time; log() calls getStack() per deprecation; wrapfunction/wrapproperty exist (C-027).
21. `rg "require\(['\"]depd['\"]\)|deprecate\.(function|property)\s*\("` over lib + node_modules — consumers: express lib/response.js:17, router (index.js:21, lib/layer.js:18), http-errors index.js:15; zero `deprecate.function/property` call sites -> depd wrappers dormant.
22. Deletes `rg "delete (Object|Function|Error|Buffer|process|http\.|global|Array|String)"` — only debug/src/node.js:209 `delete process.env.DEBUG` (C-032).
23. Env/listener writes `rg "defaultMaxListeners\s*=|process\.env\.[A-Za-z_]+\s*=|process\.emitWarning\s*=|console\.[a-z]+\s*="` — only debug/src/node.js:205 `process.env.DEBUG =` inside save() (C-032).
24. Core http/stream importers `rg -l "require\s*\(\s*['\"](node:)?(http|stream|net|_stream|tls)['\"]"` — router (reads http.METHODS, route.js:17), send (Stream subclass :28,:94,:155), iconv-lite (Transform injection, verified C-031). No others.
25. `rg "(IncomingMessage|ServerResponse|OutgoingMessage)"` over deps — JSDoc comments plus on-finished patch site (C-019) only.
26. Entrypoint/init reads: once.js, wrappy.js, depd/index.js, debug/src/{index,node,common}.js, iconv-lite/lib/index.js tail + streams.js, safer-buffer/safer.js (full), setprototypeof/index.js, on-finished/index.js (full), router/index.js + lib/route.js (key paths), send/index.js (init + SendStream), body-parser/lib/read.js, http-errors/index.js (key paths), merge-descriptors/index.js, inherits/inherits.js. Remaining pure packages excluded after sweeps 11-25 returned negative for them.

## Node.js baseline (targeted reads at d44625a4b80)

27. `rg -n "IncomingMessage|ServerResponse" lib/http.js` — exports at :268,:271; server options IncomingMessage/ServerResponse documented at :69-70; implementation under lib/internal/http/* (lib/_http_*.js are shims).
28. `lib/internal/http/server.js` — ServerResponse ctor sets `this.req = req` (:224); `assignSocket` (:312-321) sets socket and emits 'socket' (:319); `kIncomingMessage` honored (:526); res created at :1375; assignSocket called at :1410.
29. `lib/internal/http/outgoing.js` — ctor sets `this[kSocket] = null` (:187); `socket` is a prototype accessor (:304-316) -> on-finished C-019 guard (`socket === undefined`) unreachable on baseline.
30. `lib/internal/http/incoming.js` — ctor `IncomingMessage(socket)` sets `this.socket = socket` (:77) -> server requests always have a socket.
31. `lib/internal/http/common.js:94-97` — request instantiated as `new (socket.server[kIncomingMessage] || IncomingMessage)(socket)`.

## Reproduction and upstream corroboration

32. `node repro-core-mutation-check.js "$PACKAGE_ROOT"` (Node v24.19.0, script beside report) — result: `instance checks: {"reqProtoIsAppRequest":true,"resProtoIsAppResponse":true,"chainHasCoreProto":true,"reqShadows":[],"resShadows":[]}`; `prepareStackTrace restored: true`; `stackTraceLimit restored: true`; `RESULT: no shared core prototype/global mutations detected`.
33. `gh search issues --repo expressjs/express "setPrototypeOf"` — #6039 (open, req/res must extend core classes), #7427 (open, sub-app prototype restoration); others unrelated.
34. `gh api repos/expressjs/express/commits/1c6f1b0…` — commit exists upstream ("test: expand coverage for request, response and view behavior (#7112)").

## Negative-result summary

- No `require.cache` / `require.extensions` / `Module._*` / loader-hook usage anywhere in runtime scope.
- No assignment onto any core module export or global object.
- No write to any shared core prototype (http.*, stream, events, Buffer, Object/Function/Error intrinsics) — confirmed statically and dynamically; the only Function.prototype writer (once.proto) is opt-in and uncalled.
- No `process.binding`/`internalBinding` writes (one guarded read in safer-buffer).
- No core source rewrites; no install scripts executed (`--ignore-scripts`) and package has no runtime-relevant install hooks.
