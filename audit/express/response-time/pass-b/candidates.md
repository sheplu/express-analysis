# Candidate ledger: response-time@2.3.4 (pass-b)

Scope: `$PACKAGE_ROOT/index.js`, `$PACKAGE_ROOT/node_modules/depd/index.js`,
`$PACKAGE_ROOT/node_modules/depd/lib/browser/index.js`,
`$PACKAGE_ROOT/node_modules/on-headers/index.js`. Every candidate site surfaced
by the skill's pattern set (P1-P6) plus a direct-write/codegen sweep (P7) is
listed, including rejected and negative results. Statuses: confirmed (-> finding
ID), rejected, negative. No unresolved candidates remain.

## Confirmed

### C-001 — on-headers/index.js:71 — `res.writeHead = createWriteHead(res.writeHead, listener)` -> F-001
- Writes: own property `writeHead` on each `http.ServerResponse` instance passed to the middleware; shadows `ServerResponse.prototype.writeHead` ($NODEJS_SOURCE/lib/internal/http/server.js:423).
- Saved original: closure `prevWriteHead` (on-headers/index.js:30), delegated to at :50.
- Activation: `require('response-time')()` -> middleware per request ($PACKAGE_ROOT/index.js:52) -> `onHeaders(res, fn)` ($PACKAGE_ROOT/index.js:55) -> write at on-headers/index.js:71. Unconditional, production path.
- Classification: instance/application override (core-backed instance). Not a shared mutation: prototype identity verified unchanged (repro).
- Status: confirmed -> F-001.

### C-005 — depd/index.js:386-387 (writes), 395-396 (restores) — `Error.prepareStackTrace` / `Error.stackTraceLimit` -> F-002
- Writes: global `Error.prepareStackTrace = prepareObjectStackTrace` (:386) and `Error.stackTraceLimit = Math.max(10, limit)` (:387).
- Saved originals: `prep` (:384), `limit` (:382); both restored synchronously (:395-396) in the same `getStack()` call.
- Core contract: Node consults userland `Error.prepareStackTrace` in `prepareStackTraceCallback` ($NODEJS_SOURCE/lib/internal/errors.js:149-156); default impl `ErrorPrepareStackTrace` (:165-168).
- Activation: `require('response-time')` -> $PACKAGE_ROOT/index.js:16 `require('depd')('response-time')` -> depd/index.js:103 -> getStack() :108. Also per deprecation log (depd/index.js:199) and from wrapfunction/wrapproperty (:419, :455 — unreached here).
- Classification: transient global mutation (shared global, saved + synchronously restored; process-wide during the window).
- Status: confirmed -> F-002.

## Rejected

### C-002 — on-headers/index.js:19 — `typeof http.ServerResponse.prototype.appendHeader === 'function'`
- Read-only feature detection at module load; selects `set1dArrayWithAppend` vs `set1dArrayWithSet` (:20). No write to the prototype. Rejected.

### C-003 — on-headers/index.js:129 — `this.statusCode = statusCode`
- Write to a documented, writable instance property inside the replacement `writeHead`; replicates core's own `this.statusCode = statusCode` ($NODEJS_SOURCE/lib/internal/http/server.js:446). Part of F-001's behavior, not a separate patch. Rejected as standalone candidate.

### C-004 — on-headers/index.js:108, 153, 158-179 — `res.setHeader` / `res.removeHeader` / `res.appendHeader` calls
- Documented public API calls (setHeadersFromObject/set2dArray/set1dArrayWithAppend/set1dArrayWithSet). No override or descriptor change. Rejected.

### C-006 — depd/index.js:413-433 — `wrapfunction` (includes `new Function` at :425)
- Code generation returns a *new* wrapper function to the caller; no object is mutated; `deprecate.function` is never called by response-time (sole runtime use is `deprecate(message)` at $PACKAGE_ROOT/index.js:43). Rejected (not a mutation; additionally unreached).

### C-007 — depd/index.js:439-486 — `wrapproperty` (`Object.defineProperty(obj, prop, descriptor)` at :485)
- A genuine mutation helper (redefines a property on a caller-supplied object, converting data descriptors to accessors via C-008), but `deprecate.property` is never invoked anywhere in response-time's runtime. Even when used, the patched object is chosen by the consumer. Rejected in this scope (not activated).

### C-008 — depd/index.js:49-65 — `convertDataDescriptorToAccessor` (`Object.defineProperty` at :62)
- Only reachable from C-007 (`wrapproperty`:463); unreached. Rejected.

### C-009 — depd/index.js:492-538 — `DeprecationError` (`Object.defineProperty` at :496, :500, :507, :514, :521)
- Defines `constructor`/`message`/`name`/`namespace`/`stack` on a freshly created, library-owned `new Error()` instance before returning it. No shared or core-managed object touched. Rejected.

### C-010 — depd/index.js:251 — `process.emit('deprecation', err)`
- Standard EventEmitter `emit` call on `process`; fires a custom event for listeners the application opted into. No property of `process` is assigned. Rejected.

### C-011 — depd/index.js:23, 141-147, 154-179, 186, 256, 260 — `process` reads and stderr write
- `process.cwd()` (:23), `process.noDeprecation`/`process.traceDeprecation` (:154, :170), `process.env.NO_DEPRECATION`/`TRACE_DEPRECATION` (:159, :175), `eehaslisteners(process, ...)` (:186, reads listenerCount), `process.stderr.isTTY` (:256), `process.stderr.write(...)` (:260). All reads or documented method calls; no mutation. Rejected.

### C-012 — $PACKAGE_ROOT/index.js:53, 56 — `process.hrtime()` / `process.hrtime(startAt)`
- Read-only core API calls for timing. Rejected.

### C-013 — $PACKAGE_ROOT/index.js:86, 96 — `res.getHeader(header)` / `res.setHeader(header, val)`
- Documented public response API; sets the library's own `X-Response-Time` (or configured) header. No override. Rejected.

### C-014 — depd/lib/browser/index.js (whole file)
- Browser-only stub selected by package.json `browser` field; Node's resolver loads depd/index.js. The stub's `deprecate` is a no-op and its wrapfunction/wrapproperty perform validation only (wrapproperty mutates nothing; wrapfunction returns `fn` unchanged). Rejected / out of Node runtime scope.

## Negative pattern results

### C-015 — module loading interception (skill pattern P5)
- `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks` — zero matches in all four runtime files. Negative.

### C-016 — native bindings / Node internals access (skill pattern P6)
- `process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/` — zero matches. Negative.

### C-017 — prototype chain manipulation beyond C-002
- `__proto__|setPrototypeOf|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign|\bextends\b|\binherits\s*\(` — zero matches (the only `.prototype` hit is the read at C-002; `definePropert(y|ies)` hits are C-007/C-008/C-009). Negative.

### C-018 — monkeypatch vocabulary (skill pattern P4)
- Case-insensitive `monkey.?patch|patch|wrap|shim|polyfill|override` — only comment hits in depd ("Wrap property in a deprecation message", "wrap getter/setter") belonging to C-007, and the same comment in the browser stub (C-014). No additional code sites. Negative beyond ledger entries.
