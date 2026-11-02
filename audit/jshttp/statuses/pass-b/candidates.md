# Pass B — Candidate Ledger

**Library:** statuses v2.0.2
**Commit:** 770a97d931c1bb40ebbfefdbb77f0419601890b5

## Candidates

### C-001: require('./codes.json') — index.js:15

- **Search group:** 1 (require/import)
- **Code:** `var codes = require('./codes.json')`
- **Trace:** Loads a local JSON file containing a plain object mapping status codes to messages. Not a Node.js core module. The result is stored in a local variable and used to build internal lookup tables. No core module is imported or modified.
- **Verdict:** NOT a patch. Local relative require of a JSON data file.

### C-002: Object.prototype.hasOwnProperty.call() — index.js:96

- **Search group:** 3 (prototype access)
- **Code:** `if (!Object.prototype.hasOwnProperty.call(status.code, msg)) {`
- **Trace:** Read-only access to `Object.prototype.hasOwnProperty`. The `.call()` invocation checks if a property exists on the library's own internal `status.code` map. No assignment to `Object.prototype` occurs. No property is added, removed, or modified on any prototype.
- **Verdict:** NOT a patch. Read-only use of a built-in method.

### C-003: Object.prototype.hasOwnProperty.call() — index.js:109

- **Search group:** 3 (prototype access)
- **Code:** `if (!Object.prototype.hasOwnProperty.call(status.message, code)) {`
- **Trace:** Same pattern as C-002. Read-only access to `Object.prototype.hasOwnProperty` to check property existence on the library's internal `status.message` map. No prototype mutation.
- **Verdict:** NOT a patch. Read-only use of a built-in method.

## Summary

| ID    | Location       | Pattern                                   | Monkeypatch? |
|-------|---------------|-------------------------------------------|--------------|
| C-001 | index.js:15   | `require('./codes.json')`                 | No           |
| C-002 | index.js:96   | `Object.prototype.hasOwnProperty.call()`  | No           |
| C-003 | index.js:109  | `Object.prototype.hasOwnProperty.call()`  | No           |

**Confirmed patches/monkeypatches:** None
