# Candidate ledger — express 5.3.0 (pass B)

Every candidate site surfaced by the searches in `searches.md`, with the object
actually modified and the resolution. Paths are `$PACKAGE_ROOT`-relative;
Node.js baseline references are `$NODEJS_SOURCE`-relative at commit d44625a4b80.

Statuses: confirmed (-> finding ID) / rejected (with reason) / unresolved (none).

## Express runtime code

| ID | Site | What it writes/modifies | Status / reason |
| --- | --- | --- | --- |
| C-001 | lib/request.js:30 `Object.create(http.IncomingMessage.prototype)` | Creates a NEW library-owned object inheriting the core prototype; subsequent `req.*` method assignments (lines 63-281) and `defineGetter` calls (230-511, helper at 521-527) all target this library object | rejected as patch — core prototype only read, never written; context for F-001 |
| C-002 | lib/response.js:43 `Object.create(http.ServerResponse.prototype)` | Same layering for the response; all `res.*` assignments (65-921) target the library object | rejected as patch — same reason; context for F-001 |
| C-003 | lib/express.js:41 `mixin(app, EventEmitter.prototype, false)` | merge-descriptors copies descriptors FROM `EventEmitter.prototype` (read) TO `app` (library-owned function) | rejected — source read-only (`node_modules/merge-descriptors/index.js:20` writes destination only) |
| C-004 | lib/express.js:45-52 `app.request`/`app.response = Object.create(req/res, {app:…})` | New per-app layer objects | rejected — library-owned |
| C-005 | lib/application.js:169-170 `Object.setPrototypeOf(req, this.request)` / `(res, this.response)` | Writes the `[[Prototype]]` internal slot of LIVE core-created `IncomingMessage`/`ServerResponse` instances (created at `$NODEJS_SOURCE/lib/internal/http/common.js:97` and `$NODEJS_SOURCE/lib/internal/http/server.js:1375`) | confirmed -> F-001 (instance/application override) |
| C-006 | lib/application.js:233-234 `Object.setPrototypeOf(req, orig.request)` etc. | Rewires the same live instances back to the parent app's layers when a mounted sub-app returns | confirmed -> F-001 (restore path; never restores bare core prototype) |
| C-007 | lib/application.js:118-121 mount-time `Object.setPrototypeOf(this.request, parent.request)` etc. | Re-parents the sub-app's OWN layer objects (app.request/app.response/engines/settings) | rejected — all four targets are library-owned |
| C-008 | lib/application.js:165-166 `req.res = res; res.req = req` | Own-property writes on live core-backed instances; core already sets `res.req` to the same value (`$NODEJS_SOURCE/lib/internal/http/server.js:224`); `req.res` is a new metadata property | rejected — metadata / value-identical write; no behavior replaced |
| C-009 | lib/application.js:173-174 `res.locals = Object.create(null)` | New metadata property on live instance | rejected — metadata addition |
| C-010 | lib/application.js:33-34 `Array.prototype.slice/flat` aliases | Read-only references to intrinsic methods | rejected — reads |
| C-011 | lib/application.js:69,102,374 `Object.defineProperty(this…/this.settings…)` | App/settings objects | rejected — library-owned |
| C-012 | lib/request.js:521-527 `defineGetter(obj,…)` | Called only with the library `req` layer (lines 230-508) | rejected — library-owned target |
| C-013 | lib/view.js:81 `require(mod).__express` | Dynamic require of user-configured template engine | rejected — ordinary module loading, not interception (no require.cache/extensions/Module._* use anywhere: P5 negative) |
| C-014 | lib/application.js:599 `http.createServer(this)` | Documented core API call | rejected — supported API use |

## Runtime dependencies

| ID | Site | What it writes/modifies | Status / reason |
| --- | --- | --- | --- |
| C-015 | node_modules/router/index.js:64 `Object.setPrototypeOf(router, this)` | The library-created `router` function object | rejected — library-owned |
| C-016 | node_modules/router/index.js:174,183-184,195,201-202,281,285,323,327,332; lib/route.js:115 | `req.next`, `req.baseUrl`, `req.originalUrl`, `req.params`, `req.route` (metadata) and `req.url` VALUE rewrite/restore for mounted paths | rejected — instance metadata/state writes; `req.url` is a core-set own data property whose value is changed and restored (state mutation, no API replacement) |
| C-017 | node_modules/finalhandler/index.js:250,253 `res.statusCode/statusMessage =` | Documented response state | rejected — supported API |
| C-018 | node_modules/on-finished/index.js:147,164 `msg.__onFinished =` | Private metadata property on core-backed instance | rejected — metadata addition |
| C-019 | node_modules/on-finished/index.js:189-199 `res.assignSocket = function _assignSocket …` | Own-property wrapper SHADOWING core `ServerResponse.prototype.assignSocket` (`$NODEJS_SOURCE/lib/internal/http/server.js:312-321`) on a live instance, calling through to the saved original | rejected as reachable (dormant legacy instance override) — only runs when `msg.socket === undefined` (index.js:128-131); baseline initializes `this[kSocket] = null` (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:187`) so the guard is never true; modern path uses the `'socket'` event emitted at `$NODEJS_SOURCE/lib/internal/http/server.js:319`; code comment: "node.js 0.8 patch"; express engines `>= 18` |
| C-020 | node_modules/parseurl/index.js:54,84 `req._parsedUrl/_parsedOriginalUrl =` | Cache metadata on live instance | rejected — metadata addition |
| C-021 | node_modules/send/index.js:184,273,386,564 `res.statusCode =` | Documented response state | rejected — supported API |
| C-022 | node_modules/send/index.js:94,155+ `Stream.call(this)`, `util.inherits(SendStream, Stream)`, `SendStream.prototype.*` (incl. own `pipe` at :403) | Library-owned subclass prototype | rejected — supported inheritance; core `Stream.prototype` untouched |
| C-023 | node_modules/serve-static/index.js:78,200 `res.statusCode =` | Documented response state | rejected — supported API |
| C-024 | node_modules/body-parser/lib/read.js:53,194 `req.body =` | Metadata on live instance | rejected — metadata addition |
| C-025 | node_modules/once/once.js:5-19 `Object.defineProperty(Function.prototype, 'once'/'onceStrict', …)` | SHARED intrinsic prototype — but only inside `once.proto()` | rejected — optional activation never used: `rg "\.proto\s*\(" ` over index.js, lib/**, node_modules/** finds no caller (only once's own README); express calls plain `once(fn)` (lib/application.js:602) |
| C-026 | node_modules/depd/index.js:386-387 (write), 395-396 (restore) `Error.prepareStackTrace/stackTraceLimit =` | Shared global `Error` properties, swapped and synchronously restored in `getStack()` | confirmed -> F-002 (transient shared-global mutation; reachable at `require('express')` via lib/response.js:17 `require('depd')('express')` -> depd() -> getStack(), and on every deprecation log) |
| C-027 | node_modules/depd/index.js:40-65,485+ `wrapproperty`/`wrapfunction` (defineProperty on caller-passed obj) | Would rewrite caller-designated properties | rejected — never invoked in runtime scope: depd consumers (express lib/response.js:17, router index.js:21 + lib/layer.js:18, http-errors index.js:15) use only message-logging `deprecate(msg)`; `deprecate.(function|property)(` has zero call sites |
| C-028 | node_modules/setprototypeof/index.js:1-38 | Exports `Object.setPrototypeOf` or fallback that mutates the OBJECT PASSED BY THE CALLER (`obj.__proto__ =` / property copy) | rejected — polyfill export; no self-activation; callers pass library-owned objects |
| C-029 | node_modules/http-errors/index.js:139,208 `setPrototypeOf(err, …)`; :142-155,211-224 defineProperty(err,…); :163-165,232-234 `ClientError/ServerError.prototype.* =` | Library-created Error instances and library-owned constructors | rejected — library-owned targets |
| C-030 | node_modules/safer-buffer/safer.js (whole file) | Copies `buffer`/`Buffer` properties into its own `safer`/`Safer` objects; `safer.Buffer.prototype = Buffer.prototype` sets a property ON ITS OWN object aliasing core (read); `process.binding('buffer')` read in try/catch at :61 | rejected — no core write; private API read only |
| C-031 | node_modules/iconv-lite/lib/index.js (tail, auto `enableStreamingAPI(require('stream'))`) + lib/streams.js:19-21,66-68 | Creates ITS OWN `IconvLiteEncoderStream/DecoderStream` via `Object.create(Transform.prototype)`; implements `_transform/_flush` | rejected — supported subclassing; core `Transform.prototype` untouched |
| C-032 | node_modules/debug/src/node.js:205,209 `process.env.DEBUG = namespaces` / `delete process.env.DEBUG` | Process environment state inside `save()`, called only from opt-in `debug.enable()` | rejected — env-var persistence, not an API/prototype write; not invoked by express |
| C-033 | node_modules/dunder-proto/set.js:10,32 `obj.__proto__ =` | Prototype-setting helper | rejected — module never imported by any runtime file (`rg -l "dunder-proto/set"` matches only its own README); get-proto uses dunder-proto/get (read) |
| C-034 | node_modules/merge-descriptors/index.js:20 `Object.defineProperty(destination, …)` | Caller-passed destination | rejected — only runtime caller is express with destination `app` (library-owned) |
| C-035 | node_modules/ipaddr.js/lib/ipaddr.js:537,611 `Object.defineProperty(parsed, 'toString', …)` | Library-created result arrays | rejected — library-owned |
| C-036 | node_modules/qs/dist/qs.js (bundled), lib/** | Reads `Object.getPrototypeOf`, `Object.prototype.hasOwnProperty`; `{__proto__: null}` literals; exports markers | rejected — reads/own-object writes only |
| C-037 | node_modules/{get-intrinsic,call-bind-apply-helpers,call-bound,es-define-property,es-errors,es-object-atoms,function-bind,get-proto,gopd,has-symbols,hasown,math-intrinsics,object-inspect,side-channel,side-channel-list,side-channel-map,side-channel-weakmap} | Intrinsic capture/feature detection at require time | rejected — read-only; all mutation sweeps negative |
| C-038 | node_modules/inherits/inherits.js | Re-exports core `util.inherits` (or browser shim) | rejected — read/re-export |
| C-039 | node_modules/{raw-body,unpipe,ee-first,once(call path),wrappy} | Stream reading, listener attach/remove (`stream.unpipe()`, `pause()`, `removeListener`), function wrapping of caller-passed fns | rejected — supported EventEmitter/stream API use; no instance property writes found (sweep negative) |
| C-040 | node_modules/{accepts,negotiator,mime-types,mime-db,media-typer,type-is,content-type,content-disposition,cookie,cookie-signature,encodeurl,escape-html,etag,fresh,statuses,range-parser,vary,proxy-addr,forwarded,bytes,ms,toidentifier,is-promise,path-to-regexp} | Pure functions/data; `vary` uses documented `res.getHeader/setHeader`; `etag`/`cookie-signature` use `crypto` read-only | rejected — all mutation sweeps negative across every runtime file |

Unresolved candidates: none.
