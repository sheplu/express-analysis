# on-finished v2.4.2 — Pass A Candidate Ledger

Commit: `9a73f9c1c0b7a17c84b7d68ac5212b11a272cd6a`

---

## C-001 — Per-instance override of `res.assignSocket`

| Field | Value |
|-------|-------|
| **Object** | Individual `ServerResponse` instance (`res`) |
| **Property** | `assignSocket` |
| **Operation** | Own-property assignment (`res.assignSocket = ...`) shadows the inherited `ServerResponse.prototype.assignSocket` |
| **Location** | `$PACKAGE_ROOT/index.js` lines 189-199, function `patchAssignSocket(res, callback)` |
| **Verdict** | **CONFIRMED MONKEYPATCH** |

### Code

```js
function patchAssignSocket (res, callback) {
  var assignSocket = res.assignSocket           // capture prototype method
  if (typeof assignSocket !== 'function') return // guard
  res.assignSocket = function _assignSocket (socket) {  // shadow with own property
    assignSocket.call(this, socket)              // call original
    callback(socket)                             // invoke onSocket callback
  }
}
```

### Execution chain

```
onFinished(msg, listener)           — index.js:46
  -> attachListener(msg, wrap(listener))  — index.js:53
    -> attachFinishedListener(msg, attached)  — index.js:148
      -> [if msg.socket === undefined]       — index.js:128
        -> patchAssignSocket(msg, onSocket)  — index.js:130
          -> res.assignSocket = ...          — index.js:195 (THE WRITE)
```

### Activation conditions
1. `onFinished()` is called with a message object
2. The message is not already finished (`isFinished(msg)` returns false)
3. `msg.socket` is `undefined` at the point of check (line 128) — note that line 119 checks `msg.socket` first and calls `onSocket` directly if truthy, then line 126 registers `msg.on('socket', onSocket)`, then line 128 re-checks `msg.socket === undefined`
4. `res.assignSocket` is a function (the guard at line 192)

In modern Node.js (>= 0.10), `ServerResponse` objects receive their socket before the request handler is called, so `msg.socket` is typically set. This code path is annotated as a "node.js 0.8 patch". On modern Node.js, this patch is **effectively dead code** but remains reachable for any object passed to `onFinished()` that lacks a `.socket` property.

### Scope
- **Per-instance**: sets an own property on the specific `res` object. Does NOT modify `ServerResponse.prototype`.
- **Permanent**: the own property persists for the lifetime of the `res` object. There is no cleanup/restore path.

### Node.js cross-reference
- `ServerResponse.prototype.assignSocket` is defined at `$NODEJS_SOURCE/lib/internal/http/server.js:312`
- It sets `socket._httpMessage = this`, attaches `'close'` listener, sets `this.socket = socket`, emits `'socket'` event, and calls `this._flush()`
- The patched version calls the original via `.call(this, socket)` then invokes `callback(socket)` which triggers `onSocket(socket)` to set up event listeners for finish detection
- Called by the HTTP server at `$NODEJS_SOURCE/lib/internal/http/server.js:1275` and `:1410`

### Risk assessment
- **Low risk on modern Node.js**: effectively dead code due to socket being assigned before handler runs
- **If triggered**: per-instance only, calls original faithfully, adds a callback invocation. No semantic change to `assignSocket` behavior.
- **Not restorable**: no code path deletes the own property after it is set.

---

## C-002 — Dynamic property `__onFinished` on message objects

| Field | Value |
|-------|-------|
| **Object** | Any `msg` object passed to `onFinished()` (typically `IncomingMessage` or `ServerResponse`) |
| **Property** | `__onFinished` |
| **Operation** | Own-property assignment (`msg.__onFinished = createListener(msg)`) and deletion (`msg.__onFinished = null`) |
| **Location** | `$PACKAGE_ROOT/index.js` lines 143-147 (write), line 164 (nullify) |
| **Verdict** | **CONFIRMED INSTANCE MUTATION** (expando property, not a monkeypatch of core API) |

### Code

```js
// Write (line 147):
attached = msg.__onFinished = createListener(msg)

// Cleanup (line 164):
if (msg.__onFinished === listener) msg.__onFinished = null
```

### Execution chain

```
onFinished(msg, listener)                — index.js:46
  -> attachListener(msg, wrap(listener)) — index.js:53
    -> msg.__onFinished = createListener(msg) — index.js:147 (THE WRITE)
```

### Activation conditions
1. `onFinished()` is called with a message object
2. Message is not already finished
3. `msg.__onFinished` does not already have a `.queue` array (first call for this msg)

### Scope
- **Per-instance**: sets an own property on the specific `msg` object
- **Self-cleaning**: set to `null` when the listener fires (line 164)
- **Convention**: double-underscore prefix `__onFinished` marks it as library-internal. Not a standard Node.js property.

### Risk assessment
- **Low risk**: expando property on individual objects, not a prototype mutation
- **Naming collision possible**: any code using `__onFinished` on the same object would conflict
- **Self-cleaning**: property is nulled once finished callback fires

---

## C-003 — `wrap(fn)` creates AsyncResource wrapper

| Field | Value |
|-------|-------|
| **Object** | N/A (creates new objects only) |
| **Property** | N/A |
| **Operation** | `new asyncHooks.AsyncResource(...)` then `res.runInAsyncScope.bind(res, fn, null)` |
| **Location** | `$PACKAGE_ROOT/index.js` lines 220-235, function `wrap(fn)` |
| **Verdict** | **NOT A PATCH** — creates new objects, no mutation |

### Analysis
- Creates a new `AsyncResource` instance (not mutating an existing one)
- Returns a new bound function wrapping the original callback
- Does not modify any prototype, global, or core module
- Uses `require('async_hooks')` from core — read-only

---

## C-004 — Event listener registration via `ee-first` and `msg.on()`

| Field | Value |
|-------|-------|
| **Object** | `msg` and `socket` EventEmitter instances |
| **Property** | Internal listener arrays (via `.on()` / `.removeListener()`) |
| **Operation** | Standard EventEmitter API: `.on('end', ...)`, `.on('finish', ...)`, `.on('error', ...)`, `.on('close', ...)`, `.on('socket', ...)` |
| **Location** | `$PACKAGE_ROOT/index.js` lines 106, 116, 126; `$PACKAGE_ROOT/node_modules/ee-first/index.js` line 43 |
| **Verdict** | **NOT A PATCH** — standard API usage |

### Analysis
- Uses `.on()` to add event listeners — standard and expected usage
- Uses `.removeListener()` to clean up — standard cleanup
- `ee-first` provides a utility for "first event wins" with cleanup via `.cancel()`
- No monkeypatching of EventEmitter.prototype or any other shared object

---

## Summary Table

| ID | Target | Operation | Scope | Verdict |
|----|--------|-----------|-------|---------|
| C-001 | `res.assignSocket` | Own-property shadow of prototype method | Per-instance, permanent | **CONFIRMED MONKEYPATCH** |
| C-002 | `msg.__onFinished` | Expando property add/nullify | Per-instance, self-cleaning | **CONFIRMED INSTANCE MUTATION** |
| C-003 | (new objects) | AsyncResource creation | N/A | Not a patch |
| C-004 | EventEmitter listeners | `.on()` / `.removeListener()` | Per-instance, cleaned up | Not a patch |
