# Monkeypatch Audit: depd@2.0.0

## Package Overview
- **Name**: depd
- **Version**: 2.0.0
- **Role in Express**: Deprecation warning system. Express creates `deprecate('express')` in `response.js` and calls it as a log function for deprecated API usage in `res.redirect()`
- **Source files audited**: `index.js` (539 lines), `lib/browser/index.js` (browser stub, excluded from audit)
- **Risk tier**: LOW

## Findings

### Finding 1: `wrapproperty` — Object.defineProperty on arbitrary target objects
- **Category**: F (Method Wrapping / Interception)
- **File**: `index.js`
- **Line(s)**: 439–486
- **Code**:
  ```js
  function wrapproperty (obj, prop, message) {
    // ...
    var descriptor = Object.getOwnPropertyDescriptor(obj, prop)
    // convert data descriptor to accessor descriptor
    if ('value' in descriptor) {
      descriptor = convertDataDescriptorToAccessor(obj, prop, message)
    }
    var get = descriptor.get
    var set = descriptor.set
    // wrap getter
    if (typeof get === 'function') {
      descriptor.get = function getter () {
        log.call(deprecate, message, site)
        return get.apply(this, arguments)
      }
    }
    // wrap setter
    if (typeof set === 'function') {
      descriptor.set = function setter () {
        log.call(deprecate, message, site)
        return set.apply(this, arguments)
      }
    }
    Object.defineProperty(obj, prop, descriptor)
  }
  ```
- **What it does**: Wraps a property's getter/setter on an arbitrary object with a deprecation-logging wrapper. First converts data descriptors to accessor descriptors (line 462-464 calls `convertDataDescriptorToAccessor`), then wraps get/set with logging, then redefines the property via `Object.defineProperty`.
- **Object affected**: Any object passed as `obj` — designed to be used on the caller's objects
- **Node.js cross-reference**: N/A — this is a general-purpose property wrapper, not targeting a specific Node.js built-in
- **Severity**: **Low** — Express does NOT call `deprecate.property()` anywhere. It only uses `deprecate(message)` as a log function (response.js lines 826, 830, 834). The `wrapproperty` capability is exported but unused by Express.
- **v6 recommendation**: Informational. Consider whether this capability is needed at all in v6, or if it can be removed from the API surface.

### Finding 2: `convertDataDescriptorToAccessor` — Object.defineProperty on arbitrary target objects
- **Category**: F (Method Wrapping / Interception)
- **File**: `index.js`
- **Line(s)**: 49–65
- **Code**:
  ```js
  function convertDataDescriptorToAccessor (obj, prop, message) {
    var descriptor = Object.getOwnPropertyDescriptor(obj, prop)
    var value = descriptor.value
    descriptor.get = function getter () { return value }
    if (descriptor.writable) {
      descriptor.set = function setter (val) { return (value = val) }
    }
    delete descriptor.value
    delete descriptor.writable
    Object.defineProperty(obj, prop, descriptor)
    return descriptor
  }
  ```
- **What it does**: Converts a data property descriptor to an accessor property descriptor on an arbitrary object. Called by `wrapproperty` only.
- **Object affected**: Any object passed through `wrapproperty`
- **Severity**: **Low** — only reachable via `wrapproperty`, which Express does not call
- **v6 recommendation**: Same as Finding 1

### Finding 3: Temporary global mutation of `Error.prepareStackTrace` and `Error.stackTraceLimit`
- **Category**: A (Prototype Chain Manipulation) — global state mutation
- **File**: `index.js`
- **Line(s)**: 381–398
- **Code**:
  ```js
  function getStack () {
    var limit = Error.stackTraceLimit
    var prep = Error.prepareStackTrace
    Error.prepareStackTrace = prepareObjectStackTrace
    Error.stackTraceLimit = Math.max(10, limit)
    // capture the stack
    Error.captureStackTrace(obj)
    var stack = obj.stack.slice(1)
    Error.prepareStackTrace = prep
    Error.stackTraceLimit = limit
    return stack
  }
  ```
- **What it does**: Temporarily replaces `Error.prepareStackTrace` (a V8-specific global hook) and increases `Error.stackTraceLimit` to capture structured stack traces. Both are restored immediately after the capture.
- **Object affected**: `Error` global — specifically `Error.prepareStackTrace` and `Error.stackTraceLimit`
- **Node.js cross-reference**:
  - `Error.prepareStackTrace` is a V8 API, not defined in Node.js lib — it's a native V8 hook that allows customizing stack trace formatting
  - `Error.stackTraceLimit` is defined in V8, defaults to 10
- **Severity**: **Medium** — This is a global state mutation. Although it's restored immediately, it is NOT thread-safe. If multiple async operations call `getStack()` concurrently, they can interfere with each other's `Error.prepareStackTrace` setting. In practice, this is called during deprecation warning emission, which happens rarely.
- **v6 recommendation**: Consider using `Error.captureStackTrace` with structured site objects without mutating `Error.prepareStackTrace`, or accepting the V8-formatted string and parsing it. Alternatively, document this as a known limitation.

### Finding 4: Custom event emission on global process
- **Category**: C (Instance Property Injection — event emission on foreign object)
- **File**: `node_modules/depd/index.js`
- **Line(s)**: 251
- **Code**: `process.emit('deprecation', err)`
- **What it does**: Emits a custom `'deprecation'` event on the global `process` object. This injects a non-standard event into the Node.js process event loop. Any code listening for `'deprecation'` on process will receive these events.
- **Object affected**: Global `process` object
- **Severity**: Medium — mutates global state by emitting events on a shared object
- **v6 recommendation**: Consider using a dedicated EventEmitter for deprecation events rather than the global process object

### Finding 5: Read of undocumented process.noDeprecation flag
- **Category**: G (Private Property Access)
- **File**: `node_modules/depd/index.js`
- **Line(s)**: 154
- **Code**: `if (process.noDeprecation) { ... }`
- **What it does**: Reads the undocumented `process.noDeprecation` flag to suppress deprecation warnings
- **Object affected**: Global `process` object (read-only)
- **Severity**: Informational — read-only access of an unofficial Node.js flag

### Finding 6: Read of undocumented process.traceDeprecation flag
- **Category**: G (Private Property Access)
- **File**: `node_modules/depd/index.js`
- **Line(s)**: 170
- **Code**: `if (process.traceDeprecation) { ... }`
- **What it does**: Reads the undocumented `process.traceDeprecation` flag to emit stack traces with deprecation warnings
- **Object affected**: Global `process` object (read-only)
- **Severity**: Informational

### Finding 7: wrapfunction — function wrapping capability (latent)
- **Category**: F (Method Wrapping / Interception)
- **File**: `node_modules/depd/index.js`
- **Line(s)**: 413–433
- **Code**:
  ```js
  function wrapfunction (fn, message) {
    // ...
    var deprecatedfn = new Function(...)
    // ...
    return deprecatedfn
  }
  ```
  Exported as `deprecate.function` at line 123.
- **What it does**: Wraps an arbitrary function in a deprecation-logging wrapper using `new Function(...)`. Like `wrapproperty`, this is an exported capability that consumers could use to wrap foreign functions.
- **Object affected**: Any function passed to it (potentially foreign)
- **Severity**: Low — Express does NOT call `deprecate.function()` anywhere (latent capability)
- **v6 recommendation**: Same as wrapproperty — consider whether these capabilities should be retained

## Transitive Dependencies

| Dependency | Version | Findings |
|---|---|---|
| (none) | — | — |

## Summary
- **Total findings**: 7
- **Critical**: 0, **High**: 0, **Medium**: 2, **Low**: 3, **Informational**: 2
- Findings 1-2 (`wrapproperty` and `convertDataDescriptorToAccessor`) are **latent** — Express never calls `deprecate.property()`, so the `Object.defineProperty` on foreign objects is never triggered in Express's codebase. These are exported capabilities that consumers could use.
- Finding 3 (`Error.prepareStackTrace` mutation) is **active** — it runs whenever a deprecation warning is emitted (3 call sites in Express's `response.js`). The mutation is temporary but not concurrency-safe.
- Finding 4 (`process.emit('deprecation')`) is **active** — emits custom events on the global `process` object whenever a deprecation warning fires.
- Findings 5-6 (`process.noDeprecation`/`process.traceDeprecation`) are **active** read-only accesses of undocumented Node.js flags.
- Finding 7 (`wrapfunction`) is **latent** — parallel to `wrapproperty`, Express does not call it.
- **Recommendations for v6**: The most impactful findings are the temporary global mutation of `Error.prepareStackTrace` and the custom event emission on `process`. Consider whether `depd` is still needed in v6, or if Node.js's built-in `process.emitWarning()` API (available since Node 6) can replace it entirely.
