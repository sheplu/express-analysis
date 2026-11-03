# Monkeypatch Audit: express@5.2.1 (Core)

## Package Overview
- **Name**: express
- **Version**: 5.2.1
- **Role**: HTTP web framework for Node.js
- **Source files audited**: `lib/express.js`, `lib/application.js`, `lib/request.js`, `lib/response.js`, `lib/utils.js`, `lib/view.js`
- **Risk tier**: **CRITICAL** — Express's architecture is fundamentally built on monkeypatching Node.js HTTP objects

---

## Findings

### Finding 1: IncomingMessage prototype extension object

- **Category**: B — Prototype Extension
- **File**: `lib/request.js`
- **Line(s)**: 30
- **Code**:
  ```js
  var req = Object.create(http.IncomingMessage.prototype)
  ```
- **What it does**: Creates a new object that inherits from Node.js `http.IncomingMessage.prototype`. This object becomes the target for all Express request methods and getters (Findings 8–26). It is later inserted into live `IncomingMessage` instances' prototype chains via `Object.setPrototypeOf` (Finding 5).
- **Object affected**: Creates an extension layer over `http.IncomingMessage.prototype`
- **Node.js cross-reference**:
  - File: `lib/_http_incoming.js`, line 112
  - `ObjectSetPrototypeOf(IncomingMessage.prototype, Readable.prototype)` — Node.js chains IncomingMessage → Readable → Stream → EventEmitter. Express inserts its own layer into this chain.
- **Severity**: High
- **v6 recommendation**: Replace with a composition-based approach where Express request helpers are standalone functions or a wrapper object, rather than injecting into the IncomingMessage prototype chain.

---

### Finding 2: ServerResponse prototype extension object

- **Category**: B — Prototype Extension
- **File**: `lib/response.js`
- **Line(s)**: 43
- **Code**:
  ```js
  var res = Object.create(http.ServerResponse.prototype)
  ```
- **What it does**: Creates a new object that inherits from Node.js `http.ServerResponse.prototype`. This object becomes the target for all Express response methods (Findings 27–47). It is later inserted into live `ServerResponse` instances' prototype chains via `Object.setPrototypeOf` (Finding 6).
- **Object affected**: Creates an extension layer over `http.ServerResponse.prototype`
- **Node.js cross-reference**:
  - File: `lib/_http_server.js`, line 259
  - `ObjectSetPrototypeOf(ServerResponse.prototype, OutgoingMessage.prototype)` — Node.js chains ServerResponse → OutgoingMessage → Stream → EventEmitter. Express inserts its own layer.
- **Severity**: High
- **v6 recommendation**: Same as Finding 1 — move to composition.

---

### Finding 3: Mixin of EventEmitter.prototype onto app function

- **Category**: D — Property Descriptor Copying
- **File**: `lib/express.js`
- **Line(s)**: 41
- **Code**:
  ```js
  mixin(app, EventEmitter.prototype, false);
  ```
- **What it does**: Uses `merge-descriptors` to copy **all** property descriptors (including getters, setters, non-enumerable properties) from `EventEmitter.prototype` onto the `app` function object. This makes a plain function behave as an `EventEmitter` without actually inheriting from it or being constructed as one.
- **Object affected**: The `app` function object (not a built-in, but receives built-in methods)
- **Node.js cross-reference**:
  - `EventEmitter` is defined in `lib/events.js`. Its prototype has `.on()`, `.once()`, `.emit()`, `.removeListener()`, `.addListener()`, `.removeAllListeners()`, `.setMaxListeners()`, `.getMaxListeners()`, `.listeners()`, `.rawListeners()`, `.listenerCount()`, `.prependListener()`, `.prependOnceListener()`, `.eventNames()`.
  - All of these are copied onto a plain function object.
- **Severity**: Medium
- **v6 recommendation**: Use proper class inheritance (`class App extends EventEmitter`) or `Object.setPrototypeOf(app, EventEmitter.prototype)` instead of descriptor copying.

---

### Finding 4: Mixin of application prototype onto app function

- **Category**: D — Property Descriptor Copying
- **File**: `lib/express.js`
- **Line(s)**: 42
- **Code**:
  ```js
  mixin(app, proto, false);
  ```
- **What it does**: Uses `merge-descriptors` to copy all Express application methods (`.use()`, `.set()`, `.get()`, `.listen()`, `.engine()`, `.param()`, `.route()`, `.all()`, `.render()`, `.enable()`, `.disable()`, `.enabled()`, `.disabled()`, `.path()`, HTTP verb methods) onto the `app` function object.
- **Object affected**: The `app` function object
- **Node.js cross-reference**: N/A — `proto` is Express's own `application.js` module exports
- **Severity**: Medium
- **v6 recommendation**: Same as Finding 3 — proper class-based approach.

---

### Finding 5: Runtime prototype swapping on req (per-request)

- **Category**: A — Prototype Chain Manipulation
- **File**: `lib/application.js`
- **Line(s)**: 169
- **Code**:
  ```js
  Object.setPrototypeOf(req, this.request)
  ```
- **What it does**: On **every incoming HTTP request**, inside `app.handle()`, Express replaces the prototype of the live `http.IncomingMessage` instance. After this call, `req`'s prototype chain becomes: `req` → `app.request` → `req` (from request.js) → `http.IncomingMessage.prototype` → `Readable.prototype` → `Stream.prototype` → `EventEmitter.prototype`. This gives the request object access to all Express-added methods and getters.
- **Object affected**: Every live `http.IncomingMessage` instance that passes through Express
- **Node.js cross-reference**:
  - File: `lib/_http_incoming.js`, lines 61–111
  - The original prototype chain is `IncomingMessage instance` → `IncomingMessage.prototype` → `Readable.prototype`. Express dynamically rewrites this on every request.
- **Severity**: **Critical** — this is a per-request mutation of Node.js core objects, has performance implications (V8 deoptimizes objects after `setPrototypeOf`), and can cause subtle bugs if other middleware or libraries check prototype identity.
- **v6 recommendation**: Eliminate `Object.setPrototypeOf` calls. Use a separate wrapper/context object or pass Express-specific properties via a `locals`-style approach.

---

### Finding 6: Runtime prototype swapping on res (per-request)

- **Category**: A — Prototype Chain Manipulation
- **File**: `lib/application.js`
- **Line(s)**: 170
- **Code**:
  ```js
  Object.setPrototypeOf(res, this.response)
  ```
- **What it does**: Same as Finding 5 but for the response object. On every incoming request, Express replaces the prototype of the live `http.ServerResponse` instance.
- **Object affected**: Every live `http.ServerResponse` instance that passes through Express
- **Node.js cross-reference**:
  - File: `lib/_http_server.js`, lines 215–260
  - The original prototype chain is `ServerResponse instance` → `ServerResponse.prototype` → `OutgoingMessage.prototype`. Express dynamically rewrites this.
- **Severity**: **Critical**
- **v6 recommendation**: Same as Finding 5.

---

### Finding 7: Property injection — req.res (per-request)

- **Category**: C — Instance Property Injection
- **File**: `lib/application.js`
- **Line(s)**: 165
- **Code**:
  ```js
  req.res = res;
  ```
- **What it does**: Adds a `res` property directly to the `http.IncomingMessage` instance, creating a circular reference between request and response. Node.js's `IncomingMessage` does not natively have a `.res` property.
- **Object affected**: `http.IncomingMessage` instance
- **Node.js cross-reference**:
  - File: `lib/_http_incoming.js`, lines 61–111 — constructor does not define `.res`
  - No native `.res` exists on `IncomingMessage`
- **Severity**: Medium
- **v6 recommendation**: Pass the response object through function arguments or a context object instead of injecting it onto `req`.

---

### Finding 8: Property injection — res.req (per-request)

- **Category**: C — Instance Property Injection
- **File**: `lib/application.js`
- **Line(s)**: 166
- **Code**:
  ```js
  res.req = req;
  ```
- **What it does**: Sets `res.req` to the request object. **However, Node.js already sets `this.req = req` in the `ServerResponse` constructor** (see cross-reference). Express's assignment overwrites the value Node.js already set.
- **Object affected**: `http.ServerResponse` instance
- **Node.js cross-reference**:
  - File: `lib/_http_server.js`, line 224
  - `this.req = req;` — Node.js sets this in the ServerResponse constructor
  - **This is a redundant overwrite** — Express sets the same property to the same value that Node.js already set. In practice it's a no-op but represents unnecessary mutation.
- **Severity**: Low (redundant overwrite)
- **v6 recommendation**: Remove this assignment — Node.js already provides `res.req`. Verify no Express code depends on timing differences between Node.js's constructor assignment and Express's `app.handle()` assignment.

---

### Finding 9: Property injection — res.locals (per-request)

- **Category**: C — Instance Property Injection
- **File**: `lib/application.js`
- **Line(s)**: 173–174
- **Code**:
  ```js
  if (!res.locals) {
    res.locals = Object.create(null);
  }
  ```
- **What it does**: Adds a `locals` property to the `http.ServerResponse` instance. This is an Express-specific concept (template data bag) with no Node.js equivalent.
- **Object affected**: `http.ServerResponse` instance
- **Node.js cross-reference**:
  - File: `lib/_http_server.js` — no `.locals` property exists natively on ServerResponse
- **Severity**: Medium
- **v6 recommendation**: Move `locals` to a separate context object rather than injecting onto the response.

---

### Finding 10: Prototype chain inheritance on mount — request

- **Category**: A — Prototype Chain Manipulation
- **File**: `lib/application.js`
- **Line(s)**: 118
- **Code**:
  ```js
  Object.setPrototypeOf(this.request, parent.request)
  ```
- **What it does**: When a sub-app is mounted (via `app.use(subApp)`), the sub-app's request prototype is chained to the parent app's request prototype via `Object.setPrototypeOf`. This allows sub-apps to inherit parent app's request extensions.
- **Object affected**: Express request prototype object (derived from `http.IncomingMessage.prototype`)
- **Node.js cross-reference**: N/A — this operates on Express's own prototype objects, not directly on Node.js objects. But those objects are part of a chain that will be injected into live IncomingMessage instances.
- **Severity**: Medium
- **v6 recommendation**: Eliminate prototype chain manipulation; use explicit configuration inheritance.

---

### Finding 11: Prototype chain inheritance on mount — response

- **Category**: A — Prototype Chain Manipulation
- **File**: `lib/application.js`
- **Line(s)**: 119
- **Code**:
  ```js
  Object.setPrototypeOf(this.response, parent.response)
  ```
- **What it does**: Same as Finding 10 but for the response prototype.
- **Object affected**: Express response prototype object (derived from `http.ServerResponse.prototype`)
- **Severity**: Medium
- **v6 recommendation**: Same as Finding 10.

---

### Finding 12: Prototype chain inheritance on mount — engines

- **Category**: A — Prototype Chain Manipulation
- **File**: `lib/application.js`
- **Line(s)**: 120
- **Code**:
  ```js
  Object.setPrototypeOf(this.engines, parent.engines)
  ```
- **What it does**: Chains sub-app's engines object to parent's engines, allowing template engine inheritance. The `engines` object is created via `Object.create(null)` (line 63), so this is Express-internal, but uses `Object.setPrototypeOf` as the inheritance mechanism.
- **Object affected**: Express-internal `engines` object (not a Node.js built-in)
- **Severity**: Low (Express-internal objects only)
- **v6 recommendation**: Use explicit merging or configuration lookup instead of prototype chaining for settings objects.

---

### Finding 13: Prototype chain inheritance on mount — settings

- **Category**: A — Prototype Chain Manipulation
- **File**: `lib/application.js`
- **Line(s)**: 121
- **Code**:
  ```js
  Object.setPrototypeOf(this.settings, parent.settings)
  ```
- **What it does**: Chains sub-app's settings to parent's settings for inheritance lookup.
- **Object affected**: Express-internal `settings` object
- **Severity**: Low (Express-internal objects only)
- **v6 recommendation**: Same as Finding 12.

---

### Finding 14: Prototype restoration on sub-app exit — request

- **Category**: A — Prototype Chain Manipulation
- **File**: `lib/application.js`
- **Line(s)**: 233
- **Code**:
  ```js
  Object.setPrototypeOf(req, orig.request)
  ```
- **What it does**: After a sub-app finishes handling a request, Express swaps the `req` prototype back to the parent app's request prototype. This is the "undo" for the prototype swap that happened when the sub-app's `app.handle()` was called.
- **Object affected**: Live `http.IncomingMessage` instance
- **Severity**: High — additional `Object.setPrototypeOf` call per sub-app traversal
- **v6 recommendation**: Eliminate by removing prototype swapping entirely.

---

### Finding 15: Prototype restoration on sub-app exit — response

- **Category**: A — Prototype Chain Manipulation
- **File**: `lib/application.js`
- **Line(s)**: 234
- **Code**:
  ```js
  Object.setPrototypeOf(res, orig.response)
  ```
- **What it does**: Same as Finding 14 but for the response object.
- **Object affected**: Live `http.ServerResponse` instance
- **Severity**: High
- **v6 recommendation**: Same as Finding 14.

---

### Finding 16: Object.create wrapping — app.request with `app` property

- **Category**: B — Prototype Extension
- **File**: `lib/express.js`
- **Line(s)**: 45–47
- **Code**:
  ```js
  app.request = Object.create(req, {
    app: { configurable: true, enumerable: true, writable: true, value: app }
  })
  ```
- **What it does**: Creates yet another prototype layer wrapping the `req` object (from `request.js`), adding an `app` property. The full chain becomes: `app.request` → `req` (request.js) → `http.IncomingMessage.prototype` → `Readable.prototype`. The `app` property makes `req.app` available inside request handlers.
- **Object affected**: Extends the chain that will be injected into `http.IncomingMessage` instances
- **Node.js cross-reference**: N/A — `app` property does not exist on IncomingMessage natively
- **Severity**: Medium
- **v6 recommendation**: Pass `app` reference through function arguments or a context object.

---

### Finding 17: Object.create wrapping — app.response with `app` property

- **Category**: B — Prototype Extension
- **File**: `lib/express.js`
- **Line(s)**: 50–52
- **Code**:
  ```js
  app.response = Object.create(res, {
    app: { configurable: true, enumerable: true, writable: true, value: app }
  })
  ```
- **What it does**: Same as Finding 16 but for the response side. Chain becomes: `app.response` → `res` (response.js) → `http.ServerResponse.prototype` → `OutgoingMessage.prototype`.
- **Object affected**: Extends the chain that will be injected into `http.ServerResponse` instances
- **Severity**: Medium
- **v6 recommendation**: Same as Finding 16.

---

### Finding 18: req.get() / req.header() — method on IncomingMessage chain

- **Category**: B — Prototype Extension
- **File**: `lib/request.js`
- **Line(s)**: 63–83
- **Code**:
  ```js
  req.get =
  req.header = function header(name) {
    // ...
    return this.headers[lc];
  };
  ```
- **What it does**: Adds a `get()` / `header()` method to the IncomingMessage prototype chain. Provides a convenience wrapper around `this.headers[name]` with special-casing for `Referrer`/`Referer`.
- **Object affected**: `http.IncomingMessage` instances (via prototype chain injection)
- **Node.js cross-reference**: `IncomingMessage` has no `.get()` or `.header()` method. The `.headers` getter is defined at `lib/_http_incoming.js` line 125.
- **Severity**: Medium
- **v6 recommendation**: Provide as a standalone utility function rather than a prototype method.

---

### Finding 19: req.accepts() — method on IncomingMessage chain

- **Category**: B — Prototype Extension
- **File**: `lib/request.js`
- **Line(s)**: 127–130
- **Code**:
  ```js
  req.accepts = function(){
    var accept = accepts(this);
    return accept.types.apply(accept, arguments);
  };
  ```
- **What it does**: Adds content negotiation method to the IncomingMessage chain.
- **Object affected**: `http.IncomingMessage` instances
- **Node.js cross-reference**: No `.accepts()` on IncomingMessage natively.
- **Severity**: Medium

---

### Finding 20: req.acceptsEncodings() — method on IncomingMessage chain

- **Category**: B — Prototype Extension
- **File**: `lib/request.js`
- **Line(s)**: 140–143
- **Code**:
  ```js
  req.acceptsEncodings = function(){
    var accept = accepts(this);
    return accept.encodings.apply(accept, arguments);
  };
  ```
- **Object affected**: `http.IncomingMessage` instances
- **Severity**: Medium

---

### Finding 21: req.acceptsCharsets() — method on IncomingMessage chain

- **Category**: B — Prototype Extension
- **File**: `lib/request.js`
- **Line(s)**: 171–174
- **Object affected**: `http.IncomingMessage` instances
- **Severity**: Medium

---

### Finding 22: req.acceptsLanguages() — method on IncomingMessage chain

- **Category**: B — Prototype Extension
- **File**: `lib/request.js`
- **Line(s)**: 185–187
- **Object affected**: `http.IncomingMessage` instances
- **Severity**: Medium

---

### Finding 23: req.range() — method on IncomingMessage chain

- **Category**: B — Prototype Extension
- **File**: `lib/request.js`
- **Line(s)**: 214–218
- **Object affected**: `http.IncomingMessage` instances
- **Severity**: Medium

---

### Finding 24: req.is() — method on IncomingMessage chain

- **Category**: B — Prototype Extension
- **File**: `lib/request.js`
- **Line(s)**: 269–281
- **Object affected**: `http.IncomingMessage` instances
- **Severity**: Medium

---

### Finding 25: req.query — getter on IncomingMessage chain

- **Category**: B — Prototype Extension (via `Object.defineProperty`)
- **File**: `lib/request.js`
- **Line(s)**: 230–241 (defined via `defineGetter` helper at lines 521–527)
- **Code**:
  ```js
  defineGetter(req, 'query', function query(){
    var queryparse = this.app.get('query parser fn');
    if (!queryparse) { return Object.create(null); }
    var querystring = parse(this).query;
    return queryparse(querystring);
  });
  ```
  Helper:
  ```js
  function defineGetter(obj, name, getter) {
    Object.defineProperty(obj, name, {
      configurable: true,
      enumerable: true,
      get: getter
    });
  }
  ```
- **What it does**: Uses `Object.defineProperty` to add a `query` getter to the req object (which is in the IncomingMessage prototype chain). The getter calls `parseurl(this)` which caches the result on the request instance (see `parseurl` audit). Also depends on `this.app` being available (via Finding 16).
- **Object affected**: `http.IncomingMessage` instances
- **Node.js cross-reference**: IncomingMessage has no `.query` property. The `.url` property (line 95 of `_http_incoming.js`) contains the raw URL including query string.
- **Severity**: Medium

---

### Finding 26: req.protocol — getter on IncomingMessage chain

- **Category**: B — Prototype Extension (via `Object.defineProperty`)
- **File**: `lib/request.js`
- **Line(s)**: 297–315
- **What it does**: Adds a `protocol` getter that returns `'http'` or `'https'` based on `this.socket.encrypted` and the `X-Forwarded-Proto` header.
- **Object affected**: `http.IncomingMessage` instances
- **Node.js cross-reference**: IncomingMessage has no `.protocol` property.
- **Severity**: Medium

---

### Finding 27: req.secure — getter on IncomingMessage chain

- **Category**: B — Prototype Extension (via `Object.defineProperty`)
- **File**: `lib/request.js`
- **Line(s)**: 326–328
- **Object affected**: `http.IncomingMessage` instances
- **Severity**: Medium

---

### Finding 28: req.ip — getter on IncomingMessage chain

- **Category**: B — Prototype Extension (via `Object.defineProperty`)
- **File**: `lib/request.js`
- **Line(s)**: 340–343
- **Object affected**: `http.IncomingMessage` instances
- **Severity**: Medium

---

### Finding 29: req.ips — getter on IncomingMessage chain

- **Category**: B — Prototype Extension (via `Object.defineProperty`)
- **File**: `lib/request.js`
- **Line(s)**: 357–366
- **Object affected**: `http.IncomingMessage` instances
- **Severity**: Medium

---

### Finding 30: req.subdomains — getter on IncomingMessage chain

- **Category**: B — Prototype Extension (via `Object.defineProperty`)
- **File**: `lib/request.js`
- **Line(s)**: 383–394
- **Object affected**: `http.IncomingMessage` instances
- **Severity**: Medium

---

### Finding 31: req.path — getter on IncomingMessage chain

- **Category**: B — Prototype Extension (via `Object.defineProperty`)
- **File**: `lib/request.js`
- **Line(s)**: 403–405
- **What it does**: Returns `parse(this).pathname`. Note: `parse` is `parseurl`, which caches the parsed URL on the `req` object as `req._parsedUrl` (documented in `parseurl` audit).
- **Object affected**: `http.IncomingMessage` instances
- **Severity**: Medium

---

### Finding 32: req.host — getter on IncomingMessage chain

- **Category**: B — Prototype Extension (via `Object.defineProperty`)
- **File**: `lib/request.js`
- **Line(s)**: 418–431
- **Object affected**: `http.IncomingMessage` instances
- **Severity**: Medium

---

### Finding 33: req.hostname — getter on IncomingMessage chain

- **Category**: B — Prototype Extension (via `Object.defineProperty`)
- **File**: `lib/request.js`
- **Line(s)**: 444–458
- **Object affected**: `http.IncomingMessage` instances
- **Severity**: Medium

---

### Finding 34: req.fresh — getter on IncomingMessage chain

- **Category**: B — Prototype Extension (via `Object.defineProperty`)
- **File**: `lib/request.js`
- **Line(s)**: 469–486
- **What it does**: Checks if the request is "fresh" (cache-valid). Depends on `this.res` (injected by Finding 7) and calls `res.get('ETag')` and `res.get('Last-Modified')` which are Express-added response methods (Finding 42).
- **Object affected**: `http.IncomingMessage` instances
- **Node.js cross-reference**: IncomingMessage has no `.fresh` property. This getter cross-references the response object's Express-added `.get()` method, creating a tight coupling between two independently monkeypatched objects.
- **Severity**: Medium

---

### Finding 35: req.stale — getter on IncomingMessage chain

- **Category**: B — Prototype Extension (via `Object.defineProperty`)
- **File**: `lib/request.js`
- **Line(s)**: 497–499
- **Object affected**: `http.IncomingMessage` instances
- **Severity**: Medium

---

### Finding 36: req.xhr — getter on IncomingMessage chain

- **Category**: B — Prototype Extension (via `Object.defineProperty`)
- **File**: `lib/request.js`
- **Line(s)**: 508–511
- **Object affected**: `http.IncomingMessage` instances
- **Severity**: Medium

---

### Finding 37: res.status() — method on ServerResponse chain

- **Category**: B — Prototype Extension
- **File**: `lib/response.js`
- **Line(s)**: 65–77
- **What it does**: Adds a `status()` method that sets `this.statusCode` and returns `this` for chaining.
- **Object affected**: `http.ServerResponse` instances
- **Node.js cross-reference**: `ServerResponse.prototype.statusCode = 200` at `lib/_http_server.js` line 285 defines it as a data property. Express wraps the setter in a method. No naming conflict.
- **Severity**: Medium

---

### Finding 38: res.links() — method on ServerResponse chain

- **Category**: B — Prototype Extension
- **File**: `lib/response.js`
- **Line(s)**: 98–111
- **Object affected**: `http.ServerResponse` instances
- **Severity**: Medium

---

### Finding 39: res.send() — method on ServerResponse chain

- **Category**: B — Prototype Extension
- **File**: `lib/response.js`
- **Line(s)**: 126–222
- **What it does**: The core Express response method. Handles string/buffer/object bodies, sets Content-Type and Content-Length, generates ETags, checks freshness, strips headers for 204/304. Calls `this.end()` (Node.js native) to actually send.
- **Object affected**: `http.ServerResponse` instances
- **Node.js cross-reference**: Node.js has `.end()` (OutgoingMessage, `lib/_http_outgoing.js` line 1291) and `.write()` (line 1029) but no `.send()`.
- **Severity**: Medium

---

### Finding 40: res.json() — method on ServerResponse chain

- **Category**: B — Prototype Extension
- **File**: `lib/response.js`
- **Line(s)**: 236–250
- **Object affected**: `http.ServerResponse` instances
- **Severity**: Medium

---

### Finding 41: res.jsonp() — method on ServerResponse chain

- **Category**: B — Prototype Extension
- **File**: `lib/response.js`
- **Line(s)**: 264–308
- **Object affected**: `http.ServerResponse` instances
- **Severity**: Medium

---

### Finding 42: res.sendStatus() — method on ServerResponse chain

- **Category**: B — Prototype Extension
- **File**: `lib/response.js`
- **Line(s)**: 325–332
- **Object affected**: `http.ServerResponse` instances
- **Severity**: Medium

---

### Finding 43: res.sendFile() — method on ServerResponse chain

- **Category**: B — Prototype Extension
- **File**: `lib/response.js`
- **Line(s)**: 375–417
- **Object affected**: `http.ServerResponse` instances
- **Severity**: Medium

---

### Finding 44: res.download() — method on ServerResponse chain

- **Category**: B — Prototype Extension
- **File**: `lib/response.js`
- **Line(s)**: 437–486
- **Object affected**: `http.ServerResponse` instances
- **Severity**: Medium

---

### Finding 45: res.contentType() / res.type() — method on ServerResponse chain

- **Category**: B — Prototype Extension
- **File**: `lib/response.js`
- **Line(s)**: 507–514
- **Object affected**: `http.ServerResponse` instances
- **Severity**: Medium

---

### Finding 46: res.format() — method on ServerResponse chain

- **Category**: B — Prototype Extension
- **File**: `lib/response.js`
- **Line(s)**: 573–598
- **Object affected**: `http.ServerResponse` instances
- **Severity**: Medium

---

### Finding 47: res.attachment() — method on ServerResponse chain

- **Category**: B — Prototype Extension
- **File**: `lib/response.js`
- **Line(s)**: 608–617
- **Object affected**: `http.ServerResponse` instances
- **Severity**: Medium

---

### Finding 48: res.append() — method on ServerResponse chain

- **Category**: B — Prototype Extension
- **File**: `lib/response.js`
- **Line(s)**: 634–646
- **Object affected**: `http.ServerResponse` instances
- **Severity**: Medium

---

### Finding 49: res.set() / res.header() — method on ServerResponse chain

- **Category**: B — Prototype Extension
- **File**: `lib/response.js`
- **Line(s)**: 669–691
- **What it does**: Wraps Node.js's `this.setHeader()` with added features: charset auto-detection for Content-Type, object argument support for setting multiple headers at once.
- **Object affected**: `http.ServerResponse` instances
- **Node.js cross-reference**: Node.js has `OutgoingMessage.prototype.setHeader` at `lib/_http_outgoing.js` line 814. Express's `res.set()` wraps it — no naming conflict, but shadows the pattern.
- **Severity**: Medium

---

### Finding 50: res.get() — method on ServerResponse chain

- **Category**: B — Prototype Extension
- **File**: `lib/response.js`
- **Line(s)**: 701–703
- **Code**:
  ```js
  res.get = function(field){
    return this.getHeader(field);
  };
  ```
- **What it does**: Wraps Node.js's `this.getHeader()`.
- **Object affected**: `http.ServerResponse` instances
- **Node.js cross-reference**: Node.js has `OutgoingMessage.prototype.getHeader` at `lib/_http_outgoing.js` line 915.
- **Severity**: Medium

---

### Finding 51: res.clearCookie() — method on ServerResponse chain

- **Category**: B — Prototype Extension
- **File**: `lib/response.js`
- **Line(s)**: 714–721
- **Object affected**: `http.ServerResponse` instances
- **Severity**: Medium

---

### Finding 52: res.cookie() — method on ServerResponse chain

- **Category**: B — Prototype Extension
- **File**: `lib/response.js`
- **Line(s)**: 747–780
- **Object affected**: `http.ServerResponse` instances
- **Severity**: Medium

---

### Finding 53: res.location() — method on ServerResponse chain

- **Category**: B — Prototype Extension
- **File**: `lib/response.js`
- **Line(s)**: 796–798
- **Object affected**: `http.ServerResponse` instances
- **Severity**: Medium

---

### Finding 54: res.redirect() — method on ServerResponse chain

- **Category**: B — Prototype Extension
- **File**: `lib/response.js`
- **Line(s)**: 814–866
- **Object affected**: `http.ServerResponse` instances
- **Severity**: Medium

---

### Finding 55: res.vary() — method on ServerResponse chain

- **Category**: B — Prototype Extension
- **File**: `lib/response.js`
- **Line(s)**: 877–881
- **Object affected**: `http.ServerResponse` instances
- **Severity**: Medium

---

### Finding 56: res.render() — method on ServerResponse chain

- **Category**: B — Prototype Extension
- **File**: `lib/response.js`
- **Line(s)**: 896–920
- **Object affected**: `http.ServerResponse` instances
- **Severity**: Medium

---

### Not a Finding: utils.js

- **File**: `lib/utils.js`
- **Assessment**: No monkeypatching. All functions are pure utilities (`normalizeType`, `compileETag`, `compileQueryParser`, `compileTrust`, `setCharset`, `createETagGenerator`, `parseExtendedQueryString`). They operate on their own data, not on foreign objects.
- **Note**: `parseExtendedQueryString` calls `qs.parse(str, { allowPrototypes: true })` which has security implications (prototype pollution in parsed query objects) but does not monkeypatch anything.

---

### Not a Finding: view.js

- **File**: `lib/view.js`
- **Assessment**: No monkeypatching. `View` is a standalone constructor with its own prototype methods (`.lookup()`, `.render()`, `.resolve()`). It does not modify any Node.js built-ins.

---

### Not a Finding: Object.defineProperty on app's own properties

- **File**: `lib/application.js`
- **Line(s)**: 69–82, 102–105, 374–377
- **Assessment**: These `Object.defineProperty` calls operate on `this` (the app object itself) and `this.settings` (Express-internal). They are not monkeypatches because Express owns these objects.
  - Line 69: Lazy `router` getter on the app object
  - Line 102: `trustProxyDefaultSymbol` on `this.settings`
  - Line 374: Same symbol update in `app.set()`

### Finding 57: Sub-app mountpath injection
- **Category**: C (Instance Property Injection)
- **File**: `lib/application.js`
- **Line(s)**: 226
- **Code**: `fn.mountpath = path`
- **What it does**: When a sub-app is mounted via `app.use()`, Express injects a `mountpath` property directly onto the sub-app's function object
- **Object affected**: The sub-app function (another Express app instance, created by a different `createApplication()` call)
- **Severity**: Low (the sub-app is another Express instance, but it is a separate object not owned by the mounting app)
- **v6 recommendation**: Consider storing mount metadata in a WeakMap or internal registry rather than injecting onto the sub-app function

### Finding 58: Sub-app parent injection
- **Category**: C (Instance Property Injection)
- **File**: `lib/application.js`
- **Line(s)**: 227
- **Code**: `fn.parent = this`
- **What it does**: Injects a `parent` property onto the sub-app function, creating a reference back to the parent app
- **Object affected**: The sub-app function (another Express app instance)
- **Severity**: Low
- **v6 recommendation**: Same as Finding 57

---

## Summary

| Metric | Count |
|--------|-------|
| **Total findings** | **58** |
| Critical | 2 (Findings 5, 6 — per-request prototype swapping) |
| High | 4 (Findings 1, 2, 14, 15 — prototype chain construction and restoration) |
| Medium | 46 (Findings 3, 4, 7, 9, 10, 11, 16–56 — descriptor copying, property injection, prototype methods/getters) |
| Low | 6 (Findings 8, 12, 13, 57, 58 — redundant overwrite, internal-only prototype chaining, sub-app injection) |
| Informational | 0 |

### Breakdown by Category

| Category | Count | Description |
|----------|-------|-------------|
| A — Prototype Chain Manipulation | 8 | `Object.setPrototypeOf` calls (Findings 5, 6, 10–15) |
| B — Prototype Extension | 42 | Methods/getters added to IncomingMessage/ServerResponse chains (Findings 1, 2, 16–56) |
| C — Instance Property Injection | 5 | `req.res`, `res.req`, `res.locals`, `fn.mountpath`, `fn.parent` (Findings 7, 8, 9, 57, 58) |
| D — Property Descriptor Copying | 2 | `merge-descriptors` calls (Findings 3, 4) |
| E — Global Prototype Pollution | 0 | |
| F — Method Wrapping | 0 | |
| G — Private Property Access | 0 | |

### Per-Request Mutation Cost

On every HTTP request that flows through Express, the following mutations occur:
1. `Object.setPrototypeOf(req, ...)` — rewrites IncomingMessage prototype chain
2. `Object.setPrototypeOf(res, ...)` — rewrites ServerResponse prototype chain
3. `req.res = res` — injects property on IncomingMessage instance
4. `res.req = req` — overwrites Node.js-set property on ServerResponse instance
5. `res.locals = Object.create(null)` — injects property on ServerResponse instance

If sub-apps are involved, add 2 more `Object.setPrototypeOf` calls per sub-app boundary traversal.

### Key v6 Recommendations

1. **Eliminate `Object.setPrototypeOf`** on live req/res objects. This is the single most impactful change. V8 deoptimizes objects whose prototypes are changed after construction.
2. **Move to composition over inheritance** — wrap req/res in a context object that holds Express-specific methods rather than injecting them into Node.js objects.
3. **Remove `res.req = req`** — Node.js already sets this in the ServerResponse constructor.
4. **Replace `merge-descriptors` with proper class inheritance** for the app object.
5. **Make Express helpers standalone functions** that take req/res as arguments rather than being prototype methods that require `this` binding.
