# http-errors v2.0.1 -- Core Patching Audit Report

**Package:** http-errors v2.0.1
**Commit:** 814207e1f69eab337d82794c8f4e552805d02047
**Audit method:** Double-blind (two independent passes, reconciled)

---

## Scope

### Production files audited
- `$PACKAGE_ROOT/index.js` -- http-errors main module (291 lines)
- `$PACKAGE_ROOT/node_modules/depd/index.js` -- deprecation utility, depd 2.0.0 (538 lines)
- `$PACKAGE_ROOT/node_modules/inherits/inherits.js` -- inherits wrapper, 2.0.4 (9 lines)
- `$PACKAGE_ROOT/node_modules/inherits/inherits_browser.js` -- inherits fallback (25 lines)
- `$PACKAGE_ROOT/node_modules/setprototypeof/index.js` -- setPrototypeOf polyfill, 1.2.0 (17 lines)
- `$PACKAGE_ROOT/node_modules/statuses/index.js` -- HTTP status codes, 2.0.1 (147 lines)
- `$PACKAGE_ROOT/node_modules/statuses/codes.json` -- status code data
- `$PACKAGE_ROOT/node_modules/toidentifier/index.js` -- string identifier utility, 1.0.1 (33 lines)

### Dependency tree
```
http-errors@2.0.1
  depd@2.0.0
  inherits@2.0.4
  setprototypeof@1.2.0
  statuses@2.0.1
  toidentifier@1.0.1
```

No nested dependencies (node_modules/**/node_modules is empty).

---

## Verdict

**One confirmed transient core patch.** http-errors itself does not directly patch
Node.js core. Its transitive dependency `depd@2.0.0` transiently swaps
`Error.prepareStackTrace` and `Error.stackTraceLimit` on the global `Error`
constructor. The swap is restored synchronously and does not persist beyond the
few lines of the `getStack()` function.

---

## Confirmed Finding

### F-001: Transient swap of Error.prepareStackTrace and Error.stackTraceLimit

- **Category:** transient swap
- **Library site(s):** `$PACKAGE_ROOT/node_modules/depd/index.js:386-387` (write), `:395-396` (restore)
- **Origin:** transitive -- http-errors -> depd@2.0.0
- **Core baseline:** `Error.prepareStackTrace` is a V8-specific hook called when formatting stack traces. `Error.stackTraceLimit` controls captured frame count. Both are properties on the global `Error` constructor.
- **Exact mutation:**
  - Object: `Error` (global constructor)
  - Key: `prepareStackTrace` -- replaced with `prepareObjectStackTrace` (returns raw CallSite array)
  - Key: `stackTraceLimit` -- replaced with `Math.max(10, currentLimit)`
  - Operation: direct property assignment, then restore
- **Execution chain:** `require('http-errors')` -> `index.js:15: require('depd')('http-errors')` -> `depd/index.js:108: getStack()` -> `depd/index.js:386-387: write` -> `depd/index.js:395-396: restore`
- **Activation:** Once at require time (guaranteed); again each time a deprecation is triggered (conditional)
- **Scope and restoration:** Transient. Saved to locals before mutation, restored synchronously. In single-threaded Node.js, no interleaving is possible.

---

## Rejected Candidates (8 total, reconciled from both passes)

All rejected candidates involve:
- `setPrototypeOf` / `defineProperty` / `inherits` on library-owned Error subclass instances and prototypes (not core objects)
- `Error.captureStackTrace` standard V8 API usage
- `process.emit('deprecation')` standard EventEmitter API usage
- `depd.function()` / `depd.property()` wrapping capabilities never invoked by http-errors
- `setprototypeof` module acting as utility wrapper without global polyfill installation

See `findings.md` for the complete rejected candidate table.

---

## Reconciliation

Both independent passes (A and B) reached identical conclusions:
- One confirmed finding (F-001)
- All other candidates rejected for the same reasons
- No disagreements to adjudicate

See `methodology.md` for full reconciliation details.
