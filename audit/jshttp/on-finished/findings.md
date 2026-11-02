# on-finished v2.4.2 — Confirmed Findings

**Audit date**: 2026-11-01
**Commit**: `9a73f9c1c0b7a17c84b7d68ac5212b11a272cd6a`
**Method**: Double-blind audit (Pass A + Pass B), reconciled

---

### F-001: Per-instance override of `ServerResponse.prototype.assignSocket`

- **Category**: Instance override (own-property shadow of inherited prototype method)
- **Library site(s)**: `$PACKAGE_ROOT/index.js:189-199` (function `patchAssignSocket`)
- **Core baseline**: `$NODEJS_SOURCE/lib/internal/http/server.js:312-321`
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
- **Exact mutation**: Object: individual `res` (ServerResponse) instance. Key: `assignSocket`. Operation: own-property assignment (`res.assignSocket = function _assignSocket(...) { ... }`). Replacement: wrapper function that calls original via `.call(this, socket)` then invokes `callback(socket)`.
- **Execution chain**:
  ```
  onFinished(msg, listener)                        [index.js:46]
    -> attachListener(msg, wrap(listener))         [index.js:53]
      -> attachFinishedListener(msg, attached)     [index.js:148]
        -> [guard: msg.socket === undefined]       [index.js:128]
          -> patchAssignSocket(msg, onSocket)      [index.js:130]
            -> res.assignSocket = wrapper          [index.js:195]
  ```
- **Activation**: Requires ALL of the following to be true:
  1. `onFinished()` called with a message that is not already finished
  2. `msg.socket` is falsy (line 119 guard fails)
  3. `msg.socket === undefined` (line 128 strict equality)
  4. `res.assignSocket` is a function (line 192 typeof guard)
  
  **On modern Node.js (>= ~1.0)**: UNREACHABLE. `OutgoingMessage` constructor sets `this[kSocket] = null` (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:187`). The `.socket` getter returns `this[kSocket]` which is `null`. Since `null !== undefined`, the gate at line 128 is never true. The source code comment "node.js 0.8 patch" confirms this is legacy compatibility code.
  
  **On Node.js 0.8**: REACHABLE. The `socket` property was not a getter/setter and was not initialized, so `msg.socket` would be `undefined`.

- **Scope and restoration**: Per-instance only. Does NOT modify `ServerResponse.prototype`. Other ServerResponse instances are unaffected. Theoretically reversible via `delete res.assignSocket` (which would re-expose the prototype method), but no code path in the library performs this restoration.
- **Resulting behavior**:
  - Before: `res.assignSocket(socket)` calls the prototype method directly
  - After (if patch were active): `res.assignSocket(socket)` calls the prototype method via `.call(this, socket)` then additionally invokes `onSocket(callback)` to set up finish-detection event listeners on the socket
  - The prototype method's semantics are fully preserved (correct `this`, all arguments forwarded, no return value alteration)
- **Evidence**: Static analysis of source code; cross-referenced with Node.js core. Comments at lines 129 and 188 explicitly label this as "node.js 0.8 patch". Istanbul ignore pragmas confirm the authors consider this code untestable on modern Node.js.

---

### F-002: `__onFinished` expando property on HTTP message instances

- **Category**: Instance property addition (non-standard property on core HTTP objects)
- **Library site(s)**: `$PACKAGE_ROOT/index.js:147` (write), `$PACKAGE_ROOT/index.js:164` (cleanup)
- **Core baseline**: N/A — `__onFinished` is not a property defined by Node.js core. Verified by searching `$NODEJS_SOURCE/lib/` for `__onFinished` (zero results).
- **Exact mutation**: Object: individual `msg` instance (IncomingMessage or ServerResponse). Key: `__onFinished`. Operation: own-property assignment (`msg.__onFinished = createListener(msg)`). Replacement: a function with a `.queue` array of pending callbacks.
- **Execution chain**:
  ```
  onFinished(msg, listener)                        [index.js:46]
    -> attachListener(msg, wrap(listener))         [index.js:53]
      -> msg.__onFinished = createListener(msg)    [index.js:147]
  ```
- **Activation**: Every call to `onFinished(msg, listener)` where the message is not already finished. This is the primary code path — always active.
- **Scope and restoration**: Per-instance. Self-cleaning: set to `null` when the listener fires (line 164: `if (msg.__onFinished === listener) msg.__onFinished = null`). Does not persist beyond the message's finish event.
- **Resulting behavior**:
  - Before: `msg.__onFinished` is `undefined` (property does not exist)
  - After: `msg.__onFinished` is a listener function with a `.queue` array
  - After cleanup: `msg.__onFinished` is `null`
  - The property serves as a per-message callback aggregator so multiple `onFinished()` calls share a single set of event listeners
- **Evidence**: Static analysis. This is standard library bookkeeping, not an override of core behavior. The double-underscore prefix signals library-internal use. The only risk is a naming collision if another library uses `__onFinished` on the same object.

---

## Summary

| Finding | Target | Type | Active on modern Node.js? | Risk |
|---------|--------|------|---------------------------|------|
| F-001 | `res.assignSocket` | Instance override of prototype method | **No** (dead code) | None (unreachable) |
| F-002 | `msg.__onFinished` | Expando property addition | **Yes** (every call) | Low (naming collision) |

**Prototype mutations**: 0
**Global/shared mutations**: 0
**Module loader hooks**: 0
**Internal binding access**: 0
**Transitive dependency patches** (ee-first): 0
