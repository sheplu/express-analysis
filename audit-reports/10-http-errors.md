# Monkeypatch Audit: http-errors@2.0.1

## Package Overview
- **Name**: http-errors
- **Version**: 2.0.1
- **Role in Express**: Creates HTTP error objects with status codes. Used in `res.format()` (to create 406 errors) and by `send` for file-serving errors
- **Source files audited**: `index.js` (291 lines)
- **Risk tier**: LOW

## Findings

### Finding 1: `setPrototypeOf` on newly-created Error instances
- **Category**: A (Prototype Chain Manipulation)
- **File**: `index.js`
- **Line(s)**: 139, 208
- **Code**:
  ```js
  // In createClientErrorConstructor (line 139):
  var err = new Error(msg)
  setPrototypeOf(err, ClientError.prototype)

  // In createServerErrorConstructor (line 208):
  var err = new Error(msg)
  setPrototypeOf(err, ServerError.prototype)
  ```
- **What it does**: Creates a new `Error` instance, then changes its prototype to the specific HTTP error class prototype (e.g., `NotFoundError.prototype`, `InternalServerError.prototype`). This is done to make `err instanceof ClientError` / `err instanceof HttpError` return true while preserving the stack trace from `Error.captureStackTrace`.
- **Object affected**: Newly-created `Error` instances — objects that `http-errors` itself creates via `new Error(msg)`
- **Node.js cross-reference**: `Error` is a built-in global. The created error is `http-errors`' own object, but the pattern of creating `new Error()` then immediately changing its prototype is a form of prototype manipulation.
- **Severity**: **Informational** — The objects being modified are freshly created by `http-errors` itself, not foreign objects. This is a standard pattern for creating error subclasses in JavaScript (pre-ES6 `class extends Error`). The prototype being set is also owned by `http-errors`.
- **v6 recommendation**: Replace with ES6 `class ClientError extends Error {}`. This eliminates the `setPrototypeOf` call entirely.

### Finding 2: `Object.defineProperty` on newly-created Error instances
- **Category**: C (Instance Property Injection — on own objects)
- **File**: `index.js`
- **Line(s)**: 142–155, 211–224
- **Code**:
  ```js
  Object.defineProperty(err, 'message', {
    enumerable: true, configurable: true, value: msg, writable: true
  })
  Object.defineProperty(err, 'name', {
    enumerable: false, configurable: true, value: className, writable: true
  })
  ```
- **What it does**: Redefines `message` and `name` properties on the newly-created error objects to set specific enumerability flags
- **Object affected**: Freshly-created `Error` instances owned by `http-errors`
- **Severity**: **Informational** — modifying own objects, standard error construction pattern
- **v6 recommendation**: ES6 classes would handle this naturally

### Finding 3: `inherits` — sets up prototype chains for error constructor hierarchy
- **Category**: B (Prototype Extension — on own constructors)
- **File**: `index.js` (via `inherits` package)
- **Line(s)**: 117 (`inherits(HttpError, Error)`), 160 (`inherits(ClientError, HttpError)`), 229 (`inherits(ServerError, HttpError)`)
- **Code** (from `inherits` package):
  ```js
  // inherits/inherits_browser.js — but in practice uses util.inherits:
  ctor.super_ = superCtor
  ctor.prototype = Object.create(superCtor.prototype, {
    constructor: { value: ctor, enumerable: false, writable: true, configurable: true }
  })
  ```
- **What it does**: Sets up the standard prototype chain: `HttpError.prototype` → `Error.prototype`, `ClientError.prototype` → `HttpError.prototype`, `ServerError.prototype` → `HttpError.prototype`
- **Object affected**: `http-errors`' own constructor prototypes
- **Severity**: **Informational** — standard OOP inheritance setup on own constructors. `Error.prototype` itself is NOT modified.
- **v6 recommendation**: Replace with ES6 `class ... extends ...`

### Finding 4: Property injection on generic Error instances in `createError()`
- **Category**: C (Instance Property Injection)
- **File**: `index.js`
- **Line(s)**: 92–102
- **Code**:
  ```js
  if (!HttpError || !(err instanceof HttpError) || err.status !== status) {
    err.expose = status < 500
    err.status = err.statusCode = status
  }
  for (var key in props) {
    if (key !== 'status' && key !== 'statusCode') {
      err[key] = props[key]
    }
  }
  ```
- **What it does**: When called with an existing `Error` object that isn't already an HttpError, adds `.expose`, `.status`, and `.statusCode` properties to it, plus any additional properties from the `props` argument
- **Object affected**: Could be a foreign `Error` instance if the caller passes one in — e.g., `createError(500, existingError)` modifies `existingError` by adding `expose`, `status`, `statusCode`
- **Node.js cross-reference**: `Error` instances don't natively have `.expose`, `.status`, or `.statusCode` properties
- **Severity**: **Low** — modifies an Error instance passed by the caller. The caller has opted into this by passing the error to `createError()`. In Express, this is used in `send`'s error handling and `res.format()`'s 406 path.
- **v6 recommendation**: Consider returning a new HttpError wrapping the original rather than mutating the passed-in error

### Finding 5: Computed key injection on foreign Error instances
- **Category**: C (Instance Property Injection)
- **File**: `node_modules/http-errors/index.js`
- **Line(s)**: 98–101
- **Code**:
  ```js
  for (var key in props) {
    if (key !== 'status' && key !== 'statusCode') {
      err[key] = props[key]
    }
  }
  ```
- **What it does**: When `createError()` receives an existing Error object (not one it created), it injects arbitrary properties from the `props` argument onto that foreign Error instance via computed keys. The caller controls which keys are injected.
- **Object affected**: Foreign `Error` instance passed by the caller
- **Severity**: Medium — computed key injection allows arbitrary property injection on foreign objects; higher risk than static property assignment
- **v6 recommendation**: Consider using a wrapper Error or a WeakMap for additional metadata rather than injecting onto the foreign error

## Transitive Dependencies

| Dependency | Version | Findings |
|---|---|---|
| setprototypeof | 1.2.0 | Polyfill for `Object.setPrototypeOf` — delegates to native. No own monkeypatching beyond providing the utility |
| inherits | 2.0.4 | Standard `util.inherits` polyfill — sets up prototype chains for constructor functions. No monkeypatching of foreign objects |
| toidentifier | 1.0.1 | Pure string transformation function. No findings |
| depd | 2.0.0 | See `09-depd.md` |
| statuses | 2.0.2 | None |

### setprototypeof@1.2.0 — Detail
- **File**: `index.js` (14 lines)
- **Code**: `module.exports = Object.setPrototypeOf || ... setProtoOf(obj, proto) { obj.__proto__ = proto }`
- This is a polyfill that provides `Object.setPrototypeOf` for environments that lack it. It is a tool, not a monkeypatch itself. The monkeypatch happens at the call site (Finding 1).

### inherits@2.0.4 — Detail
- **File**: `inherits.js` / `inherits_browser.js`
- Delegates to `util.inherits` when available. Otherwise uses `Object.create(superCtor.prototype)` to set up the prototype chain. Only modifies the constructor's own `.prototype` property — does NOT modify `Error.prototype` or any other foreign prototype.

## Summary
- **Total findings**: 5
- **Critical**: 0, **High**: 0, **Medium**: 1, **Low**: 1, **Informational**: 3
- Findings 1-3 are standard JavaScript error subclass construction patterns operating on `http-errors`' own objects. They are informational — the prototype manipulation is necessary for `instanceof` checks to work correctly.
- Finding 4 modifies a potentially-foreign Error object (an Error passed by the caller) with static keys, and this is the explicit contract of the `createError()` API.
- Finding 5 uses computed keys to inject arbitrary caller-controlled properties onto foreign Error instances — higher risk than Finding 4's static keys.
- **Recommendations for v6**: Migrate to ES6 `class ... extends Error` syntax to eliminate `setPrototypeOf` and `inherits` usage. Consider wrapping rather than mutating foreign errors in `createError()`.
