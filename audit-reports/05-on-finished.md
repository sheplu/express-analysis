# Monkeypatch Audit: on-finished@2.4.1

## Package Overview
- **Name**: on-finished
- **Version**: 2.4.1
- **Role in Express**: Executes a callback when an HTTP request or response finishes or closes. Used in Express's `response.js` `sendfile()` helper to detect when the response completes or is aborted. Also used internally by `body-parser` and `finalhandler`.
- **Source files audited**: `index.js` (single file, ~200 lines)
- **Risk tier**: MEDIUM

## Findings

### Finding 1: `msg.__onFinished` — listener queue injected on msg

- **Category**: C — Instance Property Injection
- **File**: `index.js`
- **Lines**: 142–146
- **Code**:
  ```js
  function attachListener (msg, listener) {
    var attached = msg.__onFinished

    // create a private single listener with queue
    if (!attached || !attached.queue) {
      attached = msg.__onFinished = createListener(msg)
      attachFinishedListener(msg, attached)
    }

    attached.queue.push(listener)
  }
  ```
- **What it does**: Attaches a `__onFinished` property directly on the `msg` object (which is either an `http.IncomingMessage` or `http.ServerResponse` instance). This property holds a listener function with a `.queue` array of callbacks. Multiple calls to `onFinished(msg, cb)` on the same message reuse the same `__onFinished` listener, queuing callbacks.
- **Object affected**: `http.IncomingMessage` or `http.ServerResponse` instance
- **Node.js cross-reference**:
  - `lib/_http_incoming.js` — no `.__onFinished` property on `IncomingMessage`
  - `lib/_http_server.js` — no `.__onFinished` property on `ServerResponse`
  - Conflict risk: Low — double-underscore prefix makes collisions unlikely, but it's still a direct mutation of a Node.js-owned object
- **Severity**: Medium
- **v6 recommendation**: Use a `WeakMap<msg, listener>` to associate the listener queue with the message object, eliminating the property injection entirely.

### Finding 2: `msg.__onFinished` — cleaned up on listener fire

- **Category**: C — Instance Property Injection (cleanup)
- **File**: `index.js`
- **Line**: 163
- **Code**:
  ```js
  function listener (err) {
    if (msg.__onFinished === listener) msg.__onFinished = null
    // ...
  }
  ```
- **What it does**: When the finish listener fires, it sets `msg.__onFinished` to `null` to release the queue and prevent double-firing. This is the cleanup counterpart to Finding 1.
- **Object affected**: Same `http.IncomingMessage` or `http.ServerResponse` instance
- **Node.js cross-reference**: Same as Finding 1
- **Severity**: Medium (same finding as #1, different code path)
- **v6 recommendation**: Same as Finding 1

### Finding 3: `res.assignSocket` — method wrapping (legacy Node.js 0.8 path)

- **Category**: F — Method Wrapping / Interception
- **File**: `index.js`
- **Lines**: 189–196
- **Code**:
  ```js
  // istanbul ignore next: node.js 0.8 patch
  function patchAssignSocket (res, callback) {
    var assignSocket = res.assignSocket

    if (typeof assignSocket !== 'function') return

    // res.on('socket', callback) is broken in 0.8
    res.assignSocket = function _assignSocket (socket) {
      assignSocket.call(this, socket)
      callback(socket)
    }
  }
  ```
- **What it does**: Wraps the `res.assignSocket` method with a version that also calls a callback when the socket is assigned. This is a shim for Node.js 0.8 where `res.on('socket', cb)` was broken.
- **Object affected**: `http.ServerResponse` instance — replaces the `.assignSocket` method on a per-instance basis
- **Node.js cross-reference**:
  - `lib/_http_server.js` lines 312–320: `ServerResponse.prototype.assignSocket` — this is a core Node.js method that assigns a socket to the response, emits the `'socket'` event, and calls `_flush()`
  - Conflict risk: **Medium** — while this code path is guarded by `msg.socket === undefined` (line 127), on modern Node.js, `msg.socket` is always defined by the time `onFinished` is called, so this patch is effectively **dead code** in Node.js ≥ 0.12. However, the function still exists and could theoretically fire if a ServerResponse is used before socket assignment.
- **Severity**: Low (dead code on modern Node.js, but still a method-wrapping monkeypatch in principle)
- **v6 recommendation**: Remove the `patchAssignSocket` function entirely. Node.js 0.8 is long EOL. The `res.on('socket', cb)` API has worked correctly since Node.js 0.12.

### Finding 4: Reading `msg.finished`, `msg.complete`, `msg.readable`, `msg.socket`

- **Category**: G — Internal/Private Property Access (Informational)
- **File**: `index.js`
- **Lines**: 67–79
- **Code**:
  ```js
  function isFinished (msg) {
    var socket = msg.socket

    if (typeof msg.finished === 'boolean') {
      // OutgoingMessage
      return Boolean(msg.finished || (socket && !socket.writable))
    }

    if (typeof msg.complete === 'boolean') {
      // IncomingMessage
      return Boolean(msg.upgrade || !socket || !socket.readable || (msg.complete && !msg.readable))
    }

    return undefined
  }
  ```
- **What it does**: Reads several properties to determine if a message has finished. `msg.finished` is deprecated in Node.js in favor of `msg.writableEnded`. `msg.complete`, `msg.socket`, `msg.upgrade`, `msg.readable` are all public/documented Node.js properties.
- **Object affected**: `http.IncomingMessage` or `http.ServerResponse` instance (read-only)
- **Node.js cross-reference**:
  - `msg.finished` — deprecated since Node.js 12.16.0, use `msg.writableEnded` instead
  - `msg.complete` — `IncomingMessage.complete`, set to `true` when all data has been received
  - `msg.socket` — standard property
- **Severity**: Informational — read-only access, no mutation. But `msg.finished` usage should be updated.
- **v6 recommendation**: Replace `msg.finished` check with `msg.writableEnded` for modern Node.js compatibility.

### Verification (Triple-Check)

1. **Automated pattern match**: ✅ `msg.__onFinished =` flagged at lines 146 and 163. `res.assignSocket =` flagged at line 194.
2. **Manual code reading**: ✅ `attachListener()` is called by `onFinished(msg, listener)` which is the module's public API. The `msg` parameter is a Node.js `IncomingMessage` or `ServerResponse` instance. `patchAssignSocket` is behind a guard (`msg.socket === undefined`) that is effectively always false on modern Node.js, making it dead code. Confirmed all code paths are reachable in principle.
3. **Call-chain tracing**: ✅
   - Express: `res.sendFile()` → `sendfile(res, file, opts, cb)` → `onFinished(res, cb)` → `attachListener(res, cb)` → `res.__onFinished = createListener(res)`
   - body-parser: `read(req, ...)` → `dump(req, cb)` → `onFinished(req, cb)` → `req.__onFinished = createListener(req)`
   - finalhandler: `finalhandler(req, res)` → `onFinished(req, cb)` → `req.__onFinished = createListener(req)`

## Transitive Dependencies

| Dependency | Version | Findings |
|---|---|---|
| ee-first | 1.1.1 | 0 — uses only standard EventEmitter APIs (`.on()`, `.removeListener()`). Adds event listeners to emitters and removes them on first fire. No property injection, no prototype manipulation. Creates its own `thunk` object with `.cancel` method — all internal. |

## Summary
- **Total findings**: 4 (2 confirmed property injection, 1 legacy method wrapping, 1 informational)
- Critical: 0, High: 0, Medium: 2, Low: 1, Informational: 1
- **v6 recommendations**:
  1. Replace `msg.__onFinished` property injection with a `WeakMap<msg, listener>` — cleanest fix, zero footprint on the message object
  2. Remove the `patchAssignSocket` function — Node.js 0.8 compatibility code is 12+ years obsolete
  3. Replace `msg.finished` check with `msg.writableEnded` for modern Node.js
  4. Consider using Node.js's built-in `stream.finished()` (available since Node.js 10) as a potential replacement for this entire package
