# Pass A - Candidate Ledger

## Candidate Analysis

### C-001: Negotiator.prototype writes (index.js:38-83)

**Source:** `$PACKAGE_ROOT/index.js` lines 38-83
**Pattern:** `.prototype` (Group 3)
**Description:** 16 assignments to `Negotiator.prototype`, adding methods `charset`, `charsets`, `encoding`, `encodings`, `language`, `languages`, `mediaType`, `mediaTypes`, and backward-compat aliases (`preferredCharset`, etc.).
**Trace:** `Negotiator` is defined at line 30 as `function Negotiator(request) {...}`. It is the library's OWN constructor, exported at line 21 as `module.exports = Negotiator`. These writes define the library's own API on its own prototype. No external/Node.js prototype is touched.
**Verdict:** NOT a monkeypatch. Library defining its own API.

### C-002: Object.defineProperty on exports (content-type/dist/index.js:7)

**Source:** `$PACKAGE_ROOT/node_modules/content-type/dist/index.js` line 7
**Pattern:** `defineProperty` (Group 3)
**Description:** `Object.defineProperty(exports, "__esModule", { value: true });`
**Trace:** Standard TypeScript CJS interop marker. Writes `__esModule` flag on the module's own `exports` object. Does not touch any Node.js core prototype or global.
**Verdict:** NOT a monkeypatch. Standard TS CJS output.

### C-003: C.prototype = Object.create(null) (content-type/dist/index.js:29)

**Source:** `$PACKAGE_ROOT/node_modules/content-type/dist/index.js` line 29
**Pattern:** `.prototype`, `Object.create` (Group 3)
**Description:** Creates a `NullObject` constructor function whose prototype is `Object.create(null)`, used internally as a fast null-prototype object factory for parameter maps.
**Trace:** `C` is a local function created in an IIFE at line 27-31. It is never exported and never touches any existing prototype chain. The `Object.create(null)` call creates a fresh prototype object with no inheritance. No external object is modified.
**Verdict:** NOT a monkeypatch. Internal performance optimization.

### C-004: require('content-type') (accept.js:9, language.js:11, mediaType.js:11)

**Source:** `$PACKAGE_ROOT/lib/accept.js:9`, `$PACKAGE_ROOT/lib/language.js:11`, `$PACKAGE_ROOT/lib/mediaType.js:11`
**Pattern:** `require()` (Group 1)
**Description:** Three production files import the `content-type` npm package.
**Trace:** `content-type` is a declared runtime dependency (package.json `dependencies`). It is a pure parser library with zero transitive dependencies. Its production code (dist/index.js, 176 lines) was audited inline -- see C-002 and C-003 above. It exports `format()` and `parse()` functions, both pure string operations. No Node.js core modules imported, no globals accessed, no prototypes mutated.
**Verdict:** NOT a monkeypatch. Clean dependency.

### C-005: Local module requires (index.js, lib/*.js)

**Source:** Various `require('./lib/*')` and `require('./accept')` calls
**Pattern:** `require()` (Group 1)
**Description:** Internal module wiring between the library's own files.
**Trace:** All paths are relative (`./lib/charset`, `./lib/encoding`, etc.). No Node.js built-in modules are required.
**Verdict:** NOT a monkeypatch. Internal module structure.

## Summary

| ID    | Location                          | Pattern          | Verdict        |
|-------|-----------------------------------|------------------|----------------|
| C-001 | index.js:38-83                    | .prototype       | NOT monkeypatch |
| C-002 | content-type/dist/index.js:7      | defineProperty   | NOT monkeypatch |
| C-003 | content-type/dist/index.js:27-31  | .prototype       | NOT monkeypatch |
| C-004 | accept.js, language.js, mediaType.js | require()     | NOT monkeypatch |
| C-005 | index.js, lib/*.js                | require()        | NOT monkeypatch |

All candidates traced to writes on the library's own objects. Zero writes to Node.js core objects, prototypes, globals, or module system.
