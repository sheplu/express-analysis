# Candidate ledger: cors 2.8.6 monkeypatch audit (pass B)

Scope: `$PACKAGE_ROOT/lib/index.js`, `$PACKAGE_ROOT/node_modules/object-assign/index.js` (4.1.1),
`$PACKAGE_ROOT/node_modules/vary/index.js` (1.1.2). Every candidate site surfaced by the search
pattern set (see searches.md) is listed with its resolution. Confirmed patches: 0.
Rejected: 12. Unresolved: 0.

## C-001 — rejected as patch
- Site: `$PACKAGE_ROOT/lib/index.js:5-6`
- Writes/modifies: nothing; `require('object-assign')` and `require('vary')`
- Analysis: plain CommonJS loads of npm packages. No core module (`http`, `fs`, ...) is ever
  required by cors itself; no `node:` specifier, no dynamic `import()`, no require.cache or
  Module._* access anywhere in scope. Both loaded dependencies audited below.

## C-002 — rejected as patch
- Site: `$PACKAGE_ROOT/lib/index.js:153` — `res.setHeader(header.key, header.value)`
- Writes/modifies: per-response header state on the caller-provided response object
- Analysis: method CALL on the instance, not an assignment to the method. Core contract:
  `OutgoingMessage.prototype.setHeader` defined at `$NODEJS_SOURCE/lib/internal/http/outgoing.js:813`
  (re-exported through `lib/_http_outgoing.js`). Documented mutable-state API; no prototype or
  instance method is replaced.

## C-003 — rejected as patch (instance state write, documented API)
- Site: `$PACKAGE_ROOT/lib/index.js:178` — `res.statusCode = options.optionsSuccessStatus`
- Writes/modifies: own property `statusCode` on a core-backed `ServerResponse` instance
- Analysis: this is the single write to a core-backed object found in the whole scope. Core
  baseline: `ServerResponse.prototype.statusCode = 200` ($NODEJS_SOURCE/lib/internal/http/server.js:285)
  is a prototype default; assigning `res.statusCode` per instance is the documented way to set the
  response status and shadows the default with an own data property. It does not override any core
  method, alter the prototype, or change behavior for any other instance. Runs only on the preflight
  (OPTIONS) short-circuit path when `preflightContinue` is false. Reproduction: after running the
  middleware against a real `new http.ServerResponse(req)`, the only new own properties were
  `statusCode` and `statusMessage` (the latter set by core inside `res.end()`/`writeHead`), and
  `res.setHeader`/`res.end` still === the prototype functions.

## C-004 — rejected as patch
- Site: `$PACKAGE_ROOT/lib/index.js:179-180` — `res.setHeader('Content-Length', '0'); res.end();`
- Writes/modifies: per-response header state; finalizes the response
- Analysis: documented API calls (`OutgoingMessage.prototype.end` at
  `$NODEJS_SOURCE/lib/internal/http/outgoing.js:1289`). Calls only, no assignment.

## C-005 — rejected as patch
- Site: `$PACKAGE_ROOT/lib/index.js:208` — `var corsOptions = assign({}, defaults, options);`
- Writes/modifies: a fresh object literal `{}` (the assign target)
- Analysis: Object.assign-pattern copy into a brand-new library-owned object; `defaults`
  (lib/index.js:8-13) is library-owned and used only as a SOURCE, never a target, so it is not
  mutated either. No core/global/caller object touched.

## C-006 — rejected as patch
- Site: `$PACKAGE_ROOT/lib/index.js:223` — `corsOptions.origin = origin;`
- Writes/modifies: property on the library-owned object created at line 208
- Analysis: library-owned object mutation; out of core scope.

## C-007 — rejected as patch
- Site: `$PACKAGE_ROOT/node_modules/object-assign/index.js:10-11`
- Writes/modifies: nothing; saves references `Object.prototype.hasOwnProperty` and
  `Object.prototype.propertyIsEnumerable` into local vars
- Analysis: read-only aliasing for later `.call(from, key)` usage (lines 74, 82). No
  defineProperty/assignment against `Object.prototype`. Reproduction confirmed
  `Object.prototype` own-property list and method identities unchanged.

## C-008 — rejected as patch (ponyfill, not polyfill)
- Site: `$PACKAGE_ROOT/node_modules/object-assign/index.js:65` —
  `module.exports = shouldUseNative() ? Object.assign : function (target, source) {...}`
- Writes/modifies: only `module.exports` of the dependency itself
- Analysis: on modern engines it exports a REFERENCE to native `Object.assign` (no wrapper, no
  mutation); on old/buggy engines it exports its own standalone implementation. In neither branch
  is `Object.assign` (or any global/prototype) assigned, wrapped, or replaced. Reproduction:
  `Object.assign` identity unchanged after require and after middleware calls.

## C-009 — rejected as patch
- Site: `$PACKAGE_ROOT/node_modules/object-assign/index.js:30-31,37-56` (shouldUseNative feature test)
- Writes/modifies: `test1[5] = 'de'` on a locally constructed `new String('abc')` wrapper;
  properties on local `test2`/`test3` plain objects
- Analysis: V8 enumeration-order bug detection writing only to locally created, immediately
  discarded objects. `String.prototype` is untouched (reproduction: own-property count of
  `String.prototype` stable).

## C-010 — rejected as patch
- Site: `$PACKAGE_ROOT/node_modules/object-assign/index.js:75,83` — `to[key] = from[key]` /
  `to[symbols[i]] = from[symbols[i]]` (fallback branch)
- Writes/modifies: the caller-supplied `target` argument (`to = Object(target)`)
- Analysis: generic copy helper that mutates whatever target it is handed; within the audited
  scope the only caller is cors lib/index.js:208, which always passes a fresh `{}`. No code path
  passes a core-owned or shared object as target. Additionally this branch is dead on any engine
  with a conforming native `Object.assign` (Node >= 4).

## C-011 — rejected as patch
- Site: `$PACKAGE_ROOT/node_modules/vary/index.js:134-148` — `vary(res, field)`
- Writes/modifies: per-response `Vary` header state via `res.getHeader('Vary')` /
  `res.setHeader('Vary', val)`
- Analysis: duck-type check at :134 only READS `res.getHeader`/`res.setHeader` for presence.
  Header merge happens in the pure string helper `append()` (:38-86); the only side effect is a
  documented `setHeader` call on the caller-provided instance. No method replacement, no
  prototype access, no `_`-prefixed internals (does not touch `_headers`/`kOutHeaders`).

## C-012 — rejected as patch
- Site: `$PACKAGE_ROOT/node_modules/vary/index.js:13-14` —
  `module.exports = vary; module.exports.append = append`
- Writes/modifies: the dependency's own exports object
- Analysis: library-owned module surface; irrelevant to core.

## Full-assignment sweep remainder (all rejected, library-local)
The exhaustive assignment sweep (searches.md, P9) surfaced the following additional
assignment lines, all writes to local variables or library-owned objects, listed for
completeness: lib/index.js:38,58,76,99,105,122,161,196,198,211,213,236;
vary/index.js:79,106,111,114; object-assign/index.js:51,71,80. None touch a core,
global, or caller-owned object.
