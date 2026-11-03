# Monkeypatch Audit: merge-descriptors@2.0.0

## Package Overview
- **Name**: merge-descriptors
- **Version**: 2.0.0
- **Role in Express**: Copies property descriptors (including getters/setters/non-enumerable properties) from source objects onto a destination. Used in `express.js` to blend `EventEmitter.prototype` and the application prototype onto the `app` function object.
- **Source files audited**: `index.js` (single file, 27 lines)
- **Risk tier**: HIGH

## Findings

### Finding 1: Bulk property descriptor copying via Object.defineProperty

- **Category**: D — Property Descriptor Copying
- **File**: `index.js`
- **Line(s)**: 13–21
- **Code**:
  ```js
  for (const name of Object.getOwnPropertyNames(source)) {
    if (!overwrite && Object.hasOwn(destination, name)) {
      // Skip descriptor
      continue;
    }

    // Copy descriptor
    const descriptor = Object.getOwnPropertyDescriptor(source, name);
    Object.defineProperty(destination, name, descriptor);
  }
  ```
- **What it does**: Iterates over all own property names on the `source` object (including non-enumerable ones), reads the full property descriptor (value, writable, get, set, configurable, enumerable), and writes it onto the `destination` object using `Object.defineProperty`. This preserves getters, setters, and non-enumerable attributes — a deeper copy than simple assignment.
- **Object affected**: The destination object passed by the caller. In Express's case:
  - `app` function object ← `EventEmitter.prototype` (express.js:41)
  - `app` function object ← `application.js` proto (express.js:42)
- **Node.js cross-reference**:
  - File: `lib/events.js` — defines `EventEmitter.prototype` with methods `on`, `once`, `emit`, `removeListener`, `removeAllListeners`, `listeners`, `listenerCount`, `prependListener`, `prependOnceListener`, `off`, `eventNames`, `getMaxListeners`, `setMaxListeners`, `rawListeners`
  - Conflict risk: No direct conflict with Node.js internals — the destination is a plain function, not an existing EventEmitter. However, the app function now impersonates an EventEmitter without being an `instanceof` one.
- **Severity**: High
- **v6 recommendation**: Replace with proper class inheritance. The `app` object could extend `EventEmitter` via class syntax or `Object.create(EventEmitter.prototype)` + `Object.setPrototypeOf`, making `app instanceof EventEmitter` truthful. Alternatively, use composition (embed an EventEmitter and delegate).

### Verification (Triple-Check)

1. **Automated pattern match**: ✅ `Object.getOwnPropertyDescriptor` and `Object.defineProperty` both flagged
2. **Manual code reading**: ✅ The function receives arbitrary destination/source — the caller (Express) passes objects it created (the `app` function) and objects it doesn't own (`EventEmitter.prototype`). The code path is unconditional and always reachable.
3. **Call-chain tracing**: ✅ `createApplication()` → `mixin(app, EventEmitter.prototype, false)` → `mergeDescriptors(app, EventEmitter.prototype, false)` — called on every `express()` invocation

## Transitive Dependencies

| Dependency | Version | Findings |
|---|---|---|
| *(none)* | — | — |

## Summary
- **Total findings**: 1
- Critical: 0, High: 1, Medium: 0, Low: 0, Informational: 0
- **v6 recommendations**: Replace descriptor-copying mixin pattern with proper prototype inheritance or composition for the app object. This would make `app instanceof EventEmitter` work correctly and remove the need for this package entirely.
