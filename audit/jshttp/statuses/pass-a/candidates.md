# Pass A — Candidate Ledger

**Library:** statuses v2.0.2  
**Commit:** 770a97d931c1bb40ebbfefdbb77f0419601890b5

## Candidates

### C-001: `require('./codes.json')` (index.js:15)

- **Search group:** 1 (require/import)
- **Code:** `var codes = require('./codes.json')`
- **Analysis:** This is a standard `require()` call loading a local JSON data file (`./codes.json`). It does not import any Node.js core module. The loaded data is a plain object of HTTP status codes to messages. No core module is required, no built-in is shadowed or replaced.
- **Verdict:** NOT a patch. Standard local module loading.

### C-002: `Object.prototype.hasOwnProperty.call()` (index.js:96)

- **Search group:** 3 (prototype access)
- **Code:** `if (!Object.prototype.hasOwnProperty.call(status.code, msg)) {`
- **Analysis:** This is a **read-only** access of `Object.prototype.hasOwnProperty` — calling it via `.call()` to safely check property existence on a local map object (`status.code`). There is no write to `Object.prototype`, no mutation, no assignment. This is a standard defensive JavaScript idiom.
- **Verdict:** NOT a patch. Read-only prototype method call.

### C-003: `Object.prototype.hasOwnProperty.call()` (index.js:109)

- **Search group:** 3 (prototype access)
- **Code:** `if (!Object.prototype.hasOwnProperty.call(status.message, code)) {`
- **Analysis:** Identical pattern to C-002. Read-only use of `Object.prototype.hasOwnProperty` to check property existence on the local `status.message` map. No mutation of any prototype.
- **Verdict:** NOT a patch. Read-only prototype method call.

## Summary

| ID    | Location       | Pattern                              | Verdict   |
|-------|---------------|--------------------------------------|-----------|
| C-001 | index.js:15   | `require('./codes.json')`            | Not a patch |
| C-002 | index.js:96   | `Object.prototype.hasOwnProperty.call()` | Not a patch |
| C-003 | index.js:109  | `Object.prototype.hasOwnProperty.call()` | Not a patch |

**Confirmed patches/monkeypatches:** None
