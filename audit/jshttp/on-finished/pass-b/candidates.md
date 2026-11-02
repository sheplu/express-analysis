# on-finished v2.4.2 — Candidate Ledger (Pass B)

Commit: `9a73f9c1c0b7a17c84b7d68ac5212b11a272cd6a`

---

## C-001: Per-instance override of `res.assignSocket`

| Field               | Value                                                              |
|---------------------|--------------------------------------------------------------------|
| **File**            | `$PACKAGE_ROOT/index.js` lines 189-199                             |
| **Function**        | `patchAssignSocket(res, callback)`                                 |
| **Target object**   | Individual `res` instance (ServerResponse)                         |
| **Target property** | `assignSocket` (method)                                            |
| **Operation**       | Own-property assignment: `res.assignSocket = function _assignSocket(...)` |
| **Scope**           | Per-instance (shadows prototype method on that single object)      |
| **Prototype mutation?** | NO — does NOT modify `ServerResponse.prototype`                |
| **Permanent?**      | Reversible: `delete res.assignSocket` would restore prototype access |
| **Reachable in modern Node.js?** | **NO** — see activation analysis below               |
| **Verdict**         | **CONFIRMED patch** — but dormant/unreachable on Node.js >= ~4.x   |

### Mutation detail

```js
function patchAssignSocket (res, callback) {
  var assignSocket = res.assignSocket          // capture prototype method
  if (typeof assignSocket !== 'function') return
  res.assignSocket = function _assignSocket (socket) {  // shadow on instance
    assignSocket.call(this, socket)            // call original
    callback(socket)                           // invoke onSocket callback
  }
}
```

The function captures `res.assignSocket` (resolved from `ServerResponse.prototype.assignSocket`),
then assigns a wrapper function directly onto the `res` instance. This creates an own-property
that shadows the prototype method for **that instance only**. Other ServerResponse instances
are unaffected.

### Node.js core cross-reference

`ServerResponse.prototype.assignSocket` is defined at:
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

### Activation conditions (execution chain)

```
onFinished(msg, listener)                        [line 46]
  -> isFinished(msg) returns false
  -> attachListener(msg, wrap(listener))         [line 53]
    -> attachFinishedListener(msg, attached)      [line 148]
      -> msg.socket is falsy                      [line 119: if (msg.socket)]
      -> msg.on('socket', onSocket)               [line 126]
      -> msg.socket === undefined                 [line 128: GATE CONDITION]
        -> patchAssignSocket(msg, onSocket)       [line 130]
```

The critical gate is `msg.socket === undefined` at line 128.

In modern Node.js (>= ~4.x), `OutgoingMessage` constructor sets
`this[kSocket] = null` (`$NODEJS_SOURCE/lib/internal/http/outgoing.js` line 187).
The `socket` property is defined as a getter/setter on `OutgoingMessage.prototype`
via `ObjectDefineProperty` (`$NODEJS_SOURCE/lib/internal/http/outgoing.js` lines 304-316):

```js
ObjectDefineProperty(OutgoingMessage.prototype, 'socket', {
  __proto__: null,
  get: function() {
    return this[kSocket];
  },
  set: function(val) {
    for (let n = 0; n < this[kCorked]; n++) {
      val?.cork();
      this[kSocket]?.uncork();
    }
    this[kSocket] = val;
  },
});
```

Therefore `msg.socket` returns `null` (not `undefined`) for any unconnected
ServerResponse. Since `null !== undefined`, the gate at line 128 is **never true**
in modern Node.js, and `patchAssignSocket` is **never called**.

For `IncomingMessage` objects, `this.socket = socket` is set directly in the
constructor (`$NODEJS_SOURCE/lib/internal/http/incoming.js` line 77), always
to a valid socket object. Furthermore, IncomingMessage has no `assignSocket`
method, so even if reached, the `typeof assignSocket !== 'function'` guard
at line 192 would cause an early return.

---

## C-002: `__onFinished` property addition on msg

| Field               | Value                                                              |
|---------------------|--------------------------------------------------------------------|
| **File**            | `$PACKAGE_ROOT/index.js` lines 143-147, 164                       |
| **Function**        | `attachListener(msg, listener)` and `createListener(msg)`          |
| **Target object**   | Individual `msg` instance (IncomingMessage or ServerResponse)      |
| **Target property** | `__onFinished` (custom property, not part of Node.js core)         |
| **Operation**       | Own-property assignment: `msg.__onFinished = createListener(msg)`  |
| **Scope**           | Per-instance                                                       |
| **Prototype mutation?** | NO                                                             |
| **Permanent?**      | Semi-permanent: set to `null` after listener fires (line 164)      |
| **Reachable in modern Node.js?** | **YES** — always active                             |
| **Verdict**         | **CONFIRMED mutation** — property addition on core HTTP object instances |

### Mutation detail

```js
// attachListener (line 142-152)
function attachListener (msg, listener) {
  var attached = msg.__onFinished
  if (!attached || !attached.queue) {
    attached = msg.__onFinished = createListener(msg)  // <-- MUTATION
    attachFinishedListener(msg, attached)
  }
  attached.queue.push(listener)
}

// createListener (line 162-178) - cleanup
function listener (err) {
  if (msg.__onFinished === listener) msg.__onFinished = null  // <-- CLEANUP
  ...
}
```

### Analysis

This adds a non-standard own-property `__onFinished` to HTTP message objects
(IncomingMessage or ServerResponse instances). The property holds a function
with a `.queue` array of pending callbacks.

**This is NOT an override** — `__onFinished` is not a property defined by Node.js
core. It is a new custom property added to the instance for bookkeeping purposes.
The double-underscore prefix signals it is library-internal.

The property is cleaned up (set to `null`) when the listener fires, so it does
not persist beyond the lifetime of the message's finish event.

### Activation conditions

```
onFinished(msg, listener)                        [line 46]
  -> isFinished(msg) returns false
  -> attachListener(msg, wrap(listener))         [line 53]
    -> msg.__onFinished = createListener(msg)    [line 147: ALWAYS REACHED]
```

This mutation is reached on every call to `onFinished()` where the message is
not already finished. It is the primary mechanism for the library's functionality.

---

## C-003: Event listener additions on msg and socket

| Field               | Value                                                              |
|---------------------|--------------------------------------------------------------------|
| **File**            | `$PACKAGE_ROOT/index.js` lines 106, 116, 126                      |
|                     | `$PACKAGE_ROOT/node_modules/ee-first/index.js` line 43             |
| **Function**        | `attachFinishedListener()` and `first()`                           |
| **Target object**   | `msg` and `socket` instances                                       |
| **Target property** | Event listener tables (`_events`)                                  |
| **Operation**       | `.on('end', ...)`, `.on('finish', ...)`, `.on('error', ...)`, `.on('close', ...)`, `.on('socket', ...)` |
| **Scope**           | Per-instance                                                       |
| **Prototype mutation?** | NO                                                             |
| **Permanent?**      | Temporary: listeners are cleaned up via `ee-first` cancel/cleanup  |
| **Reachable in modern Node.js?** | **YES**                                              |
| **Verdict**         | **NOT a patch** — standard EventEmitter API usage                  |

### Analysis

Adding event listeners via `.on()` is the designed, standard way to observe
events on EventEmitter instances. This is not patching or monkeypatching.
The `ee-first` utility properly removes all listeners via `.removeListener()`
when the first event fires or when `.cancel()` is called. This is normal
library behavior and does not constitute a mutation of Node.js core.

---

## Summary

| ID    | Description                         | Type                | Scope        | Reachable? | Verdict                |
|-------|-------------------------------------|---------------------|--------------|------------|------------------------|
| C-001 | `res.assignSocket` instance shadow  | Instance override   | Per-instance | NO (modern Node.js) | Confirmed, dormant |
| C-002 | `msg.__onFinished` property addition| Property addition   | Per-instance | YES        | Confirmed, active      |
| C-003 | Event listener additions            | Standard API usage  | Per-instance | YES        | Not a patch            |
