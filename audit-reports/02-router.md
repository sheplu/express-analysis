# Monkeypatch Audit: router@2.2.0

## Package Overview
- **Name**: router
- **Version**: 2.2.0
- **Role in Express**: Core HTTP routing engine. Handles route matching, parameter extraction, middleware dispatch, and sub-router mounting. All route matching, parameter handling, and middleware dispatch flow through this package.
- **Source files audited**: `index.js`, `lib/layer.js`, `lib/route.js`
- **Risk tier**: MEDIUM

## Findings

### Finding 1: `req.next` — injected on every dispatch

- **Category**: C — Instance Property Injection
- **File**: `index.js`
- **Line**: 174
- **Code**:
  ```js
  req.next = next
  ```
- **What it does**: Assigns the router's internal `next` function directly onto the `req` (IncomingMessage) object. This allows downstream middleware to call `req.next()` to skip to the next route, though this is undocumented and rarely used directly.
- **Object affected**: `http.IncomingMessage` instance
- **Node.js cross-reference**:
  - `lib/_http_incoming.js` — `IncomingMessage` has no `.next` property
  - Conflict risk: None currently. No native `.next` exists.
- **Severity**: Medium
- **v6 recommendation**: Remove `req.next` injection. The `next` function is already available as the third argument to middleware. If needed, pass through a different mechanism (e.g., a Symbol-keyed property).

### Finding 2: `req.baseUrl` — set on every dispatch

- **Category**: C — Instance Property Injection
- **File**: `index.js`
- **Line**: 183
- **Code**:
  ```js
  req.baseUrl = parentUrl
  ```
- **What it does**: Sets `req.baseUrl` to the accumulated mount path of parent routers. Updated multiple times during request processing (also at lines 201, 332).
- **Object affected**: `http.IncomingMessage` instance
- **Node.js cross-reference**:
  - `lib/_http_incoming.js` — `IncomingMessage` has no `.baseUrl` property
  - Conflict risk: None currently
- **Severity**: Medium
- **v6 recommendation**: Move to a request-scoped context object or Symbol-keyed property rather than polluting the IncomingMessage instance.

### Finding 3: `req.originalUrl` — set on first dispatch

- **Category**: C — Instance Property Injection
- **File**: `index.js`
- **Line**: 184
- **Code**:
  ```js
  req.originalUrl = req.originalUrl || req.url
  ```
- **What it does**: Preserves the original URL before any path stripping by mounted sub-routers. Only set if not already present (first router to handle the request sets it).
- **Object affected**: `http.IncomingMessage` instance
- **Node.js cross-reference**:
  - `lib/_http_incoming.js` — `IncomingMessage` has `.url` (line 95) but no `.originalUrl`
  - Conflict risk: None currently
- **Severity**: Medium
- **v6 recommendation**: Same as Finding 2 — move to request-scoped context.

### Finding 4: `req.url` — mutated during sub-router dispatch

- **Category**: C — Instance Property Injection (mutation of existing property)
- **File**: `index.js`
- **Lines**: 195, 202, 323, 327
- **Code**:
  ```js
  // Line 195 - remove added slash
  req.url = req.url.slice(1)

  // Line 202 - restore altered req.url
  req.url = protohost + removed + req.url.slice(protohost.length)

  // Line 323 - trim prefix for sub-router
  req.url = protohost + req.url.slice(protohost.length + removed.length)

  // Line 327 - ensure leading slash
  req.url = '/' + req.url
  ```
- **What it does**: Temporarily modifies `req.url` to strip the matched prefix when dispatching into mounted sub-routers, then restores it via the `restore()` function when the sub-router completes.
- **Object affected**: `http.IncomingMessage` instance — overwrites the Node.js native `.url` property
- **Node.js cross-reference**:
  - `lib/_http_incoming.js` line 95: `this.url = ''` — set by Node.js in the constructor
  - Conflict risk: **Medium** — this overwrites a native Node.js property. Any code that reads `req.url` during sub-router dispatch sees the modified (prefix-stripped) version, not the original.
- **Severity**: Medium
- **v6 recommendation**: Instead of mutating `req.url`, compute a relative path and pass it through the routing context without altering the original request object.

### Finding 5: `req.route` — set when a route matches

- **Category**: C — Instance Property Injection
- **File**: `index.js` line 281, `lib/route.js` line 115
- **Code**:
  ```js
  // index.js:281
  if (route) {
    req.route = route
  }

  // route.js:115
  req.route = this
  ```
- **What it does**: Sets `req.route` to the matched `Route` object, giving middleware access to the route definition (path, methods, stack).
- **Object affected**: `http.IncomingMessage` instance
- **Node.js cross-reference**:
  - `lib/_http_incoming.js` — no `.route` property
  - Conflict risk: None currently
- **Severity**: Medium
- **v6 recommendation**: Move to request-scoped context or Symbol-keyed property.

### Finding 6: `req.params` — set on route match

- **Category**: C — Instance Property Injection
- **File**: `index.js`
- **Line**: 285–287
- **Code**:
  ```js
  req.params = self.mergeParams
    ? mergeParams(layer.params, parentParams)
    : layer.params
  ```
- **What it does**: Sets `req.params` to the extracted route parameters (e.g., `{ id: '123' }` for route `/:id`). Saved/restored via `restore()` (line 171) when exiting a router scope.
- **Object affected**: `http.IncomingMessage` instance
- **Node.js cross-reference**:
  - `lib/_http_incoming.js` — no `.params` property
  - Conflict risk: None currently
- **Severity**: Medium
- **v6 recommendation**: Move to request-scoped context or Symbol-keyed property.

### Finding 7: `restore()` function saves/restores req properties

- **Category**: C — Instance Property Injection (read + write)
- **File**: `index.js`
- **Lines**: 171, 673–688
- **Code**:
  ```js
  // Line 171
  let done = restore(callback, req, 'baseUrl', 'next', 'params')

  // Lines 673-688
  function restore (fn, obj) {
    const props = new Array(arguments.length - 2)
    const vals = new Array(arguments.length - 2)
    for (let i = 0; i < props.length; i++) {
      props[i] = arguments[i + 2]
      vals[i] = obj[props[i]]
    }
    return function () {
      for (let i = 0; i < props.length; i++) {
        obj[props[i]] = vals[i]
      }
      return fn.apply(this, arguments)
    }
  }
  ```
- **What it does**: Saves the current values of `req.baseUrl`, `req.next`, and `req.params` before sub-router dispatch, and restores them when the sub-router's done callback fires. This enables nested routers but relies on mutating `req` properties.
- **Object affected**: `http.IncomingMessage` instance
- **Node.js cross-reference**: N/A — properties being restored are all Express-injected
- **Severity**: Medium
- **v6 recommendation**: Integral to Finding 7 — addressing Findings 1–6 by using a context object would eliminate the need for this save/restore pattern.

### Finding 8: `Object.setPrototypeOf` on router function — internal use

- **Category**: A — Prototype Chain Manipulation (own objects)
- **File**: `index.js`
- **Line**: 64
- **Code**:
  ```js
  Object.setPrototypeOf(router, this)
  ```
- **What it does**: Sets the prototype of the newly created `router` function to `Router.prototype`, so it inherits `.handle()`, `.use()`, `.route()`, and HTTP method functions.
- **Object affected**: The `router` function object created by the `Router` constructor — this is an **own object**, not a foreign one
- **Node.js cross-reference**: N/A
- **Severity**: Low — this is `Object.setPrototypeOf` on the module's own object, not a foreign one
- **v6 recommendation**: Could be replaced with class syntax but is not a monkeypatch concern since the router object is created by this module.

### Finding 9: Computed property save/restore on req
- **Category**: C (Instance Property Injection)
- **File**: `node_modules/router/index.js`
- **Line(s)**: 679 (save), 685 (restore)
- **Code**:
  ```js
  vals[i] = obj[props[i]]    // save
  obj[props[i]] = vals[i]    // restore
  ```
  Called at line 171: `let done = restore(callback, req, 'baseUrl', 'next', 'params')`
- **What it does**: The `restore()` function saves property values from `req` before routing dispatch and restores them after, using computed property keys. This is the mechanism that enables the save/restore pattern across sub-app boundaries.
- **Object affected**: `http.IncomingMessage` instance (`req`)
- **Severity**: Medium — modifies foreign req properties via computed keys
- **v6 recommendation**: Consider using a dedicated context object for routing state rather than saving/restoring properties on req

### Verification (Triple-Check)

1. **Automated pattern match**: ✅ All `req.` assignments flagged by grep. `Object.setPrototypeOf` flagged. Computed property writes in `restore()` verified.
2. **Manual code reading**: ✅ All property injections happen inside `Router.prototype.handle()` which is called on every HTTP request. The `req` parameter is a Node.js `IncomingMessage` instance owned by the http module. Confirmed findings 1-7, 9 are foreign-object mutations; finding 8 is internal.
3. **Call-chain tracing**: ✅ `http.createServer(app)` → `app.handle(req, res)` → `this.router.handle(req, res, done)` → all `req.*` mutations occur within this call chain on every request.

## Transitive Dependencies

| Dependency | Version | Findings |
|---|---|---|
| path-to-regexp | 8.4.2 | 0 — `Object.defineProperty(exports, "__esModule", ...)` is only on its own exports object, not a monkeypatch |
| is-promise | 4.0.0 | 0 — pure type check function (`typeof obj.then === 'function'`), no mutations |
| parseurl | 1.3.3 | See [04-parseurl.md](./04-parseurl.md) — has its own findings |
| debug | 4.4.3 | 0 — logging utility, no foreign object mutation |
| depd | 2.0.0 | See [09-depd.md](./09-depd.md) |

## Summary
- **Total findings**: 9 (8 confirmed monkeypatches on foreign objects + 1 internal/low)
- Critical: 0, High: 0, Medium: 8, Low: 1, Informational: 0
- **v6 recommendations**:
  1. Introduce a request-scoped context object (e.g., `Symbol`-keyed or a `WeakMap`) to hold routing state (`params`, `route`, `baseUrl`, `originalUrl`, `next`) instead of injecting directly onto `req`
  2. Stop mutating `req.url` during sub-router dispatch — compute a relative path separately
  3. The `restore()` save/restore pattern becomes unnecessary once properties move off `req`
