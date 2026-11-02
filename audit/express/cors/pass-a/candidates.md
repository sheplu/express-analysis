# Candidate ledger: cors 2.8.6 monkeypatch audit (pass A)

Scope: `$PACKAGE_ROOT/lib/index.js` (entrypoint), `$PACKAGE_ROOT/node_modules/object-assign/index.js` (4.1.1), `$PACKAGE_ROOT/node_modules/vary/index.js` (1.1.2). Every write/assignment, module load, and core-API touch found by the search pattern set is listed. Statuses: confirmed (patch), rejected (not a patch), unresolved.

Totals: 13 candidates -- 0 confirmed, 13 rejected, 0 unresolved.

## cors lib/index.js

| ID | Site | What it writes/modifies | Status | Reason |
| --- | --- | --- | --- | --- |
| C-001 | `lib/index.js:5-6` | Loads `object-assign` and `vary` (the only `require` calls in the package) | rejected | No Node.js core module is loaded by cors at all; both deps audited below |
| C-002 | `lib/index.js:153` | `res.setHeader(header.key, header.value)` -- sets CORS response headers | rejected | Method *call* on the per-request `http.ServerResponse` instance. `OutgoingMessage.prototype.setHeader` is a public API defined at `$NODEJS_SOURCE/lib/internal/http/outgoing.js:813`; it is invoked, never reassigned/wrapped. Mutates per-response header state (kOutHeaders) through the documented contract -- API consumption, not a patch |
| C-003 | `lib/index.js:178` | `res.statusCode = options.optionsSuccessStatus` (default 204) on preflight short-circuit | rejected | Instance data-property write, not a method/behavior override. `statusCode` is the documented settable status property: prototype default `ServerResponse.prototype.statusCode = 200` at `$NODEJS_SOURCE/lib/internal/http/server.js:285`, consumed by implicit `writeHead(this.statusCode)` at `server.js:420`. The assignment creates an own property on one response instance, exactly as the API intends. The shared prototype is untouched |
| C-004 | `lib/index.js:179` | `res.setHeader('Content-Length', '0')` | rejected | Same classification as C-002; Safari preflight workaround is HTTP-level behavior, not a Node patch |
| C-005 | `lib/index.js:180` | `res.end()` -- terminates the preflight response | rejected | Method call; `OutgoingMessage.prototype.end` (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:1289`) invoked, never replaced |
| C-006 | `lib/index.js:208` | `assign({}, defaults, options)` -- merges options | rejected | Object.assign semantics applied to a fresh `{}` literal target every call; target is never a core object, global, or prototype |
| C-007 | `lib/index.js:223` | `corsOptions.origin = origin` | rejected | Write to the library-owned merged options object (created at C-006) |

Also checked in lib/index.js: `headers.push(...)` sites (lines 43-170) write only to local arrays/plain objects; `module.exports = middlewareWrapper` (line 236) is the package's own export. Neither raised a candidate.

## object-assign@4.1.1 (node_modules/object-assign/index.js)

| ID | Site | What it writes/modifies | Status | Reason |
| --- | --- | --- | --- | --- |
| C-008 | `index.js:9-11` | `var getOwnPropertySymbols = Object.getOwnPropertySymbols; var hasOwnProperty = Object.prototype.hasOwnProperty; var propIsEnumerable = Object.prototype.propertyIsEnumerable;` | rejected | Saved references (reads). No assignment, deletion, or descriptor change on `Object`/`Object.prototype` |
| C-009 | `index.js:65` | `module.exports = shouldUseNative() ? Object.assign : function (target, source) {...}` | rejected | Ponyfill pattern: exports a *reference* to the unmodified native builtin when sane, else a self-contained local fallback. Never assigns to `Object.assign` or any global -- no polyfill installation |
| C-010 | `index.js:30-55` | Load-time feature detection: `test1[5] = 'de'` (local `new String('abc')` wrapper), property writes on local `test2`/`test3` objects | rejected | Writes only to local throwaway objects created inside `shouldUseNative()`; nothing shared, global, or core. Runs once at module load inside try/catch |
| C-011 | `index.js:73-85` | Fallback branch: `to[key] = from[key]` and `to[symbols[i]] = from[symbols[i]]` on the caller-provided target | rejected | Mutates only the caller's target argument. Within cors the target is always a fresh `{}` (`lib/index.js:208`). On any Node with sane native `Object.assign` (all modern versions) this branch is not even exported |

## vary@1.1.2 (node_modules/vary/index.js)

| ID | Site | What it writes/modifies | Status | Reason |
| --- | --- | --- | --- | --- |
| C-012 | `index.js:13-14` | `module.exports = vary; module.exports.append = append` | rejected | Property writes on the module's own export object |
| C-013 | `index.js:140,147` | `res.getHeader('Vary')` read then `res.setHeader('Vary', val)` write | rejected | Duck-typed (`index.js:134`) method calls on the response instance passed in from cors `applyHeaders` (`lib/index.js:151`). Read-merge-set of one header value via the public API; `OutgoingMessage.prototype.getHeader` (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:914`) and `setHeader` (:813) are untouched |

Also checked in vary: `append()`/`parse()` operate on local strings/arrays only (lines 38-123); no other writes exist.

## Unresolved

None.
