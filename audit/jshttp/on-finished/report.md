# on-finished v2.4.2 — Final Reconciled Audit Report

**Library**: on-finished v2.4.2
**Commit**: `9a73f9c1c0b7a17c84b7d68ac5212b11a272cd6a`
**Runtime dependency**: ee-first 1.1.1 (zero deps of its own)
**Audit date**: 2026-11-01
**Method**: Double-blind audit (Pass A + Pass B), independently reconciled

---

## Definitive Verdict

**on-finished v2.4.2 contains ONE latent monkeypatch and ONE active instance mutation.
Neither is a shared prototype mutation. Neither modifies global state. The monkeypatch
is dead code on all modern Node.js versions.**

| Finding | Target | Type | Active? | Risk |
|---------|--------|------|---------|------|
| F-001 | `res.assignSocket` | Per-instance shadow of prototype method | **No** (dead code since ~Node 1.0) | None |
| F-002 | `msg.__onFinished` | Expando property on instance | **Yes** (every call) | Low |

**Prototype mutations**: 0
**Global/shared mutations**: 0
**Module loader hooks**: 0
**Internal binding access**: 0
**Transitive dependency patches** (ee-first): 0

---

## Scope

Production files audited (2 total, 343 lines combined):
- `$PACKAGE_ROOT/index.js` (247 lines) — the library
- `$PACKAGE_ROOT/node_modules/ee-first/index.js` (96 lines) — sole runtime dependency

Six regex search groups were run on all production files by both passes independently.
Both passes produced identical search hits and reached the same conclusions.

---

## F-001: Per-instance override of `ServerResponse.prototype.assignSocket` (DORMANT)

### Summary

The function `patchAssignSocket` at `$PACKAGE_ROOT/index.js:189-199` captures
`res.assignSocket` from the prototype chain and replaces it with a wrapper function
on the individual `res` instance via own-property assignment. This shadows
`ServerResponse.prototype.assignSocket` for that one instance only. The wrapper calls
the original faithfully and then invokes a callback to set up socket event listeners.

**This code is unreachable on modern Node.js and is explicitly labeled "node.js 0.8 patch"
in the source.**

### Mutation Detail

```js
// $PACKAGE_ROOT/index.js:189-199
function patchAssignSocket (res, callback) {
  var assignSocket = res.assignSocket          // capture from prototype
  if (typeof assignSocket !== 'function') return
  res.assignSocket = function _assignSocket (socket) {  // own-property shadow
    assignSocket.call(this, socket)            // call original
    callback(socket)                           // library callback
  }
}
```

### Core Baseline

```js
// $NODEJS_SOURCE/lib/internal/http/server.js:312-321
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

### Execution Chain

```
onFinished(msg, listener)                        [index.js:46]
  -> attachListener(msg, wrap(listener))         [index.js:53]
    -> attachFinishedListener(msg, attached)      [index.js:148]
      -> [guard: msg.socket === undefined]        [index.js:128]
        -> patchAssignSocket(msg, onSocket)       [index.js:130]
          -> res.assignSocket = wrapper            [index.js:195]
```

### Why It Is Dead Code

The gate condition at line 128 is `msg.socket === undefined` (strict equality).

On modern Node.js, `OutgoingMessage` initializes `this[kSocket] = null` in its
constructor (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:187`). The `socket`
property is a getter defined via `ObjectDefineProperty` on `OutgoingMessage.prototype`
(`$NODEJS_SOURCE/lib/internal/http/outgoing.js:304-307`) that returns `this[kSocket]`.

Therefore `msg.socket` returns `null` (not `undefined`) for any ServerResponse
that has not yet been assigned a socket. Since `null !== undefined`, the gate is
**never satisfied**.

For `IncomingMessage` objects, the socket is always assigned in the constructor.
Furthermore, IncomingMessage has no `assignSocket` method, so even if the gate
were passed, the `typeof assignSocket !== 'function'` guard at line 192 would
cause an early return.

### Scope

- **Per-instance**: creates an own-property on the specific `res` object
- **NOT a prototype mutation**: `ServerResponse.prototype.assignSocket` is unmodified
- **Theoretically reversible**: `delete res.assignSocket` would re-expose the prototype method
- **No restoration in library**: on-finished does not clean up this property

### Both Passes Agree

Pass A and Pass B independently confirmed this finding. The only minor difference
was that Pass A described it as "Permanent (no restore path)" while Pass B noted
it is "Reversible via `delete`." Reconciliation: the patch is technically reversible
via `delete`, but the library does not perform restoration. Both characterizations
are correct from their respective angles.

---

## F-002: `__onFinished` expando property on HTTP message instances (ACTIVE)

### Summary

The function `attachListener` at `$PACKAGE_ROOT/index.js:143-147` adds a custom
`__onFinished` property to individual HTTP message objects (IncomingMessage or
ServerResponse). This property holds a listener function with a `.queue` array
of pending callbacks. It is cleaned up (set to `null`) when the listener fires.

### Mutation Detail

```js
// Write ($PACKAGE_ROOT/index.js:147)
attached = msg.__onFinished = createListener(msg)

// Cleanup ($PACKAGE_ROOT/index.js:164)
if (msg.__onFinished === listener) msg.__onFinished = null
```

### Core Baseline

`__onFinished` does not exist anywhere in the Node.js source tree. This is a
new property, not an override.

### Execution Chain

```
onFinished(msg, listener)                        [index.js:46]
  -> attachListener(msg, wrap(listener))         [index.js:53]
    -> msg.__onFinished = createListener(msg)    [index.js:147]
```

### Activation

Every call to `onFinished(msg, listener)` where the message is not already finished.
This is the library's primary bookkeeping mechanism.

### Scope

- **Per-instance**: only the specific `msg` object is affected
- **Self-cleaning**: set to `null` after the listener fires
- **Not an override**: `__onFinished` is not a Node.js core property
- **Low risk**: naming collision only if another library uses `__onFinished`

### Both Passes Agree

Pass A and Pass B independently confirmed this finding with identical analysis.

---

## ee-first 1.1.1 — Dependency Analysis

`ee-first` was searched with all 6 regex groups by both passes. **Zero hits across
all groups in both passes.** The module:
- Exports a single `first()` function
- Uses only `.on()` and `.removeListener()` on provided EventEmitters
- Has zero `require` calls, zero global access, zero prototype access
- Creates no properties on emitter objects
- Has zero dependencies of its own

**Verdict**: Clean. No patches of any kind.

---

## Non-patches (Cleared)

| Code path | Analysis |
|---|---|
| `require('async_hooks')` (line 208) | Standard core module import with try/catch |
| `new asyncHooks.AsyncResource(...)` (line 225) | Creates new instances; no shared mutation |
| `res.runInAsyncScope.bind(...)` (line 234) | Binds to newly created resource; no shared mutation |
| `process.nextTick(...)` (line 34) | Read-only API call as `setImmediate` fallback |
| Event listener additions (lines 106, 116, 126) | Standard `.on()` / `.removeListener()` usage |
| `isFinished` / `writableEnded` reads | Read-only property access |

---

## Response to Prior Audit Flags

> Prior expressjs-org audits flagged this library as having a latent `patchAssignSocket`
> function that wraps `ServerResponse.prototype.assignSocket`. In the body-parser audit
> it was rejected as unreachable because body-parser passes only `req` (IncomingMessage),
> but when called with `res` (ServerResponse), the branch IS reachable.

**This audit confirms**:

1. `patchAssignSocket` EXISTS in the source (lines 189-199) and IS designed to wrap
   `ServerResponse.prototype.assignSocket` on individual instances.

2. The body-parser audit was correct that it is unreachable for `req` (IncomingMessage)
   — IncomingMessage has no `assignSocket` method.

3. However, the claim that "when called with `res` (ServerResponse), the branch IS
   reachable" requires qualification: **on modern Node.js, the branch is STILL
   unreachable** even for ServerResponse objects. The gate condition
   `msg.socket === undefined` is never satisfied because modern Node.js initializes
   `socket` to `null` via a getter/setter on `OutgoingMessage.prototype`.

4. The branch was ONLY reachable on Node.js 0.8, where the `socket` property was
   not initialized and `res.on('socket', callback)` was broken.

5. The patch is per-instance, not a prototype mutation. Even if it were reachable,
   it would not affect other ServerResponse instances.

---

## Reconciliation Notes

See `methodology.md` for detailed pass comparison. Both passes produced identical
material findings with no disagreements requiring adjudication beyond a minor
nuance on restoration semantics (Pass A: "permanent"; Pass B: "reversible via delete";
reconciled: "technically reversible but library does not restore").
