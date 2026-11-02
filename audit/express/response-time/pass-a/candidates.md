# Candidate ledger: response-time@2.3.4 (pass A)

Scope: `$PACKAGE_ROOT/index.js`, `$PACKAGE_ROOT/node_modules/depd/index.js` (+ `lib/browser/index.js`),
`$PACKAGE_ROOT/node_modules/on-headers/index.js`. Every candidate site surfaced by the searches in
`searches.md` is accounted for below. Statuses: confirmed (-> finding), rejected (with reason), unresolved (none).

## response-time own code (`$PACKAGE_ROOT/index.js`)

| ID | Site | What it writes/modifies | Status | Reason / trace |
| --- | --- | --- | --- | --- |
| C-001 | index.js:16 `var deprecate = require('depd')('response-time')` | Nothing directly; triggers depd `getStack()` at module load | confirmed -> F-002 | `depd()` (depd/index.js:103) unconditionally calls `getStack()` (:108), which writes `Error.prepareStackTrace`/`Error.stackTraceLimit` (:386-387) and restores them (:395-396). Runs on every `require('response-time')`. |
| C-002 | index.js:43 `deprecate('number argument: ...')` | Triggers depd `log()` -> second `getStack()` (depd/index.js:199) | confirmed -> F-002 (conditional activation path) | Only reached when middleware is constructed with the deprecated number argument (`typeof options === 'number'`, index.js:41). Same global write/restore mechanism. |
| C-003 | index.js:55 `onHeaders(res, function onHeaders () {...})` | Causes own-property assignment of `res.writeHead` per response | confirmed -> F-001 | Runs inside the returned middleware for every request (index.js:52-63). Installation is unconditional. |
| C-004 | index.js:53,56 `process.hrtime(...)`; index.js:90 `res.getHeader`; index.js:96 `res.setHeader(header, val)` | Nothing on core objects (hrtime is a read; setHeader is the documented outgoing-message API) | rejected as patch | Documented API calls; `setHeader` stores into the response's own header state via core's supported path, no override or mutation of core-owned functions. |

## on-headers@1.1.0 (`$PACKAGE_ROOT/node_modules/on-headers/index.js`)

| ID | Site | What it writes/modifies | Status | Reason / trace |
| --- | --- | --- | --- | --- |
| C-005 | index.js:71 `res.writeHead = createWriteHead(res.writeHead, listener)` | Own property `writeHead` on the `http.ServerResponse` instance, shadowing `ServerResponse.prototype.writeHead` ($NODEJS_SOURCE/lib/internal/http/server.js:423) | confirmed -> F-001 | The core-backed instance override. Wrapper (:30-52) re-implements header-argument handling (:119-146), fires the listener once, may rewrite the delegated statusCode (:44-47), then delegates to the saved original. Fires for every response passing through the middleware; intercepts implicit `_implicitHeader()` flush too ($NODEJS_SOURCE/lib/internal/http/server.js:419-421 dispatches via `this.writeHead`). Verified by reproduction (`repro-onheaders.js`). |
| C-006 | index.js:19 `typeof http.ServerResponse.prototype.appendHeader === 'function'` | Nothing — read of core prototype | rejected as patch | Feature detection only; selects between `set1dArrayWithAppend` and `set1dArrayWithSet`. No write. |
| C-007 | index.js:129 `this.statusCode = statusCode` (in `setWriteHeadHeaders`) | Documented writable `statusCode` property on the response instance | rejected as separate patch | Supported API use; behavioral nuance (assignment happens before core's 100-999 validation) documented under F-001 rather than as an independent patch. |
| C-008a | index.js:148-180 `set2dArray`/`set1dArrayWithAppend`/`set1dArrayWithSet` call `res.setHeader`/`appendHeader`/`removeHeader` | Response header state via documented APIs | rejected as patch | Part of the F-001 wrapper body; copied core remove-then-append semantics ($NODEJS_SOURCE/lib/internal/http/server.js:455-468), not a replacement of core code. Covered by F-001. |

## depd@2.0.0 (`$PACKAGE_ROOT/node_modules/depd/index.js` and `lib/browser/index.js`)

| ID | Site | What it writes/modifies | Status | Reason / trace |
| --- | --- | --- | --- | --- |
| C-008 | index.js:386 `Error.prepareStackTrace = prepareObjectStackTrace`; :387 `Error.stackTraceLimit = Math.max(10, limit)`; :395-396 restore | Process-global `Error` constructor properties (temporary) | confirmed -> F-002 | Reachable write to a shared global consulted by Node core ($NODEJS_SOURCE/lib/internal/errors.js:149-156). Save/assign/capture/restore within one synchronous call. Reached at require time via C-001 and conditionally via C-002. Verified by reproduction (`repro-depd.js`): writes `["prepareObjectStackTrace","sentinelPrepare"]`, both values restored. |
| C-009 | index.js:413-433 `wrapfunction` (incl. `new Function` at :425) | Returns a new wrapper function; mutates nothing itself | rejected as patch (dormant capability) | Would only matter if a caller assigned the result over a core method. response-time never calls `deprecate.function` (verified: only `deprecate(message)` at index.js:43). |
| C-010 | index.js:439-486 `wrapproperty` with `Object.defineProperty(obj, prop, descriptor)` at :485; helper `convertDataDescriptorToAccessor` :49-65 with `Object.defineProperty` at :62 | Redefines a property on a caller-supplied object | rejected as patch (dormant capability) | Capable of patching arbitrary objects (incl. core) if invoked, but response-time never calls `deprecate.property`; no reachable core target in this package's scope. |
| C-011 | index.js:492-538 `DeprecationError` — `Object.defineProperty(error, ...)` at :496,:500,:507,:514,:521 | Properties on a freshly created, library-owned `Error` instance | rejected as patch | Mutating your own object is not a core patch; `Error.prototype`/global `Error` untouched here. Only reachable when a `process` `'deprecation'` listener exists (:249-252). |
| C-012 | index.js:251 `process.emit('deprecation', err)` | Emits a custom event on `process` | rejected as patch | Documented EventEmitter API call; adds no property and replaces no method. |
| C-013 | index.js:154 `process.noDeprecation`; :170 `process.traceDeprecation`; :159,:175 `process.env.*`; :23 `process.cwd()`; :256,:260 `process.stderr` | Nothing — reads and a stderr write | rejected as patch | Read-only use of core-populated flags/streams (supporting context: `noDeprecation`/`traceDeprecation` are quasi-private flags set by Node CLI options). |
| C-014 | lib/browser/index.js (whole file) | Nothing — all functions are no-ops/validators | rejected as patch / not in Node runtime path | Selected only via the `browser` package.json field by bundlers; Node resolves `depd/index.js`. Read in full; contains no writes. |

## Search families with zero candidates

- Module-loading interception (`require.cache`, `require.extensions`, `Module._load/_resolveFilename/_extensions/_compile`, `syncBuiltinESMExports`, `registerHooks`): no hits in any runtime file.
- Native/internal access (`process.binding`, `process._linkedBinding`, `internalBinding`, `'_http_'`, `'internal/'` specifiers): no hits.
- Prototype chain manipulation (`__proto__`, `setPrototypeOf`, `Reflect.*`, `Object.assign` onto core objects, `extends`/`inherits`): no hits beyond the read-only C-006.
- On-disk core source rewrites / postinstall scripts: `package.json` has no install/prepare scripts; shipped files are LICENSE, HISTORY.md, index.js only.

Unresolved candidates: none.
