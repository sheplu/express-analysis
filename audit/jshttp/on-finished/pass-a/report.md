# on-finished v2.4.2 — Pass A Audit Report

**Auditor**: Pass A (blind)
**Commit**: `9a73f9c1c0b7a17c84b7d68ac5212b11a272cd6a`
**Date**: 2026-11-01

## 1. Scope

Production files audited:
- `$PACKAGE_ROOT/index.js` (247 lines)
- `$PACKAGE_ROOT/node_modules/ee-first/index.js` (96 lines)

Six regex search groups were run against both files. See `searches.md` for raw results.

## 2. Library Overview

`on-finished` provides a mechanism to detect when an HTTP request/response message has finished (completed, closed, or errored). It attaches event listeners to the message and its socket, then invokes a callback when the first terminal event fires.

**Dependency**: `ee-first` 1.1.1 — a utility that listens for the first event from a set of `[emitter, event...]` arrays. Uses only standard EventEmitter API (`.on()`, `.removeListener()`). Contains **zero** patches or mutations.

## 3. Confirmed Patches and Mutations

### 3.1 C-001: Per-instance monkeypatch of `res.assignSocket` (CONFIRMED)

**Location**: `$PACKAGE_ROOT/index.js` lines 189-199

**What it does**: Replaces the `assignSocket` method on a specific `ServerResponse` instance by setting an own property that shadows the inherited `ServerResponse.prototype.assignSocket`. The replacement calls the original method via `.call(this, socket)` and then invokes a callback to set up socket event listeners for finish detection.

**Node.js cross-reference**:
- `ServerResponse.prototype.assignSocket` is defined at `$NODEJS_SOURCE/lib/internal/http/server.js:312`
- The prototype method: (1) checks for double-assignment, (2) sets `socket._httpMessage = this`, (3) attaches a `'close'` listener, (4) sets `this.socket = socket`, (5) emits `'socket'` event, (6) calls `this._flush()`
- The HTTP server calls `res.assignSocket(socket)` at `$NODEJS_SOURCE/lib/internal/http/server.js:1275` (pipelined responses) and `:1410` (initial response)

**Execution chain**:
```
onFinished(msg, listener)
  -> attachListener(msg, wrap(listener))
    -> attachFinishedListener(msg, attached)
      -> [guard: msg.socket === undefined]
        -> patchAssignSocket(msg, onSocket)
          -> res.assignSocket = function _assignSocket(socket) { ... }
```

**Activation conditions** (all must be true):
1. `onFinished()` called with a message that is not yet finished
2. `msg.socket` is `undefined` after the `msg.on('socket', onSocket)` registration (line 128)
3. `res.assignSocket` is a function (guard at line 192)

**Scope**: Per-instance. Does NOT modify `ServerResponse.prototype`. Permanent for the object's lifetime (no restore).

**Modern Node.js impact**: On Node.js >= 0.10, `ServerResponse` objects are assigned their socket before the request handler is called, so `msg.socket` is set by the time `onFinished()` runs. The comments explicitly label this as a "node.js 0.8 patch." **This code path is effectively dead on modern Node.js** but remains reachable for any non-standard object passed to `onFinished()` where `.socket` is undefined and `.assignSocket` is a function.

**Behavioral fidelity**: The patched method calls the original with correct `this` binding and arguments. No arguments are dropped, no return value is altered. The only addition is a `callback(socket)` call after the original completes.

### 3.2 C-002: Expando property `__onFinished` on message objects (CONFIRMED)

**Location**: `$PACKAGE_ROOT/index.js` lines 143-147 (write), line 164 (nullify)

**What it does**: Adds a `__onFinished` own property to the message object. This property holds a listener function with a `.queue` array of pending callbacks. It serves as a per-message callback aggregator so multiple `onFinished()` calls on the same message share a single set of event listeners.

**Scope**: Per-instance expando property. Self-cleaning: set to `null` when the callback fires (line 164).

**Risk**: Low. Double-underscore naming convention signals library-internal use. Only risk is naming collision if other code uses the same property name on the same object.

## 4. Non-patches (Cleared)

### 4.1 C-003: `wrap(fn)` — AsyncResource creation

Creates new `AsyncResource` instances from `require('async_hooks')`. Returns a bound wrapper function. No mutation of any existing object, prototype, or core module.

### 4.2 C-004: Event listener registration

Standard use of `.on()` and `.removeListener()` on message and socket objects. `ee-first` provides cleanup via `.cancel()`. No prototype mutation.

### 4.3 `process.nextTick` usage

Read-only reference to `process.nextTick` as a fallback for `setImmediate` (line 34). No mutation of `process`.

### 4.4 `require('async_hooks')`

Standard `require()` of a core module, wrapped in try/catch for compatibility. No loader hooks or require cache manipulation.

## 5. ee-first Analysis

`ee-first` 1.1.1 (`$PACKAGE_ROOT/node_modules/ee-first/index.js`, 96 lines) was searched with all six regex groups. **Zero hits across all groups.** The module:
- Exports a single `first()` function
- Uses only `.on()` and `.removeListener()` on provided EventEmitters
- Creates no new properties on emitters
- Has no requires, no globals, no prototype access
- Is completely clean of any patching behavior

## 6. Summary

| ID | Target | Type | Scope | Active on modern Node.js? |
|----|--------|------|-------|---------------------------|
| C-001 | `res.assignSocket` | Own-property shadow of prototype method | Per-instance, permanent | No (dead code path) |
| C-002 | `msg.__onFinished` | Expando property | Per-instance, self-cleaning | Yes (every call) |

**Total confirmed patches**: 1 monkeypatch (C-001), 1 instance mutation (C-002)
**Prototype mutations**: 0
**Global mutations**: 0
**Loader hooks**: 0
**Core module patches**: 0

The library's footprint is minimal. The one monkeypatch (C-001) is a legacy compatibility shim for Node.js 0.8 that is effectively unreachable on modern Node.js. The expando property (C-002) is the standard mechanism by which the library tracks its listener state on individual message objects.
