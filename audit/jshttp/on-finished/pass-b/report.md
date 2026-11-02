# on-finished v2.4.2 — Audit Report (Pass B)

**Library**: on-finished v2.4.2
**Commit**: `9a73f9c1c0b7a17c84b7d68ac5212b11a272cd6a`
**Runtime dependency**: ee-first 1.1.1
**Production files audited**:
- `$PACKAGE_ROOT/index.js` (247 lines)
- `$PACKAGE_ROOT/node_modules/ee-first/index.js` (96 lines)
**Pass**: B (independent double-blind)

---

## Executive Summary

on-finished v2.4.2 contains **two confirmed mutations of Node.js core HTTP objects**,
both operating at the per-instance level (not prototype-level). Neither modifies shared
prototypes or global state.

1. **C-001**: `patchAssignSocket` shadows `res.assignSocket` on individual ServerResponse
   instances. This is a legacy compatibility shim for Node.js 0.8 and is **unreachable
   in modern Node.js** (>= ~4.x) because the gate condition `msg.socket === undefined`
   is never satisfied (modern Node.js initializes `socket` to `null` via a getter/setter).

2. **C-002**: `attachListener` adds a `__onFinished` property to individual HTTP message
   objects (IncomingMessage or ServerResponse). This is not an override of any existing
   Node.js property but a new custom property used for bookkeeping. It is cleaned up
   (set to `null`) after the listener fires.

**No prototype mutations. No global state modifications. No module system hooks.
No use of internal Node.js bindings.**

---

## Methodology

Six regex search groups were executed against all production files to detect:
1. Module imports (`require`, `import`, `node:` prefixes)
2. Global/built-in access (`Buffer`, `process`, `globalThis`, `global`, `extends`, `inherits`)
3. Prototype/property manipulation (`.prototype`, `__proto__`, `defineProperty`, `Object.assign`)
4. Patch/wrap/shim keywords
5. Module system hooks (`require.cache`, `Module._load`, etc.)
6. Internal bindings (`process.binding`, `internalBinding`, `_http_*`, `internal/`)

All hits were manually analyzed and cross-referenced with Node.js core source files.
Full search results are in `searches.md`. Candidate ledger is in `candidates.md`.

---

## Detailed Analysis

### C-001: patchAssignSocket — Instance-level override of res.assignSocket

**Location**: `$PACKAGE_ROOT/index.js` lines 189-199

```js
function patchAssignSocket (res, callback) {
  var assignSocket = res.assignSocket
  if (typeof assignSocket !== 'function') return
  res.assignSocket = function _assignSocket (socket) {
    assignSocket.call(this, socket)
    callback(socket)
  }
}
```

#### What it does

Captures the `assignSocket` method (resolved from the prototype chain) and replaces it
with a wrapper function **on the instance only** via direct property assignment
(`res.assignSocket = ...`). The wrapper calls the original method, then invokes a
callback to notify the library that a socket has been assigned.

#### Instance vs. Prototype — Critical distinction

This is a **per-instance shadow**, NOT a prototype mutation.

- The assignment `res.assignSocket = function _assignSocket(...)` creates an own-property
  on the individual `res` object.
- It does NOT modify `ServerResponse.prototype.assignSocket`.
- Other ServerResponse instances remain unaffected.
- The shadow is reversible via `delete res.assignSocket`.

#### Node.js core cross-reference

`ServerResponse.prototype.assignSocket` is defined at
`$NODEJS_SOURCE/lib/internal/http/server.js` line 312:

```js
ServerResponse.prototype.assignSocket = function assignSocket(socket) {
  if (socket._httpMessage) {
    throw new ERR_HTTP_SOCKET_ASSIGNED();
  }
  socket._httpMessage = this;
  socket.on('close', onServerResponseClose);
  this.socket = socket;
  this.emit('socket', socket);
  this._flush();
};
```

The `assignSocket` method is called by the HTTP server internals at two sites:
- `$NODEJS_SOURCE/lib/internal/http/server.js` line 1275 — for pipelined responses
- `$NODEJS_SOURCE/lib/internal/http/server.js` line 1410 — initial socket assignment

#### Activation conditions — Unreachable in modern Node.js

The execution chain to reach `patchAssignSocket` is:

```
onFinished(msg, listener)                               [line 46]
  -> isFinished(msg) returns false (not yet finished)
  -> attachListener(msg, wrap(listener))                [line 53]
    -> attachFinishedListener(msg, attached)             [line 148]
      -> msg.socket is falsy (socket not yet assigned)  [line 119]
      -> msg.on('socket', onSocket)                     [line 126]
      -> if (msg.socket === undefined)                  [line 128: GATE]
        -> patchAssignSocket(msg, onSocket)             [line 130]
```

The gate condition is `msg.socket === undefined` at line 128.

In modern Node.js, the `OutgoingMessage` constructor at
`$NODEJS_SOURCE/lib/internal/http/outgoing.js` line 187 sets `this[kSocket] = null`.
The `socket` property is defined as a getter on `OutgoingMessage.prototype` at
line 304-307:

```js
ObjectDefineProperty(OutgoingMessage.prototype, 'socket', {
  __proto__: null,
  get: function() {
    return this[kSocket];      // returns null, not undefined
  },
  set: function(val) { ... },
});
```

Therefore `msg.socket` returns `null` (not `undefined`) for any ServerResponse
that has not yet been assigned a socket. Since `null !== undefined`, the gate is
**never satisfied**, and `patchAssignSocket` is **never called** in modern Node.js.

For IncomingMessage objects, `this.socket = socket` is set in the constructor
(`$NODEJS_SOURCE/lib/internal/http/incoming.js` line 77), always with a valid
socket. Furthermore, IncomingMessage has no `assignSocket` method, so the
`typeof assignSocket !== 'function'` guard at line 192 would cause an early return.

**Conclusion**: This is dead code on all supported Node.js versions (>= 18.x).
It was needed only for Node.js 0.8 where `res.on('socket', callback)` was broken.

---

### C-002: __onFinished property addition on msg

**Location**: `$PACKAGE_ROOT/index.js` lines 143-147 (write), line 164 (cleanup)

```js
// Write (line 147)
attached = msg.__onFinished = createListener(msg)

// Cleanup (line 164)
if (msg.__onFinished === listener) msg.__onFinished = null
```

#### What it does

Adds a custom `__onFinished` property directly to individual HTTP message objects
(ServerResponse or IncomingMessage instances). The property holds a function
with a `.queue` array of pending callbacks.

#### Analysis

- **Not an override**: `__onFinished` is not defined anywhere in Node.js core.
  This is a new property, not an override of an existing one.
- **Per-instance**: Only the specific `msg` object is affected.
- **Cleaned up**: Set to `null` when the listener fires (line 164), so it does
  not persist beyond the response lifecycle.
- **Standard pattern**: Adding metadata properties to request/response objects
  is a common pattern in the Node.js/Express ecosystem.

#### Activation conditions

This mutation is reached on every call to `onFinished()` where the message is
not already finished. It is the core bookkeeping mechanism of the library.

```
onFinished(msg, listener)                               [line 46]
  -> isFinished(msg) returns false
  -> attachListener(msg, wrap(listener))                [line 53]
    -> msg.__onFinished = createListener(msg)           [line 147: ALWAYS]
```

---

### Not patches: Event listener additions (C-003)

The library and its `ee-first` dependency add event listeners to `msg` and `socket`
objects using the standard `.on()` EventEmitter API. These are properly cleaned up
via `.removeListener()`. This is standard, expected usage of the EventEmitter
interface and does not constitute patching.

---

### Not patches: Other code paths

| Code path | Analysis |
|---|---|
| `require('async_hooks')` (line 208) | Standard module import with try/catch fallback |
| `new asyncHooks.AsyncResource(...)` (line 225) | Creates new instances; no shared mutation |
| `process.nextTick(...)` (line 34) | Standard API call; no mutation |
| `setImmediate` (line 33) | Standard API call; no mutation |
| `res.runInAsyncScope.bind(...)` (line 234) | Binds to a newly created resource; no shared mutation |
| `isFinished` reads (lines 67-78) | Read-only access to `msg.socket`, `msg.writable`, `msg.complete`, etc. |
| `writableEnded` reads (line 244-246) | Read-only access to `res.writableEnded` and `res.finished` |
| `ee-first` (entire module) | Uses only `.on()` and `.removeListener()` — standard EventEmitter API |

---

## ee-first Dependency Analysis

`$PACKAGE_ROOT/node_modules/ee-first/index.js` (96 lines) is a utility that
waits for the first event from a set of emitters.

- Uses `.on(event, fn)` to register listeners (line 43)
- Uses `.removeListener(event, fn)` to clean up (line 63)
- No prototype modifications
- No property additions to emitter objects
- No globals accessed
- No require calls
- No patches of any kind

**Verdict**: Clean. Standard EventEmitter consumer.

---

## Risk Assessment

| ID    | Risk  | Justification |
|-------|-------|---------------|
| C-001 | **None** (modern Node.js) | Dead code; gate condition never satisfied on Node.js >= ~4.x |
| C-002 | **Low** | Adds custom property to per-request objects; cleaned up; not overriding core |
| C-003 | **None** | Standard EventEmitter API usage |

**Overall library risk**: **Low**. No prototype mutations. No global state changes.
No module system hooks. No internal API usage. The one genuine patch (C-001) is
unreachable in any supported Node.js version.

---

## Files

- `$PACKAGE_ROOT/index.js` — main library (247 lines)
- `$PACKAGE_ROOT/node_modules/ee-first/index.js` — dependency (96 lines)
- `$NODEJS_SOURCE/lib/internal/http/server.js` — `ServerResponse.prototype.assignSocket` definition (line 312)
- `$NODEJS_SOURCE/lib/internal/http/outgoing.js` — `OutgoingMessage` constructor, `socket` getter/setter (lines 130-202, 304-316)
- `$NODEJS_SOURCE/lib/internal/http/incoming.js` — `IncomingMessage` constructor (line 61)
