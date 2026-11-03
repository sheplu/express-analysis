# Monkeypatch Audit: once@1.4.0

## Package Overview
- **Name**: once
- **Version**: 1.4.0
- **Role in Express**: Wraps a function so it can only be called once. Used in `app.listen()` (application.js line 25) to ensure the server error callback fires only once
- **Source files audited**: `once.js` (42 lines)
- **Risk tier**: LOW

## Findings

### Finding 1: `once.proto` — Global `Function.prototype` pollution (latent)
- **Category**: E (Global Prototype Pollution)
- **File**: `once.js`
- **Line(s)**: 5–19
- **Code**:
  ```js
  once.proto = once(function () {
    Object.defineProperty(Function.prototype, 'once', {
      value: function () {
        return once(this)
      },
      configurable: true
    })

    Object.defineProperty(Function.prototype, 'onceStrict', {
      value: function () {
        return onceStrict(this)
      },
      configurable: true
    })
  })
  ```
- **What it does**: When `once.proto()` is called, it adds two methods to `Function.prototype`:
  - `Function.prototype.once` — allows calling `.once()` on any function (e.g., `myFn.once()`)
  - `Function.prototype.onceStrict` — same but throws on second invocation
  These methods are added via `Object.defineProperty` with `configurable: true`, making them removable.
- **Object affected**: `Function.prototype` — every function in the runtime would gain `.once()` and `.onceStrict()` methods
- **Node.js cross-reference**:
  - `Function.prototype` is defined in V8 — it has `.call()`, `.apply()`, `.bind()`, `.toString()`, `.constructor`
  - Neither `.once` nor `.onceStrict` exist natively on `Function.prototype`
  - Conflict risk: `.once` shadows the `.once()` method from `EventEmitter.prototype` if an EventEmitter happens to also be a function. This is actually the case for Express's `app` object (which IS a function with EventEmitter methods mixed in).
- **Severity**: **High (but latent)** — This would be a Critical global prototype pollution if it were called. However:
  - Express does NOT call `once.proto()`. It only uses `once(fn)` (the default export).
  - The function is wrapped in `once()` itself, so it can only execute a single time even if called multiple times.
  - It is exported as `require('once').proto` — any consumer could call it.
- **v6 recommendation**: Consider replacing `once` with an inline implementation or a package that does not export prototype pollution capabilities. A simple once wrapper is ~10 lines of code:
  ```js
  function once(fn) {
    let called = false, value;
    return function(...args) {
      if (called) return value;
      called = true;
      return (value = fn.apply(this, args));
    };
  }
  ```

## Transitive Dependencies

| Dependency | Version | Findings |
|---|---|---|
| wrappy | 1.0.2 | See analysis below |

### Finding 2: wrappy — property copying between function objects
- **Category**: C (Instance Property Injection)
- **File**: `node_modules/wrappy/wrappy.js`
- **Line(s)**: 15–17 and 23–25
- **Code**:
  ```js
  Object.keys(fn).forEach(function (k) {
    wrapper[k] = fn[k]
  })
  // ... and later:
  Object.keys(cb).forEach(function (k) {
    ret[k] = cb[k]
  })
  ```
- **What it does**: Copies all own enumerable properties from the original function to the wrapper function, and from the original callback to the returned function. This can transfer unexpected properties between function objects.
- **Object affected**: Wrapper function objects (cross-function property copying)
- **Severity**: Low — the wrapper is a new function created by wrappy, but it receives properties from a potentially foreign function

## Summary
- **Total findings**: 2
- **Critical**: 0, **High (latent)**: 1, **Medium**: 0, **Low**: 1, **Informational**: 0
- Finding 1 is `once.proto` — a **latent** `Function.prototype` pollution capability. Express never triggers it, but it is exported and available to any consumer of the `once` package.
- Finding 2 is `wrappy`'s property copying between function objects — low severity but a cross-object property transfer pattern.
- **Recommendations for v6**: Replace `once` dependency with an inline implementation. The package is 42 lines with a latent prototype pollution vector. An inline replacement would be ~10 lines with zero risk.
